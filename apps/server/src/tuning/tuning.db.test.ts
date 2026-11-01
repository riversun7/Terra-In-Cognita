// 설정 칸 패널 tRPC DB 통합 시험 — docs/adr/2026-11-01-dev-settings-panel.md 5·6·8·9·10·11절·"꼬임 점검".
// 권한(player 403, dev·admin), 묶음 적용(한 번에 검사·저장·반영)·세계 설정 판 충돌·범위·규칙(data.details)·구조 값·메모·같은 칸 두 번,
// 서버 읽는 곳에 바로 듦(사이보그 화면 환생 화폐·세력 화면 공물 주기·/health), 되돌리기(규칙 문제면 거절)·모두 되돌리기·감사 기록·
// 최근 바꿈·내보내기·서버 기록(tuning change), 다시 켤 때 싣기(가장 나중에 바꾼 것이 이김·맞지 않는 줄 지움·판 유지).
// TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
import { tuningDiffSchema } from "@terra/content";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.ts";
import { createAuth } from "../auth/auth.ts";
import { executeCommand, parseCliArgs } from "../cli/commands.ts";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { loadServerContent } from "../content.ts";
import { rosterCatalogOf } from "../roster/catalog.ts";
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
import { tuningEntriesOf } from "../world/combatCatalog.ts";
import { TUNING_CHANGE_MESSAGE } from "./services.ts";
import { type TuningState, createTuningState } from "./state.ts";
import { TUNING_AUDIT_ACTIONS } from "./store.ts";

const PASSWORD = "fake pass phrase 7";
const ACCOUNTS = {
  player: ["Fake_TunePlayer", undefined],
  dev: ["Fake_TuneDev", "player,dev"],
  admin: ["Fake_TuneAdmin", "admin"],
} as const;
type Account = keyof typeof ACCOUNTS;
const ACCOUNT_NAMES: readonly Account[] = ["player", "dev", "admin"];

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
  const error = obj(obj(res.json()).error);
  const data = obj(error.data);
  return { code: data.code, reason: data.reason, details: data.details };
}
const entryOf = (list: unknown, id: string) => obj(arr(obj(list).entries).find((e) => obj(e).id === id));

/** pino 줄을 모으는 쓰기 대상(서버 기록 확인) */
function captureLog() {
  const lines: Record<string, unknown>[] = [];
  return {
    lines,
    stream: {
      write(line: string) {
        const parsed: unknown = JSON.parse(line);
        if (isRecord(parsed)) lines.push(parsed);
      },
    },
  };
}

describe.skipIf(!TEST_DATABASE_URL)("설정 칸 패널 (DB)", () => {
  let test: TestDatabase;
  let app: FastifyInstance;
  let state: TuningState;
  let log = captureLog();
  const cookie: Partial<Record<Account, string>> = {};
  const loaded = loadServerContent(DEFAULT_CONTENT_DIR);
  if (!loaded.ok) throw new Error(loaded.lines.join("\n"));

  const start = async () => {
    state = createTuningState(tuningEntriesOf(loaded.source));
    log = captureLog();
    const built = await buildApp({
      contentVersion: loaded.content.version,
      contentHash: loaded.content.hash,
      logger: { level: "info", stream: log.stream },
      metricsIntervalMs: 0,
      db: test.db,
      auth: { settings: TEST_SETTINGS, openSignup: true },
      roster: rosterCatalogOf(loaded.source, () => state.society()),
      tuning: { state, packId: "core", limits: RELAXED },
    });
    await built.ready();
    return built;
  };
  const list = (who: Account) => trpcQuery(app, "tuning.list", undefined, cookie[who]);
  const revisionNow = async (): Promise<number> => {
    const value = obj(resultOf(await list("dev"))).revision;
    if (typeof value !== "number") throw new Error("no revision");
    return value;
  };
  const apply = async (
    who: Account,
    changes: readonly { id: string; value: number | null }[],
    extra: Record<string, unknown> = {},
  ) =>
    trpcMutation(
      app,
      "tuning.save",
      { expectedRevision: await revisionNow(), changes, ...extra },
      cookie[who],
    );
  const audits = (action: string) =>
    rows<{ before: unknown; after: unknown; actor_kind: string }>(
      test.db,
      "select before, after, actor_kind from audit_log where action = $1 order by id",
      [action],
    );

  beforeAll(async () => {
    test = await createTestDatabase();
    app = await start();
    const auth = createAuth({ db: test.db, settings: TEST_SETTINGS });
    for (const name of ACCOUNT_NAMES) {
      const [loginId, roles] = ACCOUNTS[name];
      if (roles === undefined) {
        cookie[name] = sessionCookie(
          await enter(app, { id: loginId, password: PASSWORD, create: true, passwordConfirm: PASSWORD }),
        );
      } else {
        await executeCommand(
          parseCliArgs(["create-user", "--id", loginId, "--roles", roles]),
          { TIC_ACTOR: "test:tuning", TIC_PASSWORD: PASSWORD },
          { db: test.db, auth },
          { out: () => {}, err: () => {} },
        );
        cookie[name] = sessionCookie(await enter(app, { id: loginId, password: PASSWORD }));
      }
    }
  });

  afterAll(async () => {
    await app?.close();
    await test?.drop();
  });

  it("player는 조회·쓰기 모두 FORBIDDEN, 로그인 안 함은 UNAUTHORIZED", async () => {
    expect((await list("player")).statusCode).toBe(403);
    const res = await trpcMutation(
      app,
      "tuning.save",
      { expectedRevision: 0, changes: [{ id: "n39_grant_base", value: 90 }] },
      cookie.player,
    );
    expect(res.statusCode).toBe(403);
    expect((await trpcQuery(app, "tuning.list", undefined)).statusCode).toBe(401);
  });

  it("dev 목록: 팩 칸 전부(팩 차례), 단위·범위·범위 칩, 덮어쓰기 없음, 세계 설정 판 0", async () => {
    const res = await list("dev");
    expect(res.statusCode, res.body).toBe(200);
    const body = obj(resultOf(res));
    expect(body.contentVersion).toBe(loaded.content.version);
    expect(body.revision).toBe(0);
    expect(arr(body.entries).map((entry) => obj(entry).id)).toEqual(
      tuningEntriesOf(loaded.source).map((entry) => entry.id),
    );
    expect(entryOf(body, "n39_grant_base")).toMatchObject({
      code: "N39",
      unit: "minor",
      min: 0,
      packValue: 72,
      value: 72,
      scope: "live",
      override: null,
    });
    expect(entryOf(body, "c19_loot")).toMatchObject({ unit: "bp", min: null, max: null, scope: "sim" });
  });

  it("묶음 적용은 다음 요청부터 서버가 읽는 곳에 든다(환생 화폐·공물 주기·/health), 판 +1, 감사 기록·서버 기록 한 줄", async () => {
    const before = obj(resultOf(await trpcQuery(app, "cyborg.get", undefined, cookie.player)));
    expect(obj(before.rebirth).currency).toBe("10000");
    const res = await apply(
      "dev",
      [
        { id: "n34_rebirth_currency", value: 25_000 },
        { id: "d443_tribute_every", value: 3_600_000 },
      ],
      { note: "  N1 준비 " },
    );
    expect(res.statusCode, res.body).toBe(200);
    const body = resultOf(res);
    expect(obj(body).revision).toBe(1);
    expect(entryOf(body, "n34_rebirth_currency")).toMatchObject({
      value: 25_000,
      packValue: 10_000,
      override: { value: 25_000, packValueAtSave: 10_000, note: "N1 준비", updatedBy: ACCOUNTS.dev[0] },
    });
    const after = obj(resultOf(await trpcQuery(app, "cyborg.get", undefined, cookie.player)));
    expect(obj(after.rebirth).currency).toBe("25000");
    const faction = obj(resultOf(await trpcQuery(app, "faction.overview", undefined, cookie.player)));
    expect(obj(faction.rules).tributeEveryMs).toBe(3_600_000);
    const health = obj((await app.inject({ method: "GET", url: "/health" })).json());
    expect([health.tuningOverrides, health.tuningRevision]).toEqual([2, 1]);
    expect(await audits(TUNING_AUDIT_ACTIONS.apply)).toEqual([
      {
        actor_kind: "admin",
        before: {
          revision: 0,
          changes: [
            { id: "n34_rebirth_currency", value: null },
            { id: "d443_tribute_every", value: null },
          ],
        },
        after: {
          revision: 1,
          contentVersion: loaded.content.version,
          note: "N1 준비",
          changes: [
            { id: "n34_rebirth_currency", value: 25_000, packValue: 10_000 },
            { id: "d443_tribute_every", value: 3_600_000, packValue: 604_800_000 },
          ],
        },
      },
    ]);
    const change = log.lines.find((line) => line.msg === TUNING_CHANGE_MESSAGE);
    expect(change).toMatchObject({ tuningRevision: 1, actor: ACCOUNTS.dev[0], note: "N1 준비" });
    expect(arr(change?.changes)).toHaveLength(2);
  });

  it("두 관리자 동시 편집: 같은 판을 보고 보내면 늦은 쪽은 CONFLICT, 아무것도 바뀌지 않는다", async () => {
    const seen = await revisionNow();
    const first = await trpcMutation(
      app,
      "tuning.save",
      { expectedRevision: seen, changes: [{ id: "n39_grant_base", value: 80 }] },
      cookie.dev,
    );
    expect(first.statusCode, first.body).toBe(200);
    const late = await trpcMutation(
      app,
      "tuning.save",
      { expectedRevision: seen, changes: [{ id: "n39_grant_base", value: 95 }] },
      cookie.admin,
    );
    expect(errorOf(late)).toMatchObject({ code: "CONFLICT", reason: "revision_conflict" });
    expect(state.values().get("n39_grant_base")).toBe(80);
    expect(await revisionNow()).toBe(seen + 1);
  });

  it("받지 않음(묶음 전체가 그대로): 범위 밖·팩에 없는 ID·규칙 문제(data.details)·구조 값 확인 없음·메모 글자·같은 칸 두 번", async () => {
    const revision = await revisionNow();
    const values = state.values();
    expect(
      errorOf(
        await apply("dev", [
          { id: "n39_grant_base", value: 70 },
          { id: "n39_grant_step", value: -1 },
        ]),
      ),
    ).toMatchObject({ code: "BAD_REQUEST", reason: "out_of_range" });
    expect(errorOf(await apply("dev", [{ id: "nope_entry", value: 1 }]))).toMatchObject({
      reason: "unknown_entry",
    });
    expect(errorOf(await apply("dev", [{ id: "n9_initial_sum", value: 200 }]))).toEqual({
      code: "BAD_REQUEST",
      reason: "rules_conflict",
      details: ["n9_fit"],
    });
    expect(errorOf(await apply("dev", [{ id: "n7_max_level", value: 60 }]))).toMatchObject({
      reason: "structural_unconfirmed",
    });
    expect(
      errorOf(await apply("dev", [{ id: "n39_grant_base", value: 70 }], { note: "a\u0000b" })),
    ).toMatchObject({
      reason: "invalid_note",
    });
    expect(
      errorOf(await apply("dev", [{ id: "n39_grant_base", value: 70 }], { note: "가".repeat(201) })),
    ).toMatchObject({ reason: "invalid_note" });
    expect(
      errorOf(
        await apply("dev", [
          { id: "n39_grant_base", value: 70 },
          { id: "n39_grant_base", value: 71 },
        ]),
      ),
    ).toMatchObject({ reason: "duplicate_entry" });
    // 정수가 아니거나 한계 밖은 입력 형식(400)
    expect((await apply("dev", [{ id: "n39_grant_base", value: 1.5 }])).statusCode).toBe(400);
    expect((await apply("dev", [{ id: "n39_grant_base", value: 2e12 }])).statusCode).toBe(400);
    // 바뀐 것이 없다(스냅숏·판 그대로)
    expect(state.values()).toBe(values);
    expect(await revisionNow()).toBe(revision);
    const ok = await apply("dev", [{ id: "n7_max_level", value: 60 }], { confirmStructural: true });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(
      (await apply("dev", [{ id: "n7_max_level", value: null }], { confirmStructural: true })).statusCode,
    ).toBe(200);
  });

  it("함께 바꿔야 맞는 칸은 한 묶음으로 받고, 되돌리기가 규칙 문제를 만들면 거절, 함께 되돌리면 된다", async () => {
    expect(errorOf(await apply("dev", [{ id: "n9_initial_sum", value: 150 }]))).toMatchObject({
      reason: "rules_conflict",
    });
    const both = await apply("dev", [
      { id: "n9_initial_sum", value: 150 },
      { id: "n9_initial_max", value: 30 },
    ]);
    expect(both.statusCode, both.body).toBe(200);
    expect(state.society().cyborg.initialSum).toBe(150);
    expect(errorOf(await apply("dev", [{ id: "n9_initial_max", value: null }]))).toEqual({
      code: "BAD_REQUEST",
      reason: "rules_conflict",
      details: ["n9_fit"],
    });
    // 팩 값으로 보내도 되돌리기다
    const back = await apply("dev", [
      { id: "n9_initial_sum", value: 60 },
      { id: "n9_initial_max", value: null },
    ]);
    expect(back.statusCode, back.body).toBe(200);
    expect(entryOf(resultOf(back), "n9_initial_sum").override).toBeNull();
    // 바뀌는 것이 없는 묶음은 판을 올리지 않는다
    const revision = await revisionNow();
    expect((await apply("dev", [{ id: "n9_initial_sum", value: null }])).statusCode).toBe(200);
    expect(await revisionNow()).toBe(revision);
  });

  it("내보내기: 팩과 다른 덮어쓰기만, 팩 차이 형식(@terra/content)", async () => {
    const res = await trpcQuery(app, "tuning.export", undefined, cookie.dev);
    expect(res.statusCode, res.body).toBe(200);
    const body = obj(resultOf(res));
    const diff = tuningDiffSchema.parse(body.diff);
    expect(diff.contentVersion).toBe(loaded.content.version);
    expect(diff.changes).toEqual([
      { id: "d443_tribute_every", code: "", from: 604_800_000, to: 3_600_000 },
      { id: "n34_rebirth_currency", code: "N34", from: 10_000, to: 25_000 },
      { id: "n39_grant_base", code: "N39", from: 72, to: 80 },
    ]);
    expect(body.fileName).toMatch(/^tuning-core-\d+-\d{8}T\d{6}Z\.json$/);
  });

  it("최근 바꿈: 새 것부터, 사람·판·칸마다 앞뒤 값·메모", async () => {
    const res = await trpcQuery(app, "tuning.history", undefined, cookie.admin);
    expect(res.statusCode, res.body).toBe(200);
    const history = arr(obj(resultOf(res)).rows);
    expect(obj(history[0])).toMatchObject({
      action: "apply",
      changes: [
        { id: "n9_initial_sum", before: 150, after: null },
        { id: "n9_initial_max", before: 30, after: null },
      ],
    });
    expect(obj(history.at(-1))).toMatchObject({
      action: "apply",
      actor: ACCOUNTS.dev[0],
      revision: 1,
      note: "N1 준비",
      changes: [
        { id: "n34_rebirth_currency", before: null, after: 25_000, packValue: 10_000 },
        { id: "d443_tribute_every", before: null, after: 3_600_000 },
      ],
    });
  });

  it("다시 켜면 DB에서 싣는다: 판 유지, 가장 나중에 바꾼 것이 이김(pack_won), 맞지 않는 줄은 지우고 기록(dropped), 시작을 막지 않는다", async () => {
    const revision = await revisionNow();
    await rows(
      test.db,
      `insert into tuning_overrides (id, value, pack_value, unit, content_version) values
        ('s26_rebellion', 25, 30, 'points', 'core@1'),
        ('gone_entry', 3, 1, null, 'core@1'),
        ('n39_grant_max', 99999, 1500, 'pm', 'core@1'),
        ('n39_grant_step', 60, 50, 'count', 'core@1')`,
    );
    await app.close();
    app = await start();
    const body = obj(resultOf(await list("dev")));
    // 정리 한 번으로 판 +1
    expect(body.revision).toBe(revision + 1);
    expect(entryOf(body, "n34_rebirth_currency")).toMatchObject({ value: 25_000 });
    expect(entryOf(body, "n39_grant_base")).toMatchObject({ value: 80 });
    for (const id of ["s26_rebellion", "n39_grant_max", "n39_grant_step"])
      expect(entryOf(body, id).override, id).toBeNull();
    expect(await audits(TUNING_AUDIT_ACTIONS.pack_won)).toEqual([
      {
        actor_kind: "system",
        before: { changes: [{ id: "s26_rebellion", value: 25, packValue: 30 }] },
        after: {
          revision: revision + 1,
          contentVersion: loaded.content.version,
          changes: [{ id: "s26_rebellion", packValue: 40 }],
        },
      },
    ]);
    const dropped = await audits(TUNING_AUDIT_ACTIONS.dropped);
    expect(dropped).toHaveLength(1);
    expect(arr(obj(dropped[0]?.before).changes)).toEqual(
      expect.arrayContaining([
        { id: "gone_entry", value: 3, reason: "unknown_entry" },
        { id: "n39_grant_max", value: 99_999, reason: "out_of_range" },
        { id: "n39_grant_step", value: 60, reason: "unit_changed" },
      ]),
    );
    expect(await rows(test.db, "select id from tuning_overrides order by id")).toEqual([
      { id: "d443_tribute_every" },
      { id: "n34_rebirth_currency" },
      { id: "n39_grant_base" },
    ]);
    const health = obj((await app.inject({ method: "GET", url: "/health" })).json());
    expect(health.tuningOverrides).toBe(3);
    expect(log.lines.find((line) => line.msg === "tuning overrides")).toMatchObject({
      tuningRevision: revision + 1,
      applied: ["d443_tribute_every", "n34_rebirth_currency", "n39_grant_base"],
    });
    // 최근 바꿈에 보인다
    const history = arr(obj(resultOf(await trpcQuery(app, "tuning.history", undefined, cookie.dev))).rows);
    expect(history.slice(0, 2).map((row) => obj(row).action)).toEqual(["dropped", "pack_won"]);
  });

  it("모두 되돌리기: 덮어쓰기를 모두 지우고 감사 기록 한 줄, 판이 다르면 CONFLICT", async () => {
    expect(
      errorOf(await trpcMutation(app, "tuning.revertAll", { expectedRevision: 0 }, cookie.admin)),
    ).toMatchObject({ code: "CONFLICT" });
    const res = await trpcMutation(
      app,
      "tuning.revertAll",
      { expectedRevision: await revisionNow() },
      cookie.admin,
    );
    expect(res.statusCode, res.body).toBe(200);
    expect(state.appliedCount()).toBe(0);
    expect(await rows(test.db, "select id from tuning_overrides")).toEqual([]);
    const all = await audits(TUNING_AUDIT_ACTIONS.revert_all);
    expect(all).toHaveLength(1);
    expect(obj(all[0]?.before).changes).toEqual([
      { id: "d443_tribute_every", value: 3_600_000 },
      { id: "n34_rebirth_currency", value: 25_000 },
      { id: "n39_grant_base", value: 80 },
    ]);
  });
});
