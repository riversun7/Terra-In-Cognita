// 전투 다시보기 tRPC DB 통합 시험 — docs/adr/2026-11-01-battle-replay.md 5절. 권한(로그인 안 함 401·player 403), dev는 리플레이를 받는다,
// 틀린 시드는 400. TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
import { decodeBattleReplay, replayFromBase64 } from "@terra/protocol/battleReplay";
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
  sessionCookie,
  trpcQuery,
} from "../testDb.ts";
import { createTuningState } from "../tuning/state.ts";
import { statRowsOf, tuningEntriesOf } from "../world/combatCatalog.ts";

const PASSWORD = "fake pass phrase 8";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const obj = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});
const resultOf = (res: LightMyRequestResponse): unknown => obj(obj(res.json()).result).data;

describe.skipIf(!TEST_DATABASE_URL)("전투 다시보기 (DB)", () => {
  let test: TestDatabase;
  let app: FastifyInstance;
  const cookie: { player?: string; dev?: string } = {};
  const loaded = loadServerContent(DEFAULT_CONTENT_DIR);
  if (!loaded.ok) throw new Error(loaded.lines.join("\n"));

  beforeAll(async () => {
    test = await createTestDatabase();
    const state = createTuningState(tuningEntriesOf(loaded.source), statRowsOf(loaded.source));
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
      tuning: { state, packId: "core" },
      battleReplay: { runner: { kind: "inline" } },
    });
    await app.ready();
    const auth = createAuth({ db: test.db, settings: TEST_SETTINGS });
    cookie.player = sessionCookie(
      await enter(app, {
        id: "Fake_ReplayPlayer",
        password: PASSWORD,
        create: true,
        passwordConfirm: PASSWORD,
      }),
    );
    await executeCommand(
      parseCliArgs(["create-user", "--id", "Fake_ReplayDev", "--roles", "player,dev"]),
      { TIC_ACTOR: "test:battle-replay", TIC_PASSWORD: PASSWORD },
      { db: test.db, auth },
      { out: () => {}, err: () => {} },
    );
    cookie.dev = sessionCookie(await enter(app, { id: "Fake_ReplayDev", password: PASSWORD }));
  });

  afterAll(async () => {
    await app?.close();
    await test?.drop();
  });

  it("로그인 안 함은 401, player는 403, dev는 시범 리플레이를 받는다(월드 없음 = 빈 평지)", async () => {
    expect((await trpcQuery(app, "battleReplay.demo", { seed: 1 })).statusCode).toBe(401);
    expect((await trpcQuery(app, "battleReplay.demo", { seed: 1 }, cookie.player)).statusCode).toBe(403);
    const res = await trpcQuery(app, "battleReplay.demo", { seed: 1 }, cookie.dev);
    expect(res.statusCode).toBe(200);
    const data = obj(resultOf(res));
    expect(data.arena).toBe("plain");
    expect(typeof data.replay).toBe("string");
    const replay = decodeBattleReplay(replayFromBase64(String(data.replay)));
    expect(replay.units).toHaveLength(12);
    expect(replay.arena.ref).toBeNull();
    expect(data.bytes).toBe(replayFromBase64(String(data.replay)).length);
  });

  it("틀린 시드는 BAD_REQUEST", async () => {
    expect((await trpcQuery(app, "battleReplay.demo", { seed: -1 }, cookie.dev)).statusCode).toBe(400);
    expect((await trpcQuery(app, "battleReplay.demo", { seed: 1.5 }, cookie.dev)).statusCode).toBe(400);
  });
});
