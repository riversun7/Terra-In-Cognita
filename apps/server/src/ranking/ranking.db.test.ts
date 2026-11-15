// 랭킹 집계·조회 시험(DB) — 원장 산출·전투 기록(언더독)·도시·시설·세력 규모를 읽어 한 번 세고, 다음 경계에 감쇠·지난 순위를 남기고,
// 판·내 자리·사이보그 칸·tRPC(로그인·시안 권한)를 본다. TEST_DATABASE_URL이 있을 때만 돈다. 아이디·비밀번호는 모두 시험용 가짜 값이다.
import type { RankingPathInfo } from "@terra/shared/ranking";
import type { inferRouterOutputs } from "@trpc/server";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { TEST_RANKING_COEFFICIENTS } from "@terra/sim";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.ts";
import { createAuth } from "../auth/auth.ts";
import { executeCommand, parseCliArgs } from "../cli/commands.ts";
import {
  TEST_DATABASE_URL,
  TEST_SETTINGS,
  type TestDatabase,
  createTestDatabase,
  enter,
  sessionCookie,
  trpcQuery,
} from "../testDb.ts";
import type { AppRouter } from "../trpc/router.ts";
import { createRankingServices } from "./services.ts";
import { readSnapshotState, runSnapshot } from "./snapshot.ts";

type Outputs = inferRouterOutputs<AppRouter>;

const PASSWORD = "fake pass phrase 1";
const DAY = 86_400_000;
/** 시험 시각: 2026-11-07 12:00 UTC → 경계 2026-11-07 00:00, 처음 집계 기간 = 그 앞 하루 */
const NOW = Date.UTC(2026, 10, 7, 12);
const BOUNDARY = Date.UTC(2026, 10, 7);
const IN_WINDOW = BOUNDARY - 3 * 3_600_000;

const PATHS: RankingPathInfo[] = [
  {
    id: "conqueror",
    name: { ko: "정복자", en: "Conqueror" },
    area: "force",
    open: true,
    measures: [
      { measure: "war_wins", weightPm: 1000 },
      { measure: "cities_held", weightPm: 1000 },
    ],
  },
  {
    id: "mercenary",
    name: { ko: "용병·투사", en: "Mercenary" },
    area: "force",
    open: true,
    measures: [{ measure: "battle_wins", weightPm: 1000 }],
  },
  {
    id: "landlord",
    name: { ko: "대지주", en: "Landlord" },
    area: "wealth",
    open: true,
    measures: [{ measure: "production", weightPm: 1000 }],
  },
  {
    id: "architect",
    name: { ko: "건축가", en: "Architect" },
    area: "tech",
    open: true,
    measures: [{ measure: "facilities", weightPm: 1000 }],
  },
  { id: "trader", name: { ko: "무역상", en: "Trader" }, area: "wealth", open: false, measures: [] },
];
const NATIONS = new Map([["rank_nation_a", { ko: "시험 국가 가", en: "Test nation A" }]]);

/** 전투 시작 자료의 편·유닛(집계가 읽는 칸만) */
const side = (id: number, faction: number) => ({ id, faction, defender: id === 2, edge: id });
const unit = (id: number, sideId: number) => ({ id, side: sideId });

const errorCode = (res: LightMyRequestResponse) =>
  res.json<{ error?: { data?: { code?: string } } }>().error?.data?.code;

describe.skipIf(!TEST_DATABASE_URL)("랭킹 집계·조회 (DB)", () => {
  let test: TestDatabase;
  let app: FastifyInstance;
  let player = "";
  let dev = "";
  let playerId = "";
  let factionA = 0;
  let factionB = 0;

  const sql = (text: string, values: unknown[] = []) => test.db.$client.query(text, values);
  const services = () => createRankingServices({ db: test.db.$client, paths: PATHS, nations: NATIONS });
  const snapshot = (nowMs: number) =>
    runSnapshot(test.db.$client, {
      paths: PATHS,
      coefficients: TEST_RANKING_COEFFICIENTS,
      creditAsset: "s3_test_credit",
      nowMs,
    });

  async function query<T>(path: string, input: unknown, cookie: string): Promise<T> {
    const res = await trpcQuery(app, path, input, cookie);
    expect(res.statusCode, path).toBe(200);
    return res.json<{ result: { data: T } }>().result.data;
  }

  beforeAll(async () => {
    test = await createTestDatabase();
    app = await buildApp({
      contentVersion: "test",
      logger: false,
      metricsIntervalMs: 0,
      db: test.db,
      auth: { settings: TEST_SETTINGS, openSignup: true },
      ranking: { paths: PATHS, nations: NATIONS },
    });
    player = sessionCookie(
      await enter(app, { id: "Fake_Rank1", password: PASSWORD, create: true, passwordConfirm: PASSWORD }),
    );
    await enter(app, { id: "Fake_Rank2", password: PASSWORD, create: true, passwordConfirm: PASSWORD });
    const auth = createAuth({ db: test.db, settings: TEST_SETTINGS });
    await executeCommand(
      parseCliArgs(["create-user", "--id", "Fake_RankDev", "--roles", "player,dev"]),
      { TIC_ACTOR: "test:runner", TIC_PASSWORD: PASSWORD },
      { db: test.db, auth },
      { out: () => {}, err: () => {} },
    );
    dev = sessionCookie(await enter(app, { id: "Fake_RankDev", password: PASSWORD }));
    const userId = async (key: string) =>
      String((await sql(`select id from users where username = $1`, [key])).rows[0]?.id);
    playerId = await userId("fake_rank1");
    const otherId = await userId("fake_rank2");

    // 세력 둘(A = 국가 프리셋 코드), 소유 주체: 세력 A 1·세력 B 2·플레이어 10·다른 유저 11
    await sql(`insert into factions (kind, code) values ('npc', 'rank_nation_a'), ('npc', 'rank_house_b')`);
    factionA = Number((await sql(`select id from factions where code = 'rank_nation_a'`)).rows[0]?.id);
    factionB = Number((await sql(`select id from factions where code = 'rank_house_b'`)).rows[0]?.id);
    await sql(`insert into world_owners (id, faction_id, settled_at_ms) values (1, $1, 0), (2, $2, 0)`, [
      factionA,
      factionB,
    ]);
    await sql(`insert into world_owners (id, user_id, settled_at_ms) values (10, $1, 0), (11, $2, 0)`, [
      playerId,
      otherId,
    ]);
    // 도시: A 둘(발전도 10·0), B 하나(발전도 50). 휴먼 3이 A 첫 도시에 산다
    await sql(
      `insert into world_cities (id, faction_id, map_key, cell_x, cell_y, start, founded_at_ms, development) values
         (1, $1, 7, 10, 10, true, 0, 10), (2, $1, 8, 20, 20, false, 0, 0), (3, $2, 9, 5, 5, true, 0, 50)`,
      [factionA, factionB],
    );
    await sql(
      `insert into world_units (id, owner_id, kind, size, speed, map_key, path, depart_at_ms)
         values (1, 1, 0, 1, 1000, 7, '{0,0,1,1}', 0), (2, 1, 0, 1, 1000, 7, '{0,0,1,1}', 0), (3, 1, 0, 1, 1000, 7, '{0,0,1,1}', 0)`,
    );
    await sql(
      `insert into world_humans (unit_id, city_id, satisfaction_milli, born_at_ms, lifespan_ms)
         values (1, 1, 50000, 0, 1), (2, 1, 50000, 0, 1), (3, 1, 50000, 0, 1)`,
    );
    // 플레이어는 A 소속, 사이보그 이름 "랭킹시험"
    await sql(`insert into faction_members (user_id, faction_id) values ($1, $2)`, [playerId, factionA]);
    await sql(
      `insert into cyborgs (user_id, name, name_key, temperament, initial, k_pm, appearance, faction_id, start_city_id, created_at_ms)
         values ($1, '랭킹시험', '랭킹시험', 'balanced', '{10,10,10,10,10,10}', '{100,100,100,100,100,100}', '{}', $2, 1, 0)`,
      [playerId, factionA],
    );
    // 원장: 플레이어 산출 100(기간 안) + 기간 밖 산출 900(세지 않는다), 국고(세력 A 시험 화폐 5500)
    await sql(
      `insert into ledger_accounts (id, owner_id, system_code, asset, location, balance) values
         (1, null, 'rank_reserve_ore', 's3_test_ore', null, -1000),
         (2, 10, null, 's3_test_ore', null, 1000),
         (3, 1, null, 's3_test_credit', null, 5500)`,
    );
    await sql(
      `insert into ledger_transactions (id, kind, at_ms) values (1, 'job_output', $1), (2, 'job_output', $2), (3, 'upkeep', $1)`,
      [IN_WINDOW, BOUNDARY + 1],
    );
    await sql(
      `insert into ledger_entries (tx_id, account_id, amount) values (1, 1, -100), (1, 2, 100), (2, 1, -900), (2, 2, 900)`,
    );
    // 전투: 플레이어(편 2, 유닛 1)가 다른 유저(편 1, 유닛 3)에게 전쟁에서 이김 → 언더독 3000‰.
    // 다른 유저(편 1, 유닛 2)가 플레이어(편 2, 유닛 2)를 전쟁 아닌 전투에서 이김 → 1000‰. 정원사(소유 주체 아님)가 이긴 전투는 0.
    // 세력 B가 정원사 보호 레이드(D-500, 4번)를 막아도 랭킹 점수는 없다
    const battles: [number, boolean, unknown, number][] = [
      [
        1,
        true,
        { sides: [side(1, 11), side(2, 10)], units: [unit(1, 1), unit(2, 1), unit(3, 1), unit(4, 2)] },
        2,
      ],
      [
        2,
        false,
        { sides: [side(1, 11), side(2, 10)], units: [unit(1, 1), unit(2, 1), unit(3, 2), unit(4, 2)] },
        1,
      ],
      [3, false, { sides: [side(1, 0), side(2, 2)], units: [unit(1, 1), unit(2, 2)] }, 1],
      [4, false, { sides: [side(1, 0), side(2, 2)], units: [unit(1, 1), unit(2, 2)] }, 2],
    ];
    for (const [id, war, init, winner] of battles) {
      await sql(
        `insert into world_battles (id, kind, status, seed, sim_version, war, started_at_ms, ends_at_ms, init)
           values ($1, 'normal', 'ended', 1, 13, $2, $3, $3, $4)`,
        [id, war, IN_WINDOW, JSON.stringify(init)],
      );
      await sql(`insert into world_battle_results (battle_id, applied_at_ms, result) values ($1, $2, $3)`, [
        id,
        IN_WINDOW,
        JSON.stringify({ result: { winner, reason: "wipe", endTick: 1 }, units: [] }),
      ]);
    }
    await sql(
      `insert into gardener_waves (id, city_id, cell_key, faction_id, strength, physical, created_at_ms, arrive_at_ms, state, battle_id, kind)
         values (1, 3, 0, $1, 5, 0, $2, $2, 'repelled', 4, 'protection')`,
      [factionB, IN_WINDOW],
    );
    // 정원사 2 세력 명성: 세력 A 소유 주체(1)에 120, 없는 주체(99)는 건너뜀
    await sql(`insert into npc_society (id, seed, day, updated_at_ms, gardener) values (1, 7, 3, 0, $1)`, [
      JSON.stringify({
        mothershipCell: 0,
        nextWaveId: 2,
        relations: [],
        renown: [
          [1, 120],
          [99, 5],
        ],
        nomads: [],
      }),
    ]);
    // 시설: 플레이어가 지은 2레벨(상태 가득) 하나 + 짓는 중(레벨 0) 하나
    await sql(
      `insert into world_facilities (building_id, facility_id, level, condition_ppm, condition_at_ms, built_at_ms, built_by)
         values (1, 'test_house', 2, 1000000, 0, 0, $1), (2, 'test_house', 0, 1000000, 0, 0, $1)`,
      [playerId],
    );
  });

  afterAll(async () => {
    await app?.close();
    await test?.drop();
  });

  it("집계 전: 빈 판·스냅숏 없음, 닫힌 경로는 closed, 없는 경로는 unknown", async () => {
    const view = await query<Outputs["ranking"]["board"]>(
      "ranking.board",
      { board: { kind: "path", path: "conqueror" } },
      player,
    );
    expect(view).toMatchObject({
      snapshot: null,
      status: "ready",
      total: 0,
      rows: [],
      me: null,
      preview: false,
    });
    expect(view.paths.map((path) => path.id)).toEqual(PATHS.map((path) => path.id));
    const closed = await query<Outputs["ranking"]["board"]>(
      "ranking.board",
      { board: { kind: "path", path: "trader" } },
      player,
    );
    expect(closed.status).toBe("closed");
    const unknown = await query<Outputs["ranking"]["board"]>(
      "ranking.board",
      { board: { kind: "path", path: "no_such_path" } },
      player,
    );
    expect(unknown.status).toBe("unknown");
  });

  it("처음 집계: 바로 앞 하루의 흐름 + 지금 재고. 같은 경계에서 다시 부르면 세지 않는다", async () => {
    const report = await snapshot(NOW);
    expect(report).toMatchObject({ fromMs: BOUNDARY - DAY, toMs: BOUNDARY, periods: 1 });
    expect(await snapshot(NOW + 60_000)).toBeNull();
    expect(await readSnapshotState(test.db.$client)).toEqual({
      periodFromMs: BOUNDARY - DAY,
      periodToMs: BOUNDARY,
      computedAtMs: NOW,
    });
    const rows = await sql(
      `select path_id, owner_id, score, gain, rank, prev_rank, tier_pm from ranking_path_scores order by path_id, rank, owner_id`,
    );
    const table = rows.rows.map((row) => [row.path_id, Number(row.owner_id), Number(row.score), row.rank]);
    // 정복자: 플레이어 전쟁 승리 3000, A 도시 log2(1 + 2.1) ≈ 1632, B 도시 log2(2.5) ≈ 1321
    expect(table.filter((row) => row[0] === "conqueror")).toEqual([
      ["conqueror", 10, 3000, 1],
      ["conqueror", 1, 1632, 2],
      ["conqueror", 2, 1321, 3],
    ]);
    // 용병: 다른 유저 1000(정원사가 이긴 전투·보호 레이드는 세지 않는다)
    expect(table.filter((row) => row[0] === "mercenary")).toEqual([["mercenary", 11, 1000, 1]]);
    // 대지주: 기간 안 산출 100만 → log2(101) ≈ 6658
    expect(table.filter((row) => row[0] === "landlord")).toEqual([["landlord", 10, 6658, 1]]);
    // 건축가: 다 지은 2레벨 하나 → log2(3) ≈ 1585
    expect(table.filter((row) => row[0] === "architect")).toEqual([["architect", 10, 1585, 1]]);
    const factions = await sql(
      `select faction_id, score, rank, cities, humans, renown from ranking_faction_scores order by rank`,
    );
    // A = 도시 2 × 1000 + 발전도 10 × 10 + 휴먼 3 × 100 + 국고 5500 ÷ 1000 = 2405, B = 1000 + 500 = 1500
    expect(
      factions.rows.map((row) => [
        Number(row.faction_id),
        Number(row.score),
        row.rank,
        row.cities,
        row.humans,
        row.renown,
      ]),
    ).toEqual([
      [factionA, 2405, 1, 2, 3, "120"],
      [factionB, 1500, 2, 1, 0, null],
    ]);
  });

  it("판·내 자리·사이보그 칸: 이름(사이보그·국가 프리셋·코드), 내 줄, 등급 문턱 점수", async () => {
    const board = await services().board(
      { id: playerId, loginId: "fake_rank1", roles: ["player"] },
      { kind: "path", path: "conqueror" },
      { preview: false, now: NOW },
    );
    expect(board.total).toBe(3);
    expect(
      board.rows.map((row) => [row.rank, row.kind, row.name, row.faction, row.me, row.top, row.tierPm]),
    ).toEqual([
      [
        1,
        "user",
        { ko: "랭킹시험", en: "랭킹시험" },
        { ko: "시험 국가 가", en: "Test nation A" },
        true,
        true,
        500,
      ],
      [2, "npc_faction", { ko: "시험 국가 가", en: "Test nation A" }, null, false, true, null],
      [3, "npc_faction", { ko: "rank_house_b", en: "rank_house_b" }, null, false, true, null],
    ]);
    expect(board.me?.rank).toBe(1);
    expect(board.tiers).toEqual([
      { tierPm: 10, minScore: null },
      { tierPm: 50, minScore: null },
      { tierPm: 200, minScore: null },
      { tierPm: 500, minScore: 3000 },
    ]);
    expect(board.snapshot).toMatchObject({ periodToMs: BOUNDARY, nextAtMs: BOUNDARY + DAY, decayPm: 18 });

    const mine = await query<Outputs["ranking"]["mine"]>("ranking.mine", undefined, player);
    // 점수 높은 순: 대지주 6658 → 정복자 3000 → 건축가 1585
    expect(mine.standings.map((row) => [row.path, row.standing?.rank, row.standing?.total])).toEqual([
      ["landlord", 1, 1],
      ["conqueror", 1, 3],
      ["architect", 1, 1],
    ]);
    expect(mine.faction).toMatchObject({
      name: { ko: "시험 국가 가", en: "Test nation A" },
      standing: { rank: 1, total: 2, score: 2405 },
      detail: { cities: 2, humans: 3, renown: 120 },
    });
    expect(mine.renown).toBeNull();

    const cyborg = await services().cyborgRankings(playerId);
    // 참가자 하나뿐인 판은 어느 등급에도 들지 않는다(1 × 1000 > 1 × 500) → 100(등급 밖)
    expect(cyborg.map((row) => [row.path, row.rank, row.tierPercent, row.score])).toEqual([
      ["landlord", 1, 100, 6658],
      ["conqueror", 1, 50, 3000],
      ["architect", 1, 100, 1585],
    ]);

    // 경로를 비우면 내 점수가 가장 높은 경로(대지주)
    const chosen = await query<Outputs["ranking"]["board"]>(
      "ranking.board",
      { board: { kind: "path", path: null } },
      player,
    );
    expect(chosen.board).toEqual({ kind: "path", path: "landlord" });
    expect(chosen.me?.score).toBe(6658);

    const factionBoard = await query<Outputs["ranking"]["board"]>(
      "ranking.board",
      { board: { kind: "faction" } },
      player,
    );
    expect(factionBoard.rows.map((row) => [row.rank, row.me, row.detail?.cities])).toEqual([
      [1, true, 2],
      [2, false, 1],
    ]);
    // 가문 판(D-569 1746): 가문원 점수 합 — 가문에 들기 전에는 빈 판, 든 뒤 가문 한 줄(소속 도시·나라·가문원 수)
    const houseBoard = () =>
      query<Outputs["ranking"]["board"]>(
        "ranking.board",
        { board: { kind: "house", path: "conqueror" } },
        player,
      );
    expect(await houseBoard()).toMatchObject({ status: "ready", total: 0, rows: [], me: null });
    const made = await sql("insert into factions (kind, born_of) values ('player', $1) returning id", [
      factionA,
    ]);
    const houseId = Number(made.rows[0]?.id);
    await sql(
      "insert into house_members (user_id, faction_id, role, joined_at_ms) values ($1, $2, 'leader', 0)",
      [playerId, houseId],
    );
    await sql("update world_cities set name = 'Rank Town' where id = 1");
    await sql("insert into house_homes (faction_id, city_id, set_at_ms) values ($1, 1, 0)", [houseId]);
    const houses = await houseBoard();
    expect(houses.board).toEqual({ kind: "house", path: "conqueror" });
    expect(houses.total).toBe(1);
    expect(
      houses.rows.map((row) => [row.rank, row.kind, row.me, row.score, row.home, row.members, row.faction]),
    ).toEqual([[1, "house", true, 3000, "Rank Town", 1, { ko: "시험 국가 가", en: "Test nation A" }]]);
    expect(houses.me?.score).toBe(3000);
    // 경로를 비우면 유저 판과 같이 내 점수가 가장 높은 경로
    const chosenHouse = await query<Outputs["ranking"]["board"]>(
      "ranking.board",
      { board: { kind: "house", path: null } },
      player,
    );
    expect(chosenHouse.board).toEqual({ kind: "house", path: "landlord" });
    await sql("delete from house_members where user_id = $1", [playerId]);
  });

  it("다음 경계: 흐름이 없으면 감쇠(18‰), 재고는 다시 더한다, 지난 순위를 남긴다", async () => {
    expect(await snapshot(NOW + DAY)).toMatchObject({ fromMs: BOUNDARY, toMs: BOUNDARY + DAY, periods: 1 });
    const rows = await sql(
      `select path_id, owner_id, score, gain, rank, prev_rank from ranking_path_scores where path_id in ('conqueror', 'mercenary') order by path_id, rank`,
    );
    expect(
      rows.rows.map((row) => [
        row.path_id,
        Number(row.owner_id),
        Number(row.score),
        Number(row.gain),
        row.rank,
        row.prev_rank,
      ]),
    ).toEqual([
      // A: ⌊1632 × 0.982⌋ + 1632 = 3234 → 1위로, 플레이어 3000 → 2946, B: ⌊1321 × 0.982⌋ + 1321 = 2618
      ["conqueror", 1, 3234, 1632, 1, 2],
      ["conqueror", 10, 2946, 0, 2, 1],
      ["conqueror", 2, 2618, 1321, 3, 3],
      ["mercenary", 11, 982, 0, 1, 1],
    ]);
  });

  it("로그인하지 않으면 401, 플레이어가 시안을 부르면 403, dev 시안은 50줄 + 내 줄", async () => {
    const anonymous = await trpcQuery(app, "ranking.mine", undefined);
    expect(anonymous.statusCode).toBe(401);
    expect(errorCode(anonymous)).toBe("UNAUTHORIZED");
    const forbidden = await trpcQuery(
      app,
      "ranking.board",
      { board: { kind: "faction" }, preview: true },
      player,
    );
    expect(forbidden.statusCode).toBe(403);
    expect(errorCode(forbidden)).toBe("FORBIDDEN");
    const bad = await trpcQuery(app, "ranking.board", { board: { kind: "path", path: "Bad-Id" } }, player);
    expect(bad.statusCode).toBe(400);
    const preview = await query<Outputs["ranking"]["board"]>(
      "ranking.board",
      { board: { kind: "path", path: "mercenary" }, preview: true },
      dev,
    );
    expect(preview).toMatchObject({ preview: true, status: "ready", total: 1284 });
    expect(preview.rows).toHaveLength(50);
    expect(preview.me?.me).toBe(true);
    const mine = await query<Outputs["ranking"]["mine"]>("ranking.mine", { preview: true }, dev);
    expect(mine.preview).toBe(true);
    expect(mine.standings.length).toBe(PATHS.filter((path) => path.open).length);
  });
});
