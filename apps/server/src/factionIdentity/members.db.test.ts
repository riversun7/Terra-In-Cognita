// 가문 가입·귀화 따라가기·이름 되돌리기 DB 통합 시험(질문 983 가·985 다·986 가, docs/adr/2026-11-11-faction-identity.md "바뀜 (981~986 답)").
// 초대·신청·받기·거절·서로 맞으면 바로 듦·나가기·내보내기, 같은 나라 시민만, 상한(인원·대기·신청)·요청 유효 시간, 가문원의 유닛 한눈 정보,
// 가문장이 귀화하면 가문이 따라가고 옛 나라 가문원은 빠짐(소식), 가문원이 귀화하면 빠짐, 서버를 켤 때 맞추기, 운영자 이름 되돌리기(감사 기록·
// 소식·대기 없이 다시 정함), 처리할 일(초대·신청·소식).
// TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
import { houseResetName, houseResetShort } from "@terra/shared/house";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { followAllHouses, followNation } from "./follow.ts";
import { createHouseFounder, nationFromDb } from "./found.ts";
import { createHouseInboxProviders } from "./houseInbox.ts";
import { createHouseMembers } from "./members.ts";
import { type HouseRules, TEST_HOUSE_RULES } from "./rules.ts";
import { createFactionIdentityServices, createFactionIdentityShared } from "./services.ts";
import { ownerIdentityOf } from "./store.ts";

const EMBLEM = { shape: "shield", division: "pale", charge: "tree", scheme: 1 };
const RELAXED = { capacity: 1000, refillPerMinute: 1000 };
const viewer = (id: string, roles: readonly ("player" | "gm")[] = ["player"]) => ({ id, roles });
const account = (userId: string) => ({ userId, roles: ["player" as const] });

describe.skipIf(!TEST_DATABASE_URL)("가문 가입·귀화 따라가기 (DB)", () => {
  let test: TestDatabase;
  let nationA = 0;
  let nationB = 0;
  let clock = 5_000_000;
  let rules: HouseRules = TEST_HOUSE_RULES;
  let serial = 0;
  const sql = (text: string, values: unknown[] = []) => test.db.$client.query(text, values);
  const nationOf = (userId: string) => nationFromDb(test.db.$client, userId);
  const deps = () => ({ pool: test.db.$client, db: test.db, now: () => clock, nationOf });
  const members = () => createHouseMembers({ ...deps(), rules: () => rules });
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

  /** 그 나라 시민(사용자 + 사이보그 + 가입). 사용자 ID */
  const citizen = async (name: string, nation: number): Promise<string> => {
    serial += 1;
    const login = `fake_hm${serial}`;
    const id =
      (
        await rows<{ id: string }>(
          test.db,
          "insert into users (name, email, username) values ($1, $2, $3) returning id",
          [login, `${login}@house.placeholder.invalid`, login],
        )
      )[0]?.id ?? "";
    await sql(
      `insert into cyborgs (user_id, name, name_key, temperament, initial, k_pm, appearance, faction_id, start_city_id, created_at_ms)
         values ($1, $2, $3, 'balanced', '{10,10,10,10,10,10}', '{100,100,100,100,100,100}', '{}', $4, $5, 0)`,
      [id, name, name.toLowerCase(), nation, nation === nationA ? 911 : 912],
    );
    await sql("insert into faction_members (user_id, faction_id) values ($1, $2)", [id, nation]);
    return id;
  };
  /** 시민이 가문을 창설한다. 가문 세력 행 ID */
  const found = async (userId: string, name: string, shortName: string): Promise<number> => {
    await identity().save(viewer(userId), {
      name,
      shortName,
      color: "#2980b9",
      emblem: EMBLEM,
      upload: { mode: "none" },
    });
    const result = await createHouseFounder({ ...deps(), rules: () => rules }).found(userId, { cost: "0" });
    if (!result.ok) throw new Error(result.code);
    return result.factionId;
  };
  const view = (userId: string) => identity().house(viewer(userId));
  const noticeKinds = async (userId: string) => (await view(userId)).notices.map((notice) => notice.kind);
  /** 귀화(사이보그 행만 바꾼다 — 서비스는 citizenship 시험이 본다) */
  const naturalize = async (userId: string, nation: number) => {
    await sql("update cyborgs set faction_id = $2 where user_id = $1", [userId, nation]);
    await sql("update faction_members set faction_id = $2 where user_id = $1", [userId, nation]);
  };

  beforeAll(async () => {
    test = await createTestDatabase();
    const nation = async (code: string) =>
      Number(
        (
          await rows<{ id: string }>(
            test.db,
            "insert into factions (kind, code) values ('npc', $1) returning id",
            [code],
          )
        )[0]?.id,
      );
    nationA = await nation("fake_member_nation_a");
    nationB = await nation("fake_member_nation_b");
    for (const [id, faction] of [
      [911, nationA],
      [912, nationB],
    ])
      await sql(
        `insert into world_cities (id, faction_id, map_key, cell_x, cell_y, start, founded_at_ms) values ($1, $2, 7, $3, 3, true, 0)`,
        [id, faction, id],
      );
  }, 240_000);

  afterAll(async () => {
    await test?.drop();
  });

  it("초대 → 받기: 사이보그 이름(대소문자 무시)으로 같은 나라 시민을 초대하고, 받으면 가문원(나라 소속 그대로·유닛 한눈 정보에 가문)", async () => {
    const leader = await citizen("Lighthouse1", nationA);
    const sea = await citizen("Bada1", nationA);
    const houseId = await found(leader, "등대가문", "LTA");
    const service = members();
    expect(await service.invite(leader, "bada1")).toEqual({
      ok: true,
      action: "invited",
      factionId: houseId,
    });
    expect(await service.invite(leader, "BADA1")).toEqual({ ok: false, code: "already_requested" });
    // 초대받은 사람이 본다
    const offered = await view(sea);
    expect(offered.house).toBeNull();
    expect(offered.offers).toMatchObject([
      {
        kind: "invite",
        house: { factionId: houseId, name: "등대가문", memberCount: 1, leaderName: "Lighthouse1" },
      },
    ]);
    expect(offered.joinable.map((house) => house.factionId)).toContain(houseId);
    // 가문장은 보낸 초대를 본다
    expect((await view(leader)).house?.requests).toMatchObject([
      { kind: "invite", userId: sea, name: "Bada1" },
    ]);
    const requestId = offered.offers[0]?.id ?? 0;
    // 남이 받을 수 없다
    expect(await service.answer(leader, requestId, true)).toEqual({ ok: false, code: "not_found" });
    expect(await service.answer(sea, requestId, true)).toEqual({
      ok: true,
      action: "joined",
      factionId: houseId,
    });

    const joined = await view(sea);
    expect(joined.house).toMatchObject({ factionId: houseId, role: "member", nationId: nationA });
    expect(joined.house?.members.map((row) => [row.name, row.role])).toEqual([
      ["Lighthouse1", "leader"],
      ["Bada1", "member"],
    ]);
    expect(joined.offers).toEqual([]);
    expect(await noticeKinds(leader)).toEqual(["invite_accepted"]);
    // 나라 소속(시민권 — 같은 나라 시야 공유 D-250이 보는 것)은 그대로
    expect(await rows(test.db, "select faction_id from faction_members where user_id = $1", [sea])).toEqual([
      { faction_id: String(nationA) },
    ]);
    // 가문원의 유닛 한눈 정보에도 가문 이름·마크
    expect(await ownerIdentityOf(test.db.$client, sea)).toMatchObject({ name: "등대가문", houseId });
    // 가문원은 가문을 창설할 수 없다(사용자마다 한 가문)
    await identity().save(viewer(sea), {
      name: "바다초안",
      shortName: "BDA",
      color: "#16a085",
      emblem: EMBLEM,
      upload: { mode: "none" },
    });
    expect(await createHouseFounder({ ...deps(), rules: () => rules }).found(sea, { cost: "0" })).toEqual({
      ok: false,
      code: "already_founded",
    });
    const audit = await rows<{ action: string }>(
      test.db,
      "select action from audit_log where action like 'faction.house_%' and target_id = $1 order by id",
      [sea],
    );
    expect(audit.map((row) => row.action)).toEqual(["faction.house_invite", "faction.house_join"]);
  });

  it("같은 나라 시민만: 다른 나라 초대·신청은 other_nation, 없는 이름·나 자신·가문원·가문장 아님·사이보그 없음", async () => {
    const leader = await citizen("Rivera2", nationA);
    const foreigner = await citizen("Foreign2", nationB);
    const other = await citizen("Othera2", nationA);
    const houseId = await found(leader, "강가문", "RIV");
    const otherHouse = await found(other, "들가문", "FLD");
    const service = members();
    expect(await service.invite(leader, "Foreign2")).toEqual({ ok: false, code: "other_nation" });
    expect(await service.apply(foreigner, houseId)).toEqual({ ok: false, code: "other_nation" });
    expect((await view(foreigner)).joinable.map((house) => house.factionId)).not.toContain(houseId);
    expect(await service.invite(leader, "Nobody99")).toEqual({ ok: false, code: "not_found" });
    expect(await service.invite(leader, "이름 틀림")).toEqual({ ok: false, code: "not_found" });
    expect(await service.invite(leader, "Rivera2")).toEqual({ ok: false, code: "self" });
    expect(await service.invite(leader, "Othera2")).toEqual({ ok: false, code: "already_in_house" });
    expect(await service.apply(other, houseId)).toEqual({ ok: false, code: "already_in_house" });
    const plain = await citizen("Plain2", nationA);
    expect(await service.invite(plain, "Foreign2")).toEqual({ ok: false, code: "not_leader" });
    expect(await service.apply(plain, nationA)).toEqual({ ok: false, code: "not_found" });
    expect(await service.apply(plain, 999_999)).toEqual({ ok: false, code: "not_found" });
    const noCyborg =
      (
        await rows<{ id: string }>(
          test.db,
          "insert into users (name, email, username) values ('fake_nocy', 'fake_nocy@house.placeholder.invalid', 'fake_nocy') returning id",
        )
      )[0]?.id ?? "";
    expect(await service.apply(noCyborg, houseId)).toEqual({ ok: false, code: "no_cyborg" });
    expect(otherHouse).toBeGreaterThan(0);
  });

  it("신청 → 거절·받기, 서로 맞으면 바로 듦(초대한 사람이 신청 / 신청한 사람을 초대), 거두기", async () => {
    const leader = await citizen("Stonea3", nationA);
    const houseId = await found(leader, "돌가문", "STN");
    const a = await citizen("Applya3", nationA);
    const b = await citizen("Applyb3", nationA);
    const c = await citizen("Applyc3", nationA);
    const service = members();
    expect(await service.apply(a, houseId)).toEqual({ ok: true, action: "applied", factionId: houseId });
    expect(await service.apply(a, houseId)).toEqual({ ok: false, code: "already_requested" });
    const request = (await view(leader)).house?.requests.find((row) => row.userId === a);
    // 가문장이 아닌 사람은 신청에 답하지 못한다
    expect(await service.answer(b, request?.id ?? 0, true)).toEqual({ ok: false, code: "not_found" });
    expect(await service.answer(leader, request?.id ?? 0, false)).toEqual({
      ok: true,
      action: "declined",
      factionId: houseId,
    });
    expect(await noticeKinds(a)).toEqual(["apply_declined"]);
    // 다시 신청 → 받음
    await service.apply(a, houseId);
    const again = (await view(leader)).house?.requests.find((row) => row.userId === a);
    expect(await service.answer(leader, again?.id ?? 0, true)).toMatchObject({ ok: true, action: "joined" });
    expect(await noticeKinds(a)).toEqual(["apply_accepted", "apply_declined"]);
    // 신청한 사람을 초대 = 받음
    await service.apply(b, houseId);
    expect(await service.invite(leader, "Applyb3")).toEqual({
      ok: true,
      action: "joined",
      factionId: houseId,
    });
    // 초대받은 사람이 신청 = 받음
    await service.invite(leader, "Applyc3");
    expect(await service.apply(c, houseId)).toEqual({ ok: true, action: "joined", factionId: houseId });
    expect((await view(leader)).house?.memberCount).toBe(4);
    // 거두기: 가문장은 보낸 초대를, 신청한 사람은 자기 신청을
    const d = await citizen("Applyd3", nationA);
    await service.invite(leader, "Applyd3");
    const invite = (await view(leader)).house?.requests.find((row) => row.userId === d);
    expect(await service.withdraw(d, invite?.id ?? 0)).toEqual({ ok: false, code: "not_found" });
    expect(await service.withdraw(leader, invite?.id ?? 0)).toMatchObject({ ok: true, action: "withdrawn" });
    expect((await view(d)).offers).toEqual([]);
  });

  it("상한(설정 칸): 인원·가문마다 대기·사람마다 신청, 요청은 유효 시간이 지나면 사라진다", async () => {
    rules = { ...TEST_HOUSE_RULES, memberMax: 2, pendingMax: 2, applyMax: 1, requestTtlMs: 60_000 };
    try {
      const leader = await citizen("Limita4", nationA);
      const houseId = await found(leader, "상한가문", "LIM");
      const second = await found(await citizen("Limitb4", nationA), "둘째상한", "LIB");
      const service = members();
      const p1 = await citizen("Pendinga4", nationA);
      const p2 = await citizen("Pendingb4", nationA);
      const p3 = await citizen("Pendingc4", nationA);
      expect(await service.invite(leader, "Pendinga4")).toMatchObject({ ok: true });
      expect(await service.invite(leader, "Pendingb4")).toMatchObject({ ok: true });
      expect(await service.invite(leader, "Pendingc4")).toEqual({ ok: false, code: "too_many_pending" });
      // 사람마다 신청 1
      expect(await service.apply(p3, second)).toMatchObject({ ok: true, action: "applied" });
      expect(await service.apply(p3, houseId)).toEqual({ ok: false, code: "too_many_applications" });
      // 인원 2(가문장 포함): 하나 받으면 다음은 가득
      const offers = (await view(p1)).offers;
      expect(await service.answer(p1, offers[0]?.id ?? 0, true)).toMatchObject({
        ok: true,
        action: "joined",
      });
      const offer2 = (await view(p2)).offers[0]?.id ?? 0;
      expect(await service.answer(p2, offer2, true)).toEqual({ ok: false, code: "house_full" });
      // 유효 시간이 지나면 보이지 않고 답할 수 없다
      clock += 60_001;
      expect((await view(p2)).offers).toEqual([]);
      expect(await service.answer(p2, offer2, true)).toEqual({ ok: false, code: "not_found" });
      expect(await rows(test.db, "select id from house_requests where id = $1", [offer2])).toEqual([]);
    } finally {
      rules = TEST_HOUSE_RULES;
    }
  });

  it("나가기·내보내기: 가문장은 나갈 수 없고, 가문원이 나가면 가문장에게 소식, 내보내면 그 사람에게 소식 — 나간 뒤에는 창설할 수 있다", async () => {
    const leader = await citizen("Kicka5", nationA);
    const houseId = await found(leader, "바람가문", "WND");
    const m1 = await citizen("Memberaa5", nationA);
    const m2 = await citizen("Memberbb5", nationA);
    const service = members();
    for (const user of [m1, m2]) {
      await service.apply(user, houseId);
      const request = (await view(leader)).house?.requests.find((row) => row.userId === user);
      await service.answer(leader, request?.id ?? 0, true);
    }
    expect(await service.leave(leader)).toEqual({ ok: false, code: "leader_cannot_leave" });
    expect(await service.kick(m1, m2)).toEqual({ ok: false, code: "not_leader" });
    expect(await service.kick(leader, leader)).toEqual({ ok: false, code: "self" });
    expect(await service.leave(m1)).toEqual({ ok: true, action: "left", factionId: houseId });
    expect(await service.leave(m1)).toEqual({ ok: false, code: "not_in_house" });
    expect(await service.kick(leader, m1)).toEqual({ ok: false, code: "not_found" });
    expect(await service.kick(leader, m2)).toEqual({ ok: true, action: "kicked", factionId: houseId });
    expect(await noticeKinds(m2)).toContain("kicked");
    const leaderNotices = (await view(leader)).notices;
    expect(leaderNotices.find((notice) => notice.kind === "member_left")?.other).toBe("Memberaa5");
    // 나간 사람은 자기 가문을 창설할 수 있다
    expect(await found(m1, "새바람가문", "NWD")).toBeGreaterThan(0);
    // 소식 확인: 하나만, 그다음 모두
    const notices = (await view(leader)).notices;
    const one = await identity().dismissHouseNotices(viewer(leader), { ids: [notices[0]?.id ?? 0] });
    expect(one.notices).toHaveLength(notices.length - 1);
    expect((await identity().dismissHouseNotices(viewer(leader), {})).notices).toEqual([]);
  });

  it("귀화(983 가): 가문장이 귀화하면 가문이 따라가고 옛 나라 가문원은 빠진다(소식) — 같이 옮긴 가문원은 남고, 가문원이 귀화하면 그 사람만 빠진다", async () => {
    const leader = await citizen("Movera6", nationA);
    const houseId = await found(leader, "철새가문", "BRD");
    const stays = await citizen("Staysa6", nationA);
    const moves = await citizen("Movesa6", nationA);
    const pending = await citizen("Pendinga6", nationA);
    const service = members();
    for (const user of [stays, moves]) {
      await service.invite(leader, user === stays ? "Staysa6" : "Movesa6");
      const offer = (await view(user)).offers[0]?.id ?? 0;
      await service.answer(user, offer, true);
    }
    await service.invite(leader, "Pendinga6");
    // 가문원 하나가 먼저 B로 귀화 — 아직 가문 나라는 A라 빠진다
    await naturalize(moves, nationB);
    expect(await followNation(deps(), moves)).toEqual({ movedTo: null, removed: [moves] });
    expect(await noticeKinds(moves)).toEqual(["nation_left"]);
    // 다시 넣기 위해: 가문장이 B로 귀화하기 전에 그 사람은 B 시민이라 초대할 수 없다
    expect(await service.invite(leader, "Movesa6")).toEqual({ ok: false, code: "other_nation" });

    await naturalize(leader, nationB);
    const result = await followNation(deps(), leader);
    expect(result).toEqual({ movedTo: nationB, removed: [stays] });
    expect(await rows(test.db, "select born_of from factions where id = $1", [houseId])).toEqual([
      { born_of: String(nationB) },
    ]);
    expect((await view(leader)).house).toMatchObject({ nationId: nationB, memberCount: 1, requests: [] });
    const moved = (await view(leader)).notices.find((notice) => notice.kind === "house_moved");
    expect(moved?.count).toBe(1);
    expect(await noticeKinds(stays)).toEqual(["nation_left"]);
    // 옛 나라 기준 초대는 지웠다
    expect((await view(pending)).offers).toEqual([]);
    // 이제 B 시민을 초대할 수 있다
    expect(await service.invite(leader, "Movesa6")).toMatchObject({ ok: true, action: "invited" });
    // 나라 소속은 사이보그 시민권 그대로(시야 공유 D-250은 그것만 본다) — 가문 처리가 바꾸지 않는다
    expect(await rows(test.db, "select faction_id from faction_members where user_id = $1", [stays])).toEqual(
      [{ faction_id: String(nationA) }],
    );
    // 여러 번 불러도 같다
    expect(await followNation(deps(), leader)).toEqual({ movedTo: null, removed: [] });
    const audit = await rows<{ after: unknown }>(
      test.db,
      "select after from audit_log where action = 'faction.house_follow' and target_id = $1",
      [leader],
    );
    expect(audit).toMatchObject([{ after: { nationId: nationB, removed: [stays] } }]);
  });

  it("서버를 켤 때 맞추기: 귀화 뒤 맞추지 못한 가문을 모두 맞춘다", async () => {
    const leader = await citizen("Boota7", nationA);
    const houseId = await found(leader, "부팅가문", "BOT");
    const member = await citizen("Bootb7", nationA);
    const service = members();
    await service.invite(leader, "Bootb7");
    await service.answer(member, (await view(member)).offers[0]?.id ?? 0, true);
    await naturalize(leader, nationB);
    expect(await followAllHouses(deps())).toBeGreaterThanOrEqual(1);
    expect(await rows(test.db, "select born_of from factions where id = $1", [houseId])).toEqual([
      { born_of: String(nationB) },
    ]);
    expect((await view(member)).house).toBeNull();
  });

  it('운영자 이름 되돌리기(986 가): "가문 #ID"·세력 정체성도·신고 지움·주인에게 사유 소식·대기 없이 다시 정함·감사 기록', async () => {
    rules = { ...TEST_HOUSE_RULES, renameWaitMs: 7 * 86_400_000 };
    try {
      const owner = await citizen("Rename8", nationA);
      const houseId = await found(owner, "나쁜이름", "BAD");
      const gm = viewer(await citizen("Gmuser8", nationA), ["player", "gm"]);
      const service = identity();
      expect((await service.report(viewer(gm.id), { factionId: houseId })).status).toBe("reported");
      // 창설 직후라 이름 대기 중
      expect((await service.mine(viewer(owner))).renameAt).not.toBeNull();
      expect(
        await service.opsResetName(gm, { userId: owner, reason: "부적절한 이름", resetShort: true }),
      ).toEqual({ ok: true });
      const name = houseResetName(houseId);
      expect((await service.mine(viewer(owner))).identity).toMatchObject({
        name,
        shortName: houseResetShort(houseId),
      });
      expect(
        await rows(test.db, "select name, short_name from faction_profiles where faction_id = $1", [houseId]),
      ).toEqual([{ name, short_name: houseResetShort(houseId) }]);
      expect(await rows(test.db, "select id from house_reports where faction_id = $1", [houseId])).toEqual(
        [],
      );
      const notice = (await view(owner)).notices[0];
      expect(notice).toMatchObject({ kind: "name_reset", houseName: name, reason: "부적절한 이름" });
      // 대기 없이 바로 다시 정한다
      const mine = await service.mine(viewer(owner));
      expect(mine.renameAt).toBeNull();
      const saved = await service.save(viewer(owner), {
        name: "착한이름",
        shortName: "GOOD",
        color: "#2980b9",
        emblem: EMBLEM,
        upload: { mode: "none" },
      });
      expect(saved.identity?.name).toBe("착한이름");
      expect(saved.renameAt).not.toBeNull();
      const audit = await rows<{ before: unknown; after: unknown }>(
        test.db,
        "select before, after from audit_log where action = 'ops.house_name_reset' and target_id = $1",
        [owner],
      );
      expect(audit).toMatchObject([
        { before: { name: "나쁜이름", shortName: "BAD" }, after: { name, reason: "부적절한 이름" } },
      ]);
      // 창설하지 않은 초안은 되돌릴 가문이 없다
      const draft = await citizen("Drafty8", nationA);
      await service.save(viewer(draft), {
        name: "초안가문",
        shortName: "DRF",
        color: "#2980b9",
        emblem: EMBLEM,
        upload: { mode: "none" },
      });
      expect(await service.opsResetName(gm, { userId: draft, reason: "", resetShort: false })).toEqual({
        ok: false,
        code: "no_house",
      });
    } finally {
      rules = TEST_HOUSE_RULES;
    }
  });

  it("처리할 일: 받은 초대(마감 = 사라지는 시각)·가문장의 가입 신청(가문마다 묶음)·가문 소식", async () => {
    const leader = await citizen("Inboxa9", nationA);
    const houseId = await found(leader, "알림가문", "INB");
    const invitee = await citizen("Inboxb9", nationA);
    const applicant = await citizen("Inboxc9", nationA);
    const applicant2 = await citizen("Inboxd9", nationA);
    const service = members();
    await service.invite(leader, "Inboxb9");
    await service.apply(applicant, houseId);
    await service.apply(applicant2, houseId);
    const [invites, applications, notices] = createHouseInboxProviders(test.db.$client);
    const invited = await invites?.collect(account(invitee), clock);
    expect(invited).toMatchObject([
      {
        kind: "house_invite",
        deadlineAt: clock + TEST_HOUSE_RULES.requestTtlMs,
        params: { house: "알림가문" },
      },
    ]);
    const applied = await applications?.collect(account(leader), clock);
    expect(applied?.map((entry) => entry.key)).toEqual([`house_${houseId}`, `house_${houseId}`]);
    expect(await applications?.collect(account(applicant), clock)).toEqual([]);
    // 거절하면 신청한 사람에게 소식
    const request = (await view(leader)).house?.requests.find((row) => row.userId === applicant);
    await service.answer(leader, request?.id ?? 0, false);
    expect(await notices?.collect(account(applicant), clock)).toMatchObject([
      {
        kind: "house_notice",
        params: { house: "알림가문", notice: "apply_declined" },
        target: { route: "faction" },
      },
    ]);
  });
});
