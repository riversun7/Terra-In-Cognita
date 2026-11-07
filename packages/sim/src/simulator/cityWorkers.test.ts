// NPC 도시 일꾼 나누기(기획 답 532 나, D-518 "굶음(D-433)부터 막기") — docs/adr/2026-11-07-play-flow.md "WP5 나라 성격"
import { describe, expect, it } from "vitest";
import type { RecipeSpec } from "../economy/production.ts";
import { type CityWorkSlot, assignCityWorkers } from "./cityWorkers.ts";

const recipe = (
  id: string,
  inputs: [string, bigint][],
  outputs: [string, bigint][],
  work = 1000,
): RecipeSpec => ({
  id,
  facility: id,
  inputs: inputs.map(([asset, qty]) => ({ asset, qty })),
  outputs: outputs.map(([asset, qty]) => ({ asset, qty })),
  work,
  tier: 0,
});
const slot = (id: number, spec: RecipeSpec, slots = 10): CityWorkSlot => ({
  id,
  recipe: spec,
  slots,
  progress: 1,
  yieldPerLot: 1,
});
// 시험 팩과 같은 사슬: 곡물 20 → 배급 식량 30(주방), 철 2 + 목재 1 → 생활용품 1(작업장, 작업량 500)
const MINE = slot(1, recipe("mine", [], [["item:iron_ore", 10n]]));
const LUMBER = slot(2, recipe("lumber", [], [["item:timber", 10n]]));
const FARM = slot(3, recipe("farm", [], [["item:grain", 20n]]));
const KITCHEN = slot(4, recipe("kitchen", [["item:grain", 20n]], [["item:ration", 30n]]));
const NEEDS = [
  { asset: "item:ration", perUnit: 1n, periodHours: 1 },
  { asset: "item:household_goods", perUnit: 1n, periodHours: 24 },
];

describe("도시 일꾼 나누기(532 나)", () => {
  it("식량 사슬(주방 → 농장)을 하루 몫만큼 먼저 채우고, 남은 휴먼은 시설마다 한 명씩 돌린다", () => {
    // 휴먼 40명: 하루 배급 식량 960 = 주방 일꾼 한 명 하루 720 → 2명, 주방 2명이 쓰는 곡물 960 = 농장 한 명 480 → 2명
    const out = assignCityWorkers([MINE, LUMBER, FARM, KITCHEN], 6, NEEDS);
    // 6명이면 식량 몫(주방 1 → 곡물 480 → 농장 1, 6명의 하루 몫 144 < 720)을 먼저 채우고 남은 넷을 돌린다
    expect([...out.entries()].toSorted(([a], [b]) => a - b)).toEqual([
      [1, 1],
      [2, 1],
      [3, 2],
      [4, 2],
    ]);
    const big = assignCityWorkers([MINE, LUMBER, FARM, KITCHEN], 40, NEEDS);
    expect(big.get(4)).toBeGreaterThanOrEqual(2);
    expect(big.get(3)).toBeGreaterThanOrEqual(2);
  });

  it("휴먼이 적으면 식량 사슬만 일하고(돌려 나누던 옛 방식은 광산·벌목장부터 채웠다), 자리 수를 넘지 않는다", () => {
    expect(Object.fromEntries(assignCityWorkers([MINE, LUMBER, FARM, KITCHEN], 2, NEEDS))).toEqual({
      3: 1,
      4: 1,
    });
    const tight = assignCityWorkers([slot(4, KITCHEN.recipe, 1), slot(3, FARM.recipe, 1)], 9, NEEDS);
    expect(Object.fromEntries(tight)).toEqual({ 3: 1, 4: 1 });
  });

  it("생필품을 내는 시설이 없으면 옛 방식(시설마다 한 명씩 돌림) 그대로다", () => {
    expect(Object.fromEntries(assignCityWorkers([MINE, LUMBER], 3, NEEDS))).toEqual({ 1: 2, 2: 1 });
    expect(assignCityWorkers([], 5, NEEDS).size).toBe(0);
  });
});
