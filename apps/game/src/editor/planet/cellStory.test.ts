// 칸 쉬운 설명 재료 시험 — 정한 조건, 앞 규칙 중 아깝게 놓친 바이옴(조건 하나·여러 개), 바꿀 방향과 양, 바다·호수
import {
  WATER_DEPTH_SHIFT,
  WATER_LAKE,
  WATER_OCEAN,
  explainBiome,
  planetInputFromDefinition,
} from "@terra/planet/generator";
import { describe, expect, it } from "vitest";
import { cellStory } from "./cellStory.ts";
import { PACK_BIOMES, TEST_PLANET } from "./testDefinitions.ts";

const { biomes } = planetInputFromDefinition(TEST_PLANET, PACK_BIOMES, 5);
const index = (id: string) => biomes.findIndex((biome) => biome.id === id);
const story = (temperatureC: number, humidity: number, elevationM = 0, water = 0) =>
  cellStory(explainBiome({ water, temperatureC, humidity, elevationM }, biomes));

describe("칸 쉬운 설명", () => {
  it("육지: 고른 바이옴과 정한 조건", () => {
    const result = story(10, 140);
    expect(result).toMatchObject({ kind: "land", biome: index("temperate_forest") });
    if (result.kind !== "land") throw new Error("land");
    expect(result.deciding?.map((condition) => condition.axis)).toEqual(["temperatureC", "humidity"]);
  });

  it("아깝게 놓친 앞 규칙: max에서 떨어지면 거리 + 한 단위만큼 낮게", () => {
    // 기온 19°C: 온대림(max 19)에서 거리 0 → 1°C 더 낮았다면 온대림. 결과는 사바나
    const result = story(19, 140);
    expect(result).toMatchObject({
      kind: "land",
      biome: index("savanna"),
      nearMiss: { kind: "one", biome: index("temperate_forest"), direction: "lower", amount: 1 },
    });
  });

  it("min에서 떨어지면 거리만큼 높게, 눈금 대비 가장 가까운 규칙", () => {
    // 기온 10°C, 습도 130: 온대림(습도 ≥ 135)까지 5 → 5 더 높았다면 온대림. 결과는 초지
    const result = story(10, 130);
    expect(result).toMatchObject({
      biome: index("grassland"),
      nearMiss: { kind: "one", biome: index("temperate_forest"), direction: "higher", amount: 5 },
    });
  });

  it("뒤 규칙은 보지 않는다, 아깝게 놓친 것이 없으면 null", () => {
    // 습도 180: 앞의 습지(습도 ≥ 205)는 25 떨어져 아깝지 않다. 뒤의 초지·사바나는 맞아도 보지 않는다
    const result = story(10, 180);
    expect(result).toMatchObject({ biome: index("temperate_forest"), nearMiss: null });
  });

  it("조건 없는 마지막 규칙으로 떨어지면 정한 조건이 없다", () => {
    const result = story(30, 220, 500);
    expect(result).toMatchObject({ biome: index("tropical_rainforest"), deciding: null });
  });

  it("바다·호수", () => {
    expect(story(5, 255, -10, WATER_OCEAN | (3 << WATER_DEPTH_SHIFT))).toMatchObject({
      kind: "ocean",
      depthClass: "deep",
      biome: index("ocean_deep"),
    });
    expect(story(5, 255, 3, WATER_LAKE)).toMatchObject({ kind: "lake", biome: index("lake") });
  });
});
