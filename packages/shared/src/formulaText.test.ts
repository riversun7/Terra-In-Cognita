// 식을 글로 풀기(D-556) 시험 — 쓰는 식 꼴(가중치 행 양·확률, 전투 기본 식 전부, 지역 이름·비교·함수)마다 글이 맞는지,
// plain 글을 다시 읽으면 같은 값이 나오는지(글과 값이 어긋나지 않음)를 본다.
import { describe, expect, it } from "vitest";
import {
  COMBAT_FORMULA_IDS,
  COMBAT_FORMULA_SLOTS,
  DEFAULT_COMBAT_FORMULAS,
  type FormulaProgram,
  STAT_FORMULA_VARS,
  evaluateFormula,
  formulaSourceText,
  formulaText,
  formulaTextLine,
  parseFormula,
  slotVarNames,
  statRowExpression,
  statRowShapeText,
} from "./formula.ts";

const STAT_VARS = STAT_FORMULA_VARS.map((item) => item.name);
const PRIMARIES = ["STR", "DEX", "AGI", "VIT", "INT", "WIS"];

function program(source: string, allowed: readonly string[] = STAT_VARS): FormulaProgram {
  const result = parseFormula(source, allowed);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.program;
}

const line = (source: string, allowed: readonly string[] = STAT_VARS, nonNegative = PRIMARIES) =>
  formulaTextLine(formulaText(program(source, allowed), { nonNegative }));

describe("식 → 글", () => {
  it("맨손 크리 기본 식은 AGI + DEX(max(0, X)를 줄이고 줄인 이름을 적는다, 설명 줄은 빠진다)", () => {
    const allowed = slotVarNames(COMBAT_FORMULA_SLOTS.bare_crit);
    expect(line(DEFAULT_COMBAT_FORMULAS.bare_crit, allowed)).toBe("AGI + DEX");
    expect(
      formulaText(program(DEFAULT_COMBAT_FORMULAS.bare_crit, allowed), { nonNegative: PRIMARIES }).floored,
    ).toEqual(["AGI", "DEX"]);
    // 적지 않은 변수는 줄이지 않는다
    expect(line(DEFAULT_COMBAT_FORMULAS.bare_crit, allowed, [])).toBe("max(0, AGI) + max(0, DEX)");
  });

  it("가중치 행(양): 기본 + 1차 × 배 + 장비 + 버프, 이름표를 붙인다", () => {
    const source = statRowExpression({ shape: "quantity", base: 100, weights: [0, 0, 0, 10_000, 0, 1500] });
    const text = statRowShapeText(
      { shape: "quantity", base: 100, weights: [0, 0, 0, 10_000, 0, 1500] },
      STAT_VARS,
      { varLabel: (name) => (name === "GEAR" ? "장비" : name === "BUFF" ? "버프" : name) },
    );
    expect(source).toBe("100 + VIT * 10 + WIS * 1.5 + GEAR + BUFF");
    expect(text && formulaTextLine(text, "HP")).toBe("HP = 100 + VIT × 10 + WIS × 1.5 + 장비 + 버프");
  });

  it("가중치 행(확률): curve(⌊Σ⌋ + GEAR, 상한, 반감), 함수 이름표", () => {
    const text = statRowShapeText(
      { shape: "probability", cap: 300, halfConstant: 200, weights: [0, 0, 600, 0, 0, 0] },
      STAT_VARS,
      { fnLabel: (fn) => (fn === "curve" ? "확률곡선" : fn) },
    );
    expect(text && formulaTextLine(text)).toBe("확률곡선(⌊AGI × 0.6⌋ + GEAR, 300, 200)");
  });

  it("괄호는 셈 차례를 지킨다(낮은 차례·같은 차례 오른쪽)", () => {
    expect(line("(STR + DEX) * AGI")).toBe("(STR + DEX) × AGI");
    expect(line("STR + DEX * AGI")).toBe("STR + DEX × AGI");
    expect(line("STR - (DEX - AGI)")).toBe("STR − (DEX − AGI)");
    expect(line("STR - DEX - AGI")).toBe("STR − DEX − AGI");
    expect(line("STR / (DEX * AGI)")).toBe("STR ÷ (DEX × AGI)");
    expect(line("STR * DEX / AGI")).toBe("STR × DEX ÷ AGI");
    expect(line("-(STR + DEX)")).toBe("−(STR + DEX)");
    expect(line("-STR * 2")).toBe("−STR × 2");
    expect(line("STR + DEX >= AGI * 2")).toBe("STR + DEX ≥ AGI × 2");
  });

  it("비교·함수 꼴", () => {
    expect(line("if(STR <= 0, 1, 2) + if(STR != DEX, 3, 4) + if(STR == DEX, 5, 6)")).toBe(
      "if(STR ≤ 0, 1, 2) + if(STR ≠ DEX, 3, 4) + if(STR = DEX, 5, 6)",
    );
    expect(line("floor(STR * 1.5) + ceil(DEX / 3) + abs(AGI - 10)")).toBe(
      "⌊STR × 1.5⌋ + ⌈DEX ÷ 3⌉ + |AGI − 10|",
    );
    expect(line("round(STR) + trunc(DEX) + min(STR, DEX, AGI) + clamp(VIT, 1, 10) + lerp(1, 2, 0.5)")).toBe(
      "round(STR) + trunc(DEX) + min(STR, DEX, AGI) + clamp(VIT, 1, 10) + lerp(1, 2, 0.5)",
    );
    expect(line("max(1, AGI) + max(AGI, 0) + max(0, LV)")).toBe("max(1, AGI) + AGI + max(0, LV)");
  });

  it("지역 이름(중간값) 줄과 결과 이름", () => {
    const allowed = slotVarNames(COMBAT_FORMULA_SLOTS.bare_interval);
    const text = formulaText(program(DEFAULT_COMBAT_FORMULAS.bare_interval, allowed), {
      nonNegative: PRIMARIES,
      varLabel: (name) => (name === "LV" ? "레벨" : name),
    });
    expect(text.lets).toEqual([
      { name: "base", text: "10 × (1 + 0.1 × (레벨 − 1))" },
      { name: "r", text: "max(1, AGI) ÷ base" },
    ]);
    expect(formulaTextLine(text, "공격 간격")).toBe(
      "base = 10 × (1 + 0.1 × (레벨 − 1)); r = max(1, AGI) ÷ base; 공격 간격 = min(5000, max(250, ⌊2000 ÷ (r × r)⌋))",
    );
  });

  it("읽히지 않는 식은 null", () => {
    expect(formulaSourceText("STR +", STAT_VARS)).toBeNull();
    expect(formulaSourceText("NOPE", STAT_VARS)).toBeNull();
  });

  it("전투 기본 식은 모두 글이 되고 설명(#)은 없다", () => {
    for (const id of COMBAT_FORMULA_IDS) {
      const text = formulaSourceText(DEFAULT_COMBAT_FORMULAS[id], slotVarNames(COMBAT_FORMULA_SLOTS[id]));
      expect(text, id).not.toBeNull();
      expect(text && formulaTextLine(text), id).not.toContain("#");
    }
  });
});

/** 시험용 결정적 난수(선형 합동) */
function lcg(seed: number) {
  let state = seed >>> 0;
  return (max: number): number => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state % max;
  };
}

describe("plain 글을 다시 읽으면 같은 값(글과 값이 어긋나지 않음)", () => {
  const cases: { readonly id: string; readonly source: string; readonly allowed: readonly string[] }[] = [
    ...COMBAT_FORMULA_IDS.map((id) => ({
      id,
      source: DEFAULT_COMBAT_FORMULAS[id],
      allowed: slotVarNames(COMBAT_FORMULA_SLOTS[id]),
    })),
    {
      id: "quantity",
      source: statRowExpression({ shape: "quantity", base: 50, weights: [1500, -200, 0, 3000, 0, 1250] }),
      allowed: STAT_VARS,
    },
    {
      id: "probability",
      source: statRowExpression({
        shape: "probability",
        cap: 450,
        halfConstant: 180,
        weights: [0, 500, 700, 0, 0, 0],
      }),
      allowed: STAT_VARS,
    },
    { id: "order", source: "STR - (DEX - AGI) * 2 / (VIT / 3) - -INT", allowed: STAT_VARS },
    {
      id: "compare",
      source: "if(STR + 1 >= DEX * 2, STR == DEX, STR != AGI) + (VIT < 3)",
      allowed: STAT_VARS,
    },
  ];
  for (const item of cases) {
    it(item.id, () => {
      const original = program(item.source, item.allowed);
      const text = formulaTextLine(formulaText(original, { plain: true }));
      const again = program(text, item.allowed);
      const next = lcg(item.id.length * 7919);
      for (let round = 0; round < 200; round++) {
        const scope = Object.fromEntries(item.allowed.map((name) => [name, next(400_000) - 50_000]));
        expect(evaluateFormula(again, scope), `${item.id} ${text}`).toBe(evaluateFormula(original, scope));
      }
    });
  }
});
