// 설정 칸 실효 값 — 접근자 하나(docs/adr/2026-11-01-dev-settings-panel.md 5·6·7절)
// 실효 값 = 팩 값 위에 이 세계(DB)의 덮어쓰기. 서버에서 설정 칸 값을 읽는 곳은 모두 values()·society()를 **쓸 때마다** 부르고,
// 명령 하나는 시작할 때 받은 값 한 벌을 끝까지 쓴다(어디가 읽는지는 scope.ts).
// - 스냅숏: 판·실효 값·덮어쓰기를 든 바뀌지 않는 객체 하나. 바꾸기는 검사한 새 묶음으로 새 스냅숏을 만들어 대입 한 번으로 바꿔 끼운다
//   (한 스레드라 읽는 쪽은 앞 묶음 전체나 뒤 묶음 전체만 본다).
// - plan: 묶음(칸 여러 개)을 바꾼 뒤의 전체 값으로 범위·여러 칸 규칙(@terra/sim tuningProblems)을 본다. 이미 있던 문제는 막지 않고
//   새로 생기는 문제만 막는다. 메모리는 바꾸지 않는다(DB 커밋 뒤에 install).
// - selectAtBoot: 켤 때 DB 줄에서 "가장 나중에 바꾼 것"을 고른다(6절). 오류를 던지지 않는다.
// - 가중치 표(stat_rows) 칸도 같은 덮어쓰기다(docs/adr/2026-11-01-balance-screen.md 1절): 키 `<행 ID>.<칸>`, 켜진 행·모양에 있는 칸만.
//   statTable()은 스냅숏마다 한 번 만든 실효 표(sim StatRow, 켜진 행). 여러 칸 규칙에 statTableProblems(가치 없는 1차)를 더한다.
// - 계산식(docs/adr/2026-11-01-formula-editor.md)도 같은 판·감사·켤 때 고르기를 쓴다: 칸 키 = 전투 식 ID(팩 formulas) 또는
//   `<행 ID>.formula`(행 식). 값은 글이라 따로 든다(formulas). 식은 그 칸 변수로 읽혀야 받고(invalid_formula), 행 식은 가치 없는 1차
//   검사(식이 쓰는 1차 변수)에도 든다. combatFormulas()는 스냅숏마다 한 번 만든 전투 식 묶음(sim 계수표에 싣는다).
import {
  type FormulaEntry,
  type StatRowEntry,
  type TuningEntry,
  statRowCell,
  tuningValueInRange,
  withStatRowCell,
} from "@terra/content";
import {
  type CombatFormulaId,
  type FormulaIssue,
  type FormulaProgram,
  isCombatFormulaId,
  parseStatFormulaKey,
  statRowExpression,
} from "@terra/shared/formula";
import {
  type StatCellField,
  type TuningDropReason,
  type TuningProblem,
  type TuningUnit,
  parseStatCellKey,
  statCellFieldsOf,
  statCellInRange,
  statCellUnit,
  tuningUnitFromName,
} from "@terra/shared/tuning";
import {
  type CombatFormulaSet,
  type SocietyCoefficients,
  type StatRow,
  combatFormulaSetFrom,
  newTuningProblems,
  societyCoefficientsFrom,
  statTableProblems,
  tuningProblems,
} from "@terra/sim";
import {
  type FormulaChange,
  type FormulaOverrideRecord,
  type FormulaSlotInfo,
  type PlannedFormulaChange,
  compileSlot,
  formulaSlotsOf,
  sourcesOf,
} from "./formulaSlots.ts";

export type {
  FormulaChange,
  FormulaOverrideRecord,
  FormulaSlotInfo,
  PlannedFormulaChange,
} from "./formulaSlots.ts";

/** DB 줄(덮어쓰기 하나) */
export interface TuningOverrideRecord {
  readonly id: string;
  readonly value: number;
  /** 저장할 때의 팩 값·단위·팩 판 */
  readonly packValue: number;
  readonly unit: string | null;
  readonly contentVersion: string;
  readonly note: string | null;
  readonly updatedById: string | null;
  /** 바꾼 사람 계정 이름(지운 계정이면 null) */
  readonly updatedByName: string | null;
  readonly updatedAtMs: number;
}

/** 바뀌지 않는 값 한 벌 */
export interface TuningSnapshot {
  /** 세계 설정 판(DB tuning_revision) */
  readonly revision: number;
  /** 실효 값(팩 ID → 값). 가중치 칸은 덮어쓴 칸만 든다(키 `<행 ID>.<칸>`) */
  readonly values: ReadonlyMap<string, number>;
  /** 듣는 덮어쓰기(팩에 있고 맞는 것만) */
  readonly overrides: ReadonlyMap<string, TuningOverrideRecord>;
  /** 듣는 계산식 덮어쓰기(칸 키 → 줄) */
  readonly formulas: ReadonlyMap<string, FormulaOverrideRecord>;
}

/** 묶음의 칸 하나: value null = 되돌리기(팩 값). 팩 값과 같은 값도 되돌리기로 본다 */
export interface TuningChange {
  readonly id: string;
  readonly value: number | null;
}

/** plan이 고른 바꿈 하나(앞·뒤 덮어쓰기 값, null = 덮어쓰기 없음) */
export interface PlannedChange {
  readonly id: string;
  readonly before: number | null;
  readonly after: number | null;
}

export type TuningPlan =
  | {
      readonly ok: true;
      /** 실제로 바뀌는 칸(같은 값·없는 덮어쓰기 되돌리기는 빠진다) */
      readonly changes: readonly PlannedChange[];
      /** 실제로 바뀌는 계산식 */
      readonly formulas: readonly PlannedFormulaChange[];
    }
  | {
      readonly ok: false;
      readonly reason:
        | "unknown_entry"
        | "out_of_range"
        | "rules_conflict"
        | "duplicate_entry"
        | "invalid_formula";
      readonly id: string | null;
      readonly problems: readonly TuningProblem[];
      /** invalid_formula: 식 오류(코드·위치) */
      readonly formulaErrors?: readonly FormulaIssue[];
    };

/** 켤 때 고른 결과 */
export interface BootSelection {
  /** 듣는 줄 */
  readonly keep: readonly TuningOverrideRecord[];
  /** 팩이 더 나중에 바꾼 칸(덮어쓰기를 지운다, 감사 tuning.pack_won) */
  readonly packWon: readonly { readonly row: TuningOverrideRecord; readonly packValue: number }[];
  /** 새 팩과 맞지 않는 줄(지운다, 감사 tuning.dropped) */
  readonly dropped: readonly { readonly row: TuningOverrideRecord; readonly reason: TuningDropReason }[];
  /** 계산식 줄: 듣는 줄·팩이 이긴 줄·지울 줄 */
  readonly formulaKeep: readonly FormulaOverrideRecord[];
  readonly formulaPackWon: readonly { readonly row: FormulaOverrideRecord; readonly packSource: string }[];
  readonly formulaDropped: readonly {
    readonly row: FormulaOverrideRecord;
    readonly reason: TuningDropReason;
  }[];
}

/** 가중치 칸 하나(팩 행·칸·팩 값·단위) */
export interface StatCellInfo {
  readonly key: string;
  readonly row: StatRowEntry;
  readonly field: StatCellField;
  readonly packValue: number;
  readonly unit: TuningUnit;
}

/** 덮어쓸 수 있는 칸 하나(설정 칸 또는 가중치 칸)의 팩 값·단위·범위·구조 값 */
export interface TuningSlot {
  readonly packValue: number;
  readonly unit: TuningUnit | null;
  readonly structural: boolean;
  inRange(value: number): boolean;
}

export interface TuningState {
  /** 팩 tuning 항목(팩 차례) */
  readonly entries: readonly TuningEntry[];
  /** 팩 stat_rows 켜진 행(팩 차례) */
  readonly statRows: readonly StatRowEntry[];
  entry(id: string): TuningEntry | undefined;
  /** 가중치 칸 키 → 칸(켜진 행·모양에 있는 칸만, 아니면 undefined) */
  statCell(key: string): StatCellInfo | undefined;
  /** 설정 칸 ID 또는 가중치 칸 키 → 칸(팩에 없으면 undefined) */
  slot(id: string): TuningSlot | undefined;
  /** 칸의 단위(팩 unit, 없으면 영어 이름 끝 괄호) */
  unitOf(entry: TuningEntry): TuningUnit | null;
  /** 지금 값 한 벌. 명령 하나는 이것 하나를 받아 끝까지 쓴다 */
  snapshot(): TuningSnapshot;
  values(): ReadonlyMap<string, number>;
  /** 지금 스냅숏의 세력·사회 계수표(스냅숏마다 한 번 만든다) */
  society(): SocietyCoefficients;
  /** 지금 스냅숏의 가중치 표(켜진 행, 팩 + 덮어쓰기). 스냅숏마다 한 번 만든 바뀌지 않는 배열 */
  statTable(): readonly StatRow[];
  /** 지금 표 위에 묶음을 얹은 표(검사와 상관없이 팩에 있고 범위 안인 가중치 칸만 얹는다, 밸런스 화면 미리 보기) */
  statTableWith(changes: readonly TuningChange[]): readonly StatRow[];
  /**
   * 가중치 칸 바꿈 + 계산식 바꿈(칸 키 → 글)을 얹은 가중치 표와 전투 식 묶음(세계 값은 바꾸지 않는다 — 전투 보고서 A/B의 B, 기획 D-560 1381).
   * 모르는 칸이면 unknown_formula, 그 칸 변수로 읽히지 않으면 invalid_formula(key = 그 칸)
   */
  rulesWithFormulas(
    changes: readonly TuningChange[],
    formulas: readonly { readonly key: string; readonly source: string }[],
  ):
    | { readonly ok: true; readonly statTable: readonly StatRow[]; readonly combat: CombatFormulaSet }
    | { readonly ok: false; readonly reason: "unknown_formula" | "invalid_formula"; readonly key: string };
  /** 계산식 칸(행 식은 켜진 행 팩 차례, 그다음 전투 식) */
  readonly formulaSlots: readonly FormulaSlotInfo[];
  formulaSlot(key: string): FormulaSlotInfo | undefined;
  /** 지금 실효 식 글(덮어쓰기 → 팩 식, 행 식이 없는 행은 실효 가중치에서 만든 식) */
  formulaSource(key: string): string | undefined;
  /** 지금 스냅숏의 전투 식 묶음(스냅숏마다 한 번 만든다, sim combatCoefficientsFrom의 formulas) */
  combatFormulas(): CombatFormulaSet;
  /** 덮어쓴 계산식 수 */
  formulaOverrideCount(): number;
  revision(): number;
  /** 덮어쓴 칸 수(/health·지표, 가중치 칸 포함) */
  appliedCount(): number;
  /** 덮어쓴 가중치 칸 수 */
  statOverrideCount(): number;
  /** 지금 실효 값의 규칙 문제(팩이 틀렸을 때 켤 때 알린다) */
  problems(): TuningProblem[];
  /** 묶음(칸·계산식)을 바꾼 뒤의 전체 값으로 검사한다(메모리는 그대로) */
  plan(changes: readonly TuningChange[], formulas?: readonly FormulaChange[]): TuningPlan;
  /** 켤 때: DB 줄에서 듣는 줄·팩이 이긴 줄·지울 줄을 고른다(메모리는 그대로, 던지지 않는다) */
  selectAtBoot(
    rows: readonly TuningOverrideRecord[],
    formulaRows?: readonly FormulaOverrideRecord[],
  ): BootSelection;
  /**
   * 새 스냅숏으로 바꿔 끼운다(DB 커밋 뒤). 팩에 없는 ID·읽히지 않는 식은 넣지 않는다. formulas를 주지 않으면 지금 식 덮어쓰기를
   * 그대로 둔다(칸만 바꾼 묶음)
   */
  install(
    overrides: Iterable<TuningOverrideRecord>,
    revision: number,
    formulas?: Iterable<FormulaOverrideRecord>,
  ): void;
}

/** 칸의 단위: 팩 unit, 없으면 영어 이름 끝 괄호 */
const unitOf = (entry: TuningEntry): TuningUnit | null => entry.unit ?? tuningUnitFromName(entry.name.en);

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** 팩 행 + 값 표(가중치 칸 키 → 값) → 실효 팩 행(가중치 칸을 얹은 것) */
function effectiveRow(pack: StatRowEntry, values: ReadonlyMap<string, number>): StatRowEntry {
  let row = pack;
  for (const field of statCellFieldsOf(pack.shape)) {
    const value = values.get(`${pack.id}.${field}`);
    if (value !== undefined) row = withStatRowCell(row, field, value);
  }
  return row;
}

/** 팩 행 + 값 표 + 행 식(행 ID → 읽은 식) → sim 가중치 표 */
function statTableFrom(
  rows: readonly StatRowEntry[],
  values: ReadonlyMap<string, number>,
  formulas: ReadonlyMap<string, FormulaProgram> = new Map(),
): StatRow[] {
  return rows.map((pack): StatRow => {
    const row = effectiveRow(pack, values);
    const formula = formulas.get(row.id);
    const extra = formula ? { formula } : {};
    return row.shape === "quantity"
      ? { id: row.id, shape: "quantity", base: row.base, weights: row.weights, ...extra }
      : {
          id: row.id,
          shape: "probability",
          cap: row.cap,
          halfConstant: row.halfConstant,
          weights: row.weights,
          ...extra,
        };
  });
}

/** 값의 규칙 문제 전체(세력·사회 + 가중치 표) */
function allProblems(society: SocietyCoefficients, table: readonly StatRow[]): TuningProblem[] {
  return [...tuningProblems(society), ...statTableProblems(table)];
}

export function createTuningState(
  entries: readonly TuningEntry[],
  packStatRows: readonly StatRowEntry[] = [],
  packFormulas: readonly FormulaEntry[] = [],
): TuningState {
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const statRows = packStatRows.filter((row) => row.enabled);
  const statRowById = new Map(statRows.map((row) => [row.id, row]));
  const packValues: ReadonlyMap<string, number> = new Map(entries.map((entry) => [entry.id, entry.value]));

  // 계산식 칸: 켜진 행의 행 식(팩 차례) → 전투 식(칸 차례). 팩 식은 켤 때 한 번 읽는다(팩 검사가 본 식)
  const formulaSlots = formulaSlotsOf(statRows, packFormulas);
  const formulaSlotByKey = new Map(formulaSlots.map((slot) => [slot.key, slot]));
  /** 팩의 행 식(행 ID → 읽은 식): 팩 행에 formula가 있을 때만 */
  const packRowPrograms = new Map<string, FormulaProgram>();
  for (const slot of formulaSlots) {
    if (slot.row?.formula === undefined) continue;
    const compiled = compileSlot(slot, slot.row.formula);
    if (compiled.ok) packRowPrograms.set(slot.row.id, compiled.program);
  }
  /** 덮어쓴 식(칸 키 → 읽은 식). 글이 같으면 다시 읽지 않는다 */
  const programCache = new Map<string, { source: string; program: FormulaProgram }>();
  const programOf = (key: string, source: string): FormulaProgram | undefined => {
    const hit = programCache.get(key);
    if (hit?.source === source) return hit.program;
    const slot = formulaSlotByKey.get(key);
    const compiled = slot ? compileSlot(slot, source) : undefined;
    if (!compiled?.ok) return undefined;
    programCache.set(key, { source, program: compiled.program });
    return compiled.program;
  };
  /** 식 덮어쓰기(칸 키 → 글)에서 행 ID → 실효 행 식 */
  const rowProgramsFrom = (formulas: ReadonlyMap<string, string>): Map<string, FormulaProgram> => {
    const out = new Map(packRowPrograms);
    for (const [key, source] of formulas) {
      const rowId = parseStatFormulaKey(key);
      const program = rowId === null ? undefined : programOf(key, source);
      if (rowId !== null && program) out.set(rowId, program);
    }
    return out;
  };

  let current: TuningSnapshot = {
    revision: 0,
    values: packValues,
    overrides: new Map(),
    formulas: new Map(),
  };
  let cached: { snapshot: TuningSnapshot; society: SocietyCoefficients } | undefined;
  let cachedTable: { snapshot: TuningSnapshot; table: readonly StatRow[] } | undefined;
  let cachedCombat: { snapshot: TuningSnapshot; set: CombatFormulaSet } | undefined;

  const society = (): SocietyCoefficients => {
    const snapshot = current;
    if (cached?.snapshot !== snapshot)
      cached = { snapshot, society: societyCoefficientsFrom(snapshot.values) };
    return cached.society;
  };

  const statTable = (): readonly StatRow[] => {
    const snapshot = current;
    if (cachedTable?.snapshot !== snapshot)
      cachedTable = {
        snapshot,
        table: Object.freeze(
          statTableFrom(statRows, snapshot.values, rowProgramsFrom(sourcesOf(snapshot.formulas))),
        ),
      };
    return cachedTable.table;
  };

  /** 전투 식 묶음(칸 ID → 글: 덮어쓰기 → 팩 식) */
  const combatSetFrom = (formulas: ReadonlyMap<string, string>): CombatFormulaSet => {
    const sources: Partial<Record<CombatFormulaId, string>> = {};
    for (const slot of formulaSlots) {
      if (slot.group !== "combat" || !isCombatFormulaId(slot.key)) continue;
      sources[slot.key] = formulas.get(slot.key) ?? slot.packSource;
    }
    return combatFormulaSetFrom(sources);
  };

  const combatFormulas = (): CombatFormulaSet => {
    const snapshot = current;
    if (cachedCombat?.snapshot !== snapshot)
      cachedCombat = { snapshot, set: combatSetFrom(sourcesOf(snapshot.formulas)) };
    return cachedCombat.set;
  };

  /** 지금 실효 식 글 */
  const formulaSource = (key: string): string | undefined => {
    const slot = formulaSlotByKey.get(key);
    if (!slot) return undefined;
    const record = current.formulas.get(key);
    if (record) return record.source;
    if (slot.row && slot.row.formula === undefined)
      return statRowExpression(effectiveRow(slot.row, current.values));
    return slot.packSource;
  };

  const statCell = (key: string): StatCellInfo | undefined => {
    const parsed = parseStatCellKey(key);
    const row = parsed ? statRowById.get(parsed.row) : undefined;
    if (!parsed || !row || !statCellFieldsOf(row.shape).includes(parsed.field)) return undefined;
    const packValue = statRowCell(row, parsed.field);
    if (packValue === undefined) return undefined;
    return { key, row, field: parsed.field, packValue, unit: statCellUnit(parsed.field) };
  };

  const slot = (id: string): TuningSlot | undefined => {
    const entry = entryById.get(id);
    if (entry)
      return {
        packValue: entry.value,
        unit: unitOf(entry),
        structural: entry.structural,
        inRange: (value) => tuningValueInRange(entry, value),
      };
    const cell = statCell(id);
    if (cell)
      return {
        packValue: cell.packValue,
        unit: cell.unit,
        structural: false,
        inRange: (value) => statCellInRange(cell.field, value),
      };
    return undefined;
  };

  /** base 값에서 next로 바꾸면 새로 생기는 규칙 문제(세력·사회 + 가중치 표·행 식) */
  const newProblems = (
    base: { society: SocietyCoefficients; table: readonly StatRow[] },
    next: ReadonlyMap<string, number>,
    nextFormulas: ReadonlyMap<string, string>,
  ): TuningProblem[] =>
    newTuningProblems(
      allProblems(base.society, base.table),
      allProblems(
        societyCoefficientsFrom(next),
        statTableFrom(statRows, next, rowProgramsFrom(nextFormulas)),
      ),
    );

  return {
    entries,
    statRows,
    formulaSlots,
    formulaSlot: (key) => formulaSlotByKey.get(key),
    formulaSource,
    combatFormulas,
    formulaOverrideCount: () => current.formulas.size,
    entry: (id) => entryById.get(id),
    statCell,
    slot,
    unitOf,
    snapshot: () => current,
    values: () => current.values,
    society,
    statTable,
    statTableWith(changes) {
      if (changes.length === 0) return statTable();
      const next = new Map(current.values);
      for (const change of changes) {
        const cell = statCell(change.id);
        if (!cell) continue;
        const value = change.value ?? cell.packValue;
        if (statCellInRange(cell.field, value)) next.set(change.id, value);
      }
      return statTableFrom(statRows, next, rowProgramsFrom(sourcesOf(current.formulas)));
    },
    rulesWithFormulas(changes, formulas) {
      const sources = sourcesOf(current.formulas);
      for (const change of formulas) {
        const target = formulaSlotByKey.get(change.key);
        if (!target) return { ok: false, reason: "unknown_formula", key: change.key };
        if (!compileSlot(target, change.source).ok)
          return { ok: false, reason: "invalid_formula", key: change.key };
        sources.set(change.key, change.source);
      }
      const next = new Map(current.values);
      for (const change of changes) {
        const cell = statCell(change.id);
        if (!cell) continue;
        const value = change.value ?? cell.packValue;
        if (statCellInRange(cell.field, value)) next.set(change.id, value);
      }
      return {
        ok: true,
        statTable: statTableFrom(statRows, next, rowProgramsFrom(sources)),
        combat: combatSetFrom(sources),
      };
    },
    revision: () => current.revision,
    appliedCount: () => current.overrides.size + current.formulas.size,
    statOverrideCount: () => [...current.overrides.keys()].filter((id) => statCell(id) !== undefined).length,
    problems: () => allProblems(society(), statTable()),

    plan(changes, formulaChanges = []) {
      const snapshot = current;
      const seen = new Set<string>();
      const next = new Map(snapshot.values);
      const planned: PlannedChange[] = [];
      for (const change of changes) {
        if (seen.has(change.id)) return { ok: false, reason: "duplicate_entry", id: change.id, problems: [] };
        seen.add(change.id);
        const target = slot(change.id);
        const before = snapshot.overrides.get(change.id)?.value ?? null;
        if (!target) {
          // 팩에 없는 칸: 덮어쓰기도 없다(켤 때 지운다). 되돌리기는 할 일이 없고, 값은 받지 않는다
          if (change.value === null) continue;
          return { ok: false, reason: "unknown_entry", id: change.id, problems: [] };
        }
        const after = change.value === null || change.value === target.packValue ? null : change.value;
        if (after !== null && !target.inRange(after))
          return { ok: false, reason: "out_of_range", id: change.id, problems: [] };
        if (after === before) continue;
        next.set(change.id, after ?? target.packValue);
        planned.push({ id: change.id, before, after });
      }
      // 계산식: 칸이 있는가 → 그 칸 변수로 읽히나 → 앞 덮어쓰기와 다른가. 팩 식과 같은 글(앞뒤 빈칸 무시)은 되돌리기
      const nextFormulas = sourcesOf(snapshot.formulas);
      const plannedFormulas: PlannedFormulaChange[] = [];
      const seenFormulas = new Set<string>();
      for (const change of formulaChanges) {
        if (seenFormulas.has(change.id))
          return { ok: false, reason: "duplicate_entry", id: change.id, problems: [] };
        seenFormulas.add(change.id);
        const target = formulaSlotByKey.get(change.id);
        const before = snapshot.formulas.get(change.id)?.source ?? null;
        if (!target) {
          if (change.source === null) continue;
          return { ok: false, reason: "unknown_entry", id: change.id, problems: [] };
        }
        const trimmed = change.source?.trim() ?? null;
        const after = trimmed === null || trimmed === target.packSource.trim() ? null : trimmed;
        if (after !== null) {
          const compiled = compileSlot(target, after);
          if (!compiled.ok)
            return {
              ok: false,
              reason: "invalid_formula",
              id: change.id,
              problems: [],
              formulaErrors: compiled.errors,
            };
        }
        if (after === before) continue;
        if (after === null) nextFormulas.delete(change.id);
        else nextFormulas.set(change.id, after);
        plannedFormulas.push({ id: change.id, before, after });
      }
      const problems = newProblems({ society: society(), table: statTable() }, next, nextFormulas);
      if (problems.length > 0) return { ok: false, reason: "rules_conflict", id: null, problems };
      return { ok: true, changes: planned, formulas: plannedFormulas };
    },

    selectAtBoot(rows, formulaRows = []) {
      const keep: TuningOverrideRecord[] = [];
      const packWon: { row: TuningOverrideRecord; packValue: number }[] = [];
      const dropped: { row: TuningOverrideRecord; reason: TuningDropReason }[] = [];
      const noFormulas = new Map<string, string>();
      let values = new Map(packValues);
      let base = { society: societyCoefficientsFrom(values), table: statTableFrom(statRows, values) };
      // 저장한 차례로 얹는다(앞 덮어쓰기와 맞지 않는 뒤 덮어쓰기가 빠진다). 같은 시각이면 ID 차례
      const ordered = rows.toSorted((a, b) => a.updatedAtMs - b.updatedAtMs || byId(a, b));
      for (const row of ordered) {
        const target = slot(row.id);
        if (!target) {
          dropped.push({ row, reason: "unknown_entry" });
          continue;
        }
        // 가장 나중에 바꾼 것이 이긴다: 저장 뒤에 팩 값이 바뀌었으면(배포) 팩이 더 나중이다. 팩 값과 같은 덮어쓰기도 팩 값이 든다
        if (target.packValue !== row.packValue || row.value === target.packValue) {
          packWon.push({ row, packValue: target.packValue });
          continue;
        }
        if (target.unit !== row.unit) {
          dropped.push({ row, reason: "unit_changed" });
          continue;
        }
        if (!target.inRange(row.value)) {
          dropped.push({ row, reason: "out_of_range" });
          continue;
        }
        const next = new Map(values);
        next.set(row.id, row.value);
        let problems: TuningProblem[];
        try {
          problems = newProblems(base, next, noFormulas);
        } catch {
          // 계수표를 만들지 못하는 값(코드 표와 팩이 어긋남)도 시작을 막지 않는다
          problems = ["n9_fit"];
        }
        if (problems.length > 0) {
          dropped.push({ row, reason: "rules_conflict" });
          continue;
        }
        keep.push(row);
        values = next;
        base = { society: societyCoefficientsFrom(values), table: statTableFrom(statRows, values) };
      }
      // 계산식 줄: 칸 → 팩 식이 저장 뒤에 바뀌었나(팩이 이김) → 새 팩 변수로 읽히나 → 규칙(가치 없는 1차). 칸 값 뒤에 얹는다
      const formulaKeep: FormulaOverrideRecord[] = [];
      const formulaPackWon: { row: FormulaOverrideRecord; packSource: string }[] = [];
      const formulaDropped: { row: FormulaOverrideRecord; reason: TuningDropReason }[] = [];
      const sources = new Map<string, string>();
      for (const row of formulaRows.toSorted((a, b) => a.updatedAtMs - b.updatedAtMs || byId(a, b))) {
        const target = formulaSlotByKey.get(row.id);
        if (!target) {
          formulaDropped.push({ row, reason: "unknown_entry" });
          continue;
        }
        if (target.packSource !== row.packSource || row.source === target.packSource) {
          formulaPackWon.push({ row, packSource: target.packSource });
          continue;
        }
        if (!compileSlot(target, row.source).ok) {
          formulaDropped.push({ row, reason: "invalid_formula" });
          continue;
        }
        const next = new Map(sources);
        next.set(row.id, row.source);
        let problems: TuningProblem[];
        try {
          problems = newProblems(base, values, next);
        } catch {
          problems = ["stat_primary_unused"];
        }
        if (problems.length > 0) {
          formulaDropped.push({ row, reason: "rules_conflict" });
          continue;
        }
        formulaKeep.push(row);
        sources.set(row.id, row.source);
        base = { society: base.society, table: statTableFrom(statRows, values, rowProgramsFrom(sources)) };
      }
      return { keep, packWon, dropped, formulaKeep, formulaPackWon, formulaDropped };
    },

    install(overrides, revision, formulas) {
      const map = new Map<string, TuningOverrideRecord>();
      const values = new Map(packValues);
      for (const record of [...overrides].toSorted(byId)) {
        if (!slot(record.id)) continue;
        map.set(record.id, record);
        values.set(record.id, record.value);
      }
      const formulaRecords = [...(formulas ?? current.formulas.values())].toSorted(byId);
      const formulaMap = new Map<string, FormulaOverrideRecord>();
      for (const record of formulaRecords)
        if (programOf(record.id, record.source)) formulaMap.set(record.id, record);
      // 대입 한 번: 읽는 쪽은 앞 스냅숏이나 이 스냅숏만 본다
      current = { revision, values, overrides: map, formulas: formulaMap };
    },
  };
}
