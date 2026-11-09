// [아이템 분류] 탭의 고른 마디 — 대분류(고정 안내·기본 창고·아래 중분류·그 자리의 [새 중분류]), 중분류 없음(풀이·질문 897), 중분류(이름·켬·
// 대분류·차례·창고·식품 칸, 무기·보조 무기면 아래 무기 종류·[새 무기 종류]·칸으로 묶인다는 풀이 질문 896), 무기 종류(이름·켬·칸·차례·탄약,
// 보조 칸 종류면 "무기 아님" 질문 895). 칸은 공용 견주기(CompareProvider: 담음·팩과 다름·[되돌리기]·[팩 값으로])에 든다.
// 아래에 든 아이템(이름·ID·티어, 누르면 [아이템] 탭에서 연다)과 [아이템 탭에서 이 마디로 거르기].
import {
  ITEM_LIMITS,
  type ItemCategoryId,
  type ItemEditorListResponse,
  type SubcategoryJson,
  type WeaponTypeJson,
} from "@terra/shared/itemEditor";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { m } from "../../paraglide/messages.js";
import { CompareProvider } from "../content/contentEditorCompare.tsx";
import { CheckField, TextField } from "../content/contentEditorFields.tsx";
import { sameJson } from "../content/contentEditorModel.ts";
import { NewEntryForm, SubcategoryFields, WeaponTypeFields, templateOf } from "./ItemTaxonomyFields.tsx";
import { CategoryIcon } from "./itemIcons.tsx";
import { CATEGORY_TEXT, STORAGE_TEXT } from "./itemMessages.ts";
import {
  type ItemQuery,
  type Stage,
  type Staged,
  type TaxonomyCategory,
  type TaxonomyJson,
  isTaxonomyJson,
} from "./itemModel.ts";
import {
  NO_SUBCATEGORY,
  type MajorNode,
  type TaxEntry,
  type TreeItem,
  type TreeNodeRef,
  WEAPON_SLOT_SUBCATEGORY,
  findKind,
  findSub,
  isOffhandKind,
  itemsOfNode,
} from "./itemTree.ts";

/** 마디에 든 아이템을 몇 개까지 그리나(넘으면 [아이템] 탭으로 거른다) */
const ITEMS_SHOWN = 40;

/** 대분류 기본 보관 창고(중분류가 정하지 않으면, D-121: 장비 무기고·식품 식량 창고·나머지 일반) */
const DEFAULT_STORAGE: Readonly<Record<ItemCategoryId, "armory" | "food" | "general">> = {
  raw: "general",
  processed: "general",
  part: "general",
  equipment: "armory",
  consumable: "food",
  gem: "general",
  construction: "general",
  document: "general",
  precious: "general",
};

/** 칸 → 그 칸 종류가 보이는 중분류의 거꾸로(새 무기 종류의 칸) */
const slotOfSub = (subId: string): WeaponTypeJson["slot"] | null =>
  subId === WEAPON_SLOT_SUBCATEGORY.weapon
    ? "weapon"
    : subId === WEAPON_SLOT_SUBCATEGORY.offhand
      ? "offhand"
      : null;

/** 자료 이상 풀이 + 기획 질문 번호 */
function Oddity({ text, question }: { text: string; question: number }) {
  return (
    <p className="ie-oddity" data-question={question}>
      <span className="ie-odd-mark" aria-hidden="true">
        !
      </span>
      <span>
        <strong>{m.dev_items_tax_oddity()}</strong> · {text}{" "}
        <span className="ie-dim">{m.dev_items_tax_question({ number: question })}</span>
      </span>
    </p>
  );
}

function NodeItems({
  node,
  items,
  subs,
  locale,
  onOpenItem,
  onShow,
}: {
  node: TreeNodeRef;
  items: readonly TreeItem[];
  subs: readonly TaxEntry<SubcategoryJson>[];
  locale: "ko" | "en";
  onOpenItem: (id: string) => void;
  onShow: () => void;
}) {
  const headingId = useId();
  const inside = itemsOfNode(node, items, subs).toSorted((a, b) =>
    a.name[locale].localeCompare(b.name[locale], locale),
  );
  return (
    <section className="ie-node-items" aria-labelledby={headingId} data-part="node-items">
      <div className="ie-node-items-head">
        <h3 id={headingId} className="ie-subheading">
          {m.dev_items_tax_items({ count: inside.length })}
        </h3>
        {inside.length > 0 ? (
          <button type="button" className="button-small ie-show-items" onClick={onShow}>
            {m.dev_items_tax_show_items()}
          </button>
        ) : null}
      </div>
      {inside.length === 0 ? <p className="field-hint">{m.dev_items_tax_items_none()}</p> : null}
      <ul className="ie-node-item-list">
        {inside.slice(0, ITEMS_SHOWN).map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="ie-node-item"
              data-item={item.id}
              onClick={() => onOpenItem(item.id)}
            >
              <span className="ie-tier" data-tier={item.tier}>
                T{item.tier}
              </span>
              <span className="ie-node-item-name">{item.name[locale]}</span>
              <code className="ie-tree-id">{item.id}</code>
            </button>
          </li>
        ))}
      </ul>
      {inside.length > ITEMS_SHOWN ? (
        <p className="field-hint">{m.dev_items_tax_items_more({ count: inside.length - ITEMS_SHOWN })}</p>
      ) : null}
    </section>
  );
}

/** 분류 자료 하나(중분류·무기 종류)의 칸 + [담기 취소]·[팩 값으로]/[지우기] */
function EntryEditor({
  category,
  entry,
  onStage,
  children,
}: {
  category: TaxonomyCategory;
  entry: TaxEntry<TaxonomyJson>;
  onStage: (category: TaxonomyCategory, id: string, next: Staged<TaxonomyJson> | null) => void;
  children: (draft: TaxonomyJson, put: (next: TaxonomyJson) => void) => ReactNode;
}) {
  const { row, staged, id } = entry;
  const reverting = staged?.op === "revert";
  const draft = entry.entry;
  const put = (next: TaxonomyJson): void => {
    const base = row?.entry ?? null;
    onStage(
      category,
      id,
      base !== null && sameJson(next, base)
        ? null
        : { op: "put", entry: next, base, baseHash: row?.hash ?? null },
    );
  };
  return (
    <CompareProvider
      source={{
        draft,
        current: row?.entry ?? null,
        pack: row?.origin === "pack" ? row.entry : null,
        locked: reverting,
        apply: (next) => {
          if (isTaxonomyJson(category, next)) put(next);
        },
      }}
    >
      <div className="ie-node-fields ie-editing-tax" data-entry={id} data-staged={staged ? "" : undefined}>
        {reverting ? (
          <p className="field-hint">
            {row?.origin === "created" ? m.dev_items_delete() : m.dev_items_revert()} ·{" "}
            {m.dev_items_revert_staged()}
          </p>
        ) : (
          <>
            <div className="ie-grid">
              <TextField
                label={m.dev_items_field_name_ko()}
                path="name.ko"
                value={draft.name.ko}
                maxLength={ITEM_LIMITS.nameMax}
                onChange={(ko) => put({ ...draft, name: { ...draft.name, ko } })}
              />
              <TextField
                label={m.dev_items_field_name_en()}
                path="name.en"
                value={draft.name.en}
                maxLength={ITEM_LIMITS.nameMax}
                onChange={(en) => put({ ...draft, name: { ...draft.name, en } })}
              />
            </div>
            <CheckField
              label={m.dev_items_field_enabled()}
              path="enabled"
              checked={draft.enabled}
              onChange={(enabled) => put({ ...draft, enabled })}
            />
            {children(draft, put)}
          </>
        )}
        <div className="ie-inline-actions">
          {staged ? (
            <button type="button" className="button-small" onClick={() => onStage(category, id, null)}>
              {m.dev_items_unstage()}
            </button>
          ) : null}
          {row && row.origin !== "pack" && !reverting ? (
            <button
              type="button"
              className="button-small ie-node-revert"
              onClick={() =>
                onStage(category, id, { op: "revert", entry: null, base: row.entry, baseHash: row.hash })
              }
            >
              {row.origin === "created" ? m.dev_items_delete() : m.dev_items_revert()}
            </button>
          ) : null}
        </div>
      </div>
    </CompareProvider>
  );
}

function NodeHead({
  level,
  icon,
  title,
  id,
  count,
}: {
  level: string;
  icon?: ReactNode;
  title: string;
  id?: string | undefined;
  count: number;
}) {
  return (
    <header className="ie-node-head">
      <span className="ie-node-level">{level}</span>
      <h2 className="ie-heading ie-node-title">
        {icon}
        <span>{title}</span>
        {id ? <code className="ie-tree-id">{id}</code> : null}
        <span className="ie-dim">{m.dev_items_tax_count({ count })}</span>
      </h2>
    </header>
  );
}

/** 아래 마디로 가는 줄(대분류의 중분류, 중분류의 무기 종류) */
function ChildLinks({
  title,
  links,
  onPick,
}: {
  title: string;
  links: readonly { node: TreeNodeRef; label: string; count: number; odd?: boolean }[];
  onPick: (node: TreeNodeRef) => void;
}) {
  if (links.length === 0) return null;
  return (
    <div className="ie-node-children">
      <h3 className="ie-subheading">{title}</h3>
      <ul className="ie-child-list">
        {links.map((link) => (
          <li key={`${link.node.kind}:${link.node.id}`}>
            <button
              type="button"
              className="ie-child-link"
              data-odd={link.odd ? "" : undefined}
              onClick={() => onPick(link.node)}
            >
              <span>{link.label}</span>
              <span className="ie-tree-count">{link.count}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** [새 …] 펼침(그 자리 값이 들어간 틀) */
function NewHere({
  label,
  taken,
  onCreate,
}: {
  label: string;
  taken: ReadonlySet<string>;
  onCreate: (id: string, name: { ko: string; en: string }) => void;
}) {
  return (
    <details className="ie-tax-new ie-node-new">
      <summary>{label}</summary>
      <NewEntryForm taken={taken} onCreate={onCreate} />
    </details>
  );
}

type NodeProps = {
  node: TreeNodeRef | null;
  tree: readonly MajorNode[];
  items: readonly TreeItem[];
  subs: readonly TaxEntry<SubcategoryJson>[];
  kinds: readonly TaxEntry<WeaponTypeJson>[];
  list: ItemEditorListResponse;
  stage: Stage;
  locale: "ko" | "en";
  onPick: (node: TreeNodeRef) => void;
  onStage: (category: TaxonomyCategory, id: string, next: Staged<TaxonomyJson> | null) => void;
  onOpenItem: (id: string) => void;
  onShowItems: (patch: Partial<ItemQuery>) => void;
};

function NodeBody({
  node,
  tree,
  items,
  subs,
  kinds,
  list,
  stage,
  locale,
  onPick,
  onStage,
  onOpenItem,
  onShowItems,
}: NodeProps) {
  const takenOf = (category: "item_subcategories" | "weapon_types") =>
    new Set([
      ...(category === "item_subcategories" ? list.subcategories : list.weaponTypes).map(
        (row) => row.entry.id,
      ),
      ...(list.retired[category] ?? []),
      ...stage[category].keys(),
    ]);
  const create =
    (
      category: "item_subcategories" | "weapon_types",
      at: { major?: ItemCategoryId; slot?: WeaponTypeJson["slot"] },
    ) =>
    (id: string, name: { ko: string; en: string }) => {
      onStage(category, id, {
        op: "put",
        entry: templateOf(category, id, name, at),
        base: null,
        baseHash: null,
      });
      onPick(category === "item_subcategories" ? { kind: "sub", id } : { kind: "weapon", id });
    };
  const itemsPart = (patch: Partial<ItemQuery>) => (current: TreeNodeRef) => (
    <NodeItems
      node={current}
      items={items}
      subs={subs}
      locale={locale}
      onOpenItem={onOpenItem}
      onShow={() => onShowItems(patch)}
    />
  );

  if (!node)
    return (
      <section className="ie-panel ie-tax-node" data-node="none">
        <p className="ce-pick">{m.dev_items_tax_pick()}</p>
      </section>
    );

  if (node.kind === "major" || node.kind === "unsorted") {
    const major = tree.find((item) => item.id === node.id);
    if (!major) return null;
    const name = CATEGORY_TEXT[major.id]();
    if (node.kind === "unsorted")
      return (
        <section className="ie-panel ie-tax-node" data-node={`unsorted:${major.id}`}>
          <NodeHead level={name} title={m.dev_items_tax_unsorted()} count={major.unsorted} />
          <Oddity text={m.dev_items_tax_unsorted_hint()} question={897} />
          {itemsPart({ category: major.id, subcategory: NO_SUBCATEGORY })(node)}
        </section>
      );
    return (
      <section className="ie-panel ie-tax-node" data-node={`major:${major.id}`}>
        <NodeHead
          level={m.dev_items_tax_level_major()}
          icon={<CategoryIcon category={major.id} />}
          title={name}
          id={major.id}
          count={major.count}
        />
        <p className="field-hint">{m.dev_items_tax_major_fixed()}</p>
        <p className="field-hint">
          {m.dev_items_tax_default_storage({ storage: STORAGE_TEXT[DEFAULT_STORAGE[major.id]]() })}
        </p>
        <ChildLinks
          title={m.dev_items_tax_subcategories()}
          links={[
            ...major.subs.map((sub) => ({
              node: { kind: "sub", id: sub.id } as const,
              label: sub.entry.name[locale],
              count: sub.count,
            })),
            ...(major.unsorted > 0
              ? [
                  {
                    node: { kind: "unsorted", id: major.id } as const,
                    label: m.dev_items_tax_unsorted(),
                    count: major.unsorted,
                    odd: true,
                  },
                ]
              : []),
          ]}
          onPick={onPick}
        />
        <NewHere
          label={m.dev_items_tax_new_sub({ name })}
          taken={takenOf("item_subcategories")}
          onCreate={create("item_subcategories", { major: major.id })}
        />
        {itemsPart({ category: major.id })(node)}
      </section>
    );
  }

  if (node.kind === "sub") {
    const sub = findSub(tree, node.id);
    const entry = subs.find((item) => item.id === node.id);
    if (!sub || !entry) return null;
    const slot = sub.entry.major === "equipment" ? slotOfSub(sub.id) : null;
    return (
      <section className="ie-panel ie-tax-node" data-node={`sub:${sub.id}`}>
        <NodeHead
          level={`${CATEGORY_TEXT[sub.entry.major]()} › ${m.dev_items_tax_level_sub()}`}
          title={sub.entry.name[locale]}
          id={sub.id}
          count={sub.count}
        />
        <EntryEditor category="item_subcategories" entry={entry} onStage={onStage}>
          {(draft, put) => ("major" in draft ? <SubcategoryFields draft={draft} onChange={put} /> : null)}
        </EntryEditor>
        {slot ? (
          <>
            <Oddity text={m.dev_items_tax_kind_link()} question={896} />
            <ChildLinks
              title={m.dev_items_tax_weapon_types()}
              links={sub.kinds.map((kind) => ({
                node: { kind: "weapon", id: kind.id } as const,
                label: kind.entry.name[locale],
                count: kind.count,
                odd: isOffhandKind(kind.entry),
              }))}
              onPick={onPick}
            />
            <NewHere
              label={m.dev_items_tax_new_kind({ name: sub.entry.name[locale] })}
              taken={takenOf("weapon_types")}
              onCreate={create("weapon_types", { slot })}
            />
          </>
        ) : null}
        {itemsPart({ category: sub.entry.major, subcategory: sub.id })(node)}
      </section>
    );
  }

  const found = findKind(tree, node.id);
  const entry = kinds.find((item) => item.id === node.id);
  if (!found || !entry) return null;
  const { kind, parent } = found;
  return (
    <section className="ie-panel ie-tax-node" data-node={`weapon:${kind.id}`}>
      <NodeHead
        level={`${CATEGORY_TEXT.equipment()} › ${parent ? parent.entry.name[locale] : m.dev_items_tax_loose()} › ${m.dev_items_tax_level_kind()}`}
        title={kind.entry.name[locale]}
        id={kind.id}
        count={kind.count}
      />
      {isOffhandKind(kind.entry) ? (
        <Oddity
          text={`${m.dev_items_tax_offhand_odd()} — ${m.dev_items_tax_offhand_hint()}`}
          question={895}
        />
      ) : null}
      <EntryEditor category="weapon_types" entry={entry} onStage={onStage}>
        {(draft, put) => ("slot" in draft ? <WeaponTypeFields draft={draft} onChange={put} /> : null)}
      </EntryEditor>
      {itemsPart({ category: "equipment", weaponType: kind.id })(node)}
    </section>
  );
}

export function TaxonomyNode(props: NodeProps) {
  const anchor = useRef<HTMLDivElement>(null);
  // 좁은 폭(나무와 마디가 한 칸씩)에서 중분류·무기 종류·중분류 없음 마디를 고르면 마디 판으로 내려간다(이 부품은 마디마다 새로 붙는다: key)
  useEffect(() => {
    const element = anchor.current;
    const split = element?.closest<HTMLElement>(".ie-tax-split");
    // 대분류(타일로도 고른다)는 내려가지 않는다: 나무를 이어서 고르게
    if (!props.node || props.node.kind === "major" || !element || !split) return;
    if (getComputedStyle(split).gridTemplateColumns.trim().split(/\s+/).length > 1) return;
    element.scrollIntoView({ block: "start" });
  }, [props.node]);
  return (
    <div ref={anchor} className="ie-node-anchor">
      <NodeBody {...props} />
    </div>
  );
}
