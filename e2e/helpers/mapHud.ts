// 2차맵 아래 탭·운영 메뉴·도시 화면 조작 — 사용자 지적 2026-11-12(docs/adr/2026-10-29-app-shell.md "바뀜 (2026-11-12)").
// 옛 흩어진 단추([내 유닛 N]·[근처]·오른쪽 위 [1차맵]·[운영자 모드]·[자유 시점])를 아래 탭([1차맵]·[유닛]·[도시]·[주변])과 머리의 [운영] 메뉴가
// 맡는다. 시험은 이 도우미로 연다.
import { type Locator, type Page, expect } from "@playwright/test";

export type MapNavTab = "planet" | "units" | "city" | "bag" | "nearby";

/** 아래 탭 단추 */
export function navButton(page: Page, tab: MapNavTab): Locator {
  return page.locator(`.map-nav .map-nav-${tab}`);
}

/** 운영 메뉴를 연다(이미 열려 있으면 그대로) */
export async function openOperatorMenu(page: Page): Promise<Locator> {
  const menu = page.locator(".map-operator-menu");
  if (!(await menu.isVisible())) await page.locator(".map-operator-menu-button").click();
  await expect(menu).toBeVisible();
  return menu;
}

/** 운영 메뉴를 닫는다 */
export async function closeOperatorMenu(page: Page): Promise<void> {
  const button = page.locator(".map-operator-menu-button");
  if ((await button.getAttribute("aria-expanded")) === "true") await button.click();
  await expect(page.locator(".map-operator-menu")).toHaveCount(0);
}

/** 운영 메뉴의 [운영자 모드] 단추(메뉴를 열고) */
export async function operatorToggle(page: Page): Promise<Locator> {
  const menu = await openOperatorMenu(page);
  return menu.locator(".map-operator-toggle");
}

/** 운영 메뉴의 [자유 시점] 단추(메뉴를 열고 — 운영자 모드에서만 있다) */
export async function freeViewToggle(page: Page): Promise<Locator> {
  const menu = await openOperatorMenu(page);
  return menu.locator(".map-free-view");
}

/** 운영자 모드를 켜거나 끈다(이미 그 상태면 그대로) */
export async function setOperatorMode(page: Page, on: boolean): Promise<void> {
  const toggle = await operatorToggle(page);
  if ((await toggle.getAttribute("aria-pressed")) !== String(on)) await toggle.click();
  await expect(page.locator(".map-screen")).toHaveAttribute("data-operator", on ? "on" : "off");
}

/** 성능 판을 켜거나 끈다(운영 메뉴 [성능 표시] — 이 기기에 기억된다) */
export async function setPerfPanel(page: Page, on: boolean): Promise<void> {
  const menu = await openOperatorMenu(page);
  const toggle = menu.locator(".map-perf-toggle");
  if ((await toggle.getAttribute("aria-pressed")) !== String(on)) await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", String(on));
}

/** 아래 탭 [도시]로 도시 화면을 연다 */
export async function openCitySheet(page: Page): Promise<Locator> {
  const sheet = page.locator(".map-city");
  if ((await sheet.count()) === 0) await navButton(page, "city").click();
  await expect(sheet).toBeVisible();
  return sheet;
}

/** 아래 탭 [유닛]으로 내 유닛 목록을 연다 */
export async function openMyUnits(page: Page): Promise<Locator> {
  const panel = page.locator(".map-units");
  if ((await panel.count()) === 0) await navButton(page, "units").click();
  await expect(panel).toBeVisible();
  return panel;
}
