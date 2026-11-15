import type { BalanceTableResponse } from "@terra/shared/balance";
import {
  COMBAT_FORMULA_IDS,
  DEFAULT_COMBAT_FORMULAS,
  type FormulaListResponse,
  statFormulaKey,
} from "@terra/shared/formula";
import { describe, expect, it } from "vitest";
import { formulaLine, programText } from "../../roster/formulaLabels.ts";
import {
  EMPTY_DRAFTS,
  EXCLUDED_STAT_ID,
  buildSavePayload,
  buildTargetCatalog,
  compilePrograms,
  computeChartBundle,
  revertTargetDrafts,
  statRowModeOf,
  targetFormulaSourceOf,
  targetLineUnit,
  targetProgram,
} from "./secondaryStatsModel.ts";

const makeTable = (): BalanceTableResponse => ({
  contentVersion: "1",
  revision: 3,
  weapons: [],
  defaults: {
    primaries: { str: 10, vit: 10, int: 10, wis: 10, dex: 10, agi: 10 },
    weapon: "unarmed",
    count: 1,
    runs: 10,
    seed: 1,
    limitSec: 60,
  },
  rows: [
    {
      id: "hp",
      name: { ko: "생명력", en: "HP" },
      shape: "quantity",
      formula: null,
      cells: [
        { field: "str", pack: 2000, value: 2000, override: null },
        { field: "dex", pack: 0, value: 0, override: null },
        { field: "agi", pack: 0, value: 0, override: null },
        { field: "vit", pack: 5000, value: 5000, override: null },
        { field: "int", pack: 0, value: 0, override: null },
        { field: "wis", pack: 0, value: 0, override: null },
        { field: "base", pack: 50, value: 50, override: null },
      ],
    },
    {
      id: "defense_rate",
      name: { ko: "방어율", en: "Defense Rate" },
      shape: "probability",
      formula: null,
      cells: [
        { field: "str", pack: 0, value: 0, override: null },
        { field: "dex", pack: 0, value: 0, override: null },
        { field: "agi", pack: 0, value: 0, override: null },
        { field: "vit", pack: 1000, value: 1000, override: null },
        { field: "int", pack: 0, value: 0, override: null },
        { field: "wis", pack: 0, value: 0, override: null },
        { field: "cap", pack: 700, value: 700, override: null },
        { field: "half", pack: 100, value: 100, override: null },
      ],
    },
    {
      id: EXCLUDED_STAT_ID,
      name: { ko: "이동 속도", en: "Walk Speed" },
      shape: "quantity",
      formula: null,
      cells: [{ field: "agi", pack: 1000, value: 1000, override: null }],
    },
  ],
});

const makeFormulas = (): FormulaListResponse => ({
  contentVersion: "1",
  revision: 3,
  samples: [{ id: "new_lv1", primaries: [10, 10, 10, 10, 10, 10], level: 1 }],
  weapons: [
    {
      id: "natural_human",
      name: { ko: "맨손", en: "Unarmed" },
      natural: "human",
      kind: "physical",
      attack: 0,
      appropriate: {},
      hitPm: 1000,
      critPm: 50,
      intervalMs: 2000,
      staminaCost: 10,
      unarmed: true,
    },
  ],
  coefficients: {
    capPm: 1000,
    critSpreadPm: 200,
    staminaWeightsPm: [0, 0, 700, 300, 0, 0],
    staminaMinPm: 200,
    evadeRelative: {
      favorSlopePm: 150,
      favorCapPm: 300,
      unfavorSlopePm: 200,
      unfavorCapPm: 400,
    },
  },
  growth: { growthPm: 100, kMinPm: 800, kMaxPm: 1200, maxLevel: 50 },
  slots: [
    {
      key: "hp.formula",
      group: "stat",
      name: { ko: "생명력", en: "HP" },
      row: { id: "hp", shape: "quantity" },
      packSource: "50 + STR * 2 + VIT * 5 + GEAR + BUFF",
      source: "50 + STR * 2 + VIT * 5 + GEAR + BUFF",
      generated: true,
      override: null,
    },
    {
      key: "defense_rate.formula",
      group: "stat",
      name: { ko: "방어율", en: "Defense Rate" },
      row: { id: "defense_rate", shape: "probability" },
      packSource: "curve(floor(VIT) + GEAR, 700, 100)",
      source: "curve(floor(VIT) + GEAR, 700, 100)",
      generated: true,
      override: null,
    },
    ...COMBAT_FORMULA_IDS.map((id) => ({
      key: id,
      group: "combat" as const,
      name: { ko: id, en: id },
      row: null,
      packSource: DEFAULT_COMBAT_FORMULAS[id],
      source: DEFAULT_COMBAT_FORMULAS[id],
      generated: false,
      override: null,
    })),
  ],
});

describe("secondaryStatsModel", () => {
  it("목록에서 walk_speed를 제외하고 2차 스탯 + 파생 전투식을 묶는다", () => {
    const catalog = buildTargetCatalog(makeTable(), makeFormulas());
    expect(catalog.some((e) => e.key === "walk_speed")).toBe(false);
    expect(catalog.some((e) => e.key === "hp" && e.category === "vitals")).toBe(true);
    expect(catalog.some((e) => e.key === "defense_rate" && e.category === "defense")).toBe(true);
    expect(catalog.some((e) => e.key === "combat:real_attack" && e.category === "combat")).toBe(true);
  });

  it("가중치·커스텀 수식 전환과 저장 페이로드·되돌리기가 정확히 동작한다", () => {
    const table = makeTable();
    const formulas = makeFormulas();
    const catalog = buildTargetCatalog(table, formulas);
    const hpTarget = catalog.find((e) => e.key === "hp");
    if (!hpTarget || hpTarget.kind !== "stat") throw new Error("missing hp");

    expect(statRowModeOf(hpTarget.row, hpTarget.slot, EMPTY_DRAFTS.formulaDrafts)).toBe("weights");
    expect(targetFormulaSourceOf(hpTarget, EMPTY_DRAFTS)).toContain("VIT * 5");

    const drafts = {
      cellDrafts: new Map([["hp.vit", 7000]]),
      formulaDrafts: new Map([[statFormulaKey("hp"), "100 + VIT * 10 + GEAR + BUFF"]]),
    };
    expect(statRowModeOf(hpTarget.row, hpTarget.slot, drafts.formulaDrafts)).toBe("world_formula");

    const programs = compilePrograms(table, formulas, drafts, true);
    expect(programs.rows.find((r) => r.id === "hp")).toBeDefined();

    const payload = buildSavePayload(drafts);
    expect(payload.totalCount).toBe(2);
    expect(payload.changes).toEqual([{ id: "hp.vit", value: 7000 }]);
    expect(payload.formulas).toEqual([{ id: "hp.formula", source: "100 + VIT * 10 + GEAR + BUFF" }]);

    const reverted = revertTargetDrafts(hpTarget, drafts);
    expect(reverted.cellDrafts.size).toBe(0);
    expect(reverted.formulaDrafts.size).toBe(0);
  });

  it("4종 차트와 확률 체감 곡선 데이터를 생성한다", () => {
    const table = makeTable();
    const formulas = makeFormulas();
    const catalog = buildTargetCatalog(table, formulas);
    const defTarget = catalog.find((e) => e.key === "defense_rate");
    if (!defTarget) throw new Error("missing defense_rate");

    const bundle = computeChartBundle(defTarget, table, formulas, EMPTY_DRAFTS, {
      archetype: "physical",
      customWeights: { str: 10, vit: 10, int: 10, wis: 10, dex: 10, agi: 10 },
      showCustomInCurves: true,
      initialSum: 80,
      maxLevel: 30,
      focusLevel: 15,
      growthPm: 100,
      kPm: 1000,
      showBaseline: true,
      weaponId: "natural_human",
    });

    expect(bundle.influence.items).toHaveLength(6);
    // custom 포함 5개 계열
    expect(bundle.curves).toHaveLength(5);
    expect(bundle.kBand).toHaveLength(30);
    expect(bundle.probabilityCurve).not.toBeNull();
    expect(bundle.probabilityMarker?.cap).toBe(700);
    expect(bundle.matrix.length).toBe(2);
  });

  it("식 글은 그래프 값을 낸 담은 식에서 나오고, 1:1 식은 분포가 기울어도 가중치가 같다(D-556)", () => {
    const table = makeTable();
    const formulas = makeFormulas();
    const catalog = buildTargetCatalog(table, formulas);
    const crit = catalog.find((e) => e.key === "combat:bare_crit");
    const hp = catalog.find((e) => e.key === "hp");
    if (!crit || crit.kind !== "combat" || !hp) throw new Error("missing target");
    const config = {
      archetype: "talent" as const,
      customWeights: { str: 10, vit: 10, int: 10, wis: 10, dex: 10, agi: 10 },
      showCustomInCurves: false,
      initialSum: 60,
      maxLevel: 60,
      focusLevel: 60,
      growthPm: 100,
      kPm: 1000,
      showBaseline: false,
      weaponId: "natural_human",
    };
    const bundle = computeChartBundle(crit, table, formulas, EMPTY_DRAFTS, config);
    const program = targetProgram(crit.key, bundle.programs);
    if (!program) throw new Error("missing program");
    const text = programText(program, crit.formulaId);
    expect(formulaLine("크리 확률", text, targetLineUnit(crit))).toBe("크리 확률 = AGI + DEX (‰)");
    expect(text.floored).toEqual(["AGI", "DEX"]);
    const of = (stat: string) => bundle.influence.items.find((item) => item.stat === stat);
    // 재능계: DEX가 더 자라 기여 몫은 DEX가 크지만, 식의 가중치(1차가 모두 같을 때 +10)는 같다
    expect(of("dex")?.sharePm ?? 0).toBeGreaterThan(of("agi")?.sharePm ?? 0);
    expect(of("dex")?.equalPlus10).toBe(10_000);
    expect(of("agi")?.equalPlus10).toBe(10_000);
    expect(of("str")?.equalPlus10).toBe(0);

    // 담은 행 식이 바로 글이 된다(값과 같은 식)
    const drafts = {
      cellDrafts: new Map<string, number>(),
      formulaDrafts: new Map([[statFormulaKey("hp"), "100 + VIT * 10 + GEAR + BUFF # 설명"]]),
    };
    const hpBundle = computeChartBundle(hp, table, formulas, drafts, config);
    const hpProgram = targetProgram("hp", hpBundle.programs);
    if (!hpProgram) throw new Error("missing hp program");
    const hpText = formulaLine("HP", programText(hpProgram, null));
    expect(hpText).toMatch(/^HP = 100 \+ VIT × 10 \+ \S+ \+ \S+$/);
    expect(hpText).not.toContain("#");
  });
});
