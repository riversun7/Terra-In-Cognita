// 전투 실험실 요청 처리 — tRPC battleLab.*(src/trpc/battleLab.ts)가 D1 권한(tuning:read·write 두 겹)·속도 제한을 거친 뒤 부른다.
// docs/adr/2026-11-01-balance-screen.md "바뀜 (2026-11-01, 전투 실험실)". 앱에 하나(createBattleLabShared), 요청마다 DB·접속 주소를 얹는다.
// - 계산 규칙(LabRules)은 요청 때 실효 값 한 벌: 가중치 표(D1 덮어쓰기 포함)·전투 계수·성장률 N5·만렙 N7. 공식 수를 여기 적지 않는다.
// - 미리 보기는 가볍다(주 스레드). 전투(한 판·몬테카를로)는 무겁다 → 워커(runner). 서버 전체 한 번에 하나(대결과 같은 바쁨 표시 gate),
//   사용자마다 속도 제한. 일에는 사양·지도·계수·시드를 담는다(워커는 접근자를 모른다).
// - 프리셋: 샘플(코드, 읽기 전용) + 팀 프리셋(DB). 쓰기는 프로세스 안 차례(tuning.serial)로 줄 판 충돌을 센다.
import { randomBytes } from "node:crypto";
import {
  LAB_LIMITS,
  type LabBattleInput,
  type LabBattleResponse,
  type LabCatalogResponse,
  type LabDropped,
  type LabMonteCarloInput,
  type LabMonteCarloResponse,
  type LabParty,
  type LabPresetListResponse,
  type LabPresetSaveInput,
  type LabPreviewResponse,
  type LabReplayResponse,
  type LabUnit,
  labSettingsProblem,
} from "@terra/shared/battleLab";
import type { ReplayArenaRef, ReplayName } from "@terra/protocol/battleReplay";
import type { LocalizedName } from "@terra/shared/roster";
import { combatCoefficientsFrom, societyCoefficientsFrom } from "@terra/sim";
import type { HeavyGate } from "../balance/gate.ts";
import type { JobRunner } from "../balance/runner.ts";
import { DuelRunError } from "../balance/runner.ts";
import type { Database } from "../db/client.ts";
import { createRateLimiter } from "../rateLimit.ts";
import type { RosterCatalog } from "../roster/catalog.ts";
import type { Viewer } from "../trpc/context.ts";
import { reasonedError } from "../trpc/init.ts";
import type { TuningShared } from "../tuning/services.ts";
import type { ArenaJob, ArenaParty } from "./arena.ts";
import {
  type LabRules,
  LabUnitError,
  NO_GROWTH_KINDS,
  buildLabUnit,
  customWeaponOf,
  previewLabUnit,
} from "./build.ts";
import {
  countPresetRows,
  deletePresetRow,
  insertPresetRow,
  presetViewOf,
  readPresetRows,
  updatePresetRow,
} from "./presets.ts";
import { LAB_SAMPLES } from "./samples.ts";
import type { ArenaTerrains } from "./terrain.ts";

/** 받지 않은 요청(BAD_REQUEST 등)의 message. 무엇이 틀렸는지는 data.reason(@terra/shared LAB_REASONS) */
export const LAB_REJECTED = "BATTLE_LAB_REJECTED";
/** 서버 기록 메시지 */
export const LAB_BATTLE_MESSAGE = "battle lab battle";
export const LAB_PRESET_MESSAGE = "battle lab preset change";

export interface BattleLabLimits {
  /** 사용자마다 전투(한 판·몬테카를로) 속도 제한 */
  battlesPerUser: { capacity: number; refillPerMinute: number };
}

export const DEFAULT_BATTLE_LAB_LIMITS: BattleLabLimits = {
  battlesPerUser: { capacity: 4, refillPerMinute: 8 },
};

export interface BattleLabLog {
  info(fields: object, message: string): void;
  warn(fields: object, message: string): void;
}

export interface BattleLabShared {
  catalog(): LabCatalogResponse;
  preview(unit: LabUnit): LabPreviewResponse;
  battle(viewer: Viewer, input: LabBattleInput): Promise<LabBattleResponse>;
  monteCarlo(viewer: Viewer, input: LabMonteCarloInput): Promise<LabMonteCarloResponse>;
  /** 3D 관람: 한 판(같은 시드면 [한 판]과 같은 전투)을 리플레이로 기록 */
  replay(viewer: Viewer, input: LabBattleInput): Promise<LabReplayResponse>;
  presets(db: Database, writable: boolean): Promise<LabPresetListResponse>;
  savePreset(
    db: Database,
    viewer: Viewer,
    ip: string,
    input: LabPresetSaveInput,
  ): Promise<LabPresetListResponse>;
  deletePreset(
    db: Database,
    viewer: Viewer,
    ip: string,
    input: { id: string; expectedVersion: number },
  ): Promise<LabPresetListResponse>;
}

const rejected = (reason: string, code: "BAD_REQUEST" | "CONFLICT" | "NOT_FOUND" = "BAD_REQUEST") =>
  reasonedError(code, LAB_REJECTED, reason);

/** 뺀 참조를 한 번씩만 */
function uniqueDropped(lists: readonly (readonly LabDropped[])[]): LabDropped[] {
  const seen = new Set<string>();
  const out: LabDropped[] = [];
  for (const list of lists)
    for (const entry of list) {
      const key = `${entry.kind}:${entry.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(entry);
    }
  return out;
}

/** 사양을 만든다(모르는 종류는 BAD_REQUEST invalid_unit) */
function build(unit: LabUnit, rules: LabRules) {
  try {
    return buildLabUnit(unit, rules);
  } catch (error) {
    if (error instanceof LabUnitError) throw rejected("invalid_unit");
    throw error;
  }
}

function partyOf(party: LabParty, rules: LabRules): { party: ArenaParty; dropped: LabDropped[] } {
  const built = party.units.map((unit) => ({ unit, built: build(unit, rules) }));
  return {
    party: {
      units: built.map(({ unit, built: b }) => ({ spec: b.spec, row: unit.row })),
      retreatHpPct: party.retreatHpPct,
    },
    dropped: uniqueDropped(built.map(({ built: b }) => b.dropped)),
  };
}

/** 프리셋 목록 = 샘플 + 팀 줄(지금 규칙에 맞는 것만) */
async function listOf(db: Database, writable: boolean): Promise<LabPresetListResponse> {
  const rows = await readPresetRows(db);
  const team = rows.flatMap((row) => {
    const view = presetViewOf(row);
    return view ? [view] : [];
  });
  return { presets: [...LAB_SAMPLES, ...team], invalid: rows.length - team.length, writable };
}

const actorOf = (viewer: Viewer, ip: string) => ({ kind: "user" as const, id: viewer.id, ip });

const nameOf = (table: Readonly<Record<string, LocalizedName>>, id: string): LocalizedName => {
  const name = table[id];
  return name ? { ko: name.ko, en: name.en } : { ko: id, en: id };
};

const field = (value: { attack: number; attackAppropriate: number } | undefined) =>
  value ? { attack: value.attack, appropriate: value.attackAppropriate } : null;

export function createBattleLabShared(deps: {
  tuning: TuningShared;
  roster: RosterCatalog;
  /** 팩 unit_kinds 이름(없으면 ID) */
  unitKindNames: ReadonlyMap<string, LocalizedName>;
  /** 팩 효과 이름(3D 관람 리플레이, 없으면 ID) */
  effectNames?: Readonly<Record<string, ReplayName>> | undefined;
  terrains: ArenaTerrains;
  runner: JobRunner;
  gate: HeavyGate;
  now: () => number;
  log: BattleLabLog;
  limits?: Partial<BattleLabLimits> | undefined;
}): BattleLabShared {
  const { tuning, roster, terrains, runner, gate, now, log } = deps;
  const { state } = tuning;
  const limits = { ...DEFAULT_BATTLE_LAB_LIMITS, ...deps.limits };
  const battleLimiter = createRateLimiter({ ...limits.battlesPerUser, now });

  /** 요청 때 실효 값 한 벌 */
  const rulesNow = (): { rules: LabRules; revision: number } => {
    const snapshot = state.snapshot();
    const society = societyCoefficientsFrom(snapshot.values);
    return {
      revision: snapshot.revision,
      rules: {
        catalog: roster.combat,
        coefficients: combatCoefficientsFrom(snapshot.values, undefined, state.combatFormulas()),
        growthPm: society.cyborg.growthPm,
        maxLevel: society.cyborg.maxLevel,
      },
    };
  };

  /** 전투 일 준비(검사·지형·사양) → 제한 → 워커. 일 종류만 다르다 */
  const runArena = async <T>(
    viewer: Viewer,
    input: LabBattleInput & { runs?: number },
    work: (job: ArenaJob, arena: ReplayArenaRef | null) => Promise<T>,
  ): Promise<{ result: T; revision: number; dropped: LabDropped[]; ms: number }> => {
    if (labSettingsProblem(input) !== null) throw rejected("invalid_settings");
    const pick = await terrains.map(input.terrain).catch((error: unknown) => {
      log.warn({ err: error, terrain: input.terrain }, "battle lab terrain failed");
      return null;
    });
    if (!pick) throw rejected("unknown_terrain");
    const { rules, revision } = rulesNow();
    const a = partyOf(input.a, rules);
    const b = partyOf(input.b, rules);
    if (!battleLimiter.take(viewer.id))
      throw reasonedError("TOO_MANY_REQUESTS", "RATE_LIMITED", "rate_limited");
    if (!gate.tryEnter()) throw reasonedError("TOO_MANY_REQUESTS", "BALANCE_BUSY", "busy");
    try {
      const job: ArenaJob = {
        a: a.party,
        b: b.party,
        map: pick.map,
        coefficients: rules.coefficients,
        limitMs: input.limitSec * 1000,
        seed: input.seed,
      };
      const started = now();
      let result: T;
      try {
        result = await work(job, pick.ref);
      } catch (error) {
        const reason = error instanceof DuelRunError ? error.reason : "failed";
        log.warn({ err: error, reason }, "battle lab battle failed");
        throw reasonedError("INTERNAL_SERVER_ERROR", "BATTLE_LAB_FAILED", reason);
      }
      const ms = now() - started;
      log.info(
        {
          ms,
          runs: input.runs ?? 1,
          units: input.a.units.length + input.b.units.length,
          terrain: input.terrain,
          limitSec: input.limitSec,
        },
        LAB_BATTLE_MESSAGE,
      );
      return { result, revision, dropped: uniqueDropped([a.dropped, b.dropped]), ms };
    } finally {
      gate.leave();
    }
  };

  return {
    catalog() {
      const snapshot = state.snapshot();
      const society = societyCoefficientsFrom(snapshot.values);
      const { combat, names } = roster;
      return {
        contentVersion: tuning.pack.contentVersion,
        revision: snapshot.revision,
        unitKinds: combat.unitKinds.map((kind) => ({
          id: kind.id,
          name: deps.unitKindNames.get(kind.id) ?? { ko: kind.id, en: kind.id },
          slots: [...kind.slots],
          skillSlots: { ...kind.skillSlots },
          growth: !NO_GROWTH_KINDS.has(kind.id),
          natural: customWeaponOf(kind.naturalWeapon),
        })),
        weapons: combat.equipment.flatMap((item) =>
          item.weapon
            ? [
                {
                  id: item.id,
                  name: nameOf(names.items, item.id),
                  physical: field(item.weapon.physical),
                  elemental: field(item.weapon.elemental),
                  basic: item.weapon.basic ?? (item.weapon.physical ? "physical" : "elemental"),
                  range: item.weapon.range,
                  intervalMs: item.weapon.intervalMs,
                },
              ]
            : [],
        ),
        equipment: combat.equipment.map((item) => ({
          id: item.id,
          name: nameOf(names.items, item.id),
          slot: item.slot,
          stats: item.stats.map((range) => ({ ...range })),
          skills: [...item.skills],
          weapon: item.weapon !== undefined,
        })),
        skills: combat.skills.map((skill) => ({
          id: skill.id,
          name: nameOf(names.skills, skill.id),
          trigger: skill.trigger,
          resource: skill.resource,
          base: skill.base,
          damage: skill.damage,
          target: skill.target,
          cost: skill.cost,
          castMs: skill.castMs,
          cooldownMs: skill.cooldownMs,
          range: skill.range,
          radius: skill.radius,
        })),
        statRows: combat.statTable.map((row) => ({
          id: row.id,
          name: nameOf(names.stats, row.id),
          shape: row.shape,
          gear: row.id !== "physical_attack" && row.id !== "elemental_attack",
        })),
        growth: {
          growthPm: society.cyborg.growthPm,
          kMinPm: society.cyborg.kMinPm,
          kMaxPm: society.cyborg.kMaxPm,
          maxLevel: society.cyborg.maxLevel,
        },
        terrains: terrains.list(),
        replay: true,
      };
    },

    preview(unit) {
      const { rules, revision } = rulesNow();
      try {
        return { revision, ...previewLabUnit(unit, rules) };
      } catch (error) {
        if (error instanceof LabUnitError) throw rejected("invalid_unit");
        throw error;
      }
    },

    async battle(viewer, input) {
      const out = await runArena(viewer, input, async (job) => {
        const result = await runner({ kind: "battle", job, logMax: LAB_LIMITS.logMax });
        if (result.kind !== "battle") throw new DuelRunError("failed", `unexpected ${result.kind} result`);
        return result.result;
      });
      return { revision: out.revision, ...out.result, dropped: out.dropped, ms: out.ms };
    },

    async replay(viewer, input) {
      // 리플레이 이름표: 표시 이름(없으면 A1·B3)과 유닛 종류. 팀 A ID 1~, 팀 B 101~(전투장과 같다)
      const units: Record<number, { name: string; kind: string }> = {};
      input.a.units.forEach((unit, index) => {
        units[1 + index] = { name: unit.label.trim() || `A${index + 1}`, kind: unit.kind };
      });
      input.b.units.forEach((unit, index) => {
        units[101 + index] = { name: unit.label.trim() || `B${index + 1}`, kind: unit.kind };
      });
      const names = { skills: { ...roster.names.skills }, effects: { ...deps.effectNames } };
      const out = await runArena(viewer, input, async (job, arena) => {
        const result = await runner({ kind: "replay", replay: { job, arena, units, names } });
        if (result.kind !== "replay") throw new DuelRunError("failed", `unexpected ${result.kind} result`);
        return result.result;
      });
      return {
        revision: out.revision,
        replay: out.result.replay,
        bytes: out.result.bytes,
        events: out.result.events,
        endMs: out.result.endTick * rulesNow().rules.coefficients.tickMs,
        dropped: out.dropped,
        ms: out.ms,
      };
    },

    async monteCarlo(viewer, input) {
      const out = await runArena(viewer, input, async (job) => {
        const result = await runner({ kind: "monte", job, runs: input.runs });
        if (result.kind !== "monte") throw new DuelRunError("failed", `unexpected ${result.kind} result`);
        return result.result;
      });
      return { revision: out.revision, ...out.result, dropped: out.dropped, ms: out.ms };
    },

    presets: listOf,

    savePreset(db, viewer, ip, input) {
      return tuning.serial(async () => {
        const actor = actorOf(viewer, ip);
        const values = { kind: input.kind, name: input.name, data: input.data };
        let outcome;
        let id = input.id;
        if (id === undefined) {
          if ((await countPresetRows(db)) >= LAB_LIMITS.presetsMax)
            throw rejected("too_many_presets", "CONFLICT");
          id = `lab_${randomBytes(6).toString("hex")}`;
          outcome = await insertPresetRow(db, { ...values, id, actor });
        } else {
          if (id.startsWith("sample_")) throw rejected("sample_read_only");
          if (input.expectedVersion === undefined) throw rejected("invalid_preset");
          outcome = await updatePresetRow(db, {
            ...values,
            id,
            expectedVersion: input.expectedVersion,
            actor,
          });
        }
        if (outcome.kind === "conflict") throw rejected("preset_conflict", "CONFLICT");
        log.info({ id, kind: input.kind, version: outcome.version, user: viewer.id }, LAB_PRESET_MESSAGE);
        return listOf(db, true);
      });
    },

    deletePreset(db, viewer, ip, input) {
      return tuning.serial(async () => {
        if (input.id.startsWith("sample_")) throw rejected("sample_read_only");
        const outcome = await deletePresetRow(db, { ...input, actor: actorOf(viewer, ip) });
        if (outcome.kind === "conflict") throw rejected("preset_conflict", "CONFLICT");
        log.info({ id: input.id, deleted: true, user: viewer.id }, LAB_PRESET_MESSAGE);
        return listOf(db, true);
      });
    },
  };
}
