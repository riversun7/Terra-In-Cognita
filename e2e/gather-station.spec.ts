// 채집소 화면 시험 — 사용자 지적(2026-11-08) "원자재채집소의 기능도 필요", docs/adr/2026-11-07-gather-objects.md "바뀜 (2026-11-08 …)".
// - player: 내 사이보그 2차맵의 시작 도시 시설 가운데 채집소(NPC 벌목장·광산·농장)의 건물 표시를 누르면 건물 판 안에 채집소 판(레벨·반경·버프·반경
//   안 원자재·채집소 창고·일꾼)이 보이고, 원자재 채집소면 지도에 반경 고리가 그려진다. 판을 닫으면 고리도 지운다.
// - admin: 경제 → 생산에서 벌목장을 짓고(개발 재료·바로 끝내기) 그 카드에 채집소 칸(반경·원자재·창고·자동 옮김)이 보인다.
// - 농장(기획 정리 756 ② — 팩 core@66부터 밭 자리를 맡는 원자재 채집소, docs/adr/2026-11-11-city-catchment.md): 시작 도시 농장 판에 반경·수확·
//   피로·다시 자람 버프·반경 안 원자재(밭)·채집소 창고가 보이고 반경 고리를 그린다. 경제 → 생산에서 지은 농장 카드에도 채집소 칸(반경)이 보인다.
// - 노두(기획 D-534 질문 1083 나): 내 2차맵(행성 값이 있는 낮은 땅) gather.objects에 돌·구리 노두 종류(기기 그림 번호)와 노두 오브젝트가 있고,
//   근처 자원 목록의 노두 줄을 누르면 오브젝트 판(이름·[채집]·광산이 맡음)이 열린다.
// - 사진(E2E_SHOTS_DIR): 채집소 판 390 파스텔 한국어·다크 영어, 채집소 칸 390 파스텔 한국어·다크 영어, 농장 판·농장 칸 같은 넷, 노두 판 둘.
import type { Locator, Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { elementShot, horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { collapseNearby, nearbyBuildingIds, openBuildingFromList, openNearby } from "./helpers/nearby.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

/** 내 사이보그 2차맵을 열고 건물 표시가 설 때까지 */
async function openMap(page: Page): Promise<void> {
  await rewriteTrpc(page, { "summary.get": hideSummary });
  await page.goto("/map");
  const map = page.locator(".map-screen[data-map-key]");
  await expect(map).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
  await expect(map).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
  // 건물은 근처 판 건물 탭 목록으로 연다(지도 위 건물마다 단추는 지웠다 — 사용자 지적 2026-11-12 "누른 건물만 표시해라")
  await openNearby(page, "buildings");
  await expect(page.locator('.map-nearby-row[data-kind="building"]').first()).toBeVisible({
    timeout: 30_000,
  });
  await collapseNearby(page);
}

/** 찾는 채집소: objects = 원자재 채집소만, any = 원자재 채집소 먼저 그다음 오브젝트 없는 채집소, farm = 농장만 */
type Want = "objects" | "any" | "farm";

/** 보이는 건물 표시 가운데 찾는 채집소 건물 ID. 없으면 빈 목록 */
async function findStations(page: Page, want: Want): Promise<number[]> {
  // 근처 판 건물 목록(가까운 차례 — 지도 표시와 같은 것)
  const ids = await nearbyBuildingIds(page);
  return page
    .evaluate(async (list) => {
      const objects: number[] = [];
      const others: number[] = [];
      const farms: number[] = [];
      for (const id of list) {
        if (!Number.isInteger(id)) continue;
        const input = encodeURIComponent(JSON.stringify({ buildingId: id }));
        const reply: unknown = await fetch(`/api/trpc/gather.station?input=${input}`).then((r) => r.json());
        const data: unknown =
          typeof reply === "object" && reply !== null
            ? Reflect.get(Reflect.get(reply, "result") ?? {}, "data")
            : undefined;
        if (typeof data !== "object" || data === null || Reflect.get(data, "status") !== "ok") continue;
        if (Reflect.get(data, "facilityId") === "farm") farms.push(id);
        if (Reflect.get(data, "kind") === "objects") objects.push(id);
        else others.push(id);
      }
      return { objects, others, farms };
    }, ids)
    .then((found) =>
      want === "objects"
        ? found.objects
        : want === "farm"
          ? found.farms
          : [...found.objects, ...found.others],
    );
}

/** 채집소 건물 판을 연다: 근처 판 건물 목록에서 찾는 채집소(원자재 채집소 먼저, farmOnly면 농장만) 줄을 누른다 */
async function openStationSheet(page: Page, farmOnly = false): Promise<Locator> {
  await openMap(page);
  const ids = await findStations(page, farmOnly ? "farm" : "any");
  const opened = ids[0] ?? null;
  expect(opened).not.toBeNull();
  await openBuildingFromList(page, opened ?? 0);
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
    // 건물 판 개편(docs/adr/2026-11-15-building-screen.md): 개요 칸 = 채집소 요약, 창고는 [창고] 칸
    await expect(station).toHaveAttribute("data-station-part", "summary");
    const kind = await station.getAttribute("data-kind");
    if (kind === "objects") {
      await expect(station.locator('[data-part="station-buffs"]')).toBeVisible();
      // 반경 고리(SVG 다각형)가 그려진다
      await expect
        .poll(() => page.locator(".gather-ring").evaluate((element) => getComputedStyle(element).display))
        .not.toBe("none");
    }
    await page.locator('.gather-sheet[data-building] .bp-tab[data-tab="storage"]').click();
    await expect(station).toHaveAttribute("data-station-part", "storage");
    await expect(station).toContainText(message("ko", "station_storage_title"));
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

/** 내 2차맵의 노두 종류 차례·오브젝트 번호(gather.objects) */
async function outcropsOf(
  page: Page,
): Promise<{ kinds: number[]; arts: number[]; objects: number[]; schoolTiers: string[] }> {
  const mapKey = Number(await page.locator(".map-screen[data-map-key]").getAttribute("data-map-key"));
  return page.evaluate(async (key) => {
    const input = encodeURIComponent(JSON.stringify({ mapKey: key }));
    const reply: unknown = await fetch(`/api/trpc/gather.objects?input=${input}`).then((r) => r.json());
    const data: unknown =
      typeof reply === "object" && reply !== null
        ? Reflect.get(Reflect.get(reply, "result") ?? {}, "data")
        : undefined;
    const kinds: unknown = typeof data === "object" && data !== null ? Reflect.get(data, "kinds") : [];
    const flat: unknown = typeof data === "object" && data !== null ? Reflect.get(data, "objects") : [];
    const outKinds: number[] = [];
    const arts: number[] = [];
    const schoolTiers: string[] = [];
    if (Array.isArray(kinds))
      kinds.forEach((kind: unknown, index) => {
        const id = typeof kind === "object" && kind !== null ? Reflect.get(kind, "id") : undefined;
        // 어군 티어 범위(기획 D-541 질문 1307 나): 판이 "사다리 Tmin~Tmax"를 보인다
        const tiers: unknown =
          typeof kind === "object" && kind !== null ? Reflect.get(kind, "ladderTiers") : null;
        if (typeof id === "string" && id.startsWith("school_") && typeof tiers === "object" && tiers !== null)
          schoolTiers.push(`${id}:${String(Reflect.get(tiers, "min"))}-${String(Reflect.get(tiers, "max"))}`);
        if (id === "stone_outcrop" || id === "copper_outcrop") {
          outKinds.push(index);
          arts.push(Number(Reflect.get(kind ?? {}, "art") ?? 0));
        }
      });
    const objects: number[] = [];
    if (Array.isArray(flat))
      for (let i = 0; i + 3 < flat.length; i += 4)
        if (outKinds.includes(Number(flat[i + 1]))) objects.push(Number(flat[i]));
    return { kinds: outKinds, arts, objects, schoolTiers };
  }, mapKey);
}

for (const look of LOOKS) {
  test.describe(`노두 390·${look.theme}·${look.language}`, () => {
    test.use({ account: "player", theme: look.theme, language: look.language, ...VIEWPORTS.phone });

    test(`낮은 땅 2차맵에도 돌·구리 노두가 서고 근처 목록에서 판을 연다 (390·${look.theme}·${look.language})`, async ({
      page,
      deviceErrors,
    }) => {
      test.setTimeout(240_000);
      await rewriteTrpc(page, { "summary.get": hideSummary });
      await page.goto("/map");
      const map = page.locator(".map-screen[data-map-key]");
      await expect(map).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
      await expect
        .poll(async () => Number(await page.locator(".gather-panel").getAttribute("data-objects")), {
          timeout: 30_000,
        })
        .toBeGreaterThan(0);
      const found = await outcropsOf(page);
      expect(found.kinds).toHaveLength(2);
      expect(found.schoolTiers).toEqual([
        "school_lake:0-2",
        "school_coastal:0-4",
        "school_shelf:2-6",
        "school_deep:4-8",
      ]);
      for (const art of found.arts) expect(art).toBeGreaterThan(0);
      expect(found.objects.length).toBeGreaterThan(0);
      // 근처 자원 목록에서 노두 줄(가까운 차례로 더 보기를 눌러 찾는다)
      await openNearby(page, "resources");
      const ids = new Set(found.objects.map(String));
      let row: Locator | null = null;
      for (let step = 0; step < 60 && row === null; step++) {
        const rows = page.locator('.map-nearby-row[data-kind="object"]');
        const count = await rows.count();
        for (let index = 0; index < count && row === null; index++) {
          const candidate = rows.nth(index);
          if (ids.has((await candidate.getAttribute("data-id")) ?? "")) row = candidate;
        }
        const more = page.locator(".map-nearby-more");
        if (row === null && (await more.count()) > 0) await more.click();
        else if (row === null) break;
      }
      expect(row).not.toBeNull();
      await row?.click();
      const sheet = page.locator(".gather-sheet[data-object]");
      await expect(sheet).toBeVisible();
      await expect(sheet).toContainText(look.language === "ko" ? "노두" : "outcrop");
      await expect(sheet.locator(".gather-sheet-gather")).toBeVisible();
      expect(await horizontalOverflow(page)).toEqual([]);
      expect(await smallTapTargets(page)).toEqual([]);
      await shot(page, `gather-outcrop-390-${look.theme}-${look.language}`);
      expect(deviceErrors).toEqual([]);
    });
  });
}

for (const look of LOOKS) {
  test.describe(`채집소 판 사진 390·${look.theme}·${look.language}`, () => {
    test.use({ account: "player", theme: look.theme, language: look.language, ...VIEWPORTS.phone });

    test(`채집소 판 (390·${look.theme}·${look.language})`, async ({ page, deviceErrors }) => {
      test.setTimeout(240_000);
      const station = await openStationSheet(page);
      await expect(station).toHaveAttribute("data-station-part", "summary");
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

    test(`농장 판: 밭 채집소 — 반경·버프·밭·창고·자동 옮김, 반경 고리 (390·${look.theme}·${look.language})`, async ({
      page,
      deviceErrors,
    }) => {
      test.setTimeout(240_000);
      const station = await openStationSheet(page, true);
      // 팩 core@66: 농장은 밭(plot)을 맡는 원자재 채집소(docs/adr/2026-11-11-city-catchment.md)
      await expect(station).toHaveAttribute("data-kind", "objects");
      // 시작 도시 농장은 Lv 1: 채집량 +0% · 피로 −50% · 다시 자람 −50%
      await expect(station.locator('[data-part="station-buffs"]')).toHaveText(
        message(look.language, "station_buffs_line", { gain: 0, fatigue: 50, regrow: 50 }),
      );
      await expect(station.locator('[data-part="station-objects"]')).toBeVisible();
      // 창고·자동 옮김은 [창고] 칸(건물 판 개편 — docs/adr/2026-11-15-building-screen.md)
      await page.locator('.gather-sheet[data-building] .bp-tab[data-tab="storage"]').click();
      await expect(station).toHaveAttribute("data-station-part", "storage");
      await expect(station).toContainText(message(look.language, "station_storage_title"));
      await expect(station.locator('[data-part="station-haul"]')).toBeVisible();
      // 옮김 거리(질문 1050 가): 창고(또는 도시 가운데)까지 칸·지금 짐 나르는 시간
      await expect(station.locator('[data-part="station-haul-route"]')).toBeVisible();
      await station.locator('[data-part="station-haul-route"]').scrollIntoViewIfNeeded();
      await elementShot(
        station.locator('[data-part="station-haul-route"]'),
        `gather-station-haul-route-390-${look.theme}-${look.language}`,
      );
      // 반경 고리를 그린다
      await expect
        .poll(() => page.locator(".gather-ring").evaluate((element) => getComputedStyle(element).display))
        .not.toBe("none");
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
  await rewriteTrpc(page, { "summary.get": hideSummary });
  await page.goto("/economy/production");
  const panel = facilitiesPanel(page);
  await expect(panel.locator('[data-part="facility-units"]')).toBeVisible({ timeout: 15_000 });
  const cards = panel.locator('li[data-part="facility-card"]');
  // 여섯 채집 시설이 모두 원자재 채집소(팩 core@66) — 카드는 시설 ID로 고른다
  const station = '[data-part="facility-station"][data-kind="objects"]';
  const existing = panel.locator(`li[data-part="facility-card"][data-facility="${facility}"]`).filter({
    has: page.locator(station),
  });
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
  test.describe(`농장 채집소 칸(건물 화면, 756 ② · 밭) 390·${look.theme}·${look.language}`, () => {
    test.use({ account: "admin", theme: look.theme, language: look.language, ...VIEWPORTS.phone });

    test(`농장 카드의 채집소 칸 (390·${look.theme}·${look.language})`, async ({ page, deviceErrors }) => {
      test.setTimeout(120_000);
      const card = await gatherCard(page, look.language, "farm");
      const part = card.locator('[data-part="facility-station"]');
      // 팩 core@66: 농장도 반경 안 밭을 쓰는 원자재 채집소
      await expect(part).toContainText(message(look.language, "station_summary_title", { cells: 40 }));
      await expect(part.locator('[data-part="station-haul"]')).toBeVisible();
      expect(await horizontalOverflow(page)).toEqual([]);
      await elementShot(card, `gather-station-farm-card-390-${look.theme}-${look.language}`);
      expect(deviceErrors).toEqual([]);
    });
  });
}
