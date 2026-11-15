// 채집 오브젝트 편집기 화면 시험 — 기획 D-552(사용자 "오브젝트마다 3d 모델 및 티어범위, 해당오브젝트 출현 2차맵 지형등을 관리하는 에디터페이지
// 만들어라"), docs/adr/2026-11-15-gather-object-tiers.md 7절.
// - /dev/gather-objects(dev): 오브젝트 49종 목록, 광맥을 고르면 티어 범위 T2~T9·미리 보기 구리부터, 위를 T6으로 내리면 바뀐 항목 1개,
//   [되돌리기]로 0. 굴림표(고래 무리)는 범위 칸이 없다. 거르기(어군)로 다섯 줄.
// - 배치·사진: 개발 화면 테마 둘(네온·라이트) × 390·1440, 가로 넘침 없음.
import type { Page } from "@playwright/test";
import { horizontalOverflow, shot } from "./helpers/screen.ts";
import { expect, test } from "./helpers/test.ts";

const screenOf = (page: Page) => page.locator(".go-screen");

async function open(page: Page): Promise<void> {
  await page.goto("/dev/gather-objects");
  await expect(screenOf(page)).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
}

test.describe("채집 오브젝트 편집기", () => {
  test.use({ account: "dev" });

  test("광맥 티어 범위를 고치고 되돌린다, 굴림표는 범위가 없다, 어군으로 거른다", async ({
    page,
    deviceErrors,
  }) => {
    await open(page);
    const screen = screenOf(page);
    await expect(page.locator(".go-table tbody tr")).toHaveCount(49);
    await page.locator('tr[data-row="ore_vein"] .go-pick').click();
    await expect(screen).toHaveAttribute("data-selected", "ore_vein");
    const panel = page.locator(".go-panel");
    const tiers = panel.locator('[data-part="tiers"]');
    await expect(tiers).toHaveAttribute("data-tiers", "2-9");
    // 미리 보기: 유효 스탯 20에서 구리 95%·철 5%(표 하나 → 범위 T2~T9 → 대표 아이템 구리)
    await expect(panel.locator(".go-chances li").first()).toHaveAttribute("data-item", "copper_ore");
    await expect(panel.locator('.go-chances li[data-item="copper_ore"] .dev-num')).toHaveText("95.0%");
    await tiers.locator('select[data-edge="max"]').selectOption("6");
    await expect(tiers).toHaveAttribute("data-tiers", "2-6");
    await expect(page.locator('tr[data-row="ore_vein"] td[data-tiers]')).toHaveAttribute("data-tiers", "2-6");
    await expect(screen).toHaveAttribute("data-changes", "1");
    await page.locator(".go-pending .button-small").first().click();
    await expect(screen).toHaveAttribute("data-changes", "0");
    // 굴림표(고래 무리): 범위 칸이 없고 표를 보인다
    await page.locator('tr[data-row="whale_pod"] .go-pick').click();
    await expect(panel.locator('[data-part="tiers"]')).toHaveAttribute("data-tiers", "");
    await expect(panel.locator('[data-part="tiers"] select')).toHaveCount(0);
    // 거르기: 어군 다섯(민물·연안·대륙붕·큰 어군·고래 무리)
    await page.locator(".go-filters select").selectOption("school");
    await expect(screen).toHaveAttribute("data-rows", "5");
    expect(deviceErrors).toEqual([]);
  });

  test("지형별 자리: 바이옴을 더하고 지표를 켜면 바뀐 항목이 생긴다", async ({ page, deviceErrors }) => {
    await open(page);
    const screen = screenOf(page);
    await page.locator('tr[data-row="oasis"] .go-pick').click();
    const terrain = page.locator('.go-panel [data-part="terrain"]');
    await expect(terrain.locator(".go-biomes li")).toHaveCount(1);
    await terrain.locator(".go-row select").selectOption("savanna");
    await terrain.locator(".go-row .button-small").click();
    await expect(terrain.locator(".go-biomes li")).toHaveCount(2);
    await terrain.locator('.go-surface[data-surface="gravel"]').click();
    await expect(terrain.locator('.go-surface[data-surface="gravel"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(screen).toHaveAttribute("data-changes", "1");
    expect(deviceErrors).toEqual([]);
  });

  for (const devTheme of ["neon", "light"] as const)
    for (const width of [390, 1440] as const)
      test.describe(`${devTheme}·${width}px`, () => {
        test.use({ devTheme, language: "ko", viewport: { width, height: width === 390 ? 844 : 900 } });
        test(`배치: 가로 넘침 없음, 사진 (${devTheme} ${width})`, async ({ page, deviceErrors }) => {
          await open(page);
          await page.locator('tr[data-row="ore_vein"] .go-pick').click();
          await page.evaluate(() => document.fonts.ready.then(() => undefined));
          expect(await horizontalOverflow(page)).toEqual([]);
          if (width === 390) await page.locator(".go-panel").scrollIntoViewIfNeeded();
          await shot(page, `gather-objects-${devTheme}-${width}`);
          expect(deviceErrors).toEqual([]);
        });
      });
});
