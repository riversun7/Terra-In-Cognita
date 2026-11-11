// 옆 2차맵 미리 띄우기 DB 통합 시험(docs/adr/2026-11-08-seamless-second-map.md "바뀜 (2026-11-12)") — TEST_DATABASE_URL이 있을 때만.
// 계정·행성 값은 시험용 가짜다(면 5만 바다인 풀밭 — travel/layoutTravel.db.test.ts와 같은 무늬). 도시 배후지 간격(기본 규칙)이라 시작 도시 옆
// 2차맵은 띄우지 않은 들판이다.
// 1. 사이보그가 시작 도시 2차맵 안에서 변 앞으로 가는 길을 받으면 넘기 전에 그 변 너머를 띄운다(미리 띄움). 시야가 경계에 닿기 전에는 볼 수 없고
//    (not_visible과 같은 답), 변 앞에 서면 그 몫만 보인다(구독·탐사 칸).
// 2. 그때 띄우기 상한 안에서만: 꽉 차고 비운 것이 없으면 다른 변 너머는 띄우지 않는다.
// 3. 사이보그가 떠나면 미리 띄운 2차맵은 비고, 설정 칸 map_preopen_idle_ms 뒤 내린다(보통 그때 띄운 2차맵의 10분보다 짧게).
import { loadContentPack } from "@terra/content/node";
import { decodeCellKey, parseCellKey } from "@terra/planet";
import type { PlanetCellValues } from "@terra/planet/secondMap";
import { DAY_MS, TEST_SOCIETY_COEFFICIENTS, VISION_SIDE, arrivalAt, anchorCenter, hasBit } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { nationPresetsOf } from "../npc/presets.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { SIDES, sideToward } from "../travel/frame.ts";
import type { StreamSubscriber } from "./mapStream.ts";
import { mapTerrainFromTemp } from "./mapTerrain.ts";
import type { TerrainService } from "./terrainService.ts";
import { flatTerrain, legacyNationPresets } from "./testSupport.ts";
import { sideNeighbour } from "./edgeWatch.ts";
import { type World, startWorld } from "./world.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source || !loaded.pack) throw new Error("content pack");
const pack = createContentEditState(loaded.source).effective();
const presets = legacyNationPresets(nationPresetsOf(loaded.pack));

function cellValues(mapKey: number): PlanetCellValues {
  const { face, i, j } = decodeCellKey(parseCellKey(mapKey));
  const sea = face === 5;
  return {
    mapKey,
    face,
    i,
    j,
    biomeId: sea ? "ocean" : "grassland",
    elevationM: sea ? -300 : 120,
    temperatureC: 15,
    humidity: 120,
    precipitationMm: 400,
    water: sea ? 1 : 0,
    riverOrder: 0,
    forest: 0,
  };
}

function fakeTerrain(): TerrainService {
  return {
    ready: Promise.resolve(),
    version: () => "fake",
    get: async (mapKey) => mapTerrainFromTemp(mapKey, flatTerrain()),
    peek: () => undefined,
    prefetch: () => {},
    cellValues,
    takeMetrics: () => ({}),
    close: async () => {},
  };
}

const silent = { info: () => {}, warn: () => {}, error: () => {} };

let test: TestDatabase;
const worlds: World[] = [];
let clock = 0;
/** 설정 칸 실효 값(시험 중에 바꾼다) */
const seed = { ...TEST_SOCIETY_COEFFICIENTS.worldSeed };
const rules = () => ({ ...TEST_SOCIETY_COEFFICIENTS, worldSeed: seed });

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
  clock = 1_800_000_000_000 - (1_800_000_000_000 % DAY_MS) + 3_600_000;
  Object.assign(seed, TEST_SOCIETY_COEFFICIENTS.worldSeed);
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  for (const world of worlds.splice(0)) await world.stop().catch(() => undefined);
  await test.drop();
});

async function boot(): Promise<World> {
  const world = startWorld({
    testBots: 0,
    testMaps: 2,
    paths: { kind: "inline" },
    now: () => clock,
    log: silent,
    pool: test.db.$client,
    writeIntervalMs: 10,
    onFatal: (error) => {
      throw error;
    },
    terrain: fakeTerrain(),
    npc: { testNations: 4, manual: true, presets },
    cyborgRules: rules,
    holdings: { content: () => pack },
    facilities: { content: () => pack },
  });
  worlds.push(world);
  await world.ready;
  await world.persistence?.writer.durable();
  return world;
}

function persistence(world: World) {
  const found = world.persistence;
  if (!found) throw new Error("no persistence");
  return found;
}

async function makeCyborg(world: World, name: string): Promise<{ userId: string; unitId: number }> {
  const found = await rows<{ id: string }>(
    test.db,
    `insert into users (name, email, username) values ($1, $2, $3) returning id`,
    [name, `${name}@id.placeholder.invalid`, name.toLowerCase()],
  );
  const userId = String(found[0]?.id);
  const p = persistence(world);
  const creation = p.cyborgs.creation(userId, clock);
  const faction = creation.factions.find((entry) => entry.cities.length > 0);
  const city = faction?.cities[0];
  if (!faction || !city) throw new Error("no start city");
  await p.cyborgs.roll(userId, "balanced");
  const made = await p.cyborgs.create(userId, {
    name: `t${userId.slice(0, 8)}`,
    appearance: {
      head: "dome",
      face: "visor",
      body: "slim",
      limbs: "piston",
      primary: "mint",
      accent: "lemon",
    },
    factionId: faction.id,
    cityId: city.id,
    elements: { fire: 6, wind: 4 },
  });
  expect(made.ok).toBe(true);
  await p.writer.durable();
  const unitId = p.cyborgs.record(userId)?.unitId;
  if (unitId === null || unitId === undefined) throw new Error("no cyborg unit");
  return { userId, unitId };
}

/** 같은 스레드 길 찾기·미리 띄우기(DB 읽기)가 끝나게 몇 바퀴 */
async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 5));
}

function mapOf(world: World, unitId: number): number | undefined {
  for (const map of world.maps.values()) if (map.unitInfo(unitId)) return map.mapKey;
  return undefined;
}

/** 그 변(SIDES 차례) 앞 칸(변에서 2칸, 가운데 줄) */
function edgeCell(side: number): { x: number; y: number } {
  const { dx, dy } = SIDES[side] ?? { dx: 1, dy: 0 };
  return { x: dx > 0 ? 253 : dx < 0 ? 2 : 128, y: dy > 0 ? 253 : dy < 0 ? 2 : 128 };
}

async function untilOpen(world: World, mapKey: number): Promise<boolean> {
  for (let i = 0; i < 40 && !world.maps.has(mapKey); i++) await flush();
  return world.maps.has(mapKey);
}

function collector(): StreamSubscriber & { visions: Uint8Array[] } {
  const visions: Uint8Array[] = [];
  return {
    visions,
    send: (text) => {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed !== "object" || parsed === null || Reflect.get(parsed, "t") !== "vision") return;
      const explored: unknown = Reflect.get(parsed, "explored");
      visions.push(new Uint8Array(Buffer.from(typeof explored === "string" ? explored : "", "base64")));
    },
    bufferedAmount: () => 0,
  };
}

describe.skipIf(!TEST_DATABASE_URL)("옆 2차맵 미리 띄우기(2026-11-12)", () => {
  it("변 앞으로 가는 길을 받으면 넘기 전에 띄우고, 변 앞에 서면 그 몫만 보이고, 떠나면 짧게 뒤 내린다", async () => {
    const world = await boot();
    const p = persistence(world);
    const { userId, unitId } = await makeCyborg(world, "EdgeWalker");
    await flush();
    const start = mapOf(world, unitId);
    if (start === undefined) throw new Error("cyborg is not on a map");
    const home = world.maps.get(start);
    const info = home?.unitInfo(unitId);
    if (!home || !info) throw new Error("no home map");
    const origin = info.motion.waypoints.at(-1) ?? anchorCenter(128, 128, 1);
    // 띄우지 않은 변 이웃 하나(도시 간격 — 시작 도시 옆은 들판)
    let closed: number | undefined;
    let closedSide = -1;
    for (const side of SIDES.keys()) {
      const key = sideNeighbour(start, side);
      if (key === null || world.maps.has(key)) continue;
      closed = key;
      closedSide = side;
      break;
    }
    if (closed === undefined) throw new Error("no unopened side neighbour");
    expect(sideToward(start, closed)).toEqual(SIDES[closedSide]);
    const viewer = { userId, ownerId: world.ownerOfUser?.(userId) };
    expect(viewer.ownerId).toBeDefined();

    // 1. 변 앞으로 가는 길을 받는 순간(아직 도시 가까이) 그 변 너머를 띄운다
    const target = edgeCell(closedSide);
    expect(await home.moveUnit(unitId, anchorCenter(target.x, target.y, 1))).toEqual({ ok: true });
    expect(await untilOpen(world, closed)).toBe(true);
    expect(p.spawn.onDemand.has(closed)).toBe(true);
    expect(p.spawn.early.has(closed)).toBe(true);
    expect(mapOf(world, unitId)).toBe(start);
    const opened = world.maps.get(closed);
    if (!opened) throw new Error("not opened");
    // 시야가 아직 경계에 닿지 않았다: 볼 수 없다(띄웠어도 안개 규칙은 그대로)
    const far = Math.min(origin.x, 256 * 1024 - origin.x, origin.y, 256 * 1024 - origin.y) / 1024;
    expect(far).toBeGreaterThan(30);
    expect(await opened.vision.canView(viewer)).toBe(false);
    // 변 앞에 선다 → 그 몫만 보인다
    const walking = home.unitInfo(unitId);
    if (!walking) throw new Error("no unit");
    clock = arrivalAt(walking.motion) + 1;
    expect(await opened.vision.canView(viewer)).toBe(true);
    expect(
      await opened.vision.canView({ userId: "00000000-0000-4000-8000-0000000000aa", ownerId: undefined }),
    ).toBe(false);
    const sub = collector();
    opened.vision.subscribe(sub, viewer);
    const bits = sub.visions[0];
    if (!bits) throw new Error("no vision message");
    let lit = 0;
    for (let cell = 0; cell < VISION_SIDE * VISION_SIDE; cell++) if (hasBit(bits, cell)) lit += 1;
    // 경계 쪽 띠(시야 반지름 3시야 칸 안)만 — 2차맵 전체(1,024칸)의 작은 몫
    expect(lit).toBeGreaterThan(0);
    expect(lit).toBeLessThan(40);
    opened.vision.unsubscribe(sub);
    expect(await world.checkInvariants()).toEqual([]);

    // 서버는 1분마다 살핀다: 변 앞에 선 동안은 붙잡혀 비어 있지 않다
    expect(p.spawn.sweep()).toBe(0);
    expect(world.maps.has(closed)).toBe(true);

    // 2. 상한 1(지금 하나 — 붙잡힘): 모서리로 옮겨 옆 변도 가까워져도 그 너머는 띄우지 않는다(비운 것이 없다)
    seed.mapSpawnMaxLoaded = 1;
    const adjacent = closedSide < 2 ? 3 : 1;
    const other = sideNeighbour(start, adjacent);
    const corner = {
      x: (SIDES[closedSide]?.dx ?? 0) !== 0 ? target.x : edgeCell(adjacent).x,
      y: (SIDES[closedSide]?.dy ?? 0) !== 0 ? target.y : edgeCell(adjacent).y,
    };
    expect(other !== null && !world.maps.has(other)).toBe(true);
    expect(await home.moveUnit(unitId, anchorCenter(corner.x, corner.y, 1))).toEqual({ ok: true });
    for (let i = 0; i < 4; i++) await flush();
    expect(world.maps.has(other ?? 0)).toBe(false);
    expect(world.maps.has(closed)).toBe(true);
    expect(p.spawn.takeMetrics()).toMatchObject({ mapsOnDemand: 1, mapPreopenRefused: 1 });
    seed.mapSpawnMaxLoaded = TEST_SOCIETY_COEFFICIENTS.worldSeed.mapSpawnMaxLoaded;

    // 3. 떠난다(처음 자리로) → 비면 map_preopen_idle_ms(2분) 뒤 내린다
    expect(await home.moveUnit(unitId, origin)).toEqual({ ok: true });
    const back = home.unitInfo(unitId);
    if (!back) throw new Error("no unit");
    clock = arrivalAt(back.motion) + 1;
    p.spawn.sweep();
    expect(world.maps.has(closed)).toBe(true);
    clock += seed.mapPreopenIdleMs;
    p.spawn.sweep();
    expect(world.maps.has(closed)).toBe(false);
    expect(seed.mapPreopenIdleMs).toBeLessThan(seed.mapSpawnIdleMs);
    expect(await world.checkInvariants()).toEqual([]);
  });
});
