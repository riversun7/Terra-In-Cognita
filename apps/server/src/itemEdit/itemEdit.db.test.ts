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
      equip: { ...equip, weapon: { ...obj(equip.weapon), physical: { attack: 33, attackAppropriate: 40 } } },
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

  it("이 판이 모르는 분류의 줄은 지우지 않고 잠든 줄로 보이고, 버리기로 지운다", async () => {
    await test.db.$client.query(
      `insert into content_overrides (category, id, entry, pack_hash, content_version) values ('effects', 'future_buff', '{"id":"future_buff"}', null, 'core@99')`,
    );
    await app.close();
    app = await start();
    const left = await rows<{ id: string }>(
      test.db,
      "select id from content_overrides where category = 'effects'",
      [],
    );
    expect(left.map((row) => row.id)).toEqual(["future_buff"]);
    expect(content.sleepingRows()).toEqual(
      expect.arrayContaining([
        { category: "effects", id: "future_buff", reason: "unknown_category", contentVersion: "core@99" },
      ]),
    );
    // 아이템 쪽 잠든 줄: 만든 항목과 같은 ID가 팩에 생긴 줄(다른 내용)
    await test.db.$client.query(
      `insert into content_overrides (category, id, entry, pack_hash, content_version) values ('items', 'timber', $1, null, 'core@24')`,
      [JSON.stringify({ ...obj((await get("timber")).entry), tier: 5 })],
    );
    await app.close();
    app = await start();
    const sleeping = arr((await list()).sleeping).map((row) => obj(row));
    expect(sleeping).toEqual([
      expect.objectContaining({ category: "items", id: "timber", reason: "id_collision" }),
    ]);
    const discard = await save([{ op: "discard_sleeping", category: "items", id: "timber" }]);
    expect(discard.statusCode).toBe(200);
    expect(arr((await list()).sleeping)).toEqual([]);
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
