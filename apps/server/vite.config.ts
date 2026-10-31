// 서버 빌드 설정 — Vite(SSR 빌드)로 Node용 진입 파일을 만든다: dist/main.js(서버), dist/migrate.js(마이그레이션),
// dist/cli.js(관리 명령: 계정 만들기·역할·비밀번호, src/cli/commands.ts),
// dist/pathWorker.js(경로 워커 스레드, src/world/pathWorker.ts — main.js가 같은 폴더에서 찾는다),
// dist/planetBakeWorker.js(행성 굽기 워커 스레드, src/planet/bakeWorker.ts — 같은 규칙),
// dist/terrainWorker.js(2차맵 지형 워커 스레드, src/world/terrainWorker.ts — 같은 규칙)
// 내부 패키지(@terra/*)와 zod는 번들에 포함하고, fastify·drizzle-orm·pg·better-auth는 node_modules에서 읽는다.
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    ssr: true,
    outDir: "dist",
    target: "node24",
    emptyOutDir: true,
    sourcemap: true,
    rolldownOptions: {
      input: {
        main: "src/main.ts",
        migrate: "src/migrate.ts",
        cli: "src/cli.ts",
        pathWorker: "src/world/pathWorker.ts",
        planetBakeWorker: "src/planet/bakeWorker.ts",
        terrainWorker: "src/world/terrainWorker.ts",
      },
      output: { entryFileNames: "[name].js" },
    },
  },
  ssr: {
    noExternal: [/^@terra\//, "zod"],
  },
});
