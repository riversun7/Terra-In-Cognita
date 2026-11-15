// NPC 배 시험(기획 D-547 1497 "플레이어와 같은 규칙", docs/adr/2026-11-15-shipyard-harbor.md): NPC 조선소가 배를 만들고 정박장이 집이다(상한 = 설정 칸),
// 둘레 휴먼을 어부로 태워 어군을 시키고, 지치면 정박장으로 돌아와 내리고, 낡으면 조선소로 보내 고친다. 플레이어 시설은 건드리지 않는다.
import {
  START_BOATS,
  SURFACE_WATER,
  TEST_SOCIETY_COEFFICIENTS,
  WALK_SPEED,
  createLedgerBook,
} from "@terra/sim";
import { cityLocation } from "@terra/shared/goodsPlaces";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FacilityDef } from "../facilities/catalog.ts";
import { goodsAsset } from "../facilities/materials.ts";
import type { PlaceWorld } from "../facilities/places.ts";
import type { FacilityRecord } from "../facilities/state.ts";
import type { GatherKind } from "../gather/kinds.ts";
import type { GatherObject } from "../gather/objects.ts";
import type { GatherService } from "../gather/service.ts";
import { createTestMap, flatTerrain } from "../world/testSupport.ts";
import { UNIT_KIND_BOAT, UNIT_KIND_BOT } from "../world/unitKinds.ts";
import { createNpcFleet } from "./npcFleet.ts";
import { createBoatService } from "./service.ts";

const START = 1_798_000_000_000;
const NPC = 30;
const PLAYER = 7;
const CITY = 4;

const base = {
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
} as const;
const BERTH_DEF: FacilityDef = { ...base, id: "dock", name: { ko: "정박장", en: "Berth" }, harbor: "berth" };
const YARD_DEF: FacilityDef = {
  ...base,
  id: "shipyard",
  name: { ko: "조선소", en: "Shipyard" },
  harbor: "shipyard",
  boats: [
    {
      id: "rowboat",
      name: { ko: "작은 배", en: "Rowboat" },
      materials: [{ item: "pine_log", qty: 14 }],
      buildMs: 0,
      speedPm: 1000,
      capacity: 4,
    },
  ],
};
const DEFS = [BERTH_DEF, YARD_DEF];

const SCHOOL: GatherKind = {
  id: "school_shelf",
  name: { ko: "대륙붕 어군", en: "Shelf school" },
  source: "school",
  arts: [],
  chancePm: 0,
  art: 0,
  surfaces: [],
  minCells: 0,
  material: null,
  direct: true,
  item: "saury",
  lots: 1,
  workMs: 1000,
  uses: 4,
  regrowMs: 1000,
  facility: null,
  primary: "str",
  secondary: "vit",
  reach: 0,
  boat: true,
};

function coastTerrain() {
  const terrain = flatTerrain();
  for (let ty = 0; ty < 128; ty++)
    for (let tx = 64; tx < 128; tx++) terrain.surface[ty * 128 + tx] = SURFACE_WATER;
  return terrain;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});
afterEach(() => vi.useRealTimers());

function setup(perDock = 1) {
  const { map } = createTestMap({ terrain: coastTerrain() });
  const maps = new Map([[map.mapKey, map]]);
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
    cities: () => [{ id: CITY, mapKey: map.mapKey, x: 100, y: 40 }],
  };
  let accountId = 0;
  let txId = 0;
  const ledger = createLedgerBook({ nextAccountId: () => ++accountId, nextTxId: () => ++txId });
  const asset = goodsAsset("pine_log");
  ledger.post({
    kind: "test",
    atMs: START,
    entries: [
      { account: ledger.systemAccount(`source:${asset}`, asset), amount: -100n },
      { account: ledger.ownerAccount(NPC, asset, cityLocation(CITY)), amount: 100n },
    ],
  });
  let nextId = 900;
  const boats = createBoatService({
    maps,
    now: () => Date.now(),
    log: { error: () => {} },
    ledger,
    rules: () => START_BOATS,
    nextUnitId: () => ++nextId,
    ownerOf: () => undefined,
    places: () => places,
    works: () => true,
    unitBusy: () => false,
    isNpc: (ownerId) => ownerId === NPC,
    manual: true,
  });
  const dock = (x: number, owner: number, y = 40, def: FacilityDef = BERTH_DEF) => {
    const placed = map.placeBuilding({ x, y, width: 3, height: 3, rotation: 0 }, owner);
    if (!placed.ok || placed.buildingId === undefined) throw new Error("dock not placed");
    facilities.set(placed.buildingId, {
      buildingId: placed.buildingId,
      facilityId: def.id,
      level: 1,
      conditionPpm: 1_000_000,
      conditionAtMs: START,
      builtAtMs: START,
      builtBy: "npc",
      cityId: CITY,
    });
    return placed.buildingId;
  };
  // 가짜 채집: 어군 하나, 시킨 유닛을 기억한다
  const acting = new Set<number>();
  const started: { ownerId: number; unitId: number; objectId: number }[] = [];
  const school: GatherObject = { id: 70_000, kind: 0, x: 200, y: 100 };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 시험: 함대가 쓰는 몫만
  const gather = {
    acting: (unitId: number) => acting.has(unitId),
    objectsAt: () => [{ ...school, route: { points: [200, 100, 210, 100], periodMs: 60_000, phaseMs: 0 } }],
    startAs: (ownerId: number, input: { unitId: number; mapKey: number; objectId: number }) => {
      started.push({ ownerId, unitId: input.unitId, objectId: input.objectId });
      acting.add(input.unitId);
      return Promise.resolve({ ok: true as const });
    },
  } as unknown as GatherService;
  const rules = {
    ...TEST_SOCIETY_COEFFICIENTS,
    boats: { ...START_BOATS, npcPerDock: perDock, npcFishers: 2 },
  };
  const fleet = createNpcFleet(
    {
      maps,
      now: () => Date.now(),
      log: { info: () => {}, error: () => {} },
      rules: () => rules,
      places: () => places,
      works: () => true,
      isNpc: (ownerId) => ownerId === NPC,
      boats: () => boats,
      gather: () => gather,
      kinds: () => [SCHOOL],
    },
    { timer: false },
  );
  const boatIds = () => {
    const out: number[] = [];
    map.forEachUnit((unit) => {
      if (unit.kind === UNIT_KIND_BOAT) out.push(unit.id);
    });
    return out;
  };
  return { map, fleet, boats, ledger, dock, acting, started, boatIds, rules };
}

describe("NPC 배(D-547 1497)", () => {
  it("NPC 조선소가 배를 상한까지 만들고(도시 창고 재료) 정박장에 넣는다, 플레이어 시설은 건드리지 않는다", async () => {
    const r = setup();
    const berth = r.dock(125, NPC);
    r.dock(125, NPC, 80, YARD_DEF);
    r.dock(125, PLAYER, 120);
    const first = await r.fleet.tick();
    expect(first).toMatchObject({ docks: 1, built: 1 });
    expect(r.boatIds()).toHaveLength(1);
    const boatId = r.boatIds()[0] ?? 0;
    expect(r.map.unitInfo(boatId)?.ownerId).toBe(NPC);
    expect(r.ledger.balanceOf(NPC, goodsAsset("pine_log"), cityLocation(CITY))).toBe(86n);
    // 다음 살피기: 집 없는 배를 정박장에 넣는다, 상한 1이라 더 만들지 않는다
    const second = await r.fleet.tick();
    expect(second).toMatchObject({ boats: 1, built: 0, berthed: 1 });
    expect(r.boats.info(boatId)?.homeId).toBe(berth);
    expect(r.boatIds()).toHaveLength(1);
  });

  it("둘레 휴먼을 어부로 태워 어군을 시키고, 지치면 정박장으로 돌아와 내린다", async () => {
    const r = setup();
    r.dock(125, NPC);
    r.dock(125, NPC, 80, YARD_DEF);
    await r.fleet.tick();
    await r.fleet.tick();
    const boatId = r.boatIds()[0] ?? 0;
    // 정박장 옆으로 간다
    await vi.advanceTimersByTimeAsync(600_000);
    for (const id of [11, 12, 13])
      r.map.addUnit({
        id,
        size: 1,
        speed: WALK_SPEED,
        cellX: 124,
        cellY: 39,
        ownerId: NPC,
        kind: UNIT_KIND_BOT,
      });
    const tick = await r.fleet.tick();
    expect(tick.boarded).toBe(2);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(r.map.passengers(boatId)).toEqual([11, 12]);
    await r.fleet.tick();
    expect(r.started.map((entry) => entry.unitId)).toEqual([11, 12]);
    expect(r.started.every((entry) => entry.ownerId === NPC && entry.objectId === 70_000)).toBe(true);
    expect(await r.fleet.tick()).toMatchObject({ fishing: 1, boarded: 0 });
    // 지침: 정박장 옆이면 모두 내린다(봇은 다시 걷는다)
    r.acting.clear();
    const job = r.map.unitInfo(11)?.job;
    if (!job) throw new Error("no job");
    r.map.setJob(11, { ...job, fatigue: r.rules.fatigueMax });
    expect(await r.fleet.tick()).toMatchObject({ returned: 1 });
    expect(r.map.passengers(boatId)).toEqual([]);
    expect(r.map.unitInfo(11)?.aboard).toBeUndefined();
  });

  it("조선소가 없으면 만들지 않고, 상한 0이면 NPC 배를 만들지 않는다", async () => {
    const lone = setup();
    lone.dock(125, NPC);
    expect(await lone.fleet.tick()).toMatchObject({ docks: 1, built: 0 });
    const r = setup(0);
    r.dock(125, NPC);
    r.dock(125, NPC, 80, YARD_DEF);
    expect(await r.fleet.tick()).toMatchObject({ docks: 0, built: 0 });
    expect(r.boatIds()).toHaveLength(0);
  });
});
