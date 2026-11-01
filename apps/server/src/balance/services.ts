// 밸런스 화면 요청 처리 — tRPC balance.*(src/trpc/balance.ts)가 D1 권한(tuning:read 두 겹)·조회 속도 제한을 거친 뒤 부른다.
// docs/adr/2026-11-01-balance-screen.md 3·4절. 서버가 켤 때 한 번 만든다(요청마다 만들 것이 없다).
// - table: 가중치 표(팩 값·실효 값·덮어쓰기), 무기 목록, 기준 유닛 기본값. 스냅숏 하나로 만든다.
// - contribution: 지금 표·고친 표(지금 + 담은 변경)의 2차 스탯과 1차 +10 차이. 가볍다(주 스레드).
// - duels: 1차마다 "기준 + 10 vs 기준" 시드 대결. 무겁다 → 워커(runner). 요청 시작 때 표·계수 한 벌을 일에 담는다.
//   사용자마다 따로 세는 속도 제한, 서버 전체 한 번에 하나(바쁘면 busy).
// 담은 변경은 tuning.save가 받을 묶음과 같은 검사(TuningState.plan)를 미리 돌려 받지 않을 까닭을 함께 돌려준다(저장은 하지 않는다).
import { statRowCell } from "@terra/content";
import {
  BALANCE_UNARMED,
  type BalanceContributionInput,
  type BalanceContributionResponse,
  type BalanceDuelsInput,
  type BalanceDuelsResponse,
  type BalanceEdit,
  type BalanceEditProblem,
  type BalanceTableResponse,
  type BalanceWeaponView,
  balanceSettingsProblem,
} from "@terra/shared/balance";
import { statCellFieldsOf, statCellKey } from "@terra/shared/tuning";
import { UNARMED, type WeaponSpec, combatCoefficientsFrom } from "@terra/sim";
import { createRateLimiter } from "../rateLimit.ts";
import type { RosterCatalog } from "../roster/catalog.ts";
import type { BalanceServices, Viewer } from "../trpc/context.ts";
import { reasonedError } from "../trpc/init.ts";
import { type TuningShared, overrideView } from "../tuning/services.ts";
import type { TuningChange, TuningPlan } from "../tuning/state.ts";
import { contributionOf } from "./compute.ts";
import { type HeavyGate, createHeavyGate } from "./gate.ts";
import { type DuelRunner, DuelRunError } from "./runner.ts";

/** 받지 않은 요청(BAD_REQUEST)의 message. 무엇이 틀렸는지는 data.reason(@terra/shared BALANCE_REASONS) */
export const BALANCE_REJECTED = "BALANCE_REJECTED";
/** 대결 지도 한 변(빈 평지, ADR 3절: 지도 64의 약 4분의 1 비용) */
export const BALANCE_MAP_SIZE = 32;
/** 서버 기록 메시지: 대결 한 번(걸린 시간·판 수) */
export const BALANCE_DUELS_MESSAGE = "balance duels";

/** 기준 유닛 기본값(ADR 3절): 새 사이보그 평균(N9 합 60 ÷ 6 = 서버 BASELINE_PRIMARY 10), 맨손, 1명, 10판, 시드 1, 120초 */
export const BALANCE_DEFAULTS = {
  primaries: { str: 10, vit: 10, int: 10, wis: 10, dex: 10, agi: 10 },
  weapon: BALANCE_UNARMED,
  count: 1,
  runs: 10,
  seed: 1,
  limitSec: 120,
} as const;

/**
 * 기준 유닛 기본값의 무기(D-490: 기본 유닛은 기본 무기를 든다): 팩 무기 가운데 물리 칸이 있는 첫 무기, 없으면 맨손.
 * 장비·스킬은 이 대결 모양에 없다(전투 실험실 샘플이 장비·스킬까지 든다)
 */
function defaultsOf(weapons: ReadonlyMap<string, WeaponSpec>) {
  const first = [...weapons].find(([id, weapon]) => id !== BALANCE_UNARMED && weapon.physical);
  return { ...BALANCE_DEFAULTS, weapon: first?.[0] ?? BALANCE_UNARMED };
}

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
  /** 서버 전체 바쁨 표시(전투 실험실과 같이 쓴다). 없으면 이 서비스만의 표시 */
  gate?: HeavyGate | undefined;
}): BalanceServices {
  const { tuning, roster, runner, now, log } = deps;
  const { state } = tuning;
  const limits = { ...DEFAULT_BALANCE_LIMITS, ...deps.limits };
  const duelLimiter = createRateLimiter({ ...limits.duelsPerUser, now });
  const gate = deps.gate ?? createHeavyGate();

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

  return {
    table(): Promise<BalanceTableResponse> {
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
      return Promise.resolve({
        contentVersion: tuning.pack.contentVersion,
        revision: snapshot.revision,
        rows,
        weapons: [...weaponSpecs()].map(([id, weapon]) => weaponView(id, weapon)),
        defaults: defaultsOf(weaponSpecs()),
      });
    },

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
      if (!gate.tryEnter()) throw reasonedError("TOO_MANY_REQUESTS", "BALANCE_BUSY", "busy");
      try {
        // 요청 시작 때 값 한 벌(표 두 벌·계수)을 일에 담는다. 워커는 접근자를 모른다
        const snapshot = state.snapshot();
        const changes = toChanges(input.edits);
        const job = {
          tables: {
            current: [...state.statTable()],
            edited: changes.length > 0 ? [...state.statTableWith(changes)] : null,
          },
          coefficients: combatCoefficientsFrom(snapshot.values, undefined, state.combatFormulas()),
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
        gate.leave();
      }
    },
  };
}
