// 메뉴 항목·하단 탭 배치와 유저 설정 `nav` 읽기(ADR 2026-10-29-app-shell 3·4절, 기획 D-6004·D-6007·D-6008·D-6010·D-265).
// 사이드 메뉴·하단 탭·설정의 "메뉴" 칸이 모두 이 목록에서 만들어진다. 서버 입력 검사(목록 길이)도 이 값을 쓴다.
// 그리는 정보(주소 ID·이름 키·한 줄 설명 키·아이콘)는 게임 앱 shell/menuItems.ts에 둔다.
// 항목 ID는 계정에 저장된다(user_settings.nav). 한 번 쓴 ID는 다시 쓰지 않는다(docs/PROTECTED.md).
// D-265(기획 답, 앱 뼈대 질문 Q1): 메뉴 순서는 유저가 하나로 정한다. 하단 탭은 그 순서의 앞에서부터 화면 폭에 맞는 칸 수만큼
// 놓고(칸 수는 게임 앱 shell/layout.ts가 폭으로 정한다), 사이드 메뉴는 늘 모든 항목을 같은 순서로 보인다.
// 홈도 앞에 고정하지 않는다(유저 순서를 따른다). 배치 A·C(D-6007)는 그대로다.
import { isSavedId } from "./savedId.ts";

/**
 * 메뉴 항목 ID. 이 순서가 기본 메뉴 순서다.
 * 앞 4칸이 기본 탭이 된다(D-6010): C = 홈·유닛·[지도]·경제·세력(지도는 가운데 버튼이라 칸에서 빠진다), A = 홈·지도·유닛·경제·☰
 */
export const NAV_ITEM_IDS = ["home", "map", "units", "economy", "faction", "cyborg"] as const;

export type NavItemId = (typeof NAV_ITEM_IDS)[number];

/** 하단 탭 배치(D-6007). c = 칸 + 가운데 큰 지도 버튼(☰는 위 띠), a = 칸 + 끝칸 ☰ */
export const NAV_LAYOUTS = ["c", "a"] as const;

export type NavLayout = (typeof NAV_LAYOUTS)[number];

export const DEFAULT_NAV_LAYOUT: NavLayout = "c";

/** 메뉴 순서 목록의 길이 상한(서버 입력 검사, ADR 37 5절). 모르는 항목 ID(더 새 버전이 저장한 값)까지 센다 */
export const NAV_MENU_MAX = 32;

/** 배치가 칸 밖에 두는 항목. C의 가운데 큰 지도 버튼은 배치의 일부라 지도는 메뉴 순서와 상관없이 C의 칸에 들어가지 않는다 */
export const NAV_LAYOUT_CENTER_ITEM: { readonly [L in NavLayout]: NavItemId | null } = { c: "map", a: null };

/** 메뉴 설정. 모르는 항목 ID(더 새 버전이 저장한 값)도 제자리에 남는다 — 그릴 때 isNavItemId로 거른다 */
export interface NavigationSettings {
  readonly layout: NavLayout;
  /** 메뉴 순서(D-265) — 하단 탭과 사이드 메뉴가 같이 쓴다. 아는 항목은 모두 들어 있다 */
  readonly menu: readonly string[];
}

export function isNavItemId(value: unknown): value is NavItemId {
  return typeof value === "string" && (NAV_ITEM_IDS as readonly string[]).includes(value);
}

export function isNavLayout(value: unknown): value is NavLayout {
  return typeof value === "string" && (NAV_LAYOUTS as readonly string[]).includes(value);
}

/** 배열이 아닌 객체인지(JSON 객체) */
function isRecord(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 객체의 자기 칸(배열·원형의 칸은 보지 않는다) */
function ownField(value: unknown, key: string): unknown {
  return isRecord(value) && Object.hasOwn(value, key) ? Reflect.get(value, key) : undefined;
}

/** 메뉴 순서에 남는 모르는 항목 수의 상한(아는 항목은 늘 모두 남는다) */
const NAV_MENU_UNKNOWN_MAX = NAV_MENU_MAX - NAV_ITEM_IDS.length;

/**
 * 메뉴 순서. 모양이 틀린 값과 겹친 항목(뒤의 것)을 지우고, 빠진 아는 항목을 기본 순서로 끝에 붙인다.
 * 길이 상한을 넘지 않게 모르는 항목은 앞에서부터 상한까지만 남긴다(= 뒤에서부터 뺀다. 아는 항목은 늘 남는다).
 * 값 하나를 한 번만 본다(기기에 저장된 긴 목록도 선형 시간).
 */
function parseMenu(raw: unknown): string[] {
  const menu: string[] = [];
  const seen = new Set<string>();
  let unknown = 0;
  for (const id of Array.isArray(raw) ? raw : []) {
    if (!isSavedId(id) || seen.has(id)) continue;
    if (!isNavItemId(id)) {
      if (unknown === NAV_MENU_UNKNOWN_MAX) continue;
      unknown++;
    }
    seen.add(id);
    menu.push(id);
  }
  for (const id of NAV_ITEM_IDS) {
    if (!seen.has(id)) menu.push(id);
  }
  return menu;
}

/**
 * 저장된 `nav`(기기 terra.settings·계정 user_settings.nav, 모양을 모르는 JSON 값)를 읽는다. 틀린 값은 기본값으로 바꾼다.
 * - 모르는 항목 ID는 지우지 않는다(그릴 때는 navMenuItems·visibleTabs로 거른다). 겹친 항목은 앞의 것만 남는다.
 * - 저장할 때는 mergeNavigation으로 읽은 원래 값에 바꾼 칸만 덮어 쓴다. 그래야 더 새 버전이 넣은 칸(예: nav.extra)이 남는다.
 */
export function parseNavigation(value: unknown): NavigationSettings {
  const layout = ownField(value, "layout");
  return {
    layout: isNavLayout(layout) ? layout : DEFAULT_NAV_LAYOUT,
    menu: parseMenu(ownField(value, "menu")),
  };
}

/** 사이드 메뉴·설정 목록에 그릴 항목: 메뉴 순서의 아는 항목(모르는 ID는 건너뛴다. 저장값은 그대로) */
export function navMenuItems(settings: NavigationSettings): NavItemId[] {
  return settings.menu.filter(isNavItemId);
}

/**
 * 하단 탭 칸에 놓을 항목(그리는 데만 쓴다. 저장값은 바꾸지 않는다, D-265).
 * 메뉴 순서의 아는 항목 중 그 배치가 칸 밖에 두는 것(C의 가운데 지도)을 빼고 앞에서부터 slots개다.
 * 아는 항목이 모자라면(C는 지도를 뺀 5개가 최대) 있는 만큼만 돌려준다.
 */
export function visibleTabs(
  settings: NavigationSettings,
  slots: number,
  layout: NavLayout = settings.layout,
): NavItemId[] {
  const center = NAV_LAYOUT_CENTER_ITEM[layout];
  return navMenuItems(settings)
    .filter((id) => id !== center)
    .slice(0, Math.max(0, Math.floor(slots)));
}

/**
 * 아는 항목 하나를 메뉴 순서에서 한 칸(아는 항목 사이에서) 옮긴 새 순서. 모르는 항목 ID는 제자리에 둔다.
 * 끝에 있어 더 갈 곳이 없거나 목록에 없는 항목이면 같은 순서를 새 배열로 돌려준다.
 */
export function moveNavItem(menu: readonly string[], id: NavItemId, delta: -1 | 1): string[] {
  const next = [...menu];
  // 아는 항목의 자리(목록 안 위치)들. 옮기기는 이 자리들 사이에서만 한다
  const slots: number[] = [];
  next.forEach((value, index) => {
    if (isNavItemId(value)) slots.push(index);
  });
  const at = slots.findIndex((index) => next[index] === id);
  const to = at + delta;
  if (at < 0 || to < 0 || to >= slots.length) return next;
  const from = slots[at];
  const other = slots[to];
  if (from === undefined || other === undefined) return next;
  [next[from], next[other]] = [next[other] ?? id, id];
  return next;
}

/**
 * 기본 메뉴 순서로 되돌린 새 순서([기본값으로]). 아는 항목은 기본 순서로 앞에, 모르는 항목 ID는 원래 차례대로 뒤에 둔다
 * (더 새 버전이 넣은 항목을 이 기기가 지우지 않는다).
 */
export function resetNavMenu(menu: readonly string[]): string[] {
  return [...NAV_ITEM_IDS, ...menu.filter((id) => !isNavItemId(id))];
}

/** mergeNavigation에 줄 바꾼 칸. 적은 칸만 덮어 쓴다 */
export interface NavigationPatch {
  readonly layout?: NavLayout;
  readonly menu?: readonly string[];
}

/**
 * 저장할 `nav` 값을 만든다: 읽은 원래 값(모양을 모르는 JSON)에 바꾼 칸만 덮어 쓴다(ADR 37 4·5절).
 * 더 새 버전이 넣은 칸(nav.extra)과 바꾸지 않은 칸은 그대로 남는다.
 * 원래 값이 객체가 아니면 빈 객체에서 시작한다. 돌려준 값은 새 객체다(원래 값을 고치지 않는다).
 */
export function mergeNavigation(raw: unknown, patch: NavigationPatch): { readonly [key: string]: unknown } {
  const merged: Record<string, unknown> = isRecord(raw) ? { ...raw } : {};
  if (patch.layout !== undefined) merged["layout"] = patch.layout;
  if (patch.menu !== undefined) merged["menu"] = [...patch.menu];
  return merged;
}
