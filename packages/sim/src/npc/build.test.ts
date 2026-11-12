// NPC 도시 증축 판단 시험 — 질문 1101 나(D-534), npc/build.ts
import { describe, expect, it } from "vitest";
import { type BuildOption, chooseCityBuild } from "./build.ts";
import { TEST_NPC_COEFFICIENTS } from "./coefficients.ts";

const TRAITS = { aggression: 500, commerce: 500, faith: 500, station: 500 };
const RULES = { bedsPerLevel: 10 };
const OPTIONS: BuildOption[] = [
  { facility: "farm", stage: "gather", gather: true },
  { facility: "lumber_camp", stage: "gather", gather: true },
  { facility: "mine", stage: "gather", gather: true },
  { facility: "storehouse", stage: "storage", gather: false },
  { facility: "government_hall", stage: "government", gather: false },
  { facility: "city_wall", stage: "defense", gather: false },
  { facility: "lodging", stage: "living", gather: false },
];
const counts = (entries: Record<string, number>) => new Map(Object.entries(entries));
const choose = (needs: Parameters<typeof chooseCityBuild>[0], c = TEST_NPC_COEFFICIENTS) =>
  chooseCityBuild(needs, OPTIONS, TRAITS, c, RULES);

describe("NPC 증축 판단(질문 1101 나)", () => {
  it("숙소 침대가 휴먼보다 적으면 숙소가 먼저다", () => {
    expect(choose({ humans: 25, workers: 25, foodPm: 1000, counts: counts({ lodging: 2, farm: 1 }) })).toBe(
      "lodging",
    );
    // 굶는 도시는 농장이 숙소보다 앞선다(600 + 굶은 몫 ÷ 4 > 700 + 모자란 숙소 × 20)
    expect(choose({ humans: 25, workers: 25, foodPm: 400, counts: counts({ lodging: 2, farm: 1 }) })).toBe(
      "farm",
    );
  });

  it("침대가 넉넉하면 생필품이 모자란 도시는 농장을 짓는다", () => {
    expect(choose({ humans: 12, workers: 12, foodPm: 600, counts: counts({ lodging: 2, farm: 1 }) })).toBe(
      "farm",
    );
  });

  it("배후지 몫이 큰 원자재의 채집 시설을 목표 수까지 짓는다(몫 0이면 짓지 않는다)", () => {
    const gatherPm = new Map([
      ["farm", 0],
      ["lumber_camp", 900],
      ["mine", 0],
    ]);
    const base = { humans: 12, workers: 12, foodPm: 1000, gatherPm };
    expect(choose({ ...base, counts: counts({ lodging: 2, farm: 1 }) })).toBe("lumber_camp");
    // 몫 900 → 목표 1 + ⌊900 × 2 ÷ 1000⌋ = 2
    expect(choose({ ...base, counts: counts({ lodging: 2, farm: 1, lumber_camp: 1 }) })).toBe("lumber_camp");
    expect(choose({ ...base, counts: counts({ lodging: 2, farm: 1, lumber_camp: 2 }) })).toBeUndefined();
  });

  it("땅을 모르면 이미 가진 채집 시설만 몫 500으로 늘린다", () => {
    const needs = { humans: 12, workers: 12, foodPm: 1000, counts: counts({ lodging: 2, farm: 2, mine: 1 }) };
    expect(choose(needs)).toBe("mine");
    expect(choose({ ...needs, counts: counts({ lodging: 2, farm: 2, mine: 2 }) })).toBeUndefined();
  });

  it("일할 휴먼이 생산 시설 수보다 많지 않으면 생산 시설을 짓지 않는다(숙소는 짓는다)", () => {
    const needs = { humans: 3, workers: 3, foodPm: 300, counts: counts({ lodging: 1, farm: 1, mine: 2 }) };
    expect(choose(needs)).toBeUndefined();
    expect(choose({ ...needs, humans: 11, workers: 3 })).toBe("lodging");
  });

  it("건물 수(행정 건물·성벽 빼고)가 상한이면, 또는 상한 0(끔)이면 짓지 않는다", () => {
    const c = { ...TEST_NPC_COEFFICIENTS, buildMaxBuildings: 4 };
    const needs = { humans: 40, workers: 40, foodPm: 1000 };
    expect(
      choose({ ...needs, counts: counts({ lodging: 2, farm: 2, government_hall: 1, city_wall: 9 }) }, c),
    ).toBeUndefined();
    expect(choose({ ...needs, counts: counts({ lodging: 2, farm: 1, city_wall: 9 }) }, c)).toBe("lodging");
    expect(
      choose({ ...needs, counts: counts({}) }, { ...TEST_NPC_COEFFICIENTS, buildMaxBuildings: 0 }),
    ).toBeUndefined();
  });
});
