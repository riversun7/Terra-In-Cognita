// 건물 편집기 tRPC DB 통합 시험 — docs/adr/2026-11-02-building-editor.md.
// 권한(player 403), 목록(시설·레시피·재료 고르기·M14 규칙), 검사(코드가 붙은 문제·꺼진 재료 권고), 저장하면 다음 요청부터 듦(경제 목록·
// 유닛 화면 이름), baseHash(같은 시설만 충돌), 만들기 거절, 되돌리기, 최근 바꿈(시설 줄만), 내보내기(entries의 facilities),
// 다시 켜도 덮어쓰기가 남음. TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
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

const facilityOf = (body: Record<string, unknown>, id: string) =>
  obj(arr(body.facilities).find((row) => obj(obj(row).entry).id === id));

describe.skipIf(!TEST_DATABASE_URL)("건물 편집기 (DB)", () => {
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
      economyCatalog: economyCatalogAccessor(loaded.pack, loaded.content, () => content.effective()),
    });
    await built.ready();
    return built;
  };
  const list = async () => obj(resultOf(await trpcQuery(app, "buildings.list", undefined, cookie.dev)));
  const save = async (changes: readonly unknown[], extra: Record<string, unknown> = {}) =>
    trpcMutation(
      app,
      "buildings.save",
      { expectedRevision: (await list()).revision, changes, ...extra },
      cookie.dev,
    );

  beforeAll(async () => {
    test = await createTestDatabase();
    app = await start();
    const auth = createAuth({ db: test.db, settings: TEST_SETTINGS });
    cookie.player = sessionCookie(
      await enter(app, {
        id: "Fake_BuildPlayer",
        password: PASSWORD,
        create: true,
        passwordConfirm: PASSWORD,
      }),
    );
    await executeCommand(
      parseCliArgs(["create-user", "--id", "Fake_BuildDev", "--roles", "player,dev"]),
      { TIC_ACTOR: "test:buildings", TIC_PASSWORD: PASSWORD },
      { db: test.db, auth },
      { out: () => {}, err: () => {} },
    );
    cookie.dev = sessionCookie(await enter(app, { id: "Fake_BuildDev", password: PASSWORD }));
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await test?.drop();
  });

  it("플레이어는 볼 수 없고, dev는 시설·레시피·재료 고르기·M14 규칙을 본다", async () => {
    expect(errorOf(await trpcQuery(app, "buildings.list", undefined, cookie.player)).code).toBe("FORBIDDEN");
    const body = await list();
    expect(body.revision).toBe(0);
    const mine = facilityOf(body, "mine");
    expect(mine).toMatchObject({ origin: "pack", override: null });
    expect(obj(mine.entry).build).toEqual({
      mulPm: 800,
      levels: [
        {
          from: 1,
          materials: [
            { item: "pine_log", qty: 12 },
            { item: "stone", qty: 10 },
          ],
        },
        {
          from: 2,
          materials: [
            { item: "plank", qty: 12 },
            { item: "brick", qty: 10 },
          ],
        },
      ],
    });
    expect(arr(mine.recipes).map((recipe) => obj(recipe).id)).toEqual(["mine_iron_ore"]);
    // 시설은 늘 켜짐(켬·끔 칸 없음, 팩 core@32)
    expect("enabled" in obj(facilityOf(body, "kiln").entry)).toBe(false);
    expect(arr(facilityOf(body, "kiln").recipes).map((recipe) => obj(recipe).id)).toEqual(["fire_bricks"]);
    expect(obj(arr(body.items).find((item) => obj(item).id === "brick"))).toMatchObject({
      category: "construction",
      weight: 1500,
      lotSize: 1,
      enabled: true,
    });
    expect(body.rules).toEqual({
      msPerKg: 10_000,
      timeFactorPm: [1000, 1500, 2500, 2500, 2500],
    });
    expect(body.gatherLevelBonus).toBe(10);
  });

  it("검사: 구간 오류는 코드가 붙은 문제로, 꺼진 재료는 권고로 보인다(저장하지 않는다)", async () => {
    const body = await list();
    const farm = facilityOf(body, "farm");
    const entry = obj(farm.entry);
    const broken = {
      ...entry,
      build: { mulPm: 800, levels: [{ from: 2, materials: [{ item: "pine_log", qty: 3 }] }] },
    };
    const failed = obj(
      resultOf(
        await trpcQuery(
          app,
          "buildings.check",
          { changes: [{ op: "put", entry: broken, baseHash: farm.hash }] },
          cookie.dev,
        ),
      ),
    );
    expect(failed.ok).toBe(false);
    expect(arr(failed.issues).map((issue) => obj(issue).code)).toEqual(["build_levels_start"]);
    const clean = obj(
      resultOf(
        await trpcQuery(
          app,
          "buildings.check",
          { changes: [{ op: "put", entry: { ...entry, slotsPerLevel: 12 }, baseHash: farm.hash }] },
          cookie.dev,
        ),
      ),
    );
    expect(clean).toEqual({ ok: true, issues: [] });
    // 처음 짓기(Lv1)에 꺼진 아이템(팩에 꺼진 채 남은 형식 확인용 dev_placeholder)을 쓰면 권고(D-508, 저장은 막지 않는다)
    const firstOff = {
      ...entry,
      build: { mulPm: 800, levels: [{ from: 1, materials: [{ item: "dev_placeholder", qty: 2 }] }] },
    };
    const ok = obj(
      resultOf(
        await trpcQuery(
          app,
          "buildings.check",
          { changes: [{ op: "put", entry: firstOff, baseHash: farm.hash }] },
          cookie.dev,
        ),
      ),
    );
    expect(ok.ok).toBe(true);
    expect(arr(ok.issues).map((issue) => [obj(issue).id, obj(issue).code])).toEqual([
      ["farm", "build_material_disabled"],
    ]);
    expect((await list()).revision).toBe(0);
  });

  it("저장하면 다음 요청부터 경제 목록·유닛 이름에 들고, 같은 시설만 충돌하고, 만들기는 받지 않는다", async () => {
    const body = await list();
    const farm = facilityOf(body, "farm");
    const entry = obj(farm.entry);
    const edited = {
      ...entry,
      name: { ko: "큰 농장", en: "Big farm" },
      slotsPerLevel: 12,
      maxLevel: 4,
      build: {
        mulPm: 800,
        levels: [
          { from: 1, materials: [{ item: "pine_log", qty: 6 }] },
          {
            from: 3,
            materials: [
              { item: "plank", qty: 9 },
              { item: "iron_ingot", qty: 2 },
            ],
          },
        ],
      },
    };
    const res = await save([{ op: "put", entry: edited, baseHash: farm.hash }], { note: "농장 재료" });
    expect(res.statusCode).toBe(200);
    const after = obj(resultOf(res));
    expect(after.revision).toBe(1);
    expect(facilityOf(after, "farm")).toMatchObject({ origin: "edited", override: { note: "농장 재료" } });
    expect(obj(facilityOf(after, "farm").entry).build).toEqual(edited.build);
    // 경제 목록(실효 시설)·유닛 화면 이름 표가 바로 든다(D-461)
    const catalog = obj(resultOf(await trpcQuery(app, "economy.catalog", undefined, cookie.dev)));
    expect(obj(arr(catalog.facilities).find((row) => obj(row).id === "farm"))).toMatchObject({
      slotsPerLevel: 12,
      name: { ko: "큰 농장", en: "Big farm" },
    });
    expect(roster.names.facilities.farm).toEqual({ ko: "큰 농장", en: "Big farm" });
    // 낡은 baseHash(고치기 전 해시)로 같은 시설을 다시 보내면 entry_changed
    const stale = await save([{ op: "put", entry: { ...edited, slotsPerLevel: 3 }, baseHash: farm.hash }]);
    expect(errorOf(stale)).toMatchObject({ code: "BAD_REQUEST", reason: "entry_changed" });
    expect(errorOf(stale).details).toEqual(["facilities/farm"]);
    // 다른 시설은 판이 달라도 받는다(baseHash가 맞음)
    const mine = facilityOf(body, "mine");
    const other = await trpcMutation(
      app,
      "buildings.save",
      {
        expectedRevision: 0,
        changes: [{ op: "put", entry: { ...obj(mine.entry), pollution: 7 }, baseHash: mine.hash }],
      },
      cookie.dev,
    );
    expect(other.statusCode).toBe(200);
    // 팩에 없는 ID(만들기)는 받지 않는다
    const created = await save([
      { op: "put", entry: { ...edited, id: "brand_new_hall" }, baseHash: "0".repeat(64) },
    ]);
    expect(errorOf(created)).toMatchObject({ reason: "unknown_entry" });
    // 팩 검사에 걸리는 묶음은 통째로 받지 않는다
    const invalid = await save([
      {
        op: "put",
        entry: {
          ...edited,
          build: { mulPm: 800, levels: [{ from: 1, materials: [{ item: "nope", qty: 1 }] }] },
        },
        baseHash: obj(facilityOf(await list(), "farm")).hash,
      },
    ]);
    expect(errorOf(invalid)).toMatchObject({ reason: "invalid_entry" });
  });

  it("내보내기에 시설 차이가 들고, 최근 바꿈은 시설 줄만, 다시 켜도 남고, 되돌리면 팩 값", async () => {
    const diff = tuningDiffSchema.parse(
      obj(resultOf(await trpcQuery(app, "tuning.export", undefined, cookie.dev))).diff,
    );
    const farmDiff = diff.entries?.find((line) => line.category === "facilities" && line.id === "farm");
    expect(farmDiff?.from).toBe(content.packHash("facilities", "farm"));
    expect(obj(farmDiff?.entry).slotsPerLevel).toBe(12);
    const history = obj(resultOf(await trpcQuery(app, "buildings.history", undefined, cookie.dev)));
    const changed = arr(history.rows).flatMap((row) => arr(obj(row).changes).map((c) => obj(c)));
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.every((change) => change.category === "facilities")).toBe(true);
    // 다시 켜도 덮어쓰기가 남는다(저장 때 팩 해시 = 지금 해시)
    await app.close();
    app = await start();
    const listed = await list();
    expect(obj(facilityOf(listed, "farm").entry).slotsPerLevel).toBe(12);
    const stored = await rows<{ key: string }>(
      test.db,
      "select category || '/' || id as key from content_overrides where category = 'facilities' order by 1",
      [],
    );
    expect(stored.map((row) => row.key)).toEqual(["facilities/farm", "facilities/mine"]);
    // 되돌리기: 팩 값으로
    const farm = facilityOf(listed, "farm");
    const reverted = await save([{ op: "revert", id: "farm", baseHash: farm.hash }]);
    expect(reverted.statusCode).toBe(200);
    expect(facilityOf(obj(resultOf(reverted)), "farm")).toMatchObject({ origin: "pack", override: null });
    expect(roster.names.facilities.farm).toEqual({ ko: "농장", en: "Farm" });
  });

  it("생산 편집기: 여섯 시설·손잡이·전투 클래스가 목록에 있고, 스탯 짝·클래스 이름을 고치면 유닛 추천 표(units.guide)가 바로 바뀐다", async () => {
    const listed = await list();
    const gatherIds = arr(listed.facilities)
      .map((row) => obj(obj(row).entry))
      .filter((entry) => entry.gather !== undefined)
      .map((entry) => entry.id);
    expect(gatherIds).toEqual(["farm", "lumber_camp", "mine", "herb_field", "ranch", "fishing_spot"]);
    expect(obj(listed.gatherRules)).toMatchObject({
      progressDivisor: 20,
      tierProgressBase: 30,
      tierProgressStep: 30,
      tickMs: 60_000,
      defaultStat: 10,
    });
    expect(listed.classRule).toEqual({ threeStatPm: 600, generalistPm: 800 });
    expect(arr(listed.combatClasses)).toHaveLength(36);

    // 유닛 추천 표는 로그인한 누구나 읽는다(플레이어)
    const guide = async () => obj(resultOf(await trpcQuery(app, "units.guide", undefined, cookie.player)));
    const before = await guide();
    expect(arr(before.production).map((row) => obj(row).facility)).toEqual(gatherIds);
    const typeOf = (body: Record<string, unknown>, id: string) =>
      obj(arr(body.production).find((row) => obj(row).facility === id));
    expect(typeOf(before, "fishing_spot")).toMatchObject({
      primary: "agi",
      secondary: "dex",
      mode: "roll",
      group: "building",
    });
    expect(typeOf(before, "herb_field")).toMatchObject({ primary: "int", secondary: "wis", group: "field" });
    expect(arr(before.classes)).toHaveLength(36);

    // 약초원 스탯 짝을 WIS + INT로 뒤집고, 워리어 이름을 고친다
    const herb = facilityOf(listed, "herb_field");
    const warrior = obj(arr(listed.combatClasses).find((row) => obj(obj(row).entry).id === "warrior"));
    const saved = await save([
      {
        op: "put",
        entry: {
          ...obj(herb.entry),
          gather: { ...obj(obj(herb.entry).gather), primary: "wis", secondary: "int" },
        },
        baseHash: herb.hash,
      },
      {
        op: "put_combat_class",
        entry: { ...obj(warrior.entry), name: { ko: "철벽 워리어", en: "Iron Warrior" } },
        baseHash: warrior.hash,
      },
    ]);
    expect(saved.statusCode).toBe(200);
    const after = await guide();
    expect(typeOf(after, "herb_field")).toMatchObject({ primary: "wis", secondary: "int" });
    expect(obj(arr(after.classes).find((row) => obj(row).id === "warrior")).name).toEqual({
      ko: "철벽 워리어",
      en: "Iron Warrior",
    });

    // 같은 조합의 클래스가 둘이 되면 받지 않는다(조합마다 하나)
    const relisted = obj(resultOf(saved));
    const slayer = obj(arr(relisted.combatClasses).find((row) => obj(obj(row).entry).id === "slayer"));
    const clash = await trpcQuery(
      app,
      "buildings.check",
      {
        changes: [
          {
            op: "put_combat_class",
            entry: { ...obj(slayer.entry), stats: ["str", "vit"] },
            baseHash: slayer.hash,
          },
        ],
      },
      cookie.dev,
    );
    const checked = obj(resultOf(clash));
    expect(checked.ok).toBe(false);
    expect(arr(checked.issues).map((issue) => obj(issue).code)).toContain("class_stats_duplicate");
    // 표에 없는 ID는 만들 수 없다
    const created = await save([
      {
        op: "put_combat_class",
        entry: { ...obj(slayer.entry), id: "brand_new_class" },
        baseHash: slayer.hash,
      },
    ]);
    expect(errorOf(created)).toMatchObject({ code: "BAD_REQUEST", reason: "unknown_entry" });

    // 되돌리면 팩 값
    const herbNow = facilityOf(relisted, "herb_field");
    const warriorNow = obj(arr(relisted.combatClasses).find((row) => obj(obj(row).entry).id === "warrior"));
    expect(warriorNow.origin).toBe("edited");
    const reverted = await save([
      { op: "revert", id: "herb_field", baseHash: herbNow.hash },
      { op: "revert_combat_class", id: "warrior", baseHash: warriorNow.hash },
    ]);
    expect(reverted.statusCode).toBe(200);
    expect(typeOf(await guide(), "herb_field")).toMatchObject({ primary: "int", secondary: "wis" });
  });
});
