// 아이템 편집기 왼쪽 목록(설계안 3.3, 2026-11-08 화면 개편: 공용 EntryList) — 찾기(ID·이름·태그·대분류·중분류, 낱말 여럿은 모두 맞는 것,
// 늦춰 거름), 거르기(대분류(개수) · 정렬 · [담은 것만] · [권고 있음] + [더 거르기]: 중분류·칸·입을 종류·출처·켬·티어), [새 아이템].
// 줄마다 대분류 표지·이름·ID·한 줄 요약(티어·칸/창고·거래·무기·스탯·효과·무게)·표지(담음·출처·꺼짐·코드 참조·권고 수).
// 휴대폰은 거르기가 [거르기 N]으로 접힌다. 200줄씩 더 그린다(더 보기).
import {
  ITEM_CATEGORY_IDS,
  ITEM_PRIMARY_CODES,
  type ItemEditorListResponse,
  type ItemRow,
} from "@terra/shared/itemEditor";
import { EQUIP_SLOTS } from "@terra/shared/roster";
import { type Ref, useDeferredValue, useId } from "react";
import { m } from "../../paraglide/messages.js";
import {
  CATEGORY_TEXT,
  MARKET_TEXT,
  ORIGIN_TEXT,
  PRIMARY_TEXT,
  SLOT_TEXT,
  STORAGE_TEXT,
} from "./itemMessages.ts";
import {
  EMPTY_QUERY,
  ITEM_ORIGIN_FILTERS,
  ITEM_SORTS,
  type ItemQuery,
  type ItemSort,
  categoryCounts,
  filterItems,
  sortItems,
  weightText,
} from "./itemModel.ts";
import {
  type EntryBadge,
  type EntryRow,
  EntryList,
  FilterChip,
  FilterSelect,
} from "../content/contentEditorList.tsx";
import "./itemList.css";

const ORIGIN_FILTER_TEXT = {
  all: m.dev_items_filter_all,
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

/** 한 줄 요약: 무기 = 공격 칸·적정 스탯, 방어구 = 주요 스탯, 소모품 = 효과, 자원 = 무게·시작 시세 */
function summaryOf(row: ItemRow, list: ItemEditorListResponse, locale: "ko" | "en"): string {
  if (row.attack) {
    const parts = [
      row.attack.physical === null ? null : m.dev_items_summary_physical({ value: row.attack.physical }),
      row.attack.elemental === null ? null : m.dev_items_summary_elemental({ value: row.attack.elemental }),
    ].filter((part) => part !== null);
    const appropriate = row.appropriate
      ? ITEM_PRIMARY_CODES.flatMap((code) => {
          const value = row.appropriate?.[code];
          return value === undefined ? [] : [`${PRIMARY_TEXT[code]()} ${value}`];
        }).join(" ")
      : "";
    return [...parts, appropriate].filter((part) => part !== "").join(" · ");
  }
  if (row.stats.length > 0) {
    const names = new Map(list.statRows.map((stat) => [stat.id, stat.name[locale]]));
    return row.stats
      .map((range) => {
        const code = ITEM_PRIMARY_CODES.find((primary) => primary === range.stat);
        const name = code ? PRIMARY_TEXT[code]() : (names.get(range.stat) ?? range.stat);
        return `${name} ${range.min}~${range.max}`;
      })
      .join(" · ");
  }
  if (row.effects.length > 0) {
    const names = new Map(list.effects.map((effect) => [effect.id, effect.name[locale]]));
    return row.effects.map((id) => names.get(id) ?? id).join(" · ");
  }
  return [
    row.weight === null ? null : weightText(row.weight),
    m.dev_items_summary_value({ value: row.startPrice }),
  ]
    .filter((part) => part !== null)
    .join(" · ");
}

/** 켠 거르기 수(찾는 글 빼고) */
const activeOf = (query: ItemQuery): number =>
  [
    query.category !== "all",
    query.subcategory !== "all",
    query.slot !== "all",
    query.kind !== "all",
    query.origin !== "all",
    query.enabled !== "all",
    query.tierMin !== 0 || query.tierMax !== 9,
    query.advice,
    query.staged,
  ].filter(Boolean).length;

/** 대분류 이름(찾기에도 쓴다) */
export function categoryLabels(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of ITEM_CATEGORY_IDS) out[id] = CATEGORY_TEXT[id]();
  return out;
}

/** 보이는 아이템(정렬까지) — 화면이 Alt+↑↓ 이전·다음에도 쓴다 */
export function shownItems(
  list: ItemEditorListResponse,
  query: ItemQuery,
  sort: ItemSort,
  staged: ReadonlySet<string>,
  locale: "ko" | "en",
): ItemRow[] {
  return sortItems(filterItems(list.items, query, staged, categoryLabels()), sort, locale);
}

export function ItemList({
  list,
  shown,
  selected,
  staged,
  locale,
  query,
  sort,
  onQuery,
  onSort,
  searchRef,
  onSelect,
  onCreate,
}: {
  list: ItemEditorListResponse;
  /** 찾기·거르기·정렬을 거친 줄(화면이 거른다) */
  shown: readonly ItemRow[];
  selected: string | null;
  /** 담은 변경이 있는 아이템 ID */
  staged: ReadonlySet<string>;
  locale: "ko" | "en";
  query: ItemQuery;
  sort: ItemSort;
  onQuery: (patch: Partial<ItemQuery>) => void;
  onSort: (sort: ItemSort) => void;
  searchRef: Ref<HTMLInputElement>;
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  const filterIds = useId();
  const counts = categoryCounts(list.items);
  const subcategories = list.subcategories.filter(
    (row) => query.category === "all" || row.entry.major === query.category,
  );
  const more = [
    query.subcategory !== "all",
    query.slot !== "all",
    query.kind !== "all",
    query.origin !== "all",
    query.enabled !== "all",
    query.tierMin !== 0 || query.tierMax !== 9,
  ].filter(Boolean).length;
  const rows: EntryRow[] = shown.map((row) => {
    const badges: EntryBadge[] = [];
    if (staged.has(row.id))
      badges.push({ key: "staged", label: m.dev_content_badge_staged(), tone: "staged" });
    if (row.origin !== "pack")
      badges.push({
        key: "origin",
        label: ORIGIN_TEXT[row.origin](),
        tone: row.origin === "created" ? "created" : "changed",
        className: `ie-origin-${row.origin}`,
      });
    if (!row.enabled) badges.push({ key: "off", label: m.dev_items_disabled(), tone: "off" });
    if (row.codeRef) badges.push({ key: "code", label: m.dev_items_code_ref_chip(), tone: "plain" });
    if (row.advice > 0)
      badges.push({ key: "advice", label: m.dev_items_advice_count({ count: row.advice }), tone: "advice" });
    const where = row.slot ? SLOT_TEXT[row.slot]() : STORAGE_TEXT[row.storage]();
    const summary = summaryOf(row, list, locale);
    return {
      id: row.id,
      name: row.name[locale],
      tag: { label: CATEGORY_TEXT[row.category](), value: row.category },
      summary: [`T${row.tier}`, where, MARKET_TEXT[row.market](), summary]
        .filter((part) => part !== "")
        .join(" · "),
      badges,
      staged: staged.has(row.id),
      changed: row.origin !== "pack",
      off: !row.enabled,
    };
  });
  return (
    <EntryList
      label={m.dev_items_list_label()}
      rows={rows}
      total={list.items.length}
      selected={selected}
      onSelect={onSelect}
      search={query.text}
      onSearch={(text) => onQuery({ text })}
      searchPlaceholder={m.dev_items_search_placeholder()}
      searchRef={searchRef}
      activeFilters={activeOf(query)}
      onReset={() => onQuery(EMPTY_QUERY)}
      itemClass="ie-item"
      dataKey="item"
      emptyText={m.dev_items_empty()}
      actions={
        <button type="button" className="ie-new-button" onClick={onCreate}>
          {m.dev_items_new()}
        </button>
      }
      filters={
        <>
          <FilterSelect
            label={m.dev_items_category_label()}
            className="ie-category-filter"
            value={query.category}
            options={[
              { value: "all" as const, label: m.dev_items_filter_category_all({ count: list.items.length }) },
              ...ITEM_CATEGORY_IDS.map((value) => ({
                value,
                label: m.dev_items_filter_category_count({
                  name: CATEGORY_TEXT[value](),
                  count: counts[value],
                }),
              })),
            ]}
            onChange={(category) => onQuery({ category, subcategory: "all" })}
          />
          <FilterSelect
            label={m.dev_items_sort()}
            value={sort}
            options={ITEM_SORTS.map((value) => ({ value, label: SORT_TEXT[value]() }))}
            onChange={onSort}
          />
          <FilterChip
            label={m.dev_content_filter_staged()}
            pressed={query.staged}
            onToggle={(next) => onQuery({ staged: next })}
          />
          <FilterChip
            label={m.dev_items_filter_advice()}
            pressed={query.advice}
            onToggle={(advice) => onQuery({ advice })}
          />
          <details className="ie-filters" open={more > 0 ? true : undefined}>
            <summary>
              {more > 0 ? m.dev_items_more_filters_count({ count: more }) : m.dev_items_more_filters()}
            </summary>
            <div className="ie-filter-grid">
              <FilterSelect
                label={m.dev_items_field_subcategory()}
                value={query.subcategory}
                options={[
                  { value: "all", label: m.dev_items_filter_subcategory_all() },
                  ...subcategories.map((row) => ({ value: row.entry.id, label: row.entry.name[locale] })),
                ]}
                onChange={(subcategory) => onQuery({ subcategory })}
              />
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
                options={ITEM_ORIGIN_FILTERS.map((value) => ({
                  value,
                  label: value === "all" ? m.dev_items_filter_origin_all() : ORIGIN_FILTER_TEXT[value](),
                }))}
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
                  id={`${filterIds}-tier-min`}
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
            </div>
          </details>
        </>
      }
    />
  );
}

/** 찾는 글을 늦춰 거른다(줄 몇백 개를 다시 그리는 동안 글자 입력이 막히지 않게) */
export function useDeferredQuery(query: ItemQuery): ItemQuery {
  const text = useDeferredValue(query.text);
  return text === query.text ? query : { ...query, text };
}
