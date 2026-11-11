// 도시 건물 배치 화면 시험 — docs/adr/2026-11-11-city-building-layout.md(사용자 요청 2026-11-11 "건물들도 바둑판 배열이 아닌 전략적으로").
// - admin: tRPC worldLayout.cityLayout — 이 시험 세계(전략 배치로 섰다)의 NPC 시작 도시는 행정 건물이 도시 칸 가운데(치우침 3칸 안), 숙소가 있고,
//   광장에서 걸어 닿지 못하는 건물이 없다(지금·다시 놓은 뒤 모두). /dev/world-layout [도시 건물 배치 보기] → 표·그림(건물 몫 색·출퇴근 길·옮김 선),
//   [지금]/[다시 놓은 뒤] 바꾸기. 예약은 이 실행의 서버를 다시 켜지 않으므로 누르지 않는다(tRPC 시험이 본다). 사진 390 라이트.
// - dev: 시작 도시 2차맵(운영자 모드, 줄인 거리 — 행정 건물 둘레 겹이 보이게) 390 파스텔·다크 사진.
import type { Page } from "@playwright/test";
import { centreOnBuildings, openCityMap } from "./helpers/cityMap.ts";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot } from "./helpers/screen.ts";
import { type Theme, expect, test } from "./helpers/test.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

const PLANET = "s2_test_planet";

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

/** 화면 안에서 tRPC 조회(같은 출처·쿠키) */
async function query(
  page: Page,
  procedure: string,
  input: unknown,
): Promise<{ status: number; data: unknown }> {
  return page.evaluate(
    async ({ name, body }) => {
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
      const get = (value: unknown, key: string): unknown =>
        typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
      const response = await fetch(`/api/trpc/${name}?input=${encodeURIComponent(JSON.stringify(body))}`);
      const json: unknown = await response.json();
      return { status: response.status, data: get(get(json, "result"), "data") };
    },
    { name: procedure, body: input },
  );
}

test.describe("도시 건물 배치: 운영자 판", () => {
  test.use({ account: "admin", devTheme: "light", viewport: { width: 390, height: 844 } });

  test("새 세계 NPC 도시: 행정 건물 가운데·숙소·갇힘 없음, 판 표·그림·모드 바꾸기, 가로 넘침 없음", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(180_000);
    await page.addLocatorHandler(page.locator("dialog.summary-dialog[open]"), async () => {
      await page.keyboard.press("Escape");
    });
    await page.goto("/dev/world-layout");
    await expect(page.locator(".wl-screen")).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
    const api = await query(page, "worldLayout.cityLayout", { planetId: PLANET });
    expect(api.status).toBe(200);
    const cities = list(field(api.data, "cities"));
    expect(cities.length).toBeGreaterThan(0);
    for (const city of cities) {
      const now = field(city, "now");
      const planned = field(city, "planned");
      expect(Number(field(now, "hallOffset"))).toBeLessThanOrEqual(3);
      expect(field(now, "walledIn")).toBe(0);
      expect(field(planned, "walledIn")).toBe(0);
      const roles = list(field(city, "buildings")).map((building) => field(building, "role"));
      expect(roles.filter((role) => role === "core")).toHaveLength(1);
      expect(roles.filter((role) => role === "living").length).toBeGreaterThanOrEqual(1);
    }
    console.log(
      `[measure] city-layout cities ${String(cities.length)} moves ${String(field(field(api.data, "totals"), "moves"))}`,
    );

    const panel = page.locator(".wl-city");
    await panel
      .getByRole("button", { name: message("ko", "dev_world_layout_city_show"), exact: true })
      .click();
    await expect(panel).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
    await expect(panel.locator("[data-city-row]")).toHaveCount(cities.length);
    await expect(panel.locator('.wl-city-building[data-role="core"]')).toHaveCount(1);
    await expect(panel.locator('.wl-city-building[data-role="living"]').first()).toBeAttached();
    await expect(panel.locator('.wl-city-line[data-line="route"]').first()).toBeAttached();
    await panel
      .getByRole("radio", { name: message("ko", "dev_world_layout_city_mode_now"), exact: true })
      .check();
    await expect(panel.locator('.wl-city-building[data-role="core"]')).toHaveCount(1);
    await panel.locator(".wl-city-map").evaluate((node) => node.scrollIntoView({ block: "center" }));
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    expect(await horizontalOverflow(page)).toEqual([]);
    await shot(page, "city-layout-panel-light-ko-390");
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("도시 건물 배치: 시작 도시 2차맵", () => {
  test.use({ account: "dev" });
  for (const theme of ["pastel", "dark"] as const satisfies readonly Theme[]) {
    test.describe(theme, () => {
      test.use({ ...VIEWPORTS.phone, theme, language: "ko" });
      test(`행정 건물 둘레 겹 사진 (390·${theme})`, async ({ page, deviceErrors }) => {
        test.setTimeout(180_000);
        await openCityMap(page, "&second-map-time=11");
        await centreOnBuildings(page);
        // 겹(숙소·창고·채집소)이 한 화면에 들게 두 단계 더 줄인다
        for (let step = 0; step < 2; step++) {
          await page.locator(".zoom-ladder-out").click();
          await page.waitForTimeout(800);
        }
        await centreOnBuildings(page);
        await page.addStyleTag({ content: ".gather-overlay > * { visibility: hidden !important; }" });
        await page.waitForTimeout(500);
        await shot(page, `city-layout-map-${theme}-ko-390`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
