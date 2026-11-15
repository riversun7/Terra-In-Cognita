// 2차맵 화면 정리 시험 — 사용자 지적 2026-11-12(docs/adr/2026-10-29-app-shell.md "바뀜 (2026-11-12)"):
// "운영자메뉴를 하나로 모아 열고닫게 해라 너무 지저분하다. Fast ms 같은 장보창도 토글로해라. 창고나 광산등 채집소도 제대로 구분되게 꾸미고 누른 건물만
// 표시해라. 2차맵에 버튼을 제대로 정리해라. 1차맵, 유닛(내유닛목록), 도시(…큰화면), 주변(…거리순) 등을 하단에 깔끔하게 정리해라"
// - player: 아래 탭 넷([1차맵]·[유닛]·[도시]·[주변]), 오른쪽 위 전환 단추·운영 메뉴·성능 판 없음. 탭은 판 하나를 여닫는다(다시 누르면 닫힘).
//   [도시] = 도시·건물 목록 큰 판 → 줄을 누르면 그 건물 판(누른 건물 하나에만 지도 이름표). [1차맵] = 같은 키로 1차맵(바꾸기).
// - dev: [운영] 메뉴 하나(처음 닫힘) — [성능 표시](처음 끔, 켜면 이 기기에 기억)·[운영자 모드]·[자유 시점](운영자 모드에서만). Esc·밖 누르기로 닫힘.
// - 사진: 390 × 파스텔·다크 — 아래 탭, 도시 화면, 누른 건물 판, 운영 메뉴(영어 하나 더: 긴 글자 넘침).
import type { Page } from "@playwright/test";
import {
  closeOperatorMenu,
  navButton,
  openCitySheet,
  openOperatorMenu,
  setPerfPanel,
} from "./helpers/mapHud.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";

async function openMap(page: Page): Promise<void> {
  await rewriteTrpc(page, { "summary.get": hideSummary });
  await page.goto("/map");
  const screen = page.locator(".map-screen[data-map-key]");
  await expect(screen).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
  await expect(screen).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
}

/** 아래 탭과 겹치는 위·아래 판·도시 화면(없어야 한다) */
async function navOverlaps(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const nav = document.querySelector(".map-nav");
    if (!nav) return ["no bottom nav"];
    const box = nav.getBoundingClientRect();
    const hits: string[] = [];
    for (const element of document.querySelectorAll(
      ".map-hud-top > *, .map-hud-bottom > *, .map-hud-bottom .map-panel, .map-city",
    )) {
      const rect = element.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      if (rect.left < box.right && rect.right > box.left && rect.top < box.bottom && rect.bottom > box.top)
        hits.push(element.className);
    }
    return hits;
  });
}

/** 도시 화면을 열고 건물 줄이 설 때까지(겉모습 답이 와야 이름이 붙는다) */
async function cityWithRows(page: Page) {
  const city = await openCitySheet(page);
  await expect(city.locator(".map-city-row").first()).toBeVisible({ timeout: 30_000 });
  return city;
}

test.describe("2차맵 아래 탭·도시 화면: 플레이어", () => {
  test.use({ account: "player" });

  test("탭 넷, 탭이 판 하나를 여닫고, [도시] 줄 → 그 건물 판과 이름표 하나, [1차맵] = 같은 키 1차맵", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(150_000);
    await openMap(page);
    const screen = page.locator(".map-screen");
    const key = (await screen.getAttribute("data-map-key")) ?? "";
    // 흩어진 단추가 없다: 오른쪽 위 전환 단추·[내 유닛 N]·[근처]·운영 메뉴·성능 판
    // [1차맵]·[유닛]·[도시]·[가방](사용자 요청 2026-11-14)·[주변]
    await expect(page.locator(".map-nav .tab")).toHaveCount(5);
    await expect(page.locator(".map-switch-button")).toHaveCount(0);
    await expect(page.locator(".map-units-toggle, .map-nearby-toggle")).toHaveCount(0);
    await expect(page.locator(".map-operator-menu-button")).toHaveCount(0);
    await expect(page.locator(".map-perf")).toHaveCount(0);
    expect(await navOverlaps(page)).toEqual([]);

    // [유닛]: 내 유닛 목록, 다시 누르면 닫힘
    const units = navButton(page, "units");
    await units.click();
    await expect(page.locator(".map-units")).toBeVisible();
    await expect(units).toHaveAttribute("aria-pressed", "true");
    await units.click();
    await expect(page.locator(".map-units")).toHaveCount(0);
    await expect(units).toHaveAttribute("aria-pressed", "false");

    // [주변]: 근처 판(거리 차례), [도시]로 바꾸면 근처 판은 숨는다(판 하나)
    const nearby = navButton(page, "nearby");
    await nearby.click();
    await expect(page.locator(".map-nearby")).toBeVisible();
    await expect(nearby).toHaveAttribute("aria-pressed", "true");
    const city = await cityWithRows(page);
    await expect(page.locator(".map-nearby")).toHaveCount(0);
    await expect(navButton(page, "city")).toHaveAttribute("aria-pressed", "true");
    await expect(nearby).toHaveAttribute("aria-pressed", "false");
    expect(await navOverlaps(page)).toEqual([]);
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);

    // 지도 위 건물 이름표는 아직 없다(누른 건물만)
    await expect(page.locator(".gather-building-tag:not([hidden])")).toHaveCount(0);
    // 줄을 누르면 도시 화면이 닫히고 그 건물 판이 열린다 + 그 건물 하나에만 이름표
    const row = city.locator(".map-city-row").first();
    const id = (await row.getAttribute("data-building")) ?? "";
    await row.click();
    await expect(page.locator(".map-city")).toHaveCount(0);
    const sheet = page.locator(`.gather-sheet[data-building="${id}"]`);
    await expect(sheet).toBeVisible();
    const tag = page.locator(".gather-building-tag:not([hidden])");
    await expect(tag).toHaveCount(1);
    await expect(tag).toHaveAttribute("data-building", id);
    await expect(tag).toHaveAttribute(
      "data-group",
      /^(administration|gathering|processing|storage|housing|public|commerce|transport|military|other)$/,
    );
    await sheet.locator(".gather-sheet-close").click();
    await expect(page.locator(".gather-building-tag:not([hidden])")).toHaveCount(0);

    // [1차맵]: 같은 키로 1차맵(바꾸기)
    await navButton(page, "planet").click();
    await expect(page).toHaveURL(
      (url) => url.pathname === "/map/planet" && url.searchParams.get("key") === key,
    );
    expect(deviceErrors).toEqual([]);
  });

  test("도시 화면 거르기: 무리 칩을 누르면 그 무리 줄만, Esc로 닫힌다", async ({ page, deviceErrors }) => {
    test.setTimeout(120_000);
    await openMap(page);
    const city = await cityWithRows(page);
    const total = Number(await city.getAttribute("data-total"));
    expect(total).toBeGreaterThan(0);
    // 0이 아닌 첫 무리 칩(전체·내 것 다음)
    const chip = city.locator(".map-city-filter:not([data-filter='all']):not([data-filter='mine'])").first();
    const group = (await chip.getAttribute("data-filter")) ?? "";
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    const groups = await city
      .locator(".map-city-row")
      .evaluateAll((rows) => rows.map((element) => element.getAttribute("data-group")));
    expect(groups.length).toBeGreaterThan(0);
    expect(new Set(groups)).toEqual(new Set([group]));
    await page.keyboard.press("Escape");
    await expect(page.locator(".map-city")).toHaveCount(0);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("2차맵 운영 메뉴: dev", () => {
  test.use({ account: "dev" });

  test("[운영] 메뉴 하나(처음 닫힘) — 성능 표시(처음 끔·기억)·운영자 모드·자유 시점, 항목을 누르거나 Esc·밖 누르기로 닫힘", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(120_000);
    await openMap(page);
    const screen = page.locator(".map-screen");
    const button = page.locator(".map-operator-menu-button");
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".map-operator-menu")).toHaveCount(0);
    // 아래 판 줄에 흩어져 있던 운영 단추가 없다
    await expect(
      page.locator(".map-hud-bottom .map-operator-toggle, .map-hud-bottom .map-free-view"),
    ).toHaveCount(0);
    await expect(page.locator(".map-perf")).toHaveCount(0);

    // 열면 [성능 표시]·[운영자 모드]. [자유 시점]은 운영자 모드에서만
    const menu = await openOperatorMenu(page);
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(menu.locator(".map-perf-toggle")).toHaveAttribute("aria-pressed", "false");
    await expect(menu.locator(".map-operator-toggle")).toHaveAttribute("aria-pressed", "false");
    await expect(menu.locator(".map-free-view")).toHaveCount(0);
    // 항목을 누르면 그 일을 하고 메뉴가 닫힌다(기획 D-560 1239)
    await menu.locator(".map-operator-toggle").click();
    await expect(screen).toHaveAttribute("data-operator", "on");
    await expect(page.locator(".map-operator-menu")).toHaveCount(0);
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await (await openOperatorMenu(page)).locator(".map-free-view").click();
    await expect(screen).toHaveAttribute("data-free-view", "on");
    await expect(page.locator(".map-operator-menu")).toHaveCount(0);
    await (await openOperatorMenu(page)).locator(".map-operator-toggle").click();
    await expect(screen).toHaveAttribute("data-operator", "off");
    await expect(screen).not.toHaveAttribute("data-free-view", /./);

    // [성능 표시]: 켜면 성능 판, 다시 열어도 켜진 채(이 기기에 기억)
    await setPerfPanel(page, true);
    await expect(page.locator(".map-perf")).toBeVisible();
    await expect(page.locator(".map-perf")).toContainText("fps");
    // Esc로 닫힌다
    await openOperatorMenu(page);
    await page.keyboard.press("Escape");
    await expect(page.locator(".map-operator-menu")).toHaveCount(0);
    await page.reload();
    await expect(screen).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
    await expect(page.locator(".map-perf")).toBeVisible();
    // 밖(아래 탭)을 누르면 닫힌다. 끄면 성능 판도 닫힌다
    await setPerfPanel(page, false);
    await expect(page.locator(".map-perf")).toHaveCount(0);
    await openOperatorMenu(page);
    await navButton(page, "nearby").click();
    await expect(page.locator(".map-operator-menu")).toHaveCount(0);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("2차맵 정리 사진", () => {
  for (const theme of ["pastel", "dark"] as const satisfies readonly Theme[]) {
    test.describe(`플레이어 390 ${theme}`, () => {
      test.use({ account: "player", theme, language: "ko" });
      test(`아래 탭·도시 화면·누른 건물 (390·${theme})`, async ({ page, deviceErrors }) => {
        test.setTimeout(150_000);
        await openMap(page);
        await page.waitForTimeout(1_500);
        await shot(page, `map-hud-nav-390-${theme}`);
        const city = await cityWithRows(page);
        await page.waitForTimeout(400);
        expect(await horizontalOverflow(page)).toEqual([]);
        await shot(page, `map-hud-city-390-${theme}`);
        await city.locator(".map-city-row").first().click();
        await expect(page.locator(".gather-sheet[data-building]")).toBeVisible();
        await page.waitForTimeout(1_200);
        expect(await navOverlaps(page)).toEqual([]);
        await shot(page, `map-hud-building-390-${theme}`);
        expect(deviceErrors).toEqual([]);
      });
    });
    test.describe(`운영자 390 ${theme}`, () => {
      test.use({ account: "dev", theme, language: "ko" });
      test(`운영 메뉴 (390·${theme})`, async ({ page, deviceErrors }) => {
        test.setTimeout(120_000);
        await openMap(page);
        await setPerfPanel(page, true);
        await page.waitForTimeout(1_200);
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await shot(page, `map-hud-ops-390-${theme}`);
        await closeOperatorMenu(page);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
  for (const language of ["en"] as const satisfies readonly Language[]) {
    test.describe(`영어 390 dark`, () => {
      test.use({ account: "dev", theme: "dark", language });
      test(`긴 영어: 운영 메뉴·도시 화면이 넘치지 않는다 (390·${language})`, async ({
        page,
        deviceErrors,
      }) => {
        test.setTimeout(120_000);
        await openMap(page);
        await openOperatorMenu(page);
        await menuToggleOperator(page);
        expect(await horizontalOverflow(page)).toEqual([]);
        await closeOperatorMenu(page);
        await cityWithRows(page);
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        expect(await navOverlaps(page)).toEqual([]);
        await shot(page, `map-hud-city-390-dark-${language}`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});

/** 운영자 모드를 켠다(운영 메뉴가 열린 채 — [자유 시점]까지 보이는 가장 긴 판) */
async function menuToggleOperator(page: Page): Promise<void> {
  const menu = page.locator(".map-operator-menu");
  const toggle = menu.locator(".map-operator-toggle");
  // 항목을 누르면 메뉴가 닫힌다(D-560 1239) — 다시 연다
  if ((await toggle.getAttribute("aria-pressed")) !== "true") await toggle.click();
  await openOperatorMenu(page);
  await expect(menu.locator(".map-free-view")).toBeVisible();
}
