// 행성 편집기 tRPC DB 통합 시험(3) — 지키는 장치: 권한 확인이 세션을 늘리지 않음(쿠키를 줄 수 없어서), 다른 사이트에서 온
// 조회는 감사 기록 없이 403, 사용자별 속도 제한, 묶음 상한. TEST_DATABASE_URL이 있을 때만. 아이디·비밀번호는 시험용 가짜 값이다.
import { TRPC_MAX_BATCH_SIZE, TRPC_PATH } from "@terra/protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, rows, sessionCookie, trpcMutation, trpcQuery } from "../testDb.ts";
import {
  EDITOR_PLANET_ID,
  type EditorTestApp,
  editorMutation,
  editorQuery,
  errorOf,
  rawPlanet,
  resultOf,
  sessionExpiresAt,
  sessionTokenOf,
  startEditorTestApp,
} from "./testSupport.ts";

const DAY_MS = 86_400_000;

const auditCount = async (target: EditorTestApp, action: string) =>
  (
    await rows<{ n: number }>(target.test.db, "select count(*)::int as n from audit_log where action = $1", [
      action,
    ])
  )[0]?.n ?? 0;

/** 7일짜리 세션을 이틀 전에 만든 것처럼(남은 5일): Better Auth가 다음 세션 확인 때 늘리려는 상태 */
const ageSession = async (target: EditorTestApp, cookie: string): Promise<number> => {
  await rows(target.test.db, "update sessions set expires_at = now() + interval '5 days' where token = $1", [
    sessionTokenOf(cookie),
  ]);
  return sessionExpiresAt(target.test, cookie);
};

describe.skipIf(!TEST_DATABASE_URL)("행성 편집기 (DB) — 세션·출처·속도 제한·묶음", () => {
  let env: EditorTestApp;
  /** 속도 제한을 작게 둔 앱(DB·계정은 따로 만든다) */
  let limited: EditorTestApp;

  beforeAll(async () => {
    env = await startEditorTestApp();
    limited = await startEditorTestApp({
      limits: {
        callsPerUser: { capacity: 5, refillPerMinute: 1 },
        definitionsPerUser: { capacity: 2, refillPerMinute: 1 },
      },
    });
  });

  afterAll(async () => {
    await env?.close();
    await limited?.close();
  });

  it("편집기·관리자 권한 확인은 세션을 늘리지 않는다(새 쿠키를 줄 수 없다): 만료 그대로, Set-Cookie 없음, 다음 get-session이 늘린다", async () => {
    const { dev, admin } = env.cookie;
    const devBefore = await ageSession(env, dev);
    const adminBefore = await ageSession(env, admin);
    const entry = rawPlanet(env.loaded, EDITOR_PLANET_ID);
    const responses = [
      await editorQuery(env.app, "definitions", undefined, dev),
      await editorQuery(env.app, "drafts.get", { planetId: EDITOR_PLANET_ID }, dev),
      await editorQuery(env.app, "drafts.revisions", { planetId: EDITOR_PLANET_ID }, dev),
      await editorMutation(
        env.app,
        "drafts.save",
        { planetId: EDITOR_PLANET_ID, entry, base: null, expectedRevision: 0 },
        dev,
      ),
      await editorMutation(env.app, "drafts.remove", { planetId: EDITOR_PLANET_ID }, dev),
      await trpcQuery(env.app, "settings.get", undefined, dev),
      // 관리자 역할 바꾸기도 같은 Better Auth 확인(userHasPermission)을 쓴다
      await trpcMutation(
        env.app,
        "admin.users.setRoles",
        { userId: env.userId.gm, roles: ["player", "gm"] },
        admin,
      ),
    ];
    for (const res of responses) {
      expect(res.statusCode, res.body.slice(0, 120)).toBe(200);
      expect(res.headers["set-cookie"], res.body.slice(0, 120)).toBeUndefined();
    }
    expect(await sessionExpiresAt(env.test, dev)).toBe(devBefore);
    expect(await sessionExpiresAt(env.test, admin)).toBe(adminBefore);

    // 연장은 get-session이 한다(쿠키와 함께)
    const session = await env.app.inject({
      method: "GET",
      url: "/api/auth/get-session",
      headers: { cookie: dev },
    });
    expect(sessionCookie(session)).toMatch(/^tic\.session_token=/);
    expect(await sessionExpiresAt(env.test, dev)).toBeGreaterThan(devBefore + DAY_MS / 2);
  });

  it("관리자 사용자 목록은 Better Auth가 세션을 늘릴 수 있어(끌 수 없다) 늘렸으면 새 쿠키를 함께 보낸다(DB와 쿠키가 같이 늘어난다)", async () => {
    const { admin } = env.cookie;
    const before = await ageSession(env, admin);
    const res = await trpcQuery(env.app, "admin.users.list", { search: "", limit: 5, offset: 0 }, admin);
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(sessionCookie(res)).toMatch(/^tic\.session_token=/);
    expect(await sessionExpiresAt(env.test, admin)).toBeGreaterThan(before + DAY_MS / 2);
    // 새 쿠키로도 그대로 들어가 있다
    const me = await trpcQuery(env.app, "account.me", undefined, sessionCookie(res));
    expect(resultOf(me)).toMatchObject({ roles: ["player", "admin"] });
    // 다시 부르면(이미 늘렸으니) 쿠키를 주지 않는다
    const again = await trpcQuery(env.app, "admin.users.list", { search: "", limit: 5, offset: 0 }, admin);
    expect(again.headers["set-cookie"]).toBeUndefined();
  });

  it("다른 사이트에서 연 정의 조회(GET)는 403 cross_origin, 자료·감사 기록 없음 — 같은 출처·주소창은 된다", async () => {
    const before = await auditCount(env, "planet_editor.read_definitions");
    const url = `${TRPC_PATH}/planetEditor.definitions`;
    for (const headers of [
      { "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate" },
      { "sec-fetch-site": "same-site", "sec-fetch-mode": "navigate" },
      { origin: "https://evil.example" },
    ]) {
      const res = await env.app.inject({
        method: "GET",
        url,
        headers: { cookie: env.cookie.dev, ...headers },
      });
      expect(res.statusCode, JSON.stringify(headers)).toBe(403);
      expect(errorOf(res)).toEqual({
        code: "FORBIDDEN",
        reason: "cross_origin",
        message: "CROSS_ORIGIN_REQUEST",
      });
      expect(res.body).not.toContain("presets");
    }
    // 묶음으로 여러 번 불러도 같다(프로시저마다 403, 하나도 돌지 않는다)
    const batch = await env.app.inject({
      method: "GET",
      url: `${TRPC_PATH}/${Array.from({ length: TRPC_MAX_BATCH_SIZE }, () => "planetEditor.definitions").join(",")}?batch=1`,
      headers: { cookie: env.cookie.dev, "sec-fetch-site": "cross-site" },
    });
    expect(batch.statusCode).toBe(403);
    expect(await auditCount(env, "planet_editor.read_definitions")).toBe(before);

    for (const site of ["same-origin", "none"]) {
      const res = await env.app.inject({
        method: "GET",
        url,
        headers: { cookie: env.cookie.dev, "sec-fetch-site": site },
      });
      expect(res.statusCode, site).toBe(200);
    }
    expect(await auditCount(env, "planet_editor.read_definitions")).toBe(before + 2);
  });

  it(`묶음은 프로시저 ${TRPC_MAX_BATCH_SIZE}개까지: 넘으면 400이고 아무것도 돌지 않는다(감사 기록 없음)`, async () => {
    const before = await auditCount(env, "planet_editor.read_definitions");
    const over = await env.app.inject({
      method: "GET",
      url: `${TRPC_PATH}/${Array.from({ length: TRPC_MAX_BATCH_SIZE + 1 }, () => "planetEditor.definitions").join(",")}?batch=1`,
      headers: { cookie: env.cookie.admin },
    });
    expect(over.statusCode).toBe(400);
    expect(over.body).not.toContain("presets");
    expect(await auditCount(env, "planet_editor.read_definitions")).toBe(before);
    const input = encodeURIComponent(
      JSON.stringify(
        Object.fromEntries(
          Array.from({ length: TRPC_MAX_BATCH_SIZE }, (_, at) => [at, { planetId: EDITOR_PLANET_ID }]),
        ),
      ),
    );
    const atLimit = await env.app.inject({
      method: "GET",
      url: `${TRPC_PATH}/${Array.from({ length: TRPC_MAX_BATCH_SIZE }, () => "planetEditor.drafts.get").join(",")}?batch=1&input=${input}`,
      headers: { cookie: env.cookie.admin },
    });
    expect(atLimit.statusCode).toBe(200);
    expect(atLimit.json()).toHaveLength(TRPC_MAX_BATCH_SIZE);
  });

  it("사용자별 속도 제한: 정의 조회는 따로 더 작게, 넘으면 429 rate_limited(감사 기록 없음), 다른 사람은 따로 센다", async () => {
    const { dev, dev2 } = limited.cookie;
    const definitions = () => editorQuery(limited.app, "definitions", undefined, dev);
    expect((await definitions()).statusCode).toBe(200);
    expect((await definitions()).statusCode).toBe(200);
    const third = await definitions();
    expect(third.statusCode).toBe(429);
    expect(errorOf(third)).toEqual({
      code: "TOO_MANY_REQUESTS",
      reason: "rate_limited",
      message: "RATE_LIMITED",
    });
    expect(third.body).not.toContain("presets");
    expect(await auditCount(limited, "planet_editor.read_definitions")).toBe(2);

    // 편집기 호출 전체(정의 조회 셋 포함 5개까지): 남은 둘을 쓰면 그다음은 429. 입력이 틀려도 제한이 먼저다
    const get = () => editorQuery(limited.app, "drafts.get", { planetId: EDITOR_PLANET_ID }, dev);
    expect((await get()).statusCode).toBe(200);
    expect((await get()).statusCode).toBe(200);
    for (const res of [
      await get(),
      await editorMutation(limited.app, "drafts.remove", { planetId: "Bad Id" }, dev),
    ]) {
      expect(res.statusCode).toBe(429);
      expect(errorOf(res)?.reason).toBe("rate_limited");
    }
    // 다른 사람은 따로 센다
    expect((await editorQuery(limited.app, "definitions", undefined, dev2)).statusCode).toBe(200);
    // 권한 없는 사람은 제한보다 권한이 먼저다(403)
    const player = await editorQuery(limited.app, "definitions", undefined, limited.cookie.player);
    expect(player.statusCode).toBe(403);
  });
});
