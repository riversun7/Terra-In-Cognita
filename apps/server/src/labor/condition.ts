// 유닛 컨디션(서버) — 기획 D-534, docs/adr/2026-11-12-unit-condition.md. 판정은 시뮬과 같은 @terra/sim unitCondition이다.
// 서버가 아는 입력만 모아 넘긴다(저장하지 않는다 — 부를 때마다 지금 값으로 센다, 같은 입력이면 같은 값):
// - 초기 스탯 합: 만든 사이보그면 저장한 처음 값의 합, 그 밖의 유닛은 [임시] 기본 몸(1차 모두 10 = 60, roster unitBody와 같은 바탕).
// - 주거: 그 유닛 주인이 그 도시에 가진 다 지은 숙소(lodging) 가운데 가장 높은 레벨 → 주거 등급. 숙소가 없으면 "모름"(주거 몫 0) [임시] —
//   플레이어 유닛의 숙소 배정(물류 줄기)이 생기면 그 숙소로 바꾼다(질문 1152).
// - 음식: 그 도시의 지난 하루 끝 생필품 충족 ‰(npc/cityDayStore.ts, world_cities.necessities_pm). 값이 없으면 "모름"(음식 몫 0).
// - 도시: 채집 정산은 그 채집 시설이 선 도시, 유닛 화면은 일하는 채집 시설의 도시(없으면 지금 2차맵의 도시).
import { type ConditionParts, type SocietyCoefficients, unitCondition } from "@terra/sim";

export interface ConditionSource {
  /** 그 유닛의 초기 스탯 합 */
  initialSum(unitId: number): number;
  /** 그 유닛 주인이 그 도시에 가진 다 지은 숙소의 가장 높은 레벨(없으면 undefined) */
  lodgingLevel(unitId: number, cityId: number): number | undefined;
  /** 그 도시의 생필품 충족 ‰(없으면 undefined) */
  necessitiesPm(cityId: number): number | undefined;
}

/** 도시 하나에서의 유닛 컨디션. 도시를 모르면(null) 주거·음식 모두 "모름" → 0 */
export function workerCondition(
  unitId: number,
  cityId: number | null,
  source: ConditionSource,
  rules: Pick<SocietyCoefficients, "condition">,
): ConditionParts {
  const level = cityId === null ? undefined : source.lodgingLevel(unitId, cityId);
  const food = cityId === null ? undefined : source.necessitiesPm(cityId);
  return unitCondition(
    {
      housing: level === undefined || level <= 0 ? { kind: "unknown" } : { kind: "lodging", level },
      foodPm: food ?? null,
      initialSum: source.initialSum(unitId),
    },
    rules.condition,
  );
}
