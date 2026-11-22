// 가문 연맹 저장·명령 시험 — npc-invest-2(질문 2502·2503), leagueService.ts·npcLeague.ts. NPC 판단은 DB 없이, 명령은 TEST_DATABASE_URL이 있을 때만.
// 계정은 시험용 가짜 값이다.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { createHouseLeagueService, leagueHouseKey, leagueHouseNum } from "./leagueService.ts";
import { loadLeagues } from "./leagueStore.ts";
import {
  type NpcLeagueRules,
  npcLeagueAffinity,
  npcLeagueChoice,
  npcLeagueLeaves,
  npcLeagueStartsVote,
  npcLeagueVoteFor,
} from "./npcLeague.ts";

/** 가문장 성향(나머지 축은 가운데 500) */
const traits = (openness: number, communalism: number, autonomy: number, boldness: number) => ({
  belligerence: 500,
  greed: 500,
  discipline: 500,
  openness,
  communalism,
  autonomy,
  boldness,
});
const RULES = { foundScore: 750, joinScore: 550 };
const byId = (x: number, y: number) => x - y;
/** NPC 대표가 부르지 않는 규칙(league-2 — 초대 문턱 1001) */
const NO_INVITE = { ...RULES, inviteScore: 1001 };

describe("NPC 가문 연맹 판단(npcLeague.ts)", () => {
  it("만들기 점수가 문턱을 넘으면 만들고, 연맹이 있으면 들기 점수로 가장 큰 연맹에 든다", () => {
    expect(npcLeagueChoice(traits(900, 100, 900, 900), [], RULES)).toEqual({ kind: "found" });
    const near = traits(600, 600, 100, 100);
    expect(npcLeagueChoice(traits(600, 600, 100, 100), [], RULES)).toBeUndefined();
    expect(
      npcLeagueChoice(
        traits(600, 600, 100, 100),
        [
          { id: 4, members: 2, representative: near },
          { id: 2, members: 2, representative: undefined },
          { id: 9, members: 1, representative: near },
        ],
        RULES,
      ),
    ).toEqual({ kind: "apply", leagueId: 2 });
    // 둘 다 넘으면 점수가 높은 쪽(같으면 들기)
    expect(
      npcLeagueChoice(
        traits(1000, 1000, 800, 800),
        [{ id: 1, members: 1, representative: undefined }],
        RULES,
      ),
    ).toEqual({
      kind: "apply",
      leagueId: 1,
    });
  });

  it("친밀도·나가기·투표 열기·표(npc-fix-3): 성향이 멀면 나가고, 덜 멀면 가장 가까운 가문을 찍어 투표를 연다", () => {
    const a = traits(1000, 1000, 1000, 1000);
    const far = traits(0, 0, 0, 0);
    const mid = traits(500, 500, 500, 500);
    expect(npcLeagueAffinity(a, a)).toBe(1000);
    // 네 축이 1000씩 다르다 → 1000 − 4000 ÷ 7
    expect(npcLeagueAffinity(a, far)).toBe(1000 - Math.floor(4000 / 7));
    expect(npcLeagueAffinity(a, undefined)).toBe(500);
    const rules = { ...RULES, leaveScore: 500, voteStartScore: 800 };
    expect(npcLeagueLeaves(a, far, false, rules)).toBe(true);
    expect(npcLeagueLeaves(a, far, true, rules)).toBe(false);
    expect(npcLeagueLeaves(a, mid, false, rules)).toBe(false);
    expect(npcLeagueStartsVote(a, mid, false, rules)).toBe(true);
    expect(npcLeagueStartsVote(a, a, false, rules)).toBe(false);
    expect(npcLeagueStartsVote(a, far, false, { ...rules, voteStartScore: 0 })).toBe(false);
    const members = [
      { house: -1, traits: far },
      { house: -2, traits: a },
      { house: -3, traits: mid },
      { house: 7, traits: undefined },
    ];
    expect(npcLeagueVoteFor({ house: -2, traits: a }, members, -1)).toBe(-3);
    // 대표는 자기를 찍는다
    expect(npcLeagueVoteFor({ house: -1, traits: far }, members, -1)).toBe(-1);
    // 같으면 지금 대표
    expect(npcLeagueVoteFor({ house: -3, traits: undefined }, members, 7)).toBe(7);
    // 나가기 문턱 아래인 대표의 연맹에는 들지 않는다
    expect(npcLeagueChoice(a, [{ id: 1, members: 5, representative: far }], rules)).toEqual({
      kind: "found",
    });
  });

  it("가문 열쇠 ↔ 수", () => {
    expect(leagueHouseNum("p:12")).toBe(12);
    expect(leagueHouseNum("n:5")).toBe(-5);
    expect(leagueHouseKey(-5)).toBe("n:5");
    expect(leagueHouseKey(12)).toBe("p:12");
  });
});

describe.skipIf(!TEST_DATABASE_URL)("가문 연맹 명령 (DB)", () => {
  let test: TestDatabase;
  let serial = 0;
  const sql = (text: string, values: unknown[] = []) => test.db.$client.query(text, values);

  beforeAll(async () => {
    test = await createTestDatabase();
  });
  afterAll(async () => {
    await test.drop();
  });

  /** 플레이어 가문 하나와 그 가문장(사용자 ID) */
  const house = async (): Promise<{ user: string; id: number }> => {
    serial += 1;
    const login = `fake_lg${serial}`;
    const user =
      (
        await rows<{ id: string }>(
          test.db,
          "insert into users (name, email, username) values ($1, $2, $3) returning id",
          [login, `${login}@league.placeholder.invalid`, login],
        )
      )[0]?.id ?? "";
    const id = Number(
      (await rows<{ id: string }>(test.db, "insert into factions (kind) values ('player') returning id"))[0]
        ?.id,
    );
    await sql(
      "insert into house_members (user_id, faction_id, role, joined_at_ms) values ($1, $2, 'leader', 0)",
      [user, id],
    );
    return { user, id };
  };

  it("만들기·신청·승인·초대·수락·위임·투표·나가기(대표 승계)가 표에 남고, NPC 가문은 신청하고 NPC 대표가 받는다(league-2)", async () => {
    let clock = 1_000;
    const service = createHouseLeagueService({ pool: test.db.$client, now: () => ++clock });
    const a = await house();
    const b = await house();
    const c = await house();
    const made = await service.command(a.user, { action: "found" });
    expect(made.ok).toBe(true);
    const leagueId = made.ok ? (made.leagueId ?? 0) : 0;
    // b는 신청(pending) → a가 승인
    expect(await service.command(b.user, { action: "join", leagueId })).toEqual({
      ok: true,
      leagueId,
      pending: true,
    });
    expect(await service.command(c.user, { action: "approve", leagueId, house: `p:${b.id}` })).toEqual({
      ok: false,
      code: "not_representative",
    });
    expect(await service.command(a.user, { action: "approve", leagueId, house: `p:${b.id}` })).toEqual({
      ok: true,
      leagueId,
    });
    expect(await service.command(b.user, { action: "join", leagueId })).toEqual({
      ok: false,
      code: "already_member",
    });
    // c는 a가 초대 → c가 수락
    expect(await service.command(a.user, { action: "invite", leagueId, house: `p:${c.id}` })).toEqual({
      ok: true,
      leagueId,
      pending: true,
    });
    expect((await service.list())[0]?.requests).toEqual([{ house: `p:${c.id}`, kind: "invite" }]);
    expect(await service.command(c.user, { action: "join", leagueId })).toEqual({ ok: true, leagueId });
    expect((await service.list())[0]?.requests).toEqual([]);
    // 조항 카드: 대표만, 모르는 카드는 invalid_clause
    expect(await service.command(b.user, { action: "clause_on", leagueId, clause: "shared_vision" })).toEqual(
      {
        ok: false,
        code: "not_representative",
      },
    );
    expect(await service.command(a.user, { action: "clause_on", leagueId, clause: "nope" })).toEqual({
      ok: false,
      code: "invalid_clause",
    });
    expect(await service.command(a.user, { action: "clause_on", leagueId, clause: "fee_discount" })).toEqual({
      ok: true,
      leagueId,
    });
    expect([...service.ties.partnersOf("fee_discount", a.id)].toSorted(byId)).toEqual(
      [b.id, c.id].toSorted(byId),
    );
    expect(service.ties.partnersOf("shared_vision", a.id).size).toBe(0);
    // 투표: 셋 가운데 둘이 c를 찍으면 c가 대표
    expect(await service.command(b.user, { action: "vote", leagueId, house: `p:${c.id}` })).toEqual({
      ok: true,
      leagueId,
    });
    expect((await service.list())[0]?.representative).toBe(`p:${a.id}`);
    expect(await service.command(c.user, { action: "vote", leagueId, house: `p:${c.id}` })).toEqual({
      ok: true,
      leagueId,
    });
    expect((await service.list())[0]?.representative).toBe(`p:${c.id}`);
    // 대표(c)가 그냥 나간다 → 가장 오래 든 a가 대표(D-590 2504 나)
    expect(await service.command(c.user, { action: "leave", leagueId })).toEqual({ ok: true, leagueId });
    expect((await service.list())[0]).toMatchObject({
      representative: `p:${a.id}`,
      members: [`p:${a.id}`, `p:${b.id}`],
      clauses: ["fee_discount"],
    });
    // 가문장이 아니면 못 한다
    expect(await service.command("00000000-0000-4000-8000-000000000000", { action: "found" })).toEqual({
      ok: false,
      code: "not_house_head",
    });
    // NPC 가문: 7은 만들고(만들기 점수 900), 8은 가장 큰 연맹(플레이어 연맹)에 신청 — 대표가 플레이어라 기다린다
    expect(
      await service.npcSweep(
        {
          houses: [
            { houseId: 8, traits: traits(700, 700, 100, 100) },
            { houseId: 7, traits: traits(900, 100, 900, 900) },
          ],
        },
        NO_INVITE,
      ),
    ).toEqual({ joined: 1, requested: 1, left: 0, votes: 0, pruned: 0 });
    expect((await service.list())[0]?.requests).toEqual([{ house: "n:8", kind: "apply" }]);
    // 플레이어 대표가 승인하면 든다
    expect(await service.command(a.user, { action: "approve", leagueId, house: "n:8" })).toEqual({
      ok: true,
      leagueId,
    });
    const stored = await loadLeagues(test.db.$client);
    expect(stored.leagues.map((league) => [league.representativeKey, league.members])).toEqual([
      [`p:${a.id}`, [`p:${a.id}`, `p:${b.id}`, "n:8"]],
      ["n:7", ["n:7"]],
    ]);
    // 다시 돌려도 이미 든 NPC 가문은 그대로
    expect(
      await service.npcSweep({ houses: [{ houseId: 8, traits: traits(700, 700, 100, 100) }] }, NO_INVITE),
    ).toEqual({ joined: 0, requested: 0, left: 0, votes: 0, pruned: 0 });
  });

  it("league-2: NPC 대표는 가까운 NPC 가문을 초대하고, 초대받은 NPC 가문은 성향으로 받거나 거절한다. 신청은 NPC 대표가 받는다", async () => {
    await sql("update house_leagues set ended_at_ms = 1 where ended_at_ms is null");
    let clock = 70_000;
    const service = createHouseLeagueService({ pool: test.db.$client, now: () => ++clock });
    const founder = traits(900, 600, 900, 900);
    // 만들기 점수 500(문턱 750 아래) → 스스로 만들지 않고 신청한다
    const near = traits(900, 600, 300, 300);
    const shy = traits(100, 100, 100, 100);
    const rules = { foundScore: 750, joinScore: 550, leaveScore: 300, voteStartScore: 0, inviteScore: 600 };
    // 41이 만든다. 42(가깝다, 들기 점수 750)는 같은 판에서 신청해 41이 받는다(대표 판단 ⑥이 신청 ④ 뒤)
    const first = await service.npcSweep(
      {
        houses: [
          { houseId: 41, traits: founder },
          { houseId: 42, traits: near },
        ],
      },
      { ...rules, foundScore: 1001 },
    );
    // 만들기 문턱 1001 → 아무도 만들지 않는다
    expect(first).toEqual({ joined: 0, requested: 0, left: 0, votes: 0, pruned: 0 });
    const second = await service.npcSweep({ houses: [{ houseId: 41, traits: founder }] }, rules);
    expect(second.joined).toBe(1);
    const third = await service.npcSweep(
      {
        houses: [
          { houseId: 41, traits: founder },
          { houseId: 42, traits: near },
        ],
      },
      rules,
    );
    // 42는 신청(④) → 41이 받는다(⑥)
    expect(third).toMatchObject({ joined: 1, requested: 1 });
    const mine = async () => (await service.list()).find((league) => league.representative === "n:41");
    expect((await mine())?.members).toEqual(["n:41", "n:42"]);
    // 43(성향이 멀다)는 스스로 신청하지 않는다(들기 점수 100). 대표 41은 친밀도 문턱 600 아래라 부르지 않는다
    const shyRun = await service.npcSweep(
      {
        houses: [
          { houseId: 41, traits: founder },
          { houseId: 43, traits: shy },
        ],
      },
      rules,
    );
    expect(shyRun.requested).toBe(0);
    // 초대 문턱 0이면 43을 부르고, 43은 다음 판에 거절한다(들기 점수 100 < 550)
    const invited = await service.npcSweep(
      {
        houses: [
          { houseId: 41, traits: founder },
          { houseId: 43, traits: shy },
        ],
      },
      { ...rules, inviteScore: 0 },
    );
    expect(invited.requested).toBe(1);
    expect((await mine())?.requests).toEqual([{ house: "n:43", kind: "invite" }]);
    await service.npcSweep(
      {
        houses: [
          { houseId: 41, traits: founder },
          { houseId: 43, traits: shy },
        ],
      },
      rules,
    );
    expect((await mine())?.requests).toEqual([]);
    expect((await mine())?.members).toEqual(["n:41", "n:42"]);
  });

  it("npc-fix-3: NPC 가문이 열린 투표에 표를 던지고, 기간이 지나면 투표가 끝나며, 사라진 가문은 빠진다", async () => {
    // 앞 시험의 연맹은 끝낸다(NPC 가문이 가장 큰 연맹에 들므로 이 시험의 연맹만 남긴다)
    await sql("update house_leagues set ended_at_ms = 1 where ended_at_ms is null");
    let clock = 10_000;
    const service = createHouseLeagueService({
      pool: test.db.$client,
      now: () => clock,
      voteRules: () => ({ periodMs: 1_000, quorumPm: 500 }),
    });
    const a = await house();
    const b = await house();
    const made = await service.command(a.user, { action: "found" });
    const leagueId = made.ok ? (made.leagueId ?? 0) : 0;
    await service.command(b.user, { action: "join", leagueId });
    await service.command(a.user, { action: "approve", leagueId, house: `p:${b.id}` });
    // NPC 가문 21·22가 든다(들기 점수 700, 대표 = 플레이어 → 성향을 몰라 가운데)
    const joiner = traits(700, 700, 100, 100);
    const npc = [
      { houseId: 21, traits: joiner },
      { houseId: 22, traits: joiner },
    ];
    clock += 1;
    // league-2: NPC는 신청 → 플레이어 대표(a)가 받는다
    expect((await service.npcSweep({ houses: npc }, RULES)).requested).toBe(2);
    await service.command(a.user, { action: "approve", leagueId, house: "n:21" });
    await service.command(a.user, { action: "approve", leagueId, house: "n:22" });
    // b가 자기를 찍어 투표를 연다 → NPC 둘은 가장 가까운 가문(서로 — 성향이 같다)을 찍는다: 21 → 22, 22 → 21 → 과반 없음
    clock += 1;
    await service.command(b.user, { action: "vote", leagueId, house: `p:${b.id}` });
    expect((await service.npcSweep({ houses: npc }, RULES)).votes).toBe(2);
    const view = async () => (await service.list()).find((league) => league.id === leagueId);
    expect((await view())?.representative).toBe(`p:${a.id}`);
    const stored = async () =>
      (await loadLeagues(test.db.$client)).votes.filter((vote) => vote.leagueId === leagueId).length;
    expect(await stored()).toBe(3);
    // 기간이 지나면 표를 모두 지운다
    clock += 1_000;
    expect((await service.npcSweep({ houses: npc }, { ...RULES, voteStartScore: 0 })).votes).toBe(0);
    expect(await stored()).toBe(0);
    // 대표(a) 가문 해산 + NPC 22가 사라짐 → 가장 오래 든 b가 대표, 22는 빠진다
    await sql("update factions set dissolved_at_ms = 1 where id = $1", [a.id]);
    const r = await service.npcSweep(
      { houses: [npc[0] ?? { houseId: 21, traits: joiner }], liveNpcHouses: new Set([21]) },
      { ...RULES, voteStartScore: 0 },
    );
    expect(r.pruned).toBe(2);
    expect(await view()).toMatchObject({ representative: `p:${b.id}`, members: [`p:${b.id}`, "n:21"] });
    expect(
      (await loadLeagues(test.db.$client)).leagues.find((league) => league.id === leagueId),
    ).toMatchObject({
      representativeKey: `p:${b.id}`,
      members: [`p:${b.id}`, "n:21"],
    });
  });

  it("npc-fix-3: 대표와 성향이 먼 NPC 가문은 나간다", async () => {
    await sql("update house_leagues set ended_at_ms = 1 where ended_at_ms is null");
    const service = createHouseLeagueService({ pool: test.db.$client, now: () => 50_000 });
    // NPC 31이 만들고(대표), 32가 든 뒤 대표 성향이 아주 멀어 나간다
    const founder = traits(900, 100, 900, 900);
    const joiner = traits(700, 700, 100, 100);
    const sweep = (rules: NpcLeagueRules) =>
      service.npcSweep(
        {
          houses: [
            { houseId: 31, traits: founder },
            { houseId: 32, traits: joiner },
          ],
        },
        rules,
      );
    const first = await sweep({ ...RULES, leaveScore: 0, voteStartScore: 0 });
    expect(first.joined).toBe(2);
    const leagueOf32 = async () =>
      (await service.list()).find((league) => league.members.includes("n:32"))?.representative;
    expect(await leagueOf32()).toBe("n:31");
    // 대표(31)는 나가지 않고, 32는 나간 뒤 다시 들지 않는다(나가기 문턱 아래 대표의 연맹은 들 후보가 아니다)
    expect(await sweep({ ...RULES, leaveScore: 1001, voteStartScore: 0 })).toEqual({
      joined: 0,
      requested: 0,
      left: 1,
      votes: 0,
      pruned: 0,
    });
    expect(await leagueOf32()).toBeUndefined();
    expect((await service.list()).map((league) => league.members)).toEqual([["n:31"]]);
  });
});
