// 폭 경계 시험 — 화면 틀 CSS(shell.css·tabbar.css)와 복귀 요약 겹침(summary/summary.css)의 미디어 쿼리 숫자와
// layout.ts의 값이 같다(ADR 2026-10-29-app-shell 3절 · 2026-11-24-compact-responsive-shell-and-chat.md),
// 슬림 플랫 48px 하단 탭 칸 수(D-265)·배치 C의 칸 나누기, 채팅바·하단 탭 여백 보정
import { NAV_ITEM_IDS, NAV_LAYOUTS, type NavLayout } from "@terra/shared";
import { describe, expect, it } from "vitest";
import tokensCss from "../styles/tokens.css?raw";
import summaryCss from "../summary/summary.css?raw";
import {
  MEDIUM_MIN_EM,
  MEDIUM_QUERY,
  TAB_CELL_MIN_EM,
  TAB_MAP_CELL_EM,
  TAB_SLOT_QUERIES,
  TAB_SLOT_STEPS,
  WIDE_MIN_EM,
  WIDE_QUERY,
  layoutStage,
  splitCenterTabs,
  tabSlotsForWidth,
} from "./layout.ts";
import shellCss from "./shell.css?raw";
import tabbarCss from "./tabbar.css?raw";

/** 폭 경계를 쓰는 CSS: 화면 틀 + 복귀 요약 겹침(vitest.config.ts test.css.include에도 넣는다) */
const FRAME_CSS = { "shell.css": shellCss, "tabbar.css": tabbarCss, "summary.css": summaryCss };

/** px → em(브라우저 기본 글자 크기 16px) */
const px = (value: number): number => value / 16;

/**
 * 칸 수만큼 놓을 때 가장 좁은 칸이 TAB_CELL_MIN_EM이 되는 폭(em). A는 칸 + ☰, C는 칸 + 지도가 모두 같은 너비다(tabbar.css —
 * C는 지도 칸이 TAB_MAP_CELL_EM 이상이어야 한다)
 */
function narrowestNeed(layout: NavLayout, slots: number): number {
  return (slots + 1) * (layout === "a" ? TAB_CELL_MIN_EM : Math.max(TAB_CELL_MIN_EM, TAB_MAP_CELL_EM));
}

/** tokens.css의 px 값 하나(`--이름: 60px;`) */
function tokenPx(name: string): number {
  const match = new RegExp(`${name}:\\s*(\\d+(?:\\.\\d+)?)px;`).exec(tokensCss);
  return Number(match?.[1] ?? Number.NaN);
}

/** CSS 규칙 하나의 선언 글(선택자 글자 그대로, 주석은 빼고 빈칸·줄바꿈은 한 칸으로). 없으면 빈 문자열 */
function ruleBody(css: string, selector: string): string {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const at = text.indexOf(`${selector} {`);
  if (at < 0) return "";
  const open = text.indexOf("{", at);
  return text
    .slice(open + 1, text.indexOf("}", open))
    .replace(/\s+/g, " ")
    .trim();
}

/** CSS의 @media 머리글들(주석은 뺀다) */
function mediaQueries(css: string): string[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...text.matchAll(/@media\s+([^{]+)\{/g)].map((match) => (match[1] ?? "").trim());
}

describe("폭 3단계", () => {
  it("37.5em(600px)·64em(1024px)이다", () => {
    expect(MEDIUM_MIN_EM).toBe(37.5);
    expect(WIDE_MIN_EM).toBe(64);
    expect(MEDIUM_QUERY).toBe("(min-width: 37.5em)");
    expect(WIDE_QUERY).toBe("(min-width: 64em)");
  });

  it("화면 틀 CSS의 폭 미디어 쿼리는 layout.ts의 두 경계만 쓴다(글자 그대로)", () => {
    const all: string[] = [];
    for (const [name, css] of Object.entries(FRAME_CSS)) {
      // 빈 문자열이면 CSS를 읽지 못한 것이다(vitest.config.ts test.css.include)
      expect(css.length, name).toBeGreaterThan(1000);
      const widthQueries = mediaQueries(css).filter((query) => /width/.test(query));
      for (const query of widthQueries)
        expect([MEDIUM_QUERY, WIDE_QUERY], `${name}: ${query}`).toContain(query);
      // 다른 단위(px)·다른 숫자로 쓴 폭 경계가 없다
      expect(css, name).not.toMatch(/(?:min|max)-width:\s*\d+(?:\.\d+)?px/);
      all.push(...widthQueries);
    }
    expect(all).toContain(MEDIUM_QUERY);
    expect(all).toContain(WIDE_QUERY);
  });

  it("폭(em) → 단계: 경계 값은 위 단계다", () => {
    expect(layoutStage(20)).toBe("narrow");
    expect(layoutStage(37.49)).toBe("narrow");
    expect(layoutStage(37.5)).toBe("medium");
    expect(layoutStage(63.99)).toBe("medium");
    expect(layoutStage(64)).toBe("wide");
    expect(layoutStage(90)).toBe("wide");
  });
});

describe("슬림 하단 탭 칸 수(D-265: 320px 초소형 4칸, 380px+ 휴대폰 5~6칸)", () => {
  it("초소형(320px)은 4칸, 표준 스마트폰(380px~)은 C 5칸·A 6칸 = 최대 칸(메뉴 항목 6개). 중간·넓음은 하단 탭 없음", () => {
    expect(tabSlotsForWidth(px(320), "c")).toBe(4);
    expect(tabSlotsForWidth(px(320), "a")).toBe(4);
    expect(tabSlotsForWidth(px(324), "a")).toBe(5);
    expect(tabSlotsForWidth(px(375), "a")).toBe(5);
    expect(tabSlotsForWidth(px(375), "c")).toBe(4);
    expect(tabSlotsForWidth(px(378), "a")).toBe(6);
    // 메뉴 항목이 6개라(사이보그 항목을 뺐다, 2026-11-24) 더 넓어도 칸이 늘지 않는다
    for (const width of [380, 390, 393, 412, 414, 428, 431, 432, 480, 540, 599]) {
      expect(tabSlotsForWidth(px(width), "c"), `C ${width}px`).toBe(5);
      expect(tabSlotsForWidth(px(width), "a"), `A ${width}px`).toBe(6);
    }
    for (const layout of NAV_LAYOUTS) {
      for (const width of [600, 844, 1440]) {
        expect(tabSlotsForWidth(px(width), layout), `${layout} ${width}px`).toBe(0);
      }
    }
  });

  it("계단 시작 폭에서 가장 좁은 칸이 TAB_CELL_MIN_EM(3.375em = 54px) 이상이다", () => {
    for (const layout of NAV_LAYOUTS) {
      const steps = TAB_SLOT_STEPS[layout];
      expect(steps[0], layout).toEqual({ minEm: 0, slots: 4 });
      for (let i = 1; i < steps.length; i++) {
        const before = steps[i - 1];
        const step = steps[i];
        if (before === undefined || step === undefined) continue;
        expect(narrowestNeed(layout, step.slots), `${layout} ${step.slots}칸`).toBeLessThanOrEqual(
          step.minEm,
        );
        expect(step.minEm).toBeGreaterThan(before.minEm);
        expect(step.slots).toBe(before.slots + 1);
        expect(step.minEm).toBeLessThan(MEDIUM_MIN_EM);
      }
    }
    expect(TAB_SLOT_STEPS.a[TAB_SLOT_STEPS.a.length - 1]?.slots).toBe(NAV_ITEM_IDS.length);
    expect(TAB_SLOT_STEPS.c[TAB_SLOT_STEPS.c.length - 1]?.slots).toBe(NAV_ITEM_IDS.length - 1);
  });

  it("두 배치 모두 칸을 같은 폭으로 나눈다(C는 지도 양옆 묶음이 칸을 만들지 않는다)", () => {
    for (const layout of NAV_LAYOUTS) {
      const body = ruleBody(tabbarCss, `.tabbar[data-layout="${layout}"]`);
      expect(body, layout).toContain("grid-auto-flow: column");
      expect(body, layout).toContain("grid-auto-columns: minmax(0, 1fr)");
    }
    expect(ruleBody(tabbarCss, ".tabbar-side")).toContain("display: contents");
  });

  it("C의 지도 칸 너비(em)는 tokens.css·tabbar.css 값과 같다", () => {
    expect(tokensCss.length).toBeGreaterThan(1000);
    expect(tabbarCss).toMatch(
      /\.tab-map \{\s*min-width: calc\(var\(--tabbar-map-size\) \+ var\(--space-4\)\);/,
    );
    expect((tokenPx("--tabbar-map-size") + tokenPx("--space-4")) / 16).toBe(TAB_MAP_CELL_EM);
  });

  it("배치 C의 칸 나누기: 홀수면 남는 칸을 오른쪽에 둔다(칸이 늘어도 앞 칸 자리가 그대로)", () => {
    expect(splitCenterTabs(["home", "units", "economy", "faction"])).toEqual({
      left: ["home", "units"],
      right: ["economy", "faction"],
    });
    expect(splitCenterTabs(["home", "units", "economy", "faction", "inventory"])).toEqual({
      left: ["home", "units"],
      right: ["economy", "faction", "inventory"],
    });
    expect(splitCenterTabs([])).toEqual({ left: [], right: [] });
  });

  it("플랫 48px 하단 탭은 위로 솟지 않고, 본문 아래 스크롤 여백·새 버전 배너는 탭과 채팅바 높이(--chatbar-offset)를 함께 비운다", () => {
    expect(ruleBody(tabbarCss, ".tab-map-button")).not.toContain("margin-top");
    for (const selector of [
      ":where(:root[data-tabbar] .frame-main *)",
      ":root[data-tabbar] .update-banner",
    ]) {
      const body = ruleBody(shellCss, selector);
      expect(body, selector).toContain("var(--tabbar-h)");
      expect(body, selector).toContain("var(--chatbar-offset)");
    }
    // 문서 뿌리의 scroll-padding은 두지 않는다(sticky 위 띠·레일 단추에 초점이 가면 문서가 튄다)
    expect(shellCss.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/scroll-padding/);
  });

  it("JS가 듣는 칸 수 미디어 쿼리는 계단과 같은 em 값이다", () => {
    expect(TAB_SLOT_QUERIES).toEqual({
      a: [
        { query: "(min-width: 20.25em)", slots: 5 },
        { query: "(min-width: 23.625em)", slots: 6 },
      ],
      c: [{ query: "(min-width: 23.75em)", slots: 5 }],
    });
  });
});
