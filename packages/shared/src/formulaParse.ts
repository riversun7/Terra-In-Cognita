// 계산식 읽기 — 글 → 구문 나무(AST) + 이름 검사. docs/adr/2026-11-01-formula-editor.md "식의 문법"
// eval·Function을 쓰지 않는 손으로 쓴 재귀 하강 해석기다. 서버(저장 검사)·판정 코드(sim)·팩 검사·화면 미리 보기가 같은 함수를 쓴다.
// 문법(우선순위 낮은 것부터):
//   식 목록   := (이름 '=' 식 [';'])* 식 [';']        — 앞의 줄은 지역 이름(중간값), 마지막 식이 결과
//   비교      := 덧셈 [('<' | '<=' | '>' | '>=' | '==' | '!=') 덧셈]   — 참 1, 거짓 0. 잇달아 쓸 수 없다
//   덧셈      := 곱셈 (('+' | '-') 곱셈)*
//   곱셈      := 단항 (('*' | '/') 단항)*
//   단항      := ('-' | '+') 단항 | 기본
//   기본      := 수 | 이름 | 함수 '(' 식 (',' 식)* ')' | '(' 식 ')'
// - 수: 10진, 소수 셋째 자리까지(0.2, 1.575). 넷째 자리부터는 오류(고정 소수점, formulaFixed.ts).
// - × ÷ − ≤ ≥ ≠ 도 받는다(문서의 식을 그대로 붙여 넣어도 되게). '#' 뒤는 줄 끝까지 설명.
// - 이름은 칸마다 정한 변수(대문자, formulaSlots.ts)·앞에서 만든 지역 이름·함수뿐이다. 모르는 이름은 저장 전에 위치와 함께
//   알리고, 비슷한 이름을 권한다(오타 막기, 사용자 결정 D-488).
// 결정성 검사 대상이다(scripts/check-boundaries.mjs): 정규식 리터럴·Math 초월함수를 쓰지 않는다.
import { FX_SCALE } from "./formulaFixed.ts";

/** 함수와 받는 인자 수(최소·최대, 최대 −1 = 여럿) */
export const FORMULA_FUNCTIONS = {
  min: [1, -1],
  max: [1, -1],
  floor: [1, 1],
  ceil: [1, 1],
  round: [1, 1],
  trunc: [1, 1],
  abs: [1, 1],
  clamp: [3, 3],
  if: [3, 3],
  curve: [3, 3],
  lerp: [3, 3],
} as const satisfies Record<string, readonly [number, number]>;
export type FormulaFunction = keyof typeof FORMULA_FUNCTIONS;
export const FORMULA_FUNCTION_NAMES: readonly FormulaFunction[] = [
  "min",
  "max",
  "floor",
  "ceil",
  "round",
  "trunc",
  "abs",
  "clamp",
  "if",
  "curve",
  "lerp",
];

export function isFormulaFunction(name: string): name is FormulaFunction {
  return Object.hasOwn(FORMULA_FUNCTIONS, name);
}

export type FormulaBinaryOp = "+" | "-" | "*" | "/" | "<" | "<=" | ">" | ">=" | "==" | "!=";

/** 구문 나무 마디. s·e = 글 안 위치(UTF-16, e는 끝 다음) */
export type FormulaNode =
  | { readonly t: "num"; readonly raw: number; readonly s: number; readonly e: number }
  | { readonly t: "var"; readonly name: string; readonly s: number; readonly e: number }
  | {
      readonly t: "local";
      readonly name: string;
      readonly index: number;
      readonly s: number;
      readonly e: number;
    }
  | { readonly t: "neg"; readonly x: FormulaNode; readonly s: number; readonly e: number }
  | {
      readonly t: "bin";
      readonly op: FormulaBinaryOp;
      readonly a: FormulaNode;
      readonly b: FormulaNode;
      readonly s: number;
      readonly e: number;
    }
  | {
      readonly t: "call";
      readonly fn: FormulaFunction;
      readonly args: readonly FormulaNode[];
      readonly s: number;
      readonly e: number;
    };

export interface FormulaLet {
  readonly name: string;
  readonly expr: FormulaNode;
  readonly s: number;
  readonly e: number;
}

/** 읽은 식(직렬화할 수 있는 값만: 계수표·전투 시작 자료에 그대로 실린다) */
export interface FormulaProgram {
  readonly source: string;
  readonly lets: readonly FormulaLet[];
  readonly body: FormulaNode;
  /** 쓴 칸 변수(차례대로, 겹침 없음) */
  readonly vars: readonly string[];
}

export const FORMULA_ERROR_CODES = [
  "empty",
  "too_long",
  "too_deep",
  "too_many_nodes",
  "unexpected_char",
  "unexpected_token",
  "unexpected_end",
  "expected_close_paren",
  "too_many_decimals",
  "number_too_large",
  "chained_comparison",
  "unknown_name",
  "unknown_function",
  "not_a_function",
  "function_needs_call",
  "arity",
  "local_shadows",
  "local_redefined",
  "missing_result",
] as const;
export type FormulaErrorCode = (typeof FORMULA_ERROR_CODES)[number];

export interface FormulaIssue {
  readonly code: FormulaErrorCode | "unused_local";
  /** 글 안 위치(UTF-16) */
  readonly s: number;
  readonly e: number;
  /** 문제의 이름·글자 */
  readonly name?: string | undefined;
  /** 비슷한 이름(오타 권함) */
  readonly suggestion?: string | undefined;
  /** 함수 인자 수(arity): 최소·최대(−1 = 여럿) */
  readonly min?: number | undefined;
  readonly max?: number | undefined;
}

export type FormulaParseResult =
  | { readonly ok: true; readonly program: FormulaProgram; readonly warnings: readonly FormulaIssue[] }
  | {
      readonly ok: false;
      readonly errors: readonly FormulaIssue[];
      readonly warnings: readonly FormulaIssue[];
    };

/** 식 길이 상한(글자)·괄호 깊이·마디 수 — 저장·판정 비용을 묶는 기술 상한 */
export const FORMULA_MAX_LENGTH = 2000;
export const FORMULA_MAX_DEPTH = 40;
export const FORMULA_MAX_NODES = 400;
/** 수 글자 정수 부분 상한(10^12, 고정 소수점 1000배가 안전 정수 안) */
const NUMBER_LIMIT = 1_000_000_000_000;

type Token =
  | { readonly k: "num"; readonly raw: number; readonly s: number; readonly e: number }
  | { readonly k: "name"; readonly name: string; readonly s: number; readonly e: number }
  | { readonly k: "op"; readonly op: string; readonly s: number; readonly e: number }
  | { readonly k: "end"; readonly s: number; readonly e: number };

class FormulaSyntaxError extends Error {
  readonly issue: FormulaIssue;
  constructor(issue: FormulaIssue) {
    super(issue.code);
    this.issue = issue;
  }
}

const isDigit = (c: number): boolean => c >= 48 && c <= 57;
const isLowSurrogate = (c: number): boolean => c >= 0xdc00 && c <= 0xdfff;
const isNameStart = (c: number): boolean => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
const isNamePart = (c: number): boolean => isNameStart(c) || isDigit(c);
const isSpace = (c: number): boolean =>
  c === 32 || c === 9 || c === 10 || c === 13 || c === 0x3000 || c === 0xa0;

/** 같은 뜻의 다른 글자(문서 기호·전각) → 연산자 */
const ALIASES: Readonly<Record<string, string>> = {
  "×": "*",
  "·": "*",
  "÷": "/",
  "−": "-",
  "–": "-",
  "≤": "<=",
  "≥": ">=",
  "≠": "!=",
  "（": "(",
  "）": ")",
  "，": ",",
  "；": ";",
};
const SINGLE = "+-*/(),;";

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source.charCodeAt(i);
    if (isSpace(c)) {
      i += 1;
      continue;
    }
    if (c === 35) {
      // '#' 설명은 줄 끝까지. 제어 글자·짝 없는 대리 문자는 받지 않는다(DB text·jsonb가 못 담는다, AGENTS 6장)
      while (i < source.length && source.charCodeAt(i) !== 10) {
        const d = source.charCodeAt(i);
        const high = d >= 0xd800 && d <= 0xdbff;
        if ((d < 0x20 && d !== 9 && d !== 13) || (d >= 0x7f && d <= 0x9f) || isLowSurrogate(d))
          throw new FormulaSyntaxError({ code: "unexpected_char", s: i, e: i + 1 });
        if (high) {
          if (!isLowSurrogate(source.charCodeAt(i + 1)))
            throw new FormulaSyntaxError({ code: "unexpected_char", s: i, e: i + 1 });
          i += 1;
        }
        i += 1;
      }
      continue;
    }
    const s = i;
    if (isDigit(c) || (c === 46 && isDigit(source.charCodeAt(i + 1)))) {
      let whole = 0;
      while (i < source.length && isDigit(source.charCodeAt(i))) {
        whole = whole * 10 + (source.charCodeAt(i) - 48);
        i += 1;
        if (whole >= NUMBER_LIMIT) {
          while (i < source.length && (isDigit(source.charCodeAt(i)) || source.charCodeAt(i) === 46)) i += 1;
          throw new FormulaSyntaxError({ code: "number_too_large", s, e: i });
        }
      }
      let frac = 0;
      let digits = 0;
      if (source.charCodeAt(i) === 46) {
        i += 1;
        while (i < source.length && isDigit(source.charCodeAt(i))) {
          if (digits < 3) frac = frac * 10 + (source.charCodeAt(i) - 48);
          digits += 1;
          i += 1;
        }
        if (digits > 3) throw new FormulaSyntaxError({ code: "too_many_decimals", s, e: i });
        for (let pad = digits; pad < 3; pad++) frac *= 10;
      }
      if (i < source.length && isNameStart(source.charCodeAt(i))) {
        // 3x 같은 글: 곱셈 기호가 빠졌다
        throw new FormulaSyntaxError({ code: "unexpected_char", s: i, e: i + 1, name: source[i] });
      }
      tokens.push({ k: "num", raw: whole * FX_SCALE + frac, s, e: i });
      continue;
    }
    if (isNameStart(c)) {
      while (i < source.length && isNamePart(source.charCodeAt(i))) i += 1;
      tokens.push({ k: "name", name: source.slice(s, i), s, e: i });
      continue;
    }
    const two = source.slice(i, i + 2);
    if (two === "<=" || two === ">=" || two === "==" || two === "!=") {
      tokens.push({ k: "op", op: two, s, e: i + 2 });
      i += 2;
      continue;
    }
    const char = source[i] ?? "";
    const alias = ALIASES[char];
    if (alias !== undefined) {
      tokens.push({ k: "op", op: alias, s, e: i + 1 });
      i += 1;
      continue;
    }
    if (SINGLE.includes(char) || char === "<" || char === ">" || char === "=") {
      tokens.push({ k: "op", op: char, s, e: i + 1 });
      i += 1;
      continue;
    }
    throw new FormulaSyntaxError({ code: "unexpected_char", s, e: i + 1, name: char });
  }
  tokens.push({ k: "end", s: source.length, e: source.length });
  return tokens;
}

/** 두 글의 편집 거리(작은 이름끼리라 단순한 표 하나) */
function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const keep = row[j] ?? 0;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(keep + 1, (row[j - 1] ?? 0) + 1, previous + cost);
      previous = keep;
    }
  }
  return row[b.length] ?? 0;
}

/** 비슷한 이름: 대소문자만 다르면 그것, 아니면 편집 거리 2 이하에서 가장 가까운 것(같으면 목록 차례) */
export function suggestName(name: string, candidates: readonly string[]): string | undefined {
  const lower = name.toLowerCase();
  const sameCase = candidates.find((candidate) => candidate.toLowerCase() === lower);
  if (sameCase !== undefined) return sameCase;
  let best: string | undefined;
  let bestDistance = 3;
  for (const candidate of candidates) {
    const distance = editDistance(lower, candidate.toLowerCase());
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

class Parser {
  private readonly tokens: Token[];
  private at = 0;
  private depth = 0;
  private nodes = 0;
  readonly errors: FormulaIssue[] = [];
  readonly usedVars = new Set<string>();
  readonly locals: string[] = [];
  readonly usedLocals = new Set<number>();
  private readonly allowed: ReadonlySet<string>;
  private readonly allowedList: readonly string[];

  constructor(tokens: Token[], allowed: readonly string[]) {
    this.tokens = tokens;
    this.allowed = new Set(allowed);
    this.allowedList = allowed;
  }

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.at + offset, this.tokens.length - 1)] ?? { k: "end", s: 0, e: 0 };
  }

  private next(): Token {
    const token = this.peek();
    if (this.at < this.tokens.length - 1) this.at += 1;
    return token;
  }

  private isOp(token: Token, op: string): boolean {
    return token.k === "op" && token.op === op;
  }

  private fail(token: Token): never {
    if (token.k === "end") throw new FormulaSyntaxError({ code: "unexpected_end", s: token.s, e: token.e });
    const name = token.k === "name" ? token.name : token.k === "op" ? token.op : undefined;
    throw new FormulaSyntaxError({ code: "unexpected_token", s: token.s, e: token.e, name });
  }

  private count(): void {
    this.nodes += 1;
    if (this.nodes > FORMULA_MAX_NODES) throw new FormulaSyntaxError({ code: "too_many_nodes", s: 0, e: 0 });
  }

  private report(issue: FormulaIssue): void {
    if (this.errors.length < 20) this.errors.push(issue);
  }

  program(): { lets: FormulaLet[]; body: FormulaNode } {
    const lets: FormulaLet[] = [];
    for (;;) {
      const head = this.peek();
      if (head.k === "end") {
        throw new FormulaSyntaxError(
          lets.length > 0 ? { code: "missing_result", s: head.s, e: head.e } : { code: "empty", s: 0, e: 0 },
        );
      }
      if (head.k === "name" && this.isOp(this.peek(1), "=")) {
        this.next();
        this.next();
        const expr = this.expression();
        this.defineLocal(head);
        lets.push({ name: head.name, expr, s: head.s, e: expr.e });
        if (this.isOp(this.peek(), ";")) this.next();
        continue;
      }
      const body = this.expression();
      if (this.isOp(this.peek(), ";")) this.next();
      const rest = this.peek();
      if (rest.k !== "end") {
        // 결과 식 뒤에 지역 이름 줄이 오면 차례가 틀렸다(결과는 마지막 줄)
        this.fail(rest);
      }
      return { lets, body };
    }
  }

  private defineLocal(token: Token & { k: "name" }): void {
    const name = token.name;
    if (this.allowed.has(name) || isFormulaFunction(name)) {
      this.report({ code: "local_shadows", s: token.s, e: token.e, name });
      return;
    }
    if (this.locals.includes(name)) {
      this.report({ code: "local_redefined", s: token.s, e: token.e, name });
      return;
    }
    this.locals.push(name);
  }

  private expression(): FormulaNode {
    this.depth += 1;
    if (this.depth > FORMULA_MAX_DEPTH) {
      const token = this.peek();
      throw new FormulaSyntaxError({ code: "too_deep", s: token.s, e: token.e });
    }
    const left = this.additive();
    const token = this.peek();
    let result = left;
    if (
      token.k === "op" &&
      (token.op === "<" ||
        token.op === "<=" ||
        token.op === ">" ||
        token.op === ">=" ||
        token.op === "==" ||
        token.op === "!=")
    ) {
      this.next();
      const right = this.additive();
      this.count();
      result = { t: "bin", op: token.op, a: left, b: right, s: left.s, e: right.e };
      const after = this.peek();
      if (after.k === "op" && ["<", "<=", ">", ">=", "==", "!="].includes(after.op))
        throw new FormulaSyntaxError({ code: "chained_comparison", s: after.s, e: after.e, name: after.op });
    }
    this.depth -= 1;
    return result;
  }

  private additive(): FormulaNode {
    let left = this.multiplicative();
    for (;;) {
      const token = this.peek();
      if (!(token.k === "op" && (token.op === "+" || token.op === "-"))) return left;
      this.next();
      const right = this.multiplicative();
      this.count();
      left = { t: "bin", op: token.op, a: left, b: right, s: left.s, e: right.e };
    }
  }

  private multiplicative(): FormulaNode {
    let left = this.unary();
    for (;;) {
      const token = this.peek();
      if (!(token.k === "op" && (token.op === "*" || token.op === "/"))) return left;
      this.next();
      const right = this.unary();
      this.count();
      left = { t: "bin", op: token.op, a: left, b: right, s: left.s, e: right.e };
    }
  }

  private unary(): FormulaNode {
    const token = this.peek();
    if (token.k === "op" && (token.op === "-" || token.op === "+")) {
      this.next();
      this.depth += 1;
      if (this.depth > FORMULA_MAX_DEPTH)
        throw new FormulaSyntaxError({ code: "too_deep", s: token.s, e: token.e });
      const x = this.unary();
      this.depth -= 1;
      if (token.op === "+") return x;
      this.count();
      return { t: "neg", x, s: token.s, e: x.e };
    }
    return this.primary();
  }

  private primary(): FormulaNode {
    const token = this.next();
    this.count();
    if (token.k === "num") return { t: "num", raw: token.raw, s: token.s, e: token.e };
    if (token.k === "op" && token.op === "(") {
      const inner = this.expression();
      const close = this.next();
      if (!this.isOp(close, ")"))
        throw new FormulaSyntaxError({ code: "expected_close_paren", s: close.s, e: close.e });
      return inner;
    }
    if (token.k !== "name") this.fail(token);
    const name = token.name;
    if (this.isOp(this.peek(), "(")) return this.call(token);
    if (isFormulaFunction(name)) {
      this.report({ code: "function_needs_call", s: token.s, e: token.e, name });
      return { t: "num", raw: 0, s: token.s, e: token.e };
    }
    const localIndex = this.locals.indexOf(name);
    if (localIndex >= 0) {
      this.usedLocals.add(localIndex);
      return { t: "local", name, index: localIndex, s: token.s, e: token.e };
    }
    if (this.allowed.has(name)) {
      this.usedVars.add(name);
      return { t: "var", name, s: token.s, e: token.e };
    }
    this.report({
      code: "unknown_name",
      s: token.s,
      e: token.e,
      name,
      suggestion: suggestName(name, [...this.allowedList, ...this.locals]),
    });
    return { t: "num", raw: 0, s: token.s, e: token.e };
  }

  private call(token: Token & { k: "name" }): FormulaNode {
    const name = token.name;
    this.next(); // (
    const args: FormulaNode[] = [];
    if (!this.isOp(this.peek(), ")")) {
      for (;;) {
        args.push(this.expression());
        if (this.isOp(this.peek(), ",")) {
          this.next();
          continue;
        }
        break;
      }
    }
    const close = this.next();
    if (!this.isOp(close, ")"))
      throw new FormulaSyntaxError({ code: "expected_close_paren", s: close.s, e: close.e });
    if (!isFormulaFunction(name)) {
      const known = this.allowed.has(name) || this.locals.includes(name);
      this.report({
        code: known ? "not_a_function" : "unknown_function",
        s: token.s,
        e: token.e,
        name,
        suggestion: known ? undefined : suggestName(name, FORMULA_FUNCTION_NAMES),
      });
      return { t: "num", raw: 0, s: token.s, e: close.e };
    }
    const [min, max] = FORMULA_FUNCTIONS[name];
    if (args.length < min || (max >= 0 && args.length > max)) {
      this.report({ code: "arity", s: token.s, e: close.e, name, min, max });
      return { t: "num", raw: 0, s: token.s, e: close.e };
    }
    return { t: "call", fn: name, args, s: token.s, e: close.e };
  }
}

/**
 * 식 글을 읽는다. allowed = 그 칸의 변수 이름(formulaSlots.ts). 문법 오류는 처음 하나에서 멈추고, 이름 오류는 모두 모은다.
 * 경고: 만들고 쓰지 않은 지역 이름(unused_local)
 */
export function parseFormula(source: string, allowed: readonly string[]): FormulaParseResult {
  if (source.length > FORMULA_MAX_LENGTH)
    return {
      ok: false,
      errors: [{ code: "too_long", s: FORMULA_MAX_LENGTH, e: source.length }],
      warnings: [],
    };
  let parser: Parser;
  let parsed: { lets: FormulaLet[]; body: FormulaNode };
  try {
    parser = new Parser(tokenize(source), allowed);
    parsed = parser.program();
  } catch (error) {
    if (error instanceof FormulaSyntaxError) return { ok: false, errors: [error.issue], warnings: [] };
    throw error;
  }
  const warnings: FormulaIssue[] = [];
  parsed.lets.forEach((entry, index) => {
    if (!parser.usedLocals.has(index))
      warnings.push({ code: "unused_local", s: entry.s, e: entry.s + entry.name.length, name: entry.name });
  });
  if (parser.errors.length > 0) return { ok: false, errors: parser.errors, warnings };
  const vars = allowed.filter((name) => parser.usedVars.has(name));
  return { ok: true, program: { source, lets: parsed.lets, body: parsed.body, vars }, warnings };
}

/** 읽기 + 오류면 던진다(팩·기본값처럼 이미 검사한 식) */
export function compileFormulaOrThrow(source: string, allowed: readonly string[]): FormulaProgram {
  const result = parseFormula(source, allowed);
  if (!result.ok) {
    const first = result.errors[0];
    throw new Error(`formula error ${first?.code ?? "?"} at ${first?.s ?? 0}: ${source}`);
  }
  return result.program;
}
