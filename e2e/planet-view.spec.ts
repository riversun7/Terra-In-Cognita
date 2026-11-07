// 지도 보기 시험 — ADR 2026-11-07-planet-view(사용자 개선 요청 2026-11-07: 확대 단계 표시, 검은 우주·항성계 보기, 극축 고정 회전).
// - 1차맵 오른쪽 확대 단계(.zoom-ladder): [−]를 누르면 단계가 줄고 1단계 끝에서 한 번 더 = 항성계 보기(.planet-system, 검정 바탕,
//   천체 9개, 지금 행성 강조) → [+] = 1차맵 1단계. 가장 멀리에서 휠을 한 번 더 굴려도 항성계 보기다(끝 너머 밀기).
// - [+]로 5단계 → 끝에서 한 번 더 = 가운데 2차맵(내 사이보그 맵)으로 들어간다(D-6018) → 2차맵 [−] 끝 = 1차맵 5단계(?stage=5).
// - 돌림판: 끌어도 화면 위쪽은 북쪽(방위 0°), 세로로 많이 끌어도 위도는 80°를 넘지 않는다(data-camera).
// 사진: 390px × 파스텔·다크 × 한국어·영어(확대 단계·항성계 보기), 1440px 파스텔 항성계 보기, 2차맵 확대 단계(E2E_SHOTS_DIR).
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

/** 확대 움직임(300ms)이 끝나고 엔진이 단계를 알릴 때까지 */
const STEP_WAIT_MS = 450;

async function openPlanet(page: Page, search = ""): Promise<void> {
  await rewriteTrpc(page, { "summary.get": hideSummary });
  await page.goto(`/map/planet${search}`);
  await expect(page.locator(".planet-screen")).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
  await expect(page.locator(".planet-screen")).toHaveAttribute("data-zoom-stage", /^[1-5]$/);
}

async function stageOf(page: Page): Promise<number> {
  return Number(await page.locator(".planet-screen").getAttribute("data-zoom-stage"));
}

/** data-camera = 위도,경도,거리,고도,방위,기울기 */
async function cameraOf(page: Page): Promise<{ lat: number; heading: number }> {
  const raw = (await page.locator(".planet-screen").getAttribute("data-camera")) ?? "";
  const [lat = Number.NaN, , , , heading = Number.NaN] = raw.split(",").map(Number);
  return { lat, heading };
}

/** [−]를 눌러 항성계 보기까지(지나온 단계를 돌려준다) */
async function zoomOutToSystem(page: Page): Promise<number[]> {
  const seen = [await stageOf(page)];
  const system = page.locator(".planet-system");
  for (let i = 0; i < 8 && (await system.count()) === 0; i++) {
    await page.locator(".zoom-ladder-out").click();
    await page.waitForTimeout(STEP_WAIT_MS);
    if ((await system.count()) === 0) seen.push(await stageOf(page));
  }
  await expect(system).toBeVisible();
  return seen;
}

test.describe("확대 단계·항성계 보기: 플레이어", () => {
  test.use({ account: "player" });

  test("[−]로 1단계 → 한 번 더 = 항성계 보기(검정, 지금 행성 강조) → [+] = 1차맵 1단계", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(120_000);
    await openPlanet(page);
    const ladder = page.locator(".zoom-ladder");
    await expect(ladder).toBeVisible();
    const seen = await zoomOutToSystem(page);
    // 단계는 줄기만 하고 1단계를 지난다
    expect(seen.toSorted((a, b) => b - a)).toEqual(seen);
    expect(seen.at(-1)).toBe(1);
    const screen = page.locator(".planet-screen");
    await expect(screen).toHaveAttribute("data-system-view", "true");
    await expect(ladder).toHaveAttribute("data-rung", "system");
    await expect(ladder.locator(".zoom-ladder-out")).toBeDisabled();
    const system = page.locator(".planet-system");
    expect(await system.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
      "rgb(0, 0, 0)",
    );
    await expect(page.locator(".ssv-body")).toHaveCount(9);
    await expect(page.locator(".ssv-body[data-current]")).toHaveCount(1);
    await expect(system).toHaveAttribute("data-selected", "earth");
    await expect(page.locator(".planet-system-back")).toBeVisible();
    // 다른 천체(목성)를 누르면 카드가 바뀐다(아직 갈 수 없다)
    await page.locator('.ssv-body[data-kind="gas_giant"]').first().click();
    await expect(system).toHaveAttribute("data-selected", "jupiter");
    await expect(page.locator(".planet-system-card-note")).toBeVisible();
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);
    // [+] = 행성(1단계)으로
    await page.locator(".zoom-ladder-in").click();
    await expect(system).toHaveCount(0);
    await expect(screen).toHaveAttribute("data-zoom-stage", "1");
    await expect(ladder).toHaveAttribute("data-rung", "1");
    expect(deviceErrors).toEqual([]);
  });

  test("가장 멀리(?stage=1)에서 휠을 한 번 더 굴리면 항성계 보기, 휠을 위로 굴리면 돌아온다", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(90_000);
    await openPlanet(page, "?stage=1");
    await expect(page.locator(".planet-screen")).toHaveAttribute("data-zoom-stage", "1");
    const box = await page.locator(".map-view canvas").boundingBox();
    if (!box) throw new Error("no canvas");
    // 가운데는 내 자리 표시(도시 덧그림)가 휠을 받을 수 있어 비킨 곳에서 굴린다
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.58);
    await page.mouse.wheel(0, 400);
    await expect(page.locator(".planet-system")).toBeVisible();
    await page.waitForTimeout(400);
    await page.mouse.wheel(0, -120);
    await expect(page.locator(".planet-system")).toHaveCount(0);
    expect(deviceErrors).toEqual([]);
  });

  test("[+]로 5단계 → 끝에서 한 번 더 = 가운데 2차맵 → 2차맵 [−] 끝 = 1차맵 5단계", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(150_000);
    await openPlanet(page);
    const screen = page.locator(".planet-screen");
    const mine = await screen.getAttribute("data-me");
    expect(mine).toMatch(/^\d+$/);
    const seen: number[] = [await stageOf(page)];
    for (let i = 0; i < 10 && new URL(page.url()).pathname === "/map/planet"; i++) {
      await page.locator(".zoom-ladder-in").click();
      await page.waitForTimeout(STEP_WAIT_MS);
      // 화면 가운데 2차맵 키는 1초 요약으로 갱신된다: 5단계 끝에서 한 번 기다린다
      if (new URL(page.url()).pathname === "/map/planet") {
        seen.push(await stageOf(page));
        if (seen.at(-1) === 5) await page.waitForTimeout(1100);
      }
    }
    expect(seen).toContain(5);
    expect(seen.toSorted((a, b) => a - b)).toEqual(seen);
    await expect(page).toHaveURL((url) => url.pathname === "/map" && url.searchParams.get("key") === mine);
    const map = page.locator(".map-screen");
    await expect(map).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
    const ladder = page.locator(".zoom-ladder");
    await expect(ladder).toHaveAttribute("data-rung", "local");
    for (let i = 0; i < 14 && new URL(page.url()).pathname === "/map"; i++) {
      await ladder.locator(".zoom-ladder-out").click();
      await page.waitForTimeout(200);
    }
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === "/map/planet" &&
        url.searchParams.get("key") === mine &&
        url.searchParams.get("stage") === "5",
    );
    await expect(page.locator(".planet-screen")).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
    await expect(page.locator(".planet-screen")).toHaveAttribute("data-zoom-stage", "5");
    expect(deviceErrors).toEqual([]);
  });

  test("돌림판: 끌어도 북쪽이 위(방위 0°), 세로로 많이 끌어도 위도 80° 안", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(90_000);
    // 멀리서(그리는 타일이 적다 — 헤드리스 소프트웨어 WebGL은 끌기마다 다시 그리기가 느리다)
    await openPlanet(page, "?planet-view=40,20,2500");
    const box = await page.locator(".map-view canvas").boundingBox();
    if (!box) throw new Error("no canvas");
    // 위 판(머리·성능 줄)과 아래 판을 피한 지도 가운데 띠에서 끈다
    const cx = box.x + box.width * 0.35;
    const cy = box.y + box.height * 0.48;
    // 비스듬히 여러 번 끈다(트랙볼이면 방위가 돌아간다)
    for (const [dx, dy] of [
      [120, 60],
      [-110, 50],
      [90, -90],
    ] as const) {
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + dx, cy + dy, { steps: 6 });
      await page.waitForTimeout(120);
      await page.mouse.up();
    }
    // 아래로 길게(북쪽으로) 여러 번
    for (let i = 0; i < 4; i++) {
      await page.mouse.move(cx, box.y + box.height * 0.32);
      await page.mouse.down();
      await page.mouse.move(cx, box.y + box.height * 0.64, { steps: 6 });
      await page.waitForTimeout(120);
      await page.mouse.up();
    }
    await expect.poll(async () => (await cameraOf(page)).lat, { timeout: 5_000 }).toBeGreaterThan(60);
    const camera = await cameraOf(page);
    expect(Math.abs(camera.heading)).toBeLessThan(0.01);
    expect(camera.lat).toBeLessThanOrEqual(80.001);
    expect(deviceErrors).toEqual([]);
  });
});

const SHOT_CASES: { theme: Theme; language: Language }[] = [
  { theme: "pastel", language: "ko" },
  { theme: "dark", language: "ko" },
  { theme: "pastel", language: "en" },
  { theme: "dark", language: "en" },
];

test.describe("확대 단계·항성계 보기 사진", () => {
  test.use({ account: "player" });

  for (const { theme, language } of SHOT_CASES) {
    test.describe(`390 ${theme} ${language}`, () => {
      test.use({ theme, language });

      test(`1차맵 확대 단계·항성계 보기 (390·${theme}·${language})`, async ({ page, deviceErrors }) => {
        test.setTimeout(90_000);
        await openPlanet(page);
        await expect(page.locator(".zoom-ladder-caption")).toHaveText(
          message(language, "zoom_caption_planet"),
        );
        expect(await smallTapTargets(page)).toEqual([]);
        await shot(page, `planet-view-ladder-390-${theme}-${language}`);
        await zoomOutToSystem(page);
        await page.waitForTimeout(400);
        expect(await horizontalOverflow(page)).toEqual([]);
        await shot(page, `planet-view-system-390-${theme}-${language}`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }

  test.describe("데스크톱", () => {
    test.use({ ...VIEWPORTS.desktop, theme: "pastel", language: "ko" });

    test("항성계 보기 1440 (pastel·ko)", async ({ page, deviceErrors }) => {
      test.setTimeout(90_000);
      await openPlanet(page, "?stage=1");
      await shot(page, "planet-view-stage1-1440-pastel-ko");
      await zoomOutToSystem(page);
      await page.waitForTimeout(400);
      await shot(page, "planet-view-system-1440-pastel-ko");
      expect(deviceErrors).toEqual([]);
    });
  });

  for (const theme of ["pastel", "dark"] as const) {
    test.describe(`2차맵 ${theme}`, () => {
      test.use({ theme, language: "ko" });

      test(`2차맵 확대 단계 (390·${theme})`, async ({ page, deviceErrors }) => {
        test.setTimeout(90_000);
        await rewriteTrpc(page, { "summary.get": hideSummary });
        await page.goto("/map");
        await expect(page.locator(".map-screen")).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
        await expect(page.locator(".zoom-ladder")).toHaveAttribute("data-rung", "local");
        expect(await smallTapTargets(page)).toEqual([]);
        await shot(page, `planet-view-local-390-${theme}`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
