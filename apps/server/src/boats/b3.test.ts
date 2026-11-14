// 배 B3 규칙 시험(docs/adr/2026-11-13-boats.md "바뀜 (2026-11-14, B3)", 기획 D-542):
// - 1321 나: 만드는 중에 부두가 없어지면 뺀 재료를 뺀 자리로 돌려준다
// - 1326 나: 배는 보유 유닛 수에서 빠진다(유지비는 그대로 boat_upkeep_pm)
import { START_BOATS, SURFACE_WATER, TEST_SOCIETY_COEFFICIENTS, createLedgerBook } from "@terra/sim";
import { buildingLocation, cargoLocation, cityLocation } from "@terra/shared/goodsPlaces";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FacilityDef } from "../facilities/catalog.ts";
import { goodsAsset, refundGoods, spendGoodsTaken } from "../facilities/materials.ts";
import type { PlaceWorld } from "../facilities/places.ts";
import type { FacilityRecord } from "../facilities/state.ts";
import { createTestMap, flatTerrain } from "../world/testSupport.ts";
import { UNIT_KIND_BOAT, UNIT_KIND_CYBORG, UNIT_KIND_HUMAN, countsAsOwnedUnit } from "../world/unitKinds.ts";
import { upkeepWeightOf } from "../world/upkeepWeights.ts";
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
  id: "dock",
  name: { ko: "부두", en: "Dock" },
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

describe("배 B3: 재료 돌려주기(1321 나)", () => {
  it("뺀 자리마다 양을 적고, 돌려주면 그 자리로 간다(없어진 자리는 바꾼 자리로)", () => {
    const ledger = ledgerBook();
    const asset = goodsAsset("pine_log");
    const fund = (location: number | null, qty: bigint) =>
      ledger.post({
        kind: "test",
        atMs: START,
        entries: [
          { account: ledger.systemAccount(`source:${asset}`, asset), amount: -qty },
          { account: ledger.ownerAccount(7, asset, location), amount: qty },
        ],
      });
    fund(cityLocation(CITY), 10n);
    fund(cargoLocation(42), 10n);
    const taken = spendGoodsTaken(ledger, 7, [{ item: "pine_log", qty: 14 }], START, "boat_build", [
      cityLocation(CITY),
      cargoLocation(42),
    ]);
    expect(taken).toEqual([
      { item: "pine_log", qty: 10, location: cityLocation(CITY) },
      { item: "pine_log", qty: 4, location: cargoLocation(42) },
    ]);
    expect(ledger.balanceOf(7, asset, cityLocation(CITY))).toBe(0n);
    expect(spendGoodsTaken(ledger, 7, [{ item: "pine_log", qty: 99 }], START, "x", "anywhere")).toBe(
      undefined,
    );
    // 유닛 42가 없어졌으면 그 몫은 위치 없음으로
    const rows = refundGoods(ledger, 7, taken ?? [], START, "boat_refund", (location) =>
      location === cargoLocation(42) ? null : location,
    );
    expect(rows).toBe(2);
    expect(ledger.balanceOf(7, asset, cityLocation(CITY))).toBe(10n);
    expect(ledger.balanceOf(7, asset, null)).toBe(4n);
    expect(ledger.balanceOf(7, asset, cargoLocation(42))).toBe(6n);
  });

  it("작업 줄 jsonb: 자리를 읽고, 옛 줄(자리 없음)은 null", () => {
    expect(
      materialsOf(
        JSON.stringify([
          { item: "pine_log", qty: 3, location: 5 },
          { item: "stone", qty: 2 },
          { item: 7, qty: 1 },
        ]),
      ),
    ).toEqual([
      { item: "pine_log", qty: 3, location: 5 },
      { item: "stone", qty: 2, location: null },
    ]);
  });

  it("만드는 중에 부두가 부서지면 재료가 뺀 도시 창고로 돌아온다", async () => {
    const { map } = createTestMap({ terrain: coastTerrain() });
    const maps = new Map([[map.mapKey, map]]);
    const facilities = new Map<number, FacilityRecord>();
    const places: PlaceWorld = {
      maps,
      facilities,
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 시험: 부두 정의만 쓰는 가짜 목록
      catalog: () => ({ facility: (id: string) => (id === "dock" ? DOCK_DEF : undefined) }) as never,
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
      dockBuildMs: () => 60_000,
    });
    const placed = map.placeBuilding({ x: 125, y: 40, width: 3, height: 3, rotation: 0 }, 7);
    if (!placed.ok || placed.buildingId === undefined) throw new Error("dock not placed");
    const dockId = placed.buildingId;
    facilities.set(dockId, {
      buildingId: dockId,
      facilityId: "dock",
      level: 1,
      conditionPpm: 1_000_000,
      conditionAtMs: START,
      builtAtMs: START,
      builtBy: "player",
      cityId: CITY,
    });
    expect(service.build("player", dockId, false)).toEqual({ ok: true, readyAtMs: START + 60_000 });
    expect(ledger.balanceOf(7, asset, cityLocation(CITY))).toBe(6n);
    // 부두가 없어짐(전투·치움)
    map.removeBuilding(dockId);
    facilities.delete(dockId);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(service.building).toBe(0);
    expect(ledger.balanceOf(7, asset, cityLocation(CITY))).toBe(20n);
    expect(ledger.balanceOf(7, asset, buildingLocation(dockId))).toBe(0n);
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
