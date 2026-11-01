// 설정 칸 패널 tRPC DB 통합 시험 — docs/adr/2026-11-01-dev-settings-panel.md 5·8·9·10·11절.
// 권한(player 403, dev·admin), 덮어쓰기 저장·충돌·범위·규칙(data.details)·구조 값·메모, 서버 읽는 곳에 바로 듦(사이보그 화면 환생
// 화폐·세력 화면 공물 주기·/health), 되돌리기(규칙 문제면 거절)·모두 되돌리기·감사 기록·최근 바꿈·내보내기, 다시 켤 때 싣기
// (팩 값과 같은 줄 지움·팩에 없는 ID·범위 밖), 잠금. TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
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

describe.skipIf(!TEST_DATABASE_URL)("설정 칸 패널 (DB)", () => {
  let test: TestDatabase;
  let app: FastifyInstance;
  let state: TuningState;
  const cookie: Partial<Record<Account, string>> = {};
  const loaded = loadServerContent(DEFAULT_CONTENT_DIR);
  if (!loaded.ok) throw new Error(loaded.lines.join("\n"));

  const start = async (options: { locked?: boolean } = {}) => {
    state = createTuningState(tuningEntriesOf(loaded.source));
    const built = await buildApp({
      contentVersion: loaded.content.version,
      contentHash: loaded.content.hash,
      logger: false,
      metricsIntervalMs: 0,
      db: test.db,
      auth: { settings: TEST_SETTINGS, openSignup: true },
      roster: rosterCatalogOf(loaded.source, () => state.society()),
      tuning: { state, packId: "core", locked: options.locked ?? false, limits: RELAXED },
    });
    await built.ready();
    return built;
  };
  const list = (who: Account) => trpcQuery(app, "tuning.list", undefined, cookie[who]);
  const set = (who: Account, input: Record<string, unknown>) =>
    trpcMutation(app, "tuning.set", { expected: null, ...input }, cookie[who]);
  const revert = (who: Account, id: string, expected: number) =>
    trpcMutation(app, "tuning.revert", { id, expected }, cookie[who]);
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
    expect((await set("player", { id: "n39_grant_base", value: 90 })).statusCode).toBe(403);
    expect((await trpcQuery(app, "tuning.list", undefined)).statusCode).toBe(401);
  });

  it("dev 목록: 팩 칸 전부(팩 차례), 단위·범위·범위 칩, 덮어쓰기 없음", async () => {
    const res = await list("dev");
    expect(res.statusCode, res.body).toBe(200);
    const body = obj(resultOf(res));
    expect(body.contentVersion).toBe(loaded.content.version);
    expect(body.locked).toBe(false);
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
    // 단위가 없는 칸은 이름에서 읽는다(c19 "(bp)"), 범위가 없으면 null
    expect(entryOf(body, "c19_loot")).toMatchObject({ unit: "bp", min: null, max: null, scope: "sim" });
  });

  it("저장하면 다음 요청부터 서버가 읽는 곳에 든다(사이보그 화면 환생 화폐·세력 화면 공물 주기·/health), 감사 기록", async () => {
    const before = obj(resultOf(await trpcQuery(app, "cyborg.get", undefined, cookie.player)));
    expect(obj(before.rebirth).currency).toBe("10000");
    const res = await set("dev", {
      id: "n34_rebirth_currency",
      value: 25_000,
      note: "  N1 준비 ",
      expected: null,
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(entryOf(resultOf(res), "n34_rebirth_currency")).toMatchObject({
      value: 25_000,
      packValue: 10_000,
      override: {
        value: 25_000,
        packValueAtSave: 10_000,
        note: "N1 준비",
        updatedBy: ACCOUNTS.dev[0],
        state: "applied",
      },
    });
    const after = obj(resultOf(await trpcQuery(app, "cyborg.get", undefined, cookie.player)));
    expect(obj(after.rebirth).currency).toBe("25000");
    expect(state.society().cyborg.rebirthCurrency).toBe(25_000);

    expect((await set("admin", { id: "d443_tribute_every", value: 3_600_000 })).statusCode).toBe(200);
    const faction = obj(resultOf(await trpcQuery(app, "faction.overview", undefined, cookie.player)));
    expect(obj(faction.rules).tributeEveryMs).toBe(3_600_000);

    const health = obj((await app.inject({ method: "GET", url: "/health" })).json());
    expect(health.tuningOverrides).toBe(2);
    const audit = await audits(TUNING_AUDIT_ACTIONS.set);
    expect(audit[0]).toMatchObject({
      actor_kind: "admin",
      before: { id: "n34_rebirth_currency", value: null },
      after: { id: "n34_rebirth_currency", value: 25_000, packValue: 10_000, note: "N1 준비" },
    });
  });

  it("받지 않음: 기대 값 어긋남 CONFLICT, 범위 밖·팩에 없는 ID·규칙 문제(data.details)·구조 값 확인 없음·메모 글자", async () => {
    expect(errorOf(await set("dev", { id: "n34_rebirth_currency", value: 1, expected: null }))).toMatchObject(
      {
        code: "CONFLICT",
        reason: "revision_conflict",
      },
    );
    expect(errorOf(await set("dev", { id: "n39_grant_base", value: -1 }))).toMatchObject({
      code: "BAD_REQUEST",
      reason: "out_of_range",
    });
    expect(errorOf(await set("dev", { id: "nope_entry", value: 1 }))).toMatchObject({
      reason: "unknown_entry",
    });
    expect(errorOf(await set("dev", { id: "n9_initial_sum", value: 200 }))).toEqual({
      code: "BAD_REQUEST",
      reason: "rules_conflict",
      details: ["n9_fit"],
    });
    expect(errorOf(await set("dev", { id: "n7_max_level", value: 60 }))).toMatchObject({
      reason: "structural_unconfirmed",
    });
    expect(errorOf(await set("dev", { id: "n39_grant_base", value: 80, note: "a\u0000b" }))).toMatchObject({
      reason: "invalid_note",
    });
    expect(
      errorOf(await set("dev", { id: "n39_grant_base", value: 80, note: "가".repeat(201) })),
    ).toMatchObject({
      reason: "invalid_note",
    });
    // 바뀐 것이 없다
    expect(state.values().get("n9_initial_sum")).toBe(60);
    expect(state.values().get("n7_max_level")).toBe(50);
    const ok = await set("dev", { id: "n7_max_level", value: 60, confirmStructural: true });
    expect(ok.statusCode, ok.body).toBe(200);
    expect((await revert("dev", "n7_max_level", 60)).statusCode).toBe(200);
  });

  it("팩 값으로 저장하면 되돌리기, 되돌리기가 규칙 문제를 만들면 거절, 기대 값이 다르면 CONFLICT", async () => {
    expect((await set("dev", { id: "n9_initial_sum", value: 100 })).statusCode).toBe(200);
    expect((await set("dev", { id: "n9_initial_min", value: 15 })).statusCode).toBe(200);
    expect(errorOf(await revert("dev", "n9_initial_sum", 100))).toEqual({
      code: "BAD_REQUEST",
      reason: "rules_conflict",
      details: ["n9_fit"],
    });
    expect(errorOf(await revert("dev", "n9_initial_min", 14))).toMatchObject({ code: "CONFLICT" });
    // 칸 최소를 팩 값(1)으로 저장 = 되돌리기
    const back = await set("dev", { id: "n9_initial_min", value: 1, expected: 15 });
    expect(back.statusCode, back.body).toBe(200);
    expect(obj(entryOf(resultOf(back), "n9_initial_min")).override).toBeNull();
    expect((await revert("dev", "n9_initial_sum", 100)).statusCode).toBe(200);
    // 없는 덮어쓰기 되돌리기는 그대로 성공(이미 팩 값)
    expect((await revert("dev", "n9_initial_sum", 100)).statusCode).toBe(200);
    const reverts = await audits(TUNING_AUDIT_ACTIONS.revert);
    expect(reverts.map((row) => obj(row.before).id)).toEqual([
      "n7_max_level",
      "n9_initial_min",
      "n9_initial_sum",
    ]);
  });

  it("내보내기: 적용 중이고 팩과 다른 덮어쓰기만, 팩 차이 형식(@terra/content)", async () => {
    const res = await trpcQuery(app, "tuning.export", undefined, cookie.dev);
    expect(res.statusCode, res.body).toBe(200);
    const body = obj(resultOf(res));
    const diff = tuningDiffSchema.parse(body.diff);
    expect(diff.contentVersion).toBe(loaded.content.version);
    expect(diff.changes).toEqual([
      { id: "d443_tribute_every", code: "", from: 604_800_000, to: 3_600_000 },
      { id: "n34_rebirth_currency", code: "N34", from: 10_000, to: 25_000 },
    ]);
    expect(body.fileName).toMatch(/^tuning-core-\d+-\d{8}T\d{6}Z\.json$/);
  });

  it("최근 바꿈: 새 것부터, 사람·칸·앞뒤 값·메모", async () => {
    const res = await trpcQuery(app, "tuning.history", undefined, cookie.admin);
    expect(res.statusCode, res.body).toBe(200);
    const history = arr(obj(resultOf(res)).rows);
    expect(obj(history[0])).toMatchObject({
      action: "revert",
      ids: ["n9_initial_sum"],
      before: 100,
      after: null,
    });
    const first = obj(history.at(-1));
    expect(first).toMatchObject({
      action: "set",
      actor: ACCOUNTS.dev[0],
      ids: ["n34_rebirth_currency"],
      before: null,
      after: 25_000,
      note: "N1 준비",
    });
  });

  it("다시 켜면 DB에서 싣는다: 팩 값과 같은 줄은 지우고(감사 absorbed), 팩에 없는 ID·범위 밖은 적용하지 않고 보인다", async () => {
    await rows(
      test.db,
      `insert into tuning_overrides (id, value, pack_value, content_version) values
        ('n39_grant_step', 50, 40, 'core@1'), ('gone_entry', 3, 1, 'core@1'), ('n39_grant_max', 99999, 1500, 'core@1')`,
    );
    await app.close();
    app = await start();
    const body = obj(resultOf(await list("dev")));
    expect(entryOf(body, "n34_rebirth_currency")).toMatchObject({
      value: 25_000,
      override: { state: "applied" },
    });
    expect(entryOf(body, "n39_grant_step").override).toBeNull();
    expect(entryOf(body, "n39_grant_max")).toMatchObject({
      value: 1500,
      override: { value: 99_999, state: "out_of_range" },
    });
    expect(body.orphans).toEqual([
      expect.objectContaining({
        id: "gone_entry",
        override: expect.objectContaining({ state: "unknown_entry" }),
      }),
    ]);
    const absorbed = await audits(TUNING_AUDIT_ACTIONS.absorbed);
    expect(absorbed).toEqual([
      {
        actor_kind: "system",
        before: { overrides: [{ id: "n39_grant_step", value: 50 }] },
        after: { contentVersion: loaded.content.version },
      },
    ]);
    const health = obj((await app.inject({ method: "GET", url: "/health" })).json());
    expect(health.tuningOverrides).toBe(2);
    // 팩에 없는 줄도 되돌린다
    expect((await revert("dev", "gone_entry", 3)).statusCode).toBe(200);
  });

  it("모두 되돌리기: 덮어쓰기를 모두 지우고 감사 기록 한 줄", async () => {
    const res = await trpcMutation(app, "tuning.revertAll", undefined, cookie.admin);
    expect(res.statusCode, res.body).toBe(200);
    expect(obj(resultOf(res)).orphans).toEqual([]);
    expect(state.appliedCount()).toBe(0);
    expect(await rows(test.db, "select id from tuning_overrides")).toEqual([]);
    const all = await audits(TUNING_AUDIT_ACTIONS.revert_all);
    expect(all).toHaveLength(1);
    expect(obj(all[0]?.before).overrides).toEqual([
      { id: "d443_tribute_every", value: 3_600_000 },
      { id: "n34_rebirth_currency", value: 25_000 },
      { id: "n39_grant_max", value: 99_999 },
    ]);
  });

  it("잠근 세계(TUNING_EDIT=off): 보기·내보내기는 되고 쓰기는 FORBIDDEN tuning_locked", async () => {
    await app.close();
    app = await start({ locked: true });
    expect(obj(resultOf(await list("dev"))).locked).toBe(true);
    expect((await trpcQuery(app, "tuning.export", undefined, cookie.dev)).statusCode).toBe(200);
    expect(errorOf(await set("dev", { id: "n39_grant_base", value: 90 }))).toMatchObject({
      code: "FORBIDDEN",
      reason: "tuning_locked",
    });
    expect(errorOf(await trpcMutation(app, "tuning.revertAll", undefined, cookie.dev))).toMatchObject({
      reason: "tuning_locked",
    });
  });
});
