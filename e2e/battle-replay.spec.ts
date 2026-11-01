// 전투 다시보기 화면 시험 — /dev/battle-replay (docs/adr/2026-11-01-battle-replay.md 7절).
// - dev: 서버가 시범 6 대 6을 기록하고(battleReplay.demo) 시험 2차맵 지형 위에서 재생한다. 재생·멈춤·배속·찾기·처음부터,
//   유닛 고르기·따라가기·시야, 기록 판, 끝 요약(유닛 12줄), 새 시드. 기기 오류 없음, 가로 넘침 없음.
// - player는 권한 없음(e2e/dev.spec.ts가 본다).
// - 사진: 390·1440 × 기본 테마 둘 × 한국어·영어. 싸움 중(효과·숫자가 보이는 시각)과 끝 요약(E2E_SHOTS_DIR).
// - 측정(E2E_MEASURE=1): 1배속 재생 중 엔진 한 프레임 p95·초당 프레임·그리기 호출(헤드리스 SwiftShader라 휴대폰 값 아님).
// 표지(class·data-*)로 본다: .brl-screen[data-status·data-seed·data-bytes·data-events·data-arena],
// .br-view[data-status·data-playing·data-time·data-ended·data-speed·data-fx·data-numbers·data-render-p95·data-fps·data-draw-calls].
import type { Page } from "@playwright/test";
import { horizontalOverflow, shot } from "./helpers/screen.ts";
import { expect, test } from "./helpers/test.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

const screen = (page: Page) => page.locator(".brl-screen");
const view = (page: Page) => page.locator(".br-view");
const timeOf = async (page: Page): Promise<number> => Number(await view(page).getAttribute("data-time"));

async function ready(page: Page): Promise<void> {
  await expect(screen(page)).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
  await expect(view(page)).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
}

/** 찾기 막대로 그 시각에 둔다(멈춘 채) */
async function seek(page: Page, ms: number): Promise<void> {
  if ((await view(page).getAttribute("data-playing")) === "true") await page.locator(".br-play").click();
  await expect(view(page)).toHaveAttribute("data-playing", "false");
  await page.locator(".br-seek").fill(String(ms));
  await expect.poll(() => timeOf(page)).toBe(ms);
}

/** 효과가 둘 넘게 보이는 시각을 찾아 둔다(싸움 중 사진) */
async function seekToAction(page: Page): Promise<number> {
  const end = Number(await page.locator(".br-seek").getAttribute("max"));
  for (let ms = 8000; ms < end; ms += 300) {
    await page.locator(".br-seek").fill(String(ms));
    await expect.poll(() => timeOf(page)).toBe(ms);
    const fx = Number(await view(page).getAttribute("data-fx"));
    const numbers = Number(await view(page).getAttribute("data-numbers"));
    if (fx >= 2 && numbers >= 1) return ms;
  }
  throw new Error("no moment with effects");
}

test.describe("dev", () => {
  test.use({ account: "dev" });

  test("시범 6 대 6을 기록해 재생한다: 재생·멈춤·배속·찾기·처음부터, 유닛 고르기·따라가기·시야, 기록 판, 끝 요약, 새 시드", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(150_000);
    await page.goto("/dev/battle-replay");
    await ready(page);
    await expect(screen(page)).toHaveAttribute("data-seed", "1");
    expect(Number(await screen(page).getAttribute("data-bytes"))).toBeGreaterThan(1000);
    expect(Number(await screen(page).getAttribute("data-events"))).toBeGreaterThan(100);
    await expect(screen(page)).toHaveAttribute("data-arena", /^(second_map|plain)$/);
    // 열자마자 재생한다
    await expect(view(page)).toHaveAttribute("data-playing", "true");
    await expect.poll(() => timeOf(page), { timeout: 10_000 }).toBeGreaterThan(300);
    // 멈춤 → 시각이 그대로
    await page.locator(".br-play").click();
    await expect(view(page)).toHaveAttribute("data-playing", "false");
    const paused = await timeOf(page);
    await page.waitForTimeout(400);
    expect(await timeOf(page)).toBe(paused);
    // 8배속 재생 → 빨리 간다
    await page.locator(".br-speed button").last().click();
    await expect(view(page)).toHaveAttribute("data-speed", "8");
    await page.locator(".br-play").click();
    await expect.poll(() => timeOf(page), { timeout: 10_000 }).toBeGreaterThan(paused + 4000);
    // 유닛 줄: 12칩, 고르면 자세히, 따라가기
    await expect(page.locator(".br-unit-chip")).toHaveCount(12);
    await page.locator(".br-unit-chip").nth(3).click();
    await expect(page.locator(".br-unit-chip").nth(3)).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".br-unit-detail")).toBeVisible();
    await page.locator(".br-unit-tools > button").click();
    await expect(page.locator(".br-unit-tools > button")).toHaveAttribute("aria-pressed", "true");
    // 시야: B편만
    await page.locator(".br-vision select").selectOption({ index: 2 });
    // 기록 판(좁은 화면은 접힘)
    await page.locator(".br-log-toggle").click();
    await expect(page.locator(".br-log-line").first()).toBeVisible();
    // 끝으로 → 끝 요약(유닛 12줄)
    const end = Number(await page.locator(".br-seek").getAttribute("max"));
    await seek(page, end);
    await expect(view(page)).toHaveAttribute("data-ended", "true");
    await expect(page.locator(".br-summary")).toBeVisible();
    await expect(page.locator(".br-summary-table tbody tr")).toHaveCount(12);
    await expect(page.locator(".br-log-end")).toBeVisible();
    // 처음부터
    await page.locator(".br-summary-actions .button-primary").click();
    await expect(view(page)).toHaveAttribute("data-playing", "true");
    await expect.poll(() => timeOf(page)).toBeLessThan(end);
    expect(await horizontalOverflow(page)).toEqual([]);
    // 새 시드
    await page.locator(".brl-seed input").fill("2");
    await page.locator(".brl-form .button-primary").click();
    await ready(page);
    await expect(screen(page)).toHaveAttribute("data-seed", "2");
    expect(deviceErrors).toEqual([]);
  });

  test("측정: 1배속 재생 중 엔진 한 프레임(헤드리스, 휴대폰 값 아님)", async ({ page }) => {
    test.skip(!process.env.E2E_MEASURE, "E2E_MEASURE=1일 때만");
    test.setTimeout(90_000);
    await page.goto("/dev/battle-replay");
    await ready(page);
    await seek(page, 10_000);
    await page.locator(".br-play").click();
    await page.waitForTimeout(6000);
    const p95 = Number(await view(page).getAttribute("data-render-p95"));
    const fps = Number(await view(page).getAttribute("data-fps"));
    const calls = Number(await view(page).getAttribute("data-draw-calls"));
    const bytes = Number(await screen(page).getAttribute("data-bytes"));
    test.info().annotations.push({
      type: "measure",
      description: `battle replay 390px: render p95 ${p95}ms, ${fps} fps, ${calls} draw calls, replay ${bytes} B`,
    });
    console.info(
      `[measure] battle replay 390px: render p95 ${p95}ms, ${fps} fps, ${calls} draw calls, replay ${bytes} B`,
    );
    expect(fps).toBeGreaterThan(0);
  });

  // 사진: 390·1440 × 기본 테마 둘 × 한국어·영어(싸움 중 + 끝 요약)
  for (const size of ["390", "1440"] as const) {
    for (const theme of ["pastel", "dark"] as const) {
      for (const language of ["ko", "en"] as const) {
        test.describe(`사진 ${size} ${theme} ${language}`, () => {
          test.use({ theme, language, ...(size === "1440" ? VIEWPORTS.desktop : VIEWPORTS.phone) });

          test(`${size}px (${theme}·${language})`, async ({ page }) => {
            test.setTimeout(120_000);
            await page.goto("/dev/battle-replay");
            await ready(page);
            await page.locator(".br-play").click();
            await expect(view(page)).toHaveAttribute("data-playing", "false");
            const at = await seekToAction(page);
            await page.waitForTimeout(300);
            expect(await horizontalOverflow(page)).toEqual([]);
            await shot(page, `battle-replay-${size}-${theme}-${language}-action`);
            // 효과가 다른 모습(조금 뒤)도 한 장
            await page.locator(".br-seek").fill(String(at + 400));
            await page.waitForTimeout(300);
            await shot(page, `battle-replay-${size}-${theme}-${language}-action2`);
            const end = Number(await page.locator(".br-seek").getAttribute("max"));
            await page.locator(".br-seek").fill(String(end));
            await expect(page.locator(".br-summary")).toBeVisible();
            await page.waitForTimeout(300);
            await shot(page, `battle-replay-${size}-${theme}-${language}-summary`);
          });
        });
      }
    }
  }
});
