// 도시 2차맵 화면 시험 도우미 — 시작 도시 2차맵을 운영자 모드(전체 보기)로 열고 건물 무리를 화면 가운데로 끈다.
// building-art.spec.ts(건물 모델)와 city-layout.spec.ts(도시 건물 배치, docs/adr/2026-11-11-city-building-layout.md)가 같이 쓴다.
import type { Page, Response } from "@playwright/test";
import { collapseNearby, openNearby } from "./nearby.ts";
import { expect } from "./test.ts";
import { hideSummary, rewriteTrpc } from "./trpc.ts";

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;

/** 띄운 2차맵 가운데 시작 도시가 있는 것(없으면 아무 도시)의 키와 도시 칸 */
export async function cityMap(page: Page): Promise<{ key: number; x: number; y: number }> {
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
export async function looksOf(
  response: Response,
): Promise<{ buildingId: number; facilityId: string | null }[]> {
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
export async function openCityMap(
  page: Page,
  query = "",
): Promise<{ looks: Awaited<ReturnType<typeof looksOf>> }> {
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
export async function buildingMarkerPoints(page: Page): Promise<{ id: number; x: number; y: number }[]> {
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
export async function markersSoon(page: Page): Promise<boolean> {
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
export async function centreOnBuildings(page: Page): Promise<void> {
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
