// 폭 경계 시험 — 화면 틀 CSS(shell.css·tabbar.css)와 복귀 요약 겹침(summary/summary.css)의 미디어 쿼리 숫자와
// layout.ts의 값이 같다(ADR 2026-10-29-app-shell 3절),
// 하단 탭 칸 수(D-265)·배치 C의 칸 나누기, C 지도 버튼이 솟는 만큼 비우는 여백
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

/** 칸 수만큼 놓을 때 가장 좁은 칸이 TAB_CELL_MIN_EM이 되는 폭(em). A는 칸 + ☰가 같은 너비, C는 지도가 가운데라 양쪽이 같다 */
function narrowestNeed(layout: NavLayout, slots: number): number {
  return layout === "a"
    ? (slots + 1) * TAB_CELL_MIN_EM
    : 2 * Math.ceil(slots / 2) * TAB_CELL_MIN_EM + TAB_MAP_CELL_EM;
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

describe("하단 탭 칸 수(D-265: 좁은 휴대폰은 4칸, 넓으면 더)", () => {
  it("휴대폰 세로 폭(320~440px): C 4칸, A는 432px부터 5칸. 중간·넓음은 하단 탭 없음", () => {
    for (const width of [320, 360, 375, 390, 393, 412, 414, 428, 430, 431]) {
      expect(tabSlotsForWidth(px(width), "c"), `C ${width}px`).toBe(4);
      expect(tabSlotsForWidth(px(width), "a"), `A ${width}px`).toBe(4);
    }
    expect(tabSlotsForWidth(px(432), "a")).toBe(5);
    expect(tabSlotsForWidth(px(440), "a")).toBe(5);
    expect(tabSlotsForWidth(px(504), "a")).toBe(6);
    expect(tabSlotsForWidth(px(575), "a")).toBe(6);
    // 인벤토리를 더해(2026-11-14) 576px(36em)부터 7칸
    expect(tabSlotsForWidth(px(576), "a")).toBe(7);
    expect(tabSlotsForWidth(px(599), "a")).toBe(7);
    // C: 지도를 가운데 둔 채 5칸(오른쪽 3칸)이 들어가는 508px부터
    expect(tabSlotsForWidth(px(440), "c")).toBe(4);
    expect(tabSlotsForWidth(px(507), "c")).toBe(4);
    expect(tabSlotsForWidth(px(508), "c")).toBe(5);
    expect(tabSlotsForWidth(px(511), "c")).toBe(5);
    // 인벤토리를 더해(2026-11-14) 512px(32em)부터 6칸(양쪽 3칸)
    expect(tabSlotsForWidth(px(512), "c")).toBe(6);
    expect(tabSlotsForWidth(px(599), "c")).toBe(6);
    for (const layout of NAV_LAYOUTS) {
      for (const width of [600, 844, 1440]) {
        expect(tabSlotsForWidth(px(width), layout), `${layout} ${width}px`).toBe(0);
      }
    }
  });

  it("계단 시작 폭에서 가장 좁은 칸이 4.5em 이상이다(A: 모든 칸이 같다, C: 지도 가운데 + 많은 쪽 칸)", () => {
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
        // 계단은 넓어질수록 한 칸씩 는다. 마지막 계단도 중간 단계보다 좁다
        expect(step.minEm).toBeGreaterThan(before.minEm);
        expect(step.slots).toBe(before.slots + 1);
        expect(step.minEm).toBeLessThan(MEDIUM_MIN_EM);
      }
    }
    // 마지막 계단 = 놓을 수 있는 항목 수(A 6개, C는 가운데 지도를 뺀 5개)
    expect(TAB_SLOT_STEPS.a[TAB_SLOT_STEPS.a.length - 1]?.slots).toBe(NAV_ITEM_IDS.length);
    expect(TAB_SLOT_STEPS.c[TAB_SLOT_STEPS.c.length - 1]?.slots).toBe(NAV_ITEM_IDS.length - 1);
  });

  it("C의 지도 칸 너비(em)는 tokens.css·tabbar.css 값과 같다", () => {
    // 빈 문자열이면 CSS를 읽지 못한 것이다(vitest.config.ts test.css.include)
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
    expect(splitCenterTabs(["home", "units", "economy", "faction", "cyborg"])).toEqual({
      left: ["home", "units"],
      right: ["economy", "faction", "cyborg"],
    });
    expect(splitCenterTabs([])).toEqual({ left: [], right: [] });
  });

  it("배치 C는 지도 버튼이 띠 위로 솟는 높이(음수 위 여백 --space-6)만큼 본문 아래 스크롤 여백·새 버전 배너를 더 띄운다", () => {
    expect(ruleBody(tabbarCss, ".tab-map-button")).toContain("margin-top: calc(var(--space-6) * -1);");
    for (const selector of [
      ':where(:root[data-tabbar="c"] .frame-main *)',
      ':root[data-tabbar="c"] .update-banner',
    ]) {
      expect(ruleBody(shellCss, selector), selector).toContain("var(--tabbar-h) + var(--space-6)");
    }
    // A(솟는 것 없음)는 하단 탭 높이만
    for (const selector of [
      ":where(:root[data-tabbar] .frame-main *)",
      ":root[data-tabbar] .update-banner",
    ]) {
      const body = ruleBody(shellCss, selector);
      expect(body, selector).toContain("var(--tabbar-h)");
      expect(body, selector).not.toContain("--space-6");
    }
    // 문서 뿌리의 scroll-padding은 두지 않는다(sticky 위 띠·레일 단추에 초점이 가면 문서가 튄다)
    expect(shellCss.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/scroll-padding/);
  });

  it("JS가 듣는 칸 수 미디어 쿼리는 계단과 같은 em 값이다", () => {
    expect(TAB_SLOT_QUERIES).toEqual({
      a: [
        { query: "(min-width: 27em)", slots: 5 },
        { query: "(min-width: 31.5em)", slots: 6 },
        { query: "(min-width: 36em)", slots: 7 },
      ],
      c: [
        { query: "(min-width: 31.75em)", slots: 5 },
        { query: "(min-width: 32em)", slots: 6 },
      ],
    });
  });
});
