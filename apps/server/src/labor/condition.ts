// 유닛 컨디션(서버) — 기획 D-534·D-535, docs/adr/2026-11-12-unit-condition.md. 판정은 시뮬과 같은 @terra/sim unitCondition이다.
// 서버가 아는 입력만 모아 넘긴다(저장하지 않는다 — 부를 때마다 지금 값으로 센다, 같은 입력이면 같은 값):
// - 초기 스탯 합: 만든 사이보그면 저장한 처음 값의 합, 그 밖의 유닛은 [임시] 기본 몸(1차 모두 10 = 60, roster unitBody와 같은 바탕).
// - 주거(D-535 1152 나): 그 유닛이 실제로 쉬는 곳 — 물류 줄기의 플레이어 일꾼 쉼터 배정(labor/workerRest.ts restOf, NPC 일꾼과 같은 숙소 규칙
//   D-013: 남은 침대가 있는 숙소, 없으면 집). 일꾼이 아니거나 숙소 회복이 꺼졌거나 다른 도시에서 쉬면 "모름"(주거 몫 0).
//   옛 [임시] "주인이 그 도시에 가진 가장 좋은 숙소"는 버렸다.
// - 음식: 그 도시의 지난 하루 끝 생필품 충족 ‰(npc/cityDayStore.ts, world_cities.necessities_pm). 값이 없으면 "모름"(음식 몫 0).
// - 선호(D-535 1151 나): (세계 시드, 유닛 ID)로 정한 좋아하는 음식 중분류·선호 주거 종류(@terra/sim unitPreferences — 저장하지 않음).
//   좋아하는 음식 몫은 그 도시 창고(모든 주인)에 그 중분류 물건이 있는지로 본다.
// - 도시: 채집 정산은 그 채집 시설이 선 도시, 유닛 화면은 일하는 채집 시설의 도시(없으면 지금 2차맵의 도시).
import {
  type ConditionHousing,
  type ConditionParts,
  type SocietyCoefficients,
  type UnitPreferences,
  unitCondition,
} from "@terra/sim";
import type { LocalizedName } from "@terra/shared/roster";

/** 유닛이 그 도시에서 쉬는 곳(숙소면 그 시설 ID) */
export interface ConditionRest {
  readonly housing: ConditionHousing;
  /** 숙소 시설 ID(집·노숙이면 없음) */
  readonly lodgingFacility?: string | undefined;
}

export interface ConditionSource {
  /** 그 유닛의 초기 스탯 합 */
  initialSum(unitId: number): number;
  /** 그 유닛이 그 도시에서 쉬는 곳(쉼터 배정, 모르면 undefined) */
  rest(unitId: number, cityId: number): ConditionRest | undefined;
  /** 그 도시의 생필품 충족 ‰(없으면 undefined) */
  necessitiesPm(cityId: number): number | undefined;
  /** 그 유닛의 선호(후보가 없으면 undefined) */
  preferences?(unitId: number): UnitPreferences | undefined;
  /** 그 도시 창고에 그 식품 중분류 물건이 있나(모르면 undefined) */
  foodInCity?(cityId: number, subcategory: string): boolean | undefined;
}

/** 화면이 쓰는 컨디션(판정 몫 + 선호와 그 이름) */
export interface WorkerConditionView extends ConditionParts {
  readonly preferences: UnitPreferences;
  /** 좋아하는 음식 중분류 이름(모르면 undefined) */
  readonly favoriteFoodName?: LocalizedName | undefined;
  /** 선호 주거 종류 이름(모르면 undefined) */
  readonly preferredHousingName?: LocalizedName | undefined;
}

const NO_PREFERENCES: UnitPreferences = { food: null, housing: null };

/** 도시 하나에서의 유닛 컨디션. 도시를 모르면(null) 주거·음식·선호 음식 모두 "모름" → 0 */
export function workerCondition(
  unitId: number,
  cityId: number | null,
  source: ConditionSource,
  rules: Pick<SocietyCoefficients, "condition">,
): ConditionParts & { readonly preferences: UnitPreferences } {
  const rest = cityId === null ? undefined : source.rest(unitId, cityId);
  const food = cityId === null ? undefined : source.necessitiesPm(cityId);
  const preferences = source.preferences?.(unitId) ?? NO_PREFERENCES;
  const liked =
    cityId === null || preferences.food === null ? undefined : source.foodInCity?.(cityId, preferences.food);
  const parts = unitCondition(
    {
      housing: rest?.housing ?? { kind: "unknown" },
      lodgingFacility: rest?.lodgingFacility,
      foodPm: food ?? null,
      initialSum: source.initialSum(unitId),
      preferences,
      foodLiked: liked ?? null,
    },
    rules.condition,
  );
  return { ...parts, preferences };
}
