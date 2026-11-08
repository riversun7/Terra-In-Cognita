// 콘텐츠 편집기 왼쪽 항목 목록(아이템·스킬·건물 편집기 공용) — docs/adr/2026-11-01-item-editor.md "바뀜 (2026-11-08 화면 개편)".
// 설정 칸 패널(/dev/tuning)의 분야 목록·찾기 띠와 같은 모양:
// - 찾기(이름·ID·분류·태그는 화면이 거른다, "/" 키로 들어옴, Esc = 지우기) · 거르기 줄(넓은 폭은 늘 보이고 휴대폰은 [거르기 N]으로 접힘) ·
//   보이는 수 · [거르기 지우기] · 화면이 주는 동작(새 항목 등).
// - 줄(두 줄): 분류 표지 · 이름 · ID(고정폭) · 표지(담음·덮어씀·새로 만듦·꺼짐·권고) / 한 줄 요약. 담은 줄 = 왼쪽 초점색 띠, 덮어쓴 줄 = 경고색 띠.
// - 키: 목록 안에서 ↑↓·Home·End로 줄을 옮기고 Enter로 연다(고른 줄만 Tab으로 들어온다). 많으면 200줄씩 더 그린다.
// - 시험이 고르는 이름: 줄 단추에 itemClass(예 ie-item)와 data-<dataKey>(예 data-item="test_sword").
import { type KeyboardEvent, type ReactNode, type Ref, useEffect, useId, useRef, useState } from "react";
import { m } from "../../paraglide/messages.js";

export type EntryTone = "staged" | "changed" | "created" | "off" | "advice" | "plain";

export interface EntryBadge {
  readonly key: string;
  readonly label: string;
  readonly tone: EntryTone;
  /** 시험이 고르는 클래스(선택) */
  readonly className?: string | undefined;
}

export interface EntryRow {
  readonly id: string;
  readonly name: string;
  /** 이름 앞 작은 분류 표지(대분류 등) */
  readonly tag?: { readonly label: string; readonly value: string } | undefined;
  /** 한 줄 요약(넘치면 줄임표, 전체는 title) */
  readonly summary?: string | undefined;
  readonly badges: readonly EntryBadge[];
  readonly staged?: boolean | undefined;
  /** 그 세계에서 덮어쓰거나 만든 항목 */
  readonly changed?: boolean | undefined;
  readonly off?: boolean | undefined;
}

/** 한 번에 그리는 줄 수(넘으면 [더 보기]) */
const PAGE = 200;

/** 키 → 옮겨 갈 차례(옮기지 않는 키는 null) */
function nextIndex(key: string, index: number, count: number): number | null {
  switch (key) {
    case "ArrowDown":
      return Math.min(count - 1, index + 1);
    case "ArrowUp":
      return Math.max(0, index - 1);
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

export interface EntryListProps {
  /** 목록 이름(읽기 프로그램) */
  label: string;
  rows: readonly EntryRow[];
  /** 거르기 전 전체 수 */
  total: number;
  selected: string | null;
  onSelect: (id: string) => void;
  search: string;
  onSearch: (text: string) => void;
  searchPlaceholder: string;
  searchRef?: Ref<HTMLInputElement> | undefined;
  /** 거르기 조작부(넓은 폭은 늘 보이고 휴대폰은 접힌다) */
  filters?: ReactNode;
  /** 켠 거르기 수(찾는 글 빼고) */
  activeFilters: number;
  /** 거르기·찾기를 모두 지운다(걸린 것이 있을 때만 단추) */
  onReset: () => void;
  /** 목록 위 동작(새 항목 등) */
  actions?: ReactNode;
  /** 줄 단추 클래스(시험) */
  itemClass: string;
  /** 줄 단추 data-* 이름(시험) */
  dataKey: string;
  /** 거른 결과가 없을 때 글 */
  emptyText: string;
}

export function EntryList({
  label,
  rows,
  total,
  selected,
  onSelect,
  search,
  onSearch,
  searchPlaceholder,
  searchRef,
  filters,
  activeFilters,
  onReset,
  actions,
  itemClass,
  dataKey,
  emptyText,
}: EntryListProps) {
  const searchId = useId();
  const filtersId = useId();
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [focusId, setFocusId] = useState<string | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const shown = rows.slice(0, limit);
  // Tab으로 들어오는 줄: 키로 옮긴 줄 → 고른 줄 → 첫 줄
  const tabId =
    (focusId && shown.some((row) => row.id === focusId) ? focusId : null) ??
    (selected && shown.some((row) => row.id === selected) ? selected : null) ??
    shown[0]?.id ??
    null;
  const filtered = search.trim() !== "" || activeFilters > 0;

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
    const next = nextIndex(event.key, index, shown.length);
    if (next === null) return;
    event.preventDefault();
    const row = shown[next];
    if (!row) return;
    setFocusId(row.id);
    buttons.current.get(row.id)?.focus();
  };

  return (
    <div className="ce-list-pane" role="region" aria-label={label}>
      <div className="ce-list-tools" role="search">
        <div className="ce-search-row">
          <div className="ce-search">
            <label className="visually-hidden" htmlFor={searchId}>
              {m.dev_content_search_label()}
            </label>
            <input
              ref={searchRef}
              id={searchId}
              className="input ce-search-input"
              type="search"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
              aria-keyshortcuts="/"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(event) => {
                onSearch(event.target.value);
                setLimit(PAGE);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape" && search !== "") {
                  event.preventDefault();
                  onSearch("");
                }
                // 찾는 글에서 ↓ = 첫 줄로
                if (event.key === "ArrowDown" && shown[0]) {
                  event.preventDefault();
                  setFocusId(shown[0].id);
                  buttons.current.get(shown[0].id)?.focus();
                }
              }}
            />
            <kbd className="ce-search-key" aria-hidden="true">
              /
            </kbd>
          </div>
          {filters ? (
            <button
              type="button"
              className="ce-chip-button ce-filters-toggle"
              aria-expanded={open}
              aria-controls={filtersId}
              data-active={activeFilters > 0 ? "" : undefined}
              onClick={() => setOpen(!open)}
            >
              {activeFilters > 0
                ? m.dev_content_filters_count({ count: activeFilters })
                : m.dev_content_filters()}
            </button>
          ) : null}
        </div>
        {filters ? (
          <div id={filtersId} className="ce-filters" data-open={open}>
            {filters}
          </div>
        ) : null}
        <div className="ce-list-result">
          <p className="ce-shown" aria-live="polite">
            {m.dev_content_shown({ shown: rows.length, total })}
          </p>
          {filtered ? (
            <button
              type="button"
              className="ce-link-button ce-reset"
              onClick={() => {
                onReset();
                setLimit(PAGE);
              }}
            >
              {m.dev_content_reset_filters()}
            </button>
          ) : null}
          {actions ? <div className="ce-list-actions">{actions}</div> : null}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="ce-empty">
          <p>{emptyText}</p>
        </div>
      ) : null}
      <ul className="ce-entries">
        {shown.map((row, index) => {
          const current = selected === row.id;
          return (
            <li key={row.id}>
              <button
                ref={(element) => {
                  if (element) buttons.current.set(row.id, element);
                  else buttons.current.delete(row.id);
                }}
                type="button"
                className={`ce-entry ${itemClass}`}
                {...{ [`data-${dataKey}`]: row.id }}
                data-staged={row.staged ? "" : undefined}
                data-changed={row.changed ? "" : undefined}
                data-off={row.off ? "" : undefined}
                aria-current={current ? "true" : undefined}
                tabIndex={row.id === tabId ? 0 : -1}
                onFocus={() => setFocusId(row.id)}
                onClick={() => onSelect(row.id)}
                onKeyDown={(event) => onKeyDown(event, index)}
              >
                <span className="ce-entry-title">
                  {row.tag ? (
                    <span className="ce-entry-tag" data-tag={row.tag.value}>
                      {row.tag.label}
                    </span>
                  ) : null}
                  <span className="ce-entry-name">{row.name}</span>
                  <code className="ce-entry-id" translate="no">
                    {row.id}
                  </code>
                  {row.badges.length > 0 ? (
                    <span className="ce-entry-badges">
                      {row.badges.map((badge) => (
                        <span
                          key={badge.key}
                          className={`ce-badge ce-badge-${badge.tone} ${badge.className ?? ""}`}
                        >
                          {badge.label}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </span>
                {row.summary ? (
                  <span className="ce-entry-summary" title={row.summary}>
                    {row.summary}
                  </span>
                ) : null}
              </button>
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

/** 켜고 끄는 작은 거르기 단추(aria-pressed) */
export function FilterChip({
  label,
  pressed,
  onToggle,
  className,
}: {
  label: string;
  pressed: boolean;
  onToggle: (next: boolean) => void;
  className?: string | undefined;
}) {
  return (
    <button
      type="button"
      className={`ce-chip-button ${className ?? ""}`}
      aria-pressed={pressed}
      onClick={() => onToggle(!pressed)}
    >
      {label}
    </button>
  );
}

/** 작은 거르기 고르기 상자(이름표는 읽기 프로그램에만, 첫 칸이 "전체 …") */
export function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: readonly { readonly value: T; readonly label: string }[];
  onChange: (value: T) => void;
  className?: string | undefined;
}) {
  const id = useId();
  return (
    <>
      <label className="visually-hidden" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className={`ce-filter-select ${className ?? ""}`}
        value={value}
        title={label}
        onChange={(event) => {
          const picked = options.find((option) => option.value === event.target.value);
          if (picked) onChange(picked.value);
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </>
  );
}
