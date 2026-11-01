// 게임 앱 빌드 설정
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import react from "@vitejs/plugin-react";
import { type Plugin, defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
// 휴대폰 브라우저는 manifest를 언어별로 바꾸지 못해서 앱 이름은 한국어(기본 언어)로 쓴다
import ko from "./messages/ko.json" with { type: "json" };

// 개발 중에는 서버(기본 4100)로 API와 WebSocket을 넘긴다
const devServerTarget = process.env.TERRA_SERVER_URL ?? "http://127.0.0.1:4100";

// 기본(파스텔) 테마의 바탕색 — manifest 색과 index.html의 theme-color가 같아야 한다(scripts/check-pwa.mjs가 확인).
// src/settings/theme.ts의 THEME_COLORS.pastel과도 같다(src/settings/themeSources.test.ts가 확인). ADR 2026-10-28-design-system
const THEME_COLOR = "#dff2fb";

/** 글꼴 파일 — CSS에 인라인하지 않는다(처음 쓸 때 받고, 서버가 /assets/를 1년 캐시한다) */
const FONT_FILE = /\.(woff2?|ttf|otf)$/i;
/** Fontsource 꾸러미의 CSS 파일 */
const FONTSOURCE_CSS = /[\\/]@fontsource[\\/][^\\/]+[\\/][^\\/?]+\.css(?:\?|$)/;
/** CSS의 WOFF 대체 주소: `, url(./files/x.woff) format('woff')` */
const WOFF_FALLBACK = /,\s*url\([^)]*\.woff\)\s*format\(["']woff["']\)/g;

/**
 * Fontsource(Jua) CSS에서 WOFF 대체 주소를 지운다 — WOFF2만 내보낸다(지원 하한 브라우저가 모두 읽는다, ADR 2026-10-28-design-system).
 * 꾸러미 CSS를 그대로 고쳐 쓰므로 글꼴 판은 꾸러미 고정(package.json)을 따른다.
 * CSS 안의 @import에는 돌지 않아서 Jua CSS는 src/main.tsx에서 불러온다.
 */
function woff2Only(): Plugin {
  return {
    name: "terra:woff2-only",
    enforce: "pre",
    transform(code, id) {
      if (!FONTSOURCE_CSS.test(id)) return null;
      return { code: code.replace(WOFF_FALLBACK, ""), map: null };
    },
  };
}

/**
 * 글꼴 라이선스 원문을 빌드 결과에 함께 내보낸다 — licenses/pretendard-OFL.txt, licenses/jua-OFL.txt.
 * OFL-1.1은 글꼴을 배포할 때 저작권 표시와 라이선스를 함께 두라고 한다(별도 텍스트 파일로 둘 수 있다).
 * 원문은 꾸러미(package.json 고정 판)에서 그대로 읽는다. THIRD_PARTY_NOTICES.md "기기로 내보내는 글꼴"
 */
function fontLicenses(): Plugin {
  const require = createRequire(import.meta.url);
  const files = [
    { fileName: "licenses/pretendard-OFL.txt", from: "pretendard/dist/LICENSE.txt" },
    { fileName: "licenses/jua-OFL.txt", from: "@fontsource/jua/LICENSE" },
  ];
  return {
    name: "terra:font-licenses",
    apply: "build",
    generateBundle() {
      for (const file of files) {
        this.emitFile({
          type: "asset",
          fileName: file.fileName,
          source: readFileSync(require.resolve(file.from), "utf8"),
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [
    woff2Only(),
    fontLicenses(),
    react(),
    paraglideVitePlugin({
      project: "./project.inlang",
      outdir: "./src/paraglide",
      // 사용자가 고른 언어 → 기기 언어 → 한국어 순서
      strategy: ["localStorage", "preferredLanguage", "baseLocale"],
    }),
    // 설치형 웹앱(PWA) — ADR 2026-10-28-pwa-and-browser-baseline
    VitePWA({
      strategies: "generateSW",
      // 새 버전은 바로 넘겨받지 않는다. 적용 시점은 src/pwa/updates.ts가 정한다(켤 때 자동, 쓰는 중엔 안내)
      registerType: "prompt",
      // 등록은 src/pwa/updates.ts에서 virtual:pwa-register로 직접 한다
      injectRegister: false,
      // theme-init.js: 첫 화면 테마(index.html <head>). 오프라인으로 켤 때도 번쩍이지 않게 껍데기에 넣는다
      includeAssets: ["favicon.ico", "favicon.svg", "apple-touch-icon-180x180.png", "theme-init.js"],
      manifest: {
        id: "/",
        start_url: "/",
        scope: "/",
        name: ko.app_title,
        short_name: ko.app_short_name,
        description: ko.app_description,
        lang: "ko",
        display: "standalone",
        orientation: "any",
        theme_color: THEME_COLOR,
        background_color: THEME_COLOR,
        // 임시 아이콘 — public/favicon.svg에서 그린다(만드는 법: docs/worklog/2026/10/28-2040-pwa.md)
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // 캐시는 앱 껍데기만(빌드된 JS·CSS·HTML + 아이콘·manifest). 실행 중 캐시(runtimeCaching)는 쓰지 않는다.
        // 글꼴(woff2)은 기본 globPatterns(js·wasm·css·html)에 없어 미리 캐시하지 않는다(scripts/check-pwa.mjs가 확인)
        navigateFallback: "index.html",
        // 화면 이동 대체에서 뺀다: 소셜 로그인 콜백(/api/auth/callback/*)이 화면 이동이다.
        // scripts/check-pwa.mjs가 빌드된 sw.js에서 이 규칙을 확인한다
        navigateFallbackDenylist: [/^\/(api|ws|health)(\/|\?|$)/],
        // 개발자 도구 조각(셰이더 측정 gpuBench…·행성 편집기 planetEditor…·항성계 편집기 starSystem…·2차맵 시험 secondMapLab…·
        // 설정 칸 패널 tuningPanel…·밸런스 화면 balancePanel…·스킬 편집기 skillEditor…·아이템 편집기 itemEditor…·두 편집기 공용 contentEditor…·전투 다시보기 battleReplayLab…의
        // JS·CSS)은
        // 미리 캐시하지 않는다 — 도구를 열 때만
        // 받는다(ADR 2026-10-29-planet-editor-stage1 1절). scripts/pwa-build.mjs DEV_ONLY_CHUNK와 같은 파일이다.
        // 앞 항목은 Workbox 기본값이다(덮어쓰므로 함께 적는다). scripts/check-pwa.mjs가 빌드된 sw.js로 확인한다
        globIgnores: [
          "**/node_modules/**/*",
          "assets/gpuBench*.{js,css}",
          "assets/[Pp]lanetEditor*.{js,css}",
          "assets/[Ss]tarSystem*.{js,css}",
          "assets/[Ss]econdMapLab*.{js,css}",
          "assets/[Tt]uningPanel*.{js,css}",
          "assets/[Bb]alancePanel*.{js,css}",
          "assets/[Ss]killEditor*.{js,css}",
          "assets/[Ii]temEditor*.{js,css}",
          "assets/[Cc]ontentEditor*.{js,css}",
          "assets/[Bb]attleReplayLab*.{js,css}",
        ],
      },
      // 개발 서버에서는 SW를 쓰지 않는다(virtual:pwa-register는 아무것도 하지 않는 대체 코드)
      devOptions: { enabled: false },
    }),
  ],
  define: {
    __APP_BUILD__: JSON.stringify(process.env.APP_BUILD ?? "dev"),
  },
  server: {
    proxy: {
      "/health": devServerTarget,
      "/api": devServerTarget,
      "/ws": { target: devServerTarget.replace(/^http/, "ws"), ws: true },
    },
  },
  build: {
    // 지원 하한: iOS 16.4+, Chrome·Edge 111+, Firefox 114+ (Vite 내장 대상, ADR 2026-10-28-pwa-and-browser-baseline)
    target: "baseline-widely-available",
    sourcemap: true,
    // 글꼴은 크기와 상관없이 파일로 내보낸다(/assets/<이름>-<해시>.woff2). 나머지는 Vite 기본값(4KB 미만 인라인)
    assetsInlineLimit: (filePath) => (FONT_FILE.test(filePath) ? false : undefined),
  },
});
