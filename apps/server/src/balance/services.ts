// 밸런스 화면 요청 처리 — tRPC balance.*(src/trpc/balance.ts)가 D1 권한(tuning:read 두 겹)·조회 속도 제한을 거친 뒤 부른다.
// docs/adr/2026-11-01-balance-screen.md 3·4절. 서버가 켤 때 한 번 만든다(요청마다 만들 것이 없다).
// - table: 가중치 표(팩 값·실효 값·덮어쓰기), 무기 목록, 기준 유닛 기본값. 스냅숏 하나로 만든다.
// - contribution: 지금 표·고친 표(지금 + 담은 변경)의 2차 스탯과 1차 +10 차이. 가볍다(주 스레드).
// - duels: 1차마다 "기준 + 10 vs 기준" 시드 대결. 무겁다 → 워커(runner). 요청 시작 때 표·계수 한 벌을 일에 담는다.
//   사용자마다 따로 세는 속도 제한, 서버 전체 한 번에 하나(바쁘면 busy).
// 담은 변경은 tuning.save가 받을 묶음과 같은 검사(TuningState.plan)를 미리 돌려 받지 않을 까닭을 함께 돌려준다(저장은 하지 않는다).
// - 기준 유닛 프리셋("바뀜 (D-467)"): 목록은 팩 씨앗 + DB 줄(presets.ts가 고른다). 쓰기(savePreset·deletePreset)는 한 프로세스 안에서
//   차례로 돈다: DB를 다시 읽어 고름 → 줄 판 확인 → DB(줄·감사 기록 한 트랜잭션) → 서버 기록 `balance preset change`.
//   DB가 없으면 팩 씨앗만 보이고 쓰기는 NOT_FOUND. 켤 때(boot) 팩이 이긴 줄·맞지 않는 줄을 지운다(실패해도 시작을 막지 않는다).
import { type BalancePresetEntry, statRowCell } from "@terra/content";
import {
  BALANCE_CUSTOM_PRESETS_MAX,
  BALANCE_UNARMED,
  type BalanceContributionInput,
  type BalanceContributionResponse,
  type BalanceDuelsInput,
  type BalanceDuelsResponse,
  type BalanceEdit,
  type BalanceEditProblem,
  type BalancePresetDeleteInput,
  type BalancePresetSaveInput,
  type BalancePresetValues,
  type BalancePresetView,
  type BalancePresetsResponse,
  type BalanceTableResponse,
  type BalanceWeaponView,
  balancePresetProblem,
  balanceSettingsProblem,
  normalizeBalancePresetName,
} from "@terra/shared/balance";
import { statCellFieldsOf, statCellKey } from "@terra/shared/tuning";
import { UNARMED, type WeaponSpec, combatCoefficientsFrom } from "@terra/sim";
import type { AuditActor } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import { createRateLimiter } from "../rateLimit.ts";
import type { RosterCatalog } from "../roster/catalog.ts";
import type { BalanceServices, BalanceShared, Viewer } from "../trpc/context.ts";
import { reasonedError } from "../trpc/init.ts";
import { type TuningShared, overrideView } from "../tuning/services.ts";
import type { TuningChange, TuningPlan } from "../tuning/state.ts";
import { contributionOf } from "./compute.ts";
import {
  cleanupPresetsAtBoot,
  deletePresetRecord,
  readPresetRecords,
  savePresetRecord,
} from "./presetStore.ts";
import {
  type PackPreset,
  type PresetResolution,
  newCustomPresetId,
  packPresetsOf,
  presetJson,
  resolvePresets,
} from "./presets.ts";
import { type DuelRunner, DuelRunError } from "./runner.ts";

/** 받지 않은 요청(BAD_REQUEST)의 message. 무엇이 틀렸는지는 data.reason(@terra/shared BALANCE_REASONS) */
export const BALANCE_REJECTED = "BALANCE_REJECTED";
/** 대결 지도 한 변(빈 평지, ADR 3절: 지도 64의 약 4분의 1 비용) */
export const BALANCE_MAP_SIZE = 32;
/** 서버 기록 메시지: 대결 한 번(걸린 시간·판 수) */
export const BALANCE_DUELS_MESSAGE = "balance duels";
/** 서버 기록 메시지: 프리셋을 바꿀 때마다 */
export const BALANCE_PRESET_MESSAGE = "balance preset change";
/** 서버 기록 메시지: 켤 때 프리셋 고른 결과 */
export const BALANCE_PRESET_BOOT_MESSAGE = "balance presets";
/** 프리셋을 쓸 수 없는 서버(DB 없음)의 NOT_FOUND message */
export const BALANCE_PRESETS_UNAVAILABLE = "BALANCE_PRESETS_UNAVAILABLE";

/** 기준 유닛 기본값(ADR 3절): 새 사이보그 평균(N9 합 60 ÷ 6 = 서버 BASELINE_PRIMARY 10), 맨손, 1명, 10판, 시드 1, 120초 */
export const BALANCE_DEFAULTS = {
  primaries: { str: 10, vit: 10, int: 10, wis: 10, dex: 10, agi: 10 },
  weapon: BALANCE_UNARMED,
  count: 1,
  runs: 10,
  seed: 1,
  limitSec: 120,
} as const;

export interface BalanceLimits {
  /** 사용자마다 대결 속도 제한 */
  duelsPerUser: { capacity: number; refillPerMinute: number };
}

export const DEFAULT_BALANCE_LIMITS: BalanceLimits = { duelsPerUser: { capacity: 2, refillPerMinute: 4 } };

export interface BalanceLog {
  info(fields: object, message: string): void;
  warn(fields: object, message: string): void;
}

const toChanges = (edits: readonly BalanceEdit[]): TuningChange[] =>
  edits.map((edit) => ({ id: edit.key, value: edit.value }));

function problemOf(plan: TuningPlan): BalanceEditProblem | null {
  return plan.ok ? null : { reason: plan.reason, key: plan.id, problems: [...plan.problems] };
}

const rejected = (reason: string) => reasonedError("BAD_REQUEST", BALANCE_REJECTED, reason);
const presetConflict = () => reasonedError("CONFLICT", "PRESET_CONFLICT", "preset_conflict");

function actorOf(viewer: Viewer, ip: string | null): AuditActor & { id: string } {
  return { kind: "admin", id: viewer.id, ip, meta: { roles: viewer.roles } };
}

/** 저장할 값: 이름 앞뒤 빈칸을 떼고 칸 차례를 고정한다(같은 값이면 같은 jsonb) */
function cleanValues(values: BalancePresetValues): BalancePresetValues {
  const { primaries } = values;
  return {
    name: {
      ko: normalizeBalancePresetName(values.name.ko) ?? values.name.ko,
      en: normalizeBalancePresetName(values.name.en) ?? values.name.en,
    },
    primaries: {
      str: primaries.str,
      vit: primaries.vit,
      int: primaries.int,
      wis: primaries.wis,
      dex: primaries.dex,
      agi: primaries.agi,
    },
    weapon: values.weapon,
    count: values.count,
    runs: values.runs,
    limitSec: values.limitSec,
  };
}

const packView = (preset: PackPreset): BalancePresetView => ({
  id: preset.id,
  ...preset.values,
  source: "pack",
  version: 0,
  updatedBy: null,
  updatedAt: null,
});

/** 무기 공격력 칸 → 화면 모양(D-465: 칸이 없으면 null) */
const attackField = (value: WeaponSpec["physical"]) =>
  value ? { attack: value.attack, appropriate: value.attackAppropriate } : null;

export function createBalanceServices(deps: {
  tuning: TuningShared;
  roster: RosterCatalog;
  runner: DuelRunner;
  now: () => number;
  log: BalanceLog;
  limits?: Partial<BalanceLimits> | undefined;
  /** 팩 balance_presets 항목(씨앗). 없으면 빈 목록 */
  presets?: readonly BalancePresetEntry[] | undefined;
  /** 프리셋을 함께 쓰는 DB. 없으면 팩 씨앗만(쓰기 NOT_FOUND) */
  db?: Database | undefined;
}): BalanceShared {
  const { tuning, roster, runner, now, log, db } = deps;
  const { state } = tuning;
  const limits = { ...DEFAULT_BALANCE_LIMITS, ...deps.limits };
  const duelLimiter = createRateLimiter({ ...limits.duelsPerUser, now });
  let busy = false;
  // 프리셋 쓰기 차례(한 프로세스 안, 앞 쓰기가 실패해도 다음은 돈다)
  let presetTail: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const run = presetTail.then(task, task);
    presetTail = run.catch(() => undefined);
    return run;
  };

  /** 무기 목록: 맨손(사람형 타고난 무기) + 팩의 무기 아이템(무기 사양이 있는 장비). 화면은 맨손 이름을 메시지 키로 바꾼다 */
  const weaponSpecs = (): Map<string, WeaponSpec> => {
    const { combat } = roster;
    const unarmed = combat.unitKinds.find((kind) => kind.id === "human")?.naturalWeapon ?? UNARMED;
    const map = new Map<string, WeaponSpec>([[BALANCE_UNARMED, unarmed]]);
    for (const item of combat.equipment) if (item.weapon) map.set(item.id, item.weapon);
    return map;
  };

  const weaponView = (id: string, weapon: WeaponSpec): BalanceWeaponView => {
    const name = roster.names.items[id] ?? { ko: id, en: id };
    return {
      id,
      name: { ko: name.ko, en: name.en },
      physical: attackField(weapon.physical),
      elemental: attackField(weapon.elemental),
      basic: weapon.basic ?? (weapon.physical ? "physical" : "elemental"),
    };
  };

  /** 팩 씨앗(무기 사양이 없는 아이템을 가리키는 것은 빼고 한 번 알린다) */
  let packPresets: readonly PackPreset[] | undefined;
  const packPresetList = (): readonly PackPreset[] => {
    if (packPresets) return packPresets;
    const { presets, skipped } = packPresetsOf(deps.presets ?? [], new Set(weaponSpecs().keys()));
    if (skipped.length > 0) log.warn({ skipped }, "balance presets: pack presets skipped");
    packPresets = presets;
    return presets;
  };
  const resolveNow = async (database: Database): Promise<PresetResolution> =>
    resolvePresets(packPresetList(), await readPresetRecords(database), new Set(weaponSpecs().keys()));

  /** 지금 목록(DB가 없거나 읽지 못하면 팩 씨앗만, 쓸 수 없음) */
  const presetsNow = async (): Promise<BalancePresetsResponse> => {
    if (!db) return { presets: packPresetList().map(packView), presetsWritable: false };
    try {
      return { presets: (await resolveNow(db)).list, presetsWritable: true };
    } catch (error) {
      log.warn({ err: error }, "balance presets: could not read the database (showing pack presets)");
      return { presets: packPresetList().map(packView), presetsWritable: false };
    }
  };

  const requireDb = (): Database => {
    if (!db) throw reasonedError("NOT_FOUND", BALANCE_PRESETS_UNAVAILABLE, "unavailable");
    return db;
  };

  /** 받은 값 검사(이름·범위·무기). 맞으면 정리한 값 */
  const checkedValues = (values: BalancePresetValues): BalancePresetValues => {
    const clean = cleanValues(values);
    if (balancePresetProblem(clean) !== null) throw rejected("invalid_preset");
    if (!weaponSpecs().has(clean.weapon)) throw rejected("unknown_weapon");
    return clean;
  };

  const savePreset = async (viewer: Viewer, ip: string | null, input: BalancePresetSaveInput) => {
    const database = requireDb();
    const values = checkedValues(input.values);
    return serial(async (): Promise<BalancePresetsResponse> => {
      const rows = await readPresetRecords(database);
      const { list } = resolvePresets(packPresetList(), rows, new Set(weaponSpecs().keys()));
      const packPreset = packPresetList().find((preset) => preset.id === input.id);
      let id: string;
      let before: BalancePresetValues | null = null;
      if (input.id === null) {
        if (input.expectedVersion !== 0) throw presetConflict();
        if (list.filter((preset) => preset.source === "custom").length >= BALANCE_CUSTOM_PRESETS_MAX)
          throw rejected("too_many_presets");
        id = newCustomPresetId();
      } else {
        const view = list.find((preset) => preset.id === input.id);
        if (!view) throw rejected("unknown_preset");
        if (view.version !== input.expectedVersion) throw presetConflict();
        id = view.id;
        before = cleanValues(view);
      }
      // 읽을 때 쓰지 않은 줄(팩이 이김·맞지 않음)이 남아 있으면 그 판으로 덮어쓴다
      const dbVersion = rows.find((row) => row.id === id)?.version ?? null;
      const actor = actorOf(viewer, ip);
      // 팩 프리셋을 팩 값 그대로 저장하면 팩 값으로 되돌리기(줄 지움)
      if (packPreset && presetJson(values) === presetJson(packPreset.values)) {
        if (dbVersion !== null) {
          const outcome = await deletePresetRecord(database, { id, dbVersion, actor });
          if (outcome.kind === "conflict") throw presetConflict();
        }
      } else {
        const outcome = await savePresetRecord(database, {
          id,
          dbVersion,
          data: values,
          packEntry: packPreset ? packPreset.values : null,
          before,
          viewVersion: input.expectedVersion,
          contentVersion: tuning.pack.contentVersion,
          actor,
        });
        if (outcome.kind === "conflict") throw presetConflict();
      }
      log.info(
        { at: now(), actor: viewer.loginId, action: "save", id, before, after: values },
        BALANCE_PRESET_MESSAGE,
      );
      return presetsNow();
    });
  };

  const deletePreset = async (viewer: Viewer, ip: string | null, input: BalancePresetDeleteInput) => {
    const database = requireDb();
    return serial(async (): Promise<BalancePresetsResponse> => {
      const rows = await readPresetRecords(database);
      const { list } = resolvePresets(packPresetList(), rows, new Set(weaponSpecs().keys()));
      const view = list.find((preset) => preset.id === input.id);
      if (!view) throw rejected("unknown_preset");
      if (view.version !== input.expectedVersion) throw presetConflict();
      const row = rows.find((record) => record.id === input.id);
      // 고치지 않은 팩 프리셋은 지울 줄이 없다(팩 프리셋은 화면에서 지우지 않는다)
      if (row) {
        const outcome = await deletePresetRecord(database, {
          id: input.id,
          dbVersion: row.version,
          actor: actorOf(viewer, ip),
        });
        if (outcome.kind === "conflict") throw presetConflict();
        log.info(
          { at: now(), actor: viewer.loginId, action: "delete", id: input.id, before: cleanValues(view) },
          BALANCE_PRESET_MESSAGE,
        );
      }
      return presetsNow();
    });
  };

  const services = (ip: string | null): BalanceServices => ({
    async table(): Promise<BalanceTableResponse> {
      const presets = await presetsNow();
      const snapshot = state.snapshot();
      const rows = state.statRows.map((row) => ({
        id: row.id,
        name: { ko: row.name.ko, en: row.name.en },
        shape: row.shape,
        cells: statCellFieldsOf(row.shape).map((field) => {
          const key = statCellKey(row.id, field);
          const pack = statRowCell(row, field) ?? 0;
          const record = snapshot.overrides.get(key);
          return {
            field,
            pack,
            value: snapshot.values.get(key) ?? pack,
            override: record ? overrideView(record) : null,
          };
        }),
      }));
      return {
        contentVersion: tuning.pack.contentVersion,
        revision: snapshot.revision,
        rows,
        weapons: [...weaponSpecs()].map(([id, weapon]) => weaponView(id, weapon)),
        defaults: BALANCE_DEFAULTS,
        ...presets,
      };
    },

    savePreset: (viewer, input) => savePreset(viewer, ip, input),
    deletePreset: (viewer, input) => deletePreset(viewer, ip, input),

    contribution(input: BalanceContributionInput): Promise<BalanceContributionResponse> {
      // 기다림 없이 한 번에 계산한다: 지금 표·고친 표·검사가 같은 스냅숏을 본다
      const changes = toChanges(input.edits);
      const hasEdits = changes.length > 0;
      return Promise.resolve({
        revision: state.revision(),
        current: contributionOf(state.statTable(), input.primaries),
        edited: hasEdits ? contributionOf(state.statTableWith(changes), input.primaries) : null,
        problem: hasEdits ? problemOf(state.plan(changes)) : null,
      });
    },

    async duels(viewer: Viewer, input: BalanceDuelsInput): Promise<BalanceDuelsResponse> {
      if (balanceSettingsProblem(input) !== null) throw rejected("invalid_settings");
      const weapon = weaponSpecs().get(input.weapon);
      if (!weapon) throw rejected("unknown_weapon");
      if (!duelLimiter.take(viewer.id))
        throw reasonedError("TOO_MANY_REQUESTS", "RATE_LIMITED", "rate_limited");
      if (busy) throw reasonedError("TOO_MANY_REQUESTS", "BALANCE_BUSY", "busy");
      busy = true;
      try {
        // 요청 시작 때 값 한 벌(표 두 벌·계수)을 일에 담는다. 워커는 접근자를 모른다
        const snapshot = state.snapshot();
        const changes = toChanges(input.edits);
        const job = {
          tables: {
            current: [...state.statTable()],
            edited: changes.length > 0 ? [...state.statTableWith(changes)] : null,
          },
          coefficients: combatCoefficientsFrom(snapshot.values),
          primaries: input.primaries,
          weapon,
          count: input.count,
          runs: input.runs,
          seed: input.seed,
          limitMs: input.limitSec * 1000,
          mapSize: BALANCE_MAP_SIZE,
        };
        const problem = changes.length > 0 ? problemOf(state.plan(changes)) : null;
        const started = now();
        let result: Awaited<ReturnType<DuelRunner>>;
        try {
          result = await runner(job);
        } catch (error) {
          const reason = error instanceof DuelRunError ? error.reason : "failed";
          log.warn({ err: error, reason }, "balance duels failed");
          throw reasonedError("INTERNAL_SERVER_ERROR", "BALANCE_DUELS_FAILED", reason);
        }
        const ms = now() - started;
        log.info(
          {
            ms,
            runs: input.runs,
            count: input.count,
            limitSec: input.limitSec,
            edited: job.tables.edited !== null,
          },
          BALANCE_DUELS_MESSAGE,
        );
        const settings = {
          primaries: input.primaries,
          weapon: input.weapon,
          count: input.count,
          runs: input.runs,
          seed: input.seed,
          limitSec: input.limitSec,
        };
        return {
          revision: snapshot.revision,
          settings,
          current: result.current,
          edited: result.edited,
          problem,
          ms,
        };
      } finally {
        busy = false;
      }
    },
  });

  return {
    forRequest: services,
    async boot(): Promise<void> {
      if (!db) return;
      try {
        const resolution = await resolveNow(db);
        const removed = await cleanupPresetsAtBoot(db, {
          packWon: resolution.packWon,
          dropped: resolution.dropped,
          contentVersion: tuning.pack.contentVersion,
        });
        log.info(
          {
            presets: resolution.list.length,
            kept: resolution.kept.map((row) => row.id),
            packWon: resolution.packWon.map((row) => row.id),
            dropped: resolution.dropped.map(({ row, reason }) => ({ id: row.id, reason })),
            removed,
          },
          BALANCE_PRESET_BOOT_MESSAGE,
        );
      } catch (error) {
        // 시작을 막지 않는다: 읽을 때 고르기가 같은 목록을 낸다
        log.warn({ err: error }, "balance presets boot: could not clean up (kept in the database)");
      }
    },
  };
}
