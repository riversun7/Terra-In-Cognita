// 3단계 DB+원장+신용장부 통합 시험: 가문 도시세 정책(일정액·주기·시장 기본 권한), 주기 징수, 미납 시 빚+신용 하락,
// 체납 납부 시 원장 빚 청산 및 신용 자동 복구 — ADR 2026-11-25-house-city-tax.md.
// TEST_DATABASE_URL이 있을 때만 돈다.
import { START_BUSINESS } from "@terra/sim";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attachCreditBook } from "../credit/book.ts";
import { createLedger } from "../economy/ledger.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { NO_NATION_MONEY } from "../world/money.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import { readCityMembership } from "./houseCityJoin.ts";
import { createHouseCityTaxService, houseCityTaxDebtCode, readMyHouseCityTax } from "./houseCityTax.ts";
import { vaultAccount, vaultBalance } from "./houseVault.ts";
import { TEST_HOUSE_RULES } from "./rules.ts";

const DAY_MS = 86_400_000;

function fakeWriter(): WorldWriter {
  return {
    upsert() {},
    remove() {},
    append() {},
    durable: async () => {},
    drain: async () => {},
    pendingCount: 0,
    takeMetrics: () => ({}),
    crash: async () => {},
  };
}

describe.skipIf(!TEST_DATABASE_URL)("가문 도시세 정책·징수·체납 빚과 신용 하락·납부 복구 (DB)", () => {
  let test: TestDatabase;
  let serial = 0;
  let clock = 100_000_000;
  const SEED_CITY = 9800;
  const CITY_ID = 9801;
  const CITY_TREASURY_OWNER = 81001;
  const MEMBER_LEADER_OWNER = 82001;
  const sql = (text: string, values: unknown[] = []) => test.db.$client.query(text, values);

  const person = async (): Promise<string> => {
    serial += 1;
    const login = `fake_hct_${serial}`;
    const id =
      (
        await rows<{ id: string }>(
          test.db,
          "insert into users (name, email, username) values ($1, $2, $3) returning id",
          [login, `${login}@house.placeholder.invalid`, login],
        )
      )[0]?.id ?? "";
    await sql(
      `insert into cyborgs (user_id, name, name_key, temperament, initial, k_pm, appearance, faction_id, start_city_id, created_at_ms)
         values ($1, $2, $3, 'balanced', '{10,10,10,10,10,10}', '{100,100,100,100,100,100}', '{}', null, $4, 0)`,
      [id, `Hct${serial}`, `hct${serial}`, SEED_CITY],
    );
    return id;
  };

  const makeHouse = async (opts: { ownCity?: number; joinCity?: number; parentId?: number } = {}) => {
    const leader = await person();
    const id = Number(
      (
        await rows<{ id: string }>(
          test.db,
          "insert into factions (kind, parent_id, born_of) values ('player', $1, $2) returning id",
          [opts.parentId ?? null, opts.joinCity ? (opts.parentId ?? null) : null],
        )
      )[0]?.id,
    );
    await sql(
      `insert into faction_profiles (faction_id, name, short_name, color, source, updated_at_ms)
         values ($1, $2, $3, '#2980b9', 'player', 0)`,
      [id, `TaxHouse ${String(id)}`, `T${String(id)}`],
    );
    await sql(
      "insert into house_members (user_id, faction_id, role, joined_at_ms) values ($1, $2, 'leader', 0)",
      [leader, id],
    );
    if (opts.ownCity !== undefined) {
      await sql(
        `insert into world_cities (id, faction_id, map_key, cell_x, cell_y, start, founded_at_ms)
           values ($1, $2, 7, 15, 15, false, 0)`,
        [opts.ownCity, id],
      );
      await sql("insert into world_owners (id, faction_id, settled_at_ms) values ($1, $2, 0)", [
        CITY_TREASURY_OWNER,
        id,
      ]);
      await sql("insert into house_homes (faction_id, city_id, set_at_ms) values ($1, $2, 0)", [
        id,
        opts.ownCity,
      ]);
    } else if (opts.joinCity !== undefined) {
      await sql("insert into house_homes (faction_id, city_id, set_at_ms) values ($1, $2, $3)", [
        id,
        opts.joinCity,
        clock,
      ]);
    }
    return { id, leader };
  };

  let mayorHouse: { id: number; leader: string };

  beforeAll(async () => {
    test = await createTestDatabase();
    const npcNation = Number(
      (
        await rows<{ id: string }>(
          test.db,
          "insert into factions (kind, code, traits) values ('npc', 'fake_hct_npc', '{500,500,500,500}') returning id",
        )
      )[0]?.id,
    );
    await sql(
      `insert into world_cities (id, faction_id, map_key, cell_x, cell_y, start, founded_at_ms)
         values ($1, $2, 7, 1, 1, true, 0)`,
      [SEED_CITY, npcNation],
    );
    mayorHouse = await makeHouse({ ownCity: CITY_ID });
  }, 240_000);

  afterAll(async () => {
    await test?.drop();
  });

  it("시장 정책 설정(일정액·주기·권한), 주기 징수, 체납 빚과 신용 하락, 납부 후 신용 자동 복구", async () => {
    const memberHouse = await makeHouse({ joinCity: CITY_ID });
    let nextAcc = 0;
    let nextTx = 0;
    const writer = fakeWriter();
    const ledger = createLedger({
      writer,
      nextAccountId: () => ++nextAcc,
      nextTxId: () => ++nextTx,
      accounts: [],
    });
    const credit = attachCreditBook({
      ledger,
      writer,
      loaded: [],
      rules: () => ({
        ...START_BUSINESS,
        creditStart: 500,
        creditResidentNation: 40,
        creditTenurePerDay: 0,
      }),
      place: () => undefined,
      nationOf: () => CITY_TREASURY_OWNER,
    });
    credit.sweep(clock, new Map([[MEMBER_LEADER_OWNER, CITY_TREASURY_OWNER]]));

    const owners = new Map([
      [CITY_TREASURY_OWNER, { id: CITY_TREASURY_OWNER, factionId: mayorHouse.id }],
      [MEMBER_LEADER_OWNER, { id: MEMBER_LEADER_OWNER, factionId: null }],
    ]);
    const persistence = {
      owners,
      ledger,
      writer,
      settlement: {
        findOwnerOfUser: (uid: string) => (uid === memberHouse.leader ? MEMBER_LEADER_OWNER : undefined),
        settleOwner: () => {},
      },
    };
    const svc = createHouseCityTaxService({
      pool: test.db.$client,
      db: test.db,
      now: () => clock,
      persistence: () => persistence,
    });

    // 허용 주기 밖(5일) 거절
    expect(
      await svc.setPolicy(mayorHouse.leader, {
        cityId: CITY_ID,
        amount: "200",
        periodDays: 5,
        setter: "mayor",
      }),
    ).toEqual({ ok: false, code: "invalid_period" });

    // 타인 가문장은 정책 설정 불가
    expect(
      await svc.setPolicy(memberHouse.leader, {
        cityId: CITY_ID,
        amount: "200",
        periodDays: 1,
        setter: "mayor",
      }),
    ).toEqual({ ok: false, code: "not_ruler" });

    // 시장이 매일 200 일정액 설정
    expect(
      await svc.setPolicy(mayorHouse.leader, {
        cityId: CITY_ID,
        amount: "200",
        periodDays: 1,
        setter: "mayor",
      }),
    ).toEqual({ ok: true, action: "city_tax_policy_set", factionId: mayorHouse.id });

    // 가문 금고에 250 채우기
    ledger.post({
      kind: "seed",
      atMs: clock,
      entries: [
        { account: ledger.systemAccount("mint", NO_NATION_MONEY), amount: -250n },
        { account: vaultAccount(ledger, memberHouse.id, NO_NATION_MONEY), amount: 250n },
      ],
    });

    // 1일 경과 → 첫 주기 징수: 200 전액 납부, 체납 0, 도시 주인 가문 자신은 과세 제외(billed = 1)
    clock += DAY_MS;
    const first = await svc.collectDue();
    expect(first).toEqual({ billed: 1, paid: 200n, arrears: 0n });
    expect(vaultBalance(ledger, memberHouse.id, NO_NATION_MONEY)).toBe(50n);
    expect(ledger.balanceOf(CITY_TREASURY_OWNER, NO_NATION_MONEY)).toBe(200n);
    expect(credit.score({ ownerId: MEMBER_LEADER_OWNER, unitId: null }, CITY_TREASURY_OWNER, clock)).toBe(
      500,
    );

    // 2일째 경과 → 잔고 50만 납부, 150 체납 빚 발생 + 신용 40 하락(500 → 460)
    clock += DAY_MS;
    const second = await svc.collectDue();
    expect(second).toEqual({ billed: 1, paid: 50n, arrears: 150n });
    expect(vaultBalance(ledger, memberHouse.id, NO_NATION_MONEY)).toBe(0n);
    expect(ledger.balanceOf(CITY_TREASURY_OWNER, NO_NATION_MONEY)).toBe(250n);
    expect(credit.score({ ownerId: MEMBER_LEADER_OWNER, unitId: null }, CITY_TREASURY_OWNER, clock)).toBe(
      460,
    );

    // 세력 화면·정부 판 조회에 체납 빚 150 표시
    const myTax = await readMyHouseCityTax(test.db.$client, memberHouse.id);
    expect(myTax).toMatchObject({
      cityId: CITY_ID,
      amount: "200",
      periodDays: 1,
      debt: "150",
      missedCycles: 1,
    });
    const govView = await readCityMembership(test.db.$client, {
      cityId: CITY_ID,
      viewerId: mayorHouse.leader,
      nowMs: clock,
      rules: TEST_HOUSE_RULES,
      viewerInCity: true,
    });
    expect(govView?.houseCityTax).toMatchObject({
      amount: "200",
      periodDays: 1,
      setter: "mayor",
      canSet: true,
    });
    expect(govView?.houses.find((h) => h.houseId === memberHouse.id)?.taxDebt).toBe("150");

    // 가문장 지갑에 300 채우고 체납 납부 실행 → 150 납부, 빚 0, 신용 500으로 자동 복구!
    ledger.post({
      kind: "seed_wallet",
      atMs: clock,
      entries: [
        { account: ledger.systemAccount("mint_w", NO_NATION_MONEY), amount: -300n },
        { account: ledger.ownerAccount(MEMBER_LEADER_OWNER, NO_NATION_MONEY), amount: 300n },
      ],
    });
    expect(await svc.payDebt(memberHouse.leader)).toEqual({
      ok: true,
      action: "city_tax_paid",
      factionId: memberHouse.id,
    });
    expect(ledger.balanceOf(CITY_TREASURY_OWNER, NO_NATION_MONEY)).toBe(400n);
    expect(ledger.balanceOf(MEMBER_LEADER_OWNER, NO_NATION_MONEY)).toBe(150n);
    const debtAcc = [...ledger.accounts()].find(
      (a) => a.systemCode === houseCityTaxDebtCode(memberHouse.id, CITY_ID, NO_NATION_MONEY),
    );
    expect(debtAcc ? ledger.balance(debtAcc.id) : 0n).toBe(0n);
    expect(credit.score({ ownerId: MEMBER_LEADER_OWNER, unitId: null }, CITY_TREASURY_OWNER, clock)).toBe(
      500,
    );

    // 빚이 없을 때 다시 납부 시도 → no_debt
    expect(await svc.payDebt(memberHouse.leader)).toEqual({ ok: false, code: "no_debt" });
  });
});
