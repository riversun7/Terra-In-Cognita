// 성벽 고리(cityWalls.ts) 시험 — 질문 1048 가. 값은 형식 확인용이다.
import {
  PLACEMENT_SIZE,
  START_WORLD_SEED,
  TEST_SOCIETY_COEFFICIENTS,
  applyPlacement,
  createPlacementGrid,
  footprintRect,
} from "@terra/sim";
import { afterEach, describe, expect, it } from "vitest";
import { type TestMap, createTestMap } from "../world/testSupport.ts";
import { facilityCatalogOf } from "./catalog.ts";
import {
  CITY_WALL_FACILITY,
  cityGates,
  cityWallRulesOf,
  gateIndices,
  planCityWalls,
  ringSides,
  seedCityWalls,
} from "./cityWalls.ts";
import { applyCityRelayout, planCityRelayout } from "./cityRelayout.ts";
import { seedNpcFacilities } from "./npcSeed.ts";
import { cityHall, citySiegeLayout } from "./siegeLayout.ts";
import type { FacilityRecord } from "./state.ts";
import { TEST_FACILITY_SOURCE } from "./testFacilities.ts";

const catalog = facilityCatalogOf(() => TEST_FACILITY_SOURCE)();
const maps: TestMap[] = [];
afterEach(() => {
  for (const test of maps.splice(0)) test.map.stop();
});

const hall = { x: 100, y: 100, width: 3, height: 3 };
const rules = cityWallRulesOf(START_WORLD_SEED);

describe("성벽 고리", () => {
  it("고리는 행정 건물에서 거리 R인 네모 한 바퀴(겹치는 칸 없음)", () => {
    const sides = ringSides(hall, 4);
    const cells = sides.flat();
    expect(cells).toHaveLength(4 * (3 + 2 * 4) - 4);
    expect(new Set(cells.map((cell) => `${cell.x},${cell.y}`)).size).toBe(cells.length);
    for (const cell of cells)
      expect(Math.max(Math.max(100 - cell.x, cell.x - 102), Math.max(100 - cell.y, cell.y - 102))).toBe(4);
    // 변마다 틈 하나(폭 2), 변 가운데
    const gates = gateIndices(sides, rules);
    expect(gates.map((set) => set.size)).toEqual([2, 2, 2, 2]);
    expect([...(gates[0] ?? [])]).toEqual([4, 5]);
  });

  it("빈 땅: 성벽은 고리 위·틈 밖에만, 세로 변은 90° 돌림, 겹치지 않는다", () => {
    const plan = planCityWalls(hall, rules, 4, () => true);
    const sides = ringSides(hall, rules.ringCells);
    const gates = gateIndices(sides, rules);
    const gateCells = new Set(
      sides.flatMap((side, index) =>
        side.filter((_, i) => gates[index]?.has(i)).map((cell) => `${cell.x},${cell.y}`),
      ),
    );
    const ring = new Set(sides.flat().map((cell) => `${cell.x},${cell.y}`));
    const covered = new Set<string>();
    for (const placement of plan) {
      const rect = footprintRect(placement);
      expect(rect.width * rect.height).toBe(4);
      for (let y = rect.y; y < rect.y + rect.height; y++)
        for (let x = rect.x; x < rect.x + rect.width; x++) {
          const key = `${x},${y}`;
          expect(ring.has(key)).toBe(true);
          expect(gateCells.has(key)).toBe(false);
          expect(covered.has(key)).toBe(false);
          covered.add(key);
        }
    }
    expect(plan.some((placement) => placement.rotation === 90)).toBe(true);
    // 놓을 수 없는 자리는 건너뛴다
    expect(planCityWalls(hall, rules, 4, () => false)).toEqual([]);
  });

  it("공성 성문 = 고리의 빈 칸 덩이(성벽 고리 거리를 성벽에서 읽는다)", () => {
    const plan = planCityWalls(hall, rules, 4, () => true);
    const walls = plan.map((placement) => ({ ...footprintRect(placement), durability: 7000 }));
    const taken = new Set<string>();
    for (const wall of walls)
      for (let y = wall.y; y < wall.y + wall.height; y++)
        for (let x = wall.x; x < wall.x + wall.width; x++) taken.add(`${x},${y}`);
    const gates = cityGates(hall, walls, (x, y) => taken.has(`${x},${y}`));
    const gateCells = gates.flatMap((gate) => gate.cells);
    // 성벽 칸 + 성문 칸 = 고리 전체
    expect(gateCells.length + taken.size).toBe(ringSides(hall, rules.ringCells).flat().length);
    expect(gates.every((gate) => gate.durability === 7000)).toBe(true);
    expect(cityGates(hall, [], () => false)).toEqual([]);
  });

  it("NPC 시작 도시 씨앗: 행정 건물 둘레에 성벽을 세우고, 다시 불러도 더 세우지 않으며, 끄면 없다", () => {
    const test = createTestMap({ mapKey: 9 });
    maps.push(test);
    const records = new Map<number, FacilityRecord>();
    const service = {
      facilities: records,
      seedBuilt: (record: FacilityRecord) => records.set(record.buildingId, record),
    };
    const city = { id: 1, factionId: 100, planetId: "p", mapKey: 9, cellX: 128, cellY: 128, start: true };
    const input = {
      maps: new Map([[9, test.map]]),
      cities: [city],
      planetId: "p",
      ownerOfFaction: () => 7,
      service,
      catalog,
      seed: START_WORLD_SEED,
      nowMs: 1_000,
    };
    seedNpcFacilities(input);
    const wallsOf = () => [...records.values()].filter((record) => record.facilityId === CITY_WALL_FACILITY);
    const first = wallsOf().length;
    expect(first).toBeGreaterThanOrEqual(4);
    expect(wallsOf().every((record) => record.cityId === 1 && record.level === 1)).toBe(true);
    seedNpcFacilities({ ...input, nowMs: 2_000 });
    expect(wallsOf()).toHaveLength(first);
    const found = cityHall(test.map, { records, catalog }, 1, { x: 128, y: 128 });
    expect(found).toBeDefined();
    if (!found) return;
    expect(
      seedCityWalls({
        map: test.map,
        cityId: 1,
        ownerId: 7,
        hall: found.rect,
        rules: { ...rules, enabled: false },
        catalog,
        service,
        nowMs: 3_000,
      }),
    ).toBe(0);
  });

  it("2차맵에서 틈은 누구나 지나가는 길이고, 성문은 공성 전투에서만 닫힌다(질문 1070 가)", () => {
    const test = createTestMap({ mapKey: 9 });
    maps.push(test);
    const records = new Map<number, FacilityRecord>();
    seedNpcFacilities({
      maps: new Map([[9, test.map]]),
      cities: [{ id: 1, factionId: 100, planetId: "p", mapKey: 9, cellX: 128, cellY: 128, start: true }],
      planetId: "p",
      ownerOfFaction: () => 7,
      service: { facilities: records, seedBuilt: (record) => records.set(record.buildingId, record) },
      catalog,
      seed: START_WORLD_SEED,
      nowMs: 1_000,
    });
    const found = cityHall(test.map, { records, catalog }, 1, { x: 128, y: 128 });
    expect(found).toBeDefined();
    if (!found) return;
    // 2차맵 배치 격자(경로탐색이 보는 칸): 편 구분이 없다 — 막힌 칸은 건물·지형뿐
    const replica = test.map.replicaInit();
    const grid = createPlacementGrid(replica.terrainCost);
    for (const building of replica.buildings) applyPlacement(grid, building.id, building.placement);
    const reach = (blocked: ReadonlySet<number>): boolean => {
      const start = 2 * PLACEMENT_SIZE + 2;
      const hall = found.rect;
      const goal = (hall.y - 1) * PLACEMENT_SIZE + hall.x + 1;
      const seen = new Uint8Array(PLACEMENT_SIZE * PLACEMENT_SIZE);
      const queue = [start];
      seen[start] = 1;
      for (let k = 0; k < queue.length; k++) {
        const cell = queue[k] ?? 0;
        if (cell === goal) return true;
        const x = cell % PLACEMENT_SIZE;
        const y = (cell - x) / PLACEMENT_SIZE;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= PLACEMENT_SIZE || ny >= PLACEMENT_SIZE) continue;
          const next = ny * PLACEMENT_SIZE + nx;
          if (seen[next] || blocked.has(next) || grid.building[next] !== 0 || grid.terrainCost[next] === 0)
            continue;
          seen[next] = 1;
          queue.push(next);
        }
      }
      return false;
    };
    // 바깥에서 행정 건물 앞까지 걸어 닿는다(틈으로)
    expect(reach(new Set())).toBe(true);
    // 공성 전투 입력에서는 그 틈이 성문(수비 편만)이다 — 성문 칸을 막으면 닿지 못한다(길은 틈뿐)
    const layout = citySiegeLayout(
      test.map,
      1,
      { x: 128, y: 128 },
      {
        records,
        catalog,
        rules: TEST_SOCIETY_COEFFICIENTS,
        at: 1_000,
        terrain: false,
      },
    );
    const gates = layout?.gates ?? [];
    expect(gates.length).toBeGreaterThanOrEqual(4);
    const gateCells = new Set(
      gates.flatMap((gate) => gate.cells.map((cell) => cell.y * PLACEMENT_SIZE + cell.x)),
    );
    expect(reach(gateCells)).toBe(false);
  });

  it("다시 놓기: 행정 건물이 옮겨지면 성벽 고리도 새 자리 둘레에 같은 ID로 다시 선다(질문 1071 가)", () => {
    const test = createTestMap({ mapKey: 9 });
    maps.push(test);
    const records = new Map<number, FacilityRecord>();
    // 옛 배치(행정 건물이 도시 칸에서 떨어져 선다) + 성벽
    seedNpcFacilities({
      maps: new Map([[9, test.map]]),
      cities: [{ id: 1, factionId: 100, planetId: "p", mapKey: 9, cellX: 128, cellY: 128, start: true }],
      planetId: "p",
      ownerOfFaction: () => 7,
      service: { facilities: records, seedBuilt: (record) => records.set(record.buildingId, record) },
      catalog,
      seed: { ...START_WORLD_SEED, cityLayoutMode: 0 },
      nowMs: 1_000,
    });
    const before = cityHall(test.map, { records, catalog }, 1, { x: 128, y: 128 });
    const wallIds = [...records.values()]
      .filter((record) => record.facilityId === CITY_WALL_FACILITY)
      .map((record) => record.buildingId);
    expect(before).toBeDefined();
    expect(wallIds.length).toBeGreaterThanOrEqual(4);
    const plans = planCityRelayout(
      {
        maps: new Map([[9, test.map]]),
        facilities: records,
        catalog,
        gatherKinds: [],
        seed: START_WORLD_SEED,
      },
      {
        cities: [
          { id: 1, factionId: 100, ownerId: 7, code: null, name: null, mapKey: 9, cellX: 128, cellY: 128 },
        ],
        anchors: [{ id: 1, mapKey: 9, x: 128, y: 128 }],
        pinned: new Set(),
      },
    );
    expect(plans[0]?.moves.some((move) => wallIds.includes(move.buildingId))).toBe(true);
    const report = applyCityRelayout(new Map([[9, test.map]]), plans);
    expect(report.relaid).toBe(1);
    const after = cityHall(test.map, { records, catalog }, 1, { x: 128, y: 128 });
    expect(after?.rect).not.toEqual(before?.rect);
    if (!after) return;
    // 성벽은 모두 새 행정 건물에서 거리 R인 고리 위(같은 ID, 지워지거나 새로 생기지 않음)
    const ring = new Set(
      ringSides(after.rect, rules.ringCells)
        .flat()
        .map((cell) => `${cell.x},${cell.y}`),
    );
    const placements = new Map<number, ReturnType<typeof footprintRect>>();
    test.map.forEachBuilding((building) => placements.set(building.id, footprintRect(building.placement)));
    for (const id of wallIds) {
      const rect = placements.get(id);
      expect(rect).toBeDefined();
      if (!rect) continue;
      for (let y = rect.y; y < rect.y + rect.height; y++)
        for (let x = rect.x; x < rect.x + rect.width; x++) expect(ring.has(`${x},${y}`)).toBe(true);
    }
  });
});
