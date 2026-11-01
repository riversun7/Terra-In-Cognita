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
import {
  type StatRowEntry,
  type TuningEntry,
  statRowCell,
  tuningValueInRange,
  withStatRowCell,
} from "@terra/content";
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
  type SocietyCoefficients,
  type StatRow,
  newTuningProblems,
  societyCoefficientsFrom,
  statTableProblems,
  tuningProblems,
} from "@terra/sim";

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
    }
  | {
      readonly ok: false;
      readonly reason: "unknown_entry" | "out_of_range" | "rules_conflict" | "duplicate_entry";
      readonly id: string | null;
      readonly problems: readonly TuningProblem[];
    };

/** 켤 때 고른 결과 */
export interface BootSelection {
  /** 듣는 줄 */
  readonly keep: readonly TuningOverrideRecord[];
  /** 팩이 더 나중에 바꾼 칸(덮어쓰기를 지운다, 감사 tuning.pack_won) */
  readonly packWon: readonly { readonly row: TuningOverrideRecord; readonly packValue: number }[];
  /** 새 팩과 맞지 않는 줄(지운다, 감사 tuning.dropped) */
  readonly dropped: readonly { readonly row: TuningOverrideRecord; readonly reason: TuningDropReason }[];
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
  revision(): number;
  /** 덮어쓴 칸 수(/health·지표, 가중치 칸 포함) */
  appliedCount(): number;
  /** 덮어쓴 가중치 칸 수 */
  statOverrideCount(): number;
  /** 지금 실효 값의 규칙 문제(팩이 틀렸을 때 켤 때 알린다) */
  problems(): TuningProblem[];
  /** 묶음을 바꾼 뒤의 전체 값으로 검사한다(메모리는 그대로) */
  plan(changes: readonly TuningChange[]): TuningPlan;
  /** 켤 때: DB 줄에서 듣는 줄·팩이 이긴 줄·지울 줄을 고른다(메모리는 그대로, 던지지 않는다) */
  selectAtBoot(rows: readonly TuningOverrideRecord[]): BootSelection;
  /** 새 스냅숏으로 바꿔 끼운다(DB 커밋 뒤). 팩에 없는 ID는 넣지 않는다 */
  install(overrides: Iterable<TuningOverrideRecord>, revision: number): void;
}

/** 칸의 단위: 팩 unit, 없으면 영어 이름 끝 괄호 */
const unitOf = (entry: TuningEntry): TuningUnit | null => entry.unit ?? tuningUnitFromName(entry.name.en);

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** 팩 행 + 값 표(가중치 칸 키 → 값) → sim 가중치 표 */
function statTableFrom(rows: readonly StatRowEntry[], values: ReadonlyMap<string, number>): StatRow[] {
  return rows.map((pack): StatRow => {
    let row = pack;
    for (const field of statCellFieldsOf(pack.shape)) {
      const value = values.get(`${pack.id}.${field}`);
      if (value !== undefined) row = withStatRowCell(row, field, value);
    }
    return row.shape === "quantity"
      ? { id: row.id, shape: "quantity", base: row.base, weights: row.weights }
      : {
          id: row.id,
          shape: "probability",
          cap: row.cap,
          halfConstant: row.halfConstant,
          weights: row.weights,
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
): TuningState {
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const statRows = packStatRows.filter((row) => row.enabled);
  const statRowById = new Map(statRows.map((row) => [row.id, row]));
  const packValues: ReadonlyMap<string, number> = new Map(entries.map((entry) => [entry.id, entry.value]));
  let current: TuningSnapshot = { revision: 0, values: packValues, overrides: new Map() };
  let cached: { snapshot: TuningSnapshot; society: SocietyCoefficients } | undefined;
  let cachedTable: { snapshot: TuningSnapshot; table: readonly StatRow[] } | undefined;

  const society = (): SocietyCoefficients => {
    const snapshot = current;
    if (cached?.snapshot !== snapshot)
      cached = { snapshot, society: societyCoefficientsFrom(snapshot.values) };
    return cached.society;
  };

  const statTable = (): readonly StatRow[] => {
    const snapshot = current;
    if (cachedTable?.snapshot !== snapshot)
      cachedTable = { snapshot, table: Object.freeze(statTableFrom(statRows, snapshot.values)) };
    return cachedTable.table;
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

  /** base 값에서 next로 바꾸면 새로 생기는 규칙 문제(세력·사회 + 가중치 표) */
  const newProblems = (
    base: { society: SocietyCoefficients; table: readonly StatRow[] },
    next: ReadonlyMap<string, number>,
  ): TuningProblem[] =>
    newTuningProblems(
      allProblems(base.society, base.table),
      allProblems(societyCoefficientsFrom(next), statTableFrom(statRows, next)),
    );

  return {
    entries,
    statRows,
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
      return statTableFrom(statRows, next);
    },
    revision: () => current.revision,
    appliedCount: () => current.overrides.size,
    statOverrideCount: () => [...current.overrides.keys()].filter((id) => statCell(id) !== undefined).length,
    problems: () => allProblems(society(), statTable()),

    plan(changes) {
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
      const problems = newProblems({ society: society(), table: statTable() }, next);
      if (problems.length > 0) return { ok: false, reason: "rules_conflict", id: null, problems };
      return { ok: true, changes: planned };
    },

    selectAtBoot(rows) {
      const keep: TuningOverrideRecord[] = [];
      const packWon: { row: TuningOverrideRecord; packValue: number }[] = [];
      const dropped: { row: TuningOverrideRecord; reason: TuningDropReason }[] = [];
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
          problems = newProblems(base, next);
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
      return { keep, packWon, dropped };
    },

    install(overrides, revision) {
      const map = new Map<string, TuningOverrideRecord>();
      const values = new Map(packValues);
      for (const record of [...overrides].toSorted(byId)) {
        if (!slot(record.id)) continue;
        map.set(record.id, record);
        values.set(record.id, record.value);
      }
      // 대입 한 번: 읽는 쪽은 앞 스냅숏이나 이 스냅숏만 본다
      current = { revision, values, overrides: map };
    },
  };
}
