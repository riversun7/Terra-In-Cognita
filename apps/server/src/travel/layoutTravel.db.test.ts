// 세계 배치 위 2차맵 사이 이동 DB 통합 시험(docs/adr/2026-11-07-play-flow.md "WP14", ADR 2026-11-07-world-layout) — TEST_DATABASE_URL이 있을 때만.
// 계정·행성 값은 시험용 가짜다(면 5만 바다인 풀밭 — worldLayout.db.test.ts와 같은 무늬).
// 사용자 지적(2026-11-08 "2차맵 넘어서 이동이 되지 않음"): 국가마다 행성 위 자기 자리(수도 + 붙은 2차맵)에 선 새 세계에서
// 1. 시작 도시 2차맵의 옆 2차맵: 띄운 옆 2차맵(같은 국가의 붙은 시작 도시)은 변 너머 바로 그 자리로 보낼 수 있고 넘어가 닿는다. 띄우지 않은 옆
//    2차맵도 보낼 수 있다(닿을 때 띄운다 — 기획 답 730 다, docs/adr/2026-11-07-play-flow.md "WP15", 아래 둘째 시험).
// 2. 다른 국가의 도시 2차맵: 띄우지 않은 2차맵을 건너뛰어(593 나) 닿는다(국가 사이 길이 옛 상한 64장보다 길어도 — 시험 행성 국가 넷은 49~121장).
// 3. 다시 켜도 가는 길이 이어진다(건너뛰는 중이면 다시 숨긴다).
import { loadContentPack } from "@terra/content/node";
import { decodeCellKey, neighbors4, parseCellKey } from "@terra/planet";
import type { PlanetCellValues } from "@terra/planet/secondMap";
import { DAY_MS, TEST_SOCIETY_COEFFICIENTS, arrivalAt } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { nationPresetsOf } from "../npc/presets.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { mapTerrainFromTemp } from "../world/mapTerrain.ts";
import type { TerrainService } from "../world/terrainService.ts";
import { flatTerrain, legacyNationPresets } from "../world/testSupport.ts";
import { nationLookupOf } from "../world/nationVision.ts";
import { type World, startWorld } from "../world/world.ts";
import { OPEN_SEARCH_MAPS, mapRoute, sideToward } from "./route.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source || !loaded.pack) throw new Error("content pack");
const pack = createContentEditState(loaded.source).effective();
// 옛 규칙(등급 없음, 성격 칸 도시 수 4·3·2)을 보는 시험이다 — 국력 등급 씨앗은 world/nationTiers.db.test.ts
const presets = legacyNationPresets(nationPresetsOf(loaded.pack));

/** 가짜 행성 값: 면 5는 바다, 나머지는 풀밭(15°C·강수 400mm·숲 없음·고도 120m) */
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

/** 가짜 지형 서비스: 2차맵 지형은 평평한 풀밭(길이 늘 이어진다 — 임시 지형은 행성 값과 상관없이 가운데가 물일 수 있다), 행성 값은 위 무늬 */
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

// 이미 띄운 옆 2차맵(붙은 시작 도시)으로 걷는 시험이라 옛 배치(수도와 붙은 2차맵)로 고정한다 — 배후지 배치에서는 지방 도시가 4칸 넘게 떨어져 사이 2차맵을 그때 띄운다(배후지 반경 0, docs/adr/2026-11-11-city-catchment.md — 배후지 배치는 world/citySites.test.ts·worldLayout.db.test.ts)
// 띄우지 않은 2차맵 건너뛰기(593 나)·닿을 때 띄우기(WP15)를 보는 시험이라 옆 2차맵 미리 띄우기(map_preopen_cells, docs/adr/2026-11-08-seamless-second-map.md
// "바뀜 (2026-11-12)")를 끈다 — 켜면 변으로 가는 구간마다 다음 2차맵을 미리 띄워 걸어서 지난다(미리 띄우기는 world/edgePreopen.db.test.ts)
const OLD_LAYOUT_RULES = {
  ...TEST_SOCIETY_COEFFICIENTS,
  worldSeed: { ...TEST_SOCIETY_COEFFICIENTS.worldSeed, catchmentRadiusCells: 0, mapPreopenCells: 0 },
};

const silent = { info: () => {}, warn: () => {}, error: () => {} };

let test: TestDatabase;
const worlds: World[] = [];
let clock = 0;

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
  clock = 1_800_000_000_000 - (1_800_000_000_000 % DAY_MS) + 3_600_000;
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
    cyborgRules: () => OLD_LAYOUT_RULES,
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

type CityLine = { id: string; faction_id: string; map_key: string; cell_x: number; cell_y: number };
const startCities = () =>
  rows<CityLine>(
    test.db,
    `select id, faction_id, map_key, cell_x, cell_y from world_cities where start order by id`,
  );

async function newUser(name: string): Promise<string> {
  const found = await rows<{ id: string }>(
    test.db,
    `insert into users (name, email, username) values ($1, $2, $3) returning id`,
    [name, `${name}@id.placeholder.invalid`, name.toLowerCase()],
  );
  return String(found[0]?.id);
}

/** 그 시작 도시에 사이보그를 만들고 본체 유닛 ID를 돌려준다 */
async function makeCyborg(world: World, userId: string, cityId: number): Promise<number> {
  const p = persistence(world);
  const faction = p.cyborgs
    .creation(userId, clock)
    .factions.find((entry) => entry.cities.some((city) => city.id === cityId));
  if (!faction) throw new Error("no faction for the city");
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
    cityId,
    elements: { fire: 6, wind: 4 },
  });
  expect(made.ok).toBe(true);
  await p.writer.durable();
  const unitId = p.cyborgs.record(userId)?.unitId;
  if (unitId === null || unitId === undefined) throw new Error("no cyborg unit");
  return unitId;
}

/** 쌓인 약속·마이크로태스크(같은 스레드 길 찾기)를 몇 바퀴 돌린다. 그때 띄우기(WP15)는 DB를 읽으므로 잠깐 기다린다 */
async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 2));
}

/** 유닛이 선 2차맵 키(띄운 2차맵에 없으면 — 건너뛰는 중 — undefined) */
function mapOf(world: World, unitId: number): number | undefined {
  for (const map of world.maps.values()) if (map.unitInfo(unitId)) return map.mapKey;
  return undefined;
}

/**
 * 길이 끝날 때까지 시계를 구간 끝(걷는 중이면 움직임 도착, 건너뛰는 중이면 나타나는 시각)으로 옮기며 확인한다. 끝난 길의 상태를 돌려준다.
 * hiddenSeen = 건너뛰는 중을 본 적 있나
 */
async function travelUntilDone(world: World, userId: string, unitId: number) {
  const p = persistence(world);
  let hiddenSeen = false;
  for (let step = 0; step < 400; step++) {
    const view = p.travel.list(userId).find((entry) => entry.unitId === unitId);
    if (!view || view.state !== "going") return { view, hiddenSeen };
    const mapKey = mapOf(world, unitId);
    if (mapKey === undefined) {
      hiddenSeen = true;
      await p.writer.durable();
      const until = await rows<{ hidden_until_ms: string | null }>(
        test.db,
        `select hidden_until_ms from world_travels where unit_id = $1`,
        [unitId],
      );
      clock = Math.max(clock + 1, Number(until[0]?.hidden_until_ms ?? clock + 60_000));
    } else {
      const info = world.maps.get(mapKey)?.unitInfo(unitId);
      if (info) clock = Math.max(clock + 1, arrivalAt(info.motion));
    }
    p.travel.runDue();
    await flush();
  }
  throw new Error("travel did not finish");
}

describe.skipIf(!TEST_DATABASE_URL)("세계 배치 위 2차맵 사이 이동(WP14)", () => {
  it("시작 도시의 옆 2차맵(띄운 것만)과 다른 국가 도시 2차맵으로 걸어가 닿는다, 다시 켜도 이어진다", async () => {
    const world = await boot();
    const cities = await startCities();
    const byFaction = new Map<string, CityLine[]>();
    for (const city of cities)
      byFaction.set(city.faction_id, [...(byFaction.get(city.faction_id) ?? []), city]);
    // 시작 도시가 둘 이상인 국가의 수도에서 시작한다
    const home = [...byFaction.values()].find((list) => list.length >= 2);
    const capital = home?.[0];
    const sibling = home?.[1];
    if (!capital || !sibling) throw new Error("no nation with two start cities");
    const userId = await newUser("LayoutTraveler");
    const unitId = await makeCyborg(world, userId, Number(capital.id));
    const p = persistence(world);
    const start = Number(capital.map_key);
    expect(mapOf(world, unitId)).toBe(start);

    // 1. 옆 2차맵: 띄우지 않은 쪽도 보낼 수 있고(좌표 이동 — 띄우지 않는다), 붙은 시작 도시 쪽(띄움)은 변 너머 바로 그 자리로 보낼 수 있다
    const neighbours = neighbors4(parseCellKey(start));
    const closed = neighbours.find((key) => !world.maps.has(key));
    expect(closed).toBeDefined();
    const closedPlan = p.travel.plan(userId, { mapKey: closed ?? 0, x: 128, y: 128 });
    expect(closedPlan).toMatchObject({ ok: true, plan: { route: [start, closed], hiddenMaps: 0 } });
    expect(closedPlan.ok && closedPlan.plan.opensMap).toBeFalsy();
    const open = Number(sibling.map_key);
    expect(neighbours).toContain(open);
    const side = sideToward(start, open);
    if (!side) throw new Error("not a side neighbour");
    // 변 너머 8칸(화면의 [옆 2차맵으로]가 고르는 자리 — 옆 2차맵 틀로는 그 2차맵 서버가 바꾼다): 여기서는 옆 2차맵 가운데 줄
    const across = { mapKey: open, x: 128, y: 128 };
    const nearPlan = p.travel.plan(userId, across);
    expect(nearPlan.ok && nearPlan.plan.route).toEqual([start, open]);
    expect((await p.travel.start(userId, { ...across, unitId, kind: "move" })).ok).toBe(true);
    const first = await travelUntilDone(world, userId, unitId);
    expect(first.view?.state).toBe("arrived");
    expect(mapOf(world, unitId)).toBe(open);

    // 2. 다른 국가의 도시 2차맵(가장 먼 것): 모든 국가에 길이 있고, 띄우지 않은 2차맵을 건너뛰어 닿는다
    const others = cities.filter((city) => city.faction_id !== capital.faction_id);
    let far: { city: CityLine; maps: number } | null = null;
    for (const city of others) {
      const planned = p.travel.plan(userId, { mapKey: Number(city.map_key), x: city.cell_x, y: city.cell_y });
      expect(planned.ok || planned.problem).toBe(true);
      if (planned.ok && (!far || planned.plan.route.length > far.maps))
        far = { city, maps: planned.plan.route.length };
    }
    if (!far) throw new Error("no other nation");
    const target = { mapKey: Number(far.city.map_key), x: far.city.cell_x, y: far.city.cell_y };
    // 옛 상한(64장)으로는 이 국가에 길이 없었다(no_route — 사용자 지적의 까닭 하나)
    expect(far.maps).toBeGreaterThan(OPEN_SEARCH_MAPS);
    expect(mapRoute(open, target.mapKey, (key) => world.maps.has(key), OPEN_SEARCH_MAPS)).toBeNull();
    const planned = p.travel.plan(userId, target);
    expect(planned.ok && planned.plan.hiddenMaps).toBeGreaterThan(0);
    expect((await p.travel.start(userId, { ...target, unitId, kind: "move" })).ok).toBe(true);
    // 첫 구간을 걷고 건너뛰기 시작한 뒤 서버를 다시 켠다
    const leg = world.maps.get(open)?.unitInfo(unitId);
    if (!leg) throw new Error("not walking");
    clock = arrivalAt(leg.motion);
    p.travel.runDue();
    await flush();
    expect(mapOf(world, unitId)).toBeUndefined();
    await p.writer.durable();
    await world.stop();
    worlds.splice(worlds.indexOf(world), 1);

    const again = await boot();
    const second = await travelUntilDone(again, userId, unitId);
    expect(second.view?.state).toBe("arrived");
    expect(second.hiddenSeen).toBe(true);
    expect(mapOf(again, unitId)).toBe(target.mapKey);
    expect(await again.checkInvariants()).toEqual([]);
  });

  it("좌표 이동(ADR 2026-11-15): 띄우지 않은 옆 2차맵에 닿으면 띄우지 않고 좌표 유닛으로 선다 — 다시 켜도 좌표 유닛, 보면 띄우고, 떠나 한가하면 내린다", async () => {
    const world = await boot();
    const cities = await startCities();
    const capital = cities[0];
    if (!capital) throw new Error("no start city");
    const userId = await newUser("SpawnTraveler");
    const unitId = await makeCyborg(world, userId, Number(capital.id));
    const p = persistence(world);
    const start = Number(capital.map_key);
    const seedMaps = world.maps.size;
    const closed = neighbors4(parseCellKey(start)).find((key) => !world.maps.has(key));
    if (closed === undefined) throw new Error("no unopened neighbour");
    expect(p.spawn.canOpen(closed)).toBe(true);

    // 보내기 → 변 끝 → 좌표로 (128, 128)까지 → 좌표 유닛(2차맵을 띄우지 않는다)
    expect((await p.travel.start(userId, { mapKey: closed, x: 128, y: 128, unitId, kind: "move" })).ok).toBe(
      true,
    );
    const first = await travelUntilDone(world, userId, unitId);
    expect(first.view?.state).toBe("arrived");
    expect(world.maps.size).toBe(seedMaps);
    expect(mapOf(world, unitId)).toBeUndefined();
    expect(p.travel.parkedAt(unitId)).toEqual({ mapKey: closed, cellX: 128, cellY: 128 });
    // 1차맵 내 자리 = 그 좌표(열 수 있다 — hidden 아님)
    expect(p.travel.coordinateUnits(new Set([world.ownerOfUser?.(userId) ?? -1]))).toMatchObject([
      { unitId, mapKey: closed, moving: false },
    ]);
    await p.writer.durable();
    const saved = await rows<{ map_key: string }>(test.db, `select map_key from world_units where id = $1`, [
      unitId,
    ]);
    expect(Number(saved[0]?.map_key)).toBe(closed);
    expect(await world.checkInvariants()).toEqual([]);

    // 다시 켜면 그 2차맵은 띄우지 않고 좌표 유닛으로 장부에 든다
    await world.stop();
    worlds.splice(worlds.indexOf(world), 1);
    const again = await boot();
    const q = persistence(again);
    expect(again.maps.has(closed)).toBe(false);
    expect(q.travel.parkedAt(unitId)).toEqual({ mapKey: closed, cellX: 128, cellY: 128 });
    expect(await again.checkInvariants()).toEqual([]);
    // 남은 그 2차맵을 띄울 까닭이 없다(내 유닛이 없다), 주인이 보면 띄운다
    expect(await again.openForView?.("stranger", closed, false)).toBe("refused");
    expect(await again.openForView?.(userId, closed, false)).toBe("ok");
    expect(mapOf(again, unitId)).toBe(closed);
    expect(q.travel.parkedAt(unitId)).toBeUndefined();
    expect(q.spawn.takeMetrics()).toMatchObject({ mapViewOpens: 1 });
    // 띄운 뒤로는 다른 2차맵과 같다: 같은 나라 시야 공유도 걸린다(그 나라 NPC 주체로 보면 내 유닛이 보인다)
    const nation = q.cyborgs.record(userId)?.factionId;
    const nationOwner = [...q.owners.values()].find(
      (owner) => owner.factionId === nation && owner.userId === null,
    );
    expect(nationOwner).toBeDefined();
    const sameNation = {
      userId: "same-nation-viewer",
      ownerId: nationOwner?.id,
      nations: nationLookupOf(again),
    };
    expect(again.map(closed)?.vision.sees(sameNation, unitId)).toBe(true);
    expect(again.map(closed)?.vision.sees({ userId: "stranger", ownerId: undefined }, unitId)).toBe(false);

    // 수도로 돌아가면 그 2차맵이 한가해진다 → idle(설정 칸 10분)이 지나면 내린다
    const back = { mapKey: start, x: capital.cell_x, y: capital.cell_y };
    expect((await q.travel.start(userId, { ...back, unitId, kind: "move" })).ok).toBe(true);
    const returned = await travelUntilDone(again, userId, unitId);
    expect(returned.view?.state).toBe("arrived");
    expect(mapOf(again, unitId)).toBe(start);
    q.spawn.sweep();
    clock += TEST_SOCIETY_COEFFICIENTS.worldSeed.mapSpawnIdleMs;
    q.spawn.sweep();
    expect(again.maps.has(closed)).toBe(false);
    expect(q.spawn.onDemand.size).toBe(0);
    expect(await again.checkInvariants()).toEqual([]);
  });

  it("좌표 유닛이 서 있는 띄운 2차맵은 보는 사람이 떠나 한가하면 내리며 그 유닛을 좌표 유닛으로 둔다", async () => {
    const world = await boot();
    const cities = await startCities();
    const capital = cities[0];
    if (!capital) throw new Error("no start city");
    const userId = await newUser("ParkWalker");
    const unitId = await makeCyborg(world, userId, Number(capital.id));
    const p = persistence(world);
    const start = Number(capital.map_key);
    const closed = neighbors4(parseCellKey(start)).find((key) => !world.maps.has(key));
    if (closed === undefined) throw new Error("no unopened neighbour");
    expect((await p.travel.start(userId, { mapKey: closed, x: 100, y: 100, unitId, kind: "move" })).ok).toBe(
      true,
    );
    await travelUntilDone(world, userId, unitId);
    expect(await world.openForView?.(userId, closed, false)).toBe("ok");
    expect(mapOf(world, unitId)).toBe(closed);
    // 아무도 보지 않고 유닛은 쉰다 → idle 뒤 내리고 유닛은 그 자리의 좌표 유닛
    p.spawn.sweep();
    clock += TEST_SOCIETY_COEFFICIENTS.worldSeed.mapSpawnIdleMs;
    p.spawn.sweep();
    expect(world.maps.has(closed)).toBe(false);
    expect(p.travel.parkedAt(unitId)?.mapKey).toBe(closed);
    await p.writer.durable();
    const saved = await rows<{ map_key: string }>(test.db, `select map_key from world_units where id = $1`, [
      unitId,
    ]);
    expect(Number(saved[0]?.map_key)).toBe(closed);
    expect(await world.checkInvariants()).toEqual([]);
  });
});
