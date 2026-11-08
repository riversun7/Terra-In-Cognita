// 계산식 끌어 넣기·눌러 넣기 모델 시험(docs/adr/2026-11-01-formula-editor.md "바뀜 (2026-11-08 끌어 넣기)")
import {
  COMBAT_FORMULA_IDS,
  COMBAT_FORMULA_SLOTS,
  FORMULA_FUNCTION_NAMES,
  parseFormula,
  slotVarNames,
  statFormulaSlot,
  suggestName,
} from "@terra/shared/formula";
import { describe, expect, it } from "vitest";
import {
  FUNCTION_PLACEHOLDERS,
  droppedToken,
  type PaletteToken,
  insertToken,
  offsetAtPoint,
  paletteOf,
  tokenLabel,
} from "./formulaInsert.ts";

const v = (name: string): PaletteToken => ({ kind: "var", name });
const fn = (name: string): PaletteToken => ({ kind: "fn", name });
const op = (name: string): PaletteToken => ({ kind: "op", name });
const hp = statFormulaSlot("hp", "quantity");
const HP_VARS = slotVarNames(hp);

/** 넣은 글과 고른 글 */
const run = (source: string, start: number, end: number, token: PaletteToken) => {
  const out = insertToken(source, start, end, token, HP_VARS);
  return { text: out.source, picked: out.source.slice(out.selStart, out.selEnd), caret: out.selStart };
};

describe("칩 목록", () => {
  it("변수 → 중간값 → 함수 → 연산자, 중간값은 지금 글에서", () => {
    const tokens = paletteOf(hp, "base = STR * 2\nbase + VIT");
    const kinds = tokens.map((token) => token.kind);
    expect(kinds.indexOf("local")).toBeGreaterThan(kinds.lastIndexOf("var"));
    expect(kinds.indexOf("fn")).toBeGreaterThan(kinds.lastIndexOf("local"));
    expect(tokens.filter((token) => token.kind === "var").map((token) => token.name)).toEqual(HP_VARS);
    expect(tokens.filter((token) => token.kind === "local").map((token) => token.name)).toEqual(["base"]);
    expect(tokens.filter((token) => token.kind === "fn")).toHaveLength(FORMULA_FUNCTION_NAMES.length);
    expect(tokenLabel(fn("clamp"))).toBe("clamp()");
    expect(tokenLabel(op("("))).toBe("( )");
  });
});

describe("넣기", () => {
  it("변수: 글자 위치에, 앞뒤 낱말과 붙지 않게 빈칸", () => {
    expect(run("", 0, 0, v("STR")).text).toBe("STR");
    expect(run("VIT * 3 + ", 10, 10, v("STR")).text).toBe("VIT * 3 + STR");
    expect(run("VIT", 3, 3, v("STR")).text).toBe("VIT STR");
    expect(run("(", 1, 1, v("STR")).text).toBe("(STR");
    expect(run("* 3", 0, 0, v("VIT")).text).toBe("VIT * 3");
    expect(run("VIT*", 4, 4, v("STR")).text).toBe("VIT* STR");
    expect(run("max(VIT,)", 8, 8, v("STR")).text).toBe("max(VIT, STR)");
  });

  it("입력하던 앞부분은 그 이름으로 바꾸고, 낱말 한가운데면 낱말 끝에 넣는다", () => {
    expect(run("VIT + st", 8, 8, v("STR"))).toMatchObject({ text: "VIT + STR", caret: 9 });
    expect(run("VIT + fl", 8, 8, fn("floor")).text).toBe("VIT + floor(value)");
    expect(run("VIT + 2", 2, 2, v("STR")).text).toBe("VIT STR + 2");
  });

  it("고른 글은 바꾼다", () => {
    expect(run("VIT * 3", 0, 3, v("STR")).text).toBe("STR * 3");
  });

  it("함수: 자리표시 인자를 붙이고 첫 인자를 고른다", () => {
    expect(run("", 0, 0, fn("clamp"))).toMatchObject({ text: "clamp(value, lower, upper)", picked: "value" });
    expect(run("VIT + ", 6, 6, fn("max"))).toMatchObject({
      text: "VIT + max(first, second)",
      picked: "first",
    });
  });

  it("함수: 고른 글을 첫 인자로 감싸고 다음 인자를(없으면 괄호 뒤를) 고른다", () => {
    expect(run("STR * 1.5 + VIT", 0, 9, fn("floor"))).toMatchObject({
      text: "floor(STR * 1.5) + VIT",
      picked: "",
      caret: 16,
    });
    expect(run("STR * 2", 0, 7, fn("clamp"))).toMatchObject({
      text: "clamp(STR * 2, lower, upper)",
      picked: "lower",
    });
  });

  it("연산자: 앞뒤 빈칸을 맞추고, 괄호는 한 쌍(고른 글은 감싼다)", () => {
    expect(run("STR", 3, 3, op("*")).text).toBe("STR * ");
    expect(run("STR ", 4, 4, op("*")).text).toBe("STR * ");
    expect(run("STR VIT", 4, 4, op("+")).text).toBe("STR + VIT");
    expect(run("", 0, 0, op("("))).toMatchObject({ text: "()", caret: 1 });
    expect(run("STR + VIT * 2", 0, 9, op("(")).text).toBe("(STR + VIT) * 2");
    expect(run("max(STR", 7, 7, op(",")).text).toBe("max(STR, ");
    expect(run("STR", 3, 3, op("<=")).text).toBe("STR <= ");
  });

  it("중간값 줄: 지금 줄 앞에 이름 = 값, 고른 글은 중간값으로 뺀다, 이름은 겹치지 않게", () => {
    expect(run("STR * 2", 3, 3, op("="))).toMatchObject({ text: "temp = 0\nSTR * 2", picked: "temp" });
    expect(run("VIT + STR * 2", 6, 13, op("="))).toMatchObject({
      text: "temp = STR * 2\nVIT + temp",
      picked: "temp",
    });
    expect(run("temp = 1\ntemp + VIT", 18, 18, op("=")).picked).toBe("temp2");
    // 뺀 식은 그대로 읽힌다
    const extracted = run("VIT + STR * 2", 6, 13, op("=")).text;
    expect(parseFormula(extracted, HP_VARS).ok).toBe(true);
  });

  it("함수 자리표시는 해석기가 모르는 이름으로 막고(담기 막힘), 어떤 칸 이름과도 비슷하지 않다(고치기 권함 없음)", () => {
    const slots = [hp, ...COMBAT_FORMULA_IDS.map((id) => COMBAT_FORMULA_SLOTS[id])];
    for (const slot of slots) {
      const names = [...slotVarNames(slot), ...FORMULA_FUNCTION_NAMES];
      for (const name of FORMULA_FUNCTION_NAMES) {
        const inserted = insertToken("", 0, 0, fn(name), slotVarNames(slot)).source;
        const parsed = parseFormula(inserted, slotVarNames(slot));
        expect(parsed.ok, `${slot.id} ${inserted}`).toBe(false);
        for (const placeholder of FUNCTION_PLACEHOLDERS[name])
          expect(suggestName(placeholder, names), `${slot.id} ${placeholder}`).toBeUndefined();
      }
    }
  });

  it("자리표시를 변수로 채우면 읽힌다", () => {
    const filled = insertToken("", 0, 0, fn("clamp"), HP_VARS)
      .source.replace("value", "STR")
      .replace("lower", "0")
      .replace("upper", "100");
    expect(parseFormula(filled, HP_VARS).ok).toBe(true);
  });
});

/** 고정폭: 글자마다 10px, 한글(넓은 글자)은 20px(시험 글은 모두 BMP 글자) */
function measure(text: string): number {
  let width = 0;
  for (let index = 0; index < text.length; index += 1) width += /[가-힣]/.test(text.charAt(index)) ? 20 : 10;
  return width;
}

describe("놓은 자리", () => {
  const metrics = { lineHeight: 20, measure };

  it("줄은 줄 높이로, 칸은 가장 가까운 글자 사이로", () => {
    const source = "STR * 2\nVIT + 1";
    expect(offsetAtPoint(source, 0, 5, metrics)).toBe(0);
    expect(offsetAtPoint(source, 14, 5, metrics)).toBe(1);
    expect(offsetAtPoint(source, 16, 5, metrics)).toBe(2);
    expect(offsetAtPoint(source, 30, 25, metrics)).toBe(8 + 3);
    // 줄 끝 너머·마지막 줄 아래·위
    expect(offsetAtPoint(source, 500, 5, metrics)).toBe(7);
    expect(offsetAtPoint(source, 500, 900, metrics)).toBe(source.length);
    expect(offsetAtPoint(source, -20, -20, metrics)).toBe(0);
  });

  it("넓은 글자(한글 설명)도 그린 너비로 맞춘다", () => {
    const source = "# 힘힘 STR";
    // "# 힘힘 " = 10 + 10 + 20 + 20 + 10 = 70px → 72px은 S 앞
    expect(offsetAtPoint(source, 72, 0, metrics)).toBe(5);
  });
});

describe("끌기 자료", () => {
  it("이 칸 조각판에 있는 칩만 받는다", () => {
    const palette = paletteOf(hp, "");
    expect(droppedToken(JSON.stringify({ kind: "var", name: "STR" }), palette)).toEqual(v("STR"));
    expect(droppedToken(JSON.stringify({ kind: "var", name: "W" }), palette)).toBeNull();
    expect(droppedToken("not json", palette)).toBeNull();
    expect(droppedToken("null", palette)).toBeNull();
  });
});
