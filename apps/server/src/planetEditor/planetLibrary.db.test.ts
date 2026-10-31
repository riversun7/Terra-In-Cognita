// 행성 보관함 tRPC DB 통합 시험 — ADR 38 "바뀜: 행성 보관함"(팀 공용 목록).
// 만들기·목록(만든 사람)·[저장]마다 판 하나·충돌·판 목록과 판 하나, 이름 바꾸기·이름 규칙, 정의 검사(초안과 같은 코드),
// 지우기(만든 사람·admin만, 표시만), player 권한 없음, 감사 기록. TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, rows } from "../testDb.ts";
import { PLANET_LIBRARY_AUDIT_ACTIONS } from "./library.ts";
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

const BASE = { kind: "pack", id: EDITOR_PLANET_ID } as const;

function field(value: unknown, key: string): unknown {
  return isJsonObject(value) ? value[key] : undefined;
}

function list(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error("list expected");
  const items: readonly unknown[] = value;
  return items;
}

describe.skipIf(!TEST_DATABASE_URL)("행성 보관함 (DB)", () => {
  let env: EditorTestApp;
  const definition = (patch: JsonObject = {}): JsonObject => ({
    ...rawPlanet(env.loaded, EDITOR_PLANET_ID),
    ...patch,
  });
  const create = (cookie: string, name: unknown, value: unknown = definition()) =>
    editorMutation(env.app, "library.create", { name, base: BASE, definition: value }, cookie);
  const createdId = async (cookie: string, name: string, value: unknown = definition()): Promise<string> => {
    const res = await create(cookie, name, value);
    expect(res.statusCode, res.body).toBe(200);
    const id = field(resultOf(res), "id");
    if (typeof id !== "string") throw new Error("no id");
    return id;
  };

  beforeAll(async () => {
    env = await startEditorTestApp({ limits: RELAXED_LIMITS });
  });

  afterAll(async () => {
    await env?.close();
  });

  it("만들면 판 1, 목록은 팀 공용(다른 dev에게도 보이고 만든 사람이 보인다)", async () => {
    const res = await create(env.cookie.dev, "  지구형 행성 1 ");
    expect(res.statusCode).toBe(200);
    const planet = resultOf(res);
    expect(planet).toMatchObject({
      name: "지구형 행성 1",
      base: BASE,
      revision: 1,
      author: { id: env.userId.dev },
    });
    expect(field(planet, "definition")).toEqual(definition());
    const listed = resultOf(await editorQuery(env.app, "library.list", undefined, env.cookie.dev2));
    const row = list(listed).find((item) => field(item, "id") === field(planet, "id"));
    expect(row).toMatchObject({ name: "지구형 행성 1", revision: 1, author: { id: env.userId.dev } });
    expect(field(row, "definition")).toBeUndefined();
  });

  it("행성 표본(planet_templates)에서 시작한 행성: 시작점 종류 template, 정의는 표본 항목 그대로 저장된다", async () => {
    const mars = env.loaded.raw.planetTemplates.find((entry) => field(entry, "id") === "solar_mars");
    if (!isJsonObject(mars)) throw new Error("content/core has no solar_mars template");
    const res = await editorMutation(
      env.app,
      "library.create",
      { name: "화성 1", base: { kind: "template", id: "solar_mars" }, definition: mars },
      env.cookie.dev,
    );
    const created = resultOf(res);
    expect(created).toMatchObject({
      name: "화성 1",
      revision: 1,
      base: { kind: "template", id: "solar_mars" },
      definition: mars,
    });
    const id = field(created, "id");
    const listed = list(resultOf(await editorQuery(env.app, "library.list", {}, env.cookie.dev2)));
    expect(listed.find((item) => field(item, "id") === id)).toMatchObject({
      base: { kind: "template", id: "solar_mars" },
    });
  });

  it("[저장]마다 판이 하나 늘고, 기대 판이 다르면 CONFLICT(바뀌지 않음). 판 목록·판 하나", async () => {
    const id = await createdId(env.cookie.dev, "지구형 행성 2");
    const save = (cookie: string, seed: number, expectedRevision: number) =>
      editorMutation(
        env.app,
        "library.save",
        { id, definition: definition({ seed }), expectedRevision },
        cookie,
      );
    const first = await save(env.cookie.dev, 11, 1);
    expect(first.statusCode).toBe(200);
    expect(resultOf(first)).toMatchObject({ revision: 2, updatedBy: { id: env.userId.dev } });
    // 다른 dev가 판 2를 보고 저장 → 판 3. 판 2를 든 첫 기기의 저장은 충돌
    expect((await save(env.cookie.dev2, 22, 2)).statusCode).toBe(200);
    const stale = await save(env.cookie.dev, 33, 2);
    expect(stale.statusCode).toBe(409);
    expect(errorOf(stale)).toMatchObject({ code: "CONFLICT", reason: "revision_conflict" });
    const current = resultOf(await editorQuery(env.app, "library.get", { id }, env.cookie.dev));
    expect(current).toMatchObject({ revision: 3, updatedBy: { id: env.userId.dev2 } });
    expect(field(field(current, "definition"), "seed")).toBe(22);
    const versions = resultOf(await editorQuery(env.app, "library.versions", { id }, env.cookie.dev));
    expect(list(versions).map((item) => field(item, "revision"))).toEqual([3, 2, 1]);
    expect(list(versions)[0]).toMatchObject({ savedBy: { id: env.userId.dev2 } });
    const version2 = resultOf(
      await editorQuery(env.app, "library.version", { id, revision: 2 }, env.cookie.dev),
    );
    expect(field(field(version2, "definition"), "seed")).toBe(11);
    const missing = await editorQuery(env.app, "library.version", { id, revision: 9 }, env.cookie.dev);
    expect(errorOf(missing)).toMatchObject({ code: "NOT_FOUND", reason: "version_not_found" });
  });

  it("이름 규칙·정의 검사·시작점은 이유 코드로 받지 않는다(초안과 같은 정의 코드)", async () => {
    const reasonOf = async (res: ReturnType<typeof create>) => errorOf(await res)?.reason;
    expect(await reasonOf(create(env.cookie.dev, "   "))).toBe("invalid_name");
    expect(await reasonOf(create(env.cookie.dev, "가".repeat(61)))).toBe("invalid_name");
    expect(await reasonOf(create(env.cookie.dev, "a\u0000b"))).toBe("invalid_name");
    expect(await reasonOf(create(env.cookie.dev, "ok", definition({ seed: -1 })))).toBe("invalid_entry");
    expect(await reasonOf(create(env.cookie.dev, "ok", definition({ biomes: ["no_such_biome"] })))).toBe(
      "unknown_biome",
    );
    const unknownBase = await editorMutation(
      env.app,
      "library.create",
      { name: "ok", base: { kind: "pack", id: "no_such_planet" }, definition: definition() },
      env.cookie.dev,
    );
    expect(errorOf(unknownBase)).toMatchObject({ code: "BAD_REQUEST", reason: "unknown_base" });
    // 표본 ID를 팩 행성 종류로(또는 그 반대로) 적으면 그 분류에 없어 받지 않는다
    for (const base of [
      { kind: "pack", id: "solar_mars" },
      { kind: "template", id: EDITOR_PLANET_ID },
    ]) {
      const wrongKind = await editorMutation(
        env.app,
        "library.create",
        { name: "ok", base, definition: definition() },
        env.cookie.dev,
      );
      expect(errorOf(wrongKind)).toMatchObject({ code: "BAD_REQUEST", reason: "unknown_base" });
    }
    // 이름 바꾸기도 같은 규칙. 판은 그대로
    const id = await createdId(env.cookie.dev, "바꿀 이름");
    expect(
      errorOf(await editorMutation(env.app, "library.rename", { id, name: "" }, env.cookie.dev)),
    ).toMatchObject({
      reason: "invalid_name",
    });
    const renamed = await editorMutation(env.app, "library.rename", { id, name: "새 이름" }, env.cookie.dev2);
    expect(resultOf(renamed)).toEqual({ name: "새 이름" });
    expect(resultOf(await editorQuery(env.app, "library.get", { id }, env.cookie.dev))).toMatchObject({
      name: "새 이름",
      revision: 1,
    });
  });

  it("지우기는 만든 사람·admin만, 표시만 한다(목록·열기·저장에서 빠지고 줄과 판은 남는다). 감사 기록", async () => {
    const id = await createdId(env.cookie.dev, "지울 행성");
    const other = await editorMutation(env.app, "library.remove", { id }, env.cookie.dev2);
    expect(errorOf(other)).toMatchObject({ code: "FORBIDDEN", reason: "not_author" });
    expect((await editorMutation(env.app, "library.remove", { id }, env.cookie.dev)).statusCode).toBe(200);
    expect(errorOf(await editorQuery(env.app, "library.get", { id }, env.cookie.dev))).toMatchObject({
      code: "NOT_FOUND",
      reason: "planet_not_found",
    });
    const save = await editorMutation(
      env.app,
      "library.save",
      { id, definition: definition(), expectedRevision: 1 },
      env.cookie.dev,
    );
    expect(errorOf(save)).toMatchObject({ reason: "planet_not_found" });
    const listed = resultOf(await editorQuery(env.app, "library.list", undefined, env.cookie.dev));
    expect(list(listed).some((item) => field(item, "id") === id)).toBe(false);
    const [kept] = await rows<{ deleted_by: string; versions: string }>(
      env.test.db,
      "select deleted_by, (select count(*) from planet_library_versions where planet_id = $1) as versions from planet_library where id = $1",
      [id],
    );
    expect(kept).toMatchObject({ deleted_by: env.userId.dev, versions: "1" });
    // admin은 남의 행성도 지운다
    const byAdmin = await createdId(env.cookie.dev2, "admin이 지울 행성");
    expect(
      (await editorMutation(env.app, "library.remove", { id: byAdmin }, env.cookie.admin)).statusCode,
    ).toBe(200);
    const audit = await rows<{ action: string; target_id: string }>(
      env.test.db,
      "select action, target_id from audit_log where action like 'planet_library.%' and target_id = $1 order by id",
      [id],
    );
    expect(audit.map((row) => row.action)).toEqual([
      PLANET_LIBRARY_AUDIT_ACTIONS.create,
      PLANET_LIBRARY_AUDIT_ACTIONS.remove,
    ]);
  });

  it("player는 목록도 볼 수 없다(FORBIDDEN)", async () => {
    const res = await editorQuery(env.app, "library.list", undefined, env.cookie.player);
    expect(errorOf(res)).toMatchObject({ code: "FORBIDDEN" });
  });
});
