// 콘텐츠 팩 → 전투 자료(스탯 표·효과 사전·스킬·장비·유닛 종류) — docs/adr/2026-10-31-combat-core.md 7절
// 검증을 통과한 팩의 파일을 분류 스키마로 다시 읽어 @terra/sim combatCatalogFrom에 넘긴다(시뮬 실행 도구와 같은 변환).
// 지금은 시험이 쓴다. 세계에서 전투를 열 때(R5) 서버가 유닛 사양을 만들 때 쓴다.
import {
  type FormulaEntry,
  type PackSource,
  type StatRowEntry,
  type TuningEntry,
  effectEntrySchema,
  formulaEntrySchema,
  itemEntrySchema,
  parseJson,
  skillEntrySchema,
  statRowEntrySchema,
  tuningEntrySchema,
  unitKindEntrySchema,
} from "@terra/content";
import { type CombatCatalog, combatCatalogFrom } from "@terra/sim";

function entriesOf<T>(source: PackSource, file: string, parse: (raw: unknown) => T): T[] {
  const text = source.files.get(file);
  if (text === undefined) return [];
  const value: unknown = parseJson(text);
  const entries: unknown =
    typeof value === "object" && value !== null ? Reflect.get(value, "entries") : undefined;
  if (!Array.isArray(entries)) return [];
  const list: readonly unknown[] = entries;
  return list.map(parse);
}

export function combatCatalogOf(source: PackSource): CombatCatalog {
  return combatCatalogFrom({
    statRows: entriesOf(source, "stat_rows.json", (raw) => statRowEntrySchema.parse(raw)),
    effects: entriesOf(source, "effects.json", (raw) => effectEntrySchema.parse(raw)),
    skills: entriesOf(source, "skills.json", (raw) => skillEntrySchema.parse(raw)),
    items: entriesOf(source, "items.json", (raw) => itemEntrySchema.parse(raw)),
    unitKinds: entriesOf(source, "unit_kinds.json", (raw) => unitKindEntrySchema.parse(raw)),
  });
}

/** 팩 `stat_rows` 항목(팩 차례, 꺼진 행 포함). 서버의 설정 칸 접근자가 가중치 칸 덮어쓰기에 쓴다(밸런스 화면) */
export function statRowsOf(source: PackSource): StatRowEntry[] {
  return entriesOf(source, "stat_rows.json", (raw) => statRowEntrySchema.parse(raw));
}

/** 팩 `formulas` 항목(전투 계산식, docs/adr/2026-11-01-formula-editor.md). 서버의 설정 칸 접근자가 식 덮어쓰기에 쓴다 */
export function formulaEntriesOf(source: PackSource): FormulaEntry[] {
  return entriesOf(source, "formulas.json", (raw) => formulaEntrySchema.parse(raw));
}

/** 팩 `tuning` 항목(팩 차례). 서버의 설정 칸 접근자(src/tuning/state.ts)가 받는다 */
export function tuningEntriesOf(source: PackSource): TuningEntry[] {
  return entriesOf(source, "tuning.json", (raw) => tuningEntrySchema.parse(raw));
}

/**
 * 팩 `tuning`(설정 칸 값): 항목 ID → 정수. 계수표는 @terra/sim combatCoefficientsFrom·societyCoefficientsFrom이 만든다.
 * 팩 값 그대로다(덮어쓰기 없음). 서버 실행 중의 실효 값은 src/tuning/state.ts
 */
export function tuningOf(source: PackSource): Map<string, number> {
  return new Map(tuningEntriesOf(source).map((entry) => [entry.id, entry.value]));
}
