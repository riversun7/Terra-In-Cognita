// 신전·종교 DB 통합 시험(D-517·D-311·D-441·D-451, docs/adr/2026-11-07-temple-religion.md) — TEST_DATABASE_URL이 있을 때만. 계정은 가짜 값이다.
// 수명이 다한 유저 휴먼 = 비활성(떠나지 않음, 노동 계약·융합 막음) → 신전 기도·헌금으로 신앙도 → 환생(레벨 1·수명 다시·환생 +1·신앙도 0) →
// 다시 비활성 → 신격화(수호신 줄, 유닛 떠남, 유전자 없음) / 생명과학 연구소 유전자 변환(유전자를 남기고 떠남)을 본다.
import { loadContentPack } from "@terra/content/node";
import { CELL_UNITS, DAY_MS, OLD_TEMPLE_COEFFICIENTS as C, positionAt } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { silentLog } from "../world/testSupport.ts";
import { ASSET_CREDIT, SYSTEM_ISSUE_CREDIT } from "../world/settlement.ts";
import { type World, startWorld } from "../world/world.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source) throw new Error("content pack");
const pack = createContentEditState(loaded.source).effective();

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
    testBots: 12,
    paths: { kind: "inline" },
    now: () => clock,
    log: silentLog,
    pool: test.db.$client,
    writeIntervalMs: 10,
    onFatal: (error) => {
      throw error;
    },
    npc: { testNations: 2, manual: true },
    holdings: { content: () => pack },
    facilities: { content: () => pack },
  });
  worlds.push(world);
  await world.ready;
  return world;
}

function persistenceOf(world: World) {
  const found = world.persistence;
  if (!found) throw new Error("persistence");
  return found;
}

async function fakeUser(name: string): Promise<string> {
  const found = await rows<{ id: string }>(
    test.db,
    `insert into users (name, email, username) values ($1, $2, $3) returning id`,
    [name, `${name}@id.placeholder.invalid`, name.toLowerCase()],
  );
  return String(found[0]?.id);
}

/** 사이보그를 만들고 시험 화폐를 준 뒤 구인 카드로 휴먼 둘을 고용한다 */
async function withHumans(world: World, name: string) {
  const persistence = persistenceOf(world);
  const userId = await fakeUser(name);
  const creation = persistence.cyborgs.creation(userId, clock);
  const faction = creation.factions[0];
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
  const ownerId = persistence.settlement.ownerOfUser(userId, clock).id;
  const credit = 1_000_000_000n;
  persistence.ledger.post({
    kind: "issue",
    atMs: clock,
    entries: [
      { account: persistence.ledger.systemAccount(SYSTEM_ISSUE_CREDIT, ASSET_CREDIT), amount: -credit },
      { account: persistence.ledger.ownerAccount(ownerId, ASSET_CREDIT), amount: credit },
    ],
  });
  const board = persistence.recruits.board({ id: userId, owner: false }, undefined, clock);
  if (!board || board.cityId === null) throw new Error("no board");
  const units: number[] = [];
  for (const card of board.cards.slice(0, 2)) {
    const hired = await persistence.recruits.hire(userId, {
      cityId: board.cityId,
      window: board.window,
      slot: card.slot,
      cost: card.cost,
    });
    if (!hired.ok) throw new Error(`hire ${hired.code}`);
    units.push(hired.unitId);
  }
  await persistence.writer.durable();
  return { userId, ownerId, units };
}

/** 유닛 둘레 빈 칸에 시설을 짓고(그 칸 도시 창고로 시험 재료) 바로 끝낸다. 건물 ID */
async function buildNear(world: World, userId: string, unitId: number, facility: string): Promise<number> {
  const persistence = persistenceOf(world);
  const service = persistence.facilities.service;
  for (const map of world.maps.values()) {
    const info = map.unitInfo(unitId);
    if (!info) continue;
    const point = positionAt(info.motion, clock);
    const cx = Math.floor(point.x / CELL_UNITS);
    const cy = Math.floor(point.y / CELL_UNITS);
    for (const [dx, dy] of [
      [3, 3],
      [-6, 3],
      [3, -6],
      [-6, -6],
      [8, 0],
      [0, 8],
      [-10, 0],
      [0, -10],
      [12, 12],
    ] as const) {
      const at = { mapKey: map.mapKey, x: cx + dx, y: cy + dy };
      for (const item of ["pine_log", "stone"])
        expect(await service.devFacilityGrant(userId, item, 40, at)).toEqual({ ok: true });
      const built = await service.build(userId, { ...at, facility, rotation: 0 });
      if (!built.ok || built.buildingId === undefined) continue;
      expect(await service.devFinish(userId, { buildingId: built.buildingId })).toMatchObject({ ok: true });
      return built.buildingId;
    }
  }
  throw new Error(`no room for ${facility}`);
}

describe.skipIf(!TEST_DATABASE_URL)("신전·종교(D-517)", () => {
  it("비활성 → 기도·헌금 → 환생 → 다시 비활성 → 신격화, 다른 휴먼은 연구소에서 유전자로 변환", async () => {
    const world = await boot();
    const persistence = persistenceOf(world);
    const { fusion, ledger } = persistence;
    const temple = fusion.temple;
    const { userId, ownerId, units } = await withHumans(world, "TempleOne");
    const [first, second] = units;
    if (first === undefined || second === undefined) throw new Error("two humans");
    const templeId = await buildNear(world, userId, first, "temple");
    const labId = await buildNear(world, userId, second, "biotech_lab");

    let view = await temple.overview({ id: userId, devGrant: true }, clock);
    expect(view.status).toBe("ready");
    expect(view.rules.inactiveCapMs).toBe(0);
    expect(view.temples.map((t) => [t.buildingId, t.works, t.mine])).toEqual([[templeId, true, true]]);
    expect(view.labs.map((t) => t.buildingId)).toEqual([labId]);
    const templeCity = view.temples[0]?.cityId;
    expect(view.humans.find((h) => h.unitId === first)?.cityId).toBe(templeCity);
    expect(view.humans.every((h) => !h.inactive && h.departsAtMs === null)).toBe(true);

    // 비활성이 아니면 의식·변환을 받지 않는다
    const rebirthCost = String(C.rebirthCurrency);
    expect(
      await temple.rite(userId, { buildingId: templeId, unit: first, rite: "rebirth", cost: rebirthCost }),
    ).toEqual({
      ok: false,
      code: "not_inactive",
    });
    expect(await fusion.convert(userId, { buildingId: labId, unit: second, cost: "1000" })).toEqual({
      ok: false,
      code: "not_inactive",
    });
    // 신전이 아닌 건물·연구소가 아닌 건물
    expect(await temple.pray(userId, { buildingId: labId })).toEqual({ ok: false, code: "not_temple" });
    expect(await fusion.convert(userId, { buildingId: templeId, unit: second, cost: "1000" })).toEqual({
      ok: false,
      code: "not_lab",
    });

    // 비활성 만들기(시험): 떠나지 않고 남는다(상한 없음), 융합을 받지 않는다
    expect(await temple.devInactivate(userId, { unit: first })).toEqual({ ok: true, unitId: first });
    expect(await temple.devInactivate(userId, { unit: first })).toEqual({
      ok: false,
      code: "already_inactive",
    });
    expect(temple.isInactive(first)).toBe(true);
    clock += 10 * DAY_MS;
    expect(await fusion.expireDue(clock)).toBe(0);
    expect(await fusion.fuse(userId, { human: first, cost: "5000" })).toEqual({
      ok: false,
      code: "wrong_kind",
    });
    view = await temple.overview({ id: userId, devGrant: true }, clock);
    expect(view.humans.find((h) => h.unitId === first)).toMatchObject({ inactive: true, departsAtMs: null });

    // 신앙도: 문턱(50) 아래면 faith_low → 기도(+1, 1시간 쿨다운) → 헌금 2,450(+49) = 50
    expect(
      await temple.rite(userId, { buildingId: templeId, unit: first, rite: "rebirth", cost: rebirthCost }),
    ).toEqual({
      ok: false,
      code: "faith_low",
    });
    expect(await temple.pray(userId, { buildingId: templeId })).toEqual({ ok: true, gained: 1, faith: 1 });
    expect(await temple.pray(userId, { buildingId: templeId })).toEqual({ ok: false, code: "cooldown" });
    const beforeOffer = ledger.balanceOf(ownerId, ASSET_CREDIT);
    expect(await temple.offer(userId, { buildingId: templeId, amount: "2450" })).toEqual({
      ok: true,
      gained: 49,
      faith: 50,
    });
    // 내 신전 헌금은 소각된다 [임시]
    expect(ledger.balanceOf(ownerId, ASSET_CREDIT)).toBe(beforeOffer - 2450n);
    view = await temple.overview({ id: userId, devGrant: true }, clock);
    expect(view.cyborgFaith).toEqual({ faith: 50, faithPoints: 50 });
    expect(view.humans.map((h) => h.faith)).toEqual([50, 50]);
    expect(view.prayReadyAtMs).toBe(clock + C.prayCooldownMs);

    // 환생: 본 값이 다르면 거절 → 레벨 1·태어난 시각 = 지금·환생 +1·신앙도 0, 다시 일한다
    expect(
      await temple.rite(userId, { buildingId: templeId, unit: first, rite: "rebirth", cost: "1" }),
    ).toEqual({
      ok: false,
      code: "cost_changed",
    });
    expect(
      await temple.rite(userId, { buildingId: templeId, unit: first, rite: "rebirth", cost: rebirthCost }),
    ).toEqual({
      ok: true,
      unitId: first,
    });
    const reborn = await rows<{ level: number; rebirths: number; born_at_ms: string }>(
      test.db,
      `select level, rebirths, born_at_ms from world_humans where unit_id = $1`,
      [first],
    );
    expect(reborn[0]).toMatchObject({ level: 1, rebirths: 1 });
    expect(Number(reborn[0]?.born_at_ms)).toBe(clock);
    expect(temple.isInactive(first)).toBe(false);
    view = await temple.overview({ id: userId, devGrant: true }, clock);
    expect(view.humans.find((h) => h.unitId === first)).toMatchObject({
      inactive: false,
      faith: 0,
      rebirths: 1,
    });

    // 다시 비활성 → 헌금 5,000(+100) → 신격화: 수호신 줄, 유닛·휴먼 행이 떠난다(유전자 없음)
    expect(await temple.devInactivate(userId, { unit: first })).toMatchObject({ ok: true });
    expect(await temple.offer(userId, { buildingId: templeId, amount: "5000" })).toMatchObject({ ok: true });
    const genesBefore = (await fusion.overview({ id: userId, devGrant: true }, clock)).genes.length;
    expect(
      await temple.rite(userId, {
        buildingId: templeId,
        unit: first,
        rite: "deify",
        cost: String(C.deifyCurrency),
      }),
    ).toEqual({ ok: true, unitId: first });
    view = await temple.overview({ id: userId, devGrant: true }, clock);
    expect(view.guardians.map((g) => [g.unitId, g.cityId, g.mine])).toEqual([[first, templeCity, true]]);
    expect(view.temples[0]?.guardians).toBe(1);
    expect(view.humans.map((h) => h.unitId)).toEqual([second]);
    expect(await rows(test.db, `select 1 from world_units where id = $1`, [first])).toEqual([]);
    expect((await fusion.overview({ id: userId, devGrant: true }, clock)).genes.length).toBe(genesBefore);

    // 다른 휴먼: 비활성 → 생명과학 연구소에서 유전자로 변환(스탯 유전자가 남고 유닛이 떠난다)
    expect(await temple.devInactivate(userId, { unit: second })).toMatchObject({ ok: true });
    expect(await fusion.convert(userId, { buildingId: labId, unit: second, cost: "5" })).toEqual({
      ok: false,
      code: "cost_changed",
    });
    const converted = await fusion.convert(userId, { buildingId: labId, unit: second, cost: "1000" });
    if (!converted.ok) throw new Error(`convert ${converted.code}`);
    expect(converted.unitId).toBe(second);
    expect(converted.genes?.length ?? 0).toBeGreaterThanOrEqual(1);
    const after = await fusion.overview({ id: userId, devGrant: true }, clock);
    expect(after.genes.length).toBe(genesBefore + (converted.genes?.length ?? 0));
    expect(after.humans).toEqual([]);
  });

  it("비활성 휴먼의 노동 계약은 끝나고 새 계약을 맺지 못한다(unit_busy)", async () => {
    const world = await boot();
    const persistence = persistenceOf(world);
    const { userId, units } = await withHumans(world, "TempleTwo");
    const [unit] = units;
    if (unit === undefined) throw new Error("human");
    expect(await persistence.fusion.temple.devInactivate(userId, { unit })).toMatchObject({ ok: true });
    expect(persistence.labor.unitBusy(unit)).toBe(true);
    // 수명이 다한 휴먼은 1분 표가 다시 만들어도 남는다(떠나지 않음)
    clock += 120_000;
    await persistence.fusion.expireDue(clock);
    expect(persistence.fusion.temple.isInactive(unit)).toBe(true);
  });
});
