// 밸런스 화면 tRPC DB 통합 시험 — docs/adr/2026-11-01-balance-screen.md 1·2·3절·"꼬임 점검".
// 권한(player 403), 표·기여·대결 조회, 가중치 칸을 tuning.save로 넣으면 다음 요청부터 화면 2차 스탯에 듦(판 +1·감사 기록·칸 수·내보내기),
// 가치 없는 1차는 받지 않음(data.details), 다시 켤 때 가중치 칸도 가장 나중에 바꾼 것이 이김·맞지 않는 칸은 지움(시작을 막지 않음).
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
import { type TuningState, createTuningState } from "../tuning/state.ts";
import { TUNING_AUDIT_ACTIONS } from "../tuning/store.ts";
import { statRowsOf, tuningEntriesOf } from "../world/combatCatalog.ts";

const PASSWORD = "fake pass phrase 8";
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

describe.skipIf(!TEST_DATABASE_URL)("밸런스 화면 (DB)", () => {
  let test: TestDatabase;
  let app: FastifyInstance;
  let state: TuningState;
  const cookie: { player?: string; dev?: string } = {};
  const loaded = loadServerContent(DEFAULT_CONTENT_DIR);
  if (!loaded.ok) throw new Error(loaded.lines.join("\n"));

  const start = async () => {
    state = createTuningState(tuningEntriesOf(loaded.source), statRowsOf(loaded.source));
    const built = await buildApp({
      contentVersion: loaded.content.version,
      contentHash: loaded.content.hash,
      logger: false,
      metricsIntervalMs: 0,
      db: test.db,
      auth: { settings: TEST_SETTINGS, openSignup: true },
      roster: rosterCatalogOf(
        loaded.source,
        () => state.society(),
        () => state.statTable(),
      ),
      tuning: { state, packId: "core", limits: RELAXED },
      balance: { runner: { kind: "inline" } },
    });
    await built.ready();
    return built;
  };
  const revisionNow = async (): Promise<number> => {
    const value = obj(resultOf(await trpcQuery(app, "tuning.list", undefined, cookie.dev))).revision;
    if (typeof value !== "number") throw new Error("no revision");
    return value;
  };
  const save = async (changes: readonly { id: string; value: number | null }[]) =>
    trpcMutation(app, "tuning.save", { expectedRevision: await revisionNow(), changes }, cookie.dev);
  /** 시안 유닛(dev 홈 시안 자료) 첫 줄의 2차 스탯 HP — 서버 화면 자료가 실효 표로 계산하는지 본다 */
  const previewHp = async (): Promise<unknown> => {
    const list = obj(resultOf(await trpcQuery(app, "units.list", { preview: true }, cookie.dev)));
    const unit = obj(arr(list.units)[0]);
    return obj(arr(obj(unit.stats).secondary).find((row) => obj(row).id === "hp")).value;
  };

  beforeAll(async () => {
    test = await createTestDatabase();
    app = await start();
    const auth = createAuth({ db: test.db, settings: TEST_SETTINGS });
    cookie.player = sessionCookie(
      await enter(app, { id: "Fake_BalPlayer", password: PASSWORD, create: true, passwordConfirm: PASSWORD }),
    );
    await executeCommand(
      parseCliArgs(["create-user", "--id", "Fake_BalDev", "--roles", "player,dev"]),
      { TIC_ACTOR: "test:balance", TIC_PASSWORD: PASSWORD },
      { db: test.db, auth },
      { out: () => {}, err: () => {} },
    );
    cookie.dev = sessionCookie(await enter(app, { id: "Fake_BalDev", password: PASSWORD }));
  });

  afterAll(async () => {
    await app?.close();
    await test?.drop();
  });

  it("player는 FORBIDDEN, 로그인 안 함은 UNAUTHORIZED, dev는 표·기여·대결을 본다", async () => {
    expect((await trpcQuery(app, "balance.table", undefined, cookie.player)).statusCode).toBe(403);
    expect((await trpcQuery(app, "balance.table", undefined)).statusCode).toBe(401);
    const table = obj(resultOf(await trpcQuery(app, "balance.table", undefined, cookie.dev)));
    expect(arr(table.rows)).toHaveLength(18);
    const defaults = obj(table.defaults);
    const primaries = obj(defaults.primaries);
    const contribution = await trpcQuery(
      app,
      "balance.contribution",
      { primaries, edits: [{ key: "hp.vit", value: 4000 }] },
      cookie.dev,
    );
    expect(contribution.statusCode, contribution.body).toBe(200);
    expect(obj(resultOf(contribution)).problem).toBeNull();
    const duels = await trpcQuery(
      app,
      "balance.duels",
      { ...defaults, runs: 2, limitSec: 30, edits: [] },
      cookie.dev,
    );
    expect(duels.statusCode, duels.body).toBe(200);
    expect(arr(obj(resultOf(duels)).current)).toHaveLength(6);
    // 상한 밖은 입력 검사(형식) 또는 서버 검사에서 거절
    const tooMuch = await trpcQuery(
      app,
      "balance.duels",
      { ...defaults, runs: 40, limitSec: 300, edits: [] },
      cookie.dev,
    );
    expect(errorOf(tooMuch)).toMatchObject({ code: "BAD_REQUEST", reason: "invalid_settings" });
  });

  it("가중치 칸을 tuning.save로 넣으면 다음 요청부터 화면 2차 스탯에 들고(판 +1), 칸 수·내보내기·감사 기록에 남는다", async () => {
    const before = await previewHp();
    const revision = await revisionNow();
    const res = await save([{ id: "hp.vit", value: 6000 }]);
    expect(res.statusCode, res.body).toBe(200);
    const list = obj(resultOf(res));
    expect(list.revision).toBe(revision + 1);
    expect(list.statOverrides).toBe(1);
    const after = await previewHp();
    expect(typeof before === "number" && typeof after === "number" && after > before).toBe(true);
    const table = obj(resultOf(await trpcQuery(app, "balance.table", undefined, cookie.dev)));
    const hp = obj(arr(table.rows).find((row) => obj(row).id === "hp"));
    expect(obj(arr(hp.cells).find((cell) => obj(cell).field === "vit"))).toMatchObject({
      pack: 3000,
      value: 6000,
    });
    const diff = tuningDiffSchema.parse(
      obj(resultOf(await trpcQuery(app, "tuning.export", undefined, cookie.dev))).diff,
    );
    expect(diff.statRows).toEqual([{ row: "hp", field: "vit", from: 3000, to: 6000 }]);
    const audits = await rows<{ after: unknown }>(
      test.db,
      "select after from audit_log where action = $1 order by id",
      [TUNING_AUDIT_ACTIONS.apply],
    );
    expect(obj(audits.at(-1)?.after).changes).toEqual([{ id: "hp.vit", value: 6000, packValue: 3000 }]);
    expect(await rows(test.db, "select id, unit from tuning_overrides")).toEqual([
      { id: "hp.vit", unit: "pm" },
    ]);
  });

  it("가치 없는 1차를 만드는 묶음은 받지 않는다(data.details stat_primary_unused), 범위 밖·모양에 없는 칸도", async () => {
    const zeroWis = state
      .statTable()
      .flatMap((row) => ((row.weights[5] ?? 0) === 0 ? [] : [{ id: `${row.id}.wis`, value: 0 }]));
    expect(errorOf(await save(zeroWis))).toEqual({
      code: "BAD_REQUEST",
      reason: "rules_conflict",
      details: ["stat_primary_unused"],
    });
    expect(errorOf(await save([{ id: "evade.cap", value: 2000 }]))).toMatchObject({ reason: "out_of_range" });
    expect(errorOf(await save([{ id: "hp.cap", value: 10 }]))).toMatchObject({ reason: "unknown_entry" });
    expect(state.statOverrideCount()).toBe(1);
  });

  it("다시 켜면 가중치 칸도 가장 나중에 바꾼 것이 이기고(pack_won) 맞지 않는 칸은 지운다(dropped), 시작을 막지 않는다", async () => {
    await rows(
      test.db,
      `insert into tuning_overrides (id, value, pack_value, unit, content_version) values
        ('shield_hp.dex', 400, 150, 'pm', 'core@1'),
        ('hp.cap', 10, 0, 'pm', 'core@1'),
        ('evade.half', 300, 250, 'pm', 'core@1')`,
    );
    await app.close();
    app = await start();
    expect(state.statTable().find((row) => row.id === "hp")?.weights[3]).toBe(6000);
    expect(await rows(test.db, "select id from tuning_overrides order by id")).toEqual([{ id: "hp.vit" }]);
    const won = await rows<{ before: unknown }>(test.db, "select before from audit_log where action = $1", [
      TUNING_AUDIT_ACTIONS.pack_won,
    ]);
    expect(obj(won[0]?.before).changes).toEqual([{ id: "shield_hp.dex", value: 400, packValue: 150 }]);
    const dropped = await rows<{ before: unknown }>(
      test.db,
      "select before from audit_log where action = $1",
      [TUNING_AUDIT_ACTIONS.dropped],
    );
    expect(arr(obj(dropped[0]?.before).changes)).toEqual(
      expect.arrayContaining([
        { id: "hp.cap", value: 10, reason: "unknown_entry" },
        { id: "evade.half", value: 300, reason: "unit_changed" },
      ]),
    );
  });
});
