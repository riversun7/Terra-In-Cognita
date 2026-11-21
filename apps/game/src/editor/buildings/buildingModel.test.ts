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
  bandMatrix,
  bandRange,
  bulkEditBandMatrix,
  changesOf,
  cleanFacility,
  formatDuration,
  levelRows,
  mergeFacility,
  newBuild,
  newGather,
  newRepairRule,
  removeBand,
  removeMaterial,
  setGather,
  setLook,
  setMaterial,
  setRepair,
  splitBandsPerLevel,
  stageDiscard,
  stageFacility,
  stageKeys,
  toggleIn,
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
      { op: "discard_sleeping", id: "old_hall", category: "facilities" },
    ]);
    expect(changesOf(stageDiscard(stageFacility(stage, "mine", null), "old_hall", false))).toHaveLength(1);
  });

  it("빈 선택 칸은 빼고 견준다(팩 줄 모양)", () => {
    const loose: FacilityJson = { ...MINE, pollution: undefined, gather: { ...GATHER, mode: undefined } };
    expect(cleanFacility(loose)).toEqual(MINE);
  });

  it("건물 런타임 칸(칸 크기·내구도·창고)은 다듬어도 남고, 3방향 합치기도 칸마다 고른다", () => {
    const withRuntime: FacilityJson = {
      ...MINE,
      footprint: { width: 3, height: 2 },
      durability: 900,
      storageKg: 500,
    };
    expect(cleanFacility(withRuntime)).toEqual(withRuntime);
    const mine: FacilityJson = { ...withRuntime, durability: 1200 };
    const theirs: FacilityJson = { ...withRuntime, storageKg: 800 };
    expect(mergeFacility(withRuntime, mine, theirs)).toEqual({
      entry: { ...withRuntime, durability: 1200, storageKg: 800 },
      conflicts: [],
    });
  });

  it("2차맵 겉모습(look): 빈 칸은 빼고 칸이 없으면 칸째 뺀다, 3방향 합치기에 든다(2026-11-09)", () => {
    const withLook: FacilityJson = { ...MINE, look: { model: "mine", wall: undefined, heightPm: 1200 } };
    expect(cleanFacility(withLook).look).toEqual({ model: "mine", heightPm: 1200 });
    expect(Object.keys(cleanFacility(withLook)).at(-1)).toBe("look");
    expect(cleanFacility({ ...MINE, look: {} })).not.toHaveProperty("look");
    // 칸 하나 고치기: 지우면(undefined) 칸이 빠지고 다 지우면 look째 빠진다
    expect(setLook(withLook, "roof", "teal").look).toEqual({ model: "mine", roof: "teal", heightPm: 1200 });
    expect(setLook(withLook, "heightPm", undefined).look).toEqual({ model: "mine" });
    expect(setLook(setLook(withLook, "heightPm", undefined), "model", undefined)).not.toHaveProperty("look");
    const base = cleanFacility(withLook);
    const mine: FacilityJson = { ...base, look: { model: "temple", heightPm: 1200 } };
    const theirs: FacilityJson = { ...base, pollution: 9 };
    expect(mergeFacility(base, mine, theirs)).toEqual({
      entry: { ...theirs, look: { model: "temple", heightPm: 1200 } },
      conflicts: [],
    });
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

  it("구간 × 재료 표: 열 = 처음 나온 차례의 아이템, 없는 칸은 null", () => {
    const matrix = bandMatrix(MINE);
    expect(matrix.items).toEqual(["pine_log", "stone", "plank"]);
    expect(matrix.cells).toEqual([
      [{ line: 0, qty: 12 }, { line: 1, qty: 10 }, null],
      [null, null, { line: 0, qty: 12 }],
    ]);
  });

  it("레벨마다 구간으로 나누면 레벨 표는 그대로이고, 고른 칸을 묶어 바꾼다(없는 칸은 건너뜀, 범위 안)", () => {
    const split = splitBandsPerLevel(MINE);
    expect(split.build?.levels.map((band) => band.from)).toEqual([1, 2, 3, 4, 5]);
    expect(levelRows(split, ITEMS, OLD_FACILITY_BUILD_RULES, 10).map((row) => row.materials)).toEqual(
      levelRows(MINE, ITEMS, OLD_FACILITY_BUILD_RULES, 10).map((row) => row.materials),
    );
    // 이미 레벨마다 하나면 그대로
    expect(splitBandsPerLevel(split)).toBe(split);
    // plank 열(2)의 Lv2~Lv5(구간 1~4)를 12 → 4 선형으로: 먼저 끝 칸을 4로
    const ends = bulkEditBandMatrix(split, ["4:2"], { kind: "set", value: 4 });
    const filled = bulkEditBandMatrix(ends, ["1:2", "2:2", "3:2", "4:2", "0:2"], { kind: "linear" });
    expect(filled.build?.levels.map((band) => band.materials.find((s) => s.item === "plank")?.qty)).toEqual([
      undefined,
      12,
      9,
      7,
      4,
    ]);
    // 곱하기는 범위(1 이상)로 자른다
    const scaled = bulkEditBandMatrix(MINE, ["0:0", "0:1"], { kind: "scale", percent: 1 });
    expect(scaled.build?.levels[0]?.materials).toEqual([
      { item: "pine_log", qty: 1 },
      { item: "stone", qty: 1 },
    ]);
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
    // 건설 재료 수량은 기본 단위(광석 1g)이므로 1,000g = 1kg(10초)로 셈하고, 모르는 아이템은 0으로 셈하고 알린다
    const ore = levelRows(
      {
        ...MINE,
        build: {
          mulPm: 1000,
          levels: [
            {
              from: 1,
              materials: [
                { item: "iron_ore", qty: 1000 },
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

describe("수리 줄(D-512 323, 옛 REPAIR_MAP)", () => {
  const ARMOR = {
    slots: ["head", "body"],
    weaponTypes: ["shield"],
    materials: [{ item: "iron_ingot", qty: 1 }],
  };

  it("새 줄 = 칸·무기 종류 없음 + 첫 재료 아이템 1, 빈 목록이면 칸을 뺀다", () => {
    expect(newRepairRule(ITEMS)).toEqual({
      slots: [],
      weaponTypes: [],
      materials: [{ item: "pine_log", qty: 1 }],
    });
    expect(newRepairRule([{ ...item("sword", null), category: "equipment" }])).toBeNull();
    const withRepair = setRepair(MINE, [ARMOR]);
    expect(withRepair.repair).toEqual([ARMOR]);
    expect("repair" in setRepair(withRepair, [])).toBe(false);
    expect("repair" in setRepair(withRepair, undefined)).toBe(false);
  });

  it("칸 고르기는 정한 차례를 지킨다(팩 줄과 같은 차례로 견준다)", () => {
    const order = ["weapon", "offhand", "head", "body", "accessory"];
    expect(toggleIn(["body"], "head", true, order)).toEqual(["head", "body"]);
    expect(toggleIn(["head", "body"], "head", false, order)).toEqual(["body"]);
    expect(toggleIn([], "zzz", true, order)).toEqual(["zzz"]);
  });

  it("정리·3방향 합치기에 수리 칸이 남는다", () => {
    const mine = setRepair(MINE, [ARMOR]);
    expect(cleanFacility(mine).repair).toEqual([ARMOR]);
    const theirs = { ...MINE, slotsPerLevel: 7 };
    const merged = mergeFacility(MINE, mine, theirs);
    expect(merged.entry.repair).toEqual([ARMOR]);
    expect(merged.entry.slotsPerLevel).toBe(7);
    expect(merged.conflicts).toEqual([]);
  });
});
