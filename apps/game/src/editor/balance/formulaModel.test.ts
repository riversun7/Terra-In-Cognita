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
  sampleStaminaOf,
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
      attack: 0,
      appropriate: {},
      hitPm: 850,
      critPm: 50,
      intervalMs: 1000,
      staminaCost: 10,
      unarmed: true,
    },
  ],
  coefficients: {
    capPm: 1000,
    critSpreadPm: 500,
    staminaWeightsPm: [0, 0, 700, 300, 0, 0],
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

  it("행 식을 담으면 아래 전투 식(실제 공격력의 스탯 공격력 S)에도 든다, 틀린 식은 null", () => {
    const weapon = { ...human, unarmed: false, attack: 5, appropriate: { str: 20 } };
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
    // D-502: S + 5 × min(1, STR 10 ÷ 20) → S 26이면 26 + 2 = 28, S 40이면 40 + 2 = 42
    expect(base?.value).toBe(28_000);
    expect(doubled?.value).toBe(42_000);
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

  it("맨손 적정 식(D-502): Lv 30 → 55, 굴림 없음, 맨손이 아니면 판정이 쓰지 않음", () => {
    const bare = combat("bare_appropriate");
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
    expect(preview?.value).toBe(55_000);
    expect(preview?.rollRange).toBeNull();
    expect(preview?.unused).toBe(false);
    // 맨손 명중 = 850 × 39 ÷ 55 → 602‰
    const hit = previewOf({
      list,
      drafts: new Map(),
      slot: combat("real_hit"),
      source: combat("real_hit").source,
      primaries: [39, 39, 39, 39, 39, 39],
      level: 30,
      weapon,
    });
    expect(hit?.value).toBe(602_000);
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

describe("스태미나(D-511 적정 스탯 개념)", () => {
  // 맨손 표본 무기(간격 1000ms·소모 10)와 스태미나 두 행(시험 목록에는 hp·physical_attack 행만 있어 회복 행을 더한다)
  const withRegen: FormulaListResponse = {
    ...list,
    slots: [
      ...list.slots,
      {
        ...hp,
        key: "stamina.formula",
        row: { id: "stamina", shape: "quantity" },
        packSource: "100 + AGI * 0.7 + VIT * 0.3 + GEAR + BUFF",
        source: "100 + AGI * 0.7 + VIT * 0.3 + GEAR + BUFF",
      },
      {
        ...hp,
        key: "stamina_regen.formula",
        row: { id: "stamina_regen", shape: "quantity" },
        packSource: "720 + GEAR + BUFF",
        source: "720 + GEAR + BUFF",
      },
    ],
  };

  it("적정 STA 식: Lv 1 → 10, Lv 30 → 39(보통 유닛 STA 점수)", () => {
    const slot = combat("stamina_appropriate");
    for (const [level, value] of [
      [1, 10_000],
      [30, 39_000],
    ] as const) {
      const preview = previewOf({
        list: withRegen,
        drafts: new Map(),
        slot,
        source: slot.source,
        primaries: [39, 39, 39, 39, 39, 39],
        level,
        weapon: human,
      });
      expect(preview?.value).toBe(value);
    }
  });

  it("보통 유닛(Lv 1 1차 10·Lv 30 1차 39)은 소모 10·회복 초당 12로 일반 공격이 이어지고, 같은 1차로 Lv 60이면 줄어든다", () => {
    const [lv1] = sampleStaminaOf(withRegen, new Map(), [10, 10, 10, 10, 10, 10], 1);
    expect(lv1).toMatchObject({ appropriateMilli: 10_000, score: 10, max: 110, regenPerMinute: 720 });
    expect(lv1?.costMilli).toBe(10_000);
    expect(lv1?.sustained).toBe(true);
    const [lv30] = sampleStaminaOf(withRegen, new Map(), [39, 39, 39, 39, 39, 39], 30);
    expect(lv30).toMatchObject({
      appropriateMilli: 39_000,
      costMilli: 10_000,
      regenPerMinute: 720,
      sustained: true,
    });
    const [lv60] = sampleStaminaOf(withRegen, new Map(), [39, 39, 39, 39, 39, 39], 60);
    // 10 × 69 ÷ 39 = 17.69, 720 × 39 ÷ 69 = 406 → 초당 6.8 < 17.7
    expect(lv60).toMatchObject({
      appropriateMilli: 69_000,
      costMilli: 17_690,
      regenPerMinute: 406,
      sustained: false,
    });
  });

  it("담은 식이 든다: 회복 식을 R ÷ 4로 바꾸면 Lv 1에서도 줄어든다", () => {
    const drafts = new Map<string, string | null>([["real_stamina_regen", "floor(R / 4)"]]);
    const [lv1] = sampleStaminaOf(withRegen, drafts, [10, 10, 10, 10, 10, 10], 1);
    expect(lv1).toMatchObject({ regenPerMinute: 180, sustained: false });
  });
});
