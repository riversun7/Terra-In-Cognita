// 컨디션(몸 상태, 관리 보너스) — 기획 D-534(사용자 원문 "컨디션 시스템으로 자기에 맞는 거주지, 음식섭취상태 등으로 스탯 +-@ 하면될듯",
// "만족도와 따로 둠", "관리 보너스 합계 상한 있음"), 43 §4·49 N43. docs/adr/2026-11-12-unit-condition.md.
// - 만족도(D-433, 마음 — 반란·태업·충성)와 따로다. 같은 주거·음식이 둘 다에 영향을 줄 수 있다(만족도는 labor.ts satisfactionTarget).
// - 컨디션 = 주거 몫 + 음식 몫, 합계를 ±상한(설정 칸 condition_cap, 출발 40)으로 자른다. 판정은 이 값을 유효 스탯에 더한다(D-502 더하기,
//   @terra/shared/gatherMath gatherStat). 저장하지 않는다 — 지금 주거·음식에서 늘 다시 센다(같은 입력이면 같은 값, 서버 권위).
// - 선호 [임시] 최소 모델(질문 1151~1153): 유닛의 선호 주거 등급 = 초기 스탯 합으로 정한다(D-150 "등급이 높은 유닛일수록 요구하는 주거 등급이
//   높다"). 선호 음식(좋아하는 음식 종류)은 아직 없다 — 음식 몫은 생필품 충족(포만감 = 생필품 충족도, D-438 5)만 본다.
// - 주거 몫: 숙소 등급(숙소 레벨, 1~3으로 묶음 = N24 주거 등급)이 선호 이상이면 +맞음, 한 등급 모자랄 때마다 −걸음. 숙소 없는 집(도시 주거 수 안)은
//   집 값, 노숙(D-296)은 노숙 값. 모르면(플레이어 유닛 숙소 배정 전) 0.
// - 음식 몫: 생필품 충족 ‰가 기준(출발 500) 이상이면 기준 → 1000을 0 → +가득으로, 아래면 0 → 기준을 배고픔 → 0으로 선형. 모르면 0.
// 수치는 모두 [임시](49 N43에 상한 ±40만 있다 → condition_* 칸). 정수만 쓴다.
import type { RestPlace } from "./logistics.ts";

export interface ConditionCoefficients {
  /** 합계 상한(±, D-534 출발 40) */
  readonly cap: number;
  /** 선호 등급 이상 숙소의 주거 몫 */
  readonly housingMatch: number;
  /** 선호보다 한 등급 낮을 때마다 빼는 값 */
  readonly housingShortStep: number;
  /** 숙소 없는 집(도시 주거 수 안)의 주거 몫 */
  readonly housingHome: number;
  /** 노숙의 주거 몫(D-296) */
  readonly housingHomeless: number;
  /** 생필품 충족 1000‰일 때의 음식 몫 */
  readonly foodFull: number;
  /** 생필품 충족 0‰일 때의 음식 몫(음수) */
  readonly foodHungry: number;
  /** 음식 몫이 0인 생필품 충족(‰) */
  readonly foodNeutralPm: number;
  /** 선호 주거 2등급이 되는 초기 스탯 합(이상) */
  readonly preferGrade2From: number;
  /** 선호 주거 3등급이 되는 초기 스탯 합(이상) */
  readonly preferGrade3From: number;
}

/** 출발값([임시], docs/adr/2026-11-12-unit-condition.md): 가득 관리(선호 숙소 + 생필품 가득) = +40 = 상한 */
export const START_CONDITION: ConditionCoefficients = {
  cap: 40,
  housingMatch: 20,
  housingShortStep: 15,
  housingHome: 0,
  housingHomeless: -20,
  foodFull: 20,
  foodHungry: -20,
  foodNeutralPm: 500,
  preferGrade2From: 50,
  preferGrade3From: 70,
};

/** 주거 등급 수(N24 주거 등급 1~3) */
export const CONDITION_HOUSING_GRADES = 3;

/** 컨디션이 보는 쉬는 곳: 숙소·집·노숙(logistics.ts RestPlace) 또는 모름 */
export type ConditionHousing = RestPlace | { readonly kind: "unknown" };

export interface ConditionInputs {
  readonly housing: ConditionHousing;
  /** 생필품 충족(‰, 0~1000). 모르면 null */
  readonly foodPm: number | null;
  /** 그 유닛의 초기 스탯 합(선호 주거 등급) */
  readonly initialSum: number;
}

export interface ConditionParts {
  readonly housing: number;
  readonly food: number;
  /** 합계(±상한으로 자른 값) — 유효 스탯에 더하는 관리 보너스 */
  readonly total: number;
  /** 자르기 전 합이 상한을 넘었나 */
  readonly capped: boolean;
  /** 선호 주거 등급(1~3) */
  readonly preferredGrade: number;
  /** 지금 주거 등급(숙소만 1~3, 그 밖은 0) */
  readonly housingGrade: number;
}

/** 선호 주거 등급(1~3) [임시]: 초기 스탯 합이 2등급·3등급 문턱 이상이면 그 등급 */
export function preferredHousingGrade(initialSum: number, c: ConditionCoefficients): number {
  if (initialSum >= c.preferGrade3From) return 3;
  if (initialSum >= c.preferGrade2From) return 2;
  return 1;
}

/** 숙소 레벨 → 주거 등급(1~3으로 묶음, 레벨 0 아래는 1) */
export function lodgingHousingGrade(level: number): number {
  return Math.max(1, Math.min(CONDITION_HOUSING_GRADES, Math.trunc(level)));
}

/** 주거 몫 */
export function housingConditionPart(
  housing: ConditionHousing,
  preferred: number,
  c: ConditionCoefficients,
): number {
  switch (housing.kind) {
    case "lodging": {
      const short = Math.max(0, preferred - lodgingHousingGrade(housing.level));
      return Math.trunc(c.housingMatch - short * Math.max(0, c.housingShortStep));
    }
    case "home":
      return Math.trunc(c.housingHome);
    case "homeless":
      return Math.trunc(c.housingHomeless);
    default:
      return 0;
  }
}

/** 음식 몫(생필품 충족 ‰ → 선형, 기준에서 0). 모르면 0 */
export function foodConditionPart(foodPm: number | null, c: ConditionCoefficients): number {
  if (foodPm === null) return 0;
  const pm = Math.max(0, Math.min(1000, Math.trunc(foodPm)));
  const neutral = Math.max(0, Math.min(1000, Math.trunc(c.foodNeutralPm)));
  if (pm >= neutral) {
    const span = 1000 - neutral;
    return span <= 0 ? Math.trunc(c.foodFull) : Math.trunc(((pm - neutral) * c.foodFull) / span);
  }
  return neutral <= 0 ? 0 : Math.trunc(((neutral - pm) * c.foodHungry) / neutral);
}

/** 합계를 ±상한으로 자른다 */
export function clampCondition(value: number, c: Pick<ConditionCoefficients, "cap">): number {
  const cap = Math.max(0, Math.trunc(c.cap));
  return Math.max(-cap, Math.min(cap, Math.trunc(value)));
}

/** 유닛 하나의 컨디션(주거 몫·음식 몫·합계) */
export function unitCondition(inputs: ConditionInputs, c: ConditionCoefficients): ConditionParts {
  const preferredGrade = preferredHousingGrade(inputs.initialSum, c);
  const housing = housingConditionPart(inputs.housing, preferredGrade, c);
  const food = foodConditionPart(inputs.foodPm, c);
  const raw = housing + food;
  const total = clampCondition(raw, c);
  return {
    housing,
    food,
    total,
    capped: total !== raw,
    preferredGrade,
    housingGrade: inputs.housing.kind === "lodging" ? lodgingHousingGrade(inputs.housing.level) : 0,
  };
}
