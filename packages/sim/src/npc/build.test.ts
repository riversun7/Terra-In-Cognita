// NPC 도시 증축 판단 시험 — 질문 1101 나(D-534), npc/build.ts
import { describe, expect, it } from "vitest";
import {
  type BuildOption,
  type SiteFacility,
  buildingCapOf,
  chooseCityBuild,
  chooseCityRepair,
  rankCityUpgrades,
} from "./build.ts";
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
  { facility: "kitchen", stage: "finish", gather: false },
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

  it("도시 등급 표가 상한이다(전체 끝 npc_build_max_buildings 안, 0이면 끔 — 1143 나)", () => {
    const c = { ...TEST_NPC_COEFFICIENTS, buildMaxBuildings: 32, buildCapByGrade: [8, 10, 12, 16, 20, 24] };
    expect([1, 2, 3, 4, 5, 6].map((grade) => buildingCapOf(grade, c))).toEqual([8, 10, 12, 16, 20, 24]);
    expect(buildingCapOf(9, c)).toBe(24);
    expect(buildingCapOf(6, { ...c, buildMaxBuildings: 18 })).toBe(18);
    expect(buildingCapOf(3, { ...c, buildMaxBuildings: 0 })).toBe(0);
    const needs = { humans: 40, workers: 40, foodPm: 1000, counts: counts({ lodging: 3, farm: 4 }) };
    expect(chooseCityBuild(needs, OPTIONS, TRAITS, c, { ...RULES, cap: 7 })).toBeUndefined();
    expect(chooseCityBuild(needs, OPTIONS, TRAITS, c, { ...RULES, cap: 8 })).toBe("lodging");
  });

  it("나라 성격 목표(특산 줄·등급 처음 시설)가 모자라면 그 시설을 짓는다. 땅이 없다고 아는 채집 시설은 빼고, 막힌 시설은 건너뛴다(1142 다)", () => {
    const base = { humans: 20, workers: 20, foodPm: 1000, beds: 40 };
    const targets = new Map([
      ["kitchen", 2],
      ["mine", 1],
    ]);
    // 모자란 수가 많은 목표가 먼저(주방 2 > 광산 1)
    expect(choose({ ...base, counts: counts({ lodging: 4, farm: 2 }), targets })).toBe("kitchen");
    // 광산 땅 몫 0 → 목표가 있어도 짓지 않는다(특산은 도시 직무로 남는다)
    const gatherPm = new Map([["mine", 0]]);
    expect(choose({ ...base, counts: counts({ lodging: 4, farm: 2, kitchen: 2 }), targets, gatherPm })).toBe(
      undefined,
    );
    // 재료를 구할 길이 없는 주방은 고르지 않는다 → 다음 목표(광산, 땅을 모름)
    expect(
      chooseCityBuild(
        { ...base, counts: counts({ lodging: 4, farm: 2 }), targets },
        OPTIONS,
        TRAITS,
        TEST_NPC_COEFFICIENTS,
        { ...RULES, blocked: new Set(["kitchen"]) },
      ),
    ).toBe("mine");
  });

  it("휴먼이 인구 상한에 닿고 생필품이 넉넉하면 숙소를 짓는다(씨앗 침대는 상한에 들지 않는다 — 1131 나)", () => {
    const needs = { humans: 40, workers: 40, beds: 40, counts: counts({ lodging: 4, farm: 4 }) };
    expect(choose({ ...needs, foodPm: 1000, housingCap: 40 })).toBe("lodging");
    expect(choose({ ...needs, foodPm: 1000, housingCap: 50 })).not.toBe("lodging");
    expect(choose({ ...needs, foodPm: 800, housingCap: 40 })).not.toBe("lodging");
  });

  it("레벨 올리기 후보: 붐비면 낮은 숙소 먼저, 아니면 일꾼 많은 생산 시설(같으면 낮은 레벨·열쇠 차례), 상한·행정 건물 빼고(1146 나)", () => {
    const spec = (facility: string) =>
      ({
        farm: { stage: "gather", maxLevel: 5 },
        mine: { stage: "gather", maxLevel: 5 },
        lodging: { stage: "living", maxLevel: 3 },
        government_hall: { stage: "government", maxLevel: 3 },
      })[facility];
    const list: SiteFacility[] = [
      { key: 1, facility: "farm", level: 1, workers: 2 },
      { key: 2, facility: "mine", level: 2, workers: 4 },
      { key: 3, facility: "mine", level: 1, workers: 4 },
      { key: 4, facility: "lodging", level: 2, workers: 0 },
      { key: 5, facility: "lodging", level: 1, workers: 0 },
      { key: 6, facility: "government_hall", level: 1, workers: 0 },
      { key: 7, facility: "farm", level: 5, workers: 9 },
    ];
    expect(rankCityUpgrades(list, { humans: 10, housingCap: 40 }, spec).map((f) => f.key)).toEqual([3, 2, 1]);
    expect(rankCityUpgrades(list, { humans: 40, housingCap: 40 }, spec).map((f) => f.key)).toEqual([
      5, 4, 3, 2, 1,
    ]);
  });

  it("수리: 문턱 아래 가운데 가장 낮은 상태부터(문턱 0 = 끔, 상태를 모르면 고치지 않는다 — 1114 가)", () => {
    const list: SiteFacility[] = [
      { key: 1, facility: "city_wall", level: 1, workers: 0, conditionPpm: 300_000 },
      { key: 2, facility: "farm", level: 1, workers: 1, conditionPpm: 100_000 },
      { key: 3, facility: "mine", level: 1, workers: 1, conditionPpm: 900_000 },
      { key: 4, facility: "mine", level: 1, workers: 1 },
    ];
    expect(chooseCityRepair(list, 700)?.key).toBe(2);
    expect(chooseCityRepair(list.slice(2), 700)).toBeUndefined();
    expect(chooseCityRepair(list, 0)).toBeUndefined();
  });
});
