// 세력·우편 화면 조회 시험(DB) — 실제 자료 읽기(소유 주체·유닛·건물·잔고, 세력 소속·국고·위 세력), tRPC 로그인·시안 자료 권한.
// TEST_DATABASE_URL이 있을 때만 돈다. 아이디·비밀번호는 모두 시험용 가짜 값이다.
import type { inferRouterOutputs } from "@trpc/server";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuth } from "../auth/auth.ts";
import { executeCommand, parseCliArgs } from "../cli/commands.ts";
import {
  TEST_DATABASE_URL,
  TEST_SETTINGS,
  type TestDatabase,
  buildAuthApp,
  createTestDatabase,
  enter,
  sessionCookie,
  trpcQuery,
} from "../testDb.ts";
import type { AppRouter } from "../trpc/router.ts";
import { readFactionReal } from "./source.ts";

type Outputs = inferRouterOutputs<AppRouter>;

const PASSWORD = "fake pass phrase 1";

const errorCode = (res: LightMyRequestResponse) =>
  res.json<{ error?: { data?: { code?: string } } }>().error?.data?.code;

describe.skipIf(!TEST_DATABASE_URL)("세력·우편 화면 조회 (DB)", () => {
  let test: TestDatabase;
  let app: FastifyInstance;
  let player = "";
  let dev = "";

  const sql = (text: string, values: unknown[] = []) => test.db.$client.query(text, values);

  async function query<T>(path: string, input: unknown, cookie: string): Promise<T> {
    const res = await trpcQuery(app, path, input, cookie);
    expect(res.statusCode, path).toBe(200);
    return res.json<{ result: { data: T } }>().result.data;
  }

  const userIdOf = async (loginKey: string): Promise<string> => {
    const result = await sql(`select id from users where username = $1`, [loginKey]);
    return String(result.rows[0]?.id);
  };

  beforeAll(async () => {
    test = await createTestDatabase();
    app = await buildAuthApp(test.db);
    player = sessionCookie(
      await enter(app, { id: "Fake_Faction1", password: PASSWORD, create: true, passwordConfirm: PASSWORD }),
    );
    const auth = createAuth({ db: test.db, settings: TEST_SETTINGS });
    await executeCommand(
      parseCliArgs(["create-user", "--id", "Fake_FactionDev", "--roles", "player,dev"]),
      { TIC_ACTOR: "test:runner", TIC_PASSWORD: PASSWORD },
      { db: test.db, auth },
      { out: () => {}, err: () => {} },
    );
    dev = sessionCookie(await enter(app, { id: "Fake_FactionDev", password: PASSWORD }));
  });

  afterAll(async () => {
    await app?.close();
    await test?.drop();
  });

  it("로그인하지 않으면 401, 플레이어가 시안 자료를 부르면 403", async () => {
    for (const path of ["faction.overview", "mail.list"]) {
      const anonymous = await trpcQuery(app, path, undefined);
      expect(anonymous.statusCode, path).toBe(401);
      expect(errorCode(anonymous), path).toBe("UNAUTHORIZED");
      const forbidden = await trpcQuery(app, path, { preview: true }, player);
      expect(forbidden.statusCode, path).toBe(403);
      expect(errorCode(forbidden), path).toBe("FORBIDDEN");
    }
  });

  it("플레이어: 세력 없음(개인), 여섯 칸 준비 중, 빈 우편함(월드 없는 서버라 실제 자료 출처가 없다)", async () => {
    const view = await query<Outputs["faction"]["overview"]>("faction.overview", undefined, player);
    expect(view).toMatchObject({ preview: false, stage: "individual", faction: null, locks: [] });
    expect(view.cities).toEqual({ status: "not_ready" });
    const mail = await query<Outputs["mail"]["list"]>("mail.list", { preview: false }, player);
    expect(mail).toMatchObject({ preview: false, items: [], unread: 0 });
  });

  it("dev 시안 자료: 세력 요약·여섯 칸·우편이 시안 자료다", async () => {
    const view = await query<Outputs["faction"]["overview"]>("faction.overview", { preview: true }, dev);
    expect(view.preview).toBe(true);
    expect(view.faction?.preview).toBe(true);
    expect(view.wars.status).toBe("ready");
    const mail = await query<Outputs["mail"]["list"]>("mail.list", { preview: true }, dev);
    expect(mail.items.length).toBeGreaterThan(0);
    expect(mail.items.every((item) => item.preview === true)).toBe(true);
  });

  it("실제 자료 읽기: 주체가 없으면 null, 소속·국고·위 세력·유닛·건물·잔고(위치 없는 0 아닌 계정만)", async () => {
    const userId = await userIdOf("fake_faction1");
    expect(await readFactionReal(test.db.$client, userId)).toEqual({ owner: null, faction: null });

    await sql(`insert into factions (kind, code) values ('npc', 'test_crown'), ('npc', 'test_house')`);
    const crown = Number((await sql(`select id from factions where code = 'test_crown'`)).rows[0]?.id);
    const house = Number((await sql(`select id from factions where code = 'test_house'`)).rows[0]?.id);
    await sql(`update factions set parent_id = $1 where id = $2`, [crown, house]);
    await sql(`insert into faction_members (user_id, faction_id) values ($1, $2)`, [userId, house]);
    await sql(`insert into world_owners (id, user_id, settled_at_ms) values (101, $1, 0)`, [userId]);
    await sql(`insert into world_owners (id, faction_id, settled_at_ms) values (102, $1, 0)`, [house]);
    await sql(
      `insert into world_units (id, owner_id, kind, size, speed, map_key, path, depart_at_ms)
         values (1, 101, 1, 1, 1000, 7, '{0,0,1,1}', 0), (2, 101, 1, 1, 1000, 7, '{0,0,1,1}', 0)`,
    );
    await sql(
      `insert into world_buildings (id, map_key, owner_id, x, y, width, height, rotation) values (1, 7, 101, 0, 0, 2, 2, 0)`,
    );
    await sql(
      `insert into ledger_accounts (id, owner_id, asset, location, balance) values
         (1, 101, 's3_test_credit', null, 1500),
         (2, 101, 's3_test_ore', null, 0),
         (3, 101, 's3_test_ore', 5, 30),
         (4, 102, 's3_test_credit', null, 9000000000000)`,
    );

    const real = await readFactionReal(test.db.$client, userId);
    expect(real.owner).toEqual({
      units: 2,
      buildings: 1,
      balances: [{ asset: "s3_test_credit", name: null, amount: "1500" }],
    });
    expect(real.faction).toMatchObject({
      id: house,
      kind: "npc",
      code: "test_house",
      parent: { id: crown, kind: "npc", code: "test_crown" },
      memberCount: 1,
      treasury: [{ asset: "s3_test_credit", name: null, amount: "9000000000000" }],
    });
    expect(real.faction?.joinedAt).toBeGreaterThan(0);
  });
});
