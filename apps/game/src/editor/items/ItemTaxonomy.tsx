// [아이템 분류] 탭(2026-11-09 분류 나무, 사용자 "중분류랑 무기 종류가 왜 같이 있냐?") — [아이템] 탭과 같은 대분류 타일 → 분류 나무
// (대분류 → 중분류 → 장비 종류, 마디마다 든 아이템 수) → 고른 마디(칸·든 아이템·그 자리의 [새로 만들기]). 태그는 나무의 단계가 아니라
// 아래 따로 붙는 이름표 판이다. 자료 모양 그대로 보이고, 중분류 없는 아이템은 표시와 기획 질문 번호를 단다(D-497 기획 정리 895~899:
// 장비 종류 이름·상위 중분류 칸, docs/questions/2026-11-09-item-classes.md). 나무 계산은 itemTree.ts(시험 itemTree.test.ts).
import type { ItemCategoryId, ItemEditorListResponse } from "@terra/shared/itemEditor";
import { type ReactNode, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { ItemCategoryTiles } from "./ItemCategoryTiles.tsx";
import { TaxonomyNode } from "./ItemTaxonomyNode.tsx";
import { TaxonomySection } from "./ItemTaxonomyFields.tsx";
import { CategoryIcon } from "./itemIcons.tsx";
import { CATEGORY_TEXT } from "./itemMessages.ts";
import type { ItemQuery, Stage, Staged, TaxonomyCategory, TaxonomyJson } from "./itemModel.ts";
import {
  type KindNode,
  type MajorNode,
  type TaxEntry,
  type TreeNodeRef,
  buildItemTree,
  findKind,
  findSub,
  isSubcategoryJson,
  isWeaponTypeJson,
  taxEntries,
  treeCounts,
  treeItems,
} from "./itemTree.ts";
import "./itemTree.css";

/** 담은 변경 막대에서 분류 자료를 누르면 그 마디를 연다(at = 누른 때, 같은 항목을 또 눌러도 다시 연다) */
export interface TaxonomyFocus {
  readonly category: TaxonomyCategory;
  readonly id: string;
  readonly at: number;
}

const refKey = (node: TreeNodeRef): string => `${node.kind}:${node.id}`;

/** 줄 끝 표지: 담음 · 출처(고침/만듦) · 꺼짐 */
function EntryChips({ entry }: { entry: TaxEntry<TaxonomyJson> }) {
  return (
    <>
      {entry.staged ? <span className="ce-badge ce-badge-staged">{m.dev_content_badge_staged()}</span> : null}
      {entry.row === null ? (
        <span className="ce-badge ce-badge-created">{m.dev_items_origin_created()}</span>
      ) : entry.row.origin === "edited" ? (
        <span className="ce-badge ce-badge-changed">{m.dev_items_origin_edited()}</span>
      ) : entry.row.origin === "created" ? (
        <span className="ce-badge ce-badge-created">{m.dev_items_origin_created()}</span>
      ) : null}
      {entry.entry.enabled ? null : <span className="ce-badge ce-badge-off">{m.dev_items_disabled()}</span>}
    </>
  );
}

function TreeButton({
  node,
  current,
  level,
  expanded,
  count,
  odd,
  onPick,
  children,
}: {
  node: TreeNodeRef;
  current: boolean;
  level: number;
  expanded?: boolean | undefined;
  count: number;
  /** 자료 이상 표시(질문 번호와 같이 고른 마디에 풀이) */
  odd?: boolean | undefined;
  onPick: (node: TreeNodeRef) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="ie-tree-node"
      data-node={refKey(node)}
      data-level={level}
      data-odd={odd ? "" : undefined}
      data-empty={count === 0 ? "" : undefined}
      aria-current={current ? "true" : undefined}
      aria-expanded={expanded}
      onClick={() => onPick(node)}
    >
      <span className="ie-tree-label">{children}</span>
      {odd ? (
        <span className="ie-odd-mark" title={m.dev_items_tax_oddity()}>
          !
        </span>
      ) : null}
      <span className="ie-tree-count">{count}</span>
    </button>
  );
}

function KindItem({
  kind,
  entry,
  current,
  locale,
  onPick,
}: {
  kind: KindNode;
  entry: TaxEntry<TaxonomyJson> | undefined;
  current: TreeNodeRef | null;
  locale: "ko" | "en";
  onPick: (node: TreeNodeRef) => void;
}) {
  const node: TreeNodeRef = { kind: "weapon", id: kind.id };
  return (
    <li>
      <TreeButton
        node={node}
        level={2}
        count={kind.count}
        current={current !== null && refKey(current) === refKey(node)}
        onPick={onPick}
      >
        <span>{kind.entry.name[locale]}</span>
        <code className="ie-tree-id">{kind.id}</code>
        {entry ? <EntryChips entry={entry} /> : null}
      </TreeButton>
    </li>
  );
}

function MajorBranch({
  major,
  current,
  expanded,
  subEntries,
  kindEntries,
  locale,
  onPick,
}: {
  major: MajorNode;
  current: TreeNodeRef | null;
  expanded: boolean;
  subEntries: ReadonlyMap<string, TaxEntry<TaxonomyJson>>;
  kindEntries: ReadonlyMap<string, TaxEntry<TaxonomyJson>>;
  locale: "ko" | "en";
  onPick: (node: TreeNodeRef) => void;
}) {
  const node: TreeNodeRef = { kind: "major", id: major.id };
  const is = (other: TreeNodeRef): boolean => current !== null && refKey(current) === refKey(other);
  return (
    <li data-major={major.id}>
      <TreeButton
        node={node}
        level={0}
        count={major.count}
        expanded={expanded}
        current={is(node)}
        onPick={onPick}
      >
        <CategoryIcon category={major.id} />
        <span>{CATEGORY_TEXT[major.id]()}</span>
        <span className="ie-dim">{m.dev_items_tile_subs({ count: major.subs.length })}</span>
      </TreeButton>
      {expanded ? (
        <ul className="ie-tree-children">
          {major.subs.map((sub) => {
            const subNode: TreeNodeRef = { kind: "sub", id: sub.id };
            const entry = subEntries.get(sub.id);
            return (
              <li key={sub.id}>
                <TreeButton node={subNode} level={1} count={sub.count} current={is(subNode)} onPick={onPick}>
                  <span>{sub.entry.name[locale]}</span>
                  <code className="ie-tree-id">{sub.id}</code>
                  {entry ? <EntryChips entry={entry} /> : null}
                </TreeButton>
                {sub.kinds.length > 0 ? (
                  <ul className="ie-tree-children">
                    {sub.kinds.map((kind) => (
                      <KindItem
                        key={kind.id}
                        kind={kind}
                        entry={kindEntries.get(kind.id)}
                        current={current}
                        locale={locale}
                        onPick={onPick}
                      />
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
          {major.unsorted > 0 ? (
            <li>
              <TreeButton
                node={{ kind: "unsorted", id: major.id }}
                level={1}
                count={major.unsorted}
                odd
                current={is({ kind: "unsorted", id: major.id })}
                onPick={onPick}
              >
                <span className="ie-tree-none">{m.dev_items_tax_unsorted()}</span>
              </TreeButton>
            </li>
          ) : null}
          {major.looseKinds.length > 0 ? (
            <li>
              <span className="ie-tree-group" data-level={1}>
                {m.dev_items_tax_loose()}
              </span>
              <ul className="ie-tree-children">
                {major.looseKinds.map((kind) => (
                  <KindItem
                    key={kind.id}
                    kind={kind}
                    entry={kindEntries.get(kind.id)}
                    current={current}
                    locale={locale}
                    onPick={onPick}
                  />
                ))}
              </ul>
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}

/** 마디가 든 대분류(나무를 펼칠 곳) */
function majorOf(tree: readonly MajorNode[], node: TreeNodeRef | null): ItemCategoryId | null {
  if (!node) return null;
  if (node.kind === "major" || node.kind === "unsorted") return node.id;
  if (node.kind === "sub") return findSub(tree, node.id)?.entry.major ?? null;
  return findKind(tree, node.id) ? "equipment" : null;
}

export function ItemTaxonomy({
  list,
  stage,
  locale,
  focus,
  onStage,
  onOpenItem,
  onShowItems,
}: {
  list: ItemEditorListResponse;
  stage: Stage;
  locale: "ko" | "en";
  focus: TaxonomyFocus | null;
  onStage: (category: TaxonomyCategory, id: string, next: Staged<TaxonomyJson> | null) => void;
  onOpenItem: (id: string) => void;
  /** [아이템] 탭을 이 마디로 걸러 연다 */
  onShowItems: (patch: Partial<ItemQuery>) => void;
}) {
  const [tile, setTile] = useState<ItemCategoryId | "all">("all");
  const [node, setNode] = useState<TreeNodeRef | null>(null);
  const [seenFocus, setSeenFocus] = useState<number | null>(null);
  const items = treeItems(list.items, stage.items);
  const subs = taxEntries(list.subcategories, stage.item_subcategories, isSubcategoryJson);
  const kinds = taxEntries(list.weaponTypes, stage.weapon_types, isWeaponTypeJson);
  const tree = buildItemTree(items, subs, kinds);
  const subEntries = new Map<string, TaxEntry<TaxonomyJson>>(subs.map((entry) => [entry.id, entry]));
  const kindEntries = new Map<string, TaxEntry<TaxonomyJson>>(kinds.map((entry) => [entry.id, entry]));

  // 담은 변경 막대에서 고른 분류 자료 → 그 마디(그리는 중에 한 번만 맞춘다: 효과 안 setState 대신 이전 값과 견준다)
  if (focus && focus.at !== seenFocus) {
    setSeenFocus(focus.at);
    if (focus.category !== "item_tags") {
      const next: TreeNodeRef =
        focus.category === "item_subcategories"
          ? { kind: "sub", id: focus.id }
          : { kind: "weapon", id: focus.id };
      setNode(next);
      setTile(majorOf(tree, next) ?? "all");
    }
  }

  const openMajor = majorOf(tree, node);
  const majors = tile === "all" ? tree : tree.filter((major) => major.id === tile);
  const pick = (next: TreeNodeRef): void => {
    setNode(next);
    if (tile !== "all") setTile(majorOf(tree, next) ?? tile);
  };
  return (
    <div className="ie-taxonomy">
      <p className="field-hint ie-tax-lead">{m.dev_items_tax_lead()}</p>
      <ItemCategoryTiles
        counts={treeCounts(tree)}
        total={items.length}
        selected={tile}
        subtitle={(category) =>
          m.dev_items_tile_subs({ count: tree.find((major) => major.id === category)?.subs.length ?? 0 })
        }
        onSelect={(category) => {
          setTile(category);
          setNode(category === "all" ? null : { kind: "major", id: category });
        }}
      />
      <div className="ie-tax-split">
        <nav className="ie-panel ie-tax-tree" aria-label={m.dev_items_tax_tree_label()}>
          <ul className="ie-tree">
            {majors.map((major) => (
              <MajorBranch
                key={major.id}
                major={major}
                current={node}
                expanded={tile !== "all" || openMajor === major.id}
                subEntries={subEntries}
                kindEntries={kindEntries}
                locale={locale}
                onPick={pick}
              />
            ))}
          </ul>
        </nav>
        <TaxonomyNode
          key={node ? refKey(node) : "none"}
          node={node}
          tree={tree}
          items={items}
          subs={subs}
          kinds={kinds}
          list={list}
          stage={stage}
          locale={locale}
          onPick={pick}
          onStage={onStage}
          onOpenItem={onOpenItem}
          onShowItems={onShowItems}
        />
      </div>
      <TaxonomySection
        title={m.dev_items_tax_tags_title()}
        hint={m.dev_items_tax_tags_hint()}
        category="item_tags"
        rows={list.tags}
        staged={stage.item_tags}
        taken={
          new Set([
            ...list.tags.map((row) => row.entry.id),
            ...(list.retired.item_tags ?? []),
            ...stage.item_tags.keys(),
          ])
        }
        locale={locale}
        onStage={onStage}
      />
    </div>
  );
}
