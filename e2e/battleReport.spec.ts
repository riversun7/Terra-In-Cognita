// 전투 보고서 시험 — /dev/balance [전투 보고서]·[보고서 기록] (docs/adr/2026-11-14-battle-report.md).
// - dev: 파티 대 파티 20판 → 보고서(점수·신뢰 구간·전투 시간·편·유닛 표·피해 흐름 16단계·가장 크게 줄인 단계·표본 한 대 풀이) →
//   [보고서 기록]에서 이름으로 찾기 → 열기 → N번째 판 한 대 풀이 → 다시 돌리기 → 둘 골라 견주기. 웨이브 공성 4판은 공성 칸이 나온다.
// - player: tRPC battleReport.*는 403.
// - 사진: 보고서(피해 흐름 포함)·기록 목록 × 네온 다크·라이트 × 390·1440. 가로 넘침 없음.
// 보고서 일은 서버 전체 한 번에 하나라 같은 파일 안 시험은 차례로 돈다(describe.serial).
import type { Page } from "@playwright/test";
import { elementShot, horizontalOverflow, shot } from "./helpers/screen.ts";
import { expect, test } from "./helpers/test.ts";

/** 이 실행만의 이름(시험끼리 DB를 같이 쓴다) */
const RUN_TAG = `E2E ${Date.now().toString(36)}`;

async function reportReady(page: Page): Promise<void> {
  await page.goto("/dev/balance");
  await expect(page.locator(".bl-lab")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
}

/** 보고서를 돌리고 끝날 때까지(바쁘면 기다렸다 다시) */
async function runReport(page: Page, name: string): Promise<void> {
  await page.locator(".rp-name").fill(name);
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.locator(".rp-run").click();
    await expect(page.locator(".rp-run")).not.toHaveAttribute("aria-disabled", "true", { timeout: 120_000 });
    if ((await page.locator(".rp-latest .rp-report").count()) > 0) return;
    await page.waitForTimeout(5_000);
  }
  throw new Error("report did not finish");
}

test.describe.serial("개발자", () => {
  test.use({ account: "dev" });

  test("파티 대 파티 20판 보고서: 승패·표·피해 흐름·한 대 풀이, 기록에서 찾기·열기·다시 돌리기·견주기", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(300_000);
    await reportReady(page);
    await page.locator(".rp-mode[data-mode='arena']").click();
    await page.locator(".rp-runs").selectOption("20");
    await runReport(page, `${RUN_TAG} arena`);
    const report = page.locator(".rp-latest .rp-report");
    await expect(report.locator("[data-testid='report-score']")).toHaveText(/%$/);
    await expect(report.locator(".rp-sides tbody tr")).toHaveCount(2);
    await expect(report.locator(".rp-units tbody tr")).toHaveCount(8);
    // 피해 흐름: 판정 차례 16단계, 가장 크게 줄인 단계 표시
    await expect(report.locator(".rp-flow-step")).toHaveCount(16);
    await expect(report.locator(".rp-flow-step[data-extreme='loss']")).toHaveCount(1);
    await expect(report.locator(".rp-flow-step").first()).toHaveAttribute("data-stage", "attack");
    await expect(report.locator(".rp-flow-step").last()).toHaveAttribute("data-stage", "applied");
    // 표본 한 대 풀이
    await report.locator(".rp-sample").first().click();
    await expect(report.locator(".rp-trace .rp-trace-step").first()).toBeVisible();
    // 기록: 이름으로 찾기 → 열기 → 2번 판 한 대 풀이
    await page.locator("#bp-tab-log").click();
    const log = page.locator(".rp-log");
    await expect(log).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    await log.locator(".rp-log-name").fill(RUN_TAG);
    await expect(log.locator(".rp-log-item")).toHaveCount(1, { timeout: 20_000 });
    await log.locator(".rp-log-open").first().click();
    const opened = log.locator(".rp-report");
    await expect(opened.locator(".rp-flow-step")).toHaveCount(16, { timeout: 20_000 });
    await opened.locator(".rp-trace-load input").fill("2");
    await opened.locator(".rp-trace-load input").press("Enter");
    await opened.locator(".rp-trace-run").click();
    await expect(opened.locator(".rp-trace-pick .rp-trace-step").first()).toBeVisible({ timeout: 60_000 });
    // 다시 돌리기 → 보고서 탭에서 같은 입력으로 돈다 → 기록이 둘
    await log.locator(".rp-log-rerun").first().click();
    await expect(page.locator("#bp-tab-report")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".rp-run")).not.toHaveAttribute("aria-disabled", "true", { timeout: 120_000 });
    await expect(page.locator(".rp-latest .rp-report")).toBeVisible();
    await page.locator("#bp-tab-log").click();
    await page.locator(".rp-log .rp-log-name").fill(RUN_TAG);
    await expect(page.locator(".rp-log .rp-log-item")).toHaveCount(2, { timeout: 20_000 });
    for (const pick of await page.locator(".rp-log .rp-log-pick input").all()) await pick.check();
    await page.locator(".rp-compare-run").click();
    // 같은 설정·같은 시드 → 견주기 차이는 모두 0
    const deltas = page.locator(".rp-compare-view .rp-compare td[data-sign]");
    await expect(deltas.first()).toBeVisible({ timeout: 20_000 });
    for (const sign of await deltas.evaluateAll((cells) => cells.map((cell) => cell.getAttribute("data-sign"))))
      expect(sign).toBe("zero");
    expect(deviceErrors).toEqual([]);
  });

  test("웨이브 공성 4판: 공성 칸(넥서스·성벽)과 무리 줄", async ({ page, deviceErrors }) => {
    test.setTimeout(300_000);
    await reportReady(page);
    await page.locator(".rp-mode[data-mode='wave']").click();
    await page.locator(".rp-runs").selectOption("4");
    await page.locator(".rp-limit").selectOption("300");
    await runReport(page, `${RUN_TAG} wave`);
    const report = page.locator(".rp-latest .rp-report");
    await expect(report.locator(".rp-siege")).toBeVisible();
    await expect(report.locator(".rp-units tbody tr")).toHaveCount(3);
    await page.locator(".rp-mode[data-mode='arena']").click();
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("권한", () => {
  test.use({ account: "player" });
  test("player는 battleReport 목록 403", async ({ page }) => {
    await page.goto("/");
    const status = await page.evaluate(async () => {
      const response = await fetch(`/api/trpc/battleReport.list?input=${encodeURIComponent(JSON.stringify({}))}`);
      return response.status;
    });
    expect(status).toBe(403);
  });
});

for (const { theme, width, height } of [
  { theme: "neon", width: 390, height: 844 },
  { theme: "light", width: 390, height: 844 },
  { theme: "neon", width: 1440, height: 900 },
  { theme: "light", width: 1440, height: 900 },
] as const) {
  test.describe(`사진·${theme}·${width}px`, () => {
    test.use({ account: "dev", devTheme: theme, viewport: { width, height } });

    test("기록에서 연 보고서(피해 흐름·한 대 풀이)와 기록 목록: 가로 넘침 없음, 사진", async ({ page, deviceErrors }) => {
      test.setTimeout(120_000);
      await page.goto("/dev/balance?tab=log");
      const log = page.locator(".rp-log");
      await expect(log).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
      await expect(log.locator(".rp-log-item").first()).toBeVisible({ timeout: 20_000 });
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      expect(await horizontalOverflow(page)).toEqual([]);
      await shot(page, `battle-report-log-${theme}-${width}`);
      await log.locator(".rp-log-open").first().click();
      const opened = log.locator(".rp-report");
      await expect(opened.locator(".rp-flow-step").first()).toBeVisible({ timeout: 20_000 });
      const sample = opened.locator(".rp-sample").first();
      if ((await sample.count()) > 0) await sample.click();
      await opened.locator(".rp-report-head").scrollIntoViewIfNeeded();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      expect(await horizontalOverflow(page)).toEqual([]);
      await shot(page, `battle-report-${theme}-${width}`);
      await elementShot(opened.locator(".rp-flow-section"), `battle-report-flow-${theme}-${width}`);
      expect(deviceErrors).toEqual([]);
    });
  });
}
