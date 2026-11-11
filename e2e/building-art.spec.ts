// 2차맵 건물 모델 화면 시험(ADR 2026-11-08-building-art) — dev(전체 보기 계정, 운영자 모드를 켜고 본다)
// - NPC 시작 도시 2차맵: tRPC facilities.mapLooks가 시설 ID(행정 건물·창고·농장·벌목장·광산 등)를 주고, 엔진이 시설 종류별 모델로 다시 그린다.
//   그리기 호출(위 판 "그리기 N회")을 기록한다(지형·소품·유닛 + 건물 도형 최대 7).
// - 건물 표시를 숨기고 그 자리(건물 모델 위)를 누르면 건물 판이 열린다(엔진 건물 누르기 → 판 안 칸).
// - 사진: 도시 2차맵(도시 칸, 처음 거리 — 최대 확대, 건물 표시가 화면 밖이면 한두 단계 줄인 거리) 390·1440 × 파스텔·다크 × 낮·밤(?second-map-time=). 세계 색은 테마와 상관없고(D-070) 위 판만
//   바뀐다. 채집 덧그림 표시는 건물을 가려 사진에서만 숨긴다.
import type { Page, Response } from "@playwright/test";
import { shot } from "./helpers/screen.ts";
import { collapseNearby, openNearby } from "./helpers/nearby.ts";
import { type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;

/** 띄운 2차맵 가운데 시작 도시가 있는 것(없으면 아무 도시)의 키와 도시 칸 */
async function cityMap(page: Page): Promise<{ key: number; x: number; y: number }> {
  const data: unknown = await page.evaluate(async () => {
    const response: unknown = await fetch("/api/trpc/world.cities").then((reply) => reply.json());
    return response;
  });
  const list = field(field(field(data, "result"), "data"), "cities");
  if (!Array.isArray(list)) throw new Error("도시 목록이 없습니다");
  const loaded = list.filter((city: unknown) => field(city, "loaded") === true);
  const start = loaded.find((city: unknown) => field(city, "start") === true) ?? loaded[0];
  const key = Number(field(start, "mapKey"));
  if (!Number.isSafeInteger(key)) throw new Error("띄운 도시 2차맵이 없습니다");
  return { key, x: Number(field(start, "cellX")), y: Number(field(start, "cellY")) };
}

/** facilities.mapLooks 응답의 건물 줄(묶음 응답이면 그 조회만) */
async function looksOf(response: Response): Promise<{ buildingId: number; facilityId: string | null }[]> {
  const body: unknown = await response.json();
  const entries: unknown[] = Array.isArray(body) ? body : [body];
  for (const entry of entries) {
    const rows = field(field(field(entry, "result"), "data"), "buildings");
    if (Array.isArray(rows))
      return rows.map((row: unknown) => ({
        buildingId: Number(field(row, "buildingId")),
        facilityId: typeof field(row, "facilityId") === "string" ? String(field(row, "facilityId")) : null,
      }));
  }
  return [];
}

/**
 * 도시 2차맵을 운영자 모드(전체 보기 — 안개 없이 모든 건물)로 연다: 한 번 켜고(이 기기에 기억된다) 도시 칸(?at=)으로 다시 연 뒤
 * 건물 겉모습 응답을 기다린다. 다시 여는 까닭: 운영자 모드 전에는 카메라가 묶여 있어 도시 칸에 서지 않는다
 */
async function openCityMap(page: Page, query = ""): Promise<{ looks: Awaited<ReturnType<typeof looksOf>> }> {
  await rewriteTrpc(page, { "summary.get": hideSummary });
  await page.goto("/");
  const city = await cityMap(page);
  await page.goto(`/map?key=${String(city.key)}`);
  const map = page.locator(".map-screen[data-map-key]");
  await expect(map).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
  await page.locator(".map-operator-toggle").click();
  await expect(map).toHaveAttribute("data-operator", "on");
  // 다시 연 뒤의 겉모습 응답만(앞 화면이 보낸 것은 넘긴다)
  let reopened = false;
  const looksResponse = page.waitForResponse(
    (response) => reopened && response.url().includes("facilities.mapLooks"),
    { timeout: 60_000 },
  );
  reopened = true;
  await page.goto(`/map?key=${String(city.key)}&at=${String(city.x)},${String(city.y)}${query}`);
  await expect(map).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
  await expect(map).toHaveAttribute("data-operator", "on");
  const looks = await looksOf(await looksResponse);
  // 건물 표시는 근처 판 건물 탭일 때만(docs/adr/2026-11-08-seamless-second-map.md WP-2) — 목록은 접는다(지도를 가리지 않게)
  await openNearby(page, "buildings");
  await collapseNearby(page);
  // 겉모습을 받은 뒤 엔진이 다시 그릴 틈
  await page.waitForTimeout(1_500);
  return { looks };
}

/** 보이는 건물 표시(채집 덧그림)의 가운데(CSS px) */
async function buildingMarkerPoints(page: Page): Promise<{ id: number; x: number; y: number }[]> {
  return page.locator(".gather-building-marker[data-building]:not([hidden])").evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return {
        id: Number(element.getAttribute("data-building")),
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
      };
    }),
  );
}

/** 건물 표시가 몇 초 안에 하나라도 보이나 */
async function markersSoon(page: Page): Promise<boolean> {
  try {
    await expect
      .poll(async () => (await buildingMarkerPoints(page)).length, { timeout: 6_000 })
      .toBeGreaterThan(0);
    return true;
  } catch {
    return false;
  }
}

/**
 * 건물 무리를 화면 가운데로 끌어 온다(마우스로 땅을 끈다, 두 번). NPC 도시 시설은 도시 칸 둘레의 지을 수 있는 땅에 서서
 * 도시 칸(카메라)에서 떨어져 위 판(HUD) 밑에 걸릴 수 있다
 */
async function centreOnBuildings(page: Page): Promise<void> {
  const size = page.viewportSize() ?? { width: 390, height: 844 };
  const cx = size.width / 2;
  const cy = size.height / 2;
  // 2차맵은 최대 확대(6/6)로 열린다(사용자 지적 2026-11-09, 962 나). 넓은 화면은 카메라가 따라가는 내 사이보그 둘레만 보여 도시 건물이
  // 화면 밖일 수 있다: 표시가 안 보이면 한 단계씩(세 번까지) 줄인다
  for (let step = 0; step < 3 && !(await markersSoon(page)); step++) {
    await page.locator(".zoom-ladder-out").click();
    await page.waitForTimeout(800);
  }
  for (let pass = 0; pass < 2; pass++) {
    await expect
      .poll(async () => (await buildingMarkerPoints(page)).length, { timeout: 20_000 })
      .toBeGreaterThan(0);
    const points = await buildingMarkerPoints(page);
    const ax = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const ay = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    const tx = Math.min(size.width - 20, Math.max(20, cx + (cx - ax)));
    const ty = Math.min(size.height - 20, Math.max(20, cy + (cy - ay)));
    if (Math.hypot(tx - cx, ty - cy) < 30) return;
    // 끄는 동안 덧그림 표시가 누르기를 받지 않게 잠깐 숨긴다
    const hide = await page.addStyleTag({
      content: ".gather-overlay > * { visibility: hidden !important; }",
    });
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(tx, ty, { steps: 12 });
    await page.mouse.up();
    await hide.evaluate((node) => node.parentNode?.removeChild(node));
    await page.waitForTimeout(800);
  }
}

test.describe("건물 모델: 도시 2차맵", () => {
  test.use({ account: "dev" });

  test("시설 겉모습을 받아 그리고, 건물 모델 위를 누르면 건물 판이 열린다", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(180_000);
    const { looks } = await openCityMap(page);
    const facilities = new Set(looks.map((row) => row.facilityId));
    // NPC 시작 도시 기본 시설(ADR 2026-11-07-play-flow WP5): 행정 건물·창고
    expect(facilities.has("government_hall")).toBe(true);
    expect(facilities.has("storehouse")).toBe(true);
    const perf = (await page.locator(".map-perf").textContent()) ?? "";
    const calls = /(\d+)회/.exec(perf)?.[1];
    // 작업 기록에 옮겨 적는다(표준 출력): 위 판 "유닛 N · 그리기 N회"
    console.log(`[measure] building-art draw calls ${calls ?? "?"} — ${perf.trim()}`);
    expect(Number(calls)).toBeGreaterThan(0);

    // 건물 표시(DOM)를 숨기고 그 자리를 캔버스에서 누른다 — 표시 자리 = 건물 가운데 4m 위 = 건물 모델 위
    await centreOnBuildings(page);
    const boxes = await buildingMarkerPoints(page);
    // 채집 덧그림의 표시(오브젝트·건물)를 모두 숨긴다 → 누르기가 캔버스(엔진)로 간다
    await page.addStyleTag({ content: ".gather-overlay > * { visibility: hidden !important; }" });
    // 위 판(HUD)에 가리지 않은 표시 자리만(그 점의 맨 위 요소가 캔버스), 행정 건물 먼저
    const open: typeof boxes = [];
    for (const box of boxes)
      if (
        await page.evaluate((point) => document.elementFromPoint(point.x, point.y)?.tagName === "CANVAS", box)
      )
        open.push(box);
    const hall = looks.find((row) => row.facilityId === "government_hall")?.buildingId;
    const order = [...open.filter((box) => box.id === hall), ...open.filter((box) => box.id !== hall)];
    if (order.length === 0) throw new Error("캔버스에서 누를 수 있는 건물 표시 자리가 없습니다");
    // 누른 칸 둘레 2칸 안에 채집 오브젝트가 있으면 화면은 오브젝트 판을 먼저 연다(gatherState.tapCell) — 그때는 다음 건물로
    const sheet = page.locator(".gather-sheet");
    let opened: number | null = null;
    for (const box of order) {
      await page.mouse.click(box.x, box.y);
      await expect(sheet).toBeVisible({ timeout: 10_000 });
      if ((await sheet.getAttribute("data-building")) === String(box.id)) {
        opened = box.id;
        break;
      }
      await sheet.locator(".gather-sheet-close").click();
      await expect(sheet).toHaveCount(0);
    }
    expect(opened).not.toBeNull();
    expect(deviceErrors).toEqual([]);
  });

  for (const [width, preset] of [
    ["390", VIEWPORTS.phone],
    ["1440", VIEWPORTS.desktop],
  ] as const) {
    for (const theme of ["pastel", "dark"] as const satisfies readonly Theme[]) {
      test.describe(`${width} ${theme}`, () => {
        test.use({ ...preset, theme, language: "ko" });

        for (const [time, hour] of [
          ["day", 11],
          ["night", 22],
        ] as const) {
          test(`도시 2차맵 사진 (${width}·${theme}·${time})`, async ({ page, deviceErrors }) => {
            test.setTimeout(180_000);
            await openCityMap(page, `&second-map-time=${String(hour)}`);
            await centreOnBuildings(page);
            // 채집 덧그림 표시(오브젝트 점·건물 이름표)는 건물 모양을 가려서 사진에서만 숨긴다
            await page.addStyleTag({ content: ".gather-overlay > * { visibility: hidden !important; }" });
            await page.waitForTimeout(500);
            await shot(page, `building-art-city-${width}-${theme}-${time}`);
            expect(deviceErrors).toEqual([]);
          });
        }
      });
    }
  }
});
