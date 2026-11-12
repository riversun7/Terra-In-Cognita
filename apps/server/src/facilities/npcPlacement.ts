// NPC 도시 건물 자리(전략 배치) — docs/adr/2026-11-11-city-building-layout.md. 세계 씨앗(npcSeed.ts)과 NPC 증축(npc/cityBuild.ts, 질문 1101 나)이
// 같은 함수로 자리를 고른다: 그 도시에 그 주인이 가진 시설(이미 선 것)을 두고 새 건물들을 planCityLayout(cityLayout.ts)으로 놓는다.
// 계획만 한다(건물 칸을 놓지 않는다 — 부르는 쪽이 놓는다).
import type { CityCell } from "@terra/shared/goodsPlaces";
import { PLACEMENT_SIZE, type WorldSeedCoefficients } from "@terra/sim";
import type { GatherKind } from "../gather/kinds.ts";
import type { SecondMap } from "../world/secondMap.ts";
import type { FacilityCatalog } from "./catalog.ts";
import { type LayoutExisting, type LayoutItem, type PlannedBuilding, planCityLayout } from "./cityLayout.ts";
import {
  cityLayoutRulesOf,
  cityLayoutSeed,
  layoutGroundOf,
  layoutItemOf,
  layoutObjectsOf,
  layoutRoleOf,
} from "./cityLayoutGround.ts";
import type { SeedLand } from "./npcSeed.ts";
import type { FacilityRecord } from "./state.ts";

export interface NpcSpotsInput {
  readonly map: SecondMap;
  readonly catalog: FacilityCatalog;
  readonly facilities: ReadonlyMap<number, FacilityRecord>;
  readonly city: {
    readonly id: number;
    readonly mapKey: number;
    readonly cellX: number;
    readonly cellY: number;
  };
  readonly ownerId: number;
  /** 같은 2차맵 도시 칸들(가장 가까운 도시) */
  readonly anchors: readonly CityCell[];
  /** 놓을 시설 ID(차례) */
  readonly items: readonly string[];
  readonly kinds: readonly GatherKind[];
  readonly land: SeedLand | undefined;
  readonly seed: WorldSeedCoefficients;
}

/** 놓을 자리 계획과 팩에 발자국이 없거나 자리를 못 찾은 수 */
export function planNpcSpots(input: NpcSpotsInput): {
  readonly placed: readonly PlannedBuilding[];
  readonly missing: number;
} {
  const { map, catalog, city } = input;
  let missing = 0;
  const layoutItems: LayoutItem[] = [];
  for (const facility of input.items) {
    const item = layoutItemOf(catalog, facility, input.kinds);
    if (item) layoutItems.push(item);
    else missing += 1;
  }
  const placements = new Map<number, { x: number; y: number; width: number; height: number }>();
  map.forEachBuilding((building) => placements.set(building.id, building.placement));
  const existing: LayoutExisting[] = [];
  for (const record of input.facilities.values()) {
    const at = placements.get(record.buildingId);
    if (record.cityId !== city.id || !at || map.buildingOwner(record.buildingId) !== input.ownerId) continue;
    existing.push({
      facility: record.facilityId,
      role: layoutRoleOf(catalog.facility(record.facilityId)?.stage),
      x: at.x,
      y: at.y,
      width: at.width,
      height: at.height,
    });
  }
  const ground = layoutGroundOf({
    map,
    catalog,
    anchors: input.anchors,
    cityId: city.id,
    objects: layoutObjectsOf(map, input.kinds, input.land, input.seed),
  });
  const layout = planCityLayout({
    center: { x: city.cellX, y: city.cellY },
    items: layoutItems,
    existing,
    ground,
    rules: cityLayoutRulesOf(input.seed),
    seed: cityLayoutSeed(city.mapKey, city.id),
    size: PLACEMENT_SIZE,
  });
  return { placed: layout.placed, missing: missing + layout.missing.length };
}
