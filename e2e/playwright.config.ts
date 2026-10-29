// 화면 시험(Playwright) 설정 — ADR 2026-10-29-app-shell 13절. CI에서는 돌리지 않는다([결정 3]).
// 실행: TEST_DATABASE_URL=postgres://… pnpm e2e [시험 파일·--grep 등]. 준비·정리는 global-setup.ts.
// - Chromium 하나. 기본 화면은 휴대폰 세로(helpers/viewports.ts의 phone). 다른 크기는 시험 파일에서 test.use로.
// - 작업자 하나: 서버·DB·가짜 계정을 함께 쓰고, 시험이 계정 설정(테마·언어·메뉴)을 바꾼다.
// - 다시 시도하지 않는다(retries 0): 흔들리는 시험은 고친다. 실패한 시험만 trace·사진을 e2e/test-results에 남긴다.
import { defineConfig } from "@playwright/test";
import { VIEWPORTS } from "./helpers/viewports.ts";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  globalSetup: "./global-setup.ts",
  outputDir: "test-results",
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  // 공유 개발 컨테이너(4 vCPU)는 다른 작업으로 부하가 크다. 시험 하나 60초, 기다리는 expect 10초
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    ...VIEWPORTS.phone,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
