// 개발자 2차맵 시험 화면 시험 — /dev/second-map (ADR 2026-10-31-second-map-from-planet "구현하며 정한 것 (개발자 2차맵 시험)").
// - 서버 길(월드 행성 S2 시험 행성): 시험 2차맵이 열리고, 시각·낮밤·높이 과장·격자·이웃 3×3·모델 상한을 바꾸면 엔진 요약이 따른다.
//   지도를 누르면 칸 정보, 빨리 가기(산)·면 i j로 다른 2차맵을 연다. 보기 전용이라 유닛·안개가 없다.
// - 기기 길(행성 표본 명왕성 F7, 월드 행성이 아님): 이 기기 워커가 행성부터 만든다.
// - player는 권한 없음(e2e/dev.spec.ts가 본다).
// 표지(class·data-*)로 본다: .sml-body[data-status·data-source·data-map-key·data-exaggeration·data-grid·data-sky·
// data-neighbours·data-props·data-light-hour]. 사진은 390px 기본 테마 둘 × 한국어·영어(E2E_SHOTS_DIR).
import type { Page } from "@playwright/test";
import { horizontalOverflow, shot } from "./helpers/screen.ts";
import { expect, test } from "./helpers/test.ts";

/** 기기 길 첫 생성(F7 행성 + 2차맵)은 부하에 따라 수십 초다 */
const DEVICE_TIMEOUT = 120_000;

const body = (page: Page) => page.locator(".sml-body");

async function ready(page: Page, timeout = 30_000): Promise<void> {
  await expect(body(page)).toHaveAttribute("data-status", "ready", { timeout });
  // 엔진 요약(1초마다)이 붙을 때까지
  await expect(body(page)).toHaveAttribute("data-props", /\d+/, { timeout });
}

/** 지도 가운데를 누른다(칸 정보) */
async function tapCentre(page: Page): Promise<void> {
  const view = page.locator(".sml-view canvas");
  const box = await view.boundingBox();
  if (!box) throw new Error("no canvas");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test.describe("dev", () => {
  test.use({ account: "dev" });

  test("서버 길: 시험 2차맵을 열고 시각·낮밤·높이 과장·격자·이웃·모델 상한을 바꾸고, 누르면 칸 정보, 다른 자리로 간다", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(150_000);
    await page.goto("/dev/second-map");
    await ready(page);
    await expect(body(page)).toHaveAttribute("data-source", "server");
    // 시험 2차맵 = 월드 시험 자리(S2 시험 행성 F9 면 0 (282, 328), protocol S1_TEST_MAP_KEY)
    const testKey = await body(page).getAttribute("data-map-key");
    await expect(page.locator('input[data-input="key"]')).toHaveValue(testKey ?? "");
    await expect(page.locator('input[data-input="i"]')).toHaveValue("282");
    await expect(page.locator('input[data-input="j"]')).toHaveValue("328");
    // 유닛·안개 없음(보기 전용), 기본 정오
    await expect
      .poll(async () => Number(await body(page).getAttribute("data-light-hour")), { timeout: 10_000 })
      .toBeCloseTo(12, 0);

    // 시각: 6시로
    await page.locator(".sml-hour").fill("6");
    await expect
      .poll(async () => Number(await body(page).getAttribute("data-light-hour")), { timeout: 10_000 })
      .toBeCloseTo(6, 0);
    // 낮밤 끔: 지역 시각이 없다(고정 빛)
    await page.locator(".sml-sky").uncheck();
    await expect(body(page)).toHaveAttribute("data-sky", "off");
    await expect(body(page)).not.toHaveAttribute("data-light-hour", /./, { timeout: 10_000 });
    await page.locator(".sml-sky").check();

    // 높이 과장 ×4(단계 4), 격자, 이웃 3×3, 모델 상한 0
    await page.locator(".sml-exaggeration").fill("4");
    await expect(body(page)).toHaveAttribute("data-exaggeration", "4");
    await page.locator(".sml-grid").check();
    await expect(body(page)).toHaveAttribute("data-grid", "on");
    await page.locator(".sml-neighbours").check();
    await expect(body(page)).toHaveAttribute("data-neighbours", "8", { timeout: 30_000 });
    await page.locator(".sml-prop-cap").fill("0");
    await expect(body(page)).toHaveAttribute("data-props", "0", { timeout: 10_000 });

    // 누르면 칸 정보(누른 곳·높이·경사·지표·물·엄폐·소품 + 행성 칸 값)
    await tapCentre(page);
    const facts = page.locator(".sml-facts").first();
    await expect(facts.locator("dt")).toHaveCount(7);
    await expect(page.locator(".sml-facts")).toHaveCount(2);

    // 빨리 가기: 산 → 다른 2차맵(서버 길 그대로)
    await page.locator('.sml-preset[data-preset="mountain"]').click();
    await ready(page);
    const mountain = await body(page).getAttribute("data-map-key");
    expect(mountain).not.toBe(testKey);
    await expect(body(page)).toHaveAttribute("data-source", "server");

    // 면·i·j로 열기
    await page.locator('input[data-input="face"]').fill("0");
    await page.locator('input[data-input="i"]').fill("300");
    await page.locator('input[data-input="j"]').fill("330");
    await page.locator(".sml-open-cell").click();
    await ready(page);
    // 연 2차맵의 칸이 넣은 면·i·j다(받은 칸 값으로 칸을 다시 채운다)
    await expect(page.locator('input[data-input="i"]')).toHaveValue("300");
    await expect(page.locator('input[data-input="j"]')).toHaveValue("330");
    expect(await body(page).getAttribute("data-map-key")).not.toBe(mountain);
    // 틀린 키는 받지 않는다
    await page.locator('input[data-input="key"]').fill("12345");
    await page.locator(".sml-open-key").click();
    await expect(body(page)).toHaveAttribute("data-status", "failed");
    await expect(body(page)).toHaveAttribute("data-error", "bad_key");
    expect(deviceErrors).toEqual([]);
  });

  test("기기 길: 행성 표본(명왕성 F7)은 이 기기에서 만들고 칸 정보가 나온다", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(DEVICE_TIMEOUT + 60_000);
    await page.goto("/dev/second-map");
    await ready(page);
    await page.locator(".sml-planet").selectOption("solar_pluto");
    await ready(page, DEVICE_TIMEOUT);
    await expect(body(page)).toHaveAttribute("data-source", "device");
    await tapCentre(page);
    await expect(page.locator(".sml-facts")).toHaveCount(2);
    // 같은 행성의 다른 자리는 행성을 다시 만들지 않는다(빠르다)
    await page.locator('.sml-preset[data-preset="grassland"]').click();
    await ready(page, 30_000);
    await expect(body(page)).toHaveAttribute("data-source", "device");
    expect(deviceErrors).toEqual([]);
  });

  // 사진: 390px 개발 화면 테마 둘(ADR 2026-11-02-dev-ui) × 한국어·영어. 높이 과장 ×4 + 격자로 산 자리를 찍는다
  for (const theme of ["neon", "light"] as const) {
    for (const language of ["ko", "en"] as const) {
      test.describe(`사진 ${theme} ${language}`, () => {
        test.use({ devTheme: theme, language });

        test(`390px (${theme}·${language})`, async ({ page }) => {
          test.setTimeout(90_000);
          await page.goto("/dev/second-map");
          await ready(page);
          await page.locator('.sml-preset[data-preset="mountain"]').click();
          await ready(page);
          expect(await horizontalOverflow(page)).toEqual([]);
          await page.waitForTimeout(800);
          await shot(page, `second-map-lab-390-${theme}-${language}-x1`);
          await page.locator(".sml-exaggeration").fill("4");
          await page.locator(".sml-grid").check();
          await expect(body(page)).toHaveAttribute("data-exaggeration", "4");
          await page.waitForTimeout(1200);
          await shot(page, `second-map-lab-390-${theme}-${language}-x4`);
          // 판 아래(칸 정보)까지
          await tapCentre(page);
          await page.locator(".sml-facts").first().scrollIntoViewIfNeeded();
          await shot(page, `second-map-lab-390-${theme}-${language}-cell`);
        });
      });
    }
  }
});
