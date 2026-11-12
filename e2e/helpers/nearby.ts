// 2차맵 근처 판 조작 — docs/adr/2026-11-08-seamless-second-map.md WP-2. 근처 판(자원·건물·유닛 탭, 가까운 차례 목록)이 옛 [내 유닛 N] 목록을 맡고,
// 지도 위 채집·건물 표시는 그 탭일 때만 보인다. 시험은 이 도우미로 탭을 열고 줄을 누른다.
import { type Page, expect } from "@playwright/test";

export type NearbyTab = "resources" | "buildings" | "units";

/** 근처 판을 열고 그 탭을 고른다(펼친 채). 이미 그 탭이면 펼치기만 */
export async function openNearby(page: Page, tab: NearbyTab): Promise<void> {
  const panel = page.locator(".map-nearby");
  // 아래 탭 [주변](사용자 지적 2026-11-12 — 옛 [근처] 단추)
  if ((await panel.count()) === 0) await page.locator(".map-nav .map-nav-nearby").click();
  await expect(panel).toBeVisible();
  const button = panel.locator(`.map-nearby-tab[data-tab="${tab}"]`);
  if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
  await expect(panel).toHaveAttribute("data-tab", tab);
  if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
}

/** 고른 탭 목록을 접는다(지도 표시는 남는다 — 좁은 화면에서 지도를 가리지 않게) */
export async function collapseNearby(page: Page): Promise<void> {
  const pressed = page.locator('.map-nearby-tab[aria-pressed="true"]');
  if ((await pressed.getAttribute("aria-expanded")) === "true") await pressed.click();
  await expect(pressed).toHaveAttribute("aria-expanded", "false");
}

/** 근처 판을 닫는다(지도 표시 없음) */
export async function closeNearby(page: Page): Promise<void> {
  const close = page.locator(".map-nearby-close");
  if (await close.count()) await close.click();
  await expect(page.locator(".map-nearby")).toHaveCount(0);
}

/** 유닛 탭에서 내 유닛 줄을 눌러 고른다(기준 유닛 — 카메라가 따라간다) */
export async function pickMyUnit(page: Page, unitId: string): Promise<void> {
  await openNearby(page, "units");
  const row = page.locator(`.map-nearby-row[data-kind="unit"][data-id="${unitId}"]`);
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();
}

/**
 * 근처 판 건물 탭에서 그 건물 줄을 눌러 건물 판을 연다(목록에 없으면 20개씩 더 보이며 찾는다). 지도 표시를 누르는 것과 같은 판이 열린다 —
 * 카메라가 기준 유닛에 붙어 건물이 화면 밖일 수 있어(WP-1) 시험은 목록으로 연다
 */
export async function openBuildingFromList(page: Page, buildingId: number): Promise<void> {
  await openNearby(page, "buildings");
  const row = page.locator(`.map-nearby-row[data-kind="building"][data-id="${String(buildingId)}"]`);
  const more = page.locator(".map-nearby-more");
  await expect(page.locator('.map-nearby-row[data-kind="building"]').first()).toBeVisible({
    timeout: 30_000,
  });
  for (let page2 = 0; page2 < 10 && (await row.count()) === 0; page2++) {
    if ((await more.count()) === 0) break;
    await more.click();
  }
  await row.scrollIntoViewIfNeeded();
  await row.click();
}

/** 근처 판 건물 탭의 건물 ID(가까운 차례, 보이는 줄 — 모두 보일 때까지 더 보인다) */
export async function nearbyBuildingIds(page: Page): Promise<number[]> {
  await openNearby(page, "buildings");
  await expect(page.locator('.map-nearby-row[data-kind="building"]').first()).toBeVisible({
    timeout: 30_000,
  });
  const more = page.locator(".map-nearby-more");
  for (let k = 0; k < 10 && (await more.count()) > 0; k++) await more.click();
  return page
    .locator('.map-nearby-row[data-kind="building"]')
    .evaluateAll((rows) => rows.map((row) => Number(row.getAttribute("data-id"))));
}
