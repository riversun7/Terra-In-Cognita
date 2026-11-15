// 플레이어 세력 정체성 DB 통합 시험 — docs/adr/2026-11-11-faction-identity.md.
// tRPC(인증 앱, 기본 속도 제한): 처음 정하기(이름·약어·색·마크 한 번에)·확인·고치기, 본인 것만(다른 플레이어는 못 바꾸고 이름·약어를 못
// 가져간다), 그림 올리기(그림 길 머리글, 바꾸면 앞 그림이 사라짐, 지우기), 운영자 내리기(권한·알림·감사 기록·올리기 막기), 세계 스위치 끔,
// 이름 바꾸기 대기(가문을 창설한 뒤에만 — 질문 932 가). 가문 창설·신고·자동 막기·약어 폭은 house.db.test.ts.
// 서비스 직접(시험 시계·느슨한 제한): 엄격한 PNG 검사 표, 국가 프리셋·NPC 세력 정체성 사칭, 대기 뒤 이름 바꾸기, 속도 제한.
// TEST_DATABASE_URL이 있을 때만. 계정·그림은 시험용 가짜 값이다.
import { FACTION_EMBLEM_UPLOAD } from "@terra/shared/factionIdentity";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuth } from "../auth/auth.ts";
import { executeCommand, parseCliArgs } from "../cli/commands.ts";
import { makeTestPng } from "../nationEdit/testPng.ts";
import type { NationPreset } from "../npc/nations.ts";
import {
  TEST_DATABASE_URL,
  TEST_SETTINGS,
  type TestDatabase,
  buildAuthApp,
  createTestDatabase,
  enter,
  rows,
  sessionCookie,
  trpcMutation,
  trpcQuery,
} from "../testDb.ts";
import { createHouseFounder } from "./found.ts";
import { TEST_HOUSE_RULES } from "./rules.ts";
import { createFactionIdentityServices, createFactionIdentityShared } from "./services.ts";
import { ownerIdentityOf } from "./store.ts";

const PASSWORD = "fake pass phrase 7";

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

const EMBLEM = { shape: "shield", division: "pale", charge: "tree", scheme: 1 };
const base64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");
const GOOD = makeTestPng(FACTION_EMBLEM_UPLOAD.size, FACTION_EMBLEM_UPLOAD.size);
const OTHER = makeTestPng(FACTION_EMBLEM_UPLOAD.size, FACTION_EMBLEM_UPLOAD.size, [20, 90, 160, 255]);
const newUpload = (png: Uint8Array) => ({ mode: "new", pngBase64: base64(png) }) as const;

/** 서비스 직접 시험의 저장 요청 */
const input = (patch: Record<string, unknown> = {}) => ({
  name: "안개골",
  shortName: "FOG",
  color: "#8e44ad",
  emblem: EMBLEM,
  upload: { mode: "none" } as const,
  ...patch,
});
const reasonOf = async (run: Promise<unknown>): Promise<unknown> => {
  try {
    await run;
    return null;
  } catch (error) {
    return obj(obj(error).cause).reason ?? String(error);
  }
};

interface Player {
  cookie: string;
  id: string;
}

describe.skipIf(!TEST_DATABASE_URL)("플레이어 세력 정체성 (DB)", () => {
  let test: TestDatabase;
  let app: FastifyInstance;
  let a: Player;
  let b: Player;
  const staff: { gm?: string; admin?: string } = {};

  const idOf = async (username: string): Promise<string> =>
    (await rows<{ id: string }>(test.db, "select id from users where username = $1", [username]))[0]?.id ??
    "";
  /** 새 플레이어 계정(시험마다 따로 써서 계정별 속도 제한이 섞이지 않게 한다) */
  const newPlayer = async (loginId: string): Promise<Player> => ({
    cookie: sessionCookie(
      await enter(app, { id: loginId, password: PASSWORD, create: true, passwordConfirm: PASSWORD }),
    ),
    id: await idOf(loginId.toLowerCase()),
  });
  const mine = async (who: Player) =>
    obj(resultOf(await trpcQuery(app, "factionIdentity.mine", undefined, who.cookie)));
  const save = (who: Player, patch: Record<string, unknown> = {}) =>
    trpcMutation(
      app,
      "factionIdentity.save",
      {
        name: "하늘세력",
        shortName: "HAN",
        color: "#2980b9",
        emblem: EMBLEM,
        upload: { mode: "none" },
        ...patch,
      },
      who.cookie,
    );
  const audits = (action: string) =>
    rows<{ actor_kind: string; target_id: string | null; before: unknown; after: unknown }>(
      test.db,
      "select actor_kind, target_id, before, after from audit_log where action = $1 order by id",
      [action],
    );
  const emblemGet = (hash: string) => app.inject({ method: "GET", url: `/api/nation-emblems/${hash}.png` });
  const uploadedOf = async (who: Player): Promise<string> => String(obj((await mine(who)).identity).uploaded);

  beforeAll(async () => {
    test = await createTestDatabase();
    app = await buildAuthApp(test.db);
    await app.ready();
    const auth = createAuth({ db: test.db, settings: TEST_SETTINGS });
    a = await newPlayer("Fake_IdentityA");
    b = await newPlayer("Fake_IdentityB");
    for (const [key, id, roles] of [
      ["gm", "Fake_IdentityGm", "player,gm"],
      ["admin", "Fake_IdentityAdmin", "player,admin"],
    ] as const) {
      await executeCommand(
        parseCliArgs(["create-user", "--id", id, "--roles", roles]),
        { TIC_ACTOR: "test:identity", TIC_PASSWORD: PASSWORD },
        { db: test.db, auth },
        { out: () => {}, err: () => {} },
      );
      staff[key] = sessionCookie(await enter(app, { id, password: PASSWORD }));
    }
  }, 240_000);

  afterAll(async () => {
    await app?.close();
    await test?.drop();
  });

  it("로그인해야 하고, 처음에는 정체성이 없다(그림은 올릴 수 있다 — 기본 허용)", async () => {
    expect(errorOf(await trpcQuery(app, "factionIdentity.mine", undefined)).code).toBe("UNAUTHORIZED");
    const first = await mine(a);
    expect(first).toMatchObject({ identity: null, uploadBlock: null, notice: null, renameAt: null });
    expect(typeof first.seed).toBe("number");
  });

  it("규칙에 안 맞는 값은 받지 않고 아무것도 저장하지 않는다", async () => {
    expect(errorOf(await save(a, { name: "대한민국" }))).toMatchObject({
      reason: "name_invalid",
      details: ["real_place"],
    });
    expect(errorOf(await save(a, { name: "sky clan" }))).toMatchObject({
      reason: "name_invalid",
      details: ["invalid_chars"],
    });
    expect(errorOf(await save(a, { shortName: "GM" }))).toMatchObject({
      reason: "short_invalid",
      details: ["reserved"],
    });
    expect(errorOf(await save(a, { color: "#ffffff" })).reason).toBe("color_invalid");
    expect(errorOf(await save(a, { emblem: { ...EMBLEM, shape: "flag" } })).reason).toBe("emblem_invalid");
    // 틀린 그림이 섞이면 이름도 저장되지 않는다(한 번에)
    expect(
      errorOf(await save(a, { upload: newUpload(Buffer.from("<svg onload=alert(1)></svg>")) })).reason,
    ).toBe("emblem_not_png");
    expect(await rows(test.db, "select 1 from faction_identities")).toHaveLength(0);
  });

  it("처음 정하기: 이름·약어·색·만든 마크를 한 번에, 감사 기록 faction.identity_create", async () => {
    const res = await save(a);
    expect(res.statusCode).toBe(200);
    expect(obj(obj(resultOf(res)).identity)).toMatchObject({
      name: "하늘세력",
      shortName: "HAN",
      color: "#2980b9",
      emblem: EMBLEM,
      uploaded: null,
    });
    expect(obj((await mine(a)).identity).name).toBe("하늘세력");
    // 창설 전(초안)은 남의 한눈 정보에 보이지 않는다(질문 926 나 — 창설한 가문만)
    expect(await ownerIdentityOf(test.db.$client, a.id)).toBeNull();
    const nationRow = await rows<{ id: string }>(
      test.db,
      "insert into factions (kind, code) values ('npc', 'fake_identity_nation_a') returning id",
    );
    const founded = await createHouseFounder({
      pool: test.db.$client,
      now: () => Date.now(),
      nationOf: () => Number(nationRow[0]?.id),
    }).found(a.id, { cost: "0" });
    // 지도의 유닛 한눈 정보가 읽는 주인 정체성(그림 바이트 없이)
    expect(await ownerIdentityOf(test.db.$client, a.id)).toEqual({
      houseId: founded.ok ? founded.factionId : -1,
      name: "하늘세력",
      shortName: "HAN",
      color: "#2980b9",
      emblem: EMBLEM,
      uploaded: null,
    });
    expect(await ownerIdentityOf(test.db.$client, b.id)).toBeNull();
    const audit = await audits("faction.identity_create");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor_kind: "user", target_id: a.id, before: null });
    expect(obj(audit[0]?.after)).toMatchObject({ name: "하늘세력", shortName: "HAN", sha256: null });
  });

  it("다른 플레이어는 그 이름·약어를 못 쓰고(대소문자 무시), 남의 정체성을 바꿀 길이 없다", async () => {
    const check = await trpcQuery(
      app,
      "factionIdentity.check",
      { name: "하늘세력", shortName: "han" },
      b.cookie,
    );
    expect(resultOf(check)).toEqual({ name: "taken", shortName: "taken" });
    expect(errorOf(await save(b)).reason).toBe("name_taken");
    expect(errorOf(await save(b, { name: "구름골", shortName: "han" })).reason).toBe("short_taken");
    // 입력에 대상을 끼워 넣어도 받지 않는다(엄격한 입력) — 늘 본인 것만 다룬다
    expect(errorOf(await save(b, { userId: a.id, name: "구름골", shortName: "GRM" })).code).toBe(
      "BAD_REQUEST",
    );
    expect((await save(b, { name: "구름골", shortName: "GRM" })).statusCode).toBe(200);
    const all = await rows<{ user_id: string; name: string }>(
      test.db,
      "select user_id, name from faction_identities order by name",
    );
    expect(all).toEqual([
      { user_id: b.id, name: "구름골" },
      { user_id: a.id, name: "하늘세력" },
    ]);
    // 자기 이름은 겹침으로 보지 않는다
    expect(
      resultOf(
        await trpcQuery(app, "factionIdentity.check", { name: "하늘세력", shortName: "HAN" }, a.cookie),
      ),
    ).toEqual({ name: null, shortName: null });
  });

  it("그림 올리기: 자른 256 × 256 PNG만 받고, 그림 길은 image/png·nosniff, 저장된 바이트는 보낸 것 그대로", async () => {
    // 원본 크기 그림(자르지 않은 것)·상한을 넘는 그림은 받지 않는다
    expect(errorOf(await save(a, { upload: newUpload(makeTestPng(640, 480)) })).reason).toBe(
      "emblem_wrong_size",
    );
    const big = makeTestPng(256, 256, [9, 9, 9, 255], 200);
    expect(errorOf(await save(a, { upload: newUpload(big) })).code).toBe("BAD_REQUEST");
    expect(
      await rows(test.db, "select 1 from faction_identities where emblem_sha256 is not null"),
    ).toHaveLength(0);

    const res = await save(a, { upload: newUpload(GOOD) });
    expect(res.statusCode).toBe(200);
    const hash = String(obj(obj(resultOf(res)).identity).uploaded);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    const stored = await rows<{ emblem_png: Buffer; emblem_bytes: number }>(
      test.db,
      "select emblem_png, emblem_bytes from faction_identities where user_id = $1",
      [a.id],
    );
    expect(stored[0]?.emblem_bytes).toBe(GOOD.length);
    expect(Buffer.compare(stored[0]?.emblem_png ?? Buffer.alloc(0), GOOD)).toBe(0);
    const image = await emblemGet(hash);
    expect(image.statusCode).toBe(200);
    expect(image.headers["content-type"]).toBe("image/png");
    expect(image.headers["x-content-type-options"]).toBe("nosniff");
    expect(Buffer.compare(image.rawPayload, GOOD)).toBe(0);
    const audit = await audits("faction.identity_update");
    expect(obj(audit.at(-1)?.after)).toMatchObject({ sha256: hash, bytes: GOOD.length });
    // 감사 기록에 그림 바이트는 없다
    expect(JSON.stringify(audit)).not.toContain(base64(GOOD).slice(0, 40));
  });

  it("세력 하나에 그림 한 장: 다시 올리면 앞 그림은 사라지고, keep은 그대로, none은 만든 마크로", async () => {
    const before = await uploadedOf(a);
    // keep: 색만 바꾼다
    const kept = await save(a, { color: "#27ae60", upload: { mode: "keep" } });
    expect(obj(obj(resultOf(kept)).identity)).toMatchObject({ color: "#27ae60", uploaded: before });
    const replaced = await save(a, { color: "#27ae60", upload: newUpload(OTHER) });
    const next = String(obj(obj(resultOf(replaced)).identity).uploaded);
    expect(next).not.toBe(before);
    expect((await emblemGet(before)).statusCode).toBe(404);
    expect((await emblemGet(next)).statusCode).toBe(200);
    expect(
      await rows(test.db, "select 1 from faction_identities where emblem_sha256 is not null"),
    ).toHaveLength(1);
    const removed = await save(a, { color: "#27ae60", upload: { mode: "none" } });
    expect(obj(obj(resultOf(removed)).identity).uploaded).toBeNull();
    expect((await emblemGet(next)).statusCode).toBe(404);
  });

  it("운영자 마크 관리: 권한(플레이어 403·운영자 가능), 내리면 만든 마크 + 주인 알림 + 감사 기록", async () => {
    await save(a, { color: "#27ae60", upload: newUpload(GOOD) });
    const hash = await uploadedOf(a);
    expect(errorOf(await trpcQuery(app, "ops.emblems.list", undefined, a.cookie)).code).toBe("FORBIDDEN");
    expect(
      errorOf(await trpcMutation(app, "ops.emblems.takedown", { userId: a.id, reason: "x" }, b.cookie)).code,
    ).toBe("FORBIDDEN");
    const list = obj(resultOf(await trpcQuery(app, "ops.emblems.list", undefined, staff.gm)));
    expect(list).toMatchObject({ uploadAllowed: true, total: 2 });
    expect(arr(list.rows)).toHaveLength(1);
    expect(obj(arr(list.rows)[0])).toMatchObject({
      userId: a.id,
      loginId: "Fake_IdentityA",
      name: "하늘세력",
      shortName: "HAN",
      uploadBlocked: false,
      notice: null,
    });
    expect(obj(obj(arr(list.rows)[0]).uploaded)).toMatchObject({ hash, bytes: GOOD.length });

    // 올린 그림이 없는 세력·없는 계정
    expect(
      resultOf(await trpcMutation(app, "ops.emblems.takedown", { userId: b.id, reason: "" }, staff.gm)),
    ).toEqual({ ok: false, code: "no_upload" });
    expect(
      resultOf(
        await trpcMutation(
          app,
          "ops.emblems.takedown",
          { userId: "00000000-0000-4000-8000-000000000000", reason: "" },
          staff.gm,
        ),
      ),
    ).toEqual({ ok: false, code: "not_found" });

    const down = await trpcMutation(
      app,
      "ops.emblems.takedown",
      { userId: a.id, reason: "  시험 사유  " },
      staff.gm,
    );
    expect(resultOf(down)).toEqual({ ok: true });
    expect((await emblemGet(hash)).statusCode).toBe(404);
    const after = await mine(a);
    expect(obj(after.identity)).toMatchObject({ uploaded: null, emblem: EMBLEM, name: "하늘세력" });
    expect(obj(after.notice)).toMatchObject({ kind: "emblem_removed", reason: "시험 사유" });
    const audit = await audits("ops.emblem_takedown");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor_kind: "admin", target_id: a.id });
    expect(obj(audit[0]?.before)).toMatchObject({ sha256: hash, name: "하늘세력" });
    expect(obj(audit[0]?.after)).toMatchObject({ reason: "시험 사유", uploadBlocked: false });
    // 내린 기록은 주인이 확인할 때까지 목록에 남는다
    const listed = obj(resultOf(await trpcQuery(app, "ops.emblems.list", undefined, staff.gm)));
    expect(obj(arr(listed.rows)[0])).toMatchObject({ userId: a.id, uploaded: null });
    // 주인이 확인하면 알림이 사라진다. 다른 플레이어의 확인은 자기 것만 건드린다
    await trpcMutation(app, "factionIdentity.dismissNotice", undefined, b.cookie);
    expect((await mine(a)).notice).not.toBeNull();
    const dismissed = await trpcMutation(app, "factionIdentity.dismissNotice", undefined, a.cookie);
    expect(obj(resultOf(dismissed)).notice).toBeNull();
  });

  it("내리면서 그 계정의 올리기를 막을 수 있고, 풀면 다시 올린다", async () => {
    const c = await newPlayer("Fake_IdentityC");
    const mineC = { name: "바람숲", shortName: "WND" };
    expect((await save(c, { ...mineC, upload: newUpload(GOOD) })).statusCode).toBe(200);
    await trpcMutation(
      app,
      "ops.emblems.takedown",
      { userId: c.id, reason: "", blockUploads: true },
      staff.gm,
    );
    expect((await mine(c)).uploadBlock).toBe("account_blocked");
    expect(obj((await mine(c)).notice).reason).toBeNull();
    expect(errorOf(await save(c, { ...mineC, upload: newUpload(GOOD) })).reason).toBe("upload_blocked");
    // 만든 마크·색은 그대로 고칠 수 있다
    expect((await save(c, { ...mineC, color: "#c0392b" })).statusCode).toBe(200);
    expect(
      resultOf(await trpcMutation(app, "ops.emblems.setBlocked", { userId: c.id, blocked: false }, staff.gm)),
    ).toEqual({ ok: true });
    expect((await mine(c)).uploadBlock).toBeNull();
    expect((await save(c, { ...mineC, upload: newUpload(OTHER) })).statusCode).toBe(200);
    expect(await audits("ops.emblem_block")).toHaveLength(1);
  });

  it("세계 스위치: 관리자만 바꾸고(운영자 403), 끄면 그림을 못 올리고 만든 마크만 쓴다", async () => {
    const d = await newPlayer("Fake_IdentityD");
    const mineD = { name: "돌언덕", shortName: "DOL" };
    expect(
      errorOf(await trpcMutation(app, "ops.emblems.setUploadAllowed", { allowed: false }, staff.gm)).code,
    ).toBe("FORBIDDEN");
    try {
      expect(
        resultOf(await trpcMutation(app, "ops.emblems.setUploadAllowed", { allowed: false }, staff.admin)),
      ).toEqual({ ok: true });
      expect((await mine(d)).uploadBlock).toBe("switch_off");
      expect(obj(resultOf(await trpcQuery(app, "ops.emblems.list", undefined, staff.gm))).uploadAllowed).toBe(
        false,
      );
      expect(errorOf(await save(d, { ...mineD, upload: newUpload(GOOD) })).reason).toBe("upload_off");
      expect(await rows(test.db, "select 1 from faction_identities where user_id = $1", [d.id])).toHaveLength(
        0,
      );
      // 만든 마크로는 정할 수 있다
      expect((await save(d, { ...mineD, emblem: { ...EMBLEM, charge: "sun" } })).statusCode).toBe(200);
    } finally {
      await trpcMutation(app, "ops.emblems.setUploadAllowed", { allowed: true }, staff.admin);
    }
    expect((await mine(d)).uploadBlock).toBeNull();
    const audit = await audits("ops.emblem_switch");
    expect(audit.map((row) => row.after)).toEqual([{ uploadAllowed: false }, { uploadAllowed: true }]);
  });

  it("이름·약어는 가문을 창설한 뒤 기다려야 다시 바꾼다(색·마크는 바로)", async () => {
    // 창설 전(초안)에는 대기가 없다
    expect((await mine(b)).renameAt).toBeNull();
    const nation = await rows<{ id: string }>(
      test.db,
      "insert into factions (kind, code) values ('npc', 'fake_identity_nation') returning id",
    );
    const founder = createHouseFounder({
      pool: test.db.$client,
      now: () => Date.now(),
      nationOf: () => Number(nation[0]?.id),
    });
    expect(await founder.found(b.id, { cost: "0" })).toMatchObject({ ok: true });
    const renameAt = Number((await mine(b)).renameAt);
    expect(renameAt).toBeGreaterThan(Date.now());
    const mineB = { name: "구름골", shortName: "GRM" };
    expect(errorOf(await save(b, { ...mineB, name: "새이름세력" })).reason).toBe("rename_wait");
    expect(errorOf(await save(b, { ...mineB, shortName: "NEW" })).reason).toBe("rename_wait");
    // 대소문자만 바꾸는 것은 이름 바꾸기가 아니다
    expect((await save(b, { ...mineB, shortName: "Grm", color: "#16a085" })).statusCode).toBe(200);
    expect(obj((await mine(b)).identity)).toMatchObject({ shortName: "Grm", color: "#16a085" });
    expect(Number((await mine(b)).renameAt)).toBe(renameAt);
  });

  describe("서비스 직접", () => {
    const presets: NationPreset[] = [
      {
        code: "placeholder_nation_01",
        name: { ko: "메리 데일", en: "Meridale" },
        shortName: "MRD",
        currency: { code: "placeholder_cur_01", name: { ko: "올더", en: "Alder" } },
      },
    ];
    const RELAXED = { capacity: 1000, refillPerMinute: 1000 };
    let clock = 0;
    const make = (limits: Parameters<typeof createFactionIdentityShared>[0]["limits"] = {}) =>
      createFactionIdentityServices(
        createFactionIdentityShared({
          pool: test.db.$client,
          now: () => clock,
          presets: () => presets,
          limits: { saves: RELAXED, uploads: RELAXED, ...limits },
          rules: () => ({ ...TEST_HOUSE_RULES, renameWaitMs: 60_000 }),
        }),
        { db: test.db, ip: null },
      );
    let e: Player;
    const viewerOf = (player: Player) => ({ id: player.id, roles: ["player"] as const });

    beforeAll(async () => {
      e = await newPlayer("Fake_IdentityE");
      clock = Date.now();
    });

    it("엄격한 PNG 검사: 크기·청크 허용 목록·CRC·IEND 뒤 바이트·압축 자료", async () => {
      const service = make();
      const up = (png: Uint8Array) => reasonOf(service.save(viewerOf(e), input({ upload: newUpload(png) })));
      expect(await up(makeTestPng(128, 128))).toBe("emblem_wrong_size");
      // 글 청크가 든 PNG(IEND 앞에 tEXt를 끼움 — CRC는 맞다)
      const text = Buffer.from("0000000c7445587454657374006162636465660ad1b2f4", "hex");
      const withText = Buffer.concat([
        GOOD.subarray(0, GOOD.length - 12),
        text,
        GOOD.subarray(GOOD.length - 12),
      ]);
      expect(await up(withText)).toBe("emblem_bad_chunk");
      expect(await up(Buffer.concat([GOOD, Buffer.from("trailing")]))).toBe("emblem_bad_chunk");
      const broken = Buffer.from(GOOD);
      broken[60] = (broken[60] ?? 0) ^ 0xff;
      expect(await up(broken)).toBe("emblem_bad_chunk");
      expect(
        await reasonOf(
          service.save(viewerOf(e), input({ upload: { mode: "new", pngBase64: "%%%not-base64" } })),
        ),
      ).toBe("emblem_not_png");
      expect(await rows(test.db, "select 1 from faction_identities where user_id = $1", [e.id])).toHaveLength(
        0,
      );
    });

    it("국가 프리셋·NPC 세력 정체성의 이름·약어는 쓸 수 없다(사칭)", async () => {
      const service = make();
      const viewer = viewerOf(e);
      expect(await service.check(viewer, { name: "Meridale", shortName: "mrd" })).toEqual({
        name: "taken",
        shortName: "taken",
      });
      // 프리셋 이름의 빈칸을 빼고 견준다
      expect(await reasonOf(service.save(viewer, input({ name: "메리데일" })))).toBe("name_taken");
      expect(await reasonOf(service.save(viewer, input({ shortName: "Mrd" })))).toBe("short_taken");
      const faction = await rows<{ id: string }>(
        test.db,
        "insert into factions (kind, code) values ('npc', 'fake_identity_npc') returning id",
      );
      await test.db.$client.query(
        `insert into faction_profiles (faction_id, name, short_name, color, source, updated_at_ms)
         values ($1, 'Stone Hold', 'STH', '#112233', 'default', 0)`,
        [faction[0]?.id],
      );
      expect(await service.check(viewer, { name: "stonehold", shortName: "sth" })).toEqual({
        name: "taken",
        shortName: "taken",
      });
      expect(await reasonOf(service.save(viewer, input({ shortName: "STH" })))).toBe("short_taken");
      expect(await reasonOf(service.save(viewer, input({ name: "StoneHold" })))).toBe("name_taken");
    });

    it("이름 바꾸기 대기가 지나면 바꿀 수 있다", async () => {
      const service = make();
      const viewer = viewerOf(e);
      const first = await service.save(viewer, input());
      expect(first.identity?.name).toBe("안개골");
      // 창설 전에는 대기가 없고, 창설하면 마지막으로 이름을 정한 때부터 센다
      expect(first.renameAt).toBeNull();
      const nation = await rows<{ id: string }>(
        test.db,
        "insert into factions (kind, code) values ('npc', 'fake_identity_nation_e') returning id",
      );
      const founder = createHouseFounder({
        pool: test.db.$client,
        now: () => clock,
        nationOf: () => Number(nation[0]?.id),
      });
      expect(await founder.found(e.id, { cost: "0" })).toMatchObject({ ok: true });
      expect((await service.mine(viewer)).renameAt).toBe(clock + 60_000);
      clock += 30_000;
      expect(await reasonOf(service.save(viewer, input({ name: "이슬골" })))).toBe("rename_wait");
      clock += 31_000;
      expect((await service.mine(viewer)).renameAt).toBeNull();
      const saved = await service.save(viewer, input({ name: "이슬골" }));
      expect(saved.identity?.name).toBe("이슬골");
      expect(saved.renameAt).toBe(clock + 60_000);
    });

    it("계정마다 속도 제한: 그림 올리기와 저장을 따로 센다", async () => {
      const service = make({
        uploads: { capacity: 2, refillPerMinute: 1 },
        saves: { capacity: 4, refillPerMinute: 1 },
      });
      const viewer = viewerOf(e);
      const mineE = input({ name: "이슬골" });
      const up = () => reasonOf(service.save(viewer, { ...mineE, upload: newUpload(GOOD) }));
      expect(await up()).toBeNull();
      expect(await up()).toBeNull();
      expect(await up()).toBe("rate_limited");
      // 다른 계정은 따로 센다
      const f = await newPlayer("Fake_IdentityF");
      expect(
        await reasonOf(
          service.save(viewerOf(f), input({ name: "달빛숲", shortName: "MOON", upload: newUpload(OTHER) })),
        ),
      ).toBeNull();
      // 그림 없는 저장은 저장 제한만 쓴다(올리기 시도 셋 + 이것 = 넷째까지)
      expect(await reasonOf(service.save(viewer, mineE))).toBeNull();
      expect(await reasonOf(service.save(viewer, mineE))).toBe("rate_limited");
      // 글자 규칙에 걸린 요청은 세지 않는다
      expect(await reasonOf(service.save(viewer, { ...mineE, name: "x" }))).toBe("name_invalid");
      // 1분 뒤 한 장이 다시 찬다
      clock += 60_000;
      expect(await up()).toBeNull();
    });
  });
});
