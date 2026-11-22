// 도시(정부) 지분 시장 DB 통합 시험 — TEST_DATABASE_URL이 있을 때만. 계정은 가짜 값이다. 기획 D-583(질문 2438 답)·D-344, docs/adr/2026-11-21-share-market.md.
// 독재 지도자의 국고 지분 팔기 직권 → 승인된 판매가 시장에 국고 팔 주문으로 → 다른 플레이어가 사서 회차에 체결, 지배 가문은 과반까지만 판다,
// 도시 판 조회(주주·호가창·국고), 부팅 뒤 걸린 주문 복원.
import { loadContentPack } from "@terra/content/node";
import { DAY_MS, moveSharesToHouse, shareAsset } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { createFactionIdentityServices, createFactionIdentityShared } from "../factionIdentity/services.ts";
import { createHouseFounder } from "../factionIdentity/found.ts";
import { attachGovernance } from "../governance/attach.ts";
import { type GovernanceRules, TEST_GOVERNANCE_RULES } from "../governance/rules.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { houseTiesOf } from "../world/houseTies.ts";
import { ASSET_CREDIT } from "../world/settlement.ts";
import { silentLog } from "../world/testSupport.ts";
import { type World, startWorld } from "../world/world.ts";
import { type CitySharesAttached, attachCityShares } from "./attach.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source || !loaded.pack) throw new Error("content pack");
const pack = createContentEditState(loaded.source).effective();
const EMBLEM = { shape: "shield", division: "pale", charge: "tree", scheme: 1 };
const RELAXED = { capacity: 1000, refillPerMinute: 1000 };
const ROUND = 1_800_000;
const viewer = (id: string) => ({ id, roles: ["player" as const] });

let test: TestDatabase;
const worlds: World[] = [];
let clock = 0;

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
  clock = 1_800_000_000_000 - (1_800_000_000_000 % DAY_MS) + 3_600_000 + 60_000;
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
  const npc = world.npc;
  if (!npc) throw new Error("npc");
  for (let i = 0; i < 4; i += 1) {
    clock += 30 * 60_000;
    await npc.tick(true);
  }
  return world;
}

function parts(world: World) {
  const persistence = world.persistence;
  const npc = world.npc;
  if (!persistence || !npc) throw new Error("world");
  return { persistence, npc };
}

async function citizen(world: World, name: string, nationIndex = 0) {
  const { persistence } = parts(world);
  const found = await rows<{ id: string }>(
    test.db,
    `insert into users (name, email, username) values ($1, $2, $3) returning id`,
    [name, `${name}@id.placeholder.invalid`, name.toLowerCase()],
  );
  const userId = String(found[0]?.id);
  const faction = persistence.cyborgs.creation(userId, clock).factions[nationIndex];
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
  return { userId, nation: faction.id };
}

async function house(world: World, leader: string, name: string, short: string): Promise<number> {
  const pool = test.db.$client;
  const identity = createFactionIdentityServices(
    createFactionIdentityShared({ pool, now: () => clock, limits: { saves: RELAXED, uploads: RELAXED } }),
    { db: test.db, ip: null },
  );
  await identity.save(viewer(leader), {
    name,
    shortName: short,
    color: "#2980b9",
    emblem: EMBLEM,
    upload: { mode: "none" },
  });
  const nationOf = (userId: string) => parts(world).persistence.cyborgs.record(userId)?.factionId;
  const founded = await createHouseFounder({ pool, db: test.db, now: () => clock, nationOf }).found(leader, {
    cost: "0",
  });
  if (!founded.ok) throw new Error(founded.code);
  await houseTiesOf(parts(world).persistence)?.reload();
  return founded.factionId;
}

function attach(world: World, rules: () => GovernanceRules) {
  let shares: CitySharesAttached | undefined;
  const gov = attachGovernance({
    db: test.db,
    world: () => world,
    rules,
    now: () => clock,
    log: silentLog,
    manual: true,
    approvedShareSale: async (sale, nowMs) => {
      await shares?.service.approvedSale(sale, nowMs);
    },
    approvedShareBuy: async (buy, nowMs) => {
      await shares?.service.approvedBuy(buy, nowMs);
    },
    shareBuyCheck: (nation, cityId, count, maxPrice) =>
      shares ? shares.service.buyCheck(nation, cityId, count, maxPrice) : "busy",
  });
  shares = attachCityShares({
    world: () => world,
    governance: () => gov,
    rules: () => ({ roundMs: ROUND, orderMax: 10 }),
    now: () => clock,
    log: silentLog,
    manual: true,
  });
  return { gov, shares };
}

describe.skipIf(!TEST_DATABASE_URL)("도시 지분 시장(D-583)", () => {
  it("독재 국고 지분 팔기 직권 → 시장 국고 주문 → 다른 플레이어가 사서 체결, 지배 가문은 과반까지만, 도시 판·복원", async () => {
    const world = await boot();
    const { npc, persistence } = parts(world);
    const rules: GovernanceRules = { ...TEST_GOVERNANCE_RULES, graceRegimeMs: 0 };
    const { gov, shares } = attach(world, () => rules);
    const head = await citizen(world, "Shareone");
    const buyer = await citizen(world, "Sharetwo");
    const faction = npc.world.factions.get(npc.houses.ownerOfRow(head.nation) ?? -1);
    if (!faction) throw new Error("nation");
    faction.regime = "democracy";
    const row = await house(world, head.userId, "지분가문", "SHR");
    await test.db.$client.query(
      `insert into governance_state (nation_id, ruling_house_key, updated_at_ms) values ($1, $2, $3)
       on conflict (nation_id) do update set ruling_house_key = excluded.ruling_house_key`,
      [head.nation, `p:${row}`, clock],
    );
    const book = persistence.ledger;
    // 지배 가문이 도시마다 600주를 샀다(시험은 국고에서 옮겨 흉내) → 지분 과반을 사서 된 독재(국고 400주는 국고에 남는다 — 2432 (다))
    for (const cityId of faction.cities) moveSharesToHouse(book, cityId, faction.id, `${row}:`, 600n, clock);
    expect(
      await gov.service.propose(head.userId, { kind: "regime_change", regime: "dictatorship" }),
    ).toMatchObject({
      ok: true,
    });
    await gov.service.tick();
    await gov.service.tick();
    expect(faction.regime).toBe("dictatorship");
    const cityId = [...faction.cities].toSorted((a, b) => a - b)[0] ?? -1;
    expect(book.balanceOf(faction.id, shareAsset(cityId))).toBe(400n);

    // 사람은 국고 지분을 직접 팔지 못한다: 지도자 직권 국고 지분 팔기 → 승인된 판매 → 국고 팔 주문(값 5, 100주)
    expect(
      await gov.service.propose(head.userId, {
        kind: "treasury_share_sale",
        cityId,
        shares: "100",
        minPrice: "5",
      }),
    ).toMatchObject({ ok: true, action: "decided" });
    const market = shares.service.market();
    if (!market) throw new Error("market");
    expect(
      market.orders(cityId).map((order) => [order.holder, order.side, order.shares, order.agendaId !== null]),
    ).toEqual([[`o:${faction.id}`, "sell", 100n, true]]);

    // 산 사람: 그 나라 화폐로 산다(돈을 묶는다)
    // 경제 런타임이 없는 시험 세계는 서버 기준 화폐(port.ts와 같은 고르기)
    const currency = npc.economy?.economy.currencyOf.get(faction.id) ?? ASSET_CREDIT;
    const buyerOwner = persistence.settlement.findOwnerOfUser(buyer.userId);
    if (buyerOwner === undefined) throw new Error("buyer owner");
    book.post({
      kind: "test_grant",
      atMs: clock,
      entries: [
        { account: book.ownerAccount(buyerOwner, currency), amount: 10_000n },
        { account: book.systemAccount(`issue:test:${currency}`, currency), amount: -10_000n },
      ],
    });
    const cashBefore = book.balanceOf(buyerOwner, currency);
    const placed = await shares.service.place(buyer.userId, {
      cityId,
      side: "buy",
      price: 6n,
      shares: 150n,
      asHouse: false,
    });
    expect(placed).toMatchObject({ ok: true });
    expect(book.balanceOf(buyerOwner, currency)).toBe(cashBefore - 900n);
    // 가문장이 아니면 가문 이름으로 내지 못한다
    expect(
      await shares.service.place(buyer.userId, { cityId, side: "buy", price: 6n, shares: 1n, asHouse: true }),
    ).toEqual({ ok: false, code: "not_house_head" });

    // 도시 판: 주주(국고·내 가문 = 지배)·호가창·국고 자격
    let view = await shares.view.city(head.userId, cityId);
    if (view.status !== "ok") throw new Error(view.status);
    expect(view.regime).toBe("dictatorship");
    expect(view.holders.find((h) => h.kind === "my_house")).toMatchObject({ shares: "600", ruling: true });
    expect(view.holders.find((h) => h.kind === "treasury")?.shares).toBe("400");
    expect(view.book.asks).toEqual([{ price: "5", shares: "100", orders: 1 }]);
    expect(view.book.bids).toEqual([{ price: "6", shares: "150", orders: 1 }]);
    expect(view.expected?.shares).toBe("100");
    expect(view.treasury).toMatchObject({ shares: "400", canPropose: true, dictatorship: true });
    expect(view.house).not.toBeNull();

    // 지배 가문 팔기: 팔 수 있는 주(과반·가진 주) 위로는 막는다
    const sellable = BigInt(view.house?.sellable ?? "0");
    expect(sellable).toBeLessThanOrEqual(600n);
    const over = await shares.service.place(head.userId, {
      cityId,
      side: "sell",
      price: 50n,
      shares: sellable + 1n,
      asHouse: true,
    });
    expect(over.ok).toBe(false);
    expect(await shares.service.placeCap(market, `h:${row}:`, cityId)).toBeTypeOf("bigint");
    expect(await shares.service.placeCap(market, `o:${buyerOwner}`, cityId)).toBeUndefined();

    // 회차: 5에 100주 체결 → 산 사람 100주, 국고 300주, 국고 돈 +500, 남은 사기 50주는 걸린 채
    clock += ROUND;
    expect(await shares.service.tick()).toBe(1);
    expect(book.balanceOf(buyerOwner, shareAsset(cityId))).toBe(100n);
    expect(book.balanceOf(faction.id, shareAsset(cityId))).toBe(300n);
    expect(market.orders(cityId).map((order) => [order.side, order.shares])).toEqual([["buy", 50n]]);
    expect(market.lastPriceOf(cityId)).toBe(5n);
    expect(market.check()).toEqual([]);
    view = await shares.view.city(buyer.userId, cityId);
    if (view.status !== "ok") throw new Error(view.status);
    expect(view.me.shares).toBe("100");
    expect(view.myOrders).toEqual([expect.objectContaining({ side: "buy", shares: "50", as: "me" })]);
    expect(view.lastPrice).toBe("5");
    await persistence.writer.durable();
    const saved = await rows<{ state: string; filled: string }>(
      test.db,
      "select state, filled::text from city_share_orders order by id",
    );
    expect(saved).toEqual([
      { state: "done", filled: "100" },
      { state: "open", filled: "100" },
    ]);
    const rounds = await rows<{ price: string }>(test.db, "select price::text from city_share_rounds");
    expect(rounds).toEqual([{ price: "5" }]);

    // 거두기: 남은 묶음을 돌려준다
    const mine = view.myOrders[0]?.id ?? -1;
    expect(await shares.service.cancel(head.userId, mine)).toEqual({ ok: false, code: "forbidden" });
    expect(await shares.service.cancel(buyer.userId, mine)).toEqual({ ok: true });
    expect(book.balanceOf(buyerOwner, currency)).toBe(cashBefore - 500n);

    // 국고 팔 주문(남은 것 없음 — 다 팔림). 국고 지분 사기 안건(D-587 2479 나): 독재 지도자 직권.
    // 바뀜(gov-fix-4 — D-591 2526): 수량만 정한다 — 국고 돈이 모자라도 열리고, 집행은 돈이 있는 만큼만 건다(줄이지 않는다, 남은 수량은 기간 동안 회차마다)
    book.post({
      kind: "test_grant",
      atMs: clock,
      entries: [
        { account: book.ownerAccount(faction.id, currency), amount: 1_000n },
        { account: book.systemAccount(`issue:test:${currency}`, currency), amount: -1_000n },
      ],
    });
    const treasuryCash = book.balanceOf(faction.id, currency);
    const affordable = treasuryCash / 7n;
    expect(
      await gov.service.propose(head.userId, {
        kind: "treasury_share_buy",
        cityId,
        shares: String(affordable + 50n),
        maxPrice: "7",
      }),
    ).toMatchObject({ ok: true, action: "decided" });
    const treasuryBuy = market.orders(cityId).find((order) => order.holder === `o:${faction.id}`);
    expect(treasuryBuy).toMatchObject({ side: "buy", shares: affordable, price: 7n });
    expect(treasuryBuy?.agendaId).not.toBeNull();
    expect(book.balanceOf(faction.id, currency)).toBe(treasuryCash - affordable * 7n);
    expect(
      await rows(
        test.db,
        "select target::text, done::text, state from treasury_share_runs where agenda_id = $1",
        [treasuryBuy?.agendaId],
      ),
    ).toEqual([{ target: String(affordable + 50n), done: "0", state: "active" }]);
    view = await shares.view.city(head.userId, cityId);
    if (view.status !== "ok") throw new Error(view.status);
    expect(view.treasury?.orders).toEqual([
      expect.objectContaining({ side: "buy", shares: String(affordable), as: "treasury" }),
    ]);
    expect(view.treasury?.canWithdraw).toBe(true);
    expect(view.treasuryBuy).toMatchObject({ canPropose: true, own: true });
    clock += ROUND;
    await shares.service.tick();
    expect(market.orders(cityId).some((order) => order.id === treasuryBuy?.id)).toBe(true);
    expect(await shares.service.cancel(buyer.userId, treasuryBuy?.id ?? -1)).toEqual({
      ok: false,
      code: "forbidden",
    });
    expect(await shares.service.cancel(head.userId, treasuryBuy?.id ?? -1)).toEqual({ ok: true });
    expect(book.balanceOf(faction.id, currency)).toBe(treasuryCash);
    // 지도자가 거두면 집행도 끝난다(다음 회차에 다시 걸지 않는다 — treasuryRuns.ts)
    expect(
      await rows(test.db, "select state from treasury_share_runs where agenda_id = $1", [
        treasuryBuy?.agendaId,
      ]),
    ).toEqual([{ state: "cancelled" }]);
    clock += ROUND;
    await shares.service.tick();
    expect(market.orders(cityId).some((order) => order.holder === `o:${faction.id}`)).toBe(false);
    expect(market.check()).toEqual([]);
    expect(await world.checkInvariants()).toEqual([]);
    gov.stop();
    shares.stop();
  }, 180_000);
});
