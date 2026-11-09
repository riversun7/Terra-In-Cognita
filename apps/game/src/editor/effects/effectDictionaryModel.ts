// 효과 사전 화면 상태 계산(/dev/effects, docs/adr/2026-11-01-item-editor.md "바뀜 (2026-11-09)") — 그리기와 상관없는 순수 함수.
// - 담은 변경: 효과 ID → 고친 항목(put) 또는 팩 값으로 되돌리기(revert). base·baseHash = 고치기 시작할 때의 실효 항목과 해시(새 효과 null).
//   [적용]은 아이템 편집기와 같은 서버 묶음(items.save, 분류 effects)으로 보낸다.
// - 목록: 그 세계의 효과 + 아직 보내지 않은 새 효과(담은 값으로 보인다), 찾기·종류·출처·쓰는 곳 없음·담은 것만 거르기.
// - 같은 효과를 누가 먼저 바꿨으면(entry_changed) 바뀐 칸만 새 항목 위에 다시 얹는다(3방향, 같은 칸은 내 값을 두고 알린다).
import type { ContentIssueView } from "@terra/shared/contentEdit";
import {
  EFFECT_KIND_IDS,
  type EffectJson,
  type EffectUsage,
  type ItemEditorChange,
  type TaxonomyRow,
} from "@terra/shared/itemEditor";
import { mergeThreeWay, sameJson } from "../content/contentEditorModel.ts";

export interface StagedEffect {
  readonly op: "put" | "revert";
  /** put이면 보낼 항목 */
  readonly entry: EffectJson | null;
  /** 고치기 시작할 때의 실효 항목(새 효과 null) */
  readonly base: EffectJson | null;
  /** 고치기 시작할 때의 실효 항목 해시(새 효과 null) */
  readonly baseHash: string | null;
}

export type EffectStage = ReadonlyMap<string, StagedEffect>;

/** 새 효과 틀(꺼진 채로: 덜 만든 효과가 전투에 나오지 않게) */
export const newEffectTemplate = (id: string, name: { ko: string; en: string }): EffectJson => ({
  id,
  name,
  kind: "buff",
  stat: "attack",
  valueMode: "permille",
  durationMs: 6000,
  tickMs: 0,
  stacking: "refresh",
  maxStacks: 1,
  enabled: false,
});

/** 종류를 바꾸면 그 종류에 맞춘다: 수치는 버프·디버프만, 상태이상 종류·저항은 상태이상만 */
export function withKind(effect: EffectJson, kind: EffectJson["kind"]): EffectJson {
  const { stat, status, resist, ...rest } = effect;
  const buff = kind === "buff" || kind === "debuff";
  return {
    ...rest,
    kind,
    ...(buff ? { stat: stat ?? "attack" } : {}),
    ...(kind === "status" ? { status: status ?? "stun", ...(resist ? { resist } : {}) } : {}),
  };
}

/** 선택 칸(글): 빈 값이면 뺀다 */
export function withText(effect: EffectJson, key: "capCode" | "exclusive", value: string): EffectJson {
  const { [key]: _drop, ...rest } = effect;
  return value.trim() === "" ? rest : { ...rest, [key]: value.trim() };
}

const withEntry = (
  stage: EffectStage,
  id: string,
  staged: StagedEffect | null,
): Map<string, StagedEffect> => {
  const next = new Map(stage);
  if (staged === null) next.delete(id);
  else next.set(id, staged);
  return next;
};

/**
 * 고친 효과를 담는다. 이미 담았으면 그 base·baseHash를 그대로 두고, 처음이면 지금 행(row)에서 잡는다. 지금 실효 항목과 같아지면 뺀다
 * (새 효과는 같아질 것이 없어 늘 남는다)
 */
export function stagePut(
  stage: EffectStage,
  row: TaxonomyRow<EffectJson> | null,
  next: EffectJson,
): Map<string, StagedEffect> {
  const was = stage.get(next.id);
  const base = was ? was.base : (row?.entry ?? null);
  const baseHash = was ? was.baseHash : (row?.hash ?? null);
  if (base !== null && sameJson(next, base)) return withEntry(stage, next.id, null);
  return withEntry(stage, next.id, { op: "put", entry: next, base, baseHash });
}

/** 새 효과를 담는다(꺼진 틀) */
export const stageCreate = (
  stage: EffectStage,
  id: string,
  name: { ko: string; en: string },
): Map<string, StagedEffect> =>
  withEntry(stage, id, { op: "put", entry: newEffectTemplate(id, name), base: null, baseHash: null });

/** 팩 값으로 되돌리기(만든 효과면 지우기)를 담는다 */
export const stageRevert = (stage: EffectStage, row: TaxonomyRow<EffectJson>): Map<string, StagedEffect> =>
  withEntry(stage, row.entry.id, { op: "revert", entry: null, base: row.entry, baseHash: row.hash });

export const unstage = (stage: EffectStage, id: string): Map<string, StagedEffect> =>
  withEntry(stage, id, null);

/** 항목 JSON → 보낼 객체(팩 effects.json 한 줄) */
const toRecord = (value: object): Record<string, unknown> => Object.fromEntries(Object.entries(value));

/** 담은 변경 → 서버 묶음(items.save·items.check, 분류 effects) */
export function effectChanges(stage: EffectStage): ItemEditorChange[] {
  return [...stage].map(([id, staged]) =>
    staged.op === "revert" || staged.entry === null
      ? { op: "revert", category: "effects", id, baseHash: staged.baseHash }
      : { op: "put", category: "effects", entry: toRecord(staged.entry), baseHash: staged.baseHash },
  );
}

/** 목록 한 줄: 보이는 항목(담은 값 먼저)과 그 세계의 행(새 효과면 null) */
export interface ListedEffect {
  readonly id: string;
  readonly entry: EffectJson;
  readonly row: TaxonomyRow<EffectJson> | null;
}

/** 그 세계의 효과(실효 차례) + 아직 보내지 않은 새 효과(담은 차례). 되돌리기를 담은 효과는 지금 값으로 보인다 */
export function listEffects(rows: readonly TaxonomyRow<EffectJson>[], stage: EffectStage): ListedEffect[] {
  const known = new Set(rows.map((row) => row.entry.id));
  const listed = rows.map((row) => ({
    id: row.entry.id,
    entry: stage.get(row.entry.id)?.entry ?? row.entry,
    row,
  }));
  const created = [...stage].flatMap(([id, staged]) =>
    !known.has(id) && staged.entry ? [{ id, entry: staged.entry, row: null }] : [],
  );
  return [...listed, ...created];
}

export type EffectFilter = "all" | "changed" | "disabled" | "unused";

export interface EffectQuery {
  readonly text: string;
  readonly kind: EffectJson["kind"] | "all";
  readonly filter: EffectFilter;
  readonly stagedOnly: boolean;
}

export const EMPTY_EFFECT_QUERY: EffectQuery = { text: "", kind: "all", filter: "all", stagedOnly: false };

/** 쓰는 곳 수(아이템 + 스킬) */
export const usageCount = (usage: EffectUsage | undefined): number =>
  (usage?.items.length ?? 0) + (usage?.skills.length ?? 0);

/** 찾기(ID·한국어·영어 이름)·종류·출처(고침·새로 만듦)·꺼짐·쓰는 곳 없음·담은 것만 */
export function filterEffects(
  listed: readonly ListedEffect[],
  query: EffectQuery,
  usage: Readonly<Record<string, EffectUsage>>,
  staged: ReadonlySet<string>,
): ListedEffect[] {
  const lower = query.text.trim().toLocaleLowerCase();
  return listed.filter(({ id, entry, row }) => {
    if (query.kind !== "all" && entry.kind !== query.kind) return false;
    if (query.stagedOnly && !staged.has(id)) return false;
    if (query.filter === "changed" && row !== null && row.origin === "pack") return false;
    if (query.filter === "disabled" && entry.enabled) return false;
    if (query.filter === "unused" && usageCount(usage[id]) > 0) return false;
    return (
      lower === "" ||
      id.includes(lower) ||
      entry.name.ko.toLocaleLowerCase().includes(lower) ||
      entry.name.en.toLocaleLowerCase().includes(lower)
    );
  });
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** 효과 항목 모양인가(최근 바꿈 다시 담기·다시 얹기가 받은 값. 칸 범위는 서버 검사가 본다) */
export function isEffectJson(value: unknown): value is EffectJson {
  if (!isRecord(value)) return false;
  const name = value.name;
  return (
    typeof value.id === "string" &&
    isRecord(name) &&
    typeof name.ko === "string" &&
    typeof name.en === "string" &&
    EFFECT_KIND_IDS.some((kind) => kind === value.kind) &&
    (value.valueMode === "flat" || value.valueMode === "permille") &&
    typeof value.durationMs === "number" &&
    typeof value.tickMs === "number" &&
    (value.stacking === "refresh" || value.stacking === "stack" || value.stacking === "ignore") &&
    typeof value.maxStacks === "number" &&
    typeof value.enabled === "boolean"
  );
}

/** 다시 얹은 결과: 새 담은 변경과 효과마다 양쪽이 바꾼 칸 */
export interface EffectRebase {
  readonly stage: Map<string, StagedEffect>;
  readonly rebased: readonly { readonly id: string; readonly conflicts: readonly string[] }[];
}

/**
 * 같은 효과를 누가 먼저 바꿨다(entry_changed, 키 `effects/<ID>`): 새로 받은 행 위에 내가 바꾼 칸만 다시 얹는다(3방향). 같아지면 담김에서
 * 뺀다. 되돌리기는 새 해시로만 바꾼다. 그 세계에서 사라진 효과는 그대로 둔다(서버가 다시 알린다)
 */
export function rebaseEffects(
  stage: EffectStage,
  keys: readonly string[],
  fresh: readonly TaxonomyRow<EffectJson>[],
): EffectRebase {
  const out = new Map(stage);
  const rebased: { id: string; conflicts: readonly string[] }[] = [];
  for (const key of keys) {
    const slash = key.indexOf("/");
    if (slash < 0 || key.slice(0, slash) !== "effects") continue;
    const id = key.slice(slash + 1);
    const mine = out.get(id);
    const theirs = fresh.find((row) => row.entry.id === id);
    if (!mine || !theirs) continue;
    if (mine.op === "revert" || mine.entry === null) {
      out.set(id, { ...mine, base: theirs.entry, baseHash: theirs.hash });
      rebased.push({ id, conflicts: [] });
      continue;
    }
    const merged = mergeThreeWay(mine.base, mine.entry, theirs.entry);
    const next = isEffectJson(merged.merged) ? merged.merged : mine.entry;
    if (sameJson(next, theirs.entry)) out.delete(id);
    else out.set(id, { op: "put", entry: next, base: theirs.entry, baseHash: theirs.hash });
    rebased.push({ id, conflicts: merged.conflicts });
  }
  return { stage: out, rebased };
}

/** 서버 검사의 entry_changed 문제에서 바뀐 항목 키(분류/ID) */
export function changedKeysOf(issues: readonly ContentIssueView[]): string[] {
  return issues
    .filter((issue) => issue.code === "entry_changed")
    .flatMap((issue) => String(issue.params.details ?? "").split(", "))
    .filter((key) => key !== "");
}

/** 효과 하나의 저장을 막는 문제(entry_changed는 화면이 바로 다시 얹으니 뺀다) */
export const issuesOf = (issues: readonly ContentIssueView[], id: string): ContentIssueView[] =>
  issues.filter(
    (issue) =>
      issue.code !== "entry_changed" &&
      issue.id === id &&
      (issue.file === null || issue.file.startsWith("effects")),
  );

/** 어느 효과에도 붙지 않은 문제(막대 위에 모아 보인다) */
export const looseIssues = (
  issues: readonly ContentIssueView[],
  ids: ReadonlySet<string>,
): ContentIssueView[] =>
  issues.filter((issue) => issue.code !== "entry_changed" && (issue.id === null || !ids.has(issue.id)));
