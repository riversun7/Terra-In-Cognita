// 랭킹 전투력·자산 시험(DB, house-9 — 기획 D-576·D-7022·D-555 1512·D-097): 원장 묶음 읽기(지갑·물건·사업장 금고 지분 나누기·유닛 지갑),
// 유닛 전투력(배 빼고), 집계가 값 표·재고 지표·NPC 가문원 점수에 싣는지, 경로 판·가문 판 줄의 전투력·자산 칸. TEST_DATABASE_URL이 있을 때만 돈다.
import type { RankingPathInfo } from "@terra/shared/ranking";
import { TEST_RANKING_COEFFICIENTS } from "@terra/sim";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase } from "../testDb.ts";
import { readHouseBoard } from "./houseBoard.ts";
import { runSnapshot } from "./snapshot.ts";
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

/** 값 매기기: 기준 통화 그대로, 나라 화폐 2배, 광석 개당 3, 그 밖 0. 전투력: 유닛 ID × 10 */
const SOURCE: WorthSource = {
  valueOf: (asset, qty) =>
    asset === "credit" ? qty : asset === "cur:aa" ? qty * 2n : asset === "item:ore" ? qty * 3n : 0n,
  powerOf: (unitId) => unitId * 10,
};

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
    // 유닛: 나라 휴먼 3·4(가문원), 사람 10의 유닛 5, 배 6(전투력 뺌)
    await sql(
      `insert into world_units (id, owner_id, kind, size, speed, map_key, path, depart_at_ms) values
         (3, 1, 0, 1, 1000, 7, '{0,0,1,1}', 0), (4, 1, 0, 1, 1000, 7, '{0,0,1,1}', 0),
         (5, 10, 4, 1, 1000, 7, '{0,0,1,1}', 0), (6, 10, 8, 2, 1000, 7, '{0,0,1,1}', 0)`,
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
         (13, 1, null, 'credit', null, 500)`,
      [BUILDING],
    );
  });

  afterAll(async () => {
    await test?.drop();
  });

  it("자산: 지갑·물건·금고 지분 나누기(D-555 1512)·유닛 지갑은 유닛 몫(D-097). 전투력: 가진 유닛 합(배 빼고)", async () => {
    const worth = await readWorth(test.db.$client, SOURCE, new Set([3, 4]));
    // 10: 100 + 100 + 30 + 6 + 금고 1000 × 60/100 + 40 = 876, 11: 7 + 1000 × 30/100 = 307, 나라: 500(휴먼 지갑 빼고)
    expect(worth.owners.get(10)?.assets).toBe(876n);
    expect(worth.owners.get(11)?.assets).toBe(307n);
    expect(worth.owners.get(1)?.assets).toBe(500n);
    // 전투력: 나라 = 30 + 40, 10 = 50(배 6 빼고)
    expect(worth.owners.get(1)?.power).toBe(70n);
    expect(worth.owners.get(10)?.power).toBe(50n);
    expect(worth.units.get(3)).toEqual({ power: 30n, assets: 25n });
    expect(worth.units.get(4)).toEqual({ power: 40n, assets: 0n });
    // 출처가 없으면 빈 값
    expect((await readWorth(test.db.$client, undefined, new Set([3]))).owners.size).toBe(0);
  });

  it("집계: 값 표·경로 점수(로그)·NPC 가문원 점수, 가문 판 줄에 가문원 합", async () => {
    const report = await runSnapshot(test.db.$client, {
      paths: PATHS,
      coefficients: TEST_RANKING_COEFFICIENTS,
      creditAsset: "credit",
      nowMs: NOW,
      worth: () => SOURCE,
    });
    expect(report?.worthRows).toBe(5);
    const values = await sql(
      `select kind, subject_id, combat_power::text as p, assets::text as a from ranking_worth order by kind, subject_id`,
    );
    expect(values.rows.map((row) => [row.kind, Number(row.subject_id), row.p, row.a])).toEqual([
      [0, 1, "70", "500"],
      [0, 10, "50", "876"],
      [0, 11, "0", "307"],
      [1, 3, "30", "25"],
      [1, 4, "40", "0"],
    ]);
    const scores = await sql(
      `select path_id, owner_id, score from ranking_path_scores where path_id = 'wealthiest' order by rank`,
    );
    // 1000 × log2(1 + 876·500·307) — 정수 근사(sim log2Milli)
    expect(scores.rows.map((row) => [Number(row.owner_id), Number(row.score)])).toEqual([
      [10, 9776],
      [1, 8967],
      [11, 8266],
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
    expect(board.rows[0]).toMatchObject({ npc: true, members: 2, worth: { power: "70", assets: "25" } });
  });
});
