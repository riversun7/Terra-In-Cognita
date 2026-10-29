// 메뉴 항목·하단 탭 배치와 유저 설정 `nav` 읽기(ADR 2026-10-29-app-shell 4절, 기획 D-6004·D-6007·D-6008·D-6010).
// 사이드 메뉴·하단 탭·설정의 "메뉴" 칸이 모두 이 목록에서 만들어진다. 서버 입력 검사(목록 길이)도 이 값을 쓴다.
// 그리는 정보(주소 ID·이름 키·한 줄 설명 키·아이콘)는 게임 앱 shell/menuItems.ts에 둔다.
// 항목 ID는 계정에 저장된다(user_settings.nav). 한 번 쓴 ID는 다시 쓰지 않는다(docs/PROTECTED.md).
// 해석(Assumed, 기획 질문 docs/questions/2026-10-29-app-shell.md Q1): 사이드 메뉴는 늘 모든 항목을 보이고, 홈도 탭에서 뺄 수 있다.
// 답이 다르면 이 파일의 자료와 parseNavigation만 바꾼다.
import { isSavedId } from "./savedId.ts";

/** 메뉴 항목 ID. 이 순서가 사이드 메뉴의 기본 순서다 */
export const NAV_ITEM_IDS = ["home", "map", "units", "economy", "faction", "cyborg"] as const;

export type NavItemId = (typeof NAV_ITEM_IDS)[number];

/** 하단 탭 배치(D-6007). c = 가운데 큰 지도 버튼 + 칸 4개, a = 칸 4개 + 끝칸 ☰ */
export const NAV_LAYOUTS = ["c", "a"] as const;

export type NavLayout = (typeof NAV_LAYOUTS)[number];

export const DEFAULT_NAV_LAYOUT: NavLayout = "c";

/** 배치마다 유저가 고르는 칸 수 */
export const NAV_TAB_SLOTS = 4;

/** 사이드 메뉴 순서 목록의 길이 상한(서버 입력 검사, ADR 37 5절) */
export const NAV_MENU_MAX = 32;

/** 배치가 칸 밖에 늘 두는 항목. C의 가운데 지도 버튼은 배치의 일부라 C 칸에는 지도를 넣지 않는다 */
export const NAV_LAYOUT_FIXED_ITEM: { readonly [L in NavLayout]: NavItemId | null } = { c: "map", a: null };

/** 기본 탭(D-6010): C = 홈·유닛·[지도]·경제·세력, A = 홈·지도·유닛·경제·☰ */
export const DEFAULT_NAV_TABS: { readonly [L in NavLayout]: readonly NavItemId[] } = {
  c: ["home", "units", "economy", "faction"],
  a: ["home", "map", "units", "economy"],
};

/** 메뉴 설정. 모르는 항목 ID(더 새 버전이 저장한 값)도 제자리에 남는다 — 그릴 때 isNavItemId로 거른다 */
export interface NavigationSettings {
  readonly layout: NavLayout;
  /** 배치마다 칸 4개의 항목 ID(순서대로) */
  readonly tabs: { readonly [L in NavLayout]: readonly string[] };
  /** 사이드 메뉴 순서. 아는 항목은 모두 들어 있다 */
  readonly menu: readonly string[];
}

export function isNavItemId(value: unknown): value is NavItemId {
  return typeof value === "string" && (NAV_ITEM_IDS as readonly string[]).includes(value);
}

export function isNavLayout(value: unknown): value is NavLayout {
  return typeof value === "string" && (NAV_LAYOUTS as readonly string[]).includes(value);
}

/** 객체의 자기 칸(배열·원형의 칸은 보지 않는다) */
function ownField(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return Object.hasOwn(value, key) ? Reflect.get(value, key) : undefined;
}

/**
 * 한 배치의 칸 4개. 모양이 틀린 값·겹친 항목(뒤의 것)·그 배치가 칸 밖에 두는 항목은 빈 칸이 된다.
 * 빈 칸은 그 배치의 기본 탭 중 없는 것으로, 그래도 모자라면 항목 목록 순서로 채운다.
 */
function parseTabs(raw: unknown, layout: NavLayout): string[] {
  const fixed = NAV_LAYOUT_FIXED_ITEM[layout];
  const list: unknown[] = Array.isArray(raw) ? raw : [];
  const slots: (string | null)[] = [];
  for (let i = 0; i < NAV_TAB_SLOTS; i++) {
    const id = list[i];
    slots.push(isSavedId(id) && id !== fixed && !slots.includes(id) ? id : null);
  }
  // 기본 탭 → 항목 목록 순서(겹침 없이), 이미 칸에 있는 것과 칸 밖에 두는 항목은 뺀다
  const fill = [...new Set([...DEFAULT_NAV_TABS[layout], ...NAV_ITEM_IDS])].filter(
    (id) => id !== fixed && !slots.includes(id),
  );
  return slots.map((slot) => {
    if (slot !== null) return slot;
    const next = fill.shift();
    // 아는 항목이 칸보다 많아서(6개 − 고정 1개 ≥ 4) 늘 채워진다
    if (next === undefined) throw new Error("not enough navigation items to fill the tab slots");
    return next;
  });
}

/**
 * 사이드 메뉴 순서. 모양이 틀린 값과 겹친 항목(뒤의 것)을 지우고, 빠진 아는 항목을 기본 순서로 끝에 붙인다.
 * 길이 상한을 넘으면 모르는 항목을 뒤에서부터 뺀다(아는 항목은 늘 남는다).
 */
function parseMenu(raw: unknown): string[] {
  const menu: string[] = [];
  for (const id of Array.isArray(raw) ? raw : []) {
    if (isSavedId(id) && !menu.includes(id)) menu.push(id);
  }
  for (const id of NAV_ITEM_IDS) {
    if (!menu.includes(id)) menu.push(id);
  }
  for (let i = menu.length - 1; i >= 0 && menu.length > NAV_MENU_MAX; i--) {
    if (!isNavItemId(menu[i])) menu.splice(i, 1);
  }
  return menu;
}

/**
 * 저장된 `nav`(기기 terra.settings·계정 user_settings.nav, 모양을 모르는 JSON 값)를 읽는다. 틀린 값은 기본값으로 바꾼다.
 * - 모르는 항목 ID는 지우지 않는다(보이지 않게 두기는 그리는 쪽). 빈 칸은 기본값으로 채운다. 겹친 항목은 앞의 것만 남는다.
 * - 저장할 때는 읽은 값에 바꾼 칸만 덮어 쓴다. 그래야 더 새 버전이 넣은 칸(예: nav.extra)과 모르는 배치 값이 남는다.
 */
export function parseNavigation(value: unknown): NavigationSettings {
  const layout = ownField(value, "layout");
  const tabs = ownField(value, "tabs");
  return {
    layout: isNavLayout(layout) ? layout : DEFAULT_NAV_LAYOUT,
    tabs: { c: parseTabs(ownField(tabs, "c"), "c"), a: parseTabs(ownField(tabs, "a"), "a") },
    menu: parseMenu(ownField(value, "menu")),
  };
}
