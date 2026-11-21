// 랭킹 전투력·자산 시험(DB, house-9 — 기획 D-576·D-7022·D-555 1512·D-097): 원장 묶음 읽기(지갑·물건·사업장 금고 지분 나누기·유닛 지갑),
// 유닛 전투력(배 빼고), 집계가 값 표·재고 지표·NPC 가문원 점수에 싣는지, 경로 판·가문 판 줄의 전투력·자산 칸. TEST_DATABASE_URL이 있을 때만 돈다.
// 바뀜(house-10, 2313·2316): 걸어 둔 주문 몫(거래소·환전·지분)·가문 금고·NPC 가문장(국가 지도자) 지갑·전투력, 모든 유닛 몫과 유닛 판.
// 바뀜(fixes-1116t, 2341 나·2345 나): 가문 몫 감쇠형 점수(ranking_house_scores)가 가문 판 점수에 더해지는지, 규모 시험 봇이 유닛 몫에서 빠지는지.
import type { RankingPathInfo } from "@terra/shared/ranking";
import { TEST_RANKING_COEFFICIENTS } from "@terra/sim";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase } from "../testDb.ts";
import { readHouseBoard } from "./houseBoard.ts";
import { runSnapshot } from "./snapshot.ts";
import { readUnitBoard } from "./unitBoard.ts";
import { testMapKey } from "../world/testMaps.ts";
import { type WorthSource, readWorth } from "./worth.ts";

const NOW = Date.UTC(2026, 10, 16, 12);
const BUILDING = 1_000_000_000_000;

const PATHS: RankingPathInfo[] = [
  {
    id: "strongest",
    name: { ko: "전투력", en: "Combat Power" },
    area: "force",
    open: true,
    measures: [{ measure: "combat_power", weightPm: 1000 }],
  },
  {
    id: "wealthiest",
    name: { ko: "자산", en: "Wealth" },
    area: "wealth",
    open: true,
    measures: [{ measure: "assets", weightPm: 1000 }],
  },
];

/** 값 매기기: 기준 통화 그대로, 나라 화폐 2배, 광석 개당 3, 그 밖 0. 전투력: 유닛 ID × 10. 지배 가문 9의 가문장 = 지도자 유닛 20 */
const SOURCE: WorthSource = {
  valueOf: (asset, qty) =>
    asset === "credit" ? qty : asset === "cur:aa" ? qty * 2n : asset === "item:ore" ? qty * 3n : 0n,
  powerOf: (unitId) => unitId * 10,
  rulingHeads: () => [{ house: 9, unit: 20 }],
  nameOf: (unitId) => (unitId === 3 ? "가람" : undefined),
};
/** 플레이어 가문 세력 행 ID(beforeAll) */
let house = 0;

describe.skipIf(!TEST_DATABASE_URL)("랭킹 전투력·자산 (DB)", () => {
  let test: TestDatabase;
  const sql = (text: string, values: unknown[] = []) => test.db.$client.query(text, values);

  beforeAll(async () => {
    test = await createTestDatabase();
    const nation = Number(
      (await sql(`insert into factions (kind, code) values ('npc', 'worth_nation') returning id`)).rows[0]
        ?.id,
    );
    // 소유 주체: 나라 1, 사람 10·11
    await sql(`insert into world_owners (id, faction_id, settled_at_ms) values (1, $1, 0)`, [nation]);
    // 사람 자리(소유 주체는 사용자나 세력 하나 — 값 셈에는 차이가 없어 세력 둘로 둔다)
    await sql(`insert into factions (kind, code) values ('npc', 'worth_b'), ('npc', 'worth_c')`);
    await sql(
      `insert into world_owners (id, faction_id, settled_at_ms)
         select 10, id, 0 from factions where code = 'worth_b' union all select 11, id, 0 from factions where code = 'worth_c'`,
    );
    await sql(
      `insert into world_cities (id, faction_id, map_key, cell_x, cell_y, start, founded_at_ms) values (1, $1, 7, 1, 1, true, 0)`,
      [nation],
    );
    // 유닛: 나라 휴먼 3·4(가문원), 사람 10의 유닛 5, 배 6(전투력 뺌), 나라 지도자 20(지배 가문 9의 가문장 — 가문원 줄 없음)
    await sql(
      `insert into world_units (id, owner_id, kind, size, speed, map_key, path, depart_at_ms) values
         (3, 1, 0, 1, 1000, 7, '{0,0,1,1}', 0), (4, 1, 0, 1, 1000, 7, '{0,0,1,1}', 0),
         (5, 10, 4, 1, 1000, 7, '{0,0,1,1}', 0), (6, 10, 8, 2, 1000, 7, '{0,0,1,1}', 0),
         (20, 1, 7, 1, 1000, 7, '{0,0,1,1}', 0)`,
    );
    house = Number(
      (await sql(`insert into factions (kind, code) values ('player', 'worth_house') returning id`)).rows[0]
        ?.id,
    );
    await sql(
      `insert into world_humans (unit_id, city_id, satisfaction_milli, born_at_ms, lifespan_ms) values (3, 1, 50000, 0, 1), (4, 1, 50000, 0, 1)`,
    );
    await sql(`insert into npc_houses (id, city_id, name, founded_at_ms) values (9, 1, '시험', 0)`);
    await sql(`insert into npc_house_units (unit_id, house_id, set_at_ms) values (3, 9, 0), (4, 9, 0)`);
    // 원장: 사람 10 지갑 100 + 나라 화폐 50(= 100) + 광석 창고 10(= 30), 사람 11 지갑 7,
    //   사람 10의 사업장(건물 77) 금고 1000 — 지분 100주 발행, 10이 60·11이 30 가짐(10주는 에스크로),
    //   사람 10의 건물 88 금고 40(발행 전 — 주인 전부), 나라 휴먼 3의 지갑 25(유닛 몫 — 나라 자산이 아니다), 유닛 5 화물 광석 2(= 6, 주인 몫)
    await sql(
      `insert into ledger_accounts (id, owner_id, system_code, asset, location, balance) values
         (1, 10, null, 'credit', null, 100),
         (2, 10, null, 'cur:aa', null, 50),
         (3, 10, null, 'item:ore', 1, 10),
         (4, 11, null, 'credit', null, 7),
         (5, 10, null, 'credit', $1::bigint + 77, 1000),
         (6, null, 'issue:share:biz_77', 'share:biz_77', null, -100),
         (7, 10, null, 'share:biz_77', null, 60),
         (8, 11, null, 'share:biz_77', null, 30),
         (9, null, 'escrow:share:77:base', 'share:biz_77', null, 10),
         (10, 10, null, 'credit', $1::bigint + 88, 40),
         (11, 1, null, 'credit', -3, 25),
         (12, 10, null, 'item:ore', -5, 2),
         (13, 1, null, 'credit', null, 500),
         (14, null, 'vault:house:' || $2::text || ':credit', 'credit', null, 200),
         (15, null, 'vault:house:npc:9:credit', 'credit', null, 70),
         (16, 1, null, 'credit', -20, 33)`,
      [BUILDING, house],
    );
    // 걸어 둔 주문(house-10, 2313): 11의 광석 사기(화폐 15 묶임)·10의 광석 팔기(4개 = 12), 11의 환전 팔기(cur:aa 5 = 10), 11의 지분 팔기(에스크로 10주),
    // 10의 지분 사기(기준 통화 8). 끝난 주문(filled)은 세지 않는다
    await sql(`insert into market_books (id, city_id, item, created_at_ms) values (1, 1, 'ore', 0)`);
    await sql(
      `insert into market_orders (id, market_id, owner_id, side, price, qty, remaining, locked, seq, placed_at_ms, expires_at_ms, state, done_at_ms) values
         (1, 1, 11, 'buy', 5, 3, 3, 15, 1, 0, 9, 'open', null),
         (2, 1, 10, 'sell', 5, 1, 1, 4, 2, 0, 9, 'open', null),
         (3, 1, 10, 'sell', 5, 1, 0, 0, 3, 0, 9, 'filled', 1)`,
    );
    await sql(`insert into fx_pairs (id, currency, created_at_ms) values (1, 'cur:aa', 0)`);
    await sql(
      `insert into fx_orders (id, pair_id, owner_id, side, price, lots, locked, seq, placed_at_ms, state, filled_lots) values
         (1, 1, 11, 'sell', 3, 1, 5, 1, 0, 'open', 0)`,
    );
    await sql(
      `insert into business_share_orders (id, building_id, owner_id, side, price, shares, locked, seq, placed_at_ms, state) values
         (1, 77, 11, 'sell', 9, 10, 10, 1, 0, 'open'), (2, 77, 10, 'buy', 4, 2, 8, 2, 0, 'open')`,
    );
  });

  afterAll(async () => {
    await test?.drop();
  });

  it("자산: 지갑·물건·금고 지분 나누기(D-555 1512)·유닛 지갑은 유닛 몫(D-097)·걸어 둔 주문 몫·가문 금고. 전투력: 가진 유닛 합(배 빼고)", async () => {
    const worth = await readWorth(test.db.$client, SOURCE, "credit");
    // 10: 100 + 100 + 30 + 6 + 금고 1000 × 60/100 + 40 + 팔기 광석 4 × 3 + 지분 사기 8 = 896
    // 11: 7 + 금고 1000 × (30 + 팔기 주문 10)/100 + 사기 15 + 환전 팔기 5 × 2 = 432, 나라: 500(휴먼·지도자 지갑 빼고)
    expect(worth.owners.get(10)?.assets).toBe(896n);
    expect(worth.owners.get(11)?.assets).toBe(432n);
    expect(worth.owners.get(1)?.assets).toBe(500n);
    // 전투력: 나라 = 30 + 40 + 지도자 200, 10 = 50(배 6 빼고)
    expect(worth.owners.get(1)?.power).toBe(270n);
    expect(worth.owners.get(10)?.power).toBe(50n);
    // 유닛 몫은 모든 유닛(유닛 판 — 2316)
    expect(worth.units.get(3)).toEqual({ power: 30n, assets: 25n });
    expect(worth.units.get(4)).toEqual({ power: 40n, assets: 0n });
    expect(worth.units.get(5)).toEqual({ power: 50n, assets: 0n });
    expect(worth.units.get(20)).toEqual({ power: 200n, assets: 33n });
    expect(worth.unitInfo.get(3)).toEqual({ owner: 1, name: "가람" });
    // 가문 금고(플레이어 가문)·NPC 지배 가문(금고 70 + 지도자 지갑 33, 지도자 전투력 200)
    expect(worth.houses.get(house)).toEqual({ power: 0n, assets: 200n });
    expect(worth.npcHouses.get(9)).toEqual({ power: 200n, assets: 103n });
    // 출처가 없으면 빈 값
    expect((await readWorth(test.db.$client, undefined, "credit")).owners.size).toBe(0);
  });

  it("집계: 값 표·경로 점수(로그)·NPC 가문원 점수, 가문 판 줄에 가문원 합", async () => {
    const report = await runSnapshot(test.db.$client, {
      paths: PATHS,
      coefficients: TEST_RANKING_COEFFICIENTS,
      creditAsset: "credit",
      nowMs: NOW,
      worth: () => SOURCE,
    });
    expect(report?.worthRows).toBe(9);
    const values = await sql(
      `select kind, subject_id, combat_power::text as p, assets::text as a, owner_id, name from ranking_worth order by kind, subject_id`,
    );
    expect(
      values.rows.map((row) => [
        row.kind,
        Number(row.subject_id),
        row.p,
        row.a,
        row.owner_id === null ? null : Number(row.owner_id),
        row.name,
      ]),
    ).toEqual([
      [0, 1, "270", "500", null, null],
      [0, 10, "50", "896", null, null],
      [0, 11, "0", "432", null, null],
      [1, 3, "30", "25", 1, "가람"],
      [1, 4, "40", "0", 1, null],
      [1, 5, "50", "0", 10, null],
      [1, 20, "200", "33", 1, null],
      [2, house, "0", "200", null, null],
      [3, 9, "200", "103", null, null],
    ]);
    const scores = await sql(
      `select path_id, owner_id, score from ranking_path_scores where path_id = 'wealthiest' order by rank`,
    );
    // 1000 × log2(1 + 896·500·432) — 정수 근사(sim log2Milli)
    expect(scores.rows.map((row) => [Number(row.owner_id), Number(row.score)])).toEqual([
      [10, 9808],
      [1, 8967],
      [11, 8757],
    ]);
    const units = await sql(
      `select unit_id, score from ranking_unit_scores where path_id = 'strongest' order by unit_id`,
    );
    expect(units.rows.map((row) => [Number(row.unit_id), Number(row.score)])).toEqual([
      [3, 4954],
      [4, 5357],
    ]);
    const board = await readHouseBoard(
      {
        db: test.db.$client,
        nations: new Map(),
        coefficients: { tiersPm: TEST_RANKING_COEFFICIENTS.tiersPm, topRanks: 3 },
      },
      "00000000-0000-0000-0000-000000000000",
      "strongest",
    );
    expect(board.rows).toHaveLength(1);
    // 가문원 합 + 지배 가문 몫(금고 70 + 지도자 지갑 33, 지도자 전투력 200 — 2313)
    expect(board.rows[0]).toMatchObject({ npc: true, members: 2, worth: { power: "270", assets: "128" } });
    // 가문 몫 점수(2341 나): 금고·지도자 몫을 재고 지표로 쌓은 감쇠형 점수 — 전투력 경로는 NPC 가문만(플레이어 가문 금고는 전투력 0),
    // 자산 경로는 둘 다. 가문 판 점수 = 가문원 합 + 가문 몫
    const own = await sql(
      `select path_id, npc, house_id, score from ranking_house_scores order by path_id, npc, house_id`,
    );
    const ownRows = own.rows.map((row) => [row.path_id, row.npc, Number(row.house_id), Number(row.score)]);
    expect(ownRows.map((row) => row.slice(0, 3))).toEqual([
      ["strongest", true, 9],
      ["wealthiest", false, house],
      ["wealthiest", true, 9],
    ]);
    const npcStrong = Number(ownRows[0]?.[3]);
    expect(npcStrong).toBeGreaterThan(0);
    expect(board.rows[0]?.score).toBe(4954 + 5357 + npcStrong);
    const wealth = await readHouseBoard(
      {
        db: test.db.$client,
        nations: new Map(),
        coefficients: { tiersPm: TEST_RANKING_COEFFICIENTS.tiersPm, topRanks: 3 },
      },
      "00000000-0000-0000-0000-000000000000",
      "wealthiest",
    );
    // 플레이어 가문은 가문원 점수가 없어도 가문 몫 점수(금고 200)로 줄이 선다(가문원 0명). NPC 가문은 가문원 자산 점수 + 가문 몫(금고 70 + 지도자 지갑 33)
    const playerRow = wealth.rows.find((row) => row.npc !== true);
    expect(playerRow).toMatchObject({ members: 0, score: Number(ownRows[1]?.[3]), worth: { assets: "200" } });
    expect(wealth.rows.find((row) => row.npc === true)?.score).toBeGreaterThan(Number(ownRows[2]?.[3]));
  });

  it("규모 시험 봇(2345 나·2392 나): 시험 2차맵의 휴먼 줄 없는 봇은 유닛 몫·주인 전투력에서 빠지고, 같은 자리의 NPC 휴먼은 든다", async () => {
    const testKey = testMapKey(0);
    await sql(
      `insert into world_units (id, owner_id, kind, size, speed, map_key, path, depart_at_ms) values
         (30, 1, 0, 1, 1000, $1, '{0,0,1,1}', 0), (31, 1, 0, 1, 1000, $1, '{0,0,1,1}', 0)`,
      [testKey],
    );
    await sql(
      `insert into world_humans (unit_id, city_id, satisfaction_milli, born_at_ms, lifespan_ms) values (31, 1, 50000, 0, 1)`,
    );
    try {
      const worth = await readWorth(test.db.$client, SOURCE, "credit");
      expect(worth.units.has(30)).toBe(false);
      expect(worth.unitInfo.has(30)).toBe(false);
      expect(worth.units.get(31)).toEqual({ power: 310n, assets: 0n });
      // 주인(나라) 전투력 합에서도 빠진다(2392 나): 270 + 310 — 봇 30의 300은 넣지 않는다
      expect(worth.owners.get(1)?.power).toBe(580n);
    } finally {
      await sql(`delete from world_humans where unit_id = 31`);
      await sql(`delete from world_units where id in (30, 31)`);
    }
  });

  it("유닛 판(2316): 지표 값 순위·주인 이름·내 유닛 줄·등급 문턱", async () => {
    const ctx = {
      db: test.db.$client,
      nations: new Map([["worth_nation", { ko: "시험 나라", en: "Test nation" }]]),
      coefficients: { tiersPm: [500], topRanks: 1 },
    };
    const power = await readUnitBoard(ctx, 10, "combat_power");
    expect(power.total).toBe(4);
    expect(power.rows.map((row) => [row.rank, row.unitId, row.score, row.me])).toEqual([
      [1, 20, 200, false],
      [2, 5, 50, true],
      [3, 4, 40, false],
      [4, 3, 30, false],
    ]);
    expect(power.rows[0]).toMatchObject({ kind: "unit", owner: { ko: "시험 나라" }, top: true, name: null });
    expect(power.rows[3]?.name).toEqual({ ko: "가람", en: "가람" });
    expect(power.me?.unitId).toBe(5);
    expect(power.tiers).toEqual([{ tierPm: 500, minScore: 50 }]);
    // 자산 판: 값 0인 유닛은 빠진다(3·20만)
    const assets = await readUnitBoard(ctx, 10, "assets");
    expect(assets.rows.map((row) => [row.unitId, row.score])).toEqual([
      [20, 33],
      [3, 25],
    ]);
    expect(assets.me).toBeNull();
  });
});
