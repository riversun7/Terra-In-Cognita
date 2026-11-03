// 구인 카드 DB 통합 시험(D-469, 49 N45) — TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
// NPC 세력 구인(거울 세계 society.recruit → 봇 + 휴먼 행 레벨·스탯·속성 + recruit_draws, 다시 켜면 이어짐)과
// 유저 구인(recruit.board 조회 → recruit_hire: 값 소각, 휴먼 유닛 종류 4, 산 칸, 거절 코드)을 본다.
import { DAY_MS } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { silentLog } from "../world/testSupport.ts";
import { ASSET_CREDIT, SYSTEM_ISSUE_CREDIT } from "../world/settlement.ts";
import { UNIT_KIND_HUMAN } from "../world/unitKinds.ts";
import { type World, startWorld } from "../world/world.ts";

let test: TestDatabase;
const worlds: World[] = [];
let clock = 0;

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
  // UTC 0시에서 한 시간 뒤(하루 끝·12시간 창 경계와 멀게)
  clock = 1_800_000_000_000 - (1_800_000_000_000 % DAY_MS) + 3_600_000;
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  for (const world of worlds.splice(0)) await world.stop().catch(() => undefined);
  await test.drop();
});

async function boot(testBots = 12): Promise<World> {
  const world = startWorld({
    testBots,
    paths: { kind: "inline" },
    now: () => clock,
    log: silentLog,
    pool: test.db.$client,
    writeIntervalMs: 10,
    onFatal: (error) => {
      throw error;
    },
    npc: { testNations: 2, manual: true },
  });
  worlds.push(world);
  await world.ready;
  return world;
}

async function restart(world: World, testBots = 12): Promise<World> {
  await world.stop();
  worlds.splice(worlds.indexOf(world), 1);
  return boot(testBots);
}

const count = async (sql: string, params: unknown[] = []): Promise<number> =>
  Number((await rows<{ n: string }>(test.db, `select count(*) as n from (${sql}) t`, params))[0]?.n ?? 0);

async function fakeUser(name: string): Promise<string> {
  const found = await rows<{ id: string }>(
    test.db,
    `insert into users (name, email, username) values ($1, $2, $3) returning id`,
    [name, `${name}@id.placeholder.invalid`, name.toLowerCase()],
  );
  return String(found[0]?.id);
}

/** 사이보그를 만들고(시작 도시 = 첫 세력의 첫 시작 도시) 시험 화폐를 더 준다 */
async function withCyborg(
  world: World,
  name: string,
  credit: bigint,
): Promise<{ userId: string; ownerId: number }> {
  const persistence = world.persistence;
  if (!persistence) throw new Error("persistence");
  const userId = await fakeUser(name);
  const creation = persistence.cyborgs.creation(userId, clock);
  const faction = creation.factions[0];
  const city = faction?.cities[0];
  if (!faction || !city) throw new Error("no start city");
  await persistence.cyborgs.roll(userId, "balanced");
  const made = await persistence.cyborgs.create(userId, {
    // 사이보그 이름 규칙은 밑줄을 받지 않는다
    name: name.replaceAll("_", ""),
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
  if (credit > 0n)
    persistence.ledger.post({
      kind: "issue",
      atMs: clock,
      entries: [
        { account: persistence.ledger.systemAccount(SYSTEM_ISSUE_CREDIT, ASSET_CREDIT), amount: -credit },
        { account: persistence.ledger.ownerAccount(ownerId, ASSET_CREDIT), amount: credit },
      ],
    });
  await persistence.writer.durable();
  return { userId, ownerId };
}

describe.skipIf(!TEST_DATABASE_URL)("구인 카드(D-469)", () => {
  it("NPC 세력 구인: 봇 + 휴먼 행(레벨 1·카드 스탯·속성 12칸) + 산 칸을 저장하고, 다시 켜면 이어 돈다", async () => {
    const world = await boot();
    const npc = world.npc;
    if (!npc || !world.persistence) throw new Error("npc runtime");
    const city = [...npc.world.cities.values()][0];
    const owner = city ? npc.world.factions.get(city.owner) : undefined;
    if (!city || !owner) throw new Error("no city");
    expect(city.adminLevel).toBe(1);
    const view = npc.society.recruitView(owner, city.id, clock);
    const card = view?.cards[0];
    if (!view || !card) throw new Error("no card");
    const before = npc.world.book.balanceOf(owner.id, ASSET_CREDIT);
    const unit = npc.society.recruit(owner, city.id, 0, clock);
    if (!unit) throw new Error("not hired");
    await npc.tick(true);
    await world.persistence.writer.durable();
    expect(npc.world.book.balanceOf(owner.id, ASSET_CREDIT)).toBe(before - card.cost);
    const saved = await rows<{ level: number; stats: number[]; elements: number[]; city_id: string }>(
      test.db,
      `select level, stats, elements, city_id from world_humans where unit_id = $1`,
      [unit.id],
    );
    expect(saved[0]?.level).toBe(1);
    expect(saved[0]?.stats.map(Number)).toEqual(card.stats);
    expect(saved[0]?.elements.map(Number).reduce((a, b) => a + b, 0)).toBe(10);
    expect(Number(saved[0]?.city_id)).toBe(city.id);
    expect(await count(`select id from world_units where id = $1 and kind = 0`, [unit.id])).toBe(1);
    const draws = await rows<{ owner_id: string; window_index: string; taken: number }>(
      test.db,
      `select owner_id, window_index, taken from recruit_draws where city_id = $1`,
      [city.id],
    );
    expect(draws.map((d) => [Number(d.owner_id), Number(d.window_index), d.taken])).toEqual([
      [owner.id, view.window, 1],
    ]);
    expect(await world.checkInvariants()).toEqual([]);

    const again = await restart(world);
    const reloaded = again.npc;
    if (!reloaded) throw new Error("npc runtime");
    expect(reloaded.world.cities.get(city.id)?.recruitDraw).toEqual({
      window: view.window,
      taken: 1,
      hirer: owner.id,
    });
    expect(reloaded.world.units.get(unit.id)?.recruit).toEqual({
      level: 1,
      stats: card.stats,
      elements: card.elements,
    });
    // 같은 창의 같은 칸은 다시 못 산다
    const sameOwner = reloaded.world.factions.get(owner.id);
    if (!sameOwner) throw new Error("owner");
    expect(reloaded.society.recruit(sameOwner, city.id, 0, clock)).toBeUndefined();
  });

  it("유저 구인: 조회 → 고용(값 소각, 휴먼 유닛 종류 4, 휴먼 행, 산 칸), 거절 코드, 다시 켜도 산 칸이 남는다", async () => {
    let world = await boot();
    const { userId, ownerId } = await withCyborg(world, "Recruit_User", 1000n);
    const recruits = world.persistence?.recruits;
    if (!recruits) throw new Error("recruits");
    const board = recruits.board({ id: userId, owner: false }, undefined, clock);
    if (!board || board.cityId === null) throw new Error("no board");
    expect(board.hasCyborg).toBe(true);
    expect(board.owner).toBeNull();
    expect(board.level).toBe(1);
    expect(board.cards.length).toBeGreaterThanOrEqual(3);
    expect(board.cards.length).toBeLessThanOrEqual(5);
    const card = board.cards[1];
    if (!card) throw new Error("card");
    expect(card.total).toBe(Object.values(card.stats).reduce((a, b) => a + b, 0));
    const balance = BigInt(board.balance);
    const input = { cityId: board.cityId, window: board.window, slot: 1, cost: card.cost };
    // 창·값이 다르면 cards_changed, 사이보그가 없으면 no_cyborg, 모르는 도시면 unknown_city
    expect(await recruits.hire(userId, { ...input, window: input.window - 1 })).toEqual({
      ok: false,
      code: "cards_changed",
    });
    expect(await recruits.hire(userId, { ...input, cost: String(BigInt(card.cost) + 1n) })).toEqual({
      ok: false,
      code: "cards_changed",
    });
    expect(await recruits.hire(await fakeUser("No_Cyborg"), input)).toEqual({ ok: false, code: "no_cyborg" });
    expect(await recruits.hire(userId, { ...input, cityId: 999_999 })).toEqual({
      ok: false,
      code: "unknown_city",
    });
    const hired = await recruits.hire(userId, input);
    if (!hired.ok) throw new Error(`hire ${hired.code}`);
    expect(await recruits.hire(userId, input)).toEqual({ ok: false, code: "taken" });
    const after = recruits.board({ id: userId, owner: true }, board.cityId, clock);
    expect(after?.cards[1]?.taken).toBe(true);
    expect(BigInt(after?.balance ?? "0")).toBe(balance - BigInt(card.cost));
    // dev·admin은 그 도시 주인(NPC 세력)의 카드도 본다
    expect(after?.owner?.cards.length).toBeGreaterThanOrEqual(3);
    expect(
      await count(`select id from world_units where id = $1 and kind = $2 and owner_id = $3`, [
        hired.unitId,
        UNIT_KIND_HUMAN,
        ownerId,
      ]),
    ).toBe(1);
    const human = await rows<{ level: number; stats: number[]; satisfaction_milli: number }>(
      test.db,
      `select level, stats, satisfaction_milli from world_humans where unit_id = $1`,
      [hired.unitId],
    );
    expect(human[0]?.level).toBe(1);
    expect(human[0]?.stats.map(Number)).toEqual([
      card.stats.str,
      card.stats.dex,
      card.stats.agi,
      card.stats.vit,
      card.stats.int,
      card.stats.wis,
    ]);
    expect(
      await count(`select owner_id from recruit_draws where owner_id = $1 and taken = 2`, [ownerId]),
    ).toBe(1);
    expect(await world.checkInvariants()).toEqual([]);

    world = await restart(world);
    const again = world.persistence?.recruits.board({ id: userId, owner: false }, board.cityId, clock);
    expect(again?.cards[1]?.taken).toBe(true);
    // NPC 런타임은 유저 휴먼을 돌리지 않는다(봇 휴먼만 들인다)
    expect(world.npc?.world.units.has(hired.unitId)).toBe(false);
    // 다음 창(12시간 뒤)이면 새 묶음: 산 칸이 없다
    clock += 12 * 3_600_000;
    const next = world.persistence?.recruits.board({ id: userId, owner: false }, board.cityId, clock);
    expect(next?.window).toBe(board.window + 1);
    expect(next?.cards.some((entry) => entry.taken)).toBe(false);
  });

  it("유저 구인: 잔고가 모자라면 insufficient_funds(아무것도 바뀌지 않는다)", async () => {
    const world = await boot(4);
    const { userId, ownerId } = await withCyborg(world, "Poor_User", 0n);
    const persistence = world.persistence;
    if (!persistence) throw new Error("persistence");
    // 정착 지원금을 모두 써 버린 사용자
    const left = persistence.ledger.balanceOf(ownerId, ASSET_CREDIT);
    if (left > 0n)
      persistence.ledger.post({
        kind: "burn",
        atMs: clock,
        entries: [
          { account: persistence.ledger.ownerAccount(ownerId, ASSET_CREDIT), amount: -left },
          { account: persistence.ledger.systemAccount(`sink:${ASSET_CREDIT}`, ASSET_CREDIT), amount: left },
        ],
      });
    const board = persistence.recruits.board({ id: userId, owner: false }, undefined, clock);
    const card = board?.cards[0];
    if (!board || board.cityId === null || !card) throw new Error("no board");
    const units = await count(`select id from world_units where kind = $1`, [UNIT_KIND_HUMAN]);
    expect(
      await persistence.recruits.hire(userId, {
        cityId: board.cityId,
        window: board.window,
        slot: 0,
        cost: card.cost,
      }),
    ).toEqual({ ok: false, code: "insufficient_funds" });
    await persistence.writer.durable();
    expect(await count(`select id from world_units where kind = $1`, [UNIT_KIND_HUMAN])).toBe(units);
    expect(await count(`select owner_id from recruit_draws where owner_id = $1`, [ownerId])).toBe(0);
  });
});
