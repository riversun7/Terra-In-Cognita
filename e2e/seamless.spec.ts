// 이웃 2차맵 안개·로딩 없는 2차맵 이동 화면 시험(docs/adr/2026-11-08-seamless-second-map.md WP-3, 사용자 지적 2026-11-08 "인접한 맵은 포그가 적용되지
// 않는 문제", "로딩없이 2차맵 이동") — player.
// 실제로 걸어서 변을 넘는 데 몇 분 걸려 시험은 연결을 가운데서 고쳐 흉내 낸다:
// - 서버 → 기기: 내 사이보그(own) 경로를 2차맵 한 변 가까이(가운데 줄)에 선 것으로 바꾼다 → 카메라가 따라가 그쪽 이웃이 카메라 쪽이 된다.
// - 기기가 그 이웃을 받아 그리고(data-neighbours) 같은 연결로 구독한다(이웃 안개). 볼 수 있는 이웃이면 서버가 vision을 보내고,
//   볼 수 없으면 구독이 거절된다(온통 어둡게). 시험은 바라는 답(vision 또는 거절)이 오는 변을 찾을 때까지 변을 바꿔 다시 연다.
// - 도시 간격(ADR world-layout "바뀜 (2026-11-11, 도시 배후지 간격)") 뒤로 시작 도시 옆 2차맵은 띄우지 않은 2차맵이다(같은 나라 도시가 붙어 있지
//   않다) → 이웃 구독은 unknown_map으로 거절되고 온통 어둡게 그린다. 맞는 규칙이다(ADR seamless-second-map "띄우지 않은 이웃(unknown_map)은 온통
//   어둡게"). 그래서 거절 = 온통 어둡게는 player 사진 시험이 본다(390 파스텔·다크).
// - 넘기·옆 땅 누르기는 볼 수 있는 이웃이 있어야 하는 그리기·넘기 시험이라 dev(운영자 모드 끔 — 이웃을 보통 구독으로 받는다, 전체 보기 권한이라
//   not_visible은 없다)로 본다: 먼저 운영자 빠르기로 내 사이보그를 동쪽 이웃에 보냈다 돌아와 그 2차맵을 띄워 둔다(그때 띄우기, 비면 10분 뒤 내림).
// - 기기에 그 이웃 2차맵의 가짜 경로(내 사이보그)를 넣으면 기기가 넘는다: 주소 key·data-map-key가 이웃, data-switched="in-place", 지도 캔버스가
//   같은 요소(화면을 다시 만들지 않음), 카메라 목표가 한 2차맵만큼 옮겨진 틀, "받는 중" 안내 없음, 확대 단계 그대로, 그 2차맵을 다시 구독하지 않음.
//   서버에서는 사이보그가 넘지 않았으므로 내 유닛 목록은 넘기 전 목록을 그대로 돌려준다(들어갈 수 없음 안내가 뜨지 않게).
// 걸어서 넘기(사용자 지적 2026-11-11 "미세한 화면전환의 흔적", "다음 맵으로 이동시 확대배율이 유지되게" — ADR "바뀜 (2026-11-11)") — dev.
// - 진짜로 넘는다: 운영자 빠르기로 내 사이보그를 변 앞에 세운 뒤 걷는 빠르기로 옆 2차맵에 보내고, 프레임 기록(?map-probe=1, mapProbe.ts)으로
//   넘는 앞뒤를 본다: 확대 단계 그대로, 안내 판 없음, 기준 유닛이 프레임마다 있고 화면 자리가 튀지 않음, 유닛 수가 0이 되지 않음.
//   E2E_MEASURE=1이면 가장 긴 프레임도 적는다(헤드리스 SwiftShader 값 — 휴대폰 값이 아니다). 끝나면 운영자 빠르기로 제자리에 돌려놓는다.
// - 운영자 모드 100배로 옆 2차맵 ↔ 처음 2차맵을 세 번 잇달아 넘는다: 확대 그대로·안내 없음·유닛이 비지 않음, 구독·지형 받기가 쌓이지 않는다.
import type { Page } from "@playwright/test";
import type { MapProbeSample } from "../apps/game/src/map/mapProbe.ts";
import { isCellKey, stepCell } from "../packages/planet/src/index.ts";
import { horizontalOverflow, shot } from "./helpers/screen.ts";
import { type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { sendCommands } from "./helpers/wsCommands.ts";

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
  /** false면 내 사이보그 경로를 고치지 않는다(진짜로 걷는 시험) */
  rewrite: boolean;
  /** 구독이 거절된 차례(2차맵 키·결과 코드) — 한 번이라도 거절됐는지 본다 */
  readonly refusals: { readonly mapKey: number; readonly code: string }[];
  /** 기기가 구독한 2차맵 키(차례대로) */
  readonly subscribed: number[];
  /** 구독이 거절된 2차맵 키 */
  readonly refused: number[];
  /** 거절된 2차맵 키 → 결과 코드(not_visible·unknown_map 등, 실패 안내용) */
  readonly refusedCodes: Map<number, string>;
  /** 기기가 받은 vision의 2차맵 키 */
  readonly visions: number[];
  /** 기기가 보낸 2차맵 사이 이동(travel_start)의 옆 2차맵 키 */
  readonly travels: number[];
  /** 2차맵마다 마지막 스냅샷의 유닛 ID */
  readonly snapshotUnits: Map<number, Set<number>>;
  /** 2차맵마다 서버가 마지막으로 보낸 rev(가짜 경로를 넣을 때 이어 붙인다) */
  readonly revs: Map<number, number>;
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
    rewrite: true,
    refusals: [],
    subscribed: [],
    refused: [],
    refusedCodes: new Map(),
    visions: [],
    travels: [],
    snapshotUnits: new Map(),
    revs: new Map(),
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
        if (key !== undefined) {
          rig.refused.push(key);
          rig.refusedCodes.set(key, String(field(parsed, "code")));
          rig.refusals.push({ mapKey: key, code: String(field(parsed, "code")) });
        }
      }
      const units = field(parsed, "units");
      if (kind === "map_snapshot" && Array.isArray(units)) {
        const key = Number(field(parsed, "mapKey"));
        const set =
          field(parsed, "part") === 0 ? new Set<number>() : (rig.snapshotUnits.get(key) ?? new Set<number>());
        for (const unit of units) set.add(Number(field(unit, "id")));
        rig.snapshotUnits.set(key, set);
      }
      if ((kind === "map_snapshot" || kind === "unit_paths") && Array.isArray(units) && rig.rewrite) {
        const rev = Number(field(parsed, "rev"));
        if (Number.isFinite(rev)) rig.revs.set(Number(field(parsed, "mapKey")), rev);
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
 * 2차맵을 열고 카메라가 변 가까이 선 내 사이보그를 따라가 그쪽 이웃을 받아 구독할 때까지. 바라는 답(want — "vision": 볼 수 있는 이웃,
 * "refused": 구독이 거절된 이웃)이 나올 때까지 변을 바꿔 다시 연다. 지금 2차맵과 그 이웃 키
 */
async function openAtEdge(
  page: Page,
  rig: Rig,
  want: "vision" | "refused",
): Promise<{ main: number; near: number }> {
  const map = page.locator(".map-screen[data-map-key]");
  const seen: string[] = [];
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
    const got = rig.visions.includes(near) ? "vision" : "refused";
    seen.push(`${main}→${near}:${got === "vision" ? "vision" : (rig.refusedCodes.get(near) ?? "?")}`);
    if (got === want) return { main, near };
  }
  throw new Error(`바라는 이웃(${want})이 없습니다: ${seen.join(", ")}`);
}

/**
 * dev 사이보그 2차맵의 동쪽 이웃을 띄워 둔다(그때 띄우기 — docs/adr/2026-11-07-play-flow.md "WP15"): 운영자 빠르기로 그 2차맵에 보냈다가
 * 제자리로 돌린다. 시작 도시 옆 2차맵은 부팅이 띄우지 않으므로(도시 간격) 이것이 없으면 이웃 구독이 unknown_map으로 거절된다
 */
async function spawnEastNeighbour(page: Page): Promise<number> {
  const side = await page.context().newPage();
  try {
    await side.goto("/health");
    const home = await myPosition(side);
    if (!home) throw new Error("dev 사이보그 자리를 모릅니다");
    const east = isCellKey(home.mapKey) ? stepCell(home.mapKey, 1, 0) : null;
    if (east === null) throw new Error("동쪽 이웃이 없습니다");
    let landed: Position | null = null;
    for (const [cellX, cellY] of [
      [128, 128],
      [64, 128],
      [192, 128],
      [128, 64],
      [128, 192],
    ] as const) {
      const target = { mapKey: east, cellX, cellY, unitId: home.unitId };
      if (!(await fastTravel(side, home.mapKey, home.unitId, target))) continue;
      landed = target;
      break;
    }
    if (!landed) throw new Error("동쪽 이웃에 설 자리가 없습니다");
    await waitAt(side, landed, 4);
    expect(await fastTravel(side, east, home.unitId, home)).toBe(true);
    await waitAt(side, home, 4);
    return east;
  } finally {
    await side.close();
  }
}

test.describe("이웃 안개·로딩 없는 2차맵 이동", () => {
  // 그리기·넘기 시험: 볼 수 있는 이웃이 늘 있게 dev(전체 보기 권한, 운영자 모드 끔 — 이웃을 보통 구독으로 받는다)
  test.use({ account: "dev" });

  test("변 가까이: 이웃을 구독해 안개를 받고, 기준 유닛이 이웃에 나타나면 화면을 다시 만들지 않고 넘는다", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(360_000);
    const spawned = await spawnEastNeighbour(page);
    const rig = await rigSocket(page);
    await keepMyUnits(page);
    const { main, near: east } = await openAtEdge(page, rig, "vision");
    expect(east).toBe(spawned);
    const map = page.locator(".map-screen[data-map-key]");
    await expect(map).toHaveAttribute("data-operator", "off");
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
    // 두 단계 줄여 둔다: 걸어서 넘으면 확대는 그대로다(사용자 지적 2026-11-11 "다음 맵으로 이동시 확대배율이 유지되게" — 6/6은 화면을 열 때만)
    const ladder = page.locator(".zoom-ladder");
    await expect(ladder).toHaveAttribute("data-stage", "6");
    await ladder.locator(".zoom-ladder-out").click();
    await expect(ladder).toHaveAttribute("data-stage", "5");
    await ladder.locator(".zoom-ladder-out").click();
    await expect(ladder).toHaveAttribute("data-stage", "4");

    // 넘기: 그 이웃 2차맵 경로에 내 사이보그가 나타난다(그 2차맵 흐름의 rev에 이어 붙인다)
    const subscribedBefore = rig.subscribed.length;
    const eastRev = rig.revs.get(east) ?? 0;
    rig.inject({
      t: "unit_paths",
      mapKey: east,
      fromRev: eastRev,
      rev: eastRev + 1,
      units: [
        {
          id: cyborg,
          own: true,
          size: 1,
          speed: 437,
          departAtMs: Date.now(),
          path: [128 * UNITS_PER_CELL, 128 * UNITS_PER_CELL],
        },
      ],
    });
    await expect(map).toHaveAttribute("data-map-key", String(east), { timeout: 5_000 });
    await expect(map).toHaveAttribute("data-switched", "in-place");
    // 넘어도 확대 단계는 그대로(4/6)
    await page.waitForTimeout(600);
    await expect(ladder).toHaveAttribute("data-stage", "4");
    await expect(page).toHaveURL(
      (url) => url.pathname === "/map" && url.searchParams.get("key") === String(east),
    );
    // 화면을 다시 만들지 않았다: 같은 캔버스 요소, "받는 중" 안내 없음
    await expect(page.locator('.map-view canvas[data-e2e-mark="kept"]')).toHaveCount(1);
    await expect(page.locator(".map-notice")).toHaveCount(0);
    // 카메라는 새 2차맵 틀로 옮겨졌다: 같은 땅을 보므로 목표점 좌표가 크게 바뀐다(면 경계 너머 돌아간 이웃이면 차이는 한 변과 다르다).
    // 넘은 뒤 자리는 보지 않는다: 시험은 내 유닛 목록을 옛 2차맵 목록(옛 좌표)으로 돌려줘 카메라 묶기 범위가 그 좌표로 걸린다
    await page.waitForTimeout(1_200);
    const [ax = 0, az = 0] = ((await map.getAttribute("data-camera")) ?? "").split(",").map(Number);
    expect(Math.hypot(ax - bx, az - bz)).toBeGreaterThan(300);
    // 새 2차맵 자료는 이웃일 때 구독해 둔 흐름을 그대로 쓴다(다시 구독하지 않는다 — "바뀜 (2026-11-11)")
    await expect(map).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
    // 넘기 전 구독(거절 뒤 다시 보낸 것 포함)은 넘기와 상관없다 — 넘은 뒤로 그 2차맵 구독이 새로 없어야 한다
    console.log(
      `[subscribe] ${JSON.stringify({ east, before: rig.subscribed.slice(0, subscribedBefore), after: rig.subscribed.slice(subscribedBefore), refused: [...rig.refusedCodes] })}`,
    );
    expect(rig.subscribed.slice(0, subscribedBefore)).toContain(east);
    expect(rig.subscribed.slice(subscribedBefore)).not.toContain(east);
    expect(main).not.toBe(east);
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("옆 2차맵 땅 누르기", () => {
  test.use({ account: "dev" });

  test("그려 둔 옆 2차맵 땅을 누르면 고른 내 유닛을 그 2차맵으로 보낸다(travel_start)", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(360_000);
    await spawnEastNeighbour(page);
    const rig = await rigSocket(page);
    await keepMyUnits(page);
    const { near } = await openAtEdge(page, rig, "vision");
    await expect(page.locator(".map-screen")).toHaveAttribute("data-operator", "off");
    // 멀리 보아 옆 2차맵이 화면에 넓게 들게 한 뒤, 가운데(내 사이보그) 둘레를 바깥부터 눌러 본다 — 옆 땅을 누를 때까지
    const box = await page.locator(".map-view canvas").boundingBox();
    if (!box) throw new Error("no canvas");
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    // 6/6(짧은 변 15m)에서 한 단계 줄여 옛 가장 가까이(40m)쯤에서 휠로 줄인다
    await page.locator(".zoom-ladder-out").click();
    await expect(page.locator(".zoom-ladder")).toHaveAttribute("data-stage", "5");
    await page.mouse.move(cx, cy);
    for (let k = 0; k < 5; k++) {
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(800);
    for (const radius of [180, 150, 110]) {
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
    // 서버에서 내 사이보그가 정말 떠났다: 멈춰 둔다(다음 시험 — 걸어서 넘기 등 — 이 같은 사이보그를 쓴다)
    const cyborg = Number(await page.locator(".map-screen").getAttribute("data-cyborg"));
    expect(deviceErrors).toEqual([]);
    const [cancel] = await sendCommands(page, [{ t: "travel_cancel", unitId: cyborg }]);
    expect(Reflect.get(Object(cancel), "t")).toBe("travel_result");
  });
});

test.describe("이웃 안개 사진", () => {
  // 볼 수 없는 이웃(구독 거절) = 온통 어둡게: player 시작 도시 옆 2차맵(같은 나라 도시 없음 — 도시 간격)
  test.use({ account: "player" });
  for (const theme of ["pastel", "dark"] as const satisfies readonly Theme[]) {
    test.describe(`390 ${theme}`, () => {
      test.use({ theme });
      test(`변 가까이 이웃 안개 (390·${theme})`, async ({ page, deviceErrors }) => {
        test.setTimeout(360_000);
        const rig = await rigSocket(page);
        await keepMyUnits(page);
        const { near } = await openAtEdge(page, rig, "refused");
        expect(rig.refusedCodes.get(near)).toMatch(/^(not_visible|unknown_map)$/);
        expect(rig.visions).not.toContain(near);
        // 멀리 보아 경계 양쪽이 보이게(가운데 = 내 사이보그). 6/6에서 한 단계 줄인 뒤 휠로
        await page.locator(".zoom-ladder-out").click();
        await expect(page.locator(".zoom-ladder")).toHaveAttribute("data-stage", "5");
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

// ---------- 걸어서 넘기(실제 이동) ----------

type ProbeSample = MapProbeSample;

interface Position {
  readonly mapKey: number;
  readonly cellX: number;
  readonly cellY: number;
  readonly unitId: number;
}

/** 내 사이보그 자리(tRPC world.myPosition). 건너뛰는 중이거나 없으면 null */
async function myPosition(side: Page): Promise<Position | null> {
  const reply: unknown = await side.evaluate(() =>
    fetch("/api/trpc/world.myPosition").then((response) => response.json()),
  );
  const position = field(field(field(reply, "result"), "data"), "position");
  if (position === undefined || position === null || field(position, "hidden") === true) return null;
  return {
    mapKey: Number(field(position, "mapKey")),
    cellX: Number(field(position, "cellX")),
    cellY: Number(field(position, "cellY")),
    unitId: Number(field(position, "unitId")),
  };
}

/** 운영자 빠르기(전체 보기로 구독한 연결의 명령 — 100배)로 내 사이보그를 그 2차맵 칸으로 보낸다. 결과가 ok면 true */
async function fastTravel(side: Page, from: number, unitId: number, to: Position): Promise<boolean> {
  const replies = await sendCommands(side, [
    { t: "subscribe", mapKey: from, observe: true },
    { t: "travel_start", unitId, mapKey: to.mapKey, x: to.cellX, y: to.cellY, kind: "move" },
  ]);
  return field(replies[1], "ok") === true;
}

/** 내 사이보그가 그 2차맵의 그 칸 둘레(반지름 칸)에 설 때까지 기다린다 */
async function waitAt(side: Page, target: Omit<Position, "unitId">, radius: number): Promise<void> {
  await expect
    .poll(
      async () => {
        const at = await myPosition(side);
        if (!at || at.mapKey !== target.mapKey) return 999;
        return Math.max(Math.abs(at.cellX - target.cellX), Math.abs(at.cellY - target.cellY));
      },
      { timeout: 90_000, intervals: [500] },
    )
    .toBeLessThanOrEqual(radius);
}

/** 프레임 기록을 꺼낸다 */
async function probeOf(page: Page): Promise<{ samples: ProbeSample[]; frames: number[]; events: string[] }> {
  return page.evaluate(() => {
    const probe = window.terraMapProbe;
    return {
      samples: probe ? [...probe.samples] : [],
      frames: probe ? [...probe.frames] : [],
      events: probe ? [...probe.events] : [],
    };
  });
}

/** 넘는 앞뒤(앞 beforeMs, 뒤 afterMs) 프레임 요약 */
function crossingSummary(
  probe: { samples: ProbeSample[]; frames: number[] },
  crossedTo: number,
  beforeMs: number,
  afterMs: number,
) {
  const first = probe.samples.find((sample) => sample.mapKey === crossedTo);
  if (!first) throw new Error("넘은 프레임이 기록에 없습니다");
  const within = probe.samples.filter(
    (sample) => sample.t >= first.t - beforeMs && sample.t <= first.t + afterMs,
  );
  let jump = 0;
  let missing = 0;
  let previous: ProbeSample | null = null;
  for (const sample of within) {
    if (sample.sx === null || sample.sy === null) missing += 1;
    else if (previous && previous.sx !== null && previous.sy !== null)
      jump = Math.max(jump, Math.hypot(sample.sx - previous.sx, sample.sy - previous.sy));
    previous = sample;
  }
  const frames = probe.frames.filter((time) => time >= first.t - beforeMs && time <= first.t + afterMs);
  let longest = 0;
  for (let i = 1; i < frames.length; i++)
    longest = Math.max(longest, (frames[i] ?? 0) - (frames[i - 1] ?? 0));
  const numbers = (pick: (sample: ProbeSample) => number): { min: number; max: number } => ({
    min: Math.min(...within.map(pick)),
    max: Math.max(...within.map(pick)),
  });
  return {
    frames: within.length,
    stages: [...new Set(within.map((sample) => sample.stage))],
    distance: numbers((sample) => Math.round(sample.distance * 10) / 10),
    notices: numbers((sample) => sample.notices).max,
    units: numbers((sample) => sample.units),
    anchorMissingFrames: missing,
    anchorJumpPx: Math.round(jump * 10) / 10,
    props: numbers((sample) => sample.props),
    selectedLost: within.filter((sample) => sample.selected === null).length,
    hud: [...new Set(within.map((sample) => sample.hud))],
    longestFrameMs: Math.round(longest),
  };
}

/** 기기가 보낸 구독·지형 받기를 센다(쌓이는지 보기) */
function countLoads(page: Page): { subscribes: number[]; terrains: string[]; refused: number } {
  const loads = { subscribes: [] as number[], terrains: [] as string[], refused: 0 };
  page.on("websocket", (socket) => {
    socket.on("framesent", (frame) => {
      const text = typeof frame.payload === "string" ? frame.payload : "";
      if (text.includes('"t":"subscribe"')) loads.subscribes.push(Number(field(JSON.parse(text), "mapKey")));
    });
    socket.on("framereceived", (frame) => {
      const text = typeof frame.payload === "string" ? frame.payload : "";
      if (text.includes('"code":"rate_limited"')) loads.refused += 1;
    });
  });
  page.on("request", (request) => {
    if (request.url().includes("/terrain")) loads.terrains.push(new URL(request.url()).pathname);
  });
  return loads;
}

/** 변 앞에 세울 자리 후보(동쪽 변, 가운데 줄부터) */
const EDGE_ROWS = [128, 100, 156, 72, 184] as const;
const EDGE_COLUMN = 251;

test.describe("걸어서 넘기", () => {
  test.use({ account: "dev" });

  test("따라가는 유닛이 걸어서 넘는 동안 확대·유닛·화면 자리가 이어지고, 운영자 100배로 잇달아 넘어도 쌓이지 않는다", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(600_000);
    const measure = process.env.E2E_MEASURE === "1";
    const tag = process.env.E2E_SEAMLESS_TAG ?? "after";
    const side = await page.context().newPage();
    await side.goto("/health");
    const home = await myPosition(side);
    if (!home) throw new Error("dev 사이보그 자리를 모릅니다");
    const east = isCellKey(home.mapKey) ? stepCell(home.mapKey, 1, 0) : null;
    if (east === null) throw new Error("동쪽 이웃이 없습니다");
    try {
      // 1. 운영자 빠르기로 동쪽 변 앞에 세운다(설 수 있는 줄을 찾을 때까지)
      let edge: Omit<Position, "unitId"> | null = null;
      for (const row of EDGE_ROWS) {
        const target = { mapKey: home.mapKey, cellX: EDGE_COLUMN, cellY: row, unitId: home.unitId };
        if (!(await fastTravel(side, home.mapKey, home.unitId, target))) continue;
        await waitAt(side, target, 3);
        edge = target;
        break;
      }
      if (!edge) throw new Error("동쪽 변 앞에 설 자리가 없습니다");

      // 2. 플레이어 화면(운영자 모드 끔)을 열고 두 단계 줄여 둔다(6/6 → 4/6)
      const loads = countLoads(page);
      await page.goto("/map?map-probe=1&second-map-sky=off&pixel-ratio=1");
      const map = page.locator(".map-screen[data-map-key]");
      await expect(map).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
      await expect(map).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
      await expect(map).toHaveAttribute("data-map-key", String(home.mapKey));
      await expect(map).toHaveAttribute("data-operator", "off");
      await expect(map).toHaveAttribute("data-follow", "on", { timeout: 15_000 });
      const ladder = page.locator(".zoom-ladder");
      await expect(ladder).toHaveAttribute("data-stage", "6");
      await ladder.locator(".zoom-ladder-out").click();
      await expect(ladder).toHaveAttribute("data-stage", "5");
      await ladder.locator(".zoom-ladder-out").click();
      await expect(ladder).toHaveAttribute("data-stage", "4");
      await expect
        .poll(async () => Number(await map.getAttribute("data-neighbours")), { timeout: 30_000 })
        .toBeGreaterThan(0);
      await page
        .locator(".map-view canvas")
        .evaluate((element) => element.setAttribute("data-e2e-mark", "kept"));
      await page.waitForTimeout(1_500);
      if (measure) await shot(page, `seamless-walk-${tag}-1-before`);

      // 3. 걷는 빠르기로 옆 2차맵에 보낸다(전체 보기 구독이 없는 연결 — 100배가 아니다)
      await page.evaluate(() => window.terraMapProbe?.clear());
      const [started] = await sendCommands(side, [
        { t: "travel_start", unitId: home.unitId, mapKey: east, x: 12, y: edge.cellY, kind: "move" },
      ]);
      expect(field(started, "ok")).toBe(true);
      await expect(map).toHaveAttribute("data-map-key", String(east), { timeout: 120_000 });
      if (measure) await shot(page, `seamless-walk-${tag}-2-crossed`);
      await page.waitForTimeout(4_000);
      const walkProbe = await probeOf(page);
      console.log(
        `[probe] ${JSON.stringify({
          samples: walkProbe.samples.length,
          keys: [...new Set(walkProbe.samples.map((sample) => sample.mapKey))],
          kept: await page.locator('.map-view canvas[data-e2e-mark="kept"]').count(),
          events: walkProbe.events,
        })}`,
      );
      const walk = crossingSummary(walkProbe, east, 1_500, 3_000);
      console.log(`[measure] walk ${tag} ${JSON.stringify(walk)}`);
      console.log(`[measure] walk loads ${tag} ${JSON.stringify(loads)}`);
      // 화면을 다시 만들지 않았다, 안내 판 없음, 확대 그대로
      await expect(page.locator('.map-view canvas[data-e2e-mark="kept"]')).toHaveCount(1);
      expect(walk.notices).toBe(0);
      expect(walk.stages).toEqual([4]);
      await expect(ladder).toHaveAttribute("data-stage", "4");
      // 유닛이 비지 않고, 기준 유닛이 프레임마다 있으며 화면 자리가 튀지 않는다
      expect(walk.units.min).toBeGreaterThan(0);
      expect(walk.anchorMissingFrames).toBe(0);
      expect(walk.selectedLost).toBe(0);
      expect(walk.anchorJumpPx).toBeLessThan(8);
      await expect(map).toHaveAttribute("data-feed", "live", { timeout: 30_000 });

      // 4. 운영자 모드 100배로 잇달아 넘는다: 옆 2차맵 ↔ 처음 2차맵을 세 번(둘 다 서버가 띄운 2차맵 — 띄우지 않은 2차맵은 건너뛴다)
      await page.locator(".map-operator-toggle").click();
      await expect(map).toHaveAttribute("data-operator", "on");
      await expect(map).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
      await page.waitForTimeout(2_500);
      await page.evaluate(() => window.terraMapProbe?.clear());
      loads.subscribes.length = 0;
      loads.terrains.length = 0;
      const begun = Date.now();
      const hops = [
        { from: east, to: { mapKey: home.mapKey, cellX: 128, cellY: edge.cellY, unitId: 0 } },
        { from: home.mapKey, to: { mapKey: east, cellX: 128, cellY: edge.cellY, unitId: 0 } },
        { from: east, to: { mapKey: home.mapKey, cellX: 200, cellY: edge.cellY, unitId: 0 } },
      ];
      for (const hop of hops) {
        expect(await fastTravel(side, hop.from, home.unitId, hop.to)).toBe(true);
        await expect(map).toHaveAttribute("data-map-key", String(hop.to.mapKey), { timeout: 120_000 });
      }
      await page.waitForTimeout(3_000);
      const fastProbe = await probeOf(page);
      console.log(`[probe] fast events ${JSON.stringify(fastProbe.events)}`);
      const fast = crossingSummary(fastProbe, home.mapKey, 3_000, 60_000);
      console.log(
        `[measure] fast ${tag} ${JSON.stringify({ ...fast, seconds: (Date.now() - begun) / 1_000 })}`,
      );
      console.log(`[measure] fast loads ${tag} ${JSON.stringify(loads)}`);
      if (measure) await shot(page, `seamless-fast-${tag}-3-back`);
      // 넘기 셋 모두 화면 안에서(다시 만들지 않음), 안내 없음, 확대 그대로, 유닛·고른 유닛이 비지 않는다
      expect(fastProbe.events.filter((event) => event.includes(" cross ")).length).toBe(3);
      expect(fastProbe.events.filter((event) => event.includes("reopen")).length).toBe(0);
      expect(fast.notices).toBe(0);
      expect(fast.stages).toEqual([4]);
      expect(fast.units.min).toBeGreaterThan(0);
      expect(fast.anchorMissingFrames).toBe(0);
      expect(fast.selectedLost).toBe(0);
      // 쌓이지 않는다: 두 2차맵 흐름을 그대로 쓰므로 새 구독은 다른 이웃 몫뿐(넘기마다 다시 구독하지 않는다), 지형은 2차맵마다 한 번만
      expect(loads.refused).toBe(0);
      expect(loads.subscribes.filter((key) => key === east || key === home.mapKey).length).toBe(0);
      expect(new Set(loads.terrains).size).toBe(loads.terrains.length);
      await expect(page.locator('.map-view canvas[data-e2e-mark="kept"]')).toHaveCount(1);
      await expect(ladder).toHaveAttribute("data-stage", "4");
      expect(deviceErrors).toEqual([]);
    } finally {
      // 제자리로(다음 시험이 같은 사이보그를 처음 2차맵에서 쓴다)
      const now = await myPosition(side);
      if (now && (await fastTravel(side, now.mapKey, home.unitId, home))) await waitAt(side, home, 4);
      await side.close();
    }
  });
});

// ---------- 옆 2차맵 미리 띄우기(실제 걷기, player) ----------
// docs/adr/2026-11-08-seamless-second-map.md "바뀜 (2026-11-12)": 도시 간격 뒤로 시작 도시 옆 2차맵은 서버가 띄우지 않은 들판이다. 플레이어가 변
// 쪽으로 걷기 시작하면 서버가 그 이웃을 미리 띄우고, 사이보그 시야가 경계를 넘으면 그 몫을 볼 수 있게 한다 → 기기는 넘기 전에 그 이웃을
// 구독해 vision을 받는다(unknown_map 거절 없음). 시야가 닿기 전 구독은 not_visible로 거절될 수 있고 기기가 다시 구독한다.

/** 설 수 있는 자리를 찾아 내 유닛을 그 2차맵 칸으로 보낸다(걷는 빠르기 — 보통 구독). 길을 받으면 true */
async function walkTo(
  side: Page,
  mapKey: number,
  unitId: number,
  cellX: number,
  cellY: number,
): Promise<boolean> {
  const replies = await sendCommands(side, [
    { t: "subscribe", mapKey },
    { t: "move_unit", mapKey, unitId, x: cellX * UNITS_PER_CELL + 512, y: cellY * UNITS_PER_CELL + 512 },
  ]);
  return field(replies[1], "ok") === true;
}

test.describe("옆 2차맵 미리 띄우기", () => {
  test.use({ account: "player" });

  test("시작 도시 변으로 걸어가면 넘기 전에 옆 2차맵을 구독해 시야를 받는다(unknown_map 없음)", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(600_000);
    const side = await page.context().newPage();
    let home: Position | null = null;
    try {
      await side.goto("/health");
      home = await myPosition(side);
      if (!home) throw new Error("player 사이보그 자리를 모릅니다");
      // 가까운 동·서 변으로(변 바로 옆 칸 — 기기가 가는 쪽 이웃으로 미리 받는다), 막혔으면 다른 줄
      const east = home.cellX >= 128;
      const neighbour = isCellKey(home.mapKey) ? stepCell(home.mapKey, east ? 1 : -1, 0) : null;
      if (neighbour === null) throw new Error("옆 2차맵이 없습니다");
      let walking = false;
      for (const dy of [0, 8, -8, 16, -16, 32, -32]) {
        const cellY = Math.min(250, Math.max(5, home.cellY + dy));
        if (await walkTo(side, home.mapKey, home.unitId, east ? 254 : 1, cellY)) {
          walking = true;
          break;
        }
      }
      expect(walking).toBe(true);
      const startedAt = Date.now();
      const rig = await rigSocket(page);
      rig.rewrite = false;
      await page.goto("/map");
      const map = page.locator(".map-screen[data-map-key]");
      await expect(map).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
      await expect(map).toHaveAttribute("data-map-key", String(home.mapKey), { timeout: 30_000 });
      // 걷는 동안: 그 이웃을 구독하고, 시야가 경계를 넘으면 vision을 받는다
      await expect.poll(() => rig.subscribed.includes(neighbour), { timeout: 60_000 }).toBe(true);
      await expect
        .poll(() => rig.visions.includes(neighbour), { timeout: 420_000, intervals: [1_000] })
        .toBe(true);
      const walkedMs = Date.now() - startedAt;
      const codes = rig.refusals.filter((item) => item.mapKey === neighbour).map((item) => item.code);
      console.log(`[preopen] ${JSON.stringify({ home: home.mapKey, neighbour, walkedMs, refused: codes })}`);
      // 서버가 띄우지 않았다는 거절은 없다(넘기 전에 미리 띄웠다). 시야가 닿기 전 거절은 볼 수 없음뿐
      expect(codes).not.toContain("unknown_map");
      for (const code of codes) expect(code).toBe("not_visible");
      // 아직 넘지 않았다: 지금 2차맵 그대로
      await expect(map).toHaveAttribute("data-map-key", String(home.mapKey));
      expect(deviceErrors).toEqual([]);
    } finally {
      // 다음 시험이 같은 사이보그를 쓴다: 처음 자리로 돌려보낸다(기다리지 않는다)
      if (home) await walkTo(side, home.mapKey, home.unitId, home.cellX, home.cellY).catch(() => false);
      await side.close();
    }
  });
});

// 잼(E2E_MEASURE=1, dev): 사이보그를 시작 2차맵 변 넷 가까이 차례로 세워(운영자 빠르기) 이웃 넷을 미리 띄우고, 가운데로 돌아와 내려가기까지
// 기다린다. 서버 1분 지표(mapsOnDemand·mapsPreopened·rssMb — e2e/test-results/server.log)를 시각 표지([measure] 줄)와 맞춰 읽는다.
// 세계 크기는 실행 환경 변수로 준다(예: NPC_TEST_NATIONS=16 S1_TEST_BOTS=1000).
/** 잼 시각 표지(서버 1분 지표와 맞춰 읽는다) */
const mark = (label: string): void => console.log(`[measure] ${new Date().toISOString()} ${label}`);

test.describe("옆 2차맵 미리 띄우기 잼", () => {
  test.use({ account: "dev" });
  test.skip(process.env.E2E_MEASURE !== "1", "E2E_MEASURE=1일 때만(서버 1분 지표를 몇 번 기다린다)");

  test("변 넷 가까이 서면 이웃 넷을 미리 띄우고, 떠나면 내린다(1분 지표)", async ({ page }) => {
    test.setTimeout(900_000);
    const side = await page.context().newPage();
    try {
      await side.goto("/health");
      const home = await myPosition(side);
      if (!home) throw new Error("dev 사이보그 자리를 모릅니다");
      const move = async (cellX: number, cellY: number): Promise<boolean> => {
        const replies = await sendCommands(side, [
          { t: "subscribe", mapKey: home.mapKey, observe: true },
          {
            t: "move_unit",
            mapKey: home.mapKey,
            unitId: home.unitId,
            x: cellX * UNITS_PER_CELL + 512,
            y: cellY * UNITS_PER_CELL + 512,
          },
        ]);
        return field(replies[1], "ok") === true;
      };
      mark("start");
      await page.waitForTimeout(65_000);
      mark("baseline");
      for (const edge of EDGES) {
        if (!(await move(edge.x, edge.y))) {
          mark(`edge ${edge.x},${edge.y} blocked`);
          continue;
        }
        await waitAt(side, { mapKey: home.mapKey, cellX: edge.x, cellY: edge.y }, 4);
        mark(`edge ${edge.x},${edge.y}`);
      }
      await page.waitForTimeout(65_000);
      mark("all edges");
      expect(await move(home.cellX, home.cellY)).toBe(true);
      await waitAt(side, { mapKey: home.mapKey, cellX: home.cellX, cellY: home.cellY }, 4);
      mark("back home");
      await page.waitForTimeout(200_000);
      mark("after idle");
    } finally {
      await side.close();
    }
  });
});
