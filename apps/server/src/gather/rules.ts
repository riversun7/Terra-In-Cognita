// 원자재 오브젝트 채집 셈(순수) — docs/adr/2026-11-07-gather-objects.md 3절. 사용자 답(2026-11-07)과 옛 1차 생산 규칙(D-507, 49 N32)을 잇는다.
// - 걸리는 시간 = ⌈오브젝트 일(workMs) ÷ 진행 속도⌉, 진행 속도 = max(1, ⌊주 스탯 ÷ N32⌋)(@terra/sim gatherProgress — 시설 채집과 같은 함수).
// - 수확(‰ 묶음) = 묶음 수 × 수확량(min(상한, 기본 + ⌊보조 스탯 × 비율⌋), @terra/sim gatherYield) × 효율(‰).
//   효율: 벌목장·광산 반경 안(그 시설에 넣음) = 1000 + (레벨 − 1) × 레벨당 더함, 직접 채집(창고·도시 창고로 나름) = 직접 배율(기본 500‰).
//   ‰ 나머지는 채집 줄이 들고 다음 번에 더한다(작은 효율에도 0이 되지 않게).
// - 피로(‰ 점) = 한 번의 피로 × 1000 × (시설 반경 안이면 시설 피로 배율 ÷ 1000). 나머지는 같은 방식.
// - 다시 자라는 시간 = 오브젝트 값 × (1000 + ⌊오염 × 오염 더함 ÷ 100,000⌋) ÷ 1000 × (일하는 시설 반경 안이면 시설 배율 ÷ 1000)(D-112·D-115).
// - 채집소 레벨 버프(사용자 지적 2026-11-08 "원자재채집소의 기능도 필요", ADR "바뀜 (2026-11-08 …)"): 반경 = 기본 + (레벨 − 1) × 걸음, 수확 = 위 효율,
//   피로·다시 자람 배율 = 기본 − (레벨 − 1) × 걸음(하한 stationFloorPm, 기본이 하한보다 작으면 기본). 모두 [임시] 설정 칸.
// 정수 연산만 쓴다(판정 코드 규칙).
import type { SocietyCoefficients } from "@terra/sim";
import { gatherProgress, gatherYield } from "@terra/sim";
import type { GatherKind } from "./kinds.ts";

/** 오염 값 상한(planet_pollution value 1 ~ 100,000) */
export const POLLUTION_MAX = 100_000;

export type GatherRules = SocietyCoefficients["gatherObjects"];

/** 시설 수확량 규칙(팩 facilities gather). 시설이 없는 종류는 기본(1 + 보조 × N32 비율, 상한 10) */
export interface YieldRule {
  readonly yieldBase?: number | undefined;
  readonly yieldPerStatPm?: number | undefined;
  readonly yieldCap?: number | undefined;
}

/** 시설 없는 종류의 수확량 상한(옛 gather_type_config 광산·벌목장 상한과 같은 10) */
const DEFAULT_YIELD_CAP = 10;

/**
 * 채집 한 번에 걸리는 시간(ms). abilityPm = 피로 구간의 능력 ‰(N23 작업 속도 불이익 — @terra/sim fatiguePenalty, 사용자 결정 2026-11-26):
 * 시간 = 기본 × 1000 ÷ 능력 ‰(올림). 없거나 1000 이상이면 기본 그대로
 */
export function gatherDurationMs(
  kind: Pick<GatherKind, "workMs">,
  primary: number,
  divisor: number,
  abilityPm = 1000,
): number {
  const base = Math.ceil(kind.workMs / gatherProgress(primary, divisor));
  return abilityPm >= 1000 ? base : Math.ceil((base * 1000) / Math.max(1, abilityPm));
}

/** 채집 효율(‰): 시설 반경 안이면 시설 레벨로, 아니면 직접 배율 */
export function gatherEfficiencyPm(rules: GatherRules, campLevel: number | null): number {
  if (campLevel === null) return Math.max(0, rules.directYieldPm);
  return 1000 + Math.max(0, campLevel - 1) * Math.max(0, rules.campLevelPm);
}

/** 채집 한 번의 수확(‰ 묶음) */
export function gatherYieldPm(
  kind: Pick<GatherKind, "lots">,
  secondary: number,
  rule: YieldRule | undefined,
  subYieldPm: number,
  efficiencyPm: number,
): number {
  const perLot = gatherYield(secondary, {
    base: rule?.yieldBase ?? 1,
    perStatPm: rule?.yieldPerStatPm ?? subYieldPm,
    cap: rule?.yieldCap ?? DEFAULT_YIELD_CAP,
  });
  return kind.lots * perLot * Math.max(0, efficiencyPm);
}

/** ‰ 단위 몫을 나머지와 더해 정수 몫과 새 나머지로 나눈다 */
export function splitPm(amountPm: number, carryPm: number): { whole: number; carryPm: number } {
  const total = Math.max(0, amountPm) + Math.max(0, carryPm);
  return { whole: Math.floor(total / 1000), carryPm: total % 1000 };
}

/** 채집소(벌목장·광산) 레벨 하나의 버프 — 반경(배치 칸)·수확·피로·다시 자람 배율(‰, 1000 = 그대로) */
export interface StationBuffs {
  readonly radiusCells: number;
  readonly yieldPm: number;
  readonly fatiguePm: number;
  readonly regrowPm: number;
}

/** 기본 배율에서 레벨마다 걸음만큼 줄인다(하한 floor, 기본이 하한보다 작으면 기본) */
function cutByLevel(basePm: number, steps: number, stepPm: number, floorPm: number): number {
  const base = Math.max(0, basePm);
  return Math.max(Math.min(base, floorPm), base - steps * Math.max(0, stepPm));
}

export function stationBuffs(rules: GatherRules, level: number): StationBuffs {
  const steps = Math.max(0, Math.floor(level) - 1);
  const floor = Math.min(1000, Math.max(1, rules.stationFloorPm));
  return {
    radiusCells: Math.max(0, rules.campRadiusCells) + steps * Math.max(0, rules.stationRadiusStep),
    yieldPm: gatherEfficiencyPm(rules, Math.max(1, Math.floor(level))),
    fatiguePm: cutByLevel(rules.campFatiguePm, steps, rules.stationFatigueStepPm, floor),
    regrowPm: Math.max(1, cutByLevel(rules.campRegrowPm, steps, rules.stationRegrowStepPm, floor)),
  };
}

/** 채집 한 번의 피로(‰ 점). campLevel = 반경 안 내 채집소 레벨(밖이면 null) */
export function gatherFatiguePm(rules: GatherRules, campLevel: number | null): number {
  const per = Math.max(0, rules.fatiguePerGather) * 1000;
  return campLevel === null ? per : Math.floor((per * stationBuffs(rules, campLevel).fatiguePm) / 1000);
}

/** 떨어진 오브젝트가 다시 자라기까지(ms). campLevel = 반경 안 일하는 채집소(주인 상관없음) 레벨(밖이면 null) */
export function regrowMs(
  kind: Pick<GatherKind, "regrowMs">,
  rules: GatherRules,
  pollution: number,
  campLevel: number | null,
): number {
  const dirty = Math.min(POLLUTION_MAX, Math.max(0, pollution));
  const pollutionPm = 1000 + Math.floor((dirty * Math.max(0, rules.pollutionRegrowPm)) / POLLUTION_MAX);
  const base = Math.floor((kind.regrowMs * pollutionPm) / 1000);
  return campLevel === null
    ? base
    : Math.max(1, Math.floor((base * stationBuffs(rules, campLevel).regrowPm) / 1000));
}

/** 배치 칸 두 점의 거리 제곱 */
export const cellDistance2 = (ax: number, ay: number, bx: number, by: number): number =>
  (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
