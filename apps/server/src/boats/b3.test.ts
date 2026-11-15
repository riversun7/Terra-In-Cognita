// 배 B3 규칙 시험(docs/adr/2026-11-13-boats.md "바뀜 (2026-11-14, B3)", 기획 D-542):
// - 재료(기획 D-545 1405 "돌려주지 않음", D-542 1321 나 반환을 대체): 만드는 중에 조선소가 없어지면 재료도 잃는다(D-547부터 만들기는 조선소)
// - 1326 나: 배는 보유 유닛 수에서 빠진다(유지비는 그대로 boat_upkeep_pm)
import { START_BOATS, SURFACE_WATER, TEST_SOCIETY_COEFFICIENTS, createLedgerBook } from "@terra/sim";
import { cityLocation } from "@terra/shared/goodsPlaces";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FacilityDef } from "../facilities/catalog.ts";
import { goodsAsset } from "../facilities/materials.ts";
import type { PlaceWorld } from "../facilities/places.ts";
import type { FacilityRecord } from "../facilities/state.ts";
import { createTestMap, flatTerrain } from "../world/testSupport.ts";
import { UNIT_KIND_BOAT, UNIT_KIND_CYBORG, UNIT_KIND_HUMAN, countsAsOwnedUnit } from "../world/unitKinds.ts";
import { upkeepWeightOf } from "../world/upkeepWeights.ts";
import { MAX_STORED_OBJECT_ID, createObjectStore } from "../gather/state.ts";
import { SCHOOL_ID_BASE } from "../gather/terrainObjects.ts";
import { createBoatService } from "./service.ts";
import { materialsOf } from "./store.ts";

const START = 1_798_000_000_000;
const CITY = 3;

function coastTerrain() {
  const terrain = flatTerrain();
  for (let ty = 0; ty < 128; ty++)
    for (let tx = 64; tx < 128; tx++) terrain.surface[ty * 128 + tx] = SURFACE_WATER;
  return terrain;
}

const DOCK_DEF: FacilityDef = {
  id: "shipyard",
  name: { ko: "조선소", en: "Shipyard" },
  harbor: "shipyard",
  boats: [
    {
      id: "rowboat",
      name: { ko: "작은 배", en: "Rowboat" },
      materials: [{ item: "pine_log", qty: 14 }],
      buildMs: 60_000,
      speedPm: 1000,
      capacity: 4,
    },
  ],
  stage: "transport",
  maxLevel: 3,
  slotsPerLevel: 0,
  footprint: { width: 3, height: 3 },
  needsWaterWithin: 1,
  durability: 180,
  storageKg: undefined,
  build: { mulPm: 1000, levels: [{ from: 1, materials: [{ item: "pine_log", qty: 14 }] }] },
  repair: undefined,
  gather: undefined,
};

function ledgerBook() {
  let accountId = 0;
  let txId = 0;
  return createLedgerBook({ nextAccountId: () => ++accountId, nextTxId: () => ++txId });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});
afterEach(() => vi.useRealTimers());

describe("배 재료는 돌려주지 않음(D-545 1405)", () => {
  it("작업 줄 jsonb: 아이템·양만 읽는다(B3 줄의 뺀 자리는 버린다)", () => {
    expect(
      materialsOf(
        JSON.stringify([
          { item: "pine_log", qty: 3, location: 5 },
          { item: "stone", qty: 2 },
          { item: 7, qty: 1 },
        ]),
      ),
    ).toEqual([
      { item: "pine_log", qty: 3 },
      { item: "stone", qty: 2 },
    ]);
  });

  it("만드는 중에 조선소가 부서지면 작업은 버리고 재료는 돌아오지 않는다", async () => {
    const { map } = createTestMap({ terrain: coastTerrain() });
    const maps = new Map([[map.mapKey, map]]);
    const facilities = new Map<number, FacilityRecord>();
    const places: PlaceWorld = {
      maps,
      facilities,
      /* oxlint-disable typescript/no-unsafe-type-assertion -- 시험: 조선소 정의만 쓰는 가짜 목록 */
      catalog: () =>
        ({
          facility: (id: string) => (id === "shipyard" ? DOCK_DEF : undefined),
          facilities: [DOCK_DEF],
          itemName: () => undefined,
        }) as never,
      /* oxlint-enable typescript/no-unsafe-type-assertion */
      cities: () => [{ id: CITY, mapKey: map.mapKey, x: 100, y: 40 }],
    };
    const ledger = ledgerBook();
    const asset = goodsAsset("pine_log");
    ledger.post({
      kind: "test",
      atMs: START,
      entries: [
        { account: ledger.systemAccount(`source:${asset}`, asset), amount: -20n },
        { account: ledger.ownerAccount(7, asset, cityLocation(CITY)), amount: 20n },
      ],
    });
    const errors: object[] = [];
    const service = createBoatService({
      maps,
      now: () => Date.now(),
      log: { error: (obj) => errors.push(obj) },
      ledger,
      rules: () => START_BOATS,
      nextUnitId: () => 500,
      ownerOf: () => 7,
      places: () => places,
      works: () => true,
      unitBusy: () => false,
      manual: true,
    });
    const placed = map.placeBuilding({ x: 125, y: 40, width: 3, height: 3, rotation: 0 }, 7);
    if (!placed.ok || placed.buildingId === undefined) throw new Error("dock not placed");
    const dockId = placed.buildingId;
    facilities.set(dockId, {
      buildingId: dockId,
      facilityId: "shipyard",
      level: 1,
      conditionPpm: 1_000_000,
      conditionAtMs: START,
      builtAtMs: START,
      builtBy: "player",
      cityId: CITY,
    });
    expect(service.build("player", dockId, false)).toEqual({ ok: true, readyAtMs: START + 60_000 });
    expect(ledger.balanceOf(7, asset, cityLocation(CITY))).toBe(6n);
    // 조선소가 없어짐(전투·치움)
    map.removeBuilding(dockId);
    facilities.delete(dockId);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(service.building).toBe(0);
    // 창고는 뺀 그대로(6), 뺀 14는 시스템 소비 계정에 남는다(어느 자리로도 돌아오지 않음)
    expect(ledger.balanceOf(7, asset, cityLocation(CITY))).toBe(6n);
    let owned = 0n;
    for (const account of ledger.accounts())
      if (account.ownerId === 7 && account.asset === asset) owned += account.balance;
    expect(owned).toBe(6n);
    expect(ledger.balance(ledger.systemAccount(`sink:${asset}`, asset))).toBe(14n);
    // 배도 뜨지 않는다
    expect(map.unitInfo(500)).toBeUndefined();
    expect(errors).toHaveLength(1);
    service.stop();
  });
});

describe("배 B3: 보유 유닛 수(1326 나)", () => {
  it("배와 사이보그 본체는 보유 유닛 수에 들지 않고, 배 유지비는 그대로", () => {
    expect(countsAsOwnedUnit(UNIT_KIND_HUMAN)).toBe(true);
    expect(countsAsOwnedUnit(UNIT_KIND_BOAT)).toBe(false);
    expect(countsAsOwnedUnit(UNIT_KIND_CYBORG)).toBe(false);
    expect(upkeepWeightOf(() => TEST_SOCIETY_COEFFICIENTS)(UNIT_KIND_BOAT)).toBe(
      TEST_SOCIETY_COEFFICIENTS.boats.upkeepPm,
    );
  });
});

describe("배 B3: 어군 상태 저장", () => {
  it("움직이는 어군(번호 65,536부터)은 표에 쓰지 않고 메모리에만 둔다 — 배치 칸 오브젝트는 그대로 쓴다", () => {
    const rows: Record<string, unknown>[] = [];
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 시험: upsert만 쓰는 가짜 쓰기 대기열
    const writer = { upsert: (_table: string, row: Record<string, unknown>) => rows.push(row) } as never;
    const store = createObjectStore({ planetId: "s2_test_planet", writer });
    expect(SCHOOL_ID_BASE).toBeGreaterThan(MAX_STORED_OBJECT_ID);
    expect(store.take(9, SCHOOL_ID_BASE + 3, 4, START, () => 1000)).toBe(true);
    expect(store.read(9, SCHOOL_ID_BASE + 3, 4, START).usesLeft).toBe(3);
    expect(rows).toHaveLength(0);
    expect(store.take(9, 1234, 4, START, () => 1000)).toBe(true);
    expect(rows).toMatchObject([{ object_id: 1234, uses_left: 3 }]);
  });
});
