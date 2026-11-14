// 배 시험 — 물 길찾기(배는 물로만, 걷는 유닛은 물에 못 들어감)·타기·내리기·배 만들기(docs/adr/2026-11-13-boats.md)
import {
  CELL_UNITS,
  type Point,
  START_BOATS,
  SURFACE_WATER,
  anchorAt,
  anchorCenter,
  arrivalAt,
  positionAt,
} from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ledger } from "../economy/ledger.ts";
import type { FacilityDef } from "../facilities/catalog.ts";
import type { PlaceWorld } from "../facilities/places.ts";
import type { FacilityRecord } from "../facilities/state.ts";
import { performance } from "node:perf_hooks";
import { mapTerrainFromTemp } from "../world/mapTerrain.ts";
import { createInlinePathService } from "../world/pathService.ts";
import { type SecondMap, type UnitRow, createSecondMap } from "../world/secondMap.ts";
import { createTestMap, flatTerrain, silentLog } from "../world/testSupport.ts";
import { emptyWorldStats } from "../world/worldStats.ts";
import { UNIT_KIND_BOAT, UNIT_KIND_HUMAN } from "../world/unitKinds.ts";
import { boatCost, createBoatService, isBoatYard, rectGap, ringCells } from "./service.ts";

const START = 1_798_000_000_000;
/** 지형 칸 x ≥ 64(배치 칸 x ≥ 128)가 바다인 2차맵 */
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

function setup() {
  const test = createTestMap({ terrain: coastTerrain() });
  const maps = new Map([[test.map.mapKey, test.map]]);
  const facilities = new Map<number, FacilityRecord>();
  const places: PlaceWorld = {
    maps,
    facilities,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 시험: 부두 정의만 쓰는 가짜 목록
    catalog: () => ({ facility: (id: string) => (id === "dock" ? DOCK_DEF : undefined) }) as never,
    cities: () => [],
  };
  let nextId = 500;
  const owners = new Map([["player", 7]]);
  // 원장: 재료가 하나도 없다(플레이어 짓기는 insufficient_materials)
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 시험: 잔고만 읽는 가짜 원장
  const ledger = { balanceOf: () => 0n, ownerAccount: () => 0 } as unknown as Ledger;
  const service = createBoatService({
    maps,
    now: () => Date.now(),
    log: { error: () => {} },
    ledger,
    rules: () => START_BOATS,
    nextUnitId: () => ++nextId,
    ownerOf: (userId) => owners.get(userId),
    places: () => places,
    works: () => true,
    unitBusy: () => false,
  });
  return { ...test, service, facilities };
}

/** 유닛이 지금 선 기준 칸 */
const cellOf = (point: Point, size: 1 | 2 = 1) => anchorAt(point, size);

describe("배", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });
  afterEach(() => vi.useRealTimers());

  it("도우미: 부두 판별·배 값·네모 틈·고리 칸", () => {
    expect(isBoatYard(DOCK_DEF)).toBe(true);
    expect(isBoatYard({ stage: "gather", needsWaterWithin: 5 })).toBe(false);
    expect(isBoatYard({ stage: "transport", needsWaterWithin: undefined })).toBe(false);
    expect(boatCost(DOCK_DEF, 500)).toEqual([{ item: "pine_log", qty: 7 }]);
    expect(boatCost(DOCK_DEF, 0)).toEqual([]);
    expect(rectGap({ x: 0, y: 0, width: 2, height: 2 }, { x: 2, y: 0, width: 1, height: 1 })).toBe(0);
    expect(rectGap({ x: 0, y: 0, width: 2, height: 2 }, { x: 5, y: 1, width: 1, height: 1 })).toBe(3);
    const ring = ringCells({ x: 10, y: 10, width: 1, height: 1 }, 1, 1, () => true, 100);
    expect(ring).toHaveLength(8);
  });

  it("배는 물 칸에만 서고 물 길로 가며, 걷는 유닛은 물에 들어가지 못한다", async () => {
    const { map } = setup();
    expect(map.addBoat({ id: 1, ownerId: 7, speed: START_BOATS.speed, cellX: 100, cellY: 50 })).toBe(false);
    expect(map.addBoat({ id: 1, ownerId: 7, speed: START_BOATS.speed, cellX: 140, cellY: 50 })).toBe(true);
    expect(map.unitInfo(1)?.kind).toBe(UNIT_KIND_BOAT);
    expect(map.unitInfo(1)?.domain).toBe("sea");
    const sail = await map.moveUnit(1, anchorCenter(200, 220, 2));
    expect(sail.ok).toBe(true);
    const motion = map.unitInfo(1)?.motion;
    if (!motion) throw new Error("no boat");
    for (let t = START; t <= arrivalAt(motion); t += 2_000)
      expect(cellOf(positionAt(motion, t), 2).x).toBeGreaterThanOrEqual(128);
    // 배를 땅으로 보내면 길이 없다
    expect(await map.moveUnit(1, anchorCenter(20, 20, 2))).toEqual({ ok: false, code: "goal_blocked" });
    // 걷는 유닛은 바다로 못 간다
    expect(
      map.addUnit({ id: 2, size: 1, speed: 437, cellX: 120, cellY: 50, ownerId: 7, kind: UNIT_KIND_HUMAN }),
    ).toBe(true);
    expect(await map.moveUnit(2, anchorCenter(160, 50, 1))).toEqual({ ok: false, code: "goal_blocked" });
  });

  it("가까우면 바로 타고, 탄 유닛은 배를 따라가며 따로 움직이지 않는다. 물가에서 내린다", async () => {
    const { map, service } = setup();
    map.addBoat({ id: 1, ownerId: 7, speed: START_BOATS.speed, cellX: 129, cellY: 50 });
    map.addUnit({ id: 2, size: 1, speed: 437, cellX: 126, cellY: 50, ownerId: 7, kind: UNIT_KIND_HUMAN });
    // 남의 배·유닛은 못 태운다
    expect(await service.board("stranger", 2, 1, false)).toEqual({ ok: false, code: "forbidden" });
    expect(await service.board("player", 2, 1, false)).toEqual({ ok: true });
    expect(map.unitInfo(2)?.aboard).toBe(1);
    expect(map.passengers(1)).toEqual([2]);
    expect(await service.board("player", 2, 1, false)).toEqual({ ok: false, code: "already_aboard" });
    expect(await map.moveUnit(2, anchorCenter(100, 50, 1))).toEqual({ ok: false, code: "aboard" });
    // 배가 나가면 승객도 같은 자리
    expect((await map.moveUnit(1, anchorCenter(180, 120, 2))).ok).toBe(true);
    vi.setSystemTime(START + 20_000);
    const boatAt = positionAt(map.unitInfo(1)?.motion ?? map.unitInfo(2)!.motion, Date.now());
    expect(positionAt(map.unitInfo(2)!.motion, Date.now())).toEqual(boatAt);
    // 먼 바다에서는 내릴 땅이 없다
    vi.setSystemTime(START + 600_000);
    expect(service.leave("player", 1, false)).toEqual({ ok: false, code: "no_shore" });
    // 물가로 돌아와 내린다
    expect((await map.moveUnit(1, anchorCenter(129, 60, 2))).ok).toBe(true);
    vi.setSystemTime(START + 1_200_000);
    expect(service.leave("player", 1, false)).toEqual({ ok: true });
    const info = map.unitInfo(2);
    expect(info?.aboard).toBeUndefined();
    expect(cellOf(positionAt(info!.motion, Date.now())).x).toBeLessThan(128);
    expect(service.leave("player", 1, false)).toEqual({ ok: false, code: "empty" });
  });

  it("멀면 배 옆 땅까지 걸어간 뒤 탄다, 자리가 차면 boat_full", async () => {
    const { map, service } = setup();
    map.addBoat({ id: 1, ownerId: 7, speed: START_BOATS.speed, cellX: 129, cellY: 50 });
    map.addUnit({ id: 2, size: 1, speed: 437, cellX: 100, cellY: 50, ownerId: 7, kind: UNIT_KIND_HUMAN });
    expect(await service.board("player", 2, 1, false)).toEqual({ ok: true, walking: true });
    expect(map.unitInfo(2)?.aboard).toBeUndefined();
    const motion = map.unitInfo(2)!.motion;
    await vi.advanceTimersByTimeAsync(arrivalAt(motion) - START + 100);
    expect(map.unitInfo(2)?.aboard).toBe(1);
    for (let id = 3; id < 3 + START_BOATS.capacity; id++) {
      map.addUnit({ id, size: 1, speed: 437, cellX: 126, cellY: 50, ownerId: 7, kind: UNIT_KIND_HUMAN });
      await service.board("player", id, 1, false);
    }
    expect(map.passengers(1)).toHaveLength(START_BOATS.capacity);
    expect(await service.board("player", 3 + START_BOATS.capacity - 1, 1, false)).toEqual({
      ok: false,
      code: "boat_full",
    });
  });

  it("저장한 줄로 다시 켜면 승객이 배에 다시 붙는다(배가 없으면 내려서 땅에 선다)", () => {
    const rows = new Map<number, UnitRow>();
    const make = (): SecondMap => {
      const holder: { map?: SecondMap } = {};
      const paths = createInlinePathService(
        () => (holder.map ? [holder.map.replicaInit()] : []),
        () => performance.now(),
      );
      const map = createSecondMap({
        mapKey: 9,
        terrain: mapTerrainFromTemp(9, coastTerrain()),
        paths,
        now: () => Date.now(),
        stats: emptyWorldStats(),
        log: silentLog,
        persist: {
          saveUnit: (row) => rows.set(row.id, row),
          saveBuilding: () => {},
          removeBuilding: () => {},
        },
      });
      holder.map = map;
      paths.start();
      return map;
    };
    const first = make();
    first.addBoat({ id: 1, ownerId: 7, speed: START_BOATS.speed, cellX: 129, cellY: 50 });
    first.addUnit({ id: 2, size: 1, speed: 437, cellX: 126, cellY: 50, ownerId: 7, kind: UNIT_KIND_HUMAN });
    expect(first.board(2, 1)).toBe(true);
    expect(rows.get(2)?.aboardId).toBe(1);
    expect(rows.get(1)?.domain).toBe("sea");
    const second = make();
    second.restore([...rows.values()], []);
    expect(second.unitInfo(2)?.aboard).toBe(1);
    expect(second.passengers(1)).toEqual([2]);
    // 배 줄이 없으면 승객은 내려서 땅(안전한 곳)에 선다
    const third = make();
    third.restore([rows.get(2)!], []);
    expect(third.unitInfo(2)?.aboard).toBeUndefined();
    expect(cellOf(positionAt(third.unitInfo(2)!.motion, Date.now())).x).toBeLessThan(128);
  });

  it("부두에서 배를 만든다: 다 지은 부두만, 플레이어는 재료, 운영자는 재료 없이", () => {
    const { map, service, facilities } = setup();
    // 물가 부두(건물 칸 x 123 ~ 125, 바다는 128부터 → 물가 조건 1칸은 배치 검사 밖이라 여기서는 서비스만 본다)
    const placed = map.placeBuilding({ x: 125, y: 40, width: 3, height: 3, rotation: 0 }, 7);
    if (!placed.ok || placed.buildingId === undefined) throw new Error("dock not placed");
    const dockId = placed.buildingId;
    expect(service.build("player", dockId, false)).toEqual({ ok: false, code: "not_dock" });
    facilities.set(dockId, {
      buildingId: dockId,
      facilityId: "dock",
      level: 0,
      conditionPpm: 1_000_000,
      conditionAtMs: START,
      builtAtMs: START,
      builtBy: "player",
      cityId: null,
    });
    expect(service.build("player", dockId, false)).toEqual({ ok: false, code: "not_ready" });
    facilities.get(dockId)!.level = 1;
    expect(service.build("stranger", dockId, false)).toEqual({ ok: false, code: "forbidden" });
    expect(service.build("player", dockId, false)).toEqual({ ok: false, code: "insufficient_materials" });
    const made = service.build("admin", dockId, true);
    expect(made.ok).toBe(true);
    if (!made.ok || made.boatId === undefined) return;
    const boat = map.unitInfo(made.boatId);
    expect(boat?.kind).toBe(UNIT_KIND_BOAT);
    expect(boat?.ownerId).toBe(7);
    expect(boat?.speed).toBe(START_BOATS.speed);
    const cell = cellOf(positionAt(boat!.motion, Date.now()), 2);
    expect(cell.x).toBeGreaterThanOrEqual(128);
    expect(Math.abs(cell.y * CELL_UNITS - 41 * CELL_UNITS)).toBeLessThanOrEqual(8 * CELL_UNITS);
  });
});
