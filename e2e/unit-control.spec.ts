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
// "보낼 유닛"은 안내 줄과 같은 유닛·이름, 건물 하나를 누르면 판 하나(근처 판·정부 판이 따로 뜨지 않는다), 아래 탭(2026-11-12 — 옛 1·2차맵 전환 단추)은 판과 겹치지 않는다
// (오른쪽 위 구석). 사진: 목록·건물 판 390 × 파스텔·다크 × 한국어·영어, 넓은 화면 한 장.
// 바뀜(사용자 지적 2026-11-09 "이동하려는데 다른 유닛이 선택되는문제 … 다른 유닛 눌려지면 상호작용 메뉴가 나오거나 다른곳을 눌러 저절로 닫히게",
// docs/adr/2026-11-07-unit-control.md "바뀜 (2026-11-09)"): 플레이어가 남의 유닛을 누르면(지도·근처 판) 고르지 않고 정보 판(.map-peek)을 연다 —
// 명령 유닛(내 사이보그)은 그대로, 땅을 누르면 판이 닫히고 같은 누르기로 내 사이보그가 간다(move_unit). 이 맵에 내 유닛이 없는 화면(가짜 목록)에서는
// 땅을 눌러도 판만 닫히고 보내지 않는다.
// 바뀜(사용자 지적 2026-11-10 "다른 유닛 클릭 후 이동지역 클릭시 무시하고 본인 유닛이 이동하게 하라. 다른 유닛 클릭시 팝업으로 상호작용 메뉴띄우고
// 다른곳 클릭시 닫기", docs/adr/2026-11-07-unit-control.md "바뀜 (2026-11-10)"): 운영자 모드도 남의 유닛을 누르면 작은 창만 — [이 유닛 조종]을
// 눌러야 명령 유닛이 바뀐다. 손가락(터치 흉내, 412×915)으로 본다: 창 열림 → 고른 유닛 그대로 → 땅 누르기 = 닫고 내 유닛 move_unit.
// 남의 유닛은 몸 위를 눌러야 걸린다(빗나간 누르기 = 땅). 창은 밖(아래 안내 판)을 눌러도 닫힌다. 사진: 작은 창 390·412 × 파스텔·다크 × 한국어·영어 4장.
import { freeViewToggle, operatorToggle } from "./helpers/mapHud.ts";
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

/** 아래 탭(2차맵 맨 아래 [1차맵]·[유닛]·[도시]·[주변], 사용자 지적 2026-11-12)과 겹치는 위·아래 판 — 없어야 한다(판은 탭 위에서 멈춘다) */
async function navOverlaps(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const nav = document.querySelector(".map-nav");
    if (!nav) return ["no bottom nav"];
    const box = nav.getBoundingClientRect();
    const hits: string[] = [];
    for (const element of document.querySelectorAll(
      // 판 단위로 본다(스크롤 목록 안의 줄은 목록 상자 밖으로 나가도 잘려 보이지 않는다)
      ".map-hud-top > *, .map-hud-bottom > *, .map-hud-bottom .map-panel, .map-city",
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
      ".map-hud-bottom :is(.map-nearby, .map-units, .map-peek, .gather-sheet, .gov-sheet):not(.gov-sheet-embedded):visible",
    )
    .evaluateAll((elements) => elements.map((element) => element.className));
}

/**
 * 내 유닛 목록·건물 판 흐름(문제2·3·4·1): 남의 유닛을 살펴보다가 [내 유닛 N] → 목록 첫 줄(사이보그)로 고르고, 근처 판 건물 줄로 건물 판을 연다.
 * 보낼 유닛 이름 = 안내 줄의 이름, 판 하나, 아래 탭과 겹침 없음. 사진 이름 끝(suffix)이 있으면 목록·건물 판을 찍는다
 */
async function unitListAndBuilding(page: Page, language: Language, suffix: string | null): Promise<void> {
  await rewriteTrpc(page, { "summary.get": hideSummary });
  await openMap(page);
  const screen = page.locator(".map-screen");
  const cyborg = (await screen.getAttribute("data-cyborg")) ?? "";
  expect(cyborg).toMatch(/^\d+$/);
  await expect(screen).toHaveAttribute("data-selected", cyborg, { timeout: 15_000 });
  // 들어오면 최대 확대(사다리 6/6, 사용자 지적 2026-11-09·962 나) — 카메라 범위(내 유닛 둘레)가 걸린 뒤에도
  await page.waitForTimeout(1_500);
  await expect(page.locator(".zoom-ladder")).toHaveAttribute("data-stage", "6");
  // 근처 판 펼침: 탭·[닫기]가 아래 탭에 가리지 않는다
  await openNearby(page, "units");
  await expect(page.locator(".map-nearby-row").first()).toBeVisible({ timeout: 15_000 });
  expect(await navOverlaps(page)).toEqual([]);
  // 남의 유닛(도시 둘레 휴먼)을 살펴본다 — 있으면. 정보 판만 열리고 고른 유닛은 내 사이보그 그대로(2026-11-09)
  const other = page.locator('.map-nearby-row[data-kind="unit"][data-mine="false"]').first();
  if (await other.count()) {
    await other.click();
    await expect(page.locator(".map-peek")).toBeVisible();
    await expect(screen).toHaveAttribute("data-selected", cyborg);
    await expect(screen).toHaveAttribute("data-control", "own");
  }

  // 아래 탭 [유닛](수 표시) → 목록(사이보그 본체가 첫 줄), 근처 판은 그동안 숨는다
  const toggle = page.locator(".map-nav .map-nav-units");
  await expect(toggle.locator(".map-nav-badge")).toHaveText(/\d/, { timeout: 15_000 });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  const list = page.locator(".map-units");
  await expect(list).toBeVisible();
  const row = page.locator(".map-unit-row").first();
  await expect(row).toHaveAttribute("data-kind", "cyborg_body", { timeout: 15_000 });
  await expect(row).toHaveAttribute("data-unit-id", cyborg);
  expect(await bottomSheets(page)).toHaveLength(1);
  expect(await navOverlaps(page)).toEqual([]);
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
  expect(await navOverlaps(page)).toEqual([]);
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

/** 지도 캔버스 가운데에서 (dx, dy) CSS px 떨어진 곳을 손가락으로 누른다(터치 흉내 — 포인터 종류 touch) */
async function touchMap(page: Page, dx: number, dy: number): Promise<void> {
  const box = await page.locator(".map-view canvas").boundingBox();
  if (!box) throw new Error("no canvas");
  await page.touchscreen.tap(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
}

/** 지도 캔버스 가운데에서 (dx, dy) CSS px 떨어진 곳이 지금 지도 캔버스인지(작은 창·판이 덮지 않았는지) */
async function onCanvas(page: Page, dx: number, dy: number): Promise<boolean> {
  return page.evaluate(
    (offset) => {
      const canvas = document.querySelector(".map-view canvas");
      if (!canvas) return false;
      const box = canvas.getBoundingClientRect();
      const hit = document.elementFromPoint(
        box.x + box.width / 2 + offset.dx,
        box.y + box.height / 2 + offset.dy,
      );
      return hit instanceof HTMLCanvasElement && hit.closest(".map-view") !== null;
    },
    { dx, dy },
  );
}

/** 기기가 보낸 이동 명령(move_unit)을 모은다 */
async function watchMoves(page: Page): Promise<string[]> {
  const sentMoves: string[] = [];
  await page.routeWebSocket(/\/ws$/, (socket) => {
    const server = socket.connectToServer();
    socket.onMessage((data) => {
      if (typeof data === "string" && data.includes('"t":"move_unit"')) sentMoves.push(data);
      server.send(data);
    });
    server.onMessage((data) => socket.send(data));
  });
  return sentMoves;
}

/**
 * 땅을 손가락으로 눌러 보낸다: 갈 수 있는 곳이 나올 때까지 자리를 바꿔 누른다. 첫 누르기에 작은 창이 닫히는지 본다(closes).
 * 건물 판·다른 유닛 창이 열렸으면 닫고 다음 자리. 보냈으면 true
 */
async function touchGroundUntilSent(
  page: Page,
  grounds: readonly { dx: number; dy: number }[],
  closes: boolean,
): Promise<boolean> {
  const screen = page.locator(".map-screen");
  let first = true;
  for (const { dx, dy } of grounds) {
    // 땅 자리는 작은 창이 열리기 전에 골랐다: 지금 그 자리를 작은 창·판이 덮고 있으면 땅 누르기가 아니라 건너뛴다
    if (!(await onCanvas(page, dx, dy))) continue;
    const peek = page.locator(".map-peek");
    const before = closes && first ? await peek.getAttribute("data-unit") : null;
    await touchMap(page, dx, dy);
    if (closes && first) {
      // 걷는 휴먼이 마침 그 자리를 지나가면 그 유닛을 누른 것이라 그 유닛의 작은 창이 열린다(맞는 동작, 운영자는 안개 없이 모두 보인다).
      // 그때는 땅 누르기가 아니므로 창이 열린 채 다음 자리에서 다시 본다
      await expect
        .poll(async () => ((await peek.count()) === 0 ? "closed" : await peek.getAttribute("data-unit")))
        .not.toBe(before);
      if ((await peek.count()) > 0) continue;
    }
    first = false;
    await page.waitForTimeout(300);
    await expect(screen).not.toHaveAttribute("data-command", "sent", { timeout: 20_000 });
    if ((await screen.getAttribute("data-command")) === "ok") return true;
    const close = page.locator(".gather-sheet-close");
    if (await close.count()) await close.first().tap();
    const again = page.locator(".map-peek-close");
    if (await again.count()) await again.tap();
  }
  return false;
}

/**
 * 근처 판 유닛 탭의 남의 유닛 줄(가장 가까운 첫 줄, 또는 목록의 가장 먼 끝 줄)을 손가락으로 눌러 작은 창을 연다. 그 유닛 id.
 * 줄은 가까운 차례라 걷는 휴먼에 따라 부를 때마다 다른 유닛일 수 있다
 */
async function touchOtherUnitRow(page: Page, which: "first" | "last" = "first"): Promise<string> {
  await openNearby(page, "units");
  const rows = page.locator('.map-nearby-row[data-kind="unit"][data-mine="false"]');
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  const other = which === "first" ? rows.first() : rows.last();
  await other.tap();
  // 줄은 가까운 차례로 다시 놓인다(휴먼이 걷는다) — 줄에서 미리 읽은 id가 아니라 열린 창의 유닛을 쓴다
  const peek = page.locator(".map-peek");
  await expect(peek).toBeVisible();
  const otherId = (await peek.getAttribute("data-unit")) ?? "";
  expect(otherId).toMatch(/^\d+$/);
  return otherId;
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
    // 가는 동안 경로(땅 위 점선, 점 수 > 0)와 목적지 고리(1)를 그린다(사용자 요청 2026-11-09)
    await expect(screen).toHaveAttribute("data-route", /^[1-9]\d*,1$/, { timeout: 5_000 });
    // 가는 동안 [멈추기] → 그 자리에 선다
    const stop = page.locator(".map-unit-stop");
    await expect(stop).toBeVisible({ timeout: 5_000 });
    await shot(page, "unit-control-moving-390");
    // 헤드리스 소프트웨어 WebGL은 느려(프레임 몇 장/초) 사진을 찍는 사이·단추를 누르기 직전에 닿을 수 있다(닿으면 단추가 사라진다 — 수를 센 뒤
    // 누르기 전에 사라지면 click이 시험 시간 끝까지 기다렸다, 2026-11-14 stop-detach). 닿았으면 다시 보내고 다시 눌러 본다(세 번까지)
    let stopped = false;
    for (let attempt = 0; attempt < 3 && !stopped; attempt++) {
      if ((await stop.count()) === 0) {
        expect(await send()).toBe(true);
        await expect(stop).toBeVisible({ timeout: 5_000 });
      }
      // 클릭 동작 검사(멈춰 있음·가리지 않음)는 헤드리스 소프트웨어 WebGL에서 프레임이 몇 장/초라 몇 초 걸리고, 그사이 바닥 줄이 바뀌면 "not stable"·
      // "detached"로 다시 시작한다(2026-11-14 trace) → 단추에 클릭 이벤트를 바로 보낸다(붙어 있을 때만, 3초)
      stopped = await stop
        .dispatchEvent("click", undefined, { timeout: 3_000 })
        .then(() => true)
        .catch(() => false);
    }
    expect(stopped, "[멈추기]를 누르지 못했다(누르기 전에 닿음 세 번)").toBe(true);
    await expect(page.locator(".map-hint .map-command").first()).toHaveText(
      message("ko", "map_command_stopped", { id: cyborg ?? "" }),
      { timeout: 20_000 },
    );
    await expect(screen).toHaveAttribute("data-command", "ok");
    await expect(stop).toHaveCount(0, { timeout: 5_000 });
    // 서면 경로·목적지를 거둔다
    await expect(screen).toHaveAttribute("data-route", "0,0", { timeout: 5_000 });
    expect(deviceErrors).toEqual([]);
  });

  test("남의 유닛을 누르면 정보 판, 내 사이보그는 그대로 골라져 있고 땅을 누르면 판이 닫히며 내 사이보그가 간다", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(120_000);
    const sentMoves: string[] = [];
    await page.routeWebSocket(/\/ws$/, (socket) => {
      const server = socket.connectToServer();
      socket.onMessage((data) => {
        if (typeof data === "string" && data.includes('"t":"move_unit"')) sentMoves.push(data);
        server.send(data);
      });
      server.onMessage((data) => socket.send(data));
    });
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await openMap(page);
    const screen = page.locator(".map-screen");
    const cyborg = (await screen.getAttribute("data-cyborg")) ?? "";
    expect(cyborg).toMatch(/^\d+$/);
    await expect(screen).toHaveAttribute("data-selected", cyborg, { timeout: 15_000 });
    // 땅 자리는 판을 열기 전에 찾는다(찾는 도우미가 근처 판을 열어 정보 판을 닫는다)
    const grounds = (await groundOffsets(page)).slice(0, 8);
    expect(grounds.length).toBeGreaterThan(0);
    // 도시 둘레 휴먼(남의 유닛) 줄을 누른다 — 지도에서 누를 때와 같은 정보 판
    await openNearby(page, "units");
    const other = page.locator('.map-nearby-row[data-kind="unit"][data-mine="false"]').first();
    await expect(other).toBeVisible({ timeout: 15_000 });
    await other.click();
    // 줄은 가까운 차례로 다시 놓인다(휴먼이 걷는다) — 줄에서 미리 읽은 id가 아니라 열린 창의 유닛을 쓴다
    const peek = page.locator(".map-peek");
    await expect(peek).toBeVisible();
    const otherId = (await peek.getAttribute("data-unit")) ?? "";
    expect(otherId).toMatch(/^\d+$/);
    expect(otherId).not.toBe(cyborg);
    await expect(peek.locator(".map-peek-note")).toHaveText(message("ko", "map_peek_note"));
    // 명령 유닛은 그대로(옛: 남의 유닛이 고른 유닛이 되어 땅을 눌러도 "내 유닛만 움직일 수 있습니다")
    await expect(screen).toHaveAttribute("data-selected", cyborg);
    await expect(screen).toHaveAttribute("data-control", "own");
    await expect(page.locator(".map-hint p").first()).not.toContainText("#" + otherId);
    expect(await bottomSheets(page)).toEqual([expect.stringContaining("map-peek")]);
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);

    // 땅을 누르면 판이 닫히고 같은 누르기로 내 사이보그를 보낸다(갈 수 없는 곳이면 다음 자리)
    let moved = false;
    for (const [index, { dx, dy }] of grounds.entries()) {
      await tapMap(page, dx, dy);
      if (index === 0) await expect(page.locator(".map-peek")).toHaveCount(0);
      await page.waitForTimeout(300);
      await expect(screen).not.toHaveAttribute("data-command", "sent", { timeout: 20_000 });
      if ((await screen.getAttribute("data-command")) === "ok") {
        moved = true;
        break;
      }
      const close = page.locator(".gather-sheet-close");
      if (await close.count()) await close.first().click();
      // 걷는 휴먼을 눌러 정보 판이 다시 열렸으면 닫는다(고른 유닛은 그대로다)
      const again = page.locator(".map-peek-close");
      if (await again.count()) await again.click();
      await expect(screen).toHaveAttribute("data-selected", cyborg);
    }
    expect(moved).toBe(true);
    expect(sentMoves.length).toBeGreaterThan(0);
    expect(sentMoves.every((data) => data.includes(`"unitId":${cyborg}`))).toBe(true);
    // 다른 시험이 쓰는 내 사이보그를 세운다(누르기 전에 닿아 단추가 사라질 수 있다 — 짧게 눌러 본다)
    const stop = page.locator(".map-unit-stop");
    if (await stop.count())
      await stop.dispatchEvent("click", undefined, { timeout: 5_000 }).catch(() => undefined);
    expect(deviceErrors).toEqual([]);
  });

  test("지도에서 남의 유닛을 누르면 정보 판(고르지 않음), 내 유닛이 이 맵에 없으면 땅을 눌러도 판만 닫고 보내지 않는다", async ({
    page,
    deviceErrors,
  }) => {
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
    const cyborg = (await screen.getAttribute("data-cyborg")) ?? "";
    // 카메라는 내 사이보그 둘레(가짜 목록 유닛의 칸 = 사이보그 칸의 카메라 범위)에 열린다(D-6017) → 가운데를 누르면 둘레 유닛을 누른다.
    // 2차맵은 최대 확대(6/6)로 열려(사용자 지적 2026-11-09) 카메라 목표와 유닛 사이가 화면에서 멀다: 두 단계 줄여 옛 처음 거리쯤(4/6)에서 누른다
    await expect(screen).toHaveAttribute("data-focus", /\d+/);
    const grounds = (await groundOffsets(page)).slice(0, 6);
    await page.waitForTimeout(1_200);
    await page.locator(".zoom-ladder-out").click();
    await expect(page.locator(".zoom-ladder")).toHaveAttribute("data-stage", "5");
    await page.locator(".zoom-ladder-out").click();
    await expect(page.locator(".zoom-ladder")).toHaveAttribute("data-stage", "4");
    await page.waitForTimeout(800);
    // 빗나간 누르기(몸에서 옆으로 24px — 옛 반경 22px + 몸 크기 안이었다): 남의 유닛은 몸 위를 눌러야 걸린다 → 그 유닛의 창이 열리지 않는다
    // (땅 누르기가 된다 — docs/adr/2026-11-07-unit-control.md "바뀜 (2026-11-10)"). 다른 것이 눌려 열린 판은 닫는다
    await touchMap(page, 24, -6);
    await page.waitForTimeout(800);
    await expect(page.locator(`.map-peek[data-unit="${cyborg}"]`)).toHaveCount(0);
    for (const closer of [".gather-sheet-close", ".map-peek-close"]) {
      const close = page.locator(closer);
      if (await close.count()) await close.first().tap();
    }
    // 몸 위를 손가락으로 누른다
    await touchMap(page, 0, -6);
    const peek = page.locator(".map-peek");
    try {
      await expect(peek).toBeVisible({ timeout: 5_000 });
    } catch {
      // 가운데에 유닛이 없으면 근처 판 유닛 탭의 남의 유닛 줄(내 사이보그도 여기서는 남의 유닛)로 연다
      await openNearby(page, "units");
      await page.locator('.map-nearby-row[data-kind="unit"][data-mine="false"]').first().click();
      await expect(peek).toBeVisible({ timeout: 5_000 });
    }
    // 누른 남의 유닛은 고른 유닛이 되지 않는다(엔진 고른 표시도 그대로 — data-selected는 엔진 고르기를 따른다)
    const peeked = (await peek.getAttribute("data-unit")) ?? "";
    expect(peeked).toMatch(/^\d+$/);
    await page.waitForTimeout(1_200);
    await expect(screen).not.toHaveAttribute("data-selected", peeked);
    await expect(page.locator(".map-unit-stop")).toHaveCount(0);
    expect(cyborg).toMatch(/^\d+$/);
    // 빈 땅을 누른다: 판이 닫히고, 명령 유닛(가짜 목록 유닛)은 이 맵에 없어 보내지 않는다(view_only)
    let viewOnly = false;
    for (const ground of grounds) {
      await touchMap(page, ground.dx, ground.dy);
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
    await expect(peek).toHaveCount(0);
    expect(sentMoves).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });

  test.describe("손가락(412×915)", () => {
    test.use({ ...VIEWPORTS.phoneLarge });
    test("손가락: 남의 유닛 → 작은 창, 밖(안내 판)을 누르면 닫히고, 땅을 누르면 닫히며 내 사이보그가 간다", async ({
      page,
      deviceErrors,
    }) => {
      test.setTimeout(150_000);
      const sentMoves = await watchMoves(page);
      await rewriteTrpc(page, { "summary.get": hideSummary });
      await openMap(page);
      const screen = page.locator(".map-screen");
      const cyborg = (await screen.getAttribute("data-cyborg")) ?? "";
      expect(cyborg).toMatch(/^\d+$/);
      await expect(screen).toHaveAttribute("data-selected", cyborg, { timeout: 15_000 });
      const grounds = (await groundOffsets(page)).slice(0, 8);
      expect(grounds.length).toBeGreaterThan(0);

      // 남의 유닛 줄을 손가락으로: 작은 창(대화상자 구실) — 플레이어에게는 [이 유닛 조종]이 없다
      const otherId = await touchOtherUnitRow(page);
      const peek = page.locator(".map-peek");
      await expect(peek).toHaveAttribute("role", "dialog");
      await expect(peek).toHaveAttribute("data-ground", "own");
      await expect(peek.locator(".map-peek-control")).toHaveCount(0);
      await expect(peek.locator(".map-peek-note")).toHaveText(message("ko", "map_peek_note"));
      // 할 수 있는 일: 지도자면 지도자 몫, 아니면 "아직 없다" 한 줄
      await expect(peek.locator('.map-peek-empty, [data-part="leader-sheet"]').first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(screen).toHaveAttribute("data-selected", cyborg);
      await expect(screen).toHaveAttribute("data-control", "own");
      expect(await bottomSheets(page)).toEqual([expect.stringContaining("map-peek")]);
      expect(await horizontalOverflow(page)).toEqual([]);
      expect(await smallTapTargets(page)).toEqual([]);

      // 창 밖(아래 안내 판)을 누르면 닫힌다 — 보내지 않는다
      await page.locator(".map-hint").tap();
      await expect(peek).toHaveCount(0);
      expect(sentMoves).toEqual([]);
      await expect(screen).toHaveAttribute("data-selected", cyborg);

      // 다시 열고 땅을 누른다: 닫히고 같은 누르기로 내 사이보그가 간다
      expect(await touchOtherUnitRow(page)).toMatch(/^\d+$/);
      expect(await touchGroundUntilSent(page, grounds, true)).toBe(true);
      expect(sentMoves.length).toBeGreaterThan(0);
      expect(sentMoves.filter((data) => !data.includes(`"unitId":${cyborg},`))).toEqual([]);
      expect(otherId).not.toBe(cyborg);
      await expect(screen).toHaveAttribute("data-selected", cyborg);
      const stop = page.locator(".map-unit-stop");
      if (await stop.count()) await stop.tap({ timeout: 5_000 }).catch(() => undefined);
      expect(deviceErrors).toEqual([]);
    });
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
    const toggle = await operatorToggle(page);
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
    const free = await freeViewToggle(page);
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

test.describe("유닛 조종: 운영자 손가락(412×915)", () => {
  test.use({ account: "dev", ...VIEWPORTS.phoneLarge });

  test("운영자 모드도 남의 유닛을 누르면 작은 창만 — 땅은 내 사이보그가 가고, [이 유닛 조종]을 눌러야 그 유닛이 간다", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(240_000);
    const sentMoves = await watchMoves(page);
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await openMap(page);
    const screen = page.locator(".map-screen");
    const cyborg = (await screen.getAttribute("data-cyborg")) ?? "";
    expect(cyborg).toMatch(/^\d+$/);
    const toggle = await operatorToggle(page);
    await toggle.tap();
    await expect(screen).toHaveAttribute("data-operator", "on");
    await expect(screen).toHaveAttribute("data-feed", "live", { timeout: 15_000 });
    await expect(screen).toHaveAttribute("data-selected", cyborg, { timeout: 15_000 });
    const grounds = (await groundOffsets(page)).slice(0, 8);
    expect(grounds.length).toBeGreaterThan(0);

    // 남의 유닛을 눌러도 명령 유닛은 내 사이보그 그대로(옛: 그 유닛이 골라져 다음 땅 누르기가 그 유닛을 보냈다)
    const otherId = await touchOtherUnitRow(page);
    const peek = page.locator(".map-peek");
    const control = peek.locator(".map-peek-control");
    await expect(control).toHaveText(message("ko", "map_peek_control"));
    await expect(peek).toHaveAttribute("data-ground", "operator");
    await expect(peek.locator(".map-peek-note")).toHaveText(message("ko", "map_peek_note_operator"));
    // 1초 요약이 엔진 고르기를 화면에 맞춘 뒤에도 그대로다
    await page.waitForTimeout(1_500);
    await expect(screen).toHaveAttribute("data-selected", cyborg);
    await expect(screen).toHaveAttribute("data-anchor", cyborg);
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);

    // 땅을 누르면 창이 닫히고 내 사이보그가 간다(남의 유닛은 가지 않는다)
    expect(await touchGroundUntilSent(page, grounds, true)).toBe(true);
    expect(sentMoves.length).toBeGreaterThan(0);
    expect(sentMoves.filter((data) => !data.includes(`"unitId":${cyborg},`))).toEqual([]);
    await expect(screen).toHaveAttribute("data-selected", cyborg);
    const stop = page.locator(".map-unit-stop");
    if (await stop.count()) await stop.tap({ timeout: 5_000 }).catch(() => undefined);

    // [이 유닛 조종]: 이 단추만 명령 유닛을 남의 유닛으로 바꾼다 → 땅을 누르면 그 유닛이 간다.
    // 목록의 가장 먼 유닛을 조종한다: 카메라가 그 유닛을 따라가 내 사이보그가 화면 가운데 둘레에 없다(내 유닛은 넉넉한 반경이라 땅 자리에 걸리면 고른다)
    const controlled = await touchOtherUnitRow(page, "last");
    expect(controlled).not.toBe(cyborg);
    await control.tap();
    await expect(peek).toHaveCount(0);
    await expect(screen).toHaveAttribute("data-selected", controlled);
    await expect(screen).toHaveAttribute("data-control", "operator");
    await expect(screen).toHaveAttribute("data-anchor", controlled);
    const before = sentMoves.length;
    const groundsNow = (await groundOffsets(page)).slice(0, 8);
    expect(await touchGroundUntilSent(page, groundsNow, false)).toBe(true);
    const later = sentMoves.slice(before);
    expect(later.length).toBeGreaterThan(0);
    expect(later.filter((data) => !data.includes(`"unitId":${controlled},`))).toEqual([]);
    expect(otherId).toMatch(/^\d+$/);

    // 운영자 모드를 끄면 조종하던 남의 유닛을 놓고 내 사이보그로 돌아온다(운영 메뉴는 땅을 누를 때 닫혔다 — 다시 연다)
    await (await operatorToggle(page)).tap();
    await expect(screen).toHaveAttribute("data-operator", "off");
    await expect(screen).toHaveAttribute("data-selected", cyborg, { timeout: 15_000 });
    await expect(screen).toHaveAttribute("data-control", "own");
    expect(deviceErrors).toEqual([]);
  });
});

/** 작은 창 사진 4장: 390·412 × 파스텔·다크 × 한국어·영어(플레이어 둘, 운영자 둘 — [이 유닛 조종]) */
const PEEK_SHOTS = [
  { account: "player", size: "390", viewport: VIEWPORTS.phone, theme: "pastel", language: "ko" },
  { account: "player", size: "390", viewport: VIEWPORTS.phone, theme: "dark", language: "en" },
  { account: "dev", size: "412", viewport: VIEWPORTS.phoneLarge, theme: "dark", language: "ko" },
  { account: "dev", size: "412", viewport: VIEWPORTS.phoneLarge, theme: "pastel", language: "en" },
] as const;

test.describe("남의 유닛 작은 창 사진", () => {
  for (const { account, size, viewport, theme, language } of PEEK_SHOTS) {
    test.describe(`${account} ${size} ${theme} ${language}`, () => {
      test.use({ account, ...viewport, theme, language });
      test(`남의 유닛 작은 창 (${account}·${size}·${theme}·${language})`, async ({ page, deviceErrors }) => {
        test.setTimeout(120_000);
        await rewriteTrpc(page, { "summary.get": hideSummary });
        await openMap(page);
        const screen = page.locator(".map-screen");
        if (account === "dev") {
          await (await operatorToggle(page)).tap();
          await expect(screen).toHaveAttribute("data-operator", "on");
          await expect(screen).toHaveAttribute("data-feed", "live", { timeout: 15_000 });
        }
        await touchOtherUnitRow(page);
        const peek = page.locator(".map-peek");
        await expect(peek.locator(".map-peek-close")).toHaveText(message(language, "map_peek_close"));
        // 한눈 정보(세력·종류)가 오면 주인 줄에 " · "
        await expect(peek.locator(".map-peek-line")).toContainText(" · ", { timeout: 10_000 });
        if (account === "dev")
          await expect(peek.locator(".map-peek-control")).toHaveText(message(language, "map_peek_control"));
        else await expect(peek.locator(".map-peek-control")).toHaveCount(0);
        // 뜨는 움직임이 끝난 뒤 찍는다
        await page.waitForTimeout(400);
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        expect(await navOverlaps(page)).toEqual([]);
        await shot(page, `unit-peek-${account}-${size}-${theme}-${language}`);
        // [닫기]로 닫으면 근처 판 자리로 돌아간다
        await peek.locator(".map-peek-close").tap();
        await expect(peek).toHaveCount(0);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
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
        await (await operatorToggle(page)).click();
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

test.describe("내 유닛 목록·건물 판 하나·아래 탭 겹침(사용자 지적 2026-11-09·2026-11-12)", () => {
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

  test.describe("진입 확대", () => {
    test.use({ account: "player" });
    test("1차맵에 다녀와도 2차맵은 최대 확대(6/6)로 연다", async ({ page, deviceErrors }) => {
      test.setTimeout(150_000);
      await rewriteTrpc(page, { "summary.get": hideSummary });
      await openMap(page);
      const ladder = page.locator(".zoom-ladder");
      await expect(ladder).toHaveAttribute("data-stage", "6");
      // 세 단계 줄인 뒤 1차맵으로 갔다가 돌아온다
      for (let step = 0; step < 3; step++) {
        await ladder.locator(".zoom-ladder-out").click();
        await page.waitForTimeout(150);
      }
      await expect(ladder).toHaveAttribute("data-stage", "3");
      await page.locator(".map-nav .map-nav-planet").click();
      await expect(page).toHaveURL((url) => url.pathname === "/map/planet");
      await expect(page.locator(".planet-screen")).toHaveAttribute("data-status", "ready", {
        timeout: 60_000,
      });
      await page.locator(".map-switch-button").click();
      await expect(page).toHaveURL((url) => url.pathname === "/map");
      const screen = page.locator(".map-screen[data-map-key]");
      await expect(screen).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
      await expect(page.locator(".zoom-ladder")).toHaveAttribute("data-stage", "6");
      await page.waitForTimeout(1_500);
      await expect(page.locator(".zoom-ladder")).toHaveAttribute("data-stage", "6");
      expect(deviceErrors).toEqual([]);
    });
  });

  test.describe("넓은 화면", () => {
    test.use({ account: "player", ...VIEWPORTS.desktop });
    test("넓은 화면에서도 아래 탭이 판과 겹치지 않는다", async ({ page, deviceErrors }) => {
      test.setTimeout(150_000);
      await unitListAndBuilding(page, "ko", null);
      await openNearby(page, "buildings");
      expect(await navOverlaps(page)).toEqual([]);
      await shot(page, "unit-panels-desktop-pastel");
      expect(deviceErrors).toEqual([]);
    });
  });

  test.describe("운영자 390 영어", () => {
    test.use({ account: "dev", theme: "dark", language: "en" });
    test("운영자 표시·운영 메뉴가 있는 위 판도 넘치지 않고 아래 탭과 겹치지 않는다", async ({
      page,
      deviceErrors,
    }) => {
      test.setTimeout(120_000);
      await rewriteTrpc(page, { "summary.get": hideSummary });
      await openMap(page);
      await (await operatorToggle(page)).click();
      await expect(page.locator(".map-operator-badge")).toBeVisible();
      await openNearby(page, "units");
      await page.waitForTimeout(1_200);
      expect(await navOverlaps(page)).toEqual([]);
      expect(await horizontalOverflow(page)).toEqual([]);
      await shot(page, "unit-operator-390-dark-en");
      expect(deviceErrors).toEqual([]);
    });
  });
});
