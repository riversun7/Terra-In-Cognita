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
import {
  FACTION_NOTICE_REASON_MAX,
  FACTION_RENAME_WAIT_MS,
  type FactionIdentityCheck,
  type FactionEmblemUploadInput,
  type FactionIdentityMine,
  type FactionIdentityReason,
  type OpsEmblemList,
  isEmblemSpec,
  isIdentityColor,
  parseFactionName,
  parseFactionShort,
} from "@terra/shared/factionIdentity";
import { emblemSeedOf } from "@terra/shared/nationEmblem";
import type { Role } from "@terra/shared";
import { writeAudit } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import { sha256Hex } from "../nationEdit/emblems.ts";
import { decodeBase64 } from "../nationEdit/png.ts";
import type { NationPreset } from "../npc/nations.ts";
import { type RateLimiter, createRateLimiter } from "../rateLimit.ts";
import { reasonedError } from "../trpc/init.ts";
import { checkPlayerEmblemPng } from "./png.ts";
import {
  type IdentityQueryable,
  type IdentityRow,
  clearNotice,
  insertIdentity,
  listModeration,
  loadIdentity,
  playerTaken,
  profileTaken,
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
  /** 이름·약어를 다시 바꾸기까지 기다리는 시간 */
  readonly renameWaitMs: number;
}

export function createFactionIdentityShared(options: {
  pool: IdentityQueryable;
  now: () => number;
  presets?: (() => readonly NationPreset[] | undefined) | undefined;
  limits?: Partial<FactionIdentityLimits> | undefined;
  renameWaitMs?: number | undefined;
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
    renameWaitMs: options.renameWaitMs ?? FACTION_RENAME_WAIT_MS,
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

export type OpsEmblemResult = { ok: true } | { ok: false; code: "not_found" | "no_upload" };

export interface FactionIdentityServices {
  mine(viewer: IdentityViewer): Promise<FactionIdentityMine>;
  check(viewer: IdentityViewer, input: { name: string; shortName: string }): Promise<FactionIdentityCheck>;
  save(viewer: IdentityViewer, input: FactionIdentitySaveInput): Promise<FactionIdentityMine>;
  dismissNotice(viewer: IdentityViewer): Promise<FactionIdentityMine>;
  /** 운영자 콘솔 "마크 관리" */
  opsList(): Promise<OpsEmblemList>;
  opsTakedown(
    viewer: IdentityViewer,
    input: { userId: string; reason: string; blockUploads: boolean },
  ): Promise<OpsEmblemResult>;
  opsSetBlocked(
    viewer: IdentityViewer,
    input: { userId: string; blocked: boolean },
  ): Promise<OpsEmblemResult>;
  opsSetUploadAllowed(viewer: IdentityViewer, input: { allowed: boolean }): Promise<{ ok: true }>;
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

/** pg 고유 제약 오류(23505)면 어느 칸인지 */
function uniqueViolation(error: unknown): "name_taken" | "short_taken" | null {
  if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "23505")
    return null;
  const constraint = "constraint" in error && typeof error.constraint === "string" ? error.constraint : "";
  return constraint.includes("short") ? "short_taken" : "name_taken";
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
    const switchOff = await uploadSwitchBlocked(pool);
    const renameAt = row ? row.nameChangedAt + shared.renameWaitMs : 0;
    return {
      identity: row ? viewOf(row) : null,
      uploadBlock: switchOff ? "switch_off" : row?.uploadBlocked ? "account_blocked" : null,
      notice: row?.notice ?? null,
      renameAt: row && renameAt > shared.now() ? renameAt : null,
      seed: emblemSeedOf(viewer.id),
      nameStyle: null,
    };
  };

  /** 이름·약어가 다른 세력(플레이어·NPC 정체성·국가 프리셋)과 겹치는가 */
  const takenOf = async (userId: string, nameKey: string, shortKey: string) => {
    const [players, profiles] = await Promise.all([
      playerTaken(pool, userId, nameKey, shortKey),
      profileTaken(pool, nameKey, shortKey),
    ]);
    const presets = presetTaken(shared.presets(), nameKey, shortKey);
    return {
      name: players.name || profiles.name || presets.name,
      short: players.short || profiles.short || presets.short,
    };
  };

  return {
    mine: (viewer) => mineOf(viewer),

    async check(viewer, input) {
      const name = parseFactionName(input.name);
      const short = parseFactionShort(input.shortName);
      const taken =
        name.ok || short.ok
          ? await takenOf(viewer.id, name.ok ? name.key : "", short.ok ? short.key : "")
          : { name: false, short: false };
      return {
        name: name.ok ? (taken.name ? "taken" : null) : name.problem,
        shortName: short.ok ? (taken.short ? "taken" : null) : short.problem,
      };
    },

    async save(viewer, input) {
      const name = parseFactionName(input.name);
      if (!name.ok) throw rejected("name_invalid", [name.problem]);
      const short = parseFactionShort(input.shortName);
      if (!short.ok) throw rejected("short_invalid", [short.problem]);
      if (!isIdentityColor(input.color)) throw rejected("color_invalid");
      if (!isEmblemSpec(input.emblem)) throw rejected("emblem_invalid");
      // 글자 규칙(DB를 읽지 않는 검사)을 지난 요청만 센다
      if (!shared.limiters.saves.take(viewer.id)) throw rejected("rate_limited");
      const now = shared.now();
      const before = await loadIdentity(pool, viewer.id);
      const renamed =
        before === null || before.nameKey !== name.key || before.shortName.toLowerCase() !== short.key;
      // 보이는 모양만 바뀐 것(대소문자)은 이름 바꾸기로 세지 않는다
      if (before !== null && renamed && now < before.nameChangedAt + shared.renameWaitMs)
        throw rejected("rename_wait");
      const taken = await takenOf(viewer.id, name.key, short.key);
      if (taken.name) throw rejected("name_taken");
      if (taken.short) throw rejected("short_taken");

      let upload: "keep" | null | { png: Uint8Array; sha256: string } = "keep";
      if (input.upload.mode === "none") upload = null;
      else if (input.upload.mode === "new") {
        if (await uploadSwitchBlocked(pool)) throw rejected("upload_off");
        if (before?.uploadBlocked) throw rejected("upload_blocked");
        if (!shared.limiters.uploads.take(viewer.id)) throw rejected("rate_limited");
        const png = decodeBase64(input.upload.pngBase64);
        if (!png) throw rejected("emblem_not_png");
        const problem = checkPlayerEmblemPng(png);
        if (problem) throw rejected(problem);
        upload = { png, sha256: sha256Hex(png) };
      }

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

    async opsList() {
      const [listed, blocked] = await Promise.all([listModeration(pool), uploadSwitchBlocked(pool)]);
      return { uploadAllowed: !blocked, rows: listed.rows, total: listed.total };
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
      });
      if (!taken) return { ok: false, code: "no_upload" };
      await writeAudit(deps.db, {
        actor: actor(viewer, "admin"),
        action: "ops.emblem_takedown",
        targetId: input.userId,
        before: { name: row.name, shortName: row.shortName, sha256: taken.sha256, bytes: taken.bytes },
        after: { sha256: null, uploadBlocked: row.uploadBlocked || input.blockUploads, reason },
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
