// 원자재 오브젝트 채집·건물 들어가기 서비스 시험(DB 없음, 가짜 시계) — docs/adr/2026-11-07-gather-objects.md 3·5절.
// 평평한 시험 2차맵에 바위 지표 묶음 둘(광맥 오브젝트 둘)과 도시 하나를 두고, 내 유닛이 걸어가 캐고(화물 = 원장 유닛 화물 위치), 오브젝트가 떨어지고(다시
// 자라는 시각), 화물이 차면 도시로 걸어가 넣고, 다음 오브젝트로 옮기는 것을 본다. 멈추기·소유·다른 2차맵, 창고 들어가기(넣기)·남의 건물(안에 머묾)
import { performance } from "node:perf_hooks";
import { TERRAIN_SURFACE } from "@terra/protocol";
import { buildingLocation, cargoLocation, cityLocation } from "@terra/shared/goodsPlaces";
import { TEST_SOCIETY_COEFFICIENTS, WALK_SPEED, createLedgerBook } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FacilityCatalog, FacilityDef } from "../facilities/catalog.ts";
import type { PlaceWorld } from "../facilities/places.ts";
import type { FacilityRecord } from "../facilities/state.ts";
import { mapTerrainFromTemp } from "../world/mapTerrain.ts";
import { createInlinePathService } from "../world/pathService.ts";
import { type SecondMap, createSecondMap } from "../world/secondMap.ts";
import { flatTerrain, silentLog } from "../world/testSupport.ts";
import { UNIT_KIND_HUMAN } from "../world/unitKinds.ts";
import { testMapKey } from "../world/world.ts";
import { emptyWorldStats } from "../world/worldStats.ts";
import { gatherIntoCargo } from "./deposit.ts";
import type { GatherKind } from "./kinds.ts";
import { type GatherService, createGatherService } from "./service.ts";
import { createObjectStore } from "./state.ts";

const START = 1_798_000_000_000;
const OWNER = 7;
const USER = "user-a";
const OTHER_USER = "user-b";
const K = [testMapKey(0), testMapKey(1)];
const CITY = 5;
const ORE = "item:copper_ore";
/** 바위 묶음 (2, 2)·(4, 2)의 광맥 자리(objects.test.ts와 같은 셈) */
const FIRST = 16 * 256 + 20;
const SECOND = 16 * 256 + 36;

beforeEach(() => {
  vi.useFakeTimers({ now: START });
});
afterEach(() => {
  vi.useRealTimers();
});

const KINDS: GatherKind[] = [
  {
    id: "ore_vein",
    name: { ko: "광맥", en: "Ore vein" },
    source: "rock",
    arts: [],
    chancePm: 1000,
    item: "copper_ore",
    lots: 1,
    workMs: 10_000,
    uses: 2,
    regrowMs: 600_000,
    facility: null,
    primary: "str",
    secondary: "vit",
  },
];

const STOREHOUSE: FacilityDef = {
  id: "storehouse",
  name: { ko: "창고", en: "Storehouse" },
  stage: "storage",
  maxLevel: 5,
  slotsPerLevel: 0,
  footprint: undefined,
  durability: 100,
  storageKg: 10_000,
  build: undefined,
  repair: undefined,
  gather: undefined,
};

const catalog: FacilityCatalog = {
  facility: (id) => (id === "storehouse" ? STOREHOUSE : undefined),
  facilities: [STOREHOUSE],
  weightOf: () => 1000,
  unitWeightOf: () => 1000,
  itemName: () => ({ ko: "구리 광석", en: "Copper ore" }),
  isGoods: () => true,
  gatherLadder: () => [],
  gatherBands: [],
  lotSize: new Map(),
};

interface Rig {
  maps: Map<number, SecondMap>;
  gather: GatherService;
  ledger: ReturnType<typeof createLedgerBook>;
  facilities: Map<number, FacilityRecord>;
  store: ReturnType<typeof createObjectStore>;
}

function rig(): Rig {
  const maps = new Map<number, SecondMap>();
  const paths = createInlinePathService(
    () => [...maps.values()].map((map) => map.replicaInit()),
    () => performance.now(),
  );
  for (const mapKey of K) {
    const terrain = flatTerrain();
    // 바위 지형 칸 넷씩: 묶음 (2, 2)와 (4, 2)
    for (const t of [8, 9, 10, 11, 16, 17, 18, 19]) terrain.surface[8 * 128 + t] = TERRAIN_SURFACE.rock;
    maps.set(
      mapKey,
      createSecondMap({
        mapKey,
        terrain: mapTerrainFromTemp(mapKey, terrain),
        paths,
        now: () => Date.now(),
        stats: emptyWorldStats(),
        log: silentLog,
        persist: { saveUnit: () => {}, saveBuilding: () => {}, removeBuilding: () => {} },
      }),
    );
  }
  paths.start();
  let accountId = 0;
  let txId = 0;
  const ledger = createLedgerBook({ nextAccountId: () => ++accountId, nextTxId: () => ++txId });
  const facilities = new Map<number, FacilityRecord>();
  const places: PlaceWorld = {
    maps,
    facilities,
    catalog: () => catalog,
    cities: () => [{ id: CITY, mapKey: K[0] ?? 0, x: 100, y: 16 }],
  };
  const store = createObjectStore({ planetId: "s2_test_planet" });
  const rules = {
    ...TEST_SOCIETY_COEFFICIENTS,
    gatherObjects: { ...TEST_SOCIETY_COEFFICIENTS.gatherObjects, carryGrams: 3000, directYieldPm: 1000 },
  };
  const gather = createGatherService({
    maps,
    now: () => Date.now(),
    log: silentLog,
    kinds: () => KINDS,
    rules: () => rules,
    ledger,
    store,
    ownerOf: (userId) => (userId === USER ? OWNER : userId === OTHER_USER ? 8 : undefined),
    places: () => places,
    works: () => true,
    unitBusy: () => false,
    primaries: () => ({ str: 20, dex: 20, agi: 20, vit: 20, int: 20, wis: 20 }),
    pollution: () => 0,
    ready: () => true,
  });
  return { maps, gather, ledger, facilities, store };
}

function placeMine(r: Rig, x: number, y: number, id = 1, mapIndex = 0): void {
  expect(
    r.maps.get(K[mapIndex] ?? 0)?.addUnit({
      id,
      size: 1,
      speed: WALK_SPEED,
      cellX: x,
      cellY: y,
      ownerId: OWNER,
      kind: UNIT_KIND_HUMAN,
    }),
  ).toBe(true);
}

/** 조건이 맞을 때까지 1초씩 민다(상한 maxMs) */
async function until(check: () => boolean, maxMs = 600_000): Promise<void> {
  for (let waited = 0; waited < maxMs && !check(); waited += 1000) await vi.advanceTimersByTimeAsync(1000);
  expect(check()).toBe(true);
}

const loopOf = (r: Rig, unitId = 1) => r.gather.loops(USER).find((loop) => loop.unitId === unitId);

describe("원자재 오브젝트 채집", () => {
  it("걸어가 캐고(화물), 떨어지면 다시 자라는 시각, 화물이 차면 도시에 넣고 다음 오브젝트로", async () => {
    const r = rig();
    expect(r.gather.objects(K[0] ?? 0)?.map((object) => object.id)).toEqual([FIRST, SECOND]);
    placeMine(r, 20, 30);
    expect(await r.gather.start(USER, { unitId: 1, mapKey: K[0] ?? 0, objectId: FIRST })).toEqual({
      ok: true,
    });
    expect(loopOf(r)).toMatchObject({
      phase: "to_object",
      objectId: FIRST,
      kindId: "ore_vein",
      deposit: null,
    });

    // 닿으면 캐기(일 10초 ÷ 진행 속도 1), 한 번 = 묶음 1 × 수확량 2(보조 20 × 80‰) → 화물 2
    await until(() => loopOf(r)?.phase === "gathering");
    await until(() => r.ledger.balanceOf(OWNER, ORE, cargoLocation(1)) === 2n);
    expect(loopOf(r)).toMatchObject({ gatheredLots: 2, carriedGrams: 2000, capacityGrams: 3000 });

    // 두 번째(번수 2)로 떨어진다 → 다시 자라는 시각 = 그때 + 10분. 화물 4kg > 상한 3kg → 도시로
    await until(() => loopOf(r)?.phase === "to_deposit");
    const state = r.store.read(K[0] ?? 0, FIRST, 2, Date.now());
    expect(state.usesLeft).toBe(0);
    expect(state.regrowAtMs).toBeGreaterThan(Date.now());
    expect(loopOf(r)).toMatchObject({ deposit: "city" });

    // 도시에 닿아 넣는다(화물 → 내 도시 창고), 떨어진 오브젝트 대신 반경 안 다음 오브젝트로 간다
    await until(() => r.ledger.balanceOf(OWNER, ORE, cityLocation(CITY)) === 4n);
    expect(r.ledger.balanceOf(OWNER, ORE, cargoLocation(1))).toBe(0n);
    await until(() => loopOf(r)?.objectId === SECOND);
    expect(loopOf(r)).toMatchObject({ depositedUnits: 4 });

    // 멈추기: 남은 그대로 끝(최근 목록), 남의 멈추기는 not_gathering
    expect(r.gather.halt(OTHER_USER, 1)).toEqual({ ok: false, code: "not_gathering" });
    expect(r.gather.halt(USER, 1)).toEqual({ ok: true });
    expect(loopOf(r)).toMatchObject({ phase: "done", stop: "stopped" });
    expect(r.gather.active).toBe(0);
    // 떨어진 오브젝트는 시간이 지나면 다시 가득
    await vi.advanceTimersByTimeAsync(600_000);
    expect(r.store.read(K[0] ?? 0, FIRST, 2, Date.now())).toEqual({ usesLeft: 2, regrowAtMs: 0 });
    r.gather.stop();
  });

  it("소유·자리 검사: 남의 유닛 forbidden, 다른 2차맵 wrong_map, 없는 오브젝트 unknown_object, 길 벗어남 interrupted", async () => {
    const r = rig();
    placeMine(r, 20, 30);
    expect(await r.gather.start(OTHER_USER, { unitId: 1, mapKey: K[0] ?? 0, objectId: FIRST })).toEqual({
      ok: false,
      code: "forbidden",
    });
    expect(await r.gather.start(USER, { unitId: 1, mapKey: K[1] ?? 0, objectId: FIRST })).toEqual({
      ok: false,
      code: "wrong_map",
    });
    expect(await r.gather.start(USER, { unitId: 1, mapKey: K[0] ?? 0, objectId: 1 })).toEqual({
      ok: false,
      code: "unknown_object",
    });
    expect(await r.gather.start(USER, { unitId: 99, mapKey: K[0] ?? 0, objectId: FIRST })).toEqual({
      ok: false,
      code: "unknown_unit",
    });
    // 걷는 중 다른 이동 명령 → 다음 확인에서 길 벗어남
    expect((await r.gather.start(USER, { unitId: 1, mapKey: K[0] ?? 0, objectId: FIRST })).ok).toBe(true);
    await r.maps.get(K[0] ?? 0)?.moveUnit(1, { x: 60 * 1024, y: 60 * 1024 });
    await until(() => loopOf(r)?.phase === "done");
    expect(loopOf(r)).toMatchObject({ stop: "interrupted" });
    r.gather.stop();
  });
});

describe("건물 들어가기", () => {
  it("내 창고: 걸어가 화물을 넣는다. 남의 건물: 안에 머물고 움직이면 나간다", async () => {
    const r = rig();
    const map = r.maps.get(K[0] ?? 0);
    const mine = map?.placeBuilding({ x: 60, y: 40, width: 2, height: 2, rotation: 0 }, OWNER);
    const theirs = map?.placeBuilding({ x: 60, y: 60, width: 2, height: 2, rotation: 0 }, 8);
    if (!mine?.ok || !theirs?.ok || mine.buildingId === undefined || theirs.buildingId === undefined)
      throw new Error("no building");
    const storeId = mine.buildingId;
    r.facilities.set(storeId, {
      buildingId: storeId,
      facilityId: "storehouse",
      level: 1,
      conditionPpm: 1_000_000,
      conditionAtMs: START,
      builtAtMs: START,
      builtBy: USER,
      cityId: CITY,
    });
    placeMine(r, 50, 40);
    gatherIntoCargo(r.ledger, OWNER, 1, ORE, 3n, START);
    expect(await r.gather.enter(USER, { unitId: 1, buildingId: storeId })).toEqual({ ok: true });
    expect(loopOf(r)).toMatchObject({ phase: "entering", buildingId: storeId });
    await until(() => loopOf(r)?.phase === "done");
    expect(loopOf(r)).toMatchObject({ stop: "entered", enterResult: "deposited", depositedUnits: 3 });
    expect(r.ledger.balanceOf(OWNER, ORE, buildingLocation(storeId))).toBe(3n);

    // 남의 건물: 넣을 것도 직무도 없어 안에 머문다
    expect(await r.gather.enter(USER, { unitId: 1, buildingId: theirs.buildingId })).toEqual({ ok: true });
    await until(() => loopOf(r)?.phase === "done");
    expect(loopOf(r)).toMatchObject({ enterResult: "inside" });
    expect(r.gather.insideOf(theirs.buildingId)).toEqual([{ unitId: 1, ownerId: OWNER }]);
    await map?.moveUnit(1, { x: 20 * 1024, y: 20 * 1024 });
    expect(r.gather.insideOf(theirs.buildingId)).toEqual([]);
    // 없는 건물
    expect(await r.gather.enter(USER, { unitId: 1, buildingId: 999 })).toEqual({
      ok: false,
      code: "unknown_building",
    });
    r.gather.stop();
  });
});
