// 운영자 콘솔(/ops) 화면 시험 — docs/adr/2026-11-08-operator-console.md.
// admin: 탭 아홉 개(맨 끝 마크 관리는 e2e/faction.spec.ts가 본다), 현황, 유저 상세(통제 판), 유닛, 감사 기록 거르기, 로그 스위치, 권한 부여 주소는 권한 없음.
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

  test("탭 여덟 개, 현황, 유저 상세, 감사 기록 거르기, 권한 부여 탭 없음·주소는 권한 없음", async ({
    page,
    deviceErrors,
  }) => {
    await page.goto("/ops");
    await consoleShown(page);
    await expect(page.locator("html")).toHaveAttribute("data-surface", "dev");
    // 탭 아홉: 앞 여덟 + 맨 끝 마크 관리(docs/adr/2026-11-11-faction-identity.md 5절 — e2e/faction.spec.ts가 본다)
    await expect(page.locator(".ops-tabs [role='tab']")).toHaveCount(9);
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
    // 유닛 탭: 표 칸 열(ID·이름·종류·주인·위치·레벨과 경험치·스탯·작업·피로·상태), 줄을 누르면 상세에 성장·작업 상태 판
    await page.locator(".ops-tabs [role='tab']").nth(5).click();
    await expect(page.locator(".ops-main .dev-table")).toBeVisible();
    await expect(page.locator(".ops-main .dev-table thead th")).toHaveCount(10);
    // 모든 유닛에 레벨·스탯이 보인다(저장된 스탯이 없으면 기본 몸)
    await expect(page.locator(".ops-main .dev-table tbody tr td:nth-child(7)").first()).toContainText("·");
    // 칸 머리를 누르면 정렬(레벨: 큰 것부터 → 다시 누르면 작은 것부터), 작업 상태로 거른다
    const levelHead = page.locator(".ops-main .dev-table thead th").nth(5);
    await levelHead.locator("button").click();
    await expect(levelHead).toHaveAttribute("aria-sort", "descending");
    await levelHead.locator("button").click();
    await expect(levelHead).toHaveAttribute("aria-sort", "ascending");
    await page.locator(".ops-main .dev-table thead th").first().locator("button").click();
    await page.locator(".ops-main [data-ops-filter='state']").selectOption("captive");
    await expect(page.locator(".ops-main .dev-table tbody tr")).toHaveCount(0);
    await page.locator(".ops-main [data-ops-filter='state']").selectOption("");
    await expect(page.locator(".ops-main .dev-table tbody tr").first()).toBeVisible();
    await page.locator(".ops-main .dev-table tbody tr td button").first().click();
    await expect(page.locator(".ops-side [data-ops-section='growth']")).toBeVisible();
    await expect(page.locator(".ops-side [data-ops-section='work'] .ops-kv-row")).toHaveCount(9);
    // 화면 잇기: 유닛 상세의 [이 주인의 유닛] → 그 주인으로 거른 유닛 목록(줄 위 표지), [거르기 풀기]로 푼다
    await page.locator(".ops-side [data-ops-link='owner-units']").click();
    await expect(page.locator(".ops-main [data-ops-owner-filter]")).toBeVisible();
    await expect(page.locator(".ops-main .dev-table tbody tr").first()).toBeVisible();
    await page.locator(".ops-main [data-ops-owner-filter] button").click();
    await expect(page.locator(".ops-main [data-ops-owner-filter]")).toHaveCount(0);
    // 표의 위치는 짧게 보이고 누르면 전체 위치가 펼쳐진다. [이 2차맵의 유닛] → 그 2차맵으로 거른다(2차맵 키 칸이 채워진다).
    // 주인을 누르면 유저·세력 상세
    const where = page.locator(".ops-main .dev-table tbody tr td:nth-child(5)").first();
    await expect(where.locator(".ops-where-full")).toHaveCount(0);
    await where.locator("button").first().click();
    await expect(where.locator(".ops-where-full")).toBeVisible();
    await where.locator("[data-ops-link='map-units']").click();
    await expect(page.locator(".ops-main form.ops-toolbar input").first()).not.toHaveValue("");
    await page.locator(".ops-main .dev-table tbody tr td:nth-child(4) button").first().click();
    await expect(page.locator(".ops-side .ops-kv").first()).toBeVisible();
    // 감사 기록: 분류 칩 8개(전체 + 7), 계정 분류를 누르면 그 분류만(전역 준비가 역할을 넣은 기록이 있다)
    await page.locator(".ops-tabs [role='tab']").nth(7).click();
    await expect(page.locator(".ops-chips .ops-chip")).toHaveCount(8);
    await page.locator(".ops-chips .ops-chip").nth(1).click();
    await expect(page.locator(".ops-chips .ops-chip").nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".ops-audit tbody tr").first()).toBeVisible();
    // 권한 부여는 개발자만: 관리자는 주소를 열어도 권한 없음
    await page.goto("/dev/ops-grants");
    await expect(page.locator("#no-permission-title")).toBeVisible();
    expect(deviceErrors).toEqual([]);
  });

  test("세력 관리: 표지·화폐가 보이고, 정체성을 고치면 표에 바로 보인다. 화폐 약어를 고친다(겹치면 거절)", async ({
    page,
    deviceErrors,
  }) => {
    await page.goto("/ops?tab=npcs");
    await consoleShown(page);
    const firstRow = page.locator(".ops-main .dev-table tbody tr").first();
    await expect(firstRow.locator(".ops-swatch")).toBeVisible();
    await expect(page.locator(".ops-summary li").first()).toBeVisible();
    // 첫 세력 상세 → 정체성 고치기
    await firstRow.locator("td:nth-child(3) button").click();
    await expect(page.locator(".ops-side .ops-identity")).toBeVisible();
    await page.locator(".ops-side details.ops-details summary").first().click();
    const form = page.locator(".ops-side .ops-profile-form");
    await form.locator("input").nth(1).fill("E2E");
    await form.locator("button[type='submit']").click();
    await expect(page.locator(".ops-side .ops-identity")).toContainText("E2E");
    // 화폐 탭: 첫 화폐의 약어를 두 번째 화폐 약어로 바꾸면 거절, 새 약어면 저장
    await page.locator(".ops-tabs [role='tab']").nth(4).click();
    // 화폐 줄을 받은 뒤에 약어를 읽는다(받기 전이면 빈 목록이라 "겹치는 약어"를 모른다)
    await expect(page.locator(".ops-main .dev-table tbody tr").nth(1)).toBeVisible();
    const tickers = await page.locator(".ops-main .dev-table tbody tr td:nth-child(2)").allInnerTexts();
    await page.locator(".ops-main .dev-table tbody tr").first().locator("button").last().click();
    const edit = page.locator(".ops-inline-edit");
    await edit
      .locator("input")
      .nth(1)
      .fill(tickers[1] ?? "PCB");
    await edit.locator("button").click();
    await expect(edit.locator("[role='alert']")).toBeVisible();
    await edit.locator("input").nth(1).fill("ZZE");
    await edit.locator("button").click();
    await expect(page.locator(".ops-main .dev-table tbody tr").first()).toContainText("ZZE");
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
          await page.locator(".ops-tabs [role='tab']").nth(7).click();
          await expect(page.locator(".ops-audit tbody tr").first()).toBeVisible();
          await shot(page, `ops-audit-1440-${theme}`);
          await page.goto("/ops?tab=npcs");
          await expect(page.locator(".ops-main .dev-table tbody tr").first()).toBeVisible();
          await page
            .locator(".ops-main .dev-table tbody tr")
            .first()
            .locator("td:nth-child(3) button")
            .click();
          await expect(page.locator(".ops-side .ops-identity")).toBeVisible();
          await shot(page, `ops-factions-1440-${theme}`);
          await page.locator(".ops-tabs [role='tab']").nth(4).click();
          await expect(page.locator(".ops-main .dev-table tbody tr").first()).toBeVisible();
          await shot(page, `ops-currencies-1440-${theme}`);
          await page.goto("/ops?tab=units");
          await expect(page.locator(".ops-main .dev-table tbody tr").first()).toBeVisible();
          await page.locator(".ops-main .dev-table tbody tr td button").first().click();
          await expect(page.locator(".ops-side [data-ops-section='work']")).toBeVisible();
          await shot(page, `ops-units-1440-${theme}`);
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
        await page.locator(".ops-tabs [role='tab']").nth(5).click();
        await page.locator(".ops-main .dev-table tbody tr td button").first().click();
        await expect(page.locator(".ops-side [data-ops-section='work']")).toBeVisible();
        expect(await horizontalOverflow(page)).toEqual([]);
        await shot(page, `ops-unit-390-${theme}`, { fullPage: true });
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
    // 관리자 역할 기본 = 권한 부여만 뺀 15개(잠김 — 마크 관리 emblem_moderate 포함), 권한 부여 1개는 고를 수 있다
    await expect(page.locator(".ops-grants input[type='checkbox']")).toHaveCount(16);
    await expect(page.locator(".ops-grants input[type='checkbox']:disabled")).toHaveCount(15);
    await page.goto("/ops");
    await consoleShown(page);
    await expect(page.locator(".ops-tabs [role='tab']")).toHaveCount(9);
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
          // 운영 권한 16개(마크 관리 emblem_moderate 포함 — docs/adr/2026-11-11-faction-identity.md 5절)
          await expect(page.locator(".ops-grants input[type='checkbox']")).toHaveCount(16);
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
