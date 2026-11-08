// 설정 칸 패널 분야 페이지 탭 — docs/adr/2026-11-01-dev-settings-panel.md "바뀜 (2026-11-08 분야별 페이지)".
// 전체 + 세력·사회·NPC 두뇌·정원사·보유 아이템·전투 코어·경제 코어·기타. 탭마다 칸 수. 탭 목록 규칙(WAI-ARIA tabs): 고른 탭만 Tab으로
// 들어오고 ←→·Home·End로 옮기며 옮기면 바로 고른다. 좁은 폭은 여러 줄로 접힌다(가로로 밀리지 않는다).
// 고른 탭은 이 기기에만 남긴다(localStorage, 못 쓰면 전체). 시험용 data-page.
import { type KeyboardEvent, useRef } from "react";
import { m } from "../../paraglide/messages.js";
import { PAGE_TEXT } from "./tuningMessages.ts";
import { ALL_PAGES, TUNING_PAGE_TABS, type TuningPageTab, parsePageTab } from "./tuningModel.ts";

const STORAGE_KEY = "terra.devTuning.page";

/** 이 기기에 남긴 탭(없거나 못 읽으면 전체) */
export function storedPageTab(): TuningPageTab {
  try {
    return parsePageTab(globalThis.localStorage?.getItem(STORAGE_KEY)) ?? ALL_PAGES;
  } catch {
    return ALL_PAGES;
  }
}

export function storePageTab(tab: TuningPageTab): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, tab);
  } catch {
    // 저장소를 못 쓰면 이번 화면에서만 기억한다
  }
}

/** 탭 단추 id(탭 판의 aria-labelledby) */
export const pageTabId = (tab: TuningPageTab): string => `tp-page-tab-${tab}`;

/** 키 → 옮겨 갈 탭 차례(옮기지 않는 키는 null) */
function nextIndex(key: string, index: number, count: number): number | null {
  switch (key) {
    case "ArrowRight":
      return (index + 1) % count;
    case "ArrowLeft":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

export interface TuningPageTabsProps {
  page: TuningPageTab;
  counts: Readonly<Record<TuningPageTab, number>>;
  /** 탭 판(칸 목록) id */
  panelId: string;
  onChange: (tab: TuningPageTab) => void;
}

export function TuningPageTabs({ page, counts, panelId, onChange }: TuningPageTabsProps) {
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
    <div className="tp-pages" role="tablist" aria-label={m.dev_tuning_pages_label()}>
      {TUNING_PAGE_TABS.map((tab, index) => {
        const selected = tab === page;
        return (
          <button
            key={tab}
            ref={(element) => {
              if (element) buttons.current.set(tab, element);
              else buttons.current.delete(tab);
            }}
            id={pageTabId(tab)}
            type="button"
            role="tab"
            className="tp-page"
            data-page={tab}
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <span className="tp-page-label">{PAGE_TEXT[tab].label()}</span>
            <span className="tp-page-count">{counts[tab]}</span>
          </button>
        );
      })}
    </div>
  );
}
