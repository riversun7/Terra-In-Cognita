// 2차맵에서 옆 2차맵으로 화면 시험(docs/adr/2026-11-07-play-flow.md "WP14"·"WP15", 사용자 지적 2026-11-08 "2차맵 넘어서 이동이 되지 않음") — player
// 시험 서버는 행성 값으로 세계를 놓는다(국가마다 행성 위 자기 자리: 수도 + 붙은 2차맵의 시작 도시, ADR 2026-11-07-world-layout). player의 사이보그는
// 첫 국가 수도에 있어 옆 2차맵 가운데 띄운 것(같은 국가의 붙은 시작 도시)과 띄우지 않은 것이 함께 있다.
// - [옆 2차맵으로] → 변 넷(나침반 이름)마다 서버 확인: 띄운 옆 2차맵은 거리·시간·[보내기], 띄우지 않은 옆 2차맵도 [보내기]에 "닿으면 엽니다"
//   (기획 답 730 다 — 서버가 닿을 때 띄운다, WP15). 막힌 변이 없으니 "설 수 없다" 까닭은 보이지 않는다.
// - [보내기] = travel_start(옆 2차맵, 변 너머 칸) → 가는 중 한 줄(남은 시간·도착 예상)·유닛 머리 위 이름표 → [멈추기] = travel_cancel → 멈춘 까닭.
//   걸어서 변까지 몇 분이라 넘어가는 순간(D-139 바꿈)은 서버 시험(travel/layoutTravel.db.test.ts)이 본다. 시험이 끝나면 사이보그는 수도 2차맵에 선다.
// - 사진: 판·가는 중 390 × 파스텔·다크(한국어), 판 390 파스텔 영어. 넘침·작은 누르는 곳 없음.
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";

/** 2차맵(내 사이보그)을 열고 자료·지형이 서기를 기다린다 */
async function openMap(page: Page): Promise<void> {
  await page.goto("/map");
  const screen = page.locator(".map-screen[data-map-key]");
  await expect(screen).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
  await expect(screen).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
}

/** [옆 2차맵으로] 판을 열고 변마다 서버 확인이 올 때까지 */
async function openEdgeSheet(page: Page): Promise<void> {
  const open = page.locator(".map-edge-open");
  await expect(open).toBeVisible({ timeout: 15_000 });
  await open.click();
  const sheet = page.locator(".map-edge");
  await expect(sheet).toBeVisible();
  await expect(sheet.locator(".map-edge-side")).not.toHaveCount(0);
  await expect(sheet.locator('.map-edge-side[data-state="loading"]')).toHaveCount(0, { timeout: 15_000 });
}

/** 내 길 목록(world.travels)의 그 유닛 줄 상태·줄 길이 */
async function travelOf(page: Page, unitId: string): Promise<{ state: unknown; maps: number } | null> {
  return page.evaluate(async (id) => {
    const response: unknown = await fetch("/api/trpc/world.travels").then((reply) => reply.json());
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
    const pick = (value: unknown, key: string): unknown =>
      typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
    const list = pick(pick(pick(response, "result"), "data"), "travels");
    if (!Array.isArray(list)) return null;
    const row: unknown = list.find((entry: unknown) => String(pick(entry, "unitId")) === id);
    if (row === undefined) return null;
    const route = pick(row, "route");
    return { state: pick(row, "state"), maps: Array.isArray(route) ? route.length : 0 };
  }, unitId);
}

test.describe("옆 2차맵으로: 플레이어", () => {
  test.use({ account: "player" });

  test("변 넷의 열림·닫힘 까닭 → [보내기] → 가는 중(이름표·남은 시간) → [멈추기]", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(120_000);
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await openMap(page);
    const screen = page.locator(".map-screen");
    const cyborg = (await screen.getAttribute("data-cyborg")) ?? "";
    expect(cyborg).toMatch(/^\d+$/);
    await openEdgeSheet(page);
    const sheet = page.locator(".map-edge");
    await expect(sheet).toHaveAttribute("data-edge-unit", cyborg);
    // 수도 2차맵: 띄운 옆 2차맵(붙은 시작 도시)과 띄우지 않은 옆 2차맵이 함께 있다 — 둘 다 보낼 수 있다(띄우지 않은 쪽은 닿을 때 연다)
    const opened = sheet.locator('.map-edge-side[data-state="open"]:not([data-opens])');
    const opens = sheet.locator('.map-edge-side[data-state="open"][data-opens="true"]');
    await expect(opened).not.toHaveCount(0);
    await expect(opens).not.toHaveCount(0);
    await expect(sheet.locator('.map-edge-side[data-state="closed"]')).toHaveCount(0);
    const opensNote =
      message("ko", "map_edge_plan_opens", { km: "", duration: "" }).split(" · ").at(-1) ?? "";
    await expect(opens.first()).toContainText(opensNote);
    await expect(sheet).not.toContainText(message("ko", "map_edge_closed_hint"));
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);

    // [보내기](띄우지 않은 옆 2차맵) → 가는 중(옆 2차맵까지 두 장)
    const target = await opens.first().getAttribute("data-map");
    await opens.first().locator(".map-edge-send").click();
    const going = page.locator(".map-edge-going");
    await expect(going).toBeVisible({ timeout: 20_000 });
    await expect(going).toHaveAttribute("data-edge-unit", cyborg);
    const travel = await travelOf(page, cyborg);
    expect(travel).toEqual({ state: "going", maps: 2 });
    expect(target).toMatch(/^\d+$/);
    // 유닛 머리 위 이름표(카메라가 내 사이보그를 본다)
    await expect(page.locator(".edge-chip:not([hidden])")).toHaveCount(1, { timeout: 10_000 });
    expect(await horizontalOverflow(page)).toEqual([]);

    // [멈추기] → 멈춘 까닭, 다시 [옆 2차맵으로]
    await going.locator(".map-edge-cancel").click();
    await expect(page.locator(".map-edge-result")).toHaveText(
      message("ko", "world_travel_stopped_cancelled"),
      {
        timeout: 20_000,
      },
    );
    await expect(page.locator(".map-edge-open")).toBeVisible();
    expect((await travelOf(page, cyborg))?.state).toBe("stopped");
    expect(deviceErrors).toEqual([]);
  });

  test("[1차맵에서 고르기]는 이 2차맵 자리의 1차맵을 연다", async ({ page, deviceErrors }) => {
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await openMap(page);
    const key = await page.locator(".map-screen").getAttribute("data-map-key");
    await openEdgeSheet(page);
    await page.locator(".map-edge-planet").click();
    await expect(page).toHaveURL(new RegExp(`/map/planet\\?key=${key ?? ""}`));
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("옆 2차맵으로 사진", () => {
  const cases: readonly { theme: Theme; language: Language }[] = [
    { theme: "pastel", language: "ko" },
    { theme: "dark", language: "ko" },
    { theme: "pastel", language: "en" },
  ];
  for (const { theme, language } of cases) {
    test.describe(`390 ${theme} ${language}`, () => {
      test.use({ account: "player", theme, language });
      test(`판·가는 중 (390·${theme}·${language})`, async ({ page, deviceErrors }) => {
        test.setTimeout(90_000);
        await rewriteTrpc(page, { "summary.get": hideSummary });
        await openMap(page);
        await openEdgeSheet(page);
        await page.waitForTimeout(800);
        expect(await horizontalOverflow(page)).toEqual([]);
        await shot(page, `map-edge-sheet-390-${theme}-${language}`);
        if (language !== "ko") return;
        await page.locator('.map-edge-side[data-state="open"] .map-edge-send').first().click();
        const going = page.locator(".map-edge-going");
        await expect(going).toBeVisible({ timeout: 20_000 });
        await page.waitForTimeout(800);
        await shot(page, `map-edge-going-390-${theme}`);
        await going.locator(".map-edge-cancel").click();
        await expect(page.locator(".map-edge-result")).toBeVisible({ timeout: 20_000 });
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
