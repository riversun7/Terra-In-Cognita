// 2차맵 시야 전송 화면 시험 — ADR 2026-10-31-s3-server-stage 3절(사용자 결정 U3), 작업 묶음 WP-B
// player는 내 유닛도 탐사도 없으면 2차맵이 열리지 않는다(not_visible), 시험 단추도 없다. dev·admin은 전체 보기 권한이 있어
// 늘 열리지만(처음에는 내 유닛 0개), [시험 일꾼 받기]로 내 유닛을 받고 [전체 보기]로 거르지 않은 흐름을 본다. 표지로 본다.
// 2차맵 낮밤(ADR 2026-10-28-s1-second-map "구현하며 정한 것 (2차맵 낮밤)"): ?second-map-time=<0~24>로 지역 시각을 멈추고
// 빛 표지(data-light-*)와 화면 밝기를 본다. 사진은 낮·박명·밤 × 390·1440 × 기본 테마 둘(세계 색은 테마와 상관없다, HUD만 바뀐다).
import type { Page } from "@playwright/test";
import { horizontalOverflow, shot } from "./helpers/screen.ts";
import { expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

/** 낮밤 사진·시험 시각(S1 시험 2차맵 = 적도·경도 0 근처, 달력 3일째: 달이 거의 보름) — 낮 12시, 박명 18:09(항성 약 −2°), 밤 23시(달 약 52°) */
const DAY_NIGHT_HOURS = { day: "12", dusk: "18.15", night: "23" } as const;

/** 2차맵을 그 주소로 열고 준비를 기다린 뒤, 전체 보기를 켜 안개를 끈다(dev) */
async function openMap(page: Page, search: string): Promise<void> {
  await page.goto(`/map${search}`);
  const screen = page.locator(".map-screen");
  await expect(screen).toHaveAttribute("data-status", "ready", { timeout: 15_000 });
  await expect(screen).toHaveAttribute("data-feed", "live", { timeout: 15_000 });
  await page.locator(".map-dev-observe").click();
  await expect(page.locator(".map-dev-observe")).toHaveAttribute("aria-pressed", "true");
  await expect(screen).toHaveAttribute("data-feed", "live", { timeout: 15_000 });
}

/** 화면 한 부분의 평균 밝기(0~1, 사진을 찍어 브라우저에서 푼다 — PNG 해석 의존성 없이) */
async function meanBrightness(page: Page, clip: { x: number; y: number; width: number; height: number }) {
  const png = await page.screenshot({ clip, animations: "disabled" });
  // 이 함수는 브라우저에서 돈다
  return page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no 2d context");
    context.drawImage(bitmap, 0, 0);
    const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += 0.299 * (data[i] ?? 0) + 0.587 * (data[i + 1] ?? 0) + 0.114 * (data[i + 2] ?? 0);
    }
    return sum / (data.length / 4) / 255;
  }, png.toString("base64"));
}

/** HUD를 피한 지도 부분(390×844: 위 판 아래·아래 안내 위·오른쪽 단추 왼쪽) */
const MAP_CLIP = { x: 20, y: 480, width: 280, height: 200 };

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

test.describe("2차맵 낮밤", () => {
  test.use({ account: "dev" });
  // 시험 일꾼이 생긴 dev 계정은 정산 사건으로 복귀 요약이 뜰 수 있다 — 대화상자가 지도 단추를 가리지 않게 띄우지 않는다
  test.beforeEach(async ({ page }) => {
    await rewriteTrpc(page, { "summary.get": hideSummary });
  });

  test("지역 시각을 바꾸면 빛 표지와 화면 밝기가 바뀌고, 끄면 고정 빛, 주소가 없으면 서버 시계다", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(120_000);
    const screen = page.locator(".map-screen");
    const flat = async (): Promise<number> => Number(await screen.getAttribute("data-light-flat"));

    await openMap(page, `?second-map-time=${DAY_NIGHT_HOURS.day}`);
    await expect(screen).toHaveAttribute("data-light-clock", "fixed");
    await expect(screen).toHaveAttribute("data-light-day", "1.000");
    await expect(screen).toHaveAttribute("data-light-source", "sun");
    const dayFlat = await flat();
    expect(dayFlat).toBeGreaterThan(0.95);
    const dayBrightness = await meanBrightness(page, MAP_CLIP);

    await openMap(page, `?second-map-time=${DAY_NIGHT_HOURS.night}`);
    await expect(screen).toHaveAttribute("data-light-day", "0.000");
    await expect(screen).toHaveAttribute("data-light-source", "moon");
    const nightFlat = await flat();
    expect(nightFlat).toBeLessThan(dayFlat - 0.25);
    expect(nightFlat).toBeGreaterThan(0.5);
    const nightBrightness = await meanBrightness(page, MAP_CLIP);
    // 밤은 눈에 띄게 어둡지만 검지 않다(밤 바닥)
    expect(nightBrightness).toBeLessThan(dayBrightness * 0.85);
    expect(nightBrightness).toBeGreaterThan(dayBrightness * 0.35);

    await openMap(page, `?second-map-time=${DAY_NIGHT_HOURS.dusk}`);
    await expect.poll(async () => Number(await screen.getAttribute("data-light-day"))).toBeGreaterThan(0.1);
    expect(Number(await screen.getAttribute("data-light-day"))).toBeLessThan(0.9);

    await openMap(page, "?second-map-sky=off");
    await expect(screen).toHaveAttribute("data-light-clock", "off");
    await expect(screen).toHaveAttribute("data-light-flat", "1.000");
    await expect(screen).not.toHaveAttribute("data-light-hour", /./);

    // 주소가 없으면 서버 시계(앱 연결이 잰 시계 차이)로 지금 시각의 빛
    await openMap(page, "");
    await expect(screen).toHaveAttribute("data-light-clock", "server", { timeout: 15_000 });
    await expect(screen).toHaveAttribute("data-light-hour", /^\d+\.\d\d$/);
    expect(deviceErrors).toEqual([]);
  });

  // 사진: 낮·박명·밤 × 390·1440 × 기본 테마 둘. 유닛이 있는 북쪽(시험 일꾼 자리)을 보도록 끌어 올린다
  for (const [size, viewport] of [
    ["390", VIEWPORTS.phone],
    ["1440", VIEWPORTS.desktop],
  ] as const) {
    for (const theme of ["pastel", "dark"] as const) {
      test.describe(`사진 ${size} ${theme}`, () => {
        test.use({ ...viewport, theme });

        test(`2차맵 낮·박명·밤 (${size}·${theme})`, async ({ page }) => {
          test.setTimeout(120_000);
          await openMap(page, "");
          const screen = page.locator(".map-screen");
          if (Number(await screen.getAttribute("data-units")) < 5) {
            await page.locator(".map-dev-spawn").click();
            await expect
              .poll(async () => Number(await screen.getAttribute("data-units")), { timeout: 15_000 })
              .toBeGreaterThanOrEqual(5);
          }
          for (const [name, hour] of Object.entries(DAY_NIGHT_HOURS)) {
            await openMap(page, `?second-map-time=${hour}`);
            const box = await page.locator(".map-view canvas").boundingBox();
            if (!box) throw new Error("no canvas");
            const x = box.x + box.width / 2;
            // 조금 멀리 본 뒤 북쪽으로 두 번 끈다
            await page.mouse.move(x, box.y + box.height / 2);
            await page.mouse.wheel(0, 300);
            for (let k = 0; k < 2; k++) {
              await page.mouse.move(x, box.y + box.height * 0.3);
              await page.mouse.down();
              await page.mouse.move(x, box.y + box.height * 0.85, { steps: 10 });
              await page.mouse.up();
            }
            await expect(screen).toHaveAttribute("data-light-clock", "fixed");
            await page.waitForTimeout(1500);
            expect(await horizontalOverflow(page)).toEqual([]);
            await shot(page, `second-map-daynight-${size}-${theme}-${name}`);
          }
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
