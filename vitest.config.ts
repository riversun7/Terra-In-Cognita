// 단위 테스트 설정 — 모든 패키지의 *.test.ts와 검사 스크립트의 *.test.mjs를 한 번에 돌린다
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts", "scripts/**/*.test.mjs"],
    environment: "node",
    // 시험 하나·준비 단계의 제한 시간. 기본값(5초·10초)은 여러 작업이 함께 도는 개발 컨테이너(4 vCPU, 부하 평균 약 10)에서
    // 무거운 시험(굽기 두 번, 이웃 전수 비교, 경로 해시 등)이 5~8.5초가 되어 실패했다(2026-10-29). 따로 돌리면 통과한다
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // CSS는 기본으로 빈 문자열이 된다. 디자인 값(토큰) 파일만 실제 내용을 읽게 한다(?raw, settings/themeSources.test.ts)
    css: { include: [/[\\/]apps[\\/]game[\\/]src[\\/]styles[\\/]tokens\.css/] },
  },
});
