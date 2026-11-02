// 아이템 편집기 tRPC DB 통합 시험 — docs/adr/2026-11-01-item-editor.md 3·4절(WP-1·WP-3).
// 권한(player 403), 목록·항목·검사(코드가 붙은 문제)·미리 보기, 저장하면 다음 요청부터 듦(유닛 화면 전투 자료·밸런스 무기 목록·경제
// 목록·이름), baseHash(같은 항목만 충돌), 은퇴 ID(다시 켜도 남음), 최근 바꿈 요약·그 판 항목, 모르는 분류 줄은 지우지 않고 잠든 줄,
// 잠든 줄 버리기, 묶음 상한. TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
import { tuningDiffSchema } from "@terra/content";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.ts";
import { createAuth } from "../auth/auth.ts";
import { executeCommand, parseCliArgs } from "../cli/commands.ts";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { loadServerContent } from "../content.ts";
import { type ContentEditState, createContentEditState } from "../contentEdit/state.ts";
import { economyCatalogAccessor } from "../economyView/catalog.ts";
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

const rowOf = (body: Record<string, unknown>, id: string) =>
  obj(arr(body.items).find((row) => obj(row).id === id));

describe.skipIf(!TEST_DATABASE_URL)("아이템 편집기 (DB)", () => {
  let test: TestDatabase;
  let app: FastifyInstance;
  let content: ContentEditState;
  let roster: RosterCatalog;
  const cookie: { player?: string; dev?: string } = {};
  const loaded = loadServerContent(DEFAULT_CONTENT_DIR);
  if (!loaded.ok) throw new Error(loaded.lines.join("\n"));

  const start = async () => {
    const tuning = createTuningState(
      tuningEntriesOf(loaded.source),
      statRowsOf(loaded.source),
      formulaEntriesOf(loaded.source),
    );
    content = createContentEditState(loaded.source);
    roster = rosterCatalogOf(
      loaded.source,
      () => tuning.society(),
      () => tuning.statTable(),
      () => content.effective(),
    );
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
      balance: { runner: { kind: "inline" } },
      economyCatalog: economyCatalogAccessor(loaded.pack, loaded.content, () => content.effective().items),
    });
    await built.ready();
    return built;
  };
  const list = async () => obj(resultOf(await trpcQuery(app, "items.list", undefined, cookie.dev)));
  const get = async (id: string) => obj(resultOf(await trpcQuery(app, "items.get", { id }, cookie.dev)));
  const save = async (changes: readonly unknown[], extra: Record<string, unknown> = {}) =>
    trpcMutation(
      app,
      "items.save",
      { expectedRevision: (await list()).revision, changes, ...extra },
      cookie.dev,
    );

  beforeAll(async () => {
    test = await createTestDatabase();
    app = await start();
    const auth = createAuth({ db: test.db, settings: TEST_SETTINGS });
    cookie.player = sessionCookie(
      await enter(app, {
        id: "Fake_ItemPlayer",
        password: PASSWORD,
        create: true,
        passwordConfirm: PASSWORD,
      }),
    );
    await executeCommand(
      parseCliArgs(["create-user", "--id", "Fake_ItemDev", "--roles", "player,dev"]),
      { TIC_ACTOR: "test:items", TIC_PASSWORD: PASSWORD },
      { db: test.db, auth },
      { out: () => {}, err: () => {} },
    );
    cookie.dev = sessionCookie(await enter(app, { id: "Fake_ItemDev", password: PASSWORD }));
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await test?.drop();
  });

  it("플레이어는 볼 수 없고, dev는 목록(요약·분류 자료·고르기 자료)을 본다", async () => {
    expect(errorOf(await trpcQuery(app, "items.list", undefined, cookie.player)).code).toBe("FORBIDDEN");
    const body = await list();
    expect(body.revision).toBe(0);
    expect(rowOf(body, "test_sword")).toMatchObject({
      origin: "pack",
      slot: "weapon",
      market: "auction",
      codeRef: true,
      attack: { physical: 20, elemental: null },
    });
    expect(rowOf(body, "grain")).toMatchObject({ market: "book", storage: "general" });
    expect(arr(body.subcategories).length).toBeGreaterThan(30);
    expect(arr(body.weaponTypes).some((row) => obj(obj(row).entry).id === "quiver")).toBe(true);
    const item = await get("test_sword");
    expect(obj(item.entry).id).toBe("test_sword");
    expect(arr(obj(item.usage).codeRefs).length).toBeGreaterThan(0);
  });

  it("검사는 저장하지 않고 코드가 붙은 문제·권고를 돌려주고, 미리 보기는 실효 자료로 셈한다", async () => {
    const sword = obj((await get("test_sword")).entry);
    const bad = obj(
      resultOf(
        await trpcQuery(
          app,
          "items.check",
          { changes: [{ op: "put", category: "items", entry: { ...sword, weight: -1 }, baseHash: null }] },
          cookie.dev,
        ),
      ),
    );
    expect(bad.ok).toBe(false);
    expect(arr(bad.issues).map((issue) => obj(issue).code)).toContain("entry_changed");
    const check = obj(
      resultOf(
        await trpcQuery(
          app,
          "items.check",
          {
            changes: [
              {
                op: "put",
                category: "items",
                entry: { ...sword, weight: -1 },
                baseHash: rowOf(await list(), "test_sword").hash,
              },
            ],
          },
          cookie.dev,
        ),
      ),
    );
    expect(arr(check.issues).map((issue) => [obj(issue).path, obj(issue).code])).toEqual([
      ["weight", "too_small"],
    ]);
    const preview = obj(resultOf(await trpcQuery(app, "items.preview", { entry: sword }, cookie.dev)));
    expect(obj(preview.weapon).fields).toHaveLength(1);
    expect(content.revision()).toBe(0);
  });

  it("복제한 무기를 켜서 저장하면 다음 요청부터 든다(유닛 화면 전투 자료·밸런스 무기 목록·경제 목록)", async () => {
    const sword = obj((await get("test_sword")).entry);
    const equip = obj(sword.equip);
    const blade = {
      ...sword,
      id: "editor_blade",
      name: { ko: "편집 칼", en: "Editor blade" },
      equip: { ...equip, weapon: { ...obj(equip.weapon), physical: { attack: 33 } } },
    };
    const res = await save([{ op: "put", category: "items", entry: blade, baseHash: null }], {
      note: "시험",
    });
    expect(res.statusCode).toBe(200);
    expect(rowOf(obj(resultOf(res)), "editor_blade")).toMatchObject({ origin: "created" });
    expect(roster.combat.equipment.find((item) => item.id === "editor_blade")?.weapon?.physical?.attack).toBe(
      33,
    );
    expect(roster.names.items.editor_blade).toEqual({ ko: "편집 칼", en: "Editor blade" });
    const table = obj(resultOf(await trpcQuery(app, "balance.table", undefined, cookie.dev)));
    expect(arr(table.weapons).some((weapon) => obj(weapon).id === "editor_blade")).toBe(true);
    const catalog = obj(resultOf(await trpcQuery(app, "economy.catalog", undefined, cookie.dev)));
    expect(arr(catalog.items).find((item) => obj(item).id === "editor_blade")).toMatchObject({
      market: "auction",
    });
    const health = obj((await app.inject({ method: "GET", url: "/health" })).json());
    expect([health.contentOverrides, health.contentRevision]).toEqual([1, 1]);
  });

  it("baseHash: 다른 항목은 판이 달라도 받고, 같은 항목을 낡은 해시로 보내면 entry_changed(키)", async () => {
    const before = await list();
    const rationHash = rowOf(before, "ration").hash;
    const ration = obj((await get("ration")).entry);
    // 다른 사람이 먼저 ration을 바꾼다
    const first = await trpcMutation(
      app,
      "items.save",
      {
        expectedRevision: before.revision,
        changes: [{ op: "put", category: "items", entry: { ...ration, tier: 2 }, baseHash: rationHash }],
      },
      cookie.dev,
    );
    expect(first.statusCode).toBe(200);
    // 낡은 판으로 다른 항목(grain)은 받는다
    const grain = obj((await get("grain")).entry);
    const other = await trpcMutation(
      app,
      "items.save",
      {
        expectedRevision: before.revision,
        changes: [
          {
            op: "put",
            category: "items",
            entry: { ...grain, weight: 1000 },
            baseHash: rowOf(before, "grain").hash,
          },
        ],
      },
      cookie.dev,
    );
    expect(other.statusCode).toBe(200);
    // 같은 항목을 낡은 해시로
    const stale = await trpcMutation(
      app,
      "items.save",
      {
        expectedRevision: before.revision,
        changes: [{ op: "put", category: "items", entry: { ...ration, tier: 3 }, baseHash: rationHash }],
      },
      cookie.dev,
    );
    expect(errorOf(stale)).toMatchObject({
      code: "BAD_REQUEST",
      reason: "entry_changed",
      details: ["items/ration"],
    });
  });

  it("만든 항목을 지우면 은퇴 ID가 되고(다시 켜도 남음), 내보내기에 실리고, 다시 만들지 못한다", async () => {
    const res = await save([
      {
        op: "revert",
        category: "items",
        id: "editor_blade",
        baseHash: rowOf(await list(), "editor_blade").hash,
      },
    ]);
    expect(res.statusCode).toBe(200);
    expect(roster.combat.equipment.some((item) => item.id === "editor_blade")).toBe(false);
    await app.close();
    app = await start();
    const body = await list();
    expect(arr(obj(body.retired).items)).toContain("editor_blade");
    const exported = tuningDiffSchema.parse(
      obj(resultOf(await trpcQuery(app, "tuning.export", undefined, cookie.dev))).diff,
    );
    expect(exported.retiredIds).toEqual([{ category: "items", id: "editor_blade" }]);
    const again = await save([
      {
        op: "put",
        category: "items",
        entry: { ...obj((await get("ration")).entry), id: "editor_blade" },
        baseHash: null,
      },
    ]);
    expect(errorOf(again)).toMatchObject({ reason: "retired_id" });
  });

  it("최근 바꿈은 요약만(항목 통째 없음), 그 판 항목은 줄 ID로 하나만 받는다", async () => {
    const history = obj(resultOf(await trpcQuery(app, "items.history", { id: "ration" }, cookie.dev)));
    const first = obj(arr(history.rows)[0]);
    expect(arr(first.changes)).toEqual([{ category: "items", id: "ration", what: "put" }]);
    expect(JSON.stringify(history)).not.toContain('"tier"');
    const entry = obj(
      resultOf(
        await trpcQuery(
          app,
          "items.historyEntry",
          { auditId: first.auditId, category: "items", id: "ration" },
          cookie.dev,
        ),
      ),
    );
    expect(obj(entry.entry).tier).toBe(2);
  });

  it("이 판이 모르는 분류·더 새 팩의 줄은 지우지 않고 잠든 줄로 보이고, 버리기로 지운다", async () => {
    // 이 판이 아는 분류 7개는 이제 모두 고칠 수 있다(효과 사전 WP-6). 다음 판 앱이 분류 검사 제약을 넓힌 뒤 쓴 줄을
    // 흉내 내려고 이 시험 DB에서만 제약을 뗀다. 효과 줄은 더 새 팩(core@99)에서 저장한 줄이라 newer_pack으로 잠든다
    await test.db.$client.query("alter table content_overrides drop constraint content_overrides_category");
    await test.db.$client.query(
      `insert into content_overrides (category, id, entry, pack_hash, content_version) values ('recipes', 'future_recipe', '{"id":"future_recipe"}', null, 'core@99'), ('effects', 'future_buff', '{"id":"future_buff"}', null, 'core@99')`,
    );
    await app.close();
    app = await start();
    const left = await rows<{ key: string }>(
      test.db,
      "select category || '/' || id as key from content_overrides where content_version = 'core@99' order by 1",
      [],
    );
    expect(left.map((row) => row.key)).toEqual(["effects/future_buff", "recipes/future_recipe"]);
    expect(content.sleepingRows()).toEqual(
      expect.arrayContaining([
        { category: "recipes", id: "future_recipe", reason: "unknown_category", contentVersion: "core@99" },
        { category: "effects", id: "future_buff", reason: "newer_pack", contentVersion: "core@99" },
      ]),
    );
    // 아이템 쪽 잠든 줄: 만든 항목과 같은 ID가 팩에 생긴 줄(다른 내용)
    await test.db.$client.query(
      `insert into content_overrides (category, id, entry, pack_hash, content_version) values ('items', 'timber', $1, null, 'core@24')`,
      [JSON.stringify({ ...obj((await get("timber")).entry), tier: 5 })],
    );
    await app.close();
    app = await start();
    // 아이템 편집기 목록은 그 편집기 분류(아이템·분류 자료·효과)의 잠든 줄만 보인다(모르는 분류는 빠짐)
    const sleeping = arr((await list()).sleeping).map((row) => obj(row));
    expect(sleeping).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "items", id: "timber", reason: "id_collision" }),
        expect.objectContaining({ category: "effects", id: "future_buff", reason: "newer_pack" }),
      ]),
    );
    expect(sleeping).toHaveLength(2);
    const discard = await save([
      { op: "discard_sleeping", category: "items", id: "timber" },
      { op: "discard_sleeping", category: "effects", id: "future_buff" },
    ]);
    expect(discard.statusCode).toBe(200);
    expect(arr((await list()).sleeping)).toEqual([]);
    // 뒤 시험이 모르는 분류 줄을 보지 않게 지운다(제약은 이 시험 DB에서만 뗐다)
    await test.db.$client.query("delete from content_overrides where category = 'recipes'");
  });

  it("효과 사전 줄은 아이템과 같은 묶음으로 고치고 스킬 편집기도 실효 효과를 읽는다. 여러 개 고치기(patch)는 지금 항목에 그 칸만 얹고, 내보내기는 실효 아이템 통째다", async () => {
    // 효과 사전(WP-6): 팩 효과 줄을 고친다(baseHash = 지금 해시)
    const listed = await list();
    const burn = obj(
      arr(listed.effectRows)
        .map(obj)
        .find((row) => obj(row.entry).id === "burn"),
    );
    const edited = { ...obj(burn.entry), durationMs: 4500, name: { ko: "시험 화상", en: "Test burn" } };
    const put = await save([{ op: "put", category: "effects", entry: edited, baseHash: burn.hash }]);
    expect(put.statusCode).toBe(200);
    const after = await list();
    const row = obj(
      arr(after.effectRows)
        .map(obj)
        .find((item) => obj(item.entry).id === "burn"),
    );
    expect([row.origin, obj(row.entry).durationMs]).toEqual(["edited", 4500]);
    expect(arr(obj(obj(after.effectUsage).burn).skills)).toEqual(expect.arrayContaining(["fire_bolt"]));
    const skills = obj(resultOf(await trpcQuery(app, "skills.list", undefined, cookie.dev)));
    const skillEffect = obj(
      arr(skills.effects)
        .map(obj)
        .find((effect) => effect.id === "burn"),
    );
    expect(obj(skillEffect.name).ko).toBe("시험 화상");

    // 여러 개 고치기(WP-7): 티어·기준 가치 ‰만 얹는다(이름 등 다른 칸은 그대로). 기준 가치 = (값 × 1100 + 500) ÷ 1000
    const grainBefore = obj((await get("grain")).entry);
    const timberBefore = obj((await get("timber")).entry);
    const patched = await save([
      { op: "patch", category: "items", ids: ["grain", "timber"], patch: { tier: 3, baseValuePm: 100 } },
    ]);
    expect(patched.statusCode).toBe(200);
    const grain = obj((await get("grain")).entry);
    const timber = obj((await get("timber")).entry);
    expect([grain.tier, grain.baseValue, grain.name]).toEqual([3, 4, grainBefore.name]);
    // 5 × 1.1 = 5.5 → 0.5 올림 6
    expect([timber.tier, timber.baseValue, timber.name]).toEqual([3, 6, timberBefore.name]);
    expect(
      errorOf(await save([{ op: "patch", category: "items", ids: ["no_such_item"], patch: { tier: 1 } }])),
    ).toMatchObject({ reason: "unknown_entry" });

    // 내보내기: 그 세계의 실효 아이템 통째(고친 값 그대로)
    const exported = obj(resultOf(await trpcQuery(app, "items.export", undefined, cookie.dev)));
    const entries = arr(exported.entries).map(obj);
    expect(entries.length).toBe(arr((await list()).items).length);
    expect(obj(entries.find((entry) => entry.id === "timber"))).toMatchObject({ tier: 3, baseValue: 6 });

    // 되돌린다(뒤 시험이 팩 값을 보게)
    const fresh = await list();
    const hashOf = (table: unknown, id: string) =>
      obj(
        arr(table)
          .map(obj)
          .find((item) => (item.entry === undefined ? item.id : obj(item.entry).id) === id),
      ).hash;
    const reverted = await save([
      { op: "revert", category: "effects", id: "burn", baseHash: hashOf(fresh.effectRows, "burn") },
      { op: "revert", category: "items", id: "grain", baseHash: hashOf(fresh.items, "grain") },
      { op: "revert", category: "items", id: "timber", baseHash: hashOf(fresh.items, "timber") },
    ]);
    expect(reverted.statusCode).toBe(200);
  });

  it("묶음 상한(300)을 넘으면 입력 오류다", async () => {
    const ration = obj((await get("ration")).entry);
    const many = Array.from({ length: 301 }, (_, index) => ({
      op: "put",
      category: "items",
      entry: { ...ration, id: `bulk_${index}` },
      baseHash: null,
    }));
    expect(errorOf(await save(many)).code).toBe("BAD_REQUEST");
  });
});
