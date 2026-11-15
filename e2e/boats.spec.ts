// 배 B1 화면 시험 — 기획 D-540(1221 "지도 위 배부터"), docs/adr/2026-11-13-boats.md.
// 운영자(admin, 전체 보기로 구독한 연결 = 운영자 모드) 흐름: 띄운 도시 2차맵 가운데 곧은 물가가 있는 곳을 물 표(facilities.waterMask)로 찾아
// (시험 행성은 대부분 마른 땅이다 — 내 사이보그 2차맵에는 물이 없을 수 있다) 그 도시에서 휴먼을 고용하고(ensureHuman), 부두를 짓고
// (개발 재료 받기 → facility_build → dev_facility_finish), 부두에서 배를 만들고(boat_build), 휴먼을 태워(boat_board — 멀면 걸어가서),
// 배를 물 위로 보내고(move_unit — 서버가 물 길로 푼다), 지도 화면에서 배를 골라 [모두 내리기]로 물가에 내린다. 테마 둘(파스텔·다크) 390px 사진.
// 걷는 유닛이 물로 못 가는 것·배가 땅으로 못 가는 것은 단위 시험(apps/server/src/boats/service.test.ts)이 본다.
// B2(기획 D-541, ADR "바뀜 (2026-11-14, B2)"): 배 만들기는 시간이 걸린다(운영자 = 부두 레벨 1 시간 ÷ 운영자 빠르기) — boat_build는 readyAtMs를
// 돌려주고(같은 부두에 다시 보내면 dock_busy) 그 시각 뒤 배가 뜬다. 부두 판은 만드는 중인 배의 남은 시간을 보인다. 승객에게 내린 이동은 배가 가고,
// 승객에게 보낸 2차맵 사이 이동은 배가 동쪽 바다 2차맵으로 건너간다(승객도 탄 채).
// B3(기획 D-541 1280 가, ADR "바뀜 (2026-11-14, B3)"): 바다 2차맵에서 승객에게 가장 가까운 어군을 시키면(gather_start) 배가 어군 옆까지 가고
// 승객은 내리지 않은 채 낚아 화물에 든다(gather.loops — 캔 묶음 > 0, 승객은 여전히 배에).
// 배 체계 개편(기획 D-547, docs/adr/2026-11-15-shipyard-harbor.md): 배는 조선소에서 만들고(도크 1 — 두 번째는 dock_busy), 정박장을 지어 [여기 정박](boat_berth)으로
// 집을 잡고(배 줄 homeId), 정박장 판에 든 배가 보이며, 교역 부두에서 시간을 사고(boat_dock_time), 가득인 배를 고치면 hull_full이다. 정박장 판 390px 사진.
import type { Page } from "@playwright/test";
import { pickMyUnit, openBuildingFromList, closeNearby } from "./helpers/nearby.ts";
import { shot } from "./helpers/screen.ts";
import { expect, test } from "./helpers/test.ts";
import { ensureHuman, sendCommands } from "./helpers/wsCommands.ts";

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;

/** 고정소수점 1칸(@terra/sim CELL_UNITS) */
const CELL_UNITS = 1024;
/** 지형 칸 한 변(128) */
const TERRAIN = 128;

async function trpcQuery(page: Page, route: string, input: unknown): Promise<unknown> {
  const reply: unknown = await page.evaluate(
    async ({ path, body }) =>
      fetch(
        body === undefined
          ? `/api/trpc/${path}`
          : `/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify(body))}`,
      ).then((r) => r.json()),
    { path: route, body: input },
  );
  return field(field(reply, "result"), "data");
}

/** 물 표(지형 칸 1비트, 행 우선, 바이트 안 낮은 비트부터) → 물인가 */
async function waterOf(page: Page, mapKey: number): Promise<(tx: number, ty: number) => boolean> {
  const mask = await trpcQuery(page, "facilities.waterMask", { mapKey });
  const raw = field(mask, "hex");
  const hex = typeof raw === "string" ? raw : "";
  const bytes = Uint8Array.from({ length: hex.length / 2 }, (_, i) =>
    Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16),
  );
  return (tx, ty) => {
    if (tx < 0 || ty < 0 || tx >= TERRAIN || ty >= TERRAIN) return false;
    const i = ty * TERRAIN + tx;
    return ((bytes[i >> 3] ?? 0) & (1 << (i & 7))) !== 0;
  };
}

interface Site {
  /** 부두 기준 배치 칸 */
  readonly dockX: number;
  readonly dockY: number;
}

/**
 * 부두 자리 후보(가까운 차례): 지형 칸 (tx, ty)에서 물 쪽 방향 d로 깊이 1~2는 물, 깊이 −1~0은 땅(물가 따라 0~1 두 칸).
 * 부두(3×3)는 그 땅 2×2 지형 칸 안에서 물에 붙게 놓는다
 */
function coastSites(isWater: (tx: number, ty: number) => boolean, near: { x: number; y: number }): Site[] {
  const out: (Site & { d: number })[] = [];
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  for (let ty = 4; ty < TERRAIN - 4; ty++)
    for (let tx = 4; tx < TERRAIN - 4; tx++)
      for (const [dx, dy] of dirs) {
        const px = dy;
        const py = dx;
        const at = (depth: number, along: number): [number, number] => [
          tx + depth * dx + along * px,
          ty + depth * dy + along * py,
        ];
        let ok = true;
        for (let along = 0; along <= 1 && ok; along++)
          for (let depth = -1; depth <= 2 && ok; depth++) {
            const [cx, cy] = at(depth, along);
            if (isWater(cx, cy) !== depth >= 1) ok = false;
          }
        if (!ok) continue;
        // 부두 지형 칸 네모(깊이 −1~0 × 물가 0~1) → 배치 칸 4×4, 그 안 3×3을 물 쪽에 붙인다
        const cells = [at(-1, 0), at(0, 0), at(-1, 1), at(0, 1)];
        const minX = Math.min(...cells.map(([x]) => x)) * 2;
        const minY = Math.min(...cells.map(([, y]) => y)) * 2;
        const dockX = dx > 0 ? minX + 1 : minX;
        const dockY = dy > 0 ? minY + 1 : minY;
        out.push({ dockX, dockY, d: Math.hypot(dockX - near.x, dockY - near.y) });
      }
  return out.toSorted((a, b) => a.d - b.d);
}

/** 배를 보낼 물가 물 칸(지형 칸 — 네 이웃에 땅이 있다, 내릴 땅이 가깝다) 기준 배치 칸, 부두에서 6~40 지형 칸, 가까운 차례 */
function shoreTargets(isWater: (tx: number, ty: number) => boolean, dock: Site): { x: number; y: number }[] {
  const out: { x: number; y: number; d: number }[] = [];
  const cx = dock.dockX / 2;
  const cy = dock.dockY / 2;
  for (let ty = 2; ty < TERRAIN - 2; ty++)
    for (let tx = 2; tx < TERRAIN - 2; tx++) {
      if (!isWater(tx, ty)) continue;
      const shore =
        !isWater(tx + 1, ty) || !isWater(tx - 1, ty) || !isWater(tx, ty + 1) || !isWater(tx, ty - 1);
      const d = Math.hypot(tx - cx, ty - cy);
      if (shore && d >= 6 && d <= 40) out.push({ x: tx * 2, y: ty * 2, d });
    }
  return out.toSorted((a, b) => a.d - b.d);
}

/** 그 2차맵 내 유닛 목록 한 줄 */
async function myUnit(page: Page, mapKey: number, unitId: number): Promise<unknown> {
  const data = await trpcQuery(page, "world.mapUnits", { mapKey });
  const units = field(data, "units");
  return Array.isArray(units) ? units.find((unit: unknown) => field(unit, "unitId") === unitId) : undefined;
}

/**
 * 바닷가 2차맵: 시험 행성은 대부분 마른 땅이고 도시는 물을 피해 선다(2026-11-14 확인: 띄운 도시 2차맵 15곳 모두 부두 자리 0). 그래서 시작 도시
 * 2차맵 F9 면 0 (468, 252)의 동쪽 이웃 (469, 252)(바다, 물 지형 칸 584 — 지형 캐시를 훑어 고름)으로 휴먼을 보낸다. 세계 배치가 바뀌어 그 도시가
 * 없어지면 이 두 키를 다시 고른다
 */
const CITY_KEY = 424_892_524_658_697;
const COAST_KEY = 424_898_967_109_641;
/**
 * 바닷가 2차맵의 동쪽 이웃 (470, 252) — 거의 바다(물 지형 칸 15,864). 바닷가 2차맵 동쪽 변의 물(지형 칸 y 0~7·44~71)과 이어진다(2026-11-14 확인:
 * 생성기로 두 2차맵 지형을 만들어 공유 변 물 칸을 셈)
 */
const EAST_SEA_KEY = 424_901_114_593_289;

/** 그 2차맵 내 배 ID 목록 */
async function boatIds(page: Page, mapKey: number): Promise<number[]> {
  const data = await trpcQuery(page, "world.mapUnits", { mapKey });
  const units = field(data, "units");
  return Array.isArray(units)
    ? units
        .filter((unit: unknown) => field(unit, "kind") === "boat")
        .map((unit: unknown) => Number(field(unit, "unitId")))
    : [];
}

/** 도시 2차맵에서 휴먼을 고용해 바닷가 2차맵 서쪽 끝(도시 쪽)으로 보낸다(운영자 빠르기). 휴먼 ID와 선 자리 */
async function humanAtCoast(page: Page): Promise<{ unitId: number; x: number; y: number }> {
  const unitId = await ensureHuman(page, "e2e_admin", CITY_KEY);
  const here = await myUnit(page, COAST_KEY, unitId);
  if (here === undefined) {
    const travel = await sendCommands(
      page,
      [
        { t: "subscribe", mapKey: CITY_KEY, observe: true },
        { t: "travel_start", unitId, mapKey: COAST_KEY, x: 6, y: 128, kind: "move" },
      ],
      6900 + (Date.now() % 50) * 2,
    );
    expect(travel[1], "바닷가 2차맵으로 보내기").toMatchObject({ ok: true });
  }
  await expect
    .poll(async () => field(await myUnit(page, COAST_KEY, unitId), "moving"), { timeout: 120_000 })
    .toBe(false);
  const row = await myUnit(page, COAST_KEY, unitId);
  return { unitId, x: Number(field(row, "cellX")), y: Number(field(row, "cellY")) };
}

/** 시설 칸(3×3)이 겹치나 */
const overlaps = (a: Site, b: Site): boolean =>
  Math.abs(a.dockX - b.dockX) < 4 && Math.abs(a.dockY - b.dockY) < 4;

/** 물가 자리에 배 시설 하나를 짓고 다 짓는다(운영자). 건물 ID와 자리. used = 이미 쓴 자리(겹치지 않게) */
async function harborAt(
  page: Page,
  mapKey: number,
  sites: readonly Site[],
  used: Site[],
  facility: "dock" | "trade_dock",
  firstId: number,
): Promise<{ buildingId: number; nextId: number }> {
  let id = firstId;
  for (const site of sites
    .filter((candidate) => !used.some((other) => overlaps(other, candidate)))
    .slice(0, 40)) {
    const replies = await sendCommands(
      page,
      [
        { t: "subscribe", mapKey, observe: true },
        { t: "dev_facility_grant", item: "pine_log", qty: 200, mapKey, x: site.dockX, y: site.dockY },
        { t: "dev_facility_grant", item: "stone", qty: 60, mapKey, x: site.dockX, y: site.dockY },
        { t: "facility_build", mapKey, facility, x: site.dockX, y: site.dockY, rotation: 0 },
      ],
      id,
    );
    id += 10;
    const buildingId = field(replies[3], "buildingId");
    if (field(replies[3], "ok") !== true || typeof buildingId !== "number") {
      // 명령 속도 제한(분당 30번)에 걸렸으면 잠시 쉬고 다음 자리로(앞 테마 시험이 한도를 썼을 수 있다)
      const code = field(replies[3], "code");
      console.log(`[boats] ${String(site.dockX)},${String(site.dockY)} build refused: ${String(code)}`);
      if (code === "rate_limited") await page.waitForTimeout(15_000);
      continue;
    }
    const done = await sendCommands(
      page,
      [
        { t: "subscribe", mapKey, observe: true },
        { t: "dev_facility_finish", buildingId },
      ],
      id,
    );
    id += 10;
    expect(done[1]).toMatchObject({ ok: true });
    used.push(site);
    return { buildingId, nextId: id };
  }
  throw new Error(`${facility}를 지을 물가 자리가 없다`);
}

/** 조선소를 짓고 배를 만든다(운영자 모드 연결). 조선소·배 ID와 자리 */
async function dockAndBoat(page: Page, mapKey: number, sites: readonly Site[], firstId: number) {
  let id = firstId;
  for (const site of sites.slice(0, 40)) {
    const replies = await sendCommands(
      page,
      [
        { t: "subscribe", mapKey, observe: true },
        { t: "dev_facility_grant", item: "pine_log", qty: 200, mapKey, x: site.dockX, y: site.dockY },
        { t: "dev_facility_grant", item: "stone", qty: 60, mapKey, x: site.dockX, y: site.dockY },
        { t: "facility_build", mapKey, facility: "shipyard", x: site.dockX, y: site.dockY, rotation: 0 },
      ],
      id,
    );
    id += 10;
    const buildingId = field(replies[3], "buildingId");
    if (field(replies[3], "ok") !== true || typeof buildingId !== "number") {
      // 명령 속도 제한(분당 30번)에 걸렸으면 잠시 쉬고 다음 자리로(앞 테마 시험이 한도를 썼을 수 있다)
      const code = field(replies[3], "code");
      console.log(`[boats] ${String(site.dockX)},${String(site.dockY)} build refused: ${String(code)}`);
      if (code === "rate_limited") await page.waitForTimeout(15_000);
      continue;
    }
    const before = new Set(await boatIds(page, mapKey));
    const made = await sendCommands(
      page,
      [
        { t: "subscribe", mapKey, observe: true },
        { t: "dev_facility_finish", buildingId },
        { t: "boat_build", buildingId, boatType: "rowboat" },
        { t: "boat_build", buildingId },
      ],
      id,
    );
    id += 10;
    expect(made[1]).toMatchObject({ ok: true });
    // 만드는 시간(D-541 1271 나, 배 종류마다 — D-547 1484): 바로 뜨지 않고 readyAtMs 뒤에 뜬다. 도크가 하나라 그사이 dock_busy
    expect(made[2]).toMatchObject({ t: "boat_result", ok: true });
    const readyAtMs = Number(field(made[2], "readyAtMs"));
    expect(readyAtMs, "만드는 중(readyAtMs)").toBeGreaterThan(0);
    expect(field(made[2], "boatId")).toBeUndefined();
    expect(made[3]).toMatchObject({ t: "boat_result", ok: false, code: "dock_busy", readyAtMs });
    let boatId = 0;
    await expect
      .poll(
        async () => {
          boatId = (await boatIds(page, mapKey)).find((boat) => !before.has(boat)) ?? 0;
          return boatId;
        },
        { timeout: 180_000, intervals: [1_000] },
      )
      .toBeGreaterThan(0);
    console.log(
      `[boats] boat ${String(boatId)} launched (build ${String(readyAtMs - Date.now())} ms left at check)`,
    );
    return { buildingId, boatId, site, nextId: id };
  }
  throw new Error("조선소를 지을 물가 자리가 없다");
}

for (const theme of ["pastel", "dark"] as const) {
  test.describe(`배 (${theme})`, () => {
    // admin 계정: dev 계정의 "내 유닛이 없는 2차맵" 시험(play-map.spec.ts)이 이 시험이 남긴 바닷가 유닛(시작 도시 옆)에 걸리지 않게
    test.use({ account: "admin", theme, language: "ko" });

    test(`운영자: 조선소 → 배 만들기 → 타기 → 물 위로 → 내리기 → 정박장·교역 부두 (${theme})`, async ({
      page,
      deviceErrors,
    }) => {
      test.setTimeout(600_000);
      await page.goto("/health");
      const rider = await humanAtCoast(page);
      const isWater = await waterOf(page, COAST_KEY);
      const sites = coastSites(isWater, { x: rider.x, y: rider.y });
      console.log(`[boats] coast map ${String(COAST_KEY)} dock sites ${String(sites.length)}`);
      expect(sites.length, "바닷가 2차맵에 부두 자리가 없다").toBeGreaterThan(0);
      const coast = { mapKey: COAST_KEY, isWater };
      const me = { mapKey: COAST_KEY, unitId: rider.unitId };
      const { buildingId, boatId, site, nextId } = await dockAndBoat(
        page,
        COAST_KEY,
        sites,
        theme === "pastel" ? 7100 : 7600,
      );
      // 타기: 멀면 배 옆까지 걸어간 뒤 탄다(운영자 빠르기)
      const board = await sendCommands(
        page,
        [
          { t: "subscribe", mapKey: me.mapKey, observe: true },
          { t: "boat_board", unitId: me.unitId, boatId },
        ],
        nextId,
      );
      expect(board[1]).toMatchObject({ t: "boat_result", ok: true });
      await expect
        .poll(async () => field(await myUnit(page, me.mapKey, me.unitId), "aboard"), { timeout: 90_000 })
        .toBe(boatId);
      // 물 위로: 승객에게 내린 이동이 배 이동이 된다(D-541 1279 나 — 같은 물에 닿는 물가 칸을 가까운 차례로 해 본다). 승객은 배를 따라간다
      let sailed: { x: number; y: number } | undefined;
      let requestId = nextId + 20;
      for (const target of shoreTargets(coast.isWater, site).slice(0, 12)) {
        const reply = await sendCommands(
          page,
          [
            { t: "subscribe", mapKey: me.mapKey, observe: true },
            {
              t: "move_unit",
              mapKey: me.mapKey,
              unitId: me.unitId,
              x: target.x * CELL_UNITS + CELL_UNITS,
              y: target.y * CELL_UNITS + CELL_UNITS,
            },
          ],
          requestId,
        );
        requestId += 5;
        if (field(reply[1], "ok") === true) {
          sailed = target;
          break;
        }
      }
      if (!sailed) throw new Error("배가 갈 물가 물 칸이 없다");
      await expect
        .poll(async () => field(await myUnit(page, me.mapKey, boatId), "moving"), { timeout: 60_000 })
        .toBe(false);
      expect(field(await myUnit(page, me.mapKey, me.unitId), "aboard")).toBe(boatId);
      const boatRow = await myUnit(page, me.mapKey, boatId);
      expect(field(boatRow, "kind")).toBe("boat");
      expect(field(field(boatRow, "boat"), "passengers")).toEqual([me.unitId]);

      // 지도: 배를 고르면 승객 수·[모두 내리기]
      await page.goto(
        `/map?key=${String(me.mapKey)}&at=${String(sailed.x)},${String(sailed.y)}&second-map-sky=off`,
      );
      const screen = page.locator(".map-screen");
      await expect(screen).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
      await expect(screen).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
      await pickMyUnit(page, String(boatId));
      await closeNearby(page);
      const actions = page.locator(".boat-actions");
      await expect(actions).toHaveAttribute("data-boat-choice", "boat", { timeout: 15_000 });
      await page.waitForTimeout(2_000);
      await shot(page, `boats-sail-390-${theme}`);
      // 조선소 판: 배를 하나 더 만들기 시작하면(운영자, 다른 탭에서 보내 지도 화면은 그대로) 작업 줄에 남은 시간이 보인다.
      // 운영자 만드는 시간은 몇 초라 판을 바로 다시 연다
      const side = await page.context().newPage();
      const again = await sendCommands(
        side,
        [
          { t: "subscribe", mapKey: me.mapKey, observe: true },
          { t: "boat_build", buildingId },
        ],
        requestId + 50,
      );
      await side.close();
      expect(again[1]).toMatchObject({ t: "boat_result", ok: true });
      const againReady = Number(field(again[1], "readyAtMs"));
      console.log(`[boats] second boat build ${String(againReady - Date.now())} ms left`);
      await openBuildingFromList(page, buildingId);
      const yard = page.locator(`.harbor-panel[data-harbor="shipyard"][data-dock="${String(buildingId)}"]`);
      await expect(yard).toBeVisible({ timeout: 15_000 });
      await expect(yard.locator('[data-boat-type="rowboat"]')).toBeVisible();
      if (againReady > Date.now() + 1_500)
        await expect(yard.locator(".boat-progress")).toBeVisible({ timeout: 3_000 });
      await page.locator(".gather-sheet-close").click();
      // 내리기(배를 다시 고르고 단추)
      await pickMyUnit(page, String(boatId));
      await closeNearby(page);
      await page.locator(".boat-leave").click();
      await expect(page.locator(".boat-notice")).toBeVisible({ timeout: 15_000 });
      await expect
        .poll(async () => field(await myUnit(page, me.mapKey, me.unitId), "aboard"), { timeout: 30_000 })
        .toBeNull();
      expect(deviceErrors).toEqual([]);

      // 정박장·교역 부두(D-547 1481·1487·1488·1489): 다른 물가 자리에 짓고, 배를 정박장에 넣는다(집 = 정박장, 배가 그리로 간다)
      // 명령은 다른 탭에서 보낸다(sendCommands가 그 탭을 /health로 옮긴다 — 지도 화면은 그대로)
      const used: Site[] = [site];
      const tab = await page.context().newPage();
      const berth = await harborAt(tab, me.mapKey, sites, used, "dock", requestId + 100);
      const trade = await harborAt(tab, me.mapKey, sites, used, "trade_dock", berth.nextId);
      const harborReplies = await sendCommands(
        tab,
        [
          { t: "subscribe", mapKey: me.mapKey, observe: true },
          { t: "boat_berth", boatId, buildingId: berth.buildingId },
          { t: "boat_repair", boatId, buildingId },
          { t: "boat_build", buildingId: berth.buildingId },
        ],
        trade.nextId,
      );
      expect(harborReplies[1]).toMatchObject({ t: "boat_result", ok: true });
      // 가득인 배는 고칠 것이 없다(1494), 정박장에서는 배를 만들지 않는다(1481)
      expect(harborReplies[2]).toMatchObject({ t: "boat_result", ok: false, code: "hull_full" });
      expect(harborReplies[3]).toMatchObject({ t: "boat_result", ok: false, code: "not_shipyard" });
      await expect
        .poll(async () => field(field(await myUnit(page, me.mapKey, boatId), "boat"), "homeId"), {
          timeout: 30_000,
        })
        .toBe(berth.buildingId);
      expect(Number(field(field(await myUnit(page, me.mapKey, boatId), "boat"), "hullPm"))).toBeGreaterThan(
        990,
      );
      await openBuildingFromList(page, berth.buildingId);
      const berthPanel = page.locator(
        `.harbor-panel[data-harbor="berth"][data-dock="${String(berth.buildingId)}"]`,
      );
      await expect(berthPanel).toBeVisible({ timeout: 15_000 });
      await expect(berthPanel.locator(".harbor-capacity")).toHaveAttribute("data-used", "1");
      await expect(berthPanel.locator(`.harbor-unberth`)).toBeVisible();
      await page.waitForTimeout(500);
      await shot(page, `boats-berth-390-${theme}`);
      await page.locator(".gather-sheet-close").click();
      // 교역 부두: 시간을 산다(운영자 = 요금 없음). 배가 그리로 간다
      const timeReply = await sendCommands(
        tab,
        [
          { t: "subscribe", mapKey: me.mapKey, observe: true },
          { t: "boat_dock_time", boatId, buildingId: trade.buildingId, hours: 1 },
          { t: "boat_dock_time", boatId, buildingId: berth.buildingId, hours: 1 },
        ],
        trade.nextId + 20,
      );
      expect(timeReply[1]).toMatchObject({ t: "boat_result", ok: true });
      expect(timeReply[2]).toMatchObject({ t: "boat_result", ok: false, code: "not_trade_dock" });
      await tab.close();
      await expect
        .poll(async () => field(await myUnit(page, me.mapKey, boatId), "moving"), { timeout: 60_000 })
        .toBe(false);
      expect(deviceErrors).toEqual([]);

      // 바다 건너기(D-541 1283 나): 다시 태우고 승객에게 동쪽 바다 2차맵으로 2차맵 사이 이동 → 배가 물 변을 지나 넘어가고 승객도 탄 채 넘는다
      const reboard = await sendCommands(
        page,
        [
          { t: "subscribe", mapKey: me.mapKey, observe: true },
          { t: "boat_board", unitId: me.unitId, boatId },
        ],
        trade.nextId + 40,
      );
      expect(reboard[1]).toMatchObject({ t: "boat_result", ok: true });
      await expect
        .poll(async () => field(await myUnit(page, me.mapKey, me.unitId), "aboard"), { timeout: 60_000 })
        .toBe(boatId);
      const cross = await sendCommands(
        page,
        [
          { t: "subscribe", mapKey: me.mapKey, observe: true },
          { t: "travel_start", unitId: me.unitId, mapKey: EAST_SEA_KEY, x: 60, y: 128, kind: "move" },
        ],
        trade.nextId + 50,
      );
      expect(cross[1], "승객 → 배의 바다 건너기").toMatchObject({ ok: true });
      await expect
        .poll(async () => field(await myUnit(page, EAST_SEA_KEY, boatId), "kind"), { timeout: 120_000 })
        .toBe("boat");
      await expect
        .poll(async () => field(await myUnit(page, EAST_SEA_KEY, me.unitId), "aboard"), { timeout: 30_000 })
        .toBe(boatId);

      // 배에서 캐기(D-541 1280 가): 배가 멈춘 뒤 가장 가까운 어군을 승객에게 시킨다
      await expect
        .poll(async () => field(await myUnit(page, EAST_SEA_KEY, boatId), "moving"), { timeout: 120_000 })
        .toBe(false);
      const boatAt = await myUnit(page, EAST_SEA_KEY, boatId);
      const objects = await trpcQuery(page, "gather.objects", { mapKey: EAST_SEA_KEY });
      const schools = field(objects, "schools");
      const flat = field(objects, "objects");
      const usesLeft = new Map<number, number>();
      if (Array.isArray(flat))
        for (let i = 0; i + 3 < flat.length; i += 4) usesLeft.set(Number(flat[i]), Number(flat[i + 2]));
      const school = (Array.isArray(schools) ? schools : [])
        .map((entry: unknown) => {
          const points = field(entry, "points");
          const x = Array.isArray(points) ? Number(points[0]) : 0;
          const y = Array.isArray(points) ? Number(points[1]) : 0;
          const d = Math.hypot(x - Number(field(boatAt, "cellX")), y - Number(field(boatAt, "cellY")));
          return { id: Number(field(entry, "id")), d };
        })
        // 앞 테마 시험이 다 낚은 어군(남은 번수 0)은 빼고 고른다(objects = [ID, 종류, 남은 번수, 다시 자람]…)
        .filter((entry) => usesLeft.get(entry.id) !== 0)
        .toSorted((a, b) => a.d - b.d)[0];
      expect(school, "동쪽 바다 2차맵에 어군이 없다").toBeDefined();
      console.log(
        `[boats] gather school ${String(school?.id)} at ${String(Math.round(school?.d ?? 0))} cells`,
      );
      const gather = await sendCommands(
        page,
        [
          { t: "subscribe", mapKey: EAST_SEA_KEY, observe: true },
          { t: "gather_start", unitId: me.unitId, mapKey: EAST_SEA_KEY, objectId: school?.id ?? 0 },
        ],
        trade.nextId + 60,
      );
      expect(gather[1], "승객의 배에서 캐기").toMatchObject({ t: "gather_result", ok: true });
      const loopOf = async (): Promise<unknown> => {
        const loops = field(await trpcQuery(page, "gather.loops", undefined), "loops");
        return Array.isArray(loops)
          ? loops.find((loop: unknown) => field(loop, "unitId") === me.unitId)
          : undefined;
      };
      await expect
        .poll(async () => Number(field(await loopOf(), "gatheredLots") ?? 0), {
          timeout: 240_000,
          intervals: [2_000],
        })
        .toBeGreaterThan(0);
      expect(field(await myUnit(page, EAST_SEA_KEY, me.unitId), "aboard")).toBe(boatId);
    });
  });
}
