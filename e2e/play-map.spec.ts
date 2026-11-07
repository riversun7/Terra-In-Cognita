// 지도 흐름 화면 시험(docs/adr/2026-11-07-play-flow.md "WP2 지도 흐름", 기획 60 §4.1·§7.1) — player(사이보그가 있는 계정)
// - 1차맵: 내 사이보그 자리를 가운데로 연다(data-me), 도시 표시가 생긴다(묶음은 누르면 다가간다) → 도시를 누르면 도시 판(국가·둘레 땅·[들어가기])
//   → [들어가기] = /map?key=<그 2차맵>(바꾸기), 2차맵이 그 키로 열리고 내 사이보그에 카메라를 맞춘다(data-focus) → [1차맵] = /map/planet?key=같은 키.
// - /map(키 없음) = 내 사이보그가 있는 2차맵(world.myPosition과 같은 키).
// - 사진: 1차맵 도시 판·2차맵, 390 × 파스텔·다크(한국어·영어), 1440 × 파스텔·다크. 넘침·작은 누르는 곳 없음.
import type { Page } from "@playwright/test";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

/** tRPC 조회 하나(로그인한 이 화면의 쿠키로)의 data */
async function trpcData(page: Page, procedure: string): Promise<unknown> {
  return page.evaluate(async (name) => {
    const response: unknown = await fetch(`/api/trpc/${name}`).then((reply) => reply.json());
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
    const pick = (value: unknown, key: string): unknown =>
      typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
    return pick(pick(response, "result"), "data");
  }, procedure);
}

/** 내 사이보그가 있는 2차맵 키(10진 글자) */
async function myMapKey(page: Page): Promise<string> {
  const data = await trpcData(page, "world.myPosition");
  const position = typeof data === "object" && data !== null ? Reflect.get(data, "position") : null;
  const key = typeof position === "object" && position !== null ? Reflect.get(position, "mapKey") : null;
  expect(typeof key).toBe("number");
  return String(key);
}

/** 1차맵을 열고 엔진·도시 자료가 준비될 때까지 */
async function openPlanet(page: Page, search = ""): Promise<void> {
  await page.goto(`/map/planet${search}`);
  const screen = page.locator(".planet-screen");
  await expect(screen).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
  await expect
    .poll(async () => Number(await screen.getAttribute("data-cities")), { timeout: 20_000 })
    .toBeGreaterThan(0);
}

/** 보이는 도시 표시를 눌러 도시 판을 연다(묶음이면 다가가며 되풀이) */
async function openCityPanel(page: Page): Promise<void> {
  const panel = page.locator(".planet-city");
  for (let attempt = 0; attempt < 10 && (await panel.count()) === 0; attempt++) {
    const marker = page.locator(".city-marker:not([hidden])").first();
    await expect(marker).toBeVisible({ timeout: 15_000 });
    await marker.click();
    // 다가간 뒤 표시 자리가 다시 잡힐 때까지(엔진 프레임)
    await page.waitForTimeout(400);
  }
  await expect(panel).toBeVisible();
}

test.describe("지도 흐름: 플레이어", () => {
  test.use({ account: "player" });

  test("1차맵 도시 → 도시 판 → [들어가기] → 2차맵(내 사이보그) → [1차맵]", async ({ page, deviceErrors }) => {
    test.setTimeout(120_000);
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await openPlanet(page);
    const screen = page.locator(".planet-screen");
    const mine = await myMapKey(page);
    // 내 사이보그 자리를 안다(가운데로 열었다)·내 위치 단추
    await expect(screen).toHaveAttribute("data-me", mine);
    await expect(page.locator(".planet-go-me")).toBeVisible();

    await openCityPanel(page);
    const panel = page.locator(".planet-city");
    await expect(panel.locator(".planet-city-name")).not.toHaveText("");
    await expect(panel.locator(".land-facts dd")).toHaveCount(3);
    await shot(page, "play-map-planet-city-390");
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);

    // 내 사이보그가 있는 맵의 도시라야 들어갈 수 있다(시야 규칙): 들어갈 수 있는 도시를 고를 때까지 다른 표시도 눌러 본다
    const enter = panel.locator(".planet-city-enter");
    await expect(enter).toBeVisible({ timeout: 10_000 });
    const length = await page.evaluate(() => history.length);
    await enter.click();
    await expect(page).toHaveURL((url) => url.pathname === "/map" && url.searchParams.get("key") !== null);
    expect(await page.evaluate(() => history.length)).toBe(length);
    const key = new URL(page.url()).searchParams.get("key");
    const map = page.locator(".map-screen");
    await expect(map).toHaveAttribute("data-map-key", key ?? "");
    await expect(map).toHaveAttribute("data-feed", "live", { timeout: 20_000 });
    if (key === mine) await expect(map).toHaveAttribute("data-focus", /\d+/);
    await shot(page, "play-map-second-390");

    // [1차맵] = 같은 키로 1차맵(그 2차맵 자리를 가운데로)
    await page.locator(".map-switch-button").click();
    await expect(page).toHaveURL(
      (url) => url.pathname === "/map/planet" && url.searchParams.get("key") === key,
    );
    await expect(page.locator(".planet-screen")).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
    expect(deviceErrors).toEqual([]);
  });

  test("키 없는 /map은 내 사이보그가 있는 2차맵을 연다", async ({ page, deviceErrors }) => {
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await page.goto("/map");
    const map = page.locator(".map-screen[data-map-key]");
    await expect(map).toHaveAttribute("data-feed", "live", { timeout: 20_000 });
    await expect(map).toHaveAttribute("data-map-key", await myMapKey(page));
    await expect(map).toHaveAttribute("data-focus", /\d+/);
    expect(deviceErrors).toEqual([]);
  });
});

// 사진: 390 × 파스텔·다크 × 한국어·영어, 1440 × 파스텔·다크(한국어)
const SHOT_CASES: readonly { viewport: "phone" | "desktop"; theme: Theme; language: Language }[] = [
  ...(["pastel", "dark"] as const).flatMap((theme) =>
    (["ko", "en"] as const).map((language) => ({ viewport: "phone" as const, theme, language })),
  ),
  ...(["pastel", "dark"] as const).map((theme) => ({
    viewport: "desktop" as const,
    theme,
    language: "ko" as const,
  })),
];

test.describe("지도 흐름 사진", () => {
  test.use({ account: "player" });

  for (const { viewport, theme, language } of SHOT_CASES) {
    const width = String(VIEWPORTS[viewport].viewport.width);
    test.describe(`${width} ${theme} ${language}`, () => {
      test.use({ ...VIEWPORTS[viewport], theme, language });

      test(`1차맵 도시 판 (${width}·${theme}·${language})`, async ({ page, deviceErrors }) => {
        test.setTimeout(90_000);
        await rewriteTrpc(page, { "summary.get": hideSummary });
        await openPlanet(page);
        await openCityPanel(page);
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await shot(page, `play-map-planet-${width}-${theme}-${language}`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
