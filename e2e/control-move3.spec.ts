// 유닛 조종·이동 후속 화면 시험(기획 답 630~637·610~612, docs/adr/2026-11-07-unit-control.md "바뀜 (기획 답 630~637)",
// docs/adr/2026-11-07-play-flow.md "WP13 이동 3").
// - 630: 플레이어 카메라는 내 유닛 둘레로 묶인다 — 같은 쪽으로 여러 번 끌어도 카메라 목표가 내 사이보그에서 일정 거리 밖으로 가지 않는다.
// - 631 다: 운영자 모드는 이 기기에서 기억한다(다시 열어도 켜진 채).
// - 632 다: 목록 끝 "다른 곳에 내 유닛 N" — 누르면 유닛 화면.
// - 636 나: 남의 유닛(시야 안)은 세력·종류까지 보인다(2026-11-09부터 누르면 뜨는 정보 판에).
// - 612 나: 정찰이 돌아서면 화면 알림 [들어가기] → 본 2차맵 지도.
// - 사진: 목록(다른 곳 줄)·정찰 알림 390 × 파스텔·다크.
// 바뀜(docs/adr/2026-11-08-seamless-second-map.md WP-1·2): 카메라는 늘 기준 유닛(내 사이보그)을 따라가고 끌기는 돌리기다 — 630은 "끌어도 목표점이
// 내 사이보그에 머문다"로 본다. 목록은 근처 판 유닛 탭. 내 유닛이 없는 2차맵은 들어갈 수 없어 남의 유닛 시험은 이 맵에 없는 가짜 내 유닛을 둔다.
import { operatorToggle } from "./helpers/mapHud.ts";
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { openNearby } from "./helpers/nearby.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";

/** 2차맵을 열고 자료·지형이 서기를 기다린다 */
async function openMap(page: Page, search = ""): Promise<void> {
  await page.goto(`/map${search}`);
  const screen = page.locator(".map-screen[data-map-key]");
  await expect(screen).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
  await expect(screen).toHaveAttribute("data-feed", "live", { timeout: 20_000 });
}

/** 카메라 목표(m) */
async function cameraTarget(page: Page): Promise<{ x: number; z: number }> {
  const [x = 0, z = 0] = ((await page.locator(".map-screen").getAttribute("data-camera")) ?? "")
    .split(",")
    .map(Number);
  return { x, z };
}

/** 지도 오른쪽에서 왼쪽으로 한 번 끈다(화면이 동쪽으로 간다) */
async function dragWest(page: Page): Promise<void> {
  const box = await page.locator(".map-view canvas").boundingBox();
  if (!box) throw new Error("no canvas");
  const y = box.y + box.height * 0.45;
  await page.mouse.move(box.x + box.width * 0.9, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.1, y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

/** 목록 응답에 다른 곳 내 유닛 수를 넣는다(시험 세계는 2차맵 하나에만 유닛이 있다) */
function withElsewhere(count: number) {
  return (data: unknown): void => {
    if (typeof data === "object" && data !== null) Reflect.set(data, "elsewhere", count);
  };
}

/** 지도를 멀리 본다(바퀴, 가운데를 붙잡고 — 카메라 목표는 그대로) */
async function zoomOut(page: Page): Promise<void> {
  const box = await page.locator(".map-view canvas").boundingBox();
  if (!box) throw new Error("no canvas");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let k = 0; k < 6; k++) {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(150);
  }
}

/** 돌아오는 정찰 하나를 길 목록에 넣는다(본 2차맵 = 지금 2차맵 키) */
function withReturningScout(mapKey: number) {
  return (data: unknown): void => {
    if (typeof data !== "object" || data === null) return;
    Reflect.set(data, "travels", [
      {
        unitId: 424_242,
        kind: "scout",
        route: [mapKey],
        leg: 0,
        mapKey,
        cellX: 10,
        cellY: 10,
        latDeg: 0,
        lonDeg: 0,
        targetX: 10,
        targetY: 10,
        startedAt: 1_000,
        arriveAt: Date.now() + 60_000,
        state: "going",
        stop: null,
        returning: true,
        scoutedMapKey: mapKey,
        hidden: false,
      },
    ]);
  };
}

test.describe("기획 답 630~637: 플레이어", () => {
  test.use({ account: "player" });

  test("630·WP-1: 같은 쪽으로 여러 번 끌어도 카메라 목표는 내 사이보그에 머문다(끌기 = 돌리기)", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(90_000);
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await openMap(page);
    // 기준 유닛(내 사이보그)을 따라간다
    await expect(page.locator(".map-screen")).toHaveAttribute("data-follow", "on", { timeout: 15_000 });
    await page.waitForTimeout(1_500);
    const start = await cameraTarget(page);
    // 멀리 본 뒤(한 번 끌 때 수백 m) 같은 쪽으로 세 번 끈다. 범위(시야 24칸 + 여유 16칸 ≈ 40칸 × 칸 약 5.9m ≈ 234m) 안에 멈춘다
    await zoomOut(page);
    for (let k = 0; k < 3; k++) await dragWest(page);
    const after = await cameraTarget(page);
    const moved = Math.hypot(after.x - start.x, after.z - start.z);
    expect(moved).toBeLessThan(260);
    // 더 끌어도 그대로(가장자리에 묶였다)
    await dragWest(page);
    const again = await cameraTarget(page);
    expect(Math.hypot(again.x - after.x, again.z - after.z)).toBeLessThan(2);
    expect(deviceErrors).toEqual([]);
  });

  test("632 다·636 나: 다른 곳 내 유닛 줄(누르면 유닛 화면), 남의 유닛은 세력·종류", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(90_000);
    // 내 사이보그를 남의 유닛처럼(시야 전송 own 표시·목록을 지운다) 보이게 하고, 한눈 정보에 세력 이름을 넣는다
    await page.routeWebSocket(/\/ws$/, (socket) => {
      const server = socket.connectToServer();
      socket.onMessage((data) => server.send(data));
      server.onMessage((data) =>
        socket.send(typeof data === "string" ? data.replaceAll(',"own":true', "") : data),
      );
    });
    await rewriteTrpc(page, {
      "summary.get": hideSummary,
      "world.mapUnits": (data) => {
        withElsewhere(3)(data);
        if (typeof data !== "object" || data === null) return;
        // 목록이 비면 들어갈 수 없다(WP-1): 이 맵에 없는 가짜 내 유닛 하나로 바꾼다
        const units: unknown = Reflect.get(data, "units");
        const first: unknown = Array.isArray(units) ? units[0] : undefined;
        Reflect.set(
          data,
          "units",
          typeof first === "object" && first !== null ? [{ ...first, unitId: 999_999 }] : [],
        );
        // 카메라 범위가 내 건물 둘레로 가지 않게(유닛이 없으면 탐사 칸 둘레 — 내 사이보그 자리)
        const view: unknown = Reflect.get(data, "view");
        if (typeof view === "object" && view !== null) Reflect.set(view, "buildings", []);
      },
      "world.unitGlance": (data) => {
        if (typeof data !== "object" || data === null) return;
        Reflect.set(data, "glance", {
          unitId: 1,
          kind: "human",
          faction: {
            id: 4,
            code: "npc_nation_01",
            kind: "npc",
            name: { ko: "시험 나라", en: "Test Nation" },
          },
        });
      },
    });
    await openMap(page);
    const screen = page.locator(".map-screen");
    await expect(screen).toHaveAttribute("data-focus", /\d+/);
    await page.waitForTimeout(1_200);
    // 2차맵은 최대 확대(6/6)로 열려 카메라 목표와 유닛 사이가 화면에서 멀다: 두 단계 줄여 옛 처음 거리쯤(4단계)에서 가운데를 누른다(unit-control 시험과 같다)
    await page.locator(".zoom-ladder-out").click();
    await expect(page.locator(".zoom-ladder")).toHaveAttribute("data-stage", "5");
    await page.locator(".zoom-ladder-out").click();
    await expect(page.locator(".zoom-ladder")).toHaveAttribute("data-stage", "4");
    await page.waitForTimeout(800);
    const box = await page.locator(".map-view canvas").boundingBox();
    if (!box) throw new Error("no canvas");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 6);
    // 남의 유닛을 누르면 정보 판(고르지 않는다 — docs/adr/2026-11-07-unit-control.md "바뀜 (2026-11-09)")
    const peek = page.locator(".map-peek");
    try {
      await expect(peek).toBeVisible({ timeout: 5_000 });
    } catch {
      // 가운데에 유닛이 없으면 근처 판 유닛 탭의 남의 유닛 줄(내 사이보그도 여기서는 남의 유닛)로 연다
      await openNearby(page, "units");
      await page.locator('.map-nearby-row[data-kind="unit"][data-mine="false"]').first().click();
      await expect(peek).toBeVisible({ timeout: 5_000 });
    }
    await expect(peek.locator(".map-peek-line:not(.map-peek-owner)")).toContainText("시험 나라", {
      timeout: 10_000,
    });
    await expect(peek.locator(".map-peek-title")).toContainText(message("ko", "roster_type_human"));

    await openNearby(page, "units");
    const line = page.locator(".map-units-elsewhere-open");
    await expect(line).toHaveText(message("ko", "map_units_elsewhere", { count: "3" }));
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);
    await line.click();
    await expect(page).toHaveURL(/\/units$/);
    expect(deviceErrors).toEqual([]);
  });

  test("612 나: 정찰이 돌아서면 화면 알림 → [들어가기]는 본 2차맵 지도", async ({ page, deviceErrors }) => {
    test.setTimeout(90_000);
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await openMap(page);
    const mapKey = Number(await page.locator(".map-screen").getAttribute("data-map-key"));
    await rewriteTrpc(page, { "summary.get": hideSummary, "world.travels": withReturningScout(mapKey) });
    await page.goto("/units");
    const notice = page.locator(".scout-notice");
    await expect(notice).toBeVisible({ timeout: 15_000 });
    await expect(notice).toContainText(message("ko", "scout_notice_title"));
    expect(await horizontalOverflow(page)).toEqual([]);
    await notice.locator(".scout-notice-enter").click();
    await expect(page).toHaveURL(new RegExp(`/map\\?key=${String(mapKey)}$`));
    await expect(notice).toHaveCount(0);
    // 같은 길은 다시 알리지 않는다(기기에 기억)
    await page.goto("/units");
    await page.waitForTimeout(2_000);
    await expect(notice).toHaveCount(0);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("기획 답 631: 운영자 모드 기억", () => {
  test.use({ account: "dev" });

  test("켠 채로 다시 열면 켜진 채(전체 보기), 끄면 다음에 꺼진 채", async ({ page, deviceErrors }) => {
    test.setTimeout(90_000);
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await openMap(page);
    const screen = page.locator(".map-screen");
    await expect(screen).toHaveAttribute("data-operator", "off");
    await (await operatorToggle(page)).click();
    await expect(screen).toHaveAttribute("data-operator", "on");
    await page.reload();
    await expect(screen).toHaveAttribute("data-feed", "live", { timeout: 20_000 });
    await expect(screen).toHaveAttribute("data-operator", "on");
    await expect(page.locator(".map-operator-badge")).toBeVisible();
    await expect(screen).not.toHaveAttribute("data-explored", /./, { timeout: 15_000 });
    await (await operatorToggle(page)).click();
    await expect(screen).toHaveAttribute("data-operator", "off");
    await page.reload();
    await expect(screen).toHaveAttribute("data-feed", "live", { timeout: 20_000 });
    await expect(screen).toHaveAttribute("data-operator", "off");
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("유닛 조종·이동 후속 사진", () => {
  for (const theme of ["pastel", "dark"] as const) {
    test.describe(`플레이어 390 ${theme}`, () => {
      test.use({ account: "player", theme });
      test(`목록·다른 곳 줄·정찰 알림 (390·${theme})`, async ({ page, deviceErrors }) => {
        await rewriteTrpc(page, { "summary.get": hideSummary, "world.mapUnits": withElsewhere(2) });
        await openMap(page);
        const mapKey = Number(await page.locator(".map-screen").getAttribute("data-map-key"));
        await openNearby(page, "units");
        await expect(page.locator(".map-units-elsewhere-open")).toBeVisible({ timeout: 15_000 });
        await page.waitForTimeout(1_200);
        expect(await horizontalOverflow(page)).toEqual([]);
        await shot(page, `control-move3-list-390-${theme}`);
        await rewriteTrpc(page, { "summary.get": hideSummary, "world.travels": withReturningScout(mapKey) });
        await page.goto("/units");
        await expect(page.locator(".scout-notice")).toBeVisible({ timeout: 15_000 });
        expect(await horizontalOverflow(page)).toEqual([]);
        await shot(page, `control-move3-scout-notice-390-${theme}`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
