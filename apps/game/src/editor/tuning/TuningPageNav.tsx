// 설정 칸 패널 분야 고르기 — docs/adr/2026-11-01-dev-settings-panel.md "바뀜 (2026-11-08 화면 개편)".
// 넓은 폭: 왼쪽 세로 목록(분야 이름 · 바뀐 칸 수 표시 · 칸 수). 고른 분야만 Tab으로 들어오고 ↑↓·Home·End로 옮기며 옮기면 바로 고른다.
// 좁은 폭(휴대폰): 같은 자리에 고르기 상자 하나(누르는 곳 --dev-touch-tap). 둘 다 그리고 CSS(@container)가 하나만 보인다.
// 시험용 data-page.
import { type KeyboardEvent, useId, useRef } from "react";
import { m } from "../../paraglide/messages.js";
import { PAGE_TEXT } from "./tuningMessages.ts";
import { TUNING_PAGE_TABS, type TuningPageTab, parsePageTab } from "./tuningModel.ts";

/** 키 → 옮겨 갈 차례(옮기지 않는 키는 null) */
function nextIndex(key: string, index: number, count: number): number | null {
  switch (key) {
    case "ArrowDown":
      return (index + 1) % count;
    case "ArrowUp":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

export interface TuningPageNavProps {
  page: TuningPageTab;
  counts: Readonly<Record<TuningPageTab, number>>;
  /** 분야마다 바뀐 칸 수(덮어쓰기·담음) */
  changed: Readonly<Record<TuningPageTab, number>>;
  /** 칸 목록 판 id(aria-controls) */
  panelId: string;
  onChange: (tab: TuningPageTab) => void;
}

export function TuningPageNav({ page, counts, changed, panelId, onChange }: TuningPageNavProps) {
  const selectId = useId();
  const buttons = useRef(new Map<TuningPageTab, HTMLButtonElement>());
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const next = nextIndex(event.key, index, TUNING_PAGE_TABS.length);
    const tab = next === null ? undefined : TUNING_PAGE_TABS[next];
    if (tab === undefined) return;
    event.preventDefault();
    onChange(tab);
    buttons.current.get(tab)?.focus();
  };
  return (
    <nav className="tp-nav" aria-label={m.dev_tuning_pages_label()}>
      <div className="field tp-nav-select">
        <label className="field-label" htmlFor={selectId}>
          {m.dev_tuning_pages_label()}
        </label>
        <select
          id={selectId}
          className="tp-page-select"
          value={page}
          aria-controls={panelId}
          onChange={(event) => {
            const tab = parsePageTab(event.target.value);
            if (tab) onChange(tab);
          }}
        >
          {TUNING_PAGE_TABS.map((tab) => (
            <option key={tab} value={tab}>
              {`${PAGE_TEXT[tab].label()} (${counts[tab]})`}
              {changed[tab] > 0 ? ` · ${m.dev_tuning_page_changed({ count: changed[tab] })}` : ""}
            </option>
          ))}
        </select>
      </div>
      <ul className="tp-nav-list">
        {TUNING_PAGE_TABS.map((tab, index) => {
          const selected = tab === page;
          return (
            <li key={tab}>
              <button
                ref={(element) => {
                  if (element) buttons.current.set(tab, element);
                  else buttons.current.delete(tab);
                }}
                type="button"
                className="tp-page"
                data-page={tab}
                aria-current={selected ? "true" : undefined}
                aria-controls={panelId}
                tabIndex={selected ? 0 : -1}
                onClick={() => onChange(tab)}
                onKeyDown={(event) => onKeyDown(event, index)}
              >
                <span className="tp-page-label">{PAGE_TEXT[tab].label()}</span>
                {changed[tab] > 0 ? (
                  <span
                    className="tp-page-changed"
                    title={m.dev_tuning_page_changed({ count: changed[tab] })}
                  >
                    <span aria-hidden="true">{changed[tab]}</span>
                    <span className="visually-hidden">
                      {m.dev_tuning_page_changed({ count: changed[tab] })}
                    </span>
                  </span>
                ) : null}
                <span className="tp-page-count">{counts[tab]}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
