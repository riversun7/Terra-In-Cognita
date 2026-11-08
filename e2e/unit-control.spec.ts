// 2차맵 유닛 조종 화면 시험(docs/adr/2026-11-07-unit-control.md, 사용자 지적 2026-11-07 "유저는 맵 진입시 본인의 유닛만 움직일 수 있어야함. 사이보그
// 포함 유닛 목록을 통해 선택하여 명령. 운영자는 다른 유닛 조종이나 시야 자유이동이 가능").
// - player: [내 유닛 N] → 목록(사이보그 본체가 첫 줄) → 줄을 누르면 고르고 카메라가 그 자리로, 좁은 화면이면 목록을 접는다 → 땅을 누르면 이동(move_unit
//   결과 ok) → 가는 동안 [멈추기](stop_unit 결과 ok). 시험이 끝나면 내 사이보그는 그 2차맵에 서 있다.
// - player: 남의 유닛(시야 전송의 내 유닛 표시를 지우고 목록을 비운 화면 — 내 사이보그가 남의 유닛처럼 보인다)은 눌러도 정보만, 땅을 누르면
//   보내지 않는다(view_only, move_unit 0개).
// - dev: [운영자 모드] → 위 판 "운영자", 안개 없는 전체 보기로 다시 구독, 고른 유닛 다룸 = 운영자.
// - 사진: 목록·운영자 390 × 파스텔·다크. 넘침·작은 누르는 곳 없음.
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";

/** 2차맵을 열고 자료·지형이 서기를 기다린다 */
async function openMap(page: Page): Promise<void> {
  await page.goto("/map");
  const screen = page.locator(".map-screen[data-map-key]");
  await expect(screen).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
  await expect(screen).toHaveAttribute("data-feed", "live", { timeout: 20_000 });
}

/** 지도 캔버스 가운데(카메라 목표점)에서 (dx, dy) CSS px 떨어진 곳을 누른다 */
async function tapMap(page: Page, dx: number, dy: number): Promise<void> {
  const box = await page.locator(".map-view canvas").boundingBox();
  if (!box) throw new Error("no canvas");
  await page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
}

/**
 * 땅을 누를 자리(화면 가운데에서 떨어진 거리 px): 가운데 둘레 고리(먼 것 먼저) 가운데 지도 캔버스 위이고 채집 표시·건물 표시에서 떨어진 곳.
 * 표시는 누르기를 지나보내고 엔진이 화면 거리 22px로 고르며(docs/adr/2026-11-08-map-input.md), 건물 모델을 누르면 건물 판이 열린다 —
 * 그 자리를 누르면 땅 누르기(이동)가 아니다
 */
async function groundOffsets(page: Page): Promise<{ dx: number; dy: number }[]> {
  return page.evaluate(() => {
    const canvas = document.querySelector(".map-view canvas");
    if (!canvas) return [];
    const box = canvas.getBoundingClientRect();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
    const centres = (selector: string): { x: number; y: number }[] =>
      [...document.querySelectorAll(selector)].flatMap((element) => {
        if (element instanceof HTMLElement && element.hidden) return [];
        const rect = element.getBoundingClientRect();
        return [{ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }];
      });
    const objects = centres(".gather-marker");
    const buildings = centres(".gather-building-marker");
    const out: { dx: number; dy: number }[] = [];
    for (const radius of [150, 110]) {
      for (let step = 0; step < 12; step++) {
        const angle = (step * Math.PI) / 6 - Math.PI / 2;
        const dx = Math.round(Math.cos(angle) * radius);
        const dy = Math.round(Math.sin(angle) * radius);
        const x = cx + dx;
        const y = cy + dy;
        const hit = document.elementFromPoint(x, y);
        if (!(hit instanceof HTMLCanvasElement) || !hit.closest(".map-view")) continue;
        if (objects.some((point) => Math.hypot(point.x - x, point.y - y) < 34)) continue;
        if (buildings.some((point) => Math.hypot(point.x - x, point.y - y) < 80)) continue;
        out.push({ dx, dy });
      }
    }
    return out;
  });
}

test.describe("유닛 조종: 플레이어", () => {
  test.use({ account: "player" });

  test("내 유닛 목록에서 사이보그를 고르고 땅을 눌러 보내고 [멈추기]로 세운다", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(120_000);
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await openMap(page);
    const screen = page.locator(".map-screen");
    const cyborg = await screen.getAttribute("data-cyborg");
    expect(cyborg).toMatch(/^\d+$/);
    // 접힌 목록 단추에 수가 붙는다(목록을 받은 뒤)
    const toggle = page.locator(".map-units-toggle");
    await expect(toggle).toHaveText(/\d/, { timeout: 15_000 });
    await toggle.click();
    const panel = page.locator(".map-units");
    await expect(panel).toBeVisible();
    const first = panel.locator(".map-unit-row").first();
    await expect(first).toHaveAttribute("data-kind", "cyborg_body");
    await expect(first).toHaveAttribute("data-unit-id", cyborg ?? "");
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);

    // 줄을 누르면 고르고(내 유닛), 좁은 화면이라 목록을 접는다
    await first.click();
    await expect(screen).toHaveAttribute("data-selected", cyborg ?? "");
    await expect(screen).toHaveAttribute("data-control", "own");
    await expect(panel).toHaveCount(0);
    await expect(toggle).toBeVisible();

    // 땅을 누르면 보낸다: 갈 수 있는 곳이 나올 때까지 카메라 목표점(따라가는 내 사이보그) 둘레의 빈 땅을 눌러 본다
    const send = async (): Promise<boolean> => {
      for (const { dx, dy } of (await groundOffsets(page)).slice(0, 8)) {
        await tapMap(page, dx, dy);
        await page.waitForTimeout(300);
        await expect(screen).not.toHaveAttribute("data-command", "sent", { timeout: 20_000 });
        if ((await screen.getAttribute("data-command")) === "ok") return true;
        // 땅을 누르지 못하고 다른 유닛을 골랐으면 다시 내 사이보그를 고른다
        if ((await screen.getAttribute("data-selected")) !== cyborg) {
          await toggle.click();
          await page.locator(`.map-unit-row[data-unit-id="${cyborg}"]`).click();
        }
      }
      return false;
    };
    expect(await send()).toBe(true);
    await expect(page.locator(".map-hint .map-command").first()).toHaveText(
      message("ko", "map_command_ok", { id: cyborg ?? "" }),
    );
    // 가는 동안 [멈추기] → 그 자리에 선다
    const stop = page.locator(".map-unit-stop");
    await expect(stop).toBeVisible({ timeout: 5_000 });
    await shot(page, "unit-control-moving-390");
    // 헤드리스 소프트웨어 WebGL은 느려(프레임 몇 장/초) 사진을 찍는 사이 닿을 수 있다: 닿았으면 다시 보내고 바로 멈춘다
    if ((await stop.count()) === 0) {
      expect(await send()).toBe(true);
      await expect(stop).toBeVisible({ timeout: 5_000 });
    }
    await stop.click();
    await expect(page.locator(".map-hint .map-command").first()).toHaveText(
      message("ko", "map_command_stopped", { id: cyborg ?? "" }),
      { timeout: 20_000 },
    );
    await expect(screen).toHaveAttribute("data-command", "ok");
    await expect(stop).toHaveCount(0, { timeout: 5_000 });
    expect(deviceErrors).toEqual([]);
  });

  test("남의 유닛은 눌러도 정보만, 땅을 눌러도 보내지 않는다", async ({ page, deviceErrors }) => {
    test.setTimeout(90_000);
    // 내 사이보그를 남의 유닛처럼: 시야 전송의 내 유닛 표시(own)를 지우고 내 유닛 목록을 비운다
    const sentMoves: string[] = [];
    await page.routeWebSocket(/\/ws$/, (socket) => {
      const server = socket.connectToServer();
      socket.onMessage((data) => {
        if (typeof data === "string" && data.includes('"t":"move_unit"')) sentMoves.push(data);
        server.send(data);
      });
      server.onMessage((data) => {
        socket.send(typeof data === "string" ? data.replaceAll(',"own":true', "") : data);
      });
    });
    await rewriteTrpc(page, {
      "summary.get": hideSummary,
      "world.mapUnits": (data) => {
        if (typeof data !== "object" || data === null) return;
        Reflect.set(data, "units", []);
        // 카메라 범위(기획 정리 630)가 내 건물 둘레로 가지 않게: 유닛이 없으면 탐사 칸 둘레(내 사이보그 자리)
        const view: unknown = Reflect.get(data, "view");
        if (typeof view === "object" && view !== null) Reflect.set(view, "buildings", []);
      },
    });
    await openMap(page);
    const screen = page.locator(".map-screen");
    // 카메라는 내 사이보그에 맞춰 열린다(D-6017) → 가운데를 누르면 그 유닛을 고른다
    await expect(screen).toHaveAttribute("data-focus", /\d+/);
    await page.waitForTimeout(1_200);
    await tapMap(page, 0, -6);
    await expect(screen).toHaveAttribute("data-selected", /\d+/, { timeout: 5_000 });
    await expect(screen).toHaveAttribute("data-control", "other");
    await expect(page.locator(".map-hint p").first()).toContainText("#");
    await expect(page.locator(".map-unit-stop")).toHaveCount(0);
    const [ground] = await groundOffsets(page);
    if (!ground) throw new Error("빈 땅이 없습니다");
    await tapMap(page, ground.dx, ground.dy);
    await expect(screen).toHaveAttribute("data-command", "view_only", { timeout: 5_000 });
    expect(sentMoves).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("유닛 조종: 운영자", () => {
  test.use({ account: "dev" });

  test("[운영자 모드]를 켜면 '운영자' 표시·안개 없는 전체 보기, 고른 유닛은 운영자 다룸", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(90_000);
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await openMap(page);
    const screen = page.locator(".map-screen");
    await expect(screen).toHaveAttribute("data-operator", "off");
    await expect(page.locator(".map-operator-badge")).toHaveCount(0);
    const toggle = page.locator(".map-operator-toggle");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(screen).toHaveAttribute("data-operator", "on");
    await expect(page.locator(".map-operator-badge")).toBeVisible();
    await expect(screen).toHaveAttribute("data-feed", "live", { timeout: 15_000 });
    // 전체 보기 구독은 탐사 칸을 보내지 않는다(안개 없음)
    await expect(screen).not.toHaveAttribute("data-explored", /./, { timeout: 15_000 });
    await page.locator(".map-units-toggle").click();
    const row = page.locator(".map-unit-row").first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.click();
    await expect(screen).toHaveAttribute("data-control", "operator");
    await expect(page.locator(".map-hint p").first()).toContainText(message("ko", "map_operator_badge"));
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("유닛 조종 사진", () => {
  for (const theme of ["pastel", "dark"] as const) {
    test.describe(`플레이어 390 ${theme}`, () => {
      test.use({ account: "player", theme });
      test(`내 유닛 목록 (390·${theme})`, async ({ page, deviceErrors }) => {
        await rewriteTrpc(page, { "summary.get": hideSummary });
        await openMap(page);
        await page.locator(".map-units-toggle").click();
        await expect(page.locator(".map-unit-row").first()).toBeVisible({ timeout: 15_000 });
        await page.waitForTimeout(1_200);
        expect(await horizontalOverflow(page)).toEqual([]);
        await shot(page, `unit-control-list-390-${theme}`);
        expect(deviceErrors).toEqual([]);
      });
    });
    test.describe(`운영자 390 ${theme}`, () => {
      test.use({ account: "dev", theme });
      test(`운영자 모드 (390·${theme})`, async ({ page, deviceErrors }) => {
        await rewriteTrpc(page, { "summary.get": hideSummary });
        await openMap(page);
        await page.locator(".map-operator-toggle").click();
        await expect(page.locator(".map-operator-badge")).toBeVisible();
        await expect(page.locator(".map-screen")).toHaveAttribute("data-feed", "live", { timeout: 15_000 });
        await page.locator(".map-units-toggle").click();
        await page.locator(".map-unit-row").first().click();
        await page.waitForTimeout(1_200);
        expect(await horizontalOverflow(page)).toEqual([]);
        await shot(page, `unit-control-operator-390-${theme}`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
