// 원자재 오브젝트 아이템 고르기 시험 — 기획 D-540 1222(나 난파선 = 굴림표), D-552(표 하나·오브젝트마다 티어 범위·대표 아이템)
import { TEST_GATHER_BANDS } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { type ObjectYieldCatalog, objectRollOf, objectYieldItem } from "./objectYield.ts";

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
const CROP_LADDER = [["item:barley"], ["item:potato"], ["item:wheat"], [], [], [], [], [], [], []];
const TIERS: Readonly<Record<string, number>> = {
  loach: 0,
  minnow: 0,
  carp: 1,
  salmon: 2,
  saury: 3,
  mackerel: 3,
  barley: 0,
  potato: 1,
  wheat: 2,
  copper_ingot: 3,
  gold_ingot: 6,
  old_relic: 2,
};
const catalog: ObjectYieldCatalog = {
  facility: (id) =>
    id === "fishing_spot"
      ? { gather: { subcategory: "fish" } }
      : id === "farm"
        ? { gather: { subcategory: "crop", mode: "select" } }
        : undefined,
  gatherLadder: (gather) => (gather.subcategory === "crop" ? CROP_LADDER : FISH_LADDER),
  gatherBands: TEST_GATHER_BANDS,
  subcategoryOf: (id) =>
    ["barley", "potato", "wheat"].includes(id)
      ? "crop"
      : id in TIERS && !id.endsWith("ingot")
        ? "fish"
        : undefined,
  itemTier: (id) => TIERS[id],
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
const fish = (item: string, tierRange?: { min: number; max: number }) => ({
  item,
  facility: "fishing_spot",
  ...(tierRange ? { tierRange } : {}),
});

describe("굴림표(난파선)", () => {
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

describe("오브젝트 규칙(기획 D-552)", () => {
  it("범위가 없으면 대표 아이템 티어 하나 = 늘 대표 아이템(옛 고정 아이템과 같다)", () => {
    expect(count(fish("carp"), 2000)).toEqual(new Map([["carp", 2000]]));
    // 같은 티어에 둘이 있어도 대표 아이템
    expect(count(fish("minnow"), 500)).toEqual(new Map([["minnow", 500]]));
    // 사다리에 없는 대표 아이템(꺼진 아이템 등)도 그대로 나온다
    expect(count({ item: "old_relic", facility: null }, 50)).toEqual(new Map([["old_relic", 50]]));
  });

  it("새 유닛(AGI 10 + DEX 10 = 20), 범위 T0~T9: 표 하나 T0 70%·T1 15%·T2 10%·T3 5%(±1.5%p), T0은 대표 아이템이 아니면 반씩", () => {
    const got = count(fish("carp", { min: 0, max: 9 }), 20_000);
    const t0 = (got.get("loach") ?? 0) + (got.get("minnow") ?? 0);
    expect(Math.abs(t0 - 14_000)).toBeLessThan(300);
    expect(Math.abs((got.get("carp") ?? 0) - 3000)).toBeLessThan(300);
    expect(Math.abs((got.get("salmon") ?? 0) - 2000)).toBeLessThan(300);
    expect(Math.abs((got.get("saury") ?? 0) - 1000)).toBeLessThan(300);
    expect(Math.abs((got.get("loach") ?? 0) - (got.get("minnow") ?? 0))).toBeLessThan(500);
  });

  it("스탯이 높아도 위 끝까지만(사용자 '최대가 6티어이면 6까지'): 민물 T0~T2는 꽁치(T3)가 나오지 않고 연어로 접힌다", () => {
    const lake = count(fish("carp", { min: 0, max: 2 }), 5000, 75, 75);
    expect(lake.get("saury")).toBeUndefined();
    const open = count(fish("carp", { min: 0, max: 9 }), 5000, 75, 75);
    expect(lake.get("salmon") ?? 0).toBe((open.get("salmon") ?? 0) + (open.get("saury") ?? 0));
  });

  it("아래 끝으로 올린다: 대륙붕 T2~T6, 새 유닛의 T0·T1은 T2(연어)로", () => {
    const got = count(fish("mackerel", { min: 2, max: 6 }), 5000);
    // T3은 대표 아이템(고등어 — 시험 사다리에 없어 그 티어에 넣는다)
    expect([...got.keys()].toSorted()).toEqual(["mackerel", "salmon"]);
    expect(Math.abs((got.get("salmon") ?? 0) - 4750)).toBeLessThan(150);
  });

  it("그 티어에 대표 아이템이 있으면 대표 아이템: 범위 T0~T1, 대표 미꾸라지 = T0은 늘 미꾸라지", () => {
    const got = count(fish("loach", { min: 0, max: 1 }), 4000);
    expect([...got.keys()].toSorted()).toEqual(["carp", "loach"]);
    expect(Math.abs((got.get("loach") ?? 0) - 2800)).toBeLessThan(150);
  });

  it("선택 방식 시설(농장)이 맡으면 해금 티어를 범위로 자른다(기획 D-552 질문 1565)", () => {
    // 합 40 → 해금 T2, 범위 T0~T1 → 감자
    expect(
      objectYieldItem(
        { item: "barley", facility: "farm", tierRange: { min: 0, max: 1 } },
        catalog,
        input(1, 20, 20),
      ),
    ).toBe("potato");
    // 범위가 없으면 보리(대표 티어)
    expect(objectYieldItem({ item: "barley", facility: "farm" }, catalog, input(1, 20, 20))).toBe("barley");
  });

  it("규칙: 맡는 시설 사다리·범위·대표 아이템(굴림표는 표)", () => {
    const roll = objectRollOf(fish("carp", { min: 0, max: 2 }), catalog);
    expect(roll.tierRange).toEqual({ min: 0, max: 2 });
    expect(roll.prefer).toBe("item:carp");
    expect(roll.select).toBe(false);
    expect(roll.ladder).toBe(FISH_LADDER);
    expect(objectRollOf({ item: "barley", facility: "farm" }, catalog).select).toBe(true);
  });
});
