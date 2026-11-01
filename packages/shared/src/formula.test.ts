import { describe, expect, it } from "vitest";
import {
  COMBAT_FORMULA_IDS,
  COMBAT_FORMULA_SLOTS,
  DEFAULT_COMBAT_FORMULAS,
  FORMULA_MAX_LENGTH,
  STAT_FORMULA_VARS,
  evaluateFormula,
  evaluateFormulaChecked,
  evaluateFormulaInt,
  explainFormula,
  floorDiv,
  fxDiv,
  fxFormat,
  fxMul,
  parseFormula,
  primaryInfluence,
  slotVarNames,
  statRowExpression,
  statRowScope,
  suggestName,
} from "./formula.ts";

const VARS = STAT_FORMULA_VARS.map((item) => item.name);

function program(source: string, allowed: readonly string[] = VARS) {
  const result = parseFormula(source, allowed);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.program;
}

const scope = (values: Record<string, number>) =>
  Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value * 1000]));

/** 읽기 오류 코드 목록 */
const codes = (source: string) => {
  const result = parseFormula(source, VARS);
  return result.ok ? [] : result.errors.map((error) => error.code);
};

/** 정수 변수로 식 값 */
const value = (source: string, values: Record<string, number> = {}) =>
  evaluateFormula(program(source), scope(values));

describe("고정 소수점 셈", () => {
  it("곱·나눗셈은 음의 무한대 쪽으로 내린다", () => {
    expect(fxMul(1500, 333)).toBe(499); // 1.5 × 0.333 = 0.4995 → 0.499
    expect(fxMul(-1500, 333)).toBe(-500); // −0.4995 → −0.5
    expect(fxDiv(1000, 3000)).toBe(333);
    expect(fxDiv(-1000, 3000)).toBe(-334);
    expect(fxDiv(5, 0)).toBeNull();
  });

  it("floorDiv는 큰 수에서도 정확하다", () => {
    for (const p of [
      9_007_199_254_740_991, -9_007_199_254_740_991, 8_999_999_999_999_999, 123_456_789_012_345,
    ])
      for (const d of [1000, 7, -3, 10_000])
        expect(BigInt(floorDiv(p, d))).toBe(
          (() => {
            const big = BigInt(p) / BigInt(d);
            return BigInt(p) % BigInt(d) !== 0n && p < 0 !== d < 0 ? big - 1n : big;
          })(),
        );
  });

  it("곱이 안전 정수를 넘으면 BigInt로 셈하고 자른다", () => {
    expect(fxMul(4_000_000_000_000, 4_000_000_000)).toBe(Number.MAX_SAFE_INTEGER);
    expect(fxMul(3_000_000_000_000, 2_000_000)).toBe(6_000_000_000_000_000);
  });

  it("보이기 글", () => {
    expect(fxFormat(1500)).toBe("1.5");
    expect(fxFormat(-250)).toBe("-0.25");
    expect(fxFormat(3000)).toBe("3");
    expect(fxFormat(1)).toBe("0.001");
  });
});

describe("식 읽기", () => {
  it("우선순위·괄호·단항", () => {
    expect(evaluateFormula(program("1 + 2 * 3"), {})).toBe(7000);
    expect(evaluateFormula(program("(1 + 2) * 3"), {})).toBe(9000);
    expect(evaluateFormula(program("-2 * -3"), {})).toBe(6000);
    expect(evaluateFormula(program("10 - 4 - 3"), {})).toBe(3000);
    expect(evaluateFormula(program("2 < 3"), {})).toBe(1000);
    expect(evaluateFormula(program("2 >= 3"), {})).toBe(0);
  });

  it("문서 기호(× ÷ −)와 설명을 받는다", () => {
    expect(evaluateFormula(program("VIT × 3 − STR ÷ 2 # 설명"), scope({ VIT: 10, STR: 4 }))).toBe(28_000);
  });

  it("지역 이름은 앞에서 만든 것만, 마지막 줄이 결과", () => {
    const p = program("half = STR / 2\nhalf + 1");
    expect(evaluateFormula(p, scope({ STR: 9 }))).toBe(5500);
    const bad = parseFormula("x + 1\nx = 2", VARS);
    expect(bad.ok).toBe(false);
  });

  it("모르는 이름은 위치와 비슷한 이름을 알린다(오타 막기)", () => {
    const result = parseFormula("STR * 2 + DXE", VARS);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([{ code: "unknown_name", s: 10, e: 13, name: "DXE", suggestion: "DEX" }]);
    const lower = parseFormula("str", VARS);
    expect(!lower.ok && lower.errors[0]?.suggestion).toBe("STR");
  });

  it("이름 오류는 모두 모은다", () => {
    const result = parseFormula("STRR + VITT + flor(2)", VARS);
    expect(!result.ok && result.errors.map((error) => [error.code, error.suggestion])).toEqual([
      ["unknown_name", "STR"],
      ["unknown_name", "VIT"],
      ["unknown_function", "floor"],
    ]);
  });

  it("문법 오류는 처음 하나와 위치", () => {
    const cases: [string, string, number][] = [
      ["", "empty", 0],
      ["STR *", "unexpected_end", 5],
      ["(STR + 1", "expected_close_paren", 8],
      ["STR + 0.1234", "too_many_decimals", 6],
      ["STR $ 2", "unexpected_char", 4],
      ["3STR", "unexpected_char", 1],
      ["1 < 2 < 3", "chained_comparison", 6],
      ["a = 1", "missing_result", 5],
      ["STR 2", "unexpected_token", 4],
    ];
    for (const [source, code, at] of cases) {
      const result = parseFormula(source, VARS);
      expect(result.ok, source).toBe(false);
      if (!result.ok) expect([result.errors[0]?.code, result.errors[0]?.s], source).toEqual([code, at]);
    }
  });

  it("함수 인자 수·변수를 함수처럼·함수를 이름처럼·지역 이름 겹침", () => {
    expect(codes("clamp(1, 2)")).toEqual(["arity"]);
    expect(codes("STR(2)")).toEqual(["not_a_function"]);
    expect(codes("floor + 1")).toEqual(["function_needs_call"]);
    expect(codes("STR = 2\nSTR")).toEqual(["local_shadows"]);
    expect(codes("a = 1\na = 2\na")).toEqual(["local_redefined"]);
  });

  it("쓰지 않은 지역 이름은 경고만", () => {
    const result = parseFormula("unused = 1\nSTR", VARS);
    expect(result.ok).toBe(true);
    expect(result.warnings.map((warning) => warning.code)).toEqual(["unused_local"]);
  });

  it("길이·깊이 상한", () => {
    const long = parseFormula("1+".repeat(FORMULA_MAX_LENGTH), VARS);
    expect(!long.ok && long.errors[0]?.code).toBe("too_long");
    const deep = parseFormula(`${"(".repeat(60)}1${")".repeat(60)}`, VARS);
    expect(!deep.ok && deep.errors[0]?.code).toBe("too_deep");
  });

  it("쓴 칸 변수를 차례대로 모은다", () => {
    expect(program("WIS + STR * 2 + STR").vars).toEqual(["STR", "WIS"]);
  });
});

describe("함수", () => {
  it("min·max·floor·ceil·round·trunc·abs·clamp·if·curve·lerp", () => {
    expect(value("min(3, 1, 2)")).toBe(1000);
    expect(value("max(3, 1, 2)")).toBe(3000);
    expect(value("floor(-1.5)")).toBe(-2000);
    expect(value("ceil(-1.5)")).toBe(-1000);
    expect(value("round(2.5)")).toBe(3000);
    expect(value("round(-2.5)")).toBe(-2000);
    expect(value("trunc(-1.7)")).toBe(-1000);
    expect(value("abs(-4)")).toBe(4000);
    expect(value("clamp(15, 0, 10)")).toBe(10_000);
    expect(value("if(STR > 5, 1, 2)", { STR: 6 })).toBe(1000);
    expect(value("curve(100, 700, 100)")).toBe(350_000);
    expect(value("curve(-5, 700, 100)")).toBe(0);
    expect(value("lerp(10, 20, 0.25)")).toBe(12_500);
  });

  it("if는 고른 쪽만 셈한다(0으로 나눔이 없다)", () => {
    const checked = evaluateFormulaChecked(program("if(STR > 0, 10 / STR, 0)"), scope({ STR: 0 }));
    expect(checked).toEqual({ value: 0, divZero: false });
  });

  it("0으로 나누면 0이고 알린다(던지지 않는다)", () => {
    expect(evaluateFormulaChecked(program("STR / DEX"), scope({ STR: 5, DEX: 0 }))).toEqual({
      value: 0,
      divZero: true,
    });
  });

  it("정수 결과는 내림", () => {
    expect(evaluateFormulaInt(program("STR * 1.5"), scope({ STR: 7 }))).toBe(10);
    expect(evaluateFormulaInt(program("-STR * 1.5"), scope({ STR: 7 }))).toBe(-11);
  });
});

describe("풀이·영향", () => {
  it("항마다 값을 붙인 글", () => {
    const p = program("VIT * 3 + STR * 1.5 - 2");
    const explained = explainFormula(p, scope({ VIT: 10, STR: 10 }));
    expect(explained.value).toBe(43_000);
    expect(explained.terms).toEqual([
      { sign: 1, text: "VIT(10) × 3", value: 30_000 },
      { sign: 1, text: "STR(10) × 1.5", value: 15_000 },
      { sign: -1, text: "2", value: 2000 },
    ]);
  });

  it("감싼 내림 안의 항과 지역 이름", () => {
    const p = program("r = DEX / 2\nfloor(STR + r)");
    const explained = explainFormula(p, scope({ STR: 3, DEX: 5 }));
    expect(explained.wrappers).toEqual(["floor"]);
    expect(explained.lets).toEqual([{ name: "r", text: "DEX(5) ÷ 2", value: 2500 }]);
    expect(explained.terms.map((term) => term.text)).toEqual(["STR(3)", "r(2.5)"]);
    expect(explained.value).toBe(5000);
  });

  it("선형 식의 영향 = 항 값, 비중 합 ≈ 1000‰, +10 차이", () => {
    const p = program("VIT * 3 + STR * 1");
    const names = ["STR", "DEX", "AGI", "VIT", "INT", "WIS"];
    const influence = primaryInfluence(
      (primaries) =>
        evaluateFormula(p, scope(Object.fromEntries(names.map((name, i) => [name, primaries[i] ?? 0])))),
      [10, 10, 10, 10, 10, 10],
    );
    expect(influence.contribution).toEqual([10_000, 0, 0, 30_000, 0, 0]);
    expect(influence.sharePm).toEqual([250, 0, 0, 750, 0, 0]);
    expect(influence.plus10).toEqual([10_000, 0, 0, 30_000, 0, 0]);
  });
});

describe("식 칸", () => {
  it("전투 기본 식은 모두 그 칸의 변수로 읽힌다", () => {
    for (const id of COMBAT_FORMULA_IDS) {
      const result = parseFormula(DEFAULT_COMBAT_FORMULAS[id], slotVarNames(COMBAT_FORMULA_SLOTS[id]));
      expect(result.ok, id).toBe(true);
      expect(result.warnings, id).toEqual([]);
    }
  });

  it("가중치 행 → 식 글", () => {
    expect(
      statRowExpression({ shape: "quantity", base: 0, weights: [1500, 1000, 1500, 3000, 1000, 1200] }),
    ).toBe("STR * 1.5 + DEX + AGI * 1.5 + VIT * 3 + INT + WIS * 1.2 + GEAR + BUFF");
    expect(statRowExpression({ shape: "quantity", base: 1500, weights: [0, 10_000, 0, 0, 0, 0] })).toBe(
      "1500 + DEX * 10 + GEAR + BUFF",
    );
    expect(statRowExpression({ shape: "quantity", base: -5, weights: [-500, 0, 0, 0, 0, 0] })).toBe(
      "-5 - STR * 0.5 + GEAR + BUFF",
    );
    expect(
      statRowExpression({
        shape: "probability",
        cap: 700,
        halfConstant: 100,
        weights: [600, 0, 0, 1200, 0, 0],
      }),
    ).toBe("curve(floor(STR * 0.6 + VIT * 1.2) + GEAR, 700, 100)");
  });

  it("행 식은 가중치 계산과 같다(무작위)", () => {
    let seed = 7;
    const next = (n: number) => {
      seed = (Math.imul(seed, 1_103_515_245) + 12_345) >>> 0;
      return seed % n;
    };
    for (let round = 0; round < 500; round++) {
      const weights = Array.from({ length: 6 }, () => (next(3) === 0 ? 0 : next(20_000) - 5000));
      const primaries = Array.from({ length: 6 }, () => next(5000));
      const gear = next(200) - 50;
      const buff = next(100) - 20;
      const base = next(3000) - 1000;
      const weighted = primaries.reduce((sum, point, i) => sum + point * (weights[i] ?? 0), 0);
      const quantity = program(statRowExpression({ shape: "quantity", base, weights }));
      expect(evaluateFormulaInt(quantity, statRowScope(primaries, 1, gear, buff))).toBe(
        base + Math.floor(weighted / 1000) + gear + buff,
      );
      const cap = next(1001);
      const half = 1 + next(500);
      const probability = program(
        statRowExpression({ shape: "probability", cap, halfConstant: half, weights }),
      );
      const score = Math.floor(weighted / 1000) + gear;
      expect(evaluateFormulaInt(probability, statRowScope(primaries, 1, gear, buff))).toBe(
        score <= 0 ? 0 : Math.floor((cap * score) / (score + half)),
      );
    }
  });

  it("비슷한 이름 권함", () => {
    expect(suggestName("dex", ["STR", "DEX"])).toBe("DEX");
    expect(suggestName("STRR", ["STR", "DEX"])).toBe("STR");
    expect(suggestName("QQQQ", ["STR", "DEX"])).toBeUndefined();
  });
});
