// 2단계 DB 통합 시험: 가문 도시 가입(정부 방문·NPC 자동 승인·시장/원수 승인·정책), 도시 탈퇴(대기·우호도 하락),
// 도시 추방(우호도 무변화), 블랙리스트(등록·해제·가입 차단) — ADR 2026-11-25-house-city-approval-and-blacklist.md.
// TEST_DATABASE_URL이 있을 때만 돈다.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { createNationBlacklistService, listNationBlacklist } from "./blacklist.ts";
import { createHouseCityJoin, readCityMembership } from "./houseCityJoin.ts";
import { TEST_HOUSE_RULES } from "./rules.ts";

const rules = () => ({ ...TEST_HOUSE_RULES, homeWaitMs: 86_400_000, homeNoticeMs: 86_400_000 });

describe.skipIf(!TEST_DATABASE_URL)("가문 도시 가입 승인·탈퇴·추방·블랙리스트 (DB)", () => {
  let test: TestDatabase;
  let serial = 0;
  let npcNation = 0;
  let clock = 50_000_000;
  const NPC_CITY = 9701;
  const PLAYER_CITY = 9702;
  const NPC_HALL = 8701;
  const PLAYER_HALL = 8702;
  const visitCity = new Map<string, number>();

  const sql = (text: string, values: unknown[] = []) => test.db.$client.query(text, values);
  const joinService = () =>
    createHouseCityJoin({
      pool: test.db.$client,
      db: test.db,
      rules,
      now: () => clock,
      checkHallVisit(userId, buildingId) {
        const hallCity = buildingId === NPC_HALL ? NPC_CITY : buildingId === PLAYER_HALL ? PLAYER_CITY : null;
        if (hallCity === null) return { ok: false, code: "not_government" };
        if (visitCity.get(userId) !== hallCity) return { ok: false, code: "wrong_city" };
        return { ok: true, cityId: hallCity };
      },
    });
  const blacklistService = () =>
    createNationBlacklistService({
      pool: test.db.$client,
      db: test.db,
      now: () => clock,
      bountyMax: () => 5_000n,
    });

  const person = async (): Promise<{ id: string; name: string }> => {
    serial += 1;
    const login = `fake_hcj_${serial}`;
    const name = `Hcj${serial}`;
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
         values ($1, $2, $3, 'balanced', '{10,10,10,10,10,10}', '{100,100,100,100,100,100}', '{}', null, $4, 0)`,
      [id, name, name.toLowerCase(), NPC_CITY],
    );
    return { id, name };
  };

  const makeHouse = async (opts: { extraMembers?: number; ownCity?: number } = {}) => {
    const leader = await person();
    const id = Number(
      (
        await rows<{ id: string }>(
          test.db,
          "insert into factions (kind, parent_id, born_of) values ('player', null, null) returning id",
        )
      )[0]?.id,
    );
    await sql(
      `insert into faction_profiles (faction_id, name, short_name, color, source, updated_at_ms)
         values ($1, $2, $3, '#2980b9', 'player', 0)`,
      [id, `JoinHouse ${String(id)}`, `J${String(id)}`],
    );
    await sql(
      "insert into house_members (user_id, faction_id, role, joined_at_ms) values ($1, $2, 'leader', 0)",
      [leader.id, id],
    );
    const members: { id: string; name: string }[] = [];
    for (let i = 0; i < (opts.extraMembers ?? 0); i++) {
      const m = await person();
      members.push(m);
      await sql(
        "insert into house_members (user_id, faction_id, role, joined_at_ms) values ($1, $2, 'member', 0)",
        [m.id, id],
      );
    }
    if (opts.ownCity !== undefined) {
      await sql(
        `insert into world_cities (id, faction_id, map_key, cell_x, cell_y, start, founded_at_ms)
           values ($1, $2, 7, 10, 10, false, 0)`,
        [opts.ownCity, id],
      );
      await sql("insert into world_owners (id, faction_id, settled_at_ms) values ($1, $2, 0)", [
        99000 + opts.ownCity,
        id,
      ]);
    }
    return { id, leader, members };
  };

  let mayorHouse: {
    id: number;
    leader: { id: string; name: string };
    members: { id: string; name: string }[];
  };

  beforeAll(async () => {
    test = await createTestDatabase();
    npcNation = Number(
      (
        await rows<{ id: string }>(
          test.db,
          "insert into factions (kind, code, traits) values ('npc', 'fake_hcj_npc', '{500,500,500,500}') returning id",
        )
      )[0]?.id,
    );
    await sql(
      `insert into world_cities (id, faction_id, map_key, cell_x, cell_y, start, founded_at_ms)
         values ($1, $2, 7, 5, 5, true, 0)`,
      [NPC_CITY, npcNation],
    );
    mayorHouse = await makeHouse({ ownCity: PLAYER_CITY });
  }, 240_000);

  afterAll(async () => {
    await test?.drop();
  });

  it("정부 건물 방문 검증(wrong_city·not_government) + NPC 자동 승인(1인 즉시, 2인 공고, 저우호도 차단)", async () => {
    const solo = await makeHouse();
    // 행정 건물 아님
    expect(await joinService().applyAtHall(solo.leader.id, 99999)).toEqual({
      ok: false,
      code: "not_government",
    });
    // 도시에 방문하지 않음
    expect(await joinService().applyAtHall(solo.leader.id, NPC_HALL)).toEqual({
      ok: false,
      code: "wrong_city",
    });
    // 우호도 -50(기본 문턱 -20 미만) → 자동 승인 차단
    visitCity.set(solo.leader.id, NPC_CITY);
    await sql(
      "insert into user_nation_standings (user_id, faction_id, score, updated_at_ms) values ($1, $2, -50, 0)",
      [solo.leader.id, npcNation],
    );
    expect(await joinService().applyAtHall(solo.leader.id, NPC_HALL)).toEqual({
      ok: false,
      code: "standing_too_low",
    });
    // 우호도 회복 → 1인 가문은 NPC 자동 승인으로 즉시 가입
    await sql("update user_nation_standings set score = 0 where user_id = $1 and faction_id = $2", [
      solo.leader.id,
      npcNation,
    ]);
    expect(await joinService().applyAtHall(solo.leader.id, NPC_HALL)).toEqual({
      ok: true,
      action: "home_set",
      factionId: solo.id,
    });

    // 2인 이상 가문은 NPC 자동 승인이어도 공고 기간 시작
    const duo = await makeHouse({ extraMembers: 1 });
    visitCity.set(duo.leader.id, NPC_CITY);
    expect(await joinService().applyAtHall(duo.leader.id, NPC_HALL)).toEqual({
      ok: true,
      action: "home_announced",
      factionId: duo.id,
    });
  });

  it("플레이어 도시: 시장 기본 승인 대기 → 승인/거절, 정책 변경, 소속 도시 탈퇴(대기+우호도 하락) 및 추방(우호도 무변화)", async () => {
    const applicant = await makeHouse();
    visitCity.set(applicant.leader.id, PLAYER_CITY);
    // 플레이어 도시 기본 정책(mayor) → 대기 신청
    expect(await joinService().applyAtHall(applicant.leader.id, PLAYER_HALL)).toEqual({
      ok: true,
      action: "city_applied",
      factionId: applicant.id,
    });
    // 중복 신청 차단
    expect(await joinService().applyAtHall(applicant.leader.id, PLAYER_HALL)).toEqual({
      ok: false,
      code: "already_applied",
    });
    // 정부 판 조회: 시장에게는 대기 신청 목록이 보인다
    const view = await readCityMembership(test.db.$client, {
      cityId: PLAYER_CITY,
      viewerId: mayorHouse.leader.id,
      nowMs: clock,
      rules: rules(),
      viewerInCity: true,
    });
    expect(view?.canManage).toBe(true);
    expect(view?.approver).toBe("mayor");
    expect(view?.applications.some((a) => a.houseId === applicant.id)).toBe(true);
    const appId = view?.applications.find((a) => a.houseId === applicant.id)?.id ?? 0;
    // 타인은 승인 불가
    expect(await joinService().decideApplication(applicant.leader.id, appId, true)).toEqual({
      ok: false,
      code: "not_ruler",
    });
    // 시장 승인 → 1인 가문 즉시 가입
    expect(await joinService().decideApplication(mayorHouse.leader.id, appId, true)).toEqual({
      ok: true,
      action: "city_apply_accepted",
      factionId: applicant.id,
    });

    // 가문장이 소속 도시 탈퇴 → 국적 해제 + 우호도 하락 + 재가입 대기(home_wait)
    expect(await joinService().leaveCity(applicant.leader.id)).toEqual({
      ok: true,
      action: "city_left",
      factionId: applicant.id,
    });
    const standingAfterLeave = await rows<{ score: number }>(
      test.db,
      "select score from user_nation_standings where user_id = $1 and faction_id = $2",
      [applicant.leader.id, mayorHouse.id],
    );
    expect(standingAfterLeave[0]?.score ?? 0).toBeLessThan(0);
    // 재가입 대기 중에는 바로 신청 불가
    expect(await joinService().applyAtHall(applicant.leader.id, PLAYER_HALL)).toEqual({
      ok: false,
      code: "home_wait",
    });

    // 다른 가문은 가입 후 추방 → 우호도 변화 없음
    const victim = await makeHouse();
    visitCity.set(victim.leader.id, PLAYER_CITY);
    await joinService().applyAtHall(victim.leader.id, PLAYER_HALL);
    const vView = await readCityMembership(test.db.$client, {
      cityId: PLAYER_CITY,
      viewerId: mayorHouse.leader.id,
      nowMs: clock,
      rules: rules(),
      viewerInCity: true,
    });
    const vAppId = vView?.applications.find((a) => a.houseId === victim.id)?.id ?? 0;
    await joinService().decideApplication(mayorHouse.leader.id, vAppId, true);

    expect(await joinService().expelHouse(mayorHouse.leader.id, PLAYER_CITY, victim.id)).toEqual({
      ok: true,
      action: "city_expelled",
      factionId: victim.id,
    });
    const standingAfterExpel = await rows<{ score: number }>(
      test.db,
      "select score from user_nation_standings where user_id = $1 and faction_id = $2",
      [victim.leader.id, mayorHouse.id],
    );
    expect(standingAfterExpel.length).toBe(0);

    // 정책 변경(시장 → auto)
    expect(await joinService().setJoinPolicy(mayorHouse.leader.id, PLAYER_CITY, "auto", -10)).toEqual({
      ok: true,
      action: "join_policy_set",
      factionId: mayorHouse.id,
    });
  });

  it("블랙리스트 등록·해제 및 블랙리스트 유저가 포함된 가문의 가입 차단", async () => {
    const bad = await makeHouse();
    visitCity.set(bad.leader.id, PLAYER_CITY);
    // 등록(시장 권한)
    expect(
      await blacklistService().handle(mayorHouse.leader.id, {
        action: "add",
        cityId: PLAYER_CITY,
        targetName: bad.leader.name,
        bounty: "1000",
        reason: "지속적 약탈",
      }),
    ).toEqual({
      ok: true,
      action: "blacklist_added",
      factionId: mayorHouse.id,
    });
    const list = await listNationBlacklist(test.db.$client, mayorHouse.id);
    expect(list.some((b) => b.userId === bad.leader.id && b.bounty === "1000")).toBe(true);
    // 현상금 제한(ADR 2026-11-25-blacklist-bounty-limits.md): 상한을 넘으면 상한으로 줄여 적는다(int8을 넘는 값도)
    expect(
      await blacklistService().handle(mayorHouse.leader.id, {
        action: "add",
        cityId: PLAYER_CITY,
        targetName: bad.leader.name,
        bounty: "9999999999999999999999999999999",
      }),
    ).toMatchObject({ ok: true, action: "blacklist_added" });
    expect(
      (await listNationBlacklist(test.db.$client, mayorHouse.id)).find((b) => b.userId === bad.leader.id)
        ?.bounty,
    ).toBe("5000");
    // 남의 도시에는 등록도 현상금도 못 한다(그 도시를 가진 가문의 가문장이 아니다)
    expect(
      await blacklistService().handle(bad.leader.id, {
        action: "add",
        cityId: PLAYER_CITY,
        targetName: mayorHouse.leader.name,
        bounty: "10",
      }),
    ).toEqual({ ok: false, code: "not_ruler" });
    // 선출된 지배 가문장(나라 지도자)은 나라 도시에 블랙리스트는 올리지만, 자기 가문 도시가 아니라 현상금은 못 건다(나라
    // 국고로 거는 현상금은 의결이 있어야 한다 — 아직 없다)
    const ruling = await makeHouse();
    await sql(
      `insert into governance_state (nation_id, ruling_house_key, vacant_since_ms, updated_at_ms)
         values ($1, $2, null, 0)
         on conflict (nation_id) do update set ruling_house_key = excluded.ruling_house_key, vacant_since_ms = null`,
      [npcNation, `p:${String(ruling.id)}`],
    );
    expect(
      await blacklistService().handle(ruling.leader.id, {
        action: "add",
        cityId: NPC_CITY,
        targetName: bad.leader.name,
        bounty: "10",
      }),
    ).toEqual({ ok: false, code: "not_ruler" });
    expect(
      await blacklistService().handle(ruling.leader.id, {
        action: "add",
        cityId: NPC_CITY,
        targetName: bad.leader.name,
      }),
    ).toMatchObject({ ok: true, action: "blacklist_added" });
    expect(
      await blacklistService().handle(ruling.leader.id, {
        action: "remove",
        cityId: NPC_CITY,
        targetUserId: bad.leader.id,
      }),
    ).toMatchObject({ ok: true, action: "blacklist_removed" });
    await sql("delete from governance_state where nation_id = $1", [npcNation]);
    // 블랙리스트 가문은 가입 차단
    expect(await joinService().applyAtHall(bad.leader.id, PLAYER_HALL)).toEqual({
      ok: false,
      code: "blacklisted",
    });
    // 해제 후 가입 가능
    expect(
      await blacklistService().handle(mayorHouse.leader.id, {
        action: "remove",
        cityId: PLAYER_CITY,
        targetUserId: bad.leader.id,
      }),
    ).toEqual({
      ok: true,
      action: "blacklist_removed",
      factionId: mayorHouse.id,
    });
    const afterRemove = await listNationBlacklist(test.db.$client, mayorHouse.id);
    expect(afterRemove.some((b) => b.userId === bad.leader.id)).toBe(false);
  });
});
