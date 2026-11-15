// 생산 편집기 모델 시험 — 담은 변경(시설·클래스·확률표 한 묶음), 채집 칸 고치기, 미리 보기(유효 스탯·구간·티어 확률·시간당 기대 산출), 탭 주소
import type {
  BuildingEditorCombatClass,
  BuildingEditorFacility,
  BuildingEditorGatherRules,
  BuildingEditorItem,
  FacilityGatherJson,
  FacilityJson,
} from "@terra/shared/buildingEditor";
import { describe, expect, it } from "vitest";
import {
  EMPTY_PRODUCTION_STAGE,
  draftOf,
  editClass,
  editFacility,
  ladderOf,
  processRows,
  productionChangesOf,
  productionStageKeys,
  productionTypeRows,
  revertFacility,
  sampleStats,
  tabKey,
  tabOfKey,
  typePreview,
  withGather,
} from "./productionModel.ts";

const name = (ko: string) => ({ ko, en: ko });
function facility(
  id: string,
  gather?: FacilityGatherJson,
  stage: FacilityJson["stage"] = "gather",
): BuildingEditorFacility {
  const entry: FacilityJson = { id, name: name(id), stage, slotsPerLevel: 10, ...(gather ? { gather } : {}) };
  return { entry, origin: "pack", pack: entry, override: null, hash: `hash-${id}`, recipes: [] };
}

/** 시험 시설의 채집 칸(없으면 시험 오류) */
function gatherOf(row: BuildingEditorFacility): FacilityGatherJson {
  if (!row.entry.gather) throw new Error(`no gather: ${row.entry.id}`);
  return row.entry.gather;
}

const MINE = facility("mine", {
  primary: "str",
  secondary: "vit",
  subcategory: "ore",
  yieldBase: 1,
  yieldPerStatPm: 100,
  yieldCap: 10,
});
const RANCH = facility("ranch", {
  primary: "wis",
  secondary: "agi",
  subcategory: "livestock_product",
  mode: "select",
  yieldBase: 1,
  yieldPerStatPm: 80,
  yieldCap: 6,
});
const FISHING = facility("fishing_spot", {
  primary: "agi",
  secondary: "dex",
  subcategory: "fish",
  yieldBase: 1,
  yieldPerStatPm: 100,
  yieldCap: 5,
  catch: { basePm: 300, maxPm: 800, statPm: 500, fullStat: 200 },
});
const SMELTER = facility("smelter", undefined, "process");

const RULES: BuildingEditorGatherRules = {
  progressDivisor: 20,
  yieldPerStatPm: 80,
  tierProgressBase: 30,
  tierProgressStep: 30,
  tickMs: 60_000,
  oreGrams: 1000,
  defaultStat: 10,
};
/** 팩 확률표의 앞 두 구간과 100 이상 구간(시험용) */
const BANDS = [
  { from: 0, weightsPm: [700, 150, 100, 50, 0, 0, 0, 0, 0, 0] },
  { from: 40, weightsPm: [650, 220, 100, 30, 0, 0, 0, 0, 0, 0] },
  { from: 100, weightsPm: [350, 280, 200, 110, 40, 15, 5, 0, 0, 0] },
];
const FULL = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

const item = (id: string, tier: number, subcategory: string, enabled = true): BuildingEditorItem => ({
  id,
  name: name(id),
  category: "raw",
  tier,
  subcategory,
  weight: 100,
  lotSize: 1,
  enabled,
});

const input = (gather: FacilityGatherJson, primary: number, secondary: number, level = 1) => ({
  gather,
  primary,
  secondary,
  level,
  bands: BANDS,
  ladderCounts: FULL,
  rules: RULES,
  levelBonus: 10,
});

const of = (key: string | undefined) => tabOfKey(key, ["mine", "ranch"], ["smelter"]);

describe("담은 변경", () => {
  it("채집 칸을 고치면 담기고, 처음 값으로 돌아오면 빠진다. 되돌리기는 팩 값을 보인다", () => {
    const flipped = withGather(MINE.entry, { primary: "vit", secondary: "str" });
    let stage = editFacility(EMPTY_PRODUCTION_STAGE, MINE, flipped);
    expect(productionStageKeys(stage)).toEqual(["facilities/mine"]);
    expect(productionChangesOf(stage)).toEqual([{ op: "put", entry: flipped, baseHash: "hash-mine" }]);
    expect(draftOf(MINE, stage.facilities.get("mine")).gather?.primary).toBe("vit");
    stage = editFacility(stage, MINE, withGather(flipped, { primary: "str", secondary: "vit" }));
    expect(productionStageKeys(stage)).toEqual([]);
    stage = revertFacility(stage, MINE);
    expect(productionChangesOf(stage)).toEqual([{ op: "revert", id: "mine", baseHash: "hash-mine" }]);
  });

  it("전투 클래스 고침은 put_combat_class로 묶인다(시설 → 클래스 → 확률표 차례)", () => {
    const warrior: BuildingEditorCombatClass = {
      entry: { id: "warrior", name: name("워리어"), stats: ["str", "vit"], desc: name("탱커") },
      origin: "pack",
      pack: null,
      override: null,
      hash: "hash-warrior",
    };
    const next = { ...warrior.entry, name: name("철벽") };
    const stage = editClass(
      editFacility(EMPTY_PRODUCTION_STAGE, MINE, withGather(MINE.entry, { yieldCap: 12 })),
      warrior,
      next,
    );
    expect(productionChangesOf(stage).map((change) => change.op)).toEqual(["put", "put_combat_class"]);
    expect(productionStageKeys(stage)).toEqual(["facilities/mine", "classes/warrior"]);
  });

  it("채집 칸 고치기: 선택 칸을 undefined로 주면 빠지고 팩 줄 차례를 지킨다", () => {
    const next = withGather(FISHING.entry, { catch: undefined, mode: "select" });
    expect(Object.keys(next.gather ?? {})).toEqual([
      "primary",
      "secondary",
      "subcategory",
      "mode",
      "yieldBase",
      "yieldPerStatPm",
      "yieldCap",
    ]);
    expect(withGather(SMELTER.entry, { primary: "str" })).toBe(SMELTER.entry);
  });
});

describe("생산 종류·가공 시설·사다리", () => {
  it("채집 칸이 있는 채집 단계 시설만 생산 종류다: 묶음은 필드채집·건물생산, 담은 초안을 본다", () => {
    const stage = editFacility(EMPTY_PRODUCTION_STAGE, MINE, withGather(MINE.entry, { primary: "dex" }));
    const rows = productionTypeRows([MINE, RANCH, FISHING, SMELTER], stage);
    expect(rows.map((row) => [row.type.facility, row.type.primary, row.type.group, row.staged])).toEqual([
      ["mine", "dex", "field", true],
      ["ranch", "wis", "building", false],
      ["fishing_spot", "agi", "building", false],
    ]);
    expect(processRows([MINE, SMELTER]).map((row) => row.entry.id)).toEqual(["smelter"]);
  });

  it("사다리 = 그 중분류의 켜진 아이템을 티어마다", () => {
    const ladder = ladderOf(
      [
        item("loach", 0, "fish"),
        item("minnow", 0, "fish"),
        item("carp", 1, "fish"),
        item("old", 2, "fish", false),
        item("rubble", 0, "ore"),
      ],
      { subcategory: "fish" },
    );
    expect(ladder.map((tier) => tier.map((entry) => entry.id)).slice(0, 3)).toEqual([
      ["loach", "minnow"],
      ["carp"],
      [],
    ]);
    expect(ladder).toHaveLength(10);
  });

  it("중분류 여럿(질문 946 나, 목장): 축산물 + 목축 부산물이 티어마다 한 사다리로(목록 차례), 겹친 중분류는 한 번", () => {
    const items = [
      item("raw_meat", 0, "livestock_product"),
      item("feather", 0, "livestock_byproduct"),
      item("egg", 0, "livestock_product"),
      item("deer_hide", 1, "livestock_byproduct"),
      item("rubble", 0, "ore"),
    ];
    const ladder = ladderOf(items, {
      subcategory: "livestock_product",
      extraSubcategories: ["livestock_byproduct", "livestock_product"],
    });
    expect(ladder.map((tier) => tier.map((entry) => entry.id)).slice(0, 2)).toEqual([
      ["raw_meat", "feather", "egg"],
      ["deer_hide"],
    ]);
    // 함께 내는 칸이 없으면 앞 판 그대로(주 중분류 하나)
    expect(ladderOf(items, { subcategory: "livestock_product" })[0]?.map((entry) => entry.id)).toEqual([
      "raw_meat",
      "egg",
    ]);
  });
});

describe("미리 보기(판정과 같은 식)", () => {
  it("추첨(광산): 스탯 10·10 → 유효 20 → 첫 구간, T0 70%. 한 번 = 기대 45분, 수확량 2 → 시간당 약 2.67개", () => {
    const preview = typePreview(input(gatherOf(MINE), 10, 10));
    expect(preview).toMatchObject({
      stat: 20,
      bandIndex: 0,
      selectTier: null,
      catchPm: null,
      progress: 1,
      yieldPerLot: 2,
    });
    expect(preview.tierPm.slice(0, 4)).toEqual([700, 150, 100, 50]);
    expect(preview.emptyPm).toBe(0);
    // 0.7 × 30 + 0.15 × 60 + 0.1 × 90 + 0.05 × 120 = 45분
    expect(preview.minutesPerLot).toBeCloseTo(45, 6);
    expect(preview.perHour).toBeCloseTo((60 / 45) * 2, 6);
    expect(preview.topTier).toBe(0);
  });

  it("레벨 보너스가 구간을 올린다: 스탯 15·15 + Lv2(+10) = 40 → 둘째 구간. 주 스탯 40이면 진행 2배", () => {
    expect(typePreview(input(gatherOf(MINE), 15, 15, 2))).toMatchObject({ stat: 40, bandIndex: 1 });
    const fast = typePreview(input(gatherOf(MINE), 40, 0));
    expect(fast.progress).toBe(2);
    expect(fast.yieldPerLot).toBe(1);
  });

  it("선택(목장, 건물 채집소 D-566 1721): 티어 = 레벨 최고 티어(Lv2 = T3), 그 티어가 비면 아래로. 확률표를 쓰지 않는다", () => {
    const preview = typePreview(input(gatherOf(RANCH), 30, 30, 2));
    expect(preview).toMatchObject({ selectTier: 3, yieldPm: 1000, bandIndex: -1, emptyPm: 0, topTier: 3 });
    expect(preview.tierPm[3]).toBe(1000);
    // T3 필요 진행 120분 ÷ 진행 1 = 120분, 수확량 1 + ⌊30 × 0.08⌋ = 3 → 시간당 1.5
    expect(preview.minutesPerLot).toBeCloseTo(120, 6);
    expect(preview.perHour).toBeCloseTo(1.5, 6);
    // Lv3 = T5(권장 100), 합 60 → 효율 max(300, 1000 − 25 × 40) = 300‰ → 시간당 수확도 0.3배
    const low = typePreview(input(gatherOf(RANCH), 30, 30, 3));
    expect(low).toMatchObject({ selectTier: 5, yieldPm: 300 });
    expect(low.perHour).toBeCloseTo((60 / 180) * 3 * 0.3, 6);
    const sparse = typePreview({
      ...input(gatherOf(RANCH), 30, 30, 2),
      ladderCounts: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    });
    expect(sparse.topTier).toBe(0);
    const none = typePreview({
      ...input(gatherOf(RANCH), 30, 30, 2),
      ladderCounts: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    });
    expect(none).toMatchObject({ emptyPm: 1000, perHour: 0, topTier: null });
  });

  it("낚시터: 성공 확률을 곱한다 — 스탯 10·10 → 성공 350‰, T0 245‰, 빈 번 650‰", () => {
    const preview = typePreview(input(gatherOf(FISHING), 10, 10));
    expect(preview.catchPm).toBe(350);
    expect(preview.tierPm.slice(0, 4)).toEqual([245, 52, 35, 17]);
    expect(preview.emptyPm).toBe(1000 - 245 - 52 - 35 - 17);
    expect(preview.perHour).toBeGreaterThan(0);
    // 같은 스탯·같은 표의 늘 성공 시설(광산)보다 적게 낸다
    expect(preview.perHour).toBeLessThan(typePreview(input(gatherOf(MINE), 10, 10)).perHour);
  });

  it("표본 스탯은 새 유닛 평균의 1·3·6·10배", () => {
    expect(sampleStats(10)).toEqual([10, 30, 60, 100]);
    expect(sampleStats(0)).toEqual([1, 3, 6, 10]);
  });
});

describe("탭 주소", () => {
  it("탭 ↔ ?tab= 값: 공용 탭 이름, 시설 탭은 시설 ID. 모르는 값은 null", () => {
    expect(tabKey({ kind: "tiers" })).toBe("tiers");
    expect(tabKey({ kind: "type", facility: "mine" })).toBe("mine");
    expect(of("mapping")).toEqual({ kind: "mapping" });
    expect(of("ranch")).toEqual({ kind: "type", facility: "ranch" });
    expect(of("smelter")).toEqual({ kind: "process", facility: "smelter" });
    expect(of("nope")).toBeNull();
    expect(of(undefined)).toBeNull();
  });
});

describe("확률표 하나(기획 D-552)", () => {
  it("미리 보기는 표 하나를 쓴다: 광산·어류 모두 T0 700(어류는 × 성공 ‰)", () => {
    const ore = typePreview(input(gatherOf(MINE), 10, 10));
    expect(ore).toMatchObject({ stat: 20, bandIndex: 0 });
    expect(ore.tierPm.slice(0, 4)).toEqual([700, 150, 100, 50]);
    const fish = typePreview(input(gatherOf(FISHING), 10, 10));
    expect(fish.tierPm[0]).toBe(Math.floor((700 * (fish.catchPm ?? 1000)) / 1000));
  });
});
