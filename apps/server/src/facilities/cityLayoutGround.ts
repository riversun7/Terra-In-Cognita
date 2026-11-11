// 도시 건물 배치 계획(cityLayout.ts)의 땅 — 2차맵 하나의 배치 격자를 복사해 계획하는 동안 가상으로 건물을 적는다.
// docs/adr/2026-11-11-city-building-layout.md. 씨앗(npcSeed.ts)·다시 놓기(cityRelayout.ts)·미리 보기(cityLayoutView.ts)가 같은 길을 쓴다.
// - 격자 = 2차맵 지형 비용 + 지금 건물(ignore에 든 건물 — 다시 놓을 NPC 건물 — 은 빼고). 유닛은 보지 않는다(실제로 놓을 때 2차맵이 본다).
// - 원자재 오브젝트: 그 2차맵 지형에서 채집과 같은 함수(gather/objects.ts placeGatherObjects)로 정한 자리.
import { cellMaterials } from "@terra/shared/catchment";
import { type CityCell, cityOfCell } from "@terra/shared/goodsPlaces";
import type { WorldSeedCoefficients } from "@terra/sim";
import { PLACEMENT_SIZE, applyPlacement, createPlacementGrid, validatePlacement } from "@terra/sim";
import type { GatherKind } from "../gather/kinds.ts";
import { type GatherObject, placeGatherObjects } from "../gather/objects.ts";
import { mapLayers } from "../gather/terrainLayers.ts";
import type { SecondMap } from "../world/secondMap.ts";
import type { FacilityCatalog } from "./catalog.ts";
import type { CityLayoutRules, LayoutGround, LayoutItem, LayoutRect, LayoutRole } from "./cityLayout.ts";
import type { SeedLand } from "./npcSeed.ts";
import { waterOk } from "./water.ts";

/** 계획 중 가상 건물 ID(실제 건물 ID와 겹치지 않는 큰 수) */
const VIRTUAL_ID_BASE = 0xfff0_0000;

/** 시설 단계 → 배치 몫 */
export function layoutRoleOf(stage: string | undefined): LayoutRole {
  switch (stage) {
    case "government":
      return "core";
    case "gather":
      return "gather";
    case "storage":
      return "storage";
    case "living":
      return "living";
    default:
      return "other";
  }
}

/** 시설 하나 → 놓을 건물(팩 발자국이 없으면 undefined) */
export function layoutItemOf(
  catalog: FacilityCatalog,
  facility: string,
  kinds: readonly GatherKind[],
): LayoutItem | undefined {
  const def = catalog.facility(facility);
  if (!def?.footprint) return undefined;
  const objectKinds: number[] = [];
  kinds.forEach((kind, index) => {
    if (kind.facility === facility) objectKinds.push(index);
  });
  return {
    facility,
    role: layoutRoleOf(def.stage),
    width: def.footprint.width,
    height: def.footprint.height,
    objectKinds,
  };
}

/** 그 2차맵의 원자재 오브젝트(채집과 같은 자리). 종류가 없으면 빈 목록 */
export function layoutObjectsOf(
  map: Pick<SecondMap, "mapKey" | "terrainFile">,
  kinds: readonly GatherKind[],
  land: SeedLand | undefined,
  seed: WorldSeedCoefficients,
): GatherObject[] {
  if (kinds.length === 0) return [];
  const materials = land ? cellMaterials({ ...land, water: land.water ?? 0 }, seed) : undefined;
  return placeGatherObjects({ ...mapLayers(map), materials }, kinds);
}

/** 2차맵 → 계획 땅(위 머리 주석) */
export function layoutGroundOf(options: {
  readonly map: Pick<SecondMap, "mapKey" | "replicaInit" | "waterMask"> &
    Partial<Pick<SecondMap, "unitInRect">>;
  readonly catalog: FacilityCatalog;
  /** 이 도시와 같은 2차맵 도시 칸들(가장 가까운 도시) */
  readonly anchors: readonly CityCell[];
  readonly cityId: number;
  readonly objects: readonly GatherObject[];
  /** 격자에서 뺄 건물(다시 놓을 건물) */
  readonly ignore?: ReadonlySet<number> | undefined;
}): LayoutGround & { readonly grid: ReturnType<typeof createPlacementGrid> } {
  const replica = options.map.replicaInit();
  const grid = createPlacementGrid(replica.terrainCost);
  for (const building of replica.buildings)
    if (!options.ignore?.has(building.id)) applyPlacement(grid, building.id, building.placement);
  let nextId = VIRTUAL_ID_BASE;
  const placement = (rect: LayoutRect) => ({ ...rect, rotation: 0 as const });
  return {
    grid,
    objects: options.objects,
    canPlace: (rect) => validatePlacement(grid, placement(rect)).ok,
    place: (rect) => {
      nextId += 1;
      applyPlacement(grid, nextId, placement(rect));
    },
    owns: (x, y) => cityOfCell(options.anchors, options.map.mapKey, x, y)?.id === options.cityId,
    fits: (facility, x, y) => {
      const def = options.catalog.facility(facility);
      return !def || waterOk(options.map, def, x, y, 0);
    },
    costAt: (x, y) => grid.terrainCost[y * PLACEMENT_SIZE + x] ?? 0,
    occupied: options.map.unitInRect ? (rect) => options.map.unitInRect?.(rect) === true : undefined,
  };
}

/** 세계 씨앗 계수표 → 배치 설정 칸 */
export function cityLayoutRulesOf(seed: WorldSeedCoefficients): CityLayoutRules {
  const int = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.trunc(value)));
  const gatherMin = int(seed.cityLayoutGatherMinCells, 4, 120);
  return {
    plazaCells: int(seed.cityLayoutPlazaCells, 0, 16),
    innerCells: int(seed.cityLayoutInnerCells, 2, 64),
    gatherMinCells: gatherMin,
    gatherMaxCells: int(seed.cityLayoutGatherMaxCells, gatherMin, 120),
    gatherReachCells: int(seed.cityLayoutGatherReachCells, 1, 64),
    storeRoutePm: int(seed.cityLayoutStoreRoutePm, 0, 1000),
    lodgeRoutePm: int(seed.cityLayoutLodgeRoutePm, 0, 1000),
    jitterCells: int(seed.cityLayoutJitterCells, 0, 8),
  };
}

/** 도시 배치 시드: (2차맵 키, 도시 ID) — 같은 도시는 늘 같은 모양, 도시마다 다르다 */
export function cityLayoutSeed(mapKey: number, cityId: number): number {
  // 2차맵 키(셀 키)는 32비트를 넘을 수 있어 위 자리도 섞는다
  const high = Math.floor(mapKey / 4_294_967_296) >>> 0;
  let x =
    (Math.imul(mapKey >>> 0, 0x9e37_79b1) ^
      Math.imul(high + 1, 0xc2b2_ae35) ^
      Math.imul(cityId + 1, 0x85eb_ca6b)) >>>
    0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb_352d) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x846c_a68b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}
