// 2차맵 유닛 조종 화면 시험(docs/adr/2026-11-07-unit-control.md, 사용자 지적 2026-11-07 "유저는 맵 진입시 본인의 유닛만 움직일 수 있어야함. 사이보그
// 포함 유닛 목록을 통해 선택하여 명령. 운영자는 다른 유닛 조종이나 시야 자유이동이 가능").
// - player: [내 유닛 N] → 목록(사이보그 본체가 첫 줄) → 줄을 누르면 고르고 카메라가 그 자리로, 좁은 화면이면 목록을 접는다 → 땅을 누르면 이동(move_unit
//   결과 ok) → 가는 동안 [멈추기](stop_unit 결과 ok). 시험이 끝나면 내 사이보그는 그 2차맵에 서 있다.
// - player: 남의 유닛(시야 전송의 내 유닛 표시를 지우고 목록을 비운 화면 — 내 사이보그가 남의 유닛처럼 보인다)은 눌러도 정보만, 땅을 누르면
//   보내지 않는다(view_only, move_unit 0개).
// - dev: [운영자 모드] → 위 판 "운영자", 안개 없는 전체 보기로 다시 구독, 고른 유닛 다룸 = 운영자.
// - 사진: 목록·운영자 390 × 파스텔·다크. 넘침·작은 누르는 곳 없음.
// 바뀜(docs/adr/2026-11-08-seamless-second-map.md WP-1·2): 내 유닛 목록은 근처 판 유닛 탭이고(가까운 차례 — 기준 유닛인 내 사이보그가 첫 줄),
// 늘 유닛 하나가 골라져 있다(들어오면 내 사이보그). 이 맵에 내 유닛이 없으면 들어갈 수 없다 — 남의 유닛 시험은 목록에 없는 가짜 내 유닛을 둔다.
// 바뀜(사용자 지적 2026-11-09, docs/adr/2026-11-08-seamless-second-map.md "바뀜 3"): [내 유닛 N] → 내 유닛 목록(사이보그 첫 줄)으로 고른다, 건물 판의
// "보낼 유닛"은 안내 줄과 같은 유닛·이름, 건물 하나를 누르면 판 하나(근처 판·정부 판이 따로 뜨지 않는다), 1·2차맵 전환 단추는 판과 겹치지 않는다
// (오른쪽 위 구석). 사진: 목록·건물 판 390 × 파스텔·다크 × 한국어·영어, 넓은 화면 한 장.
import type { Page } from "@playwright/test";
import { groundOffsets } from "./helpers/mapGround.ts";
import { message } from "./helpers/messages.ts";
import { nearbyBuildingIds, openBuildingFromList, openNearby, pickMyUnit } from "./helpers/nearby.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type Language, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

/** 2차맵을 열고 자료·지형이 서기를 기다린다 */
async function openMap(page: Page): Promise<void> {
  await page.goto("/map");
  const screen = page.locator(".map-screen[data-map-key]");
  await expect(screen).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
  await expect(screen).toHaveAttribute("data-feed", "live", { timeout: 20_000 });
}

/** 1·2차맵 전환 단추와 겹치는 지도 위·아래 판(또는 그 안 단추)의 class — 비어야 한다(사용자 지적 2026-11-09 문제1) */
async function switchOverlaps(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const button = document.querySelector(".map-switch-button");
    if (!button) return ["no map switch"];
    const box = button.getBoundingClientRect();
    const hits: string[] = [];
    for (const element of document.querySelectorAll(
      ".map-hud-top > *, .map-hud-bottom > *, .map-hud-bottom button, .map-hud-bottom .map-panel",
    )) {
      const rect = element.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      if (rect.left < box.right && rect.right > box.left && rect.top < box.bottom && rect.bottom > box.top)
        hits.push(element.className);
    }
    return hits;
  });
}

/** 아래 판 자리의 판(근처 판·내 유닛 목록·건물·오브젝트 판·떠 있는 정부 판) 수 — 늘 하나 이하(문제4) */
async function bottomSheets(page: Page): Promise<string[]> {
  return page
    .locator(
      ".map-hud-bottom :is(.map-nearby, .map-units, .gather-sheet, .gov-sheet):not(.gov-sheet-embedded):visible",
    )
    .evaluateAll((elements) => elements.map((element) => element.className));
}

/**
 * 내 유닛 목록·건물 판 흐름(문제2·3·4·1): 남의 유닛을 살펴보다가 [내 유닛 N] → 목록 첫 줄(사이보그)로 고르고, 근처 판 건물 줄로 건물 판을 연다.
 * 보낼 유닛 이름 = 안내 줄의 이름, 판 하나, 전환 단추와 겹침 없음. 사진 이름 끝(suffix)이 있으면 목록·건물 판을 찍는다
 */
async function unitListAndBuilding(page: Page, language: Language, suffix: string | null): Promise<void> {
  await rewriteTrpc(page, { "summary.get": hideSummary });
  await openMap(page);
  const screen = page.locator(".map-screen");
  const cyborg = (await screen.getAttribute("data-cyborg")) ?? "";
  expect(cyborg).toMatch(/^\d+$/);
  await expect(screen).toHaveAttribute("data-selected", cyborg, { timeout: 15_000 });
  // 근처 판 펼침: 탭·[닫기]가 전환 단추에 가리지 않는다
  await openNearby(page, "units");
  await expect(page.locator(".map-nearby-row").first()).toBeVisible({ timeout: 15_000 });
  expect(await switchOverlaps(page)).toEqual([]);
  // 남의 유닛(도시 둘레 휴먼)을 살펴본다 — 있으면
  const other = page.locator('.map-nearby-row[data-kind="unit"][data-mine="false"]').first();
  if (await other.count()) {
    await other.click();
    await expect(screen).toHaveAttribute("data-control", "other");
  }

  // [내 유닛 N] → 목록(사이보그 본체가 첫 줄), 근처 판은 그동안 숨는다
  const toggle = page.locator(".map-units-toggle");
  await expect(toggle).toHaveText(/\d/, { timeout: 15_000 });
  await toggle.click();
  const list = page.locator(".map-units");
  await expect(list).toBeVisible();
  const row = page.locator(".map-unit-row").first();
  await expect(row).toHaveAttribute("data-kind", "cyborg_body", { timeout: 15_000 });
  await expect(row).toHaveAttribute("data-unit-id", cyborg);
  expect(await bottomSheets(page)).toHaveLength(1);
  expect(await switchOverlaps(page)).toEqual([]);
  expect(await horizontalOverflow(page)).toEqual([]);
  expect(await smallTapTargets(page)).toEqual([]);
  if (suffix) await shot(page, `unit-list-${suffix}`);
  const name = ((await row.locator(".map-unit-name").textContent()) ?? "").trim();
  expect(name.length).toBeGreaterThan(0);
  // 줄을 누르면 고르고(기준 유닛 — 카메라가 따라간다) 좁은 화면이면 목록을 접는다(넓은 화면 64em 이상은 펼친 채 — 기획 60 §2.4)
  await row.click();
  await expect(screen).toHaveAttribute("data-selected", cyborg);
  await expect(screen).toHaveAttribute("data-anchor", cyborg);
  await expect(screen).toHaveAttribute("data-control", "own");
  await expect(list).toHaveCount((page.viewportSize()?.width ?? 0) >= 1024 ? 1 : 0);
  await expect(page.locator(".map-hint p").first()).toContainText(name);

  // 건물 하나를 누르면 판 하나 — 보낼 유닛은 안내 줄과 같은 유닛·이름(옛: "고른 유닛 1001")
  const [building] = await nearbyBuildingIds(page);
  expect(building).toBeDefined();
  await openBuildingFromList(page, building ?? 0);
  const sheet = page.locator(`.gather-sheet[data-building="${String(building)}"]`);
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  await expect(sheet.locator(".gather-actor")).toHaveText(
    message(language, "gather_actor_unit", { unit: name }),
  );
  await expect(page.locator(".map-hint p").first()).toContainText(name);
  await page.waitForTimeout(1_500);
  expect(await bottomSheets(page)).toEqual([expect.stringContaining("gather-sheet")]);
  await expect(page.locator(".gather-loop")).toHaveCount(0);
  expect(await switchOverlaps(page)).toEqual([]);
  expect(await horizontalOverflow(page)).toEqual([]);
  if (suffix) await shot(page, `unit-building-${suffix}`);
  // 닫으면 근처 판이 다시 보인다
  await sheet.locator(".gather-sheet-close").click();
  await expect(page.locator(".map-nearby")).toBeVisible();
}

/** 지도 캔버스 가운데(카메라 목표점)에서 (dx, dy) CSS px 떨어진 곳을 누른다 */
async function tapMap(page: Page, dx: number, dy: number): Promise<void> {
  const box = await page.locator(".map-view canvas").boundingBox();
  if (!box) throw new Error("no canvas");
  await page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
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
    // 들어오면 내 사이보그가 골라져 있고 카메라가 따라간다(자유 시점 없음)
    await expect(screen).toHaveAttribute("data-selected", cyborg ?? "", { timeout: 15_000 });
    await expect(screen).toHaveAttribute("data-follow", "on");
    // 근처 판 유닛 탭: 내 유닛이 위(기준 유닛 = 내 사이보그가 가장 가깝다)
    await openNearby(page, "units");
    const first = page.locator('.map-nearby-row[data-kind="unit"]').first();
    await expect(first).toHaveAttribute("data-id", cyborg ?? "", { timeout: 15_000 });
    await expect(first).toHaveAttribute("data-mine", "true");
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);

    // 줄을 누르면 고르고(내 유닛), 좁은 화면이라 목록을 접는다(탭 줄은 남는다)
    await first.click();
    await expect(screen).toHaveAttribute("data-selected", cyborg ?? "");
    await expect(screen).toHaveAttribute("data-control", "own");
    await expect(page.locator(".map-nearby-list")).toHaveCount(0);
    await expect(page.locator(".map-nearby")).toBeVisible();

    // 땅을 누르면 보낸다: 갈 수 있는 곳이 나올 때까지 카메라 목표점(따라가는 내 사이보그) 둘레의 빈 땅을 눌러 본다
    const send = async (): Promise<boolean> => {
      for (const { dx, dy } of (await groundOffsets(page)).slice(0, 8)) {
        await tapMap(page, dx, dy);
        await page.waitForTimeout(300);
        await expect(screen).not.toHaveAttribute("data-command", "sent", { timeout: 20_000 });
        if ((await screen.getAttribute("data-command")) === "ok") return true;
        // 건물을 눌러 건물 판이 열렸으면 닫는다
        const close = page.locator(".gather-sheet-close");
        if (await close.count()) await close.first().click();
        // 땅을 누르지 못하고 다른 유닛을 골랐으면 다시 내 사이보그를 고른다
        if ((await screen.getAttribute("data-selected")) !== cyborg) await pickMyUnit(page, cyborg ?? "");
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
    // 내 사이보그를 남의 유닛처럼: 시야 전송의 내 유닛 표시(own)를 지우고 내 유닛 목록을 이 맵에 없는 가짜 유닛 하나로 바꾼다
    // (목록이 비면 들어갈 수 없다 — WP-1)
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
        const units: unknown = Reflect.get(data, "units");
        const first: unknown = Array.isArray(units) ? units[0] : undefined;
        Reflect.set(
          data,
          "units",
          typeof first === "object" && first !== null ? [{ ...first, unitId: 999_999 }] : [],
        );
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
    // 빈 땅을 누른다: 걷는 휴먼(남의 유닛)을 누르면 그 유닛이 골라질 뿐이라 다음 자리를 누른다(고른 것은 여전히 남의 유닛)
    let viewOnly = false;
    for (const ground of (await groundOffsets(page)).slice(0, 6)) {
      await tapMap(page, ground.dx, ground.dy);
      try {
        await expect(screen).toHaveAttribute("data-command", "view_only", { timeout: 2_500 });
        viewOnly = true;
        break;
      } catch {
        const close = page.locator(".gather-sheet-close");
        if (await close.count()) await close.first().click();
      }
    }
    expect(viewOnly).toBe(true);
    await expect(screen).toHaveAttribute("data-control", "other");
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
    await openNearby(page, "units");
    const row = page.locator('.map-nearby-row[data-kind="unit"]').first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.click();
    await expect(screen).toHaveAttribute("data-control", "operator");
    // 운영자만 [자유 시점](빨간 운영자 단추): 켜면 따라가지 않는다
    const free = page.locator(".map-free-view");
    await expect(free).toBeVisible();
    await free.click();
    await expect(free).toHaveAttribute("aria-pressed", "true");
    await expect(screen).toHaveAttribute("data-free-view", "on");
    await expect(screen).not.toHaveAttribute("data-follow", /./);
    await free.click();
    await expect(screen).toHaveAttribute("data-follow", "on");
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
        await openNearby(page, "units");
        await expect(page.locator(".map-nearby-row").first()).toBeVisible({ timeout: 15_000 });
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
        await openNearby(page, "units");
        await page.locator(".map-nearby-row").first().click();
        await page.waitForTimeout(1_200);
        expect(await horizontalOverflow(page)).toEqual([]);
        await shot(page, `unit-control-operator-390-${theme}`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});

test.describe("내 유닛 목록·건물 판 하나·전환 단추 겹침(사용자 지적 2026-11-09)", () => {
  for (const theme of ["pastel", "dark"] as const) {
    for (const language of ["ko", "en"] as const) {
      test.describe(`390 ${theme} ${language}`, () => {
        test.use({ account: "player", theme, language });
        test(`[내 유닛 N]으로 고르고 건물 판은 하나, 보낼 유닛 = 안내 줄 (390·${theme}·${language})`, async ({
          page,
          deviceErrors,
        }) => {
          test.setTimeout(150_000);
          await unitListAndBuilding(page, language, `390-${theme}-${language}`);
          expect(deviceErrors).toEqual([]);
        });
      });
    }
  }

  test.describe("넓은 화면", () => {
    test.use({ account: "player", ...VIEWPORTS.desktop });
    test("넓은 화면에서도 전환 단추가 판과 겹치지 않는다", async ({ page, deviceErrors }) => {
      test.setTimeout(150_000);
      await unitListAndBuilding(page, "ko", null);
      await openNearby(page, "buildings");
      expect(await switchOverlaps(page)).toEqual([]);
      await shot(page, "unit-panels-desktop-pastel");
      expect(deviceErrors).toEqual([]);
    });
  });

  test.describe("운영자 390 영어", () => {
    test.use({ account: "dev", theme: "dark", language: "en" });
    test("운영자 표시가 있는 위 판도 전환 단추 자리를 비워 둔다", async ({ page, deviceErrors }) => {
      test.setTimeout(120_000);
      await rewriteTrpc(page, { "summary.get": hideSummary });
      await openMap(page);
      await page.locator(".map-operator-toggle").click();
      await expect(page.locator(".map-operator-badge")).toBeVisible();
      await openNearby(page, "units");
      await page.waitForTimeout(1_200);
      expect(await switchOverlaps(page)).toEqual([]);
      expect(await horizontalOverflow(page)).toEqual([]);
      await shot(page, "unit-operator-390-dark-en");
      expect(deviceErrors).toEqual([]);
    });
  });
});
