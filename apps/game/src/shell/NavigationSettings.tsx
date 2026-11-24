// 설정 화면의 "메뉴" 칸(ADR 2026-10-29-app-shell 4절, D-6007·D-6008·D-265) — 설정 조각(지연 로딩) 안에서 그린다.
// - 하단 탭 모양: C(가운데 지도) / A(끝칸 ☰). 라디오 단추 묶음(화살표 키로 옮기고 고른다).
// - 메뉴 순서 하나: ↑·↓ 단추로 옮긴다(끌기 없이도 된다, WCAG 2.5.7). 앞에서부터 이 화면 폭의 칸 수만큼 하단 탭에 놓이고,
//   사이드 메뉴에는 6개가 모두 같은 순서로 나온다. 홈도 옮길 수 있다(앞에 고정하지 않는다, D-265).
// - 미리 보기: 지금 화면 폭에서 하단 탭에 놓이는 항목(중간·넓음 폭은 하단 탭 없음 안내).
// - [기본값으로]과 바로 뒤의 [되돌리기](다른 것을 바꾸기 전까지). 바꿀 때마다 바로 저장한다(shellPrefs.ts).
//   알림 영역이 옮긴 결과를 읽는다("유닛: 6개 중 2번째"). 저장하지 못하면(changeNavigation이 false) 아무것도 바꾸지 않고
//   오류 알림만 띄운다.
import {
  DEFAULT_NAV_LAYOUT,
  NAV_LAYOUTS,
  NAV_LAYOUT_CENTER_ITEM,
  type NavItemId,
  type NavLayout,
  moveNavItem,
  navMenuItems,
  parseNavigation,
  resetNavMenu,
  visibleTabs,
} from "@terra/shared";
import { useEffect, useId, useRef, useState } from "react";
import { m } from "../paraglide/messages.js";
import { Icon } from "../ui/icons.tsx";
import { LiveMessage, useLiveLines } from "../ui/LiveMessage.tsx";
import { SignatureIcon } from "../ui/SignatureIcon.tsx";
import { splitCenterTabs } from "./layout.ts";
import { MENU_ITEMS } from "./menuItems.ts";
import { changeNavigation, useNavigation } from "./shellPrefs.ts";
import { NAV_SETTINGS_ID } from "./SideMenu.tsx";
import { useLayout } from "./useLayout.ts";
import "./navigationSettings.css";

const LAYOUT_TEXT = {
  c: { name: m.settings_menu_layout_c, note: m.settings_menu_layout_c_note },
  a: { name: m.settings_menu_layout_a, note: m.settings_menu_layout_a_note },
} satisfies Record<NavLayout, { name: () => string; note: () => string }>;

/** 옮긴 뒤 초점을 둘 단추: 그 항목의 같은 방향 단추, 끝에 닿았으면 반대 방향 단추 */
interface PendingFocus {
  readonly id: NavItemId;
  readonly direction: "up" | "down";
}

interface LayoutOptionProps {
  layout: NavLayout;
  checked: boolean;
  onChoose: (layout: NavLayout) => void;
}

function LayoutOption({ layout, checked, onChoose }: LayoutOptionProps) {
  const nameId = useId();
  const noteId = useId();
  return (
    <label className="nav-layout-option">
      <input
        type="radio"
        name="nav-layout"
        value={layout}
        className="nav-layout-radio visually-hidden"
        checked={checked}
        onChange={() => onChoose(layout)}
        aria-labelledby={nameId}
        aria-describedby={noteId}
      />
      <span className="nav-layout-card">
        {/* 모양 그림(꾸밈): 칸 넷 + 가운데 원(C) 또는 끝칸 ☰(A) */}
        <span className="nav-layout-sketch" data-layout={layout} aria-hidden="true">
          <span />
          <span />
          <span className="nav-layout-sketch-special" />
          <span />
          <span />
        </span>
        <span className="nav-layout-name-row">
          <span className="nav-layout-name" id={nameId}>
            {LAYOUT_TEXT[layout].name()}
          </span>
          <span className="radio-mark" aria-hidden="true" />
        </span>
        <span className="nav-layout-note" id={noteId}>
          {LAYOUT_TEXT[layout].note()}
        </span>
      </span>
    </label>
  );
}

export function NavigationSettings() {
  const nav = useNavigation();
  // 지금 화면 폭에서 고른 배치의 칸 수(배치마다 계단이 다르다, layout.ts)
  const slots = useLayout().tabSlots[nav.layout];
  const orderHintId = useId();
  const items = navMenuItems(nav);
  const tabs = visibleTabs(nav, slots);
  const inTabs = new Set<NavItemId>(tabs);
  const center = NAV_LAYOUT_CENTER_ITEM[nav.layout];
  const announce = useLiveLines();
  const failure = useLiveLines();
  const listRef = useRef<HTMLOListElement>(null);
  const [focusAfterMove, setFocusAfterMove] = useState<PendingFocus | null>(null);
  /** [기본값으로] 바로 전의 설정([되돌리기]). 다른 것을 바꾸면 지운다 */
  const [undo, setUndo] = useState<{ layout: NavLayout; menu: readonly string[] } | null>(null);

  // 줄 순서가 바뀌면 브라우저가 옮긴 단추의 초점을 잃을 수 있다 → 같은 항목의 단추에 다시 둔다
  useEffect(() => {
    if (focusAfterMove === null) return;
    const list = listRef.current;
    const { id, direction } = focusAfterMove;
    const same = list?.querySelector<HTMLButtonElement>(`[data-item="${id}"][data-direction="${direction}"]`);
    const other = list?.querySelector<HTMLButtonElement>(
      `[data-item="${id}"][data-direction="${direction === "up" ? "down" : "up"}"]`,
    );
    const target = same?.getAttribute("aria-disabled") === "true" ? other : same;
    target?.focus();
  }, [focusAfterMove]);

  /** 바꿔 저장한다. 저장하지 못했으면 오류를 알리고 false(부른 쪽은 아무것도 바꾸지 않는다) */
  function save(patch: Parameters<typeof changeNavigation>[0]): boolean {
    if (changeNavigation(patch)) {
      failure.clear();
      return true;
    }
    failure.show([m.settings_menu_save_failed()]);
    return false;
  }

  function move(id: NavItemId, direction: "up" | "down"): void {
    const menu = moveNavItem(nav.menu, id, direction === "up" ? -1 : 1);
    if (!save({ menu })) return;
    setUndo(null);
    const order = navMenuItems(parseNavigation({ menu }));
    announce.show([
      m.settings_menu_moved({
        item: MENU_ITEMS[id].name(),
        position: order.indexOf(id) + 1,
        total: order.length,
      }),
    ]);
    setFocusAfterMove({ id, direction });
  }

  function chooseLayout(layout: NavLayout): void {
    if (save({ layout })) setUndo(null);
  }

  function reset(): void {
    const before = { layout: nav.layout, menu: nav.menu };
    if (!save({ layout: DEFAULT_NAV_LAYOUT, menu: resetNavMenu(nav.menu) })) return;
    setUndo(before);
    announce.show([m.settings_menu_reset_done()]);
  }

  function undoReset(): void {
    if (undo === null || !save(undo)) return;
    setUndo(null);
    announce.show([m.settings_menu_undo_done()]);
  }

  return (
    <section
      className="settings-section nav-settings"
      id={NAV_SETTINGS_ID}
      tabIndex={-1}
      aria-labelledby={`${NAV_SETTINGS_ID}-title`}
    >
      <h2 id={`${NAV_SETTINGS_ID}-title`} className="section-title">
        {m.settings_menu_legend()}
      </h2>
      <fieldset className="settings-section">
        <legend className="field-label">{m.settings_menu_layout_legend()}</legend>
        <div className="nav-layout-grid">
          {NAV_LAYOUTS.map((layout) => (
            <LayoutOption
              key={layout}
              layout={layout}
              checked={nav.layout === layout}
              onChoose={chooseLayout}
            />
          ))}
        </div>
      </fieldset>
      <div className="settings-section">
        <p className="field-label">{m.settings_menu_order_legend()}</p>
        <p className="field-hint" id={orderHintId}>
          {m.settings_menu_order_hint()}
        </p>
        <ol className="nav-order" ref={listRef} aria-describedby={orderHintId}>
          {items.map((id, index) => {
            const item = MENU_ITEMS[id];
            const name = item.name();
            const first = index === 0;
            const last = index === items.length - 1;
            const where =
              id === center ? m.settings_menu_center() : inTabs.has(id) ? m.settings_menu_in_tabs() : null;
            return (
              <li key={id} className="nav-order-row" data-in-tabs={where === null ? undefined : "true"}>
                <span className="nav-order-icon" aria-hidden="true">
                  <SignatureIcon name={item.icon} />
                </span>
                <span className="nav-order-text">
                  <span className="nav-order-name">{name}</span>
                  {where === null ? null : <span className="nav-order-where">{where}</span>}
                </span>
                <span className="nav-order-actions">
                  <button
                    type="button"
                    className="button-small nav-order-move"
                    data-item={id}
                    data-direction="up"
                    aria-label={m.settings_menu_up({ item: name })}
                    aria-disabled={first}
                    onClick={() => {
                      if (!first) move(id, "up");
                    }}
                  >
                    <Icon name="up" />
                  </button>
                  <button
                    type="button"
                    className="button-small nav-order-move"
                    data-item={id}
                    data-direction="down"
                    aria-label={m.settings_menu_down({ item: name })}
                    aria-disabled={last}
                    onClick={() => {
                      if (!last) move(id, "down");
                    }}
                  >
                    <Icon name="down" />
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <TabPreview items={tabs} layout={nav.layout} slots={slots} />
      <div className="form-actions">
        <button type="button" onClick={reset}>
          {m.settings_menu_reset()}
        </button>
        {undo === null ? null : (
          <button type="button" onClick={undoReset}>
            {m.settings_menu_undo()}
          </button>
        )}
      </div>
      <LiveMessage tone="info" lines={announce.lines} version={announce.version} />
      <LiveMessage tone="error" lines={failure.lines} version={failure.version} />
    </section>
  );
}

/** 미리 보기의 탭 칸 하나(꾸밈) */
function previewCell(id: NavItemId) {
  return (
    <span key={id} className="nav-preview-cell">
      <SignatureIcon name={MENU_ITEMS[id].icon} />
      <span>{MENU_ITEMS[id].name()}</span>
    </span>
  );
}

/** 지금 화면 폭의 하단 탭 미리 보기(꾸밈 그림 + 읽히는 목록). 하단 탭이 없는 폭이면 안내 한 줄 */
function TabPreview({ items, layout, slots }: { items: NavItemId[]; layout: NavLayout; slots: number }) {
  if (slots === 0) return <p className="field-hint nav-preview-none">{m.settings_menu_preview_none()}</p>;
  const names = items.map((id) => MENU_ITEMS[id].name());
  // 하단 탭(TabBar.tsx)과 같은 나누기: C는 지도 양쪽(홀수면 오른쪽이 하나 더), A는 칸 + 끝칸 ☰
  const { left, right } = layout === "c" ? splitCenterTabs(items) : { left: items, right: [] };
  return (
    <figure className="nav-preview">
      <figcaption className="field-label">{m.settings_menu_preview_label()}</figcaption>
      <div className="nav-preview-bar" data-layout={layout} aria-hidden="true">
        {left.map(previewCell)}
        {layout === "c" ? (
          <span className="nav-preview-cell nav-preview-map">
            <span className="nav-preview-map-button">
              <SignatureIcon name="map" />
            </span>
            <span>{MENU_ITEMS.map.name()}</span>
          </span>
        ) : null}
        {right.map(previewCell)}
        {layout === "a" ? (
          <span className="nav-preview-cell">
            <Icon name="menu" />
            <span>{m.shell_menu()}</span>
          </span>
        ) : null}
      </div>
      <p className="visually-hidden">
        {layout === "c"
          ? m.settings_menu_preview_c({ items: names.join(", "), map: MENU_ITEMS.map.name() })
          : m.settings_menu_preview_a({ items: names.join(", ") })}
      </p>
    </figure>
  );
}
