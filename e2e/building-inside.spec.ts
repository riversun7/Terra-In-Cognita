// 건물 안 유닛 숨김·"안에 N명" 표시·[나가기] — 사용자 지적 2026-11-15 "유닛이 건물에 들어갔다는데 달라진 기능도 없고 유닛은 밖에 있다",
// 답 "숨기고 건물에 표시". 운영자 모드(dev, 걸음 빠르기 배율)로 걸어가는 시간을 줄인다.
// [도시] → 행정·창고가 아닌 남의 건물 줄 → 건물 판 [들어가기] → 건물 위 "안에 1명"(내 유닛) → 건물 판 [나가기] → 표시가 사라진다.
import { closeOperatorMenu, navButton, openCitySheet, setOperatorMode } from "./helpers/mapHud.ts";
import { shot } from "./helpers/screen.ts";
import { expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";

test.describe("건물 안: dev", () => {
  test.use({ account: "dev", viewport: { width: 390, height: 844 } });

  test("[들어가기] → 지도에서 숨김·건물 위 '안에 1명' → [나가기]", async ({ page, deviceErrors }) => {
    test.setTimeout(180_000);
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await page.goto("/map");
    const screen = page.locator(".map-screen[data-map-key]");
    await expect(screen).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
    await setOperatorMode(page, true);
    await closeOperatorMenu(page);
    const city = await openCitySheet(page);
    // 넣을 것·직무가 없는 남의 건물(행정 건물은 화물을 받고, 창고·채집 시설은 내 것일 때 받는다)
    const row = city
      .locator('.map-city-row:not([data-group="administration"]):not([data-group="storage"])')
      .first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    const id = (await row.getAttribute("data-building")) ?? "";
    await row.click();
    const sheet = page.locator(`.gather-sheet[data-building="${id}"]`);
    await expect(sheet).toBeVisible();
    await sheet.locator(".gather-sheet-enter").click();
    const badge = page.locator(`.inside-badge[data-building="${id}"]:not([hidden])`);
    await expect(badge).toBeVisible({ timeout: 120_000 });
    await expect(badge).toHaveAttribute("data-own", "true");
    await shot(page, "building-inside-390-pastel");
    // 건물 판에서 [나가기]
    await openCitySheet(page);
    await page.locator(`.map-city-row[data-building="${id}"]`).click();
    const leave = page.locator(`.gather-sheet[data-building="${id}"] .gather-leave`);
    await expect(leave).toBeVisible({ timeout: 20_000 });
    await leave.click();
    await expect(badge).toHaveCount(0, { timeout: 20_000 });
    await navButton(page, "units").click();
    expect(deviceErrors).toEqual([]);
  });
});
