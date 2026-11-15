// 계산식을 글로 풀기(화면 표시용) — 사용자 결정 D-556(질문 1253 "2차스탯 페이지에 공식이 안써있고 … 공식이 뭐냐?").
// 값을 내는 바로 그 읽은 식(FormulaProgram)의 구문 나무를 사람이 읽는 글로 바꾼다. 같은 나무에서 글과 값이 나오므로 둘이 어긋날 수 없다.
// - 연산자는 문서 기호(× ÷ − ≤ ≥ ≠), floor·ceil·abs는 ⌊x⌋·⌈x⌉·|x|. 설명(#)과 줄 바꿈은 나무에 없으므로 저절로 빠진다.
// - 괄호는 셈 차례를 그대로 지키도록 넣는다: 낮은 차례의 항은 감싸고, 같은 차례의 오른쪽 항도 감싼다(고정 소수점이라 묶는 차례가 값을 바꾼다).
// - nonNegative에 적은 변수(1차 스탯 등)의 max(0, X)는 X로 줄이고 줄인 이름을 floored에 적는다(화면이 "0 아래면 0" 한 줄을 붙인다 —
//   글만 읽어도 값과 같게).
// - plain = 식 문법으로 다시 읽을 수 있는 글(함수 이름 그대로, == 그대로). 시험이 다시 읽어 값이 같은지 본다.
// 결정성 검사 대상 꾸러미 안의 파일이라 초월함수·정규식 리터럴을 쓰지 않는다.
import { fxFormat } from "./formulaFixed.ts";
import {
  type FormulaBinaryOp,
  type FormulaFunction,
  type FormulaNode,
  type FormulaProgram,
  parseFormula,
} from "./formulaParse.ts";
import { type StatRowShape, statRowExpression } from "./formulaSlots.ts";

export interface FormulaTextOptions {
  /** 변수 이름 → 화면 이름(없으면 이름 그대로) */
  readonly varLabel?: ((name: string) => string) | undefined;
  /** 함수 이름 → 화면 이름(없으면 이름 그대로). ⌊⌋·⌈⌉·||로 쓰는 floor·ceil·abs는 plain일 때만 묻는다 */
  readonly fnLabel?: ((fn: FormulaFunction) => string) | undefined;
  /** max(0, X)를 X로 줄일 변수 이름(줄인 이름은 FormulaText.floored) */
  readonly nonNegative?: readonly string[] | undefined;
  /** 식 문법으로 다시 읽을 수 있는 글(기호·줄임 없이) */
  readonly plain?: boolean | undefined;
}

export interface FormulaTextLet {
  readonly name: string;
  readonly text: string;
}

/** 글로 푼 식: 지역 이름(중간값) 줄들과 결과 식 */
export interface FormulaText {
  readonly lets: readonly FormulaTextLet[];
  readonly body: string;
  /** max(0, X)를 X로 줄인 변수 이름(나온 차례, 겹침 없음): 이 변수는 0보다 작으면 0으로 셈한다 */
  readonly floored: readonly string[];
}

/** 결합 차례: 비교 1 < 덧셈 2 < 곱셈 3 < 단항 4 < 원자 5 */
const PREC_COMPARE = 1;
const PREC_ADD = 2;
const PREC_MUL = 3;
const PREC_UNARY = 4;
const PREC_ATOM = 5;

const OP_TEXT: Readonly<Record<FormulaBinaryOp, string>> = {
  "+": "+",
  "-": "−",
  "*": "×",
  "/": "÷",
  "<": "<",
  "<=": "≤",
  ">": ">",
  ">=": "≥",
  "==": "=",
  "!=": "≠",
};

function precOf(op: FormulaBinaryOp): number {
  if (op === "+" || op === "-") return PREC_ADD;
  if (op === "*" || op === "/") return PREC_MUL;
  return PREC_COMPARE;
}

interface Piece {
  readonly text: string;
  readonly prec: number;
}

const atom = (text: string): Piece => ({ text, prec: PREC_ATOM });

function renderer(options: FormulaTextOptions) {
  const plain = options.plain === true;
  const varLabel = plain ? (name: string) => name : (options.varLabel ?? ((name: string) => name));
  const fnLabel = plain ? (fn: FormulaFunction) => fn : (options.fnLabel ?? ((fn: FormulaFunction) => fn));
  const nonNegative = new Set(plain ? [] : (options.nonNegative ?? []));
  const floored: string[] = [];
  const wrap = (piece: Piece, min: number): string => (piece.prec < min ? `(${piece.text})` : piece.text);

  const visit = (node: FormulaNode): Piece => {
    switch (node.t) {
      case "num":
        return node.raw < 0
          ? { text: `${plain ? "-" : "−"}${fxFormat(-node.raw)}`, prec: PREC_UNARY }
          : atom(fxFormat(node.raw));
      case "var":
        return atom(varLabel(node.name));
      case "local":
        return atom(node.name);
      case "neg":
        return { text: `${plain ? "-" : "−"}${wrap(visit(node.x), PREC_UNARY)}`, prec: PREC_UNARY };
      case "bin": {
        const prec = precOf(node.op);
        const left = wrap(visit(node.a), prec);
        // 오른쪽은 같은 차례도 감싼다(a − (b − c), a ÷ (b × c) — 묶는 차례가 값이다)
        const right = wrap(visit(node.b), prec + 1);
        const op = plain ? node.op : OP_TEXT[node.op];
        return { text: `${left} ${op} ${right}`, prec };
      }
      case "call":
        return call(node.fn, node.args);
    }
    throw new Error("unknown node");
  };

  const call = (fn: FormulaFunction, args: readonly FormulaNode[]): Piece => {
    const first = args[0];
    if (!plain && first && args.length === 1) {
      if (fn === "floor") return atom(`⌊${visit(first).text}⌋`);
      if (fn === "ceil") return atom(`⌈${visit(first).text}⌉`);
      if (fn === "abs") return atom(`|${visit(first).text}|`);
    }
    if (fn === "max" && args.length === 2) {
      // max(0, X) / max(X, 0): X가 0 이상이 보장된 변수면 X 그대로(값이 같다)
      const [a, b] = args;
      const kept = a && b ? (isZero(a) && keeps(b) ? b : isZero(b) && keeps(a) ? a : null) : null;
      if (kept && kept.t === "var") {
        if (!floored.includes(kept.name)) floored.push(kept.name);
        return visit(kept);
      }
    }
    return atom(`${fnLabel(fn)}(${args.map((arg) => visit(arg).text).join(", ")})`);
  };

  const isZero = (node: FormulaNode): boolean => node.t === "num" && node.raw === 0;
  const keeps = (node: FormulaNode): boolean => node.t === "var" && nonNegative.has(node.name);

  return { render: (node: FormulaNode): string => visit(node).text, floored };
}

/** 읽은 식 → 글(지역 이름 줄 + 결과 식) */
export function formulaText(program: FormulaProgram, options: FormulaTextOptions = {}): FormulaText {
  const { render, floored } = renderer(options);
  const lets = program.lets.map((item) => ({ name: item.name, text: render(item.expr) }));
  const body = render(program.body);
  return { lets, body, floored };
}

/**
 * 한 줄 글: "r = …; 결과 이름 = 결과 식". result가 없으면 결과 식만 붙인다.
 * plain이면 그대로 식 문법이다(지역 줄은 ";"로 잇는다)
 */
export function formulaTextLine(text: FormulaText, result?: string): string {
  const lets = text.lets.map((item) => `${item.name} = ${item.text}`);
  return [...lets, result === undefined ? text.body : `${result} = ${text.body}`].join("; ");
}

/** 식 글을 읽어 글로 푼다(읽히지 않으면 null — 화면은 원래 글이나 옛 문구로 돌아간다) */
export function formulaSourceText(
  source: string,
  allowed: readonly string[],
  options: FormulaTextOptions = {},
): FormulaText | null {
  const parsed = parseFormula(source, allowed);
  return parsed.ok ? formulaText(parsed.program, options) : null;
}

/** 가중치 행(식이 없는 2차 스탯 행) → 판정과 같은 결과를 내는 행 식(statRowExpression)을 글로 */
export function statRowShapeText(
  row: StatRowShape,
  allowed: readonly string[],
  options: FormulaTextOptions = {},
): FormulaText | null {
  return formulaSourceText(statRowExpression(row), allowed, options);
}
