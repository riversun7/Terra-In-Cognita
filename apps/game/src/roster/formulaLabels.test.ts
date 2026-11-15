// 계산식 글 이름표(D-556) 시험 — 사이보그 판 2차 스탯 줄(가중치 행·행 식)과 전투 줄(서버가 보낸 판정 식) 글
import { DEFAULT_COMBAT_FORMULAS, parseFormula } from "@terra/shared/formula";
import { formulaText, formulaTextLine } from "@terra/shared/formulaText";
import type { RosterStatBreakdown } from "@terra/shared/roster";
import { describe, expect, it } from "vitest";
import { m } from "../paraglide/messages.js";
import {
  breakdownText,
  combatSourceText,
  formulaFloorNote,
  formulaLine,
  formulaVarLabel,
  usesCurve,
} from "./formulaLabels.ts";

const row = (patch: Partial<RosterStatBreakdown>): RosterStatBreakdown => ({
  id: "hp",
  shape: "quantity",
  base: 0,
  terms: [],
  weighted: 0,
  extra: 0,
  score: 0,
  cap: null,
  halfConstant: null,
  value: 0,
  ...patch,
});

/** 서버처럼 기본 식을 plain 글로(설명 뺌) */
const serverSource = (id: keyof typeof DEFAULT_COMBAT_FORMULAS, allowed: readonly string[]) => {
  const parsed = parseFormula(DEFAULT_COMBAT_FORMULAS[id], allowed);
  if (!parsed.ok) throw new Error(id);
  return { id, source: formulaTextLine(formulaText(parsed.program, { plain: true })) };
};

describe("사이보그 판 식 글", () => {
  it("가중치 양 행: 기본 + 1차 × 배 + 장비 + 버프(판정 차례 STR·DEX·AGI·VIT·INT·WIS)", () => {
    const text = breakdownText(
      row({
        base: 60,
        terms: [
          { stat: "vit", value: 10, weightPm: 4800, milli: 48_000 },
          { stat: "wis", value: 10, weightPm: 2400, milli: 24_000 },
        ],
      }),
    );
    if (!text) throw new Error("no text");
    expect(formulaLine("HP 회복", text)).toBe(
      `HP 회복 = 60 + VIT × 4.8 + WIS × 2.4 + ${m.formula_var_gear()} + ${m.formula_var_buff()}`,
    );
    expect(usesCurve(text)).toBe(false);
  });

  it("가중치 확률 행: 확률곡선(⌊…⌋ + 장비, 상한, 반감)", () => {
    const text = breakdownText(
      row({
        id: "evade",
        shape: "probability",
        cap: 850,
        halfConstant: 250,
        terms: [{ stat: "agi", value: 10, weightPm: 1000, milli: 10_000 }],
      }),
    );
    if (!text) throw new Error("no text");
    expect(formulaLine("회피", text, "pm")).toBe(
      `회피 = ${m.formula_fn_curve()}(⌊AGI⌋ + ${m.formula_var_gear()}, 850, 250) (‰)`,
    );
    expect(usesCurve(text)).toBe(true);
  });

  it("행 식 행은 그 식(설명 뺌), 읽히지 않으면 null", () => {
    const text = breakdownText(row({ formula: { source: "# 설명\nVIT * 3 + LV", terms: [] } }));
    expect(text && formulaLine("HP", text)).toBe(`HP = VIT × 3 + ${m.formula_var_lv()}`);
    expect(breakdownText(row({ formula: { source: "VIT +", terms: [] } }))).toBeNull();
  });

  it("맨손 크리: 서버 식 글 → 크리 확률 = AGI + DEX (‰), 0 아래면 0 한 줄", () => {
    const formula = serverSource("bare_crit", ["W", "DEX", "AGI", "A"]);
    expect(formula.source).toBe("max(0, AGI) + max(0, DEX)");
    const text = combatSourceText(formula);
    if (!text) throw new Error("no text");
    expect(formulaLine("크리 확률", text, "pm")).toBe("크리 확률 = AGI + DEX (‰)");
    expect(formulaFloorNote(text, formula.id)).toBe(m.formula_floor_note({ names: "AGI·DEX" }));
  });

  it("무기 크리·공격력: 변수 이름표(무기 크리·적정 DEX·비율 상한, 공격력은 적정 STR)", () => {
    const crit = combatSourceText(serverSource("real_crit", ["W", "DEX", "A", "CAP"]));
    if (!crit) throw new Error("no text");
    const w = m.formula_var_weapon_crit();
    const a = m.formula_var_appropriate({ stat: "DEX" });
    expect(crit.body).toBe(`if(${a} ≤ 0, ${w}, ⌊${w} × min(${m.formula_var_ratio_cap()}, DEX ÷ ${a})⌋)`);
    expect(formulaVarLabel("A", "real_attack", "int")).toBe(m.formula_var_appropriate({ stat: "INT" }));
    expect(formulaVarLabel("P", "real_attack", "str")).toBe("STR");
    // 개발자 화면의 다른 식 변수는 이름 그대로
    expect(formulaVarLabel("FAVOR_CAP", "evade_chance")).toBe("FAVOR_CAP");
  });

  it("옛 서버(식 없음)·모르는 식 ID는 null", () => {
    expect(combatSourceText(undefined)).toBeNull();
    expect(combatSourceText({ id: "nope", source: "1" })).toBeNull();
  });
});
