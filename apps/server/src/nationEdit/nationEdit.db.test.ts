// 시작 국가 설정 편집기 tRPC DB 통합 시험 — docs/adr/2026-11-10-nation-editor.md.
// 권한(player 403), 목록(국가 16·기본값·고르기 창), 검사(약어·화폐 약어 겹침, 스키마), 저장하면 다음 요청부터 듦(실효 프리셋·경제 목록 화폐
// 이름), 만들기·켬끔·화폐 코드 바꾸기 거절, 되돌리기, 최근 바꿈, 내보내기(entries의 nation_presets), 다시 켜도 덮어쓰기가 남음,
// 마크 올리기(서명·크기·바이트·권한, 그림 길 머리글, 지우기), 이 세계에 반영(미리 보기 → 적용, 손으로 고친 줄 건너뜀, 감사 기록).
// TEST_DATABASE_URL이 있을 때만. 계정·그림은 시험용 가짜 값이다.
import { tuningDiffSchema } from "@terra/content";
import { NATION_EMBLEM_UPLOAD } from "@terra/shared/nationEditor";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.ts";
import { createAuth } from "../auth/auth.ts";
import { executeCommand, parseCliArgs } from "../cli/commands.ts";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { loadServerContent } from "../content.ts";
import { type ContentEditState, createContentEditState } from "../contentEdit/state.ts";
import { economyCatalogAccessor } from "../economyView/catalog.ts";
import { createLivePresets, nationPresetsFrom } from "../npc/presets.ts";
import { ensureProfiles, updateFactionProfile } from "../ops/factionProfiles.ts";
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
import { createTuningState } from "../tuning/state.ts";
import { formulaEntriesOf, statRowsOf, tuningEntriesOf } from "../world/combatCatalog.ts";
import { ASSET_CREDIT } from "../world/settlement.ts";
import { makeTestPng } from "./testPng.ts";

const PASSWORD = "fake pass phrase 7";
const RELAXED = {
  readsPerUser: { capacity: 100_000, refillPerMinute: 100_000 },
  writesPerUser: { capacity: 100_000, refillPerMinute: 100_000 },
};
const FIRST = "placeholder_nation_01";
const SECOND = "placeholder_nation_02";

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
const nationOf = (body: Record<string, unknown>, id: string) =>
  obj(arr(body.nations).find((row) => obj(obj(row).entry).id === id));

describe.skipIf(!TEST_DATABASE_URL)("시작 국가 설정 편집기 (DB)", () => {
  let test: TestDatabase;
  let app: FastifyInstance;
  let content: ContentEditState;
  const cookie: { player?: string; dev?: string } = {};
  let devId = "";
  const loaded = loadServerContent(DEFAULT_CONTENT_DIR);
  if (!loaded.ok) throw new Error(loaded.lines.join("\n"));

  const start = async () => {
    const tuning = createTuningState(
      tuningEntriesOf(loaded.source),
      statRowsOf(loaded.source),
      formulaEntriesOf(loaded.source),
    );
    content = createContentEditState(loaded.source);
    const roster = rosterCatalogOf(
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
  const list = async () => obj(resultOf(await trpcQuery(app, "nations.list", undefined, cookie.dev)));
  const save = async (changes: readonly unknown[], extra: Record<string, unknown> = {}) =>
    trpcMutation(
      app,
      "nations.save",
      { expectedRevision: (await list()).revision, changes, ...extra },
      cookie.dev,
    );
  const upload = (png: Uint8Array, who = cookie.dev, id = FIRST) =>
    trpcMutation(app, "nations.uploadEmblem", { id, pngBase64: Buffer.from(png).toString("base64") }, who);
  const audits = (action: string) =>
    rows<{ action: string; before: unknown; after: unknown; meta: unknown }>(
      test.db,
      "select action, before, after, meta from audit_log where action = $1 order by id",
      [action],
    );

  beforeAll(async () => {
    test = await createTestDatabase();
    app = await start();
    const auth = createAuth({ db: test.db, settings: TEST_SETTINGS });
    cookie.player = sessionCookie(
      await enter(app, {
        id: "Fake_NationPlayer",
        password: PASSWORD,
        create: true,
        passwordConfirm: PASSWORD,
      }),
    );
    await executeCommand(
      parseCliArgs(["create-user", "--id", "Fake_NationDev", "--roles", "player,dev"]),
      { TIC_ACTOR: "test:nations", TIC_PASSWORD: PASSWORD },
      { db: test.db, auth },
      { out: () => {}, err: () => {} },
    );
    cookie.dev = sessionCookie(await enter(app, { id: "Fake_NationDev", password: PASSWORD }));
    devId =
      (await rows<{ id: string }>(test.db, "select id from users where username = 'fake_nationdev'"))[0]
        ?.id ?? "";
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await test?.drop();
  });

  it("플레이어는 볼 수 없고, dev는 국가 16·세계 씨앗 기본값·고르기 창을 본다", async () => {
    expect(errorOf(await trpcQuery(app, "nations.list", undefined, cookie.player)).code).toBe("FORBIDDEN");
    const body = await list();
    expect(body.revision).toBe(0);
    expect(arr(body.nations)).toHaveLength(16);
    const first = nationOf(body, FIRST);
    expect(first).toMatchObject({ origin: "pack", override: null, uploaded: null, slot: null });
    expect(first.entry).toMatchObject({
      name: { ko: "메리데일", en: "Meridale" },
      shortName: "MRD",
      nameStyle: "prairie",
      emblem: { shape: "shield", division: "chief", charge: "star", scheme: 0 },
      currency: { code: "placeholder_cur_01", symbol: "Ⱥ", ticker: "ALD" },
      enabled: true,
    });
    expect(first.pack).toEqual(first.entry);
    expect(String(first.hash)).toMatch(/^[0-9a-f]{64}$/);
    expect(body.defaults).toMatchObject({
      startCitiesMin: 2,
      startCitiesMax: 8,
      housing: 40,
      populationPm: 750,
      farms: 1,
      storehouses: 1,
      necessityHours: 48,
    });
    expect(arr(body.facilities).some((row) => obj(row).id === "farm")).toBe(true);
    expect(arr(body.recipes).find((row) => obj(row).id === "farm_grain")).toMatchObject({ facility: "farm" });
    expect(arr(body.items).some((row) => obj(row).id === "grain")).toBe(true);
    expect(body.testNations).toBeNull();
  });

  it("검사: 화폐 약어·세력 약어가 다른 국가와 겹치면 코드가 붙은 문제, 범위 밖 씨앗 값은 스키마 문제(저장하지 않는다)", async () => {
    const body = await list();
    const first = nationOf(body, FIRST);
    const entry = obj(first.entry);
    const check = async (next: Record<string, unknown>) =>
      obj(
        resultOf(
          await trpcQuery(
            app,
            "nations.check",
            { changes: [{ op: "put", entry: next, baseHash: first.hash }] },
            cookie.dev,
          ),
        ),
      );
    const ticker = await check({ ...entry, currency: { ...obj(entry.currency), ticker: "BLN" } });
    expect(ticker.ok).toBe(false);
    expect(arr(ticker.issues).map((issue) => obj(issue).code)).toContain("nation_ticker_taken");
    const short = await check({ ...entry, shortName: "ynh" });
    expect(arr(short.issues).map((issue) => obj(issue).code)).toContain("nation_short_taken");
    const range = await check({ ...entry, personality: { ...obj(entry.personality), startFarms: 9 } });
    expect(range.ok).toBe(false);
    expect(obj(arr(range.issues)[0]).path).toBe("personality.startFarms");
    expect(await check({ ...entry, name: { ko: "새 이름", en: "New name" } })).toEqual({
      ok: true,
      issues: [],
    });
    expect((await list()).revision).toBe(0);
  });

  it("저장하면 바로 든다: 실효 프리셋·실효 목록·경제 목록 화폐 이름. 최근 바꿈·내보내기에 실린다", async () => {
    const live = createLivePresets(() => content.effective().nationPresets);
    content.subscribe(() => live.sync());
    const before = await list();
    const first = nationOf(before, FIRST);
    const entry = obj(first.entry);
    const edited = {
      ...entry,
      name: { ko: "레드메사", en: "Redmesa" },
      shortName: "RMS",
      emblem: { shape: "circle", division: "border", charge: "sun", scheme: 1 },
      currency: { ...obj(entry.currency), name: { ko: "메사론", en: "Mesaron" }, ticker: "MSR" },
      personality: { ...obj(entry.personality), startHousing: 60, startPopulationPm: 500, startFarms: 2 },
    };
    const res = await save([{ op: "put", entry: edited, baseHash: first.hash }], { note: "이름 바꿈" });
    expect(res.statusCode).toBe(200);
    const after = obj(resultOf(res));
    expect(after.revision).toBe(1);
    const row = nationOf(after, FIRST);
    expect(row).toMatchObject({ origin: "edited" });
    expect(obj(row.override)).toMatchObject({ note: "이름 바꿈" });
    expect(obj(row.entry).name).toEqual({ ko: "레드메사", en: "Redmesa" });
    expect(obj(row.pack).name).toEqual({ ko: "메리데일", en: "Meridale" });
    // 실효 프리셋(서버가 읽는 값)과 제자리에서 바뀌는 목록
    const effective = nationPresetsFrom(content.effective().nationPresets)[0];
    expect(effective).toMatchObject({
      name: { ko: "레드메사" },
      shortName: "RMS",
      emblem: { shape: "circle", charge: "sun" },
      personality: { startHousing: 60, startPopulationPm: 500, startFarms: 2 },
    });
    expect(live.list[0]?.name.ko).toBe("레드메사");
    // 경제 목록의 나라 화폐 이름
    const catalog = obj(resultOf(await trpcQuery(app, "economy.catalog", undefined, cookie.dev)));
    const currency = arr(catalog.currencies).find((item) => obj(item).nation === FIRST);
    expect(obj(currency)).toMatchObject({
      name: { ko: "메사론", en: "Mesaron" },
      nationName: { ko: "레드메사" },
    });
    // 최근 바꿈
    const history = obj(resultOf(await trpcQuery(app, "nations.history", undefined, cookie.dev)));
    expect(obj(arr(history.rows)[0])).toMatchObject({ action: "apply", note: "이름 바꿈" });
    expect(obj(arr(obj(arr(history.rows)[0]).changes)[0])).toMatchObject({
      category: "nation_presets",
      id: FIRST,
    });
    // 내보내기(pnpm tuning:apply가 받는 차이)
    const exported = obj(resultOf(await trpcQuery(app, "tuning.export", undefined, cookie.dev)));
    const diff = tuningDiffSchema.parse(exported.diff);
    const change = diff.entries?.find((item) => item.category === "nation_presets" && item.id === FIRST);
    expect(change?.entry.name).toEqual({ ko: "레드메사", en: "Redmesa" });
    expect(change?.from).toBe(content.packHash("nation_presets", FIRST));
  });

  it("다시 켜도 덮어쓰기가 남는다", async () => {
    await app.close();
    app = await start();
    const body = await list();
    expect(body.revision).toBe(1);
    expect(obj(nationOf(body, FIRST).entry).name).toEqual({ ko: "레드메사", en: "Redmesa" });
  });

  it("만들기·켬끔 바꾸기·화폐 코드 바꾸기·그새 바뀐 항목은 받지 않는다", async () => {
    const body = await list();
    const second = nationOf(body, SECOND);
    const entry = obj(second.entry);
    const reject = async (next: Record<string, unknown>, hash = second.hash) =>
      errorOf(await save([{ op: "put", entry: next, baseHash: hash }]));
    expect(await reject({ ...entry, id: "brand_new_nation" })).toMatchObject({
      code: "BAD_REQUEST",
      reason: "unknown_entry",
    });
    expect(await reject({ ...entry, enabled: false })).toMatchObject({ reason: "invalid_entry" });
    expect(
      await reject({ ...entry, currency: { ...obj(entry.currency), code: "another_code" } }),
    ).toMatchObject({ reason: "invalid_entry" });
    expect(await reject({ ...entry, shortName: "RMS" })).toMatchObject({ reason: "invalid_entry" });
    expect(await reject({ ...entry, tradeTaxBp: 300 }, "0".repeat(64))).toMatchObject({
      reason: "entry_changed",
    });
    // 플레이어는 쓰지 못한다
    const asPlayer = await trpcMutation(
      app,
      "nations.save",
      { expectedRevision: body.revision, changes: [{ op: "put", entry, baseHash: second.hash }] },
      cookie.player,
    );
    expect(errorOf(asPlayer).code).toBe("FORBIDDEN");
    expect((await list()).revision).toBe(1);
  });

  it("마크 올리기: PNG 256 × 256만, 서명·크기·바이트·권한을 본다. 그림 길은 image/png·nosniff·오래 캐시", async () => {
    const good = makeTestPng(NATION_EMBLEM_UPLOAD.size, NATION_EMBLEM_UPLOAD.size);
    expect(errorOf(await upload(good, cookie.player)).code).toBe("FORBIDDEN");
    expect(errorOf(await upload(Buffer.from("<svg onload=alert(1)></svg>".padEnd(80, " ")))).reason).toBe(
      "emblem_not_png",
    );
    expect(errorOf(await upload(makeTestPng(128, 128))).reason).toBe("emblem_wrong_size");
    const big = makeTestPng(256, 256, [9, 9, 9, 255], 200);
    expect(big.length).toBeGreaterThan(NATION_EMBLEM_UPLOAD.maxBytes);
    // 바이트 상한을 넘는 것은 입력 길이(base64)에서 걸리거나 서버 검사에서 걸린다
    expect(errorOf(await upload(big)).code).toBe("BAD_REQUEST");
    expect(errorOf(await upload(good, cookie.dev, "no_such_nation")).reason).toBe("unknown_entry");
    expect(
      errorOf(
        await trpcMutation(
          app,
          "nations.uploadEmblem",
          { id: FIRST, pngBase64: "%%%not-base64" },
          cookie.dev,
        ),
      ).reason,
    ).toBe("emblem_not_png");
    expect(await rows(test.db, "select 1 from nation_emblems")).toHaveLength(0);

    const res = await upload(good);
    expect(res.statusCode).toBe(200);
    const uploaded = obj(nationOf(obj(resultOf(res)), FIRST).uploaded);
    expect(uploaded).toMatchObject({ bytes: good.length });
    const hash = String(uploaded.hash);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    // 그림 길: 로그인 없이 읽는다
    const image = await app.inject({ method: "GET", url: `/api/nation-emblems/${hash}.png` });
    expect(image.statusCode).toBe(200);
    expect(image.headers["content-type"]).toBe("image/png");
    expect(image.headers["x-content-type-options"]).toBe("nosniff");
    expect(image.headers["cache-control"]).toContain("immutable");
    expect(image.rawPayload.equals(good)).toBe(true);
    expect(
      (await app.inject({ method: "GET", url: `/api/nation-emblems/${"0".repeat(64)}.png` })).statusCode,
    ).toBe(404);
    expect((await app.inject({ method: "GET", url: "/api/nation-emblems/..%2Fsecret.png" })).statusCode).toBe(
      404,
    );
    // 다시 올리면 바꾼다(한 장)
    const other = makeTestPng(256, 256, [20, 90, 200, 255]);
    const second = obj(nationOf(obj(resultOf(await upload(other))), FIRST).uploaded);
    expect(second.hash).not.toBe(hash);
    expect(await rows(test.db, "select 1 from nation_emblems")).toHaveLength(1);
    expect((await app.inject({ method: "GET", url: `/api/nation-emblems/${hash}.png` })).statusCode).toBe(
      404,
    );
    expect(await audits("nation.emblem_upload")).toHaveLength(2);
    // 지우면 만든 마크로 돌아간다
    const removed = obj(resultOf(await trpcMutation(app, "nations.removeEmblem", { id: FIRST }, cookie.dev)));
    expect(nationOf(removed, FIRST).uploaded).toBeNull();
    expect(await audits("nation.emblem_remove")).toHaveLength(1);
    expect(errorOf(await trpcMutation(app, "nations.removeEmblem", { id: FIRST }, cookie.player)).code).toBe(
      "FORBIDDEN",
    );
  });

  it("이 세계에 반영: 미리 보기는 바꾸지 않고, 적용은 프리셋 값으로 고치되 손으로 고친 줄은 건너뛴다", async () => {
    const pool = test.db.$client;
    // 고정 국가 셋(시험 NPC 세력 = 16번째 프리셋, 프리셋 1·2)을 흉내 낸다. 정체성은 팩 값으로 먼저 정해 둔다(옛 세계)
    for (const code of ["s3_test_npc", FIRST, SECOND])
      await pool.query(
        "insert into factions (kind, code, regime, fixed) values ('npc', $1, 'democracy', true) on conflict (code) do nothing",
        [code],
      );
    const packPresets = nationPresetsFrom(content.pack.nationPresets);
    await ensureProfiles({ pool, presets: packPresets, baseAsset: ASSET_CREDIT, now: () => 1 });
    const ids = new Map(
      (
        await rows<{ id: string; code: string }>(
          test.db,
          "select id, code from factions where code is not null",
        )
      ).map((row) => [row.code, Number(row.id)]),
    );
    const profile = async (code: string) =>
      (
        await rows<{ name: string; short_name: string; color: string; source: string }>(
          test.db,
          "select name, short_name, color, source from faction_profiles where faction_id = $1",
          [ids.get(code)],
        )
      )[0];
    expect(await profile(FIRST)).toMatchObject({ name: "메리데일", short_name: "MRD", source: "preset" });
    // 운영자가 국가 2를 손으로 고쳤다
    const second = ids.get(SECOND) ?? 0;
    await updateFactionProfile(pool, {
      factionId: second,
      name: "손으로 고친 이름",
      shortName: "HND",
      color: "#123456",
      actorId: devId,
      nowMs: 2,
    });
    // 편집기에서 국가 2의 이름도 바꾼다(실효 프리셋이 손으로 고친 값과 다르다)
    const body = await list();
    const row = nationOf(body, SECOND);
    await save([
      {
        op: "put",
        entry: { ...obj(row.entry), name: { ko: "윈하이 연방", en: "Yunhai League" } },
        baseHash: row.hash,
      },
    ]);

    expect(
      errorOf(await trpcMutation(app, "nations.applyToWorld", { dryRun: true }, cookie.player)).code,
    ).toBe("FORBIDDEN");
    const dry = obj(resultOf(await trpcMutation(app, "nations.applyToWorld", { dryRun: true }, cookie.dev)));
    expect(dry).toMatchObject({ dryRun: true, updated: 2, skipped: 1 });
    const byPreset = (result: Record<string, unknown>, kind: string, preset: string) =>
      obj(arr(result.rows).find((item) => obj(item).kind === kind && obj(item).preset === preset));
    expect(byPreset(dry, "faction", FIRST)).toMatchObject({
      action: "update",
      before: { name: "메리데일", shortName: "MRD" },
      after: { name: "레드메사", shortName: "RMS" },
    });
    expect(byPreset(dry, "faction", SECOND)).toMatchObject({ action: "skip_admin" });
    expect(byPreset(dry, "faction", "placeholder_nation_16")).toMatchObject({ action: "same" });
    expect(byPreset(dry, "currency", FIRST)).toMatchObject({
      action: "update",
      before: { name: "올더", ticker: "ALD" },
      after: { name: "메사론", ticker: "MSR" },
    });
    expect(byPreset(dry, "currency", SECOND)).toMatchObject({ action: "same" });
    // 미리 보기는 아무것도 바꾸지 않는다
    expect(await profile(FIRST)).toMatchObject({ name: "메리데일", short_name: "MRD" });
    expect(await audits("nation.apply_faction")).toHaveLength(0);

    const done = obj(
      resultOf(await trpcMutation(app, "nations.applyToWorld", { dryRun: false }, cookie.dev)),
    );
    expect(done).toMatchObject({ dryRun: false, updated: 2, skipped: 1 });
    expect(await profile(FIRST)).toMatchObject({ name: "레드메사", short_name: "RMS", source: "preset" });
    expect(await profile(SECOND)).toMatchObject({
      name: "손으로 고친 이름",
      short_name: "HND",
      source: "admin",
    });
    const currency = (
      await rows<{ name: string; ticker: string; symbol: string }>(
        test.db,
        "select name, ticker, symbol from currency_profiles where asset = 'cur:placeholder_cur_01'",
      )
    )[0];
    expect(currency).toMatchObject({ name: "메사론", ticker: "MSR", symbol: "Ⱥ" });
    const applied = await audits("nation.apply_faction");
    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({
      before: { name: "메리데일", shortName: "MRD" },
      after: { name: "레드메사", shortName: "RMS" },
    });
    expect(obj(applied[0]?.meta)).toMatchObject({ preset: FIRST, factionId: ids.get(FIRST) });
    expect(await audits("nation.apply_currency")).toHaveLength(1);
    // 다시 하면 바꿀 것이 없다
    const again = obj(
      resultOf(await trpcMutation(app, "nations.applyToWorld", { dryRun: false }, cookie.dev)),
    );
    expect(again).toMatchObject({ updated: 0, skipped: 1 });
  });

  it("팩 값으로 되돌리면 덮어쓰기가 없어진다", async () => {
    const body = await list();
    const first = nationOf(body, FIRST);
    const res = await save([{ op: "revert", id: FIRST, baseHash: first.hash }]);
    expect(res.statusCode).toBe(200);
    const row = nationOf(obj(resultOf(res)), FIRST);
    expect(row).toMatchObject({ origin: "pack", override: null });
    expect(obj(row.entry).name).toEqual({ ko: "메리데일", en: "Meridale" });
  });
});
