// 지도 흐름 화면 시험(docs/adr/2026-11-07-play-flow.md "WP2 지도 흐름", 기획 60 §4.1·§7.1) — player(사이보그가 있는 계정)
// - 1차맵: 내 사이보그 자리를 가운데로 연다(data-me), 도시 표시가 생긴다(묶음은 누르면 다가간다) → 도시를 누르면 도시 판(국가·둘레 땅·[들어가기])
//   → [들어가기] = /map?key=<그 2차맵>(바꾸기), 2차맵이 그 키로 열리고 내 사이보그에 카메라를 맞춘다(data-focus) → [1차맵] = /map/planet?key=같은 키.
// - /map(키 없음) = 내 사이보그가 있는 2차맵(world.myPosition과 같은 키).
// - 사진: 1차맵 도시 판·2차맵, 390 × 파스텔·다크(한국어·영어), 1440 × 파스텔·다크. 넘침·작은 누르는 곳 없음.
// WP7(도시 안개·들어가기·카메라, docs/adr/2026-11-07-play-flow.md "WP7"):
// - 볼 수 없는 2차맵을 주소로 열면 다시 묻지 않고 까닭 + [1차맵에서 보기] → 1차맵 도시 판 [정찰 보내기] → 1차맵 명령 판([확정]은 막힘, 513).
// - 서버가 띄우지 않은 2차맵 = "아직 열려 있지 않습니다"(다시 시도 없음, unknown_map).
// - 내 사이보그가 없는 2차맵(dev = 전체 보기): ?at= 자리, 없으면 그 2차맵 도시 시청에 카메라(515).
// - 사진: 1차맵 명령 판 390 × 파스텔·다크 × 한국어·영어, 열리지 않은 2차맵 안내 390 × 파스텔·다크.
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
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

/** world.cities 도시 한 줄(시험이 보는 칸만) */
interface CityRow {
  readonly id: number;
  readonly mapKey: number;
  readonly loaded: boolean;
  readonly viewable: boolean;
  readonly start: boolean;
  readonly cellX: number;
  readonly cellY: number;
}

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;

/** 내가 받는 도시(서버가 아는 도시만 준다) */
async function citiesOf(page: Page): Promise<CityRow[]> {
  const list = field(await trpcData(page, "world.cities"), "cities");
  if (!Array.isArray(list)) return [];
  return list.map((entry: unknown) => ({
    id: Number(field(entry, "id")),
    mapKey: Number(field(entry, "mapKey")),
    loaded: field(entry, "loaded") === true,
    viewable: field(entry, "viewable") === true,
    start: field(entry, "start") === true,
    cellX: Number(field(entry, "cellX")),
    cellY: Number(field(entry, "cellY")),
  }));
}

/** 셀 키(면 레벨 9) 틀: 키 = 레벨 + 면 × 2^49 + 힐베르트 차례 × 2^31(packages/planet cellKey.ts) */
const FACE_SPAN = 2 ** 49;
const LEVEL9_SPAN = 2 ** 31;
const LEVEL9_CELLS = 4 ** 9;

/** 같은 면의 먼 칸 = 서버가 띄우지 않은 2차맵 키 */
function unloadedKey(key: number, taken: ReadonlySet<number>): number {
  const face = Math.floor(key / FACE_SPAN);
  const hilbert = (key - 9 - face * FACE_SPAN) / LEVEL9_SPAN;
  for (let step = 100_000; ; step += 1) {
    const next = face * FACE_SPAN + ((hilbert + step) % LEVEL9_CELLS) * LEVEL9_SPAN + 9;
    if (!taken.has(next)) return next;
  }
}

/** 띄웠지만 내가 볼 수 없는 2차맵의 도시(시험 세계는 2차맵 6장에 시작 도시를 나눈다) */
async function hiddenCity(page: Page): Promise<CityRow> {
  const city = (await citiesOf(page)).find((entry) => entry.loaded && !entry.viewable);
  if (!city) throw new Error("볼 수 없는 2차맵의 도시가 없습니다");
  return city;
}

/** 화면 가운데에 가장 가까운 보이는 도시 표시의 가운데(CSS px) */
async function nearestMarker(page: Page): Promise<{ x: number; y: number } | undefined> {
  const size = page.viewportSize() ?? { width: 390, height: 844 };
  const centers = await page.locator(".city-marker:not([hidden])").evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }),
  );
  const away = (point: { x: number; y: number }) =>
    Math.hypot(point.x - size.width / 2, point.y - size.height / 2);
  return centers.toSorted((a, b) => away(a) - away(b))[0];
}

/** 그 도시 표시를 눌러 도시 판을 연다(묶여 있으면 화면 가운데에 가장 가까운 표시를 눌러 다가간다) */
async function openCityPanelFor(page: Page, cityId: number): Promise<void> {
  const panel = page.locator(`.planet-city[data-city="${String(cityId)}"]`);
  for (let attempt = 0; attempt < 12 && (await panel.count()) === 0; attempt++) {
    const target = page.locator(`.city-marker[data-city="${String(cityId)}"]:not([hidden])`);
    if ((await target.count()) > 0) {
      await target.click();
    } else {
      const nearest = await nearestMarker(page);
      if (!nearest) throw new Error("보이는 도시 표시가 없습니다");
      await page.mouse.click(nearest.x, nearest.y);
    }
    await page.waitForTimeout(500);
  }
  await expect(panel).toBeVisible();
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

test.describe("도시 안개·들어가기·카메라(WP7): 플레이어", () => {
  test.use({ account: "player" });

  test("볼 수 없는 2차맵: 까닭 + [1차맵에서 보기] → [정찰 보내기] → 1차맵 명령 판", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(150_000);
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await page.goto("/");
    const city = await hiddenCity(page);
    await page.goto(`/map?key=${String(city.mapKey)}`);
    const map = page.locator(".map-screen[data-map-key]");
    await expect(map).toHaveAttribute("data-feed", "failed", { timeout: 20_000 });
    await expect(page.locator(".map-notice")).toContainText(message("ko", "world_city_not_visible"));
    await page.locator(".map-open-planet").click();
    await expect(page).toHaveURL(
      (url) => url.pathname === "/map/planet" && url.searchParams.get("key") === String(city.mapKey),
    );
    await expect(page.locator(".planet-screen")).toHaveAttribute("data-status", "ready", { timeout: 60_000 });

    await openCityPanelFor(page, city.id);
    const panel = page.locator(".planet-city");
    await expect(panel).toHaveAttribute("data-enter", "not_visible");
    await expect(panel.locator(".planet-city-enter")).toHaveCount(0);
    await panel.locator(".planet-city-scout").click();
    const order = page.locator(".planet-command");
    await expect(order).toBeVisible();
    await expect(order).toHaveAttribute("data-order", "scout");
    await expect(order.locator(".planet-command-confirm")).toBeDisabled();
    await order.getByRole("button", { name: message("ko", "world_command_move") }).click();
    await expect(order).toHaveAttribute("data-order", "move");
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);
    // 닫으면 도시 판으로 돌아간다
    await order.getByRole("button", { name: message("ko", "world_city_close") }).click();
    await expect(page.locator(".planet-city-scout")).toBeVisible();
    expect(deviceErrors).toEqual([]);
  });

  test("서버가 띄우지 않은 2차맵: 다시 묻지 않고 '아직 열려 있지 않습니다'", async ({
    page,
    deviceErrors,
  }) => {
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await page.goto("/");
    const cities = await citiesOf(page);
    const first = cities[0];
    if (!first) throw new Error("도시가 없습니다");
    const key = unloadedKey(first.mapKey, new Set(cities.map((city) => city.mapKey)));
    await page.goto(`/map?key=${String(key)}`);
    const map = page.locator(".map-screen[data-map-key]");
    await expect(map).toHaveAttribute("data-feed", "failed", { timeout: 20_000 });
    const notice = page.locator(".map-notice");
    await expect(notice).toContainText(message("ko", "world_city_not_loaded"));
    await expect(notice.getByRole("button", { name: message("ko", "retry") })).toHaveCount(0);
    await expect(page.locator(".map-open-planet")).toBeVisible();
    // 다시 구독하지 않는다(2초 뒤에도 그대로 실패, 구독 수 그대로). 구독 수는 1초마다 읽는 요약이라 처음 값이 설 때까지 기다린다
    await expect(map).toHaveAttribute("data-subscribes", /^\d+$/, { timeout: 5_000 });
    const subscribes = await map.getAttribute("data-subscribes");
    await page.waitForTimeout(2_000);
    await expect(map).toHaveAttribute("data-feed", "failed");
    expect(await map.getAttribute("data-subscribes")).toBe(subscribes);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("도시 안개·들어가기·카메라(WP7): 전체 보기 계정", () => {
  test.use({ account: "dev" });

  test("내 사이보그가 없는 2차맵: ?at= 자리, 없으면 그 2차맵 도시 시청에 카메라", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(120_000);
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await page.goto("/");
    const mine = await myMapKey(page);
    const cities = await citiesOf(page);
    const other = cities.find((city) => city.loaded && String(city.mapKey) !== mine);
    if (!other) throw new Error("다른 2차맵의 도시가 없습니다");
    const map = page.locator(".map-screen[data-map-key]");

    await page.goto(`/map?key=${String(other.mapKey)}&at=40,60`);
    await expect(map).toHaveAttribute("data-feed", "live", { timeout: 20_000 });
    await expect(map).toHaveAttribute("data-focus-source", "picked");
    await expect(map).toHaveAttribute("data-focus-at", "40,60");
    await expect(map).not.toHaveAttribute("data-focus", /./);
    // 카메라 목표(m) 비율 = 배치 칸 (40.5, 60.5) 비율(칸 크기와 상관없이)
    await expect
      .poll(
        async () => {
          const [x = 0, z = 1] = ((await map.getAttribute("data-camera")) ?? "").split(",").map(Number);
          return Math.abs(x / z - 40.5 / 60.5) < 0.02;
        },
        { timeout: 20_000 },
      )
      .toBe(true);

    // ?at=가 없으면 그 2차맵 도시 시청(시작 도시 먼저, ID 차례)
    const hall = cities
      .filter((city) => city.mapKey === other.mapKey)
      .toSorted((a, b) => Number(b.start) - Number(a.start) || a.id - b.id)[0];
    await page.goto(`/map?key=${String(other.mapKey)}`);
    await expect(map).toHaveAttribute("data-feed", "live", { timeout: 20_000 });
    await expect(map).toHaveAttribute("data-focus-source", "city");
    await expect(map).toHaveAttribute("data-focus-at", `${String(hall?.cellX)},${String(hall?.cellY)}`);
    expect(deviceErrors).toEqual([]);
  });
});

// 사진(WP7): 1차맵 명령 판 390 × 파스텔·다크 × 한국어·영어, 열리지 않은 2차맵 안내 390 × 파스텔·다크(한국어)
test.describe("도시 안개 사진", () => {
  test.use({ account: "player" });

  for (const theme of ["pastel", "dark"] as const) {
    for (const language of ["ko", "en"] as const) {
      test.describe(`390 ${theme} ${language}`, () => {
        test.use({ ...VIEWPORTS.phone, theme, language });

        test(`1차맵 명령 판 (390·${theme}·${language})`, async ({ page, deviceErrors }) => {
          test.setTimeout(120_000);
          await rewriteTrpc(page, { "summary.get": hideSummary });
          await page.goto("/");
          const city = await hiddenCity(page);
          await openPlanet(page, `?key=${String(city.mapKey)}`);
          await openCityPanelFor(page, city.id);
          await page.locator(".planet-city-scout").click();
          await expect(page.locator(".planet-command")).toBeVisible();
          expect(await horizontalOverflow(page)).toEqual([]);
          expect(await smallTapTargets(page)).toEqual([]);
          await shot(page, `play-fog-command-390-${theme}-${language}`);
          expect(deviceErrors).toEqual([]);
        });

        if (language === "ko") {
          test(`열리지 않은 2차맵 안내 (390·${theme})`, async ({ page, deviceErrors }) => {
            await rewriteTrpc(page, { "summary.get": hideSummary });
            await page.goto("/");
            const cities = await citiesOf(page);
            const key = unloadedKey(cities[0]?.mapKey ?? 9, new Set(cities.map((city) => city.mapKey)));
            await page.goto(`/map?key=${String(key)}`);
            await expect(page.locator(".map-open-planet")).toBeVisible({ timeout: 20_000 });
            expect(await horizontalOverflow(page)).toEqual([]);
            expect(await smallTapTargets(page)).toEqual([]);
            await shot(page, `play-fog-not-open-390-${theme}`);
            expect(deviceErrors).toEqual([]);
          });
        }
      });
    }
  }
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
