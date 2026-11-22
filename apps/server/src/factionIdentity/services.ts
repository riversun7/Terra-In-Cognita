// 플레이어 세력 정체성 서비스(tRPC factionIdentity·ops.emblems) — docs/adr/2026-11-11-faction-identity.md.
// 사용자 결정(2026-11-11): 플레이어도 NPC 국가처럼 세력을 만들 때 같은 과정(이름·약어·색·마크)을 거친다. 올린 그림은 용량을 제한하고
// 자른 부분만 저장한다.
// - 누구의 세력인가: 지금 플레이어가 이끄는 세력은 자기 소유 주체뿐이다(세력 창설 규칙이 없다 — 질문 926). 그래서 정체성은 계정마다 하나이고,
//   고칠 수 있는 사람은 그 계정 주인뿐이다(요청은 대상을 받지 않는다 — 늘 로그인한 본인 것). 운영자는 마크 내리기·올리기 막기만 한다.
// - 저장은 한 번에: 이름·약어·색·마크(만든 사양 + 올린 그림)를 한 요청으로 받는다. 하나라도 틀리면 아무것도 바뀌지 않는다.
// - 올린 그림: 세계 스위치·계정 막힘 → 속도 제한 → base64 풀기 → png.ts 검사 → 그 줄에 덮어쓴다(앞 그림은 사라진다).
// - 감사 기록: faction.identity_create·faction.identity_update(그림 바이트는 싣지 않고 해시·크기만), 운영자 ops.emblem_takedown·
//   ops.emblem_block·ops.emblem_switch.
// 조회·비실시간 기능이라 tRPC다(게임 판정에 쓰이는 값이 아니다 — 이름표·마크는 보이기만 한다).
// 바뀜(질문 926~935 답, ADR "바뀜 (2026-11-11, 926~935 답)"): 정체성을 정하는 것이 곧 가문 창설이다(926 나). 창설 자체는 세력 행을 만들고
// 값을 내는 게임 상태 명령이라 WebSocket house_found(found.ts)이고, 여기 저장은 그 앞 단계(정체성 줄 = 창설 전에는 초안)다. 이름 대기·
// 약어 폭·신고 횟수·자동 막기 문턱은 설정 칸(rules.ts).
import {
  FACTION_NOTICE_REASON_MAX,
  type FactionIdentityCheck,
  type FactionReportResult,
  type OpsEmblemSort,
  type FactionEmblemUploadInput,
  type FactionIdentityMine,
  type FactionIdentityReason,
  type OpsEmblemList,
  isEmblemSpec,
  isIdentityColor,
  parseFactionName,
  parseFactionShort,
} from "@terra/shared/factionIdentity";
import { type HouseView, houseResetName, houseResetShort } from "@terra/shared/house";
import type { HouseLeaguesResponse } from "@terra/shared/houseLeague";
import { emblemSeedOf } from "@terra/shared/nationEmblem";
import type { Role } from "@terra/shared";
import { writeAudit } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import { sha256Hex } from "../nationEdit/emblems.ts";
import { decodeBase64 } from "../nationEdit/png.ts";
import type { NationPreset } from "../npc/nations.ts";
import { type RateLimiter, createRateLimiter } from "../rateLimit.ts";
import { reasonedError } from "../trpc/init.ts";
import { nationFromDb } from "./found.ts";
import { clearReports, houseNation, reportHouse, resetHouseName } from "./house.ts";
import type { HouseCityService } from "./houseCity.ts";
import { cyborgCityOf, homeChoices } from "./houseHome.ts";
import { dismissHouseNotices, readHouseView } from "./houseView.ts";
import { notify } from "./members.ts";
import { leaguesView } from "./leagueView.ts";
import { checkPlayerEmblemPng } from "./png.ts";
import { type HouseRules, TEST_HOUSE_RULES } from "./rules.ts";
import {
  type IdentityQueryable,
  type IdentityRow,
  clearNotice,
  insertIdentity,
  listModeration,
  loadIdentity,
  playerTaken,
  profileTaken,
  setRenameBlocked,
  setUploadBlocked,
  setUploadSwitchBlocked,
  takeDownEmblem,
  updateIdentity,
  uploadSwitchBlocked,
  viewOf,
} from "./store.ts";

/** 계정마다 속도 제한 [임시]: 저장 = 순간 10번·시간당 20번, 그림 올리기 = 순간 5번·시간당 6번(10분에 한 장) */
export interface FactionIdentityLimits {
  readonly saves: { readonly capacity: number; readonly refillPerMinute: number };
  readonly uploads: { readonly capacity: number; readonly refillPerMinute: number };
}
export const DEFAULT_IDENTITY_LIMITS: FactionIdentityLimits = {
  saves: { capacity: 10, refillPerMinute: 20 / 60 },
  uploads: { capacity: 5, refillPerMinute: 6 / 60 },
};

/** 앱에 하나(속도 제한기·프리셋 접근자) */
export interface FactionIdentityShared {
  readonly pool: IdentityQueryable;
  readonly now: () => number;
  /** 실효 국가 프리셋(이름·약어 사칭 검사). 부를 때마다 읽는다 */
  readonly presets: () => readonly NationPreset[];
  readonly limiters: { readonly saves: RateLimiter; readonly uploads: RateLimiter };
  /** 가문 설정값(설정 칸, 부를 때마다 읽는다) */
  readonly rules: () => HouseRules;
  /** 가문 도시 조회(마을·폐허 고르기 — 세계가 있는 앱만, houseCity.ts) */
  readonly houseCity?: (() => HouseCityService | undefined) | undefined;
}

export function createFactionIdentityShared(options: {
  pool: IdentityQueryable;
  now: () => number;
  presets?: (() => readonly NationPreset[] | undefined) | undefined;
  limits?: Partial<FactionIdentityLimits> | undefined;
  rules?: (() => HouseRules) | undefined;
  houseCity?: (() => HouseCityService | undefined) | undefined;
}): FactionIdentityShared {
  const limits = { ...DEFAULT_IDENTITY_LIMITS, ...options.limits };
  return {
    pool: options.pool,
    now: options.now,
    presets: () => options.presets?.() ?? [],
    limiters: {
      saves: createRateLimiter({ ...limits.saves, now: options.now }),
      uploads: createRateLimiter({ ...limits.uploads, now: options.now }),
    },
    rules: options.rules ?? (() => TEST_HOUSE_RULES),
    houseCity: options.houseCity,
  };
}

export interface IdentityViewer {
  readonly id: string;
  readonly roles: readonly Role[];
}

/** 저장 요청(마크 사양은 서버가 목록 안의 값인지 본다 — 라우터는 글자 길이만 막는다) */
export interface FactionIdentitySaveInput {
  readonly name: string;
  readonly shortName: string;
  readonly color: string;
  readonly emblem: {
    readonly shape: string;
    readonly division: string;
    readonly charge: string;
    readonly scheme: number;
  };
  readonly upload: FactionEmblemUploadInput;
}

export type OpsEmblemResult =
  | { ok: true }
  | { ok: false; code: "not_found" | "no_upload" | "no_house" | "short_taken" };

export interface FactionIdentityServices {
  mine(viewer: IdentityViewer): Promise<FactionIdentityMine>;
  check(viewer: IdentityViewer, input: { name: string; shortName: string }): Promise<FactionIdentityCheck>;
  save(viewer: IdentityViewer, input: FactionIdentitySaveInput): Promise<FactionIdentityMine>;
  dismissNotice(viewer: IdentityViewer): Promise<FactionIdentityMine>;
  /** 다른 가문의 마크·이름 신고(질문 930 나) */
  report(viewer: IdentityViewer, input: { factionId: number }): Promise<FactionReportResult>;
  /** 내 가문·받은 초대·보낸 신청·가입할 수 있는 가문·가문 소식(질문 985 다) */
  house(viewer: IdentityViewer): Promise<HouseView>;
  /** 끝나지 않은 가문 연맹(조약 — npc-invest-2·league-2, leagueView.ts). 누구나 본다(나라와 상관없는 우호 기능) */
  leagues(viewer: IdentityViewer): Promise<HouseLeaguesResponse>;
  /** 가문 소식을 확인했다(ids가 없으면 모두) */
  dismissHouseNotices(
    viewer: IdentityViewer,
    input: { ids?: readonly number[] | undefined },
  ): Promise<HouseView>;
  /** 운영자가 신고된 가문 이름을 "가문 #ID"로 되돌린다(질문 986 가) */
  opsResetName(
    viewer: IdentityViewer,
    input: { userId: string; reason: string; resetShort: boolean },
  ): Promise<OpsEmblemResult>;
  /** 운영자 콘솔 "마크 관리" */
  opsList(input?: { sort?: OpsEmblemSort | undefined }): Promise<OpsEmblemList>;
  opsTakedown(
    viewer: IdentityViewer,
    input: { userId: string; reason: string; blockUploads: boolean },
  ): Promise<OpsEmblemResult>;
  opsSetBlocked(
    viewer: IdentityViewer,
    input: { userId: string; blocked: boolean },
  ): Promise<OpsEmblemResult>;
  /** 이름·약어 바꾸기 막기·풀기(질문 1006 나) */
  opsSetRenameBlocked(
    viewer: IdentityViewer,
    input: { userId: string; blocked: boolean },
  ): Promise<OpsEmblemResult>;
  opsSetUploadAllowed(viewer: IdentityViewer, input: { allowed: boolean }): Promise<{ ok: true }>;
  /** 그 가문의 신고를 넘긴다(문제없다고 봄) */
  opsClearReports(viewer: IdentityViewer, input: { userId: string }): Promise<OpsEmblemResult>;
}

const rejected = (reason: FactionIdentityReason, details?: readonly string[]) =>
  reason === "rate_limited"
    ? reasonedError("TOO_MANY_REQUESTS", "RATE_LIMITED", reason)
    : reasonedError("BAD_REQUEST", "FACTION_IDENTITY_REJECTED", reason, details);

/** 빈칸을 빼고 소문자로(프리셋 이름 "Sky Clan" ↔ 플레이어 이름 열쇠 "skyclan") */
const squash = (text: string): string => text.replaceAll(/\s+/gu, "").toLowerCase();

/** 국가 프리셋(NPC 국가 이름·약어 — 아직 세계에 정해지지 않은 것도)이 이 이름·약어를 쓰는가(사칭 막기, D-328) */
export function presetTaken(
  presets: readonly NationPreset[],
  nameKey: string,
  shortKey: string,
): { name: boolean; short: boolean } {
  let name = false;
  let short = false;
  for (const preset of presets) {
    if (squash(preset.name.ko) === nameKey || squash(preset.name.en) === nameKey) name = true;
    if (preset.shortName !== undefined && preset.shortName.toLowerCase() === shortKey) short = true;
  }
  return { name, short };
}

/** 감사 기록에 싣는 요약(그림 바이트는 싣지 않는다 — 해시·크기만) */
const summary = (row: IdentityRow | null) =>
  row === null
    ? null
    : {
        name: row.name,
        shortName: row.shortName,
        color: row.color,
        emblem: row.emblem,
        sha256: row.uploaded?.hash ?? null,
        bytes: row.uploaded?.bytes ?? null,
      };

/** pg 고유 제약 오류(23505)면 어느 칸인지 */
function uniqueViolation(error: unknown): "name_taken" | "short_taken" | null {
  if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "23505")
    return null;
  const constraint = "constraint" in error && typeof error.constraint === "string" ? error.constraint : "";
  return constraint.includes("short") ? "short_taken" : "name_taken";
}

/** 약어 검사: 지금 약어 그대로(대소문자만 다를 수 있음)면 저장 폭, 바꾸는 약어면 설정 칸 폭(S20) */
function parseShortFor(input: string, before: IdentityRow | null, rules: HouseRules) {
  const loose = parseFactionShort(input);
  if (loose.ok && before !== null && before.shortName.toLowerCase() === loose.key) return loose;
  return parseFactionShort(input, rules.shortRange);
}

export function createFactionIdentityServices(
  shared: FactionIdentityShared,
  deps: { db: Database; ip: string | null },
): FactionIdentityServices {
  const { pool } = shared;
  const actor = (viewer: IdentityViewer, kind: "user" | "admin") => ({
    kind,
    id: viewer.id,
    ip: deps.ip,
    ...(kind === "admin" ? { meta: { roles: viewer.roles } } : {}),
  });

  const mineOf = async (
    viewer: IdentityViewer,
    loaded?: IdentityRow | null,
  ): Promise<FactionIdentityMine> => {
    const row = loaded === undefined ? await loadIdentity(pool, viewer.id) : loaded;
    const rules = shared.rules();
    const [switchOff, nation, homeCityId] = await Promise.all([
      uploadSwitchBlocked(pool),
      row?.factionId == null ? Promise.resolve(null) : houseNation(pool, row.factionId),
      cyborgCityOf(pool, viewer.id),
    ]);
    // 가문 소속 도시 후보(D-565): 아직 창설하지 않았을 때만(창설한 가문은 세력 화면 소속 도시 칸에서 바꾼다)
    const choices = row?.factionId == null ? await homeChoices(pool, shared.presets()) : [];
    // 이름 대기는 창설한 가문에만(창설 전 초안은 몇 번이고 고친다)
    const renameAt = row?.factionId == null ? 0 : row.nameChangedAt + rules.renameWaitMs;
    return {
      identity: row ? viewOf(row) : null,
      house:
        row?.factionId == null
          ? null
          : { factionId: row.factionId, foundedAt: row.foundedAt ?? row.createdAt, nationId: nation },
      // 창설은 무료(D-565). 옛 기기가 이 값을 창설 명령에 실어 보낸다
      foundCost: "0",
      homeChoices: choices,
      homeCityId,
      shortRange: rules.shortRange,
      uploadBlock: switchOff ? "switch_off" : row?.uploadBlocked ? "account_blocked" : null,
      notice: row?.notice ?? null,
      renameAt: row && renameAt > shared.now() ? renameAt : null,
      renameBlocked: row?.renameBlocked === true,
      seed: emblemSeedOf(viewer.id),
      nameStyle: null,
    };
  };

  /** 이름·약어가 다른 세력(플레이어·NPC·다른 가문 정체성·국가 프리셋)과 겹치는가. ownFaction = 내 가문(세지 않는다) */
  const takenOf = async (userId: string, nameKey: string, shortKey: string, ownFaction: number | null) => {
    const [players, profiles] = await Promise.all([
      playerTaken(pool, userId, nameKey, shortKey),
      profileTaken(pool, nameKey, shortKey, ownFaction),
    ]);
    const presets = presetTaken(shared.presets(), nameKey, shortKey);
    return {
      name: players.name || profiles.name || presets.name,
      short: players.short || profiles.short || presets.short,
    };
  };

  /** 그림 올리기 입력 → 저장할 값(검사를 지난 것만) */
  const uploadOf = async (
    viewer: IdentityViewer,
    input: FactionEmblemUploadInput,
    before: IdentityRow | null,
  ): Promise<"keep" | null | { png: Uint8Array; sha256: string }> => {
    if (input.mode === "keep") return "keep";
    if (input.mode === "none") return null;
    if (await uploadSwitchBlocked(pool)) throw rejected("upload_off");
    if (before?.uploadBlocked) throw rejected("upload_blocked");
    if (!shared.limiters.uploads.take(viewer.id)) throw rejected("rate_limited");
    const png = decodeBase64(input.pngBase64);
    if (!png) throw rejected("emblem_not_png");
    const problem = checkPlayerEmblemPng(png);
    if (problem) throw rejected(problem);
    return { png, sha256: sha256Hex(png) };
  };

  /** 이름이 막힌 가문의 저장: 이름·약어는 지금 값 그대로, 색·마크만(질문 1006 나) */
  const saveKept = async (
    viewer: IdentityViewer,
    input: FactionIdentitySaveInput,
    before: IdentityRow,
  ): Promise<FactionIdentityMine> => {
    if (!isIdentityColor(input.color)) throw rejected("color_invalid");
    if (!isEmblemSpec(input.emblem)) throw rejected("emblem_invalid");
    if (!shared.limiters.saves.take(viewer.id)) throw rejected("rate_limited");
    const upload = await uploadOf(viewer, input.upload, before);
    await updateIdentity(pool, {
      userId: viewer.id,
      name: before.name,
      nameKey: before.nameKey,
      shortName: before.shortName,
      color: input.color,
      emblem: {
        shape: input.emblem.shape,
        division: input.emblem.division,
        charge: input.emblem.charge,
        scheme: input.emblem.scheme,
      },
      upload,
      nowMs: shared.now(),
      renamed: false,
    });
    const after = await loadIdentity(pool, viewer.id);
    await writeAudit(deps.db, {
      actor: actor(viewer, "user"),
      action: "faction.identity_update",
      targetId: viewer.id,
      before: summary(before),
      after: summary(after),
    });
    return mineOf(viewer, after);
  };

  const houseOf = async (viewer: IdentityViewer): Promise<HouseView> => {
    const view = await readHouseView(pool, {
      userId: viewer.id,
      nationId: (await nationFromDb(pool, viewer.id)) ?? null,
      rules: shared.rules(),
      nowMs: shared.now(),
      presets: shared.presets(),
    });
    const city = shared.houseCity?.();
    if (!view.house || !city) return view;
    // 가문 도시 줄(질문 1005 가): 봉신·독립 상태·도시·가문장의 마을 자리 제안·고를 폐허
    const cityView = await city.view(viewer.id, {
      factionId: view.house.factionId,
      leader: view.house.role === "leader",
    });
    return { ...view, house: { ...view.house, city: cityView } };
  };

  return {
    mine: (viewer) => mineOf(viewer),

    async check(viewer, input) {
      const before = await loadIdentity(pool, viewer.id);
      const name = parseFactionName(input.name);
      const short = parseShortFor(input.shortName, before, shared.rules());
      const taken =
        name.ok || short.ok
          ? await takenOf(
              viewer.id,
              name.ok ? name.key : "",
              short.ok ? short.key : "",
              before?.factionId ?? null,
            )
          : { name: false, short: false };
      return {
        name: name.ok ? (taken.name ? "taken" : null) : name.problem,
        shortName: short.ok ? (taken.short ? "taken" : null) : short.problem,
      };
    },

    async save(viewer, input) {
      const rules = shared.rules();
      // 이름 바꾸기가 막힌 가문(질문 1006 나): 지금 이름·약어 그대로면 이름 규칙을 보지 않는다(운영자가 되돌린 "가문 #ID"에는 '#'이 있다 —
      // 막혀도 색·마크는 저장한다). 다르면 rename_blocked
      const locked = await loadIdentity(pool, viewer.id);
      if (locked?.renameBlocked) {
        if (input.name !== locked.name || input.shortName !== locked.shortName)
          throw rejected("rename_blocked");
        return saveKept(viewer, input, locked);
      }
      const name = parseFactionName(input.name);
      if (!name.ok) throw rejected("name_invalid", [name.problem]);
      // 약어 폭은 저장 폭(2~5자)으로 먼저 보고, 바꾸는 약어면 아래에서 설정 칸 폭으로 다시 본다(이미 정한 긴 약어는 그대로 — 질문 928 나)
      const loose = parseFactionShort(input.shortName);
      if (!loose.ok) throw rejected("short_invalid", [loose.problem]);
      if (!isIdentityColor(input.color)) throw rejected("color_invalid");
      if (!isEmblemSpec(input.emblem)) throw rejected("emblem_invalid");
      // 글자 규칙(DB를 읽지 않는 검사)을 지난 요청만 센다
      if (!shared.limiters.saves.take(viewer.id)) throw rejected("rate_limited");
      const now = shared.now();
      const before = await loadIdentity(pool, viewer.id);
      const short = parseShortFor(input.shortName, before, rules);
      if (!short.ok) throw rejected("short_invalid", [short.problem]);
      const renamed =
        before === null || before.nameKey !== name.key || before.shortName.toLowerCase() !== short.key;
      // 보이는 모양만 바뀐 것(대소문자)은 이름 바꾸기로 세지 않는다. 대기는 창설한 가문에만(질문 932 가 — 값은 설정 칸)
      if (
        before !== null &&
        before.factionId !== null &&
        renamed &&
        now < before.nameChangedAt + rules.renameWaitMs
      )
        throw rejected("rename_wait");
      const taken = await takenOf(viewer.id, name.key, short.key, before?.factionId ?? null);
      if (taken.name) throw rejected("name_taken");
      if (taken.short) throw rejected("short_taken");

      const upload = await uploadOf(viewer, input.upload, before);

      const write = {
        userId: viewer.id,
        name: name.display,
        nameKey: name.key,
        shortName: short.display,
        color: input.color,
        emblem: {
          shape: input.emblem.shape,
          division: input.emblem.division,
          charge: input.emblem.charge,
          scheme: input.emblem.scheme,
        },
        upload,
        nowMs: now,
        renamed,
      };
      try {
        if (before === null) await insertIdentity(pool, write);
        else await updateIdentity(pool, write);
      } catch (error) {
        const violation = uniqueViolation(error);
        if (violation) throw rejected(violation);
        throw error;
      }
      const after = await loadIdentity(pool, viewer.id);
      await writeAudit(deps.db, {
        actor: actor(viewer, "user"),
        action: before === null ? "faction.identity_create" : "faction.identity_update",
        targetId: viewer.id,
        before: summary(before),
        after: summary(after),
      });
      return mineOf(viewer, after);
    },

    async dismissNotice(viewer) {
      await clearNotice(pool, viewer.id);
      return mineOf(viewer);
    },

    async report(viewer, input) {
      const status = await reportHouse(pool, {
        reporterId: viewer.id,
        factionId: input.factionId,
        nowMs: shared.now(),
        dailyLimit: shared.rules().reportDaily,
      });
      if (status === "reported")
        await writeAudit(deps.db, {
          actor: actor(viewer, "user"),
          action: "faction.house_report",
          targetId: null,
          before: null,
          after: { factionId: input.factionId },
        });
      return { status };
    },

    house: houseOf,
    leagues: (viewer) => leaguesView(pool, viewer.id, shared.rules().leagueFeeDiscountPm),

    async dismissHouseNotices(viewer, input) {
      await dismissHouseNotices(pool, viewer.id, input.ids ?? null);
      return houseOf(viewer);
    },

    async opsResetName(viewer, input) {
      const reason = input.reason.trim().slice(0, FACTION_NOTICE_REASON_MAX);
      const row = await loadIdentity(pool, input.userId);
      if (!row) return { ok: false, code: "not_found" };
      if (row.factionId === null) return { ok: false, code: "no_house" };
      const name = houseResetName(row.factionId);
      const now = shared.now();
      let reset: Awaited<ReturnType<typeof resetHouseName>>;
      try {
        reset = await resetHouseName(pool, {
          factionId: row.factionId,
          name,
          nameKey: squash(name),
          shortName: input.resetShort ? houseResetShort(row.factionId) : null,
          nowMs: now,
          actorId: viewer.id,
          autoBlockAt: shared.rules().nameResetBlock,
        });
      } catch (error) {
        if (uniqueViolation(error)) return { ok: false, code: "short_taken" };
        throw error;
      }
      if (!reset) return { ok: false, code: "no_house" };
      await notify(pool, {
        userId: reset.ownerId,
        factionId: row.factionId,
        kind: "name_reset",
        houseName: name,
        reason: reason === "" ? null : reason,
        nowMs: now,
      });
      await writeAudit(deps.db, {
        actor: actor(viewer, "admin"),
        action: "ops.house_name_reset",
        targetId: reset.ownerId,
        before: { factionId: row.factionId, name: reset.name, shortName: reset.shortName },
        after: {
          factionId: row.factionId,
          name,
          shortName: reset.newShort,
          reason,
          resets: reset.resets,
          autoBlocked: reset.autoBlocked,
          renameBlocked: row.renameBlocked || reset.autoBlocked,
        },
      });
      return { ok: true };
    },

    async opsSetRenameBlocked(viewer, input) {
      const before = await setRenameBlocked(pool, input.userId, input.blocked);
      if (before === null) return { ok: false, code: "not_found" };
      if (before !== input.blocked)
        await writeAudit(deps.db, {
          actor: actor(viewer, "admin"),
          action: "ops.house_rename_block",
          targetId: input.userId,
          before: { renameBlocked: before },
          after: { renameBlocked: input.blocked },
        });
      return { ok: true };
    },

    async opsList(input) {
      const [listed, blocked] = await Promise.all([
        listModeration(pool, input?.sort ?? "recent"),
        uploadSwitchBlocked(pool),
      ]);
      return {
        uploadAllowed: !blocked,
        rows: listed.rows,
        total: listed.total,
        autoBlockAt: shared.rules().takedownBlock,
        renameBlockAt: shared.rules().nameResetBlock,
      };
    },

    async opsClearReports(viewer, input) {
      const row = await loadIdentity(pool, input.userId);
      if (!row) return { ok: false, code: "not_found" };
      const cleared = row.factionId === null ? 0 : await clearReports(pool, row.factionId);
      if (cleared > 0)
        await writeAudit(deps.db, {
          actor: actor(viewer, "admin"),
          action: "ops.emblem_reports_clear",
          targetId: input.userId,
          before: { factionId: row.factionId, reports: cleared },
          after: { reports: 0 },
        });
      return { ok: true };
    },

    async opsTakedown(viewer, input) {
      const reason = input.reason.trim().slice(0, FACTION_NOTICE_REASON_MAX);
      const row = await loadIdentity(pool, input.userId);
      if (!row) return { ok: false, code: "not_found" };
      const taken = await takeDownEmblem(pool, {
        userId: input.userId,
        reason: reason === "" ? null : reason,
        blockUploads: input.blockUploads,
        nowMs: shared.now(),
        autoBlockAt: shared.rules().takedownBlock,
      });
      if (!taken) return { ok: false, code: "no_upload" };
      await writeAudit(deps.db, {
        actor: actor(viewer, "admin"),
        action: "ops.emblem_takedown",
        targetId: input.userId,
        before: { name: row.name, shortName: row.shortName, sha256: taken.sha256, bytes: taken.bytes },
        after: {
          sha256: null,
          uploadBlocked: row.uploadBlocked || input.blockUploads || taken.autoBlocked,
          autoBlocked: taken.autoBlocked,
          takedowns: taken.takedowns,
          reason,
        },
      });
      return { ok: true };
    },

    async opsSetBlocked(viewer, input) {
      const before = await setUploadBlocked(pool, input.userId, input.blocked);
      if (before === null) return { ok: false, code: "not_found" };
      if (before !== input.blocked)
        await writeAudit(deps.db, {
          actor: actor(viewer, "admin"),
          action: "ops.emblem_block",
          targetId: input.userId,
          before: { uploadBlocked: before },
          after: { uploadBlocked: input.blocked },
        });
      return { ok: true };
    },

    async opsSetUploadAllowed(viewer, input) {
      const before = !(await uploadSwitchBlocked(pool));
      await setUploadSwitchBlocked(pool, !input.allowed, viewer.id, shared.now());
      if (before !== input.allowed)
        await writeAudit(deps.db, {
          actor: actor(viewer, "admin"),
          action: "ops.emblem_switch",
          targetId: null,
          before: { uploadAllowed: before },
          after: { uploadAllowed: input.allowed },
        });
      return { ok: true };
    },
  };
}
