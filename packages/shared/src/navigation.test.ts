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
  mergeNavigation,
  parseNavigation,
  visibleTabs,
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
    // 모르는 ID 뒤에 둔 아는 항목도 제 순서로 남는다(모르는 ID는 앞의 26개만)
    expect(parseNavigation({ menu: [...unknown, "faction", "cyborg"] }).menu).toEqual([
      ...unknown.slice(0, NAV_MENU_MAX - NAV_ITEM_IDS.length),
      "faction",
      "cyborg",
      "home",
      "map",
      "units",
      "economy",
    ]);
  });

  it("기기에 저장된 아주 긴 목록도 값을 한 번씩만 본다(겹침 확인이 목록 길이에 비례하지 않는다)", () => {
    // 전에는 겹침을 배열 includes로 봐서 4만 개에 약 2.6초였다(이 시험의 5초 상한에 걸린다)
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

  it("visibleTabs: 모르는 ID 칸은 그 배치의 기본 탭 중 없는 것으로 채워 보인다(저장값은 그대로)", () => {
    // 되돌림 배포 뒤: 더 새 버전이 C 칸 4개를 모두 모르는 ID로 채웠다
    const rolledBack = parseNavigation({ tabs: { c: ["trade_desk", "x_y", "z_w", "q_q"] } });
    expect(rolledBack.tabs.c).toEqual(["trade_desk", "x_y", "z_w", "q_q"]);
    expect(visibleTabs(rolledBack)).toEqual(DEFAULT_NAV_TABS.c);
    const mixed = parseNavigation({ layout: "a", tabs: { a: ["cyborg", "trade_desk", "home", "q_q"] } });
    expect(visibleTabs(mixed)).toEqual(["cyborg", "map", "home", "units"]);
    expect(visibleTabs(mixed, "c")).toEqual(DEFAULT_NAV_TABS.c);
    expect(mixed.tabs.a).toEqual(["cyborg", "trade_desk", "home", "q_q"]);
    // 아는 항목만 있으면 그대로다
    expect(visibleTabs(DEFAULTS)).toEqual(DEFAULTS.tabs.c);
    expect(visibleTabs(DEFAULTS, "a")).toEqual(DEFAULTS.tabs.a);
  });

  it("돌려준 목록은 기본값 목록과 따로다(고쳐 써도 기본값이 바뀌지 않는다)", () => {
    const parsed = parseNavigation(undefined);
    expect(parsed.tabs.c).not.toBe(DEFAULT_NAV_TABS.c);
    expect(parsed.tabs.a).not.toBe(DEFAULT_NAV_TABS.a);
    expect(parsed.menu).not.toBe(NAV_ITEM_IDS);
  });
});

describe("mergeNavigation", () => {
  it("읽은 원래 값에 바꾼 칸만 덮어 쓴다: 더 새 버전의 칸·모르는 배치의 탭·바꾸지 않은 칸이 남는다", () => {
    const raw = {
      layout: "b",
      tabs: { c: ["units", "home", "economy", "faction"], b: ["home"] },
      menu: ["trade_desk", "home"],
      extra: { pinned: true },
    };
    const saved = JSON.stringify(raw);
    expect(mergeNavigation(raw, { tabs: { a: ["map", "home", "units", "economy"] } })).toEqual({
      layout: "b",
      tabs: {
        c: ["units", "home", "economy", "faction"],
        b: ["home"],
        a: ["map", "home", "units", "economy"],
      },
      menu: ["trade_desk", "home"],
      extra: { pinned: true },
    });
    expect(mergeNavigation(raw, { layout: "a", menu: ["home", "map"] })).toEqual({
      ...raw,
      layout: "a",
      menu: ["home", "map"],
    });
    // 원래 값은 고치지 않는다
    expect(JSON.stringify(raw)).toBe(saved);
  });

  it("원래 값이 객체가 아니거나 tabs가 객체가 아니면 빈 객체에서 시작한다", () => {
    expect(mergeNavigation(undefined, { layout: "c" })).toEqual({ layout: "c" });
    expect(mergeNavigation([1], { menu: ["home"] })).toEqual({ menu: ["home"] });
    expect(
      mergeNavigation({ tabs: ["x"] }, { tabs: { c: ["home", "units", "economy", "faction"] } }),
    ).toEqual({
      tabs: { c: ["home", "units", "economy", "faction"] },
    });
    // 읽고(parseNavigation) 고쳐서 다시 쓰는 길: 모르는 ID도 그대로 남는다
    const raw = { tabs: { a: ["home", "trade_desk", "units", "economy"] }, extra: 1 };
    const parsed = parseNavigation(raw);
    expect(mergeNavigation(raw, { layout: "a", tabs: { a: parsed.tabs.a } })).toEqual({
      ...raw,
      layout: "a",
    });
  });
});
