// NPC 도시 경제·물자 거래소 DB 통합 시험(docs/adr/2026-11-07-play-flow.md WP4) — TEST_DATABASE_URL이 있을 때만. 계정·값은 시험용 가짜다.
// 도시 직무 생산·생필품 처음 창고·NPC 매물(남는 물건 팔기)·도시 매입 호가 → 유저가 사고(체결·창고로 들어옴)·팔고(에스크로)·취소(돌려받음)
// → 다시 켜면 걸린 주문·체결이 그대로(에스크로 불변식 M1).
import { loadContentPack } from "@terra/content/node";
import { DAY_MS, HOUR_MS } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { economyCatalogFromPack } from "../economyView/catalog.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { ASSET_CREDIT, SYSTEM_ISSUE_CREDIT } from "../world/settlement.ts";
import { silentLog } from "../world/testSupport.ts";
import { type World, startWorld } from "../world/world.ts";
import { marketSourceOf } from "./appSource.ts";
import { serverEconomyCatalogAccessor } from "./catalog.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source || !loaded.pack) throw new Error("content pack");
const pack = createContentEditState(loaded.source).effective();
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
  // UTC 0시 + 1시간(하루 끝이 멀다)
  clock = 1_800_000_000_000 - (1_800_000_000_000 % DAY_MS) + HOUR_MS;
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  for (const world of worlds.splice(0)) await world.stop().catch(() => undefined);
  await test.drop();
});

async function boot(): Promise<World> {
  const world = startWorld({
    testBots: 30,
    paths: { kind: "inline" },
    now: () => clock,
    log: silentLog,
    pool: test.db.$client,
    writeIntervalMs: 10,
    onFatal: (error) => {
      throw error;
    },
    npc: { testNations: 3, manual: true },
    holdings: { content: () => pack },
    facilities: { content: () => pack },
    economy,
  });
  worlds.push(world);
  await world.ready;
  return world;
}

const count = async (sql: string): Promise<number> =>
  Number((await rows<{ n: string }>(test.db, `select count(*) as n from (${sql}) t`))[0]?.n ?? 0);

/** 시험 사용자(소유 주체 + 시험 화폐) */
async function trader(
  world: World,
  name: string,
  credit: bigint,
): Promise<{ userId: string; ownerId: number }> {
  const persistence = world.persistence;
  if (!persistence) throw new Error("persistence");
  const found = await rows<{ id: string }>(
    test.db,
    `insert into users (name, email, username) values ($1, $2, $3) returning id`,
    [name, `${name}@id.placeholder.invalid`, name.toLowerCase()],
  );
  const userId = String(found[0]?.id);
  const ownerId = persistence.settlement.ownerOfUser(userId, clock).id;
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

describe.skipIf(!TEST_DATABASE_URL)("NPC 도시 경제·물자 거래소", () => {
  it("도시 직무가 생산하고 NPC가 남는 것을 팔며, 유저가 사고팔고 취소하고, 다시 켜도 걸린 주문이 그대로다", async () => {
    const world = await boot();
    const npc = world.npc;
    const persistence = world.persistence;
    const econ = npc?.economy;
    if (!npc || !persistence || !econ) throw new Error("city economy");
    const { ledger, writer } = persistence;
    // 도시 직무: 도시 셋 × (농장·주방·벌목장), 처음 창고는 도시마다 한 번
    expect(npc.world.cities.size).toBe(3);
    expect(econ.economy.facilities.size).toBe(9);
    await writer.durable();
    expect(await count(`select id from ledger_transactions where idempotency_key like 'npc_endow:%'`)).toBe(
      3,
    );
    const cityId = [...npc.world.cities.keys()].toSorted((a, b) => a - b)[0] ?? 0;
    const owner = npc.world.cities.get(cityId)?.owner ?? 0;
    expect(ledger.balanceOf(owner, "item:ration", cityId)).toBeGreaterThan(0n);

    // 두 시간: 생산·유지비·거래 판단(NPC 매물·매입 호가)
    for (let step = 0; step < 24; step += 1) {
      clock += 5 * 60_000;
      await npc.tick();
    }
    await writer.durable();
    expect(
      ledger.balanceOf(owner, "item:grain", cityId) + ledger.balanceOf(owner, "item:timber", cityId),
    ).toBeGreaterThan(0n);
    const npcAsks = await count(
      `select o.id from market_orders o where o.state = 'open' and o.side = 'sell'`,
    );
    expect(npcAsks).toBeGreaterThan(0);
    expect(await world.checkInvariants()).toEqual([]);

    // 유저가 NPC 매물을 산다(지정가 = 가장 싼 매도 호가): 바로 체결, 산 물건은 그 도시 내 창고
    const source = marketSourceOf(world, () => clock)();
    if (!source) throw new Error("market source");
    const buyer = await trader(world, "MarketBuyer", 1_000_000n);
    const ask = [...econ.registry.books()]
      .filter((book) => book.market.best("sell") !== undefined)
      .toSorted((a, b) => a.id - b.id)[0];
    const best = ask?.market.best("sell");
    if (!ask || !best) throw new Error("no npc ask");
    const before = ledger.balanceOf(buyer.ownerId, ask.asset, ask.cityId);
    const bought = await source.service.place(buyer.userId, {
      city: ask.cityId,
      item: ask.item,
      side: "buy",
      kind: "limit",
      price: String(best.price),
      qty: "1",
      expiryDays: 7,
    });
    expect(bought).toMatchObject({ ok: true, filled: "1", resting: "0" });
    const lot = ask.market.config.lotSize ?? 1n;
    expect(ledger.balanceOf(buyer.ownerId, ask.asset, ask.cityId) - before).toBe(lot);
    expect(await count(`select id from market_trades where taker_owner_id = ${buyer.ownerId}`)).toBe(1);
    expect(
      await count(`select id from market_orders where owner_id = ${buyer.ownerId} and state = 'filled'`),
    ).toBe(1);
    // 화면 자료: 체결·끝난 주문
    expect(source.views.book(buyer.userId, ask.item, ask.cityId, clock)?.trades.length).toBeGreaterThan(0);
    expect(source.views.orders(buyer.userId, clock).done[0]?.status).toBe("filled");

    // 산 물건을 비싸게 걸어 두고(에스크로), 낮은 매수는 걸었다가 취소(돌려받음)
    const high = best.price * 10n;
    const sell = await source.service.place(buyer.userId, {
      city: ask.cityId,
      item: ask.item,
      side: "sell",
      kind: "limit",
      price: String(high),
      qty: "1",
      expiryDays: 3,
    });
    expect(sell).toMatchObject({ ok: true, filled: "0", resting: "1" });
    expect(ledger.balanceOf(buyer.ownerId, ask.asset, ask.cityId)).toBe(before);
    const cash = ledger.balanceOf(buyer.ownerId, ASSET_CREDIT);
    const low = await source.service.place(buyer.userId, {
      city: ask.cityId,
      item: ask.item,
      side: "buy",
      kind: "limit",
      price: "1",
      qty: "2",
      expiryDays: 1,
    });
    if (!low.ok || low.orderId === undefined) throw new Error("low bid");
    expect(ledger.balanceOf(buyer.ownerId, ASSET_CREDIT)).toBe(cash - 2n);
    expect(await source.service.cancel(buyer.userId, low.orderId)).toMatchObject({ ok: true });
    expect(ledger.balanceOf(buyer.ownerId, ASSET_CREDIT)).toBe(cash);
    // 남의 주문은 거두지 못하고, 모자라면 묶지 않는다
    const other = await trader(world, "MarketOther", 10n);
    if (!sell.ok || sell.orderId === undefined) throw new Error("sell");
    expect(await source.service.cancel(other.userId, sell.orderId)).toEqual({ ok: false, code: "not_owner" });
    expect(
      await source.service.place(other.userId, {
        city: ask.cityId,
        item: ask.item,
        side: "buy",
        kind: "limit",
        price: "100",
        qty: "5",
        expiryDays: 7,
      }),
    ).toEqual({ ok: false, code: "insufficient_funds" });
    expect(
      await source.service.place(other.userId, {
        city: ask.cityId,
        item: "iron_sword_placeholder_none",
        side: "sell",
        kind: "limit",
        price: "1",
        qty: "1",
        expiryDays: 7,
      }),
    ).toEqual({ ok: false, code: "unknown_item" });
    expect(source.views.orders(buyer.userId, clock).open).toHaveLength(1);
    expect(await world.checkInvariants()).toEqual([]);

    // 다시 켜면 걸린 주문(같은 차례)·체결이 그대로
    await world.stop();
    worlds.splice(worlds.indexOf(world), 1);
    const again = await boot();
    const reloaded = again.npc?.economy;
    if (!reloaded) throw new Error("reloaded economy");
    const book = reloaded.registry.existing(ask.cityId, ask.asset);
    expect(book?.market.orders().some((order) => order.id === sell.orderId && order.price === high)).toBe(
      true,
    );
    expect(book?.trades.length).toBeGreaterThan(0);
    expect(reloaded.registry.check()).toEqual([]);
    const restored = marketSourceOf(again, () => clock)();
    expect(restored?.views.orders(buyer.userId, clock).open[0]?.id).toBe(String(sell.orderId));
    expect(await again.checkInvariants()).toEqual([]);
  });
});
