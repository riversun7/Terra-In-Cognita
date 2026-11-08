// 채집소 화면 시험 — 사용자 지적(2026-11-08) "원자재채집소의 기능도 필요", docs/adr/2026-11-07-gather-objects.md "바뀜 (2026-11-08 …)".
// - player: 내 사이보그 2차맵의 시작 도시 시설 가운데 채집소(NPC 벌목장·광산·농장)의 건물 표시를 누르면 건물 판 안에 채집소 판(레벨·반경·버프·반경
//   안 원자재·채집소 창고·일꾼)이 보이고, 원자재 채집소면 지도에 반경 고리가 그려진다. 판을 닫으면 고리도 지운다.
// - admin: 경제 → 생산에서 벌목장을 짓고(개발 재료·바로 끝내기) 그 카드에 채집소 칸(반경·원자재·창고·자동 옮김)이 보인다.
// - 사진(E2E_SHOTS_DIR): 채집소 판 390 파스텔 한국어·다크 영어, 채집소 칸 390 파스텔 한국어·다크 영어.
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

/** 보이는 건물 표시 가운데 채집소(objects 먼저, 없으면 facility) 건물 ID */
async function findStation(page: Page): Promise<number | null> {
  const ids = await page
    .locator(BUILDING_MARKER)
    .evaluateAll((elements) => elements.map((element) => Number(element.getAttribute("data-building"))));
  return page.evaluate(async (list) => {
    let fallback: number | null = null;
    for (const id of list) {
      if (!Number.isInteger(id)) continue;
      const input = encodeURIComponent(JSON.stringify({ buildingId: id }));
      const reply: unknown = await fetch(`/api/trpc/gather.station?input=${input}`).then((r) => r.json());
      const data: unknown =
        typeof reply === "object" && reply !== null
          ? Reflect.get(Reflect.get(reply, "result") ?? {}, "data")
          : undefined;
      if (typeof data !== "object" || data === null || Reflect.get(data, "status") !== "ok") continue;
      if (Reflect.get(data, "kind") === "objects") return id;
      fallback ??= id;
    }
    return fallback;
  }, ids);
}

/** 그 건물 표시를 누른다(판에 가리지 않을 때까지 짧게 다시) */
async function clickBuilding(page: Page, id: number): Promise<boolean> {
  const marker = page.locator(`.gather-building-marker[data-building="${id}"]:not([hidden])`);
  try {
    await marker.click({ timeout: 3_000 });
    return true;
  } catch {
    return false;
  }
}

async function openStationSheet(page: Page): Promise<Locator> {
  await openMap(page);
  let id: number | null = null;
  await expect
    .poll(
      async () => {
        id = await findStation(page);
        return id;
      },
      { timeout: 30_000 },
    )
    .not.toBeNull();
  const found = id ?? 0;
  await expect.poll(() => clickBuilding(page, found), { timeout: 15_000 }).toBe(true);
  const station = page.locator(`.gather-sheet[data-building="${found}"] [data-part="gather-station"]`);
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

const facilitiesPanel = (page: Page): Locator => page.locator('section[data-part="facilities"]');

/** 경제 → 생산을 열고 내 벌목장 카드(없으면 빈 칸을 찾아 짓고 바로 끝낸다) */
async function lumberCamp(page: Page, language: Language): Promise<Locator> {
  await rewriteTrpc(page, { "summary.get": hideSummary });
  await page.goto("/economy/production");
  const panel = facilitiesPanel(page);
  await expect(panel.locator('[data-part="facility-units"]')).toBeVisible({ timeout: 15_000 });
  const cards = panel.locator('li[data-part="facility-card"]');
  const existing = cards.filter({ has: page.locator('[data-part="facility-station"]') });
  if ((await existing.count()) > 0) return existing.first();
  const form = panel.locator("form.labor-form");
  const build = form.getByRole("button", { name: message(language, "facility_build"), exact: true });
  await form.getByLabel(message(language, "facility_field_facility")).selectOption("lumber_camp");
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
    await expect(card.locator('[data-part="facility-station"]')).toBeVisible({ timeout: 20_000 });
    return card;
  }
  throw new Error("no free cell for lumber_camp");
}

for (const look of LOOKS) {
  test.describe(`채집소 칸(건물 화면) 390·${look.theme}·${look.language}`, () => {
    test.use({ account: "admin", theme: look.theme, language: look.language, ...VIEWPORTS.phone });

    test(`벌목장 카드의 채집소 칸 (390·${look.theme}·${look.language})`, async ({ page, deviceErrors }) => {
      test.setTimeout(120_000);
      const card = await lumberCamp(page, look.language);
      const part = card.locator('[data-part="facility-station"]');
      await expect(part).toContainText(message(look.language, "station_summary_title", { cells: 40 }));
      expect(await horizontalOverflow(page)).toEqual([]);
      await elementShot(card, `gather-station-card-390-${look.theme}-${look.language}`);
      expect(deviceErrors).toEqual([]);
    });
  });
}
