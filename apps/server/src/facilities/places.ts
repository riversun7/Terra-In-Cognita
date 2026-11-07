// 물건 자리 셈(서버) — 건물이 선 도시·재료를 꺼내는 자리·창고 무게(docs/adr/2026-11-07-buildings-runtime.md "바뀜 (창고·직무)")
// 규칙(위치 코드·가장 가까운 도시·꺼내는 자리 판단·차례)은 @terra/shared/goodsPlaces 하나이고, 여기는 2차맵·시설 줄·원장에서 자료를 모은다.
// - 도시 창고 = 주인의 원장 계정(위치 = 도시 ID). 용량 없음 [임시](질문 411).
// - 창고 시설 = 창고 단계(stage storage) 시설. 원장 위치 = 그 건물, 무게 합 ≤ 용량(N50). 다 짓고 30% 이상일 때만 넣는다.
// - 건물 창고의 다른 몫(임대형 임차인 산출 등)도 같은 위치다(노동 계약 유예 뒤 시설 주인 것이 된다).
// - 영토 비콘(1차맵)은 그 세력에서 비콘 칸과 가장 가까운 도시의 도시 창고 + 그 도시의 내 창고 시설만(화물 없음, 질문 410 ①).
import {
  type CityCell,
  type PlaceRef,
  buildingLocation,
  cargoLocation,
  cityLocation,
  cityOfCell,
  isMaterialSource,
  placeOfLocation,
  sourceOrder,
} from "@terra/shared/goodsPlaces";
import type { Ledger } from "../economy/ledger.ts";
import type { BeaconSupply } from "../territory/service.ts";
import type { SecondMap } from "../world/secondMap.ts";
import type { FacilityCatalog } from "./catalog.ts";
import type { FacilityRecord } from "./state.ts";

export interface PlaceWorld {
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly facilities: ReadonlyMap<number, FacilityRecord>;
  readonly catalog: () => FacilityCatalog;
  /** 띄운 2차맵의 도시 자리(부팅 때 읽은 도시 + NPC 런타임이 새로 세운 도시) */
  readonly cities: () => readonly CityCell[];
}

/** 건물의 2차맵·기준 칸(없으면 undefined) */
export function buildingCell(
  maps: ReadonlyMap<number, SecondMap>,
  buildingId: number,
): { mapKey: number; x: number; y: number; ownerId: number | null } | undefined {
  for (const map of maps.values()) {
    if (map.buildingOwner(buildingId) === undefined) continue;
    let found: { mapKey: number; x: number; y: number; ownerId: number | null } | undefined;
    map.forEachBuilding((building) => {
      if (building.id === buildingId)
        found = { mapKey: map.mapKey, x: building.x, y: building.y, ownerId: building.ownerId };
    });
    return found;
  }
  return undefined;
}

/** 그 칸이 속한 도시 ID(그 2차맵에 도시가 없으면 null) */
export const cityAt = (world: PlaceWorld, mapKey: number, x: number, y: number): number | null =>
  cityOfCell(world.cities(), mapKey, x, y)?.id ?? null;

/**
 * 건물이 선 도시·2차맵. 시설 줄의 도시(지을 때 정함)가 있으면 그것, 없으면(관리자 시험 건물·직전 판 줄) 칸에서 정한다.
 * 건물이 없으면 undefined
 */
export function buildingPlace(
  world: PlaceWorld,
  buildingId: number,
): { mapKey: number; cityId: number | null; ownerId: number | null } | undefined {
  const cell = buildingCell(world.maps, buildingId);
  if (!cell) return undefined;
  const record = world.facilities.get(buildingId);
  const cityId = record?.cityId ?? cityAt(world, cell.mapKey, cell.x, cell.y);
  return { mapKey: cell.mapKey, cityId, ownerId: cell.ownerId };
}

/** 창고 시설인가(창고 단계 시설 줄) */
export function isStorage(world: PlaceWorld, buildingId: number): boolean {
  const record = world.facilities.get(buildingId);
  return record !== undefined && world.catalog().facility(record.facilityId)?.stage === "storage";
}

/**
 * 건물 재료를 꺼내는 자리 차례(D-516 361): 그 도시의 내 도시 창고 → 그 도시에 선 내 창고 시설(작은 건물 ID) → 그 2차맵에 있는 내 유닛
 * 화물(작은 유닛 ID). 원장 위치 목록으로 돌려준다. cargo가 false면 화물을 뺀다(영토 비콘, 질문 410 ①)
 */
export function materialScope(
  world: PlaceWorld,
  ownerId: number,
  mapKey: number,
  cityId: number | null,
  cargo = true,
): number[] {
  const refs: PlaceRef[] = [];
  if (cityId !== null) refs.push({ kind: "city", id: cityId, cityId, mapKey: null, storage: false });
  for (const record of world.facilities.values()) {
    if (record.cityId !== cityId || cityId === null || !isStorage(world, record.buildingId)) continue;
    const map = world.maps.get(mapKey);
    // 창고 시설은 그 도시의 2차맵에 있다(도시 = 같은 2차맵의 가장 가까운 도시). 다른 2차맵의 건물이면 buildingOwner가 undefined다
    const owner = map?.buildingOwner(record.buildingId);
    if (owner !== ownerId) continue;
    refs.push({ kind: "building", id: record.buildingId, cityId, mapKey, storage: true });
  }
  if (cargo)
    world.maps.get(mapKey)?.forEachUnit((unit) => {
      if (unit.ownerId === ownerId)
        refs.push({ kind: "cargo", id: unit.id, cityId: null, mapKey, storage: false });
    });
  return refs
    .filter((ref) => isMaterialSource(ref, cityId, cargo ? mapKey : null))
    .toSorted(sourceOrder)
    .map((ref) =>
      ref.kind === "city"
        ? cityLocation(ref.id ?? 0)
        : ref.kind === "building"
          ? buildingLocation(ref.id ?? 0)
          : cargoLocation(ref.id ?? 0),
    );
}

/**
 * 영토 비콘(1차맵) 짓기·수리 재료를 꺼내는 자리(질문 410 ①, 기획 커밋 52afc21 D-121 포인터): 그 세력에서 비콘 칸과 가장 가까운 도시의 내
 * 도시 창고 → 그 도시의 내 창고 시설. 화물은 쓰지 않는다(2차맵 건물 규칙 361과 같은 꼴에서 화물만 뺀다)
 */
export const beaconMaterialScope = (world: PlaceWorld, ownerId: number, supply: BeaconSupply): number[] =>
  materialScope(world, ownerId, supply.mapKey, supply.cityId, false);

/**
 * 원장 자산 한 기본 단위의 무게(g). 물자가 아니면(시험 광석 등) 0. 원장 잔고는 기본 단위(광석 1g, 묶음 1kg — 302·D-506)라 묶음 무게(weightOf)가
 * 아니라 기본 단위 무게로 센다(예전에는 묶음 무게로 세어 광석 창고 무게가 1,000배였다, docs/adr/2026-11-07-play-flow.md "WP8")
 */
export function assetWeightG(catalog: FacilityCatalog, asset: string): bigint {
  if (!asset.startsWith("item:")) return 0n;
  const weight = catalog.unitWeightOf(asset.slice(5));
  return weight === undefined || weight <= 0 ? 0n : BigInt(weight);
}

/** 그 건물 창고에 든 물건 무게 합(g, 모든 주인) */
export function storedGrams(ledger: Ledger, catalog: FacilityCatalog, buildingId: number): bigint {
  const location = buildingLocation(buildingId);
  let total = 0n;
  for (const account of ledger.accounts())
    if (account.location === location && account.ownerId !== null && account.balance > 0n)
      total += account.balance * assetWeightG(catalog, account.asset);
  return total;
}

/** 위치가 건물 창고면 그 건물 ID */
export function buildingOfLocation(location: number | null): number | undefined {
  const place = placeOfLocation(location);
  return place.kind === "building" && place.id !== null ? place.id : undefined;
}
