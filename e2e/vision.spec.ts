// 2차맵 시야 전송 화면 시험 — ADR 2026-10-31-s3-server-stage 3절(사용자 결정 U3), 작업 묶음 WP-B
// player는 내 유닛도 탐사도 없으면 2차맵이 열리지 않는다(not_visible), 시험 단추도 없다. dev·admin은 전체 보기 권한이 있어
// 늘 열리지만(처음에는 내 유닛 0개), [시험 일꾼 받기]로 내 유닛을 받고 [전체 보기]로 거르지 않은 흐름을 본다. 표지로 본다.
import { horizontalOverflow, shot } from "./helpers/screen.ts";
import { expect, test } from "./helpers/test.ts";

test.describe("dev", () => {
  test.use({ account: "dev" });

  test("처음에는 내 유닛이 없고, 시험 일꾼을 받으면 보이며, 전체 보기를 켜고 끌 수 있다", async ({
    page,
    deviceErrors,
  }) => {
    await page.goto("/map");
    const screen = page.locator(".map-screen");
    await expect(screen).toHaveAttribute("data-feed", "live", { timeout: 15_000 });
    await expect(screen).toHaveAttribute("data-units", "0");
    await page.locator(".map-dev-spawn").click();
    await expect(screen).toHaveAttribute("data-feed", "live", { timeout: 15_000 });
    await expect
      .poll(async () => Number(await screen.getAttribute("data-units")), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(5);
    const observe = page.locator(".map-dev-observe");
    await expect(observe).toHaveAttribute("aria-pressed", "false");
    await observe.click();
    await expect(observe).toHaveAttribute("aria-pressed", "true");
    await expect(screen).toHaveAttribute("data-feed", "live", { timeout: 15_000 });
    await observe.click();
    await expect(observe).toHaveAttribute("aria-pressed", "false");
    await expect(screen).toHaveAttribute("data-feed", "live", { timeout: 15_000 });
    expect(deviceErrors).toEqual([]);
  });

  // 사진(390px 기본, 기본 테마 둘 × 한국어·영어): 시험 단추 줄이 넘치지 않는지
  for (const theme of ["pastel", "dark"] as const) {
    for (const language of ["ko", "en"] as const) {
      test.describe(`사진 ${theme} ${language}`, () => {
        test.use({ theme, language });

        test(`2차맵 시험 단추 (${theme}·${language})`, async ({ page }) => {
          await page.goto("/map");
          await expect(page.locator(".map-screen")).toHaveAttribute("data-feed", "live", { timeout: 15_000 });
          await expect(page.locator(".map-dev-spawn")).toBeVisible();
          expect(await horizontalOverflow(page)).toEqual([]);
          await shot(page, `map-vision-dev-390-${theme}-${language}`);
        });
      });
    }
  }
});

test.describe("player", () => {
  test.use({ account: "player" });

  test("내 유닛도 탐사도 없으면 볼 수 없고, 시험 단추가 없다", async ({ page }) => {
    await page.goto("/map");
    await expect(page.locator(".map-screen")).toHaveAttribute("data-feed", "failed");
    await expect(page.locator(".map-dev-spawn")).toHaveCount(0);
    await expect(page.locator(".map-dev-observe")).toHaveCount(0);
  });
});
