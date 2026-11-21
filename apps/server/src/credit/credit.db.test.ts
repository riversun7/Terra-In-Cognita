// 신용 점수 DB 통합 시험(D-581, docs/adr/2026-11-21-credit.md) — TEST_DATABASE_URL이 있을 때만. 계정은 가짜 값이다.
// 세계를 켜면 사업장 장부가 신용 장부를 원장에 붙이고, 깎은 몫이 표 credit_marks에 쓰여 다시 켜도 이어지며, 빚을 갚으면 줄이 지워지는지 본다.
import { DAY_MS, residentClaimCode, residentDebtCode } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { silentLog } from "../world/testSupport.ts";
import { type World, startWorld } from "../world/world.ts";
import { creditBookOf } from "./book.ts";

const CUR = "cur_credit_test";
const NATION = 9_000_001;
const CITY = 9_000_002;
const PAYER = 9_000_003;

let test: TestDatabase;
const worlds: World[] = [];
const clock = 1_800_000_000_000 - (1_800_000_000_000 % DAY_MS) + 3_600_000;

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
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
    npc: { testNations: 1, manual: true },
  });
  worlds.push(world);
  await world.ready;
  return world;
}

describe.skipIf(!TEST_DATABASE_URL)("신용 점수 저장(DB)", () => {
  it("깎은 몫이 표에 남아 다시 켜도 이어지고, 빚을 다 갚으면 줄이 지워진다", async () => {
    const code = residentDebtCode(NATION, CITY, PAYER, CUR);
    const first = await boot();
    const p1 = first.persistence;
    if (!p1) throw new Error("persistence");
    const book1 = creditBookOf(p1.ledger);
    if (!book1) throw new Error("credit book");
    // 주민세 빚 10(빚 계정 − 짝 받을 돈 +, 시스템 계정끼리) → 고리로 깎기
    p1.ledger.post({
      kind: "resident_tax",
      atMs: clock,
      entries: [
        { account: p1.ledger.systemAccount(code, CUR), amount: -10n },
        { account: p1.ledger.systemAccount(residentClaimCode(NATION, CUR), CUR), amount: 10n },
      ],
    });
    book1.residentArrears(NATION, [{ city: CITY, payer: PAYER, owed: 10n, added: 10n, code }], clock);
    expect(book1.score({ ownerId: PAYER, unitId: null }, { city: CITY })).toBe(950);
    await p1.writer.durable();
    expect(await rows(test.db, "select cause, city_points, nation_points, count from credit_marks")).toEqual([
      { cause: code, city_points: 50, nation_points: 20, count: 1 },
    ]);
    await first.stop();
    worlds.splice(0);

    const second = await boot();
    const p2 = second.persistence;
    const book2 = p2 ? creditBookOf(p2.ledger) : undefined;
    if (!p2 || !book2) throw new Error("credit book");
    expect(book2.score({ ownerId: PAYER, unitId: null }, { city: CITY })).toBe(950);
    expect(book2.score({ ownerId: PAYER, unitId: null }, { nation: NATION })).toBe(980);
    // 다 갚음(탕감과 같은 꼴 — 빚 계정 0) → 바로 회복, 줄 지움
    p2.ledger.post({
      kind: "resident_tax_cancel",
      atMs: clock + 1,
      entries: [
        { account: p2.ledger.systemAccount(code, CUR), amount: 10n },
        { account: p2.ledger.systemAccount(residentClaimCode(NATION, CUR), CUR), amount: -10n },
      ],
    });
    expect(book2.score({ ownerId: PAYER, unitId: null }, { city: CITY })).toBe(1000);
    await p2.writer.durable();
    expect(await rows(test.db, "select cause from credit_marks")).toEqual([]);
  }, 60_000);
});
