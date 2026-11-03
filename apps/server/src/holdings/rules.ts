// 보유 물건 규칙 값(설정 칸 실효 값) — docs/adr/2026-11-03-item-holdings.md 3절.
// 닳기(D-496 289, 49 N49·C20)·수리 최대 내구도 감소·파괴 문턱(F11·F12)은 세력·사회 계수표 durability 칸(@terra/sim TUNING_KEYS,
// 반영 범위는 tuning/scope.ts), 소모품 효과량 상한은 N10 실효 값(= 전투 계수표 appropriateCapPm), 오차는 d496_use_variance(아이템 편집기
// 미리 보기와 같은 칸). 부를 때마다 읽는다(개발자 패널 덮어쓰기가 바로 든다).
import type { SocietyCoefficients, WearRules } from "@terra/sim";
import { TEST_COMBAT_COEFFICIENTS, TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";

export interface HoldingRules {
  /** 소모품 효과량 비율 상한(‰, 무기 효율과 같은 N10) */
  readonly appropriateCapPm: number;
  /** 줄에 오차가 없을 때의 ±오차(‰, d496_use_variance) */
  readonly useVariancePm: number;
  /** 수리(F11·F12)·전투 닳기(N49)·탄약 보충 감소(D-509) */
  readonly durability: SocietyCoefficients["durability"];
  /** 물약 쿨(D-509) */
  readonly consumables: SocietyCoefficients["consumables"];
}

export const USE_VARIANCE_CELL = "d496_use_variance";
/** d496_use_variance 팩 출발값(D-501 기본 ±50%) */
const DEFAULT_USE_VARIANCE_PM = 500;

/** 팩이 없을 때(시험): 시험 계수표(팩 tuning과 같은 값, sim 시험이 맞춰 본다) */
export const TEST_HOLDING_RULES: HoldingRules = {
  appropriateCapPm: TEST_COMBAT_COEFFICIENTS.appropriateCapPm,
  useVariancePm: DEFAULT_USE_VARIANCE_PM,
  durability: TEST_SOCIETY_COEFFICIENTS.durability,
  consumables: TEST_SOCIETY_COEFFICIENTS.consumables,
};

/** 계수표 durability 칸 → 전투 닳기 규칙 */
export function wearRulesOf(durability: SocietyCoefficients["durability"]): WearRules {
  return {
    chancePm: durability.wearChancePm,
    amount: durability.wearAmount,
    lossChancePm: durability.wearLossChancePm,
    lossAmount: durability.wearLossAmount,
  };
}

/** 설정 칸 실효 값 + 전투 상한 + 계수표(durability·consumables)로 규칙을 만든다 */
export function holdingRulesFrom(
  values: ReadonlyMap<string, number>,
  appropriateCapPm: number,
  society: Pick<SocietyCoefficients, "durability" | "consumables">,
): HoldingRules {
  return {
    appropriateCapPm,
    useVariancePm: values.get(USE_VARIANCE_CELL) ?? DEFAULT_USE_VARIANCE_PM,
    durability: society.durability,
    consumables: society.consumables,
  };
}
