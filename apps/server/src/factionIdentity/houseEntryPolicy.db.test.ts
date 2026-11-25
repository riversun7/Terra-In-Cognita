// 가문 이동 정책·가문이 한꺼번에 내는 가입비 DB 통합 시험 — 질문 2018 답(도시·나라 칸, 정하는 사람 = 도시 주인·지도자, NPC는 성향 규칙식)·
// D-573(질문 2017 다 — 가문장 또는 가문 금고가 한꺼번에, 못 내면 옮기지 못함). docs/adr/2026-11-11-faction-identity.md
// "바뀜 (2026-11-16, 2011·2012·2014·2017·2018 답)". TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
import { createLedgerBook } from "@terra/sim";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { ASSET_CREDIT } from "../world/settlement.ts";
import { type HouseMovePersistence, houseEntryTermsOf } from "./houseEntry.ts";
import { createHouseEntryPolicy, readHouseEntryPolicy } from "./houseEntryPolicy.ts";
import { createHouseHome } from "./houseHome.ts";
import { createHouseMoves } from "./houseMoves.ts";
import { TEST_HOUSE_RULES } from "./rules.ts";

describe.skipIf(!TEST_DATABASE_URL)("가문 이동 정책 (DB)", () => {
  let test: TestDatabase;
  let serial = 0;
  let npcNation = 0;
  const clock = 9_000_000;
  const sql = (text: string, values: unknown[] = []) => test.db.$client.query(text, values);
  const policy = () => createHouseEntryPolicy({ pool: test.db.$client, db: test.db, now: () => clock });

  /** 사용자 + 사이보그. 사용자 ID */
  const person = async (city: number): Promise<string> => {
    serial += 1;
    const login = `fake_hep${serial}`;
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
         values ($1, $2, $3, 'balanced', '{10,10,10,10,10,10}', '{100,100,100,100,100,100}', '{}', $4, $5, 0)`,
      [id, `Hep${serial}`, `hep${serial}`, npcNation, city],
    );
    return id;
  };
  /** 가문(세력 행 player) + 가문장·가문원. 도시를 주면 그 도시를 가진 가문 */
  const house = async (opts: { parent?: number; city?: number; members?: number }) => {
    const leader = await person(901);
    const id = Number(
      (
        await rows<{ id: string }>(
          test.db,
          "insert into factions (kind, parent_id, born_of) values ('player', $1, $2) returning id",
          [opts.parent ?? null, npcNation],
        )
      )[0]?.id,
    );
    await sql(
      `insert into faction_profiles (faction_id, name, short_name, color, source, updated_at_ms)
         values ($1, $2, $3, '#2980b9', 'player', 0)`,
      [id, `Hep house ${String(id)}`, `H${String(id)}`],
    );
    await sql(
      "insert into house_members (user_id, faction_id, role, joined_at_ms) values ($1, $2, 'leader', 0)",
      [leader, id],
    );
    const members: string[] = [];
    for (let i = 0; i < (opts.members ?? 0); i += 1) {
      const member = await person(901);
      members.push(member);
      await sql(
        "insert into house_members (user_id, faction_id, role, joined_at_ms) values ($1, $2, 'member', 0)",
        [member, id],
      );
    }
    await sql("insert into house_homes (faction_id, city_id, set_at_ms) values ($1, 901, 0)", [id]);
    if (opts.city !== undefined)
      await sql(
        `insert into world_cities (id, faction_id, map_key, cell_x, cell_y, start, founded_at_ms) values ($1, $2, 7, $3, 4, false, 0)`,
        [opts.city, id, opts.city],
      );
    return { id, leader, members };
  };

  beforeAll(async () => {
    test = await createTestDatabase();
    // NPC 나라(상업 성향 1000 — 규칙식 가입비 최대)와 그 도시 둘
    npcNation = Number(
      (
        await rows<{ id: string }>(
          test.db,
          "insert into factions (kind, code, traits) values ('npc', 'fake_hep_nation', '{500,1000,500,500}') returning id",
        )
      )[0]?.id,
    );
    for (const id of [901, 902])
      await sql(
        `insert into world_cities (id, faction_id, map_key, cell_x, cell_y, start, founded_at_ms) values ($1, $2, 7, $3, 3, true, 0)`,
        [id, npcNation, id],
      );
  }, 240_000);

  afterAll(async () => {
    await test?.drop();
  });

  it("도시 정책: 그 도시를 가진 가문의 가문장만(가문원 not_leader·남의 도시 not_ruler·없는 도시 unknown_city), 정부 판 칸이 보인다", async () => {
    const mine = await house({ city: 950, members: 1 });
    expect(await policy().set(mine.leader, { scope: "city", cityId: 950, fee: "-30" })).toEqual({
      ok: true,
      action: "entry_policy_set",
      factionId: mine.id,
    });
    expect(await policy().set(mine.members[0] ?? "", { scope: "city", cityId: 950, fee: "5" })).toEqual({
      ok: false,
      code: "not_leader",
    });
    expect(await policy().set(mine.leader, { scope: "city", cityId: 901, fee: "5" })).toEqual({
      ok: false,
      code: "not_ruler",
    });
    expect(await policy().set(mine.leader, { scope: "city", cityId: 999, fee: "5" })).toEqual({
      ok: false,
      code: "unknown_city",
    });
    const view = await readHouseEntryPolicy(test.db.$client, {
      cityId: 950,
      viewerId: mine.leader,
      rules: TEST_HOUSE_RULES,
    });
    // 독립 가문 도시 = 그 가문이 나라 — 나라 값은 정하지 않아 0, 가문장이 둘 다 정한다
    expect(view).toEqual({
      city: "-30",
      nation: "0",
      nationSource: "none",
      canSetCity: true,
      canSetNation: true,
      // 가문 도시라 다른 가문 짓기 칸도(D-574 2124 — 정하지 않음 = 기본값 허용)
      build: { city: null, fallback: true },
      // 외부 세력 짓기 정책(4단계 — ADR 2026-11-25-building-access-and-foreign-build.md): 정하지 않음 = 막음, 도시 주인이 정한다
      foreignBuild: { city: null, fallback: false, canSet: true },
    });
    // 비우면 나라 값을 따른다
    await policy().set(mine.leader, { scope: "city", cityId: 950, fee: null });
    expect(
      (
        await readHouseEntryPolicy(test.db.$client, {
          cityId: 950,
          viewerId: mine.leader,
          rules: TEST_HOUSE_RULES,
        })
      )?.city,
    ).toBeNull();
    // NPC 도시: 정하는 사람이 없고 나라 값은 성향 규칙식
    expect(
      await readHouseEntryPolicy(test.db.$client, {
        cityId: 901,
        viewerId: mine.leader,
        rules: TEST_HOUSE_RULES,
      }),
    ).toEqual({
      city: null,
      nation: String(TEST_HOUSE_RULES.npcEntry.feeMax),
      nationSource: "npc",
      canSetCity: false,
      canSetNation: false,
      // 외부 세력 짓기 정책(4단계): NPC 도시는 남이 정하지 못한다
      foreignBuild: { city: null, fallback: false, canSet: false },
    });
    const audits = await rows(
      test.db,
      "select action from audit_log where action = 'faction.house_entry_policy'",
    );
    expect(audits.length).toBe(2);
  });

  it("나라 정책: 독립 가문(도시를 가졌고 위 세력 없음)의 가문장만 — 봉신·도시 없는 가문은 not_ruler", async () => {
    const free = await house({ city: 960 });
    expect((await policy().set(free.leader, { scope: "nation", fee: "70" })).ok).toBe(true);
    expect(
      await houseEntryTermsOf(test.db.$client, {
        cityId: 960,
        nationId: free.id,
        nationChanged: true,
        npc: TEST_HOUSE_RULES.npcEntry,
      }),
    ).toEqual({ terms: 70n, parts: [{ terms: 70n, payee: free.id, source: "nation" }] });
    const vassal = await house({ city: 961, parent: npcNation });
    expect(await policy().set(vassal.leader, { scope: "nation", fee: "1" })).toEqual({
      ok: false,
      code: "not_ruler",
    });
    const landless = await house({});
    expect(await policy().set(landless.leader, { scope: "nation", fee: "1" })).toEqual({
      ok: false,
      code: "not_ruler",
    });
  });

  it("governance-2(질문 2406): 의결로 NPC 나라의 지배 가문이 된 가문의 가문장이 그 나라 정책을 정한다(빈자리면 못 함)", async () => {
    const elected = await house({});
    await sql(
      `insert into governance_state (nation_id, ruling_house_key, updated_at_ms) values ($1, $2, 0)
       on conflict (nation_id) do update set ruling_house_key = excluded.ruling_house_key, vacant_since_ms = null`,
      [npcNation, `p:${String(elected.id)}`],
    );
    expect((await policy().set(elected.leader, { scope: "nation", fee: "-5" })).ok).toBe(true);
    const fee = await rows<{ fee: string }>(
      test.db,
      "select house_entry_fee::text as fee from factions where id = $1",
      [npcNation],
    );
    expect(fee[0]?.fee).toBe("-5");
    expect(
      (
        await readHouseEntryPolicy(test.db.$client, {
          cityId: 902,
          viewerId: elected.leader,
          rules: TEST_HOUSE_RULES,
        })
      )?.canSetNation,
    ).toBe(true);
    await sql("update governance_state set vacant_since_ms = 1 where nation_id = $1", [npcNation]);
    expect(await policy().set(elected.leader, { scope: "nation", fee: "1" })).toEqual({
      ok: false,
      code: "not_ruler",
    });
    await sql("update factions set house_entry_fee = null where id = $1", [npcNation]);
    await sql("delete from governance_state where nation_id = $1", [npcNation]);
  });

  it("D-573: 가입비는 가문장 지갑(가문 금고가 없을 때)이 가문원 수만큼 한꺼번에 — 모자라면 entry_fee_short로 옮기지 않는다", async () => {
    // 가문(가문장 + 가문원 2 = 셋)이 다른 나라(독립 가문 도시 970, 가입비 40)로 옮긴다 → 120
    const target = await house({ city: 970 });
    await policy().set(target.leader, { scope: "city", cityId: 970, fee: "40" });
    const moving = await house({ members: 2 });
    let findLeader = moving.leader;
    let accountId = 0;
    let txId = 0;
    const book = createLedgerBook({ nextAccountId: () => ++accountId, nextTxId: () => ++txId });
    const issue = book.systemAccount("issue:test", ASSET_CREDIT);
    const owners = new Map([
      [70, { id: 70, factionId: target.id }],
      [71, { id: 71, factionId: null }],
    ]);
    const persistence: HouseMovePersistence = {
      owners,
      settlement: {
        findOwnerOfUser: (userId) => (userId === findLeader ? 71 : undefined),
        settleOwner: () => undefined,
      },
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
    const fund = (amount: bigint) =>
      book.post({
        kind: "issue",
        atMs: 0,
        entries: [
          { account: issue, amount: -amount },
          { account: book.ownerAccount(71, ASSET_CREDIT), amount },
        ],
      });
    fund(100n);
    const home = createHouseHome({
      pool: test.db.$client,
      db: test.db,
      now: () => clock,
      rules: () => ({ ...TEST_HOUSE_RULES, homeWaitMs: 0, homeNoticeMs: 0 }),
      persistence: () => persistence,
    });
    expect(await home.set(moving.leader, 970)).toEqual({ ok: false, code: "entry_fee_short" });
    expect(
      (
        await rows<{ city_id: string }>(test.db, "select city_id from house_homes where faction_id = $1", [
          moving.id,
        ])
      )[0]?.city_id,
    ).toBe("901");
    fund(20n);
    expect((await home.set(moving.leader, 970)).ok).toBe(true);
    expect(book.balanceOf(71, ASSET_CREDIT)).toBe(0n);
    expect(book.balanceOf(70, ASSET_CREDIT)).toBe(120n);
    // 공고(D-570, 2명 이상 가문 — 1인 가문은 공고 없이 바로 옮김): 공고할 때 낼 수 있어도 옮길 때 모자라면 거둔다(reason entry_fee)
    const later = await house({ members: 1 });
    findLeader = later.leader;
    fund(80n);
    let now = clock;
    const noticed = createHouseHome({
      pool: test.db.$client,
      db: test.db,
      now: () => now,
      rules: () => ({ ...TEST_HOUSE_RULES, homeWaitMs: 0, homeNoticeMs: 1000 }),
      persistence: () => persistence,
    });
    expect(await noticed.set(later.leader, 970)).toMatchObject({ ok: true, action: "home_announced" });
    book.post({
      kind: "burn",
      atMs: 0,
      entries: [
        { account: book.ownerAccount(71, ASSET_CREDIT), amount: -80n },
        { account: issue, amount: 80n },
      ],
    });
    now += 2000;
    const moves = createHouseMoves({
      pool: test.db.$client,
      db: test.db,
      now: () => now,
      rules: () => TEST_HOUSE_RULES,
      persistence: () => persistence,
    });
    expect(await moves.applyDue()).toBe(0);
    const left = await rows<{ city_id: string; pending_city_id: string | null }>(
      test.db,
      "select city_id, pending_city_id from house_homes where faction_id = $1",
      [later.id],
    );
    expect(left).toEqual([{ city_id: "901", pending_city_id: null }]);
    const reasons = await rows<{ reason: string | null }>(
      test.db,
      "select reason from house_notices where faction_id = $1 and kind = 'home_cancelled'",
      [later.id],
    );
    expect(reasons.map((row) => row.reason)).toEqual(["entry_fee", "entry_fee"]);
  });
});
