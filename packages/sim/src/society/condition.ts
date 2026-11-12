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
// 바뀜(기획 D-535 1151 나, 2026-11-12): 유닛마다 **선호**(좋아하는 음식 중분류 하나·선호 주거 종류 하나)가 있다(D-150 "유닛마다 선호가 다르다").
// - 선호는 (세계 시드, 유닛 ID)로 정해진다(unitPreferences — NPC 휴먼·사이보그·구인 휴먼 모두 같은 함수, 저장하지 않음 → 다시 켜도 같다).
//   후보: 음식 = 팩 식품 중분류(item_subcategories food: true — 생필품 식량 ration의 요리 dish도 여기 든다), 주거 = 생활 단계 시설(숙소) + 집.
// - 선호 주거 몫: 지금 쉬는 곳이 선호 종류면 +맞음, 아니면 어긋남(음수). 노숙은 늘 어긋남, 모르면 0.
// - 선호 음식 몫: 그 도시 창고에 좋아하는 중분류 물건이 있으면 +맞음, 없으면 어긋남(음수), 모르면 0.
// - 위 둘은 등급 주거 몫·생필품 음식 몫에 더한 뒤 합계를 상한으로 자른다(가득 관리 + 선호 맞음이면 상한에 여유 있게 닿는다).
import { mix32 } from "../math/hash.ts";
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
  /** 지금 쉬는 곳이 선호 주거 종류일 때(D-535 1151 나) */
  readonly preferHousingMatch: number;
  /** 선호 주거 종류가 아닐 때(음수) */
  readonly preferHousingMiss: number;
  /** 도시 창고에 좋아하는 음식 중분류가 있을 때 */
  readonly preferFoodMatch: number;
  /** 없을 때(음수) */
  readonly preferFoodMiss: number;
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
  preferHousingMatch: 5,
  preferHousingMiss: -5,
  preferFoodMatch: 10,
  preferFoodMiss: -10,
};

/** 선호 주거 종류 "집"(숙소 없는 집, D-296). 숙소 종류는 생활 단계 시설 ID */
export const HOME_HOUSING = "home";

/** 유닛의 선호(D-535 1151 나). 후보가 없으면 null */
export interface UnitPreferences {
  /** 좋아하는 음식(식품 중분류 ID) */
  readonly food: string | null;
  /** 선호 주거 종류(생활 단계 시설 ID 또는 HOME_HOUSING) */
  readonly housing: string | null;
}

/** 선호 후보(팩에서 읽은 목록 — 차례는 상관없다, 안에서 ID 차례로 줄 세운다) */
export interface PreferenceChoices {
  readonly foods: readonly string[];
  readonly housings: readonly string[];
}

/** 선호 난수 소금(다른 흐름과 겹치지 않게) */
const PREFERENCE_SALT = 0x0c0d_1151;

/** 후보 목록(겹침 없이 ID 차례) */
function sortedChoices(list: readonly string[]): string[] {
  return [...new Set(list)].toSorted();
}

/**
 * 유닛 하나의 선호: (세계 시드, 유닛 ID)로 정한다. 같은 입력이면 같은 값이라 저장하지 않는다(서버·시뮬이 같다).
 * 후보 목록이 바뀌면(팩에 식품 중분류를 더함) 일부 유닛의 선호가 바뀔 수 있다 [임시]
 */
export function unitPreferences(seed: number, unitId: number, choices: PreferenceChoices): UnitPreferences {
  const foods = sortedChoices(choices.foods);
  const housings = sortedChoices(choices.housings);
  const h = mix32((seed ^ Math.imul(unitId >>> 0, 0x9e37_79b1) ^ PREFERENCE_SALT) >>> 0) >>> 0;
  const g = mix32((h ^ 0x85eb_ca6b) >>> 0) >>> 0;
  return {
    food: foods.length === 0 ? null : (foods[h % foods.length] ?? null),
    housing: housings.length === 0 ? null : (housings[g % housings.length] ?? null),
  };
}

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
  /** 선호(없으면 선호 몫 0) */
  readonly preferences?: UnitPreferences | undefined;
  /** 숙소에서 쉴 때 그 숙소의 시설 ID(모르면 숙소 종류는 모두 같은 것으로 본다) */
  readonly lodgingFacility?: string | undefined;
  /** 그 도시 창고에 좋아하는 음식 중분류 물건이 있나(모르면 null) */
  readonly foodLiked?: boolean | null | undefined;
}

export interface ConditionParts {
  readonly housing: number;
  readonly food: number;
  /** 선호 주거 몫(D-535 1151 나) */
  readonly housingPrefer: number;
  /** 선호 음식 몫 */
  readonly foodPrefer: number;
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

/** 선호 주거 몫: 선호 종류에서 쉬면 +맞음, 아니면 어긋남. 노숙은 늘 어긋남, 쉬는 곳·선호를 모르면 0 */
export function housingPreferencePart(
  housing: ConditionHousing,
  preferred: string | null | undefined,
  lodgingFacility: string | undefined,
  c: ConditionCoefficients,
): number {
  if (preferred === null || preferred === undefined || housing.kind === "unknown") return 0;
  const match =
    housing.kind === "home"
      ? preferred === HOME_HOUSING
      : housing.kind === "lodging"
        ? preferred !== HOME_HOUSING && (lodgingFacility === undefined || preferred === lodgingFacility)
        : false;
  return Math.trunc(match ? c.preferHousingMatch : c.preferHousingMiss);
}

/** 선호 음식 몫: 좋아하는 중분류가 도시 창고에 있으면 +맞음, 없으면 어긋남, 모르면 0 */
export function foodPreferencePart(
  preferred: string | null | undefined,
  liked: boolean | null | undefined,
  c: ConditionCoefficients,
): number {
  if (preferred === null || preferred === undefined || liked === null || liked === undefined) return 0;
  return Math.trunc(liked ? c.preferFoodMatch : c.preferFoodMiss);
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
  const housingPrefer = housingPreferencePart(
    inputs.housing,
    inputs.preferences?.housing,
    inputs.lodgingFacility,
    c,
  );
  const foodPrefer = foodPreferencePart(inputs.preferences?.food, inputs.foodLiked, c);
  const raw = housing + food + housingPrefer + foodPrefer;
  const total = clampCondition(raw, c);
  return {
    housing,
    food,
    housingPrefer,
    foodPrefer,
    total,
    capped: total !== raw,
    preferredGrade,
    housingGrade: inputs.housing.kind === "lodging" ? lodgingHousingGrade(inputs.housing.level) : 0,
  };
}
