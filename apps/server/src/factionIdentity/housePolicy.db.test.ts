// 가문 금고 기부·가문세율·도시 짓기 정책 DB 통합 시험 — 기획 D-574 2150·2124, housePolicy.ts·facilities/landRule.ts.
// docs/adr/2026-11-11-faction-identity.md "바뀜 (house-8, D-574)". TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
import { createLedgerBook } from "@terra/sim";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLandCheck } from "../facilities/landRule.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import type { OwnerRow } from "../world/persist/load.ts";
import { ASSET_CREDIT } from "../world/settlement.ts";
import type { HouseMovePersistence } from "./houseEntry.ts";
import { readHouseEntryPolicy } from "./houseEntryPolicy.ts";
import { createHousePolicy } from "./housePolicy.ts";
import { vaultBalance } from "./houseVault.ts";
import { readHouseView } from "./houseView.ts";
import { TEST_HOUSE_RULES } from "./rules.ts";

/** 원장·정산 흉내(사용자 → 소유 주체) */
function world(users: Record<string, number>) {
  let accountId = 0;
  let txId = 0;
  const book = createLedgerBook({ nextAccountId: () => ++accountId, nextTxId: () => ++txId });
  const issue = book.systemAccount("issue:test", ASSET_CREDIT);
  const p: HouseMovePersistence = {
    owners: new Map(),
    settlement: { findOwnerOfUser: (userId) => users[userId], settleOwner: () => undefined },
    ledger: {
      balanceOf: (owner, asset) => book.balanceOf(owner, asset),
      ownerAccount: (owner, asset) => book.ownerAccount(owner, asset),
      systemAccount: (code, asset) => book.systemAccount(code, asset),
      balance: (account) => book.balance(account),
      accounts: () => book.accounts(),
      post: (tx) => book.post(tx),
    },
    writer: { durable: async () => undefined },
  };
  const fund = (owner: number, amount: bigint) =>
    book.post({
      kind: "issue",
      atMs: 0,
      entries: [
        { account: issue, amount: -amount },
        { account: book.ownerAccount(owner, ASSET_CREDIT), amount },
      ],
    });
  return { book, p, fund };
}

describe.skipIf(!TEST_DATABASE_URL)("가문 금고·가문세·도시 짓기 정책 (DB)", () => {
  let test: TestDatabase;
  let serial = 0;
  let nation = 0;
  const clock = 7_000_000;
  const sql = (text: string, values: unknown[] = []) => test.db.$client.query(text, values);

  const person = async (): Promise<string> => {
    serial += 1;
    const login = `fake_hpo${serial}`;
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
         values ($1, $2, $3, 'balanced', '{10,10,10,10,10,10}', '{100,100,100,100,100,100}', '{}', $4, 801, 0)`,
      [id, `Hpo${serial}`, `hpo${serial}`, nation],
    );
    await sql("insert into faction_members (user_id, faction_id) values ($1, $2)", [id, nation]);
    return id;
  };
  /** 가문(+ 가문원 하나). city를 주면 그 도시를 가진 봉신 가문(위 세력 = 나라) */
  const house = async (city?: number) => {
    const leader = await person();
    const member = await person();
    const id = Number(
      (
        await rows<{ id: string }>(
          test.db,
          "insert into factions (kind, parent_id, born_of) values ('player', $1, $1) returning id",
          [city === undefined ? null : nation],
        )
      )[0]?.id,
    );
    await sql(
      `insert into faction_profiles (faction_id, name, short_name, color, source, updated_at_ms)
         values ($1, $2, $3, '#2980b9', 'player', 0)`,
      [id, `Hpo house ${String(id)}`, `P${String(id)}`],
    );
    await sql(
      `insert into house_members (user_id, faction_id, role, joined_at_ms) values ($1, $2, 'leader', 0), ($3, $2, 'member', 1)`,
      [leader, id, member],
    );
    await sql("insert into house_homes (faction_id, city_id, set_at_ms) values ($1, 801, 0)", [id]);
    if (city !== undefined)
      await sql(
        `insert into world_cities (id, faction_id, map_key, cell_x, cell_y, start, founded_at_ms) values ($1, $2, $1, 4, 4, false, 0)`,
        [city, id],
      );
    return { id, leader, member };
  };

  beforeAll(async () => {
    test = await createTestDatabase();
    nation = Number(
      (
        await rows<{ id: string }>(
          test.db,
          "insert into factions (kind, code, traits) values ('npc', 'fake_hpo_nation', '{500,500,500,500}') returning id",
        )
      )[0]?.id,
    );
    await sql(
      `insert into world_cities (id, faction_id, map_key, cell_x, cell_y, start, founded_at_ms) values (801, $1, 801, 3, 3, true, 0)`,
      [nation],
    );
  }, 240_000);

  afterAll(async () => {
    await test?.drop();
  });

  it("기부(2150): 가문원이 지갑에서 가문 금고로 — 모자라면 insufficient_funds, 가문 없으면 not_in_house, 세계 전이면 busy", async () => {
    const mine = await house();
    const outsider = await person();
    const { book, p, fund } = world({ [mine.member]: 11, [outsider]: 12 });
    fund(11, 300n);
    let ready = true;
    const policy = createHousePolicy({
      pool: test.db.$client,
      db: test.db,
      rules: () => TEST_HOUSE_RULES,
      now: () => clock,
      persistence: () => (ready ? p : undefined),
    });
    expect(await policy.donate(mine.member, 200n)).toEqual({
      ok: true,
      action: "donated",
      factionId: mine.id,
    });
    expect(vaultBalance(book, mine.id, ASSET_CREDIT)).toBe(200n);
    expect(book.balanceOf(11, ASSET_CREDIT)).toBe(100n);
    expect(await policy.donate(mine.member, 101n)).toEqual({ ok: false, code: "insufficient_funds" });
    expect(await policy.donate(outsider, 1n)).toEqual({ ok: false, code: "not_in_house" });
    ready = false;
    expect(await policy.donate(mine.member, 1n)).toEqual({ ok: false, code: "busy" });
    const audits = await rows(test.db, "select action from audit_log where action = 'faction.house_donate'");
    expect(audits.length).toBe(1);
  });

  it("꺼내기(D-576): 가문장만, 금고 잔고까지 — 해산하면 남은 돈은 가문장 지갑으로", async () => {
    const mine = await house();
    const { book, p, fund } = world({ [mine.leader]: 21, [mine.member]: 22 });
    fund(22, 500n);
    const policy = createHousePolicy({
      pool: test.db.$client,
      db: test.db,
      rules: () => TEST_HOUSE_RULES,
      now: () => clock,
      persistence: () => p,
    });
    expect((await policy.donate(mine.member, 300n)).ok).toBe(true);
    expect(await policy.take(mine.member, 10n)).toEqual({ ok: false, code: "not_leader" });
    expect(await policy.take(mine.leader, 301n)).toEqual({ ok: false, code: "insufficient_funds" });
    expect(await policy.take(mine.leader, 120n)).toEqual({
      ok: true,
      action: "vault_taken",
      factionId: mine.id,
    });
    expect(book.balanceOf(21, ASSET_CREDIT)).toBe(120n);
    expect(vaultBalance(book, mine.id, ASSET_CREDIT)).toBe(180n);
    expect(await policy.vaultToLeader(mine.leader, mine.id)).toBe(180n);
    expect(book.balanceOf(21, ASSET_CREDIT)).toBe(300n);
    expect(vaultBalance(book, mine.id, ASSET_CREDIT)).toBe(0n);
    const audits = await rows<{ action: string }>(
      test.db,
      "select action from audit_log where action in ('faction.house_vault_take', 'faction.house_vault_dissolve') order by id",
    );
    expect(audits.map((row) => row.action)).toEqual([
      "faction.house_vault_take",
      "faction.house_vault_dissolve",
    ]);
  });

  it("금고 장부(D-576): 가문 칸에 원장 금고 줄이 새 것 먼저, 같은 거래의 가문원 이름과 함께", async () => {
    const mine = await house();
    const code = `vault:house:${String(mine.id)}:${ASSET_CREDIT}`;
    await sql("insert into world_owners (id, user_id, settled_at_ms) values (9101, $1, 0)", [mine.member]);
    await sql(
      `insert into ledger_accounts (id, owner_id, system_code, asset, location, balance) values
         (9101, 9101, null, $2, null, 0), (9102, null, $1, $2, null, 70)`,
      [code, ASSET_CREDIT],
    );
    await sql(
      "insert into ledger_transactions (id, kind, at_ms) values (9101, 'house_donate', 10), (9102, 'house_vault_take', 20)",
    );
    await sql(
      `insert into ledger_entries (tx_id, account_id, amount) values (9101, 9101, -100), (9101, 9102, 100), (9102, 9102, -30)`,
    );
    const view = await readHouseView(test.db.$client, {
      userId: mine.member,
      nationId: nation,
      rules: TEST_HOUSE_RULES,
      nowMs: clock,
      presets: [],
    });
    const memberName = (
      await rows<{ name: string }>(test.db, "select name from cyborgs where user_id = $1", [mine.member])
    )[0]?.name;
    expect(view.house?.vaultLog).toEqual([
      { atMs: 20, kind: "house_vault_take", amount: "-30", who: null },
      { atMs: 10, kind: "house_donate", amount: "100", who: memberName },
    ]);
    expect(view.house?.vault).toBe("70");
  });

  it("가문세율(2150): 가문장만, 설정 칸 상한까지 — 가문 칸에 세율·상한이 보인다", async () => {
    const mine = await house();
    const policy = createHousePolicy({
      pool: test.db.$client,
      db: test.db,
      rules: () => TEST_HOUSE_RULES,
      now: () => clock,
      persistence: () => undefined,
    });
    expect(await policy.setTax(mine.leader, 120)).toEqual({
      ok: true,
      action: "tax_set",
      factionId: mine.id,
    });
    expect(await policy.setTax(mine.member, 50)).toEqual({ ok: false, code: "not_leader" });
    expect(await policy.setTax(mine.leader, TEST_HOUSE_RULES.taxMaxPm + 1)).toEqual({
      ok: false,
      code: "tax_too_high",
    });
    const view = await readHouseView(test.db.$client, {
      userId: mine.member,
      nationId: nation,
      rules: TEST_HOUSE_RULES,
      nowMs: clock,
      presets: [],
    });
    expect(view.house?.tax).toEqual({ ratePm: 120, maxPm: TEST_HOUSE_RULES.taxMaxPm });
    // 상한이 내려가면 읽을 때 자른다
    const lowered = await readHouseView(test.db.$client, {
      userId: mine.member,
      nationId: nation,
      rules: { ...TEST_HOUSE_RULES, taxMaxPm: 50 },
      nowMs: clock,
      presets: [],
    });
    expect(lowered.house?.tax).toEqual({ ratePm: 50, maxPm: 50 });
  });

  it("도시 짓기 정책(2124): 도시 주인 가문장만 정하고, 땅 규칙이 같은 나라 다른 가문에 그 정책을 쓴다(자기 가문은 늘)", async () => {
    const owner = await house(810);
    const other = await house(811);
    const policy = createHousePolicy({
      pool: test.db.$client,
      db: test.db,
      rules: () => TEST_HOUSE_RULES,
      now: () => clock,
      persistence: () => undefined,
    });
    expect(await policy.setBuild(owner.member, 810, false)).toEqual({ ok: false, code: "not_leader" });
    expect(await policy.setBuild(other.leader, 810, false)).toEqual({ ok: false, code: "not_ruler" });
    expect(await policy.setBuild(owner.leader, 999, false)).toEqual({ ok: false, code: "unknown_city" });

    // 땅 규칙: 사용자 주체 1 = 다른 가문의 가문원, 2 = 그 도시 가문의 가문원(시민권은 위 나라 — 봉신)
    const owners = new Map<number, OwnerRow>([
      [
        1,
        {
          id: 1,
          userId: other.member,
          factionId: null,
          settledAtMs: 0,
          upkeepArrears: 0,
          upkeepUnpaidAtMs: null,
        },
      ],
      [
        2,
        {
          id: 2,
          userId: owner.member,
          factionId: null,
          settledAtMs: 0,
          upkeepArrears: 0,
          upkeepUnpaidAtMs: null,
        },
      ],
    ]);
    let fallback = true;
    const land = createLandCheck({
      pool: test.db.$client,
      owners,
      writer: { durable: async () => undefined },
      buildDefault: () => fallback,
    });
    // 정하지 않음 → 기본값(허용)
    expect(await land(1, 810)).toEqual({ allowed: true });
    fallback = false;
    expect(await land(1, 810)).toEqual({ allowed: false, reason: "house_policy", cityFaction: owner.id });
    expect(await policy.setBuild(owner.leader, 810, true)).toEqual({
      ok: true,
      action: "build_policy_set",
      factionId: owner.id,
    });
    expect(await land(1, 810)).toEqual({ allowed: true });
    expect(await policy.setBuild(owner.leader, 810, false)).toMatchObject({ ok: true });
    expect(await land(1, 810)).toEqual({ allowed: false, reason: "house_policy", cityFaction: owner.id });
    // 자기 가문 도시는 막아도 짓는다
    expect(await land(2, 810)).toEqual({ allowed: true });
    // NPC 나라 도시는 그 나라 시민이면 그대로
    expect(await land(1, 801)).toEqual({ allowed: true });
    // 정부 판 칸: 가문 도시만 build, 정하는 사람 = 도시 주인 가문장
    const view = await readHouseEntryPolicy(test.db.$client, {
      cityId: 810,
      viewerId: owner.leader,
      rules: TEST_HOUSE_RULES,
    });
    expect(view?.build).toEqual({ city: false, fallback: TEST_HOUSE_RULES.cityBuildDefault });
    expect(view?.canSetCity).toBe(true);
    const npcCity = await readHouseEntryPolicy(test.db.$client, {
      cityId: 801,
      viewerId: owner.leader,
      rules: TEST_HOUSE_RULES,
    });
    expect(npcCity?.build).toBeUndefined();
    // 비우면 기본값을 따른다(가문 이동 정책 값은 그대로)
    await sql("update city_policies set house_entry_fee = 15 where city_id = 810");
    expect(await policy.setBuild(owner.leader, 810, null)).toMatchObject({ ok: true });
    const after = await rows<{ house_entry_fee: string; house_build: boolean | null }>(
      test.db,
      "select house_entry_fee::text as house_entry_fee, house_build from city_policies where city_id = 810",
    );
    expect(after).toEqual([{ house_entry_fee: "15", house_build: null }]);
  });
});
