// 전투 실험실 tRPC DB 통합 시험 — docs/adr/2026-11-01-balance-screen.md "바뀜 (2026-11-01, 전투 실험실)".
// 권한(player 403·로그인 안 함 401), 목록·미리 보기(성장률 N5를 D1로 덮어쓰면 다음 요청부터 듦), 팀 프리셋 만들기·이름 바꾸기·복제·
// 지우기(줄 판 충돌·샘플은 읽기 전용·감사 기록), 한 판·몬테카를로(같은 스레드). TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
import { type LabUnit, newLabUnit } from "@terra/shared/battleLab";
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
import { LAB_PRESET_AUDIT } from "./presets.ts";

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

const warrior = (): LabUnit => ({
  ...newLabUnit("human"),
  level: 30,
  weapon: { kind: "item", id: "test_sword", pm: 500 },
});

describe.skipIf(!TEST_DATABASE_URL)("전투 실험실 (DB)", () => {
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
      battleLab: {
        unitKindNames: unitKindNamesOf(loaded.source),
        limits: { battlesPerUser: { capacity: 100, refillPerMinute: 100 } },
      },
    });
    await app.ready();
    const auth = createAuth({ db: test.db, settings: TEST_SETTINGS });
    cookie.player = sessionCookie(
      await enter(app, { id: "Fake_LabPlayer", password: PASSWORD, create: true, passwordConfirm: PASSWORD }),
    );
    await executeCommand(
      parseCliArgs(["create-user", "--id", "Fake_LabDev", "--roles", "player,dev"]),
      { TIC_ACTOR: "test:battle-lab", TIC_PASSWORD: PASSWORD },
      { db: test.db, auth },
      { out: () => {}, err: () => {} },
    );
    cookie.dev = sessionCookie(await enter(app, { id: "Fake_LabDev", password: PASSWORD }));
  });

  afterAll(async () => {
    await app?.close();
    await test?.drop();
  });

  it("player는 FORBIDDEN, 로그인 안 함은 UNAUTHORIZED, dev는 목록(팩 이름·성장 실효 값·지형)을 본다", async () => {
    expect((await trpcQuery(app, "battleLab.catalog", undefined, cookie.player)).statusCode).toBe(403);
    expect((await trpcQuery(app, "battleLab.catalog", undefined)).statusCode).toBe(401);
    expect((await trpcMutation(app, "battleLab.savePreset", {}, cookie.player)).statusCode).toBe(403);
    const catalog = obj(resultOf(await trpcQuery(app, "battleLab.catalog", undefined, cookie.dev)));
    const kinds = arr(catalog.unitKinds).map((kind) => obj(kind));
    expect(kinds.map((kind) => kind.id)).toEqual(["cyborg", "human", "android", "creature", "guardian"]);
    expect(obj(kinds[0]?.name).ko).toBe("사이보그");
    expect(obj(catalog.growth)).toMatchObject({ growthPm: 100, maxLevel: 50 });
    expect(arr(catalog.terrains).map((terrain) => obj(terrain).id)).toEqual(["flat", "test"]);
    expect(catalog.replay).toBe(true);
    expect(arr(catalog.weapons).map((weapon) => obj(weapon).id)).toEqual(
      expect.arrayContaining(["test_sword", "test_staff", "fire_staff", "light_staff"]),
    );
  });

  it("미리 보기: 성장률(N5)을 D1로 덮어쓰면 다음 요청부터 레벨 성장이 바뀐다. 모르는 종류는 invalid_unit", async () => {
    const before = obj(resultOf(await trpcQuery(app, "battleLab.preview", warrior(), cookie.dev)));
    const strBefore = obj(obj(before.primaries).str).grown;
    expect(strBefore).toBe(39);
    expect(arr(before.levels)).toHaveLength(50);
    const list = obj(resultOf(await trpcQuery(app, "tuning.list", undefined, cookie.dev)));
    const saved = await trpcMutation(
      app,
      "tuning.save",
      { expectedRevision: list.revision, changes: [{ id: "n5_growth_rate", value: 200 }] },
      cookie.dev,
    );
    expect(saved.statusCode).toBe(200);
    const after = obj(resultOf(await trpcQuery(app, "battleLab.preview", warrior(), cookie.dev)));
    expect(obj(obj(after.primaries).str).grown).toBe(68);
    const revert = obj(resultOf(await trpcQuery(app, "tuning.list", undefined, cookie.dev)));
    await trpcMutation(app, "tuning.revertAll", { expectedRevision: revert.revision }, cookie.dev);
    const bad = await trpcQuery(app, "battleLab.preview", newLabUnit("dragon"), cookie.dev);
    expect(errorOf(bad)).toEqual({ code: "BAD_REQUEST", reason: "invalid_unit" });
  });

  it("프리셋: 샘플 + 팀. 만들기·이름 바꾸기(줄 판)·복제·지우기, 늦은 판은 충돌, 샘플은 읽기 전용, 감사 기록", async () => {
    const first = obj(resultOf(await trpcQuery(app, "battleLab.presets", undefined, cookie.dev)));
    expect(first.writable).toBe(true);
    const samples = arr(first.presets).filter((preset) => obj(preset).source === "sample");
    expect(samples.length).toBeGreaterThanOrEqual(7);

    const created = await trpcMutation(
      app,
      "battleLab.savePreset",
      { kind: "unit", name: { ko: "시험 전사", en: "Test warrior" }, data: warrior() },
      cookie.dev,
    );
    expect(created.statusCode).toBe(200);
    const team = () =>
      arr(obj(resultOf(created)).presets)
        .map((preset) => obj(preset))
        .filter((preset) => preset.source === "team");
    const mine = team()[0];
    expect(mine).toMatchObject({ kind: "unit", version: 1, name: { ko: "시험 전사", en: "Test warrior" } });
    expect(String(mine?.id)).toMatch(/^lab_[0-9a-f]{12}$/);

    const renamed = await trpcMutation(
      app,
      "battleLab.savePreset",
      {
        id: mine?.id,
        expectedVersion: 1,
        kind: "unit",
        name: { ko: "전사 2", en: "Warrior 2" },
        data: warrior(),
      },
      cookie.dev,
    );
    expect(renamed.statusCode).toBe(200);
    const stale = await trpcMutation(
      app,
      "battleLab.savePreset",
      { id: mine?.id, expectedVersion: 1, kind: "unit", name: { ko: "늦음", en: "Late" }, data: warrior() },
      cookie.dev,
    );
    expect(errorOf(stale)).toEqual({ code: "CONFLICT", reason: "preset_conflict" });

    const party = await trpcMutation(
      app,
      "battleLab.savePreset",
      {
        kind: "party",
        name: { ko: "시험 파티", en: "Test party" },
        data: { units: [warrior(), { ...warrior(), row: "back" }], retreatHpPct: 20 },
      },
      cookie.dev,
    );
    expect(party.statusCode).toBe(200);

    const sampleDelete = await trpcMutation(
      app,
      "battleLab.deletePreset",
      { id: "sample_new_cyborg", expectedVersion: 0 },
      cookie.dev,
    );
    expect(errorOf(sampleDelete)).toEqual({ code: "BAD_REQUEST", reason: "sample_read_only" });
    const removed = await trpcMutation(
      app,
      "battleLab.deletePreset",
      { id: mine?.id, expectedVersion: 2 },
      cookie.dev,
    );
    expect(removed.statusCode).toBe(200);
    const left = arr(obj(resultOf(removed)).presets)
      .map((preset) => obj(preset))
      .filter((preset) => preset.source === "team");
    expect(left.map((preset) => preset.kind)).toEqual(["party"]);

    // 맞지 않는 줄(손으로 고친 jsonb)은 목록에서 빼고 센다
    await rows(test.db, "update battle_lab_presets set data = '{\"units\": []}'::jsonb");
    const broken = obj(resultOf(await trpcQuery(app, "battleLab.presets", undefined, cookie.dev)));
    expect(broken.invalid).toBe(1);

    const audits = await rows<{ action: string }>(
      test.db,
      "select action from audit_log where action like 'battle_lab_preset.%' order by id",
    );
    expect(audits.map((row) => row.action)).toEqual([
      LAB_PRESET_AUDIT.save,
      LAB_PRESET_AUDIT.save,
      LAB_PRESET_AUDIT.save,
      LAB_PRESET_AUDIT.delete,
    ]);
  });

  it("한 판(같은 스레드): 사건 기록·유닛 요약. 몬테카를로 프로시저는 지웠다(D-543 1382 가). 모르는 지형은 unknown_terrain", async () => {
    const input = {
      a: { units: [warrior(), { ...warrior(), row: "back" }], retreatHpPct: 0 },
      b: { units: [{ ...newLabUnit("creature"), level: 10 }], retreatHpPct: 0 },
      terrain: "flat",
      limitSec: 60,
      seed: 3,
    };
    const battle = obj(resultOf(await trpcMutation(app, "battleLab.battle", input, cookie.dev)));
    expect(battle.winner).toBe("a");
    expect(arr(battle.units)).toHaveLength(3);
    expect(arr(battle.events).length).toBeGreaterThan(0);
    // 지운 몬테카를로(D-543 1382 가 — 전투 보고서가 대신한다)는 없는 프로시저다
    expect((await trpcMutation(app, "battleLab.monteCarlo", { ...input, runs: 4 }, cookie.dev)).statusCode).toBe(404);
    const terrainTest = await trpcMutation(
      app,
      "battleLab.battle",
      { ...input, terrain: "test" },
      cookie.dev,
    );
    expect(terrainTest.statusCode).toBe(200);
    // 3D 관람: 같은 입력의 한 판을 리플레이(base64)로. 같은 시드면 한 판과 같은 전투라 끝 시각이 같다
    const replay = obj(resultOf(await trpcMutation(app, "battleLab.replay", input, cookie.dev)));
    expect(typeof replay.replay).toBe("string");
    expect(Number(replay.events)).toBeGreaterThan(0);
    expect(replay.endMs).toBe(battle.endMs);
    const unknown = await trpcMutation(
      app,
      "battleLab.battle",
      { ...input, terrain: "preset_moon" },
      cookie.dev,
    );
    expect(errorOf(unknown)).toEqual({ code: "BAD_REQUEST", reason: "unknown_terrain" });
  });
});
