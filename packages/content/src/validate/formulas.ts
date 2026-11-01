// 계산식 검사 — docs/adr/2026-11-01-formula-editor.md. 1단계(스키마) 뒤에 돈다(참조와 같은 단계로 알린다).
// - formulas 항목: ID가 식 칸(@terra/shared COMBAT_FORMULA_IDS)이어야 하고, 식이 그 칸의 변수만으로 읽혀야 한다.
// - stat_rows 행의 formula(선택): 행 식 변수(1차 6개·LV·GEAR·BUFF)만으로 읽혀야 한다.
// 판정 코드(sim)는 검사한 식만 받는다(틀린 식이 들어오면 던진다). 서버 덮어쓰기도 같은 parseFormula로 거절한다.
import {
  COMBAT_FORMULA_IDS,
  COMBAT_FORMULA_SLOTS,
  type FormulaIssue,
  STAT_FORMULA_VARS,
  isCombatFormulaId,
  parseFormula,
  slotVarNames,
} from "@terra/shared/formula";
import type { ContentIssue } from "../issue.ts";
import type { ContentPack } from "../pack.ts";

const field = (entry: { id: string }, key: string): unknown => Reflect.get(entry, key);

/** 식 오류 한 건 → 한국어 문장(위치는 글 안 몇 번째 글자, 1부터) */
function describe(error: FormulaIssue): string {
  const where = `${error.s + 1}번째 글자`;
  const name = error.name === undefined ? "" : ` "${error.name}"`;
  const hint = error.suggestion === undefined ? "" : ` "${error.suggestion}"을(를) 쓰려던 것인가요?`;
  return `식 오류 ${error.code}${name}(${where}).${hint}`;
}

function check(
  file: string,
  id: string,
  path: string,
  source: string,
  allowed: readonly string[],
  issues: ContentIssue[],
): void {
  const result = parseFormula(source, allowed);
  if (result.ok) return;
  for (const error of result.errors)
    issues.push({
      stage: "references",
      level: "error",
      file,
      id,
      path,
      message: `${describe(error)} 쓸 수 있는 이름: ${allowed.join(", ")}. 식을 고치세요.`,
    });
}

export function checkFormulas(pack: ContentPack): ContentIssue[] {
  const issues: ContentIssue[] = [];
  for (const entry of pack.entries.get("formulas") ?? []) {
    if (!isCombatFormulaId(entry.id)) {
      issues.push({
        stage: "references",
        level: "error",
        file: "formulas.json",
        id: entry.id,
        message: `모르는 식 칸입니다. 판정 코드가 읽는 칸(${COMBAT_FORMULA_IDS.join(", ")})만 적으세요.`,
      });
      continue;
    }
    const source = field(entry, "expression");
    if (typeof source === "string")
      check(
        "formulas.json",
        entry.id,
        "expression",
        source,
        slotVarNames(COMBAT_FORMULA_SLOTS[entry.id]),
        issues,
      );
  }
  const statVars = STAT_FORMULA_VARS.map((item) => item.name);
  for (const row of pack.entries.get("stat_rows") ?? []) {
    const source = field(row, "formula");
    if (typeof source === "string") check("stat_rows.json", row.id, "formula", source, statVars, issues);
  }
  return issues;
}
