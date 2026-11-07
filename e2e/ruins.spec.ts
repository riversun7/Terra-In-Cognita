// 폐허 복원 화면 시험 — 생산 칸 "폐허 복원"(D-510·D-339·D-343·D-344, docs/adr/2026-11-07-ruins-restoration.md).
// - admin: [시험 폐허 만들기] → 카드(주인 없음) → [행정 건물 재료 받기(시험)] → [행정 건물 짓기] = 주인(주인만 넣음) → 시험 화폐 →
//   4,000 넣기 → [모금 열기](모금 중) → 남은 6,000 넣기 = 도시가 되살아남(카드가 빠짐). 둘째 폐허는 주인·모금 중·일부 모인 채 남겨 사진에 쓴다.
// - 사진(E2E_SHOTS_DIR): 폐허 칸 390 파스텔 한국어·390 다크 영어·1440 파스텔 한국어·1440 다크 영어.
// 복귀 요약은 띄우지 않는다(hideSummary).
import type { Locator, Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { elementShot, horizontalOverflow } from "./helpers/screen.ts";
import { expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

test.beforeEach(async ({ page }) => {
  await rewriteTrpc(page, { "summary.get": hideSummary });
});

const ruinsPanel = (page: Page): Locator => page.locator('section[data-part="ruins"]');
/** 변수 자리에서 자른 문구 앞부분(수·이름이 들어가는 성공 문구를 부분으로 본다) */
const head = (key: string, params: Record<string, string | number>): string =>
  message("ko", key, params).split("@")[0] ?? "";

/** 단추를 누르고 성공 문구가 보일 때까지(속도 제한에 걸리면 다시 누른다) */
async function clickFor(page: Page, button: Locator, text: string): Promise<void> {
  const success = ruinsPanel(page).locator(".message-success");
  await expect(async () => {
    await button.click();
    await expect(success).toContainText(text, { timeout: 5_000 });
  }).toPass({ timeout: 40_000, intervals: [2_000] });
}

/** [시험 폐허 만들기] → 새 폐허 카드 */
async function makeRuin(page: Page): Promise<Locator> {
  const panel = ruinsPanel(page);
  const cards = panel.locator('li[data-part="ruin-card"]');
  const before = await cards.count();
  await clickFor(page, panel.locator(".ruins-dev-make"), head("ruins_dev_made", { id: "@" }));
  await expect(cards).toHaveCount(before + 1, { timeout: 15_000 });
  const card = cards.last();
  await expect(card).toHaveAttribute("data-state", "unclaimed");
  return card;
}

/** 재료 받기 → 행정 건물 짓기 = 주인 */
async function claim(page: Page, card: Locator): Promise<void> {
  await clickFor(page, card.locator(".ruins-dev-materials"), message("ko", "ruins_dev_materials_done"));
  await clickFor(page, card.locator(".ruins-build"), head("ruins_claimed", { id: "@" }));
  await expect(card).toHaveAttribute("data-state", "owner_only", { timeout: 15_000 });
  await expect(card).toContainText(message("ko", "ruins_mine_tag"));
}

/** 넣기 */
async function fund(page: Page, card: Locator, amount: string, text: string): Promise<void> {
  await expect(async () => {
    await card.locator(".ruins-fund input").fill(amount);
    await card.locator(".ruins-fund-go").click();
    await expect(ruinsPanel(page).locator(".message-success")).toContainText(text, { timeout: 5_000 });
  }).toPass({ timeout: 40_000, intervals: [2_000] });
}

test.describe("폐허 복원", () => {
  test.use({ account: "admin" });

  test("시험 폐허 → 행정 건물 = 주인 → 넣기 → 모금 열기 → 목표를 채우면 도시가 되살아난다", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(240_000);
    await page.goto("/economy/production");
    const panel = ruinsPanel(page);
    await expect(panel.getByRole("heading", { name: message("ko", "ruins_title") })).toBeVisible({
      timeout: 15_000,
    });
    await expect(panel.locator('[data-part="ruins-balance"]')).toBeVisible({ timeout: 15_000 });
    await clickFor(page, panel.locator(".ruins-dev-currency"), message("ko", "ruins_dev_currency_done"));

    // 첫 폐허: 주인 → 4,000 → 모금 열기 → 남은 6,000 → 되살아남
    const first = await makeRuin(page);
    const firstId = Number(await first.getAttribute("data-ruin"));
    await claim(page, first);
    await expect(first.locator('[data-part="ruin-progress"]')).toBeVisible();
    await fund(page, first, "4000", message("ko", "ruins_funded", { amount: "4,000" }));
    await expect(first.locator('[data-part="ruin-progress"]')).toContainText("4,000");
    await clickFor(page, first.locator(".ruins-open"), message("ko", "ruins_opened", { id: firstId }));
    await expect(first).toHaveAttribute("data-state", "open", { timeout: 15_000 });
    await fund(page, first, "6000", message("ko", "ruins_restored", { id: firstId }));
    await expect(panel.locator(`li[data-ruin="${String(firstId)}"]`)).toHaveCount(0, { timeout: 15_000 });

    // 둘째 폐허: 주인 → 모금 열기 → 2,500만 넣고 남긴다(사진·다른 시험용)
    const second = await makeRuin(page);
    const secondId = Number(await second.getAttribute("data-ruin"));
    await claim(page, second);
    await clickFor(page, second.locator(".ruins-open"), message("ko", "ruins_opened", { id: secondId }));
    await fund(page, second, "2500", message("ko", "ruins_funded", { amount: "2,500" }));
    await expect(second).toHaveAttribute("data-state", "open");
    await expect(second.locator(".ruins-share")).not.toHaveCount(0);
    expect(await horizontalOverflow(page)).toEqual([]);
    await elementShot(panel, "ruins-pastel-ko-390");
    expect(deviceErrors).toEqual([]);
  });

  for (const look of [
    { theme: "dark", language: "en", viewport: "phone", width: 390 },
    { theme: "pastel", language: "ko", viewport: "desktop", width: 1440 },
    { theme: "dark", language: "en", viewport: "desktop", width: 1440 },
  ] as const) {
    test.describe(`${look.theme}·${look.language}·${look.width}`, () => {
      test.use({ account: "admin", theme: look.theme, language: look.language, ...VIEWPORTS[look.viewport] });

      test("폐허 칸이 넘치지 않는다(사진)", async ({ page, deviceErrors }) => {
        await page.goto("/economy/production");
        const panel = ruinsPanel(page);
        await expect(panel.getByRole("heading", { name: message(look.language, "ruins_title") })).toBeVisible(
          {
            timeout: 15_000,
          },
        );
        await expect(panel.locator('li[data-part="ruin-card"]').first()).toBeVisible({ timeout: 15_000 });
        expect(await horizontalOverflow(page)).toEqual([]);
        await elementShot(panel, `ruins-${look.theme}-${look.language}-${look.width}`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
