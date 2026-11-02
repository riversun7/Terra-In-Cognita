// 아이템 편집기 왼쪽 목록(설계안 3.3) — 대분류 타일(개수), 찾기(ID·이름·태그, 300ms 쉰 뒤), 거르기(중분류·칸·입을 종류·출처·켬·권고·
// 담은 변경·티어), 정렬, [새 아이템]. 줄마다 대분류 표지·이름·ID·중분류·티어·칸/창고·한 줄 요약·출처·꺼짐·코드 참조·권고 수.
// 390px에서는 거르기 판이 접힌다(details). 1,000줄을 넘으면 보이는 만큼씩 더 그린다(더 보기).
import {
  ITEM_CATEGORY_IDS,
  ITEM_PRIMARY_CODES,
  type ItemCategoryId,
  type ItemEditorListResponse,
  type ItemRow,
} from "@terra/shared/itemEditor";
import { EQUIP_SLOTS } from "@terra/shared/roster";
import { useEffect, useId, useState } from "react";
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
import "./itemList.css";

/** 한 번에 그리는 줄 수(넘으면 [더 보기]) */
const PAGE = 200;

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
  baseValue: m.dev_items_sort_value,
  weight: m.dev_items_sort_weight,
};

/** 한 줄 요약: 무기 = 공격 칸·적정 스탯, 방어구 = 주요 스탯, 소모품 = 효과, 자원 = 무게·기준 가치 */
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
    m.dev_items_summary_value({ value: row.baseValue }),
  ]
    .filter((part) => part !== null)
    .join(" · ");
}

export function ItemList({
  list,
  selected,
  staged,
  locale,
  onSelect,
  onCreate,
}: {
  list: ItemEditorListResponse;
  selected: string | null;
  /** 담은 변경이 있는 아이템 ID */
  staged: ReadonlySet<string>;
  locale: "ko" | "en";
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  const searchId = useId();
  const filterIds = useId();
  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState<ItemQuery>(EMPTY_QUERY);
  const [sort, setSort] = useState<ItemSort>("name");
  const [limit, setLimit] = useState(PAGE);
  // 입력을 멈추고 300ms 뒤에 거른다(설계안 3.3)
  useEffect(() => {
    const timer = setTimeout(
      () => setQuery((now) => (now.text === typed ? now : { ...now, text: typed })),
      300,
    );
    return () => clearTimeout(timer);
  }, [typed]);
  const counts = categoryCounts(list.items);
  const shown = sortItems(filterItems(list.items, query, staged), sort, locale);
  const subcategories = list.subcategories.filter(
    (row) => query.category === "all" || row.entry.major === query.category,
  );
  const set = (patch: Partial<ItemQuery>) => {
    setQuery((now) => ({ ...now, ...patch }));
    setLimit(PAGE);
  };
  const tile = (category: ItemCategoryId | "all", label: string, count: number) => (
    <button
      key={category}
      type="button"
      className="ie-tile"
      aria-pressed={query.category === category}
      onClick={() => set({ category, subcategory: "all" })}
    >
      <span className="ie-tile-name">{label}</span>
      <span className="ie-tile-count">{count}</span>
    </button>
  );
  return (
    <aside className="ie-list-pane" aria-label={m.dev_items_list_label()}>
      <div className="ie-tiles" role="group" aria-label={m.dev_items_category_label()}>
        {tile("all", m.dev_items_filter_all(), list.items.length)}
        {ITEM_CATEGORY_IDS.map((category) => tile(category, CATEGORY_TEXT[category](), counts[category]))}
      </div>
      <div className="field ie-search">
        <label className="field-label" htmlFor={searchId}>
          {m.dev_items_search_label()}
        </label>
        <input
          id={searchId}
          className="input"
          type="search"
          autoComplete="off"
          placeholder={m.dev_items_search_placeholder()}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
      </div>
      <details className="ie-filters">
        <summary>{m.dev_items_filters()}</summary>
        <div className="ie-filter-grid">
          <label className="field">
            <span className="field-label">{m.dev_items_field_subcategory()}</span>
            <select value={query.subcategory} onChange={(event) => set({ subcategory: event.target.value })}>
              <option value="all">{m.dev_items_filter_all()}</option>
              {subcategories.map((row) => (
                <option key={row.entry.id} value={row.entry.id}>
                  {row.entry.name[locale]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">{m.dev_items_field_slot()}</span>
            <select
              value={query.slot}
              onChange={(event) => {
                const slot = EQUIP_SLOTS.find((value) => value === event.target.value);
                set({ slot: slot ?? "all" });
              }}
            >
              <option value="all">{m.dev_items_filter_all()}</option>
              {EQUIP_SLOTS.map((slot) => (
                <option key={slot} value={slot}>
                  {SLOT_TEXT[slot]()}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">{m.dev_items_field_kinds()}</span>
            <select value={query.kind} onChange={(event) => set({ kind: event.target.value })}>
              <option value="all">{m.dev_items_filter_all()}</option>
              {list.unitKinds.map((kind) => (
                <option key={kind.id} value={kind.id}>
                  {kind.name[locale]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">{m.dev_items_filter_origin()}</span>
            <select
              value={query.origin}
              onChange={(event) => {
                const origin = ITEM_ORIGIN_FILTERS.find((value) => value === event.target.value);
                set({ origin: origin ?? "all" });
              }}
            >
              {ITEM_ORIGIN_FILTERS.map((value) => (
                <option key={value} value={value}>
                  {ORIGIN_FILTER_TEXT[value]()}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">{m.dev_items_filter_enabled()}</span>
            <select
              value={query.enabled}
              onChange={(event) => {
                const value = event.target.value;
                set({ enabled: value === "on" || value === "off" ? value : "all" });
              }}
            >
              <option value="all">{m.dev_items_filter_all()}</option>
              <option value="on">{m.dev_items_filter_on()}</option>
              <option value="off">{m.dev_items_filter_off()}</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">{m.dev_items_filter_tier()}</span>
            <span className="ie-range">
              <input
                className="input"
                inputMode="numeric"
                aria-label={m.dev_items_filter_tier_min()}
                value={query.tierMin}
                onChange={(event) =>
                  set({ tierMin: Math.max(0, Math.min(9, Number(event.target.value) || 0)) })
                }
              />
              <span aria-hidden="true">~</span>
              <input
                className="input"
                inputMode="numeric"
                aria-label={m.dev_items_filter_tier_max()}
                value={query.tierMax}
                onChange={(event) =>
                  set({ tierMax: Math.max(0, Math.min(9, Number(event.target.value) || 0)) })
                }
              />
            </span>
          </label>
          <label className="ce-check" htmlFor={`${filterIds}-advice`}>
            <input
              id={`${filterIds}-advice`}
              type="checkbox"
              checked={query.advice}
              onChange={(event) => set({ advice: event.target.checked })}
            />
            {m.dev_items_filter_advice()}
          </label>
          <label className="ce-check" htmlFor={`${filterIds}-staged`}>
            <input
              id={`${filterIds}-staged`}
              type="checkbox"
              checked={query.staged}
              onChange={(event) => set({ staged: event.target.checked })}
            />
            {m.dev_items_filter_staged()}
          </label>
          <label className="field">
            <span className="field-label">{m.dev_items_sort()}</span>
            <select
              value={sort}
              onChange={(event) => {
                const next = ITEM_SORTS.find((value) => value === event.target.value);
                if (next) setSort(next);
              }}
            >
              {ITEM_SORTS.map((value) => (
                <option key={value} value={value}>
                  {SORT_TEXT[value]()}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button-small"
            onClick={() => {
              setTyped("");
              setQuery(EMPTY_QUERY);
            }}
          >
            {m.dev_items_filter_reset()}
          </button>
        </div>
      </details>
      <div className="ie-list-head">
        <span className="field-hint" aria-live="polite">
          {m.dev_items_shown({ shown: shown.length, total: list.items.length })}
        </span>
        <button type="button" className="button-small ie-new-button" onClick={onCreate}>
          {m.dev_items_new()}
        </button>
      </div>
      {shown.length === 0 ? <p className="field-hint">{m.dev_items_empty()}</p> : null}
      <ul className="ie-list">
        {shown.slice(0, limit).map((row) => {
          const summary = summaryOf(row, list, locale);
          return (
            <li key={row.id}>
              {/* 한 줄: 대분류 표지 · 이름 · ID·티어·칸·거래 · 요약 · 표지(넓은 폭에서 넘치면 줄임표, 전체 요약은 title) */}
              <button
                type="button"
                className="ie-item"
                aria-current={selected === row.id ? "true" : undefined}
                data-item={row.id}
                data-off={row.enabled ? undefined : ""}
                onClick={() => onSelect(row.id)}
              >
                <span className="ie-cat" data-category={row.category}>
                  {CATEGORY_TEXT[row.category]()}
                </span>
                <span className="ie-item-name">{row.name[locale]}</span>
                <span className="ie-item-meta">
                  {row.id} · T{row.tier}
                  {row.slot ? ` · ${SLOT_TEXT[row.slot]()}` : ` · ${STORAGE_TEXT[row.storage]()}`}
                  {` · ${MARKET_TEXT[row.market]()}`}
                </span>
                <span className="ie-item-summary" title={summary === "" ? undefined : summary}>
                  {summary}
                </span>
                <span className="ie-chips">
                  {row.origin === "pack" ? null : (
                    <span className={`ie-chip ie-origin-${row.origin}`}>{ORIGIN_TEXT[row.origin]()}</span>
                  )}
                  {staged.has(row.id) ? (
                    <span className="ie-chip ie-chip-staged">{m.dev_items_staged_chip()}</span>
                  ) : null}
                  {row.enabled ? null : <span className="ie-chip">{m.dev_items_disabled()}</span>}
                  {row.codeRef ? <span className="ie-chip">{m.dev_items_code_ref_chip()}</span> : null}
                  {row.advice > 0 ? (
                    <span className="ie-chip ie-chip-advice">
                      {m.dev_items_advice_count({ count: row.advice })}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {shown.length > limit ? (
        <button type="button" className="button-small" onClick={() => setLimit(limit + PAGE)}>
          {m.dev_items_more({ count: shown.length - limit })}
        </button>
      ) : null}
    </aside>
  );
}
