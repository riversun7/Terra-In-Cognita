// 계정 화면 설정(tRPC settings.get·settings.set) DB 통합 시험 — TEST_DATABASE_URL이 있을 때만
// 아이디·비밀번호는 모두 시험용 가짜 값이다.
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  TEST_DATABASE_URL,
  type TestDatabase,
  buildAuthApp,
  createTestDatabase,
  enter,
  rows,
  sessionCookie,
  trpcMutation,
  trpcQuery,
} from "../testDb.ts";

const PASSWORD = "fake pass phrase 1";

/** tRPC 응답의 결과 값 */
const data = (res: { json: () => { result?: { data?: unknown } } }) => res.json().result?.data;

describe.skipIf(!TEST_DATABASE_URL)("계정 화면 설정 (DB)", () => {
  let test: TestDatabase;
  let app: FastifyInstance;
  let first = "";
  let second = "";

  /** 새 계정을 만들고 그 세션 쿠키를 돌려준다 */
  const signUp = async (id: string) =>
    sessionCookie(await enter(app, { id, password: PASSWORD, create: true, passwordConfirm: PASSWORD }));
  const userId = async (key: string) =>
    (await rows<{ id: string }>(test.db, "select id from users where username = $1", [key]))[0]?.id ?? "";

  beforeAll(async () => {
    test = await createTestDatabase();
    app = await buildAuthApp(test.db);
    first = await signUp("Fake_Settings1");
    second = await signUp("Fake_Settings2");
  });

  afterAll(async () => {
    await app?.close();
    await test?.drop();
  });

  it("로그인하지 않으면 읽기·쓰기 모두 401 UNAUTHORIZED", async () => {
    const read = await trpcQuery(app, "settings.get", undefined);
    expect(read.statusCode).toBe(401);
    expect(read.json()).toMatchObject({ error: { data: { code: "UNAUTHORIZED" } } });
    const write = await trpcMutation(app, "settings.set", { theme: "dark" });
    expect(write.statusCode).toBe(401);
    expect(await rows(test.db, "select 1 from user_settings")).toHaveLength(0);
  });

  it("아직 저장하지 않았으면 null", async () => {
    const res = await trpcQuery(app, "settings.get", undefined, first);
    expect(res.statusCode).toBe(200);
    expect(data(res)).toBeNull();
  });

  it("처음 쓰면 줄을 만들고, 보내지 않은 칸은 기본값(null·false)", async () => {
    const res = await trpcMutation(app, "settings.set", { theme: "dark", followSystem: false }, first);
    expect(res.statusCode).toBe(200);
    expect(data(res)).toEqual({ theme: "dark", followSystem: false, locale: null });
    expect(data(await trpcQuery(app, "settings.get", undefined, first))).toEqual({
      theme: "dark",
      followSystem: false,
      locale: null,
    });
  });

  it("보낸 칸만 바꾼다(다른 칸은 그대로), 바꾼 시각이 늘어난다", async () => {
    const [before] = await rows<{ updated_at: Date }>(test.db, "select updated_at from user_settings");
    const res = await trpcMutation(app, "settings.set", { locale: "en" }, first);
    expect(data(res)).toEqual({ theme: "dark", followSystem: false, locale: "en" });
    const after = await trpcMutation(app, "settings.set", { followSystem: true, theme: null }, first);
    expect(data(after)).toEqual({ theme: null, followSystem: true, locale: "en" });
    const [row] = await rows<{ updated_at: Date }>(test.db, "select updated_at from user_settings");
    expect(row?.updated_at.getTime()).toBeGreaterThanOrEqual(before?.updated_at.getTime() ?? 0);
  });

  it("다른 사람의 설정은 보이지 않는다(본인 것만)", async () => {
    expect(data(await trpcQuery(app, "settings.get", undefined, second))).toBeNull();
    await trpcMutation(app, "settings.set", { theme: "station" }, second);
    expect(data(await trpcQuery(app, "settings.get", undefined, first))).toMatchObject({ theme: null });
    expect(data(await trpcQuery(app, "settings.get", undefined, second))).toMatchObject({ theme: "station" });
  });

  it("목록에 없는 값·빈 요청·모르는 칸은 400 BAD_REQUEST이고 저장하지 않는다", async () => {
    for (const input of [
      { theme: "sepia" },
      { locale: "ja" },
      { followSystem: "yes" },
      {},
      { theme: "dark", userId: "someone" },
    ]) {
      const res = await trpcMutation(app, "settings.set", input, first);
      expect(res.statusCode, JSON.stringify(input)).toBe(400);
      expect(res.json()).toMatchObject({ error: { data: { code: "BAD_REQUEST" } } });
    }
    expect(data(await trpcQuery(app, "settings.get", undefined, first))).toEqual({
      theme: null,
      followSystem: true,
      locale: "en",
    });
  });

  it("DB에 모르는 값(더 새 버전)이 있으면 null로 읽는다", async () => {
    const id = await userId("fake_settings2");
    await test.db.$client.query(
      "update user_settings set theme = 'aurora', locale = 'ja' where user_id = $1",
      [id],
    );
    expect(data(await trpcQuery(app, "settings.get", undefined, second))).toEqual({
      theme: null,
      followSystem: false,
      locale: null,
    });
  });

  it("DB 검사 조건: 모양이 틀린 값은 넣을 수 없다", async () => {
    const id = await userId("fake_settings2");
    await expect(
      test.db.$client.query("update user_settings set theme = 'Not A Theme' where user_id = $1", [id]),
    ).rejects.toThrow(/user_settings_theme_format/);
    await expect(
      test.db.$client.query("update user_settings set locale = 'english!' where user_id = $1", [id]),
    ).rejects.toThrow(/user_settings_locale_format/);
  });

  it("계정을 지우면 설정도 지워진다", async () => {
    const id = await userId("fake_settings2");
    await test.db.$client.query("delete from users where id = $1", [id]);
    expect(await rows(test.db, "select 1 from user_settings where user_id = $1", [id])).toHaveLength(0);
  });
});
