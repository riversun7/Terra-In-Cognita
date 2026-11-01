// 계산식 차이(내보내기) — docs/adr/2026-11-01-formula-editor.md "내보내기"
// 설정 칸 차이(terra-tuning-diff, tuningDiff.ts)의 선택 칸 formulas: [{ id, from, to }]. id = 전투 식 ID(팩 formulas) 또는
// `<stat_rows 행 ID>.formula`(행 식). from = 내보낼 때의 팩 식(행 식은 팩 formula, 없으면 가중치에서 만든 식), to = 덮어쓴 식.
// - 팩에 넣기(pnpm tuning:apply): applyFormulasDiff가 formulas.json의 expression·stat_rows.json의 formula만 바꾼다.
// - 시뮬레이터(--tuning): overlayFormulasDiff가 팩 위에 얹는다(서버 세계와 같은 실효 식).
// 칸마다: 팩에 있는가(없으면 unknown), 지금 팩 식 = from인가(아니면 stale, force면 넣음), 그 칸 변수로 읽히나(아니면 invalid).
// Node API를 쓰지 않는다(파일 읽기는 부르는 쪽).
import {
  COMBAT_FORMULA_SLOTS,
  DEFAULT_COMBAT_FORMULAS,
  FORMULA_MAX_LENGTH,
  STAT_FORMULA_VARS,
  isCombatFormulaId,
  parseFormula,
  parseStatFormulaKey,
  slotVarNames,
  statRowExpression,
} from "@terra/shared/formula";
import { z } from "zod";
import { type FormulaEntry, formulaEntrySchema } from "./schema/formulas.ts";
import { type StatRowEntry, statRowEntrySchema } from "./schema/stats.ts";

/** 식 칸 키: 전투 식 ID 또는 `<행 ID>.formula` */
const formulaKey = z.string().regex(/^[a-z][a-z0-9_]{1,47}(\.formula)?$/);

export const formulaDiffChangeSchema = z.strictObject({
  id: formulaKey,
  /** 내보낼 때의 팩 식 */
  from: z.string().max(FORMULA_MAX_LENGTH),
  /** 덮어쓴 식 */
  to: z.string().min(1).max(FORMULA_MAX_LENGTH),
});
export type FormulaDiffChange = z.output<typeof formulaDiffChangeSchema>;

export type FormulaDiffSkip = "unknown" | "stale" | "invalid";

const STAT_VARS = STAT_FORMULA_VARS.map((item) => item.name);

/** 항목 얕은 복사(원래 배열을 고치지 않는다) */
const copy = (raw: unknown): unknown => (typeof raw === "object" && raw !== null ? { ...raw } : raw);

/** 팩 행 식(없으면 가중치에서 만든 식) */
export function packStatRowFormula(row: StatRowEntry): string {
  return row.formula ?? statRowExpression(row);
}

/** 칸 키의 지금 팩 식과 변수(팩에 없는 칸·꺼진 행이면 undefined) */
function slotOf(
  key: string,
  formulas: readonly FormulaEntry[],
  rows: readonly StatRowEntry[],
): { source: string; vars: readonly string[]; row: number | null; entry: number | null } | undefined {
  const rowId = parseStatFormulaKey(key);
  if (rowId !== null) {
    const index = rows.findIndex((row) => row.id === rowId && row.enabled);
    const row = rows[index];
    return row ? { source: packStatRowFormula(row), vars: STAT_VARS, row: index, entry: null } : undefined;
  }
  if (!isCombatFormulaId(key)) return undefined;
  const index = formulas.findIndex((entry) => entry.id === key);
  const entry = formulas[index];
  return {
    source: entry?.expression ?? DEFAULT_COMBAT_FORMULAS[key],
    vars: slotVarNames(COMBAT_FORMULA_SLOTS[key]),
    row: null,
    entry: entry ? index : null,
  };
}

/**
 * 팩 위에 식 차이를 얹는다(시뮬레이터 --tuning). 결과: 전투 식(ID → 글, 바뀐 칸만)·행 식을 넣은 행 목록.
 * 팩에 없는 칸·틀린 식은 얹지 않는다(unknown·invalid), 팩 식이 from과 다르면 stale에 적는다
 */
export function overlayFormulasDiff(
  formulas: readonly FormulaEntry[],
  rows: readonly StatRowEntry[],
  changes: readonly FormulaDiffChange[],
): {
  formulas: Map<string, string>;
  rows: StatRowEntry[];
  unknown: string[];
  stale: string[];
  invalid: string[];
} {
  const combat = new Map(formulas.map((entry) => [entry.id, entry.expression]));
  const outRows = [...rows];
  const unknown: string[] = [];
  const stale: string[] = [];
  const invalid: string[] = [];
  for (const change of changes) {
    const slot = slotOf(change.id, formulas, rows);
    if (!slot) {
      unknown.push(change.id);
      continue;
    }
    if (!parseFormula(change.to, slot.vars).ok) {
      invalid.push(change.id);
      continue;
    }
    if (slot.source !== change.from) stale.push(change.id);
    if (slot.row !== null) {
      const row = outRows[slot.row];
      if (row) outRows[slot.row] = { ...row, formula: change.to };
    } else combat.set(change.id, change.to);
  }
  return { formulas: combat, rows: outRows, unknown, stale, invalid };
}

export interface FormulasApplyResult {
  /** 고친 formulas.json·stat_rows.json 항목(원래 객체의 다른 칸·키 차례는 그대로) */
  readonly formulaEntries: unknown[];
  readonly statRowEntries: unknown[];
  readonly applied: { id: string; from: string; to: string }[];
  readonly skipped: { id: string; reason: FormulaDiffSkip }[];
}

/**
 * 팩 formulas.json·stat_rows.json 항목 배열(JSON.parse 그대로)에 식 차이를 적용한다(pnpm tuning:apply).
 * 전투 식은 그 항목의 expression을, 행 식은 그 행의 formula를 바꾼다(팩 formulas에 없는 전투 식 칸은 unknown).
 * 바꾼 항목은 스키마로 다시 검사한다. 항목 모양이 틀렸으면 던진다(팩 검사부터 고친다)
 */
export function applyFormulasDiff(
  rawFormulaEntries: readonly unknown[],
  rawStatRows: readonly unknown[],
  changes: readonly FormulaDiffChange[],
  options: {
    force?: boolean;
    /** from을 견줄 행(같은 차이의 가중치 칸을 넣기 전 팩 행). 없으면 rawStatRows */
    compareRows?: readonly unknown[];
  } = {},
): FormulasApplyResult {
  const formulas: FormulaEntry[] = rawFormulaEntries.map((raw) => formulaEntrySchema.parse(raw));
  const rows: StatRowEntry[] = (options.compareRows ?? rawStatRows).map((raw) =>
    statRowEntrySchema.parse(raw),
  );
  const formulaEntries = rawFormulaEntries.map(copy);
  const statRowEntries = rawStatRows.map(copy);
  const applied: FormulasApplyResult["applied"] = [];
  const skipped: FormulasApplyResult["skipped"] = [];
  for (const change of changes) {
    const slot = slotOf(change.id, formulas, rows);
    if (!slot || (slot.row === null && slot.entry === null)) {
      skipped.push({ id: change.id, reason: "unknown" });
      continue;
    }
    if (slot.source !== change.from && !options.force) {
      skipped.push({ id: change.id, reason: "stale" });
      continue;
    }
    if (!parseFormula(change.to, slot.vars).ok) {
      skipped.push({ id: change.id, reason: "invalid" });
      continue;
    }
    const target = slot.row !== null ? statRowEntries[slot.row] : formulaEntries[slot.entry ?? -1];
    if (typeof target !== "object" || target === null) continue;
    Reflect.set(target, slot.row !== null ? "formula" : "expression", change.to);
    if (slot.row !== null) statRowEntrySchema.parse(target);
    else formulaEntrySchema.parse(target);
    applied.push({ id: change.id, from: slot.source, to: change.to });
  }
  return { formulaEntries, statRowEntries, applied, skipped };
}
