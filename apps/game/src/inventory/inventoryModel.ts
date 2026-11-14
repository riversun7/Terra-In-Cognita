// 인벤토리 화면 자료 모양 — 사용자 요청 2026-11-14 "인벤토리 시스템 추가 … 유닛별, 창고별, 건물별, 전체적으로 보유한 아이템".
// docs/adr/2026-11-14-inventory-screen.md. 서버 자료는 그대로 쓴다(경제 economy.holdings = 원장 자리별 잔고, 건물 facilities.overview = 창고 시설 여부).
// - 창고 = 도시 창고(warehouse) + 내 창고 시설 건물 창고(storage). 건물 = 그 밖의 건물 창고(생산 시설·임대 몫). 유닛 = 화물(cargo).
// - 전체 = 모든 자리의 같은 자산을 더한 줄(몇 곳에 있는지 함께).
// - 추정 가치 [임시]: 물건마다 시장 마지막 체결가(기준 도시, 묶음당), 없으면 팩 시작 시세(기준 통화, 묶음당) × 묶음 수(버림). 화폐마다 따로 더한다.
import type { HoldingLine, HoldingPlace } from "@terra/shared/economy";

export type InventoryTab = "all" | "units" | "warehouses" | "buildings";
export const INVENTORY_TABS: readonly InventoryTab[] = ["all", "units", "warehouses", "buildings"];

/** 주소 search tab → 칸(모르는 값이면 전체) */
export function parseInventoryTab(value: string | undefined): InventoryTab {
  return INVENTORY_TABS.find((tab) => tab === value) ?? "all";
}

/** "building_42" → 42, "cargo_17" → 17(아니면 null) */
function idAfter(prefix: string, id: string): number | null {
  if (!id.startsWith(prefix)) return null;
  const value = Number(id.slice(prefix.length));
  return Number.isInteger(value) && value > 0 ? value : null;
}
export const buildingIdOf = (place: Pick<HoldingPlace, "id" | "kind">): number | null =>
  place.kind === "building" ? idAfter("building_", place.id) : null;
export const cargoUnitOf = (place: Pick<HoldingPlace, "id" | "kind">): number | null =>
  place.kind === "cargo" ? idAfter("cargo_", place.id) : null;

export interface PlaceGroups {
  /** 도시 창고 + 내 창고 시설(창고 칸) */
  readonly warehouses: readonly HoldingPlace[];
  /** 그 밖의 건물 창고(건물 칸) */
  readonly buildings: readonly HoldingPlace[];
  /** 유닛 화물(유닛 ID → 자리) */
  readonly cargo: ReadonlyMap<number, HoldingPlace>;
  /** 자리 없는 물건(옛 시험 물자 등) */
  readonly ledger: readonly HoldingPlace[];
}

/** 자리를 칸별로 나눈다. storageBuildings = 내 창고 시설 건물 ID(건물 자료의 storage) */
export function groupPlaces(
  places: readonly HoldingPlace[],
  storageBuildings: ReadonlySet<number>,
): PlaceGroups {
  const warehouses: HoldingPlace[] = [];
  const buildings: HoldingPlace[] = [];
  const cargo = new Map<number, HoldingPlace>();
  const ledger: HoldingPlace[] = [];
  for (const place of places) {
    if (place.kind === "warehouse") warehouses.push(place);
    else if (place.kind === "ledger") ledger.push(place);
    else if (place.kind === "cargo") {
      const unit = cargoUnitOf(place);
      if (unit !== null) cargo.set(unit, place);
    } else {
      const building = buildingIdOf(place);
      if (building !== null && storageBuildings.has(building)) warehouses.push(place);
      else buildings.push(place);
    }
  }
  return { warehouses, buildings, cargo, ledger };
}

export interface TotalLine {
  readonly asset: string;
  readonly item: string | null;
  readonly qty: bigint;
  /** 이 자산이 있는 자리 수 */
  readonly places: number;
  /** 샘플 줄(이름·종류를 보일 때) */
  readonly line: HoldingLine;
}

/** 모든 자리의 같은 자산을 더한다(0 이하는 뺀다). 수량 큰 차례(같으면 자산 코드 차례) */
export function totalLines(places: readonly HoldingPlace[]): TotalLine[] {
  const sums = new Map<string, { qty: bigint; places: number; line: HoldingLine }>();
  for (const place of places)
    for (const line of place.lines) {
      const qty = BigInt(line.qty);
      if (qty <= 0n) continue;
      const entry = sums.get(line.asset);
      if (entry) {
        entry.qty += qty;
        entry.places += 1;
      } else sums.set(line.asset, { qty, places: 1, line });
    }
  return [...sums.entries()]
    .map(([asset, entry]) => ({
      asset,
      item: entry.line.item,
      qty: entry.qty,
      places: entry.places,
      line: entry.line,
    }))
    .toSorted((a, b) => (a.qty === b.qty ? (a.asset < b.asset ? -1 : 1) : a.qty > b.qty ? -1 : 1));
}

/** 물건 하나의 가격(묶음당 값·화폐·묶음 크기) */
export interface ItemPrice {
  readonly price: bigint;
  readonly currency: string;
  readonly lot: bigint;
}

export interface ValueEstimate {
  /** 화폐 코드 → 합(그 화폐 최소 단위) */
  readonly byCurrency: ReadonlyMap<string, bigint>;
  /** 값을 매긴 물건 종류 수·매기지 못한 종류 수 */
  readonly priced: number;
  readonly unpriced: number;
}

/** 추정 가치: 물건 줄마다 묶음 수(버림) × 묶음당 값. 값이 없는 물건(장비 경매·문서 등)은 세지 않는다 */
export function estimateValue(
  totals: readonly TotalLine[],
  priceOf: (item: string) => ItemPrice | null,
): ValueEstimate {
  const byCurrency = new Map<string, bigint>();
  let priced = 0;
  let unpriced = 0;
  for (const total of totals) {
    if (total.item === null) continue;
    const price = priceOf(total.item);
    if (!price || price.price <= 0n) {
      unpriced += 1;
      continue;
    }
    priced += 1;
    const lots = total.qty / (price.lot > 0n ? price.lot : 1n);
    byCurrency.set(price.currency, (byCurrency.get(price.currency) ?? 0n) + lots * price.price);
  }
  return { byCurrency, priced, unpriced };
}
