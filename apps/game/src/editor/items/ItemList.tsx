// 아이템 편집기 목록(옛 아이템 편집기 표 모양으로 되돌림, 사용자 2026-11-09) — 위 띠(ItemBrowseBar)가 거른 줄을 목록(표) 또는 격자로 그린다.
// 줄 = 티어 표지(T0~T9 색) · 대분류 그림 · 이름 + ID + 표지(담음·출처·꺼짐·코드 참조·권고) + 한 줄 요약 · 분류 사슬(대분류 › 중분류 ›
// 무기 종류) · 무게 · 쌓기 상한 · 빠른 동작([복제]·[열기]·만든 것 [지우기]/고친 것 [팩 값으로] — 모두 담은 변경에 든다).
// 표의 칸은 목록 상자 폭(@container ie-lines)에 맞춰 줄어든다: 넓으면 표 머리 + 칸 전부, 편집 판이 열려 좁으면 이름 칸 안에 사슬·무게.
// 키: 목록 안에서 ↑↓·Home·End·PageUp/Down으로 줄을 옮기고 Enter로 연다(고른 줄만 Tab으로 들어온다). 많으면 200줄씩 더 그린다.
// 시험이 고르는 이름: 줄 여는 단추 .ie-item[data-item="<ID>"].
import { ITEM_PRIMARY_CODES, type ItemEditorListResponse, type ItemRow } from "@terra/shared/itemEditor";
import { type KeyboardEvent, useDeferredValue, useEffect, useRef, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { ActionIcon, CategoryIcon } from "./itemIcons.tsx";
import type { ItemViewMode } from "./ItemBrowseBar.tsx";
import {
  CATEGORY_TEXT,
  MARKET_TEXT,
  ORIGIN_TEXT,
  PRIMARY_TEXT,
  SLOT_TEXT,
  STORAGE_TEXT,
} from "./itemMessages.ts";
import { type ItemQuery, type ItemSort, filterItems, sortItems, weightText } from "./itemModel.ts";

/** 한 번에 그리는 줄 수(넘으면 [더 보기]) */
const PAGE = 200;

/** 한 줄 요약: 무기 = 공격 칸·적정 스탯, 방어구 = 주요 스탯, 소모품 = 효과, 자원 = 시작 시세 */
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
  return m.dev_items_summary_value({ value: row.startPrice });
}

/** 대분류 이름(찾기에도 쓴다) */
export function categoryLabels(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, text] of Object.entries(CATEGORY_TEXT)) out[id] = text();
  return out;
}

/** 보이는 아이템(정렬까지) — 화면이 Alt+↑↓ 이전·다음에도 쓴다. subMajor = 중분류 → 대분류(중분류 없음 거르기) */
export function shownItems(
  list: ItemEditorListResponse,
  query: ItemQuery,
  sort: ItemSort,
  staged: ReadonlySet<string>,
  locale: "ko" | "en",
  subMajor: ReadonlyMap<string, ItemRow["category"]>,
): ItemRow[] {
  return sortItems(filterItems(list.items, query, staged, categoryLabels(), subMajor), sort, locale);
}

/** 키 → 옮겨 갈 차례(옮기지 않는 키는 null). 격자는 ←→도 */
function nextIndex(key: string, index: number, count: number, cards: boolean): number | null {
  switch (key) {
    case "ArrowDown":
      return Math.min(count - 1, index + 1);
    case "ArrowUp":
      return Math.max(0, index - 1);
    case "ArrowRight":
      return cards ? Math.min(count - 1, index + 1) : null;
    case "ArrowLeft":
      return cards ? Math.max(0, index - 1) : null;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    case "PageDown":
      return Math.min(count - 1, index + 10);
    case "PageUp":
      return Math.max(0, index - 10);
    default:
      return null;
  }
}

interface Badge {
  readonly key: string;
  readonly label: string;
  readonly tone: "staged" | "changed" | "created" | "off" | "advice" | "plain";
  readonly className?: string;
}

function badgesOf(row: ItemRow, staged: boolean): Badge[] {
  const out: Badge[] = [];
  if (staged) out.push({ key: "staged", label: m.dev_content_badge_staged(), tone: "staged" });
  if (row.origin !== "pack")
    out.push({
      key: "origin",
      label: ORIGIN_TEXT[row.origin](),
      tone: row.origin === "created" ? "created" : "changed",
      className: `ie-origin-${row.origin}`,
    });
  if (!row.enabled) out.push({ key: "off", label: m.dev_items_disabled(), tone: "off" });
  if (row.codeRef) out.push({ key: "code", label: m.dev_items_code_ref_chip(), tone: "plain" });
  if (row.advice > 0)
    out.push({ key: "advice", label: m.dev_items_advice_count({ count: row.advice }), tone: "advice" });
  return out;
}

export function ItemList({
  list,
  shown,
  selected,
  staged,
  locale,
  mode,
  subNames,
  kindNames,
  onSelect,
  onDuplicate,
  onRevert,
}: {
  list: ItemEditorListResponse;
  /** 찾기·거르기·정렬을 거친 줄(화면이 거른다) */
  shown: readonly ItemRow[];
  selected: string | null;
  /** 담은 변경이 있는 아이템 ID */
  staged: ReadonlySet<string>;
  locale: "ko" | "en";
  mode: ItemViewMode;
  /** 중분류·무기 종류 ID → 이름(실효 분류 자료) */
  subNames: ReadonlyMap<string, string>;
  kindNames: ReadonlyMap<string, string>;
  onSelect: (id: string) => void;
  onDuplicate: (id: string) => void;
  /** 만든 것은 지우기(ID 은퇴), 고친 것은 팩 값으로 — 담은 변경에 든다 */
  onRevert: (id: string) => void;
}) {
  const [limit, setLimit] = useState(PAGE);
  const [focusId, setFocusId] = useState<string | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const cards = mode === "cards";
  // 줄 몇백 개를 다시 그리는 동안 위 띠 입력이 막히지 않게 늦춰 그린다
  const rows = useDeferredValue(shown);
  const page = rows.slice(0, limit);
  const tabId =
    (focusId && page.some((row) => row.id === focusId) ? focusId : null) ??
    (selected && page.some((row) => row.id === selected) ? selected : null) ??
    page[0]?.id ??
    null;

  // 고른 줄이 목록 상자(넓은 폭: 스스로 밀리는 왼쪽 칸) 밖이면 그 줄이 보이게 상자만 민다(쪽은 밀지 않는다)
  useEffect(() => {
    if (!selected) return;
    const element = buttons.current.get(selected);
    const box = element?.closest<HTMLElement>(".ce-side");
    if (!element || !box || box.scrollHeight <= box.clientHeight) return;
    const top = element.getBoundingClientRect().top - box.getBoundingClientRect().top;
    if (top < 0 || top > box.clientHeight - element.offsetHeight) box.scrollTop += top - box.clientHeight / 3;
  }, [selected]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const next = nextIndex(event.key, index, page.length, cards);
    if (next === null) return;
    event.preventDefault();
    const row = page[next];
    if (!row) return;
    setFocusId(row.id);
    buttons.current.get(row.id)?.focus();
  };

  return (
    <div className="ie-lines" data-mode={mode} role="region" aria-label={m.dev_items_list_label()}>
      {rows.length === 0 ? (
        <div className="ce-empty">
          <p>{m.dev_items_empty()}</p>
        </div>
      ) : null}
      {!cards && rows.length > 0 ? (
        <div className="ie-lines-head" aria-hidden="true">
          <span className="ie-col-main">
            <span>{m.dev_items_col_tier()}</span>
            <span />
            <span>{m.dev_items_col_name()}</span>
            <span className="ie-col-wide">{m.dev_items_col_class()}</span>
            <span className="ie-col-wide ie-col-num">{m.dev_items_col_weight()}</span>
            <span className="ie-col-wide ie-col-num">{m.dev_items_col_stack()}</span>
          </span>
          <span className="ie-col-actions">{m.dev_items_col_actions()}</span>
        </div>
      ) : null}
      <ul className="ie-line-list">
        {page.map((row, index) => {
          const name = row.name[locale];
          const isStaged = staged.has(row.id);
          const chain = [
            CATEGORY_TEXT[row.category](),
            row.subcategory === null ? null : (subNames.get(row.subcategory) ?? row.subcategory),
            row.weaponType === null ? null : (kindNames.get(row.weaponType) ?? row.weaponType),
          ].filter((part) => part !== null);
          const where = row.slot ? SLOT_TEXT[row.slot]() : STORAGE_TEXT[row.storage]();
          const summary = [where, MARKET_TEXT[row.market](), summaryOf(row, list, locale)]
            .filter((part) => part !== "")
            .join(" · ");
          const weight = row.weight === null ? m.dev_items_none() : weightText(row.weight);
          const stack = row.stackMax === null ? m.dev_items_stack_default() : String(row.stackMax);
          return (
            <li
              key={row.id}
              className="ie-line"
              data-staged={isStaged ? "" : undefined}
              data-changed={row.origin !== "pack" ? "" : undefined}
              data-off={row.enabled ? undefined : ""}
              data-current={selected === row.id ? "" : undefined}
            >
              <button
                ref={(element) => {
                  if (element) buttons.current.set(row.id, element);
                  else buttons.current.delete(row.id);
                }}
                type="button"
                className="ie-item ie-col-main"
                data-item={row.id}
                aria-current={selected === row.id ? "true" : undefined}
                tabIndex={row.id === tabId ? 0 : -1}
                onFocus={() => setFocusId(row.id)}
                onClick={() => onSelect(row.id)}
                onKeyDown={(event) => onKeyDown(event, index)}
              >
                <span className="ie-tier" data-tier={row.tier}>
                  T{row.tier}
                </span>
                <span className="ie-row-icon" data-category={row.category}>
                  <CategoryIcon category={row.category} />
                </span>
                <span className="ie-row-name">
                  <span className="ie-row-title">
                    <span className="ie-row-label">{name}</span>
                    <code className="ie-row-id" translate="no">
                      {row.id}
                    </code>
                    {badgesOf(row, isStaged).map((badge) => (
                      <span
                        key={badge.key}
                        className={`ce-badge ce-badge-${badge.tone} ${badge.className ?? ""}`}
                      >
                        {badge.label}
                      </span>
                    ))}
                  </span>
                  <span className="ie-row-summary" title={summary}>
                    {summary}
                  </span>
                  <span className="ie-row-compact">
                    {chain.join(" › ")} · {weight}
                  </span>
                </span>
                <span className="ie-chain ie-col-wide">
                  {chain.map((part, at) => (
                    <span key={`${at}-${part}`} className="ie-chain-chip" data-level={at}>
                      {part}
                    </span>
                  ))}
                </span>
                <span className="ie-col-wide ie-col-num">{weight}</span>
                <span className="ie-col-wide ie-col-num">{stack}</span>
              </button>
              <span className="ie-col-actions ie-row-actions">
                <button
                  type="button"
                  className="ie-icon-button ie-row-duplicate"
                  aria-label={m.dev_items_row_duplicate({ name })}
                  title={m.dev_items_row_duplicate({ name })}
                  tabIndex={-1}
                  onClick={() => onDuplicate(row.id)}
                >
                  <ActionIcon name="copy" />
                </button>
                <button
                  type="button"
                  className="ie-icon-button ie-row-open"
                  aria-label={m.dev_items_row_open({ name })}
                  title={m.dev_items_row_open({ name })}
                  tabIndex={-1}
                  onClick={() => onSelect(row.id)}
                >
                  <ActionIcon name="edit" />
                </button>
                {row.origin === "pack" ? null : (
                  <button
                    type="button"
                    className="ie-icon-button ie-row-revert"
                    data-tone={row.origin === "created" ? "danger" : undefined}
                    aria-label={
                      row.origin === "created"
                        ? m.dev_items_row_delete({ name })
                        : m.dev_items_row_revert({ name })
                    }
                    title={
                      row.origin === "created"
                        ? m.dev_items_row_delete({ name })
                        : m.dev_items_row_revert({ name })
                    }
                    tabIndex={-1}
                    onClick={() => onRevert(row.id)}
                  >
                    <ActionIcon name={row.origin === "created" ? "remove" : "revert"} />
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {rows.length > limit ? (
        <button type="button" className="ce-more" onClick={() => setLimit(limit + PAGE)}>
          {m.dev_content_more({ count: rows.length - limit })}
        </button>
      ) : null}
    </div>
  );
}

/** 찾는 글을 늦춰 거른다(줄 몇백 개를 다시 그리는 동안 글자 입력이 막히지 않게) */
export function useDeferredQuery(query: ItemQuery): ItemQuery {
  const text = useDeferredValue(query.text);
  return text === query.text ? query : { ...query, text };
}
