// 사업장 장부 DB 통합 시험(기획 D-548·D-555, docs/adr/2026-11-15-business-ledger.md) — TEST_DATABASE_URL이 있을 때만. 계정은 가짜 값이다.
// 남이 내 신전에 낸 헌금이 사업장 금고로 들고(소득세는 그 도시 나라 국고로), 장부 조회가 수입·세금·정산 칸을 보이고, 손 정산·자동 정산이 지분대로
// 주인 지갑에 나누는지, 주인이 사업장 창고 물건을 꺼낼 때 값을 내는지, 다시 켜도 상태가 이어지는지 본다.
import { loadContentPack } from "@terra/content/node";
import { businessLocation, incomeTaxOf, reserveKeep, unitPurseLocation } from "@terra/shared/businessBooks";
import { CELL_UNITS, DAY_MS, START_BUSINESS, positionAt } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { facilityScreenSourceOf } from "../facilities/appSource.ts";
import { rosterCatalogOf } from "../roster/catalog.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { silentLog } from "../world/testSupport.ts";
import { ASSET_CREDIT, SYSTEM_ISSUE_CREDIT } from "../world/settlement.ts";
import { type World, startWorld } from "../world/world.ts";
import { giveTestHouse } from "../factionIdentity/testHouses.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
/** 지분 동시호가 회차(설정 칸 기본값 — 팩 tuning도 같다) */
const START_ROUND_MS = START_BUSINESS.shareRoundMs;
if (!loaded.source) throw new Error("content pack");
const pack = createContentEditState(loaded.source).effective();
const roster = rosterCatalogOf(loaded.source);

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
    roster: () => roster,
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
  // 유닛을 고용하려면 가문이 있어야 한다(D-565)
  await giveTestHouse(test.db.$client, userId, persistence);
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

describe.skipIf(!TEST_DATABASE_URL)("사업장 장부(D-548·D-555)", () => {
  it("남의 헌금 → 사업장 금고(소득세는 국고), 장부 조회, 손 정산·자동 정산, 주인 꺼내기 값, 다시 켜도 이어진다", async () => {
    const world = await boot();
    const p = persistenceOf(world);
    const { ledger } = p;
    const shop = await withHumans(world, "ShopOwner");
    const guest = await withHumans(world, "TempleGuest");
    const [unit] = shop.units;
    if (unit === undefined) throw new Error("unit");
    const templeId = await buildNear(world, shop.userId, unit, "temple");
    const vault = () => ledger.balanceOf(shop.ownerId, ASSET_CREDIT, businessLocation(templeId));
    const walletBefore = ledger.balanceOf(shop.ownerId, ASSET_CREDIT);

    // 남이 낸 헌금은 주인 지갑이 아니라 사업장 금고로, 들어올 때 소득세(도시 나라 거래세)
    expect(await p.fusion.temple.offer(guest.userId, { buildingId: templeId, amount: "1000" })).toMatchObject(
      {
        ok: true,
      },
    );
    const taxBp = p.facilities.business.taxRateOf(templeId, shop.ownerId);
    // NPC 도시 안이라 소득세가 붙는다(그 나라 거래세 [임시])
    expect(taxBp).toBeGreaterThan(0);
    const tax = (1000n * BigInt(taxBp)) / 10_000n;
    expect(vault()).toBe(1000n - tax);
    expect(ledger.balanceOf(shop.ownerId, ASSET_CREDIT)).toBe(walletBefore);

    // 장부: 누구나 본다(1513), 주인만 정산 단추
    const source = facilityScreenSourceOf(world);
    if (!source) throw new Error("screen");
    const seen = await source.books(guest.userId, templeId, 7, clock);
    if (seen.status !== "ok") throw new Error(seen.status);
    expect(seen.mine).toBe(false);
    expect(seen.ownerKind).toBe("player");
    expect(seen.vault).toEqual([{ asset: ASSET_CREDIT, amount: String(1000n - tax) }]);
    expect(seen.totals[0]?.columns.income).toBe("1000");
    if (tax > 0n) expect(seen.totals[0]?.columns.tax).toBe(String(-tax));
    expect(seen.entries.some((entry) => entry.kind === "temple_offering")).toBe(true);
    const own = await source.books(shop.userId, templeId, 7, clock);
    expect(own.status === "ok" && own.mine).toBe(true);
    expect(await source.books(shop.userId, 999_999, 7, clock)).toEqual({ status: "not_business" });

    // 손 정산: 주인만
    const service = p.facilities.service;
    expect(await service.businessCommand(guest.userId, { kind: "settle", buildingId: templeId })).toEqual({
      ok: false,
      code: "forbidden",
    });
    expect(
      await service.businessCommand(shop.userId, {
        kind: "settle",
        buildingId: templeId,
        asset: ASSET_CREDIT,
        amount: 100n,
      }),
    ).toEqual({ ok: true, paid: 100n });
    expect(ledger.balanceOf(shop.ownerId, ASSET_CREDIT)).toBe(walletBefore + 100n);

    // 주인이 꺼내는 길은 없다(기획 D-569 1781): storage_move out은 sale_only, 판매가로 산다(돈은 매출 business_sale로 금고에)
    const here = businessLocation(templeId);
    ledger.post({
      kind: "grant",
      atMs: clock,
      entries: [
        { account: ledger.systemAccount("source:item:stone", "item:stone"), amount: -10n },
        { account: ledger.ownerAccount(shop.ownerId, "item:stone", here), amount: 10n },
      ],
    });
    expect(
      await service.storageMove(shop.userId, {
        buildingId: templeId,
        asset: "item:stone",
        qty: 5,
        direction: "out",
      }),
    ).toEqual({ ok: false, code: "sale_only" });
    expect(ledger.balanceOf(shop.ownerId, "item:stone", here)).toBe(10n);
    const beforeTake = vault();
    const bought = await service.businessCommand(shop.userId, {
      kind: "buy",
      buildingId: templeId,
      item: "item:stone",
      qty: 10,
    });
    expect(bought.ok).toBe(true);
    expect(vault()).toBeGreaterThan(beforeTake);
    expect(ledger.balanceOf(shop.ownerId, "item:stone", here)).toBe(0n);
    const sold = await source.books(shop.userId, templeId, 7, clock);
    expect(sold.status === "ok" && sold.entries.some((entry) => entry.kind === "business_sale")).toBe(true);

    // 자동 정산(주기 끝): 남은 금고 돈이 지분대로 주인 지갑에
    await p.writer.durable();
    clock = (Math.floor(clock / DAY_MS) + 1) * DAY_MS + 1000;
    service.age(clock);
    expect(vault()).toBe(0n);
    expect(p.facilities.business.state(templeId)?.settledAtMs).toBe(clock - 1000);
    await p.writer.durable();
    expect(
      await rows(test.db, "select building_id, settled_at_ms from business_states where building_id = $1", [
        templeId,
      ]),
    ).toEqual([{ building_id: String(templeId), settled_at_ms: String(clock - 1000) }]);
    const kinds = await rows<{ kind: string }>(
      test.db,
      "select distinct kind from ledger_transactions where kind like 'business_%' order by kind",
    );
    expect(kinds.map((row) => row.kind)).toEqual(
      expect.arrayContaining(["business_sale", "business_settle"]),
    );
    expect(await world.checkInvariants()).toEqual([]);

    // 다시 켜도 같은 주기에 두 번 정산하지 않는다
    await world.crashForTest("commit");
    const second = await boot();
    const q = persistenceOf(second);
    expect(q.facilities.business.state(templeId)?.settledAtMs).toBe(clock - 1000);
    expect(q.facilities.business.tick(clock + 5)).toBe(0);
  });

  it("지분 동시호가(건물 화면 개편): 팔기·사기 → 다시 켜도 걸린 주문 → 회차 체결 → 대주주가 관리·정산 지분대로, 운영자 대신 관리", async () => {
    const world = await boot();
    const p = persistenceOf(world);
    const { ledger } = p;
    const shop = await withHumans(world, "ShareOwner");
    const buyer = await withHumans(world, "ShareBuyer");
    const outsider = await withHumans(world, "ShareOutsider");
    const [unit] = shop.units;
    if (unit === undefined) throw new Error("unit");
    const templeId = await buildNear(world, shop.userId, unit, "temple");
    const service = p.facilities.service;
    const asset = `share:biz_${String(templeId)}`;
    // 발행 전: 주인 하나가 발행 수 전부
    expect(p.facilities.shares.holders(templeId)).toEqual([{ ownerId: shop.ownerId, shares: 1000n }]);
    expect(
      await service.businessCommand(shop.userId, {
        kind: "share_order",
        buildingId: templeId,
        side: "sell",
        price: 50n,
        shares: 600n,
      }),
    ).toMatchObject({ ok: true });
    expect(ledger.balanceOf(shop.ownerId, asset)).toBe(400n);
    const bought = await service.businessCommand(buyer.userId, {
      kind: "share_order",
      buildingId: templeId,
      side: "buy",
      price: 60n,
      shares: 600n,
    });
    expect(bought).toMatchObject({ ok: true });
    // 운영자가 아닌 남은 관리 명령을 못 한다
    expect(await p.labor.setRent(outsider.userId, templeId, 5n)).toEqual({ ok: false, code: "forbidden" });
    await p.writer.durable();
    expect(await rows(test.db, "select side, shares, state from business_share_orders order by id")).toEqual([
      { side: "sell", shares: "600", state: "open" },
      { side: "buy", shares: "600", state: "open" },
    ]);

    // 다시 켜면 걸린 주문(에스크로)이 되살아난다
    await world.crashForTest("commit");
    const second = await boot();
    const q = persistenceOf(second);
    const view = q.facilities.shares.view(templeId, buyer.ownerId, clock);
    expect(view.myOrders).toHaveLength(1);
    expect(view.askShares).toBe("600");
    expect(view.issued).toBe(true);
    // 회차 경계를 지나면 한 값으로 체결
    clock += START_ROUND_MS;
    q.facilities.service.age(clock);
    expect(q.ledger.balanceOf(buyer.ownerId, asset)).toBe(600n);
    expect(q.facilities.shares.holders(templeId)).toEqual([
      { ownerId: buyer.ownerId, shares: 600n },
      { ownerId: shop.ownerId, shares: 400n },
    ]);
    // 경영권: 가장 많은 주주가 관리한다(주인은 넘겼다)
    expect(q.facilities.business.mayManage(templeId, buyer.ownerId)).toBe(true);
    expect(q.facilities.business.mayManage(templeId, shop.ownerId)).toBe(false);
    expect(await q.labor.setRent(buyer.userId, templeId, 5n)).toEqual({ ok: true });
    expect(await q.labor.setRent(outsider.userId, templeId, 6n, true)).toEqual({ ok: true });
    const labor = q.labor.building(outsider.userId, templeId);
    expect(labor.status === "ready" && labor.rent).toBe("6");
    // 장부·이름표: 주주 이름(사이보그 이름)·몫
    const source = facilityScreenSourceOf(second);
    if (!source) throw new Error("screen");
    const books = await source.books(outsider.userId, templeId, 7, clock);
    if (books.status !== "ok") throw new Error(books.status);
    expect(books.holders.map((holder) => [holder.name?.ko, holder.pm])).toEqual([
      ["ShareBuyer", 600],
      ["ShareOwner", 400],
    ]);
    expect(books.market?.lastPrice).toBe("50");
    const owner = await source.owner(buyer.userId, templeId);
    expect(owner).toMatchObject({
      status: "ok",
      ownerName: { ko: "ShareOwner", en: "ShareOwner" },
      top: { kind: "me", pm: 600 },
      canManage: true,
    });
    // 정산은 지분대로(대주주가 한다)
    q.ledger.post({
      kind: "issue",
      atMs: clock,
      entries: [
        { account: q.ledger.systemAccount(SYSTEM_ISSUE_CREDIT, ASSET_CREDIT), amount: -1000n },
        {
          account: q.ledger.ownerAccount(shop.ownerId, ASSET_CREDIT, businessLocation(templeId)),
          amount: 1000n,
        },
      ],
    });
    const before = q.ledger.balanceOf(buyer.ownerId, ASSET_CREDIT);
    expect(
      await q.facilities.service.businessCommand(buyer.userId, { kind: "settle", buildingId: templeId }),
    ).toMatchObject({
      ok: true,
    });
    expect(q.ledger.balanceOf(buyer.ownerId, ASSET_CREDIT) - before).toBe(600n);
    expect(await second.checkInvariants()).toEqual([]);
  });

  it("임금 소득세 원천징수(D-578): 임금 거래 안에서 소득세는 도시 나라 국고로, 유닛 지갑은 세후 임금, 장부에 원천징수 칸", async () => {
    const world = await boot();
    const p = persistenceOf(world);
    const { ledger } = p;
    const shop = await withHumans(world, "WithholdOwner");
    const [builder, worker] = shop.units;
    if (builder === undefined || worker === undefined) throw new Error("unit");
    const templeId = await buildNear(world, shop.userId, builder, "temple");
    const service = p.facilities.service;
    expect(
      await service.businessCommand(shop.userId, {
        kind: "invest",
        buildingId: templeId,
        asset: ASSET_CREDIT,
        amount: 10_000n,
      }),
    ).toMatchObject({ ok: true });
    const hired = await p.labor.create(shop.userId, { kind: "wage", buildingId: templeId, unitId: worker });
    if (!hired.ok || hired.contractId === undefined) throw new Error(`hire ${JSON.stringify(hired)}`);
    const contract = p.labor.contracts.get(hired.contractId);
    if (!contract) throw new Error("contract");
    // NPC 도시 안이라 그 나라 소득세율(거래세 [임시])이 있다. 임금이 작아도 계약마다 모아서 내린다(누적 내림)
    const taxBp = p.facilities.business.taxRateOf(templeId, shop.ownerId);
    expect(taxBp).toBeGreaterThan(0);
    clock += 9 * DAY_MS;
    p.settlement.settleOwner(shop.ownerId, clock);
    const gross = contract.paidTotal;
    expect(gross).toBe(contract.rate * 10n);
    const withheld = incomeTaxOf(gross, taxBp);
    expect(withheld).toBeGreaterThan(0n);
    await p.writer.durable();
    const purse = ledger.ownerAccount(shop.ownerId, ASSET_CREDIT, unitPurseLocation(worker));
    const sums = await rows<{ purse: string; others: string }>(
      test.db,
      `select coalesce(sum(e.amount) filter (where e.account_id = $1), 0)::text as purse,
              coalesce(sum(e.amount) filter (where e.account_id <> $1 and e.amount > 0), 0)::text as others
         from ledger_entries e join ledger_transactions t on t.id = e.tx_id where t.kind = 'labor_wage'`,
      [purse],
    );
    // 지갑은 세후 임금만, 나머지(국고 — 가문세율 0이라 가문 금고 줄 없음)는 원천징수 세금
    expect(sums).toEqual([{ purse: String(gross - withheld), others: String(withheld) }]);
    const source = facilityScreenSourceOf(world);
    if (!source) throw new Error("screen");
    const books = await source.books(shop.userId, templeId, 30, clock);
    if (books.status !== "ok") throw new Error(books.status);
    // 장부 "원천징수 소득세" 칸(이익 밖 — 보증금으로 임금 칸에 이미 든 돈)
    expect(books.totals[0]?.columns.withholding).toBe(String(-withheld));
    expect(await world.checkInvariants()).toEqual([]);
  });

  it("지급준비금(D-564 1623·1624·D-570 1783·1789): 빈 금고 고용은 막고, 정산은 필요액 × 여유 × 비율(0%여도 다음 임금)을 남겨 보증금부터 채우고 나머지를 나눈다", async () => {
    const world = await boot();
    const p = persistenceOf(world);
    const { ledger } = p;
    const shop = await withHumans(world, "ReserveOwner");
    const guest = await withHumans(world, "ReserveGuest");
    const [builder, worker] = shop.units;
    if (builder === undefined || worker === undefined) throw new Error("unit");
    const templeId = await buildNear(world, shop.userId, builder, "temple");
    const vault = () => ledger.balanceOf(shop.ownerId, ASSET_CREDIT, businessLocation(templeId));
    const service = p.facilities.service;
    // 빈 금고면 고용하지 않는다(D-570 1789 — 적자로 미리 넣지 않는다)
    expect(await p.labor.create(shop.userId, { kind: "wage", buildingId: templeId, unitId: worker })).toEqual(
      {
        ok: false,
        code: "insufficient_funds",
      },
    );
    expect(p.facilities.business.debts(templeId).size).toBe(0);
    // 한 주기 임금만큼 넣고 고용: 보증금 = 금고에 있는 만큼(한 주기) → 첫 임금으로 낸다
    expect(
      await service.businessCommand(shop.userId, {
        kind: "invest",
        buildingId: templeId,
        asset: ASSET_CREDIT,
        amount: 20n,
      }),
    ).toMatchObject({ ok: true });
    const hired = await p.labor.create(shop.userId, { kind: "wage", buildingId: templeId, unitId: worker });
    if (!hired.ok || hired.contractId === undefined) throw new Error(`hire ${JSON.stringify(hired)}`);
    const contract = p.labor.contracts.get(hired.contractId);
    if (!contract) throw new Error("contract");
    const rate = contract.rate;
    expect(rate).toBe(20n);
    expect(contract.deposit).toBe(0n);
    expect(p.facilities.business.debts(templeId).size).toBe(0);
    // 임금은 그 휴먼의 유닛 지갑(사유재산, D-097·D-564 1631)
    expect(ledger.balanceOf(shop.ownerId, ASSET_CREDIT, unitPurseLocation(worker))).toBe(rate);

    // 수입이 들어온 뒤 정산: 남길 돈 = (다음 임금 + 30일분 보증금 모자람) × 1.2 × 100%
    expect(
      await p.fusion.temple.offer(guest.userId, { buildingId: templeId, amount: "1000000" }),
    ).toMatchObject({ ok: true });
    const full = rate * 30n;
    const keep = reserveKeep(rate + full, START_BUSINESS.reserveMarginPm, START_BUSINESS.reserveDefaultPm);
    const source = facilityScreenSourceOf(world);
    if (!source) throw new Error("screen");
    const before = await source.books(shop.userId, templeId, 7, clock);
    if (before.status !== "ok") throw new Error(before.status);
    expect(before.reserve).toEqual({
      ratioPm: 1000,
      chosen: false,
      marginPm: START_BUSINESS.reserveMarginPm,
      lines: [{ asset: ASSET_CREDIT, needed: String(rate + full), keep: String(keep), floor: String(rate) }],
    });
    const vaultBefore = vault();
    const walletBefore = ledger.balanceOf(shop.ownerId, ASSET_CREDIT);
    const settled = await service.businessCommand(shop.userId, { kind: "settle", buildingId: templeId });
    const paidOut = vaultBefore - keep;
    expect(settled).toEqual({ ok: true, paid: paidOut });
    expect(ledger.balanceOf(shop.ownerId, ASSET_CREDIT)).toBe(walletBefore + paidOut);
    // 남긴 돈으로 모자란 보증금(30일분)부터 채웠다, 나머지는 금고에
    expect(contract.deposit).toBe(full);
    expect(vault()).toBe(keep - full);
    expect(p.facilities.business.debts(templeId).size).toBe(0);

    // 지급준비율: 주인·대주주만, 0~5000‰. 0이어도 다음 임금만큼은 남긴다(D-570 1783)
    expect(
      await service.businessCommand(guest.userId, { kind: "reserve", buildingId: templeId, reservePm: 0 }),
    ).toEqual({ ok: false, code: "forbidden" });
    expect(
      await service.businessCommand(shop.userId, { kind: "reserve", buildingId: templeId, reservePm: 5001 }),
    ).toEqual({ ok: false, code: "invalid_amount" });
    expect(
      await service.businessCommand(shop.userId, { kind: "reserve", buildingId: templeId, reservePm: 0 }),
    ).toEqual({ ok: true });
    expect(await service.businessCommand(shop.userId, { kind: "settle", buildingId: templeId })).toEqual({
      ok: true,
      paid: keep - full - rate,
    });
    expect(vault()).toBe(rate);
    await p.writer.durable();
    expect(
      await rows(test.db, "select reserve_pm from business_states where building_id = $1", [templeId]),
    ).toEqual([{ reserve_pm: 0 }]);
    // 다시 켜도 고른 비율이 이어진다(null로 돌리면 기본값)
    await world.crashForTest("commit");
    const second = await boot();
    const q = persistenceOf(second);
    expect(q.facilities.business.reserve(templeId)).toMatchObject({ ratioPm: 0, chosen: true });
    expect(
      await q.facilities.service.businessCommand(shop.userId, {
        kind: "reserve",
        buildingId: templeId,
        reservePm: null,
      }),
    ).toEqual({ ok: true });
    expect(q.facilities.business.reserve(templeId)).toMatchObject({ ratioPm: 1000, chosen: false });
    expect(await second.checkInvariants()).toEqual([]);
  });
});
