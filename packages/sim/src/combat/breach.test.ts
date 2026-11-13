// 성벽 뚫기(breach.ts)·성벽이 있는 공성 시험 — 질문 1048 가
import { describe, expect, it } from "vitest";
import { createBattle } from "./battle.ts";
import { type BattleMapInput, createBattleMap } from "./battleMap.ts";
import { BREACH_POINTS_PER_STEP, breachField, breachTarget, hasBreakable } from "./breach.ts";
import { TEST_COMBAT_CATALOG } from "./catalog.ts";
import { TEST_COMBAT_COEFFICIENTS } from "./coefficients.ts";
import { UNREACHABLE } from "./fields.ts";
import type { SiegeLayout, SiegeLayoutBuilding } from "./siegeArena.ts";
import { waveBattleInit } from "../simulator/waveBattle.ts";

const SIZE = 32;
/** 가운데 2×2 넥서스 + 체비쇼프 거리 r 고리 성벽(gap 칸은 비움) */
function ringMap(r: number, durability: number, gap: number[] = [], gate = false): BattleMapInput {
  const cells = SIZE * SIZE;
  const nexus = [15, 16].flatMap((y) => [15, 16].map((x) => y * SIZE + x));
  const ring: number[] = [];
  const holes: number[] = [];
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const d = Math.max(Math.max(15 - x, x - 16), Math.max(15 - y, y - 16));
      if (d !== r) continue;
      (gap.includes(y * SIZE + x) ? holes : ring).push(y * SIZE + x);
    }
  return {
    size: SIZE,
    passable: new Uint8Array(cells).fill(1),
    cover: new Uint8Array(cells),
    height: new Int32Array(cells),
    buildings: [
      { id: 1, cells: nexus, durability: 100, nexus: true },
      { id: 2, cells: ring, durability, nexus: false, wall: true },
      ...(gate && holes.length > 0 ? [{ id: 3, cells: holes, durability, nexus: false, gateSide: 2 }] : []),
    ],
  };
}

describe("성벽 뚫기", () => {
  it("성벽·성문이 없으면 쓰지 않는다", () => {
    const open = ringMap(5, 100);
    expect(hasBreakable(createBattleMap({ ...open, buildings: open.buildings.slice(0, 1) }))).toBe(false);
    expect(hasBreakable(createBattleMap(open))).toBe(true);
  });

  it("닫힌 고리: 바깥은 성벽 비용만큼 멀고, 칠 막음은 넥서스 쪽 성벽", () => {
    const map = createBattleMap(ringMap(5, 1000));
    const field = breachField(map, map.buildings[0]?.cells ?? [], 1, new Set());
    const cost = 1 + 1000 / BREACH_POINTS_PER_STEP;
    // 안쪽 (16, 12)은 넥서스에서 3걸음, 성벽 (16, 10)은 5 + 비용, 바깥 (16, 9)은 그 + 1
    expect(field[12 * SIZE + 16]).toBe(3);
    expect(field[10 * SIZE + 16]).toBe(4 + cost);
    expect(field[9 * SIZE + 16]).toBe(5 + cost);
    expect(breachTarget(map, field, { x: 16, y: 9, range: 1, side: 1 }, new Set())).toBe(2);
    // 부서진 성벽은 누구나 지나간다(뚫기 비용 없음)
    const gone = new Set([2]);
    expect(map.passableFor(10 * SIZE + 16, 1, gone)).toBe(true);
    expect(breachField(map, map.buildings[0]?.cells ?? [], 1, gone)[9 * SIZE + 16]).toBe(6);
  });

  it("틈이 가까우면 돌아가고(칠 막음 없음), 성문은 수비 편만 지난다", () => {
    const gap = [10 * SIZE + 16, 10 * SIZE + 17];
    const map = createBattleMap(ringMap(5, 5000, gap));
    const field = breachField(map, map.buildings[0]?.cells ?? [], 1, new Set());
    expect(field[9 * SIZE + 16]).toBeLessThan(10);
    expect(breachTarget(map, field, { x: 15, y: 9, range: 1, side: 1 }, new Set())).toBeUndefined();
    const gated = createBattleMap(ringMap(5, 5000, gap, true));
    expect(gated.passableFor(10 * SIZE + 16, 2, new Set())).toBe(true);
    expect(gated.passableFor(10 * SIZE + 16, 1, new Set())).toBe(false);
    // 공격 편에게 성문은 뚫을 막음이다
    const attack = breachField(gated, gated.buildings[0]?.cells ?? [], 1, new Set());
    expect(breachTarget(gated, attack, { x: 16, y: 9, range: 1, side: 1 }, new Set())).toBeDefined();
  });

  it("성벽 고리가 있는 웨이브: 크리쳐가 성벽을 부수고 넥서스를 무너뜨리며, 성벽이 없을 때보다 늦게 닿는다", () => {
    const hall = { x: 126, y: 126, width: 4, height: 4 };
    // 행정 건물 둘레 6칸 고리를 성벽 넷(위·아래·왼·오른)으로 닫는다
    const r = 6;
    const ring = (durability: number): SiegeLayoutBuilding[] => [
      {
        sourceId: 11,
        x: hall.x - r,
        y: hall.y - r,
        width: hall.width + 2 * r,
        height: 1,
        durability,
        wall: true,
      },
      {
        sourceId: 12,
        x: hall.x - r,
        y: hall.y + hall.height + r - 1,
        width: hall.width + 2 * r,
        height: 1,
        durability,
        wall: true,
      },
      {
        sourceId: 13,
        x: hall.x - r,
        y: hall.y - r + 1,
        width: 1,
        height: hall.height + 2 * r - 2,
        durability,
        wall: true,
      },
      {
        sourceId: 14,
        x: hall.x + hall.width + r - 1,
        y: hall.y - r + 1,
        width: 1,
        height: hall.height + 2 * r - 2,
        durability,
        wall: true,
      },
    ];
    const reachTick = (buildings: SiegeLayoutBuilding[]) => {
      const layout: SiegeLayout = {
        mapCells: 256,
        nexus: hall,
        nexusSourceId: null,
        buildings,
        terrain: null,
      };
      const init = waveBattleInit(
        {
          battleId: 1,
          seed: 5,
          defenderFaction: 2,
          defenders: [],
          defenderTech: 1,
          strength: 6,
          physical: 6,
          creatureTech: 1,
          firstCreatureId: 1000,
          mapSize: 128,
          nexusDurability: 300,
          maxDefenders: 0,
          layout,
          attackEdge: 3,
        },
        TEST_COMBAT_CATALOG,
        TEST_COMBAT_COEFFICIENTS,
      );
      const battle = createBattle(init, TEST_COMBAT_COEFFICIENTS);
      let reach: number | null = null;
      while (!battle.state.result && battle.state.tick < 20_000) {
        battle.step([]);
        const nexus = battle.state.buildings.find((building) => building.id === 1);
        if (reach === null && (nexus?.durability ?? 0) < 300) reach = battle.state.tick;
      }
      return { reach, state: battle.state };
    };
    const open = reachTick([]);
    // 발톱 간격도 무기 간격 식(AGI ÷ 적정 AGI의 제곱, 2026-11-13)이라 크리쳐가 더 빨리 쳐서 성벽 내구도를 3만으로 올렸다
    const walled = reachTick(ring(30_000));
    expect(open.state.result?.reason).toBe("nexus");
    expect(walled.state.result?.reason).toBe("nexus");
    expect(walled.state.buildings.some((building) => building.id !== 1 && building.durability <= 0)).toBe(
      true,
    );
    // 크리쳐 건물 피해는 한 대에 수백이라 성벽은 내구도 수만이어야 몇 초를 번다
    expect(walled.reach ?? UNREACHABLE).toBeGreaterThan((open.reach ?? 0) + 20);
  });
});
