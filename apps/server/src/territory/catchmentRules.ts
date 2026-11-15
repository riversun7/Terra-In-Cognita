// 도시 배후지 지금 반경 규칙(설정 칸 실효 값) — 1차맵 영토 원의 바탕(D-546 1431 "지금 배후지 기준"). 1차맵 조회(worldMap/reads.ts
// world.cities catchmentMilli)와 영토 판정(territory/service.ts, D-568 "판정도 지도대로")이 같은 규칙을 쓴다.
import { type SocietyCoefficients, catchmentGrowthOf } from "@terra/sim";
import type { CatchmentGrowthRules } from "@terra/shared/catchment";
import type { TerritoryCoefficients } from "@terra/shared/territory";

/** 배후지 지금 반경 규칙(세계 씨앗 설정 칸 city_catchment_* + 도시 등급 문턱). 배후지 규칙이 꺼졌으면 undefined */
export interface CatchmentRadiusRules {
  readonly growth: CatchmentGrowthRules;
  readonly territory: Pick<TerritoryCoefficients, "gradeAtDevelopment">;
}

/** 설정 칸 실효 값 → 배후지 지금 반경 규칙. 배후지 스위치(city_catchment_radius_cells)가 0이면 옛 배치라 배후지가 없다 → undefined */
export function catchmentRadiusRulesOf(
  society: Pick<SocietyCoefficients, "worldSeed" | "territory">,
): CatchmentRadiusRules | undefined {
  return society.worldSeed.catchmentRadiusCells > 0
    ? { growth: catchmentGrowthOf(society.worldSeed), territory: society.territory }
    : undefined;
}
