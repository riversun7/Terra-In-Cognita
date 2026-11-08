// 계산식 끌어 넣기·눌러 넣기 모델(순수 함수) — docs/adr/2026-11-01-formula-editor.md "바뀜 (2026-11-08 끌어 넣기)".
// 사용자 원문(2026-11-08): "검증도 좋으나 STR 같은 명확한 상수는 드래그해서 쓸수있게 직관적으로 하면 오타없이 좋을듯".
// 칩(변수·중간값·함수·연산자)을 글 상자의 놓은 자리 또는 글자 위치에 넣는다. 함수는 자리표시 인자를 붙이고 첫 인자를 고른다.
// 넣은 글은 같은 해석기(@terra/shared/formula parseFormula)가 그대로 검사한다: 자리표시 인자는 모르는 이름이라 담기가 막힌다.
import {
  FORMULA_FUNCTION_NAMES,
  type FormulaFunction,
  type FormulaSlot,
  isFormulaFunction,
  slotVarNames,
} from "@terra/shared/formula";
import { localsIn, wordAt } from "./formulaModel.ts";

/** 칩 종류 */
export type PaletteKind = "var" | "local" | "fn" | "op";

/** 연산자 칩(넣는 글). "(" = 괄호 한 쌍, "=" = 중간값 줄 */
export const PALETTE_OPERATORS = [
  "+",
  "-",
  "*",
  "/",
  "(",
  ",",
  "<",
  "<=",
  ">",
  ">=",
  "==",
  "!=",
  "=",
] as const;
export type PaletteOperator = (typeof PALETTE_OPERATORS)[number];

export function isPaletteOperator(value: string): value is PaletteOperator {
  return (PALETTE_OPERATORS as readonly string[]).includes(value);
}

export interface PaletteToken {
  readonly kind: PaletteKind;
  /** 이름 또는 연산자 글 */
  readonly name: string;
}

/** 끌기 자료 종류(칩 → 글 상자). 다른 곳에서 끌어 온 글은 글 상자 기본 동작 그대로 */
export const FORMULA_TOKEN_MIME = "application/x-terra-formula-token";

/** 놓은 끌기 자료 → 칩(이 칸 조각판에 있는 것만, 아니면 null) */
export function droppedToken(data: string, palette: readonly PaletteToken[]): PaletteToken | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const kind: unknown = Reflect.get(parsed, "kind");
  const name: unknown = Reflect.get(parsed, "name");
  return palette.find((token) => token.kind === kind && token.name === name) ?? null;
}

/**
 * 함수 자리표시 인자(영어 낱말). 일부러 모르는 이름이라 채우지 않으면 담기가 막힌다.
 * 어떤 칸 변수·함수 이름과도 편집 거리 3 이상이라 "○○로 고치기" 권함이 붙지 않는다(시험이 본다).
 */
export const FUNCTION_PLACEHOLDERS: Readonly<Record<FormulaFunction, readonly string[]>> = {
  min: ["first", "second"],
  max: ["first", "second"],
  floor: ["value"],
  ceil: ["value"],
  round: ["value"],
  trunc: ["value"],
  abs: ["value"],
  clamp: ["value", "lower", "upper"],
  if: ["condition", "whenTrue", "whenFalse"],
  curve: ["score", "limit", "half"],
  lerp: ["begin", "finish", "ratio"],
};

/** 중간값 칩이 만드는 이름(겹치면 뒤에 수를 붙인다) */
const LOCAL_BASE = "temp";

/** 칸의 칩 목록: 변수 → 중간값(지금 글에서) → 함수 → 연산자 */
export function paletteOf(slot: FormulaSlot, source: string): readonly PaletteToken[] {
  const vars = slotVarNames(slot);
  const locals = localsIn(source).filter((name) => !vars.includes(name));
  return [
    ...vars.map((name) => ({ kind: "var" as const, name })),
    ...locals.map((name) => ({ kind: "local" as const, name })),
    ...FORMULA_FUNCTION_NAMES.map((name) => ({ kind: "fn" as const, name })),
    ...PALETTE_OPERATORS.map((name) => ({ kind: "op" as const, name })),
  ];
}

/** 칩에 보이는 글 */
export function tokenLabel(token: PaletteToken): string {
  if (token.kind === "fn") return `${token.name}()`;
  if (token.kind === "op" && token.name === "(") return "( )";
  return token.name;
}

const WORD = /[A-Za-z0-9_]/;
/** 앞 글자가 이것이면 이름 앞에 빈칸(빈칸·여는 괄호 뒤만 붙인다: 낱말끼리 붙지 않고 연산자와도 띄운다) */
const JOINS_BEFORE = /[^\s(]/;
/** 뒤 글자가 이것이면 이름 뒤에 빈칸(빈칸·닫는 괄호·쉼표·쌍반점 앞만 붙인다) */
const JOINS_AFTER = /[^\s),;]/;

/** 글자 위치를 둘러싼 낱말 범위 */
function wordRange(source: string, at: number): { start: number; end: number } {
  const { start } = wordAt(source, at);
  let end = at;
  while (end < source.length && WORD.test(source[end] ?? "")) end += 1;
  return { start, end };
}

export interface InsertResult {
  readonly source: string;
  /** 넣은 뒤 고를 범위(같으면 글자 위치) */
  readonly selStart: number;
  readonly selEnd: number;
}

/** 겹치지 않는 중간값 이름 */
function freshLocal(source: string, taken: readonly string[]): string {
  const used = new Set([...localsIn(source), ...taken]);
  if (!used.has(LOCAL_BASE)) return LOCAL_BASE;
  let n = 2;
  while (used.has(`${LOCAL_BASE}${n}`)) n += 1;
  return `${LOCAL_BASE}${n}`;
}

/** 중간값 줄: 지금 줄 앞에 `이름 = 값` 줄을 넣는다. 고른 글이 있으면 그 글을 중간값으로 빼고 그 자리에 이름을 둔다 */
function insertLocal(source: string, start: number, end: number, taken: readonly string[]): InsertResult {
  const name = freshLocal(source, taken);
  const lineStart = source.lastIndexOf("\n", start - 1) + 1;
  const picked = source.slice(start, end).trim();
  const line = `${name} = ${picked === "" ? "0" : picked}\n`;
  const body = picked === "" ? source : source.slice(0, start) + name + source.slice(end);
  const next = body.slice(0, lineStart) + line + body.slice(lineStart);
  // 새 줄의 이름을 고른다(바로 이름을 바꿔 쓰게)
  return { source: next, selStart: lineStart, selEnd: lineStart + name.length };
}

/**
 * 칩 하나를 [start, end)(고른 범위, 같으면 글자 위치)에 넣는다.
 * - 이름: 글자 위치 앞 낱말이 그 이름의 앞부분이면 그 낱말을 바꾼다(입력하다 고름). 낱말 한가운데면 낱말 끝에 넣는다.
 * - 함수: `이름(인자, …)` 자리표시. 고른 글이 있으면 첫 인자로 감싸고 다음 인자를(없으면 닫는 괄호 뒤를) 고른다. 아니면 첫 인자를 고른다.
 * - "(": 괄호 한 쌍(고른 글은 감싼다), 연산자: 앞뒤 빈칸을 맞춘다, "=": 중간값 줄.
 * taken = 중간값 이름으로 쓰면 안 되는 이름(칸 변수).
 */
export function insertToken(
  source: string,
  rangeStart: number,
  rangeEnd: number,
  token: PaletteToken,
  taken: readonly string[] = [],
): InsertResult {
  let start = Math.max(0, Math.min(rangeStart, rangeEnd, source.length));
  let end = Math.max(start, Math.min(Math.max(rangeStart, rangeEnd), source.length));
  if (token.kind === "op" && token.name === "=") return insertLocal(source, start, end, taken);
  // 입력하던 앞부분을 바꾸는 중이면 그 글은 감쌀 글이 아니다
  let replacing = false;
  if (start === end) {
    const word = wordRange(source, start);
    const typed = source.slice(word.start, word.end).toLowerCase();
    const named = token.kind !== "op";
    if (named && typed !== "" && !/^[0-9]/.test(typed) && token.name.toLowerCase().startsWith(typed)) {
      start = word.start;
      end = word.end;
      replacing = true;
    } else if (word.start < start && start < word.end) {
      start = word.end;
      end = word.end;
    }
  }
  const picked = replacing ? "" : source.slice(start, end);
  const before = source[start - 1] ?? "";
  const after = source[end] ?? "";
  let text: string;
  let selFrom: number;
  let selTo: number;
  if (token.kind === "fn") {
    const args = [...(isFormulaFunction(token.name) ? FUNCTION_PLACEHOLDERS[token.name] : ["value"])];
    const wrap = picked.trim() !== "";
    if (wrap) args[0] = picked.trim();
    text = `${token.name}(${args.join(", ")})`;
    const at = (index: number): number =>
      token.name.length + 1 + args.slice(0, index).reduce((sum, arg) => sum + arg.length + 2, 0);
    if (!wrap) {
      selFrom = at(0);
      selTo = selFrom + (args[0]?.length ?? 0);
    } else if (args.length > 1) {
      selFrom = at(1);
      selTo = selFrom + (args[1]?.length ?? 0);
    } else {
      selFrom = text.length;
      selTo = text.length;
    }
  } else if (token.kind === "op" && token.name === "(") {
    text = `(${picked})`;
    selFrom = picked === "" ? 1 : text.length;
    selTo = selFrom;
  } else if (token.kind === "op" && token.name === ",") {
    text = /\s/.test(after) ? "," : ", ";
    selFrom = text.length;
    selTo = selFrom;
  } else if (token.kind === "op") {
    const lead = before === "" || /\s|\(/.test(before) ? "" : " ";
    const trail = /\s/.test(after) ? "" : " ";
    text = `${lead}${token.name}${trail}`;
    selFrom = text.length;
    selTo = selFrom;
  } else {
    text = token.name;
    selFrom = text.length;
    selTo = selFrom;
  }
  // 이름·함수·괄호는 앞뒤 낱말과 붙지 않게 빈칸
  if (token.kind !== "op" || token.name === "(") {
    if (JOINS_BEFORE.test(before)) {
      text = ` ${text}`;
      selFrom += 1;
      selTo += 1;
    }
    if (JOINS_AFTER.test(after)) text = `${text} `;
  }
  return {
    source: source.slice(0, start) + text + source.slice(end),
    selStart: start + selFrom,
    selEnd: start + selTo,
  };
}

/** 놓은 자리 셈에 쓰는 글 상자 치수(내용 상자 왼쪽 위 기준, 스크롤 포함) */
export interface TextBoxMetrics {
  readonly lineHeight: number;
  /** 한 줄 앞부분의 그린 너비(px) */
  readonly measure: (text: string) => number;
}

/**
 * 글 상자 안 점(x, y: 내용 상자 왼쪽 위에서, 스크롤 더함) → 글자 위치. 글 상자는 줄을 접지 않는다(white-space: pre).
 * 줄은 줄 높이로, 칸은 그 줄 앞부분 너비가 가장 가까운 글자 사이로 고른다(한글처럼 넓은 글자도 맞다).
 */
export function offsetAtPoint(source: string, x: number, y: number, metrics: TextBoxMetrics): number {
  const lines = source.split("\n");
  const height = metrics.lineHeight > 0 ? metrics.lineHeight : 1;
  const row = Math.min(lines.length - 1, Math.max(0, Math.floor(y / height)));
  let offset = 0;
  for (let index = 0; index < row; index += 1) offset += (lines[index]?.length ?? 0) + 1;
  const line = lines[row] ?? "";
  let previous = 0;
  for (let column = 1; column <= line.length; column += 1) {
    const width = metrics.measure(line.slice(0, column));
    if (width >= x) return offset + (x - previous < width - x ? column - 1 : column);
    previous = width;
  }
  return offset + line.length;
}
