// 영토 층 화면 시험 — /dev/territory (docs/adr/2026-11-03-territory-layer.md, 기획 D-485·D-486·49 N42·N51).
// - admin: 지도에서 칸을 눌러 시험 NPC 세력의 비콘 셋을 놓으면 껍질 하나·칸 표가 생기고(서버 territory.planet), 넷째는 개수 상한(N42 마을 3).
//   두 번째 세력의 비콘 셋이 겹치면 껍질 둘, 겹친 곳은 가까운 꼭짓점(D-486). 비콘을 치우면 껍질이 사라진다.
// - player: 권한 없음 화면, tRPC territory.planet은 403, territory.mine은 200.
// - 사진: 1440(VIEWPORTS.desktop)·390 × 개발 화면 테마 네온·라이트(E2E_SHOTS_DIR, ADR 2026-11-02-dev-ui).
// 시험끼리 서버·DB를 같이 쓴다: 비콘을 놓는 시험은 처음과 끝에 모든 비콘을 치운다(WebSocket beacon_remove).
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot } from "./helpers/screen.ts";
import { type DevTheme, expect, test } from "./helpers/test.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

/** 지도 반폭(칸) — apps/game/src/editor/territory/TerritoryMap.tsx MAP_RADIUS와 같다 */
const MAP_RADIUS = 14;
const PLANET = "s2_test_planet";

/** 화면 안에서 tRPC 조회(같은 출처, 화면과 같은 쿠키) */
async function query(
  page: Page,
  procedure: string,
  input: unknown,
): Promise<{ status: number; data: unknown }> {
  return page.evaluate(
    async ({ procedure: name, input: body }) => {
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
      const get = (value: unknown, key: string): unknown =>
        typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
      const response = await fetch(`/api/trpc/${name}?input=${encodeURIComponent(JSON.stringify(body))}`);
      const json: unknown = await response.json();
      return { status: response.status, data: get(get(json, "result"), "data") };
    },
    { procedure, input },
  );
}

/** 모든 비콘을 치운다(WebSocket beacon_remove, 개발 권한). 속도 제한 등으로 남으면 잠시 뒤 한 번 더 */
async function clearBeacons(page: Page, attempt = 1): Promise<void> {
  const view = await query(page, "territory.planet", { planetId: PLANET });
  const ids = list(field(view.data, "beacons")).map((beacon) => field(beacon, "id"));
  if (ids.length === 0) return;
  const failed = await page.evaluate(async (beaconIds) => {
    const socket = new WebSocket(`${location.origin.replace(/^http/, "ws")}/ws`);
    const replies = new Map<number, unknown>();
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
    let welcomed: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      welcomed = resolve;
    });
    socket.addEventListener("message", (event) => {
      const data: unknown = JSON.parse(String(event.data));
      if (typeof data !== "object" || data === null) return;
      const t: unknown = Reflect.get(data, "t");
      if (t === "welcome") welcomed();
      if (t === "beacon_result") replies.set(Number(Reflect.get(data, "id")), Reflect.get(data, "ok"));
    });
    await new Promise((resolve) => socket.addEventListener("open", resolve));
    socket.send(JSON.stringify({ t: "hello", protocolVersion: 8, clientBuild: "e2e-territory" }));
    await ready;
    // 요청 번호는 부를 때마다 새로(서버는 같은 사용자·같은 번호면 10분 동안 처음 결과를 다시 준다)
    const base = Math.floor(Math.random() * 1_000_000_000);
    beaconIds.forEach((beaconId, index) =>
      socket.send(JSON.stringify({ t: "beacon_remove", id: base + index, beaconId })),
    );
    for (let wait = 0; wait < 100 && replies.size < beaconIds.length; wait++)
      await new Promise((resolve) => setTimeout(resolve, 100));
    socket.close();
    return [...replies.values()].filter((ok) => ok !== true).length;
  }, ids);
  if (failed === 0) return;
  expect(attempt).toBeLessThan(3);
  await page.waitForTimeout(1500);
  await clearBeacons(page, attempt + 1);
}

const screen = (page: Page) => page.locator(".tl-screen");
const canvas = (page: Page) => page.locator(".tl-canvas");

async function openScreen(page: Page): Promise<void> {
  await page.goto("/dev/territory");
  await expect(screen(page)).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
}

/** 세력 코드 → 세력 ID(territory.planet) */
async function factionIds(page: Page): Promise<Map<string, number>> {
  const view = await query(page, "territory.planet", { planetId: PLANET });
  return new Map(
    list(field(view.data, "factions")).map((faction) => [
      String(field(faction, "code")),
      Number(field(faction, "id")),
    ]),
  );
}

/** 지도 가운데 칸(시험 2차맵)에서 (di, dj) 칸을 누른다(i → 오른쪽, j → 위) */
async function clickCell(page: Page, di: number, dj: number): Promise<void> {
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error("no canvas");
  const cellPx = box.width / (2 * MAP_RADIUS + 1);
  await canvas(page).click({ position: { x: box.width / 2 + di * cellPx, y: box.height / 2 - dj * cellPx } });
}

/** 칸을 골라 그 세력의 비콘을 놓는다. 성공하면 비콘 수가 하나 는다 */
async function place(page: Page, factionId: number, di: number, dj: number, language: "ko" | "en" = "ko") {
  const before = Number((await screen(page).getAttribute("data-beacons")) ?? "0");
  await clickCell(page, di, dj);
  await page.locator(".tl-field select").selectOption(String(factionId));
  await page.getByRole("button", { name: message(language, "dev_territory_place"), exact: true }).click();
  await expect(screen(page)).toHaveAttribute("data-beacons", String(before + 1));
}

/** 시험 NPC 세력(가운데 도시)·두 번째 세력(같은 2차맵 왼쪽 아래 도시)의 비콘 셋씩. 껍질 둘이 겹친다 */
async function placeTwoFactions(page: Page, language: "ko" | "en" = "ko"): Promise<void> {
  const ids = await factionIds(page);
  const first = ids.get("s3_test_npc");
  const second = [...ids.entries()].find(([code]) => code !== "s3_test_npc")?.[1];
  if (first === undefined || second === undefined) throw new Error(`factions: ${[...ids.keys()].join(",")}`);
  for (const [di, dj] of [
    [5, 0],
    [0, 5],
    [5, 5],
  ] as const)
    await place(page, first, di, dj, language);
  for (const [di, dj] of [
    [4, -3],
    [-3, 4],
    [6, 6],
  ] as const)
    await place(page, second, di, dj, language);
  await expect(canvas(page)).toHaveAttribute("data-hulls", "2");
}

test.describe("관리자", () => {
  test.use({ account: "admin", ...VIEWPORTS.desktop });

  test("비콘 셋이면 껍질·칸 표, 넷째는 개수 상한, 두 세력이 겹치면 껍질 둘, 치우면 사라진다", async ({
    page,
    deviceErrors,
  }) => {
    await openScreen(page);
    await clearBeacons(page);
    await page.reload();
    await expect(screen(page)).toHaveAttribute("data-status", "ready");
    await expect(canvas(page)).toHaveAttribute("data-hulls", "0");
    const ids = await factionIds(page);
    const first = ids.get("s3_test_npc");
    if (first === undefined) throw new Error("no test faction");

    // 도시 + 비콘 하나 = 꼭짓점 둘 → 껍질 없음, 비콘 둘이면 꼭짓점 셋 → 껍질(D-485 "3~5개는 있어야 도형")
    await place(page, first, 5, 0);
    await expect(page.locator(".tl-panel")).toContainText(message("ko", "dev_territory_placed", { id: 1 }));
    await expect(canvas(page)).toHaveAttribute("data-hulls", "0");
    await place(page, first, 0, 5);
    await expect(canvas(page)).toHaveAttribute("data-hulls", "1");
    await place(page, first, 5, 5);
    await expect(canvas(page)).toHaveAttribute("data-hulls", "1");
    const cells = Number((await canvas(page).getAttribute("data-cells")) ?? "0");
    expect(cells).toBeGreaterThan(20);
    // 서버 칸 표: 껍질 안쪽 칸(가운데에서 (2, 2))은 시험 NPC 세력
    const view = await query(page, "territory.planet", { planetId: PLANET });
    expect(list(field(view.data, "cells")).every((row) => list(row)[1] !== undefined)).toBe(true);
    await expect(page.locator(`.tl-table tr[data-faction="${first}"] td`).nth(1)).toHaveText("3");

    // 넷째: 마을(등급 1) 비콘 수 3
    await clickCell(page, -5, 0);
    await page.locator(".tl-field select").selectOption(String(first));
    await page.getByRole("button", { name: message("ko", "dev_territory_place"), exact: true }).click();
    await expect(page.locator(".tl-panel")).toContainText(message("ko", "dev_territory_code_beacon_limit"));

    // 두 번째 세력의 비콘 셋 → 껍질 둘
    await clearBeacons(page);
    await page.reload();
    await expect(screen(page)).toHaveAttribute("data-status", "ready");
    await placeTwoFactions(page);
    await shot(page, "territory-two-factions-neon-ko-1440");

    // 시험 NPC 세력 비콘 둘을 치우면(도시 + 비콘 하나 = 꼭짓점 둘) 그 세력 껍질이 사라진다
    for (const [di, dj, left] of [
      [5, 5, "5"],
      [0, 5, "4"],
    ] as const) {
      await clickCell(page, di, dj);
      await page.getByRole("button", { name: message("ko", "dev_territory_remove"), exact: true }).click();
      await expect(screen(page)).toHaveAttribute("data-beacons", left);
    }
    await expect(canvas(page)).toHaveAttribute("data-hulls", "1");
    await clearBeacons(page);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("플레이어", () => {
  test.use({ account: "player" });

  test("권한 없음 화면, territory.planet 403, territory.mine 200", async ({ page }) => {
    await page.goto("/dev/territory");
    await expect(page.locator(".tl-screen")).toHaveCount(0);
    const planet = await query(page, "territory.planet", { planetId: PLANET });
    expect(planet.status).toBe(403);
    const mine = await query(page, "territory.mine", { planetId: PLANET });
    expect(mine.status).toBe(200);
  });
});

const LAYOUTS = (["neon", "light"] as const satisfies readonly DevTheme[]).flatMap((theme) => [
  { theme, width: 390, height: 844 },
  { theme, width: 1440, height: 900 },
]);

test.describe("배치·사진", () => {
  test.use({ account: "admin" });

  for (const { theme, width, height } of LAYOUTS) {
    test.describe(`${theme}·${width}px`, () => {
      test.use({ devTheme: theme, ...(width >= 1000 ? VIEWPORTS.desktop : { viewport: { width, height } }) });

      test("지도·판·표: 가로 넘침 없음, 사진", async ({ page, deviceErrors }) => {
        await openScreen(page);
        await clearBeacons(page);
        await page.reload();
        await expect(screen(page)).toHaveAttribute("data-status", "ready");
        await placeTwoFactions(page);
        await clickCell(page, 2, 2);
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await horizontalOverflow(page)).toEqual([]);
        await shot(page, `territory-${theme}-ko-${width}`);
        await page
          .locator(".tl-table")
          .last()
          .evaluate((table) => table.scrollIntoView({ block: "center" }));
        await shot(page, `territory-tables-${theme}-ko-${width}`);
        await clearBeacons(page);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
