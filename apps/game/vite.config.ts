// 게임 앱 빌드 설정
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// 개발 중에는 서버(기본 4100)로 API와 WebSocket을 넘긴다
const devServerTarget = process.env.TERRA_SERVER_URL ?? "http://127.0.0.1:4100";

export default defineConfig({
  plugins: [
    react(),
    paraglideVitePlugin({
      project: "./project.inlang",
      outdir: "./src/paraglide",
      // 사용자가 고른 언어 → 기기 언어 → 한국어 순서
      strategy: ["localStorage", "preferredLanguage", "baseLocale"],
    }),
  ],
  define: {
    __APP_BUILD__: JSON.stringify(process.env.APP_BUILD ?? "dev"),
  },
  server: {
    proxy: {
      "/health": devServerTarget,
      "/ws": { target: devServerTarget.replace(/^http/, "ws"), ws: true },
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
