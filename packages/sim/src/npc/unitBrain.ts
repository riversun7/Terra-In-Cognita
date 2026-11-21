// 2차맵·일상 유닛 자율행동 8상태 예약 상태기계(FSM) — docs/adr/2026-11-20-npc-autonomous-ai.md 3·4절
// 매 틱 확률 굴림 금지: 행동 완료(arrive)·재평가 시각(wake)·위협 사건 때만 1회 점수를 계산한다.
// 상태 진입 시 최소 체류 시간([unitDwellMinMs, unitDwellMaxMs]) + 히스테리시스 보너스로 상태 진동(떨림)을 막고,
// 긴급 대피(evade)·할당된 운반(haul)은 체류 시간을 뚫고 즉시 전환할 수 있다.
import type { UnitTraits } from "@terra/shared/unitTraits";
import type { NpcAiCoefficients } from "./aiCoefficients.ts";

/** 8개 일상 자율행동 상태 */
export const UNIT_AI_STATES = [
  "work",
  "gather",
  "haul",
  "rest",
  "consume",
  "patrol",
  "evade",
  "travel",
] as const;

export type UnitAiState = (typeof UNIT_AI_STATES)[number];

/** 2차맵 유닛 자율행동 직군 */
export type UnitBrainRole = "citizen" | "worker" | "guard" | "leader";

/** 유닛 FSM이 읽는 AI 계수 부분집합 */
export type UnitAiTimingRules = Pick<
  NpcAiCoefficients,
  | "unitReevalMinMs"
  | "unitReevalMaxMs"
  | "unitDwellMinMs"
  | "unitDwellMaxMs"
  | "guardPatrolMinCells"
  | "guardPatrolMaxCells"
  | "leaderRoamRadiusCells"
  | "decisionTempPm"
>;

/** 상태 평가 입력(순수 값, 시계·외부 상태 참조 없음) */
export interface UnitBrainContext {
  readonly unitId: number;
  readonly role: UnitBrainRole;
  readonly traits: UnitTraits;
  readonly currentState: UnitAiState;
  readonly stateEnteredAtMs: number;
  readonly nowMs: number;
  /** 지역 시각 기준 근무 시간대 여부 */
  readonly isWorkHours: boolean;
  /** 배정된 시설 일터가 있는지 */
  readonly hasWorkplace: boolean;
  /** 현재 활성 운반 일정이 있는지 */
  readonly hasHaulJob: boolean;
  /** 도시 내 시장/상업 구역이 있는지 */
  readonly hasMarket: boolean;
  /** 피로도 천분율(0~1000, 높을수록 피곤) */
  readonly fatiguePm: number;
  /** 주변 위협(적 유닛 접근·공격 중) */
  readonly threatNear: boolean;
  /** 소속 도시가 전쟁 중인지 */
  readonly cityAtWar: boolean;
  readonly ai: UnitAiTimingRules;
}

/** 상태별 점수 + 요인 분해(에디터·시험 검증용) */
export interface ExplainedUnitState {
  readonly state: UnitAiState;
  readonly score: number;
  readonly factors: readonly { readonly key: string; readonly delta: number }[];
}

export interface UnitStateDecision {
  readonly state: UnitAiState;
  readonly changed: boolean;
  /** 긴급 전환(위협 대피·운반)으로 최소 체류 시간을 조기 해제했는지 */
  readonly interrupted: boolean;
  readonly nextReevalMs: number;
  readonly dwellUntilMs: number;
  readonly scores: readonly ExplainedUnitState[];
}

const HYSTERESIS_IN_DWELL = 140;
const HYSTERESIS_AFTER_DWELL = 60;

const clampInt = (v: number, lo: number, hi: number): number => {
  const n = Math.trunc(v);
  return n < lo ? lo : n > hi ? hi : n;
};

/**
 * 최소 체류 시간(ms): 규율성(discipline)이 높을수록 하던 일을 오래 유지하고,
 * 자유·즉흥적일수록 [unitDwellMinMs, unitDwellMaxMs] 안의 짧은 쪽에 가까워진다.
 */
export function dwellDurationMs(
  traits: UnitTraits,
  role: UnitBrainRole,
  ai: Pick<NpcAiCoefficients, "unitDwellMinMs" | "unitDwellMaxMs">,
): number {
  const lo = Math.max(1_000, Math.min(ai.unitDwellMinMs, ai.unitDwellMaxMs));
  const hi = Math.max(lo, Math.max(ai.unitDwellMinMs, ai.unitDwellMaxMs));
  // 규율성 70% + (1000 - 과감성) 30%로 안정도 산출, 경비대·지도자는 +100 가산
  const bonus = role === "guard" || role === "leader" ? 100 : 0;
  const stability = clampInt(
    Math.floor((traits.discipline * 7 + (1000 - traits.boldness) * 3) / 10) + bonus,
    0,
    1000,
  );
  return lo + Math.floor(((hi - lo) * stability) / 1000);
}

/**
 * 다음 재평가 주기(ms): [unitReevalMinMs, unitReevalMaxMs] 안에서
 * 시드 굴림(roll) + 규율성(높을수록 느긋하게 유지)을 반영한 결정적 간격.
 */
export function reevalIntervalMs(
  traits: UnitTraits,
  roll: number,
  ai: Pick<NpcAiCoefficients, "unitReevalMinMs" | "unitReevalMaxMs">,
): number {
  const lo = Math.max(1_000, Math.min(ai.unitReevalMinMs, ai.unitReevalMaxMs));
  const hi = Math.max(lo, Math.max(ai.unitReevalMinMs, ai.unitReevalMaxMs));
  const span = hi - lo;
  if (span <= 0) return lo;
  // 50%는 규율성 기반, 50%는 시드 흩기(동시 경로 요청 방지)
  const traitPart = Math.floor((span * traits.discipline) / 2000);
  const jitterSpan = Math.max(1, span - traitPart + 1);
  const jitterPart = Math.abs(Math.trunc(roll)) % jitterSpan;
  return clampInt(lo + traitPart + jitterPart, lo, hi);
}

/**
 * 경비대 순찰 반경(칸): [guardPatrolMinCells, guardPatrolMaxCells] 안에서
 * 과감성(boldness 60%) + 개방성(openness 40%)으로 결정.
 */
export function guardPatrolRadiusCells(
  traits: UnitTraits,
  ai: Pick<NpcAiCoefficients, "guardPatrolMinCells" | "guardPatrolMaxCells">,
): number {
  const lo = Math.max(1, Math.min(ai.guardPatrolMinCells, ai.guardPatrolMaxCells));
  const hi = Math.max(lo, Math.max(ai.guardPatrolMinCells, ai.guardPatrolMaxCells));
  const reach = clampInt(Math.floor((traits.boldness * 6 + traits.openness * 4) / 10), 0, 1000);
  return lo + Math.floor(((hi - lo) * reach + 500) / 1000);
}

/** 8상태 유틸리티 점수 + 요인 분해표 */
export function scoreUnitStates(ctx: UnitBrainContext): ExplainedUnitState[] {
  const t = ctx.traits;
  const fatigue = clampInt(ctx.fatiguePm, 0, 1000);
  const elapsed = Math.max(0, ctx.nowMs - ctx.stateEnteredAtMs);
  const dwellMs = dwellDurationMs(t, ctx.role, ctx.ai);
  const inDwell = elapsed < dwellMs;
  const hyst = (state: UnitAiState): number =>
    ctx.currentState === state ? (inDwell ? HYSTERESIS_IN_DWELL : HYSTERESIS_AFTER_DWELL) : 0;

  const build = (
    state: UnitAiState,
    rawFactors: readonly { readonly key: string; readonly delta: number }[],
  ): ExplainedUnitState => {
    const h = hyst(state);
    const factors = h > 0 ? [...rawFactors, { key: "hysteresis", delta: h }] : [...rawFactors];
    let score = 0;
    for (const f of factors) score += f.delta;
    return { state, score, factors };
  };

  const out: ExplainedUnitState[] = [];

  // 1. haul(운반): 배정된 운반 일정이 활성화 중이면 최우선
  if (ctx.hasHaulJob) {
    out.push(
      build("haul", [
        { key: "haul_assigned", delta: 920 },
        { key: "discipline", delta: Math.floor(t.discipline / 10) },
      ]),
    );
  }

  // 2. evade(회피·대피): 위협 감지 시 과감성·호전성이 낮을수록 강하게 대피
  if (ctx.threatNear || ctx.cityAtWar) {
    const threatBase = ctx.threatNear ? 680 : 120;
    const caution = Math.floor(((1000 - t.boldness) * 3 + (1000 - t.belligerence) * 2) / 10);
    const rolePenalty = ctx.role === "guard" ? -380 : ctx.role === "leader" ? -120 : 0;
    out.push(
      build("evade", [
        { key: ctx.threatNear ? "threat_near" : "city_at_war", delta: threatBase },
        { key: "caution", delta: caution },
        ...(rolePenalty !== 0 ? [{ key: "role_duty", delta: rolePenalty }] : []),
      ]),
    );
  }

  // 3. work(근무): 일터가 있는 일꾼의 주 행동(근무 시간 + 규율성 − 피로)
  if (ctx.hasWorkplace && ctx.role !== "guard" && ctx.role !== "leader") {
    const shiftScore = ctx.isWorkHours ? 480 : 80;
    const discScore = Math.floor(t.discipline / 4);
    const fatiguePen = -Math.floor(fatigue / 3);
    out.push(
      build("work", [
        { key: ctx.isWorkHours ? "work_hours" : "off_hours", delta: shiftScore },
        { key: "discipline", delta: discScore },
        ...(fatiguePen !== 0 ? [{ key: "fatigue", delta: fatiguePen }] : []),
      ]),
    );
  }

  // 4. patrol(순찰): 경비대·지도자 주 행동 + 호전성·규율성 높은 시민 보조
  if (ctx.role === "guard" || ctx.role === "leader" || ctx.cityAtWar) {
    const roleBase = ctx.role === "guard" ? 560 : ctx.role === "leader" ? 420 : 160;
    const combatTilt = Math.floor((t.belligerence * 2 + t.discipline * 2) / 10);
    const warBonus = ctx.cityAtWar ? 180 : 0;
    const threatBonus = ctx.threatNear && ctx.role === "guard" ? 260 : 0;
    out.push(
      build("patrol", [
        { key: "role_patrol", delta: roleBase },
        { key: "combat_discipline", delta: combatTilt },
        ...(warBonus > 0 ? [{ key: "city_at_war", delta: warBonus }] : []),
        ...(threatBonus > 0 ? [{ key: "guard_intercept", delta: threatBonus }] : []),
      ]),
    );
  }

  // 5. rest(휴식): 피로도·야간·낮은 과감성에 비례
  {
    const nightBonus = ctx.isWorkHours ? 110 : 410;
    const fatigueScore = Math.floor((fatigue * 6) / 10);
    const calmScore = Math.floor((1000 - t.boldness) / 10);
    const guardShiftPen = ctx.role === "guard" && ctx.threatNear ? -300 : 0;
    out.push(
      build("rest", [
        { key: ctx.isWorkHours ? "day_rest" : "night_rest", delta: nightBonus },
        { key: "fatigue", delta: fatigueScore },
        { key: "calm", delta: calmScore },
        ...(guardShiftPen !== 0 ? [{ key: "guard_alert", delta: guardShiftPen }] : []),
      ]),
    );
  }

  // 6. consume(소비·시장 교류): 시장이 있고 여유 시간일 때 이윤욕·개방성·공동체 반영
  if (ctx.hasMarket) {
    const marketBase = ctx.isWorkHours ? 220 : 280;
    const social = Math.floor((t.greed * 2 + t.openness * 2 + t.communalism) / 15);
    const fatiguePen = -Math.floor(fatigue / 5);
    out.push(
      build("consume", [
        { key: "market_visit", delta: marketBase },
        { key: "greed_openness", delta: social },
        ...(fatiguePen !== 0 ? [{ key: "fatigue", delta: fatiguePen }] : []),
      ]),
    );
  }

  // 7. gather(현장 채집·자율 활동): 일터 없는 시민이나 자유도 높은 유닛의 야외 활동
  if (ctx.role === "citizen" || !ctx.hasWorkplace) {
    const dayBonus = ctx.isWorkHours ? 310 : 70;
    const drive = Math.floor((t.greed * 2 + t.boldness * 2 + t.autonomy) / 15);
    const fatiguePen = -Math.floor(fatigue / 3);
    out.push(
      build("gather", [
        { key: ctx.isWorkHours ? "day_gather" : "night_gather", delta: dayBonus },
        { key: "autonomy_boldness", delta: drive },
        ...(fatiguePen !== 0 ? [{ key: "fatigue", delta: fatiguePen }] : []),
      ]),
    );
  }

  // 8. travel(외출·교류 이동): 개방성·자치성·과감성이 높은 유닛의 원거리 이동/시찰
  {
    const base = ctx.role === "leader" ? 240 : 140;
    const wander = Math.floor((t.openness * 3 + t.autonomy * 2 + t.boldness * 2) / 20);
    const fatiguePen = -Math.floor(fatigue / 3);
    const nightPen = ctx.isWorkHours ? 0 : -140;
    out.push(
      build("travel", [
        { key: "roam_base", delta: base },
        { key: "openness_autonomy", delta: wander },
        ...(fatiguePen !== 0 ? [{ key: "fatigue", delta: fatiguePen }] : []),
        ...(nightPen !== 0 ? [{ key: "night_penalty", delta: nightPen }] : []),
      ]),
    );
  }

  return out;
}

/**
 * 유닛 8상태 FSM 전이 판정(결정적 정수 함수).
 * - 최소 체류 시간(dwellMs)이 남아 있으면 긴급 상태(haul·threatNear evade)가 아닌 한 현재 상태를 유지한다.
 * - 탐색 온도(decisionTempPm > 0)이면 최고점과 temp 이내 후보를 점수 차 비례 가중치로 1회 시드 선택한다.
 */
export function decideUnitState(ctx: UnitBrainContext, roll: number): UnitStateDecision {
  const scores = scoreUnitStates(ctx);
  const dwellMs = dwellDurationMs(ctx.traits, ctx.role, ctx.ai);
  const reevalMs = reevalIntervalMs(ctx.traits, roll, ctx.ai);
  const elapsed = Math.max(0, ctx.nowMs - ctx.stateEnteredAtMs);
  const inDwell = elapsed < dwellMs;

  // 긴급 인터럽트: 활성 운반 일정 또는 즉시 위협 대피(최고점이 evade)
  const topItem = scores.reduce((best, item) => (item.score > best.score ? item : best), scores[0]!);
  const emergencyInterrupt =
    (ctx.hasHaulJob && ctx.currentState !== "haul") ||
    (ctx.threatNear && topItem.state === "evade" && ctx.currentState !== "evade");

  if (inDwell && !emergencyInterrupt) {
    return {
      state: ctx.currentState,
      changed: false,
      interrupted: false,
      nextReevalMs: Math.min(reevalMs, Math.max(1_000, dwellMs - elapsed)),
      dwellUntilMs: ctx.stateEnteredAtMs + dwellMs,
      scores,
    };
  }

  let chosen: UnitAiState = topItem.state;
  if (!emergencyInterrupt) {
    const temp = Math.max(0, Math.trunc(ctx.ai.decisionTempPm));
    if (temp === 0) {
      const ties = scores.filter((s) => s.score === topItem.score);
      chosen = ties[Math.abs(Math.trunc(roll)) % Math.max(1, ties.length)]?.state ?? topItem.state;
    } else {
      const band = scores
        .filter((s) => topItem.score - s.score <= temp)
        .map((s) => ({ state: s.state, weight: Math.max(1, temp - (topItem.score - s.score) + 1) }));
      const total = band.reduce((sum, item) => sum + item.weight, 0);
      let left = Math.abs(Math.trunc(roll)) % Math.max(1, total);
      for (const item of band) {
        if (left < item.weight) {
          chosen = item.state;
          break;
        }
        left -= item.weight;
      }
    }
  } else if (ctx.hasHaulJob) {
    chosen = "haul";
  } else {
    chosen = "evade";
  }

  const changed = chosen !== ctx.currentState;
  return {
    state: chosen,
    changed,
    interrupted: inDwell && emergencyInterrupt && changed,
    nextReevalMs: reevalMs,
    dwellUntilMs: changed ? ctx.nowMs + dwellMs : ctx.stateEnteredAtMs + dwellMs,
    scores,
  };
}

/** 24시간(0~23시) 가상 일과 시뮬레이션(에디터 탭 2 미리보기 · 구독/무관측 기대값 검증 공용) */
export interface HourlyScheduleSlot {
  readonly hour: number;
  readonly state: UnitAiState;
  readonly fatiguePm: number;
}

export function simulateDailySchedule(input: {
  readonly traits: UnitTraits;
  readonly role: UnitBrainRole;
  readonly hasWorkplace: boolean;
  readonly hasMarket: boolean;
  readonly workStartHour?: number;
  readonly workEndHour?: number;
  readonly ai: UnitAiTimingRules;
}): HourlyScheduleSlot[] {
  const workStart = input.workStartHour ?? 6;
  const workEnd = input.workEndHour ?? 18;
  const slots: HourlyScheduleSlot[] = [];
  let state: UnitAiState = "rest";
  let enteredAtMs = 0;
  let fatiguePm = 150;
  for (let hour = 0; hour < 24; hour += 1) {
    const nowMs = hour * 3_600_000;
    const isWorkHours =
      workStart < workEnd ? hour >= workStart && hour < workEnd : hour >= workStart || hour < workEnd;
    const dec = decideUnitState(
      {
        unitId: 1,
        role: input.role,
        traits: input.traits,
        currentState: state,
        stateEnteredAtMs: enteredAtMs,
        nowMs,
        isWorkHours,
        hasWorkplace: input.hasWorkplace,
        hasHaulJob: false,
        hasMarket: input.hasMarket,
        fatiguePm,
        threatNear: false,
        cityAtWar: false,
        ai: input.ai,
      },
      hour * 17,
    );
    if (dec.changed) {
      state = dec.state;
      enteredAtMs = nowMs;
    }
    slots.push({ hour, state, fatiguePm });
    // 시간당 피로 변화(근무·채집·순찰 +65, 이동 +35, 소비 +10, 휴식 −140)
    const delta =
      state === "work" || state === "gather" || state === "patrol"
        ? 65
        : state === "travel"
          ? 35
          : state === "consume"
            ? 10
            : -140;
    fatiguePm = clampInt(fatiguePm + delta, 0, 1000);
  }
  return slots;
}
