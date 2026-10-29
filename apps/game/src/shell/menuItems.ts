// 메뉴 항목 목록 — 하나다(ADR 2026-10-29-app-shell 4절). 사이드 메뉴·하단 탭·설정의 "메뉴" 칸이 모두 이 표에서 만들어진다.
// 항목 ID와 기본 순서는 @terra/shared navigation.ts(서버 입력 검사도 쓴다). 항목이 늘면 여기서 타입 오류가 난다.
// 키로 고르는 문구라 메시지 함수를 표에 적는다(m[key]는 oxlint가 막는다).
import type { NavItemId, RouteTarget } from "@terra/shared";
import { m } from "../paraglide/messages.js";
import type { IconName } from "../ui/icons.tsx";

export interface MenuItem {
  /** 누르면 갈 화면 */
  readonly target: RouteTarget;
  /** 이름(늘 보인다. 아이콘만 두지 않는다) */
  readonly name: () => string;
  /** 한 줄 설명(펼친 사이드 메뉴) */
  readonly desc: () => string;
  readonly icon: IconName;
}

export const MENU_ITEMS = {
  home: { target: { route: "home" }, name: m.nav_home, desc: m.nav_home_desc, icon: "home" },
  map: { target: { route: "map" }, name: m.nav_map, desc: m.nav_map_desc, icon: "map" },
  units: { target: { route: "units" }, name: m.nav_units, desc: m.nav_units_desc, icon: "units" },
  economy: { target: { route: "economy" }, name: m.nav_economy, desc: m.nav_economy_desc, icon: "economy" },
  faction: { target: { route: "faction" }, name: m.nav_faction, desc: m.nav_faction_desc, icon: "faction" },
  cyborg: { target: { route: "cyborg" }, name: m.nav_cyborg, desc: m.nav_cyborg_desc, icon: "cyborg" },
} satisfies Record<NavItemId, MenuItem>;
