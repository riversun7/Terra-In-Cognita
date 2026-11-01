// 계산식 값 내기·풀이·1차 스탯 영향 — docs/adr/2026-11-01-formula-editor.md "값 내기"
// - evaluateFormula: 판정 코드(sim)가 부른다. 읽은 식(FormulaProgram)을 처음 한 번 함수 묶음으로 바꿔 두고(WeakMap) 다시 쓴다.
//   eval·Function은 쓰지 않는다(마디마다 닫힌 함수). 값은 모두 고정 소수점(formulaFixed.ts)이라 엔진과 무관하게 같다.
// - 지역 이름은 차례대로 한 번씩 셈한다. if는 고른 쪽만 셈한다. 0으로 나누면 0이고 divZero로 알린다(던지지 않는다).
// - 변수 값이 scope에 없으면 0이다(던지지 않는다). 부르는 쪽이 칸의 변수를 모두 넣는다(formulaSlots.test.ts가 본다).
// 결정성 검사 대상이다(scripts/check-boundaries.mjs).
import {
  FX_SCALE,
  floorDiv,
  fxAdd,
  fxCeil,
  fxClamp,
  fxDiv,
  fxFloor,
  fxFormat,
  fxMul,
  fxRound,
  fxSub,
  fxTrunc,
} from "./formulaFixed.ts";
import type { FormulaNode, FormulaProgram } from "./formulaParse.ts";

/** 변수 이름 → 고정 소수점 값(1 = 1000) */
export type FormulaScope = Readonly<Record<string, number>>;

interface Frame {
  readonly scope: FormulaScope;
  readonly locals: number[];
  divZero: boolean;
}

type Compiled = (frame: Frame) => number;

const TRUE = FX_SCALE;

function compileNode(node: FormulaNode): Compiled {
  switch (node.t) {
    case "num": {
      const raw = node.raw;
      return () => raw;
    }
    case "var": {
      const name = node.name;
      return (frame) => frame.scope[name] ?? 0;
    }
    case "local": {
      const index = node.index;
      return (frame) => frame.locals[index] ?? 0;
    }
    case "neg": {
      const x = compileNode(node.x);
      return (frame) => fxClamp(-x(frame));
    }
    case "bin": {
      const a = compileNode(node.a);
      const b = compileNode(node.b);
      switch (node.op) {
        case "+":
          return (frame) => fxAdd(a(frame), b(frame));
        case "-":
          return (frame) => fxSub(a(frame), b(frame));
        case "*":
          return (frame) => fxMul(a(frame), b(frame));
        case "/":
          return (frame) => {
            const out = fxDiv(a(frame), b(frame));
            if (out === null) {
              frame.divZero = true;
              return 0;
            }
            return out;
          };
        case "<":
          return (frame) => (a(frame) < b(frame) ? TRUE : 0);
        case "<=":
          return (frame) => (a(frame) <= b(frame) ? TRUE : 0);
        case ">":
          return (frame) => (a(frame) > b(frame) ? TRUE : 0);
        case ">=":
          return (frame) => (a(frame) >= b(frame) ? TRUE : 0);
        case "==":
          return (frame) => (a(frame) === b(frame) ? TRUE : 0);
        case "!=":
          return (frame) => (a(frame) !== b(frame) ? TRUE : 0);
      }
      throw new Error("unknown operator");
    }
    case "call": {
      const args = node.args.map(compileNode);
      const [x, y, z] = [args[0] ?? (() => 0), args[1] ?? (() => 0), args[2] ?? (() => 0)];
      switch (node.fn) {
        case "min":
          return (frame) =>
            args.reduce((best, arg, i) => (i === 0 ? arg(frame) : Math.min(best, arg(frame))), 0);
        case "max":
          return (frame) =>
            args.reduce((best, arg, i) => (i === 0 ? arg(frame) : Math.max(best, arg(frame))), 0);
        case "floor":
          return (frame) => fxFloor(x(frame));
        case "ceil":
          return (frame) => fxCeil(x(frame));
        case "round":
          return (frame) => fxRound(x(frame));
        case "trunc":
          return (frame) => fxTrunc(x(frame));
        case "abs":
          return (frame) => Math.abs(x(frame));
        case "clamp":
          return (frame) => Math.min(Math.max(x(frame), y(frame)), z(frame));
        case "if":
          return (frame) => (x(frame) !== 0 ? y(frame) : z(frame));
        case "curve":
          // 확률 모양(48 §3.1): 점수 ≤ 0이면 0, 아니면 상한 × 점수 ÷ (점수 + 반감)
          return (frame) => {
            const score = x(frame);
            if (score <= 0) return 0;
            const out = fxDiv(fxMul(y(frame), score), fxAdd(score, z(frame)));
            if (out === null) {
              frame.divZero = true;
              return 0;
            }
            return out;
          };
        case "lerp":
          return (frame) => {
            const from = x(frame);
            return fxAdd(from, fxMul(fxSub(y(frame), from), z(frame)));
          };
      }
      throw new Error("unknown function");
    }
  }
  throw new Error("unknown node");
}

interface CompiledProgram {
  readonly lets: readonly Compiled[];
  readonly body: Compiled;
}

const cache = new WeakMap<FormulaProgram, CompiledProgram>();

function compiled(program: FormulaProgram): CompiledProgram {
  let entry = cache.get(program);
  if (!entry) {
    entry = { lets: program.lets.map((item) => compileNode(item.expr)), body: compileNode(program.body) };
    cache.set(program, entry);
  }
  return entry;
}

function run(program: FormulaProgram, scope: FormulaScope): Frame & { value: number } {
  const code = compiled(program);
  const frame: Frame = { scope, locals: [], divZero: false };
  for (const item of code.lets) frame.locals.push(item(frame));
  return Object.assign(frame, { value: code.body(frame) });
}

/** 식의 값(고정 소수점) */
export function evaluateFormula(program: FormulaProgram, scope: FormulaScope): number {
  return run(program, scope).value;
}

/** 식의 값과 0으로 나눔 여부 */
export function evaluateFormulaChecked(
  program: FormulaProgram,
  scope: FormulaScope,
): { value: number; divZero: boolean } {
  const frame = run(program, scope);
  return { value: frame.value, divZero: frame.divZero };
}

/** 식의 값을 정수로(내림). 정수 칸(2차 스탯·공격력 등)의 결과 규칙 */
export function evaluateFormulaInt(program: FormulaProgram, scope: FormulaScope): number {
  return floorDiv(run(program, scope).value, FX_SCALE);
}

// ── 풀이(화면 미리 보기): "VIT(10) × 3 = 30" ──

/** 풀이 한 항: 결과 식의 더하기·빼기 항 하나 */
export interface FormulaTerm {
  readonly sign: 1 | -1;
  /** 변수·지역 이름 뒤에 그 값을 괄호로 붙인 글(예: "VIT(10) × 3") */
  readonly text: string;
  readonly value: number;
}

export interface FormulaExplanation {
  readonly value: number;
  readonly divZero: boolean;
  /** 지역 이름마다 값 */
  readonly lets: readonly { readonly name: string; readonly text: string; readonly value: number }[];
  /** 결과 식을 감싼 한 인자 함수(floor 등, 바깥부터). 항은 그 안의 더하기 항이다 */
  readonly wrappers: readonly string[];
  readonly terms: readonly FormulaTerm[];
}

/** 값 표: 마디 → 값(풀이용, 같은 식을 한 번 더 돈다) */
function traceValues(program: FormulaProgram, scope: FormulaScope): Map<FormulaNode, number> {
  const values = new Map<FormulaNode, number>();
  const frame: Frame = { scope, locals: [], divZero: false };
  const visit = (node: FormulaNode): void => {
    switch (node.t) {
      case "neg":
        visit(node.x);
        break;
      case "bin":
        visit(node.a);
        visit(node.b);
        break;
      case "call":
        if (node.fn === "if") {
          const [c, a, b] = node.args;
          if (c) visit(c);
          const chosen = c && (values.get(c) ?? 0) !== 0 ? a : b;
          if (chosen) visit(chosen);
        } else node.args.forEach(visit);
        break;
      default:
        break;
    }
    values.set(node, compileNode(node)(frame));
  };
  for (const item of program.lets) {
    visit(item.expr);
    frame.locals.push(values.get(item.expr) ?? 0);
  }
  visit(program.body);
  return values;
}

/** 마디 아래의 이름 마디(글 차례) */
function nameNodes(node: FormulaNode, out: FormulaNode[] = []): FormulaNode[] {
  switch (node.t) {
    case "var":
    case "local":
      out.push(node);
      break;
    case "neg":
      nameNodes(node.x, out);
      break;
    case "bin":
      nameNodes(node.a, out);
      nameNodes(node.b, out);
      break;
    case "call":
      for (const arg of node.args) nameNodes(arg, out);
      break;
    default:
      break;
  }
  return out;
}

/** 글 조각에 이름 값을 붙이고 연산자를 문서 기호로(×·÷) 바꾼다. 줄 바꿈·설명은 한 칸으로 */
function render(source: string, node: FormulaNode, values: ReadonlyMap<FormulaNode, number>): string {
  let text = "";
  let at = node.s;
  for (const name of nameNodes(node).toSorted((a, b) => a.s - b.s)) {
    if (name.s < at) continue;
    text += source.slice(at, name.s);
    const value = values.get(name);
    text += `${source.slice(name.s, name.e)}(${value === undefined ? "?" : fxFormat(value)})`;
    at = name.e;
  }
  text += source.slice(at, node.e);
  let out = "";
  let comment = false;
  for (const char of text) {
    if (char === "#") comment = true;
    if (char === "\n" || char === "\r") {
      comment = false;
      out += " ";
      continue;
    }
    if (comment) continue;
    out += char === "*" ? "×" : char === "/" ? "÷" : char;
  }
  let compact = "";
  for (const char of out) if (!(char === " " && (compact.endsWith(" ") || compact === ""))) compact += char;
  return compact.trim();
}

const WRAPPERS = new Set(["floor", "ceil", "round", "trunc"]);

/** 식 풀이: 지역 이름 값, 결과의 더하기 항마다 글·값 */
export function explainFormula(program: FormulaProgram, scope: FormulaScope): FormulaExplanation {
  const values = traceValues(program, scope);
  const checked = evaluateFormulaChecked(program, scope);
  const lets = program.lets.map((item) => ({
    name: item.name,
    text: render(program.source, item.expr, values),
    value: values.get(item.expr) ?? 0,
  }));
  const wrappers: string[] = [];
  let body = program.body;
  while (body.t === "call" && WRAPPERS.has(body.fn) && body.args[0]) {
    wrappers.push(body.fn);
    body = body.args[0];
  }
  const terms: FormulaTerm[] = [];
  const flatten = (node: FormulaNode, sign: 1 | -1): void => {
    if (node.t === "bin" && (node.op === "+" || node.op === "-")) {
      flatten(node.a, sign);
      flatten(node.b, node.op === "-" ? (sign === 1 ? -1 : 1) : sign);
      return;
    }
    terms.push({ sign, text: render(program.source, node, values), value: values.get(node) ?? 0 });
  };
  flatten(body, 1);
  return { value: checked.value, divZero: checked.divZero, lets, wrappers, terms };
}

// ── 1차 스탯 영향(사용자 결정 D-488 "식 옆에 각 스탯별 영향력 비중") ──

/** 1차 스탯 차례(팩 weights 차례 = 규칙 차례) */
export const FORMULA_PRIMARIES = ["STR", "DEX", "AGI", "VIT", "INT", "WIS"] as const;
export type FormulaPrimary = (typeof FORMULA_PRIMARIES)[number];

export interface PrimaryInfluence {
  /** 표본 결과(고정 소수점) */
  readonly base: number;
  /** 1차마다 기여 = 결과 − (그 1차만 0으로 둔 결과) */
  readonly contribution: readonly number[];
  /** 기여 ÷ 기여 합(‰). 합이 0이면 null(식이 1차를 쓰지 않음) */
  readonly sharePm: readonly (number | null)[];
  /** 그 1차 +10일 때 결과 차이 */
  readonly plus10: readonly number[];
}

/**
 * 1차 스탯 6개(정수)에서 결과(고정 소수점)를 내는 함수의 영향. 선형 식이면 기여 = 그 항의 값과 같다.
 * 곱·상한이 섞인 식은 근사이므로 화면은 "+10 → +Δ"(정확한 차이)를 함께 보인다
 */
export function primaryInfluence(
  evaluate: (primaries: readonly number[]) => number,
  primaries: readonly number[],
): PrimaryInfluence {
  const base = evaluate(primaries);
  const contribution = primaries.map((_, index) =>
    fxSub(base, evaluate(primaries.map((value, i) => (i === index ? 0 : value)))),
  );
  const plus10 = primaries.map((_, index) =>
    fxSub(evaluate(primaries.map((value, i) => (i === index ? value + 10 : value))), base),
  );
  const total = contribution.reduce((sum, value) => fxAdd(sum, value), 0);
  const sharePm = contribution.map((value) => {
    if (total === 0) return null;
    const scaled = value * 1000;
    return Number.isSafeInteger(scaled) ? floorDiv(scaled, total) : Math.trunc((value / total) * 1000);
  });
  return { base, contribution, sharePm, plus10 };
}
