// 사업장 장부 DB 통합 시험(기획 D-548·D-555, docs/adr/2026-11-15-business-ledger.md) — TEST_DATABASE_URL이 있을 때만. 계정은 가짜 값이다.
// 남이 내 신전에 낸 헌금이 사업장 금고로 들고(소득세는 그 도시 나라 국고로), 장부 조회가 수입·세금·정산 칸을 보이고, 손 정산·자동 정산이 지분대로
// 주인 지갑에 나누는지, 주인이 사업장 창고 물건을 꺼낼 때 값을 내는지, 다시 켜도 상태가 이어지는지 본다.
import { loadContentPack } from "@terra/content/node";
import { businessLocation } from "@terra/shared/businessBooks";
import { CELL_UNITS, DAY_MS, positionAt } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { facilityScreenSourceOf } from "../facilities/appSource.ts";
import { rosterCatalogOf } from "../roster/catalog.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { silentLog } from "../world/testSupport.ts";
import { ASSET_CREDIT, SYSTEM_ISSUE_CREDIT } from "../world/settlement.ts";
import { type World, startWorld } from "../world/world.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
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

    // 주인이 사업장 창고 물건을 꺼낼 때도 값을 낸다(1507)
    const here = businessLocation(templeId);
    ledger.post({
      kind: "grant",
      atMs: clock,
      entries: [
        { account: ledger.systemAccount("source:item:stone", "item:stone"), amount: -5n },
        { account: ledger.ownerAccount(shop.ownerId, "item:stone", here), amount: 5n },
      ],
    });
    const beforeTake = vault();
    expect(
      await service.storageMove(shop.userId, {
        buildingId: templeId,
        asset: "item:stone",
        qty: 5,
        direction: "out",
      }),
    ).toEqual({ ok: true });
    expect(vault()).toBeGreaterThan(beforeTake);

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
});
