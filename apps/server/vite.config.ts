// 서버 빌드 설정 — Vite(SSR 빌드)로 Node용 단일 진입 파일을 만든다.
// 내부 패키지(@terra/*)와 zod는 번들에 포함하고, fastify 계열은 node_modules에서 읽는다.
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    ssr: "src/main.ts",
    outDir: "dist",
    target: "node24",
    emptyOutDir: true,
    sourcemap: true,
  },
  ssr: {
    noExternal: [/^@terra\//, "zod"],
  },
});
