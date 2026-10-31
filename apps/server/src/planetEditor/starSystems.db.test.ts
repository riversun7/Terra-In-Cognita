// 항성계 보관함 tRPC DB 통합 시험 — ADR 2026-10-31-star-system-editor.
// 만들기·목록(팀 공용, 만든 사람)·[저장] 판·충돌, 이름 규칙·정의 검사(이유 코드), 지우기(만든 사람·admin만, 표시만)·감사 기록,
// player 권한 없음. TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, rows } from "../testDb.ts";
import { STAR_SYSTEM_AUDIT_ACTIONS } from "./starSystems.ts";
import {
  type EditorTestApp,
  editorMutation,
  editorQuery,
  errorOf,
  isJsonObject,
  resultOf,
  RELAXED_LIMITS,
  startEditorTestApp,
} from "./testSupport.ts";

const PLANET_ID = "0b6f1c9e-3a52-4d8e-9f10-2c3d4e5f6a7b";

function field(value: unknown, key: string): unknown {
  return isJsonObject(value) ? value[key] : undefined;
}

function list(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error("list expected");
  const items: readonly unknown[] = value;
  return items;
}

const definition = (type = "g2v", distance = 1000) => ({
  v: 1,
  star: { type },
  orbits: [
    { distanceMilliAu: 400, body: { kind: "asteroid_belt" } },
    { distanceMilliAu: distance, body: { kind: "planet", planetId: PLANET_ID } },
    { distanceMilliAu: 5200, body: { kind: "structure" } },
  ],
});

describe.skipIf(!TEST_DATABASE_URL)("항성계 보관함 (DB)", () => {
  let env: EditorTestApp;
  const create = (cookie: string, name: unknown, value: unknown = definition()) =>
    editorMutation(env.app, "systems.create", { name, definition: value }, cookie);
  const createdId = async (cookie: string, name: string): Promise<string> => {
    const res = await create(cookie, name);
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

  it("만들면 판 1, 목록은 팀 공용(만든 사람이 보이고 정의는 싣지 않는다)", async () => {
    const res = await create(env.cookie.dev, "  태양계 닮은꼴 ");
    expect(res.statusCode, res.body).toBe(200);
    const system = resultOf(res);
    expect(system).toMatchObject({ name: "태양계 닮은꼴", revision: 1, author: { id: env.userId.dev } });
    expect(field(system, "definition")).toEqual(definition());
    const listed = resultOf(await editorQuery(env.app, "systems.list", undefined, env.cookie.dev2));
    const row = list(listed).find((item) => field(item, "id") === field(system, "id"));
    expect(row).toMatchObject({ name: "태양계 닮은꼴", revision: 1, author: { id: env.userId.dev } });
    expect(field(row, "definition")).toBeUndefined();
  });

  it("[저장]마다 판 +1, 기대 판이 다르면 CONFLICT(바뀌지 않음)", async () => {
    const id = await createdId(env.cookie.dev, "충돌 시험");
    const save = (cookie: string, distance: number, expectedRevision: number) =>
      editorMutation(
        env.app,
        "systems.save",
        { id, definition: definition("k0v", distance), expectedRevision },
        cookie,
      );
    const first = await save(env.cookie.dev, 900, 1);
    expect(resultOf(first)).toMatchObject({ revision: 2, updatedBy: { id: env.userId.dev } });
    expect((await save(env.cookie.dev2, 800, 2)).statusCode).toBe(200);
    const stale = await save(env.cookie.dev, 700, 2);
    expect(stale.statusCode).toBe(409);
    expect(errorOf(stale)).toMatchObject({ code: "CONFLICT", reason: "revision_conflict" });
    const current = resultOf(await editorQuery(env.app, "systems.get", { id }, env.cookie.dev));
    expect(current).toMatchObject({ revision: 3, updatedBy: { id: env.userId.dev2 } });
    expect(field(current, "definition")).toEqual(definition("k0v", 800));
  });

  it("이름 규칙·정의 검사는 이유 코드로 받지 않는다. 이름 바꾸기는 판 그대로", async () => {
    const reasonOf = async (res: ReturnType<typeof create>) => errorOf(await res)?.reason;
    expect(await reasonOf(create(env.cookie.dev, "   "))).toBe("invalid_name");
    expect(await reasonOf(create(env.cookie.dev, "가".repeat(61)))).toBe("invalid_name");
    expect(await reasonOf(create(env.cookie.dev, "ok", { ...definition(), v: 2 }))).toBe(
      "invalid_definition",
    );
    expect(await reasonOf(create(env.cookie.dev, "ok", definition("o5v")))).toBe("invalid_definition");
    expect(await reasonOf(create(env.cookie.dev, "ok", definition("g2v", 300)))).toBe("invalid_definition");
    const id = await createdId(env.cookie.dev, "바꿀 이름");
    const bad = await editorMutation(env.app, "systems.rename", { id, name: "" }, env.cookie.dev);
    expect(errorOf(bad)).toMatchObject({ reason: "invalid_name" });
    const renamed = await editorMutation(env.app, "systems.rename", { id, name: "새 이름" }, env.cookie.dev2);
    expect(resultOf(renamed)).toEqual({ name: "새 이름" });
    expect(resultOf(await editorQuery(env.app, "systems.get", { id }, env.cookie.dev))).toMatchObject({
      name: "새 이름",
      revision: 1,
    });
  });

  it("지우기는 만든 사람·admin만, 표시만 한다(목록·열기·저장에서 빠지고 줄은 남는다). 감사 기록", async () => {
    const id = await createdId(env.cookie.dev, "지울 항성계");
    const other = await editorMutation(env.app, "systems.remove", { id }, env.cookie.dev2);
    expect(errorOf(other)).toMatchObject({ code: "FORBIDDEN", reason: "not_author" });
    expect((await editorMutation(env.app, "systems.remove", { id }, env.cookie.dev)).statusCode).toBe(200);
    expect(errorOf(await editorQuery(env.app, "systems.get", { id }, env.cookie.dev))).toMatchObject({
      code: "NOT_FOUND",
      reason: "system_not_found",
    });
    const save = await editorMutation(
      env.app,
      "systems.save",
      { id, definition: definition(), expectedRevision: 1 },
      env.cookie.dev,
    );
    expect(errorOf(save)).toMatchObject({ reason: "system_not_found" });
    const listed = resultOf(await editorQuery(env.app, "systems.list", undefined, env.cookie.dev));
    expect(list(listed).some((item) => field(item, "id") === id)).toBe(false);
    const [kept] = await rows<{ deleted_by: string }>(
      env.test.db,
      "select deleted_by from star_systems where id = $1",
      [id],
    );
    expect(kept).toMatchObject({ deleted_by: env.userId.dev });
    const byAdmin = await createdId(env.cookie.dev2, "admin이 지울 항성계");
    expect(
      (await editorMutation(env.app, "systems.remove", { id: byAdmin }, env.cookie.admin)).statusCode,
    ).toBe(200);
    const audit = await rows<{ action: string }>(
      env.test.db,
      "select action from audit_log where action like 'star_system.%' and target_id = $1 order by id",
      [id],
    );
    expect(audit.map((row) => row.action)).toEqual([
      STAR_SYSTEM_AUDIT_ACTIONS.create,
      STAR_SYSTEM_AUDIT_ACTIONS.remove,
    ]);
  });

  it("player는 목록도 볼 수 없다(FORBIDDEN)", async () => {
    const res = await editorQuery(env.app, "systems.list", undefined, env.cookie.player);
    expect(errorOf(res)).toMatchObject({ code: "FORBIDDEN" });
  });
});
