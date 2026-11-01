// 계산식 덮어쓰기의 칸·줄 모양 — 설정 칸 접근자(state.ts)가 쓴다. docs/adr/2026-11-01-formula-editor.md 7절.
// 칸 = 켜진 2차 스탯 행의 행 식(`<행 ID>.formula`, 팩 차례) + 전투 식(팩 formulas, 칸 차례). 팩 식은 켤 때 한 번 읽는다.
import { type FormulaEntry, type StatRowEntry, packStatRowFormula } from "@terra/content";
import {
  COMBAT_FORMULA_IDS,
  COMBAT_FORMULA_SLOTS,
  DEFAULT_COMBAT_FORMULAS,
  type FormulaIssue,
  type FormulaProgram,
  STAT_FORMULA_VARS,
  parseFormula,
  slotVarNames,
  statFormulaKey,
} from "@terra/shared/formula";

/** DB 줄(계산식 덮어쓰기 하나, 표 formula_overrides) */
export interface FormulaOverrideRecord {
  readonly id: string;
  readonly source: string;
  /** 저장할 때의 팩 식·팩 판 */
  readonly packSource: string;
  readonly contentVersion: string;
  readonly note: string | null;
  readonly updatedById: string | null;
  readonly updatedByName: string | null;
  readonly updatedAtMs: number;
}

/** 묶음의 계산식 하나: source null = 되돌리기(팩 식). 팩 식과 같은 글도 되돌리기로 본다 */
export interface FormulaChange {
  readonly id: string;
  readonly source: string | null;
}

/** plan이 고른 계산식 바꿈 하나(앞·뒤 덮어쓴 식, null = 덮어쓰기 없음) */
export interface PlannedFormulaChange {
  readonly id: string;
  readonly before: string | null;
  readonly after: string | null;
}

/** 계산식 칸 하나(팩 식·변수·이름) */
export interface FormulaSlotInfo {
  readonly key: string;
  readonly group: "stat" | "combat";
  /** 팩 식(행 식은 팩 formula, 없으면 팩 가중치에서 만든 식, 전투 식은 팩 항목이 없으면 기본 식) */
  readonly packSource: string;
  readonly vars: readonly string[];
  readonly name: { readonly ko: string; readonly en: string };
  readonly row: StatRowEntry | null;
}

const STAT_VARS = STAT_FORMULA_VARS.map((item) => item.name);

/** 칸 목록: 켜진 행(팩 차례)의 행 식 → 전투 식(칸 차례) */
export function formulaSlotsOf(
  statRows: readonly StatRowEntry[],
  packFormulas: readonly FormulaEntry[],
): FormulaSlotInfo[] {
  const packFormulaById = new Map(packFormulas.map((entry) => [entry.id, entry]));
  return [
    ...statRows.map(
      (row): FormulaSlotInfo => ({
        key: statFormulaKey(row.id),
        group: "stat",
        packSource: packStatRowFormula(row),
        vars: STAT_VARS,
        name: { ko: row.name.ko, en: row.name.en },
        row,
      }),
    ),
    ...COMBAT_FORMULA_IDS.map((id): FormulaSlotInfo => {
      const entry = packFormulaById.get(id);
      return {
        key: id,
        group: "combat",
        packSource: entry?.expression ?? DEFAULT_COMBAT_FORMULAS[id],
        vars: slotVarNames(COMBAT_FORMULA_SLOTS[id]),
        name: entry ? { ko: entry.name.ko, en: entry.name.en } : { ko: id, en: id },
        row: null,
      };
    }),
  ];
}

/** 식 글을 그 칸 변수로 읽는다(틀리면 오류 목록) */
export function compileSlot(
  slot: FormulaSlotInfo,
  source: string,
): { ok: true; program: FormulaProgram } | { ok: false; errors: readonly FormulaIssue[] } {
  const result = parseFormula(source, slot.vars);
  return result.ok ? { ok: true, program: result.program } : { ok: false, errors: result.errors };
}

/** 식 덮어쓰기 줄 → 칸 키 → 글 */
export const sourcesOf = (records: ReadonlyMap<string, FormulaOverrideRecord>): Map<string, string> =>
  new Map([...records].map(([key, record]) => [key, record.source]));
