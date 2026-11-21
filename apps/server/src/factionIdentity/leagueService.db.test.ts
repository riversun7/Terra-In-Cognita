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
    ).toEqual({ kind: "join", leagueId: 2 });
    // 둘 다 넘으면 점수가 높은 쪽(같으면 들기)
    expect(
      npcLeagueChoice(
        traits(1000, 1000, 800, 800),
        [{ id: 1, members: 1, representative: undefined }],
        RULES,
      ),
    ).toEqual({
      kind: "join",
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

  it("만들기·들기·위임·투표·나가기가 표에 남고, NPC 가문은 판단으로 만들고 든다", async () => {
    let clock = 1_000;
    const service = createHouseLeagueService({ pool: test.db.$client, now: () => ++clock });
    const a = await house();
    const b = await house();
    const c = await house();
    const made = await service.command(a.user, { action: "found" });
    expect(made.ok).toBe(true);
    const leagueId = made.ok ? (made.leagueId ?? 0) : 0;
    expect(await service.command(b.user, { action: "join", leagueId })).toEqual({ ok: true, leagueId });
    expect(await service.command(b.user, { action: "join", leagueId })).toEqual({
      ok: false,
      code: "already_member",
    });
    expect(await service.command(c.user, { action: "join", leagueId })).toEqual({ ok: true, leagueId });
    // 대표(a)는 위임 전에는 못 나간다
    expect(await service.command(a.user, { action: "leave", leagueId })).toEqual({
      ok: false,
      code: "representative_must_delegate",
    });
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
    // 위임: c → a, 그 뒤 c는 나갈 수 있다
    expect(await service.command(c.user, { action: "delegate", leagueId, house: `p:${a.id}` })).toEqual({
      ok: true,
      leagueId,
    });
    expect(await service.command(c.user, { action: "leave", leagueId })).toEqual({ ok: true, leagueId });
    // 가문장이 아니면 못 한다
    expect(await service.command("00000000-0000-4000-8000-000000000000", { action: "found" })).toEqual({
      ok: false,
      code: "not_house_head",
    });
    // NPC 가문: 7은 만들고(만들기 점수 900), 8은 그 연맹 가운데 가장 큰 곳에 든다
    expect(
      await service.npcSweep(
        {
          houses: [
            { houseId: 8, traits: traits(700, 700, 100, 100) },
            { houseId: 7, traits: traits(900, 100, 900, 900) },
          ],
        },
        RULES,
      ),
    ).toEqual({ joined: 2, left: 0, votes: 0, pruned: 0 });
    const stored = await loadLeagues(test.db.$client);
    expect(stored.leagues.map((league) => [league.representativeKey, league.members])).toEqual([
      [`p:${a.id}`, [`p:${a.id}`, `p:${b.id}`, "n:8"]],
      ["n:7", ["n:7"]],
    ]);
    // 다시 돌려도 이미 든 NPC 가문은 그대로
    expect(
      await service.npcSweep({ houses: [{ houseId: 8, traits: traits(700, 700, 100, 100) }] }, RULES),
    ).toEqual({ joined: 0, left: 0, votes: 0, pruned: 0 });
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
    // NPC 가문 21·22가 든다(들기 점수 700, 대표 = 플레이어 → 성향을 몰라 가운데)
    const joiner = traits(700, 700, 100, 100);
    const npc = [
      { houseId: 21, traits: joiner },
      { houseId: 22, traits: joiner },
    ];
    clock += 1;
    expect((await service.npcSweep({ houses: npc }, RULES)).joined).toBe(2);
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
      left: 1,
      votes: 0,
      pruned: 0,
    });
    expect(await leagueOf32()).toBeUndefined();
    expect((await service.list()).map((league) => league.members)).toEqual([["n:31"]]);
  });
});
