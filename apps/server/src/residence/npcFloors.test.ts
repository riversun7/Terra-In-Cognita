// NPC 층 올리기(npcFloors.ts — 기획 검토 2762, fixes-1117k): 수요(정원이 참)·견적 막힘·비용 몫·성향 굴림·끄기
import { describe, expect, it } from "vitest";
import type { ResidenceFloorQuote } from "@terra/shared/residence";
import { type NpcFloorBuilding, type NpcFloorWorld, createNpcFloors, npcFloorDemand } from "./npcFloors.ts";

const NPC = 8;
const PLAYER = 7;

/** 숙소 셋: 1 = NPC(정원 4, 4명 삶), 2 = NPC(정원 4, 2명), 3 = 플레이어(정원 4, 4명) */
function rig(
  o: { roll?: number; chance?: number; block?: ResidenceFloorQuote["block"]; mode?: number } = {},
) {
  const buildings = new Map<number, NpcFloorBuilding>([
    [1, { ownerId: NPC, cityId: 5, living: true, level: 1, capacity: 4 }],
    [2, { ownerId: NPC, cityId: 5, living: true, level: 1, capacity: 4 }],
    [3, { ownerId: PLAYER, cityId: 5, living: true, level: 1, capacity: 4 }],
  ]);
  const occupants = new Map([
    [1, 4],
    [2, 2],
    [3, 4],
  ]);
  const started: { ownerId: number; buildingId: number; ms: number; items: string[] }[] = [];
  const asked: { cost: bigint; capital: bigint }[] = [];
  const world: NpcFloorWorld = {
    isNpcOwner: (owner) => owner === NPC,
    capitalOf: () => 10_000n,
    materialsValue: (_city, materials) => BigInt(materials.reduce((sum, stack) => sum + stack.qty, 0)) * 10n,
    challengePm: (_owner, cost, capital) => {
      asked.push({ cost, capital });
      return o.chance ?? 500;
    },
  };
  const floors = createNpcFloors({
    buildingIds: () => buildings.keys(),
    building: (id) => buildings.get(id),
    occupants: (id) => occupants.get(id) ?? 0,
    quote: () => ({
      block: o.block ?? null,
      materials: [{ item: "wood", name: null, qty: 6, have: 0 }],
      timeMs: 60_000,
      untilMs: null,
    }),
    start: (input) => {
      started.push({
        ownerId: input.ownerId,
        buildingId: input.buildingId,
        ms: input.ms,
        items: input.materials.map((stack) => `${stack.item}:${stack.qty}`),
      });
      return true;
    },
    npc: () => world,
    rules: () => ({ npcFloorMode: o.mode ?? 1, npcFloorDemandPm: 1000 }),
    roll: () => o.roll ?? 0,
  });
  return { floors, started, asked };
}

describe("NPC 층 올리기 (npcFloors.ts — 2762)", () => {
  it("수요: 사는 유닛이 정원 × 문턱 이상일 때만(정원 0이면 없음)", () => {
    expect(npcFloorDemand(4, 4, { npcFloorDemandPm: 1000 })).toBe(true);
    expect(npcFloorDemand(3, 4, { npcFloorDemandPm: 1000 })).toBe(false);
    expect(npcFloorDemand(3, 4, { npcFloorDemandPm: 750 })).toBe(true);
    expect(npcFloorDemand(0, 0, {})).toBe(false);
  });

  it("정원이 찬 NPC 숙소만 같은 층 공사 견적(재료·시간)으로 건다 — 플레이어 숙소·빈 숙소는 건너뛴다", () => {
    const { floors, started, asked } = rig({ roll: 10, chance: 500 });
    expect(floors.sweep(0)).toEqual({ demand: 1, started: 1 });
    expect(started).toEqual([{ ownerId: NPC, buildingId: 1, ms: 60_000, items: ["wood:6"] }]);
    // 비용 몫 = 재료 값(그 도시 기준값) 대 국고
    expect(asked).toEqual([{ cost: 60n, capital: 10_000n }]);
  });

  it("굴림이 도전 확률(비용 몫 × 성향) 이상이면 이번 훑기는 올리지 않는다", () => {
    const { floors, started } = rig({ roll: 700, chance: 500 });
    expect(floors.sweep(0)).toEqual({ demand: 1, started: 0 });
    expect(started).toEqual([]);
  });

  it("견적이 막혔으면(작업 중·최고 층) 건너뛰고, 끄면(npc_floor_mode 0) 아무것도 하지 않는다", () => {
    expect(rig({ block: "job_running" }).floors.sweep(0)).toEqual({ demand: 0, started: 0 });
    expect(rig({ block: "floor_full" }).floors.sweep(0)).toEqual({ demand: 0, started: 0 });
    expect(rig({ mode: 0 }).floors.sweep(0)).toEqual({ demand: 0, started: 0 });
  });
});
