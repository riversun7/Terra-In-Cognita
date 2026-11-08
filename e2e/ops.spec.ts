// 운영자 콘솔(/ops) 화면 시험 — docs/adr/2026-11-08-operator-console.md.
// admin: 탭 일곱 개, 현황, 유저 상세(통제 판), 유닛, 감사 기록 거르기, 로그 스위치, 권한 부여 주소는 권한 없음.
// dev: 개발자 홈 → 운영 권한 부여(체크박스). player: 권한 없음 화면.
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

  test("탭 일곱 개, 현황, 유저 상세, 감사 기록 거르기, 권한 부여 탭 없음·주소는 권한 없음", async ({
    page,
    deviceErrors,
  }) => {
    await page.goto("/ops");
    await consoleShown(page);
    await expect(page.locator("html")).toHaveAttribute("data-surface", "dev");
    await expect(page.locator(".ops-tabs [role='tab']")).toHaveCount(7);
    // 현황: 카드 넷 + 경보
    await expect(page.locator(".ops-grid .ops-card")).toHaveCount(4);
    // 유저 탭 → e2e_player 상세(통제 판)
    await page.locator(".ops-tabs [role='tab']").nth(1).click();
    await page
      .locator(".ops-main .dev-table tbody tr button.dev-code", { hasText: "player" })
      .first()
      .click();
    await expect(page.locator(".ops-side .ops-kv").first()).toBeVisible();
    await expect(page.locator(".ops-side .ops-controls")).toBeVisible();
    // 유닛 탭
    await page.locator(".ops-tabs [role='tab']").nth(4).click();
    await expect(page.locator(".ops-main .dev-table")).toBeVisible();
    // 감사 기록: 분류 칩 8개(전체 + 7), 계정 분류를 누르면 그 분류만(전역 준비가 역할을 넣은 기록이 있다)
    await page.locator(".ops-tabs [role='tab']").nth(6).click();
    await expect(page.locator(".ops-chips .ops-chip")).toHaveCount(8);
    await page.locator(".ops-chips .ops-chip").nth(1).click();
    await expect(page.locator(".ops-chips .ops-chip").nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".ops-audit tbody tr").first()).toBeVisible();
    // 권한 부여는 개발자만: 관리자는 주소를 열어도 권한 없음
    await page.goto("/dev/ops-grants");
    await expect(page.locator("#no-permission-title")).toBeVisible();
    expect(deviceErrors).toEqual([]);
  });

  test("관리자 화면 로그 스위치: 기본 꺼짐, 켜고 끈다", async ({ page }) => {
    await page.goto("/admin");
    const card = page.locator(".admin-switch-card[data-switch-id='view_audit']");
    await expect(card).toHaveAttribute("data-state", "paused");
    await card.locator("button[aria-pressed]").click();
    await expect(card).toHaveAttribute("data-state", "active");
    await card.locator("button[aria-pressed]").click();
    await expect(card).toHaveAttribute("data-state", "paused");
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
          await page.locator(".ops-tabs [role='tab']").nth(6).click();
          await expect(page.locator(".ops-audit tbody tr").first()).toBeVisible();
          await shot(page, `ops-audit-1440-${theme}`);
          await page.goto("/admin");
          await expect(page.locator(".admin-switch-card[data-switch-id='view_audit']")).toBeVisible();
          await shot(page, `admin-log-switch-1440-${theme}`, { fullPage: true });
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

test.describe("운영 권한 부여 — dev", () => {
  test.use({ account: "dev" });

  test("개발자 홈 [운영 권한 부여] → 계정을 열면 역할 기본은 잠긴 체크박스, 운영자 콘솔에는 권한 부여 탭이 없다", async ({
    page,
    deviceErrors,
  }) => {
    await page.goto("/dev");
    await page.locator("#main a.dev-tool[href='/dev/ops-grants']").click();
    await expect(page.locator("#ops-grants-title")).toBeVisible();
    await page.locator("#main form input").fill("e2e_admin");
    await page.locator("#main form button[type='submit']").click();
    // 관리자 역할 기본 = 권한 부여만 뺀 13개(잠김), 권한 부여 1개는 고를 수 있다
    await expect(page.locator(".ops-grants input[type='checkbox']")).toHaveCount(14);
    await expect(page.locator(".ops-grants input[type='checkbox']:disabled")).toHaveCount(13);
    await page.goto("/ops");
    await consoleShown(page);
    await expect(page.locator(".ops-tabs [role='tab']")).toHaveCount(7);
    expect(deviceErrors).toEqual([]);
  });

  test.describe("사진", () => {
    test.use(VIEWPORTS.desktop);
    for (const theme of ["neon", "light"] as const) {
      test.describe(theme, () => {
        test.use({ devTheme: theme });
        test(`권한 부여 화면 1440 (${theme})`, async ({ page }) => {
          await page.goto("/dev/ops-grants");
          await page.locator("#main form input").fill("e2e_admin");
          await page.locator("#main form button[type='submit']").click();
          await expect(page.locator(".ops-grants input[type='checkbox']")).toHaveCount(14);
          await shot(page, `ops-grants-1440-${theme}`);
        });
      });
    }
  });
});

test.describe("운영자 콘솔 — player", () => {
  test.use({ account: "player" });

  test("권한 없음 화면", async ({ page }) => {
    await page.goto("/ops");
    await expect(page.locator("#no-permission-title")).toBeVisible();
  });
});
