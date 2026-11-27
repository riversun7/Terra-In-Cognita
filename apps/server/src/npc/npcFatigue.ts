// NPC 일꾼 상태 기반 피로 저장소(메모리 전용 — docs/adr/2026-11-27-npc-stateful-fatigue.md).
// - DB에 저장하지 않는다(서버 재시작 시 0부터 다시 누적, settlement.ts DB 정산은 건드리지 않는다).
// - 일할 때(aiState === "work" && 배정 시설 가동 중 또는 물류 운반 중)만 피로가 누적되고,
//   휴식("rest")·비근무·정지·재료부족 구간에서는 쉼터(숙소/집/노숙) 회복 배율대로 단조 감소한다.
// - 쉬러 가는 피로(restAt, 기본 70~110)와 다시 일하는 피로(resumeAt = 0)는 플레이어 유닛과 같은
//   성향 기본값(@terra/shared/unitLife defaultLifeRules)을 써서 규율 성향이 높은 NPC는 N23 피로 구간(90/100/110)에 실제로 진입한다.
// 정수 연산만 쓴다(밀리 피로 단위 1000 = 피로 1점).
import { defaultLifeRules } from "@terra/shared/unitLife";
import { type RestPlace, type SocietyCoefficients, TEST_JOB_RULES, restRecoveryPm } from "@terra/sim";
import type { UnitAiState } from "@terra/sim/npcAi";
import { penaltyFromOf } from "../life/store.ts";
import {
  type BotFatigueAccess,
  type BotHome,
  DEFAULT_WORK_SHIFT,
  atWork,
  botActivity,
} from "../world/bots.ts";

/** NPC 일꾼 하나의 상태 기반 피로 계산 문맥 */
export interface NpcFatigueWorkerContext {
  /** 현재 실제로 일감을 수행 중인가(생산 시설 가동·비정지 또는 물류 운반 중) */
  readonly activeWork: boolean;
  /** 쉼터 종류(숙소/집/노숙 회복 배율 계산용) */
  readonly place: RestPlace;
  /** 규율 성향(0~1000, 없으면 가운데 500) */
  readonly discipline?: number | undefined;
  /** 2차맵 봇 자리(상태 전이 판정용, 미로딩 맵·시험에서는 undefined) */
  readonly home?: BotHome | undefined;
}

export interface NpcFatigueStoreDeps {
  readonly rules: () => SocietyCoefficients;
  /** 현재 NPC 일꾼 유닛 ID 목록(생산·도시 직무·물류센터 운반꾼) */
  readonly workerIds: () => Iterable<number>;
  /** 유닛 ID의 현재 근무·쉼터·성향 문맥(일꾼이 아니면 undefined) */
  readonly workerOf: (unitId: number, nowMs: number) => NpcFatigueWorkerContext | undefined;
}

export interface NpcFatigueStore extends BotFatigueAccess {
  /** 그 유닛의 현재 피로(0..fatigueMax 정수, nowMs까지 전진). 추적 중인 일꾼이 아니면 undefined */
  fatigueOf(unitId: number, nowMs: number): number | undefined;
  /** 피로 상한(설정 칸 실효 값) */
  fatigueMax(): number;
  /** 그 유닛이 지금 실제로 일하고 있는가(aiState === "work" && activeWork) */
  isWorking(unitId: number, nowMs: number): boolean;
  /** 모든 일꾼의 피로·상태를 nowMs까지 전진시키고, 피로가 0으로 회복된 비일꾼·사망 유닛을 정리한다 */
  tick(nowMs: number): void;
  /** 메모리에 추적 중인 유닛 수(시험·지표용) */
  readonly size: number;
}

interface FatigueRecord {
  /** 현재 피로(밀리점, 0 .. fatigueMax * 1000) */
  fatigueMilli: number;
  /** 마지막으로 피로를 전진시킨 시각(ms) */
  updatedAtMs: number;
  /** 현재 확정 FSM 상태 */
  aiState: UnitAiState;
  /** 현재 상태에 진입한 시각(ms) */
  stateEnteredAtMs: number;
}

const HOME_PLACE: RestPlace = { kind: "home" };

/** 초기 상태: 낮·밤 모드에서 비근무 시간이거나 비가동 상태면 휴식으로, 아니면 일로 시작 */
function initialStateOf(unitId: number, ctx: NpcFatigueWorkerContext, nowMs: number): UnitAiState {
  if (!ctx.activeWork) return "rest";
  const shift = ctx.home?.shift;
  if (shift && !shift.cycle && !atWork(shift, unitId, nowMs)) return "rest";
  return "work";
}

export function createNpcFatigueStore(deps: NpcFatigueStoreDeps): NpcFatigueStore {
  const records = new Map<number, FatigueRecord>();

  const maxOf = (): number => Math.max(1, Math.trunc(deps.rules().fatigueMax));

  const lifeOf = (discipline?: number) => {
    const c = deps.rules();
    return defaultLifeRules({
      penaltyFrom: penaltyFromOf(c),
      fatigueMax: maxOf(),
      discipline,
    });
  };

  /** record를 nowMs까지 정수 단위로 전진(일할 때만 증가, 휴식·비가동은 단조 감소) */
  const advanceRecord = (
    record: FatigueRecord,
    ctx: Pick<NpcFatigueWorkerContext, "activeWork" | "place" | "discipline">,
    nowMs: number,
  ): void => {
    const c = deps.rules();
    const max = Math.max(1, Math.trunc(c.fatigueMax));
    const maxMilli = max * 1000;
    if (record.fatigueMilli > maxMilli) record.fatigueMilli = maxMilli;
    if (nowMs <= record.updatedAtMs) return;
    const dt = nowMs - record.updatedAtMs;
    const earning = record.aiState === "work" && ctx.activeWork;
    if (earning) {
      const life = lifeOf(ctx.discipline);
      const capMilli = Math.min(maxMilli, life.restAt * 1000);
      if (record.fatigueMilli >= capMilli) {
        record.updatedAtMs = nowMs;
        return;
      }
      const cycleMs = Math.max(1, TEST_JOB_RULES.cycleMs);
      const gain = Math.floor((dt * 1000) / cycleMs);
      if (gain <= 0) return;
      const next = record.fatigueMilli + gain;
      if (next >= capMilli) {
        record.fatigueMilli = capMilli;
        record.updatedAtMs = nowMs;
      } else {
        record.fatigueMilli = next;
        record.updatedAtMs += Math.floor((gain * cycleMs) / 1000);
      }
      return;
    }
    if (record.fatigueMilli <= 0) {
      record.updatedAtMs = nowMs;
      return;
    }
    const recoveryPm = Math.max(1, Math.trunc(restRecoveryPm(ctx.place, c)));
    const restStepMs = Math.max(1, TEST_JOB_RULES.restStepMs);
    const drop = Math.floor((dt * recoveryPm) / restStepMs);
    if (drop <= 0) return;
    const next = record.fatigueMilli - drop;
    if (next <= 0) {
      record.fatigueMilli = 0;
      record.updatedAtMs = nowMs;
    } else {
      record.fatigueMilli = next;
      record.updatedAtMs += Math.floor((drop * restStepMs) / recoveryPm);
    }
  };

  const ensureAndAdvance = (
    unitId: number,
    nowMs: number,
  ): { record: FatigueRecord; ctx: NpcFatigueWorkerContext | undefined } | undefined => {
    const ctx = deps.workerOf(unitId, nowMs);
    let record = records.get(unitId);
    if (!ctx) {
      if (!record) return undefined;
      // 일자리를 잃었거나 비일꾼이 된 경우에도 기존 피로는 단조 회복 후 정리한다
      if (record.aiState === "work") {
        record.aiState = "rest";
        record.stateEnteredAtMs = nowMs;
      }
      advanceRecord(record, { activeWork: false, place: HOME_PLACE }, nowMs);
      if (record.fatigueMilli <= 0) {
        records.delete(unitId);
        return undefined;
      }
      return { record, ctx: undefined };
    }
    if (!record) {
      record = {
        fatigueMilli: 0,
        updatedAtMs: nowMs,
        aiState: initialStateOf(unitId, ctx, nowMs),
        stateEnteredAtMs: nowMs,
      };
      records.set(unitId, record);
      return { record, ctx };
    }
    advanceRecord(record, ctx, nowMs);
    return { record, ctx };
  };

  const store: NpcFatigueStore = {
    snapshot(unitId, nowMs) {
      const state = ensureAndAdvance(unitId, nowMs);
      if (!state) return undefined;
      const life = lifeOf(state.ctx?.discipline);
      return {
        fatigue: Math.floor(state.record.fatigueMilli / 1000),
        fatigueMilli: state.record.fatigueMilli,
        fatigueMax: maxOf(),
        restAt: life.restAt,
        resumeAt: life.resumeAt,
        aiState: state.record.aiState,
        stateEnteredAtMs: state.record.stateEnteredAtMs,
      };
    },

    commitState(unitId, nextState, nowMs) {
      const state = ensureAndAdvance(unitId, nowMs);
      if (!state) return;
      if (state.record.aiState !== nextState) {
        state.record.aiState = nextState;
        state.record.stateEnteredAtMs = nowMs;
        state.record.updatedAtMs = Math.max(state.record.updatedAtMs, nowMs);
      }
    },

    fatigueOf(unitId, nowMs) {
      const state = ensureAndAdvance(unitId, nowMs);
      return state ? Math.floor(state.record.fatigueMilli / 1000) : undefined;
    },

    fatigueMax: maxOf,

    isWorking(unitId, nowMs) {
      const state = ensureAndAdvance(unitId, nowMs);
      return (
        state !== undefined &&
        state.ctx !== undefined &&
        state.record.aiState === "work" &&
        state.ctx.activeWork
      );
    },

    tick(nowMs) {
      const seen = new Set<number>();
      for (const unitId of deps.workerIds()) {
        seen.add(unitId);
        const state = ensureAndAdvance(unitId, nowMs);
        if (!state || !state.ctx) continue;
        const { record, ctx } = state;
        const fatigue = Math.floor(record.fatigueMilli / 1000);
        const life = lifeOf(ctx.discipline);
        let nextState: UnitAiState;
        if (ctx.home) {
          nextState = botActivity(ctx.home, unitId, nowMs, store).state;
        } else {
          // 2차맵이 아직 없거나 미로딩 상태인 일꾼도 restAt/resumeAt 규칙으로 일·쉼을 전이한다
          const mustRest =
            fatigue >= life.restAt ||
            (record.aiState === "rest" && record.fatigueMilli > life.resumeAt * 1000);
          if (mustRest) {
            nextState = "rest";
          } else {
            const isWorkHours = atWork(DEFAULT_WORK_SHIFT, unitId, nowMs);
            nextState = ctx.activeWork && isWorkHours ? "work" : "rest";
          }
        }
        // 배정 시설이 정지·재료부족 등 비가동이면 일 상태를 유지하더라도 피로는 누적하지 않고 회복한다
        if (record.aiState !== nextState) {
          record.aiState = nextState;
          record.stateEnteredAtMs = nowMs;
          record.updatedAtMs = Math.max(record.updatedAtMs, nowMs);
        }
      }
      // 일꾼 목록에서 빠진 기존 추적 유닛(퇴사·사망 등)의 잔여 피로 회복 및 정리
      for (const unitId of records.keys()) {
        if (seen.has(unitId)) continue;
        ensureAndAdvance(unitId, nowMs);
      }
    },

    get size() {
      return records.size;
    },
  };

  return store;
}
