// 운영자 콘솔(/ops) 화면 시험 — docs/adr/2026-11-08-operator-console.md.
// admin: 탭 여덟 개, 현황 카드, 유저 목록 → 유저 상세(통제 판), 유닛 탭, 감사 기록, 권한 부여 체크박스. player: 권한 없음 화면.
// 사진: 1440 넓은 폭(목록 + 오른쪽 상세)과 390px, 개발 화면 테마 둘(네온·라이트)(ADR 2026-11-02-dev-ui).
import type { Page } from "@playwright/test";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { expect, test } from "./helpers/test.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

async function consoleShown(page: Page): Promise<void> {
  await expect(page.locator("#ops-title")).toBeVisible();
  await expect(page.locator(".ops-tabs [role='tab']").first()).toBeVisible();
}

test.describe("운영자 콘솔 — admin", () => {
  test.use({ account: "admin" });

  test("탭 여덟 개, 현황, 유저 상세, 감사 기록, 권한 부여", async ({ page, deviceErrors }) => {
    await page.goto("/ops");
    await consoleShown(page);
    await expect(page.locator("html")).toHaveAttribute("data-surface", "dev");
    await expect(page.locator(".ops-tabs [role='tab']")).toHaveCount(8);
    // 현황: 카드 넷 + 경보
    await expect(page.locator(".ops-grid .ops-card")).toHaveCount(4);
    // 유저 탭 → 첫 줄 상세
    await page.locator(".ops-tabs [role='tab']").nth(1).click();
    const firstUser = page.locator(".ops-main .dev-table tbody tr button.dev-code").first();
    await expect(firstUser).toBeVisible();
    await page
      .locator(".ops-main .dev-table tbody tr button.dev-code", { hasText: "player" })
      .first()
      .click();
    await expect(page.locator(".ops-side .ops-kv").first()).toBeVisible();
    await expect(page.locator(".ops-side .ops-controls")).toBeVisible();
    // 유닛 탭
    await page.locator(".ops-tabs [role='tab']").nth(4).click();
    await expect(page.locator(".ops-main .dev-table")).toBeVisible();
    // 감사 기록 탭
    await page.locator(".ops-tabs [role='tab']").nth(6).click();
    await expect(page.locator(".ops-main form")).toBeVisible();
    // 권한 부여: dev 계정을 열면 역할 기본이 잠긴 체크박스
    await page.locator(".ops-tabs [role='tab']").nth(7).click();
    await page.locator(".ops-main form input").fill("dev");
    await page.locator(".ops-main form button[type='submit']").click();
    await expect(page.locator(".ops-grants input[type='checkbox']")).toHaveCount(13);
    await expect(page.locator(".ops-grants input[type='checkbox']:disabled")).toHaveCount(13);
    expect(deviceErrors).toEqual([]);
  });

  for (const theme of ["neon", "light"] as const) {
    test.describe(`사진 ${theme}`, () => {
      test.use({ devTheme: theme });

      test.describe("1440", () => {
        test.use(VIEWPORTS.desktop);
        test(`넓은 폭: 유저 목록 + 상세 (${theme})`, async ({ page }) => {
          await page.goto("/ops?tab=players");
          await consoleShown(page);
          await page
            .locator(".ops-main .dev-table tbody tr button.dev-code", { hasText: "player" })
            .first()
            .click();
          await expect(page.locator(".ops-side .ops-kv").first()).toBeVisible();
          await shot(page, `ops-players-1440-${theme}`);
          await page.locator(".ops-tabs [role='tab']").first().click();
          await expect(page.locator(".ops-grid .ops-card")).toHaveCount(4);
          await shot(page, `ops-overview-1440-${theme}`);
        });
      });

      test(`390px: 가로 넘침 없음, 누르는 곳 (${theme})`, async ({ page }) => {
        await page.goto("/ops");
        await consoleShown(page);
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await shot(page, `ops-overview-390-${theme}`);
        await page.locator(".ops-tabs [role='tab']").nth(1).click();
        await page
          .locator(".ops-main .dev-table tbody tr button.dev-code", { hasText: "player" })
          .first()
          .click();
        await expect(page.locator(".ops-side .ops-kv").first()).toBeVisible();
        expect(await horizontalOverflow(page)).toEqual([]);
        await shot(page, `ops-player-390-${theme}`, { fullPage: true });
      });
    });
  }
});

test.describe("운영자 콘솔 — player", () => {
  test.use({ account: "player" });

  test("권한 없음 화면", async ({ page }) => {
    await page.goto("/ops");
    await expect(page.locator("#no-permission-title")).toBeVisible();
  });
});
