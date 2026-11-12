// 공성 전투맵 입력 = 실제 2차맵 배치(siegeLayout.ts) 시험 — 평평한 시험 2차맵에 NPC 시작 도시 기본 시설을 세우고 본다. 값은 형식 확인용이다.
import {
  type BattleMap,
  START_WORLD_SEED,
  TEST_SOCIETY_COEFFICIENTS,
  createBattleMap,
  footprintRect,
} from "@terra/sim";
import { siegeArena, siegePlacer } from "@terra/sim/siegeArena";
import { afterEach, describe, expect, it } from "vitest";
import { type TestMap, createTestMap } from "../world/testSupport.ts";
import { facilityCatalogOf } from "./catalog.ts";
import { seedNpcFacilities } from "./npcSeed.ts";
import { beaconSiegeLayout, cityHall, citySiegeLayout } from "./siegeLayout.ts";
import type { FacilityRecord } from "./state.ts";
import { TEST_FACILITY_SOURCE } from "./testFacilities.ts";

const catalog = facilityCatalogOf(() => TEST_FACILITY_SOURCE)();
const maps: TestMap[] = [];
afterEach(() => {
  for (const test of maps.splice(0)) test.map.stop();
});

function seededCity() {
  const test = createTestMap({ mapKey: 9 });
  maps.push(test);
  const records = new Map<number, FacilityRecord>();
  seedNpcFacilities({
    maps: new Map([[9, test.map]]),
    cities: [{ id: 1, factionId: 100, planetId: "p", mapKey: 9, cellX: 128, cellY: 128, start: true }],
    planetId: "p",
    ownerOfFaction: () => 7,
    service: {
      facilities: records,
      seedBuilt: (record: FacilityRecord) => records.set(record.buildingId, record),
    },
    catalog,
    seed: START_WORLD_SEED,
    nowMs: 1_000,
  });
  const source = { records, catalog, rules: TEST_SOCIETY_COEFFICIENTS, at: 1_000 };
  return { map: test.map, records, source };
}

/** 넥서스 칸에서 편 side가 4방향으로 걸어 to에 닿나(대각선 모서리 규칙이 있어 4방향과 같다) */
function reaches(map: BattleMap, from: number, to: number, side: number): boolean {
  const size = map.size;
  const seen = new Uint8Array(size * size);
  const queue = [from];
  seen[from] = 1;
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i] ?? 0;
    if (cell === to) return true;
    const x = cell % size;
    const y = (cell - x) / size;
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      const next = ny * size + nx;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size || seen[next] === 1) continue;
      if (!map.passableFor(next, side, new Set())) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  return false;
}

describe("공성 전투맵 입력(실제 2차맵 배치)", () => {
  it("넥서스 = 그 도시 행정 건물 실제 칸, 다른 시설은 실제 칸의 장애물", () => {
    const { map, records, source } = seededCity();
    const hall = cityHall(map, source, 1, { x: 128, y: 128 });
    expect(hall).toBeDefined();
    expect(catalog.facility(records.get(hall?.id ?? 0)?.facilityId ?? "")?.stage).toBe("government");
    const layout = citySiegeLayout(map, 1, { x: 128, y: 128 }, source);
    expect(layout?.nexusSourceId).toBe(hall?.id);
    expect(layout?.nexus).toEqual(hall?.rect);
    if (!layout) return;
    const arena = siegeArena(layout, 128, 2000);
    const battleMap = createBattleMap(arena.map);
    // 시설마다 실제 칸이 그 전투 건물이다(창 원점만큼 옮김)
    let seen = 0;
    map.forEachBuilding((building) => {
      const rect = footprintRect(building.placement);
      const cell = (rect.y - arena.origin.y) * 128 + (rect.x - arena.origin.x);
      const id = battleMap.buildingAt[cell] ?? 0;
      expect(id).toBeGreaterThan(0);
      expect(arena.sources.get(id)).toBe(building.id);
      seen += 1;
    });
    const gates = arena.map.buildings.filter((building) => building.gateSide !== undefined);
    expect(seen).toBe(arena.map.buildings.length - gates.length);
    expect(seen).toBeGreaterThan(5);
    // 성벽 고리(설정 칸 출발값 켬): 성벽은 뚫리는 막음, 고리의 빈 칸은 수비 편(2)만 지나가는 성문
    const walls = arena.map.buildings.filter((building) => building.wall === true);
    expect(walls.length).toBeGreaterThanOrEqual(4);
    expect(gates.length).toBeGreaterThanOrEqual(4);
    expect(gates.every((gate) => gate.gateSide === 2)).toBe(true);
    // 고리가 닫혔다: 공격 편(1)은 바깥(맨 윗줄 5번 칸)에서 넥서스로 걸어 닿지 못한다(뚫어야 한다)
    const nexusCell = arena.map.buildings[0]?.cells[0] ?? 0;
    const outside = 5;
    expect(battleMap.passableFor(outside, 1, new Set())).toBe(true);
    expect(reaches(battleMap, nexusCell, outside, 1)).toBe(false);
    expect(reaches(battleMap, nexusCell, outside, 2)).toBe(true);
    // 다른 도시 ID면 행정 건물이 없다 → 열린 맵
    expect(citySiegeLayout(map, 2, { x: 128, y: 128 }, source)).toBeUndefined();
    // 시작 자리는 모두 정해진다
    const placer = siegePlacer(arena, 1);
    for (let i = 0; i < 30; i++) expect(placer.attacker(i)).toBeDefined();
    for (let i = 0; i < 10; i++) expect(placer.defender(i)).toBeDefined();
  });

  it("평지만(terrain false)이면 지형 층을 읽지 않는다", () => {
    const { map, source } = seededCity();
    expect(citySiegeLayout(map, 1, { x: 128, y: 128 }, { ...source, terrain: false })?.terrain).toBeNull();
    expect(citySiegeLayout(map, 1, { x: 128, y: 128 }, source)?.terrain?.size).toBe(256);
  });

  it("비콘 자리에 건물이 있으면 열린 맵(undefined), 비었으면 2×2 자리", () => {
    const { map, source } = seededCity();
    const hall = cityHall(map, source, 1, { x: 128, y: 128 });
    const at = hall ? { x: hall.rect.x + 1, y: hall.rect.y + 1 } : { x: 128, y: 128 };
    expect(beaconSiegeLayout(map, at, source)).toBeUndefined();
    const empty = beaconSiegeLayout(map, { x: 20, y: 230 }, source);
    expect(empty?.nexus).toEqual({ x: 19, y: 229, width: 2, height: 2 });
    expect(empty?.nexusSourceId).toBeNull();
  });
});
