// 레벨 0 재료 T0~T1 인정(기획 D-562 1563·1564) — 받는 아이템·나누기
import { describe, expect, it } from "vitest";
import { allocateMaterials, bareHandAcceptsOf } from "./bareHandMaterials.ts";

const ITEMS = [
  { id: "stone", category: "raw", subcategory: "ore", tier: 1 },
  { id: "rubble", category: "raw", subcategory: "ore", tier: 0 },
  { id: "copper_ore", category: "raw", subcategory: "ore", tier: 2 },
  { id: "salt", category: "raw", subcategory: "ore", tier: 1 },
  { id: "pine_log", category: "raw", subcategory: "wood", tier: 0 },
  { id: "birch_log", category: "raw", subcategory: "wood", tier: 1 },
  { id: "old_log", category: "raw", subcategory: "wood", tier: 1, enabled: false },
  { id: "plank", category: "material", subcategory: "lumber", tier: 0 },
];
const accepts = bareHandAcceptsOf(ITEMS);
const stockOf = (stock: Record<string, number>) => (item: string) => BigInt(stock[item] ?? 0);

describe("받는 아이템", () => {
  it("원자재 T0~T1 줄은 같은 중분류 켜진 T0~T1(첫째 = 그 아이템, 다음 티어·차례), 그 밖은 그 아이템", () => {
    expect(accepts("stone")).toEqual(["stone", "rubble", "salt"]);
    expect(accepts("pine_log")).toEqual(["pine_log", "birch_log"]);
    expect(accepts("copper_ore")).toEqual(["copper_ore"]);
    expect(accepts("plank")).toEqual(["plank"]);
    expect(accepts("unknown")).toEqual(["unknown"]);
  });
});

describe("나누기", () => {
  it("그 줄 아이템 먼저, 모자라면 같은 묶음 다른 아이템(티어 차례)", () => {
    const plan = allocateMaterials(
      [
        { item: "pine_log", qty: 10 },
        { item: "stone", qty: 5 },
      ],
      accepts,
      stockOf({ pine_log: 4, birch_log: 20, stone: 2, rubble: 1, salt: 9 }),
    );
    expect(plan).toEqual(
      new Map([
        ["pine_log", 4n],
        ["birch_log", 6n],
        ["stone", 2n],
        ["rubble", 1n],
        ["salt", 2n],
      ]),
    );
  });

  it("같은 묶음 두 줄(석재·잡석)은 합으로 보고, 모자라면 undefined", () => {
    const lines = [
      { item: "stone", qty: 10 },
      { item: "rubble", qty: 5 },
    ];
    expect(allocateMaterials(lines, accepts, stockOf({ stone: 3, rubble: 12 }))).toEqual(
      new Map([
        ["stone", 3n],
        ["rubble", 12n],
      ]),
    );
    expect(allocateMaterials(lines, accepts, stockOf({ stone: 3, rubble: 11 }))).toBeUndefined();
  });

  it("받는 묶음이 없는 줄(가공 재료)은 그 아이템만, 0 줄은 빠진다", () => {
    expect(
      allocateMaterials(
        [
          { item: "plank", qty: 2 },
          { item: "copper_ore", qty: 0 },
        ],
        accepts,
        stockOf({ plank: 2 }),
      ),
    ).toEqual(new Map([["plank", 2n]]));
    expect(allocateMaterials([{ item: "plank", qty: 3 }], accepts, stockOf({ plank: 2 }))).toBeUndefined();
  });
});
