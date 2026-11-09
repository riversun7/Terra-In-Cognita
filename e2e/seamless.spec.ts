// 이웃 2차맵 안개·로딩 없는 2차맵 이동 화면 시험(docs/adr/2026-11-08-seamless-second-map.md WP-3, 사용자 지적 2026-11-08 "인접한 맵은 포그가 적용되지
// 않는 문제", "로딩없이 2차맵 이동") — player.
// 실제로 걸어서 변을 넘는 데 몇 분 걸려(map-travel.spec.ts 머리 주석) 시험은 연결을 가운데서 고쳐 흉내 낸다:
// - 서버 → 기기: 내 사이보그(own) 경로를 2차맵 한 변 가까이(가운데 줄)에 선 것으로 바꾼다 → 카메라가 따라가 그쪽 이웃이 카메라 쪽이 된다.
// - 기기가 그 이웃을 받아 그리고(data-neighbours) 같은 연결로 구독한다(이웃 안개). 볼 수 있는 이웃(같은 나라 시작 도시 등)이면 서버가 vision을 보내고,
//   볼 수 없으면 구독이 거절된다(온통 어둡게). 시험은 vision이 오는 변을 찾을 때까지 변을 바꿔 다시 연다. 사진(390 파스텔·다크).
// - 기기에 그 이웃 2차맵의 가짜 경로(내 사이보그)를 넣으면 기기가 넘는다: 주소 key·data-map-key가 이웃, data-switched="in-place", 지도 캔버스가
//   같은 요소(화면을 다시 만들지 않음), 카메라 목표가 한 2차맵만큼 옮겨진 틀, "받는 중" 안내 없음 → 새 2차맵 자료 구독이 live.
//   서버에서는 사이보그가 넘지 않았으므로 내 유닛 목록은 넘기 전 목록을 그대로 돌려준다(들어갈 수 없음 안내가 뜨지 않게).
import type { Page } from "@playwright/test";
import { horizontalOverflow, shot } from "./helpers/screen.ts";
import { type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";

/** 위치 단위/배치 칸(@terra/protocol POSITION_UNITS_PER_CELL) */
const UNITS_PER_CELL = 1024;
/** 내 사이보그를 세울 자리(배치 칸): 변 넷의 가까이, 가운데 줄 — 볼 수 있는 이웃이 나올 때까지 차례로 */
const EDGES: readonly { readonly x: number; readonly y: number }[] = [
  { x: 250, y: 128 },
  { x: 5, y: 128 },
  { x: 128, y: 5 },
  { x: 128, y: 250 },
];

interface Rig {
  /** 내 사이보그를 세울 자리(바꾸면 다음 스냅샷·경로부터) */
  edge: { readonly x: number; readonly y: number };
  /** 기기가 구독한 2차맵 키(차례대로) */
  readonly subscribed: number[];
  /** 구독이 거절된 2차맵 키 */
  readonly refused: number[];
  /** 기기가 받은 vision의 2차맵 키 */
  readonly visions: number[];
  /** 기기가 보낸 2차맵 사이 이동(travel_start)의 옆 2차맵 키 */
  readonly travels: number[];
  /** 2차맵마다 마지막 스냅샷의 유닛 ID */
  readonly snapshotUnits: Map<number, Set<number>>;
  /** 기기에 서버 메시지를 넣는다 */
  inject(message: object): void;
}

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;

/** 내 사이보그 경로를 변 가까이 선 것으로 바꾸고, 구독·거절·vision을 적는 연결 */
async function rigSocket(page: Page): Promise<Rig> {
  const subscribeIds = new Map<number, number>();
  let toPage: ((text: string) => void) | null = null;
  const rig: Rig = {
    edge: EDGES[0] ?? { x: 250, y: 128 },
    subscribed: [],
    refused: [],
    visions: [],
    travels: [],
    snapshotUnits: new Map(),
    inject: (message) => toPage?.(JSON.stringify(message)),
  };
  await page.routeWebSocket(/\/ws$/, (socket) => {
    const server = socket.connectToServer();
    toPage = (text) => socket.send(text);
    socket.onMessage((data) => {
      if (typeof data === "string" && data.includes('"t":"subscribe"')) {
        const parsed: unknown = JSON.parse(data);
        const key = Number(field(parsed, "mapKey"));
        rig.subscribed.push(key);
        subscribeIds.set(Number(field(parsed, "id")), key);
      }
      if (typeof data === "string" && data.includes('"t":"travel_start"')) {
        const parsed: unknown = JSON.parse(data);
        rig.travels.push(Number(field(parsed, "mapKey")));
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
      if (kind === "vision") rig.visions.push(Number(field(parsed, "mapKey")));
      if (kind === "result" && field(parsed, "ok") === false) {
        const key = subscribeIds.get(Number(field(parsed, "id")));
        if (key !== undefined) rig.refused.push(key);
      }
      const units = field(parsed, "units");
      if (kind === "map_snapshot" && Array.isArray(units)) {
        const key = Number(field(parsed, "mapKey"));
        const set =
          field(parsed, "part") === 0 ? new Set<number>() : (rig.snapshotUnits.get(key) ?? new Set<number>());
        for (const unit of units) set.add(Number(field(unit, "id")));
        rig.snapshotUnits.set(key, set);
      }
      if ((kind === "map_snapshot" || kind === "unit_paths") && Array.isArray(units)) {
        for (const unit of units) {
          if (field(unit, "own") === true)
            Reflect.set(unit, "path", [rig.edge.x * UNITS_PER_CELL + 512, rig.edge.y * UNITS_PER_CELL + 512]);
        }
        socket.send(JSON.stringify(parsed));
        return;
      }
      socket.send(data);
    });
  });
  return rig;
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

/**
 * 2차맵을 열고 카메라가 변 가까이 선 내 사이보그를 따라가 그쪽 이웃을 받아 구독할 때까지. 볼 수 있는 이웃(vision이 온다)이 나올 때까지 변을 바꿔
 * 다시 연다. 지금 2차맵과 그 이웃 키
 */
async function openAtEdge(page: Page, rig: Rig): Promise<{ main: number; near: number }> {
  const map = page.locator(".map-screen[data-map-key]");
  for (const edge of EDGES) {
    rig.edge = edge;
    rig.subscribed.length = 0;
    await page.goto("/map");
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
    const near = rig.subscribed.find((key) => key !== main) ?? 0;
    // 이웃 안개: 그 2차맵 vision을 받거나(볼 수 있음) 구독이 거절된다(볼 수 없음 — 온통 어둡게)
    await expect
      .poll(() => rig.visions.includes(near) || rig.refused.includes(near), { timeout: 20_000 })
      .toBe(true);
    if (rig.visions.includes(near)) return { main, near };
  }
  throw new Error("볼 수 있는 이웃 2차맵이 없습니다");
}

test.describe("이웃 안개·로딩 없는 2차맵 이동", () => {
  test.use({ account: "player" });

  test("변 가까이: 이웃을 구독해 안개를 받고, 기준 유닛이 이웃에 나타나면 화면을 다시 만들지 않고 넘는다", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(360_000);
    const rig = await rigSocket(page);
    await keepMyUnits(page);
    const { main, near: east } = await openAtEdge(page, rig);
    const map = page.locator(".map-screen[data-map-key]");
    const cyborg = Number(await map.getAttribute("data-cyborg"));
    expect(cyborg).toBeGreaterThan(0);
    // 옆 2차맵 유닛도 그린다: 엔진 유닛 수 = 지금 2차맵 스냅샷 유닛 + 옆 2차맵 스냅샷 유닛(겹치지 않는 것)
    const mainUnits = rig.snapshotUnits.get(main) ?? new Set<number>();
    const nearUnits = [...(rig.snapshotUnits.get(east) ?? new Set<number>())].filter(
      (id) => !mainUnits.has(id),
    );
    if (nearUnits.length > 0)
      await expect
        .poll(async () => Number(await map.getAttribute("data-units")), { timeout: 10_000 })
        .toBeGreaterThan(mainUnits.size);
    // 넘기 전: 캔버스에 표지를 달고 카메라 목표를 잰다
    await page
      .locator(".map-view canvas")
      .evaluate((element) => element.setAttribute("data-e2e-mark", "kept"));
    await page.waitForTimeout(1_200);
    const [bx = 0, bz = 0] = ((await map.getAttribute("data-camera")) ?? "").split(",").map(Number);
    // 한 단계 줄여 둔다: 넘으면 다시 최대 확대(사용자 지적 2026-11-09 "진입시 항상 최대 확대")
    const ladder = page.locator(".zoom-ladder");
    await expect(ladder).toHaveAttribute("data-stage", "5");
    await ladder.locator(".zoom-ladder-out").click();
    await expect(ladder).toHaveAttribute("data-stage", "4");

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
          path: [128 * UNITS_PER_CELL, 128 * UNITS_PER_CELL],
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
    await expect(ladder).toHaveAttribute("data-stage", "5");
    // 카메라는 새 2차맵 틀로 옮겨졌다: 같은 땅을 보므로 목표점 좌표가 크게 바뀐다(면 경계 너머 돌아간 이웃이면 차이는 한 변과 다르다).
    // 넘은 뒤 자리는 보지 않는다: 시험은 내 유닛 목록을 옛 2차맵 목록(옛 좌표)으로 돌려줘 카메라 묶기 범위가 그 좌표로 걸린다
    await page.waitForTimeout(1_200);
    const [ax = 0, az = 0] = ((await map.getAttribute("data-camera")) ?? "").split(",").map(Number);
    expect(Math.hypot(ax - bx, az - bz)).toBeGreaterThan(300);
    // 새 2차맵 자료 구독(실제 서버)
    await expect(map).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
    expect(rig.subscribed.filter((key) => key === east).length).toBeGreaterThanOrEqual(2);
    expect(main).not.toBe(east);
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("옆 2차맵 땅 누르기", () => {
  test.use({ account: "player" });

  test("그려 둔 옆 2차맵 땅을 누르면 고른 내 유닛을 그 2차맵으로 보낸다(travel_start)", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(360_000);
    const rig = await rigSocket(page);
    await keepMyUnits(page);
    const { near } = await openAtEdge(page, rig);
    // 멀리 보아 옆 2차맵이 화면에 넓게 들게 한 뒤, 가운데(내 사이보그) 둘레를 바깥부터 눌러 본다 — 옆 땅을 누를 때까지
    const box = await page.locator(".map-view canvas").boundingBox();
    if (!box) throw new Error("no canvas");
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    for (let k = 0; k < 3; k++) {
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(800);
    for (const radius of [150, 110]) {
      for (let step = 0; step < 12 && rig.travels.length === 0; step++) {
        const angle = (step * Math.PI) / 6;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        const onCanvas = await page.evaluate(
          (point) => document.elementFromPoint(point.x, point.y) instanceof HTMLCanvasElement,
          { x, y },
        );
        if (!onCanvas) continue;
        await page.mouse.click(x, y);
        await page.waitForTimeout(400);
        const close = page.locator(".gather-sheet-close");
        if (await close.count()) await close.first().click();
      }
    }
    expect(rig.travels).toContain(near);
    await expect(page.locator(".map-screen")).toHaveAttribute("data-command", /^(sent|travel_ok|[a-z_]+)$/);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("이웃 안개 사진", () => {
  test.use({ account: "player" });
  for (const theme of ["pastel", "dark"] as const satisfies readonly Theme[]) {
    test.describe(`390 ${theme}`, () => {
      test.use({ theme });
      test(`변 가까이 이웃 안개 (390·${theme})`, async ({ page, deviceErrors }) => {
        test.setTimeout(360_000);
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
