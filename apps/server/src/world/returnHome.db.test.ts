// 적색 부상 귀환 DB 통합 시험(사용자 결정 D-594 + 보충 "유닛도 동일. 적색부상 사망은 주거지 귀환 없으면 소속도시, 없으면 소속국가 정부건물로 귀환" + 보충 2
// "적색부상이 아닌 다른 부상은 강제 귀환되지 않고 다시 싸울 수 있다", 줄기 return-home) — TEST_DATABASE_URL이 있을 때만. 계정은 가짜 값이다.
// NPC 사회 세계(시험 국가 셋)에서: 돌아갈 곳 차례(사는 곳 같은 2차맵·다른 2차맵 → 소속 도시 → 소속 국가 정부 건물)를 플레이어·NPC 유닛으로 보고,
// 실제 전투 결과로 빨강만 돌아가는지(가벼운 부상은 그 자리) 본다.
import { loadContentPack } from "@terra/content/node";
import { DAY_MS, TEST_SOCIETY_COEFFICIENTS, anchorAt, footprintRect, positionAt } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { economyCatalogFromPack } from "../economyView/catalog.ts";
import { serverEconomyCatalogAccessor } from "../market/catalog.ts";
import { nationPresetsOf } from "../npc/presets.ts";
import { giveTestHouse } from "../factionIdentity/testHouses.ts";
import { createResidenceBook, registerResidenceBook } from "../residence/book.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { addTestUnits, legacyNationPresets, silentLog, testEncounter } from "./testSupport.ts";
import { INJURY_CRITICAL, configureInjuryRules, injuryAt } from "./unitCondition.ts";
import { houseTiesOf } from "./houseTies.ts";
import { UNIT_KIND_BOT } from "./unitKinds.ts";
import { type World, startWorld } from "./world.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source || !loaded.pack) throw new Error("content pack");
const pack = createContentEditState(loaded.source).effective();
const presets = legacyNationPresets(nationPresetsOf(loaded.pack));
const economy = serverEconomyCatalogAccessor(
  economyCatalogFromPack(loaded.pack, { version: "core@test", placeholder: true }),
  () => pack,
);

let test: TestDatabase;
const worlds: World[] = [];
let clock = 0;

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
  clock = 1_800_000_000_000 - (1_800_000_000_000 % DAY_MS) + 3_600_000;
});
afterEach(async () => {
  configureInjuryRules(undefined);
  if (!TEST_DATABASE_URL) return;
  for (const world of worlds.splice(0)) await world.stop().catch(() => undefined);
  await test.drop();
});

async function boot(): Promise<World> {
  const world = startWorld({
    testBots: 12,
    testMaps: 3,
    paths: { kind: "inline" },
    now: () => clock,
    log: silentLog,
    pool: test.db.$client,
    writeIntervalMs: 10,
    onFatal: (error) => {
      throw error;
    },
    npc: { testNations: 3, manual: true, presets },
    holdings: { content: () => pack },
    facilities: { content: () => pack },
    economy,
  });
  worlds.push(world);
  await world.ready;
  return world;
}

function parts(world: World) {
  const persistence = world.persistence;
  const npc = world.npc;
  if (!persistence || !npc) throw new Error("world");
  return { persistence, npc };
}

async function waitFor(check: () => boolean | Promise<boolean>): Promise<void> {
  for (let i = 0; i < 300; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("timed out");
}

/** 가짜 사용자 + 첫 나라 첫 도시의 사이보그(시민권 나라·내 도시) */
async function citizen(world: World, name: string) {
  const { persistence } = parts(world);
  const found = await rows<{ id: string }>(
    test.db,
    `insert into users (name, email, username) values ($1, $2, $3) returning id`,
    [`Fake_${name}`, `fake-${name}@id.placeholder.invalid`, `fake_${name}`],
  );
  const userId = String(found[0]?.id);
  const faction = persistence.cyborgs.creation(userId, clock).factions[0];
  const city = faction?.cities[0];
  if (!faction || !city) throw new Error("no start city");
  await persistence.cyborgs.roll(userId, "balanced");
  const made = await persistence.cyborgs.create(userId, {
    name,
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
  if (!made.ok) throw new Error(`cyborg ${made.code}`);
  await persistence.writer.durable();
  return { userId, nation: faction.id, cityId: city.id };
}

/**
 * 그 사용자에게 소속 도시가 있는 가문을 주고 그 유닛들을 가문에 적는다(D-569 유닛 → 가문 → 도시 — 소속 도시 = 가문 도시, fixes-1117k 2755). 가문 행 ID
 */
async function houseIn(world: World, userId: string, cityId: number, unitIds: readonly number[]) {
  const { persistence } = parts(world);
  const house = await giveTestHouse(test.db.$client, userId);
  await test.db.$client.query(
    "insert into house_homes (faction_id, city_id, set_at_ms) values ($1, $2, 0) on conflict (faction_id) do update set city_id = excluded.city_id",
    [house, cityId],
  );
  const ties = houseTiesOf(persistence);
  await ties?.reload();
  for (const unitId of unitIds) ties?.assignUnit(unitId, userId, clock);
  await persistence.writer.durable();
  return house;
}

/** 그 도시의 시청 칸(world_cities) */
async function cityCell(cityId: number) {
  const found = await rows<{ map_key: string; cell_x: string; cell_y: string }>(
    test.db,
    `select map_key, cell_x, cell_y from world_cities where id = $1`,
    [cityId],
  );
  const row = found[0];
  if (!row) throw new Error(`no city ${cityId}`);
  return { mapKey: Number(row.map_key), x: Number(row.cell_x), y: Number(row.cell_y) };
}

/** 그 도시 행정 건물(government_hall)의 2차맵·기준 칸 */
function hallOf(world: World, cityId: number) {
  const { persistence } = parts(world);
  for (const [id, record] of persistence.facilities.service.facilities) {
    if (record.facilityId !== "government_hall" || record.cityId !== cityId) continue;
    for (const map of world.maps.values()) {
      let cell: { mapKey: number; x: number; y: number } | undefined;
      map.forEachBuilding((building) => {
        if (building.id === id) cell = { mapKey: map.mapKey, x: building.x, y: building.y };
      });
      if (cell) return cell;
    }
  }
  return undefined;
}

/** 그 2차맵(또는 다른 2차맵)의 건물 하나와 가운데 칸 */
function buildingOn(world: World, pick: (mapKey: number) => boolean) {
  for (const map of world.maps.values()) {
    if (!pick(map.mapKey)) continue;
    let found: { id: number; mapKey: number; x: number; y: number } | undefined;
    map.forEachBuilding((building) => {
      if (found) return;
      const rect = footprintRect(building.placement);
      found = {
        id: building.id,
        mapKey: map.mapKey,
        x: rect.x + (rect.width >> 1),
        y: rect.y + (rect.height >> 1),
      };
    });
    if (found) return found;
  }
  throw new Error("no building");
}

/** 띄운 2차맵에 선, 사는 도시가 있는 NPC 휴먼 하나 */
function npcHuman(world: World) {
  const { npc } = parts(world);
  for (const unit of [...npc.world.units.values()].toSorted((a, b) => a.id - b.id)) {
    if (unit.city === 0) continue;
    for (const map of world.maps.values()) {
      const info = map.unitInfo(unit.id);
      if (info?.kind === UNIT_KIND_BOT) return { unit, map, info };
    }
  }
  throw new Error("no npc human");
}

/** 그 유닛이 선 2차맵과 칸 */
function whereIs(world: World, unitId: number) {
  for (const map of world.maps.values()) {
    const info = map.unitInfo(unitId);
    if (info) return { mapKey: map.mapKey, ...anchorAt(positionAt(info.motion, clock), info.size), info };
  }
  return undefined;
}

const near = (p: { x: number; y: number } | undefined, q: { x: number; y: number } | undefined) =>
  p !== undefined && q !== undefined && Math.abs(p.x - q.x) + Math.abs(p.y - q.y) < 20;

describe.skipIf(!TEST_DATABASE_URL)("적색 부상 귀환 (D-594 보충)", () => {
  it("돌아갈 곳 차례(사는 곳 같은·다른 2차맵 → 소속 도시 → 정부 건물 → 적대 아닌 가까운 도시)와 바로 옮기기 — 플레이어·NPC 유닛", async () => {
    const world = await boot();
    const { persistence: p, npc } = parts(world);
    const me = await citizen(world, "home");
    // 건물이 선 2차맵(here)과 다른 2차맵에 플레이어 유닛을 하나씩 둔다
    const here = buildingOn(world, () => true);
    const otherKey = [...world.maps.keys()].find((key) => key !== here.mapKey);
    if (otherKey === undefined) throw new Error("one map");
    const [unit = 0, loose = 0] = addTestUnits(world, me.userId, here.mapKey, 2, clock);
    const [far = 0] = addTestUnits(world, me.userId, otherKey, 1, clock);
    const owner = p.settlement.ownerOfUser(me.userId, clock).id;
    const bot = npcHuman(world);
    // unit·far는 내 가문(소속 도시 = 내 도시)에 든다. loose는 무소속(가문 없음 — 소속 도시 = 사이보그의 내 도시, 2774)
    await houseIn(world, me.userId, me.cityId, [unit, far]);

    // 2) 소속 도시: 플레이어 = 그 유닛 가문의 소속 도시(D-569), NPC = 거울 휴먼의 사는 도시(시청 칸)
    const myCity = await cityCell(me.cityId);
    expect(p.unitHome.homeOf(unit, owner)).toEqual({ ...myCity, tier: "home_city" });
    // 가문 없는 유닛도 소속 도시 차례를 건너뛰지 않는다(2774 — 주인 사이보그의 내 도시)
    expect(p.unitHome.homeOf(loose, owner)).toEqual({ ...myCity, tier: "home_city" });
    const botCity = await cityCell(bot.unit.city);
    expect(p.unitHome.homeOf(bot.unit.id, bot.info.ownerId)).toEqual({ ...botCity, tier: "home_city" });

    // 1) 사는 곳이 먼저: 같은 2차맵(unit)·다른 2차맵(far) 건물 — 숙소 배정 길로 잇는다
    const lodging = new Map([
      [unit, { buildingId: here.id, cityId: me.cityId }],
      [far, { buildingId: here.id, cityId: me.cityId }],
    ]);
    registerResidenceBook(
      p.ledger,
      createResidenceBook({
        unitOwner: () => undefined,
        building: () => undefined,
        lodgingOf: (unitId) => lodging.get(unitId),
      }),
    );
    const home = { mapKey: here.mapKey, x: here.x, y: here.y, tier: "residence" };
    expect(p.unitHome.homeOf(unit, owner)).toEqual(home);
    expect(p.unitHome.homeOf(far, owner)).toEqual(home);
    // 바로 옮기기(D-594 보충 3): 같은 2차맵은 그 둘레로, 다른 2차맵은 그 2차맵으로 — 걷지 않는다
    const target = p.unitHome.homeOf(far, owner);
    const fromMap = world.maps.get(otherKey);
    if (!target || !fromMap) throw new Error("no target");
    expect(p.unitHome.teleport(fromMap, far, owner, target, clock)).toBe(true);
    const landed = whereIs(world, far);
    expect(landed?.mapKey).toBe(here.mapKey);
    expect(near(landed, here)).toBe(true);
    expect(landed?.info.motion.waypoints).toHaveLength(1);
    lodging.clear();

    // 3) 소속 도시가 없으면(NPC 노숙) 소속 국가 수도의 행정 건물
    const city = bot.unit.city;
    bot.unit.city = 0;
    const botCapital = npc.capitalOf(bot.info.ownerId);
    if (botCapital === undefined) throw new Error("no npc capital");
    const botHall = hallOf(world, botCapital);
    if (!botHall) throw new Error("no hall");
    const botTarget = { ...botHall, tier: "government" as const };
    expect(p.unitHome.homeOf(bot.unit.id, bot.info.ownerId)).toEqual(botTarget);
    // NPC 휴먼(봇)도 바로 옮긴다 — 정부 건물 둘레로(다른 2차맵이면 그 2차맵으로)
    expect(p.unitHome.teleport(bot.map, bot.unit.id, bot.info.ownerId, botTarget, clock)).toBe(true);
    const botLanded = whereIs(world, bot.unit.id);
    expect(botLanded?.mapKey).toBe(botHall.mapKey);
    expect(near(botLanded, botHall)).toBe(true);
    bot.unit.city = city;

    // 4) 나라도 모르면(시민권이 없는 사용자) 적대 세력이 아닌 가까운 도시 — 같은 2차맵 도시
    const stranger = await rows<{ id: string }>(
      test.db,
      `insert into users (name, email, username) values ('Fake_str', 'fake-str@id.placeholder.invalid', 'fake_str') returning id`,
    );
    const strangerId = String(stranger[0]?.id);
    const cityMapKey = myCity.mapKey;
    const [lost = 0] = addTestUnits(world, strangerId, cityMapKey, 1, clock);
    const lostOwner = p.settlement.ownerOfUser(strangerId, clock).id;
    const at = whereIs(world, lost);
    if (!at) throw new Error("no unit");
    const nearby = p.unitHome.homeOf(lost, lostOwner, { mapKey: at.mapKey, x: at.x, y: at.y });
    expect(nearby?.tier).toBe("nearby_city");
    expect(nearby?.mapKey).toBe(cityMapKey);
    expect(await world.checkInvariants()).toEqual([]);
  }, 120_000);

  it("빨강만 바로 돌아간다(다른 2차맵 소속 도시로 옮겨 저장), 가벼운 부상은 그 자리에서 다시 싸울 수 있다", async () => {
    // 쓰러지면 늘 흰 부상(가벼움) — 빨강은 미리 둔다(전투 부상은 더 낮은 단계로 덮지 않는다)
    configureInjuryRules(() => ({
      ...TEST_SOCIETY_COEFFICIENTS.injury,
      combatDownedStagePm: [0, 1000, 0, 0],
    }));
    const first = await boot();
    const p = parts(first).persistence;
    const me = await citizen(first, "loser");
    const myCity = await cityCell(me.cityId);
    // 진 유닛은 내 도시가 아닌 2차맵에 둔다(빨강은 다른 2차맵의 내 도시로 옮겨진다)
    const fightKey = [...first.maps.keys()].find((key) => key !== myCity.mapKey);
    if (fightKey === undefined) throw new Error("one map");
    const winnerUser = await rows<{ id: string }>(
      test.db,
      `insert into users (name, email, username) values ('Fake_win', 'fake-win@id.placeholder.invalid', 'fake_win') returning id`,
    );
    const winner = String(winnerUser[0]?.id);
    const [w1 = 0, w2 = 0] = addTestUnits(first, winner, fightKey, 2, clock);
    const [red = 0, light = 0] = addTestUnits(first, me.userId, fightKey, 2, clock);
    const ownerW = p.settlement.ownerOfUser(winner, clock).id;
    const ownerL = p.settlement.ownerOfUser(me.userId, clock).id;
    await houseIn(first, me.userId, me.cityId, [red, light]);
    first.maps.get(fightKey)?.setCondition(red, { injury: 3, injuryUntilMs: clock + DAY_MS, heldBy: null });
    const lightAt = whereIs(first, light);
    // NPC 휴먼(봇)도 빨강으로 진다(기획 검토 2754): 꺼진 동안 끝난 전투도 NPC 사회 런타임이 켜진 뒤 적용 → 소속 도시(거울 세계 사는 도시)로
    const { npc } = parts(first);
    const bot = (() => {
      for (const unit of [...npc.world.units.values()].toSorted((a, b) => a.id - b.id)) {
        if (unit.city === 0 || npc.capitalOf(unit.owner) === unit.city) continue;
        for (const map of first.maps.values()) {
          const info = map.unitInfo(unit.id);
          if (info?.kind === UNIT_KIND_BOT) return { unit, map };
        }
      }
      throw new Error("no npc human outside a capital");
    })();
    const botCity = await cityCell(bot.unit.city);
    bot.map.setCondition(bot.unit.id, { injury: 3, injuryUntilMs: clock + DAY_MS, heldBy: null });
    const base = testEncounter([w1, w2, red, light], [ownerW, ownerL]);
    const loser = base.units.find((spec) => spec.id === light);
    if (!loser) throw new Error("no fighter");
    // 이긴 편이 훨씬 세다 → 진 편 전멸(평화 전투 — 포로 없음)
    const init = {
      ...base,
      units: [...base.units, { ...loser, id: bot.unit.id }].map((spec) =>
        spec.side === 1 ? { ...spec, maxHp: 5000 } : spec,
      ),
    };
    const battleId = await p.battles.start(init, { war: false });
    const endsAtMs = (await p.battles.get(battleId))?.endsAtMs ?? 0;
    await p.writer.durable();
    await first.stop();

    // 끝 시각이 지난 뒤 다시 켠다 → 곧바로 적용
    clock = endsAtMs + 1_000;
    const second = await boot();
    const q = parts(second).persistence;
    await waitFor(async () => (await q.battles.get(battleId))?.status === "ended");
    // 가벼운 부상(흰): 그 자리, 돌아가는 중 아님 — 쓸 수 있다
    const lightNow = whereIs(second, light);
    expect(lightNow?.mapKey).toBe(fightKey);
    expect(lightNow && { x: lightNow.x, y: lightNow.y }).toEqual(lightAt && { x: lightAt.x, y: lightAt.y });
    expect(lightNow && injuryAt(lightNow.info.condition, clock)).toBe(1);
    expect(lightNow?.info.condition.returningUntilMs).toBeUndefined();
    // 빨강: 다른 2차맵의 내 도시 시청 칸 둘레로 바로(다친 채)
    const redNow = whereIs(second, red);
    expect(redNow?.mapKey).toBe(myCity.mapKey);
    expect(near(redNow, myCity)).toBe(true);
    expect(redNow && injuryAt(redNow.info.condition, clock)).toBeGreaterThanOrEqual(INJURY_CRITICAL);
    expect(redNow?.info.condition.returningUntilMs).toBeUndefined();
    // 빨강 NPC 휴먼: 소속 도시(사는 도시) 시청 칸 둘레 — 정부 건물(수도)로 가지 않는다(2754)
    const botNow = whereIs(second, bot.unit.id);
    expect(botNow?.mapKey).toBe(botCity.mapKey);
    expect(near(botNow, botCity)).toBe(true);
    // 옮긴 자리는 저장된다
    await q.writer.durable();
    const saved = await rows<{ id: string; map_key: string; returning_until_ms: string | null }>(
      test.db,
      `select id, map_key, returning_until_ms from world_units where id = any($1) order by id`,
      [[red, light]],
    );
    expect(saved.map((row) => [Number(row.id), Number(row.map_key), row.returning_until_ms])).toEqual(
      [
        [red, myCity.mapKey, null],
        [light, fightKey, null],
      ].toSorted((x, y) => (x[0] ?? 0) - (y[0] ?? 0)),
    );
    expect(await second.checkInvariants()).toEqual([]);
  }, 120_000);
});
