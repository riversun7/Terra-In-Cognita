// 배 B1 화면 시험 — 기획 D-540(1221 "지도 위 배부터"), docs/adr/2026-11-13-boats.md.
// 운영자(dev, 전체 보기로 구독한 연결 = 운영자 모드) 흐름: 띄운 도시 2차맵 가운데 곧은 물가가 있는 곳을 물 표(facilities.waterMask)로 찾아
// (시험 행성은 대부분 마른 땅이다 — 내 사이보그 2차맵에는 물이 없을 수 있다) 그 도시에서 휴먼을 고용하고(ensureHuman), 부두를 짓고
// (개발 재료 받기 → facility_build → dev_facility_finish), 부두에서 배를 만들고(boat_build), 휴먼을 태워(boat_board — 멀면 걸어가서),
// 배를 물 위로 보내고(move_unit — 서버가 물 길로 푼다), 지도 화면에서 배를 골라 [모두 내리기]로 물가에 내린다. 테마 둘(파스텔·다크) 390px 사진.
// 걷는 유닛이 물로 못 가는 것·배가 땅으로 못 가는 것은 단위 시험(apps/server/src/boats/service.test.ts)이 본다.
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
  /** 배를 보낼 물 기준 배치 칸(물가에서 2칸) */
  readonly sailX: number;
  readonly sailY: number;
}

/**
 * 곧은 물가 후보(가까운 차례): 지형 칸 (tx, ty)에서 물 쪽 방향 d로 깊이 1~3은 물, 깊이 −1~0은 땅이 물가를 따라 6칸(−2~3) 이어진다.
 * 부두(3×3)는 땅 쪽 깊이 −1~0, 물가 따라 0~1 지형 칸 안에서 물에 붙게 놓는다
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
        for (let along = -2; along <= 3 && ok; along++)
          for (let depth = -1; depth <= 3 && ok; depth++) {
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
        const [sx, sy] = at(2, 2);
        out.push({
          dockX,
          dockY,
          sailX: sx * 2,
          sailY: sy * 2,
          d: Math.hypot(dockX - near.x, dockY - near.y),
        });
      }
  return out.toSorted((a, b) => a.d - b.d);
}

/** 그 2차맵 내 유닛 목록 한 줄 */
async function myUnit(page: Page, mapKey: number, unitId: number): Promise<unknown> {
  const data = await trpcQuery(page, "world.mapUnits", { mapKey });
  const units = field(data, "units");
  return Array.isArray(units) ? units.find((unit: unknown) => field(unit, "unitId") === unitId) : undefined;
}

/** 띄운 도시 2차맵 가운데 곧은 물가가 있는 첫 곳(도시 시청에서 가까운 물가 차례) */
async function coastalCity(page: Page): Promise<{ mapKey: number; sites: Site[] }> {
  const data = await trpcQuery(page, "world.cities", undefined);
  const cities = field(data, "cities");
  const seen = new Set<number>();
  for (const city of Array.isArray(cities) ? (cities as unknown[]) : []) {
    const mapKey = Number(field(city, "mapKey"));
    if (field(city, "loaded") !== true || seen.has(mapKey)) continue;
    seen.add(mapKey);
    const sites = coastSites(await waterOf(page, mapKey), {
      x: Number(field(city, "cellX")),
      y: Number(field(city, "cellY")),
    });
    if (sites.length > 0) return { mapKey, sites };
  }
  throw new Error("곧은 물가가 있는 도시 2차맵이 없다");
}

/** 부두를 짓고 배를 만든다(운영자 모드 연결). 부두·배 ID와 자리 */
async function dockAndBoat(page: Page, mapKey: number, sites: readonly Site[], firstId: number) {
  let id = firstId;
  for (const site of sites.slice(0, 12)) {
    const replies = await sendCommands(
      page,
      [
        { t: "subscribe", mapKey, observe: true },
        { t: "dev_facility_grant", item: "pine_log", qty: 200, mapKey, x: site.dockX, y: site.dockY },
        { t: "dev_facility_grant", item: "stone", qty: 60, mapKey, x: site.dockX, y: site.dockY },
        { t: "facility_build", mapKey, facility: "dock", x: site.dockX, y: site.dockY, rotation: 0 },
      ],
      id,
    );
    id += 10;
    const buildingId = field(replies[3], "buildingId");
    if (field(replies[3], "ok") !== true || typeof buildingId !== "number") continue;
    const made = await sendCommands(
      page,
      [
        { t: "subscribe", mapKey, observe: true },
        { t: "dev_facility_finish", buildingId },
        { t: "boat_build", buildingId },
      ],
      id,
    );
    id += 10;
    expect(made[1]).toMatchObject({ ok: true });
    expect(made[2]).toMatchObject({ t: "boat_result", ok: true });
    return { buildingId, boatId: Number(field(made[2], "boatId")), site, nextId: id };
  }
  throw new Error("부두를 지을 물가 자리가 없다");
}

for (const theme of ["pastel", "dark"] as const) {
  test.describe(`배 (${theme})`, () => {
    test.use({ account: "dev", theme, language: "ko" });

    test(`운영자: 부두 → 배 만들기 → 타기 → 물 위로 → 내리기 (${theme})`, async ({ page, deviceErrors }) => {
      test.setTimeout(300_000);
      await page.goto("/health");
      const coast = await coastalCity(page);
      const riderId = await ensureHuman(page, "e2e_dev", coast.mapKey);
      const me = { mapKey: coast.mapKey, unitId: riderId };
      const { buildingId, boatId, site, nextId } = await dockAndBoat(
        page,
        coast.mapKey,
        coast.sites,
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
      // 물 위로: 배는 물 길로 간다. 사이보그는 배를 따라간다(따로 움직이면 aboard)
      const sail = await sendCommands(
        page,
        [
          { t: "subscribe", mapKey: me.mapKey, observe: true },
          {
            t: "move_unit",
            mapKey: me.mapKey,
            unitId: boatId,
            x: site.sailX * CELL_UNITS + CELL_UNITS,
            y: site.sailY * CELL_UNITS + CELL_UNITS,
          },
          { t: "move_unit", mapKey: me.mapKey, unitId: me.unitId, x: 10 * CELL_UNITS, y: 10 * CELL_UNITS },
        ],
        nextId + 5,
      );
      expect(sail[1]).toMatchObject({ ok: true });
      expect(sail[2]).toMatchObject({ ok: false, code: "aboard" });
      await expect
        .poll(async () => field(await myUnit(page, me.mapKey, boatId), "moving"), { timeout: 60_000 })
        .toBe(false);
      const boatRow = await myUnit(page, me.mapKey, boatId);
      expect(field(boatRow, "kind")).toBe("boat");
      expect(field(field(boatRow, "boat"), "passengers")).toEqual([me.unitId]);

      // 지도: 배를 고르면 승객 수·[모두 내리기]
      await page.goto(
        `/map?key=${String(me.mapKey)}&at=${String(site.sailX)},${String(site.sailY)}&second-map-sky=off`,
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
      // 부두 판: [배 만들기]
      await openBuildingFromList(page, buildingId);
      const dock = page.locator(`.boat-dock[data-dock="${String(buildingId)}"]`);
      await expect(dock).toBeVisible({ timeout: 15_000 });
      await shot(page, `boats-dock-390-${theme}`);
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
    });
  });
}
