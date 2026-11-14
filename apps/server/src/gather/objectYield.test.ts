// 원자재 오브젝트 아이템 고르기 시험 — 기획 D-540 1222(다 어군 = 낚시 사다리 굴림, 나 난파선 = 굴림표), D-541 1307 나(어군 티어 범위)
import { TEST_GATHER_BANDS } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { type ObjectYieldCatalog, foldTierRange, objectYieldItem, pickTableItem } from "./objectYield.ts";

const FISH_LADDER = [
  ["item:loach", "item:minnow"],
  ["item:carp"],
  ["item:salmon"],
  ["item:saury"],
  [],
  [],
  [],
  [],
  [],
  [],
];
const catalog: ObjectYieldCatalog = {
  facility: (id) =>
    id === "fishing_spot"
      ? { gather: { subcategory: "fish" } }
      : id === "farm"
        ? { gather: { subcategory: "crop", mode: "select" } }
        : undefined,
  gatherLadder: () => FISH_LADDER,
  gatherBands: TEST_GATHER_BANDS,
};
const input = (seq: number, primary = 10, secondary = 10) => ({
  unitId: 7,
  objectId: 65_540,
  seq,
  primary,
  secondary,
  level: 1,
  levelBonus: 5,
});
const count = (kind: Parameters<typeof objectYieldItem>[0], n: number, primary = 10, secondary = 10) => {
  const out = new Map<string, number>();
  for (let seq = 0; seq < n; seq++) {
    const item = objectYieldItem(kind, catalog, input(seq, primary, secondary));
    out.set(item, (out.get(item) ?? 0) + 1);
  }
  return out;
};

describe("굴림표(난파선)", () => {
  it("가중치 칸에 맞는 줄: 0~449 → 첫째, 450~749 → 둘째 …, 합 밖은 나머지로 접는다", () => {
    const table = [
      { item: "copper_ingot", weightPm: 450 },
      { item: "iron_ingot", weightPm: 300 },
      { item: "gold_ingot", weightPm: 250 },
    ];
    expect([0, 449, 450, 749, 750, 999, 1000].map((roll) => pickTableItem(table, roll))).toEqual([
      "copper_ingot",
      "copper_ingot",
      "iron_ingot",
      "iron_ingot",
      "gold_ingot",
      "gold_ingot",
      "copper_ingot",
    ]);
    expect(pickTableItem([], 3)).toBeUndefined();
  });

  it("2만 번 캐면 가중치 몫에 가깝고(±1.5%p), 같은 입력이면 같은 아이템", () => {
    const kind = {
      item: "copper_ingot",
      facility: null,
      table: [
        { item: "copper_ingot", weightPm: 700 },
        { item: "gold_ingot", weightPm: 300 },
      ],
    };
    const got = count(kind, 20_000);
    expect(Math.abs((got.get("copper_ingot") ?? 0) - 14_000)).toBeLessThan(300);
    expect(Math.abs((got.get("gold_ingot") ?? 0) - 6000)).toBeLessThan(300);
    expect(objectYieldItem(kind, catalog, input(42))).toBe(objectYieldItem(kind, catalog, input(42)));
  });
});

describe("사다리 굴림(어군 = 낚시 사다리)", () => {
  it("새 유닛(AGI 10 + DEX 10 = 20): 어류는 기본 띠 표 T0 70%·T1 15%·T2 10%·T3 5%(±1.5%p)", () => {
    const got = count({ item: "carp", facility: "fishing_spot", ladder: true }, 20_000);
    const t0 = (got.get("loach") ?? 0) + (got.get("minnow") ?? 0);
    expect(Math.abs(t0 - 14_000)).toBeLessThan(300);
    expect(Math.abs((got.get("carp") ?? 0) - 3000)).toBeLessThan(300);
    expect(Math.abs((got.get("salmon") ?? 0) - 2000)).toBeLessThan(300);
    expect(Math.abs((got.get("saury") ?? 0) - 1000)).toBeLessThan(300);
    // T0 둘은 반씩
    expect(Math.abs((got.get("loach") ?? 0) - (got.get("minnow") ?? 0))).toBeLessThan(500);
  });

  it("스탯이 높으면 높은 티어가 는다(140~159 띠: T3 160‰ + 사다리에 없는 T4~T8 160‰이 T3으로 내려가 약 32%)", () => {
    const low = count({ item: "carp", facility: "fishing_spot", ladder: true }, 5000);
    const high = count({ item: "carp", facility: "fishing_spot", ladder: true }, 5000, 75, 75);
    expect(Math.abs((high.get("saury") ?? 0) - 1600)).toBeLessThan(150);
    expect(high.get("saury") ?? 0).toBeGreaterThan((low.get("saury") ?? 0) * 4);
  });

  it("사다리 굴림이 없거나, 시설을 모르거나, 선택 방식 시설이면 대표 아이템", () => {
    expect(objectYieldItem({ item: "carp", facility: "fishing_spot" }, catalog, input(1))).toBe("carp");
    expect(objectYieldItem({ item: "carp", facility: null, ladder: true }, catalog, input(1))).toBe("carp");
    expect(objectYieldItem({ item: "carp", facility: "nowhere", ladder: true }, catalog, input(1))).toBe(
      "carp",
    );
    expect(objectYieldItem({ item: "barley", facility: "farm", ladder: true }, catalog, input(1))).toBe(
      "barley",
    );
  });
});

describe("어군 티어 범위(질문 1307 나)", () => {
  it("범위 밖 티어는 범위 안으로 접는다(위는 max, 아래는 min), 범위가 없으면 그대로", () => {
    const shelf = { min: 2, max: 6 };
    expect([0, 1, 2, 4, 6, 7, 9].map((tier) => foldTierRange(tier, shelf))).toEqual([2, 2, 2, 4, 6, 6, 6]);
    expect(foldTierRange(9, undefined)).toBe(9);
    expect(foldTierRange(5, { min: 6, max: 2 })).toBe(2);
  });

  it("민물 T0~T2: 높은 스탯에도 T3(꽁치)이 나오지 않고 연어(T2)로 접힌다", () => {
    const lake = { item: "carp", facility: "fishing_spot", ladder: true, tierRange: { min: 0, max: 2 } };
    const got = count(lake, 5000, 75, 75);
    expect(got.get("saury")).toBeUndefined();
    const open = count({ item: "carp", facility: "fishing_spot", ladder: true }, 5000, 75, 75);
    expect(got.get("salmon") ?? 0).toBe((open.get("salmon") ?? 0) + (open.get("saury") ?? 0));
  });

  it("대륙붕 T2~T6: 새 유닛(스탯 20)의 T0·T1은 T2로 올라 연어 이상만 나온다", () => {
    const shelf = { item: "mackerel", facility: "fishing_spot", ladder: true, tierRange: { min: 2, max: 6 } };
    const got = count(shelf, 5000);
    expect([...got.keys()].toSorted()).toEqual(["salmon", "saury"]);
    expect(Math.abs((got.get("salmon") ?? 0) - 4750)).toBeLessThan(150);
  });
});
