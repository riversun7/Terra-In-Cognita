// 디자인 값 검사 — 순수 함수(시험: design-tokens.test.mjs). 파일 읽기는 check-contrast.mjs가 한다.
// ADR 2026-10-28-design-system "검사":
// - 테마마다 본문·흐린 글자·버튼 글자·상태색은 4.5:1 이상, 선명 테마 본문은 7:1 이상, 초점 표시와 입력칸 테두리는 3:1 이상.
// - 화면 CSS는 var(--…)만 쓴다: 색·px 값은 토큰 파일(styles/tokens.css)에만 둔다.
// 대비 계산은 WCAG 2.x 상대 휘도(조사 원본의 contrast.mjs와 같은 식).

export const THEMES = ["pastel", "dark", "contrast", "station"];

/** 주석과 @media 블록을 지운다(@media 안 규칙은 기기 설정에 따라 바뀌는 값이라 대비 계산에 넣지 않는다) */
function stripCss(css) {
  let text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  // 한 단계 중첩만 다룬다: @media (…) { 규칙 { … } … }
  text = text.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
  return text;
}

/** CSS 규칙 목록: { selectors: string[], declarations: [이름, 값][] } */
export function parseRules(css) {
  const rules = [];
  for (const match of stripCss(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1]
      .split(",")
      .map((s) => s.trim().replace(/\s+/g, " "))
      .filter(Boolean);
    const declarations = [];
    for (const part of match[2].split(";")) {
      const index = part.indexOf(":");
      if (index < 0) continue;
      const name = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      if (name) declarations.push([name, value.replace(/\s+/g, " ")]);
    }
    rules.push({ selectors, declarations });
  }
  return rules;
}

/**
 * 테마마다 계산된 토큰 값(브라우저와 같은 순서): `:root` 규칙 → `:root[data-theme="테마"]` 규칙(나중 것이 이긴다).
 * @returns {Record<string, Record<string, string>>} 테마 → 토큰 이름(--…) → 값
 */
export function themeTokens(css) {
  const rules = parseRules(css);
  const result = {};
  for (const theme of THEMES) {
    const values = {};
    const themeSelector = `:root[data-theme="${theme}"]`;
    // 우선순위: 테마 선택자(0,2,0)가 :root(0,1,0)를 이긴다 → :root 규칙을 먼저 모두 넣고 테마 규칙을 덮는다
    for (const pass of [":root", themeSelector]) {
      for (const rule of rules) {
        if (!rule.selectors.includes(pass)) continue;
        for (const [name, value] of rule.declarations) {
          if (name.startsWith("--")) values[name] = value;
        }
      }
    }
    if (rules.some((rule) => rule.selectors.includes(themeSelector))) result[theme] = values;
  }
  return result;
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function channels(hex) {
  const full =
    hex.length === 4
      ? hex
          .slice(1)
          .split("")
          .map((c) => c + c)
          .join("")
      : hex.slice(1);
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16) / 255);
}

/** WCAG 2.x 상대 휘도 */
export function luminance(hex) {
  const [r, g, b] = channels(hex).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 대비 (1~21) */
export function contrastRatio(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].toSorted((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** 바탕 그라데이션의 색 멈춤점(#hex). 글자가 바탕에 바로 올라갈 때 모든 점에서 읽혀야 한다 */
export function gradientStops(value) {
  return [...String(value ?? "").matchAll(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi)].map((m) => m[0]);
}

/** 글자가 놓이는 바탕: 화면 바탕, 판, 둘째 판(버튼·칩), 입력칸(입력한 글자·자리 표시 글자) */
const TEXT_BACKGROUNDS = ["--color-bg", "--color-surface", "--color-surface-2", "--color-field-bg"];

/**
 * 잴 쌍. kind: text(글자 4.5, 선명 테마 본문은 7), ui(초점·입력칸 테두리 3)
 * 상태색은 바탕·판·자기 알림 상자 바탕(--color-*-surface) 위에서 잰다.
 */
export const CONTRAST_PAIRS = [
  ...TEXT_BACKGROUNDS.map((bg) => ({ fg: "--color-text", bg, kind: "body" })),
  ...TEXT_BACKGROUNDS.map((bg) => ({ fg: "--color-text-muted", bg, kind: "text" })),
  { fg: "--color-on-primary", bg: "--color-primary", kind: "text" },
  ...["success", "warning", "danger"].flatMap((status) =>
    ["--color-bg", "--color-surface", `--color-${status}-surface`].map((bg) => ({
      fg: `--color-${status}`,
      bg,
      kind: "text",
    })),
  ),
  { fg: "--color-focus", bg: "--color-bg", kind: "ui" },
  { fg: "--color-focus", bg: "--color-surface", kind: "ui" },
  // 고른 라디오 점(초점 색)은 입력칸 바탕 위에 그린다
  { fg: "--color-focus", bg: "--color-field-bg", kind: "ui" },
  // 입력칸(고르기 포함)은 판 위에도, 바탕에 바로도 놓인다
  { fg: "--color-field-border", bg: "--color-field-bg", kind: "ui" },
  { fg: "--color-field-border", bg: "--color-surface", kind: "ui" },
  { fg: "--color-field-border", bg: "--color-bg", kind: "ui" },
  // 꺼진 스위치의 손잡이(입력칸 테두리 색)는 스위치 바탕(둘째 판 색) 위에 있다
  { fg: "--color-field-border", bg: "--color-surface-2", kind: "ui" },
  // 잘못 입력한 칸의 테두리
  { fg: "--color-danger", bg: "--color-field-bg", kind: "ui" },
];

/** 테마와 쌍 종류별 최소 대비 */
export function minimumRatio(theme, kind) {
  if (kind === "ui") return 3;
  if (kind === "body" && theme === "contrast") return 7;
  return 4.5;
}

/**
 * 테마마다 대비를 잰다.
 * @returns {{ rows: { theme: string, pair: string, ratio: number, min: number, pass: boolean }[], problems: string[] }}
 */
export function checkContrast(tokensByTheme) {
  const rows = [];
  const problems = [];
  for (const theme of THEMES) {
    const tokens = tokensByTheme[theme];
    if (!tokens) {
      problems.push(`${theme} 테마가 없습니다(:root[data-theme="${theme}"]).`);
      continue;
    }
    const measure = (fgName, fgValue, bgName, bgValue, kind) => {
      const min = minimumRatio(theme, kind);
      if (!HEX.test(fgValue ?? "") || !HEX.test(bgValue ?? "")) {
        problems.push(`${theme}: ${fgName} / ${bgName} — #rrggbb 색이 아닙니다(${fgValue} / ${bgValue}).`);
        return;
      }
      const ratio = contrastRatio(fgValue, bgValue);
      const pass = ratio >= min;
      rows.push({ theme, pair: `${fgName} / ${bgName}`, fg: fgValue, bg: bgValue, ratio, min, pass });
      if (!pass) {
        problems.push(
          `${theme}: ${fgName}(${fgValue}) / ${bgName}(${bgValue}) 대비 ${ratio.toFixed(2)} < ${min}`,
        );
      }
    };
    for (const { fg, bg, kind } of CONTRAST_PAIRS) measure(fg, tokens[fg], bg, tokens[bg], kind);
    // 바탕 그라데이션 위의 글자, 입력칸 테두리, 초점 표시(설정 화면의 카드·스위치 줄은 바탕에 바로 놓인다)
    for (const stop of gradientStops(tokens["--color-bg-image"])) {
      const name = `--color-bg-image ${stop}`;
      measure("--color-text", tokens["--color-text"], name, stop, "body");
      measure("--color-text-muted", tokens["--color-text-muted"], name, stop, "text");
      measure("--color-field-border", tokens["--color-field-border"], name, stop, "ui");
      measure("--color-focus", tokens["--color-focus"], name, stop, "ui");
    }
  }
  return { rows, problems };
}

/** 화면 CSS에서 쓰면 안 되는 값: 색(#hex, rgb() 등, 흔한 색 이름)과 px 길이(0 제외) */
const RAW_COLOR =
  /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(|\b(?:white|black|red|green|blue|yellow|orange|purple|pink|gray|grey|silver)\b/i;
const RAW_PX = /(?<![\w.-])(?!0px\b)\d*\.?\d+px\b/;

/**
 * 화면 CSS의 선언 값에 직접 쓴 색·px 값. 토큰 선언(--이름: …)은 보지 않는다.
 * @returns {{ line: number, text: string }[]}
 */
export function findRawValues(css) {
  const found = [];
  const lines = css.split("\n");
  let inComment = false;
  lines.forEach((original, index) => {
    // 줄 안의 주석을 지운다(여러 줄 주석 포함)
    let line = "";
    let rest = original;
    while (rest.length > 0) {
      if (inComment) {
        const end = rest.indexOf("*/");
        if (end < 0) {
          rest = "";
          continue;
        }
        inComment = false;
        rest = rest.slice(end + 2);
        continue;
      }
      const start = rest.indexOf("/*");
      if (start < 0) {
        line += rest;
        rest = "";
        continue;
      }
      line += rest.slice(0, start);
      inComment = true;
      rest = rest.slice(start + 2);
    }
    // 선언(이름: 값)만 본다. 선택자·@규칙 줄은 넘어간다
    const declaration = /^\s*([a-z-]+)\s*:\s*(.+?);?\s*$/i.exec(line);
    if (!declaration || declaration[1].startsWith("--")) return;
    const value = declaration[2].replace(/url\([^)]*\)/g, "");
    if (RAW_COLOR.test(value) || RAW_PX.test(value)) found.push({ line: index + 1, text: original.trim() });
  });
  return found;
}
