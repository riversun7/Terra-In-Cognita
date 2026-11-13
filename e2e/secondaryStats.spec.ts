// 2차 스탯 에디터 화면 시험 — /dev/secondary-stats:
// - dev: 대상 목록(walk_speed 제외, stat_rows + 파생 전투식 구분), 초기 스탯 합 프리셋(30~80, 100), 4종 차트·비교표,
//   가중치 초안 담기·비우기, 모바일(390)·데스크톱(1440) 가로 넘침·작은 누르는 곳 없음.
// - player: 권한 없음 화면.
import { horizontalOverflow, smallTapTargets } from "./helpers/screen.ts";
import { expect, test } from "./helpers/test.ts";

test.describe("개발자", () => {
  test.use({ account: "dev" });

  test("목록·walk_speed 제외·초기 스탯 합 100·차트·가중치 담기/비우기", async ({ page, deviceErrors }) => {
    await page.goto("/dev/secondary-stats");
    await expect(page.locator(".sec-screen")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    await expect(page.locator('.sec-target-btn[data-target="walk_speed"]')).toHaveCount(0);
    await expect(page.locator('.sec-target-btn[data-target="hp"]')).toBeVisible();
    await expect(page.locator('.sec-target-btn[data-target="combat:crit_multiplier"]')).toBeVisible();

    // 초기 스탯 합 프리셋 100 누르기 → 차트·시뮬레이션 반영
    const sum100 = page.locator(".sec-sum-btn", { hasText: "100" });
    await sum100.click();
    await expect(sum100).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".sec-chart-card svg.sec-svg")).toHaveCount(2);
    await expect(page.locator(".sec-matrix-table tbody tr")).not.toHaveCount(0);

    // HP의 VIT 가중치 수정 → 담기 막대 표시 → 모두 취소
    const vitInput = page.locator('.sec-cell[data-cell-key="hp.vit"] .sec-cell-input');
    const prevValue = await vitInput.inputValue();
    const nextValue = String(Number(prevValue) + 500);
    await vitInput.fill(nextValue);
    await vitInput.blur();
    await expect(page.locator(".sec-pending-bar")).toBeVisible();
    await page.locator(".sec-pending-actions button").first().click();
    await expect(page.locator(".sec-pending-bar")).toHaveCount(0);
    expect(deviceErrors).toEqual([]);
  });

  for (const width of [390, 1440] as const) {
    test(`배치: 폭 ${width}에서 가로 넘침·작은 누르는 곳 없음`, async ({ page, deviceErrors }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/dev/secondary-stats");
      await expect(page.locator(".sec-screen")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      expect(await horizontalOverflow(page)).toEqual([]);
      expect(await smallTapTargets(page)).toEqual([]);
      expect(deviceErrors).toEqual([]);
    });
  }
});

test.describe("플레이어", () => {
  test.use({ account: "player" });

  test("권한 없음 화면", async ({ page, deviceErrors }) => {
    await page.goto("/dev/secondary-stats");
    await expect(page.locator("#no-permission-title")).toBeVisible();
    await expect(page.locator(".sec-layout")).toHaveCount(0);
    expect(deviceErrors).toEqual([]);
  });
});
