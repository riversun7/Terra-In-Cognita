// 플레이어 가문 DB 통합 시험(질문 926~935 답, docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-11, 926~935 답)").
// 창설(세력 행·세력 정체성·가문장 줄을 한 번만, 창설자는 나라 시민 그대로, 소유 주체 없음), 창설 비용 = 설정 칸(기기가 본 값·잔고·나라 국고),
// 옛 정체성 옮기기, 약어 2~4자(새 약어만 — 옛 5자 약어는 그대로), 신고(하루 횟수·한 번만·내 가문), 마크 내리기 횟수 → 올리기 자동 막기,
// 마크 관리 목록의 신고 수·차례·넘기기.
// TEST_DATABASE_URL이 있을 때만. 계정·그림은 시험용 가짜 값이다.
import { FACTION_EMBLEM_UPLOAD } from "@terra/shared/factionIdentity";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeTestPng } from "../nationEdit/testPng.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { type HouseWallet, adoptUnfoundedIdentities, createHouseFounder } from "./found.ts";
import { type HouseRules, TEST_HOUSE_RULES } from "./rules.ts";
import { createFactionIdentityServices, createFactionIdentityShared } from "./services.ts";
import { ownerIdentityOf } from "./store.ts";

const EMBLEM = { shape: "shield", division: "pale", charge: "tree", scheme: 1 };
const GOOD = makeTestPng(FACTION_EMBLEM_UPLOAD.size, FACTION_EMBLEM_UPLOAD.size);
const upload = { mode: "new", pngBase64: Buffer.from(GOOD).toString("base64") } as const;
const RELAXED = { capacity: 1000, refillPerMinute: 1000 };

const reasonOf = async (run: Promise<unknown>): Promise<unknown> => {
  try {
    await run;
    return null;
  } catch (error) {
    const cause: unknown = typeof error === "object" && error !== null ? Reflect.get(error, "cause") : null;
    return typeof cause === "object" && cause !== null ? Reflect.get(cause, "reason") : String(error);
  }
};

describe.skipIf(!TEST_DATABASE_URL)("플레이어 가문 (DB)", () => {
  let test: TestDatabase;
  let nation = 0;
  let clock = 1_000_000;
  let rules: HouseRules = TEST_HOUSE_RULES;
  const sql = (text: string, values: unknown[] = []) => test.db.$client.query(text, values);

  const newUser = async (name: string): Promise<string> =>
    (
      await rows<{ id: string }>(
        test.db,
        "insert into users (name, email, username) values ($1, $2, $3) returning id",
        [name, `${name.toLowerCase()}@house.placeholder.invalid`, name.toLowerCase()],
      )
    )[0]?.id ?? "";
  const identity = () =>
    createFactionIdentityServices(
      createFactionIdentityShared({
        pool: test.db.$client,
        now: () => clock,
        limits: { saves: RELAXED, uploads: RELAXED },
        rules: () => rules,
      }),
      { db: test.db, ip: null },
    );
  const viewer = (id: string, roles: readonly ("player" | "gm")[] = ["player"]) => ({ id, roles });
  const founder = (wallet?: HouseWallet, nationOf: (id: string) => number | undefined = () => nation) =>
    createHouseFounder({
      pool: test.db.$client,
      db: test.db,
      rules: () => rules,
      now: () => clock,
      nationOf,
      wallet,
    });
  /** 정체성을 저장하고 창설한다. 가문 세력 행 ID */
  const house = async (userId: string, name: string, shortName: string): Promise<number> => {
    await identity().save(viewer(userId), {
      name,
      shortName,
      color: "#2980b9",
      emblem: EMBLEM,
      upload: { mode: "none" },
    });
    const result = await founder().found(userId, { cost: "0" });
    if (!result.ok) throw new Error(result.code);
    return result.factionId;
  };

  beforeAll(async () => {
    test = await createTestDatabase();
    nation = Number(
      (
        await rows<{ id: string }>(
          test.db,
          "insert into factions (kind, code) values ('npc', 'fake_house_nation') returning id",
        )
      )[0]?.id,
    );
  }, 240_000);

  afterAll(async () => {
    await test?.drop();
  });

  it("창설: 세력 행·세력 정체성(player)·가문장 줄을 한 번만 만들고, 창설자는 나라 시민 그대로(소유 주체 없음)", async () => {
    const user = await newUser("Fake_HouseA");
    await sql("insert into faction_members (user_id, faction_id) values ($1, $2)", [user, nation]);
    const service = identity();
    expect(await founder().found(user, { cost: "0" })).toEqual({ ok: false, code: "no_identity" });
    await service.save(viewer(user), {
      name: "등대가문",
      shortName: "LITE",
      color: "#16a085",
      emblem: EMBLEM,
      upload: { mode: "none" },
    });
    // 창설 전: 초안(가문 없음, 남의 한눈 정보에 보이지 않음)
    expect((await service.mine(viewer(user))).house).toBeNull();
    expect(await ownerIdentityOf(test.db.$client, user)).toBeNull();
    expect(await founder(undefined, () => undefined).found(user, { cost: "0" })).toEqual({
      ok: false,
      code: "no_cyborg",
    });

    const result = await founder().found(user, { cost: "0" });
    expect(result).toMatchObject({ ok: true, paid: "0" });
    const factionId = result.ok ? result.factionId : 0;
    expect(await founder().found(user, { cost: "0" })).toEqual({ ok: false, code: "already_founded" });

    expect(
      await rows(test.db, "select kind, code, born_of, parent_id from factions where id = $1", [factionId]),
    ).toEqual([{ kind: "player", code: null, born_of: String(nation), parent_id: null }]);
    expect(
      await rows(test.db, "select name, short_name, source from faction_profiles where faction_id = $1", [
        factionId,
      ]),
    ).toEqual([{ name: "등대가문", short_name: "LITE", source: "player" }]);
    expect(
      await rows(test.db, "select user_id, role from house_members where faction_id = $1", [factionId]),
    ).toEqual([{ user_id: user, role: "leader" }]);
    // 나라 소속(시민권 — 같은 나라 시야 공유 D-250이 보는 것)은 그대로, 가문은 소유 주체를 만들지 않는다
    expect(await rows(test.db, "select faction_id from faction_members where user_id = $1", [user])).toEqual([
      { faction_id: String(nation) },
    ]);
    expect(await rows(test.db, "select id from world_owners where faction_id = $1", [factionId])).toEqual([]);
    const mine = await service.mine(viewer(user));
    expect(mine.house).toEqual({ factionId, foundedAt: clock, nationId: nation });
    expect(await ownerIdentityOf(test.db.$client, user)).toMatchObject({
      name: "등대가문",
      houseId: factionId,
    });
    const audit = await rows<{ after: unknown }>(
      test.db,
      "select after from audit_log where action = 'faction.house_found'",
    );
    expect(audit.at(-1)?.after).toMatchObject({ factionId, nationId: nation, paid: "0" });

    // 창설 뒤 정체성을 고치면 세력 정체성도 같이 바뀐다(자기 이름은 겹침으로 세지 않는다)
    await service.save(viewer(user), {
      name: "등대가문",
      shortName: "LITE",
      color: "#c0392b",
      emblem: EMBLEM,
      upload: { mode: "keep" },
    });
    expect(
      await rows(test.db, "select color from faction_profiles where faction_id = $1", [factionId]),
    ).toEqual([{ color: "#c0392b" }]);
  });

  it("창설 비용 = 설정 칸: 기기가 본 값과 다르면 terms_changed, 잔고가 모자라면 거절, 내면 나라 국고로", async () => {
    const user = await newUser("Fake_HouseB");
    await identity().save(viewer(user), {
      name: "바다가문",
      shortName: "SEA",
      color: "#0984e3",
      emblem: EMBLEM,
      upload: { mode: "none" },
    });
    rules = { ...TEST_HOUSE_RULES, foundCost: 250n };
    try {
      expect((await identity().mine(viewer(user))).foundCost).toBe("250");
      expect(await founder().found(user, { cost: "0" })).toEqual({ ok: false, code: "terms_changed" });
      expect(await founder().found(user, { cost: "250" })).toEqual({ ok: false, code: "insufficient_funds" });
      const paid: unknown[] = [];
      let balance = 100n;
      const wallet: HouseWallet = {
        balance: () => balance,
        pay: (userId, nationId, amount) => {
          paid.push([userId, nationId, amount]);
          balance -= amount;
          return true;
        },
        durable: () => Promise.resolve(),
      };
      expect(await founder(wallet).found(user, { cost: "250" })).toEqual({
        ok: false,
        code: "insufficient_funds",
      });
      // 실패한 창설은 아무것도 남기지 않는다
      expect(await rows(test.db, "select faction_id from house_members where user_id = $1", [user])).toEqual(
        [],
      );
      balance = 1000n;
      expect(await founder(wallet).found(user, { cost: "250" })).toMatchObject({ ok: true, paid: "250" });
      expect(paid).toEqual([[user, nation, 250n]]);
      expect(balance).toBe(750n);
    } finally {
      rules = TEST_HOUSE_RULES;
    }
  });

  it("약어: 새로 정하는 약어는 설정 칸 폭(2~4자), 이미 정한 5자 약어는 그대로 둔다", async () => {
    const user = await newUser("Fake_HouseC");
    const service = identity();
    const draft = { name: "구름가문", color: "#6c5ce7", emblem: EMBLEM, upload: { mode: "none" } } as const;
    expect(await reasonOf(service.save(viewer(user), { ...draft, shortName: "CLOUD" }))).toBe(
      "short_invalid",
    );
    expect(await service.check(viewer(user), { name: "구름가문", shortName: "CLOUD" })).toMatchObject({
      shortName: "too_long",
    });
    expect(await reasonOf(service.save(viewer(user), { ...draft, shortName: "C" }))).toBe("short_invalid");
    expect((await service.mine(viewer(user))).shortRange).toEqual({ min: 2, max: 4 });
    // 옛 판이 정한 5자 약어(2~5자 시절): 그대로 저장하면 받고(대소문자 바꿈 포함), 다른 5자로 바꾸면 거절
    rules = { ...TEST_HOUSE_RULES, shortRange: { min: 2, max: 5 } };
    try {
      await service.save(viewer(user), { ...draft, shortName: "CLOUD" });
    } finally {
      rules = TEST_HOUSE_RULES;
    }
    expect(
      await reasonOf(service.save(viewer(user), { ...draft, shortName: "Cloud", color: "#8e44ad" })),
    ).toBeNull();
    expect(await reasonOf(service.save(viewer(user), { ...draft, shortName: "STORM" }))).toBe(
      "short_invalid",
    );
    expect(await reasonOf(service.save(viewer(user), { ...draft, shortName: "STRM" }))).toBeNull();
  });

  it("옛 정체성(가문 없는 줄)은 서버를 켤 때 가문으로 옮긴다 — 사이보그(나라)가 있는 계정만", async () => {
    const withCyborg = await newUser("Fake_HouseD");
    const noCyborg = await newUser("Fake_HouseE");
    for (const [user, name, short] of [
      [withCyborg, "옛가문", "OLD"],
      [noCyborg, "떠돌이", "WAN"],
    ] as const)
      await identity().save(viewer(user), {
        name,
        shortName: short,
        color: "#27ae60",
        emblem: EMBLEM,
        upload: { mode: "none" },
      });
    await sql(
      `insert into world_cities (id, faction_id, map_key, cell_x, cell_y, start, founded_at_ms) values (901, $1, 7, 3, 3, true, 0)`,
      [nation],
    );
    await sql(
      `insert into cyborgs (user_id, name, name_key, temperament, initial, k_pm, appearance, faction_id, start_city_id, created_at_ms)
         values ($1, '옛시민', '옛시민', 'balanced', '{10,10,10,10,10,10}', '{100,100,100,100,100,100}', '{}', $2, 901, 0)`,
      [withCyborg, nation],
    );
    expect(await adoptUnfoundedIdentities(test.db.$client, { now: () => clock })).toBe(1);
    expect((await identity().mine(viewer(withCyborg))).house?.nationId).toBe(nation);
    expect((await identity().mine(viewer(noCyborg))).house).toBeNull();
    // 두 번 돌려도 같다
    expect(await adoptUnfoundedIdentities(test.db.$client, { now: () => clock })).toBe(0);
  });

  it("신고: 같은 가문은 한 번만, 하루 횟수는 설정 칸, 내 가문·없는 가문은 안 됨 — 마크 관리 목록에 신고 수·신고 차례", async () => {
    const reporter = await newUser("Fake_HouseR");
    const targets = [
      await house(await newUser("Fake_HouseT1"), "첫째가문", "ONE"),
      await house(await newUser("Fake_HouseT2"), "둘째가문", "TWO"),
      await house(await newUser("Fake_HouseT3"), "셋째가문", "THR"),
    ];
    const own = await house(reporter, "신고가문", "REP");
    rules = { ...TEST_HOUSE_RULES, reportDaily: 2 };
    try {
      const service = identity();
      const report = async (factionId: number) =>
        (await service.report(viewer(reporter), { factionId })).status;
      expect(await report(targets[0] ?? 0)).toBe("reported");
      expect(await report(targets[0] ?? 0)).toBe("already");
      expect(await report(own)).toBe("own");
      expect(await report(nation)).toBe("unknown");
      expect(await report(999_999)).toBe("unknown");
      expect(await report(targets[1] ?? 0)).toBe("reported");
      expect(await report(targets[2] ?? 0)).toBe("limit");
      // 하루가 지나면 다시 센다
      clock += 24 * 60 * 60 * 1000 + 1;
      expect(await report(targets[2] ?? 0)).toBe("reported");
      // 다른 사람도 첫째를 신고 → 첫째 2, 둘째·셋째 1
      const other = await newUser("Fake_HouseR2");
      expect((await service.report(viewer(other), { factionId: targets[0] ?? 0 })).status).toBe("reported");
      const listed = await service.opsList({ sort: "reports" });
      expect(listed.rows[0]).toMatchObject({ factionId: targets[0], reports: 2 });
      expect(listed.rows.find((row) => row.factionId === targets[1])?.reports).toBe(1);
      // 넘기면 신고 수가 0이 되고, 그림·막힘·알림이 없으면 목록에서 빠진다
      const t1 = listed.rows[0]?.userId ?? "";
      expect(await service.opsClearReports(viewer(reporter, ["player", "gm"]), { userId: t1 })).toEqual({
        ok: true,
      });
      expect((await service.opsList()).rows.some((row) => row.userId === t1)).toBe(false);
    } finally {
      rules = TEST_HOUSE_RULES;
    }
  });

  it("마크를 설정 칸 횟수만큼 내리면 그 계정의 올리기를 저절로 막는다(내리면 신고도 지운다)", async () => {
    const user = await newUser("Fake_HouseM");
    const factionId = await house(user, "마크가문", "MRK");
    const gm = viewer(await newUser("Fake_HouseGm"), ["player", "gm"]);
    rules = { ...TEST_HOUSE_RULES, takedownBlock: 2 };
    try {
      const service = identity();
      const draft = { name: "마크가문", shortName: "MRK", color: "#2980b9", emblem: EMBLEM } as const;
      await service.save(viewer(user), { ...draft, upload });
      expect((await service.report(viewer(await newUser("Fake_HouseRm")), { factionId })).status).toBe(
        "reported",
      );
      expect(await service.opsTakedown(gm, { userId: user, reason: "", blockUploads: false })).toEqual({
        ok: true,
      });
      let row = (await service.opsList()).rows.find((entry) => entry.userId === user);
      expect(row).toMatchObject({ takedowns: 1, uploadBlocked: false, reports: 0 });
      expect((await service.opsList()).autoBlockAt).toBe(2);
      await service.save(viewer(user), { ...draft, upload });
      expect(await service.opsTakedown(gm, { userId: user, reason: "", blockUploads: false })).toEqual({
        ok: true,
      });
      row = (await service.opsList()).rows.find((entry) => entry.userId === user);
      expect(row).toMatchObject({ takedowns: 2, uploadBlocked: true });
      expect(await reasonOf(service.save(viewer(user), { ...draft, upload }))).toBe("upload_blocked");
      const audit = await rows<{ after: unknown }>(
        test.db,
        "select after from audit_log where action = 'ops.emblem_takedown' order by id",
      );
      expect(audit.map((entry) => entry.after)).toMatchObject([
        { autoBlocked: false },
        { autoBlocked: true, takedowns: 2 },
      ]);
    } finally {
      rules = TEST_HOUSE_RULES;
    }
  });
});
