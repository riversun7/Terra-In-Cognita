// 채집 칸 검사 시험 — 성공 확률(낚시터, 팩 facilities.gather.catch, docs/adr/2026-11-11-production-six.md): 스키마 범위와 상한 ≥ 기본.
import { describe, expect, it } from "vitest";
import { fixture } from "../testFixtures.ts";
import { validatePack } from "./pack.ts";

const name = { ko: "이름", en: "Name" };
const band = { id: "band_0", from: 0, weightsPm: [1000, 0, 0, 0, 0, 0, 0, 0, 0, 0] };

function check(catchRule: unknown) {
  return validatePack(
    fixture({
      "item_subcategories.json": { entries: [{ id: "fish", name, major: "raw", enabled: true }] },
      "gather_tiers.json": { entries: [band] },
      "facilities.json": {
        entries: [
          {
            id: "fishing_spot",
            name,
            stage: "gather",
            slotsPerLevel: 10,
            gather: {
              primary: "agi",
              secondary: "dex",
              subcategory: "fish",
              ...(catchRule === undefined ? {} : { catch: catchRule }),
            },
          },
        ],
      },
    }),
  ).issues;
}

const schema = (rule: unknown) => check(rule).filter((issue) => issue.stage === "schema").length;

describe("채집 성공 확률 칸(gather.catch)", () => {
  it("옛 낚시 값(300·800·500·200)과 칸이 없는 시설은 통과한다", () => {
    expect(check({ basePm: 300, maxPm: 800, statPm: 500, fullStat: 200 })).toEqual([]);
    expect(check(undefined)).toEqual([]);
  });

  it("상한이 기본보다 작으면 오류(gather_catch_range)", () => {
    const issues = check({ basePm: 600, maxPm: 500, statPm: 500, fullStat: 200 });
    expect(issues.map((issue) => [issue.level, issue.code, issue.path])).toEqual([
      ["error", "gather_catch_range", "gather.catch.maxPm"],
    ]);
  });

  it("‰는 0~1000, 가득 차는 스탯 합은 1 이상(스키마)", () => {
    expect(schema({ basePm: 1001, maxPm: 800, statPm: 500, fullStat: 200 })).toBe(1);
    expect(schema({ basePm: 300, maxPm: 800, statPm: -1, fullStat: 200 })).toBe(1);
    expect(schema({ basePm: 300, maxPm: 800, statPm: 500, fullStat: 0 })).toBe(1);
    expect(schema({ basePm: 300, maxPm: 800, statPm: 500 })).toBe(1);
  });
});

// 함께 내는 중분류(질문 946 나, docs/adr/2026-11-11-production-six.md "바뀜 (2026-11-11, 946·947)")·물가 조건(질문 947 나)
function checkRanch(extra: unknown, facilityExtra: Record<string, unknown> = {}) {
  return validatePack(
    fixture({
      "item_subcategories.json": {
        entries: [
          { id: "livestock_product", name, major: "raw", enabled: true },
          { id: "livestock_byproduct", name, major: "raw", enabled: true },
          { id: "dish", name, major: "consumable", enabled: true },
        ],
      },
      "gather_tiers.json": { entries: [band] },
      "facilities.json": {
        entries: [
          {
            id: "ranch",
            name,
            stage: "gather",
            slotsPerLevel: 10,
            gather: {
              primary: "wis",
              secondary: "agi",
              subcategory: "livestock_product",
              ...(extra === undefined ? {} : { extraSubcategories: extra }),
              mode: "select",
            },
            ...facilityExtra,
          },
        ],
      },
    }),
  ).issues;
}

const codes = (issues: ReturnType<typeof checkRanch>) =>
  issues.map((issue) => [issue.stage, issue.code ?? null, issue.path ?? null]);

describe("함께 내는 중분류(gather.extraSubcategories)", () => {
  it("목장 = 축산물 + 목축 부산물은 통과하고, 칸이 없어도 통과한다(앞 판 그대로)", () => {
    expect(checkRanch(["livestock_byproduct"])).toEqual([]);
    expect(checkRanch(undefined)).toEqual([]);
  });

  it("주 중분류와 겹치거나 같은 것을 두 번 적으면 오류(gather_subcategory_duplicate)", () => {
    expect(codes(checkRanch(["livestock_product"]))).toEqual([
      ["references", "gather_subcategory_duplicate", "gather.extraSubcategories.0"],
    ]);
    expect(codes(checkRanch(["livestock_byproduct", "livestock_byproduct"]))).toEqual([
      ["references", "gather_subcategory_duplicate", "gather.extraSubcategories.1"],
    ]);
  });

  it("원자재가 아닌 중분류는 오류(gather_subcategory_major), 없는 중분류는 참조 오류, 빈 목록·다섯 개 이상은 스키마 오류", () => {
    expect(codes(checkRanch(["dish"]))).toEqual([
      ["references", "gather_subcategory_major", "gather.extraSubcategories.0"],
    ]);
    expect(checkRanch(["no_such_sub"]).map((issue) => issue.stage)).toEqual(["references"]);
    expect(checkRanch([]).filter((issue) => issue.stage === "schema")).toHaveLength(1);
    expect(
      checkRanch(["a1", "a2", "a3", "a4", "a5"]).filter((issue) => issue.stage === "schema"),
    ).toHaveLength(1);
  });
});

describe("물가 조건(needsWaterWithin)", () => {
  it("1~64 배치 칸만 받는다", () => {
    expect(checkRanch(undefined, { needsWaterWithin: 5 })).toEqual([]);
    expect(checkRanch(undefined, { needsWaterWithin: 0 }).filter((i) => i.stage === "schema")).toHaveLength(
      1,
    );
    expect(checkRanch(undefined, { needsWaterWithin: 65 }).filter((i) => i.stage === "schema")).toHaveLength(
      1,
    );
  });
});

// 표 하나(기획 D-552 "표 하나"): 첫 구간 0·늘어나기만, 사다리 칸(ladder)은 스키마가 받지 않는다
function checkBands(bands: unknown[]) {
  return validatePack(fixture({ "gather_tiers.json": { entries: bands } })).issues.map((issue) => [
    issue.code,
    issue.id,
    issue.path,
  ]);
}
const weights = [1000, 0, 0, 0, 0, 0, 0, 0, 0, 0];

describe("채집 확률표 하나(gather_tiers)", () => {
  it("0부터 늘어나면 통과, 줄어들면 오류(gather_band_order)", () => {
    expect(
      checkBands([
        { id: "band_000", from: 0, weightsPm: weights },
        { id: "band_020", from: 20, weightsPm: weights },
      ]),
    ).toEqual([]);
    expect(
      checkBands([
        { id: "band_020", from: 20, weightsPm: weights },
        { id: "band_010", from: 10, weightsPm: weights },
      ]),
    ).toEqual([
      ["gather_band_order", "band_020", "from"],
      ["gather_band_order", "band_010", "from"],
    ]);
  });

  it("사다리 칸(ladder)은 없앤 칸이라 스키마 오류", () => {
    const issues = checkBands([{ id: "ore_band_000", ladder: "ore", from: 0, weightsPm: weights }]);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every(([, id]) => id === "ore_band_000")).toBe(true);
  });
});

// 원자재 오브젝트 굴림표·사다리 굴림(기획 D-540 1222)
function checkObject(extra: Record<string, unknown>, mode?: "select") {
  const item = (id: string) => ({
    id,
    name,
    category: "raw",
    subcategory: "fish",
    tier: 0,
    startPrice: 1,
    weight: 1,
    enabled: true,
  });
  return validatePack(
    fixture({
      "item_subcategories.json": { entries: [{ id: "fish", name, major: "raw", enabled: true }] },
      "items.json": { entries: [item("carp"), item("gold")] },
      "gather_tiers.json": { entries: [band] },
      "facilities.json": {
        entries: [
          {
            id: "fishing_spot",
            name,
            stage: "gather",
            slotsPerLevel: 10,
            gather: { primary: "agi", secondary: "dex", subcategory: "fish", ...(mode ? { mode } : {}) },
          },
        ],
      },
      "gather_objects.json": {
        entries: [
          {
            id: "thing",
            name,
            source: "prop",
            arts: ["bush"],
            item: "carp",
            lots: 1,
            workMs: 10_000,
            uses: 1,
            regrowMs: 60_000,
            primary: "agi",
            secondary: "dex",
            ...extra,
          },
        ],
      },
    }),
  ).issues.map((issue) => [issue.code, issue.path]);
}
const table = (a: number, b: number) => [
  { item: "carp", weightPm: a },
  { item: "gold", weightPm: b },
];

describe("원자재 오브젝트 굴림표·티어 범위(기획 D-552)", () => {
  it("합 1000 굴림표, 범위 없는 오브젝트·범위 있는 오브젝트는 통과한다", () => {
    expect(checkObject({ table: table(700, 300) })).toEqual([]);
    expect(checkObject({ facility: "fishing_spot" })).toEqual([]);
    expect(checkObject({ tierRange: { min: 0, max: 2 } })).toEqual([]);
    // 선택 방식 시설이 맡아도 범위를 쓴다(해금 티어를 자른다)
    expect(checkObject({ facility: "fishing_spot", tierRange: { min: 1, max: 4 } }, "select")).toEqual([]);
  });

  it("굴림표: 합이 1000이 아니거나 대표 아이템이 표 밖이거나 티어 범위와 함께면 오류", () => {
    expect(checkObject({ table: table(700, 200) })).toEqual([["gather_table_sum", "table"]]);
    expect(
      checkObject({
        item: "gold",
        table: [
          { item: "carp", weightPm: 500 },
          { item: "carp", weightPm: 500 },
        ],
      }),
    ).toEqual([
      ["gather_table_duplicate", "table"],
      ["gather_table_item", "item"],
    ]);
    expect(checkObject({ table: table(700, 300), tierRange: { min: 0, max: 2 } })).toEqual([
      ["gather_tier_range_table", "tierRange"],
    ]);
  });

  it("사다리 굴림 칸(ladder)은 없앤 칸이라 스키마 오류", () => {
    expect(checkObject({ ladder: true }).length).toBeGreaterThan(0);
  });

  it("티어 범위: 아래 ≤ 위면 통과, 아니면 오류", () => {
    expect(checkObject({ tierRange: { min: 4, max: 4 } })).toEqual([]);
    expect(checkObject({ tierRange: { min: 6, max: 2 } })).toEqual([["gather_tier_range_order", "tierRange"]]);
  });
});
