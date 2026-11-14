// 전투 보고서 tRPC DB 통합 시험 — docs/adr/2026-11-14-battle-report.md.
// 권한(player 403·로그인 안 함 401), 시작 → 진행 → 저장(battle_reports 줄·팩 판·SIM·설정 판) → 목록(이름·날짜 거름) → 열기 → 한 대 풀이,
// 감사 기록, 세계 새로 시작 남길 표. TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
import { type LabParty, newLabUnit } from "@terra/shared/battleLab";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.ts";
import { createAuth } from "../auth/auth.ts";
import { WORLD_RESET_KEEP } from "../cli/resetWorld.ts";
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
import { REPORT_AUDIT } from "./services.ts";

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

const party = (level: number): LabParty => ({
  units: [0, 1].map(() => ({
    ...newLabUnit("human"),
    level,
    weapon: { kind: "item" as const, id: "test_sword", pm: 500 },
  })),
  retreatHpPct: 0,
});

describe.skipIf(!TEST_DATABASE_URL)("전투 보고서 (DB)", () => {
  let test: TestDatabase;
  let app: FastifyInstance;
  let state: TuningState;
  const cookie: { player?: string; dev?: string } = {};
  const loaded = loadServerContent(DEFAULT_CONTENT_DIR);
  if (!loaded.ok) throw new Error(loaded.lines.join("\n"));

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
      battleLab: { unitKindNames: unitKindNamesOf(loaded.source) },
    });
    await app.ready();
    const auth = createAuth({ db: test.db, settings: TEST_SETTINGS });
    cookie.player = sessionCookie(
      await enter(app, { id: "Fake_RepPlayer", password: PASSWORD, create: true, passwordConfirm: PASSWORD }),
    );
    await executeCommand(
      parseCliArgs(["create-user", "--id", "Fake_RepDev", "--roles", "player,dev"]),
      { TIC_ACTOR: "test:battle-report", TIC_PASSWORD: PASSWORD },
      { db: test.db, auth },
      { out: () => {}, err: () => {} },
    );
    cookie.dev = sessionCookie(await enter(app, { id: "Fake_RepDev", password: PASSWORD }));
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await test?.drop();
  });

  it("세계 새로 시작은 기록 표를 남긴다", () => {
    expect(Object.keys(WORLD_RESET_KEEP)).toContain("battle_reports");
  });

  it("player는 FORBIDDEN, 로그인 안 함은 UNAUTHORIZED", async () => {
    expect((await trpcQuery(app, "battleReport.list", {}, cookie.player)).statusCode).toBe(403);
    expect((await trpcQuery(app, "battleReport.list", {})).statusCode).toBe(401);
    expect((await trpcMutation(app, "battleReport.start", {}, cookie.player)).statusCode).toBe(403);
  });

  it("시작 → 진행 → 저장 → 목록(이름·날짜 거름) → 열기 → 한 대 풀이, 감사 기록", async () => {
    const input = {
      name: "Fake 2v2 sword",
      note: "시험",
      setup: { mode: "arena", a: party(10), b: party(11), terrain: "flat", limitSec: 60 },
      variant: null,
      runs: 4,
      seed: 3,
    };
    const started = await trpcMutation(app, "battleReport.start", input, cookie.dev);
    expect(started.statusCode).toBe(200);
    const id = obj(resultOf(started)).id;
    let status: Record<string, unknown> = {};
    for (let i = 0; i < 400; i++) {
      status = obj(resultOf(await trpcQuery(app, "battleReport.status", { id }, cookie.dev)));
      if (obj(status.job).state !== "running") break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const job = obj(status.job);
    expect(job.state).toBe("done");
    const reportId = String(job.reportId);
    expect(reportId).toMatch(/^rep_[0-9a-f]{12}$/);
    const stored = await rows(
      test.db,
      "select name, mode, runs, seed, content_version, content_hash, sim_version, tuning_revision from battle_reports where id = $1",
      [reportId],
    );
    expect(stored[0]).toMatchObject({
      name: "Fake 2v2 sword",
      mode: "arena",
      runs: 4,
      seed: 3,
      content_version: loaded.content.version,
      content_hash: loaded.content.hash,
    });
    expect(Number(stored[0]?.sim_version)).toBeGreaterThan(0);
    // 목록: 이름 거름·날짜 거름
    const list = obj(resultOf(await trpcQuery(app, "battleReport.list", { name: "2v2" }, cookie.dev)));
    expect(arr(list.reports).map((entry) => obj(entry).id)).toEqual([reportId]);
    const none = obj(resultOf(await trpcQuery(app, "battleReport.list", { name: "없는 이름" }, cookie.dev)));
    expect(arr(none.reports)).toHaveLength(0);
    const future = obj(
      resultOf(await trpcQuery(app, "battleReport.list", { fromMs: Date.now() + 60_000 }, cookie.dev)),
    );
    expect(arr(future.reports)).toHaveLength(0);
    // 열기: 설정 그대로·결과
    const record = obj(resultOf(await trpcQuery(app, "battleReport.get", { id: reportId }, cookie.dev)));
    expect(obj(record.input).seed).toBe(3);
    expect(obj(obj(obj(record.report).a).outcome).runs).toBe(4);
    // 한 대 풀이(같은 설정 판 → same)
    const trace = obj(
      resultOf(await trpcMutation(app, "battleReport.trace", { reportId, which: "a", run: 0 }, cookie.dev)),
    );
    expect(trace.same).toBe(true);
    expect(arr(trace.hits).length).toBeGreaterThan(0);
    const missing = await trpcQuery(app, "battleReport.get", { id: "rep_000000000000" }, cookie.dev);
    expect(missing.statusCode).toBe(404);
    const audits = await rows(
      test.db,
      "select action from audit_log where action like 'battle_report.%'",
      [],
    );
    expect(audits.map((row) => row.action)).toContain(REPORT_AUDIT.start);
  }, 120_000);
});
