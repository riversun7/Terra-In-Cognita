// 2차맵 서버 상태 시험 — 봇, 관리자 명령, 건물과 경로 다시 찾기, 늦게 온 결과, 지형 파일, 상수 일치
import { gunzipSync } from "node:zlib";
import { PLACEMENT_CELLS_PER_SIDE } from "@terra/planet";
import { SM_SURFACE } from "@terra/planet/secondMap";
import {
  MAX_UNIT_SPEED,
  POSITION_UNITS_PER_CELL,
  S1_TEST_MAP_KEY,
  SECOND_MAP_CELLS,
  TERRAIN_SURFACE,
  UNIT_SIZE_CLASSES,
  decodeServerMessage,
  decodeTerrain,
} from "@terra/protocol";
import {
  CAR_SPEED,
  CELL_UNITS,
  MAX_SIZE_CLASS,
  MAX_SPEED,
  PLACEMENT_SIZE,
  SURFACE_DIRT,
  SURFACE_GRASS,
  SURFACE_ROCK,
  SURFACE_WATER,
  WALK_SPEED,
  anchorAt,
  anchorCenter,
  applyPlacement,
  arrivalAt,
  createMotion,
  createPlacementGrid,
  generateTempTerrain,
  isPassable,
  positionAt,
  seedFromCellKey,
  terrainHash,
} from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { performance } from "node:perf_hooks";
import { HOME_RADIUS_CELLS } from "./bots.ts";
import { mapTerrainFromTemp } from "./mapTerrain.ts";
import { createInlinePathService } from "./pathService.ts";
import { createSecondMap, remainingPathBlocked } from "./secondMap.ts";
import { createTestMap, flatTerrain, heldPathService, silentLog } from "./testSupport.ts";
import { UNIT_KIND_HUMAN, UNIT_KIND_NPC_LEADER } from "./unitKinds.ts";
import { emptyWorldStats } from "./worldStats.ts";
import { TEST_MAP_KEY } from "./world.ts";

const START = 1_798_000_000_000;
const center = (x: number, y: number) => anchorCenter(x, y, 1);

beforeEach(() => {
  vi.useFakeTimers({ now: START });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("상수 일치(기기가 보는 값 = 판정·격자 값)", () => {
  it("위치 단위·2차맵 칸 수·속도 상한·지표 번호·크기 등급", () => {
    expect(POSITION_UNITS_PER_CELL).toBe(CELL_UNITS);
    expect(SECOND_MAP_CELLS).toBe(PLACEMENT_SIZE);
    expect(SECOND_MAP_CELLS).toBe(PLACEMENT_CELLS_PER_SIDE);
    expect(MAX_UNIT_SPEED).toBe(MAX_SPEED);
    // 0~3은 S1 임시 지형(sim), 전체는 2차맵 생성기(planet)와 같다
    expect([
      TERRAIN_SURFACE.water,
      TERRAIN_SURFACE.grass,
      TERRAIN_SURFACE.dirt,
      TERRAIN_SURFACE.rock,
    ]).toEqual([SURFACE_WATER, SURFACE_GRASS, SURFACE_DIRT, SURFACE_ROCK]);
    expect(TERRAIN_SURFACE).toEqual(SM_SURFACE);
    expect(Math.max(...UNIT_SIZE_CLASSES)).toBe(MAX_SIZE_CLASS);
  });

  it("S1 시험 2차맵 키 = cellKey(0, 9, 256, 256)", () => {
    expect(S1_TEST_MAP_KEY).toBe(TEST_MAP_KEY);
  });
});

describe("지형 파일", () => {
  it("이진 파일을 읽으면 생성한 지형과 같고, 해시는 packages/sim terrainHash", () => {
    const terrain = generateTempTerrain(seedFromCellKey(TEST_MAP_KEY));
    const { map } = createTestMap({ terrain, mapKey: TEST_MAP_KEY });
    const file = map.terrainFile();
    const decoded = decodeTerrain(file.raw);
    expect(decoded.mapKey).toBe(TEST_MAP_KEY);
    expect(decoded.generatorVersion).toBe(terrain.generatorVersion);
    expect(decoded.seed).toBe(terrain.seed);
    expect(decoded.heights).toEqual(terrain.heights);
    expect(decoded.surface).toEqual(terrain.surface);
    expect(decoded.hash.toString(16).padStart(8, "0")).toBe(terrainHash(terrain));
    // 읽은 값으로 해시를 다시 계산해도 같다
    expect(terrainHash({ ...terrain, heights: decoded.heights, surface: decoded.surface })).toBe(
      terrainHash(terrain),
    );
    expect(gunzipSync(file.gzip).equals(file.raw)).toBe(true);
    expect(file.gzip.byteLength).toBeLessThan(file.raw.byteLength);
    map.stop();
  });
});

describe("시험용 봇", () => {
  it("1,000개: 모두 그 등급이 설 수 있는 칸 중심에, 크기 등급 약 90·8·2%, 속도는 걷기 약 85%·차", () => {
    const terrain = generateTempTerrain(seedFromCellKey(TEST_MAP_KEY));
    const { map } = createTestMap({ terrain, mapKey: TEST_MAP_KEY });
    map.spawnBots(1_000);
    const grid = createPlacementGrid(map.replicaInit().terrainCost);
    const sizes = new Map<number, number>();
    let walkers = 0;
    for (let id = 1; id <= 1_000; id++) {
      const unit = map.unitInfo(id);
      if (!unit) throw new Error(`bot ${id} missing`);
      const point = unit.motion.waypoints[0] ?? { x: -1, y: -1 };
      const anchor = anchorAt(point, unit.size);
      expect(anchorCenter(anchor.x, anchor.y, unit.size)).toEqual(point);
      expect(isPassable(grid, anchor.x, anchor.y, unit.size)).toBe(true);
      expect([WALK_SPEED, CAR_SPEED]).toContain(unit.speed);
      if (unit.speed === WALK_SPEED) walkers += 1;
      sizes.set(unit.size, (sizes.get(unit.size) ?? 0) + 1);
    }
    expect(sizes.get(1)).toBeGreaterThan(860);
    expect(sizes.get(2)).toBeGreaterThan(50);
    expect(sizes.get(2)).toBeLessThan(110);
    expect(sizes.get(3)).toBeGreaterThan(5);
    expect(sizes.get(3)).toBeLessThan(40);
    expect(walkers).toBeGreaterThan(800);
    expect(walkers).toBeLessThan(900);
    expect(map.gauges()).toEqual({ units: 1_000, moving: 0, planning: 0 });
    map.stop();
  });

  it("NPC 휴먼(docs/adr/2026-11-01-npc-brain-r5.md 7절): 도시 둘레에 세우고, 주인을 바꾸고, 지우면 예약·몸이 사라진다", () => {
    const { map } = createTestMap();
    expect(map.spawnBotNear(501, 7, { x: 100, y: 100 }, 8)).toBe(true);
    expect(map.spawnBotNear(501, 7, { x: 100, y: 100 }, 8)).toBe(false);
    const unit = map.unitInfo(501);
    if (!unit) throw new Error("spawned bot missing");
    const at = anchorAt(unit.motion.waypoints[0] ?? { x: 0, y: 0 }, unit.size);
    expect(Math.max(Math.abs(at.x - 100), Math.abs(at.y - 100))).toBeLessThanOrEqual(8);
    expect(unit.ownerId).toBe(7);
    expect(map.missingEvents()).toBe(0);
    expect(map.setOwner(501, 9)).toBe(true);
    expect(map.unitInfo(501)?.ownerId).toBe(9);
    expect(map.removeUnit(501)).toBe(true);
    expect(map.unitInfo(501)).toBeUndefined();
    expect(map.removeUnit(501)).toBe(false);
    expect(map.setOwner(501, 1)).toBe(false);
    expect(map.gauges().units).toBe(0);
    map.stop();
  });

  it("NPC 국가 지도자(종류 7)의 움직임에는 표시 종류 npc_leader가 붙고(프로토콜 18), 종류가 바뀌면 같은 움직임을 다시 보낸다", () => {
    const { map } = createTestMap();
    const sent: string[] = [];
    map.addUnit({
      id: 1,
      size: 1,
      speed: WALK_SPEED,
      cellX: 10,
      cellY: 10,
      ownerId: 3,
      kind: UNIT_KIND_NPC_LEADER,
    });
    map.addUnit({
      id: 2,
      size: 1,
      speed: WALK_SPEED,
      cellX: 20,
      cellY: 10,
      ownerId: 3,
      kind: UNIT_KIND_HUMAN,
    });
    map.stream.subscribe({ send: (text) => sent.push(text), bufferedAmount: () => 0 });
    const snapshot = sent.map(decodeServerMessage).find((message) => message.t === "map_snapshot");
    if (snapshot?.t !== "map_snapshot") throw new Error("no snapshot");
    expect(snapshot.units.find((unit) => unit.id === 1)?.kind).toBe("npc_leader");
    expect(snapshot.units.find((unit) => unit.id === 2)).not.toHaveProperty("kind");
    sent.length = 0;
    expect(map.setKind(2, UNIT_KIND_NPC_LEADER)).toBe(true);
    map.stream.flush();
    const paths = sent.map(decodeServerMessage).find((message) => message.t === "unit_paths");
    if (paths?.t !== "unit_paths") throw new Error("no unit_paths");
    expect(paths.units).toContainEqual(expect.objectContaining({ id: 2, kind: "npc_leader" }));
    map.stop();
  });

  it("집이 있는 봇(NPC 휴먼, WP-NPC): 멀리 있어도 몇 번 걸어 집 둘레로 모이고, 그 뒤로는 집 둘레 반경 안에서만 걷는다", async () => {
    const { map } = createTestMap();
    map.spawnBots(12);
    // 구인한 휴먼은 세운 기준 칸이 집이다
    expect(map.spawnBotNear(901, 7, { x: 128, y: 128 }, 4)).toBe(true);
    const home = { x: 128, y: 128 };
    for (let id = 1; id <= 12; id++) expect(map.setHome(id, home)).toBe(true);
    // 봇이 아닌 유닛·없는 유닛은 집을 받지 않는다
    map.addUnit({ id: 950, size: 1, speed: WALK_SPEED, cellX: 5, cellY: 5 });
    expect(map.setHome(950, home)).toBe(false);
    expect(map.setHome(999, home)).toBe(false);
    const distance = (id: number): number => {
      const unit = map.unitInfo(id);
      if (!unit) throw new Error(`bot ${id} missing`);
      const at = anchorAt(positionAt(unit.motion, Date.now()), unit.size);
      return Math.max(Math.abs(at.x - home.x), Math.abs(at.y - home.y));
    };
    // 걷기 48칸 왕복은 몇 분 — 30분이면 2차맵 끝에서도 집에 닿는다
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    for (const id of [...Array.from({ length: 12 }, (_, index) => index + 1), 901])
      expect(distance(id)).toBeLessThanOrEqual(HOME_RADIUS_CELLS + 3);
    // 집을 풀면(null) 다시 지금 자리 둘레를 걷는다
    expect(map.setHome(1, null)).toBe(true);
    map.stop();
  });

  it("시작 뒤 몇 초 안에 출발하고, 도착하면 쉬었다가 다시 간다", async () => {
    const terrain = generateTempTerrain(seedFromCellKey(TEST_MAP_KEY));
    const { map, stats } = createTestMap({ terrain, mapKey: TEST_MAP_KEY });
    map.spawnBots(40);
    await vi.advanceTimersByTimeAsync(5_500);
    const moving = map.gauges().moving;
    expect(stats.paths.requests).toBe(40);
    expect(moving).toBeGreaterThan(30);
    // 걷기 48칸 이내 왕복은 몇 분 — 10분 뒤에는 새 경로를 여러 번 받았다
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(stats.paths.requests).toBeGreaterThan(120);
    expect(stats.paths.outcomes.get("found") ?? 0).toBeGreaterThan(100);
    map.stop();
  });
});

describe("관리자 이동 명령", () => {
  it("서 있는 유닛: 지금 출발하는 직선 경로, 도착 시각은 판정 규칙대로", async () => {
    const { map } = createTestMap();
    expect(map.addUnit({ id: 1, size: 1, speed: WALK_SPEED, cellX: 10, cellY: 10 })).toBe(true);
    const result = map.moveUnit(1, center(30, 10));
    await vi.advanceTimersByTimeAsync(0);
    expect(await result).toEqual({ ok: true });
    const motion = map.unitInfo(1)?.motion;
    expect(motion?.waypoints).toEqual([center(10, 10), center(30, 10)]);
    expect(motion?.departAtMs).toBe(START);
    expect(motion && arrivalAt(motion)).toBe(START + Math.ceil((20 * 1024 * 1000) / WALK_SPEED));
    map.stop();
  });

  it("없는 유닛 unknown_unit, 막힌 목표 goal_blocked", async () => {
    const { map } = createTestMap();
    map.addUnit({ id: 1, size: 1, speed: WALK_SPEED, cellX: 10, cellY: 10 });
    expect(await map.moveUnit(99, center(1, 1))).toEqual({ ok: false, code: "unknown_unit" });
    expect(map.placeBuilding({ x: 40, y: 40, width: 2, height: 2, rotation: 0 })).toEqual({
      ok: true,
      buildingId: 1,
    });
    const result = map.moveUnit(1, center(40, 40));
    await vi.advanceTimersByTimeAsync(0);
    expect(await result).toEqual({ ok: false, code: "goal_blocked" });
    map.stop();
  });

  it("움직이는 유닛: 지금 자리에서 멈추고 거기서 새 경로로 간다(위치가 끊기지 않는다)", async () => {
    const { map } = createTestMap();
    map.addUnit({ id: 1, size: 1, speed: CAR_SPEED, cellX: 10, cellY: 10 });
    const first = map.moveUnit(1, center(100, 10));
    await vi.advanceTimersByTimeAsync(0);
    await first;
    await vi.advanceTimersByTimeAsync(2_000);
    const before = map.unitInfo(1)?.motion;
    const here = before ? positionAt(before, Date.now()) : undefined;
    const second = map.moveUnit(1, center(50, 60));
    await vi.advanceTimersByTimeAsync(0);
    expect(await second).toEqual({ ok: true });
    const after = map.unitInfo(1)?.motion;
    expect(after?.waypoints[0]).toEqual(here);
    expect(after?.waypoints.at(-1)).toEqual(center(50, 60));
    map.stop();
  });

  it("경로 워커 사본에 2차맵이 없으면(unknown_map, 판 −1) 다시 찾지 않고 unknown_map으로 끝난다", async () => {
    // 워커 사본이 비어 있는 경로 서비스(부팅 차례가 어긋난 때와 같다). 고치기 전에는 다시 찾기가 끝없이 돌았다
    const stats = emptyWorldStats();
    const paths = heldPathService(
      createInlinePathService(
        () => [],
        () => performance.now(),
      ),
    );
    const map = createSecondMap({
      mapKey: 9,
      terrain: mapTerrainFromTemp(9, flatTerrain()),
      paths,
      now: () => Date.now(),
      stats,
      log: silentLog,
    });
    paths.start();
    map.addUnit({ id: 1, size: 1, speed: WALK_SPEED, cellX: 10, cellY: 10 });
    const result = map.moveUnit(1, center(30, 10));
    await vi.advanceTimersByTimeAsync(0);
    expect(await result).toEqual({ ok: false, code: "unknown_map" });
    expect(paths.requests).toBe(1);
    expect(stats.paths.staleReplans).toBe(0);
    map.stop();
  });

  it("결과를 기다리는 동안 새 명령이 오면 앞 명령은 superseded", async () => {
    const { map, paths } = createTestMap();
    map.addUnit({ id: 1, size: 1, speed: WALK_SPEED, cellX: 10, cellY: 10 });
    paths.hold = true;
    const first = map.moveUnit(1, center(30, 10));
    const second = map.moveUnit(1, center(10, 30));
    paths.hold = false;
    paths.release();
    await vi.advanceTimersByTimeAsync(0);
    expect(await first).toEqual({ ok: false, code: "superseded" });
    expect(await second).toEqual({ ok: true });
    expect(map.unitInfo(1)?.motion?.waypoints.at(-1)).toEqual(center(10, 30));
    map.stop();
  });
});

describe("건물", () => {
  it("놓기: ID는 1부터, 겹침·밖·유닛 위는 거부", () => {
    const { map } = createTestMap();
    map.addUnit({ id: 1, size: 2, speed: WALK_SPEED, cellX: 100, cellY: 100 });
    expect(map.placeBuilding({ x: 10, y: 10, width: 4, height: 2, rotation: 90 })).toEqual({
      ok: true,
      buildingId: 1,
    });
    expect(map.placeBuilding({ x: 11, y: 11, width: 2, height: 2, rotation: 0 })).toEqual({
      ok: false,
      code: "overlaps_building",
    });
    expect(map.placeBuilding({ x: 255, y: 0, width: 2, height: 1, rotation: 0 })).toEqual({
      ok: false,
      code: "out_of_bounds",
    });
    // 크기 2 유닛은 (100, 100)~(101, 101)을 차지한다
    expect(map.placeBuilding({ x: 101, y: 101, width: 3, height: 3, rotation: 0 })).toEqual({
      ok: false,
      code: "overlaps_unit",
    });
    expect(map.placeBuilding({ x: 102, y: 100, width: 3, height: 3, rotation: 0 })).toMatchObject({
      ok: true,
    });
    map.stop();
  });

  it("치우기: 있으면 ok, 없으면 unknown_building. 치운 자리에는 다시 놓을 수 있다", () => {
    const { map } = createTestMap();
    expect(map.placeBuilding({ x: 5, y: 5, width: 3, height: 3, rotation: 0 })).toMatchObject({ ok: true });
    expect(map.removeBuilding(1)).toEqual({ ok: true });
    expect(map.removeBuilding(1)).toEqual({ ok: false, code: "unknown_building" });
    expect(map.placeBuilding({ x: 5, y: 5, width: 3, height: 3, rotation: 0 })).toEqual({
      ok: true,
      buildingId: 2,
    });
    expect(map.replicaInit()).toMatchObject({ version: 3, buildings: [{ id: 2 }] });
    map.stop();
  });

  it("남은 경로를 막는 건물을 놓으면 그 유닛만 다시 찾고, 새 경로는 건물을 피한다", async () => {
    const { map, stats } = createTestMap();
    map.addUnit({ id: 1, size: 1, speed: WALK_SPEED, cellX: 10, cellY: 10 });
    map.addUnit({ id: 2, size: 1, speed: WALK_SPEED, cellX: 10, cellY: 50 });
    const a = map.moveUnit(1, center(40, 10));
    const b = map.moveUnit(2, center(40, 50));
    await vi.advanceTimersByTimeAsync(0);
    await Promise.all([a, b]);
    await vi.advanceTimersByTimeAsync(5_000);
    // 유닛 1의 길(y = 10) 위 x = 25~26, y = 5~14에 벽
    expect(map.placeBuilding({ x: 25, y: 5, width: 2, height: 10, rotation: 0 })).toMatchObject({ ok: true });
    expect(stats.paths.blockedReplans).toBe(1);
    await vi.advanceTimersByTimeAsync(0);
    const motion = map.unitInfo(1)?.motion;
    expect(motion?.waypoints.at(-1)).toEqual(center(40, 10));
    const grid = createPlacementGrid(map.replicaInit().terrainCost);
    applyPlacement(grid, 1, { x: 25, y: 5, width: 2, height: 10, rotation: 0 });
    expect(motion && remainingPathBlocked(grid, motion, 1, Date.now())).toBe(false);
    expect(motion?.waypoints.length).toBeGreaterThan(2);
    // 유닛 2는 그대로(직선)
    expect(map.unitInfo(2)?.motion?.waypoints).toHaveLength(2);
    map.stop();
  });

  it("건물을 놓기 전 격자로 푼 결과는 버리고 다시 찾는다", async () => {
    const { map, paths, stats } = createTestMap();
    map.addUnit({ id: 1, size: 1, speed: WALK_SPEED, cellX: 10, cellY: 10 });
    paths.hold = true;
    const result = map.moveUnit(1, center(40, 10));
    // 결과는 지금 격자(건물 없음)로 이미 계산됐다
    await vi.advanceTimersByTimeAsync(0);
    expect(map.placeBuilding({ x: 25, y: 5, width: 2, height: 10, rotation: 0 })).toMatchObject({ ok: true });
    paths.hold = false;
    paths.release();
    await vi.advanceTimersByTimeAsync(0);
    expect(await result).toEqual({ ok: true });
    expect(stats.paths.staleReplans).toBe(1);
    expect(paths.requests).toBe(2);
    const motion = map.unitInfo(1)?.motion;
    const grid = createPlacementGrid(map.replicaInit().terrainCost);
    applyPlacement(grid, 1, { x: 25, y: 5, width: 2, height: 10, rotation: 0 });
    expect(motion && remainingPathBlocked(grid, motion, 1, Date.now())).toBe(false);
    map.stop();
  });
});

describe("남은 경로 검사", () => {
  it("지난 구간의 막힘은 보지 않고, 앞 구간·대각선 옆 칸 막힘은 잡는다", () => {
    const grid = createPlacementGrid();
    const motion = createMotion({
      waypoints: [center(0, 0), center(10, 0), center(20, 10)],
      departAtMs: 0,
      speed: 1024,
    });
    expect(remainingPathBlocked(grid, motion, 1, 0)).toBe(false);
    // 지나온 칸(3, 0)을 막아도 5초 뒤(5칸 지점)에는 상관없다
    applyPlacement(grid, 1, { x: 3, y: 0, width: 1, height: 1, rotation: 0 });
    expect(remainingPathBlocked(grid, motion, 1, 5_000)).toBe(false);
    expect(remainingPathBlocked(grid, motion, 1, 0)).toBe(true);
    // 대각선 구간 (10,0)→(20,10)의 옆 칸 (13, 2)
    applyPlacement(grid, 2, { x: 13, y: 2, width: 1, height: 1, rotation: 0 });
    expect(remainingPathBlocked(grid, motion, 1, 5_000)).toBe(true);
  });
});
