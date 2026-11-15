// 가문장 넘기기·해산·이름 자동 막기 DB 통합 시험(질문 1003 가·1006 나, docs/adr/2026-11-11-faction-identity.md "바뀜 (1001~1006 답)").
// 넘기기(가문원만, 정체성 줄이 새 가문장에게 — 새 가문장이 정체성을 고친다, 소식·감사 기록), 해산(혼자 남은 가문장만·도시 가진 가문은 못 함,
// 이름·약어가 풀려 다른 사람이 쓴다, 정체성 줄은 초안으로 남는다), 운영자 이름 되돌리기 횟수가 설정 칸에 이르면 이름 바꾸기가 막히고(막혀도 색은
// 저장), 운영자가 푼다.
// TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
import { houseResetName } from "@terra/shared/house";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { createHouseFounder, nationFromDb } from "./found.ts";
import { createHouseMembers } from "./members.ts";
import { type HouseRules, TEST_HOUSE_RULES } from "./rules.ts";
import { createFactionIdentityServices, createFactionIdentityShared } from "./services.ts";
import { createHouseSuccession } from "./succession.ts";

const EMBLEM = { shape: "shield", division: "pale", charge: "tree", scheme: 1 };
const RELAXED = { capacity: 1000, refillPerMinute: 1000 };
const viewer = (id: string, roles: readonly ("player" | "gm")[] = ["player"]) => ({ id, roles });

describe.skipIf(!TEST_DATABASE_URL)("가문장 넘기기·해산·이름 자동 막기 (DB)", () => {
  let test: TestDatabase;
  let nation = 0;
  let clock = 9_000_000;
  const rules: HouseRules = { ...TEST_HOUSE_RULES, nameResetBlock: 2 };
  let serial = 0;
  const sql = (text: string, values: unknown[] = []) => test.db.$client.query(text, values);
  const nationOf = (userId: string) => nationFromDb(test.db.$client, userId);
  const deps = () => ({ pool: test.db.$client, db: test.db, now: () => clock, nationOf });
  const members = () => createHouseMembers({ ...deps(), rules: () => rules });
  const succession = () => createHouseSuccession({ pool: test.db.$client, db: test.db, now: () => clock });
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

  const citizen = async (name: string): Promise<string> => {
    serial += 1;
    const login = `fake_hs${serial}`;
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
         values ($1, $2, $3, 'balanced', '{10,10,10,10,10,10}', '{100,100,100,100,100,100}', '{}', $4, 921, 0)`,
      [id, name, name.toLowerCase(), nation],
    );
    await sql("insert into faction_members (user_id, faction_id) values ($1, $2)", [id, nation]);
    return id;
  };
  const save = (userId: string, name: string, shortName: string, color = "#2980b9") =>
    identity().save(viewer(userId), { name, shortName, color, emblem: EMBLEM, upload: { mode: "none" } });
  const found = async (userId: string, name: string, shortName: string): Promise<number> => {
    await save(userId, name, shortName);
    const result = await createHouseFounder(deps()).found(userId, { cost: "0" });
    if (!result.ok) throw new Error(result.code);
    return result.factionId;
  };
  /** 초대 → 받기로 가문원을 넣는다 */
  const join = async (leader: string, userId: string, name: string) => {
    await members().invite(leader, name);
    const offer = (await identity().house(viewer(userId))).offers[0];
    if (!offer) throw new Error("no offer");
    expect(await members().answer(userId, offer.id, true)).toMatchObject({ ok: true, action: "joined" });
  };
  const audits = async (action: string) =>
    rows<{ actor_id: string; after: Record<string, unknown> }>(
      test.db,
      "select actor_id, after from audit_log where action = $1 order by id",
      [action],
    );

  beforeAll(async () => {
    test = await createTestDatabase();
    nation = Number(
      (
        await rows<{ id: string }>(
          test.db,
          "insert into factions (kind, code) values ('npc', 'fake_succession_nation') returning id",
        )
      )[0]?.id,
    );
    await sql(
      `insert into world_cities (id, faction_id, map_key, cell_x, cell_y, start, founded_at_ms) values (921, $1, 7, 3, 3, true, 0)`,
      [nation],
    );
  }, 240_000);

  afterAll(async () => {
    await test?.drop();
  });

  it("넘기기: 가문원에게 바로 넘어가고(소식), 정체성은 새 가문장이 고친다 — 앞 가문장은 가문원으로 나갈 수 있다", async () => {
    const leader = await citizen("Keeper1");
    const heir = await citizen("Heir1");
    const third = await citizen("Third1");
    const outsider = await citizen("Out1");
    const houseId = await found(leader, "등불가문", "LMP");
    await join(leader, heir, "heir1");
    await join(leader, third, "third1");
    // 새 가문장이 될 사람이 따로 저장해 둔 초안(넘기면 지운다 — 계정마다 정체성 한 줄)
    await save(heir, "후계초안", "HRD");
    const service = succession();
    expect(await service.handover(leader, leader)).toEqual({ ok: false, code: "self" });
    expect(await service.handover(heir, third)).toEqual({ ok: false, code: "not_leader" });
    expect(await service.handover(leader, outsider)).toEqual({ ok: false, code: "not_found" });
    expect(await service.handover(leader, heir)).toEqual({
      ok: true,
      action: "handed_over",
      factionId: houseId,
    });
    const roles = await rows<{ user_id: string; role: string }>(
      test.db,
      "select user_id, role from house_members where faction_id = $1 order by role",
      [houseId],
    );
    expect(roles.filter((row) => row.role === "leader").map((row) => row.user_id)).toEqual([heir]);
    // 정체성 줄이 새 가문장에게(초안은 지움), 새 가문장이 이름을 고친다(대기는 가문 줄 그대로)
    const ident = await rows<{ user_id: string; name: string }>(
      test.db,
      "select user_id, name from faction_identities where faction_id = $1",
      [houseId],
    );
    expect(ident).toEqual([{ user_id: heir, name: "등불가문" }]);
    expect(await rows(test.db, "select 1 from faction_identities where name = '후계초안'")).toEqual([]);
    expect((await identity().mine(viewer(heir))).house?.factionId).toBe(houseId);
    expect((await identity().mine(viewer(leader))).identity).toBeNull();
    // 소식: 새 가문장 = 넘겨받음, 다른 가문원 = 가문장이 바뀜
    expect((await identity().house(viewer(heir))).notices.map((n) => n.kind)).toContain("leader_given");
    const thirdNotices = (await identity().house(viewer(third))).notices;
    expect(thirdNotices.find((n) => n.kind === "leader_changed")?.other).toBe("Heir1");
    // 앞 가문장은 가문원이라 나갈 수 있고, 새 가문장이 초대·내보내기를 한다
    expect(await members().leave(leader)).toMatchObject({ ok: true, action: "left" });
    expect(await members().kick(heir, third)).toMatchObject({ ok: true, action: "kicked" });
    expect((await audits("faction.house_handover")).at(-1)).toMatchObject({
      actor_id: leader,
      after: { factionId: houseId, to: heir },
    });
  });

  it("해산: 혼자 남은 가문장만, 도시 가진 가문은 못 함 — 이름·약어가 풀려 다른 사람이 쓰고, 정체성은 초안으로 남는다", async () => {
    const leader = await citizen("Solo1");
    const friend = await citizen("Friend1");
    const other = await citizen("Other1");
    const houseId = await found(leader, "외톨가문", "SOLO");
    await join(leader, friend, "friend1");
    const service = succession();
    expect(await service.dissolve(friend)).toEqual({ ok: false, code: "not_leader" });
    expect(await service.dissolve(other)).toEqual({ ok: false, code: "not_in_house" });
    expect(await service.dissolve(leader)).toEqual({ ok: false, code: "not_alone" });
    await members().kick(leader, friend);
    // 소유 주체(도시)가 있는 가문은 해산하지 못한다
    const owner = 900_000 + serial;
    await sql("insert into world_owners (id, faction_id, settled_at_ms) values ($1, $2, 0)", [
      owner,
      houseId,
    ]);
    expect(await service.dissolve(leader)).toEqual({ ok: false, code: "has_city" });
    await sql("delete from world_owners where id = $1", [owner]);
    // 신고가 있던 가문
    expect(await identity().report(viewer(other), { factionId: houseId })).toEqual({ status: "reported" });
    clock += 1000;
    expect(await service.dissolve(leader)).toEqual({ ok: true, action: "dissolved", factionId: houseId });
    const faction = await rows<{ dissolved_at_ms: string }>(
      test.db,
      "select dissolved_at_ms from factions where id = $1",
      [houseId],
    );
    expect(faction).toEqual([{ dissolved_at_ms: String(clock) }]);
    expect(await rows(test.db, "select 1 from house_members where faction_id = $1", [houseId])).toEqual([]);
    expect(await rows(test.db, "select 1 from house_reports where faction_id = $1", [houseId])).toEqual([]);
    expect(await rows(test.db, "select 1 from faction_profiles where faction_id = $1", [houseId])).toEqual(
      [],
    );
    // 정체성 줄은 초안(가문 없음, 이름 "가문 #ID" — 다시 창설하려면 이름을 정한다), 색은 그대로
    const mine = await identity().mine(viewer(leader));
    expect(mine.house).toBeNull();
    expect(mine.identity?.name).toBe(houseResetName(houseId));
    expect(mine.identity?.color).toBe("#2980b9");
    // 이름·약어가 풀렸다: 다른 사람이 같은 이름·약어로 창설한다
    const again = await found(other, "외톨가문", "SOLO");
    expect(again).not.toBe(houseId);
    // 해산한 가문에는 가입 신청·신고를 못 한다
    expect(await members().apply(friend, houseId)).toEqual({ ok: false, code: "not_found" });
    expect(await identity().report(viewer(friend), { factionId: houseId })).toEqual({ status: "unknown" });
    // 앞 가문장은 새 이름으로 다시 창설한다
    await save(leader, "다시가문", "AGN");
    expect(await createHouseFounder(deps()).found(leader, { cost: "0" })).toMatchObject({
      ok: true,
    });
    expect((await audits("faction.house_dissolve")).at(-1)).toMatchObject({
      actor_id: leader,
      after: { factionId: houseId, before: { name: "외톨가문", shortName: "SOLO" } },
    });
  });

  it("이름 되돌리기가 설정 칸 횟수에 이르면 이름 바꾸기가 막히고(색은 저장), 운영자가 푼다", async () => {
    const leader = await citizen("Rude1");
    const houseId = await found(leader, "나쁜가문", "BAD");
    const ops = viewer("00000000-0000-4000-8000-000000000001", ["gm"]);
    await sql(
      "insert into users (id, name, email, username) values ($1, 'fake_ops_hs', 'fake_ops_hs@ops.placeholder.invalid', 'fake_ops_hs') on conflict do nothing",
      [ops.id],
    );
    const service = identity();
    expect(await service.opsResetName(ops, { userId: leader, reason: "", resetShort: false })).toEqual({
      ok: true,
    });
    // 한 번(문턱 2 아래): 새 이름을 정한다
    await save(leader, "또나쁜가문", "BAD");
    expect((await service.mine(viewer(leader))).renameBlocked).toBe(false);
    expect(await service.opsResetName(ops, { userId: leader, reason: "again", resetShort: false })).toEqual({
      ok: true,
    });
    const blocked = await service.mine(viewer(leader));
    expect(blocked.renameBlocked).toBe(true);
    expect(blocked.identity?.name).toBe(houseResetName(houseId));
    // 막힘: 새 이름은 거절, 지금 이름 그대로면 색·마크만 저장
    await expect(save(leader, "다른가문", "BAD")).rejects.toMatchObject({
      cause: { reason: "rename_blocked" },
    });
    const kept = await save(leader, houseResetName(houseId), "BAD", "#27ae60");
    expect(kept.identity).toMatchObject({ name: houseResetName(houseId), color: "#27ae60" });
    const list = await service.opsList();
    expect(list.renameBlockAt).toBe(2);
    expect(list.rows.find((row) => row.userId === leader)).toMatchObject({
      nameResets: 2,
      renameBlocked: true,
    });
    const reset = await audits("ops.house_name_reset");
    expect(reset.at(-1)?.after).toMatchObject({ resets: 2, autoBlocked: true, renameBlocked: true });
    // 운영자가 푼다 → 새 이름을 정한다
    expect(await service.opsSetRenameBlocked(ops, { userId: leader, blocked: false })).toEqual({ ok: true });
    expect((await audits("ops.house_rename_block")).at(-1)?.after).toEqual({ renameBlocked: false });
    expect((await save(leader, "착한가문", "BAD")).identity?.name).toBe("착한가문");
  });
});
