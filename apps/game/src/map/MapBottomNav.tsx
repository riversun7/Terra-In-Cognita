// 2차맵 아래 탭 — 사용자 지적 2026-11-12 "2차맵에 버튼을 제대로 정리해라. 1차맵, 유닛(내유닛목록), 도시(현재맵도시와 건물 리스트…), 주변(유닛 자원 등을
// 거리순으로 보여주는 화면) 등을 하단에 깔끔하게 정리해라". 옛 흩어진 단추(오른쪽 위 [1차맵]·[내 유닛 N]·[근처])를 이 띠 하나가 맡는다.
// - [1차맵]: 지금 2차맵 자리를 가운데로 1차맵을 연다(바꾸기 — 뒤로 = 지도를 떠남, 옛 틀 전환 단추 shell/MapSwitch.tsx와 같은 주소).
// - [유닛]·[도시]·[가방]·[주변]: 아래 판 자리(판 하나, useBottomSheet)를 여닫는다. [가방] = 고른 유닛의 물건(사용자 요청 2026-11-14). 열린 탭은 눌린 모양(aria-pressed)이고 다시 누르면 닫는다.
// 모양은 앱 하단 탭(shell/tabbar.css .tab·.tab-icon·.tab-label)을 그대로 쓴다. 지도 화면은 틀을 숨기므로 이 띠는 지도 화면 안에 그린다.
import type { ReactNode } from "react";
import { m } from "../paraglide/messages.js";
import { AppLink } from "../shell/AppLink.tsx";
import { mapSwitchTarget } from "../shell/MapSwitch.tsx";
import { SignatureIcon } from "../ui/SignatureIcon.tsx";
import "./mapHud.css";

/** 아래 판을 여는 탭 */
export type MapNavTab = "units" | "city" | "bag" | "nearby";

interface MapBottomNavProps {
  /** 지금 열린 탭(없으면 null) */
  readonly active: MapNavTab | null;
  /** 이 2차맵 키(1차맵 전환이 그 자리를 가운데로) */
  readonly mapKey: number;
  /** 이 2차맵 내 유닛 수(받기 전 null — 수 표시 없음) */
  readonly unitCount: number | null;
  readonly onTab: (tab: MapNavTab) => void;
}

function NavButton({
  tab,
  active,
  label,
  icon,
  badge,
  onTab,
}: {
  readonly tab: MapNavTab;
  readonly active: MapNavTab | null;
  readonly label: string;
  readonly icon: ReactNode;
  readonly badge?: number | null | undefined;
  readonly onTab: (tab: MapNavTab) => void;
}) {
  return (
    <button
      type="button"
      className={`tab map-nav-button map-nav-${tab}`}
      aria-pressed={active === tab}
      data-tab={tab}
      onClick={() => onTab(tab)}
    >
      <span className="tab-icon">
        {icon}
        {badge === null || badge === undefined ? null : (
          <span className="map-nav-badge" data-count={badge}>
            {badge}
          </span>
        )}
      </span>
      <span className="tab-label">{label}</span>
    </button>
  );
}

export function MapBottomNav({ active, mapKey, unitCount, onTab }: MapBottomNavProps) {
  return (
    <nav className="map-nav" aria-label={m.map_nav_label()}>
      <AppLink
        to={mapSwitchTarget("map", String(mapKey))}
        replace
        className="tab map-nav-button map-nav-planet"
      >
        <span className="tab-icon">
          <SignatureIcon name="globe" />
        </span>
        <span className="tab-label">{m.map_nav_planet()}</span>
      </AppLink>
      <NavButton
        tab="units"
        active={active}
        label={m.map_nav_units()}
        icon={<SignatureIcon name="units" />}
        badge={unitCount}
        onTab={onTab}
      />
      <NavButton
        tab="city"
        active={active}
        label={m.map_nav_city()}
        icon={<SignatureIcon name="city" />}
        onTab={onTab}
      />
      <NavButton
        tab="bag"
        active={active}
        label={m.map_nav_bag()}
        icon={<SignatureIcon name="inventory" />}
        onTab={onTab}
      />
      <NavButton
        tab="nearby"
        active={active}
        label={m.map_nav_nearby()}
        icon={<SignatureIcon name="nearby" />}
        onTab={onTab}
      />
    </nav>
  );
}
