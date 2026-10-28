// 단위 테스트 설정 — 모든 패키지의 *.test.ts와 검사 스크립트의 *.test.mjs를 한 번에 돌린다
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts", "scripts/**/*.test.mjs"],
    environment: "node",
  },
});
