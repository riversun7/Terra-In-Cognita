// 메뉴 항목·하단 탭 설정 시험 — 기본값, 모르는 ID 남기기, 칸 채우기, 겹침 지우기(ADR 2026-10-29-app-shell 4·13절)
import { describe, expect, it } from "vitest";
import {
  DEFAULT_NAV_LAYOUT,
  DEFAULT_NAV_TABS,
  NAV_ITEM_IDS,
  NAV_LAYOUTS,
  NAV_LAYOUT_FIXED_ITEM,
  NAV_MENU_MAX,
  NAV_TAB_SLOTS,
  type NavigationSettings,
  isNavItemId,
  isNavLayout,
  parseNavigation,
} from "./navigation.ts";
import { SAVED_ID_PATTERN } from "./savedId.ts";

const DEFAULTS: NavigationSettings = {
  layout: "c",
  tabs: { c: ["home", "units", "economy", "faction"], a: ["home", "map", "units", "economy"] },
  menu: ["home", "map", "units", "economy", "faction", "cyborg"],
};

describe("메뉴 항목 목록", () => {
  it("항목 6개(D-6008·D-6010), 배치 C·A(기본 C), 칸 4개", () => {
    expect(NAV_ITEM_IDS).toEqual(["home", "map", "units", "economy", "faction", "cyborg"]);
    expect(NAV_LAYOUTS).toEqual(["c", "a"]);
    expect(DEFAULT_NAV_LAYOUT).toBe("c");
    expect(NAV_TAB_SLOTS).toBe(4);
    expect(NAV_MENU_MAX).toBe(32);
  });

  it("항목 ID는 저장되는 ID 모양이다", () => {
    for (const id of NAV_ITEM_IDS) expect(id).toMatch(SAVED_ID_PATTERN);
  });

  it("기본 탭: C = 홈·유닛·경제·세력(가운데 지도는 배치의 일부), A = 홈·지도·유닛·경제", () => {
    expect(DEFAULT_NAV_TABS).toEqual(DEFAULTS.tabs);
    expect(NAV_LAYOUT_FIXED_ITEM).toEqual({ c: "map", a: null });
    for (const layout of NAV_LAYOUTS) {
      const tabs = DEFAULT_NAV_TABS[layout];
      expect(tabs).toHaveLength(NAV_TAB_SLOTS);
      expect(new Set(tabs).size).toBe(tabs.length);
      expect(tabs).not.toContain(NAV_LAYOUT_FIXED_ITEM[layout]);
    }
  });

  it("isNavItemId·isNavLayout은 목록의 문자열만 받는다", () => {
    expect(isNavItemId("cyborg")).toBe(true);
    expect(isNavItemId("mail")).toBe(false);
    expect(isNavItemId(1)).toBe(false);
    expect(isNavLayout("a")).toBe(true);
    expect(isNavLayout("b")).toBe(false);
    expect(isNavLayout("C")).toBe(false);
  });
});

describe("parseNavigation", () => {
  it("값이 없거나 객체가 아니면 기본값", () => {
    for (const value of [undefined, null, "c", 3, [], { layout: 1, tabs: "x", menu: {} }]) {
      expect(parseNavigation(value), JSON.stringify(value)).toEqual(DEFAULTS);
    }
  });

  it("맞는 값은 그대로 읽는다", () => {
    const value = {
      layout: "a",
      tabs: { c: ["cyborg", "home", "faction", "units"], a: ["map", "home", "faction", "cyborg"] },
      menu: ["cyborg", "faction", "economy", "units", "map", "home"],
    };
    expect(parseNavigation(value)).toEqual(value);
  });

  it("모르는 항목 ID(더 새 버전이 저장한 값)는 제자리에 남는다. 모양이 틀린 값은 빈 칸이 된다", () => {
    const parsed = parseNavigation({
      tabs: { a: ["home", "trade_desk", "units", "economy"] },
      menu: ["trade_desk", "home", "Bad ID", 7, "map"],
    });
    expect(parsed.tabs.a).toEqual(["home", "trade_desk", "units", "economy"]);
    expect(parsed.menu).toEqual(["trade_desk", "home", "map", "units", "economy", "faction", "cyborg"]);
  });

  it("빈 칸은 그 배치의 기본 탭 중 없는 것으로, 그래도 모자라면 목록 순서로 채운다", () => {
    // 짧은 목록: 뒤 칸이 빈다
    expect(parseNavigation({ tabs: { c: ["cyborg"] } }).tabs.c).toEqual([
      "cyborg",
      "home",
      "units",
      "economy",
    ]);
    // 기본 탭이 모두 다른 칸에 있으면 목록 순서로
    expect(parseNavigation({ tabs: { a: [null, "home", "map", "units"] } }).tabs.a).toEqual([
      "economy",
      "home",
      "map",
      "units",
    ]);
    expect(parseNavigation({ tabs: { a: ["home", "map", "units", "economy", "faction"] } }).tabs.a).toEqual(
      DEFAULTS.tabs.a,
    );
  });

  it("겹친 항목은 앞의 것만 남고, C 칸에는 지도를 넣지 않는다(가운데 버튼)", () => {
    expect(parseNavigation({ tabs: { c: ["units", "units", "map", "home"] } }).tabs.c).toEqual([
      "units",
      "economy",
      "faction",
      "home",
    ]);
    expect(parseNavigation({ tabs: { a: ["map", "map", "map", "map"] } }).tabs.a).toEqual([
      "map",
      "home",
      "units",
      "economy",
    ]);
    expect(parseNavigation({ menu: ["units", "units", "home"] }).menu).toEqual([
      "units",
      "home",
      "map",
      "economy",
      "faction",
      "cyborg",
    ]);
  });

  it("사이드 메뉴는 늘 모든 항목을 보인다. 길이 상한을 넘으면 모르는 ID를 뒤에서부터 뺀다", () => {
    const unknown = Array.from({ length: 40 }, (_, i) => `future_${i}`);
    const menu = parseNavigation({ menu: ["cyborg", ...unknown] }).menu;
    expect(menu).toHaveLength(NAV_MENU_MAX);
    for (const id of NAV_ITEM_IDS) expect(menu).toContain(id);
    expect(menu.slice(0, 3)).toEqual(["cyborg", "future_0", "future_1"]);
  });

  it("모르는 배치 값은 기본 배치로 읽는다(저장값은 쓰는 쪽이 덮어 쓰지 않는 한 남는다)", () => {
    expect(parseNavigation({ layout: "b" }).layout).toBe("c");
    // 원형의 칸은 보지 않는다
    expect(parseNavigation(Object.create({ layout: "a" })).layout).toBe("c");
  });

  it("돌려준 목록은 기본값 목록과 따로다(고쳐 써도 기본값이 바뀌지 않는다)", () => {
    const parsed = parseNavigation(undefined);
    expect(parsed.tabs.c).not.toBe(DEFAULT_NAV_TABS.c);
    expect(parsed.tabs.a).not.toBe(DEFAULT_NAV_TABS.a);
    expect(parsed.menu).not.toBe(NAV_ITEM_IDS);
  });
});
