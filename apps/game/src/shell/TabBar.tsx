// 슬림 플랫 하단 탭(좁은 폭 48px, 솟는 원형 단추 없음, 메뉴별 컬러 시그니처 아이콘 + 상단 활성 표시선).
// - 배치 C: 가운데 지도 칸의 양쪽에 나눈다(layout.ts splitCenterTabs).
// - 배치 A: 칸 + 끝칸 ☰(우측 드롭다운 메뉴 열기).
import { type NavItemId, type NavigationSettings, type RouteId, visibleTabs } from "@terra/shared";
import { m } from "../paraglide/messages.js";
import { Icon } from "../ui/icons.tsx";
import { SignatureIcon } from "../ui/SignatureIcon.tsx";
import { AppLink } from "./AppLink.tsx";
import { CountBadge } from "./CountBadge.tsx";
import { splitCenterTabs } from "./layout.ts";
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
      data-item={id}
      aria-current={here ? "page" : undefined}
      aria-label={badge > 0 ? m.shell_item_alerts({ name, count: badge }) : undefined}
    >
      <span className="tab-icon">
        <SignatureIcon name={item.icon} />
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
    const { left, right } = splitCenterTabs(items);
    const mapHere = current === "map" || current === "map_planet";
    return (
      <nav className="tabbar" data-layout="c" aria-label={m.shell_tabbar_label()}>
        <div className="tabbar-side">{left.map(link)}</div>
        <AppLink
          to={MENU_ITEMS.map.target}
          className="tab tab-map"
          data-item="map"
          aria-current={mapHere ? "page" : undefined}
        >
          <span className="tab-icon tab-map-button">
            <SignatureIcon name="map" />
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
