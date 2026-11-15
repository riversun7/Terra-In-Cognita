// 배 시험 공용 준비(시험 도우미 — service.test.ts·dock.test.ts가 쓴다): 바닷가 2차맵(배치 칸 x ≥ 128이 바다)·조선소·정박장·교역 부두 정의·가짜 원장·쓰기 고리.
import { START_BOATS, SURFACE_WATER, anchorAt, createLedgerBook, type Point } from "@terra/sim";
import type { FacilityDef } from "../facilities/catalog.ts";
import type { PlaceWorld } from "../facilities/places.ts";
import type { FacilityRecord } from "../facilities/state.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { createTestMap, flatTerrain } from "../world/testSupport.ts";
import { UNIT_KIND_BOAT } from "../world/unitKinds.ts";
import { createBoatService } from "./service.ts";

export const START = 1_798_000_000_000;
export const CREDIT = "s3_test_credit";
/** 지형 칸 x ≥ 64(배치 칸 x ≥ 128)가 바다인 2차맵 */
export function coastTerrain() {
  const terrain = flatTerrain();
  for (let ty = 0; ty < 128; ty++)
    for (let tx = 64; tx < 128; tx++) terrain.surface[ty * 128 + tx] = SURFACE_WATER;
  return terrain;
}

const base = {
  stage: "transport",
  maxLevel: 3,
  slotsPerLevel: 0,
  footprint: { width: 3, height: 3 },
  needsWaterWithin: 1,
  durability: 200,
  storageKg: undefined,
  build: { mulPm: 1000, levels: [{ from: 1, materials: [{ item: "pine_log", qty: 14 }] }] },
  repair: undefined,
  gather: undefined,
} as const;
export const SHIPYARD: FacilityDef = {
  ...base,
  id: "shipyard",
  name: { ko: "조선소", en: "Shipyard" },
  harbor: "shipyard",
  boats: [
    {
      id: "rowboat",
      name: { ko: "작은 배", en: "Rowboat" },
      materials: [{ item: "pine_log", qty: 10 }],
      buildMs: 600_000,
      speedPm: 1000,
      capacity: 2,
    },
    {
      id: "cargo_boat",
      name: { ko: "짐배", en: "Cargo boat" },
      materials: [{ item: "plank", qty: 4 }],
      buildMs: 1_200_000,
      speedPm: 500,
      capacity: 6,
    },
  ],
};
export const BERTH: FacilityDef = {
  ...base,
  id: "dock",
  name: { ko: "정박장", en: "Berth" },
  harbor: "berth",
};
export const TRADE: FacilityDef = {
  ...base,
  id: "trade_dock",
  name: { ko: "교역 부두", en: "Trade dock" },
  harbor: "trade_dock",
};
const DEFS = [SHIPYARD, BERTH, TRADE];

export function setup(extra: Partial<Parameters<typeof createBoatService>[0]> = {}) {
  const test = createTestMap({ terrain: coastTerrain() });
  const maps = new Map([[test.map.mapKey, test.map]]);
  const facilities = new Map<number, FacilityRecord>();
  const places: PlaceWorld = {
    maps,
    facilities,
    /* oxlint-disable typescript/no-unsafe-type-assertion -- 시험: 배 시설 정의만 쓰는 가짜 목록 */
    catalog: () =>
      ({
        facility: (id: string) => DEFS.find((def) => def.id === id),
        facilities: DEFS,
        itemName: () => undefined,
      }) as never,
    /* oxlint-enable typescript/no-unsafe-type-assertion */
    cities: () => [],
  };
  let nextId = 500;
  let accountId = 0;
  let txId = 0;
  const ledger = createLedgerBook({ nextAccountId: () => ++accountId, nextTxId: () => ++txId });
  const owners = new Map([
    ["player", 7],
    ["other", 8],
    ["p9", 9],
  ]);
  const saved = new Map<string, Record<string, unknown>>();
  const errors: object[] = [];
  const writer = {
    upsert: (table: string, row: Record<string, unknown>) =>
      saved.set(`${table}:${String(row.id ?? row.boat_id ?? row.building_id)}`, row),
    remove: (table: string, key: Record<string, unknown>) =>
      saved.delete(`${table}:${String(key.id ?? key.boat_id ?? key.building_id)}`),
  };
  const service = createBoatService({
    maps,
    now: () => Date.now(),
    log: { error: (obj, message) => errors.push({ ...obj, message }) },
    ledger,
    rules: () => START_BOATS,
    nextUnitId: () => ++nextId,
    ownerOf: (userId) => owners.get(userId),
    places: () => places,
    works: () => true,
    unitBusy: () => false,
    nationOf: (ownerId) => (ownerId === 7 || ownerId === 8 ? 1 : 2),
    feeAsset: CREDIT,
    writer,
    manual: true,
    ...extra,
  });
  /** 시설을 짓는다(다 지은 레벨, 주인 7) */
  const place = (def: FacilityDef, y: number, owner = 7, level = 1): number => {
    const placed = test.map.placeBuilding({ x: 125, y, width: 3, height: 3, rotation: 0 }, owner);
    if (!placed.ok || placed.buildingId === undefined) throw new Error("not placed");
    facilities.set(placed.buildingId, {
      buildingId: placed.buildingId,
      facilityId: def.id,
      level,
      conditionPpm: 1_000_000,
      conditionAtMs: START,
      builtAtMs: START,
      builtBy: "player",
      cityId: null,
    });
    return placed.buildingId;
  };
  /** 시험 화폐·재료를 준다 */
  const grant = (ownerId: number, asset: string, qty: bigint, location: number | null = null) =>
    ledger.post({
      kind: "test_grant",
      atMs: START,
      entries: [
        { account: ledger.systemAccount(`issue:${asset}`, asset), amount: -qty },
        { account: ledger.ownerAccount(ownerId, asset, location), amount: qty },
      ],
    });
  return { ...test, service, facilities, maps, ledger, place, grant, saved, errors };
}

/** 유닛이 지금 선 기준 칸 */
export const cellOf = (point: Point, size: 1 | 2 = 1) => anchorAt(point, size);

/** 맵의 배 ID */
export const boatsOn = (map: SecondMap): number[] => {
  const out: number[] = [];
  map.forEachUnit((unit) => {
    if (unit.kind === UNIT_KIND_BOAT) out.push(unit.id);
  });
  return out;
};
