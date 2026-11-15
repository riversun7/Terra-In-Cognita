// 2차맵 시야 전송 화면 시험 — ADR 2026-10-31-s3-server-stage 3절(사용자 결정 U3), 작업 묶음 WP-B
// player는 첫 접속에서 만든 사이보그(전역 준비)가 시작 도시를 탐사해 2차맵이 열리고, 시험 단추가 없다. dev·admin은 전체 보기 권한이
// 있어 늘 열리고(사이보그 본체가 있다), [전체 보기](운영자 모드)로 거르지 않은 흐름을 본다. 표지로 본다.
// 바뀜(사용자 지적 2026-11-09 "시험일꾼받기 기능 없애라"): [시험 일꾼 받기] 단추를 지웠다 — 유닛은 내 사이보그(와 둘레 유닛)로 본다.
// 바뀜(2026-11-09): "탐사한 곳이 없어 어둡다" 안내를 지웠다(내 유닛이 없는 2차맵은 들어갈 수 없다 — 넘은 직후에만 틀리게 떴다).
// 2차맵 낮밤(ADR 2026-10-28-s1-second-map "구현하며 정한 것 (2차맵 낮밤)"): ?second-map-time=<0~24>로 지역 시각을 멈추고
// 빛 표지(data-light-*)와 화면 밝기를 본다. 사진은 낮·박명·밤 × 390·1440 × 기본 테마 둘(세계 색은 테마와 상관없다, HUD만 바뀐다).
import { closeOperatorMenu, freeViewToggle, operatorToggle, setOperatorMode } from "./helpers/mapHud.ts";
import type { Page } from "@playwright/test";
import { horizontalOverflow, shot } from "./helpers/screen.ts";
import { expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

/** 낮밤 사진·시험 시각(S1 시험 2차맵 = 적도·경도 0 근처, 달력 3일째: 달이 거의 보름) — 낮 12시, 박명 18:09(항성 약 −2°), 밤 23시(달 약 52°) */
const DAY_NIGHT_HOURS = { day: "12", dusk: "18.15", night: "23" } as const;

/**
 * 2차맵을 그 주소로 열고 준비를 기다린 뒤, 운영자 모드(전체 보기)를 켜 안개를 끈다(dev). 운영자 모드는 이 기기에서 기억하므로(기획 답 631 다)
 * 같은 시험 안에서 다시 열면 이미 켜져 있다 — 꺼져 있을 때만 누른다. 운영자 모드는 카메라도 자유다(플레이어는 내 유닛 둘레, 기획 정리 630)
 */
async function openMap(page: Page, search: string): Promise<void> {
  await page.goto(`/map${search}`);
  const screen = page.locator(".map-screen");
  await expect(screen).toHaveAttribute("data-status", "ready", { timeout: 15_000 });
  await expect(screen).toHaveAttribute("data-feed", "live", { timeout: 15_000 });
  // 운영 메뉴는 항목을 누르면 닫힌다(D-560 1239 — 위 판 줄이 지도를 덜 가리게, 밝기 재기)
  await setOperatorMode(page, true);
  await closeOperatorMenu(page);
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
/**
 * 끌기 시작 높이: 시작점(x)이 덧그림 단추(채집·건물 표시 — 누르면 판이 열리고 지도를 끌지 않는다, 숲 2차맵에서는 빽빽하다)가 아니라 지도
 * 캔버스에 닿는 첫 높이(화면 35~80%). 없으면 fallback
 */
async function canvasY(
  page: Page,
  x: number,
  box: { readonly y: number; readonly height: number },
  fallback: number,
): Promise<number> {
  return page.evaluate(
    ({ px, top, height, otherwise }) => {
      for (let k = 0; k <= 30; k++) {
        const py = top + height * (0.35 + k * 0.015);
        if (document.elementFromPoint(px, py) instanceof HTMLCanvasElement) return py;
      }
      return otherwise;
    },
    { px: x, top: box.y, height: box.height, otherwise: fallback },
  );
}

const MAP_CLIP = { x: 20, y: 480, width: 280, height: 200 };

test.describe("dev", () => {
  test.use({ account: "dev" });

  test("처음에는 내 사이보그가 있고 시험 일꾼 단추는 없으며, 전체 보기를 켜고 끌 수 있다", async ({
    page,
    deviceErrors,
  }) => {
    // 다른 시험(인벤토리)이 dev에게 휴먼을 고용해 주면 복귀 요약이 뜰 수 있다 — 단추를 가리지 않게 띄우지 않는다
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await page.goto("/map");
    const screen = page.locator(".map-screen");
    await expect(screen).toHaveAttribute("data-feed", "live", { timeout: 15_000 });
    // 사이보그 본체(첫 접속) 둘레를 탐사해 어둡지 않다. 같은 시작 도시의 다른 계정 사이보그도 보일 수 있다
    await expect
      .poll(async () => Number(await screen.getAttribute("data-units")), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(1);
    await expect(page.locator(".map-dev-spawn")).toHaveCount(0);
    const observe = await operatorToggle(page);
    await expect(observe).toHaveAttribute("aria-pressed", "false");
    await observe.click();
    await expect(screen).toHaveAttribute("data-operator", "on");
    await expect(await operatorToggle(page)).toHaveAttribute("aria-pressed", "true");
    await expect(screen).toHaveAttribute("data-feed", "live", { timeout: 15_000 });
    await (await operatorToggle(page)).click();
    await expect(screen).toHaveAttribute("data-operator", "off");
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
          await expect(await operatorToggle(page)).toBeVisible();
          expect(await horizontalOverflow(page)).toEqual([]);
          await shot(page, `map-vision-dev-390-${theme}-${language}`);
        });
      });
    }
  }
});

test.describe("2차맵 낮밤", () => {
  test.use({ account: "dev" });
  // 다른 시험이 유닛을 준 dev 계정은 복귀 요약이 뜰 수 있다 — 대화상자가 지도 단추를 가리지 않게 띄우지 않는다
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

  // 사진: 낮·박명·밤 × 390·1440 × 기본 테마 둘. 북쪽을 보도록 끌어 올린다
  for (const [size, viewport] of [
    ["390", VIEWPORTS.phone],
    ["1440", VIEWPORTS.desktop],
  ] as const) {
    for (const theme of ["pastel", "dark"] as const) {
      test.describe(`사진 ${size} ${theme}`, () => {
        test.use({ ...viewport, theme });

        test(`2차맵 낮·박명·밤 (${size}·${theme})`, async ({ page }) => {
          // 다섯 번 다시 열고(운영 메뉴 여닫기 포함) 사진 넷 — 여러 줄기가 같이 도는 기계에서 120초를 넘겼다(2026-11-12)
          test.setTimeout(240_000);
          await openMap(page, "");
          const screen = page.locator(".map-screen");
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

test.describe("경계 너머 보기", () => {
  test.use({ account: "dev" });
  test.beforeEach(async ({ page }) => {
    await rewriteTrpc(page, { "summary.get": hideSummary });
  });

  // ADR 2026-10-31-second-map-from-planet WP-4: 이웃 2차맵 지형을 받아 둘레에 그리고, 화면을 경계 너머로 옮긴다.
  // 사용자 요구 "다음 맵 이동 때 연결이 자연스러운지": 경계에서 지형이 끊기지 않는지 사진으로 본다(유닛은 아직 넘지 않는다)
  test("이웃 8장(3×3 이어 보기)을 받고, 끌어서 경계 너머 이웃 2차맵 위로 화면을 옮긴다. 나침반이 있다", async ({
    page,
    deviceErrors,
  }) => {
    // 이웃 8장 + 끌기(3/6에서 4~6번이면 넘는다) — 여러 줄기가 같이 도는 기계에서 120초를 넘겼다(2026-11-12)
    test.setTimeout(240_000);
    await openMap(page, "?second-map-neighbours=all&second-map-sky=off");
    const screen = page.locator(".map-screen");
    await expect(screen).toHaveAttribute("data-neighbours", "8", { timeout: 30_000 });
    await expect(page.locator(".map-compass")).toHaveAttribute("aria-label", /./);
    await page.waitForTimeout(1200);
    await shot(page, "second-map-neighbours-3x3");

    // 플레이어 카메라는 기준 유닛에 붙어 끌기가 돌리기다(docs/adr/2026-11-08-seamless-second-map.md WP-1): 화면을 옮기려면 운영자 [자유 시점]
    // (운영자 모드는 openMap이 이미 켰다)
    await expect(await operatorToggle(page)).toHaveAttribute("aria-pressed", "true");
    await (await freeViewToggle(page)).click();
    await expect(screen).toHaveAttribute("data-free-view", "on");
    await closeOperatorMenu(page);
    await expect(screen).toHaveAttribute("data-feed", "live", { timeout: 15_000 });

    // 오른쪽 경계 쪽으로 끈다(손가락 아래 땅이 따라온다: 왼쪽으로 끌면 화면이 동쪽으로 간다)
    const box = await page.locator(".map-view canvas").boundingBox();
    if (!box) throw new Error("no canvas");
    const y = box.y + box.height * 0.55;
    // 처음 화면은 가장 가까이(6/6, 짧은 변 15m — 들어올 때 최대 확대 e702390·가장 가까이 15m 8b34cf6)라 한 번 끌어도 수십 m뿐이다.
    // 확대 사다리 [−]로 3/6(짧은 변 약 270m — 소품 모델이 서는 420m 아래)까지 멀리 본 뒤 끈다. 바퀴는 기기 배율(DPR 3)로 한 칸이
    // 1/3로 줄어 6번이어도 5/6에 머물러, 2차맵 가운데에서 경계(약 720m 동쪽)까지 16번 끌어도 닿지 않았다(2026-11-16 추적: 끌기마다 약 43m)
    const ladder = page.locator(".zoom-ladder");
    await expect(ladder).toHaveAttribute("data-stage", /^[1-6]$/, { timeout: 15_000 });
    for (let k = 0; k < 6 && Number(await ladder.getAttribute("data-stage")) > 3; k++) {
      await ladder.locator(".zoom-ladder-out").click();
      await page.waitForTimeout(700);
    }
    await expect(ladder).toHaveAttribute("data-stage", "3");
    await page.waitForTimeout(1_000);
    for (let k = 0; k < 16; k++) {
      if ((await screen.getAttribute("data-view-map")) === "1,0") break;
      // 채집·건물 표시에서 시작하면 지도가 끌리지 않는다(합치기 2026-11-08) — 캔버스에 닿는 높이에서 끈다
      const dragY = await canvasY(page, box.x + box.width * 0.85, box, y);
      await page.mouse.move(box.x + box.width * 0.85, dragY);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.15, dragY, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(1100);
    }
    await expect(screen).toHaveAttribute("data-view-map", "1,0", { timeout: 5_000 });
    // 경계를 걸친 자리로 조금 되돌려 사진(경계가 화면 가운데쯤)
    const backY = await canvasY(page, box.x + box.width * 0.3, box, y);
    await page.mouse.move(box.x + box.width * 0.3, backY);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.75, backY, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(1200);
    await shot(page, "second-map-neighbour-edge");

    // 이 거리(화면 짧은 변 420m 아래)에서는 지금 2차맵의 소품 모델(나무 등)이 선다(멀리서는 땅 색만)
    expect(Number(await screen.getAttribute("data-props"))).toBeGreaterThan(0);
    expect(deviceErrors).toEqual([]);
  });

  // 측정(E2E_MEASURE=1일 때만, 작업 기록용): 이웃 8장·소품 모델이 엔진 한 프레임 시간에 더하는 몫. 처음 화면(가까이, 소품 모델)과
  // 멀리(바퀴 6번, 땅 색만)에서 좌우로 끄는 동안 1초마다 엔진 p95를 읽는다. 헤드리스 Chromium(SwiftShader) 값이라 휴대폰 값이 아니다
  test("측정: 이웃 0장·8장 × 가까이·멀리, 끄는 동안 엔진 p95(E2E_MEASURE=1)", async ({ page }) => {
    test.skip(process.env.E2E_MEASURE !== "1", "E2E_MEASURE=1일 때만 돈다");
    test.setTimeout(240_000);
    const rows: Record<string, unknown>[] = [];
    for (const neighbours of [false, true]) {
      await openMap(
        page,
        neighbours ? "?second-map-neighbours=all&second-map-sky=off" : "?second-map-sky=off",
      );
      const screen = page.locator(".map-screen");
      if (neighbours) await expect(screen).toHaveAttribute("data-neighbours", "8", { timeout: 30_000 });
      const box = await page.locator(".map-view canvas").boundingBox();
      if (!box) throw new Error("no canvas");
      const y = box.y + box.height * 0.5;
      for (const far of [false, true]) {
        if (far) {
          await page.mouse.move(box.x + box.width / 2, y);
          for (let k = 0; k < 6; k++) {
            await page.mouse.wheel(0, 400);
            await page.waitForTimeout(150);
          }
        }
        await page.waitForTimeout(1500);
        const framesBefore = Number(await screen.getAttribute("data-frames"));
        const samples: number[] = [];
        const started = Date.now();
        let lastRead = started;
        let flip = false;
        await page.mouse.move(box.x + box.width * 0.4, y);
        await page.mouse.down();
        while (Date.now() - started < 6000) {
          flip = !flip;
          await page.mouse.move(box.x + box.width * (flip ? 0.6 : 0.4), y, { steps: 10 });
          if (Date.now() - lastRead >= 1000) {
            samples.push(Number(await screen.getAttribute("data-engine-p95")));
            lastRead = Date.now();
          }
        }
        await page.mouse.up();
        await page.waitForTimeout(1100);
        const seconds = (Date.now() - started) / 1000;
        const sorted = samples.toSorted((a, b) => a - b);
        rows.push({
          neighbours: Number(await screen.getAttribute("data-neighbours")),
          view: far ? "far" : "near",
          props: Number(await screen.getAttribute("data-props")),
          engineP95MedianMs: sorted[Math.floor(sorted.length / 2)] ?? null,
          engineP95MaxMs: sorted.at(-1) ?? null,
          framesPerSecond: Math.round(
            (Number(await screen.getAttribute("data-frames")) - framesBefore) / seconds,
          ),
        });
      }
    }
    // 작업 기록에 옮겨 적는다(표준 출력)
    console.log(`[measure] ${JSON.stringify(rows)}`);
    await test.info().attach("second-map-neighbour-measure", {
      body: JSON.stringify(rows, null, 2),
      contentType: "application/json",
    });
  });
});

test.describe("player", () => {
  test.use({ account: "player" });

  // 사이보그가 없는 플레이어는 /start로 가서 2차맵을 열지 않는다(first-login.spec.ts). 유닛도 탐사도 없을 때의 not_visible은
  // 서버 시험(world/gateway.test.ts)이 본다
  test("사이보그가 있으면 2차맵이 열리고(내 유닛, 어둡지 않음), 운영자 단추가 없다", async ({ page }) => {
    await page.goto("/map");
    const screen = page.locator(".map-screen");
    await expect(screen).toHaveAttribute("data-feed", "live", { timeout: 15_000 });
    await expect
      .poll(async () => Number(await screen.getAttribute("data-units")), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(1);
    await expect(page.locator(".map-operator-menu-button")).toHaveCount(0);
    await expect(page.locator(".map-operator-toggle")).toHaveCount(0);
  });
});
