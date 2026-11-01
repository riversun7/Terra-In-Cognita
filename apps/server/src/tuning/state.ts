// 설정 칸 실효 값 — 접근자 하나(docs/adr/2026-11-01-dev-settings-panel.md 5·6·7절)
// 실효 값 = 팩 값 위에 이 세계(DB)의 덮어쓰기. 서버에서 설정 칸 값을 읽는 곳은 모두 values()·society()를 **쓸 때마다** 부르고,
// 명령 하나는 시작할 때 받은 값 한 벌을 끝까지 쓴다(어디가 읽는지는 scope.ts).
// - 스냅숏: 판·실효 값·덮어쓰기를 든 바뀌지 않는 객체 하나. 바꾸기는 검사한 새 묶음으로 새 스냅숏을 만들어 대입 한 번으로 바꿔 끼운다
//   (한 스레드라 읽는 쪽은 앞 묶음 전체나 뒤 묶음 전체만 본다).
// - plan: 묶음(칸 여러 개)을 바꾼 뒤의 전체 값으로 범위·여러 칸 규칙(@terra/sim tuningProblems)을 본다. 이미 있던 문제는 막지 않고
//   새로 생기는 문제만 막는다. 메모리는 바꾸지 않는다(DB 커밋 뒤에 install).
// - selectAtBoot: 켤 때 DB 줄에서 "가장 나중에 바꾼 것"을 고른다(6절). 오류를 던지지 않는다.
import { type TuningEntry, tuningValueInRange } from "@terra/content";
import {
  type TuningDropReason,
  type TuningProblem,
  type TuningUnit,
  tuningUnitFromName,
} from "@terra/shared/tuning";
import {
  type SocietyCoefficients,
  newTuningProblems,
  societyCoefficientsFrom,
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
  /** 실효 값(팩 ID → 값) */
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

export interface TuningState {
  /** 팩 tuning 항목(팩 차례) */
  readonly entries: readonly TuningEntry[];
  entry(id: string): TuningEntry | undefined;
  /** 칸의 단위(팩 unit, 없으면 영어 이름 끝 괄호) */
  unitOf(entry: TuningEntry): TuningUnit | null;
  /** 지금 값 한 벌. 명령 하나는 이것 하나를 받아 끝까지 쓴다 */
  snapshot(): TuningSnapshot;
  values(): ReadonlyMap<string, number>;
  /** 지금 스냅숏의 세력·사회 계수표(스냅숏마다 한 번 만든다) */
  society(): SocietyCoefficients;
  revision(): number;
  /** 덮어쓴 칸 수(/health·지표) */
  appliedCount(): number;
  /** 지금 실효 값의 규칙 문제(팩이 틀렸을 때 켤 때 알린다) */
  problems(): TuningProblem[];
  /** 묶음을 바꾼 뒤의 전체 값으로 검사한다(메모리는 그대로) */
  plan(changes: readonly TuningChange[]): TuningPlan;
  /** 켤 때: DB 줄에서 듣는 줄·팩이 이긴 줄·지울 줄을 고른다(메모리는 그대로, 던지지 않는다) */
  selectAtBoot(rows: readonly TuningOverrideRecord[]): BootSelection;
  /** 새 스냅숏으로 바꿔 끼운다(DB 커밋 뒤). 팩에 없는 ID는 넣지 않는다 */
  install(overrides: Iterable<TuningOverrideRecord>, revision: number): void;
}

/** base 실효 값에서 next로 바꾸면 새로 생기는 규칙 문제 */
function newProblems(baseSociety: SocietyCoefficients, next: ReadonlyMap<string, number>): TuningProblem[] {
  return newTuningProblems(tuningProblems(baseSociety), tuningProblems(societyCoefficientsFrom(next)));
}

/** 칸의 단위: 팩 unit, 없으면 영어 이름 끝 괄호 */
const unitOf = (entry: TuningEntry): TuningUnit | null => entry.unit ?? tuningUnitFromName(entry.name.en);

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function createTuningState(entries: readonly TuningEntry[]): TuningState {
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const packValues: ReadonlyMap<string, number> = new Map(entries.map((entry) => [entry.id, entry.value]));
  let current: TuningSnapshot = { revision: 0, values: packValues, overrides: new Map() };
  let cached: { snapshot: TuningSnapshot; society: SocietyCoefficients } | undefined;

  const society = (): SocietyCoefficients => {
    const snapshot = current;
    if (cached?.snapshot !== snapshot)
      cached = { snapshot, society: societyCoefficientsFrom(snapshot.values) };
    return cached.society;
  };

  return {
    entries,
    entry: (id) => entryById.get(id),
    unitOf,
    snapshot: () => current,
    values: () => current.values,
    society,
    revision: () => current.revision,
    appliedCount: () => current.overrides.size,
    problems: () => tuningProblems(society()),

    plan(changes) {
      const snapshot = current;
      const seen = new Set<string>();
      const next = new Map(snapshot.values);
      const planned: PlannedChange[] = [];
      for (const change of changes) {
        if (seen.has(change.id)) return { ok: false, reason: "duplicate_entry", id: change.id, problems: [] };
        seen.add(change.id);
        const entry = entryById.get(change.id);
        const before = snapshot.overrides.get(change.id)?.value ?? null;
        if (!entry) {
          // 팩에 없는 칸: 덮어쓰기도 없다(켤 때 지운다). 되돌리기는 할 일이 없고, 값은 받지 않는다
          if (change.value === null) continue;
          return { ok: false, reason: "unknown_entry", id: change.id, problems: [] };
        }
        const after = change.value === null || change.value === entry.value ? null : change.value;
        if (after !== null && !tuningValueInRange(entry, after))
          return { ok: false, reason: "out_of_range", id: change.id, problems: [] };
        if (after === before) continue;
        next.set(change.id, after ?? entry.value);
        planned.push({ id: change.id, before, after });
      }
      const problems = newProblems(society(), next);
      if (problems.length > 0) return { ok: false, reason: "rules_conflict", id: null, problems };
      return { ok: true, changes: planned };
    },

    selectAtBoot(rows) {
      const keep: TuningOverrideRecord[] = [];
      const packWon: { row: TuningOverrideRecord; packValue: number }[] = [];
      const dropped: { row: TuningOverrideRecord; reason: TuningDropReason }[] = [];
      let values = new Map(packValues);
      let baseSociety = societyCoefficientsFrom(values);
      // 저장한 차례로 얹는다(앞 덮어쓰기와 맞지 않는 뒤 덮어쓰기가 빠진다). 같은 시각이면 ID 차례
      const ordered = rows.toSorted((a, b) => a.updatedAtMs - b.updatedAtMs || byId(a, b));
      for (const row of ordered) {
        const entry = entryById.get(row.id);
        if (!entry) {
          dropped.push({ row, reason: "unknown_entry" });
          continue;
        }
        // 가장 나중에 바꾼 것이 이긴다: 저장 뒤에 팩 값이 바뀌었으면(배포) 팩이 더 나중이다. 팩 값과 같은 덮어쓰기도 팩 값이 든다
        if (entry.value !== row.packValue || row.value === entry.value) {
          packWon.push({ row, packValue: entry.value });
          continue;
        }
        if (unitOf(entry) !== row.unit) {
          dropped.push({ row, reason: "unit_changed" });
          continue;
        }
        if (!tuningValueInRange(entry, row.value)) {
          dropped.push({ row, reason: "out_of_range" });
          continue;
        }
        const next = new Map(values);
        next.set(row.id, row.value);
        let problems: TuningProblem[];
        try {
          problems = newProblems(baseSociety, next);
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
        baseSociety = societyCoefficientsFrom(values);
      }
      return { keep, packWon, dropped };
    },

    install(overrides, revision) {
      const map = new Map<string, TuningOverrideRecord>();
      const values = new Map(packValues);
      for (const record of [...overrides].toSorted(byId)) {
        if (!entryById.has(record.id)) continue;
        map.set(record.id, record);
        values.set(record.id, record.value);
      }
      // 대입 한 번: 읽는 쪽은 앞 스냅숏이나 이 스냅숏만 본다
      current = { revision, values, overrides: map };
    },
  };
}
