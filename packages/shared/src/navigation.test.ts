// 메뉴 순서·하단 탭 설정 시험 — 기본값, 모르는 ID 남기기, 겹침 지우기, 폭에 맞춘 탭(D-265), 옮기기(ADR 2026-10-29-app-shell 4·13절)
import { describe, expect, it } from "vitest";
import {
  DEFAULT_NAV_LAYOUT,
  NAV_ITEM_IDS,
  NAV_LAYOUTS,
  NAV_LAYOUT_CENTER_ITEM,
  NAV_MENU_MAX,
  type NavigationSettings,
  isNavItemId,
  isNavLayout,
  mergeNavigation,
  moveNavItem,
  navMenuItems,
  parseNavigation,
  resetNavMenu,
  visibleTabs,
} from "./navigation.ts";
import { SAVED_ID_PATTERN } from "./savedId.ts";

const DEFAULTS: NavigationSettings = {
  layout: "c",
  menu: ["home", "map", "units", "economy", "faction", "inventory"],
};

describe("메뉴 항목 목록", () => {
  it("항목 6개(D-6008·D-6010 + 인벤토리 2026-11-14 − 사이보그 2026-11-24), 배치 C·A(기본 C), 순서 상한 32", () => {
    expect(NAV_ITEM_IDS).toEqual(["home", "map", "units", "economy", "faction", "inventory"]);
    expect(NAV_LAYOUTS).toEqual(["c", "a"]);
    expect(DEFAULT_NAV_LAYOUT).toBe("c");
    expect(NAV_MENU_MAX).toBe(32);
    expect(NAV_LAYOUT_CENTER_ITEM).toEqual({ c: "map", a: null });
  });

  it("항목 ID는 저장되는 ID 모양이다", () => {
    for (const id of NAV_ITEM_IDS) expect(id).toMatch(SAVED_ID_PATTERN);
  });

  it("기본 순서의 앞 4칸이 기획의 기본 탭이다(D-6010): C = 홈·유닛·경제·세력(+ 가운데 지도), A = 홈·지도·유닛·경제", () => {
    expect(visibleTabs(DEFAULTS, 4, "c")).toEqual(["home", "units", "economy", "faction"]);
    expect(visibleTabs(DEFAULTS, 4, "a")).toEqual(["home", "map", "units", "economy"]);
  });

  it("isNavItemId·isNavLayout은 목록의 문자열만 받는다", () => {
    expect(isNavItemId("inventory")).toBe(true);
    // 뺀 항목(사이보그 — 유닛 창에 합쳤다, 사용자 결정 2026-11-24)은 모르는 ID다
    expect(isNavItemId("cyborg")).toBe(false);
    expect(isNavItemId("mail")).toBe(false);
    expect(isNavItemId(1)).toBe(false);
    expect(isNavLayout("a")).toBe(true);
    expect(isNavLayout("b")).toBe(false);
    expect(isNavLayout("C")).toBe(false);
  });
});

describe("parseNavigation", () => {
  it("값이 없거나 객체가 아니면 기본값", () => {
    for (const value of [undefined, null, "c", 3, [], { layout: 1, menu: {} }]) {
      expect(parseNavigation(value), JSON.stringify(value)).toEqual(DEFAULTS);
    }
  });

  it("맞는 값은 그대로 읽는다", () => {
    const value = {
      layout: "a",
      menu: ["inventory", "faction", "economy", "units", "map", "home"],
    };
    expect(parseNavigation(value)).toEqual(value);
  });

  it("메뉴 순서 하나만 읽는다: 0단계의 배치별 탭 목록(tabs)은 보지 않는다(D-265)", () => {
    const parsed = parseNavigation({ layout: "a", tabs: { a: ["inventory", "home", "map", "units"] } });
    expect(parsed).toEqual({ layout: "a", menu: DEFAULTS.menu });
    expect(Object.keys(parsed).toSorted()).toEqual(["layout", "menu"]);
  });

  it("모르는 항목 ID(더 새 버전이 저장한 값)는 제자리에 남는다. 모양이 틀린 값은 지운다", () => {
    const parsed = parseNavigation({ menu: ["trade_desk", "home", "Bad ID", 7, "map"] });
    expect(parsed.menu).toEqual(["trade_desk", "home", "map", "units", "economy", "faction", "inventory"]);
  });

  it("저장된 메뉴 순서에 남은 뺀 항목(cyborg)은 제자리에 남되 그리지 않는다", () => {
    const parsed = parseNavigation({ menu: ["cyborg", "home", "map"] });
    expect(parsed.menu[0]).toBe("cyborg");
    expect(navMenuItems(parsed)).toEqual(["home", "map", "units", "economy", "faction", "inventory"]);
    expect(visibleTabs(parsed, 4, "a")).toEqual(["home", "map", "units", "economy"]);
  });

  it("겹친 항목은 앞의 것만 남고, 빠진 아는 항목은 기본 순서로 끝에 붙는다", () => {
    expect(parseNavigation({ menu: ["units", "units", "home"] }).menu).toEqual([
      "units",
      "home",
      "map",
      "economy",
      "faction",
      "inventory",
    ]);
  });

  it("아는 항목은 늘 모두 남는다. 길이 상한을 넘으면 모르는 ID를 뒤에서부터 뺀다", () => {
    const unknown = Array.from({ length: 40 }, (_, i) => `future_${i}`);
    const menu = parseNavigation({ menu: ["inventory", ...unknown] }).menu;
    expect(menu).toHaveLength(NAV_MENU_MAX);
    for (const id of NAV_ITEM_IDS) expect(menu).toContain(id);
    expect(menu.slice(0, 3)).toEqual(["inventory", "future_0", "future_1"]);
    // 모르는 ID 뒤에 둔 아는 항목도 제 순서로 남는다(모르는 ID는 앞의 26개만)
    expect(parseNavigation({ menu: [...unknown, "faction", "inventory"] }).menu).toEqual([
      ...unknown.slice(0, NAV_MENU_MAX - NAV_ITEM_IDS.length),
      "faction",
      "inventory",
      "home",
      "map",
      "units",
      "economy",
    ]);
  });

  it("기기에 저장된 아주 긴 목록도 값을 한 번씩만 본다(겹침 확인이 목록 길이에 비례하지 않는다)", () => {
    // 전에는 겹침을 배열 includes로 봐서 4만 개에 약 2.6초였다
    const many = Array.from({ length: 50_000 }, (_, i) => `future_${i % 40_000}`);
    const menu = parseNavigation({ menu: ["units", ...many] }).menu;
    expect(menu).toHaveLength(NAV_MENU_MAX);
    expect(menu.slice(0, 2)).toEqual(["units", "future_0"]);
  });

  it("모르는 배치 값은 기본 배치로 읽는다(저장값은 쓰는 쪽이 덮어 쓰지 않는 한 남는다)", () => {
    expect(parseNavigation({ layout: "b" }).layout).toBe("c");
    // 원형의 칸은 보지 않는다
    expect(parseNavigation(Object.create({ layout: "a" })).layout).toBe("c");
  });

  it("돌려준 목록은 기본값 목록과 따로다(고쳐 써도 기본값이 바뀌지 않는다)", () => {
    expect(parseNavigation(undefined).menu).not.toBe(NAV_ITEM_IDS);
  });
});

describe("하단 탭과 사이드 메뉴(D-265)", () => {
  const custom = parseNavigation({ menu: ["inventory", "trade_desk", "map", "faction", "home"] });

  it("사이드 메뉴는 메뉴 순서의 아는 항목 6개를 모두 같은 순서로 보인다(모르는 ID는 건너뛴다)", () => {
    expect(custom.menu).toEqual(["inventory", "trade_desk", "map", "faction", "home", "units", "economy"]);
    expect(navMenuItems(custom)).toEqual(["inventory", "map", "faction", "home", "units", "economy"]);
  });

  it("탭은 같은 순서의 앞에서부터 칸 수만큼이다. 칸 수는 화면 폭이 정한다(좁은 휴대폰 4, 넓으면 더)", () => {
    expect(visibleTabs(custom, 4, "a")).toEqual(["inventory", "map", "faction", "home"]);
    expect(visibleTabs(custom, 5, "a")).toEqual(["inventory", "map", "faction", "home", "units"]);
    expect(visibleTabs(custom, 7, "a")).toEqual(navMenuItems(custom));
  });

  it("C는 지도가 가운데 버튼이라 지도를 빼고 센다(어디에 두든). 그래서 C의 칸은 5개가 최대다", () => {
    expect(visibleTabs(custom, 4, "c")).toEqual(["inventory", "faction", "home", "units"]);
    expect(visibleTabs(custom, 7, "c")).toEqual(["inventory", "faction", "home", "units", "economy"]);
  });

  it("홈도 앞에 고정하지 않는다: 뒤로 옮기면 좁은 폭의 탭에서 빠진다(사이드 메뉴에는 남는다)", () => {
    const homeLast = parseNavigation({
      menu: ["map", "units", "economy", "faction", "inventory", "home"],
    });
    expect(visibleTabs(homeLast, 4, "c")).toEqual(["units", "economy", "faction", "inventory"]);
    expect(navMenuItems(homeLast).at(-1)).toBe("home");
  });

  it("배치를 적지 않으면 설정의 배치를 쓰고, 칸 수가 0 이하·소수면 내려서 센다", () => {
    expect(visibleTabs({ ...DEFAULTS, layout: "a" }, 4)).toEqual(["home", "map", "units", "economy"]);
    expect(visibleTabs(DEFAULTS, 0)).toEqual([]);
    expect(visibleTabs(DEFAULTS, -2)).toEqual([]);
    expect(visibleTabs(DEFAULTS, 4.9)).toHaveLength(4);
  });
});

describe("moveNavItem·resetNavMenu", () => {
  it("아는 항목 사이에서 한 칸 옮긴다. 모르는 ID는 제자리다", () => {
    const menu = ["home", "trade_desk", "map", "units", "economy", "faction", "inventory"];
    expect(moveNavItem(menu, "map", -1)).toEqual([
      "map",
      "trade_desk",
      "home",
      "units",
      "economy",
      "faction",
      "inventory",
    ]);
    expect(moveNavItem(menu, "home", 1)).toEqual([
      "map",
      "trade_desk",
      "home",
      "units",
      "economy",
      "faction",
      "inventory",
    ]);
    expect(moveNavItem(menu, "units", 1)).toEqual([
      "home",
      "trade_desk",
      "map",
      "economy",
      "units",
      "faction",
      "inventory",
    ]);
    // 원래 목록은 고치지 않는다
    expect(menu[0]).toBe("home");
  });

  it("끝에서 더 갈 곳이 없거나 목록에 없는 항목이면 같은 순서(새 배열)", () => {
    const menu = [...NAV_ITEM_IDS];
    expect(moveNavItem(menu, "home", -1)).toEqual(menu);
    expect(moveNavItem(menu, "inventory", 1)).toEqual(menu);
    expect(moveNavItem(["home", "map"], "inventory", 1)).toEqual(["home", "map"]);
    expect(moveNavItem(menu, "home", -1)).not.toBe(menu);
  });

  it("기본값으로: 아는 항목은 기본 순서, 모르는 ID는 원래 차례대로 뒤에", () => {
    // 뺀 항목(cyborg)도 모르는 ID로 남는다
    expect(resetNavMenu(["q_q", "cyborg", "trade_desk", "home"])).toEqual([
      ...NAV_ITEM_IDS,
      "q_q",
      "cyborg",
      "trade_desk",
    ]);
    expect(resetNavMenu(DEFAULTS.menu)).toEqual(DEFAULTS.menu);
  });
});

describe("mergeNavigation", () => {
  it("읽은 원래 값에 바꾼 칸만 덮어 쓴다: 더 새 버전의 칸·바꾸지 않은 칸이 남는다", () => {
    const raw = { layout: "b", menu: ["trade_desk", "home"], extra: { pinned: true } };
    const saved = JSON.stringify(raw);
    expect(mergeNavigation(raw, { layout: "a" })).toEqual({ ...raw, layout: "a" });
    expect(mergeNavigation(raw, { menu: ["home", "map"] })).toEqual({ ...raw, menu: ["home", "map"] });
    // 원래 값은 고치지 않는다
    expect(JSON.stringify(raw)).toBe(saved);
  });

  it("원래 값이 객체가 아니면 빈 객체에서 시작한다. 읽고 옮겨 다시 쓰면 모르는 ID도 남는다", () => {
    expect(mergeNavigation(undefined, { layout: "c" })).toEqual({ layout: "c" });
    expect(mergeNavigation([1], { menu: ["home"] })).toEqual({ menu: ["home"] });
    const raw = { menu: ["home", "trade_desk", "map"], extra: 1 };
    const parsed = parseNavigation(raw);
    expect(mergeNavigation(raw, { menu: moveNavItem(parsed.menu, "map", -1) })).toEqual({
      extra: 1,
      menu: ["map", "trade_desk", "home", "units", "economy", "faction", "inventory"],
    });
  });
});
