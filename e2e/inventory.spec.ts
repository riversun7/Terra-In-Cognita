// 인벤토리 화면·2차맵 [가방]·홈 자산 카드 시험 — 사용자 요청 2026-11-14(docs/adr/2026-11-14-inventory-screen.md):
// "인벤토리 시스템 추가. 하단 메뉴에도 유닛이 보유한 아이템 리스트 볼수있는 버튼. 첫 페이지에도 통합으로 유닛별, 창고별, 건물별, 전체".
// - /inventory: 칸 넷(전체·유닛별·창고별·건물별), [전체]는 지갑·한눈에(종류·자리·추정 가치)·합계, [유닛별]은 내 사이보그 줄을 펼치면 화물·장비 판.
// - 옛 /economy/warehouse는 인벤토리 [창고별]로 바뀐다. 경제 한눈에 [자산] 카드·홈 [자산] 카드가 인벤토리로 간다.
// - 2차맵 아래 탭 [가방]: 고른 유닛(내 사이보그)의 화물·장비 판, [인벤토리에서 보기]는 그 유닛을 펼친 [유닛별] 칸.
// - 사진: 390 × 파스텔·다크(인벤토리 전체·유닛별, 2차맵 가방).
import type { Page } from "@playwright/test";
import { navButton } from "./helpers/mapHud.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";

async function open(page: Page, path: string): Promise<void> {
  await rewriteTrpc(page, { "summary.get": hideSummary });
  await page.goto(path);
}

async function openMap(page: Page): Promise<void> {
  await open(page, "/map");
  const screen = page.locator(".map-screen[data-map-key]");
  await expect(screen).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
  await expect(screen).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
}

test.describe("인벤토리: 플레이어", () => {
  test.use({ account: "player" });

  test("칸 넷, [전체] 한눈에·합계, [유닛별] 내 사이보그 펼치기, 옛 창고 주소는 [창고별]", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(120_000);
    await open(page, "/inventory");
    const screen = page.locator("section.inventory");
    await expect(screen).toHaveAttribute("data-tab", "all");
    await expect(screen.locator(".eco-tab")).toHaveCount(4);
    await expect(screen.locator(".eco-wallet")).toBeVisible();
    await expect(screen.locator('[data-fact="kinds"]')).toHaveText(/^\d+$/);
    await expect(screen.locator('[data-fact="value"]')).not.toBeEmpty();
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);

    // [유닛별]: 유닛 줄, 첫 줄을 누르면 펼쳐 화물·장비 판(칸 고르기)
    await screen.locator('.eco-tab[data-tab="units"]').click();
    await expect(page).toHaveURL(/\/inventory\?tab=units$/);
    const first = screen.locator(".inventory-unit").first();
    await expect(first).toBeVisible({ timeout: 20_000 });
    await first.locator(".inventory-unit-head").click();
    await expect(first).toHaveAttribute("data-open", "true");
    await expect(page).toHaveURL(/tab=units&unit=\d+/);
    await expect(first.locator(".holding-slot-grid")).toBeVisible({ timeout: 20_000 });

    // [창고별]·[건물별]
    await screen.locator('.eco-tab[data-tab="warehouses"]').click();
    await expect(screen).toHaveAttribute("data-tab", "warehouses");
    await screen.locator('.eco-tab[data-tab="buildings"]').click();
    await expect(screen).toHaveAttribute("data-tab", "buildings");

    // 옛 창고 칸 주소 → 인벤토리 [창고별](주소 바꾸기)
    await page.goto("/economy/warehouse");
    await expect(page).toHaveURL(/\/inventory\?tab=warehouses$/);
    // 경제 한눈에 [자산] 카드 → 인벤토리, 경제 칸에 [창고]가 없다
    await page.goto("/economy");
    await expect(page.locator('.eco-tab[data-owns~="economy_warehouse"]')).toHaveCount(0);
    await expect(page.locator('.eco-card-link[data-card="inventory"] [data-metric="value"]')).toBeVisible();
    await page.locator('.eco-card-link[data-card="inventory"]').click();
    await expect(page).toHaveURL(/\/inventory$/);
    expect(deviceErrors).toEqual([]);
  });

  test("홈 [자산] 카드: 추정 가치·종류, [인벤토리 열기]", async ({ page, deviceErrors }) => {
    await open(page, "/");
    const card = page.locator('.home-card[data-card="assets"]');
    await card.scrollIntoViewIfNeeded();
    await expect(card.locator('[data-metric="value"]')).toBeVisible({ timeout: 20_000 });
    await card.locator(".home-link-button").click();
    await expect(page).toHaveURL(/\/inventory$/);
    expect(deviceErrors).toEqual([]);
  });

  test("2차맵 [가방]: 고른 내 사이보그의 화물·장비 판, 다시 누르면 닫힘, [인벤토리에서 보기]", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(150_000);
    await openMap(page);
    const screen = page.locator(".map-screen");
    const cyborg = (await screen.getAttribute("data-cyborg")) ?? "";
    expect(cyborg).toMatch(/^\d+$/);
    await expect(screen).toHaveAttribute("data-selected", cyborg, { timeout: 15_000 });
    const bag = navButton(page, "bag");
    await bag.click();
    await expect(bag).toHaveAttribute("aria-pressed", "true");
    const sheet = page.locator(".map-bag");
    await expect(sheet).toHaveAttribute("data-unit", cyborg);
    await expect(sheet.locator(".holding-slot-grid")).toBeVisible({ timeout: 20_000 });
    expect(await horizontalOverflow(page)).toEqual([]);
    await bag.click();
    await expect(sheet).toHaveCount(0);
    await bag.click();
    await sheet.locator(".map-bag-more").click();
    await expect(page).toHaveURL(new RegExp(`/inventory\\?tab=units&unit=${cyborg}$`));
    await expect(page.locator(`.inventory-unit[data-unit="${cyborg}"]`)).toHaveAttribute("data-open", "true");
    expect(deviceErrors).toEqual([]);
  });
});

const THEMES: readonly Theme[] = ["pastel", "dark"];

test.describe("인벤토리 사진(390)", () => {
  test.use({ account: "player", viewport: { width: 390, height: 844 } });
  for (const theme of THEMES) {
    test.describe(theme, () => {
      test.use({ theme });

      test(`인벤토리 전체·유닛별, 2차맵 가방 (${theme})`, async ({ page, deviceErrors }) => {
        test.setTimeout(150_000);
        await open(page, "/inventory");
        await expect(page.locator('[data-fact="kinds"]')).toHaveText(/^\d+$/);
        await shot(page, `inventory-all-390-${theme}`);
        await page.locator('.eco-tab[data-tab="units"]').click();
        const first = page.locator(".inventory-unit").first();
        await first.locator(".inventory-unit-head").click();
        await expect(first.locator(".holding-slot-grid")).toBeVisible({ timeout: 20_000 });
        await shot(page, `inventory-units-390-${theme}`);
        await openMap(page);
        await navButton(page, "bag").click();
        await expect(page.locator(".map-bag .holding-slot-grid")).toBeVisible({ timeout: 20_000 });
        await shot(page, `map-bag-390-${theme}`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
