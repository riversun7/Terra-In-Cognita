// 기준 유닛 프리셋 tRPC DB 통합 시험 — docs/adr/2026-11-01-balance-screen.md "바뀜 (D-467)".
// 권한(player 403), 팩 씨앗 + 화면에서 만든 것·고친 것(팀이 함께 봄: 다른 dev에게도 보임), 줄 판 충돌, 지우기·팩 값으로 되돌리기,
// 값 검사(이름·무기·없는 프리셋), 감사 기록, 다시 켤 때 팩이 이긴 줄·맞지 않는 줄을 지움(시작을 막지 않음).
// TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
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
import { balancePresetsOf, statRowsOf, tuningEntriesOf } from "../world/combatCatalog.ts";
import { BALANCE_PRESET_AUDIT } from "./presetStore.ts";

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
const flat = (value: number) => ({ str: value, vit: value, int: value, wis: value, dex: value, agi: value });
const values = (extra: Record<string, unknown> = {}) => ({
  name: { ko: "내 프리셋", en: "My preset" },
  primaries: flat(20),
  weapon: "test_sword",
  count: 2,
  runs: 6,
  limitSec: 60,
  ...extra,
});
/** 목록의 [ID, 출처, 판, 한국어 이름] */
const brief = (list: unknown) =>
  arr(list).map((item) => {
    const preset = obj(item);
    return [preset.id, preset.source, preset.version, obj(preset.name).ko];
  });

describe.skipIf(!TEST_DATABASE_URL)("밸런스 프리셋 (DB)", () => {
  let test: TestDatabase;
  let app: FastifyInstance;
  let state: TuningState;
  const cookie: { player?: string; dev?: string; dev2?: string } = {};
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
      balance: { runner: { kind: "inline" }, presets: balancePresetsOf(loaded.source) },
    });
    await built.ready();
    return built;
  };
  const presets = async (who = cookie.dev) =>
    obj(resultOf(await trpcQuery(app, "balance.table", undefined, who))).presets;
  const save = (input: unknown, who = cookie.dev) => trpcMutation(app, "balance.savePreset", input, who);
  const remove = (input: unknown, who = cookie.dev) => trpcMutation(app, "balance.deletePreset", input, who);
  const makeDev = async (id: string) => {
    const auth = createAuth({ db: test.db, settings: TEST_SETTINGS });
    await executeCommand(
      parseCliArgs(["create-user", "--id", id, "--roles", "player,dev"]),
      { TIC_ACTOR: "test:presets", TIC_PASSWORD: PASSWORD },
      { db: test.db, auth },
      { out: () => {}, err: () => {} },
    );
    return sessionCookie(await enter(app, { id, password: PASSWORD }));
  };

  beforeAll(async () => {
    test = await createTestDatabase();
    app = await start();
    cookie.player = sessionCookie(
      await enter(app, {
        id: "Fake_PresetPlayer",
        password: PASSWORD,
        create: true,
        passwordConfirm: PASSWORD,
      }),
    );
    cookie.dev = await makeDev("Fake_PresetDev");
    cookie.dev2 = await makeDev("Fake_PresetDev2");
  });

  afterAll(async () => {
    await app?.close();
    await test?.drop();
  });

  it("dev는 팩 씨앗 셋을 보고 고칠 수 있다(presetsWritable), player는 쓰기 FORBIDDEN", async () => {
    const table = obj(resultOf(await trpcQuery(app, "balance.table", undefined, cookie.dev)));
    expect(table.presetsWritable).toBe(true);
    expect(brief(table.presets)).toEqual([
      ["new_cyborg", "pack", 0, "새 사이보그"],
      ["lv30_combat", "pack", 0, "Lv 30 전투형"],
      ["lv30_tech", "pack", 0, "Lv 30 기술형"],
    ]);
    expect((await save({ id: null, expectedVersion: 0, values: values() }, cookie.player)).statusCode).toBe(
      403,
    );
    expect((await remove({ id: "new_cyborg", expectedVersion: 0 }, cookie.player)).statusCode).toBe(403);
  });

  it("새로 만들기: 목록 뒤에 dev_ ID로 붙고 다른 dev에게도 보인다(이름 앞뒤 빈칸은 뗀다), 감사 기록", async () => {
    const res = await save({
      id: null,
      expectedVersion: 0,
      values: values({ name: { ko: "  내 프리셋 ", en: "My preset" } }),
    });
    expect(res.statusCode, res.body).toBe(200);
    const list = arr(obj(resultOf(res)).presets);
    const mine = obj(list.at(-1));
    expect(mine).toMatchObject({
      source: "custom",
      version: 1,
      name: { ko: "내 프리셋", en: "My preset" },
      primaries: flat(20),
      weapon: "test_sword",
      count: 2,
      runs: 6,
      limitSec: 60,
      updatedBy: "Fake_PresetDev",
    });
    expect(String(mine.id)).toMatch(/^dev_[0-9a-f]{12}$/);
    expect(brief(await presets(cookie.dev2)).at(-1)).toEqual([mine.id, "custom", 1, "내 프리셋"]);
    const audits = await rows<{ before: unknown; after: unknown }>(
      test.db,
      "select before, after from audit_log where action = $1 order by id",
      [BALANCE_PRESET_AUDIT.save],
    );
    expect(obj(audits.at(-1)?.before)).toEqual({ id: mine.id, version: 0, data: null });
    expect(obj(audits.at(-1)?.after)).toMatchObject({ id: mine.id, version: 1, contentVersion: "core@19" });
  });

  it("팩 프리셋 고치기(이름 바꾸기 포함) → 출처 edited, 같은 판을 본 다른 dev는 충돌, 팩 값 그대로 저장하면 되돌리기", async () => {
    const renamed = values({
      name: { ko: "새 사이보그(맨손 2명)", en: "New cyborg x2" },
      primaries: flat(10),
      weapon: "unarmed",
      count: 2,
      runs: 10,
      limitSec: 120,
    });
    const ok = await save({ id: "new_cyborg", expectedVersion: 0, values: renamed });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(brief(obj(resultOf(ok)).presets)[0]).toEqual(["new_cyborg", "edited", 1, "새 사이보그(맨손 2명)"]);
    // dev2는 판 0을 보고 보냈다 → 충돌, 아무것도 바뀌지 않는다
    const late = await save({ id: "new_cyborg", expectedVersion: 0, values: values() }, cookie.dev2);
    expect(errorOf(late)).toEqual({ code: "CONFLICT", reason: "preset_conflict" });
    expect(brief(await presets())[0]).toEqual(["new_cyborg", "edited", 1, "새 사이보그(맨손 2명)"]);
    const [stored] = await rows<{ pack_entry: unknown }>(
      test.db,
      "select pack_entry from balance_presets where id = 'new_cyborg'",
    );
    expect(obj(stored?.pack_entry)).toMatchObject({ primaries: flat(10), weapon: "unarmed", count: 1 });
    // 팩 값 그대로 저장 = 팩 값으로 되돌리기(줄 지움)
    const back = await save({
      id: "new_cyborg",
      expectedVersion: 1,
      values: values({
        name: { ko: "새 사이보그", en: "New cyborg" },
        primaries: flat(10),
        weapon: "unarmed",
        count: 1,
        runs: 10,
        limitSec: 120,
      }),
    });
    expect(back.statusCode, back.body).toBe(200);
    expect(brief(obj(resultOf(back)).presets)[0]).toEqual(["new_cyborg", "pack", 0, "새 사이보그"]);
    expect(await rows(test.db, "select id from balance_presets where id = 'new_cyborg'")).toEqual([]);
  });

  it("지우기: 화면에서 만든 것은 없어지고, 고친 팩 프리셋은 팩 값으로 돌아간다(팩 프리셋 자체는 남는다)", async () => {
    const edited = await save({ id: "lv30_tech", expectedVersion: 0, values: values({ count: 3 }) });
    expect(edited.statusCode, edited.body).toBe(200);
    const list = arr(obj(resultOf(edited)).presets);
    const custom = obj(list.find((item) => obj(item).source === "custom"));
    expect(errorOf(await remove({ id: custom.id, expectedVersion: 9 }))).toEqual({
      code: "CONFLICT",
      reason: "preset_conflict",
    });
    expect((await remove({ id: custom.id, expectedVersion: 1 })).statusCode).toBe(200);
    const revert = await remove({ id: "lv30_tech", expectedVersion: 1 });
    expect(revert.statusCode, revert.body).toBe(200);
    expect(brief(obj(resultOf(revert)).presets)).toEqual([
      ["new_cyborg", "pack", 0, "새 사이보그"],
      ["lv30_combat", "pack", 0, "Lv 30 전투형"],
      ["lv30_tech", "pack", 0, "Lv 30 기술형"],
    ]);
    // 고치지 않은 팩 프리셋 지우기는 할 일이 없다(그대로)
    expect((await remove({ id: "lv30_combat", expectedVersion: 0 })).statusCode).toBe(200);
    const deletes = await rows(test.db, "select id from audit_log where action = $1", [
      BALANCE_PRESET_AUDIT.delete,
    ]);
    expect(deletes.length).toBeGreaterThanOrEqual(2);
  });

  it("값 검사: 빈 이름·상한 밖(판 수 × 제한)은 invalid_preset, 모르는 무기 unknown_weapon, 없는 프리셋 unknown_preset", async () => {
    const blank = await save({
      id: null,
      expectedVersion: 0,
      values: values({ name: { ko: "  ", en: "x" } }),
    });
    expect(errorOf(blank)).toEqual({ code: "BAD_REQUEST", reason: "invalid_preset" });
    const budget = await save({ id: null, expectedVersion: 0, values: values({ runs: 40, limitSec: 120 }) });
    expect(errorOf(budget)).toEqual({ code: "BAD_REQUEST", reason: "invalid_preset" });
    const weapon = await save({ id: null, expectedVersion: 0, values: values({ weapon: "no_such_axe" }) });
    expect(errorOf(weapon)).toEqual({ code: "BAD_REQUEST", reason: "unknown_weapon" });
    const missing = await save({ id: "no_such_preset", expectedVersion: 0, values: values() });
    expect(errorOf(missing)).toEqual({ code: "BAD_REQUEST", reason: "unknown_preset" });
    expect(errorOf(await remove({ id: "no_such_preset", expectedVersion: 0 }))).toEqual({
      code: "BAD_REQUEST",
      reason: "unknown_preset",
    });
  });

  it("다시 켜면 팩이 이긴 줄(저장 때 팩 항목이 지금과 다름)·맞지 않는 줄(모르는 무기)을 지우고 감사 기록, 시작을 막지 않는다", async () => {
    const data = JSON.stringify(values());
    const oldPack = JSON.stringify({ ...values(), name: { ko: "옛 팩", en: "Old pack" } });
    await rows(
      test.db,
      `insert into balance_presets (id, data, pack_entry, content_version) values
        ('lv30_combat', $1::jsonb, $2::jsonb, 'core@18'),
        ('dev_00000000abcd', $3::jsonb, null, 'core@19'),
        ('dev_00000000beef', $1::jsonb, null, 'core@19')`,
      [data, oldPack, JSON.stringify(values({ weapon: "removed_axe" }))],
    );
    // 읽을 때 이미 쓰지 않는다
    expect(brief(await presets()).map((item) => item[0])).toEqual([
      "new_cyborg",
      "lv30_combat",
      "lv30_tech",
      "dev_00000000beef",
    ]);
    await app.close();
    app = await start();
    expect(await rows(test.db, "select id from balance_presets order by id")).toEqual([
      { id: "dev_00000000beef" },
    ]);
    const won = await rows<{ before: unknown }>(test.db, "select before from audit_log where action = $1", [
      BALANCE_PRESET_AUDIT.packWon,
    ]);
    expect(arr(obj(won[0]?.before).rows).map((row) => obj(row).id)).toEqual(["lv30_combat"]);
    const dropped = await rows<{ before: unknown }>(
      test.db,
      "select before from audit_log where action = $1",
      [BALANCE_PRESET_AUDIT.dropped],
    );
    expect(arr(obj(dropped[0]?.before).rows).map((row) => [obj(row).id, obj(row).reason])).toEqual([
      ["dev_00000000abcd", "unknown_weapon"],
    ]);
    // 켤 때 줄이 정리돼도 화면 목록은 같다
    expect(brief(await presets()).at(-1)).toEqual(["dev_00000000beef", "custom", 1, "내 프리셋"]);
  });
});
