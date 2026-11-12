// 도시 건물 배치 계획(@terra/sim/city cityLayout.ts)의 땅 — 2차맵 하나의 배치 격자를 복사해 계획하는 동안 가상으로 건물을 적는다.
// docs/adr/2026-11-11-city-building-layout.md. 씨앗(npcSeed.ts)·다시 놓기(cityRelayout.ts)·미리 보기(cityLayoutView.ts)가 같은 길을 쓴다.
// - 격자 = 2차맵 지형 비용 + 지금 건물(ignore에 든 건물 — 다시 놓을 NPC 건물 — 은 빼고). 유닛은 보지 않는다(실제로 놓을 때 2차맵이 본다).
// - 원자재 오브젝트: 그 2차맵 지형에서 채집과 같은 함수(gather/objects.ts placeGatherObjects)로 정한 자리.
import { cellMaterials, oreSharePm, woodSharePm } from "@terra/shared/catchment";
import { type CityCell, cityOfCell } from "@terra/shared/goodsPlaces";
import type { WorldSeedCoefficients } from "@terra/sim";
import { PLACEMENT_SIZE, applyPlacement, createPlacementGrid, validatePlacement } from "@terra/sim";
import type { GatherKind } from "../gather/kinds.ts";
import { type GatherObject, placeGatherObjects } from "../gather/objects.ts";
import { mapLayers } from "../gather/terrainLayers.ts";
import type { SecondMap } from "../world/secondMap.ts";
import type { FacilityCatalog } from "./catalog.ts";
import { type LayoutGround, type LayoutItem, type LayoutRect, layoutRoleOf } from "@terra/sim/city";
import type { SeedLand } from "./npcSeed.ts";
import { waterOk } from "./water.ts";

// 설정 칸·몫·시드는 판정 꾸러미(시뮬레이터 도시 공성 전투맵과 같은 값, 질문 1068 가)
export { cityLayoutRulesOf, cityLayoutSeed, layoutRoleOf } from "@terra/sim/city";

/** 계획 중 가상 건물 ID(실제 건물 ID와 겹치지 않는 큰 수) */
const VIRTUAL_ID_BASE = 0xfff0_0000;

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
  const value = land ? { ...land, water: land.water ?? 0 } : undefined;
  const materials = value ? cellMaterials(value, seed) : undefined;
  // 노두(질문 1083 나): 채집과 같은 광석 고도 몫·목재 몫(관목 — 기본 재료 바닥 보장)
  return placeGatherObjects(
    {
      ...mapLayers(map),
      materials,
      oreSharePm: value ? oreSharePm(value, seed) : undefined,
      woodSharePm: value ? woodSharePm(value, seed) : undefined,
    },
    kinds,
  );
}

/** 계획 네모 → 돌리지 않은 배치 */
const placement = (rect: LayoutRect) => ({ ...rect, rotation: 0 as const });

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
