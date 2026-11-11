// 유닛 추천 시험 — 1차 생산(유효 스탯 차례·같을 때 차례·스탯 짝 고르게), 전투 클래스(옛 CHR-1 §6 분류 규칙: 문턱 경계·같은 값 차례·정수 견줌)
import { describe, expect, it } from "vitest";
import {
  type CombatClassView,
  type GuideStats,
  OLD_COMBAT_CLASS_RULE,
  type ProductionTypeView,
  classKey,
  combatClassShape,
  recommendCombatClass,
  recommendProduction,
  statCoverage,
} from "./unitGuide.ts";

const name = (ko: string) => ({ ko, en: ko });
const type = (
  facility: string,
  primary: ProductionTypeView["primary"],
  secondary: ProductionTypeView["secondary"],
  mode: ProductionTypeView["mode"] = "roll",
): ProductionTypeView => ({
  facility,
  name: name(facility),
  primary,
  secondary,
  mode,
  group: mode === "select" || facility === "fishing_spot" ? "building" : "field",
});

/** 사용자 표(2026-11-11, 옛 gather_type_config = 기획 43 §4) */
const SIX: ProductionTypeView[] = [
  type("farm", "vit", "int", "select"),
  type("lumber_camp", "dex", "str"),
  type("mine", "str", "vit"),
  type("herb_field", "int", "wis"),
  type("ranch", "wis", "agi", "select"),
  type("fishing_spot", "agi", "dex"),
];

const stats = (str: number, vit: number, int: number, wis: number, dex: number, agi: number): GuideStats => ({
  str,
  vit,
  int,
  wis,
  dex,
  agi,
});

describe("1차 생산 추천", () => {
  it("유효 스탯(주 + 보조)이 큰 두 가지를 고른다", () => {
    const picks = recommendProduction(stats(40, 30, 5, 5, 10, 5), SIX);
    expect(
      picks.map((pick) => [pick.type.facility, pick.score, pick.primaryValue, pick.secondaryValue]),
    ).toEqual([
      ["mine", 70, 40, 30],
      ["lumber_camp", 50, 10, 40],
    ]);
  });

  it("합이 같으면 주 스탯이 큰 쪽, 그래도 같으면 표 차례", () => {
    // 농장 VIT 20 + INT 10 = 30, 약초원 INT 10 + WIS 20 = 30 → 주 스탯이 큰 농장 먼저
    expect(recommendProduction(stats(0, 20, 10, 20, 0, 0), SIX).map((pick) => pick.type.facility)).toEqual([
      "farm",
      "herb_field",
    ]);
    // 모두 같으면 표 차례
    expect(
      recommendProduction(stats(10, 10, 10, 10, 10, 10), SIX, 3).map((pick) => pick.type.facility),
    ).toEqual(["farm", "lumber_camp", "mine"]);
  });

  it("스탯 0·빈 표·개수", () => {
    expect(recommendProduction(stats(0, 0, 0, 0, 0, 0), SIX)).toHaveLength(2);
    expect(recommendProduction(stats(5, 5, 5, 5, 5, 5), [])).toEqual([]);
    expect(recommendProduction(stats(5, 5, 5, 5, 5, 5), SIX, 6)).toHaveLength(6);
    // 음수·소수는 0 이상 정수로 읽는다
    expect(recommendProduction(stats(-5, 9.9, 0, 0, 0, 0), SIX, 1)[0]).toMatchObject({ score: 9 });
  });

  it("스탯 짝 고르게: 사용자 표는 스탯마다 주 하나·보조 하나", () => {
    const coverage = statCoverage(SIX);
    expect(coverage.balanced).toBe(true);
    expect(coverage.rows.find((row) => row.stat === "str")).toEqual({
      stat: "str",
      primaryOf: ["mine"],
      secondaryOf: ["lumber_camp"],
    });
    // 광산 주 스탯을 DEX로 바꾸면 STR 주가 없고 DEX 주가 둘
    const broken = SIX.map((row) => (row.facility === "mine" ? { ...row, primary: "dex" as const } : row));
    const bad = statCoverage(broken);
    expect(bad.balanced).toBe(false);
    expect(bad.rows.find((row) => row.stat === "str")?.primaryOf).toEqual([]);
    expect(bad.rows.find((row) => row.stat === "dex")?.primaryOf).toEqual(["lumber_camp", "mine"]);
    // 주와 보조가 같은 시설도 알린다
    const same = SIX.map((row) => (row.facility === "farm" ? { ...row, secondary: "vit" as const } : row));
    expect(statCoverage(same).sameStat).toEqual(["farm"]);
  });
});

const cls = (id: string, ...list: CombatClassView["stats"]): CombatClassView => ({
  id,
  name: name(id),
  stats: list,
  desc: name(`${id} 설명`),
});
const CLASSES: CombatClassView[] = [
  cls("warrior", "str", "vit"),
  cls("shock_trooper", "str", "agi"),
  cls("duelist", "dex", "agi"),
  cls("archmage", "int", "wis"),
  cls("blade_master", "str", "dex", "agi"),
  cls("warlord", "str", "vit", "agi"),
  cls("generalist"),
];
const RULE = OLD_COMBAT_CLASS_RULE;

describe("전투 클래스 추천(옛 CHR-1 §6)", () => {
  it("조합 열쇠는 STR·VIT·INT·WIS·DEX·AGI 차례", () => {
    expect(classKey(["agi", "str"])).toBe("str+agi");
    expect(classKey(["wis", "int", "vit"])).toBe("vit+int+wis");
    expect(classKey([])).toBe("");
  });

  it("옛 문서 예시: STR 40·AGI 35·DEX 15 → 15 ÷ 40 = 0.375 < 0.60 → 2스탯(STR + AGI)", () => {
    const pick = recommendCombatClass(stats(40, 0, 0, 0, 15, 35), CLASSES, RULE);
    expect(pick.shape.kind).toBe("two");
    expect(pick.shape.top).toEqual(["str", "agi"]);
    expect(pick.entry?.id).toBe("shock_trooper");
  });

  it("옛 문서 예시: STR 30·AGI 28·DEX 25 → 25 ÷ 30 = 0.833 ≥ 0.60 → 3스탯(STR + DEX + AGI)", () => {
    const pick = recommendCombatClass(stats(30, 0, 0, 0, 25, 28), CLASSES, RULE);
    expect(pick.shape.kind).toBe("three");
    expect(pick.shape.top).toEqual(["str", "agi", "dex"]);
    expect(pick.entry?.id).toBe("blade_master");
  });

  it("문턱 경계는 정수 곱으로: S3 × 1000 ≥ S1 × 600이면 3스탯(딱 0.60 포함), 하나 모자라면 2스탯", () => {
    // S1 50, S3 30 → 30,000 ≥ 30,000
    expect(combatClassShape(stats(50, 40, 0, 0, 0, 30), RULE).kind).toBe("three");
    // S1 50, S3 29 → 29,000 < 30,000
    expect(combatClassShape(stats(50, 40, 0, 0, 0, 29), RULE).kind).toBe("two");
    // 실수 나눗셈이면 흔들리는 값(S1 7, S3 4.2는 없다 — 정수 스탯): S1 5, S3 3 → 3,000 ≥ 3,000
    expect(combatClassShape(stats(5, 4, 0, 0, 0, 3), RULE).kind).toBe("three");
  });

  it("범용: S6 × 1000 ≥ S1 × 800이면 범용(3스탯보다 먼저 본다), 하나 모자라면 3스탯", () => {
    const even = recommendCombatClass(stats(10, 10, 9, 9, 8, 8), CLASSES, RULE);
    expect(even.shape.kind).toBe("generalist");
    expect(even.entry?.id).toBe("generalist");
    // S1 10, S6 7 → 7,000 < 8,000
    expect(combatClassShape(stats(10, 10, 9, 9, 8, 7), RULE).kind).toBe("three");
    // 모두 같으면 범용
    expect(combatClassShape(stats(10, 10, 10, 10, 10, 10), RULE).kind).toBe("generalist");
  });

  it("같은 값은 STR·VIT·INT·WIS·DEX·AGI 차례로 세운다", () => {
    // STR 20, 나머지 가운데 VIT·AGI가 10으로 같다 → 둘째 = VIT(차례가 앞)
    const shape = combatClassShape(stats(20, 10, 0, 0, 0, 10), RULE);
    expect(shape.ranked.slice(0, 3)).toEqual(["str", "vit", "agi"]);
    // S3 10 × 1000 < 20 × 600 → 2스탯 STR + VIT
    expect(shape.kind).toBe("two");
    expect(recommendCombatClass(stats(20, 10, 0, 0, 0, 10), CLASSES, RULE).entry?.id).toBe("warrior");
    // 셋이 같은 값으로 3스탯: STR·VIT·AGI 12
    expect(recommendCombatClass(stats(12, 12, 0, 0, 0, 12), CLASSES, RULE).entry?.id).toBe("warlord");
  });

  it("모두 0이면 클래스 없음, 표에 없는 3스탯 조합은 위 두 스탯 조합으로 내려간다, 그것도 없으면 null", () => {
    expect(recommendCombatClass(stats(0, 0, 0, 0, 0, 0), CLASSES, RULE)).toMatchObject({
      shape: { kind: "none" },
      entry: null,
    });
    // INT·WIS·VIT 3스탯은 표에 없다 → INT + WIS 아크메이지
    const fallback = recommendCombatClass(stats(0, 20, 30, 28, 0, 0), CLASSES, RULE);
    expect(fallback.shape.kind).toBe("two");
    expect(fallback.entry?.id).toBe("archmage");
    // VIT + WIS 2스탯은 표에 없다
    expect(recommendCombatClass(stats(0, 30, 0, 28, 0, 0), CLASSES, RULE).entry).toBeNull();
  });

  it("문턱을 바꾸면(설정 칸) 분류가 바뀐다", () => {
    const loose = { threeStatPm: 300, generalistPm: 800 };
    expect(combatClassShape(stats(40, 0, 0, 0, 15, 35), loose).kind).toBe("three");
    expect(combatClassShape(stats(10, 10, 9, 9, 8, 7), { threeStatPm: 600, generalistPm: 700 }).kind).toBe(
      "generalist",
    );
  });
});
