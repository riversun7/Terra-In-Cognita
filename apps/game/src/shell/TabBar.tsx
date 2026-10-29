// 하단 탭(좁은 폭만, D-6007·D-6010·D-265) — 메뉴 순서의 앞에서부터 화면 폭에 맞는 칸 수만큼(useLayout().tabSlots[배치]).
// - 배치 C: 칸을 가운데 큰 지도 버튼의 양쪽에 나눈다(왼쪽이 하나 더 많다). 지도는 메뉴 순서와 상관없이 가운데다.
// - 배치 A: 칸 + 끝칸 ☰(서랍 열기).
// 이름은 늘 보인다(아이콘만 두지 않는다). 지금 화면은 aria-current="page"(같은 탭을 다시 누르면 맨 위로 — 라우터).
// DOM 순서 = 보이는 순서 = 초점 순서다. 중간·넓음 폭에서는 CSS가 숨긴다(사이드 메뉴만 쓴다).
import { type NavItemId, type NavigationSettings, type RouteId, visibleTabs } from "@terra/shared";
import { m } from "../paraglide/messages.js";
import { Icon } from "../ui/icons.tsx";
import { AppLink } from "./AppLink.tsx";
import { CountBadge } from "./CountBadge.tsx";
import { MENU_ITEMS } from "./menuItems.ts";
import "./tabbar.css";

/** 메뉴 항목별 배지 수(처리할 일 inbox.list의 badges, ADR 37 4·7절). 없는 항목은 0 */
export type MenuBadges = Readonly<Partial<Record<NavItemId, number>>>;

interface TabBarProps {
  nav: NavigationSettings;
  /** 이 배치의 칸 수(좁은 폭 단계, layout.ts TAB_SLOT_STEPS — 배치마다 다르다) */
  slots: number;
  current: RouteId | null;
  badges: MenuBadges;
  /** 배치 A의 끝칸 ☰ */
  onMenu: () => void;
}

function TabLink({ id, current, badge }: { id: NavItemId; current: RouteId | null; badge: number }) {
  const item = MENU_ITEMS[id];
  const here = current === item.target.route;
  const name = item.name();
  return (
    <AppLink
      to={item.target}
      className="tab"
      aria-current={here ? "page" : undefined}
      aria-label={badge > 0 ? m.shell_item_alerts({ name, count: badge }) : undefined}
    >
      <span className="tab-icon">
        <Icon name={item.icon} />
        <CountBadge count={badge} />
      </span>
      <span className="tab-label">{name}</span>
    </AppLink>
  );
}

export function TabBar({ nav, slots, current, badges, onMenu }: TabBarProps) {
  const items = visibleTabs(nav, slots);
  const link = (id: NavItemId) => <TabLink key={id} id={id} current={current} badge={badges[id] ?? 0} />;
  if (nav.layout === "c") {
    const left = items.slice(0, Math.ceil(items.length / 2));
    const right = items.slice(left.length);
    const mapHere = current === "map" || current === "map_planet";
    return (
      <nav className="tabbar" data-layout="c" aria-label={m.shell_tabbar_label()}>
        <div className="tabbar-side">{left.map(link)}</div>
        <AppLink
          to={MENU_ITEMS.map.target}
          className="tab tab-map"
          aria-current={mapHere ? "page" : undefined}
        >
          <span className="tab-map-button">
            <Icon name={MENU_ITEMS.map.icon} />
          </span>
          <span className="tab-label">{MENU_ITEMS.map.name()}</span>
        </AppLink>
        <div className="tabbar-side">{right.map(link)}</div>
      </nav>
    );
  }
  return (
    <nav className="tabbar" data-layout="a" aria-label={m.shell_tabbar_label()}>
      {items.map(link)}
      <button type="button" className="tab tab-menu" onClick={onMenu} aria-haspopup="dialog">
        <span className="tab-icon">
          <Icon name="menu" />
        </span>
        <span className="tab-label">{m.shell_menu()}</span>
      </button>
    </nav>
  );
}
