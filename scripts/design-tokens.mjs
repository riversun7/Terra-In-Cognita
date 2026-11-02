// 디자인 값 검사 — 순수 함수(시험: design-tokens.test.mjs). 파일 읽기는 check-contrast.mjs가 한다.
// ADR 2026-10-28-design-system "검사":
// - 테마마다 본문·흐린 글자·버튼 글자·상태색은 4.5:1 이상, 선명 테마 본문은 7:1 이상, 초점 표시와 입력칸 테두리는 3:1 이상.
// - 화면 CSS는 var(--…)만 쓴다: 색·px 값은 토큰 파일(styles/tokens.css)에만 둔다.
// 대비 계산은 WCAG 2.x 상대 휘도(조사 원본의 contrast.mjs와 같은 식).

export const THEMES = ["pastel", "dark", "contrast", "station"];

/**
 * 개발 화면 층의 테마 둘(ADR 2026-11-02-dev-ui): 개발·관리자 화면은 게임 테마와 상관없이 이 값을 쓴다.
 * 테마 → 차례로 덮는 선택자(앞 것을 뒤 것이 이긴다. :root 규칙은 그 앞에 늘 먼저 넣는다)
 */
export const DEV_THEMES = {
  "dev-neon": [':root[data-surface="dev"]'],
  "dev-light": [':root[data-surface="dev"]', ':root[data-surface="dev"][data-dev-theme="light"]'],
};

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
  for (const [theme, chain] of Object.entries(DEV_THEMES)) {
    const values = {};
    for (const pass of [":root", ...chain]) {
      for (const rule of rules) {
        if (!rule.selectors.includes(pass)) continue;
        for (const [name, value] of rule.declarations) {
          if (name.startsWith("--")) values[name] = value;
        }
      }
    }
    const last = chain.at(-1);
    if (rules.some((rule) => rule.selectors.includes(last))) result[theme] = values;
  }
  return result;
}

/**
 * 개발 화면 층이 게임 테마의 색을 빠짐없이 다시 정했는지: 게임 테마 블록(정거장)에 있는 색·그림자 토큰(--color-*, --shadow-*)이
 * 개발 테마마다 개발 화면 층 블록에 있어야 한다. 없으면 그 값은 지금 고른 게임 테마에서 새어 든다(대비를 잴 수 없다).
 * @returns {string[]} 문제 목록
 */
export function devThemeGaps(css) {
  const rules = parseRules(css);
  const own = (selector) =>
    new Set(
      rules
        .filter((rule) => rule.selectors.includes(selector))
        .flatMap((rule) => rule.declarations.map(([name]) => name)),
    );
  const game = [...own(':root[data-theme="station"]')].filter((name) => /^--(color|shadow)-/.test(name));
  const problems = [];
  for (const [theme, chain] of Object.entries(DEV_THEMES)) {
    const defined = new Set(chain.flatMap((selector) => [...own(selector)]));
    // 라이트는 네온 블록을 물려받지 않게 자기 블록에도 색을 모두 둔다(네온 값이 라이트에 새지 않게)
    const last = own(chain.at(-1));
    for (const name of game) {
      if (!defined.has(name) || !last.has(name)) {
        problems.push(
          `${theme}: ${name}이(가) 개발 화면 층 블록(${chain.at(-1)})에 없습니다(게임 테마 값이 새어 듭니다).`,
        );
      }
    }
  }
  return problems;
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
  // 둘째 판(--color-surface-2) 위의 상태색: 홈의 부관 말풍선·처리할 일 분류 이름(apps/game/src/home/todo.css)
  ...["success", "warning", "danger"].flatMap((status) =>
    ["--color-bg", "--color-surface", "--color-surface-2", `--color-${status}-surface`].map((bg) => ({
      fg: `--color-${status}`,
      bg,
      kind: "text",
    })),
  ),
  // 시세 파랑(한국식 내림·매도, D-442): 경제 화면의 판·둘째 판·바탕 위 글자(호가·체결·오르내림)
  ...["--color-bg", "--color-surface", "--color-surface-2"].map((bg) => ({
    fg: "--color-market-blue",
    bg,
    kind: "text",
  })),
  // 스탯 색(ADR 2026-11-01-ui-visibility): 스탯 약자·값 글자가 판·둘째 판(스탯 묶음 칸)·바탕 위에 놓인다
  ...["str", "vit", "int", "wis", "dex", "agi"].flatMap((stat) =>
    ["--color-bg", "--color-surface", "--color-surface-2"].map((bg) => ({
      fg: `--color-stat-${stat}`,
      bg,
      kind: "text",
    })),
  ),
  // 2차 스탯 색(사이보그 화면 상세 전투 스펙의 값·아이콘·막대): 판·둘째 판·바탕 위 글자
  ...[
    "hp",
    "armor-hp",
    "shield-hp",
    "shield-regen",
    "mp",
    "mp-regen",
    "stamina",
    "stamina-regen",
    "physical-attack",
    "elemental-attack",
    "hit",
    "crit-chance",
    "crit-multiplier",
    "defense-rate",
    "elemental-defense-rate",
    "evade",
    "action-speed",
    "sight",
    "other",
  ].flatMap((row) =>
    ["--color-bg", "--color-surface", "--color-surface-2"].map((bg) => ({
      fg: `--color-sec-${row}`,
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

/** 개발 화면 층에서만 재는 쌍: 표 머리·줄무늬·올림·고른 줄 바탕 위의 글자, 코드·ID 글자색(ADR 2026-11-02-dev-ui) */
const DEV_ROW_BACKGROUNDS = ["--dev-head-bg", "--dev-row-alt", "--dev-row-hover", "--dev-row-selected"];
export const DEV_CONTRAST_PAIRS = [
  ...DEV_ROW_BACKGROUNDS.map((bg) => ({ fg: "--color-text", bg, kind: "body" })),
  ...DEV_ROW_BACKGROUNDS.map((bg) => ({ fg: "--color-text-muted", bg, kind: "text" })),
  ...["--color-bg", "--color-surface", "--color-surface-2", "--color-field-bg", ...DEV_ROW_BACKGROUNDS].map(
    (bg) => ({ fg: "--dev-code", bg, kind: "text" }),
  ),
  // 상태색 글자(바뀐 칸·경고)가 줄무늬·고른 줄 위에 놓인다
  ...["success", "warning", "danger"].flatMap((status) =>
    DEV_ROW_BACKGROUNDS.map((bg) => ({ fg: `--color-${status}`, bg, kind: "text" })),
  ),
  { fg: "--color-focus", bg: "--dev-row-alt", kind: "ui" },
  { fg: "--color-focus", bg: "--color-surface-2", kind: "ui" },
  { fg: "--color-field-border", bg: "--dev-row-alt", kind: "ui" },
  { fg: "--color-field-border", bg: "--dev-row-selected", kind: "ui" },
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
  for (const theme of [...THEMES, ...Object.keys(DEV_THEMES)]) {
    const tokens = tokensByTheme[theme];
    const dev = Object.hasOwn(DEV_THEMES, theme);
    if (!tokens) {
      problems.push(
        dev
          ? `${theme} 개발 화면 테마가 없습니다(${DEV_THEMES[theme].at(-1)}).`
          : `${theme} 테마가 없습니다(:root[data-theme="${theme}"]).`,
      );
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
    for (const { fg, bg, kind } of dev ? [...CONTRAST_PAIRS, ...DEV_CONTRAST_PAIRS] : CONTRAST_PAIRS) {
      measure(fg, tokens[fg], bg, tokens[bg], kind);
    }
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
