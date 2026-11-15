// 레벨 0 재료 T0~T1 인정(기획 D-562 1563·1564, D-566 1723 목재·석재만) — 받는 아이템·나누기
import { describe, expect, it } from "vitest";
import { allocateMaterials, bareHandAcceptsOf, bareHandFlag } from "./bareHandMaterials.ts";

// 건축 재료 칸(기획 D-569 1764): 목재는 중분류 칸(그 중분류 전부), 석재·잡석은 아이템 칸 — 부르는 쪽이 bareHandFlag로 합친다
const WOOD = { bareHand: true };
const ITEMS = [
  { id: "stone", category: "raw", subcategory: "ore", tier: 1, bareHand: true },
  { id: "rubble", category: "raw", subcategory: "ore", tier: 0, bareHand: true },
  { id: "copper_ore", category: "raw", subcategory: "ore", tier: 2, bareHand: true },
  { id: "salt", category: "raw", subcategory: "ore", tier: 1 },
  { id: "pine_log", category: "raw", subcategory: "wood", tier: 0, bareHand: bareHandFlag({}, WOOD) },
  { id: "birch_log", category: "raw", subcategory: "wood", tier: 1, bareHand: bareHandFlag({}, WOOD) },
  {
    id: "old_log",
    category: "raw",
    subcategory: "wood",
    tier: 1,
    enabled: false,
    bareHand: bareHandFlag({}, WOOD),
  },
  { id: "plank", category: "material", subcategory: "lumber", tier: 0, bareHand: true },
];
const accepts = bareHandAcceptsOf(ITEMS);
const stockOf = (stock: Record<string, number>) => (item: string) => BigInt(stock[item] ?? 0);

describe("받는 아이템", () => {
  it("목재·석재 T0~T1 줄은 같은 묶음 켜진 T0~T1(첫째 = 그 아이템, 다음 티어·차례), 그 밖은 그 아이템", () => {
    expect(accepts("stone")).toEqual(["stone", "rubble"]);
    expect(accepts("rubble")).toEqual(["rubble", "stone"]);
    // 소금·이탄·화석은 건축 재료가 아니다(D-566 1723): 그 줄이면 그 아이템만, 석재 줄로도 받지 않는다
    expect(accepts("salt")).toEqual(["salt"]);
    expect(accepts("pine_log")).toEqual(["pine_log", "birch_log"]);
    // T2 원자재·가공 재료는 칸이 있어도 레벨 0 재료가 아니다
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
      stockOf({ pine_log: 4, birch_log: 20, stone: 2, rubble: 3, salt: 9 }),
    );
    expect(plan).toEqual(
      new Map([
        ["pine_log", 4n],
        ["birch_log", 6n],
        ["stone", 2n],
        ["rubble", 3n],
      ]),
    );
  });

  it("소금이 많아도 석재 줄은 채우지 못한다(D-566 1723)", () => {
    expect(
      allocateMaterials([{ item: "stone", qty: 5 }], accepts, stockOf({ stone: 2, rubble: 1, salt: 9 })),
    ).toBeUndefined();
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
