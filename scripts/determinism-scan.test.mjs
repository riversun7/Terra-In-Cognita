// 결정성 검사 시험 — 판정·생성 코드의 엔진 의존 API 찾기 (scripts/determinism-scan.mjs, AGENTS.md 4장)
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  blankCommentsAndStrings,
  findDeterminismViolations,
  findTestHelperImports,
} from "./determinism-scan.mjs";

/** 위반 줄 번호 */
const lines = (source) => findDeterminismViolations(source).map((violation) => violation.line);

describe("findDeterminismViolations", () => {
  it("코드의 초월함수·난수·현재 시각·거듭제곱 연산자를 잡는다", () => {
    const source = [
      "const a = Math.sin(x) + Math.cos(y);",
      "const b = Math.random();",
      "const c = Date.now();",
      "const d = new Date();",
      "const e = performance.now();",
      "const f = x ** 2;",
      "g **= 3;",
      "const h = Math.atan2(y, x) + Math.exp(x) + Math.pow(2, x) + Math.hypot(x, y);",
      "const i = crypto.getRandomValues(buffer);",
    ].join("\n");
    expect(lines(source)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("명세가 정확히 정한 Math 함수·상수는 통과한다", () => {
    const source = [
      "const a = Math.sqrt(x) + Math.floor(x) + Math.ceil(x) + Math.round(x) + Math.trunc(x);",
      "const b = Math.abs(x) + Math.min(x, y) + Math.max(x, y) + Math.sign(x) + Math.fround(x);",
      "const c = Math.imul(x, y) + Math.clz32(x) + Math.PI + Math.LOG2E;",
      "const d = a * b * c;",
    ].join("\n");
    expect(lines(source)).toEqual([]);
  });

  it("주석·문자열·템플릿 글자 안은 보지 않는다", () => {
    const source = [
      "// Math.sin 대신 detSin을 쓴다. 2 ** 3도 쓰지 않는다",
      "/* Math.random() */ const a = 1;",
      "/**",
      " * Math.atan2와 같다. ** 연산자 금지",
      " */",
      'const b = "Math.tan(x) ** 2";',
      "const c = 'Date.now() // 아님';",
      "const d = `Math.exp(1) ** ${a}`;",
      'const e = "따옴표 \\" 안 // Math.log";',
    ].join("\n");
    expect(lines(source)).toEqual([]);
  });

  it("문자열·주석 뒤에 이어지는 코드는 본다", () => {
    const source = [
      'const a = "http://example"; const b = Math.sin(x);',
      "const c = 'it\\'s'; const d = x ** 2;",
      "/* 설명 */ const e = Math.random();",
    ].join("\n");
    expect(lines(source)).toEqual([1, 2, 3]);
  });

  it("템플릿의 ${…} 안은 코드로 본다(중첩 템플릿·객체 중괄호 포함)", () => {
    const source = [
      "const a = `값 ${Math.sin(x)}`;",
      "const b = `바깥 ${`안 ${x ** 2}`} 끝`;",
      "const c = `객체 ${JSON.stringify({ k: 1 })} 그리고 Math.cos 글자`;",
      "const d = `http://${host}/${Math.exp(1)}`;",
    ].join("\n");
    expect(lines(source)).toEqual([1, 2, 4]);
  });

  it("여러 줄 주석·템플릿 뒤에도 줄 번호가 맞다", () => {
    const source = [
      "/*",
      " Math.sin",
      "*/",
      "const a = `여러",
      "줄 Math.cos",
      "템플릿`;",
      "const b = Math.tan(x);",
    ].join("\n");
    expect(lines(source)).toEqual([7]);
    expect(blankCommentsAndStrings(source).split("\n")).toHaveLength(7);
  });

  it("Math를 통째로 넘기거나 계산된 이름으로 읽으면 잡는다(검사를 피할 수 있다)", () => {
    const source = [
      "const { sin } = Math;",
      "const m = Math;",
      'const s = Math["sin"](x);',
      "call(Math);",
      "const n = Math.floor(x);",
    ].join("\n");
    expect(lines(source)).toEqual([1, 2, 3, 4]);
  });

  it("실제 detMath.ts·rng.ts는 통과하고, det 함수 하나를 엔진 Math로 바꾸면 잡는다", () => {
    const detMath = readFileSync(new URL("../packages/shared/src/detMath.ts", import.meta.url), "utf8");
    const rng = readFileSync(new URL("../packages/shared/src/rng.ts", import.meta.url), "utf8");
    expect(findDeterminismViolations(detMath)).toEqual([]);
    expect(findDeterminismViolations(rng)).toEqual([]);
    for (const [name, call] of [
      ["detSin", "Math.sin(x)"],
      ["detAsin", "Math.asin(x)"],
      ["detExp", "Math.exp(x)"],
    ]) {
      const head = `export function ${name}(x: number): number {`;
      expect(detMath.includes(head), name).toBe(true);
      const swapped = detMath.replace(head, `${head}\n  return ${call};`);
      expect(findDeterminismViolations(swapped).map((violation) => violation.reason)).toEqual([
        expect.stringContaining("초월함수"),
      ]);
    }
  });
});

describe("findTestHelperImports", () => {
  it("판정·생성 코드가 시험 도우미(test + 대문자로 시작하는 파일)를 가져오면 잡는다", () => {
    const source = [
      'import { TEST_BIOMES } from "./testFixtures.ts";',
      'export { fieldMetrics } from "../generator/testVariety.ts";',
      'const unit = await import("./testVarietyUnit.ts");',
      "import {",
      "  a,",
      '} from "./testOracle.ts";',
      'import { buildGrid } from "./grid.ts";',
      '// import { x } from "./testFixtures.ts";',
      'import { testing } from "./testing.ts";',
      'const note = "from ./testFixtures.ts";',
    ].join("\n");
    expect(findTestHelperImports(source).map((violation) => violation.line)).toEqual([1, 2, 3, 6]);
  });
});
