// 계산식 탭 tRPC DB 통합 시험 — docs/adr/2026-11-01-formula-editor.md "저장·바로 듦"·"꼬임 점검".
// 권한(player 403), formulas.list(칸·무기·표본), tuning.save의 formulas(오타 거절·저장·판·감사 기록·바로 듦·최근 바꿈·내보내기),
// 모두 되돌리기, 다시 켤 때 고르기(팩 이김·읽히지 않는 식 지움, 시작을 막지 않음). TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
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
import { formulaEntriesOf, statRowsOf, tuningEntriesOf } from "../world/combatCatalog.ts";

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
const slotOf = (list: unknown, key: string) =>
  obj(arr(obj(list).slots).find((slot) => obj(slot).key === key));

describe.skipIf(!TEST_DATABASE_URL)("계산식 탭 (DB)", () => {
  let test: TestDatabase;
  let app: FastifyInstance;
  let state: TuningState;
  const cookie: { player?: string; dev?: string } = {};
  const loaded = loadServerContent(DEFAULT_CONTENT_DIR);
  if (!loaded.ok) throw new Error(loaded.lines.join("\n"));

  const start = async () => {
    state = createTuningState(
      tuningEntriesOf(loaded.source),
      statRowsOf(loaded.source),
      formulaEntriesOf(loaded.source),
    );
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
    });
    await built.ready();
    return built;
  };
  const list = (who: "player" | "dev") => trpcQuery(app, "formulas.list", undefined, cookie[who]);
  const revisionNow = async (): Promise<number> => {
    const value = obj(resultOf(await list("dev"))).revision;
    if (typeof value !== "number") throw new Error("no revision");
    return value;
  };
  const save = async (formulas: readonly { id: string; source: string | null }[], note?: string) =>
    trpcMutation(
      app,
      "tuning.save",
      { expectedRevision: await revisionNow(), changes: [], formulas, ...(note ? { note } : {}) },
      cookie.dev,
    );
  const audits = (action: string) =>
    rows<{ before: unknown; after: unknown }>(
      test.db,
      "select before, after from audit_log where action = $1 order by id",
      [action],
    );

  beforeAll(async () => {
    test = await createTestDatabase();
    app = await start();
    const auth = createAuth({ db: test.db, settings: TEST_SETTINGS });
    cookie.player = sessionCookie(
      await enter(app, {
        id: "Fake_FormulaPlayer",
        password: PASSWORD,
        create: true,
        passwordConfirm: PASSWORD,
      }),
    );
    await executeCommand(
      parseCliArgs(["create-user", "--id", "Fake_FormulaDev", "--roles", "player,dev"]),
      { TIC_ACTOR: "test:formulas", TIC_PASSWORD: PASSWORD },
      { db: test.db, auth },
      { out: () => {}, err: () => {} },
    );
    cookie.dev = sessionCookie(await enter(app, { id: "Fake_FormulaDev", password: PASSWORD }));
  });

  afterAll(async () => {
    await app?.close();
    await test?.drop();
  });

  it("player는 FORBIDDEN, dev는 칸 28개(켜진 행 식 17 + 전투 식 11)·무기(맨손 포함)·표본 둘", async () => {
    expect((await list("player")).statusCode).toBe(403);
    const res = await list("dev");
    expect(res.statusCode, res.body).toBe(200);
    const body = obj(resultOf(res));
    expect(arr(body.slots)).toHaveLength(28);
    expect(slotOf(body, "hp.formula")).toMatchObject({ group: "stat", generated: true, override: null });
    expect(slotOf(body, "bare_appropriate")).toMatchObject({ group: "combat", generated: false });
    // 적정 STA 레벨 식·실제 회복(D-511), 화면 계수에 적정 STA 설정 칸은 없다
    expect(slotOf(body, "stamina_appropriate")).toMatchObject({ group: "combat", generated: false });
    expect(slotOf(body, "real_stamina_regen")).toMatchObject({ group: "combat", generated: false });
    expect(obj(body.coefficients).staminaAppropriate).toBeUndefined();
    const weapons = arr(body.weapons).map(obj);
    // 맨손(D-502): 무기 몫 0, 적정은 레벨 식(빈 적정)
    expect(weapons.find((weapon) => weapon.id === "natural_human")).toMatchObject({
      unarmed: true,
      attack: 0,
      appropriate: {},
    });
    expect(weapons.find((weapon) => weapon.id === "natural_creature")).toMatchObject({
      unarmed: false,
      attack: 12,
      appropriate: { str: 15, dex: 12, agi: 12 },
    });
    expect(weapons.some((weapon) => weapon.id === "test_sword")).toBe(true);
    expect(arr(body.samples).map((sample) => obj(sample).id)).toEqual(["new_lv1", "even_lv30"]);
    expect(obj(body.coefficients).capPm).toBe(1000);
  });

  it("오타가 든 식은 묶음 전체를 받지 않는다(invalid_formula, data.details = 코드@위치)", async () => {
    const before = await revisionNow();
    const res = await save([{ id: "hp.formula", source: "VIT * 3 + STRR" }]);
    expect(res.statusCode).toBe(400);
    expect(errorOf(res)).toEqual({
      code: "BAD_REQUEST",
      reason: "invalid_formula",
      details: ["unknown_name@10"],
    });
    expect(await revisionNow()).toBe(before);
  });

  it("저장: 판 +1, 바로 듦(목록·사이보그 표), 감사 기록·최근 바꿈·내보내기에 식", async () => {
    const before = await revisionNow();
    const hp = "VIT * 10 + STR + DEX + AGI + INT + WIS";
    const res = await save([{ id: "hp.formula", source: hp }], "식 시험");
    expect(res.statusCode, res.body).toBe(200);
    const body = obj(resultOf(await list("dev")));
    expect(body.revision).toBe(before + 1);
    expect(slotOf(body, "hp.formula")).toMatchObject({ source: hp, generated: false });
    expect(obj(slotOf(body, "hp.formula").override)).toMatchObject({ source: hp, note: "식 시험" });
    expect(state.statTable().find((row) => row.id === "hp")?.formula?.source).toBe(hp);
    const applied = await audits(TUNING_AUDIT_ACTIONS.apply);
    expect(obj(applied.at(-1)?.before).formulas).toEqual([{ id: "hp.formula", source: null }]);
    expect(arr(obj(applied.at(-1)?.after).formulas)).toEqual([
      { id: "hp.formula", source: hp, packSource: expect.stringContaining("VIT * 3") },
    ]);
    const history = obj(resultOf(await trpcQuery(app, "tuning.history", undefined, cookie.dev)));
    expect(obj(arr(history.rows)[0]).formulas).toEqual([
      { id: "hp.formula", before: null, after: hp, reason: null },
    ]);
    const exported = tuningDiffSchema.parse(
      obj(resultOf(await trpcQuery(app, "tuning.export", undefined, cookie.dev))).diff,
    );
    expect(exported.formulas).toEqual([
      { id: "hp.formula", from: expect.stringContaining("VIT * 3"), to: hp },
    ]);
  });

  it("모두 되돌리기는 식 덮어쓰기도 지운다", async () => {
    const res = await trpcMutation(
      app,
      "tuning.revertAll",
      { expectedRevision: await revisionNow() },
      cookie.dev,
    );
    expect(res.statusCode, res.body).toBe(200);
    expect(slotOf(resultOf(await list("dev")), "hp.formula")).toMatchObject({
      override: null,
      generated: true,
    });
    expect(await rows(test.db, "select id from formula_overrides")).toEqual([]);
  });

  it("다시 켜면: 팩 식이 바뀐 줄은 팩이 이기고, 읽히지 않는 줄은 지우고 기록한다(시작을 막지 않는다)", async () => {
    const attack = state.formulaSlot("real_attack")?.packSource ?? "";
    await rows(
      test.db,
      `insert into formula_overrides (id, source, pack_source, content_version) values
        ('real_attack', $1, $2, 'core@21'),
        ('real_hit', 'W * 2', '옛 팩 식', 'core@20'),
        ('real_crit', 'W + NOPE', $3, 'core@21')`,
      [`2 * ${attack}`, attack, state.formulaSlot("real_crit")?.packSource ?? ""],
    );
    await app.close();
    app = await start();
    const body = obj(resultOf(await list("dev")));
    expect(obj(slotOf(body, "real_attack").override).source).toBe(`2 * ${attack}`);
    expect(slotOf(body, "real_hit").override).toBeNull();
    expect(slotOf(body, "real_crit").override).toBeNull();
    const packWon = await audits(TUNING_AUDIT_ACTIONS.pack_won);
    expect(obj(packWon.at(-1)?.before).formulas).toEqual([
      { id: "real_hit", source: "W * 2", packSource: "옛 팩 식" },
    ]);
    const dropped = await audits(TUNING_AUDIT_ACTIONS.dropped);
    expect(obj(dropped.at(-1)?.before).formulas).toEqual([
      { id: "real_crit", source: "W + NOPE", reason: "invalid_formula" },
    ]);
    expect(await rows(test.db, "select id from formula_overrides order by id")).toEqual([
      { id: "real_attack" },
    ]);
  });
});
