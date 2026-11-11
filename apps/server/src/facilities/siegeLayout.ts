// 공성·건물 공격 전투맵의 입력 = 그 2차맵의 실제 건물 배치 — 기획 D-533, 질문 1046 가, ADR `2026-11-11-city-building-layout.md`
// "바뀜 (2026-11-12)". 전투맵 자체는 sim combat/siegeArena.ts(시뮬레이터와 같은 함수)가 만든다. 여기서는 서버 상태(2차맵 건물 칸·시설 줄·
// 지형)를 그 입력(SiegeLayout)으로 옮긴다.
// - 도시 공성(정원사 웨이브): 넥서스 = 그 도시의 행정 건물(시설 단계 government, 다 지었고 2차맵에 서 있는 것 가운데 도시 칸에서 가장 가까운 것).
//   없으면 undefined → 부르는 쪽이 옛 열린 맵을 쓴다(폐허·행정 건물 없는 옛 세계 도시).
// - 건물 공격: 넥서스 = 대상 건물 실제 칸. 비콘(2차맵 건물이 아님)은 2차맵 가운데 2×2 자리, 그 자리에 건물이 있으면 undefined.
// - 장애물 = 같은 2차맵의 다른 모든 건물(전투맵 창 밖은 siegeArena가 뺀다). 내구도 = 시설이면 지금 내구도 점, 아니면 [임시] 1,000.
import { decodeTerrain } from "@terra/protocol";
import { advanceCondition, durabilityPoints, maxDurabilityAt } from "@terra/shared/facilityRuntime";
import { type SecondMapLayers, type SocietyCoefficients, footprintRect } from "@terra/sim";
import type { SiegeLayout, SiegeRect } from "@terra/sim/siegeArena";
import type { SecondMap } from "../world/secondMap.ts";
import type { FacilityCatalog } from "./catalog.ts";
import type { FacilityRecord } from "./state.ts";

/** [임시] 시설 줄이 없는 건물(시험 건물 등)의 장애물 내구도. 장애물은 지금 전투에서 부서지지 않는다(넥서스만 친다) */
export const OBSTACLE_DURABILITY = 1000;
/** 비콘 넥서스 칸(2×2, 옛 열린 맵과 같은 크기) */
const BEACON_NEXUS_CELLS = 2;

/** 시설의 지금 내구도 점(화면 자료와 같은 셈 — 노화를 지금까지 흐르게, 사용 닳음은 분마다 건물 서비스가 넣는다) */
export function facilityPoints(
  record: FacilityRecord,
  durability: number,
  at: number,
  rt: SocietyCoefficients["facilityRuntime"],
): number {
  const ppm =
    record.level >= 1 && at > record.conditionAtMs
      ? advanceCondition(record.conditionPpm, at - record.conditionAtMs, false, rt)
      : record.conditionPpm;
  return durabilityPoints(ppm, maxDurabilityAt(durability, Math.max(1, record.level), rt));
}

/** 2차맵 지형 층(전투맵 지형 — battleReplay/arena.ts와 같은 셈). 지형 파일에 엄폐 층이 없으면 엄폐 없음 */
export function mapLayers(map: SecondMap): SecondMapLayers {
  const terrain = decodeTerrain(map.terrainFile().raw);
  const costs = map.replicaInit().terrainCost;
  const size = Math.round(Math.sqrt(costs.length));
  return {
    size,
    costs,
    cover: terrain.cover && terrain.placementSize === size ? terrain.cover : null,
    terrainSize: terrain.terrainSize,
    vertexHeightsCm: terrain.heights,
  };
}

export interface SiegeLayoutSource {
  readonly records: ReadonlyMap<number, FacilityRecord>;
  readonly catalog: FacilityCatalog;
  readonly rules: SocietyCoefficients;
  readonly at: number;
  /** 2차맵 지형을 복사하나(기본 true). false = 평지 위 건물만 */
  readonly terrain?: boolean | undefined;
}

/** 그 2차맵의 건물 → 장애물 목록 + 넥서스 자리 */
export function siegeLayoutOn(
  map: SecondMap,
  nexus: SiegeRect,
  nexusSourceId: number | null,
  source: SiegeLayoutSource,
): SiegeLayout {
  const buildings: SiegeLayout["buildings"][number][] = [];
  const rt = source.rules.facilityRuntime;
  map.forEachBuilding((building) => {
    const rect = footprintRect(building.placement);
    const record = source.records.get(building.id);
    const def = record ? source.catalog.facility(record.facilityId) : undefined;
    const durability =
      record && def ? facilityPoints(record, def.durability, source.at, rt) : OBSTACLE_DURABILITY;
    buildings.push({ sourceId: building.id, ...rect, durability });
  });
  return {
    mapCells: Math.round(Math.sqrt(map.replicaInit().terrainCost.length)),
    nexus,
    nexusSourceId,
    buildings,
    terrain: source.terrain === false ? null : mapLayers(map),
  };
}

/** 그 도시의 행정 건물(다 지었고 2차맵에 서 있는 것 가운데 도시 칸에서 가장 가까운 것, 같으면 작은 ID) */
export function cityHall(
  map: SecondMap,
  source: Pick<SiegeLayoutSource, "records" | "catalog">,
  cityId: number,
  cell: { readonly x: number; readonly y: number },
): { readonly id: number; readonly rect: SiegeRect } | undefined {
  let best: { id: number; rect: SiegeRect; d: number } | undefined;
  map.forEachBuilding((building) => {
    const record = source.records.get(building.id);
    if (!record || record.cityId !== cityId || record.level < 1) return;
    if (source.catalog.facility(record.facilityId)?.stage !== "government") return;
    const rect = footprintRect(building.placement);
    const dx = rect.x + (rect.width >> 1) - cell.x;
    const dy = rect.y + (rect.height >> 1) - cell.y;
    const d = dx * dx + dy * dy;
    if (!best || d < best.d || (d === best.d && building.id < best.id)) best = { id: building.id, rect, d };
  });
  return best ? { id: best.id, rect: best.rect } : undefined;
}

/** 도시 공성 입력: 넥서스 = 행정 건물. 행정 건물이 없으면 undefined(옛 열린 맵) */
export function citySiegeLayout(
  map: SecondMap,
  cityId: number,
  cell: { readonly x: number; readonly y: number },
  source: SiegeLayoutSource,
): SiegeLayout | undefined {
  const hall = cityHall(map, source, cityId, cell);
  return hall ? siegeLayoutOn(map, hall.rect, hall.id, source) : undefined;
}

/** 비콘 공격 입력: 2차맵 가운데 2×2 자리. 그 자리에 건물이 있으면 undefined(옛 열린 맵) */
export function beaconSiegeLayout(
  map: SecondMap,
  center: { readonly x: number; readonly y: number },
  source: SiegeLayoutSource,
): SiegeLayout | undefined {
  const half = BEACON_NEXUS_CELLS >> 1;
  const nexus = {
    x: center.x - half,
    y: center.y - half,
    width: BEACON_NEXUS_CELLS,
    height: BEACON_NEXUS_CELLS,
  };
  const layout = siegeLayoutOn(map, nexus, null, source);
  const hit = layout.buildings.some(
    (b) =>
      b.x < nexus.x + nexus.width &&
      nexus.x < b.x + b.width &&
      b.y < nexus.y + nexus.height &&
      nexus.y < b.y + b.height,
  );
  return hit ? undefined : layout;
}

/** 월드 → NPC 런타임 정원사: 도시 ID·자리 → 그 도시 공성 입력(부를 때마다 지금 건물·시설 줄을 읽는다) */
export function citySiegeLayoutOf(
  maps: ReadonlyMap<number, SecondMap>,
  facilities: {
    readonly service: { readonly facilities: ReadonlyMap<number, FacilityRecord> };
    readonly catalog: () => FacilityCatalog;
    readonly rules: () => SocietyCoefficients;
  },
  now: () => number,
): (
  cityId: number,
  place: { readonly mapKey: number; readonly cellX: number; readonly cellY: number },
) => SiegeLayout | undefined {
  return (cityId, place) => {
    const map = maps.get(place.mapKey);
    if (!map) return undefined;
    return citySiegeLayout(
      map,
      cityId,
      { x: place.cellX, y: place.cellY },
      {
        records: facilities.service.facilities,
        catalog: facilities.catalog(),
        rules: facilities.rules(),
        at: now(),
      },
    );
  };
}
