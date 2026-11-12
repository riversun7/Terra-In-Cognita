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
import { closeOperatorMenu, setPerfPanel } from "./helpers/mapHud.ts";
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
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

/** 고도 과장 막대를 옮기고 엔진이 받을 때까지(1초 요약) + 그린 프레임 */
async function setExaggeration(page: Page, value: number): Promise<void> {
  await page.locator("#planet-exaggeration").fill(String(value));
  await expect(page.locator(".planet-screen")).toHaveAttribute("data-engine-exaggeration", String(value));
  await page.waitForTimeout(400);
}

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
    // 고도 과장 막대도 운영진만(플레이어는 처음 값 ×6 그대로)
    await expect(page.locator("#planet-exaggeration")).toHaveCount(0);
    await expect(page.locator(".planet-screen")).toHaveAttribute("data-engine-exaggeration", "6");
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
      await expect(page.locator("#planet-exaggeration")).toBeVisible();
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

/** 레이어 버튼을 누르고 엔진이 받을 때까지(1초 요약) + 그린 프레임 */
async function chooseLayer(page: Page, layer: string): Promise<void> {
  const button = page.locator(`[data-layer-option="${layer}"]`);
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".planet-screen")).toHaveAttribute("data-engine-layer", layer);
  await page.waitForTimeout(400);
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
    await expect(page.locator("[data-layer-option]")).toHaveCount(5);
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

    // 다른 레이어로 가면 자원 지도를 버린다(텍스처 메모리 0). 영토 덧그림은 진하게
    await chooseLayer(page, "territory");
    await expect(screen).toHaveAttribute("data-resource-bytes", "0");
    await expect(page.locator(".city-overlay")).toHaveAttribute("data-emphasis", "territory");
    await expect(page.locator('[data-legend="territory"]')).toContainText(
      message("ko", "planet_territory_capital"),
    );
    // 땅을 한 번 누르면 누른 칸 줄 끝에 국가(또는 영토 밖) 줄
    const size = page.viewportSize() ?? { width: 390, height: 844 };
    await page.mouse.click(size.width * 0.3, size.height * 0.33);
    await expect(screen).toHaveAttribute("data-picked", /\d/);
    const outside = message("ko", "planet_territory_outside");
    const territoryPrefix = message("ko", "planet_territory_at", { nation: "" });
    await expect(page.locator(".planet-readout [role=status]")).toContainText(
      new RegExp(`${outside.replace(/[()]/g, "\\$&")}|${territoryPrefix}`),
    );
    console.log(
      `[measure] planet layers mean pixel diff terrain→elevation ${elevationChange.toFixed(2)}, ore→wood ${materialChange.toFixed(2)}`,
    );
    expect(elevationChange).toBeGreaterThan(2);
    expect(materialChange).toBeGreaterThan(0.5);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("레이어 사진", () => {
  test.use({ account: "player" });

  for (const theme of ["pastel", "dark"] as const) {
    test.describe(`390 ${theme}`, () => {
      test.use({ theme, language: "ko" });

      test(`고도·자원·영토 레이어 (390·${theme})`, async ({ page, deviceErrors }) => {
        test.setTimeout(150_000);
        await openPlanet(page, LAYER_VIEW);
        await expect(page.locator(".planet-screen")).toHaveAttribute("data-incomplete", "false", {
          timeout: 60_000,
        });
        await chooseLayer(page, "elevation");
        await shot(page, `planet-layer-elevation-390-${theme}`);
        await chooseLayer(page, "resource");
        await expect(page.locator(".planet-screen")).toHaveAttribute("data-resource", "ready", {
          timeout: 60_000,
        });
        await page.waitForTimeout(400);
        expect(await smallTapTargets(page)).toEqual([]);
        expect(await horizontalOverflow(page)).toEqual([]);
        await shot(page, `planet-layer-resource-390-${theme}`);
        await chooseLayer(page, "territory");
        expect(await horizontalOverflow(page)).toEqual([]);
        await shot(page, `planet-layer-territory-390-${theme}`);
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
