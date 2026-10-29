// 행성 편집기 tRPC DB 통합 시험(2) — 판 기록 50개, 되돌리기·지우기·감사 기록, 감사 기록을 못 쓰면 실패, 다른 사이트 쓰기,
// 편집기를 켜지 않은 서버. TEST_DATABASE_URL이 있을 때만. 아이디·비밀번호는 시험용 가짜 값이다.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, buildAuthApp, rows, trpcMutation, trpcQuery } from "../testDb.ts";
import { TRPC_CACHE_CONTROL } from "../trpc/plugin.ts";
import { PLANET_DRAFT_REVISIONS_KEPT } from "./store.ts";
import {
  EDITOR_PLANET_ID,
  type EditorTestApp,
  editorMutation,
  editorQuery,
  errorOf,
  isJsonObject,
  rawPlanet,
  resultOf,
  startEditorTestApp,
} from "./testSupport.ts";
import type { JsonObject } from "./types.ts";

const CROSS_SITE = { origin: "https://evil.example", "sec-fetch-site": "cross-site" };

describe.skipIf(!TEST_DATABASE_URL)("행성 편집기 (DB) — 판 기록·되돌리기·지우기·감사 기록·출처", () => {
  let env: EditorTestApp;

  const entry = (patch: JsonObject = {}): JsonObject => ({
    ...rawPlanet(env.loaded, EDITOR_PLANET_ID),
    ...patch,
  });
  const save = (
    cookie: string,
    value: JsonObject,
    expectedRevision: number,
    headers?: Record<string, string>,
  ) =>
    editorMutation(
      env.app,
      "drafts.save",
      { planetId: EDITOR_PLANET_ID, entry: value, base: null, expectedRevision },
      cookie,
      headers,
    );
  const draftOf = async (cookie: string): Promise<JsonObject | null> => {
    const value = resultOf(await editorQuery(env.app, "drafts.get", { planetId: EDITOR_PLANET_ID }, cookie));
    return isJsonObject(value) ? value : null;
  };
  const revisionOf = async (cookie: string): Promise<number> => {
    const draft = await draftOf(cookie);
    return typeof draft?.revision === "number" ? draft.revision : 0;
  };
  const revisionList = async (cookie: string): Promise<number[]> => {
    const value = resultOf(
      await editorQuery(env.app, "drafts.revisions", { planetId: EDITOR_PLANET_ID }, cookie),
    );
    if (!Array.isArray(value)) return [];
    const list: readonly unknown[] = value;
    return list.map((item) => (isJsonObject(item) && typeof item.revision === "number" ? item.revision : -1));
  };
  const auditRows = (action: string) =>
    rows<{ actor_id: string; target_id: string; before: unknown; after: unknown }>(
      env.test.db,
      "select actor_id, target_id, before, after from audit_log where action = $1 order by id",
      [action],
    );

  beforeAll(async () => {
    env = await startEditorTestApp();
  });

  afterAll(async () => {
    await env?.close();
  });

  it(`판 기록은 초안마다 최근 ${PLANET_DRAFT_REVISIONS_KEPT}개만 남는다`, async () => {
    const total = PLANET_DRAFT_REVISIONS_KEPT + 5;
    for (let index = 0; index < total; index++) {
      const res = await save(env.cookie.dev, entry({ seed: 1_000 + index }), index);
      expect(res.statusCode, String(index)).toBe(200);
    }
    const list = await revisionList(env.cookie.dev);
    expect(list).toEqual(Array.from({ length: PLANET_DRAFT_REVISIONS_KEPT }, (_, at) => total - at));
    const [count] = await rows<{ n: number }>(
      env.test.db,
      "select count(*)::int as n from planet_draft_revisions r join planet_drafts d on d.id = r.draft_id where d.owner_id = $1",
      [env.userId.dev],
    );
    expect(count?.n).toBe(PLANET_DRAFT_REVISIONS_KEPT);
    // 자동 저장마다 감사 기록을 쓰지 않는다(만들기 한 번만)
    expect(await auditRows("planet_draft.create")).toHaveLength(1);
  });

  it("되돌리기: 그 판의 항목·기준이 새 판이 되고(감사 기록), 지운 판은 NOT_FOUND", async () => {
    const current = await revisionOf(env.cookie.dev);
    const oldest = current - PLANET_DRAFT_REVISIONS_KEPT + 1;
    const res = await editorMutation(
      env.app,
      "drafts.restore",
      { planetId: EDITOR_PLANET_ID, revision: oldest },
      env.cookie.dev,
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe(TRPC_CACHE_CONTROL);
    // 판 1(시드 1,000)부터 저장했으므로 판 n의 시드는 999 + n
    expect(resultOf(res)).toEqual({
      planetId: EDITOR_PLANET_ID,
      revision: current + 1,
      entry: entry({ seed: 999 + oldest }),
      base: null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(await draftOf(env.cookie.dev)).toEqual(resultOf(res));
    const list = await revisionList(env.cookie.dev);
    expect(list[0]).toBe(current + 1);
    expect(list).toHaveLength(PLANET_DRAFT_REVISIONS_KEPT);
    expect(list).not.toContain(oldest);
    const [draft] = await rows<{ id: string }>(
      env.test.db,
      "select id from planet_drafts where owner_id = $1",
      [env.userId.dev],
    );
    expect(await auditRows("planet_draft.restore")).toEqual([
      {
        actor_id: env.userId.dev,
        target_id: draft?.id,
        before: { planetId: EDITOR_PLANET_ID, revision: current },
        after: { planetId: EDITOR_PLANET_ID, revision: current + 1, restoredFrom: oldest },
      },
    ]);

    // 지운 판(가장 오래된 것보다 앞)은 없다
    const gone = await editorMutation(
      env.app,
      "drafts.restore",
      { planetId: EDITOR_PLANET_ID, revision: oldest - 1 },
      env.cookie.dev,
    );
    expect(gone.statusCode).toBe(404);
    expect(errorOf(gone)).toMatchObject({ code: "NOT_FOUND", reason: "revision_not_found" });
    expect(await revisionOf(env.cookie.dev)).toBe(current + 1);
  });

  it("되돌릴 항목도 지금 팩으로 다시 본다(받지 않으면 BAD_REQUEST 코드, 바뀌지 않는다)", async () => {
    const [draft] = await rows<{ id: string }>(
      env.test.db,
      "select id from planet_drafts where owner_id = $1",
      [env.userId.dev],
    );
    // 지워진 판 번호 1 자리에 지금 팩에 없는 바이옴을 쓰는 항목을 넣는다(팩이 바뀐 뒤의 옛 판처럼)
    await env.test.db.$client.query(
      "insert into planet_draft_revisions (draft_id, revision, entry, base) values ($1, 1, $2, null)",
      [draft?.id, JSON.stringify(entry({ biomes: ["ocean_deep", "lava_field"] }))],
    );
    const before = await draftOf(env.cookie.dev);
    const res = await editorMutation(
      env.app,
      "drafts.restore",
      { planetId: EDITOR_PLANET_ID, revision: 1 },
      env.cookie.dev,
    );
    expect(res.statusCode).toBe(400);
    expect(errorOf(res)).toEqual({
      code: "BAD_REQUEST",
      reason: "unknown_biome",
      message: "PLANET_DRAFT_REJECTED",
    });
    expect(await draftOf(env.cookie.dev)).toEqual(before);
  });

  it("지우기: 초안과 판 기록을 지우고 감사 기록, 다시 지우면 removed false(기록 없음), 다시 만들면 판 1부터", async () => {
    const revision = await revisionOf(env.cookie.dev);
    const [draft] = await rows<{ id: string }>(
      env.test.db,
      "select id from planet_drafts where owner_id = $1",
      [env.userId.dev],
    );
    const res = await editorMutation(
      env.app,
      "drafts.remove",
      { planetId: EDITOR_PLANET_ID },
      env.cookie.dev,
    );
    expect(res.statusCode).toBe(200);
    expect(resultOf(res)).toEqual({ removed: true });
    expect(await draftOf(env.cookie.dev)).toBeNull();
    expect(await revisionList(env.cookie.dev)).toEqual([]);
    expect(
      await rows(env.test.db, "select 1 from planet_draft_revisions where draft_id = $1", [draft?.id]),
    ).toHaveLength(0);
    expect(await auditRows("planet_draft.remove")).toEqual([
      {
        actor_id: env.userId.dev,
        target_id: draft?.id,
        before: { planetId: EDITOR_PLANET_ID, revision },
        after: null,
      },
    ]);
    const again = await editorMutation(
      env.app,
      "drafts.remove",
      { planetId: EDITOR_PLANET_ID },
      env.cookie.dev,
    );
    expect(resultOf(again)).toEqual({ removed: false });
    expect(await auditRows("planet_draft.remove")).toHaveLength(1);
    // 지운 초안의 판으로 저장하면 충돌, 기대 판 0이면 새로 만든다
    expect((await save(env.cookie.dev, entry(), revision)).statusCode).toBe(409);
    expect(resultOf(await save(env.cookie.dev, entry(), 0))).toMatchObject({ revision: 1 });
    expect(await auditRows("planet_draft.create")).toHaveLength(2);
  });

  it("감사 기록을 못 쓰면 요청이 실패하고(500) 아무것도 바뀌지 않는다 — 정의 조회는 자료를 보내지 않는다", async () => {
    const db = env.test.db.$client;
    await db.query(`create function test_reject_planet_audit() returns trigger language plpgsql as $$
      begin raise exception 'audit insert rejected (test)'; end; $$`);
    await db.query(`create trigger test_reject_planet_audit before insert on audit_log for each row
      when (new.action like 'planet%') execute function test_reject_planet_audit()`);
    try {
      const definitions = await editorQuery(env.app, "definitions", undefined, env.cookie.admin);
      expect(definitions.statusCode).toBe(500);
      expect(errorOf(definitions)).toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
        message: "internal_error",
      });
      expect(definitions.body).not.toContain("presets");
      expect(definitions.headers["cache-control"]).toBe(TRPC_CACHE_CONTROL);

      // 만들기(admin은 초안 없음)
      expect((await save(env.cookie.admin, entry(), 0)).statusCode).toBe(500);
      expect(await draftOf(env.cookie.admin)).toBeNull();
      expect(
        await rows(env.test.db, "select 1 from planet_drafts where owner_id = $1", [env.userId.admin]),
      ).toHaveLength(0);

      // 되돌리기·지우기(dev 초안 판 1)
      const before = await draftOf(env.cookie.dev);
      const restore = await editorMutation(
        env.app,
        "drafts.restore",
        { planetId: EDITOR_PLANET_ID, revision: 1 },
        env.cookie.dev,
      );
      expect(restore.statusCode).toBe(500);
      const remove = await editorMutation(
        env.app,
        "drafts.remove",
        { planetId: EDITOR_PLANET_ID },
        env.cookie.dev,
      );
      expect(remove.statusCode).toBe(500);
      expect(await draftOf(env.cookie.dev)).toEqual(before);
      expect(await revisionList(env.cookie.dev)).toEqual([1]);

      // 있는 초안 저장(자동 저장)은 감사 기록을 쓰지 않으므로 된다
      expect(resultOf(await save(env.cookie.dev, entry({ seed: 3 }), 1))).toMatchObject({ revision: 2 });
    } finally {
      await db.query("drop trigger test_reject_planet_audit on audit_log");
      await db.query("drop function test_reject_planet_audit()");
    }
    // 실패한 요청의 감사 기록은 남지 않았다(트랜잭션과 함께 되돌려짐)
    expect(await auditRows("planet_draft.restore")).toHaveLength(1);
    expect(await auditRows("planet_draft.remove")).toHaveLength(1);
  });

  it("다른 사이트에서 보낸 쓰기는 403(cross_origin, 세션이 있어도), 같은 출처 화면의 관리자·설정 쓰기는 그대로 된다", async () => {
    const revision = await revisionOf(env.cookie.dev);
    for (const headers of [CROSS_SITE, {}, { origin: "https://evil.example" }]) {
      const res = await save(env.cookie.dev, entry({ seed: 77 }), revision, headers);
      expect(res.statusCode, JSON.stringify(headers)).toBe(403);
      expect(errorOf(res)).toEqual({
        code: "FORBIDDEN",
        reason: "cross_origin",
        message: "CROSS_ORIGIN_REQUEST",
      });
    }
    expect(await revisionOf(env.cookie.dev)).toBe(revision);

    // 관리자 역할 바꾸기·화면 설정: 다른 사이트는 막고, 같은 출처는 된다
    const setRoles = { userId: env.userId.gm, roles: ["player", "gm"] };
    expect(
      (await trpcMutation(env.app, "admin.users.setRoles", setRoles, env.cookie.admin, CROSS_SITE))
        .statusCode,
    ).toBe(403);
    expect(
      (await trpcMutation(env.app, "settings.set", { theme: "dark" }, env.cookie.dev, CROSS_SITE)).statusCode,
    ).toBe(403);
    expect(
      await rows(env.test.db, "select 1 from user_settings where user_id = $1", [env.userId.dev]),
    ).toHaveLength(0);
    const roles = await trpcMutation(env.app, "admin.users.setRoles", setRoles, env.cookie.admin);
    expect(roles.statusCode).toBe(200);
    expect(resultOf(roles)).toMatchObject({ roles: ["player", "gm"] });
    const settings = await trpcMutation(env.app, "settings.set", { theme: "dark" }, env.cookie.dev);
    expect(resultOf(settings)).toMatchObject({ theme: "dark" });
    // 조회는 다른 사이트에서 와도 막지 않는다(읽기만, 응답을 읽을 수 없다)
    const read = await env.app.inject({
      method: "GET",
      url: "/api/trpc/settings.get",
      headers: { cookie: env.cookie.dev, ...CROSS_SITE },
    });
    expect(resultOf(read)).toMatchObject({ theme: "dark" });
  });

  it("편집기 자료 없이 띄운 서버: 권한 확인 뒤 NOT_FOUND(PLANET_EDITOR_UNAVAILABLE)", async () => {
    const bare = await buildAuthApp(env.test.db);
    try {
      const signedOut = await trpcQuery(bare, "planetEditor.definitions", undefined);
      expect(signedOut.statusCode).toBe(401);
      const player = await trpcQuery(bare, "planetEditor.definitions", undefined, env.cookie.player);
      expect(player.statusCode).toBe(403);
      const dev = await trpcQuery(bare, "planetEditor.definitions", undefined, env.cookie.dev);
      expect(dev.statusCode).toBe(404);
      expect(errorOf(dev)).toMatchObject({ code: "NOT_FOUND", message: "PLANET_EDITOR_UNAVAILABLE" });
    } finally {
      await bare.close();
    }
  });
});
