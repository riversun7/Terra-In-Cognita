// 물건 자리(원장 위치 코드)와 건물 재료를 꺼내는 자리 — docs/adr/2026-11-07-buildings-runtime.md "바뀜 (창고·직무)",
// 경제 ADR 2026-10-31-economy-core.md 3절(계정 = 주체·자산·위치), 기획 D-117(물건마다 자리)·D-121(다중 창고)·D-516(361).
// 서버(apps/server/src/facilities/)와 경제 화면(미리 셈)이 같은 규칙을 쓴다.
// - 원장 계정 위치(ledger_accounts.location, bigint) 하나에 자리 종류를 싣는다 [임시]:
//   null = 자리 없음(화폐·옛 시험 물자), 1 ~ BUILDING_LOCATION_BASE − 1 = 도시 창고(도시 ID — 경제 ADR 3절 "지금 시뮬은 도시 ID"),
//   BUILDING_LOCATION_BASE + 건물 ID = 건물 창고(창고 시설·임대 몫, D-117 "도시·건물 창고"), 음수 = 유닛 화물(−유닛 ID, 전투 ADR 8절).
// - 건물이 선 도시 = 같은 2차맵의 가장 가까운 도시(칸 거리 제곱, 같으면 작은 ID) [임시]. 필지·도시 경계(D-149)가 생기면 그것으로 바꾼다.
// - 건물 재료를 꺼내는 자리(D-516 361): 그 도시 창고 → 그 도시에 선 내 창고 시설(작은 건물 ID) → 그 2차맵에 있는 내 유닛 화물(작은
//   유닛 ID). 자리 없음·다른 도시·다른 건물 창고(임대 몫)는 쓰지 않는다(먼저 옮긴다).

/** 건물 창고 위치의 시작(도시 ID는 이보다 작다) */
export const BUILDING_LOCATION_BASE = 1_000_000_000_000;

export type GoodsPlaceKind = "ledger" | "city" | "building" | "cargo";

export interface GoodsPlace {
  readonly kind: GoodsPlaceKind;
  /** 도시 ID·건물 ID·유닛 ID(자리 없음은 null) */
  readonly id: number | null;
}

export const cityLocation = (cityId: number): number => cityId;
export const buildingLocation = (buildingId: number): number => BUILDING_LOCATION_BASE + buildingId;
export const cargoLocation = (unitId: number): number => -unitId;

/** 원장 위치 → 자리 */
export function placeOfLocation(location: number | null): GoodsPlace {
  if (location === null || location === 0) return { kind: "ledger", id: null };
  if (location < 0) return { kind: "cargo", id: -location };
  if (location >= BUILDING_LOCATION_BASE) return { kind: "building", id: location - BUILDING_LOCATION_BASE };
  return { kind: "city", id: location };
}

/** 자리 글자 열쇠(화면 목록 key): city_3·building_42·cargo_17·ledger */
export const placeKey = (place: GoodsPlace): string =>
  place.kind === "ledger" ? "ledger" : `${place.kind}_${String(place.id)}`;

/** 도시 자리(2차맵 칸) */
export interface CityCell {
  readonly id: number;
  readonly mapKey: number;
  readonly x: number;
  readonly y: number;
}

/** 그 2차맵 칸이 속한 도시: 같은 2차맵의 가장 가까운 도시(칸 거리 제곱, 같으면 작은 ID). 없으면 undefined */
export function cityOfCell(
  cities: readonly CityCell[],
  mapKey: number,
  x: number,
  y: number,
): CityCell | undefined {
  let best: CityCell | undefined;
  let bestDistance = 0;
  for (const city of cities) {
    if (city.mapKey !== mapKey) continue;
    const dx = city.x - x;
    const dy = city.y - y;
    const distance = dx * dx + dy * dy;
    if (!best || distance < bestDistance || (distance === bestDistance && city.id < best.id)) {
      best = city;
      bestDistance = distance;
    }
  }
  return best;
}

/** 재료 자리 판단에 쓰는 자리 정보 */
export interface PlaceRef extends GoodsPlace {
  /** 도시 창고 = 그 도시, 건물 창고 = 건물이 선 도시, 화물·자리 없음 = null */
  readonly cityId: number | null;
  /** 건물이 선·유닛이 있는 2차맵(도시 창고·자리 없음은 null) */
  readonly mapKey: number | null;
  /** 건물 창고: 내 창고 시설(창고 단계)인가 */
  readonly storage: boolean;
}

/** 그 도시·2차맵의 건물 재료를 꺼낼 수 있는 자리인가(D-516 361) */
export function isMaterialSource(place: PlaceRef, cityId: number | null, mapKey: number): boolean {
  if (place.kind === "city") return cityId !== null && place.id === cityId;
  if (place.kind === "building") return place.storage && cityId !== null && place.cityId === cityId;
  if (place.kind === "cargo") return place.mapKey === mapKey;
  return false;
}

const RANK: Readonly<Record<GoodsPlaceKind, number>> = { city: 0, building: 1, cargo: 2, ledger: 3 };

/** 꺼내는 차례: 도시 창고 → 창고 시설(작은 ID) → 화물(작은 유닛 ID) */
export function sourceOrder(a: GoodsPlace, b: GoodsPlace): number {
  return RANK[a.kind] - RANK[b.kind] || (a.id ?? 0) - (b.id ?? 0);
}
