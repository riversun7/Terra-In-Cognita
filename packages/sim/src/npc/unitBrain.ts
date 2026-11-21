// 2차맵·일상 유닛 자율행동 5상태 예약 상태기계(FSM) — docs/adr/2026-11-21-npc-needs-drives.md(8상태 → 5상태),
// docs/adr/2026-11-20-npc-autonomous-ai.md 3·4절(매 틱 굴림 금지·최소 체류·기회당 1회).
// 매 틱 확률 굴림 금지: 행동 완료(arrive)·재평가 시각(wake)·위협 사건 때만 1회 점수를 계산한다.
// 상태 = 일(work)·욕구 해결(need)·휴식(rest)·순찰(patrol)·회피(evade). 일의 종류(운반·일터·둘레 채집)는 상태가 아니라 일감(job)이다 —
// 일감은 받은 지시·배정이 정한다(운반 일정 → 일터 → 일터 없는 시민의 둘레 채집).
// 점수는 2차 지수(unitDrives.ts — 근로 의욕·위험 감수·소비 성향)와 욕구(그날 식사 몫·피로)·상황만 읽는다. 7축은 지수를 거쳐서만 든다
// (체류·재평가·순찰 반경 같은 시간·거리 셈은 성향을 바로 읽는다).
// 상태 진입 시 최소 체류 시간([unitDwellMinMs, unitDwellMaxMs]) + 히스테리시스 보너스로 상태 진동(떨림)을 막고,
// 긴급 대피(evade)·배정된 운반은 체류 시간을 뚫고 즉시 전환할 수 있다.
import type { LoyaltyOverrideRules, UnitTraits } from "@terra/shared/unitTraits";
import type { NpcAiCoefficients } from "./aiCoefficients.ts";
import { type UnitDrives, deriveUnitDrives, driveRulesFromAi } from "./unitDrives.ts";

/** 5개 일상 자율행동 상태 */
export const UNIT_AI_STATES = ["work", "need", "rest", "patrol", "evade"] as const;

export type UnitAiState = (typeof UNIT_AI_STATES)[number];

/** 일(work) 상태의 일감: 운반 일정 · 배정된 일터 · 일터 없는 시민의 둘레 채집 */
export const UNIT_JOB_KINDS = ["haul", "post", "forage"] as const;

export type UnitJobKind = (typeof UNIT_JOB_KINDS)[number];

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
  | "driveWorkMoodFloorPm"
  | "driveWorkHungerFloorPm"
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
  /** 도시 내 시장/상업 구역이 있는지(없으면 욕구는 집에서 푼다 — 여가로 시장을 찾지는 않는다) */
  readonly hasMarket: boolean;
  /** 피로도 천분율(0~1000, 높을수록 피곤) */
  readonly fatiguePm: number;
  /** 그날 받은 생필품 몫(‰). null = 모름(가득으로 본다) */
  readonly fedPm: number | null;
  /** 만족도 밀리점(0~100,000). null = 아직 세지 않음 */
  readonly satisfactionMilli: number | null;
  /** 주변 위협(적 유닛 접근·공격 중) */
  readonly threatNear: boolean;
  /** 소속 도시가 전쟁 중인지 */
  readonly cityAtWar: boolean;
  readonly ai: UnitAiTimingRules;
  /** 충성도 개입 곡선(복종도 지수). 없으면 출발값 */
  readonly loyaltyRules?: LoyaltyOverrideRules | undefined;
}

/** 상태별 점수 + 요인 분해(에디터·시험 검증용) */
export interface ExplainedUnitState {
  readonly state: UnitAiState;
  readonly score: number;
  readonly factors: readonly { readonly key: string; readonly delta: number }[];
}

export interface UnitStateDecision {
  readonly state: UnitAiState;
  /** 일 상태일 때의 일감(그 밖의 상태는 null) */
  readonly job: UnitJobKind | null;
  readonly changed: boolean;
  /** 긴급 전환(위협 대피·운반)으로 최소 체류 시간을 조기 해제했는지 */
  readonly interrupted: boolean;
  readonly nextReevalMs: number;
  readonly dwellUntilMs: number;
  readonly drives: UnitDrives;
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

/** 지금 할 수 있는 일감(받은 차례대로: 운반 일정 → 일터 → 일터 없는 시민의 둘레 채집). 없으면 null */
export function unitJobOf(
  ctx: Pick<UnitBrainContext, "role" | "hasHaulJob" | "hasWorkplace">,
): UnitJobKind | null {
  if (ctx.hasHaulJob) return "haul";
  if (ctx.role === "guard" || ctx.role === "leader") return null;
  if (ctx.hasWorkplace) return "post";
  return ctx.role === "citizen" ? "forage" : null;
}

/** 그 입력의 2차 지수 */
export function unitDrivesOf(
  ctx: Pick<UnitBrainContext, "traits" | "satisfactionMilli" | "fedPm" | "loyaltyRules" | "ai">,
): UnitDrives {
  return deriveUnitDrives({
    traits: ctx.traits,
    satisfactionMilli: ctx.satisfactionMilli,
    fedPm: ctx.fedPm,
    loyaltyRules: ctx.loyaltyRules,
    rules: driveRulesFromAi(ctx.ai),
  });
}

/** 5상태 유틸리티 점수 + 요인 분해표(2차 지수·욕구·상황만 읽는다) */
export function scoreUnitStates(
  ctx: UnitBrainContext,
  drives: UnitDrives = unitDrivesOf(ctx),
): ExplainedUnitState[] {
  const fatigue = clampInt(ctx.fatiguePm, 0, 1000);
  const hunger = 1000 - clampInt(ctx.fedPm ?? 1000, 0, 1000);
  const elapsed = Math.max(0, ctx.nowMs - ctx.stateEnteredAtMs);
  const dwellMs = dwellDurationMs(ctx.traits, ctx.role, ctx.ai);
  const inDwell = elapsed < dwellMs;
  const hyst = (state: UnitAiState): number =>
    ctx.currentState === state ? (inDwell ? HYSTERESIS_IN_DWELL : HYSTERESIS_AFTER_DWELL) : 0;

  const build = (
    state: UnitAiState,
    rawFactors: readonly { readonly key: string; readonly delta: number }[],
  ): ExplainedUnitState => {
    const h = hyst(state);
    const factors = rawFactors.filter((f) => f.delta !== 0);
    if (h > 0) factors.push({ key: "hysteresis", delta: h });
    let score = 0;
    for (const f of factors) score += f.delta;
    return { state, score, factors };
  };

  const out: ExplainedUnitState[] = [];

  // 1. 일: 일감에 따라 — 운반 일정은 최우선, 일터는 근무 시간 + 근로 의욕 − 피로, 둘레 채집은 낮 + 근로 의욕·위험 감수 − 피로
  const job = unitJobOf(ctx);
  if (job === "haul") {
    out.push(
      build("work", [
        { key: "haul_assigned", delta: 920 },
        { key: "work_drive", delta: Math.floor(drives.work / 10) },
      ]),
    );
  } else if (job === "post") {
    out.push(
      build("work", [
        { key: ctx.isWorkHours ? "work_hours" : "off_hours", delta: ctx.isWorkHours ? 480 : 80 },
        { key: "work_drive", delta: Math.floor(drives.work / 4) },
        { key: "fatigue", delta: -Math.floor(fatigue / 3) },
      ]),
    );
  } else if (job === "forage") {
    out.push(
      build("work", [
        { key: ctx.isWorkHours ? "day_forage" : "night_forage", delta: ctx.isWorkHours ? 310 : 70 },
        { key: "work_drive", delta: Math.floor(drives.work / 8) },
        { key: "risk", delta: Math.floor(drives.risk / 8) },
        { key: "fatigue", delta: -Math.floor(fatigue / 3) },
      ]),
    );
  }

  // 2. 욕구 해결: 배고픔(그날 식사 몫이 모자란 만큼)이 주, 시장이 있으면 여가로도 찾는다(소비 성향)
  {
    const leisure = ctx.hasMarket ? (ctx.isWorkHours ? 120 : 200) + Math.floor(drives.spend / 6) : 0;
    out.push(
      build("need", [
        { key: "hunger", delta: Math.floor((hunger * 7) / 10) },
        { key: "market_leisure", delta: leisure },
        { key: "fatigue", delta: -Math.floor(fatigue / 5) },
      ]),
    );
  }

  // 3. 휴식: 피로·밤, 근로 의욕이 낮을수록 더 쉰다(태업)
  out.push(
    build("rest", [
      { key: ctx.isWorkHours ? "day_rest" : "night_rest", delta: ctx.isWorkHours ? 110 : 410 },
      { key: "fatigue", delta: Math.floor((fatigue * 6) / 10) },
      { key: "idleness", delta: Math.floor((1000 - drives.work) / 8) },
      { key: "guard_alert", delta: ctx.role === "guard" && ctx.threatNear ? -300 : 0 },
    ]),
  );

  // 4. 순찰: 경비대·지도자의 주 행동, 전쟁 중이면 시민도 보조
  if (ctx.role === "guard" || ctx.role === "leader" || ctx.cityAtWar) {
    out.push(
      build("patrol", [
        { key: "role_patrol", delta: ctx.role === "guard" ? 560 : ctx.role === "leader" ? 420 : 160 },
        { key: "risk_duty", delta: Math.floor((drives.risk + drives.work) / 5) },
        { key: "city_at_war", delta: ctx.cityAtWar ? 180 : 0 },
        { key: "guard_intercept", delta: ctx.threatNear && ctx.role === "guard" ? 260 : 0 },
      ]),
    );
  }

  // 5. 회피·대피: 위협이 있을 때, 위험 감수가 낮을수록 강하게
  if (ctx.threatNear || ctx.cityAtWar) {
    out.push(
      build("evade", [
        { key: ctx.threatNear ? "threat_near" : "city_at_war", delta: ctx.threatNear ? 680 : 120 },
        { key: "caution", delta: Math.floor((1000 - drives.risk) / 2) },
        { key: "role_duty", delta: ctx.role === "guard" ? -380 : ctx.role === "leader" ? -120 : 0 },
      ]),
    );
  }

  return out;
}

/**
 * 유닛 5상태 FSM 전이 판정(결정적 정수 함수).
 * - 최소 체류 시간(dwellMs)이 남아 있으면 긴급 상태(배정된 운반·threatNear evade)가 아닌 한 현재 상태를 유지한다.
 * - 탐색 온도(decisionTempPm > 0)이면 최고점과 temp 이내 후보를 점수 차 비례 가중치로 1회 시드 선택한다.
 */
export function decideUnitState(ctx: UnitBrainContext, roll: number): UnitStateDecision {
  const drives = unitDrivesOf(ctx);
  const scores = scoreUnitStates(ctx, drives);
  const job = unitJobOf(ctx);
  const dwellMs = dwellDurationMs(ctx.traits, ctx.role, ctx.ai);
  const reevalMs = reevalIntervalMs(ctx.traits, roll, ctx.ai);
  const elapsed = Math.max(0, ctx.nowMs - ctx.stateEnteredAtMs);
  const inDwell = elapsed < dwellMs;
  const jobOf = (state: UnitAiState): UnitJobKind | null => (state === "work" ? job : null);

  // 긴급 인터럽트: 배정된 운반 일정 또는 즉시 위협 대피(최고점이 evade)
  const topItem = scores.reduce((best, item) => (item.score > best.score ? item : best), scores[0]!);
  const haulInterrupt = job === "haul" && ctx.currentState !== "work";
  const emergencyInterrupt =
    haulInterrupt || (ctx.threatNear && topItem.state === "evade" && ctx.currentState !== "evade");

  if (inDwell && !emergencyInterrupt) {
    return {
      state: ctx.currentState,
      job: jobOf(ctx.currentState),
      changed: false,
      interrupted: false,
      nextReevalMs: Math.min(reevalMs, Math.max(1_000, dwellMs - elapsed)),
      dwellUntilMs: ctx.stateEnteredAtMs + dwellMs,
      drives,
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
  } else if (haulInterrupt) {
    chosen = "work";
  } else {
    chosen = "evade";
  }

  const changed = chosen !== ctx.currentState;
  return {
    state: chosen,
    job: jobOf(chosen),
    changed,
    interrupted: inDwell && emergencyInterrupt && changed,
    nextReevalMs: reevalMs,
    dwellUntilMs: changed ? ctx.nowMs + dwellMs : ctx.stateEnteredAtMs + dwellMs,
    drives,
    scores,
  };
}

/** 24시간(0~23시) 가상 일과 시뮬레이션(에디터 탭 2 미리보기 · 구독/무관측 기대값 검증 공용) */
export interface HourlyScheduleSlot {
  readonly hour: number;
  readonly state: UnitAiState;
  readonly job: UnitJobKind | null;
  readonly fatiguePm: number;
}

/** [임시] 상태마다 한 시간의 피로 변화(‰): 일·순찰 +65, 회피 +35, 욕구 해결 +10, 휴식 −140 */
const HOURLY_FATIGUE: Readonly<Record<UnitAiState, number>> = {
  work: 65,
  patrol: 65,
  evade: 35,
  need: 10,
  rest: -140,
};

export function simulateDailySchedule(input: {
  readonly traits: UnitTraits;
  readonly role: UnitBrainRole;
  readonly hasWorkplace: boolean;
  readonly hasMarket: boolean;
  readonly workStartHour?: number;
  readonly workEndHour?: number;
  /** 만족도 밀리점(없으면 세지 않음) */
  readonly satisfactionMilli?: number | null;
  /** 그날 식사 몫 ‰(없으면 가득) */
  readonly fedPm?: number | null;
  readonly ai: UnitAiTimingRules;
  readonly loyaltyRules?: LoyaltyOverrideRules | undefined;
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
        fedPm: input.fedPm ?? null,
        satisfactionMilli: input.satisfactionMilli ?? null,
        threatNear: false,
        cityAtWar: false,
        ai: input.ai,
        loyaltyRules: input.loyaltyRules,
      },
      hour * 17,
    );
    if (dec.changed) {
      state = dec.state;
      enteredAtMs = nowMs;
    }
    slots.push({ hour, state, job: dec.job, fatiguePm });
    fatiguePm = clampInt(fatiguePm + HOURLY_FATIGUE[state], 0, 1000);
  }
  return slots;
}
