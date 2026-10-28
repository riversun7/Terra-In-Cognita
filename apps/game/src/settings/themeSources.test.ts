// 테마 값이 여러 곳에 있어서 서로 같은지 본다(ADR 2026-10-28-design-system):
// - public/theme-init.js(첫 화면 전, 빌드하지 않는 스크립트) ↔ settings/theme.ts·storage.ts(실행 중 규칙·저장 모양)
// - 테마별 바탕색: theme.ts THEME_COLORS ↔ styles/tokens.css --color-bg ↔ index.html theme-color·vite.config.ts THEME_COLOR(기본 테마)
// - 언어 목록: @terra/shared LOCALES ↔ Paraglide 설정(project.inlang/settings.json)
import { DEFAULT_THEME, LOCALES, THEMES, type Theme } from "@terra/shared";
import { describe, expect, it } from "vitest";
import indexHtml from "../../index.html?raw";
import inlangSettings from "../../project.inlang/settings.json";
import themeInitSource from "../../public/theme-init.js?raw";
import viteConfigSource from "../../vite.config.ts?raw";
import tokensCss from "../styles/tokens.css?raw";
import {
  EMPTY_DEVICE_SETTINGS,
  SETTINGS_STORAGE_KEY,
  parseDeviceSettings,
  serializeDeviceSettings,
} from "./storage.ts";
import { CONTRAST_QUERY, DARK_QUERY, type DevicePreferences, THEME_COLORS, resolveTheme } from "./theme.ts";

interface InitRun {
  /** 저장소 값 */
  stored: string | null;
  device: DevicePreferences;
  /** 저장소를 읽을 때 예외(사파리 개인 정보 보호 모드·차단된 저장소) */
  storageBlocked?: boolean;
}

/** theme-init.js를 가짜 window·document로 돌려 정한 테마와 주소창 색을 돌려준다 */
function runThemeInit({ stored, device, storageBlocked = false }: InitRun): {
  theme: string | undefined;
  color: string | undefined;
} {
  const attributes = new Map<string, string>();
  let color: string | undefined;
  const fakeWindow = {
    localStorage: {
      getItem(key: string): string | null {
        if (storageBlocked) throw new Error("SecurityError");
        return key === SETTINGS_STORAGE_KEY ? stored : null;
      },
    },
    matchMedia: (query: string) => ({
      matches: (query === CONTRAST_QUERY && device.contrastMore) || (query === DARK_QUERY && device.dark),
    }),
  };
  const meta = {
    setAttribute(name: string, value: string): void {
      if (name === "content") color = value;
    },
  };
  const fakeDocument = {
    documentElement: {
      setAttribute(name: string, value: string): void {
        attributes.set(name, value);
      },
    },
    querySelector: (selector: string) => (selector === 'meta[name="theme-color"]' ? meta : null),
  };
  // 빌드하지 않는 브라우저 스크립트를 가짜 window·document로 그대로 실행한다(시험 전용, 파일 내용은 저장소의 것)
  // oxlint-disable-next-line typescript/no-implied-eval
  const run = new Function("window", "document", themeInitSource);
  Reflect.apply(run, undefined, [fakeWindow, fakeDocument]);
  return { theme: attributes.get("data-theme"), color };
}

const DEVICES: DevicePreferences[] = [
  { contrastMore: false, dark: false },
  { contrastMore: false, dark: true },
  { contrastMore: true, dark: false },
  { contrastMore: true, dark: true },
];

const stored = (theme: Theme | null, followSystem: boolean) =>
  serializeDeviceSettings({ ...EMPTY_DEVICE_SETTINGS, theme, followSystem });

const STORED_VALUES: (string | null)[] = [
  null,
  "{broken json",
  JSON.stringify({ v: 2, theme: "dark" }),
  JSON.stringify({ v: 1, theme: "aurora", followSystem: false }),
  JSON.stringify({ v: 1, theme: ["dark"], followSystem: "yes" }),
  JSON.stringify({ v: 1, theme: "__proto__" }),
  ...THEMES.flatMap((theme) => [stored(theme, false), stored(theme, true)]),
  stored(null, true),
];

describe("theme-init.js ↔ 실행 중 규칙", () => {
  it("저장 값·기기 설정의 모든 조합에서 theme.ts와 같은 테마, 그 테마의 주소창 색", () => {
    for (const value of STORED_VALUES) {
      for (const device of DEVICES) {
        const expected = resolveTheme(parseDeviceSettings(value), device);
        expect(runThemeInit({ stored: value, device }), `${value} ${JSON.stringify(device)}`).toEqual({
          theme: expected,
          color: THEME_COLORS[expected],
        });
      }
    }
  });

  it("저장소를 못 읽으면 정하지 않은 것으로 본다", () => {
    const blocked = { stored: stored("dark", false), storageBlocked: true };
    expect(runThemeInit({ ...blocked, device: { contrastMore: false, dark: true } }).theme).toBe("pastel");
    expect(runThemeInit({ ...blocked, device: { contrastMore: true, dark: false } }).theme).toBe("contrast");
  });
});

/** tokens.css에서 :root[data-theme="테마"] 규칙의 --color-bg */
function cssBackground(theme: Theme): string | undefined {
  const css = tokensCss.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = (rule[1] ?? "").split(",").map((selector) => selector.trim());
    if (!selectors.includes(`:root[data-theme="${theme}"]`)) continue;
    const found = /--color-bg:\s*(#[0-9a-f]{6})\s*;/i.exec(rule[2] ?? "");
    if (found) return found[1]?.toLowerCase();
  }
  return undefined;
}

describe("테마별 바탕색", () => {
  it("THEME_COLORS는 테마 목록과 같고, tokens.css의 --color-bg와 같다", () => {
    expect(Object.keys(THEME_COLORS)).toEqual([...THEMES]);
    for (const theme of THEMES) expect(cssBackground(theme), theme).toBe(THEME_COLORS[theme]);
  });

  it("미리 보기([data-theme-preview])는 같은 규칙에 함께 적혀 있다", () => {
    for (const theme of THEMES) {
      expect(tokensCss).toMatch(
        new RegExp(`:root\\[data-theme="${theme}"\\],\\s*\\[data-theme-preview="${theme}"\\]`),
      );
    }
  });

  it("index.html의 기본 theme-color와 vite.config.ts THEME_COLOR(manifest)는 기본 테마의 바탕색", () => {
    expect(/<meta name="theme-color" content="(#[0-9a-f]{6})"/i.exec(indexHtml)?.[1]).toBe(
      THEME_COLORS[DEFAULT_THEME],
    );
    expect(/const THEME_COLOR = "(#[0-9a-f]{6})"/i.exec(viteConfigSource)?.[1]).toBe(
      THEME_COLORS[DEFAULT_THEME],
    );
  });

  it("index.html: theme-init.js는 theme-color 다음, 모듈 스크립트 앞(<head>)에서 읽는다(인라인 아님)", () => {
    const head = indexHtml.slice(0, indexHtml.indexOf("</head>"));
    const meta = head.indexOf('name="theme-color"');
    const script = head.indexOf('<script src="/theme-init.js"></script>');
    expect(meta).toBeGreaterThan(-1);
    expect(script).toBeGreaterThan(meta);
    expect(indexHtml.indexOf('type="module"')).toBeGreaterThan(script);
    // <script>…</script> 사이에 코드를 넣지 않는다
    expect(indexHtml).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>\s*\S/);
  });
});

describe("언어 목록", () => {
  it("@terra/shared LOCALES는 Paraglide 설정의 언어와 같다(기본 언어가 맨 앞)", () => {
    expect([...LOCALES]).toEqual(inlangSettings.locales);
    expect(LOCALES[0]).toBe(inlangSettings.baseLocale);
  });
});
