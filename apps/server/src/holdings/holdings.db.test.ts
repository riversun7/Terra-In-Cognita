// 보유 물건 DB 통합 시험(docs/adr/2026-11-03-item-holdings.md) — TEST_DATABASE_URL이 있을 때만. 계정은 가짜 값이다.
// 얻기·입기·쓰기가 쓰기 대기열로 저장되고 다시 켜도 같다. 전투 닳기는 전투 결과와 같은 커밋이라 다시 켜도 한 번만 닳는다.
import type { BattleInit } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { silentLog, testEncounter } from "../world/testSupport.ts";
import { type World, startWorld } from "../world/world.ts";
import { createHoldingsReads } from "./reads.ts";
import { carriedBy } from "./state.ts";
import { HOUR_MS, TEST_HOLDING_CONTENT, rulesWithWear } from "./testContent.ts";

const T0 = 1_800_000_000_000;
let test: TestDatabase;
let clock = T0;
const worlds: World[] = [];
/** 이 시험은 늘 닳게 한다(이기면 1, 지면 1 + 4) */
const ALWAYS = rulesWithWear({ chancePm: 1000, amount: 1, lossChancePm: 1000, lossAmount: 4 });

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
  clock = T0;
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  for (const world of worlds.splice(0)) await world.stop().catch(() => undefined);
  await test.drop();
});

async function boot(): Promise<World> {
  const world = startWorld({
    testBots: 0,
    paths: { kind: "inline" },
    now: () => clock,
    log: silentLog,
    pool: test.db.$client,
    writeIntervalMs: 10,
    onFatal: (error) => {
      throw error;
    },
    holdings: { content: () => TEST_HOLDING_CONTENT, rules: () => ALWAYS },
  });
  worlds.push(world);
  await world.ready;
  return world;
}

function persistence(world: World) {
  const found = world.persistence;
  if (!found) throw new Error("no persistence");
  return found;
}

async function fakeUser(name: string): Promise<string> {
  const found = await rows<{ id: string }>(
    test.db,
    `insert into users (name, email, username) values ($1, $2, $3) returning id`,
    [`Fake_${name}`, `fake-${name}@id.placeholder.invalid`, `fake_${name}`],
  );
  return String(found[0]?.id);
}

/** 칸마다 내구도(ID 차례) */
async function durability() {
  return rows<{ id: string; durability: number }>(
    test.db,
    `select id, durability from item_holdings order by id`,
  );
}

async function waitFor(check: () => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("timed out");
}

describe.skipIf(!TEST_DATABASE_URL)("보유 물건 저장", () => {
  it("얻기·입기·쓰기가 저장되고 다시 켜도 같다, 썩기도 다시 켠 뒤 이어진다", async () => {
    const first = await boot();
    const p = persistence(first);
    const mapKey = [...first.maps.keys()][0] ?? 0;
    const user = await fakeUser("holder");
    const [worker = 0] = p.settlement.giveWorkers(user, mapKey, 1, clock);
    const owner = p.settlement.ownerOfUser(user, clock).id;
    const at = carriedBy(worker);
    const grant = (item: string, quantity: number) =>
      p.holdings.service.acquire({
        ownerId: owner,
        item,
        quantity,
        location: at,
        source: "dev_grant",
        atMs: clock,
        seed: 3,
      });
    const vest = grant("hold_vest", 1);
    const stew = grant("hold_stew", 2);
    grant("hold_fish", 5);
    expect(vest.ok && stew.ok).toBe(true);
    const vestId = vest.ok ? (vest.holdings[0] ?? 0) : 0;
    const stewId = stew.ok ? (stew.holdings[0] ?? 0) : 0;
    // 시험 일꾼 = 휴먼 칸 배치(body = 3)
    expect(p.holdings.service.equip(owner, vestId, 3)).toEqual({ ok: true });
    expect(p.holdings.service.use(owner, stewId, { confirm: false, nowMs: clock, seed: 4 }).ok).toBe(true);
    await p.writer.durable();
    const before = p.holdings.service.list(owner, clock);
    const saved = await rows<{
      id: string;
      item_id: string;
      slot: number | null;
      quantity: number;
      stats: unknown;
    }>(test.db, `select id, item_id, slot, quantity, stats from item_holdings order by id`);
    expect(saved.map((row) => [row.item_id, row.slot, row.quantity])).toEqual([
      ["hold_vest", 3, 1],
      ["hold_stew", null, 1],
      ["hold_fish", null, 5],
    ]);
    expect(saved[0]?.stats).toEqual(before.holdings[0]?.stats);
    await first.stop();

    clock += 80 * HOUR_MS;
    const second = await boot();
    const q = persistence(second);
    const reads = createHoldingsReads({
      access: () => q.holdings.access,
      content: () => TEST_HOLDING_CONTENT,
    });
    const listed = reads.list({ id: user, loginId: "Fake_holder", roles: ["player"] }, clock);
    expect(listed.hasOwner).toBe(true);
    expect(listed.holdings.map((h) => [h.item, h.slot, h.quantity, h.unit])).toEqual([
      ["hold_vest", 3, 1, worker],
      ["hold_stew", null, 1, worker],
      // 72시간이 지나 썩은 생선으로 바뀌었다(목록을 읽기 전에 셈한다)
      ["hold_rotten_fish", null, 5, worker],
    ]);
    expect(listed.holdings[0]?.stats).toEqual(before.holdings[0]?.stats);
    // 화면 자료: 입는 칸·쓰기 쿨 종류·쓰는 효과, 든 유닛의 칸 배치(시험 일꾼 = human, 사이보그 없음)
    expect(listed.holdings.map((h) => [h.item, h.equipSlot, h.useCooldown])).toEqual([
      ["hold_vest", "body", null],
      ["hold_stew", null, "food"],
      ["hold_rotten_fish", null, null],
    ]);
    expect(listed.holdings[1]?.uses?.map((line) => line.effect)).toEqual(["hold_meal_str"]);
    expect(listed.cyborgUnit).toBeNull();
    expect(listed.units?.map((entry) => [entry.unit, entry.kind, entry.slots[3]])).toEqual([
      [worker, "human", "body"],
    ]);
    // 효과는 1시간이라 끝났다
    expect(listed.effects).toEqual([]);
    await q.writer.durable();
    const rotten = await rows<{ item_id: string; aged_ms: string | null; source: string }>(
      test.db,
      `select item_id, aged_ms, source from item_holdings where item_id like 'hold_%fish'`,
    );
    expect(rotten).toEqual([{ item_id: "hold_rotten_fish", aged_ms: null, source: "spoil" }]);
  });

  it("물약 쿨(D-509)은 저장돼 다시 켜도 이어진다", async () => {
    const first = await boot();
    const p = persistence(first);
    const mapKey = [...first.maps.keys()][0] ?? 0;
    const user = await fakeUser("drinker");
    const [worker = 0] = p.settlement.giveWorkers(user, mapKey, 1, clock);
    const owner = p.settlement.ownerOfUser(user, clock).id;
    const made = p.holdings.service.acquire({
      ownerId: owner,
      item: "hold_tonic",
      quantity: 2,
      location: carriedBy(worker),
      source: "dev_grant",
      atMs: clock,
      seed: 1,
    });
    const tonic = made.ok ? (made.holdings[0] ?? 0) : 0;
    expect(p.holdings.service.use(owner, tonic, { confirm: false, nowMs: clock, seed: 1 }).ok).toBe(true);
    await p.writer.durable();
    expect(await rows(test.db, `select unit_id, kind, until_ms from unit_cooldowns`)).toEqual([
      { unit_id: String(worker), kind: "potion", until_ms: String(clock + 30_000) },
    ]);
    await first.stop();

    clock += 10_000;
    const second = await boot();
    expect(
      persistence(second).holdings.service.use(owner, tonic, { confirm: false, nowMs: clock, seed: 2 }),
    ).toEqual({
      ok: false,
      code: "cooldown",
      readyAt: clock + 20_000,
    });
  });

  it("전투 닳기는 결과와 같은 커밋 — 다시 켜도 한 번만", async () => {
    const first = await boot();
    const p = persistence(first);
    const mapKey = [...first.maps.keys()][0] ?? 0;
    const userA = await fakeUser("victor");
    const userB = await fakeUser("loser");
    const [a1 = 0, a2 = 0] = p.settlement.giveWorkers(userA, mapKey, 2, clock);
    const [b1 = 0, b2 = 0] = p.settlement.giveWorkers(userB, mapKey, 2, clock);
    const ownerA = p.settlement.ownerOfUser(userA, clock).id;
    const ownerB = p.settlement.ownerOfUser(userB, clock).id;
    const dress = (owner: number, unit: number): number => {
      const made = p.holdings.service.acquire({
        ownerId: owner,
        item: "hold_vest",
        quantity: 1,
        location: carriedBy(unit),
        source: "dev_grant",
        atMs: clock,
        seed: unit,
      });
      const id = made.ok ? (made.holdings[0] ?? 0) : 0;
      expect(p.holdings.service.equip(owner, id, 3)).toEqual({ ok: true });
      return id;
    };
    const winnerVest = dress(ownerA, a1);
    const loserVest = dress(ownerB, b1);
    const base = testEncounter([a1, a2, b1, b2], [ownerA, ownerB]);
    const init: BattleInit = {
      ...base,
      units: base.units.map((spec) => (spec.side === 1 ? { ...spec, maxHp: 5000 } : spec)),
    };
    const battleId = await p.battles.start(init, { war: false });
    const endsAtMs = (await p.battles.get(battleId))?.endsAtMs ?? 0;
    await p.writer.durable();
    await first.stop();

    clock = endsAtMs + 1_000;
    const second = await boot();
    const q = persistence(second);
    await waitFor(async () => (await q.battles.get(battleId))?.status === "ended");
    await q.writer.durable();
    expect(await durability()).toEqual([
      { id: String(winnerVest), durability: 99 },
      { id: String(loserVest), durability: 95 },
    ]);
    await second.stop();

    clock += 60_000;
    await boot();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await durability()).toEqual([
      { id: String(winnerVest), durability: 99 },
      { id: String(loserVest), durability: 95 },
    ]);
  });
});
