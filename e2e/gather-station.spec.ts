// 채집소 화면 시험 — 사용자 지적(2026-11-08) "원자재채집소의 기능도 필요", docs/adr/2026-11-07-gather-objects.md "바뀜 (2026-11-08 …)".
// - player: 내 사이보그 2차맵의 시작 도시 시설 가운데 채집소(NPC 벌목장·광산·농장)의 건물 표시를 누르면 건물 판 안에 채집소 판(레벨·반경·버프·반경
//   안 원자재·채집소 창고·일꾼)이 보이고, 원자재 채집소면 지도에 반경 고리가 그려진다. 판을 닫으면 고리도 지운다.
// - admin: 경제 → 생산에서 벌목장을 짓고(개발 재료·바로 끝내기) 그 카드에 채집소 칸(반경·원자재·창고·자동 옮김)이 보인다.
// - 농장(오브젝트 없는 facility 채집소, 기획 정리 756 ②): 시작 도시 농장 판에 수확·피로 버프(다시 자람·반경 없음)·채집소 창고·자동 옮김이 보이고
//   반경 고리는 그리지 않는다. 경제 → 생산에서 지은 농장 카드에도 채집소 칸(시설 안 생산·버프·창고·자동 옮김)이 보인다.
// - 사진(E2E_SHOTS_DIR): 채집소 판 390 파스텔 한국어·다크 영어, 채집소 칸 390 파스텔 한국어·다크 영어, 농장 판·농장 칸 같은 넷.
import type { Locator, Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { elementShot, horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

const BUILDING_MARKER = ".gather-building-marker:not([hidden])";

/** 내 사이보그 2차맵을 열고 건물 표시가 설 때까지 */
async function openMap(page: Page): Promise<void> {
  await rewriteTrpc(page, { "summary.get": hideSummary });
  await page.goto("/map");
  const map = page.locator(".map-screen[data-map-key]");
  await expect(map).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
  await expect(map).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
  await expect(page.locator(BUILDING_MARKER).first()).toBeVisible({ timeout: 30_000 });
}

/** 찾는 채집소: objects = 원자재 채집소만, any = 원자재 채집소 먼저 그다음 농장 등, facility = 농장 등(오브젝트 없음)만 */
type Want = "objects" | "any" | "facility";

/** 보이는 건물 표시 가운데 찾는 채집소 건물 ID. 없으면 빈 목록 */
async function findStations(page: Page, want: Want): Promise<number[]> {
  const ids = await page
    .locator(BUILDING_MARKER)
    .evaluateAll((elements) => elements.map((element) => Number(element.getAttribute("data-building"))));
  return page
    .evaluate(async (list) => {
      const objects: number[] = [];
      const others: number[] = [];
      for (const id of list) {
        if (!Number.isInteger(id)) continue;
        const input = encodeURIComponent(JSON.stringify({ buildingId: id }));
        const reply: unknown = await fetch(`/api/trpc/gather.station?input=${input}`).then((r) => r.json());
        const data: unknown =
          typeof reply === "object" && reply !== null
            ? Reflect.get(Reflect.get(reply, "result") ?? {}, "data")
            : undefined;
        if (typeof data !== "object" || data === null || Reflect.get(data, "status") !== "ok") continue;
        if (Reflect.get(data, "kind") === "objects") objects.push(id);
        else others.push(id);
      }
      return { objects, others };
    }, ids)
    .then((found) =>
      want === "objects"
        ? found.objects
        : want === "facility"
          ? found.others
          : [...found.objects, ...found.others],
    );
}

/**
 * 그 건물 표시가 위·아래 판(HUD)에 가리지 않았으면 누르고 판이 열리면 true. 표시는 누르기를 지도로 지나보내고 엔진이 화면 거리로 고르므로
 * (docs/adr/2026-11-08-map-input.md) 표시 가운데 아래가 지도 캔버스인지 보고 그 자리를 짧게 누른다
 */
async function clickFreeBuilding(page: Page, id: number): Promise<boolean> {
  const marker = page.locator(`.gather-building-marker[data-building="${id}"]:not([hidden])`);
  if ((await marker.count()) === 0) return false;
  const point = await marker.first().evaluate((element) => {
    const box = element.getBoundingClientRect();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const hit = document.elementFromPoint(x, y);
    return hit instanceof HTMLCanvasElement && hit.closest(".map-view") ? { x, y } : null;
  });
  if (!point) return false;
  await page.mouse.click(point.x, point.y);
  try {
    await expect(page.locator(`.gather-sheet[data-building="${id}"]`)).toBeVisible({ timeout: 2_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * 채집소 건물 판을 연다. 채집소 표시가 판(성능 줄 등)에 가려 있으면 휠로 조금씩 멀리 본다(헤드리스 휠 이벤트는 합쳐지므로 단계마다 띄운다,
 * gather.spec.ts와 같은 방법)
 */
async function openStationSheet(page: Page, facilityOnly = false): Promise<Locator> {
  await openMap(page);
  const size = page.viewportSize() ?? { width: 390, height: 844 };
  let opened: number | null = null;
  // 처음 여섯 단계는 원자재 채집소(벌목장·광산)만, 그 뒤에는 농장도(facilityOnly면 처음부터 농장 등만)
  for (let step = 0; step < 10 && opened === null; step++) {
    for (const id of await findStations(page, facilityOnly ? "facility" : step < 6 ? "objects" : "any"))
      if (await clickFreeBuilding(page, id)) {
        opened = id;
        break;
      }
    if (opened !== null) break;
    await page.mouse.move(size.width / 2, size.height / 2);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(400);
  }
  expect(opened).not.toBeNull();
  const station = page.locator(`.gather-sheet[data-building="${opened ?? 0}"] [data-part="gather-station"]`);
  await expect(station).toBeVisible({ timeout: 20_000 });
  return station;
}

test.describe("채집소 판: 플레이어", () => {
  test.use({ account: "player" });

  test("시작 도시 채집소 건물 표시 → 채집소 판(레벨·창고·일꾼), 원자재 채집소면 반경 고리, 닫으면 지운다", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(240_000);
    const station = await openStationSheet(page);
    await expect(station).toContainText(message("ko", "station_storage_title"));
    const kind = await station.getAttribute("data-kind");
    if (kind === "objects") {
      await expect(station.locator('[data-part="station-buffs"]')).toBeVisible();
      // 반경 고리(SVG 다각형)가 그려진다
      await expect
        .poll(() => page.locator(".gather-ring").evaluate((element) => getComputedStyle(element).display))
        .not.toBe("none");
    }
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);
    await page.locator(".gather-sheet[data-building] .gather-sheet-close").click();
    await expect(page.locator(".gather-panel")).toHaveAttribute("data-sheet", "none");
    await expect
      .poll(() => page.locator(".gather-ring").evaluate((element) => getComputedStyle(element).display))
      .toBe("none");
    expect(deviceErrors).toEqual([]);
  });
});

const LOOKS = [
  { theme: "pastel", language: "ko" },
  { theme: "dark", language: "en" },
] as const satisfies readonly { theme: Theme; language: Language }[];

for (const look of LOOKS) {
  test.describe(`채집소 판 사진 390·${look.theme}·${look.language}`, () => {
    test.use({ account: "player", theme: look.theme, language: look.language, ...VIEWPORTS.phone });

    test(`채집소 판 (390·${look.theme}·${look.language})`, async ({ page, deviceErrors }) => {
      test.setTimeout(240_000);
      const station = await openStationSheet(page);
      await expect(station).toContainText(message(look.language, "station_storage_title"));
      expect(await horizontalOverflow(page)).toEqual([]);
      expect(await smallTapTargets(page)).toEqual([]);
      await shot(page, `gather-station-390-${look.theme}-${look.language}`);
      await elementShot(
        page.locator(".gather-sheet[data-building]"),
        `gather-station-sheet-390-${look.theme}-${look.language}`,
      );
      expect(deviceErrors).toEqual([]);
    });
  });
}

for (const look of LOOKS) {
  test.describe(`농장 채집소 판(756 ②) 390·${look.theme}·${look.language}`, () => {
    test.use({ account: "player", theme: look.theme, language: look.language, ...VIEWPORTS.phone });

    test(`농장 판: 창고·수확·피로 버프·자동 옮김, 반경 고리 없음 (390·${look.theme}·${look.language})`, async ({
      page,
      deviceErrors,
    }) => {
      test.setTimeout(240_000);
      const station = await openStationSheet(page, true);
      await expect(station).toHaveAttribute("data-kind", "facility");
      await expect(station).toContainText(message(look.language, "station_storage_title"));
      await expect(station).toContainText(message(look.language, "station_facility_note"));
      // 시작 도시 농장은 Lv 1: 채집량 +0% · 피로 −50%(다시 자람 없음)
      await expect(station.locator('[data-part="station-buffs"]')).toHaveText(
        message(look.language, "station_buffs_line_facility", { gain: 0, fatigue: 50 }),
      );
      await expect(station.locator('[data-part="station-haul"]')).toBeVisible();
      await expect(station).toContainText(message(look.language, "station_workers_note_facility"));
      await expect(station.locator('[data-part="station-objects"]')).toHaveCount(0);
      // 반경 고리는 그리지 않는다(오브젝트 없음)
      await expect
        .poll(() => page.locator(".gather-ring").evaluate((element) => getComputedStyle(element).display))
        .toBe("none");
      expect(await horizontalOverflow(page)).toEqual([]);
      expect(await smallTapTargets(page)).toEqual([]);
      await shot(page, `gather-station-farm-390-${look.theme}-${look.language}`);
      await elementShot(
        page.locator(".gather-sheet[data-building]"),
        `gather-station-farm-sheet-390-${look.theme}-${look.language}`,
      );
      expect(deviceErrors).toEqual([]);
    });
  });
}

const facilitiesPanel = (page: Page): Locator => page.locator('section[data-part="facilities"]');

/** 경제 → 생산을 열고 내 그 채집 시설 카드(채집소 칸 종류로 고른다, 없으면 빈 칸을 찾아 짓고 바로 끝낸다) */
async function gatherCard(
  page: Page,
  language: Language,
  facility: "lumber_camp" | "farm",
): Promise<Locator> {
  const kind = facility === "farm" ? "facility" : "objects";
  await rewriteTrpc(page, { "summary.get": hideSummary });
  await page.goto("/economy/production");
  const panel = facilitiesPanel(page);
  await expect(panel.locator('[data-part="facility-units"]')).toBeVisible({ timeout: 15_000 });
  const cards = panel.locator('li[data-part="facility-card"]');
  const station = `[data-part="facility-station"][data-kind="${kind}"]`;
  const existing = cards.filter({ has: page.locator(station) });
  if ((await existing.count()) > 0) return existing.first();
  const form = panel.locator("form.labor-form");
  const build = form.getByRole("button", { name: message(language, "facility_build"), exact: true });
  await form.getByLabel(message(language, "facility_field_facility")).selectOption(facility);
  for (const cell of [40, 64, 88, 118, 150, 180, 210, 230]) {
    const before = await cards.count();
    await form.getByLabel(message(language, "facility_field_x")).fill(String(cell));
    await form.getByLabel(message(language, "facility_field_y")).fill(String(cell + 8));
    if (await build.isDisabled()) {
      await form.getByRole("button", { name: message(language, "facility_dev_grant") }).click();
      await expect(build).toBeEnabled({ timeout: 15_000 });
    }
    await build.click();
    try {
      await expect(cards).toHaveCount(before + 1, { timeout: 4_000 });
    } catch {
      continue;
    }
    const card = cards.last();
    await card.getByRole("button", { name: message(language, "facility_dev_finish") }).click();
    await expect(card.locator(station)).toBeVisible({ timeout: 20_000 });
    return card;
  }
  throw new Error(`no free cell for ${facility}`);
}

for (const look of LOOKS) {
  test.describe(`채집소 칸(건물 화면) 390·${look.theme}·${look.language}`, () => {
    test.use({ account: "admin", theme: look.theme, language: look.language, ...VIEWPORTS.phone });

    test(`벌목장 카드의 채집소 칸 (390·${look.theme}·${look.language})`, async ({ page, deviceErrors }) => {
      test.setTimeout(120_000);
      const card = await gatherCard(page, look.language, "lumber_camp");
      const part = card.locator('[data-part="facility-station"]');
      await expect(part).toContainText(message(look.language, "station_summary_title", { cells: 40 }));
      expect(await horizontalOverflow(page)).toEqual([]);
      await elementShot(card, `gather-station-card-390-${look.theme}-${look.language}`);
      expect(deviceErrors).toEqual([]);
    });
  });
}

for (const look of LOOKS) {
  test.describe(`농장 채집소 칸(건물 화면, 756 ②) 390·${look.theme}·${look.language}`, () => {
    test.use({ account: "admin", theme: look.theme, language: look.language, ...VIEWPORTS.phone });

    test(`농장 카드의 채집소 칸 (390·${look.theme}·${look.language})`, async ({ page, deviceErrors }) => {
      test.setTimeout(120_000);
      const card = await gatherCard(page, look.language, "farm");
      const part = card.locator('[data-part="facility-station"]');
      await expect(part).toContainText(message(look.language, "station_summary_title_facility"));
      await expect(part).toContainText(
        message(look.language, "station_buffs_line_facility", { gain: 0, fatigue: 50 }),
      );
      await expect(part.locator('[data-part="station-haul"]')).toBeVisible();
      expect(await horizontalOverflow(page)).toEqual([]);
      await elementShot(card, `gather-station-farm-card-390-${look.theme}-${look.language}`);
      expect(deviceErrors).toEqual([]);
    });
  });
}
