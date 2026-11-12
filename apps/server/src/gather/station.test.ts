// 채집소 시험(DB 없음, 가짜 시계) — 사용자 지적(2026-11-08) "원자재채집소의 기능도 필요", docs/adr/2026-11-07-gather-objects.md "바뀜 (2026-11-08 …)".
// 평평한 시험 2차맵에 바위 지표 묶음 둘(광맥 오브젝트 둘)·도시 하나·내 광산 하나를 두고: 레벨 버프(반경·수확·피로·다시 자람), 일꾼 산출 계획(반경 안
// 남은 번수 = 묶음 상한, 가까운 오브젝트부터 씀, 막히면 상태), 창고 가득, 수확 배율 굴림, 정산 뒤 피로 덜기, 자동 옮김(주인 몫만 도시 창고로)을 본다.
// 농장(오브젝트 없는 facility 채집소, 기획 정리 756 ②): 묶음 상한 없음(창고가 가득일 때만 0)·오브젝트를 쓰지 않음·수확 배율·피로 덜기·자동 옮김.
import { performance } from "node:perf_hooks";
import { TERRAIN_SURFACE } from "@terra/protocol";
import { buildingLocation, cargoLocation, cityLocation } from "@terra/shared/goodsPlaces";
import {
  JOB_GATHER,
  PHASE_WORK,
  TEST_SOCIETY_COEFFICIENTS,
  WALK_SPEED,
  createLedgerBook,
  walkMsPerCell,
} from "@terra/sim";
import { describe, expect, it } from "vitest";
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
import type { GatherKind } from "./kinds.ts";
import { placeGatherObjects } from "./objects.ts";
import { stationBuffs } from "./rules.ts";
import { createObjectStore } from "./state.ts";
import { createStationRuntime, fatigueRefundPm, scaleByPm } from "./station.ts";
import { mapLayers } from "./terrainLayers.ts";

const NOW = 1_798_000_000_000;
const OWNER = 7;
const TENANT = 8;
const MAP = testMapKey(0);
const CITY = 5;
const ORE = "item:copper_ore";
const CROP = "item:potato";
/** 바위 묶음 (2, 2)·(4, 2)의 광맥 자리(service.test.ts와 같은 셈) */
const FIRST = 16 * 256 + 20;
const SECOND = 16 * 256 + 36;

const KINDS: GatherKind[] = [
  {
    id: "ore_vein",
    name: { ko: "광맥", en: "Ore vein" },
    source: "rock",
    arts: [],
    chancePm: 1000,
    art: 0,
    surfaces: [],
    minCells: 0,
    material: null,
    direct: true,
    item: "copper_ore",
    lots: 1,
    workMs: 10_000,
    uses: 2,
    regrowMs: 600_000,
    facility: "mine",
    primary: "str",
    secondary: "vit",
  },
];

const MINE: FacilityDef = {
  id: "mine",
  name: { ko: "광산", en: "Mine" },
  stage: "gather",
  maxLevel: 5,
  slotsPerLevel: 10,
  footprint: undefined,
  durability: 100,
  storageKg: 200,
  build: undefined,
  repair: undefined,
  gather: {
    primary: "str",
    secondary: "vit",
    subcategory: "ore",
    yieldBase: 1,
    yieldPerStatPm: 100,
    yieldCap: 10,
  },
};

const FARM: FacilityDef = {
  ...MINE,
  id: "farm",
  name: { ko: "농장", en: "Farm" },
  storageKg: 300,
  gather: {
    primary: "vit",
    secondary: "int",
    subcategory: "crop",
    mode: "select",
    yieldBase: 1,
    yieldPerStatPm: 80,
    yieldCap: 8,
  },
};

/** 창고(창고 단계 — 옮김 거리의 목적지, 질문 1050 가) */
const STORE: FacilityDef = { ...FARM, id: "storehouse", stage: "storage", gather: undefined };

const catalog: FacilityCatalog = {
  facility: (id) => (id === "mine" ? MINE : id === "farm" ? FARM : id === "storehouse" ? STORE : undefined),
  facilities: [MINE, FARM, STORE],
  weightOf: () => 1000,
  unitWeightOf: () => 1,
  itemName: () => ({ ko: "구리 광석", en: "Copper ore" }),
  isGoods: () => true,
  gatherLadder: () => [],
  gatherBands: [],
  lotSize: new Map(),
};

function rig(
  level: number | { store?: { x: number; y: number } | undefined; haulMode?: number | undefined } = 1,
) {
  const opts = typeof level === "number" ? {} : level;
  if (typeof level !== "number") level = 1;
  const maps = new Map<number, SecondMap>();
  const paths = createInlinePathService(
    () => [...maps.values()].map((map) => map.replicaInit()),
    () => performance.now(),
  );
  const terrain = flatTerrain();
  for (const t of [8, 9, 10, 11, 16, 17, 18, 19]) terrain.surface[8 * 128 + t] = TERRAIN_SURFACE.rock;
  const map = createSecondMap({
    mapKey: MAP,
    terrain: mapTerrainFromTemp(MAP, terrain),
    paths,
    now: () => NOW,
    stats: emptyWorldStats(),
    log: silentLog,
    persist: { saveUnit: () => {}, saveBuilding: () => {}, removeBuilding: () => {} },
  });
  maps.set(MAP, map);
  // 첫 광맥(20, 16)에 더 가까운 자리
  const placed = map.placeBuilding({ x: 22, y: 24, width: 3, height: 3, rotation: 0 }, OWNER);
  if (!placed.ok || placed.buildingId === undefined) throw new Error("no building");
  const mineId = placed.buildingId;
  // 농장(오브젝트 없음)은 광맥에서 먼 자리
  const farmPlaced = map.placeBuilding({ x: 80, y: 80, width: 3, height: 3, rotation: 0 }, OWNER);
  if (!farmPlaced.ok || farmPlaced.buildingId === undefined) throw new Error("no farm");
  const farmId = farmPlaced.buildingId;
  const record = (buildingId: number, facilityId: string): FacilityRecord => ({
    buildingId,
    facilityId,
    level,
    conditionPpm: 1_000_000,
    conditionAtMs: NOW,
    builtAtMs: NOW,
    builtBy: null,
    cityId: CITY,
  });
  const facilities = new Map<number, FacilityRecord>([
    [mineId, record(mineId, "mine")],
    [farmId, record(farmId, "farm")],
  ]);
  if (opts.store) {
    const stored = map.placeBuilding(
      { x: opts.store.x, y: opts.store.y, width: 3, height: 3, rotation: 0 },
      OWNER,
    );
    if (!stored.ok || stored.buildingId === undefined) throw new Error("no store");
    facilities.set(stored.buildingId, record(stored.buildingId, "storehouse"));
  }
  const places: PlaceWorld = {
    maps,
    facilities,
    catalog: () => catalog,
    cities: () => [{ id: CITY, mapKey: MAP, x: 100, y: 16 }],
  };
  let accountId = 0;
  let txId = 0;
  const ledger = createLedgerBook({ nextAccountId: () => ++accountId, nextTxId: () => ++txId });
  const store = createObjectStore({ planetId: "s2_test_planet" });
  const objects = placeGatherObjects(mapLayers(map), KINDS);
  const workers = new Map<number, number[]>();
  const runtime = createStationRuntime({
    maps,
    now: () => NOW,
    log: silentLog,
    kinds: () => KINDS,
    rules: () =>
      opts.haulMode === undefined
        ? TEST_SOCIETY_COEFFICIENTS
        : {
            ...TEST_SOCIETY_COEFFICIENTS,
            logistics: { ...TEST_SOCIETY_COEFFICIENTS.logistics, haulMode: opts.haulMode },
          },
    ledger,
    store,
    places: () => places,
    works: () => true,
    objects: () => objects,
    pollution: () => 0,
    timers: false,
    workersAt: (buildingId) =>
      (workers.get(buildingId) ?? []).map((unitId) => ({ unitId, workerOwnerId: OWNER })),
  });
  /** 그 채집소 일꾼(운반꾼 후보)으로 유닛을 놓는다 */
  const hire = (buildingId: number, unitId: number, cellX: number, cellY: number): void => {
    map.addUnit({
      id: unitId,
      size: 1,
      speed: WALK_SPEED,
      cellX,
      cellY,
      ownerId: OWNER,
      kind: UNIT_KIND_HUMAN,
    });
    workers.set(buildingId, [...(workers.get(buildingId) ?? []), unitId]);
  };
  return { maps, map, mineId, farmId, ledger, store, runtime, objects, hire };
}

const commitOf = (made: number, lots: number, capped = false, clipped = false) => ({
  made,
  lots,
  capped,
  clipped,
  outputs: [],
});

describe("채집소 레벨 버프", () => {
  it("반경 = 기본 + 레벨 걸음, 수확 = 레벨 효율, 피로·다시 자람 = 기본 − 레벨 걸음(하한)", () => {
    const rules = TEST_SOCIETY_COEFFICIENTS.gatherObjects;
    expect(stationBuffs(rules, 1)).toEqual({ radiusCells: 40, yieldPm: 1000, fatiguePm: 500, regrowPm: 500 });
    expect(stationBuffs(rules, 3)).toEqual({ radiusCells: 48, yieldPm: 1400, fatiguePm: 400, regrowPm: 400 });
    // 하한 200‰
    expect(stationBuffs(rules, 20)).toMatchObject({ fatiguePm: 200, regrowPm: 200 });
    // 기본이 하한보다 작으면 기본 그대로
    expect(stationBuffs({ ...rules, campFatiguePm: 100 }, 5).fatiguePm).toBe(100);
  });

  it("수확 배율 굴림은 결정적이고 기댓값이 배율이다, 피로 덜기는 막히면 모두", () => {
    expect(scaleByPm(10n, 1400, 1, 3, ORE)).toBe(14n);
    expect(scaleByPm(5n, 1000, 1, 3, ORE)).toBe(5n);
    let total = 0n;
    for (let seq = 0; seq < 1000; seq++) total += scaleByPm(1n, 1500, 9, seq, ORE);
    expect(total).toBeGreaterThan(1400n);
    expect(total).toBeLessThan(1600n);
    expect(scaleByPm(1n, 1500, 9, 7, ORE)).toBe(scaleByPm(1n, 1500, 9, 7, ORE));
    expect(fatigueRefundPm(4, 1, false, 500)).toBe(2000);
    expect(fatigueRefundPm(4, 0, true, 500)).toBe(4000);
    expect(fatigueRefundPm(4, 2, true, 400)).toBe(2400);
  });
});

describe("채집소 일꾼 산출·창고", () => {
  it("묶음 상한 = 반경 안 남은 번수, 가까운 오브젝트부터 쓰고, 떨어지면 오브젝트 없음", () => {
    const r = rig();
    const site = r.runtime.site(r.mineId);
    expect(site).toMatchObject({ kind: "objects", level: 1, works: true, cityId: CITY, ownerId: OWNER });
    if (!site) throw new Error("no site");
    expect(r.runtime.objectsIn(site, NOW).map((entry) => entry.object.id)).toEqual([FIRST, SECOND]);

    const plan = r.runtime.hook.plan(r.mineId, 1, null);
    expect(plan?.maxLots).toBe(4);
    plan?.commit(commitOf(60, 3));
    expect(r.store.read(MAP, FIRST, 2, NOW)).toMatchObject({ usesLeft: 0 });
    // 떨어진 첫 광맥은 채집소 반경 안이라 다시 자람 500‰(10분 → 5분)
    expect(r.store.read(MAP, FIRST, 2, NOW).regrowAtMs).toBe(NOW + 300_000);
    expect(r.store.read(MAP, SECOND, 2, NOW).usesLeft).toBe(1);
    expect(r.runtime.status(1)).toMatchObject({ buildingId: r.mineId, state: "working", lots: 3 });

    const again = r.runtime.hook.plan(r.mineId, 1, null);
    expect(again?.maxLots).toBe(1);
    again?.commit(commitOf(60, 1, true));
    expect(r.runtime.status(1)).toMatchObject({ state: "no_objects", lots: 4 });
    expect(r.runtime.hook.plan(r.mineId, 1, null)?.maxLots).toBe(0);
  });

  it("창고가 가득이면 묶음 0·창고 가득, 레벨 3이면 수확 배율 1400‰", () => {
    const r = rig(3);
    const full = r.runtime.hook.plan(r.mineId, 1, 0n);
    expect(full?.maxLots).toBe(0);
    full?.commit(commitOf(30, 0));
    expect(r.runtime.status(1)).toMatchObject({ state: "storage_full" });
    const plan = r.runtime.hook.plan(r.mineId, 1, 1000n);
    expect(plan?.scale(ORE, 10n, 1)).toBe(14n);
    // 채집소가 아닌 건물은 계획이 없다(예전처럼 낸다)
    expect(r.runtime.hook.plan(999, 1, null)).toBeUndefined();
  });

  it("정산 뒤 피로 덜기(일한 주기 × (1000 − 피로 배율)), 나머지는 들고 간다", () => {
    const r = rig();
    expect(
      r.map.addUnit({
        id: 1,
        size: 1,
        speed: WALK_SPEED,
        cellX: 30,
        cellY: 30,
        ownerId: OWNER,
        kind: UNIT_KIND_HUMAN,
      }),
    ).toBe(true);
    r.map.setJob(1, { job: JOB_GATHER, phase: PHASE_WORK, progressMs: 0, fatigue: 10 });
    r.runtime.hook.plan(r.mineId, 1, null)?.commit(commitOf(5, 1));
    // 남의 정산에는 건드리지 않는다
    r.runtime.hook.afterSettle(TENANT);
    expect(r.map.unitInfo(1)?.job.fatigue).toBe(10);
    // 5주기 × 500‰ = 2.5점 → 2점 덜고 0.5점은 다음에
    r.runtime.hook.afterSettle(OWNER);
    expect(r.map.unitInfo(1)?.job.fatigue).toBe(8);
    r.runtime.hook.plan(r.mineId, 1, null)?.commit(commitOf(1, 1));
    r.runtime.hook.afterSettle(OWNER);
    expect(r.map.unitInfo(1)?.job.fatigue).toBe(7);
  });

  it("자동 옮김: 채집소 창고의 주인 몫 물자만 그 도시 창고로(임차인 몫은 그대로)", () => {
    const r = rig();
    const here = buildingLocation(r.mineId);
    r.ledger.post({
      kind: "test",
      atMs: NOW,
      entries: [
        { account: r.ledger.systemAccount("source:item:copper_ore", ORE), amount: -8n },
        { account: r.ledger.ownerAccount(OWNER, ORE, here), amount: 5n },
        { account: r.ledger.ownerAccount(TENANT, ORE, here), amount: 3n },
      ],
    });
    expect(r.runtime.nextHaulAt(NOW)).toBe((Math.floor(NOW / 600_000) + 1) * 600_000);
    // 옮김 거리(질문 1050 가): 창고가 없어 도시 칸(100, 16)까지 — 광산 가운데 (23, 25)에서 체비셰프 77칸, 나르는 사람 = 운반꾼 하나
    expect(r.runtime.haulRoute(r.mineId)).toEqual({ cells: 77, storeId: null, carriers: 1 });
    // 운반꾼(그 채집소 일꾼)이 없으면 떠나지 않고 채집소 창고에서 기다린다(질문 1090 가 [임시])
    expect(r.runtime.haulNow(NOW)).toBe(0);
    expect(r.runtime.trip(r.mineId)).toBeUndefined();
    expect(r.ledger.balanceOf(OWNER, ORE, here)).toBe(5n);
    r.hire(r.mineId, 7, 30, 30);
    // 정시에 운반꾼 화물로 싣고 떠난다(5g = 한 번, 왕복 2 × 77칸 × 걷기 ms) — 채집소 창고 자리는 바로 빈다(질문 1092 가)
    expect(r.runtime.haulNow(NOW)).toBe(0);
    const trip = r.runtime.trip(r.mineId);
    expect(trip).toEqual({
      departAtMs: NOW,
      arriveAtMs: NOW + 2 * 77 * walkMsPerCell(),
      grams: 5n,
      porter: 7,
    });
    if (!trip) throw new Error("no trip");
    expect(r.ledger.balanceOf(OWNER, ORE, here)).toBe(0n);
    expect(r.ledger.balanceOf(OWNER, ORE, cargoLocation(7))).toBe(5n);
    // 운반꾼이 걷기 시작했다(보이는 운반꾼)
    expect(r.map.unitInfo(7)?.motion).toBeDefined();
    // 나르는 동안 다음 정시는 이 채집소를 건너뛴다
    expect(r.runtime.haulNow(trip.arriveAtMs - 1)).toBe(0);
    expect(r.ledger.balanceOf(OWNER, ORE, cargoLocation(7))).toBe(5n);
    expect(r.runtime.haulNow(trip.arriveAtMs)).toBe(1);
    expect(r.ledger.balanceOf(OWNER, ORE, cargoLocation(7))).toBe(0n);
    expect(r.ledger.balanceOf(OWNER, ORE, cityLocation(CITY))).toBe(5n);
    expect(r.ledger.balanceOf(TENANT, ORE, here)).toBe(3n);
    expect(r.runtime.trip(r.mineId)).toBeUndefined();
    expect(r.runtime.haulNow(trip.arriveAtMs)).toBe(0);
  });

  it("손으로 옮기기(질문 1091 가): 운반꾼 하나가 한 짐으로(10초 안 명령은 합침) 거리 시간 뒤에, 운반꾼이 없으면 unknown_unit", () => {
    const r = rig();
    const here = buildingLocation(r.mineId);
    r.ledger.post({
      kind: "test",
      atMs: NOW,
      entries: [
        { account: r.ledger.systemAccount("source:item:copper_ore", ORE), amount: -9n },
        { account: r.ledger.ownerAccount(OWNER, ORE, here), amount: 9n },
      ],
    });
    expect(r.runtime.haulOut(OWNER, r.mineId, ORE, 4n, NOW)).toBe("unknown_unit");
    expect(r.runtime.haulOut(OWNER, r.mineId, ORE, 99n, NOW)).toBe("insufficient_materials");
    r.hire(r.mineId, 7, 30, 30);
    expect(r.runtime.haulOut(OWNER, r.mineId, ORE, 4n, NOW)).toBeNull();
    expect(r.runtime.haulOut(OWNER, r.mineId, ORE, 5n, NOW)).toBeNull();
    const trip = r.runtime.trip(r.mineId);
    expect(trip).toMatchObject({ porter: 7, grams: 9n, arriveAtMs: NOW + 2 * 77 * walkMsPerCell() });
    expect(r.ledger.balanceOf(OWNER, ORE, cargoLocation(7))).toBe(9n);
    // 채집소가 아닌 건물은 맡지 않는다(예전처럼 바로)
    expect(r.runtime.haulOut(OWNER, 999, ORE, 1n, NOW)).toBeUndefined();
    expect(r.runtime.haulNow(trip?.arriveAtMs ?? 0)).toBe(1);
    expect(r.ledger.balanceOf(OWNER, ORE, cityLocation(CITY))).toBe(9n);
  });

  it("다시 켠 뒤: 일꾼 화물에 남은 채집소 주인 몫은 다음 정시에 다시 떠난다", () => {
    const r = rig();
    r.hire(r.mineId, 7, 30, 30);
    r.ledger.post({
      kind: "test",
      atMs: NOW,
      entries: [
        { account: r.ledger.systemAccount("source:item:copper_ore", ORE), amount: -6n },
        { account: r.ledger.ownerAccount(OWNER, ORE, cargoLocation(7)), amount: 6n },
      ],
    });
    expect(r.runtime.haulNow(NOW)).toBe(0);
    expect(r.runtime.trip(r.mineId)).toMatchObject({ porter: 7, grams: 6n });
    expect(r.ledger.balanceOf(OWNER, ORE, cargoLocation(7))).toBe(6n);
  });

  it("옮김 거리: 주인의 가장 가까운 창고까지, 옮김 셈을 끄면 바로", () => {
    const store = rig({ store: { x: 30, y: 24 } });
    // 창고(30, 24) 3×3 가운데 (31, 25) ← 광산 가운데 (23, 25): 8칸
    expect(store.runtime.haulRoute(store.mineId)).toMatchObject({ cells: 8, carriers: 1 });
    const off = rig({ haulMode: 0 });
    const here = buildingLocation(off.mineId);
    off.ledger.post({
      kind: "test",
      atMs: NOW,
      entries: [
        { account: off.ledger.systemAccount("source:item:copper_ore", ORE), amount: -5n },
        { account: off.ledger.ownerAccount(OWNER, ORE, here), amount: 5n },
      ],
    });
    expect(off.runtime.haulNow(NOW)).toBe(1);
    expect(off.ledger.balanceOf(OWNER, ORE, cityLocation(CITY))).toBe(5n);
  });
});

describe("농장 채집소(오브젝트 없음, 756 ②)", () => {
  it("묶음 상한 없음·오브젝트를 쓰지 않음, 창고가 가득이면 0·창고 가득, 레벨 수확 배율", () => {
    const r = rig(3);
    const site = r.runtime.site(r.farmId);
    expect(site).toMatchObject({ kind: "facility", level: 3, cityId: CITY, ownerId: OWNER });
    if (!site) throw new Error("no site");
    expect(r.runtime.objectsIn(site, NOW)).toEqual([]);
    const plan = r.runtime.hook.plan(r.farmId, 2, 50_000n);
    expect(plan).toBeDefined();
    expect(plan?.maxLots).toBeUndefined();
    expect(plan?.scale(CROP, 10n, 1)).toBe(14n);
    plan?.commit(commitOf(60, 5));
    expect(r.runtime.status(2)).toMatchObject({ buildingId: r.farmId, state: "working", lots: 5 });
    // 광맥 번수는 그대로
    expect(r.store.read(MAP, FIRST, 2, NOW).usesLeft).toBe(2);
    expect(r.store.read(MAP, SECOND, 2, NOW).usesLeft).toBe(2);
    const full = r.runtime.hook.plan(r.farmId, 2, 0n);
    expect(full?.maxLots).toBe(0);
    full?.commit(commitOf(30, 0, true));
    expect(r.runtime.status(2)).toMatchObject({ state: "storage_full", lots: 5 });
    // 넣다 넘쳐 덜 넣었으면 창고 가득
    r.runtime.hook.plan(r.farmId, 2, 10n)?.commit(commitOf(30, 1, false, true));
    expect(r.runtime.status(2)).toMatchObject({ state: "storage_full", lots: 6 });
  });

  it("정산 뒤 피로 덜기(레벨 1 = 500‰), 막혀 하나도 못 끝냈으면 모두", () => {
    const r = rig();
    expect(
      r.map.addUnit({
        id: 2,
        size: 1,
        speed: WALK_SPEED,
        cellX: 70,
        cellY: 70,
        ownerId: OWNER,
        kind: UNIT_KIND_HUMAN,
      }),
    ).toBe(true);
    r.map.setJob(2, { job: JOB_GATHER, phase: PHASE_WORK, progressMs: 0, fatigue: 10 });
    r.runtime.hook.plan(r.farmId, 2, null)?.commit(commitOf(4, 1));
    r.runtime.hook.afterSettle(OWNER);
    expect(r.map.unitInfo(2)?.job.fatigue).toBe(8);
    r.runtime.hook.plan(r.farmId, 2, 0n)?.commit(commitOf(3, 0, true));
    r.runtime.hook.afterSettle(OWNER);
    expect(r.map.unitInfo(2)?.job.fatigue).toBe(5);
  });

  it("자동 옮김: 농장 창고의 주인 몫도 그 도시 창고로", () => {
    const r = rig();
    const here = buildingLocation(r.farmId);
    r.ledger.post({
      kind: "test",
      atMs: NOW,
      entries: [
        { account: r.ledger.systemAccount("source:item:potato", CROP), amount: -4n },
        { account: r.ledger.ownerAccount(OWNER, CROP, here), amount: 4n },
      ],
    });
    r.hire(r.farmId, 8, 70, 70);
    expect(r.runtime.haulNow(NOW)).toBe(0);
    const arrive = r.runtime.trip(r.farmId)?.arriveAtMs ?? 0;
    expect(arrive).toBe(NOW + 2 * 65 * walkMsPerCell());
    expect(r.runtime.haulNow(arrive)).toBe(1);
    expect(r.ledger.balanceOf(OWNER, CROP, here)).toBe(0n);
    expect(r.ledger.balanceOf(OWNER, CROP, cityLocation(CITY))).toBe(4n);
  });
});
