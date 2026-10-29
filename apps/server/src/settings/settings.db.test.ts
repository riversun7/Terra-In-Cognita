// 계정 설정(tRPC settings.get·settings.set) DB 통합 시험 — TEST_DATABASE_URL이 있을 때만
// 아이디·비밀번호는 모두 시험용 가짜 값이다.
import { parseUserSettings } from "@terra/shared";
import { eq, sql } from "drizzle-orm";
import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  JSON_HEADERS,
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

// ── 메뉴(nav)·홈(home) 묶음(ADR 2026-10-29-app-shell 5·6절) ──

/** 더 새 버전이 넣은 칸(extra)·목록에 없는 항목 ID(future_item)가 든 메뉴 */
const NAV = {
  layout: "a",
  menu: ["future_item", "cyborg", "home", "map", "units", "economy", "faction"],
  extra: { deep: [1, { a: null }], text: "가" },
};
/** 목록에 없는 카드·크기가 없는 카드·카드 안의 모르는 칸이 든 홈 */
const HOME = {
  template: "dt_hybrid",
  cards: [{ id: "inbox", size: "2x1" }, { id: "future_card", size: "3x3", pin: true }, { id: "units" }],
  extra: "kept",
};

/** 직렬화(JSON.stringify)가 정확히 bytes바이트인 객체: {"extra":"xxx…"} */
const sized = (bytes: number) => ({ extra: "x".repeat(bytes - '{"extra":""}'.length) });
/** 한글(UTF-8 3바이트) count자: {"extra":"가…"} = 12 + 3 × count바이트 */
const korean = (count: number) => ({ extra: "가".repeat(count) });
/** 모양이 맞는(목록에는 없는) ID count개 */
const ids = (count: number) => Array.from({ length: count }, (_, index) => `item_${index}`);
const cards = (count: number) => ids(count).map((id) => ({ id, size: "1x1" }));

/**
 * 직전 판 서버의 user_settings 정의(마이그레이션 20261028132852_user_settings 때 그대로, nav·home 없음).
 * 직전 판 store.ts의 읽기·쓰기를 이 정의로 그대로 돌려 새 DB에서도 되는지 본다.
 */
const previousUserSettings = pgTable("user_settings", {
  userId: uuid("user_id").primaryKey(),
  theme: text("theme"),
  followSystem: boolean("follow_system").notNull().default(false),
  locale: text("locale"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

describe.skipIf(!TEST_DATABASE_URL)("계정 설정: 메뉴·홈 (DB)", () => {
  let test: TestDatabase;
  let app: FastifyInstance;
  let player = "";
  let dev = "";
  let admin = "";
  let both = "";

  const signUp = async (id: string) =>
    sessionCookie(await enter(app, { id, password: PASSWORD, create: true, passwordConfirm: PASSWORD }));
  const userId = async (key: string) =>
    (await rows<{ id: string }>(test.db, "select id from users where username = $1", [key]))[0]?.id ?? "";
  /** 역할을 바꾼다(세션은 쿠키 캐시 없이 매번 DB에서 읽는다, src/auth/auth.ts) */
  const setRole = async (key: string, role: string) => {
    await test.db.$client.query("update users set role = $1 where username = $2", [role, key]);
  };
  const stored = async (key: string) =>
    (
      await rows<{ nav: unknown; home: unknown }>(
        test.db,
        "select s.nav, s.home from user_settings s join users u on u.id = s.user_id where u.username = $1",
        [key],
      )
    )[0];

  beforeAll(async () => {
    test = await createTestDatabase();
    app = await buildAuthApp(test.db);
    player = await signUp("Fake_NavPlayer");
    dev = await signUp("Fake_NavDev");
    admin = await signUp("Fake_NavAdmin");
    both = await signUp("Fake_NavBoth");
    await setRole("fake_navdev", "dev");
    await setRole("fake_navadmin", "player,admin");
    await setRole("fake_navboth", "player,dev");
  });

  afterAll(async () => {
    await app?.close();
    await test?.drop();
  });

  it("저장하고 그대로 읽는다: 모르는 칸·목록에 없는 ID·크기 없는 카드가 남는다", async () => {
    const res = await trpcMutation(app, "settings.set", { nav: NAV, home: HOME }, player);
    expect(res.statusCode).toBe(200);
    expect(data(res)).toEqual({ theme: null, followSystem: false, locale: null, nav: NAV, home: HOME });
    expect(data(await trpcQuery(app, "settings.get", undefined, player))).toEqual({
      theme: null,
      followSystem: false,
      locale: null,
      nav: NAV,
      home: HOME,
    });
    expect(await stored("fake_navplayer")).toEqual({ nav: NAV, home: HOME });
  });

  it("보낸 묶음만 바꾼다: 화면만 보내면 메뉴·홈은 그대로, 메뉴만 보내면 홈은 그대로(통째로 바뀐다)", async () => {
    expect(
      data(await trpcMutation(app, "settings.set", { theme: "dark", followSystem: false }, player)),
    ).toEqual({
      theme: "dark",
      followSystem: false,
      locale: null,
      nav: NAV,
      home: HOME,
    });
    const nav = { layout: "c" };
    expect(data(await trpcMutation(app, "settings.set", { nav }, player))).toEqual({
      theme: "dark",
      followSystem: false,
      locale: null,
      nav,
      home: HOME,
    });
  });

  it("빈 객체도 값이다(정한 것: 모두 기본값)", async () => {
    expect(data(await trpcMutation(app, "settings.set", { nav: {}, home: {} }, both))).toMatchObject({
      nav: {},
      home: {},
    });
  });

  it("크기: 직렬화 4096바이트까지 받고, 넘으면 400 BAD_REQUEST이고 저장하지 않는다(묶음마다 따로 잰다)", async () => {
    const before = await stored("fake_navplayer");
    expect(JSON.stringify(sized(4096)).length).toBe(4096);
    for (const key of ["nav", "home"]) {
      const over = await trpcMutation(app, "settings.set", { [key]: sized(4097) }, player);
      expect(over.statusCode, key).toBe(400);
      expect(over.json()).toMatchObject({ error: { data: { code: "BAD_REQUEST" } } });
    }
    // 한글은 3바이트로 센다: {"extra":"가…"} 12바이트 + 1361자 × 3 = 4095(통과), 1362자 = 4098(넘음)
    expect((await trpcMutation(app, "settings.set", { nav: korean(1362) }, player)).statusCode).toBe(400);
    expect(await stored("fake_navplayer")).toEqual(before);

    const fits = await trpcMutation(app, "settings.set", { nav: sized(4096), home: korean(1361) }, player);
    expect(fits.statusCode).toBe(200);
    expect(await stored("fake_navplayer")).toEqual({ nav: sized(4096), home: korean(1361) });
  });

  it("아는 칸의 모양·목록 길이가 틀리면 400이고 저장하지 않는다(목록에 있는지는 보지 않는다)", async () => {
    await trpcMutation(app, "settings.set", { nav: NAV, home: HOME }, player);
    const bad: unknown[] = [
      { nav: [] },
      { nav: null },
      { nav: "c" },
      { nav: { layout: "C" } },
      { nav: { layout: 1 } },
      { nav: { menu: ids(33) } },
      { nav: { menu: [1] } },
      { nav: { menu: ["Home"] } },
      { nav: { menu: "home" } },
      { home: [] },
      { home: { template: "DT_CITY" } },
      { home: { template: 5 } },
      { home: { cards: cards(25) } },
      { home: { cards: [{ size: "1x1" }] } },
      { home: { cards: [{ id: "bad-id", size: "1x1" }] } },
      { home: { cards: [{ id: "inbox", size: "1 x 1" }] } },
      { home: { cards: "inbox" } },
      { home: HOME, nav: NAV, extra: 1 },
    ];
    for (const input of bad) {
      const res = await trpcMutation(app, "settings.set", input, player);
      expect(res.statusCode, JSON.stringify(input)).toBe(400);
      expect(res.json()).toMatchObject({ error: { data: { code: "BAD_REQUEST" } } });
    }
    expect(await stored("fake_navplayer")).toEqual({ nav: NAV, home: HOME });
    // 상한 안의 길이·모르는 ID는 받는다
    const ok = { nav: { layout: "future_layout", menu: ids(32) }, home: { cards: cards(24) } };
    expect((await trpcMutation(app, "settings.set", ok, player)).statusCode).toBe(200);
  });

  it("jsonb가 받지 않는 글자(NUL·짝 없는 대리 문자)는 칸 이름·값 어디에 있어도 400이고 저장하지 않는다(DB 오류 500이 아니다)", async () => {
    const before = await stored("fake_navplayer");
    for (const bad of ["\u0000", "a\u0000b", "\uD800", "\uDC00"]) {
      for (const input of [
        { nav: { extra: bad } },
        { nav: { menu: ["home"], extra: [{ deep: bad }] } },
        { home: { [`k${bad}`]: 1 } },
        { home: { cards: [{ id: "inbox", note: bad }] } },
      ]) {
        const res = await trpcMutation(app, "settings.set", input, player);
        expect(res.statusCode, JSON.stringify(input)).toBe(400);
        expect(res.json()).toMatchObject({ error: { data: { code: "BAD_REQUEST" } } });
      }
    }
    expect(await stored("fake_navplayer")).toEqual(before);
    // 짝이 맞는 대리 문자(그림 문자)·NUL이 아닌 제어 문자·U+FFFF는 받고 그대로 읽는다
    const nav = { extra: "😀가\t\u0001\uFFFF", "키😀": 1 };
    expect((await trpcMutation(app, "settings.set", { nav }, player)).statusCode).toBe(200);
    expect((await stored("fake_navplayer"))?.nav).toEqual(nav);
    expect(data(await trpcQuery(app, "settings.get", undefined, player))).toMatchObject({ nav });
  });

  it("템플릿 저장 규칙: player가 보낸 기본값이 아닌 템플릿은 dt_hybrid로 바뀌어 저장된다(거절 없음). cards와 모르는 칸은 그대로", async () => {
    for (const template of ["dt_city", "dt_grid", "dt_future"]) {
      const home = { ...HOME, template };
      const res = await trpcMutation(app, "settings.set", { theme: "station", home }, player);
      expect(res.statusCode, template).toBe(200);
      expect(data(res)).toMatchObject({ theme: "station", home: { ...HOME, template: "dt_hybrid" } });
      expect(await stored("fake_navplayer")).toMatchObject({ home: { ...HOME, template: "dt_hybrid" } });
    }
    // 기본값은 그대로, 템플릿 칸이 없으면 더하지 않는다(읽을 때 기본값이다)
    for (const home of [HOME, { cards: HOME.cards, extra: "kept" }]) {
      expect(data(await trpcMutation(app, "settings.set", { home }, player))).toMatchObject({ home });
      expect((await stored("fake_navplayer"))?.home).toEqual(home);
    }
  });

  it("템플릿 저장 규칙: dev·admin(역할 하나라도) 것은 그대로 저장된다", async () => {
    for (const [cookie, key, template] of [
      [dev, "fake_navdev", "dt_grid"],
      [admin, "fake_navadmin", "dt_city"],
      [both, "fake_navboth", "dt_future"],
    ] as const) {
      const home = { ...HOME, template };
      expect(data(await trpcMutation(app, "settings.set", { home }, cookie))).toMatchObject({ home });
      expect(await stored(key)).toMatchObject({ home });
    }
  });

  it("역할이 바뀌면 다음 저장부터 규칙이 바뀐다(이미 저장된 값은 그대로 읽는다)", async () => {
    await setRole("fake_navdev", "player");
    expect(data(await trpcQuery(app, "settings.get", undefined, dev))).toMatchObject({
      home: { template: "dt_grid" },
    });
    const res = await trpcMutation(app, "settings.set", { home: { ...HOME, template: "dt_grid" } }, dev);
    expect(data(res)).toMatchObject({ home: { template: "dt_hybrid" } });
    await setRole("fake_navdev", "dev");
  });

  it("DB에 JSON 객체가 아닌 값(배열·문자열·숫자)이 있으면 칸 없이 읽는다(다른 칸은 그대로)", async () => {
    const id = await userId("fake_navboth");
    await test.db.$client.query(
      `update user_settings set nav = '[1, 2]'::jsonb, home = '"dt_city"'::jsonb, theme = 'dark' where user_id = $1`,
      [id],
    );
    expect(data(await trpcQuery(app, "settings.get", undefined, both))).toEqual({
      theme: "dark",
      followSystem: false,
      locale: null,
    });
    await test.db.$client.query("update user_settings set home = '5'::jsonb where user_id = $1", [id]);
    expect(data(await trpcQuery(app, "settings.get", undefined, both))).not.toHaveProperty("home");
  });

  it("tRPC 묶음 요청(실제 서버): 부른 것마다 따로 답한다 — 하나가 400이어도 다른 것은 저장된다(207)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/trpc/settings.set,settings.set,settings.set?batch=1",
      headers: { ...JSON_HEADERS, cookie: admin },
      payload: JSON.stringify({ 0: { theme: "contrast" }, 1: { nav: [] }, 2: { locale: "en" } }),
    });
    expect(res.statusCode).toBe(207);
    const body: unknown = res.json();
    // 묶음 안의 부르기는 함께 돈다(순서를 보장하지 않는다). 그래서 각 답은 자기 칸만 본다
    expect(body).toMatchObject([
      { result: { data: { theme: "contrast" } } },
      { error: { data: { code: "BAD_REQUEST", httpStatus: 400 } } },
      { result: { data: { locale: "en" } } },
    ]);
    expect(data(await trpcQuery(app, "settings.get", undefined, admin))).toMatchObject({
      theme: "contrast",
      locale: "en",
    });
  });

  it("직전 판 서버(nav·home을 모름)가 새 DB에서 읽고 쓴다: 새 칸을 지우지 않고, 새 서버는 그 값을 함께 읽는다", async () => {
    const id = await userId("fake_navadmin");
    const before = await stored("fake_navadmin");
    expect(before?.home).toMatchObject({ template: "dt_city" });
    // 직전 판 readUserSettings: select() → parseUserSettings(row)
    const [row] = await test.db
      .select()
      .from(previousUserSettings)
      .where(eq(previousUserSettings.userId, id))
      .limit(1);
    expect(row).toBeDefined();
    expect(Object.keys(row ?? {})).toEqual(["userId", "theme", "followSystem", "locale", "updatedAt"]);
    expect(parseUserSettings(row)).toEqual({ theme: "contrast", followSystem: false, locale: "en" });
    // 직전 판 writeUserSettings: 보낸 칸만 upsert … returning
    const [written] = await test.db
      .insert(previousUserSettings)
      .values({ userId: id, theme: "station" })
      .onConflictDoUpdate({
        target: previousUserSettings.userId,
        set: { theme: "station", updatedAt: sql`now()` },
      })
      .returning();
    expect(parseUserSettings(written)).toEqual({ theme: "station", followSystem: false, locale: "en" });
    expect(await stored("fake_navadmin")).toEqual(before);
    expect(data(await trpcQuery(app, "settings.get", undefined, admin))).toMatchObject({
      theme: "station",
      locale: "en",
      home: before?.home,
    });

    // 줄이 없는 계정: 직전 판이 줄을 만들면 nav·home은 비어 있고, 새 서버는 칸 없이 읽는다
    const fresh = await signUp("Fake_NavFresh");
    const [created] = await test.db
      .insert(previousUserSettings)
      .values({ userId: await userId("fake_navfresh"), theme: "dark" })
      .onConflictDoUpdate({
        target: previousUserSettings.userId,
        set: { theme: "dark", updatedAt: sql`now()` },
      })
      .returning();
    expect(parseUserSettings(created)).toEqual({ theme: "dark", followSystem: false, locale: null });
    expect(await stored("fake_navfresh")).toEqual({ nav: null, home: null });
    expect(data(await trpcQuery(app, "settings.get", undefined, fresh))).toEqual({
      theme: "dark",
      followSystem: false,
      locale: null,
    });
  });
});
