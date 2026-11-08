// 채집한 물건을 넣는 곳 — docs/adr/2026-11-07-gather-objects.md 3·4절, 사용자 답 "매 채집마다 창고로 이동하여 저장하여 불필요한 동선. 오브젝트가 몰린곳에
// 광산이나 벌목소를 통해 빠르게 저장". 원장(유닛 화물 위치 → 넣는 곳 위치) 옮기기와 넣는 곳 고르기다(순수에 가깝다: 원장·자리 세계만 만진다).
// - 시설(camp): 그 오브젝트를 맡는 내 벌목장·광산(다 지었고 일하는)으로 오브젝트가 반경(그 시설 레벨의 채집소 반경) 안에 있는 것 가운데 가장
//   가까운 것. 넣으면 그 시설 창고(채집소 창고, 상한 = 팩 storageKg × 레벨)로 간다 — 사용자 지적(2026-11-08) "원자재채집소의 기능도 필요": 채집소
//   창고에 모으고 주인 도시 창고로 옮긴다(손으로·자동, station.ts). 예전에는 그 도시 창고로 바로 갔다.
// - 창고(storage): 그 2차맵의 내 창고 시설(창고 단계, 다 지었고 일하는, 자리가 남은 것). 건물 창고로(용량 N50).
// - 도시(city): 그 2차맵의 도시(시청 자리). 내 도시 창고로(용량 없음, 질문 411).
// 시설이 있으면 시설, 없으면 창고·도시 가운데 지금 자리에서 가장 가까운 곳.
import { conditionWorks } from "@terra/shared/facilityRuntime";
import { buildingLocation, cargoLocation, cityLocation } from "@terra/shared/goodsPlaces";
import type { Ledger } from "../economy/ledger.ts";
import { assetWeightG, buildingCell, type PlaceWorld } from "../facilities/places.ts";
import { type StorageContext, roomGrams } from "../facilities/storage.ts";
import { type GatherRules, cellDistance2, stationBuffs } from "./rules.ts";

export type DepositKind = "camp" | "storage" | "city";

/** 넣는 곳 하나 */
export interface Deposit {
  readonly kind: DepositKind;
  /** 시설·창고 = 건물 ID, 도시 = 도시 ID */
  readonly id: number;
  /** 원장 위치(넣으면 가는 곳) */
  readonly location: number;
  /** 걸어갈 기준 칸(건물 = 건물 기준 칸, 도시 = 도시 자리) — 둘레의 설 칸으로 간다 */
  readonly x: number;
  readonly y: number;
}

/** 시설(벌목장·광산) 하나: 맡는 종류의 반경 안 오브젝트에 쓴다 */
export interface Camp {
  readonly buildingId: number;
  readonly level: number;
  readonly x: number;
  readonly y: number;
}

/** 그 시설이 다 지었고 일하나(상태 문턱) */
function built(world: PlaceWorld, buildingId: number, works: (id: number) => boolean): number | null {
  const record = world.facilities.get(buildingId);
  if (!record || record.level < 1 || !works(buildingId)) return null;
  const rules = world.catalog().facility(record.facilityId);
  return rules ? record.level : null;
}

/**
 * 오브젝트를 맡는 시설: 그 2차맵에서 시설 ID가 facilityId인 다 지은·일하는 건물 가운데 오브젝트가 그 시설 레벨의 반경(stationBuffs) 안인 가장
 * 가까운 것. ownerId가 null이면 주인을 가리지 않는다(다시 자람 버프), 아니면 그 주인 것만(넣는 곳·수확 버프)
 */
export function campFor(
  world: PlaceWorld,
  mapKey: number,
  facilityId: string | null,
  object: { readonly x: number; readonly y: number },
  rules: GatherRules,
  ownerId: number | null,
  works: (id: number) => boolean,
): Camp | undefined {
  if (facilityId === null) return undefined;
  const map = world.maps.get(mapKey);
  if (!map) return undefined;
  let best: Camp | undefined;
  let bestDistance = 0;
  map.forEachBuilding((building) => {
    const record = world.facilities.get(building.id);
    if (record?.facilityId !== facilityId) return;
    if (ownerId !== null && building.ownerId !== ownerId) return;
    const level = built(world, building.id, works);
    if (level === null) return;
    const radius = stationBuffs(rules, level).radiusCells;
    const distance = cellDistance2(building.x, building.y, object.x, object.y);
    if (distance > radius * radius) return;
    if (!best || distance < bestDistance || (distance === bestDistance && building.id < best.buildingId)) {
      best = { buildingId: building.id, level, x: building.x, y: building.y };
      bestDistance = distance;
    }
  });
  return best;
}

/** 시설에 넣으면 가는 원장 위치 = 그 시설 창고(채집소 창고 — 주인 도시 창고로는 station.ts가 옮긴다) */
export function campDeposit(camp: Camp): Deposit {
  return {
    kind: "camp",
    id: camp.buildingId,
    location: buildingLocation(camp.buildingId),
    x: camp.x,
    y: camp.y,
  };
}

/** 창고 시설·도시 가운데 (fromX, fromY)에서 가장 가까운 넣는 곳(자리가 남은 창고만). 없으면 undefined */
export function nearestStore(
  ctx: StorageContext,
  mapKey: number,
  ownerId: number,
  from: { readonly x: number; readonly y: number },
  works: (id: number) => boolean,
  skip: ReadonlySet<string> = new Set(),
): Deposit | undefined {
  const { world } = ctx;
  const candidates: Deposit[] = [];
  world.maps.get(mapKey)?.forEachBuilding((building) => {
    if (building.ownerId !== ownerId || skip.has(`storage:${building.id}`)) return;
    const record = world.facilities.get(building.id);
    const def = record ? world.catalog().facility(record.facilityId) : undefined;
    if (!record || def?.stage !== "storage" || record.level < 1 || !works(building.id)) return;
    if (!conditionWorks(record.conditionPpm, ctx.rules)) return;
    const room = roomGrams(ctx, building.id);
    if (room !== undefined && room <= 0n) return;
    candidates.push({
      kind: "storage",
      id: building.id,
      location: buildingLocation(building.id),
      x: building.x,
      y: building.y,
    });
  });
  for (const city of world.cities())
    if (city.mapKey === mapKey && !skip.has(`city:${city.id}`))
      candidates.push({ kind: "city", id: city.id, location: cityLocation(city.id), x: city.x, y: city.y });
  let best: Deposit | undefined;
  let bestDistance = 0;
  for (const candidate of candidates) {
    const distance = cellDistance2(candidate.x, candidate.y, from.x, from.y);
    if (!best || distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/** 유닛 화물의 그 자산들 무게 합(g) */
export function carriedGrams(
  ctx: Pick<StorageContext, "ledger" | "catalog">,
  ownerId: number,
  unitId: number,
  assets: Iterable<string>,
): bigint {
  let total = 0n;
  for (const asset of assets)
    total += ctx.ledger.balanceOf(ownerId, asset, cargoLocation(unitId)) * assetWeightG(ctx.catalog, asset);
  return total;
}

/** 생산원 → 유닛 화물(채집 한 번). 거래 하나 */
export function gatherIntoCargo(
  ledger: Ledger,
  ownerId: number,
  unitId: number,
  asset: string,
  qty: bigint,
  atMs: number,
): void {
  if (qty <= 0n) return;
  ledger.post({
    kind: "gather_object",
    atMs,
    entries: [
      { account: ledger.systemAccount(`source:${asset}`, asset), amount: -qty },
      { account: ledger.ownerAccount(ownerId, asset, cargoLocation(unitId)), amount: qty },
    ],
  });
}

/**
 * 유닛 화물의 그 자산들을 넣는 곳으로 옮긴다(거래 하나). 건물 창고는 남은 자리(g)까지만(자산 차례대로, 기본 단위로 자른다).
 * 옮긴 기본 단위 합. 0이면 아무것도 쓰지 않는다
 */
export function depositCargo(
  ctx: StorageContext,
  ownerId: number,
  unitId: number,
  assets: Iterable<string>,
  deposit: Deposit,
  atMs: number,
): bigint {
  const { ledger, catalog } = ctx;
  let room =
    deposit.location >= buildingLocation(0)
      ? roomGrams(ctx, deposit.location - buildingLocation(0))
      : undefined;
  const entries: { account: number; amount: bigint }[] = [];
  let moved = 0n;
  for (const asset of [...assets].toSorted()) {
    const balance = ledger.balanceOf(ownerId, asset, cargoLocation(unitId));
    if (balance <= 0n) continue;
    let qty = balance;
    const weight = assetWeightG(catalog, asset);
    if (room !== undefined && weight > 0n) {
      const fits = room / weight;
      if (fits < qty) qty = fits;
      room -= qty * weight;
    }
    if (qty <= 0n) continue;
    entries.push({ account: ledger.ownerAccount(ownerId, asset, cargoLocation(unitId)), amount: -qty });
    entries.push({ account: ledger.ownerAccount(ownerId, asset, deposit.location), amount: qty });
    moved += qty;
  }
  if (entries.length > 0) ledger.post({ kind: "gather_deposit", atMs, entries });
  return moved;
}

/** 건물이 지금 있나(띄운 2차맵) */
export const buildingExists = (world: PlaceWorld, buildingId: number): boolean =>
  buildingCell(world.maps, buildingId) !== undefined;
