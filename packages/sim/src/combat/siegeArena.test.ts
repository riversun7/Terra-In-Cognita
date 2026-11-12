// 공성 전투맵 = 도시 실제 배치(siegeArena.ts) 시험 — D-533, 질문 1046 가
import { describe, expect, it } from "vitest";
import { createBattle } from "./battle.ts";
import { createBattleMap } from "./battleMap.ts";
import { TEST_COMBAT_CATALOG } from "./catalog.ts";
import { TEST_COMBAT_COEFFICIENTS } from "./coefficients.ts";
import { UNREACHABLE, distanceField } from "./fields.ts";
import {
  type SiegeLayout,
  edgeToward,
  siegeArena,
  siegeNexusDurability,
  siegeOrigin,
  siegePlacer,
  waveAttackEdge,
} from "./siegeArena.ts";
import { breachField, breachTarget, hasBreakable } from "./breach.ts";
import { runWaveToEnd, waveBattleInit } from "../simulator/waveBattle.ts";
import type { SimUnit } from "../simulator/world.ts";

/** 가운데 행정 건물(4×4) + 서쪽에 남북으로 긴 건물 벽 하나 + 창 밖 건물 하나 */
function layout(extra: Partial<SiegeLayout> = {}): SiegeLayout {
  return {
    mapCells: 256,
    nexus: { x: 126, y: 126, width: 4, height: 4 },
    nexusSourceId: 50,
    buildings: [
      { sourceId: 7, x: 110, y: 110, width: 3, height: 36, durability: 900 },
      { sourceId: 50, x: 126, y: 126, width: 4, height: 4, durability: 10 },
      { sourceId: 3, x: 10, y: 10, width: 4, height: 4, durability: 900 },
    ],
    terrain: null,
    ...extra,
  };
}

const unit = (id: number): SimUnit => ({
  id,
  city: 1,
  owner: 2,
  job: { job: 0, phase: 0, progressMs: 0, fatigue: 0 },
  pos: { x: 0, y: 0 },
  tripStep: 0,
  eventId: undefined,
  satisfactionMilli: 0,
  bornAtMs: 0,
  lifespanMs: 0,
  recruit: null,
  rebirths: 0,
});

describe("siegeArena", () => {
  it("넥서스는 행정 건물 실제 칸, 창 안 다른 건물은 장애물, 창 밖은 빠진다", () => {
    const arena = siegeArena(layout(), 128, 2000);
    expect(arena.origin).toEqual({ x: 64, y: 64 });
    const [nexus, wall, ...rest] = arena.map.buildings;
    expect(rest).toHaveLength(0);
    expect(nexus?.nexus).toBe(true);
    expect(nexus?.durability).toBe(2000);
    expect(nexus?.cells).toHaveLength(16);
    expect(nexus?.cells[0]).toBe((126 - 64) * 128 + (126 - 64));
    expect(wall?.nexus).toBe(false);
    expect(wall?.cells).toHaveLength(3 * 36);
    expect(arena.sources.get(1)).toBe(50);
    expect(arena.sources.get(wall?.id ?? 0)).toBe(7);
    // 다시보기 부호기는 칸을 작은 차례로 바란다
    for (const building of arena.map.buildings)
      expect([...building.cells]).toEqual(building.cells.toSorted((a, b) => a - b));
  });

  it("창이 2차맵 밖으로 나가면 안쪽으로 밀고, 걸친 건물은 잘린다", () => {
    const edge = layout({
      nexus: { x: 4, y: 250, width: 2, height: 2 },
      nexusSourceId: null,
      buildings: [{ sourceId: 9, x: 120, y: 120, width: 20, height: 4, durability: 5 }],
    });
    expect(siegeOrigin(edge, 128)).toEqual({ x: 0, y: 128 });
    const arena = siegeArena(edge, 128, 100);
    expect(arena.sources.has(1)).toBe(false);
    // 창은 y ≥ 128이라 y 120~123 건물은 걸치지 않는다(넥서스만)
    expect(arena.map.buildings).toHaveLength(1);
  });

  it("시작 자리는 지나갈 수 있고 넥서스까지 닿는 빈 칸이며 겹치지 않는다", () => {
    const arena = siegeArena(layout(), 128, 2000);
    const map = createBattleMap(arena.map);
    const field = distanceField(map, [...(arena.map.buildings[0]?.cells ?? [])], (cell) =>
      map.passableFor(cell, 0, new Set()),
    );
    for (const edge of [0, 1, 2, 3] as const) {
      const placer = siegePlacer(arena, edge);
      const seen = new Set<number>();
      const attackers = Array.from({ length: 40 }, (_, i) => placer.attacker(i));
      const defenders = Array.from({ length: 12 }, (_, i) => placer.defender(i));
      for (const at of [...attackers, ...defenders]) {
        expect(at).toBeDefined();
        if (!at) continue;
        const cell = at.y * 128 + at.x;
        expect(map.passableFor(cell, 0, new Set())).toBe(true);
        expect(field[cell]).not.toBe(UNREACHABLE);
        expect(seen.has(cell)).toBe(false);
        seen.add(cell);
      }
      // 공격 편 첫 자리 = 들어오는 변의 3칸째 줄
      const first = attackers[0];
      const depth =
        edge === 3
          ? first?.x
          : edge === 1
            ? 127 - (first?.x ?? 0)
            : edge === 0
              ? first?.y
              : 127 - (first?.y ?? 0);
      expect(depth).toBe(2);
    }
  });

  it("서쪽 벽 건물 칸에 걸린 수비 자리는 가까운 빈 칸으로 비킨다", () => {
    // 넥서스 바로 서쪽 3칸 줄을 건물로 막는다 → 수비 첫 자리(넥서스 앞 3칸)는 그 건물 밖
    const blocked = layout({
      buildings: [{ sourceId: 7, x: 121, y: 100, width: 3, height: 60, durability: 900 }],
    });
    const arena = siegeArena(blocked, 128, 2000);
    const at = siegePlacer(arena, 3).defender(0);
    const map = createBattleMap(arena.map);
    expect(at).toBeDefined();
    expect(map.buildingAt[(at?.y ?? 0) * 128 + (at?.x ?? 0)]).toBe(0);
  });

  it("웨이브 시작 자료: 배치가 있으면 그 전투맵·변, 같은 입력이면 같은 결과", () => {
    const input = {
      battleId: 1,
      seed: 99,
      defenderFaction: 2,
      defenders: [unit(1), unit(2), unit(3)],
      defenderTech: 1,
      strength: 6,
      physical: 3,
      creatureTech: 1,
      firstCreatureId: 1000,
      mapSize: 128,
      nexusDurability: 400,
      maxDefenders: 10,
      layout: layout(),
      attackEdge: 0 as const,
    };
    const init = waveBattleInit(input, TEST_COMBAT_CATALOG, TEST_COMBAT_COEFFICIENTS);
    expect(init.map.buildings).toHaveLength(2);
    expect(init.sides.map((side) => side.edge)).toEqual([0, 2]);
    // 크리쳐는 북쪽 3칸째 줄
    expect(init.units.filter((u) => u.side === 1).every((u) => u.y === 2)).toBe(true);
    const a = runWaveToEnd(createBattle(init, TEST_COMBAT_COEFFICIENTS), []);
    const b = runWaveToEnd(
      createBattle(
        waveBattleInit(input, TEST_COMBAT_CATALOG, TEST_COMBAT_COEFFICIENTS),
        TEST_COMBAT_COEFFICIENTS,
      ),
      [],
    );
    expect(a.result).toEqual(b.result);
    // 배치가 없으면 옛 열린 맵(가운데 2×2 넥서스, 서쪽 변)
    const open = waveBattleInit(
      { ...input, layout: undefined },
      TEST_COMBAT_CATALOG,
      TEST_COMBAT_COEFFICIENTS,
    );
    expect(open.map.buildings).toHaveLength(1);
    expect(open.map.buildings[0]?.cells).toEqual([
      63 * 128 + 63,
      63 * 128 + 64,
      64 * 128 + 63,
      64 * 128 + 64,
    ]);
    expect(open.sides.map((side) => side.edge)).toEqual([3, 1]);
  });

  it("들어오는 변 = 모함 쪽(질문 1067 가): 더 큰 축, 같으면 동·서, 방향이 없으면 undefined", () => {
    expect(edgeToward(10, 3)).toBe(1);
    expect(edgeToward(-10, 3)).toBe(3);
    expect(edgeToward(2, 9)).toBe(2);
    expect(edgeToward(2, -9)).toBe(0);
    expect(edgeToward(5, 5)).toBe(1);
    expect(edgeToward(-5, -5)).toBe(3);
    expect(edgeToward(0, 0)).toBeUndefined();
    expect(edgeToward(Number.NaN, 1)).toBeUndefined();
    // 방향을 모르면 시드로 고른 변(늘 같은 값)
    expect(waveAttackEdge(7, 3)).toBe(waveAttackEdge(7, 3));
  });

  it("넥서스 내구도 = 행정 건물의 지금 내구도(질문 1069 가), 건물이 아니면 부르는 쪽 값", () => {
    expect(siegeNexusDurability(layout(), 2000)).toBe(10);
    expect(siegeNexusDurability(layout({ nexusSourceId: null }), 2000)).toBe(2000);
    expect(siegeNexusDurability(layout({ nexusSourceId: 999 }), 2000)).toBe(2000);
    const init = waveBattleInit(
      {
        battleId: 1,
        seed: 1,
        defenderFaction: 2,
        defenders: [],
        defenderTech: 1,
        strength: 1,
        physical: 1,
        creatureTech: 1,
        firstCreatureId: 1000,
        mapSize: 128,
        nexusDurability: 2000,
        maxDefenders: 0,
        layout: layout(),
        attackEdge: 3,
      },
      TEST_COMBAT_CATALOG,
      TEST_COMBAT_COEFFICIENTS,
    );
    expect(init.map.buildings.find((building) => building.nexus)?.durability).toBe(10);
  });

  it("보통 건물은 부숴 길을 낼 수 있다(질문 1073): 돌아가는 길이 길면 친다, 부서지면 지나가고 시선은 막는다", () => {
    // 행정 건물을 둘레 건물 넷(내구도 100)이 빈틈 없이 감싼다 — 넥서스까지 걷는 길이 없다
    const hall = { x: 126, y: 126, width: 4, height: 4 };
    const closed = layout({
      nexus: hall,
      nexusSourceId: null,
      buildings: [
        { sourceId: 1, x: 122, y: 122, width: 12, height: 4, durability: 100 },
        { sourceId: 2, x: 122, y: 130, width: 12, height: 4, durability: 100 },
        { sourceId: 3, x: 122, y: 126, width: 4, height: 4, durability: 100 },
        { sourceId: 4, x: 130, y: 126, width: 4, height: 4, durability: 100 },
      ],
    });
    const arena = siegeArena(closed, 128, 300);
    expect(arena.map.buildings.filter((building) => building.breakable === true)).toHaveLength(4);
    const map = createBattleMap(arena.map);
    expect(hasBreakable(map)).toBe(true);
    const nexusCells = arena.map.buildings.find((building) => building.nexus)?.cells ?? [];
    const field = breachField(map, nexusCells, 1, new Set());
    // 서쪽 건물(3) 바로 바깥에서는 그 건물이 칠 막음
    const outside = { x: 121 - arena.origin.x, y: 127 - arena.origin.y };
    expect(breachTarget(map, field, { ...outside, range: 1, side: 1 }, new Set())).toBeDefined();
    const westId = [...arena.sources].find(([, source]) => source === 3)?.[0] ?? 0;
    const westCell = (127 - arena.origin.y) * 128 + (123 - arena.origin.x);
    expect(map.passableFor(westCell, 1, new Set())).toBe(false);
    expect(map.passableFor(westCell, 1, new Set([westId]))).toBe(true);
    expect(map.blocksSight(westCell, new Set([westId]))).toBe(true);
    // 크리쳐는 둘레 건물을 부수고 넥서스를 무너뜨린다
    const init = waveBattleInit(
      {
        battleId: 1,
        seed: 3,
        defenderFaction: 2,
        defenders: [],
        defenderTech: 1,
        strength: 4,
        physical: 4,
        creatureTech: 1,
        firstCreatureId: 1000,
        mapSize: 128,
        nexusDurability: 300,
        maxDefenders: 0,
        layout: closed,
        attackEdge: 3,
      },
      TEST_COMBAT_CATALOG,
      TEST_COMBAT_COEFFICIENTS,
    );
    const { result, state } = runWaveToEnd(createBattle(init, TEST_COMBAT_COEFFICIENTS), []);
    expect(result?.reason).toBe("nexus");
    expect(state.buildings.some((building) => building.id !== 1 && building.durability <= 0)).toBe(true);
  });
});
