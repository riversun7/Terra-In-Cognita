// 서버 빌드 설정 — Vite(SSR 빌드)로 Node용 진입 파일을 만든다: dist/main.js(서버), dist/migrate.js(마이그레이션),
// dist/cli.js(관리 명령: 계정 만들기·역할·비밀번호, src/cli/commands.ts),
// dist/pathWorker.js(경로 워커 스레드, src/world/pathWorker.ts — main.js가 같은 폴더에서 찾는다),
// dist/planetBakeWorker.js(행성 굽기 워커 스레드, src/planet/bakeWorker.ts — 같은 규칙),
// dist/terrainWorker.js(2차맵 지형 워커 스레드, src/world/terrainWorker.ts — 같은 규칙),
// dist/balanceWorker.js(밸런스 화면 대결 워커 스레드, src/balance/duelWorker.ts — 같은 규칙),
// dist/battleReplayWorker.js(전투 다시보기 워커 스레드, src/battleReplay/replayWorker.ts — 같은 규칙)
// 내부 패키지(@terra/*)와 zod는 번들에 포함하고, fastify·drizzle-orm·pg·better-auth는 node_modules에서 읽는다.
import { execFileSync } from "node:child_process";
import { buildStampSource } from "@terra/shared/buildStamp";
import { type Plugin, defineConfig } from "vite";

/** git 커밋 해시(실패하면 빈 글 — git이 없는 Docker 빌드는 CI가 APP_BUILD로 넘긴다) */
function gitCommit(): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    });
  } catch {
    return "";
  }
}

/**
 * 빌드 도장(ADR 2026-10-29-app-shell "바뀜 (2026-11-14, 빌드 도장)") — 게임 앱(apps/game/vite.config.ts)과 같은 규칙으로
 * __SERVER_BUILD_TIME__·__SERVER_BUILD_COMMIT__을 넣는다. tsx로 띄운 개발 서버·단위 시험에는 없다(src/buildStamp.ts가 "dev"로 본다)
 */
function buildStamp(): Plugin {
  return {
    name: "terra-build-stamp",
    config() {
      const stamp = buildStampSource({
        dev: false,
        envTime: process.env.APP_BUILD_TIME,
        envCommit: process.env.APP_BUILD,
        nowMs: Date.now(),
        gitCommit,
      });
      return {
        define: {
          __SERVER_BUILD_TIME__: JSON.stringify(stamp.time),
          __SERVER_BUILD_COMMIT__: JSON.stringify(stamp.commit),
        },
      };
    },
  };
}

export default defineConfig({
  plugins: [buildStamp()],
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
        balanceWorker: "src/balance/duelWorker.ts",
        battleReplayWorker: "src/battleReplay/replayWorker.ts",
      },
      output: { entryFileNames: "[name].js" },
    },
  },
  ssr: {
    noExternal: [/^@terra\//, "zod"],
  },
});
