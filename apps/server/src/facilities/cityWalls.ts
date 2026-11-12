// 성벽 고리 — 질문 1048 가(성벽 시설이 공격을 늦춘다), D-533 "정부 건물 중앙(파괴 = 함락), 둘레 건물이 공격을 늦춤",
// docs/adr/2026-11-11-city-building-layout.md "바뀜 (2026-11-12)". 측정(apps/server/bench/siegeLayout.ts): 성벽 없이 실제 배치만으로는 공격 편이
// 건물을 돌아가 넥서스에 닿는 시각이 열린 맵과 같았다(둘레 16방위 중 약 4방위만 건물).
// - 고리 계획·공성 성문은 판정 꾸러미(@terra/sim/city cityWalls.ts — 시뮬레이터 도시도 같은 함수, 질문 1068 가). 여기는 서버 2차맵에 세우기.
// - NPC 시작 도시 씨앗이 모자랄 때 한 번(그 도시에 성벽이 하나도 없을 때만 — 멱등). 정수만 쓴다.
import { CONDITION_FULL } from "@terra/shared/facilityRuntime";
import { footprintRect } from "@terra/sim";
import { CITY_WALL_FACILITY, type CityWallRules, planCityWalls } from "@terra/sim/city";
import type { SiegeRect } from "@terra/sim/siegeArena";
import type { SecondMap } from "../world/secondMap.ts";
import type { FacilityCatalog } from "./catalog.ts";
import type { FacilityService } from "./service.ts";
import type { FacilityRecord } from "./state.ts";

// 고리 계획·성문은 판정 꾸러미(시뮬레이터 도시와 같은 함수, 질문 1068 가)
export {
  CITY_WALL_FACILITY,
  type CityWallRules,
  DEFENSE_STAGE,
  cityGates,
  cityWallRulesOf,
  gateIndices,
  planCityWalls,
  ringSides,
} from "@terra/sim/city";

export interface CityWallSeedInput {
  readonly map: SecondMap;
  readonly cityId: number;
  readonly ownerId: number;
  readonly hall: SiegeRect;
  readonly rules: CityWallRules;
  readonly catalog: FacilityCatalog;
  readonly service: Pick<FacilityService, "facilities" | "seedBuilt">;
  readonly nowMs: number;
}

/** 그 도시에 성벽이 하나도 없으면 고리를 세운다(세운 수). 규칙이 꺼졌거나 팩에 성벽이 없으면 0 */
export function seedCityWalls(input: CityWallSeedInput): number {
  const def = input.catalog.facility(CITY_WALL_FACILITY);
  if (!input.rules.enabled || !def?.footprint) return 0;
  for (const record of input.service.facilities.values())
    if (record.cityId === input.cityId && record.facilityId === CITY_WALL_FACILITY) return 0;
  const length = Math.max(def.footprint.width, def.footprint.height);
  const plan = planCityWalls(
    input.hall,
    input.rules,
    length,
    (placement) => input.map.canPlace(placement) && !input.map.unitInRect(footprintRect(placement)),
  );
  let placed = 0;
  for (const placement of plan) {
    const result = input.map.placeBuilding(placement, input.ownerId);
    if (!result.ok || result.buildingId === undefined) continue;
    const record: FacilityRecord = {
      buildingId: result.buildingId,
      facilityId: def.id,
      level: 1,
      conditionPpm: CONDITION_FULL,
      conditionAtMs: input.nowMs,
      builtAtMs: input.nowMs,
      builtBy: null,
      cityId: input.cityId,
    };
    input.service.seedBuilt(record);
    placed += 1;
  }
  return placed;
}
