// 게임 앱 빌드 설정
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
// 휴대폰 브라우저는 manifest를 언어별로 바꾸지 못해서 앱 이름은 한국어(기본 언어)로 쓴다
import ko from "./messages/ko.json" with { type: "json" };

// 개발 중에는 서버(기본 4100)로 API와 WebSocket을 넘긴다
const devServerTarget = process.env.TERRA_SERVER_URL ?? "http://127.0.0.1:4100";

// 임시 색 — 디자인 시스템 ADR 때 바꾼다. index.html의 theme-color와 같아야 한다(scripts/check-pwa.mjs가 확인)
const THEME_COLOR = "#0b1020";

export default defineConfig({
  plugins: [
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
      includeAssets: ["favicon.ico", "favicon.svg", "apple-touch-icon-180x180.png"],
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
        // 캐시는 앱 껍데기만(빌드된 JS·CSS·HTML + 아이콘·manifest). 실행 중 캐시(runtimeCaching)는 쓰지 않는다
        navigateFallback: "index.html",
        // 화면 이동 대체에서 뺀다: 소셜 로그인 콜백(/api/auth/callback/*)이 화면 이동이다.
        // scripts/check-pwa.mjs가 빌드된 sw.js에서 이 규칙을 확인한다
        navigateFallbackDenylist: [/^\/(api|ws|health)(\/|\?|$)/],
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
  },
});
