// 노동 공식(피로·급여·생산·만족도) — docs/adr/2026-10-31-faction-society-core.md "노동", 정본 기획 48 §7(D-430~D-433·D-438 5)
// 모양은 48을 따르고 계수는 계수표(coefficients.ts, N21~N33). 출발값이 없는 칸만 [임시]. 정수만 쓴다.
// 만족도는 밀리점(0~100 × 1000), 배율은 ‰.
import { gatherProgress, gatherYield } from "../economy/gather.ts";
import type { JobRules } from "../settle/settle.ts";
import type { SocietyCoefficients } from "./coefficients.ts";

export const SATISFACTION_MAX_MILLI = 100_000;

/** 피로 구간 불이익(N23): 능력(공격·명중·공속, 직무는 작업 속도)·이동 ‰ */
export function fatiguePenalty(
  fatigue: number,
  c: SocietyCoefficients,
): { abilityPm: number; movePm: number } {
  let band = c.fatigueBands[0] ?? { from: 0, abilityPm: 1000, movePm: 1000 };
  for (const entry of c.fatigueBands) if (fatigue >= entry.from) band = entry;
  return { abilityPm: band.abilityPm, movePm: band.movePm };
}

/**
 * 피로 회복 배율(D-430, 48 §7.1) = 주거 등급 배율(N24) × 만족도 배율(N25) × 노숙 배율(S25) × 생활비 미납 배율(N38) (‰).
 * housing: 0 = 주거 없음(노숙, D-296), 1~3 = 주거 등급. livingUnpaid = 유닛 유지비(생활비)를 마지막 경계에 못 냄
 * (D-453·D-455 188: 노숙과 같은 자리, 사이보그 본체 포함)
 */
export function recoveryPm(
  housing: number,
  satisfactionMilli: number,
  c: SocietyCoefficients,
  livingUnpaid = false,
): number {
  const homeless = housing <= 0;
  const grade = Math.min(c.housingRecoveryPm.length - 1, Math.max(1, housing));
  const house = homeless ? 1000 : (c.housingRecoveryPm[grade] ?? 1000);
  const sat = clampSatisfaction(satisfactionMilli);
  const satPm =
    c.lowSatisfactionRecoveryPm +
    Math.floor(((1000 - c.lowSatisfactionRecoveryPm) * sat) / SATISFACTION_MAX_MILLI);
  const homelessPm = homeless ? c.homelessRecoveryPm : 1000;
  const base = Math.floor((Math.floor((house * satPm) / 1000) * homelessPm) / 1000);
  return Math.max(1, livingUnpaid ? Math.floor((base * c.cyborg.livingUnpaidPm) / 1000) : base);
}

/** 회복 배율을 정산 규칙(settle)에 얹는다: 피로 1점 푸는 시간 = 기본(N24 3분) ÷ 배율. 정산 엔진은 그대로다 */
export function rulesWithRecovery(base: JobRules, recovery: number, c: SocietyCoefficients): JobRules {
  return {
    ...base,
    fatigueMax: c.fatigueMax,
    restStepMs: Math.max(1, Math.floor((c.fatigueRecoverStepMs * 1000) / Math.max(1, recovery))),
  };
}

/**
 * 효율점수(D-431, 48 §7.2) = Σ(직무 가중치‰ × 1차 스탯) ÷ 1000 + "생활" 스킬 등급 합 × N31.
 * 직무 가중치는 가중치 표의 직무 행(N1). 포만감 효율 배율(N33)을 곱하고, 생활비를 못 냈으면 N38 배율도 곱한다(D-453·D-455 188)
 */
export function efficiencyScore(
  primaries: readonly number[],
  weightsPm: readonly number[],
  lifeSkillGrades: number,
  food: number,
  c: SocietyCoefficients,
  livingUnpaid = false,
): number {
  let sum = 0;
  for (let i = 0; i < 6; i++) sum += (primaries[i] ?? 0) * (weightsPm[i] ?? 0);
  const raw = Math.max(0, Math.floor(sum / 1000) + lifeSkillGrades * c.lifeSkillBonusPerGrade);
  const fed = Math.floor((raw * foodEfficiencyPm(food, c)) / 1000);
  return livingUnpaid ? Math.floor((fed * c.cyborg.livingUnpaidPm) / 1000) : fed;
}

/** 포만감 효율 배율(N33): 포만감(0~100)이 구간 이하이면 그 ‰ */
export function foodEfficiencyPm(food: number, c: SocietyCoefficients): number {
  for (const band of c.foodEfficiency) if (food <= band.atMost) return band.pm;
  return 1000;
}

/**
 * 도시·직무 기준 단가(D-432, N27): 기준 × (1 + 탄력 × (수요 ÷ 공급 − 1)), [min, max]‰ 안. 효율 1점당 밀리 화폐.
 * 일손이 모자라면(수요 > 공급) 오르고 남으면 내린다. 공급 0이면 상한
 */
export function baseWageRateMilli(demand: number, supply: number, c: SocietyCoefficients): number {
  if (supply <= 0) return Math.floor((c.wageRateMilli * c.wageRateMaxPm) / 1000);
  const ratioPm = Math.floor((Math.max(0, demand) * 1000) / supply);
  const pm = 1000 + Math.trunc(((ratioPm - 1000) * c.wageElasticityPm) / 1000);
  const clamped = Math.max(c.wageRateMinPm, Math.min(c.wageRateMaxPm, pm));
  return Math.floor((c.wageRateMilli * clamped) / 1000);
}

/** 급여(D-431·D-432) = 효율점수 × 단가(밀리) × 고용주 조정(N28 범위 안) ÷ 1000(밀리 → 최소 단위) */
export function wage(
  efficiency: number,
  rateMilli: number,
  employerAdjustPm: number,
  c: SocietyCoefficients,
): number {
  const adjust = Math.max(c.employerAdjustMinPm, Math.min(c.employerAdjustMaxPm, employerAdjustPm));
  return Math.floor((Math.floor((efficiency * rateMilli) / 1000) * adjust) / 1000);
}

/** 같은 도시 같은 직무 상위 몫(N30 25%)의 평균 임금. 비었으면 0 */
export function topShareAverage(wages: readonly number[], c: SocietyCoefficients): number {
  if (wages.length === 0) return 0;
  const sorted = wages.toSorted((a, b) => b - a);
  const n = Math.max(1, Math.floor((sorted.length * c.wageTopSharePm + 999) / 1000));
  let sum = 0;
  for (let i = 0; i < n; i++) sum += sorted[i] ?? 0;
  return Math.floor(sum / n);
}

/**
 * 생산(D-431, N32): 주 스탯 → 틱마다 진행 max(1, ⌊주 ÷ 20⌋), 보조 스탯 → 추가 수확 ⌊보조 × 0.08⌋(기본 비율).
 * 시설마다 다른 비율·상한(옛 gather_type_config, D-507)은 economy/gather.ts gatherYield가 본다
 */
export function production(
  mainStat: number,
  subStat: number,
  c: SocietyCoefficients,
): { progress: number; extra: number } {
  return {
    progress: gatherProgress(mainStat, c.productionMainDivisor),
    extra: gatherYield(subStat, { base: 0, perStatPm: c.productionSubYieldPm }),
  };
}

export interface SatisfactionInputs {
  /** 생필품 충족도(포만감, D-438 5: 0~1000‰) */
  readonly foodPm: number;
  /** 주거 등급(0 = 노숙) */
  readonly housing: number;
  /** 그 유닛 임금과 같은 도시 같은 직무 상위 25% 평균(0이면 임금 요소 없음: 임금을 받지 않는 유닛) */
  readonly wage: number;
  readonly topAverageWage: number;
  /** 임금 틀 안인데 그날 못 받았다(판 70 — 그 도시에 받은 사람이 있을 때 격차 불이익). 없으면 false */
  readonly unpaid?: boolean | undefined;
  readonly faith: boolean;
  /** 그 세력이 전쟁 중 */
  readonly war: boolean;
  readonly injured: boolean;
}

/** 만족도 목표값(D-433·D-438 5, 48 §7.4): 요소마다의 기여 합을 0~100으로 자른다(밀리점) */
export function satisfactionTarget(inputs: SatisfactionInputs, c: SocietyCoefficients): number {
  const t = c.satisfactionTarget;
  let points = t.base;
  points += Math.floor((t.food * Math.max(0, Math.min(1000, inputs.foodPm))) / 1000);
  points +=
    inputs.housing > 0 ? (t.housing[Math.min(t.housing.length - 1, inputs.housing)] ?? 0) : t.homeless;
  if (inputs.wage > 0 && inputs.topAverageWage > 0) {
    const ratioPm = Math.min(1000, Math.floor((inputs.wage * 1000) / inputs.topAverageWage));
    points += Math.floor((t.wage * ratioPm) / 1000);
    if (ratioPm < t.wageGapFloorPm) points += t.wageGap;
  } else if (inputs.unpaid === true && inputs.topAverageWage > 0) points += t.wageGap;
  if (inputs.faith) points += t.faith;
  if (inputs.war) points += t.war;
  if (inputs.injured) points += t.injury;
  return clampSatisfaction(points * 1000);
}

/**
 * 만족도는 목표값으로 천천히 다가간다(누적이되 복원력, D-438 5): 차이 × min(1, 복원 속도 × 지난 날) 만큼.
 * dayPm = 지난 시간(1000 = 하루). 사건(점령·독재 등)은 shiftSatisfaction으로 한 번에 옮긴다
 */
export function satisfactionToward(
  milli: number,
  targetMilli: number,
  dayPm: number,
  c: SocietyCoefficients,
): number {
  const step = Math.min(1000, Math.floor((c.satisfactionRestorePmPerDay * Math.max(0, dayPm)) / 1000));
  return clampSatisfaction(milli + Math.trunc(((targetMilli - milli) * step) / 1000));
}

export function clampSatisfaction(milli: number): number {
  return Math.max(0, Math.min(SATISFACTION_MAX_MILLI, milli));
}

/** 사건 한 번의 만족도 변화(점 → 밀리점) */
export function shiftSatisfaction(milli: number, points: number): number {
  return clampSatisfaction(milli + points * 1000);
}
