// 계산식 탭 모델 시험 — 자동 완성·담은 식 정리·미리 보기(docs/adr/2026-11-01-formula-editor.md "화면")
import {
  COMBAT_FORMULA_IDS,
  DEFAULT_COMBAT_FORMULAS,
  type FormulaListResponse,
  type FormulaSlotView,
} from "@terra/shared/formula";
import { describe, expect, it } from "vitest";
import {
  applySuggestion,
  formulaChangesOf,
  localsIn,
  previewOf,
  pruneDrafts,
  suggestionsFor,
  wordAt,
} from "./formulaModel.ts";

const hp: FormulaSlotView = {
  key: "hp.formula",
  group: "stat",
  name: { ko: "HP", en: "HP" },
  row: { id: "hp", shape: "quantity" },
  packSource: "STR * 1.5 + DEX + AGI * 1.5 + VIT * 3 + INT + WIS * 1.2 + GEAR + BUFF",
  source: "STR * 1.5 + DEX + AGI * 1.5 + VIT * 3 + INT + WIS * 1.2 + GEAR + BUFF",
  generated: true,
  override: null,
};

const combat = (id: (typeof COMBAT_FORMULA_IDS)[number]): FormulaSlotView => ({
  key: id,
  group: "combat",
  name: { ko: id, en: id },
  row: null,
  packSource: DEFAULT_COMBAT_FORMULAS[id],
  source: DEFAULT_COMBAT_FORMULAS[id],
  generated: false,
  override: null,
});

const list: FormulaListResponse = {
  contentVersion: "core@21",
  revision: 3,
  slots: [
    hp,
    {
      ...hp,
      key: "physical_attack.formula",
      row: { id: "physical_attack", shape: "quantity" },
      packSource: "STR * 2 + DEX * 0.6 + GEAR + BUFF",
      source: "STR * 2 + DEX * 0.6 + GEAR + BUFF",
    },
    ...COMBAT_FORMULA_IDS.map(combat),
  ],
  weapons: [
    {
      id: "natural_human",
      name: { ko: "human", en: "human" },
      natural: "human",
      kind: "physical",
      attack: 5,
      attackAppropriate: 20,
      hitPm: 850,
      hitAppropriate: 20,
      critPm: 50,
      critAppropriate: 20,
      intervalMs: 1000,
      speedAppropriate: 100,
      staminaCost: 10,
      unarmed: true,
    },
  ],
  coefficients: {
    capPm: 2000,
    critSpreadPm: 500,
    staminaWeightsPm: [0, 0, 700, 300, 0, 0],
    staminaAppropriate: 80,
    staminaMinPm: 500,
    evadeRelative: { favorSlopePm: 300, favorCapPm: 400, unfavorSlopePm: 400, unfavorCapPm: 300 },
  },
  samples: [{ id: "new_lv1", primaries: [10, 10, 10, 10, 10, 10], level: 1 }],
};

const human = list.weapons[0];
if (!human) throw new Error("weapon");

describe("자동 완성", () => {
  it("글자 앞 낱말과 그 낱말로 시작하는 이름(변수 → 중간값 → 함수)", () => {
    expect(wordAt("VIT * 3 + ST", 12)).toEqual({ start: 10, prefix: "ST" });
    expect(suggestionsFor(hp, "VIT * 3 + st", "st").map((item) => item.name)).toEqual(["STR"]);
    expect(suggestionsFor(hp, "half = 1\nha", "ha").map((item) => item.name)).toEqual(["half"]);
    expect(suggestionsFor(hp, "fl", "fl")).toEqual([{ name: "floor", kind: "fn" }]);
    expect(suggestionsFor(hp, "3", "3")).toEqual([]);
    expect(localsIn("a = 1\nb == 2\nc = a")).toEqual(["a", "c"]);
  });

  it("고른 이름을 넣고 함수는 괄호를 붙인다", () => {
    expect(applySuggestion("VIT + fl", 8, { name: "floor", kind: "fn" })).toEqual({
      source: "VIT + floor(",
      caret: 12,
    });
    expect(applySuggestion("st + 1", 2, { name: "STR", kind: "var" })).toEqual({
      source: "STR + 1",
      caret: 3,
    });
  });
});

describe("담은 식", () => {
  it("묶음 모양과, 다시 받은 목록에서 바꿀 것이 없어진 칸 빼기", () => {
    const drafts = new Map<string, string | null>([
      ["hp.formula", hp.source],
      ["real_hit", "W * 2"],
      ["real_crit", null],
      ["gone.formula", "1"],
    ]);
    expect(formulaChangesOf(drafts)).toHaveLength(4);
    expect([...pruneDrafts(drafts, list).keys()]).toEqual(["real_hit"]);
  });
});

describe("미리 보기", () => {
  it("HP 행 식: 새 사이보그 92, 항마다 풀이, 1차 영향(VIT +10 → +30)", () => {
    const preview = previewOf({
      list,
      drafts: new Map(),
      slot: hp,
      source: hp.source,
      primaries: [10, 10, 10, 10, 10, 10],
      level: 1,
      weapon: human,
    });
    expect(preview?.value).toBe(92_000);
    expect(preview?.explanation.terms[3]?.text).toBe("VIT(10) × 3");
    expect(preview?.influence.plus10[3]).toBe(30_000);
    expect(preview?.outOfRange).toBe(false);
  });

  it("행 식을 담으면 아래 전투 식(실제 공격력 점수 S)에도 든다, 틀린 식은 null", () => {
    const weapon = { ...human, unarmed: false };
    const base = previewOf({
      list,
      drafts: new Map(),
      slot: combat("real_attack"),
      source: DEFAULT_COMBAT_FORMULAS.real_attack,
      primaries: [10, 10, 10, 10, 10, 10],
      level: 1,
      weapon,
    });
    const doubled = previewOf({
      list,
      drafts: new Map([["physical_attack.formula", "STR * 4 + GEAR + BUFF"]]),
      slot: combat("real_attack"),
      source: DEFAULT_COMBAT_FORMULAS.real_attack,
      primaries: [10, 10, 10, 10, 10, 10],
      level: 1,
      weapon,
    });
    // S 26 → 40: 5 × min(2, 26 ÷ 20) = 6, 5 × min(2, 40 ÷ 20) = 10
    expect(base?.value).toBe(6000);
    expect(doubled?.value).toBe(10_000);
    expect(
      previewOf({
        list,
        drafts: new Map(),
        slot: hp,
        source: "VIT +",
        primaries: [10, 10, 10, 10, 10, 10],
        level: 1,
        weapon,
      }),
    ).toBeNull();
  });

  it("맨손 식: 굴림 범위, 맨손이 아니면 판정이 쓰지 않음", () => {
    const bare = combat("bare_attack");
    const weapon = human;
    const preview = previewOf({
      list,
      drafts: new Map(),
      slot: bare,
      source: bare.source,
      primaries: [39, 39, 39, 39, 39, 39],
      level: 30,
      weapon,
    });
    expect(preview?.rollRange).toEqual({ min: 13_000, max: 27_000 });
    expect(preview?.unused).toBe(false);
    const armed = previewOf({
      list,
      drafts: new Map(),
      slot: bare,
      source: bare.source,
      primaries: [39, 39, 39, 39, 39, 39],
      level: 30,
      weapon: { ...weapon, unarmed: false },
    });
    expect(armed?.unused).toBe(true);
  });
});
