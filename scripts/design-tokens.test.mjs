// 디자인 값 검사 시험 — 실제 토큰 파일과 같은 모양의 작은 CSS로 대비 계산·테마 값 모으기·직접 쓴 값 찾기를 본다
import { describe, expect, it } from "vitest";
import {
  CONTRAST_PAIRS,
  DEV_CONTRAST_PAIRS,
  checkContrast,
  devThemeGaps,
  contrastRatio,
  findRawValues,
  gradientStops,
  minimumRatio,
  themeTokens,
} from "./design-tokens.mjs";

/** 모든 쌍을 넉넉히 통과하는 테마 색(짙은 글자, 흰 바탕) */
const GOOD = {
  "--color-bg": "#ffffff",
  "--color-surface": "#ffffff",
  "--color-surface-2": "#f4f4f4",
  "--color-text": "#111111",
  "--color-text-muted": "#444444",
  "--color-primary": "#0b4fb3",
  "--color-on-primary": "#ffffff",
  "--color-success": "#0b5a1e",
  "--color-success-surface": "#ffffff",
  "--color-warning": "#6a3b00",
  "--color-warning-surface": "#ffffff",
  "--color-danger": "#9a1c00",
  "--color-danger-surface": "#ffffff",
  "--color-market-blue": "#1a4aa6",
  "--color-focus": "#1f4fd0",
  "--color-field-bg": "#ffffff",
  "--color-field-border": "#555555",
  "--color-stat-str": "#9a1030",
  "--color-stat-vit": "#8a3000",
  "--color-stat-int": "#0b4fb3",
  "--color-stat-wis": "#5a1fb0",
  "--color-stat-dex": "#6a4200",
  "--color-stat-agi": "#0e5a28",
  "--color-sec-hp": "#3a3a3a",
  "--color-sec-armor-hp": "#3a3a3a",
  "--color-sec-shield-hp": "#3a3a3a",
  "--color-sec-shield-regen": "#3a3a3a",
  "--color-sec-mp": "#3a3a3a",
  "--color-sec-mp-regen": "#3a3a3a",
  "--color-sec-stamina": "#3a3a3a",
  "--color-sec-stamina-regen": "#3a3a3a",
  "--color-sec-physical-attack": "#3a3a3a",
  "--color-sec-elemental-attack": "#3a3a3a",
  "--color-sec-hit": "#3a3a3a",
  "--color-sec-crit-chance": "#3a3a3a",
  "--color-sec-crit-multiplier": "#3a3a3a",
  "--color-sec-defense-rate": "#3a3a3a",
  "--color-sec-elemental-defense-rate": "#3a3a3a",
  "--color-sec-evade": "#3a3a3a",
  "--color-sec-action-speed": "#3a3a3a",
  "--color-sec-sight": "#3a3a3a",
  "--color-sec-other": "#3a3a3a",
};

const block = (selector, tokens) =>
  `${selector} {\n${Object.entries(tokens)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join("\n")}\n}\n`;

/** 개발 화면 층에만 있는 바탕·글자 값(표 머리·줄무늬·올림·고른 줄, 코드 글자) */
const DEV_GOOD = {
  "--dev-head-bg": "#f0f0f0",
  "--dev-row-alt": "#f8f8f8",
  "--dev-row-hover": "#eeeeee",
  "--dev-row-selected": "#e8eef8",
  "--dev-code": "#0b3f7a",
};

function tokensCss(overrides = {}) {
  return [
    block(":root", { "--space-1": "4px" }),
    block(':root,\n:root[data-theme="pastel"],\n[data-theme-preview="pastel"]', GOOD),
    block(':root[data-theme="dark"]', { ...GOOD, ...overrides.dark }),
    block(':root[data-theme="contrast"]', { ...GOOD, ...overrides.contrast }),
    block(':root[data-theme="station"]', { ...GOOD, ...overrides.station }),
    block(':root[data-surface="dev"],\n:root[data-surface="dev"] [data-density="compact"]', {
      "--space-1": "2px",
    }),
    block(':root[data-surface="dev"]', { ...GOOD, ...DEV_GOOD, ...overrides.devNeon }),
    block(':root[data-surface="dev"][data-dev-theme="light"]', {
      ...GOOD,
      ...DEV_GOOD,
      ...overrides.devLight,
    }),
    "@media (prefers-reduced-motion: reduce) {\n  :root {\n    --color-text: #eeeeee;\n  }\n}\n",
  ].join("\n");
}

describe("대비 계산(WCAG 2.x)", () => {
  it("검정/흰색 21:1, 같은 색 1:1, 짧은 #rgb", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBe(1);
  });

  it("조사 원본(후보 A)과 같은 값", () => {
    expect(contrastRatio("#22324a", "#dff2fb").toFixed(2)).toBe("11.23");
    expect(contrastRatio("#14361b", "#8ed97f").toFixed(2)).toBe("7.87");
    expect(contrastRatio("#6f8aa0", "#f7fbff").toFixed(2)).toBe("3.47");
  });

  it("최소 대비: 글자 4.5, 선명 테마 본문 7, 초점·테두리 3", () => {
    expect(minimumRatio("pastel", "body")).toBe(4.5);
    expect(minimumRatio("contrast", "body")).toBe(7);
    expect(minimumRatio("contrast", "text")).toBe(4.5);
    expect(minimumRatio("dark", "ui")).toBe(3);
  });

  it("그라데이션의 색 멈춤점", () => {
    expect(gradientStops("linear-gradient(180deg, #dff2fb 0%, #e6f6f1 58%, #fff 100%)")).toEqual([
      "#dff2fb",
      "#e6f6f1",
      "#fff",
    ]);
    expect(gradientStops("none")).toEqual([]);
  });
});

describe("테마 값 모으기", () => {
  it(":root 기본값 위에 테마 값을 덮는다. @media 안 값은 넣지 않는다", () => {
    const themes = themeTokens(tokensCss({ dark: { "--color-text": "#fafafa", "--color-bg": "#101010" } }));
    expect(Object.keys(themes)).toEqual(["pastel", "dark", "contrast", "station", "dev-neon", "dev-light"]);
    expect(themes.pastel["--color-text"]).toBe("#111111");
    expect(themes.dark["--color-text"]).toBe("#fafafa");
    // 테마가 적지 않은 값은 :root(파스텔) 값을 물려받는다
    expect(themes.dark["--space-1"]).toBe("4px");
  });

  it("개발 화면 층: :root → 네온 블록 → (라이트) 라이트 블록 차례로 덮는다", () => {
    const themes = themeTokens(
      tokensCss({ devNeon: { "--color-bg": "#fcfcfc" }, devLight: { "--color-text": "#202020" } }),
    );
    expect(themes["dev-neon"]["--space-1"]).toBe("2px");
    expect(themes["dev-neon"]["--color-bg"]).toBe("#fcfcfc");
    expect(themes["dev-light"]["--color-bg"]).toBe("#ffffff");
    expect(themes["dev-light"]["--color-text"]).toBe("#202020");
    expect(themes["dev-neon"]["--dev-code"]).toBe("#0b3f7a");
  });
});

describe("checkContrast", () => {
  it("모두 통과하면 문제 없음", () => {
    const { rows, problems } = checkContrast(themeTokens(tokensCss()));
    expect(problems).toEqual([]);
    // 그라데이션이 없으면 테마마다 정한 쌍만 잰다. 개발 화면 테마 둘은 개발 전용 쌍을 더 잰다
    expect(rows).toHaveLength(
      4 * CONTRAST_PAIRS.length + 2 * (CONTRAST_PAIRS.length + DEV_CONTRAST_PAIRS.length),
    );
  });

  it("개발 화면 층: 줄무늬 위 흐린 글자·코드 글자가 4.5 미만이면 실패", () => {
    const { problems } = checkContrast(themeTokens(tokensCss({ devLight: { "--dev-code": "#9a9a9a" } })));
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.every((line) => line.startsWith("dev-light: --dev-code(#9a9a9a)"))).toBe(true);
  });

  it("흐린 글자 4.5 미만, 선명 본문 7 미만, 입력칸 테두리 3 미만이면 실패", () => {
    const { problems } = checkContrast(
      themeTokens(
        tokensCss({
          dark: { "--color-text-muted": "#8a8a8a" },
          contrast: { "--color-text": "#6b6b6b" },
          station: { "--color-field-border": "#bbbbbb" },
        }),
      ),
    );
    expect(problems).toEqual([
      expect.stringMatching(
        /^dark: --color-text-muted\(#8a8a8a\) \/ --color-bg\(#ffffff\) 대비 3\.\d\d < 4\.5$/,
      ),
      expect.stringContaining("dark: --color-text-muted(#8a8a8a) / --color-surface("),
      expect.stringContaining("dark: --color-text-muted(#8a8a8a) / --color-surface-2("),
      expect.stringContaining("dark: --color-text-muted(#8a8a8a) / --color-field-bg("),
      // 선명 테마는 본문만 7:1 — 4.5는 넘지만 7은 못 넘는 글자
      "contrast: --color-text(#6b6b6b) / --color-bg(#ffffff) 대비 5.33 < 7",
      expect.stringContaining("contrast: --color-text(#6b6b6b) / --color-surface("),
      expect.stringContaining("contrast: --color-text(#6b6b6b) / --color-surface-2("),
      expect.stringContaining("contrast: --color-text(#6b6b6b) / --color-field-bg("),
      expect.stringContaining("station: --color-field-border(#bbbbbb) / --color-field-bg("),
      expect.stringContaining("station: --color-field-border(#bbbbbb) / --color-surface("),
      expect.stringContaining("station: --color-field-border(#bbbbbb) / --color-bg("),
      expect.stringContaining("station: --color-field-border(#bbbbbb) / --color-surface-2("),
    ]);
  });

  it("바탕 그라데이션의 모든 점에서 글자·입력칸 테두리·초점 표시를 잰다", () => {
    const css = tokensCss({
      dark: { "--color-bg-image": "linear-gradient(180deg, #ffffff 0%, #9a9a9a 100%)" },
    });
    const { problems } = checkContrast(themeTokens(css));
    expect(problems).toEqual([
      expect.stringContaining("dark: --color-text-muted(#444444) / --color-bg-image #9a9a9a"),
      expect.stringContaining("dark: --color-field-border(#555555) / --color-bg-image #9a9a9a"),
      expect.stringContaining("dark: --color-focus(#1f4fd0) / --color-bg-image #9a9a9a"),
    ]);
  });

  it("테마가 빠졌거나 색이 #rrggbb가 아니면 실패", () => {
    const missing = tokensCss().replace(/:root\[data-theme="station"\]/, ':root[data-theme="other"]');
    expect(checkContrast(themeTokens(missing)).problems).toEqual([
      expect.stringContaining("station 테마가 없습니다"),
    ]);
    const named = checkContrast(themeTokens(tokensCss({ dark: { "--color-focus": "blue" } })));
    expect(named.problems).toEqual([
      expect.stringContaining("dark: --color-focus / --color-bg — #rrggbb 색이 아닙니다"),
      expect.stringContaining("dark: --color-focus / --color-surface — #rrggbb 색이 아닙니다"),
      expect.stringContaining("dark: --color-focus / --color-field-bg — #rrggbb 색이 아닙니다"),
    ]);
  });
});

describe("개발 화면 층의 색 빠짐", () => {
  it("게임 테마(정거장)의 색 토큰을 네온·라이트 블록이 모두 다시 정하면 문제 없음", () => {
    expect(devThemeGaps(tokensCss())).toEqual([]);
  });

  it("라이트 블록에 색이 빠지면(네온 값이 새어 듦) 그 토큰을 알린다", () => {
    const css = tokensCss().replace(
      /(:root\[data-surface="dev"\]\[data-dev-theme="light"\] \{[^}]*?)\n  --color-focus: [^;]+;/,
      "$1",
    );
    expect(devThemeGaps(css)).toEqual([expect.stringContaining("dev-light: --color-focus")]);
  });
});

describe("화면 CSS에 직접 쓴 값", () => {
  it("색(#hex, rgb(), 이름)과 px 길이를 찾는다", () => {
    const css = [
      ".a {",
      "  color: #fff;",
      "  background: rgb(0 0 0 / 50%);",
      "  border: 1px solid var(--color-border);",
      "  outline-color: white;",
      "  margin: 0px;",
      "  padding: 0 var(--space-2);",
      "  font-size: var(--font-size-md);",
      "  flex: 1 1 8em;",
      "}",
    ].join("\n");
    expect(findRawValues(css).map((found) => found.line)).toEqual([2, 3, 4, 5]);
  });

  it("토큰 선언·주석·선택자·url()은 보지 않는다", () => {
    const css = [
      "/* 예: #fff, 1px */",
      ".b > .white-card {",
      "  --local-size: 12px;",
      '  background: url("/img/white-1px.svg");',
      "  /* color: #000; */",
      "  color: var(--color-text); /* 2px */",
      "}",
      "@media (min-width: 600px) {",
      "  .c { gap: var(--space-4); }",
      "}",
    ].join("\n");
    expect(findRawValues(css)).toEqual([]);
  });
});
