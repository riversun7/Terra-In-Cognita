// 스킬 편집기 tRPC DB 통합 시험 — docs/adr/2026-11-01-skill-editor.md 3·4·6·7절과 "꼬임 점검".
// 권한(player 403), 묶음 적용(스킬 고치기·만들기·무기 소모)·판 충돌·팩 검사 거절(data.details), 유닛 화면 전투 자료에 바로 듦,
// 되돌리기, 감사 기록·최근 바꿈·내보내기 차이(entries), /health, 다시 켤 때 싣기(가장 나중에 바꾼 것이 이김).
// TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
import { tuningDiffSchema } from "@terra/content";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.ts";
import { createAuth } from "../auth/auth.ts";
import { executeCommand, parseCliArgs } from "../cli/commands.ts";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { loadServerContent } from "../content.ts";
import { type RosterCatalog, rosterCatalogOf } from "../roster/catalog.ts";
import {
  TEST_DATABASE_URL,
  TEST_SETTINGS,
  type TestDatabase,
  createTestDatabase,
  enter,
  rows,
  sessionCookie,
  trpcMutation,
  trpcQuery,
} from "../testDb.ts";
import { createTuningState } from "../tuning/state.ts";
import { effectsOf, tuningEntriesOf } from "../world/combatCatalog.ts";
import { type ContentEditState, createContentEditState } from "./state.ts";
import { CONTENT_AUDIT_ACTIONS } from "./store.ts";

const PASSWORD = "fake pass phrase 7";
const RELAXED = {
  readsPerUser: { capacity: 100_000, refillPerMinute: 100_000 },
  writesPerUser: { capacity: 100_000, refillPerMinute: 100_000 },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const obj = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});
const arr = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);
const resultOf = (res: LightMyRequestResponse): unknown => obj(obj(res.json()).result).data;
function errorOf(res: LightMyRequestResponse) {
  const data = obj(obj(obj(res.json()).error).data);
  return { code: data.code, reason: data.reason, details: data.details };
}

const skillOf = (body: Record<string, unknown>, id: string) =>
  obj(arr(body.skills).find((skill) => obj(obj(skill).entry).id === id));

describe.skipIf(!TEST_DATABASE_URL)("스킬 편집기 (DB)", () => {
  let test: TestDatabase;
  let app: FastifyInstance;
  let content: ContentEditState;
  let roster: RosterCatalog;
  const cookie: { player?: string; dev?: string } = {};
  const loaded = loadServerContent(DEFAULT_CONTENT_DIR);
  if (!loaded.ok) throw new Error(loaded.lines.join("\n"));

  const start = async () => {
    const tuning = createTuningState(tuningEntriesOf(loaded.source));
    content = createContentEditState(loaded.source, effectsOf(loaded.source));
    roster = rosterCatalogOf(loaded.source, undefined, undefined, () => content.effective());
    const built = await buildApp({
      contentVersion: loaded.content.version,
      contentHash: loaded.content.hash,
      logger: false,
      metricsIntervalMs: 0,
      db: test.db,
      auth: { settings: TEST_SETTINGS, openSignup: true },
      roster,
      tuning: { state: tuning, packId: "core", limits: RELAXED },
      contentEdit: { state: content },
    });
    await built.ready();
    return built;
  };
  const list = async () => obj(resultOf(await trpcQuery(app, "skills.list", undefined, cookie.dev)));
  const save = async (changes: readonly unknown[], extra: Record<string, unknown> = {}) =>
    trpcMutation(
      app,
      "skills.save",
      { expectedRevision: (await list()).revision, changes, ...extra },
      cookie.dev,
    );

  beforeAll(async () => {
    test = await createTestDatabase();
    app = await start();
    const auth = createAuth({ db: test.db, settings: TEST_SETTINGS });
    cookie.player = sessionCookie(
      await enter(app, {
        id: "Fake_SkillPlayer",
        password: PASSWORD,
        create: true,
        passwordConfirm: PASSWORD,
      }),
    );
    await executeCommand(
      parseCliArgs(["create-user", "--id", "Fake_SkillDev", "--roles", "player,dev"]),
      { TIC_ACTOR: "test:skills", TIC_PASSWORD: PASSWORD },
      { db: test.db, auth },
      { out: () => {}, err: () => {} },
    );
    cookie.dev = sessionCookie(await enter(app, { id: "Fake_SkillDev", password: PASSWORD }));
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await test?.drop();
  });

  it("플레이어는 볼 수 없고, dev는 스킬·효과 사전·행동별 소모 표를 본다", async () => {
    expect(errorOf(await trpcQuery(app, "skills.list", undefined, cookie.player)).code).toBe("FORBIDDEN");
    const body = await list();
    expect(body.revision).toBe(0);
    expect(obj(skillOf(body, "power_strike")).origin).toBe("pack");
    expect(arr(body.effects).some((effect) => obj(effect).id === "burn")).toBe(true);
    const keys = arr(body.actions).map((row) => obj(row).key);
    expect(keys).toEqual(
      expect.arrayContaining(["walk", "evasive_move", "items/test_sword", "skills/fire_bolt"]),
    );
  });

  it("스킬 고치기·만들기·무기 소모를 한 묶음으로 받고, 유닛 화면 전투 자료에 바로 든다", async () => {
    const strike = obj(skillOf(await list(), "power_strike")).entry;
    const kick = { ...obj(strike), id: "editor_kick", name: { ko: "발차기", en: "Kick" }, bareHand: true };
    const res = await save(
      [
        { op: "put_skill", entry: { ...obj(strike), cost: 7 } },
        { op: "put_skill", entry: kick },
        { op: "set_cost", category: "items", id: "test_sword", staminaCost: 3, mpCost: 0 },
        { op: "set_cost", category: "unit_kinds", id: "human", staminaCost: 2, mpCost: 0 },
      ],
      { note: "시험" },
    );
    expect(res.statusCode).toBe(200);
    const body = obj(resultOf(res));
    expect(body.revision).toBe(1);
    expect(obj(skillOf(body, "power_strike")).origin).toBe("edited");
    expect(obj(skillOf(body, "editor_kick")).origin).toBe("created");
    expect(roster.combat.skills.find((skill) => skill.id === "power_strike")?.cost).toBe(7);
    expect(roster.combat.skills.find((skill) => skill.id === "editor_kick")?.bareHand).toBe(true);
    expect(roster.combat.equipment.find((item) => item.id === "test_sword")?.weapon?.staminaCost).toBe(3);
    expect(roster.combat.unitKinds.find((kind) => kind.id === "human")?.naturalWeapon.staminaCost).toBe(2);
    expect(roster.names.skills.editor_kick).toEqual({ ko: "발차기", en: "Kick" });
    const health = obj((await app.inject({ method: "GET", url: "/health" })).json());
    expect([health.contentOverrides, health.contentRevision]).toEqual([4, 1]);
    const audit = await rows<{ actor_kind: string }>(
      test.db,
      "select actor_kind from audit_log where action = $1",
      [CONTENT_AUDIT_ACTIONS.apply],
    );
    expect(audit.map((row) => row.actor_kind)).toEqual(["admin"]);
    const history = obj(resultOf(await trpcQuery(app, "skills.history", undefined, cookie.dev)));
    expect(obj(arr(history.rows)[0]).note).toBe("시험");
  });

  it("팩 검사에 걸리면 묶음 전체를 받지 않고(data.details), 판이 다르면 충돌이다", async () => {
    const strike = obj(skillOf(await list(), "power_strike")).entry;
    const bad = await save([
      { op: "put_skill", entry: { ...obj(strike), cost: 8 } },
      { op: "put_skill", entry: { ...obj(strike), id: "editor_bad", radius: 3 } },
    ]);
    expect(errorOf(bad)).toMatchObject({ code: "BAD_REQUEST", reason: "invalid_entry" });
    expect(arr(errorOf(bad).details).length).toBeGreaterThan(0);
    expect(roster.combat.skills.find((skill) => skill.id === "power_strike")?.cost).toBe(7);
    const stale = await trpcMutation(
      app,
      "skills.save",
      { expectedRevision: 0, changes: [{ op: "revert", category: "skills", id: "power_strike" }] },
      cookie.dev,
    );
    expect(errorOf(stale)).toMatchObject({ code: "CONFLICT", reason: "revision_conflict" });
  });

  it("내보내기 차이에 팩 항목(entries)이 들고, 되돌리면 팩 값·만든 스킬은 사라진다", async () => {
    const exported = obj(resultOf(await trpcQuery(app, "tuning.export", undefined, cookie.dev)));
    const diff = tuningDiffSchema.parse(exported.diff);
    expect(diff.entries?.map((change) => `${change.category}/${change.id}`).toSorted()).toEqual([
      "items/test_sword",
      "skills/editor_kick",
      "skills/power_strike",
      "unit_kinds/human",
    ]);
    expect(diff.entries?.find((change) => change.id === "editor_kick")?.from).toBeNull();
    const res = await save([
      { op: "revert", category: "skills", id: "editor_kick" },
      { op: "revert", category: "unit_kinds", id: "human" },
    ]);
    expect(res.statusCode).toBe(200);
    expect(roster.combat.skills.some((skill) => skill.id === "editor_kick")).toBe(false);
    expect(roster.combat.unitKinds.find((kind) => kind.id === "human")?.naturalWeapon.staminaCost).toBe(10);
  });

  it("다시 켜면 DB에서 싣고, 저장 뒤 팩 항목이 바뀐 줄은 팩이 이긴다(감사 기록 system)", async () => {
    await test.db.$client.query(
      "update content_overrides set pack_hash = $1 where category = 'items' and id = 'test_sword'",
      ["f".repeat(64)],
    );
    await app.close();
    app = await start();
    expect(content.revision()).toBe(3);
    expect(roster.combat.skills.find((skill) => skill.id === "power_strike")?.cost).toBe(7);
    expect(roster.combat.equipment.find((item) => item.id === "test_sword")?.weapon?.staminaCost).toBe(10);
    const won = await rows<{ actor_kind: string }>(
      test.db,
      "select actor_kind from audit_log where action = $1",
      [CONTENT_AUDIT_ACTIONS.pack_won],
    );
    expect(won.map((row) => row.actor_kind)).toEqual(["system"]);
  });
});
