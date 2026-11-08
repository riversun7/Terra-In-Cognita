// 밸런스 분석 tRPC DB 통합 시험 — docs/adr/2026-11-01-balance-screen.md "바뀜 (2026-11-08 완전 개편)".
// 권한(player 403·로그인 안 함 401), 시작 → 진행 → 결과(같은 시드면 같은 결과), 감사 기록(balance_analysis.start·cancel),
// 남의 일 unknown_job, 예산·형식 거절, 판 수 0 영향도. 같은 스레드(inline). TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
import { newLabUnit } from "@terra/shared/battleLab";
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
import { statRowsOf, tuningEntriesOf, unitKindNamesOf } from "../world/combatCatalog.ts";

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
  return { code: data.code, reason: data.reason };
}

const conditions = {
  template: { ...newLabUnit("human"), weapon: { kind: "item", id: "test_sword", pm: 500 } },
  level: 10,
  mode: "sum",
  elements: "keep",
  skills: true,
  gear: true,
  teamSize: 1,
  limitSec: 30,
};
const weights = (str: number, dex: number) => ({ str, vit: 10, int: 0, wis: 0, dex, agi: 10 });
const matrix = {
  kind: "matrix",
  conditions,
  builds: [
    { id: "strong", label: "힘", weights: weights(30, 10), unit: null },
    { id: "quick", label: "Quick", weights: weights(10, 30), unit: null },
  ],
  sums: [60],
  runs: 4,
  seed: 11,
};

describe.skipIf(!TEST_DATABASE_URL)("밸런스 분석 (DB)", () => {
  let test: TestDatabase;
  let app: FastifyInstance;
  let state: TuningState;
  const cookie: { player?: string; dev?: string; dev2?: string } = {};
  const loaded = loadServerContent(DEFAULT_CONTENT_DIR);
  if (!loaded.ok) throw new Error(loaded.lines.join("\n"));

  /** 일이 끝날 때까지 진행을 묻는다 */
  async function finished(id: string, who: string | undefined = cookie.dev) {
    for (let i = 0; i < 200; i++) {
      const status = obj(resultOf(await trpcQuery(app, "balanceAnalysis.status", { id }, who)));
      if (obj(status.job).state !== "running") return status;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error("analysis did not finish");
  }

  beforeAll(async () => {
    test = await createTestDatabase();
    state = createTuningState(tuningEntriesOf(loaded.source), statRowsOf(loaded.source));
    app = await buildApp({
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
      battleLab: {
        unitKindNames: unitKindNamesOf(loaded.source),
        analysisLimits: {
          startsPerUser: { capacity: 100, refillPerMinute: 100 },
          pollsPerUser: { capacity: 100_000, refillPerMinute: 100_000 },
        },
      },
    });
    await app.ready();
    const auth = createAuth({ db: test.db, settings: TEST_SETTINGS });
    cookie.player = sessionCookie(
      await enter(app, { id: "Fake_AnPlayer", password: PASSWORD, create: true, passwordConfirm: PASSWORD }),
    );
    for (const id of ["Fake_AnDev", "Fake_AnDev2"])
      await executeCommand(
        parseCliArgs(["create-user", "--id", id, "--roles", "player,dev"]),
        { TIC_ACTOR: "test:balance-analysis", TIC_PASSWORD: PASSWORD },
        { db: test.db, auth },
        { out: () => {}, err: () => {} },
      );
    cookie.dev = sessionCookie(await enter(app, { id: "Fake_AnDev", password: PASSWORD }));
    cookie.dev2 = sessionCookie(await enter(app, { id: "Fake_AnDev2", password: PASSWORD }));
  });

  afterAll(async () => {
    await app?.close();
    await test?.drop();
  });

  it("player는 FORBIDDEN, 로그인 안 함은 UNAUTHORIZED", async () => {
    expect((await trpcMutation(app, "balanceAnalysis.start", matrix, cookie.player)).statusCode).toBe(403);
    expect((await trpcQuery(app, "balanceAnalysis.list", undefined, cookie.player)).statusCode).toBe(403);
    expect((await trpcQuery(app, "balanceAnalysis.list", undefined)).statusCode).toBe(401);
  });

  it("분포 상성: 시작 → 진행 → 결과, 같은 시드면 같은 결과, 감사 기록, 남의 일은 unknown_job", async () => {
    const started = obj(resultOf(await trpcMutation(app, "balanceAnalysis.start", matrix, cookie.dev)));
    expect(started).toMatchObject({ kind: "matrix", total: 4, battleSeconds: 120 });
    const id = String(started.id);
    const done = await finished(id);
    expect(obj(done.job)).toMatchObject({ state: "done", done: 4 });
    const result = obj(done.result);
    expect(arr(result.builds).map((build) => obj(build).label)).toEqual(["힘", "Quick"]);
    const table = obj(arr(result.tables)[0]);
    const cell = obj(arr(table.cells)[0]);
    expect(cell).toMatchObject({ i: 0, j: 1, runs: 4 });
    // 같은 입력·시드 → 같은 결과
    const again = obj(resultOf(await trpcMutation(app, "balanceAnalysis.start", matrix, cookie.dev)));
    const second = await finished(String(again.id));
    expect(second.result).toEqual(done.result);
    // 남의 일
    const other = await trpcQuery(app, "balanceAnalysis.status", { id }, cookie.dev2);
    expect(other.statusCode).toBe(404);
    expect(errorOf(other).reason).toBe("unknown_job");
    // 목록은 내 일만(최근 차례)
    const list = obj(resultOf(await trpcQuery(app, "balanceAnalysis.list", undefined, cookie.dev)));
    expect(arr(list.jobs).map((job) => obj(job).id)).toEqual([String(again.id), id]);
    const audits = await rows<{ action: string; after: Record<string, unknown> }>(
      test.db,
      "select action, after from audit_log where action like 'balance_analysis.%' order by id",
    );
    expect(audits.map((row) => row.action)).toEqual(["balance_analysis.start", "balance_analysis.start"]);
    expect(audits[0]?.after).toMatchObject({
      job: id,
      kind: "matrix",
      battles: 4,
      seed: 11,
      builds: ["strong", "quick"],
    });
  });

  it("영향도 판 수 0은 바로 끝나고 2차 스탯·사양만, 예산·홀수 판·형식은 거절", async () => {
    const sensitivity = {
      kind: "sensitivity",
      conditions,
      weights: weights(10, 10),
      sum: 60,
      mode: "shift",
      steps: [-10, 10],
      runs: 0,
      seed: 1,
    };
    const started = obj(resultOf(await trpcMutation(app, "balanceAnalysis.start", sensitivity, cookie.dev)));
    expect(started.state).toBe("done");
    const status = await finished(String(started.id));
    const result = obj(status.result);
    expect(arr(result.points)).toHaveLength(12);
    expect(result.control).toBeNull();
    expect(arr(result.rows)).toContain("hp");

    const budget = await trpcMutation(
      app,
      "balanceAnalysis.start",
      { ...matrix, runs: 400, sums: [60, 120, 300, 600], conditions: { ...conditions, limitSec: 600 } },
      cookie.dev,
    );
    expect(budget.statusCode).toBe(400);
    expect(errorOf(budget).reason).toBe("budget");
    const odd = await trpcMutation(app, "balanceAnalysis.start", { ...matrix, runs: 3 }, cookie.dev);
    expect(errorOf(odd).reason).toBe("invalid_settings");
    const shape = await trpcMutation(app, "balanceAnalysis.start", { ...matrix, builds: [] }, cookie.dev);
    expect(shape.statusCode).toBe(400);
  });

  it("취소: 끝난 일은 그대로, 모르는 ID 형식은 400", async () => {
    const started = obj(resultOf(await trpcMutation(app, "balanceAnalysis.start", matrix, cookie.dev)));
    await finished(String(started.id));
    const cancelled = obj(
      resultOf(await trpcMutation(app, "balanceAnalysis.cancel", { id: String(started.id) }, cookie.dev)),
    );
    expect(cancelled.state).toBe("done");
    expect((await trpcMutation(app, "balanceAnalysis.cancel", { id: "nope" }, cookie.dev)).statusCode).toBe(
      400,
    );
  });
});
