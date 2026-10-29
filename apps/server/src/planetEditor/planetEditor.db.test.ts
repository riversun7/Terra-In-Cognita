// 행성 편집기 tRPC DB 통합 시험(1) — 권한(두 겹), 정의 조회·감사 기록, 초안 저장·충돌·판 기록, 다른 사람 초안, 받지 않음 코드.
// TEST_DATABASE_URL이 있을 때만. 아이디·비밀번호는 시험용 가짜 값이다. 해시·시드 값은 적지 않는다(팩·생성기에서 읽는다).
import { PLANET_DRAFT_ENTRY_MAX_BYTES, planetDraftEntryBytes } from "@terra/shared";
import Fastify, { type FastifyRequest } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, rows } from "../testDb.ts";
import { TRPC_CACHE_CONTROL } from "../trpc/plugin.ts";
import {
  betterAuthPermissionCheck,
  createPlanetEditorServices,
  createPlanetEditorShared,
} from "./services.ts";
import {
  EDITOR_PLANET_ID,
  type EditorTestApp,
  TEST_PLANET_ID,
  editorMutation,
  editorQuery,
  errorOf,
  isJsonObject,
  rawPlanet,
  resultOf,
  RELAXED_LIMITS,
  startEditorTestApp,
} from "./testSupport.ts";
import type { JsonObject, PlanetDraftBase } from "./types.ts";

/** 결과(초안 뷰·저장 결과·판 목록 한 줄)의 판 번호 */
function revisionOf(value: unknown): number {
  if (!isJsonObject(value) || typeof value.revision !== "number") throw new Error("no revision");
  return value.revision;
}

describe.skipIf(!TEST_DATABASE_URL)("행성 편집기 (DB) — 권한·정의 조회·초안", () => {
  let env: EditorTestApp;
  let base: PlanetDraftBase;

  /** 편집 전용 행성 항목(팩 그대로 복사) + 바꿀 필드 */
  const entry = (patch: JsonObject = {}): JsonObject => ({
    ...rawPlanet(env.loaded, EDITOR_PLANET_ID),
    ...patch,
  });
  const save = (
    cookie: string,
    input: { entry?: unknown; expectedRevision: number; base?: unknown; planetId?: string },
  ) =>
    editorMutation(
      env.app,
      "drafts.save",
      {
        planetId: input.planetId ?? EDITOR_PLANET_ID,
        entry: "entry" in input ? input.entry : entry(),
        base: "base" in input ? input.base : base,
        expectedRevision: input.expectedRevision,
      },
      cookie,
    );
  const getDraft = async (cookie: string, planetId = EDITOR_PLANET_ID) =>
    resultOf(await editorQuery(env.app, "drafts.get", { planetId }, cookie));
  const auditCount = async (action: string) =>
    (
      await rows<{ n: number }>(env.test.db, "select count(*)::int as n from audit_log where action = $1", [
        action,
      ])
    )[0]?.n ?? 0;

  beforeAll(async () => {
    // 이 시험은 짧은 동안 많이 부른다(속도 제한은 planetEditorGuards.db.test.ts가 본다)
    env = await startEditorTestApp({ limits: RELAXED_LIMITS });
    const planet = env.build.definitions.planets.find((item) => item.id === EDITOR_PLANET_ID);
    if (!planet) throw new Error("editor planet missing");
    base = {
      contentVersion: env.build.definitions.contentVersion,
      definitionHash: planet.definitionHash,
      generatorVersion: env.build.definitions.generatorVersion,
    };
  });

  afterAll(async () => {
    await env?.close();
  });

  it("모든 프로시저: 로그인 안 하면 401, player·gm은 403(입력이 틀려도 먼저), 아무것도 쓰지 않는다", async () => {
    const calls: { kind: "query" | "mutation"; path: string; inputs: unknown[] }[] = [
      { kind: "query", path: "definitions", inputs: [undefined, { planetId: 1 }] },
      { kind: "query", path: "drafts.get", inputs: [{ planetId: EDITOR_PLANET_ID }, { planetId: "BAD" }] },
      { kind: "query", path: "drafts.revisions", inputs: [{ planetId: EDITOR_PLANET_ID }, {}] },
      {
        kind: "mutation",
        path: "drafts.save",
        inputs: [{ planetId: EDITOR_PLANET_ID, entry: entry(), base, expectedRevision: 0 }, {}],
      },
      {
        kind: "mutation",
        path: "drafts.restore",
        inputs: [{ planetId: EDITOR_PLANET_ID, revision: 1 }, { revision: 0 }],
      },
      {
        kind: "mutation",
        path: "drafts.remove",
        inputs: [{ planetId: EDITOR_PLANET_ID }, { planetId: null }],
      },
    ];
    const callers: [string | undefined, number, string][] = [
      [undefined, 401, "UNAUTHORIZED"],
      [env.cookie.player, 403, "FORBIDDEN"],
      [env.cookie.gm, 403, "FORBIDDEN"],
    ];
    for (const { kind, path, inputs } of calls) {
      for (const input of inputs) {
        for (const [cookie, status, code] of callers) {
          const res =
            kind === "query"
              ? await editorQuery(env.app, path, input, cookie)
              : await editorMutation(env.app, path, input, cookie);
          const label = `${path} ${JSON.stringify(input)} ${status}`;
          expect(res.statusCode, label).toBe(status);
          expect(errorOf(res)?.code, label).toBe(code);
          expect(res.headers["cache-control"], label).toBe(TRPC_CACHE_CONTROL);
        }
      }
    }
    expect(await rows(env.test.db, "select 1 from planet_drafts")).toHaveLength(0);
    expect(await rows(env.test.db, "select 1 from audit_log where action like 'planet%'")).toHaveLength(0);
  });

  it("dev·admin은 지난다(조회 200, 초안 없음 null)", async () => {
    for (const cookie of [env.cookie.dev, env.cookie.admin, env.cookie.dev2]) {
      const res = await editorQuery(env.app, "drafts.get", { planetId: EDITOR_PLANET_ID }, cookie);
      expect(res.statusCode).toBe(200);
      expect(resultOf(res)).toBeNull();
      expect(
        resultOf(await editorQuery(env.app, "drafts.revisions", { planetId: TEST_PLANET_ID }, cookie)),
      ).toEqual([]);
    }
  });

  it("두 번째 권한 확인은 요청한 사람의 세션으로 Better Auth에 묻는다(권한 표와 같은 답), 거절이면 FORBIDDEN", async () => {
    /** 진짜 Fastify 요청(세션 쿠키)으로 두 번째 확인을 부른다 */
    const answer = async (request: FastifyRequest) => {
      try {
        const check = betterAuthPermissionCheck(env.auth, request);
        return {
          read: await check({ planetEditor: ["read"] }),
          write: await check({ planetEditor: ["write"] }),
        };
      } catch (error) {
        return { error: isJsonObject(error) ? error.code : String(error) };
      }
    };
    const probe = Fastify({ logger: false });
    probe.get("/probe", (request) => answer(request));
    const ask = async (cookie?: string) =>
      (await probe.inject({ method: "GET", url: "/probe", headers: cookie ? { cookie } : {} })).json();
    expect(await ask(env.cookie.dev)).toEqual({ read: true, write: true });
    expect(await ask(env.cookie.dev2)).toEqual({ read: true, write: true });
    expect(await ask(env.cookie.admin)).toEqual({ read: true, write: true });
    expect(await ask(env.cookie.player)).toEqual({ read: false, write: false });
    expect(await ask(env.cookie.gm)).toEqual({ read: false, write: false });
    expect(await ask()).toEqual({ error: "UNAUTHORIZED" });
    await probe.close();

    // Better Auth가 거절하면(우리 권한 표는 허용해도) FORBIDDEN. 한 요청(서비스 하나) 안에서는 동작마다 한 번만 묻는다
    const asked: string[] = [];
    const services = createPlanetEditorServices({
      db: env.test.db,
      shared: createPlanetEditorShared(env.build.definitions, { now: Date.now }),
      ip: null,
      hasPermission: (permissions) => {
        asked.push(...permissions.planetEditor);
        return Promise.resolve(false);
      },
    });
    for (let index = 0; index < 3; index++) {
      await expect(services.ensurePermission("read")).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(services.ensurePermission("write")).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(asked).toEqual(["read", "write"]);
  });

  it("정의 조회: 서버가 켤 때 만든 자료 그대로, 부를 때마다 감사 기록(시드·항목 없음)", async () => {
    const before = await auditCount("planet_editor.read_definitions");
    const res = await editorQuery(env.app, "definitions", undefined, env.cookie.dev);
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe(TRPC_CACHE_CONTROL);
    expect(resultOf(res)).toEqual(JSON.parse(JSON.stringify(env.build.definitions)));
    await editorQuery(env.app, "definitions", undefined, env.cookie.admin);
    expect(await auditCount("planet_editor.read_definitions")).toBe(before + 2);
    const audits = await rows<{
      actor_kind: string;
      actor_id: string;
      target_id: null;
      after: unknown;
      meta: unknown;
    }>(
      env.test.db,
      "select actor_kind, actor_id, target_id, after, meta from audit_log where action = 'planet_editor.read_definitions' order by id",
    );
    expect(audits.at(-2)).toEqual({
      actor_kind: "user",
      actor_id: env.userId.dev,
      target_id: null,
      after: {
        contentVersion: env.build.definitions.contentVersion,
        generatorVersion: env.build.definitions.generatorVersion,
        planetIds: env.build.definitions.planets.map((planet) => planet.id),
      },
      meta: { roles: ["player", "dev"] },
    });
    expect(audits.at(-1)).toMatchObject({ actor_id: env.userId.admin, meta: { roles: ["player", "admin"] } });
    const text = JSON.stringify(audits);
    for (const planet of env.build.definitions.planets) expect(text).not.toContain(String(planet.entry.seed));
  });

  it("초안: 처음 저장(기대 판 0)이면 만든다(감사 기록), 이어 저장하면 판이 커지고 감사 기록은 없다", async () => {
    expect(await getDraft(env.cookie.dev)).toBeNull();
    const first = await save(env.cookie.dev, { expectedRevision: 0 });
    expect(first.statusCode).toBe(200);
    const saved = resultOf(first);
    expect(saved).toEqual({ revision: expect.any(Number), updatedAt: expect.any(String) });
    const r1 = revisionOf(saved);
    expect(r1).toBeGreaterThanOrEqual(1);
    const created = await rows<{ actor_id: string; target_id: string; after: unknown }>(
      env.test.db,
      "select actor_id, target_id, after from audit_log where action = 'planet_draft.create'",
    );
    const [draftRow] = await rows<{ id: string }>(
      env.test.db,
      "select id from planet_drafts where owner_id = $1",
      [env.userId.dev],
    );
    expect(created).toEqual([
      {
        actor_id: env.userId.dev,
        target_id: draftRow?.id,
        after: { planetId: EDITOR_PLANET_ID, revision: r1, base },
      },
    ]);
    expect(await getDraft(env.cookie.dev)).toEqual({
      planetId: EDITOR_PLANET_ID,
      revision: r1,
      entry: entry(),
      base,
      createdAt: expect.any(String),
      updatedAt: isJsonObject(saved) ? saved.updatedAt : "",
    });

    const changed = entry({
      seed: 7,
      overrides: { landPercent: 41 },
      name: { ko: "편집 😀", en: "Edit 😀" },
    });
    const r2 = revisionOf(resultOf(await save(env.cookie.dev, { entry: changed, expectedRevision: r1 })));
    const r3 = revisionOf(
      resultOf(await save(env.cookie.dev, { entry: changed, expectedRevision: r2, base: null })),
    );
    // 판 번호는 커지기만 한다(띄엄띄엄일 수 있다: 모든 초안이 함께 쓰는 번호)
    expect(r2).toBeGreaterThan(r1);
    expect(r3).toBeGreaterThan(r2);
    expect(await auditCount("planet_draft.create")).toBe(1);
    const draft = await getDraft(env.cookie.dev);
    expect(draft).toMatchObject({ revision: r3, entry: changed, base: null });

    const revisions = resultOf(
      await editorQuery(env.app, "drafts.revisions", { planetId: EDITOR_PLANET_ID }, env.cookie.dev),
    );
    expect(revisions).toEqual([
      { revision: r3, savedAt: expect.any(String), bytes: planetDraftEntryBytes(changed) },
      { revision: r2, savedAt: expect.any(String), bytes: planetDraftEntryBytes(changed) },
      { revision: r1, savedAt: expect.any(String), bytes: planetDraftEntryBytes(entry()) },
    ]);
    // 크기 열 = 저장한 항목의 크기
    const stored = await rows<{ bytes: number; entry: unknown }>(
      env.test.db,
      "select bytes, entry from planet_draft_revisions where draft_id = $1",
      [draftRow?.id],
    );
    for (const row of stored) expect(row.bytes).toBe(planetDraftEntryBytes(row.entry));
    // 판 기록의 시각 = 그 저장의 초안 시각
    expect(Array.isArray(revisions) && isJsonObject(revisions[0]) ? revisions[0].savedAt : null).toBe(
      isJsonObject(draft) ? draft.updatedAt : undefined,
    );
  });

  it("충돌: 기대 판이 지금 판과 다르면 CONFLICT(아무것도 바뀌지 않는다), 동시에 보낸 저장은 하나만 이긴다", async () => {
    const current = await getDraft(env.cookie.dev);
    if (!isJsonObject(current)) throw new Error("draft missing");
    const now = revisionOf(current);
    const listed = resultOf(
      await editorQuery(env.app, "drafts.revisions", { planetId: EDITOR_PLANET_ID }, env.cookie.dev),
    );
    const older = Array.isArray(listed) ? revisionOf(listed[1]) : 0;
    expect(older).toBeGreaterThan(0);
    for (const expectedRevision of [older, 0, now + 1_000]) {
      const res = await save(env.cookie.dev, { entry: entry({ seed: 99 }), expectedRevision });
      expect(res.statusCode, String(expectedRevision)).toBe(409);
      expect(errorOf(res)).toEqual({
        code: "CONFLICT",
        reason: "revision_conflict",
        message: "REVISION_CONFLICT",
      });
    }
    expect(await getDraft(env.cookie.dev)).toEqual(current);

    const results = await Promise.all(
      [11, 12, 13].map((seed) => save(env.cookie.dev, { entry: entry({ seed }), expectedRevision: now })),
    );
    expect(results.map((res) => res.statusCode).toSorted((a, b) => a - b)).toEqual([200, 409, 409]);
    const winner = results.find((res) => res.statusCode === 200);
    if (!winner) throw new Error("no winner");
    const won = revisionOf(resultOf(winner));
    expect(won).toBeGreaterThan(now);
    expect(await getDraft(env.cookie.dev)).toMatchObject({ revision: won });

    // 같은 초안을 동시에 만들면 하나만 만든다
    const creates = await Promise.all(
      [1, 2].map((seed) => save(env.cookie.dev2, { entry: entry({ seed }), expectedRevision: 0 })),
    );
    expect(creates.map((res) => res.statusCode).toSorted((a, b) => a - b)).toEqual([200, 409]);
    expect(
      await rows(env.test.db, "select 1 from planet_drafts where owner_id = $1", [env.userId.dev2]),
    ).toHaveLength(1);
  });

  it("다른 사람의 초안은 보이지 않고 손댈 수 없다", async () => {
    const mine = await getDraft(env.cookie.dev);
    expect(await getDraft(env.cookie.admin)).toBeNull();
    expect(
      resultOf(
        await editorQuery(env.app, "drafts.revisions", { planetId: EDITOR_PLANET_ID }, env.cookie.admin),
      ),
    ).toEqual([]);
    const restore = await editorMutation(
      env.app,
      "drafts.restore",
      { planetId: EDITOR_PLANET_ID, revision: 1 },
      env.cookie.admin,
    );
    expect(restore.statusCode).toBe(404);
    expect(errorOf(restore)).toMatchObject({ code: "NOT_FOUND", reason: "draft_not_found" });
    expect(
      resultOf(
        await editorMutation(env.app, "drafts.remove", { planetId: EDITOR_PLANET_ID }, env.cookie.admin),
      ),
    ).toEqual({
      removed: false,
    });
    // 기대 판이 다른 사람 초안의 판과 같아도 내 초안(없음)에 대한 것이다
    const stale = await save(env.cookie.admin, {
      entry: entry({ seed: 5 }),
      expectedRevision: revisionOf(mine),
    });
    expect(stale.statusCode).toBe(409);
    const own = revisionOf(
      resultOf(await save(env.cookie.admin, { entry: entry({ seed: 5 }), expectedRevision: 0 })),
    );
    // 판 번호는 모든 초안이 함께 쓴다: 다른 사람 초안의 판과 겹치지 않는다
    expect(own).toBeGreaterThan(revisionOf(mine));
    expect(await getDraft(env.cookie.admin)).toMatchObject({ revision: own, entry: entry({ seed: 5 }) });
    expect(await getDraft(env.cookie.dev)).toEqual(mine);
    expect(await auditCount("planet_draft.remove")).toBe(0);
  });

  it("받지 않음: BAD_REQUEST + data.reason(코드), 차례대로, 저장하지 않는다", async () => {
    const before = await getDraft(env.cookie.dev);
    const revision = isJsonObject(before) && typeof before.revision === "number" ? before.revision : 0;
    const huge = entry({ description: { ko: "a".repeat(PLANET_DRAFT_ENTRY_MAX_BYTES), en: "x" } });
    const cases: [string, { entry: unknown; planetId?: string }, string][] = [
      ["크기", { entry: huge }, "entry_too_large"],
      [
        "크기가 먼저(모르는 필드·바이옴도 있음)",
        { entry: { ...huge, extra: 1, biomes: ["lava_field"] } },
        "entry_too_large",
      ],
      ["모양(모르는 필드)", { entry: entry({ extra: 1 }) }, "invalid_entry"],
      ["모양(객체 아님)", { entry: [1, 2] }, "invalid_entry"],
      ["모양(요청한 행성과 다른 ID)", { entry: rawPlanet(env.loaded, TEST_PLANET_ID) }, "invalid_entry"],
      ["모양(NUL 글자)", { entry: entry({ name: { ko: "a\u0000", en: "b" } }) }, "invalid_entry"],
      ["바이옴", { entry: entry({ biomes: ["ocean_deep", "lava_field"] }) }, "unknown_biome"],
      [
        "행성(팩에 없음)",
        {
          entry: entry({ id: "s2_other_planet", biomes: ["ocean_deep", "tundra"] }),
          planetId: "s2_other_planet",
        },
        "unknown_planet",
      ],
      [
        "생성기(호수 규칙 없음)",
        { entry: entry({ biomes: ["ocean_deep", "tundra"] }) },
        "generator_rejected",
      ],
    ];
    for (const [name, input, reason] of cases) {
      const res = await save(env.cookie.dev, { ...input, expectedRevision: revision });
      expect(res.statusCode, name).toBe(400);
      expect(errorOf(res), name).toEqual({ code: "BAD_REQUEST", reason, message: "PLANET_DRAFT_REJECTED" });
    }
    expect(await getDraft(env.cookie.dev)).toEqual(before);

    // 입력 형식(기대 판·기준 모양)은 코드 없이 BAD_REQUEST
    for (const input of [
      { expectedRevision: -1 },
      { expectedRevision: 1.5 },
      { expectedRevision: revision, base: { ...base, definitionHash: "abc" } },
      { expectedRevision: revision, base: { ...base, contentVersion: "core" } },
      { expectedRevision: revision, base: { ...base, extra: 1 } },
      { expectedRevision: revision, planetId: "S2" },
    ]) {
      const res = await save(env.cookie.dev, input);
      expect(res.statusCode, JSON.stringify(input)).toBe(400);
      expect(errorOf(res)?.reason, JSON.stringify(input)).toBeUndefined();
    }
    const missingBase = await editorMutation(
      env.app,
      "drafts.save",
      { planetId: EDITOR_PLANET_ID, entry: entry(), expectedRevision: revision },
      env.cookie.dev,
    );
    expect(missingBase.statusCode).toBe(400);
  });

  it("조회·판 목록·되돌리기: 팩에 없는 행성은 BAD_REQUEST(data.reason unknown_planet), 형식이 틀리면 코드 없이", async () => {
    for (const [kind, path, input] of [
      ["query", "drafts.get", { planetId: "s2_other_planet" }],
      ["query", "drafts.revisions", { planetId: "s2_other_planet" }],
      ["mutation", "drafts.restore", { planetId: "s2_other_planet", revision: 1 }],
    ] as const) {
      const res =
        kind === "query"
          ? await editorQuery(env.app, path, input, env.cookie.dev)
          : await editorMutation(env.app, path, input, env.cookie.dev);
      expect(res.statusCode, path).toBe(400);
      expect(errorOf(res), path).toEqual({
        code: "BAD_REQUEST",
        reason: "unknown_planet",
        message: "PLANET_DRAFT_REJECTED",
      });
      const bad =
        kind === "query"
          ? await editorQuery(env.app, path, { ...input, planetId: "Bad Id" }, env.cookie.dev)
          : await editorMutation(env.app, path, { ...input, planetId: "Bad Id" }, env.cookie.dev);
      expect(bad.statusCode, path).toBe(400);
      expect(errorOf(bad)?.reason, path).toBeUndefined();
    }
  });
});
