// 같은 항목을 누가 먼저 바꿨을 때(entry_changed) 다시 얹기 — 설계안 3.10. 바뀐 항목 키마다 내 초안에서 바꾼 칸만 지금 서버 항목 위에
// 다시 얹은 담은 변경(바탕·해시는 서버 것으로)과, 양쪽이 같은 칸을 다르게 바꾼 경로를 돌려준다. 계산이 없는 순수 함수(시험:
// itemModel.test.ts). 화면은 이 결과를 담고, 충돌 칸은 칸마다 내 값·서버 값을 고르게 한다.
import type { ContentIssueView } from "@terra/shared/contentEdit";
import type { ItemEditorListResponse, ItemJson, TaxonomyRow } from "@terra/shared/itemEditor";
import { mergeThreeWay, valueAt, withValueAt } from "../content/contentEditorModel.ts";
import {
  type Stage,
  type TaxonomyCategory,
  type TaxonomyJson,
  isItemJson,
  isTaxonomyJson,
  stageItem,
  stageTaxonomy,
} from "./itemModel.ts";

/** 충돌: 서버 항목과 양쪽이 바꾼 칸 경로 */
export interface ItemConflict {
  readonly theirs: ItemJson | null;
  readonly paths: readonly string[];
}

export const TAXONOMY_CATEGORIES: readonly TaxonomyCategory[] = [
  "item_subcategories",
  "item_tags",
  "weapon_types",
];

export function taxonomyRows(
  list: ItemEditorListResponse,
  category: TaxonomyCategory,
): readonly TaxonomyRow<TaxonomyJson>[] {
  if (category === "item_subcategories") return list.subcategories;
  return category === "item_tags" ? list.tags : list.weaponTypes;
}

/** 담은 변경 키(분류/ID) → 분류·ID */
export function splitKey(key: string): { readonly category: string; readonly id: string } {
  const slash = key.indexOf("/");
  return slash < 0 ? { category: "", id: key } : { category: key.slice(0, slash), id: key.slice(slash + 1) };
}

/** 지금 서버 아이템(없거나 받지 못하면 null) */
export type LatestItems = ReadonlyMap<
  string,
  { readonly entry: ItemJson | null; readonly hash: string | null } | null
>;

/**
 * 다시 얹기. keys = 서버가 알린 바뀐 항목 키, latest = 그 아이템들의 지금 항목·해시, fresh = 다시 받은 목록(분류 자료 행).
 * 되돌리기·잠든 줄 버리기는 바탕·해시만 새로 한다
 */
export function rebaseStage(
  stage: Stage,
  keys: readonly string[],
  latest: LatestItems,
  fresh: ItemEditorListResponse,
): { readonly stage: Stage; readonly conflicts: ReadonlyMap<string, ItemConflict> } {
  let next = stage;
  const conflicts = new Map<string, ItemConflict>();
  for (const key of keys) {
    const { category, id } = splitKey(key);
    if (category === "items") {
      const staged = next.items.get(id);
      if (!staged) continue;
      const theirs = latest.get(id)?.entry ?? null;
      const hash = latest.get(id)?.hash ?? null;
      if (staged.op !== "put" || !staged.entry) {
        next = stageItem(next, id, { ...staged, base: theirs, baseHash: hash });
        continue;
      }
      const merged = mergeThreeWay(staged.base, staged.entry, theirs);
      next = stageItem(next, id, {
        op: "put",
        entry: isItemJson(merged.merged) ? merged.merged : staged.entry,
        base: theirs,
        baseHash: hash,
      });
      if (merged.conflicts.length > 0) conflicts.set(key, { theirs, paths: merged.conflicts });
      continue;
    }
    const tax = TAXONOMY_CATEGORIES.find((item) => item === category);
    const staged = tax ? next[tax].get(id) : undefined;
    if (!tax || !staged) continue;
    const current = taxonomyRows(fresh, tax).find((item) => item.entry.id === id);
    const theirs = current?.entry ?? null;
    const merged = staged.entry ? mergeThreeWay(staged.base, staged.entry, theirs) : null;
    next = stageTaxonomy(next, tax, id, {
      ...staged,
      entry: merged && isTaxonomyJson(tax, merged.merged) ? merged.merged : staged.entry,
      base: theirs,
      baseHash: current?.hash ?? null,
    });
  }
  return { stage: next, conflicts };
}

/**
 * 충돌 칸 하나 고르기: useTheirs면 그 칸에 서버 값을 넣고, 아니면 내 값을 둔다. 고른 칸은 충돌 목록에서 빠진다(다 고르면 그 항목도 빠진다)
 */
export function resolveConflict(
  stage: Stage,
  conflicts: ReadonlyMap<string, ItemConflict>,
  id: string,
  path: string,
  useTheirs: boolean,
): { readonly stage: Stage; readonly conflicts: ReadonlyMap<string, ItemConflict> } {
  const key = `items/${id}`;
  const conflict = conflicts.get(key);
  if (!conflict) return { stage, conflicts };
  const staged = stage.items.get(id);
  let next = stage;
  if (useTheirs && staged?.entry) {
    const merged = withValueAt(staged.entry, path, valueAt(conflict.theirs, path));
    if (isItemJson(merged)) next = stageItem(stage, id, { ...staged, entry: merged });
  }
  const paths = conflict.paths.filter((item) => item !== path);
  const left = new Map(conflicts);
  if (paths.length === 0) left.delete(key);
  else left.set(key, { ...conflict, paths });
  return { stage: next, conflicts: left };
}

/** 검사 결과에서 entry_changed(누가 먼저 바꾼 항목)의 키(분류/ID) — 서버는 문제 한 줄의 params.details에 ", "로 잇는다 */
export function changedKeysOf(issues: readonly ContentIssueView[]): string[] {
  return issues
    .filter((issue) => issue.code === "entry_changed")
    .flatMap((issue) => String(issue.params.details ?? "").split(", "))
    .filter((key) => key !== "");
}

/** 잠든 줄 버리기를 담는다(모르는 분류면 그대로) */
export function stageDiscard(stage: Stage, category: string, id: string): Stage {
  const discard = { op: "discard_sleeping", entry: null, base: null, baseHash: null } as const;
  if (category === "items") return stageItem(stage, id, discard);
  const tax = TAXONOMY_CATEGORIES.find((item) => item === category);
  return tax ? stageTaxonomy(stage, tax, id, discard) : stage;
}
