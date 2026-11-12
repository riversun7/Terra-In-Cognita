// 도시 2차맵 화면 시험 도우미 — 시작 도시 2차맵을 운영자 모드(전체 보기)로 열고 건물 무리를 화면 가운데로 끈다.
// building-art.spec.ts(건물 모델)와 city-layout.spec.ts(도시 건물 배치, docs/adr/2026-11-11-city-building-layout.md)가 같이 쓴다.
import type { Page, Response } from "@playwright/test";
import { closeOperatorMenu, freeViewToggle, openCitySheet, setOperatorMode } from "./mapHud.ts";
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
  await setOperatorMode(page, true);
  await closeOperatorMenu(page);
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
  // 겉모습을 받은 뒤 엔진이 다시 그릴 틈
  await page.waitForTimeout(1_500);
  return { looks };
}

/**
 * 도시 건물 무리를 화면 가운데로: 운영자 자유 시점을 켜고(기준 유닛 따라가기 없음) 도시 화면에서 건물 줄(기본 행정 건물 — 도시 건물은 그 둘레에 선다)을
 * 누른다 → 카메라가 그 건물로 가고 건물 판이 열린다 → 판을 닫아도 카메라는 그 자리(자유 시점). 옛 건물 표시(건물마다 단추)는 지웠다
 * (사용자 지적 2026-11-12 "누른 건물만 표시해라"). 고른 건물 ID를 돌려준다
 */
export async function centreOnBuilding(page: Page, facility = "government_hall"): Promise<number> {
  const free = await freeViewToggle(page);
  if ((await free.getAttribute("aria-pressed")) !== "true") await free.click();
  await expect(page.locator(".map-screen")).toHaveAttribute("data-free-view", "on");
  await closeOperatorMenu(page);
  const city = await openCitySheet(page);
  const preferred = city.locator(`.map-city-row[data-facility="${facility}"]`).first();
  const row = (await preferred.count()) > 0 ? preferred : city.locator(".map-city-row").first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  const id = Number(await row.getAttribute("data-building"));
  await row.click();
  const sheet = page.locator(`.gather-sheet[data-building="${String(id)}"]`);
  await expect(sheet).toBeVisible();
  // 누른 건물 이름표(그 건물 하나만)
  await expect(page.locator(`.gather-building-tag[data-building="${String(id)}"]:not([hidden])`)).toBeVisible();
  await sheet.locator(".gather-sheet-close").click();
  await expect(page.locator(".gather-panel")).toHaveAttribute("data-sheet", "none");
  await page.waitForTimeout(600);
  return id;
}

/** 옛 이름(사진 시험들): 건물 무리를 화면 가운데로 */
export async function centreOnBuildings(page: Page): Promise<void> {
  await centreOnBuilding(page);
}
