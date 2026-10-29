// 행성 편집기 tRPC DB 통합 시험(2) — 판 기록 50개, 되돌리기·지우기·감사 기록, 지운 뒤 다시 만들어도 옛 판 번호를 쓰지 않음,
// 팩에 없는 행성 초안 지우기, 감사 기록을 못 쓰면 실패, 다른 사이트 쓰기, 편집기를 켜지 않은 서버.
// TEST_DATABASE_URL이 있을 때만. 아이디·비밀번호는 시험용 가짜 값이다. 판 번호는 값을 적지 않고 응답에서 읽는다
// (모든 초안이 함께 쓰는 번호라 띄엄띄엄이다).
import { planetDraftEntryBytes } from "@terra/shared";
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
  RELAXED_LIMITS,
  startEditorTestApp,
} from "./testSupport.ts";
import type { JsonObject } from "./types.ts";

const CROSS_SITE = { origin: "https://evil.example", "sec-fetch-site": "cross-site" };

/** 결과(초안 뷰·저장 결과)의 판 번호 */
function revisionFrom(value: unknown): number {
  if (!isJsonObject(value) || typeof value.revision !== "number") throw new Error("no revision");
  return value.revision;
}

describe.skipIf(!TEST_DATABASE_URL)("행성 편집기 (DB) — 판 기록·되돌리기·지우기·감사 기록·출처", () => {
  let env: EditorTestApp;
  /** 첫 시험에서 저장한 판 → 그 판의 시드(저장한 차례대로) */
  const savedSeeds = new Map<number, number>();
  /** 첫 시험에서 판 기록에서 지워진 판(오래된 것부터) */
  let pruned: number[] = [];

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
  const draftIdOf = async (ownerId: string, planetId = EDITOR_PLANET_ID): Promise<string> => {
    const [row] = await rows<{ id: string }>(
      env.test.db,
      "select id from planet_drafts where owner_id = $1 and planet_id = $2",
      [ownerId, planetId],
    );
    if (!row) throw new Error("draft missing");
    return row.id;
  };
  const auditRows = (action: string) =>
    rows<{ actor_id: string; target_id: string; before: unknown; after: unknown }>(
      env.test.db,
      "select actor_id, target_id, before, after from audit_log where action = $1 order by id",
      [action],
    );

  beforeAll(async () => {
    // 이 시험은 짧은 동안 많이 부른다(속도 제한은 planetEditorGuards.db.test.ts가 본다)
    env = await startEditorTestApp({ limits: RELAXED_LIMITS });
  });

  afterAll(async () => {
    await env?.close();
  });

  it(`판 기록은 초안마다 최근 ${PLANET_DRAFT_REVISIONS_KEPT}개만 남는다(판 번호는 커지기만 한다)`, async () => {
    const total = PLANET_DRAFT_REVISIONS_KEPT + 5;
    const saved: number[] = [];
    let expected = 0;
    for (let index = 0; index < total; index++) {
      const res = await save(env.cookie.dev, entry({ seed: 1_000 + index }), expected);
      expect(res.statusCode, String(index)).toBe(200);
      expected = revisionFrom(resultOf(res));
      if (index > 0) expect(expected).toBeGreaterThan(saved.at(-1) ?? 0);
      saved.push(expected);
      savedSeeds.set(expected, 1_000 + index);
    }
    pruned = saved.slice(0, total - PLANET_DRAFT_REVISIONS_KEPT);
    const list = await revisionList(env.cookie.dev);
    expect(list).toEqual(saved.slice(-PLANET_DRAFT_REVISIONS_KEPT).toReversed());
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
    const oldest = (await revisionList(env.cookie.dev)).at(-1) ?? 0;
    const res = await editorMutation(
      env.app,
      "drafts.restore",
      { planetId: EDITOR_PLANET_ID, revision: oldest },
      env.cookie.dev,
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe(TRPC_CACHE_CONTROL);
    const restored = revisionFrom(resultOf(res));
    expect(restored).toBeGreaterThan(current);
    expect(resultOf(res)).toEqual({
      planetId: EDITOR_PLANET_ID,
      revision: restored,
      entry: entry({ seed: savedSeeds.get(oldest) }),
      base: null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(await draftOf(env.cookie.dev)).toEqual(resultOf(res));
    const list = await revisionList(env.cookie.dev);
    expect(list[0]).toBe(restored);
    expect(list).toHaveLength(PLANET_DRAFT_REVISIONS_KEPT);
    expect(list).not.toContain(oldest);
    expect(await auditRows("planet_draft.restore")).toEqual([
      {
        actor_id: env.userId.dev,
        target_id: await draftIdOf(env.userId.dev),
        before: { planetId: EDITOR_PLANET_ID, revision: current },
        after: { planetId: EDITOR_PLANET_ID, revision: restored, restoredFrom: oldest },
      },
    ]);

    // 지운 판은 없다
    const gone = await editorMutation(
      env.app,
      "drafts.restore",
      { planetId: EDITOR_PLANET_ID, revision: pruned[0] ?? 0 },
      env.cookie.dev,
    );
    expect(gone.statusCode).toBe(404);
    expect(errorOf(gone)).toMatchObject({ code: "NOT_FOUND", reason: "revision_not_found" });
    expect(await revisionOf(env.cookie.dev)).toBe(restored);
  });

  it("되돌릴 항목도 지금 팩으로 다시 본다(받지 않으면 BAD_REQUEST 코드, 바뀌지 않는다)", async () => {
    // 지워진 판 번호 자리에 지금 팩에 없는 바이옴을 쓰는 항목을 넣는다(팩이 바뀐 뒤의 옛 판처럼)
    const stale = entry({ biomes: ["ocean_deep", "lava_field"] });
    const slot = pruned[1] ?? 0;
    await env.test.db.$client.query(
      "insert into planet_draft_revisions (draft_id, revision, entry, base, bytes) values ($1, $2, $3, null, $4)",
      [await draftIdOf(env.userId.dev), slot, JSON.stringify(stale), planetDraftEntryBytes(stale)],
    );
    const before = await draftOf(env.cookie.dev);
    const res = await editorMutation(
      env.app,
      "drafts.restore",
      { planetId: EDITOR_PLANET_ID, revision: slot },
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

  it("지우기: 초안과 판 기록을 지우고 감사 기록, 다시 지우면 removed false(기록 없음), 다시 만들어도 옛 판 번호를 쓰지 않는다", async () => {
    const revision = await revisionOf(env.cookie.dev);
    const oldRevisions = await revisionList(env.cookie.dev);
    const draft = { id: await draftIdOf(env.userId.dev) };
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
    const recreated = revisionFrom(resultOf(await save(env.cookie.dev, entry(), 0)));
    expect(await auditRows("planet_draft.create")).toHaveLength(2);
    // 새 초안의 판 번호는 지운 초안의 어느 판과도 겹치지 않는다(모두 그보다 크다). 새 초안이 여러 번 저장돼도
    // 지우기 전 판을 든 기기의 저장은 충돌한다(ABA가 없다)
    expect(recreated).toBeGreaterThan(Math.max(revision, ...oldRevisions));
    let current = recreated;
    for (let index = 0; index < 3; index++) {
      current = revisionFrom(resultOf(await save(env.cookie.dev, entry({ seed: 2_000 + index }), current)));
    }
    for (const old of [revision, ...oldRevisions.slice(0, 3)]) {
      const stale = await save(env.cookie.dev, entry({ seed: 66 }), old);
      expect(stale.statusCode, String(old)).toBe(409);
    }
    expect(await revisionOf(env.cookie.dev)).toBe(current);
  });

  it("지우기는 팩에 없는 행성 ID도 받는다(팩에서 빠진 행성의 초안), 조회는 여전히 unknown_planet", async () => {
    const gone = "s2_gone_planet";
    const none = await editorMutation(env.app, "drafts.remove", { planetId: gone }, env.cookie.dev);
    expect(none.statusCode).toBe(200);
    expect(resultOf(none)).toEqual({ removed: false });
    // 팩이 바뀌기 전에 만든 초안처럼 직접 넣는다
    const stale = entry({ id: gone });
    const [inserted] = await rows<{ id: string }>(
      env.test.db,
      "insert into planet_drafts (owner_id, planet_id, revision, entry, base) values ($1, $2, nextval('planet_draft_revision_seq'), $3, null) returning id",
      [env.userId.dev, gone, JSON.stringify(stale)],
    );
    const get = await editorQuery(env.app, "drafts.get", { planetId: gone }, env.cookie.dev);
    expect(errorOf(get)).toMatchObject({ code: "BAD_REQUEST", reason: "unknown_planet" });
    const removed = await editorMutation(env.app, "drafts.remove", { planetId: gone }, env.cookie.dev);
    expect(resultOf(removed)).toEqual({ removed: true });
    expect(await rows(env.test.db, "select 1 from planet_drafts where id = $1", [inserted?.id])).toHaveLength(
      0,
    );
    expect((await auditRows("planet_draft.remove")).at(-1)).toMatchObject({
      actor_id: env.userId.dev,
      target_id: inserted?.id,
      before: { planetId: gone },
    });
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

      // 되돌리기·지우기(dev가 다시 만든 초안, 판 기록 4개)
      const before = await draftOf(env.cookie.dev);
      const restore = await editorMutation(
        env.app,
        "drafts.restore",
        { planetId: EDITOR_PLANET_ID, revision: (await revisionList(env.cookie.dev)).at(-1) ?? 0 },
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
      const kept = await revisionList(env.cookie.dev);
      expect(kept).toHaveLength(4);

      // 있는 초안 저장(자동 저장)은 감사 기록을 쓰지 않으므로 된다
      const autosaved = await save(env.cookie.dev, entry({ seed: 3 }), kept[0] ?? 0);
      expect(revisionFrom(resultOf(autosaved))).toBeGreaterThan(kept[0] ?? 0);
    } finally {
      await db.query("drop trigger test_reject_planet_audit on audit_log");
      await db.query("drop function test_reject_planet_audit()");
    }
    // 실패한 요청의 감사 기록은 남지 않았다(트랜잭션과 함께 되돌려짐): 앞 시험의 되돌리기 1·지우기 2(편집 행성·팩에 없는 행성)만
    expect(await auditRows("planet_draft.restore")).toHaveLength(1);
    expect(await auditRows("planet_draft.remove")).toHaveLength(2);
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
    // 조회도 다른 사이트에서 온 것은 막는다(감사 기록이 남는 조회가 있다). 같은 출처·주소창은 된다
    const read = await env.app.inject({
      method: "GET",
      url: "/api/trpc/settings.get",
      headers: { cookie: env.cookie.dev, ...CROSS_SITE },
    });
    expect(read.statusCode).toBe(403);
    expect(errorOf(read)).toMatchObject({ code: "FORBIDDEN", reason: "cross_origin" });
    for (const site of ["same-origin", "none"]) {
      const allowed = await env.app.inject({
        method: "GET",
        url: "/api/trpc/settings.get",
        headers: { cookie: env.cookie.dev, "sec-fetch-site": site },
      });
      expect(resultOf(allowed), site).toMatchObject({ theme: "dark" });
    }
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
