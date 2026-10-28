// 단위 테스트 설정 — 모든 패키지의 *.test.ts와 검사 스크립트의 *.test.mjs를 한 번에 돌린다
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts", "scripts/**/*.test.mjs"],
    environment: "node",
    // CSS는 기본으로 빈 문자열이 된다. 디자인 값(토큰) 파일만 실제 내용을 읽게 한다(?raw, settings/themeSources.test.ts)
    css: { include: [/[\\/]apps[\\/]game[\\/]src[\\/]styles[\\/]tokens\.css/] },
  },
});
