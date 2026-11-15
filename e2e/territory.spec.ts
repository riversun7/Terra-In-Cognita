// 영토 층 화면 시험 — /dev/territory (docs/adr/2026-11-03-territory-layer.md, 기획 D-568·D-546·49 N42·N51).
// - admin: 지도에서 칸을 눌러 시험 NPC 세력의 비콘 셋을 놓으면 셋 모두 그 세력 외곽선을 넓히고(지도 data-extended — 서버 덩이에 든 비콘 수,
//   1차맵 지도 판정 D-568) 칸 표가 늘고, 도시 둘(시작 도시 2곳)의 비콘 칸이 모두 차면 개수 상한(N42 마을 3 × 2). 두 번째 세력도 비콘 셋이면
//   두 세력 모두 외곽선을 넓힌다. 비콘을 치우면 넓힌 몫이 빠진다.
// - 세계 배치(docs/adr/2026-11-07-world-layout.md): 국가마다 행성 위 자리가 달라, 지도 가운데 = 고른 세력의 첫 도시(그 세력을 먼저 고르고
//   칸을 누른다).
// - player: 권한 없음 화면, tRPC territory.planet은 403, territory.mine은 200.
// - 사진: 1440(VIEWPORTS.desktop)·390 × 개발 화면 테마 네온·라이트(E2E_SHOTS_DIR, ADR 2026-11-02-dev-ui).
// 시험끼리 서버·DB를 같이 쓴다: 비콘을 놓는 시험은 처음과 끝에 모든 비콘을 치운다(WebSocket beacon_remove).
import type { Page } from "@playwright/test";
import { PROTOCOL_VERSION } from "../packages/protocol/src/version.ts";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot } from "./helpers/screen.ts";
import { type DevTheme, expect, test } from "./helpers/test.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);
const escapeRegex = (text: string): string => text.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
  const failed = await page.evaluate(
    async ({ beaconIds, protocolVersion }) => {
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
      socket.send(JSON.stringify({ t: "hello", protocolVersion, clientBuild: "e2e-territory" }));
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
    },
    { beaconIds: ids, protocolVersion: PROTOCOL_VERSION },
  );
  if (failed === 0) return;
  expect(attempt).toBeLessThan(3);
  await page.waitForTimeout(1500);
  await clearBeacons(page, attempt + 1);
}

const screen = (page: Page) => page.locator(".tl-screen");
const canvas = (page: Page) => page.locator(".tl-canvas");

async function openScreen(page: Page): Promise<void> {
  // 앞 시험(거래·생산·채집 등)이 남긴 일이 있으면 복귀 요약이 떠서 지도를 가린다 — 뜨면 Esc로 닫는다(recruit.spec.ts와 같다)
  await page.addLocatorHandler(page.locator("dialog.summary-dialog[open]"), async () => {
    await page.keyboard.press("Escape");
  });
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

/** 세력을 고른다(지도 가운데가 그 세력 첫 도시로 옮겨 간다) */
async function chooseFaction(page: Page, factionId: number): Promise<void> {
  await page.locator(".tl-field select").selectOption(String(factionId));
}

/** 외곽선을 넓힌 비콘 수(모든 세력 — 서버 덩이에 든 비콘) */
async function extendedCount(page: Page): Promise<number> {
  return Number((await canvas(page).getAttribute("data-extended")) ?? "0");
}

/** 세력을 고르고 그 첫 도시 둘레 칸을 눌러 그 세력의 비콘을 놓는다. 성공하면 비콘 수가 하나 는다 */
async function place(page: Page, factionId: number, di: number, dj: number, language: "ko" | "en" = "ko") {
  const before = Number((await screen(page).getAttribute("data-beacons")) ?? "0");
  await chooseFaction(page, factionId);
  await clickCell(page, di, dj);
  await page.getByRole("button", { name: message(language, "dev_territory_place"), exact: true }).click();
  await expect(screen(page)).toHaveAttribute("data-beacons", String(before + 1));
}

/** 시험 NPC 세력·두 번째 세력의 비콘 셋씩(각자 첫 도시 둘레). 두 세력 모두 외곽선을 넓힌다(국가마다 자리가 달라 겹치지 않는다) */
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
  const view = await query(page, "territory.planet", { planetId: PLANET });
  const extended = new Set(
    list(field(view.data, "groups"))
      .filter((group) => list(field(group, "members")).some((member) => field(member, "kind") === "beacon"))
      .map((group) => Number(field(group, "factionId"))),
  );
  expect([extended.has(first), extended.has(second)]).toEqual([true, true]);
}

test.describe("관리자", () => {
  test.use({ account: "admin", ...VIEWPORTS.desktop });

  test("비콘을 놓으면 외곽선·칸 표가 넓어지고, 도시마다 셋이 차면 개수 상한, 두 세력 모두 넓히고, 치우면 줄어든다", async ({
    page,
    deviceErrors,
  }) => {
    await openScreen(page);
    await clearBeacons(page);
    await page.reload();
    await expect(screen(page)).toHaveAttribute("data-status", "ready");
    const ids = await factionIds(page);
    const first = ids.get("s3_test_npc");
    if (first === undefined) throw new Error("no test faction");
    // 비콘이 없으면 넓힌 비콘도 없다. 다 지은 비콘은 하나씩 그 세력 외곽선을 넓힌다(D-546 1434, 판정도 같다 D-568)
    expect(await extendedCount(page)).toBe(0);
    const cellsBefore = Number((await canvas(page).getAttribute("data-cells")) ?? "0");
    await place(page, first, 5, 0);
    // 비콘 ID는 같은 서버를 쓰는 다른 시험(1차맵 비콘)이 먼저 놓았으면 1이 아니다
    const [placedHead = "", placedTail = ""] = message("ko", "dev_territory_placed", { id: 987_654 }).split(
      "987654",
    );
    await expect(page.locator(".tl-panel")).toContainText(
      new RegExp(`${escapeRegex(placedHead)}\\d+${escapeRegex(placedTail)}`),
    );
    await expect(canvas(page)).toHaveAttribute("data-extended", "1");
    await place(page, first, 0, 5);
    await place(page, first, 5, 5);
    await expect(canvas(page)).toHaveAttribute("data-extended", "3");
    const cells = Number((await canvas(page).getAttribute("data-cells")) ?? "0");
    expect(cells).toBeGreaterThan(cellsBefore);
    // 서버 칸 표: 모든 줄에 세력이 있다
    const view = await query(page, "territory.planet", { planetId: PLANET });
    expect(list(field(view.data, "cells")).every((row) => list(row)[1] !== undefined)).toBe(true);
    await expect(page.locator(`.tl-table tr[data-faction="${first}"] td`).nth(1)).toHaveText("3");

    // 마을(등급 1) 비콘 수 3 × 시작 도시 2곳: 여섯이 차면 일곱째는 개수 상한
    for (const [di, dj] of [
      [-5, 0],
      [-5, -5],
      [3, -4],
    ] as const)
      await place(page, first, di, dj);
    await chooseFaction(page, first);
    await clickCell(page, -4, 3);
    await page.getByRole("button", { name: message("ko", "dev_territory_place"), exact: true }).click();
    await expect(page.locator(".tl-panel")).toContainText(message("ko", "dev_territory_code_beacon_limit"));

    // 두 번째 세력의 비콘 셋 → 두 세력 모두 외곽선을 넓힌다
    await clearBeacons(page);
    await page.reload();
    await expect(screen(page)).toHaveAttribute("data-status", "ready");
    await placeTwoFactions(page);
    await shot(page, "territory-two-factions-neon-ko-1440");

    // 시험 NPC 세력 비콘 셋을 치우면 그 셋이 넓힌 몫이 빠진다
    const before = await extendedCount(page);
    await chooseFaction(page, first);
    for (const [di, dj, left] of [
      [5, 5, "5"],
      [0, 5, "4"],
      [5, 0, "3"],
    ] as const) {
      await clickCell(page, di, dj);
      await page.getByRole("button", { name: message("ko", "dev_territory_remove"), exact: true }).click();
      await expect(screen(page)).toHaveAttribute("data-beacons", left);
    }
    await expect(canvas(page)).toHaveAttribute("data-extended", String(before - 3));
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
