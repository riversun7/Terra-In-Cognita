// [아이템] 탭 위 띠(옛 아이템 편집기 모양, 사용자 2026-11-09) — 대분류 타일(그림·개수·이름) → 잇따른 거르기 대분류 → 중분류 → 무기 종류
// (분류 나무 itemTree와 같은 수·같은 규칙), 찾기("/"·Esc·↓ 첫 줄), 보이는 수·[거르기 지우기], [더 거르기](칸·입을 종류·출처·켬·티어·
// 담은 것만·권고), 정렬, 보기(목록·격자), [새 아이템], 넓은 폭에서 편집 판이 열렸으면 [편집 판 닫기](목록을 넓게).
import { ITEM_CATEGORY_IDS, type ItemEditorListResponse } from "@terra/shared/itemEditor";
import { EQUIP_SLOTS } from "@terra/shared/roster";
import { type ReactNode, type Ref, useId } from "react";
import { m } from "../../paraglide/messages.js";
import { FilterChip, FilterSelect } from "../content/contentEditorList.tsx";
import { ItemCategoryTiles } from "./ItemCategoryTiles.tsx";
import { ActionIcon } from "./itemIcons.tsx";
import { CATEGORY_TEXT, SLOT_TEXT } from "./itemMessages.ts";
import { EMPTY_QUERY, ITEM_ORIGIN_FILTERS, ITEM_SORTS, type ItemQuery, type ItemSort } from "./itemModel.ts";
import { type MajorNode, NO_SUBCATEGORY, findSub, treeCounts } from "./itemTree.ts";

export type ItemViewMode = "rows" | "cards";

const ORIGIN_FILTER_TEXT = {
  all: m.dev_items_filter_origin_all,
  pack: m.dev_items_origin_pack,
  edited: m.dev_items_origin_edited,
  created: m.dev_items_origin_created,
} as const;

const SORT_TEXT: Readonly<Record<ItemSort, () => string>> = {
  name: m.dev_items_sort_name,
  id: m.dev_items_sort_id,
  tier: m.dev_items_sort_tier,
  startPrice: m.dev_items_sort_value,
  weight: m.dev_items_sort_weight,
};

/** [더 거르기] 안에서 켠 수 */
const moreOf = (query: ItemQuery): number =>
  [
    query.slot !== "all",
    query.kind !== "all",
    query.origin !== "all",
    query.enabled !== "all",
    query.tierMin !== 0 || query.tierMax !== 9,
    query.advice,
    query.staged,
  ].filter(Boolean).length;

/** 찾는 글 말고 무엇이든 걸렸나 */
const filteredOf = (query: ItemQuery): boolean =>
  query.text.trim() !== "" ||
  query.category !== "all" ||
  query.subcategory !== "all" ||
  query.weaponType !== "all" ||
  moreOf(query) > 0;

/** 잇따른 거르기 칸 하나(보이는 이름표 + 고르기 상자) */
function CascadeField({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="ie-cascade-field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
    </div>
  );
}

export function ItemBrowseBar({
  list,
  tree,
  query,
  sort,
  shown,
  mode,
  locale,
  view,
  detailOpen,
  searchRef,
  onQuery,
  onSort,
  onMode,
  onCreate,
  onCloseDetail,
}: {
  list: ItemEditorListResponse;
  /** 목록 줄로 만든 분류 나무(타일·중분류·무기 종류 수) */
  tree: readonly MajorNode[];
  query: ItemQuery;
  sort: ItemSort;
  /** 찾기·거르기를 거친 줄 수 */
  shown: number;
  mode: ItemViewMode;
  locale: "ko" | "en";
  /** 좁은 폭에서 편집 판을 보고 있으면 "detail"(이 띠를 숨긴다) */
  view: "list" | "detail";
  detailOpen: boolean;
  searchRef: Ref<HTMLInputElement>;
  onQuery: (patch: Partial<ItemQuery>) => void;
  onSort: (sort: ItemSort) => void;
  onMode: (mode: ItemViewMode) => void;
  onCreate: () => void;
  onCloseDetail: () => void;
}) {
  const ids = useId();
  const counts = treeCounts(tree);
  const majors = query.category === "all" ? tree : tree.filter((major) => major.id === query.category);
  const pickedSub =
    query.subcategory === "all" || query.subcategory === NO_SUBCATEGORY
      ? null
      : findSub(tree, query.subcategory);
  const equipment = tree.find((major) => major.id === "equipment");
  // 무기 종류: 고른 중분류 아래 종류, 장비 대분류만 골랐으면 장비의 모든 무기 종류(이을 중분류가 없는 것 포함)
  const kinds = pickedSub
    ? pickedSub.kinds
    : query.category === "equipment" && query.subcategory === "all" && equipment
      ? [...equipment.subs.flatMap((sub) => sub.kinds), ...equipment.looseKinds]
      : [];
  const more = moreOf(query);
  const subOption = (major: MajorNode) => [
    ...major.subs.map((sub) => (
      <option key={sub.id} value={sub.id}>
        {m.dev_items_filter_category_count({ name: sub.entry.name[locale], count: sub.count })}
      </option>
    )),
    major.unsorted > 0 ? (
      <option
        key={`${major.id}-none`}
        value={query.category === "all" ? `${NO_SUBCATEGORY}${major.id}` : NO_SUBCATEGORY}
      >
        {m.dev_items_filter_sub_none({ count: major.unsorted })}
      </option>
    ) : null,
  ];
  const subValue =
    query.subcategory === NO_SUBCATEGORY && query.category !== "all" ? NO_SUBCATEGORY : query.subcategory;
  return (
    <div className="ie-browse" data-view={view}>
      <ItemCategoryTiles
        counts={counts}
        total={list.items.length}
        selected={query.category}
        onSelect={(category) => onQuery({ category, subcategory: "all", weaponType: "all" })}
      />
      <div className="ie-browse-bar" role="search">
        <div className="ie-cascade">
          <CascadeField label={m.dev_items_tax_level_major()}>
            {(id) => (
              <select
                id={id}
                className="ce-filter-select ie-major-filter"
                value={query.category}
                onChange={(event) => {
                  const category = ITEM_CATEGORY_IDS.find((value) => value === event.target.value) ?? "all";
                  onQuery({ category, subcategory: "all", weaponType: "all" });
                }}
              >
                <option value="all">{m.dev_items_filter_category_all({ count: list.items.length })}</option>
                {ITEM_CATEGORY_IDS.map((value) => (
                  <option key={value} value={value}>
                    {m.dev_items_filter_category_count({
                      name: CATEGORY_TEXT[value](),
                      count: counts[value],
                    })}
                  </option>
                ))}
              </select>
            )}
          </CascadeField>
          <span className="ie-cascade-sep" aria-hidden="true">
            ›
          </span>
          <CascadeField label={m.dev_items_tax_level_sub()}>
            {(id) => (
              <select
                id={id}
                className="ce-filter-select ie-sub-filter"
                value={subValue}
                onChange={(event) => {
                  const value = event.target.value;
                  // "전체"에서 중분류 없음을 고르면 값 꼬리가 대분류다("-raw")
                  if (value.startsWith(NO_SUBCATEGORY) && value.length > NO_SUBCATEGORY.length) {
                    const category = ITEM_CATEGORY_IDS.find((item) => item === value.slice(1));
                    if (category) onQuery({ category, subcategory: NO_SUBCATEGORY, weaponType: "all" });
                    return;
                  }
                  // 중분류를 고르면 대분류도 그 중분류의 대분류로 맞춘다
                  const sub = findSub(tree, value);
                  onQuery({
                    subcategory: value,
                    weaponType: "all",
                    ...(sub ? { category: sub.entry.major } : {}),
                  });
                }}
              >
                <option value="all">{m.dev_items_filter_subcategory_all()}</option>
                {query.category === "all"
                  ? majors.map((major) =>
                      major.subs.length > 0 || major.unsorted > 0 ? (
                        <optgroup key={major.id} label={CATEGORY_TEXT[major.id]()}>
                          {subOption(major)}
                        </optgroup>
                      ) : null,
                    )
                  : majors.flatMap(subOption)}
              </select>
            )}
          </CascadeField>
          <span className="ie-cascade-sep" aria-hidden="true">
            ›
          </span>
          <CascadeField label={m.dev_items_tax_level_kind()}>
            {(id) => (
              <select
                id={id}
                className="ce-filter-select ie-kind-filter"
                value={query.weaponType}
                disabled={kinds.length === 0 && query.weaponType === "all"}
                onChange={(event) => onQuery({ weaponType: event.target.value })}
              >
                <option value="all">{m.dev_items_filter_weapon_type_all()}</option>
                {kinds.map((kind) => (
                  <option key={kind.id} value={kind.id}>
                    {m.dev_items_filter_category_count({ name: kind.entry.name[locale], count: kind.count })}
                  </option>
                ))}
              </select>
            )}
          </CascadeField>
        </div>
        <div className="ce-search ie-browse-search">
          <label className="visually-hidden" htmlFor={`${ids}-search`}>
            {m.dev_content_search_label()}
          </label>
          <input
            ref={searchRef}
            id={`${ids}-search`}
            className="input ce-search-input"
            type="search"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            aria-keyshortcuts="/"
            placeholder={m.dev_items_search_placeholder()}
            value={query.text}
            onChange={(event) => onQuery({ text: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query.text !== "") {
                event.preventDefault();
                onQuery({ text: "" });
              }
              // 찾는 글에서 ↓ = 첫 줄로(Tab으로 들어오는 줄)
              if (event.key === "ArrowDown") {
                const first = event.currentTarget
                  .closest(".ie-screen")
                  ?.querySelector<HTMLButtonElement>('.ie-lines .ie-item[tabindex="0"]');
                if (first) {
                  event.preventDefault();
                  first.focus();
                }
              }
            }}
          />
          <kbd className="ce-search-key" aria-hidden="true">
            /
          </kbd>
        </div>
        <p className="ce-shown ie-shown" aria-live="polite">
          {m.dev_content_shown({ shown, total: list.items.length })}
        </p>
        {filteredOf(query) ? (
          <button type="button" className="ce-link-button ce-reset" onClick={() => onQuery(EMPTY_QUERY)}>
            {m.dev_content_reset_filters()}
          </button>
        ) : null}
        <div className="ie-browse-tools">
          <FilterSelect
            label={m.dev_items_sort()}
            value={sort}
            options={ITEM_SORTS.map((value) => ({ value, label: SORT_TEXT[value]() }))}
            onChange={onSort}
          />
          <div className="ie-view-toggle" role="group" aria-label={m.dev_items_view_label()}>
            {(["rows", "cards"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className="ie-icon-button"
                data-mode={value}
                aria-pressed={mode === value}
                aria-label={value === "rows" ? m.dev_items_view_rows() : m.dev_items_view_cards()}
                title={value === "rows" ? m.dev_items_view_rows() : m.dev_items_view_cards()}
                onClick={() => onMode(value)}
              >
                <ActionIcon name={value} />
              </button>
            ))}
          </div>
          <button type="button" className="button-small button-primary ie-new-button" onClick={onCreate}>
            {m.dev_items_new()}
          </button>
          {detailOpen ? (
            <button type="button" className="button-small ie-close-detail" onClick={onCloseDetail}>
              <ActionIcon name="close" />
              {m.dev_items_close_detail()}
            </button>
          ) : null}
        </div>
        <details className="ie-filters" open={more > 0 ? true : undefined}>
          <summary>
            {more > 0 ? m.dev_items_more_filters_count({ count: more }) : m.dev_items_more_filters()}
          </summary>
          <div className="ie-filter-grid">
            <FilterSelect
              label={m.dev_items_field_slot()}
              value={query.slot}
              options={[
                { value: "all" as const, label: m.dev_items_filter_slot_all() },
                ...EQUIP_SLOTS.map((slot) => ({ value: slot, label: SLOT_TEXT[slot]() })),
              ]}
              onChange={(slot) => onQuery({ slot })}
            />
            <FilterSelect
              label={m.dev_items_field_kinds()}
              value={query.kind}
              options={[
                { value: "all", label: m.dev_items_filter_kind_all() },
                ...list.unitKinds.map((kind) => ({ value: kind.id, label: kind.name[locale] })),
              ]}
              onChange={(kind) => onQuery({ kind })}
            />
            <FilterSelect
              label={m.dev_items_filter_origin()}
              value={query.origin}
              options={ITEM_ORIGIN_FILTERS.map((value) => ({ value, label: ORIGIN_FILTER_TEXT[value]() }))}
              onChange={(origin) => onQuery({ origin })}
            />
            <FilterSelect
              label={m.dev_items_filter_enabled()}
              value={query.enabled}
              options={[
                { value: "all" as const, label: m.dev_items_filter_enabled_all() },
                { value: "on" as const, label: m.dev_items_filter_on() },
                { value: "off" as const, label: m.dev_items_filter_off() },
              ]}
              onChange={(enabled) => onQuery({ enabled })}
            />
            <span className="ie-range" role="group" aria-label={m.dev_items_filter_tier()}>
              <span className="ie-range-label" aria-hidden="true">
                {m.dev_items_filter_tier()}
              </span>
              <input
                className="input"
                inputMode="numeric"
                aria-label={m.dev_items_filter_tier_min()}
                value={query.tierMin}
                onChange={(event) =>
                  onQuery({ tierMin: Math.max(0, Math.min(9, Number(event.target.value) || 0)) })
                }
              />
              <span aria-hidden="true">~</span>
              <input
                className="input"
                inputMode="numeric"
                aria-label={m.dev_items_filter_tier_max()}
                value={query.tierMax}
                onChange={(event) =>
                  onQuery({ tierMax: Math.max(0, Math.min(9, Number(event.target.value) || 0)) })
                }
              />
            </span>
            <FilterChip
              label={m.dev_content_filter_staged()}
              pressed={query.staged}
              onToggle={(staged) => onQuery({ staged })}
            />
            <FilterChip
              label={m.dev_items_filter_advice()}
              pressed={query.advice}
              onToggle={(advice) => onQuery({ advice })}
            />
          </div>
        </details>
      </div>
    </div>
  );
}
