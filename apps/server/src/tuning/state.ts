// 설정 칸 실효 값 — 접근자 하나(docs/adr/2026-11-01-dev-settings-panel.md 5절)
// 실효 값 = 팩 값 위에 이 세계(DB)의 덮어쓰기. 서버에서 설정 칸 값을 읽는 곳은 모두 values()·society()를 **쓸 때마다** 부른다
// (켤 때 한 번 받아 두지 않는다) → 덮어쓰기를 바꾸면 다음 요청부터 듣는다. 어디가 읽는지는 scope.ts.
// - 메모리 표가 DB 줄의 캐시다(쓰는 프로세스는 하나, ADR 3). 바꾸기는 DB 커밋 뒤에 put·remove·clear로 한다(services.ts).
// - 켤 때 load: 팩에 없는 ID·지금 팩 범위 밖·규칙 문제를 새로 만드는 줄은 적용하지 않고(줄은 남는다, 까닭을 화면에 보인다),
//   값이 지금 팩 값과 같은 줄은 지울 목록으로 돌려준다(배포로 팩에 들어간 것).
// - 규칙 검사: @terra/sim tuningProblems(여러 칸). 이미 있던 문제는 막지 않고 새로 생기는 문제만 막는다.
import { type TuningEntry, tuningValueInRange } from "@terra/content";
import type { TuningOverrideState, TuningProblem } from "@terra/shared/tuning";
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
  /** 저장할 때의 팩 값·팩 판 */
  readonly packValue: number;
  readonly contentVersion: string;
  readonly note: string | null;
  readonly updatedById: string | null;
  /** 바꾼 사람 계정 이름(지운 계정이면 null) */
  readonly updatedByName: string | null;
  readonly updatedAtMs: number;
}

/** 메모리에 든 덮어쓰기(적용 여부 포함) */
export interface HeldOverride extends TuningOverrideRecord {
  readonly state: TuningOverrideState;
  /** state가 rules_conflict일 때 새로 생기는 문제 */
  readonly problems: readonly TuningProblem[];
}

export type TuningCheck =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: "unknown_entry" | "out_of_range" | "rules_conflict";
      readonly problems: readonly TuningProblem[];
    };

export interface TuningState {
  /** 팩 tuning 항목(팩 차례) */
  readonly entries: readonly TuningEntry[];
  entry(id: string): TuningEntry | undefined;
  /** 실효 값(팩 ID → 값). 바뀌면 새 표다(받아 둔 표는 그대로) */
  values(): ReadonlyMap<string, number>;
  /** 실효 값을 얹은 세력·사회 계수표(판마다 한 번 만든다) */
  society(): SocietyCoefficients;
  /** 실효 값 판(바뀔 때마다 +1) */
  revision(): number;
  /** 덮어쓰기(적용 안 된 것 포함), ID 차례 */
  overrides(): readonly HeldOverride[];
  override(id: string): HeldOverride | undefined;
  /** 적용 중인 덮어쓰기 수(/health) */
  appliedCount(): number;
  /** 지금 실효 값의 규칙 문제(팩이 틀렸을 때 켤 때 알린다) */
  problems(): TuningProblem[];
  /** 덮어쓰기 하나를 value로 바꾸면(null = 지우면) 받을 수 있나 */
  check(id: string, value: number | null): TuningCheck;
  /** 켤 때: DB 줄로 다시 만든다. 값이 팩 값과 같아 지울 줄을 돌려준다 */
  load(rows: readonly TuningOverrideRecord[]): TuningOverrideRecord[];
  /** 커밋 뒤: 덮어쓰기 하나를 넣는다(검사는 부르는 쪽이 check로 먼저 했다) */
  put(record: TuningOverrideRecord): void;
  remove(id: string): void;
  clear(): void;
}

/** base 실효 값에서 id를 value로 바꾸면 새로 생기는 규칙 문제 */
function newProblems(
  base: ReadonlyMap<string, number>,
  baseSociety: SocietyCoefficients,
  id: string,
  value: number,
): TuningProblem[] {
  const candidate = new Map(base);
  candidate.set(id, value);
  return newTuningProblems(tuningProblems(baseSociety), tuningProblems(societyCoefficientsFrom(candidate)));
}

export function createTuningState(entries: readonly TuningEntry[]): TuningState {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const packValues: ReadonlyMap<string, number> = new Map(entries.map((entry) => [entry.id, entry.value]));
  const held = new Map<string, HeldOverride>();
  let effective: ReadonlyMap<string, number> = packValues;
  let revision = 0;
  let cached: { revision: number; society: SocietyCoefficients } | undefined;

  const rebuild = (): void => {
    const next = new Map(packValues);
    for (const override of held.values())
      if (override.state === "applied") next.set(override.id, override.value);
    effective = next;
    revision += 1;
  };

  const society = (): SocietyCoefficients => {
    if (cached?.revision !== revision) cached = { revision, society: societyCoefficientsFrom(effective) };
    return cached.society;
  };

  return {
    entries,
    entry: (id) => byId.get(id),
    values: () => effective,
    society,
    revision: () => revision,
    overrides: () => [...held.values()].toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    override: (id) => held.get(id),
    appliedCount: () => [...held.values()].filter((override) => override.state === "applied").length,
    problems: () => tuningProblems(society()),

    check(id, value) {
      const entry = byId.get(id);
      if (value === null) {
        // 지우기: 팩에 없는 ID는 실효 값에 없다(문제도 없다). 팩 ID는 팩 값으로 돌아갈 때 새 문제가 없어야 한다
        if (!entry) return { ok: true };
        const problems = newProblems(effective, society(), id, entry.value);
        return problems.length > 0 ? { ok: false, reason: "rules_conflict", problems } : { ok: true };
      }
      if (!entry) return { ok: false, reason: "unknown_entry", problems: [] };
      if (!tuningValueInRange(entry, value)) return { ok: false, reason: "out_of_range", problems: [] };
      const problems = newProblems(effective, society(), id, value);
      return problems.length > 0 ? { ok: false, reason: "rules_conflict", problems } : { ok: true };
    },

    load(rows) {
      held.clear();
      const absorbed: TuningOverrideRecord[] = [];
      let base: Map<string, number> = new Map(packValues);
      let baseSociety = societyCoefficientsFrom(base);
      // 저장한 차례로 얹는다(앞 덮어쓰기와 맞지 않는 뒤 덮어쓰기가 빠진다). 같은 시각이면 ID 차례
      const ordered = rows.toSorted(
        (a, b) => a.updatedAtMs - b.updatedAtMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
      for (const row of ordered) {
        const entry = byId.get(row.id);
        const hold = (state: TuningOverrideState, problems: readonly TuningProblem[] = []) =>
          held.set(row.id, { ...row, state, problems });
        if (!entry) {
          hold("unknown_entry");
          continue;
        }
        if (row.value === entry.value) {
          absorbed.push(row);
          continue;
        }
        if (!tuningValueInRange(entry, row.value)) {
          hold("out_of_range");
          continue;
        }
        const problems = newProblems(base, baseSociety, row.id, row.value);
        if (problems.length > 0) {
          hold("rules_conflict", problems);
          continue;
        }
        hold("applied");
        base = new Map(base);
        base.set(row.id, row.value);
        baseSociety = societyCoefficientsFrom(base);
      }
      rebuild();
      return absorbed;
    },

    put(record) {
      held.set(record.id, { ...record, state: "applied", problems: [] });
      rebuild();
    },

    remove(id) {
      if (held.delete(id)) rebuild();
    },

    clear() {
      if (held.size === 0) return;
      held.clear();
      rebuild();
    },
  };
}
