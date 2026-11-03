// 건물 편집기 모델 시험 — 담은 변경 → 묶음, 레벨 구간·재료 고치기, 레벨 표(재료·시간·자리·채집 보너스·꺼진 재료)
import {
  type BuildingEditorItem,
  type FacilityJson,
  OLD_FACILITY_BUILD_RULES,
} from "@terra/shared/buildingEditor";
import { describe, expect, it } from "vitest";
import {
  EMPTY_STAGE,
  addBand,
  addMaterial,
  bandRange,
  changesOf,
  cleanFacility,
  formatDuration,
  levelRows,
  mergeFacility,
  newBuild,
  newGather,
  removeBand,
  removeMaterial,
  setGather,
  setMaterial,
  stageDiscard,
  stageFacility,
  stageKeys,
} from "./buildingModel.ts";

const item = (id: string, weight: number | null, enabled = true, lotSize = 1): BuildingEditorItem => ({
  id,
  name: { ko: id, en: id },
  category: "raw",
  tier: 0,
  subcategory: null,
  weight,
  lotSize,
  enabled,
});
const ITEMS = [
  item("pine_log", 2000),
  item("stone", 1000),
  item("plank", 1000, false),
  item("iron_ore", 1, true, 1000),
];

const GATHER = { primary: "str", secondary: "vit", subcategory: "ore" } as const;
const MINE: FacilityJson = {
  id: "mine",
  name: { ko: "광산", en: "Mine" },
  stage: "gather",
  slotsPerLevel: 10,
  gather: GATHER,
  build: {
    mulPm: 800,
    levels: [
      {
        from: 1,
        materials: [
          { item: "pine_log", qty: 12 },
          { item: "stone", qty: 10 },
        ],
      },
      { from: 2, materials: [{ item: "plank", qty: 12 }] },
    ],
  },
};

describe("담은 변경", () => {
  it("put·revert·잠든 줄 버리기 → 묶음, 키", () => {
    let stage = stageFacility(EMPTY_STAGE, "mine", {
      op: "put",
      entry: MINE,
      base: MINE,
      baseHash: "a".repeat(64),
    });
    stage = stageFacility(stage, "farm", { op: "revert", base: MINE, baseHash: "b".repeat(64) });
    stage = stageDiscard(stage, "old_hall", true);
    expect(stageKeys(stage)).toEqual(["mine", "farm", "sleeping/old_hall"]);
    expect(changesOf(stage)).toEqual([
      { op: "put", entry: MINE, baseHash: "a".repeat(64) },
      { op: "revert", id: "farm", baseHash: "b".repeat(64) },
      { op: "discard_sleeping", id: "old_hall" },
    ]);
    expect(changesOf(stageDiscard(stageFacility(stage, "mine", null), "old_hall", false))).toHaveLength(1);
  });

  it("빈 선택 칸은 빼고 견준다(팩 줄 모양)", () => {
    const loose: FacilityJson = { ...MINE, pollution: undefined, gather: { ...GATHER, mode: undefined } };
    expect(cleanFacility(loose)).toEqual(MINE);
  });
});

describe("3방향 합치기(entry_changed 뒤)", () => {
  it("내가 바꾼 칸만 서버 항목 위에 얹고, 양쪽이 다르게 바꾼 칸은 내 값·충돌로 알린다", () => {
    const mine = { ...MINE, slotsPerLevel: 12, pollution: 3 };
    const theirs = { ...MINE, maxLevel: 4, pollution: 9 };
    const merged = mergeFacility(MINE, mine, theirs);
    expect(merged.entry).toEqual({ ...MINE, slotsPerLevel: 12, maxLevel: 4, pollution: 3 });
    expect(merged.conflicts).toEqual(["pollution"]);
    expect(mergeFacility(MINE, MINE, theirs)).toEqual({ entry: theirs, conflicts: [] });
  });
});

describe("레벨 구간·재료 고치기", () => {
  it("구간 더하기는 다음 레벨부터 앞 구간 재료를 복사하고, 최고 레벨을 넘지 않는다", () => {
    const three = addBand(MINE);
    expect(three.build?.levels.map((band) => band.from)).toEqual([1, 2, 3]);
    expect(three.build?.levels[2]?.materials).toEqual([{ item: "plank", qty: 12 }]);
    const capped = { ...MINE, maxLevel: 2 };
    expect(addBand(capped)).toBe(capped);
    expect(removeBand(three, 1).build?.levels.map((band) => band.from)).toEqual([1, 3]);
    const single = removeBand(removeBand(three, 2), 1);
    expect(removeBand(single, 0)).toBe(single);
  });

  it("재료 줄: 바꾸기·더하기(그 구간에 없는 첫 아이템)·빼기(마지막 줄은 남김)", () => {
    const edited = setMaterial(MINE, 1, 0, { item: "plank", qty: 30 });
    expect(edited.build?.levels[1]?.materials).toEqual([{ item: "plank", qty: 30 }]);
    const added = addMaterial(MINE, 0, ITEMS);
    expect(added.build?.levels[0]?.materials.at(-1)).toEqual({ item: "plank", qty: 1 });
    expect(removeMaterial(added, 0, 2).build?.levels[0]?.materials).toHaveLength(2);
    const one = removeMaterial(MINE, 1, 0);
    expect(one).toBe(MINE);
  });

  it("구간이 덮는 레벨", () => {
    expect(bandRange(MINE, 0)).toEqual({ from: 1, to: 1 });
    expect(bandRange(MINE, 1)).toEqual({ from: 2, to: 5 });
    expect(bandRange({ ...MINE, maxLevel: 3 }, 1)).toEqual({ from: 2, to: 3 });
    expect(bandRange(MINE, 5)).toBeNull();
  });

  it("건설·채집 칸이 없으면 처음 칸을 만들고, 채집 칸을 뺄 수 있다", () => {
    const bare: FacilityJson = {
      id: "hall",
      name: { ko: "회관", en: "Hall" },
      stage: "finish",
      slotsPerLevel: 1,
    };
    expect(newBuild(bare, ITEMS).build).toEqual({
      mulPm: 1000,
      levels: [{ from: 1, materials: [{ item: "pine_log", qty: 1 }] }],
    });
    expect(newBuild(MINE, ITEMS)).toBe(MINE);
    const subs = [
      { id: "metal", name: { ko: "금속", en: "Metal" }, major: "processed", enabled: true },
      { id: "ore", name: { ko: "광석", en: "Ore" }, major: "raw", enabled: true },
    ];
    expect(newGather(bare, subs).gather).toEqual({ primary: "str", secondary: "vit", subcategory: "ore" });
    expect(setGather(MINE, undefined).gather).toBeUndefined();
    expect("gather" in setGather(MINE, undefined)).toBe(false);
  });
});

describe("레벨 표", () => {
  it("레벨마다 그 구간 재료(round(qty × L² × 배율)), 시간, 자리, 채집 보너스, 꺼진 재료", () => {
    const rows = levelRows(MINE, ITEMS, OLD_FACILITY_BUILD_RULES, 10);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual({
      level: 1,
      from: 1,
      materials: [
        { item: "pine_log", qty: 10 },
        { item: "stone", qty: 8 },
      ],
      timeMs: 272_000,
      slots: 10,
      gatherBonus: 0,
      disabled: [],
      unknownWeight: [],
    });
    expect(rows[1]).toMatchObject({
      level: 2,
      from: 2,
      materials: [{ item: "plank", qty: 38 }],
      slots: 20,
      gatherBonus: 10,
      disabled: ["plank"],
    });
    // 묶음 크기가 있는 아이템(광석 1kg 묶음)은 묶음 하나 무게로 셈하고, 모르는 아이템은 0으로 셈하고 알린다
    const ore = levelRows(
      {
        ...MINE,
        build: {
          mulPm: 1000,
          levels: [
            {
              from: 1,
              materials: [
                { item: "iron_ore", qty: 1 },
                { item: "x", qty: 1 },
              ],
            },
          ],
        },
      },
      ITEMS,
      OLD_FACILITY_BUILD_RULES,
      10,
    );
    expect(ore[0]).toMatchObject({ timeMs: 10_000, unknownWeight: ["x"] });
    expect(
      levelRows({ ...MINE, gather: undefined, build: undefined }, ITEMS, OLD_FACILITY_BUILD_RULES, 10)[2],
    ).toMatchObject({
      from: null,
      materials: [],
      gatherBonus: null,
    });
  });

  it("시간 글: 시:분:초", () => {
    expect(formatDuration(272_000)).toBe("0:04:32");
    expect(formatDuration(4_860_000)).toBe("1:21:00");
    expect(formatDuration(360_000_000)).toBe("100:00:00");
  });
});
