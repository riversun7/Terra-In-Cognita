// 지도 보기 시험 — ADR 2026-11-07-planet-view(사용자 개선 요청 2026-11-07: 확대 단계 표시, 검은 우주·항성계 보기, 극축 고정 회전).
// - 1차맵 오른쪽 확대 단계(.zoom-ladder): [−]를 누르면 단계가 줄고 1단계 끝에서 한 번 더 = 항성계 보기(.planet-system, 검정 바탕,
//   천체 9개, 지금 행성 강조) → [+] = 1차맵 1단계. 가장 멀리에서 휠을 한 번 더 굴려도 항성계 보기다(끝 너머 밀기).
// - [+]로 5단계 → 끝에서 한 번 더 = 가운데 2차맵(내 사이보그 맵)으로 들어간다(D-6018) → 2차맵 [−] 끝 = 1차맵 5단계(?stage=5).
// - 돌림판: 끌어도 화면 위쪽은 북쪽(방위 0°), 세로로 많이 끌어도 위도는 80°를 넘지 않는다(data-camera).
// - 처음 단계·운영진 표시(사용자 요청 2026-11-09): 1차맵은 늘 5단계로 연다. 성능 판(.map-perf)·고도 과장 막대는 운영진(dev·admin)에게만
//   보이고 플레이어에게는 없다(2차맵 성능 판도). 운영진 시험은 과장 ×1 → ×20의 화소 차이를 잰다(표준 출력).
// - 레이어(사용자 요청 2026-11-12, ADR 2026-11-07-planet-view "바뀜 (2026-11-12)"): 지형 → 고도(범례 m, 그림이 바뀐다) → 자원 분포(서버
//   지도를 받아 엔진에 넣는다, 원자재를 바꾸면 그림이 바뀐다) → 영토(자원 지도를 버리고, 영토 덧그림을 진하게, 누른 곳의 국가 줄).
// 사진: 390px × 파스텔·다크 × 한국어·영어(확대 단계·항성계 보기), 1440px 파스텔 항성계 보기, 2차맵 확대 단계,
// 390px × 파스텔·다크 레이어 셋(고도·자원·영토)(E2E_SHOTS_DIR).
import { closeOperatorMenu, openOperatorMenu, setPerfPanel } from "./helpers/mapHud.ts";
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type Language, type Theme, deviceOptions, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { placeBeaconNear, removeBeacon } from "./helpers/beacons.ts";
import { trpc } from "./helpers/wsCommands.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

/** 두 사진(같은 크기 PNG)의 화소 평균 차이(0~255, RGB 평균) — 브라우저에서 푼다(PNG 해석 의존성 없이, vision.spec.ts와 같은 방식) */
async function meanPixelDifference(page: Page, a: Buffer, b: Buffer): Promise<number> {
  // 이 함수는 브라우저에서 돈다
  return page.evaluate(
    async (pngs) => {
      const decoded: Uint8ClampedArray[] = [];
      for (const base64 of pngs) {
        const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("no 2d context");
        context.drawImage(bitmap, 0, 0);
        decoded.push(context.getImageData(0, 0, bitmap.width, bitmap.height).data);
      }
      const [x = new Uint8ClampedArray(), y = new Uint8ClampedArray()] = decoded;
      let sum = 0;
      for (let i = 0; i < x.length; i += 4) {
        for (let c = 0; c < 3; c++) sum += Math.abs((x[i + c] ?? 0) - (y[i + c] ?? 0));
      }
      return sum / ((x.length / 4) * 3);
    },
    [a.toString("base64"), b.toString("base64")] as const,
  );
}

/** 위 판·아래 판·도시 덧그림을 가리고 지도 가운데를 찍는다(가린 것은 되돌린다) */
async function mapOnlyShot(page: Page, name?: string): Promise<Buffer> {
  const style = await page.addStyleTag({
    content: ".map-hud, .city-overlay { visibility: hidden !important; }",
  });
  await page.waitForTimeout(150);
  if (name) await shot(page, name);
  const size = page.viewportSize() ?? { width: 390, height: 844 };
  const png = await page.screenshot({
    clip: { x: 0, y: size.height * 0.2, width: size.width, height: size.height * 0.6 },
    animations: "disabled",
  });
  await style.evaluate((node) => {
    node.parentNode?.removeChild(node);
  });
  return png;
}

/** 고도 과장 막대(운영 메뉴 안 — 바뀜 2026-11-14)를 옮기고 엔진이 받을 때까지(1초 요약) + 그린 프레임 */
async function setExaggeration(page: Page, value: number): Promise<void> {
  const menu = await openOperatorMenu(page);
  await menu.locator("#planet-exaggeration").fill(String(value));
  await expect(page.locator(".planet-screen")).toHaveAttribute("data-engine-exaggeration", String(value));
  await page.waitForTimeout(400);
}

/** 확대 움직임(300ms)이 끝나고 엔진이 단계를 알릴 때까지 */
const STEP_WAIT_MS = 450;

async function openPlanet(
  page: Page,
  search = "",
  edits: Readonly<Record<string, (data: unknown) => void>> = {},
): Promise<void> {
  await rewriteTrpc(page, { "summary.get": hideSummary, ...edits });
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
    // 처음부터 5단계다(사용자 요청 2026-11-09): 화면 가운데 2차맵 키(1초 요약)가 설 때까지 한 번 기다린다
    await expect(screen).toHaveAttribute("data-zoom-stage", "5");
    await page.waitForTimeout(1100);
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

// 사용자 요청 2026-11-09: 1차맵은 늘 가장 가까운 5단계로 열고, 성능 판(fps·ms·메모리·타일)은 운영진(gm·admin·dev)에게만 보인다
test.describe("처음 단계·성능 판: 플레이어", () => {
  test.use({ account: "player" });

  test("1차맵은 5단계로 열리고 성능 판·고도 과장 막대가 없다. 2차맵에도 성능 판이 없다", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(120_000);
    await openPlanet(page);
    await expect(page.locator(".planet-screen")).toHaveAttribute("data-zoom-stage", "5");
    await expect(page.locator(".zoom-ladder")).toHaveAttribute("data-rung", "5");
    // 엔진 요약(data-frames)이 선 뒤에도 성능 판을 그리지 않는다
    await expect(page.locator(".planet-screen")).toHaveAttribute("data-frames", /^\d+$/);
    await expect(page.locator(".map-perf")).toHaveCount(0);
    // 고도 과장 막대도 운영진만(플레이어는 늘 ×12 — 사용자 결정 2026-11-14)
    await expect(page.locator("#planet-exaggeration")).toHaveCount(0);
    await expect(page.locator(".planet-screen")).toHaveAttribute("data-engine-exaggeration", "12");
    await page.goto("/map");
    await expect(page.locator(".map-screen")).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
    // 1초 요약(엔진·프레임 값)이 몇 번 돈 뒤에도 성능 판이 없다
    await page.waitForTimeout(1500);
    await expect(page.locator(".map-perf")).toHaveCount(0);
    // 운영 메뉴도 운영진만(사용자 지적 2026-11-12)
    await expect(page.locator(".map-operator-menu-button")).toHaveCount(0);
    expect(deviceErrors).toEqual([]);
  });
});

for (const account of ["dev", "admin"] as const) {
  test.describe(`성능 판: 운영진 ${account}`, () => {
    test.use({ account });

    test(`성능 판은 처음 닫혀 있고 운영 메뉴로 켜면 1·2차맵 모두 보인다(기억), 고도 과장 막대 (${account})`, async ({
      page,
      deviceErrors,
    }) => {
      test.setTimeout(150_000);
      await openPlanet(page, "?planet-sky=off");
      const screen = page.locator(".planet-screen");
      // 처음은 닫힘(사용자 지적 2026-11-12 "Fast ms 같은 장보창도 토글로해라") → 운영 메뉴 [성능 표시]
      await expect(page.locator(".planet-screen")).toHaveAttribute("data-frames", /^\d+$/);
      await expect(screen.locator(".map-perf")).toHaveCount(0);
      await setPerfPanel(page, true);
      await closeOperatorMenu(page);
      await expect(screen.locator(".map-perf")).toBeVisible();
      await expect(screen.locator(".map-perf")).toContainText("fps");
      // 고도 과장 막대는 아래 판이 아니라 운영 메뉴 안(바뀜 2026-11-14), 처음 값 ×12
      await expect(page.locator("#planet-exaggeration")).toHaveCount(0);
      await expect(screen).toHaveAttribute("data-engine-exaggeration", "12");
      const menu = await openOperatorMenu(page);
      await expect(menu.locator("#planet-exaggeration")).toBeVisible();
      await expect(menu.locator(".planet-slider label")).toHaveText(
        message("ko", "planet_exaggeration", { value: 12 }),
      );
      await closeOperatorMenu(page);
      // 막대가 엔진까지 간다. 처음 보기(5단계)에서 그림이 얼마나 바뀌는지 잰다(표준 출력, 작업 기록에 옮겨 적는다)
      await expect(screen).toHaveAttribute("data-incomplete", "false", { timeout: 60_000 });
      await setExaggeration(page, 1);
      const low = await mapOnlyShot(page, account === "dev" ? "planet-exaggeration-x1-390" : undefined);
      const lowAgain = await mapOnlyShot(page);
      await setExaggeration(page, 20);
      const high = await mapOnlyShot(page, account === "dev" ? "planet-exaggeration-x20-390" : undefined);
      const noise = await meanPixelDifference(page, low, lowAgain);
      const change = await meanPixelDifference(page, low, high);
      console.log(
        `[measure] ${account} planet exaggeration x1→x20 mean pixel diff ${change.toFixed(2)} (noise ${noise.toFixed(2)})`,
      );
      await page.goto("/map");
      await expect(page.locator(".map-screen")).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
      // 이 기기에 기억한 값 — 2차맵도 켜진 채, 끄면 닫힌다
      await expect(page.locator(".map-screen .map-perf")).toBeVisible();
      await setPerfPanel(page, false);
      await expect(page.locator(".map-screen .map-perf")).toHaveCount(0);
      expect(deviceErrors).toEqual([]);
    });
  });
}

/** 레이어 판을 연다(접는 단추 — 바뀜 2026-11-14) */
async function openLayerSheet(page: Page): Promise<void> {
  const toggle = page.locator(".planet-layer-toggle");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(page.locator(".planet-layer-sheet")).toBeVisible();
}

/** 좁은 화면(하단 탭 단계, shell/layout.ts 37.5em = 600px 미만)인가 */
const narrowView = (page: Page): boolean => (page.viewportSize()?.width ?? 390) < 600;

/**
 * 레이어 판을 열어 레이어 버튼을 누르고 엔진이 받을 때까지(1초 요약) + 그린 프레임. 좁은 화면은 고르면 판이 닫히고 넓은 화면은 열린 채다
 * (기획 D-546 1436) — 닫힌 것을 본 뒤 keepOpen이면 다시 연다(범례를 보는 시험)
 */
async function chooseLayer(page: Page, layer: string, keepOpen = true): Promise<void> {
  await openLayerSheet(page);
  await page.locator(`[data-layer-option="${layer}"]`).click();
  await expect(page.locator(".planet-layer-toggle")).toHaveAttribute("data-layer-current", layer);
  if (narrowView(page)) await expect(page.locator(".planet-layer-sheet")).toHaveCount(0);
  else await expect(page.locator(".planet-layer-sheet")).toBeVisible();
  if (keepOpen) {
    await openLayerSheet(page);
    await expect(page.locator(`[data-layer-option="${layer}"]`)).toHaveAttribute("aria-pressed", "true");
  }
  await expect(page.locator(".planet-screen")).toHaveAttribute("data-engine-layer", layer);
  await page.waitForTimeout(400);
}

/** 객체 칸 읽기·목록(모르는 모양이면 undefined·빈 목록) */
const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

/** 내(player) 시작 도시와 그 국가·행성(world.cities·world.myPosition) */
async function myStartCity(page: Page): Promise<{ planetId: string; mapKey: number; factionId: number }> {
  if (!page.url().startsWith("http")) await page.goto("/health");
  const startCityId = field(
    field(await trpc(page, "world.myPosition", undefined), "position"),
    "startCityId",
  );
  const world = await trpc(page, "world.cities", undefined);
  const cities = list(field(world, "cities"));
  const city = cities.find((entry) => field(entry, "id") === startCityId) ?? cities[0];
  if (!city) throw new Error("no city");
  return {
    planetId: String(field(world, "planetId")),
    mapKey: Number(field(city, "mapKey")),
    factionId: Number(field(city, "factionId")),
  };
}

/** 레이어를 시험하는 보기: 3단계(나라가 보이는 거리), 하늘 끔(낮밤이 색을 바꾸지 않게) */
const LAYER_VIEW = "?stage=3&planet-sky=off";

test.describe("레이어: 플레이어", () => {
  test.use({ account: "player" });

  test("고도·자원 분포·영토: 엔진 레이어·범례·자원 지도 받기·버리기·누른 곳의 국가", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(180_000);
    await openPlanet(page, LAYER_VIEW);
    const screen = page.locator(".planet-screen");
    await expect(screen).toHaveAttribute("data-incomplete", "false", { timeout: 60_000 });
    // 처음은 접힌 단추 하나(지금 레이어 이름) — 판·범례 없음. 누르면 레이어 다섯, Esc면 닫힘
    const toggle = page.locator(".planet-layer-toggle");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveAttribute("data-layer-current", "terrain");
    await expect(toggle).toContainText(message("ko", "planet_layer_terrain"));
    await expect(page.locator(".planet-layer-sheet, [data-layer-option]")).toHaveCount(0);
    await openLayerSheet(page);
    await expect(page.locator("[data-layer-option]")).toHaveCount(5);
    await page.keyboard.press("Escape");
    await expect(page.locator(".planet-layer-sheet")).toHaveCount(0);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    const terrain = await mapOnlyShot(page);

    await chooseLayer(page, "elevation");
    await expect(page.locator('[data-legend="elevation"]')).toContainText(
      message("ko", "planet_elevation_land"),
    );
    await expect(page.locator('[data-legend="elevation"] .planet-legend-ticks')).toContainText(" m");
    const elevation = await mapOnlyShot(page);
    const elevationChange = await meanPixelDifference(page, terrain, elevation);

    await chooseLayer(page, "resource");
    await expect(screen).toHaveAttribute("data-material", "ore");
    await expect(screen).toHaveAttribute("data-resource", "ready", { timeout: 60_000 });
    await expect(screen).toHaveAttribute("data-resource-bytes", /^[1-9]\d*$/);
    await expect(page.locator('[data-legend="resource"]')).toContainText(
      message("ko", "planet_resource_high"),
    );
    const ore = await mapOnlyShot(page);
    await page.locator("#planet-material").selectOption("wood");
    await expect(screen).toHaveAttribute("data-material", "wood");
    await expect(screen).toHaveAttribute("data-resource", "ready", { timeout: 30_000 });
    await page.waitForTimeout(1200);
    const wood = await mapOnlyShot(page);
    const materialChange = await meanPixelDifference(page, ore, wood);
    await shot(page, "planet-resource-wood");
    // 목재·약초·목장은 서로 다른 바이옴·노이즈를 따른다(기획 D-536) — 셋의 지도가 다르게 보인다
    const materialShot = async (material: string) => {
      await page.locator("#planet-material").selectOption(material);
      await expect(screen).toHaveAttribute("data-material", material);
      await expect(screen).toHaveAttribute("data-resource", "ready", { timeout: 30_000 });
      await page.waitForTimeout(1200);
      await shot(page, `planet-resource-${material}`);
      return mapOnlyShot(page);
    };
    const herb = await materialShot("herb");
    const livestock = await materialShot("livestock");
    const woodHerb = await meanPixelDifference(page, wood, herb);
    const herbLivestock = await meanPixelDifference(page, herb, livestock);

    // 다른 레이어로 가면 자원 지도를 버린다(텍스처 메모리 0). 영토 덧그림은 진하게, 국가 이름표
    await chooseLayer(page, "territory");
    await expect(screen).toHaveAttribute("data-resource-bytes", "0");
    const overlay = page.locator(".city-overlay");
    await expect(overlay).toHaveAttribute("data-emphasis", "territory");
    await expect(toggle).toHaveAttribute("data-layer-current", "territory");
    await expect(page.locator('[data-legend="territory"]')).toContainText(
      message("ko", "planet_territory_capital"),
    );
    // 국가 고유 색(바뀜 2026-11-14): 범례 국가 칩마다 서로 다른 #rrggbb(여섯 색 돌려 쓰기가 아니다)
    const legendColors = await page
      .locator('[data-legend="territory"] .planet-legend-nations > li')
      .evaluateAll((items) =>
        items.map((item) => getComputedStyle(item).getPropertyValue("--nation").trim()),
      );
    expect(legendColors.length).toBeGreaterThan(1);
    expect(legendColors.every((color) => /^#[0-9a-f]{6}$/.test(color))).toBe(true);
    expect(new Set(legendColors).size).toBe(legendColors.length);
    // 영토(바뀜 2026-11-14): 아는 국가마다 영토 하나 이상, 화면에 그린 도시 원과 칠 경로, 보이는 국가 이름표
    await expect(overlay).toHaveAttribute("data-territories", /^[1-9]\d*$/);
    await expect(overlay).toHaveAttribute("data-drawn", /^[1-9]\d*$/);
    const filled = await page
      .locator(".city-area-fill")
      .evaluateAll((paths) => paths.filter((path) => (path.getAttribute("d") ?? "") !== "").length);
    expect(filled).toBeGreaterThan(0);
    await expect(page.locator('.city-area-label[data-shown="true"]').first()).toBeVisible();
    const labelNames = await page.locator('.city-area-label[data-shown="true"]').allTextContents();
    // 질문 1437 답(도시 사이까지 넓은 영토): 3단계에서 바로 영토 안을 누를 수 있다
    // 영토를 누르면 그 국가: 칠한 영토 안이면서 도시 표시·판 밖인 점을 화면에서 찾아(SVG isPointInFill) 누른다 → "영토: <국가>"
    const target = await page.evaluate(() => {
      const fills = [...document.querySelectorAll<SVGPathElement>(".city-area-fill")].filter(
        (path) => (path.getAttribute("d") ?? "") !== "",
      );
      for (let y = 160; y < window.innerHeight - 220; y += 6) {
        for (let x = 12; x < window.innerWidth - 12; x += 6) {
          if (document.elementFromPoint(x, y)?.closest(".city-marker, .map-hud, .map-panel") !== null)
            continue;
          const point = new DOMPoint(x, y);
          if (fills.some((path) => path.isPointInFill(point))) return { x, y };
        }
      }
      return null;
    });
    expect(target).not.toBeNull();
    const drawnRadius = await page.evaluate(() => {
      const widths = [...document.querySelectorAll<SVGPathElement>(".city-area-fill")]
        .filter((path) => (path.getAttribute("d") ?? "") !== "")
        .map((path) => path.getBBox().width / 2);
      return widths.length > 0 ? Math.min(...widths) : 0;
    });
    await page.mouse.click(target?.x ?? 0, target?.y ?? 0);
    await expect(screen).toHaveAttribute("data-picked", /\d/);
    // 땅을 누르면 레이어 판이 닫힌다
    await expect(page.locator(".planet-layer-sheet")).toHaveCount(0);
    const territoryPrefix = message("ko", "planet_territory_at", { nation: "" });
    await expect(page.locator(".planet-readout [role=status]")).toContainText(territoryPrefix);
    console.log(
      `[measure] planet territory labels ${labelNames.length} (${labelNames.join(", ")}), drawn areas ${await overlay.getAttribute("data-drawn")}, smallest drawn radius ${drawnRadius.toFixed(1)}px`,
    );
    console.log(
      `[measure] planet layers mean pixel diff terrain→elevation ${elevationChange.toFixed(2)}, ore→wood ${materialChange.toFixed(2)}, wood→herb ${woodHerb.toFixed(2)}, herb→livestock ${herbLivestock.toFixed(2)}`,
    );
    expect(elevationChange).toBeGreaterThan(2);
    expect(materialChange).toBeGreaterThan(0.5);
    expect(woodHerb).toBeGreaterThan(0.5);
    expect(herbLivestock).toBeGreaterThan(0.5);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("레이어 사진", () => {
  test.use({ account: "player" });

  for (const theme of ["pastel", "dark"] as const) {
    test.describe(`390 ${theme}`, () => {
      test.use({ theme, language: "ko" });

      test(`접힌·열린 레이어 단추, 고도·자원·영토 레이어(비콘 하나), 행성 전체 (390·${theme})`, async ({
        page,
        browser,
        deviceErrors,
      }) => {
        test.setTimeout(240_000);
        // 도시 소유 비콘(기획 D-546 1434): 내 시작 도시 둘레에 그 국가 비콘 하나(admin 개발 대신 놓기) — 영토 외곽선이 비콘까지 넓어진다
        const start = await myStartCity(page);
        const adminContext = await browser.newContext({
          ...VIEWPORTS.phone,
          ...deviceOptions({ account: "admin" }),
        });
        const admin = await adminContext.newPage();
        const placed = await placeBeaconNear(admin, start.planetId, start.mapKey, start.factionId);
        expect(placed).not.toBeNull();
        const seen = list(field(await trpc(page, "world.cities", undefined), "beacons"));
        expect(seen.some((beacon) => field(beacon, "id") === placed?.beaconId)).toBe(true);
        await openPlanet(page, LAYER_VIEW);
        const screen = page.locator(".planet-screen");
        await expect(screen).toHaveAttribute("data-incomplete", "false", { timeout: 60_000 });
        // 접힌 단추(바뀜 2026-11-14): 아래 판은 누른 칸 안내 + 한 줄
        expect(await smallTapTargets(page)).toEqual([]);
        await shot(page, `planet-layer-collapsed-390-${theme}`);
        await chooseLayer(page, "elevation");
        await shot(page, `planet-layer-elevation-390-${theme}`);
        await chooseLayer(page, "resource");
        await expect(screen).toHaveAttribute("data-resource", "ready", { timeout: 60_000 });
        await page.waitForTimeout(400);
        expect(await smallTapTargets(page)).toEqual([]);
        expect(await horizontalOverflow(page)).toEqual([]);
        await shot(page, `planet-layer-resource-390-${theme}`);
        await chooseLayer(page, "territory");
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await shot(page, `planet-layer-territory-open-390-${theme}`);
        // 판을 접고 영토만(국가 이름표)
        await page.locator(".planet-layer-toggle").click();
        await expect(page.locator(".planet-layer-sheet")).toHaveCount(0);
        await page.waitForTimeout(300);
        await shot(page, `planet-layer-territory-390-${theme}`);
        // 한 단계 더 가까이(4단계)
        await page.locator(".zoom-ladder-in").click();
        await page.waitForTimeout(STEP_WAIT_MS + 600);
        await shot(page, `planet-layer-territory-stage4-390-${theme}`);
        if (placed) await removeBeacon(admin, placed.beaconId);
        await adminContext.close();
        const near = await screen.getAttribute("data-engine-p95");
        // 행성 전체(1단계, 지형 + 영토 칠): 도시 원 모두가 화면 안 — 프레임 시간(덧그림 포함)을 잰다
        await page.goto("/map/planet?stage=1&planet-sky=off");
        await expect(screen).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
        await expect(screen).toHaveAttribute("data-incomplete", "false", { timeout: 60_000 });
        await page.waitForTimeout(1500);
        await shot(page, `planet-globe-390-${theme}`);
        await chooseLayer(page, "territory");
        await page.locator(".planet-layer-toggle").click();
        await page.waitForTimeout(1500);
        await shot(page, `planet-globe-territory-390-${theme}`);
        // 프레임 시간은 그리는 동안만 쌓인다: 끌어서 돌리며 잰다(덧그림 포함)
        const size = page.viewportSize() ?? { width: 390, height: 844 };
        await page.mouse.move(size.width / 2, size.height * 0.4);
        await page.mouse.down();
        for (let step = 0; step < 30; step++)
          await page.mouse.move(size.width / 2 + step * 4, size.height * 0.4);
        await page.mouse.up();
        await page.waitForTimeout(1200);
        console.log(
          `[measure] ${theme} territory engine p95 stage4 ${near ?? "?"}ms, stage1 ${(await screen.getAttribute("data-engine-p95")) ?? "?"}ms, drawn areas stage1 ${(await page.locator(".city-overlay").getAttribute("data-drawn")) ?? "?"}, blobs ${(await page.locator(".city-overlay").getAttribute("data-blobs")) ?? "?"}, cities ${(await screen.getAttribute("data-cities")) ?? "?"}`,
        );
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});

/** world.cities data에서 그 국가 도시 하나를 내 시작 도시 바로 옆으로 옮기고 두 국가 색을 비슷한 빨강 둘로(비슷한 색 이웃 무늬 시험) */
function closeRedNeighbours(startMapKey: number) {
  return (data: unknown): void => {
    const cities = list(field(data, "cities"));
    const home = cities.find((city) => field(city, "mapKey") === startMapKey) ?? cities[0];
    const other = cities.find((city) => field(city, "factionId") !== field(home, "factionId"));
    if (typeof home !== "object" || home === null || typeof other !== "object" || other === null) return;
    // 도시 원(아래 끝 4칸 ≈ 0.05°)이 겹치게 0.06° 옆
    Reflect.set(other, "latDeg", field(home, "latDeg"));
    Reflect.set(other, "lonDeg", Number(field(home, "lonDeg")) + 0.06);
    // 영토 점(판정과 같은 점, D-568)이 있으면 화면이 그 점을 쓴다 → 옮긴 위도·경도를 쓰게 뺀다
    Reflect.deleteProperty(other, "point");
    for (const faction of list(field(data, "factions"))) {
      if (typeof faction !== "object" || faction === null) continue;
      if (field(faction, "id") === field(home, "factionId")) Reflect.set(faction, "color", "#e5035d");
      if (field(faction, "id") === field(other, "factionId")) Reflect.set(faction, "color", "#e81603");
    }
  };
}

test.describe("레이어 판: 넓은 화면은 열린 채(D-546 1436)", () => {
  test.use({ account: "player", theme: "pastel", language: "ko", ...VIEWPORTS.desktop });

  test("1440: 레이어를 골라도 판이 열려 있고, 영토 범례가 보인다", async ({ page, deviceErrors }) => {
    test.setTimeout(120_000);
    await openPlanet(page, LAYER_VIEW);
    await expect(page.locator(".planet-screen")).toHaveAttribute("data-incomplete", "false", {
      timeout: 60_000,
    });
    await chooseLayer(page, "territory", false);
    await expect(page.locator(".planet-layer-sheet")).toBeVisible();
    await expect(page.locator('[data-legend="territory"]')).toBeVisible();
    await page.waitForTimeout(300);
    await shot(page, "planet-layer-territory-open-1440-pastel");
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("비슷한 색 이웃 무늬(D-546 1435)", () => {
  test.use({ account: "player" });

  for (const theme of ["pastel", "dark"] as const) {
    test.describe(`390 ${theme}`, () => {
      test.use({ theme, language: "ko" });
      test(`맞닿은 두 국가 색이 비슷하면 큰 ID 국가 칠·범례에 빗금 (390·${theme})`, async ({
        page,
        deviceErrors,
      }) => {
        test.setTimeout(120_000);
        const start = await myStartCity(page);
        await openPlanet(page, "?stage=4&planet-sky=off", {
          "world.cities": closeRedNeighbours(start.mapKey),
        });
        await expect(page.locator(".planet-screen")).toHaveAttribute("data-incomplete", "false", {
          timeout: 60_000,
        });
        await chooseLayer(page, "territory");
        await expect(page.locator('.city-area-fill[data-pattern="hatch"]').first()).toBeAttached();
        expect(
          await page.locator('[data-legend="territory"] [data-pattern="hatch"]').count(),
        ).toBeGreaterThanOrEqual(1);
        // 무늬 정의가 있고 칠이 그것을 가리킨다
        const fill = await page.locator('.city-area-fill[data-pattern="hatch"]').evaluate((path) => {
          const url = /url\("?#([^")]+)"?\)/.exec(getComputedStyle(path).fill)?.[1] ?? "";
          return { url, defined: url !== "" && document.getElementById(url) !== null };
        });
        expect(fill.defined).toBe(true);
        await page.locator(".planet-layer-toggle").click();
        await page.waitForTimeout(400);
        await shot(page, `planet-territory-hatch-390-${theme}`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
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
