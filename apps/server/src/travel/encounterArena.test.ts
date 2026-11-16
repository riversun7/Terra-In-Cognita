// 조우 전투맵(D-172·D-570 1902) — 만난 자리 둘레 실제 지형·부술 수 있는 건물(질문 2030 답)·자리·들어오는 변, 시작 자료(공격 편 = 편 1·퇴각 기준)
import { type CombatUnitSpec, type SecondMapLayers } from "@terra/sim";
import { describe, expect, it } from "vitest";
import {
  arenaOrigin,
  arenaSizeOf,
  encounterCenter,
  encounterEdges,
  encounterMap,
  placeEncounterUnits,
} from "./encounterArena.ts";
import { buildEncounterInit } from "./encounterInit.ts";

/** 배치 칸 256 시험 지형: x ≥ 200은 막힘(물), 꼭짓점 높이 = x × 10cm */
function layers(): SecondMapLayers {
  const size = 256;
  const costs = new Uint16Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) costs[y * size + x] = x >= 200 ? 0 : 1000;
  const heights = new Int32Array(129 * 129);
  for (let y = 0; y < 129; y++) for (let x = 0; x < 129; x++) heights[y * 129 + x] = x * 20;
  return { size, costs, cover: null, terrainSize: 128, vertexHeightsCm: heights };
}

describe("조우 전투맵", () => {
  it("한 변은 짝수 32 ~ 128, 원점은 가운데 점 둘레를 2차맵 안으로 민다", () => {
    expect(arenaSizeOf(64, 256)).toBe(64);
    expect(arenaSizeOf(65, 256)).toBe(64);
    expect(arenaSizeOf(500, 256)).toBe(128);
    expect(arenaSizeOf(1, 256)).toBe(32);
    expect(arenaOrigin({ x: 100, y: 100 }, 64, 256)).toEqual({ x: 68, y: 68 });
    expect(arenaOrigin({ x: 5, y: 250 }, 64, 256)).toEqual({ x: 0, y: 192 });
  });

  it("지형을 복사하고(막힌 칸·높이), 창 안 건물은 부술 수 있는 전투 건물(내구도·성벽, 2차맵 ID 차례)", () => {
    const origin = { x: 180, y: 0 };
    const { map, sources } = encounterMap(
      layers(),
      256,
      [
        { sourceId: 9, x: 181, y: 1, width: 2, height: 2, durability: 300 },
        { sourceId: 4, x: 190, y: 5, width: 1, height: 1, durability: 0, wall: true },
        { sourceId: 5, x: 10, y: 10, width: 2, height: 2, durability: 50 },
      ],
      origin,
      32,
    );
    expect(map.size).toBe(32);
    expect(map.passable[0]).toBe(1);
    expect(map.passable[25]).toBe(0); // x = 205: 물
    // 건물 칸은 땅 그대로(전투 건물이 막는다 — 부서지면 지나간다)
    expect(map.passable[1 * 32 + 1]).toBe(1);
    expect(map.buildings).toEqual([
      { id: 1, cells: [5 * 32 + 10], durability: 1, nexus: false, wall: true },
      { id: 2, cells: [33, 34, 65, 66], durability: 300, nexus: false, breakable: true },
    ]);
    expect([...sources]).toEqual([
      [1, 4],
      [2, 9],
    ]);
    expect((map.height[10] ?? 0) > (map.height[0] ?? 0)).toBe(true);
    // 지형이 없으면 평지
    const plain = encounterMap(null, 256, [], { x: 0, y: 0 }, 32).map;
    expect(plain.passable.every((v) => v === 1)).toBe(true);
    // 시작 자리는 건물 칸을 피한다
    const spots = placeEncounterUnits(map, origin, [[{ unitId: 1, x: 181, y: 1 }]]);
    expect(map.buildings[1]?.cells.includes((spots.get(1)?.y ?? 0) * 32 + (spots.get(1)?.x ?? 0))).toBe(
      false,
    );
  });

  it("자리 = 2차맵 칸을 창 틀로(퇴각 띠 안쪽), 막혔거나 찬 칸이면 가까운 빈 칸, 변 = 무게중심 쪽", () => {
    const map = encounterMap(layers(), 256, [], { x: 0, y: 0 }, 64).map;
    const spots = placeEncounterUnits(map, { x: 0, y: 0 }, [
      [
        { unitId: 1, x: 10, y: 30 },
        { unitId: 2, x: 10, y: 30 },
      ],
      [{ unitId: 3, x: 200, y: 30 }],
    ]);
    expect(spots.get(1)).toEqual({ x: 10, y: 30 });
    expect(spots.get(2)).not.toEqual({ x: 10, y: 30 });
    expect(spots.get(3)).toEqual({ x: 61, y: 30 });
    expect(
      encounterEdges({ x: 0, y: 0 }, 64, [[{ unitId: 1, x: 10, y: 30 }], [{ unitId: 3, x: 60, y: 30 }]]),
    ).toEqual([3, 1]);
    // 두 편이 같은 쪽이면 뒤 편은 맞은편
    expect(
      encounterEdges({ x: 0, y: 0 }, 64, [[{ unitId: 1, x: 32, y: 2 }], [{ unitId: 3, x: 33, y: 3 }]]),
    ).toEqual([0, 2]);
    expect(encounterCenter([[{ unitId: 1, x: 10, y: 10 }], [{ unitId: 2, x: 30, y: 50 }]])).toEqual({
      x: 20,
      y: 30,
    });
  });
});

const spec = (unitId: number, spot: { side: number; party: number; x: number; y: number }) =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 시험: 자리 칸만 본다
  ({ id: unitId, ...spot }) as unknown as CombatUnitSpec;

const map = () => encounterMap(layers(), 256, [], { x: 0, y: 0 }, 64).map;

describe("buildEncounterInit", () => {
  it("편 1 = 공격 편(defender false), 편 2 = 수비 편, faction = 그 편 첫 유닛 주체, 보통 전투", () => {
    const init = buildEncounterInit({
      sides: [
        [{ unitId: 7, x: 50, y: 20 }],
        [
          { unitId: 1, x: 10, y: 20 },
          { unitId: 2, x: 12, y: 20 },
        ],
      ],
      map: map(),
      origin: { x: 0, y: 0 },
      ownerOf: (id) => id * 10,
      place: spec,
      seed: 42,
      retreatPct: [0, 50],
      // 유닛 2만 제 작전 ⑦(판단 유닛), 나머지는 편 값
      unitRetreat: new Map([[2, 70]]),
    });
    expect(init?.kind).toBe("normal");
    expect(init?.sides).toEqual([
      { id: 1, faction: 70, defender: false, edge: 1 },
      { id: 2, faction: 10, defender: true, edge: 3 },
    ]);
    expect(init?.units.map((u) => [u.id, u.side, u.x, u.y])).toEqual([
      [7, 1, 50, 20],
      [1, 2, 10, 20],
      [2, 2, 12, 20],
    ]);
    // 유닛마다 제 파티(D-558 1547 "파티도 없으면 유닛들 개별 참전", 질문 2131)
    expect(init?.units.map((u) => [u.id, u.party])).toEqual([
      [7, 101],
      [1, 201],
      [2, 202],
    ]);
    expect(init?.parties.map((p) => [p.id, p.side, p.retreatHpPct])).toEqual([
      [101, 1, 0],
      [201, 2, 50],
      [202, 2, 70],
    ]);
  });

  it("한 편이 전투 사양을 하나도 얻지 못하면 null", () => {
    expect(
      buildEncounterInit({
        sides: [[{ unitId: 7, x: 50, y: 20 }], [{ unitId: 1, x: 10, y: 20 }]],
        map: map(),
        origin: { x: 0, y: 0 },
        ownerOf: (id) => id,
        place: (id, spot) => (id === 1 ? undefined : spec(id, spot)),
        seed: 1,
      }),
    ).toBe(null);
  });
});
