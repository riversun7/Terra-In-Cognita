// 이웃 2차맵 안개·로딩 없는 2차맵 이동 화면 시험(docs/adr/2026-11-08-seamless-second-map.md WP-3, 사용자 지적 2026-11-08 "인접한 맵은 포그가 적용되지
// 않는 문제", "로딩없이 2차맵 이동") — player.
// 실제로 걸어서 변을 넘는 데 몇 분 걸려(map-travel.spec.ts 머리 주석) 시험은 연결을 가운데서 고쳐 흉내 낸다:
// - 서버 → 기기: 내 사이보그(own) 경로를 2차맵 동쪽 변 가까이(배치 칸 250, 가운데 줄)에 선 것으로 바꾼다 → 카메라가 따라가 동쪽 이웃이 카메라 쪽이 된다.
// - 기기가 그 이웃을 받아 그리고(data-neighbours) 같은 연결로 구독한다(이웃 안개) → 서버가 그 2차맵 vision을 보낸다. 사진(390 파스텔·다크).
// - 기기에 그 이웃 2차맵의 가짜 경로(내 사이보그)를 넣으면 기기가 넘는다: 주소 key·data-map-key가 이웃, data-switched="in-place", 지도 캔버스가
//   같은 요소(화면을 다시 만들지 않음), 카메라 목표가 한 2차맵만큼 옮겨진 틀, "받는 중" 안내 없음 → 새 2차맵 자료 구독이 live.
//   서버에서는 사이보그가 넘지 않았으므로 내 유닛 목록은 넘기 전 목록을 그대로 돌려준다(들어갈 수 없음 안내가 뜨지 않게).
import type { Page } from "@playwright/test";
import { horizontalOverflow, shot } from "./helpers/screen.ts";
import { type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";

/** 위치 단위/배치 칸(@terra/protocol POSITION_UNITS_PER_CELL) */
const UNITS_PER_CELL = 1024;
/** 내 사이보그를 세울 자리(배치 칸): 동쪽 변 가까이, 가운데 줄 */
const EDGE_X = 250;
const EDGE_Y = 128;

interface Rig {
  /** 기기가 구독한 2차맵 키(차례대로) */
  readonly subscribed: number[];
  /** 기기가 받은 vision의 2차맵 키 */
  readonly visions: number[];
  /** 기기에 서버 메시지를 넣는다 */
  inject(message: object): void;
}

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;

/** 내 사이보그 경로를 변 가까이 선 것으로 바꾸고, 구독·vision을 적는 연결 */
async function rigSocket(page: Page): Promise<Rig> {
  const subscribed: number[] = [];
  const visions: number[] = [];
  let toPage: ((text: string) => void) | null = null;
  await page.routeWebSocket(/\/ws$/, (socket) => {
    const server = socket.connectToServer();
    toPage = (text) => socket.send(text);
    socket.onMessage((data) => {
      if (typeof data === "string" && data.includes('"t":"subscribe"')) {
        const parsed: unknown = JSON.parse(data);
        subscribed.push(Number(field(parsed, "mapKey")));
      }
      server.send(data);
    });
    server.onMessage((data) => {
      if (typeof data !== "string") {
        socket.send(data);
        return;
      }
      const parsed: unknown = JSON.parse(data);
      const kind = field(parsed, "t");
      if (kind === "vision") visions.push(Number(field(parsed, "mapKey")));
      const units = field(parsed, "units");
      if ((kind === "map_snapshot" || kind === "unit_paths") && Array.isArray(units)) {
        for (const unit of units) {
          if (field(unit, "own") === true)
            Reflect.set(unit, "path", [EDGE_X * UNITS_PER_CELL + 512, EDGE_Y * UNITS_PER_CELL + 512]);
        }
        socket.send(JSON.stringify(parsed));
        return;
      }
      socket.send(data);
    });
  });
  return {
    subscribed,
    visions,
    inject: (message) => toPage?.(JSON.stringify(message)),
  };
}

/** 내 유닛 목록: 처음 받은 목록을 기억하고, 넘은 뒤 빈 목록이면 그것으로(서버에서는 사이보그가 넘지 않았다) */
async function keepMyUnits(page: Page): Promise<void> {
  let remembered: unknown[] | null = null;
  await rewriteTrpc(page, {
    "summary.get": hideSummary,
    "world.mapUnits": (data) => {
      const units = field(data, "units");
      if (!Array.isArray(units) || typeof data !== "object" || data === null) return;
      if (units.length > 0) remembered ??= units;
      else if (remembered) Reflect.set(data, "units", remembered);
    },
  });
}

/** 2차맵을 열고 카메라가 변 가까이 선 내 사이보그를 따라가 동쪽 이웃을 받아 구독할 때까지. 동쪽 이웃 키 */
async function openAtEdge(page: Page, rig: Rig): Promise<{ main: number; east: number }> {
  await page.goto("/map");
  const map = page.locator(".map-screen[data-map-key]");
  await expect(map).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
  await expect(map).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
  const main = Number(await map.getAttribute("data-map-key"));
  await expect(map).toHaveAttribute("data-follow", "on", { timeout: 15_000 });
  await expect
    .poll(async () => Number(await map.getAttribute("data-neighbours")), { timeout: 30_000 })
    .toBeGreaterThan(0);
  await expect
    .poll(() => rig.subscribed.find((key) => key !== main) ?? null, { timeout: 30_000 })
    .not.toBeNull();
  const east = rig.subscribed.find((key) => key !== main) ?? 0;
  // 이웃 안개: 그 2차맵 vision을 받는다(볼 수 없는 이웃이면 거절 — 온통 어둡게)
  await expect.poll(() => rig.visions.includes(east), { timeout: 15_000 }).toBe(true);
  return { main, east };
}

test.describe("이웃 안개·로딩 없는 2차맵 이동", () => {
  test.use({ account: "player" });

  test("변 가까이: 이웃을 구독해 안개를 받고, 기준 유닛이 이웃에 나타나면 화면을 다시 만들지 않고 넘는다", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(180_000);
    const rig = await rigSocket(page);
    await keepMyUnits(page);
    const { main, east } = await openAtEdge(page, rig);
    const map = page.locator(".map-screen[data-map-key]");
    const cyborg = Number(await map.getAttribute("data-cyborg"));
    expect(cyborg).toBeGreaterThan(0);
    // 넘기 전: 캔버스에 표지를 달고 카메라 목표를 잰다
    await page
      .locator(".map-view canvas")
      .evaluate((element) => element.setAttribute("data-e2e-mark", "kept"));
    await page.waitForTimeout(1_200);
    const [bx = 0, bz = 0] = ((await map.getAttribute("data-camera")) ?? "").split(",").map(Number);

    // 넘기: 그 이웃 2차맵 경로에 내 사이보그가 나타난다
    rig.inject({
      t: "unit_paths",
      mapKey: east,
      fromRev: 1,
      rev: 2,
      units: [
        {
          id: cyborg,
          size: 1,
          speed: 437,
          departAtMs: Date.now(),
          path: [2 * UNITS_PER_CELL, EDGE_Y * UNITS_PER_CELL],
        },
      ],
    });
    await expect(map).toHaveAttribute("data-map-key", String(east), { timeout: 5_000 });
    await expect(map).toHaveAttribute("data-switched", "in-place");
    await expect(page).toHaveURL(
      (url) => url.pathname === "/map" && url.searchParams.get("key") === String(east),
    );
    // 화면을 다시 만들지 않았다: 같은 캔버스 요소, "받는 중" 안내 없음
    await expect(page.locator('.map-view canvas[data-e2e-mark="kept"]')).toHaveCount(1);
    await expect(page.locator(".map-notice")).toHaveCount(0);
    // 카메라는 새 2차맵 틀로 옮겨졌다(같은 땅 — 목표점이 한 2차맵 한 변만큼 다른 좌표)
    await page.waitForTimeout(1_200);
    const [ax = 0, az = 0] = ((await map.getAttribute("data-camera")) ?? "").split(",").map(Number);
    expect(Math.hypot(ax - bx, az - bz)).toBeGreaterThan(1_000);
    // 새 2차맵 자료 구독(실제 서버)
    await expect(map).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
    expect(rig.subscribed.filter((key) => key === east).length).toBeGreaterThanOrEqual(2);
    expect(main).not.toBe(east);
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("이웃 안개 사진", () => {
  test.use({ account: "player" });
  for (const theme of ["pastel", "dark"] as const satisfies readonly Theme[]) {
    test.describe(`390 ${theme}`, () => {
      test.use({ theme });
      test(`변 가까이 이웃 안개 (390·${theme})`, async ({ page, deviceErrors }) => {
        test.setTimeout(150_000);
        const rig = await rigSocket(page);
        await keepMyUnits(page);
        await openAtEdge(page, rig);
        // 멀리 보아 경계 양쪽이 보이게(가운데 = 내 사이보그)
        const box = await page.locator(".map-view canvas").boundingBox();
        if (!box) throw new Error("no canvas");
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        for (let k = 0; k < 4; k++) {
          await page.mouse.wheel(0, 400);
          await page.waitForTimeout(150);
        }
        await page.waitForTimeout(1_500);
        await shot(page, `seamless-neighbour-fog-390-${theme}`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
