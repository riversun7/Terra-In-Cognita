// NPC 채집 티어 규칙(기획 D-562 1562) — 팩 오브젝트 묶음에서 위 끝·같은 티어 비중, 자리(산지 몫·물 종류)로 굴림 규칙
import { describe, expect, it } from "vitest";
import { type NpcObjectSource, npcFishRanges, npcGatherTiersOf, npcTierRollOf } from "./npcGatherTiers.ts";

const TIER: Record<string, number> = {
  stone: 1,
  rubble: 0,
  copper_ore: 2,
  iron_ore: 3,
  pine_log: 0,
  birch_log: 1,
  cypress_log: 2,
  loach: 0,
  saury: 3,
  shellfish: 0,
  carp: 1,
  mackerel: 3,
  yellowtail: 6,
  whale_meat: 6,
};
const OBJECTS: NpcObjectSource[] = [
  { source: "prop", facility: "mine", item: "stone", tierRange: { min: 1, max: 1 } },
  { source: "rock", facility: "mine", item: "copper_ore", tierRange: { min: 2, max: 9 } },
  { source: "outcrop", facility: "mine", item: "copper_ore", tierRange: { min: 2, max: 3 } },
  { source: "site", facility: "mine", item: "iron_ore", tierRange: { min: 3, max: 7 } },
  { source: "prop", facility: "lumber_camp", item: "pine_log", tierRange: { min: 0, max: 1 } },
  { source: "prop", facility: "lumber_camp", item: "birch_log", tierRange: { min: 1, max: 5 } },
  { source: "site", facility: "lumber_camp", item: "cypress_log", tierRange: { min: 2, max: 9 } },
  {
    source: "plot",
    facility: "fishing_spot",
    item: "loach",
    tierRange: { min: 0, max: 2 },
    waters: ["fresh"],
  },
  {
    source: "plot",
    facility: "fishing_spot",
    item: "saury",
    tierRange: { min: 0, max: 4 },
    waters: ["coast", "shelf", "deep"],
    itemWeights: [{ item: "shellfish", weight: 1000 }],
  },
  {
    source: "school",
    facility: "fishing_spot",
    item: "carp",
    tierRange: { min: 0, max: 2 },
    biomes: [{ biome: "lake", amount: 5 }],
  },
  {
    source: "school",
    facility: "fishing_spot",
    item: "mackerel",
    tierRange: { min: 2, max: 6 },
    biomes: [
      { biome: "ocean_shelf", amount: 8 },
      { biome: "ocean_coastal", amount: 2 },
    ],
  },
  {
    source: "school",
    facility: "fishing_spot",
    item: "yellowtail",
    tierRange: { min: 4, max: 8 },
    biomes: [{ biome: "ocean_deep", amount: 6 }],
  },
  {
    source: "school",
    facility: "fishing_spot",
    item: "whale_meat",
    table: true,
    biomes: [{ biome: "ocean_deep", amount: 2 }],
  },
  { source: "prop", facility: null, item: "salt", tierRange: { min: 1, max: 1 } },
];
const tiers = npcGatherTiersOf(OBJECTS, (id) => TIER[id]);

describe("시설 규칙(묶음 — 지형별 특수 자리·굴림표 빼고)", () => {
  it("광산: 평지 위 끝 = 노두 T3, 산지 위 끝 = 광맥 T9, 비중 = 대표 아이템", () => {
    const mine = tiers.get("mine");
    expect(mine?.flat?.maxTier).toBe(3);
    expect(mine?.mountain?.maxTier).toBe(9);
    expect([...(mine?.mountain?.weights ?? [])]).toEqual([
      ["stone", 1],
      ["copper_ore", 2],
    ]);
    expect(tiers.has("undefined")).toBe(false);
  });

  it("굴림 규칙: 산지 몫만큼만 평지 위 끝 위를 남긴다(모르면 산지), 산지 1000이면 막지 않는다", () => {
    expect(npcTierRollOf(tiers.get("mine"), { highOrePm: 250 })).toMatchObject({
      tierCap: { maxTier: 3, keepAbovePm: 250 },
      tierRange: { min: 0, max: 9 },
    });
    expect(npcTierRollOf(tiers.get("mine"), {}).tierCap).toBeUndefined();
    expect(npcTierRollOf(tiers.get("mine"), { highOrePm: 1000 }).tierCap).toBeUndefined();
    // 벌목장: 산지 구분 없이 위 끝 T5(거대목 = 지형별 자리는 빼기)
    expect(npcTierRollOf(tiers.get("lumber_camp"), {})).toMatchObject({ tierRange: { min: 0, max: 5 } });
    expect(npcTierRollOf(undefined, {})).toEqual({});
  });

  it("낚시터: 물 종류마다 위 끝(어군 집 물 = 가장 많은 바이옴), 모르면 모든 물, 바다 물터 비중(조개)", () => {
    const fish = tiers.get("fishing_spot");
    expect(npcTierRollOf(fish, { water: "fresh" }).tierRange).toEqual({ min: 0, max: 2 });
    expect(npcTierRollOf(fish, { water: "coast" }).tierRange).toEqual({ min: 0, max: 4 });
    expect(npcTierRollOf(fish, { water: "shelf" }).tierRange).toEqual({ min: 0, max: 6 });
    expect(npcTierRollOf(fish, { water: "deep" }).tierRange).toEqual({ min: 0, max: 8 });
    expect(npcTierRollOf(fish, {}).tierRange).toEqual({ min: 0, max: 8 });
    expect(npcTierRollOf(fish, { water: "coast" }).weights?.get("shellfish")).toBe(1);
    expect(npcTierRollOf(fish, { water: "coast" }).weights?.has("loach")).toBe(false);
    expect(npcFishRanges(tiers)).toEqual({
      fresh: { min: 0, max: 2 },
      coast: { min: 0, max: 4 },
      shelf: { min: 0, max: 6 },
      deep: { min: 0, max: 8 },
    });
    expect(npcFishRanges(npcGatherTiersOf([], () => 0))).toBeUndefined();
  });
});
