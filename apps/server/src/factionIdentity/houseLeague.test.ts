import { describe, expect, it } from "vitest";
import {
  type HouseLeague,
  delegateHouseLeague,
  electHouseLeague,
  foundHouseLeague,
  houseLeagueVoteExpired,
  joinHouseLeague,
  leaveHouseLeague,
  pruneHouseLeague,
  voteHouseLeague,
} from "./houseLeague.ts";

const leagueOf = (result: ReturnType<typeof joinHouseLeague>): HouseLeague => {
  if (!result.ok || !result.league) throw new Error("연맹이 없다");
  return result.league;
};

describe("가문 연맹 조약(houseLeague.ts, D-587)", () => {
  it("만든 가문이 대표이자 첫 가문이다(2463)", () => {
    const league = foundHouseLeague(1, 10, 5);
    expect(league).toEqual({ id: 1, founder: 10, representative: 10, members: [10], createdAtMs: 5 });
  });

  it("가문은 스스로 골라야 든다(2462 다)", () => {
    const league = foundHouseLeague(1, 10, 0);
    expect(joinHouseLeague(league, 20, false)).toEqual({ ok: false, code: "consent_required" });
    const joined = leagueOf(joinHouseLeague(league, 20, true));
    expect(joined.members).toEqual([10, 20]);
    expect(joinHouseLeague(joined, 20, true)).toEqual({ ok: false, code: "already_member" });
  });

  it("대표는 든 가문에게 위임한다. 만든 가문 기록은 그대로다(2463)", () => {
    const league = leagueOf(joinHouseLeague(foundHouseLeague(1, 10, 0), 20, true));
    expect(delegateHouseLeague(league, 20, 10)).toEqual({ ok: false, code: "not_representative" });
    expect(delegateHouseLeague(league, 10, 30)).toEqual({ ok: false, code: "not_member" });
    expect(delegateHouseLeague(league, 10, 10)).toEqual({ ok: false, code: "same_house" });
    const handed = leagueOf(delegateHouseLeague(league, 10, 20));
    expect(handed.representative).toBe(20);
    expect(handed.founder).toBe(10);
  });

  it("대표는 위임하기 전에 나가지 못하고, 혼자 남은 대표가 나가면 연맹이 끝난다([임시] 2504)", () => {
    const league = leagueOf(joinHouseLeague(foundHouseLeague(1, 10, 0), 20, true));
    expect(leaveHouseLeague(league, 10)).toEqual({ ok: false, code: "representative_must_delegate" });
    expect(leaveHouseLeague(league, 30)).toEqual({ ok: false, code: "not_member" });
    const left = leagueOf(leaveHouseLeague(league, 20));
    expect(left.members).toEqual([10]);
    expect(leaveHouseLeague(left, 10)).toEqual({ ok: true, league: null });
  });
});

describe("연맹 대표 투표(npc-invest-2, 질문 2503 [임시])", () => {
  const league: HouseLeague = {
    id: 1,
    founder: 10,
    representative: 10,
    members: [10, 11, 12, 13],
    createdAtMs: 0,
  };
  it("든 가문 과반이 찍은 후보가 대표가 되고 표를 지운다", () => {
    let votes: ReadonlyMap<number, number> = new Map();
    for (const voter of [11, 12]) {
      const r = voteHouseLeague(league, votes, voter, 12);
      if (!r.ok) throw new Error(r.code);
      expect(r.elected).toBeNull();
      votes = r.votes;
    }
    const r = voteHouseLeague(league, votes, 13, 12);
    expect(r).toEqual({ ok: true, votes: new Map(), elected: 12 });
    expect(electHouseLeague(league, 12).representative).toBe(12);
  });
  it("든 가문이 아니면 표를 던지지도 받지도 못한다, 마지막 표만 센다", () => {
    expect(voteHouseLeague(league, new Map(), 99, 12)).toEqual({ ok: false, code: "not_member" });
    expect(voteHouseLeague(league, new Map(), 11, 99)).toEqual({ ok: false, code: "not_member" });
    const r = voteHouseLeague(league, new Map([[11, 12]]), 11, 13);
    expect(r.ok && [...r.votes]).toEqual([[11, 13]]);
  });
});

describe("투표 기간·정족수·사라진 가문 빼기(npc-fix-3, 질문 2562·2568)", () => {
  const league: HouseLeague = {
    id: 1,
    founder: 10,
    representative: 10,
    members: [10, 11, 12, 13],
    createdAtMs: 0,
  };
  it("정족수: 표를 던진 가문 몫이 모자라면 과반이어도 뽑히지 않는다", () => {
    const three = { ...league, members: [10, 11, 12] };
    // 셋 가운데 둘이 12 → 과반, 던진 몫 667‰
    expect(voteHouseLeague(three, new Map([[11, 12]]), 12, 12, 500)).toEqual({
      ok: true,
      votes: new Map(),
      elected: 12,
    });
    const r = voteHouseLeague(three, new Map([[11, 12]]), 12, 12, 700);
    expect(r.ok && r.elected).toBeNull();
  });
  it("투표 기간: 첫 표부터 기간이 지나면 끝난다(0이면 끝나지 않음)", () => {
    expect(houseLeagueVoteExpired(undefined, 10_000, { periodMs: 100 })).toBe(false);
    expect(houseLeagueVoteExpired(1_000, 1_099, { periodMs: 100 })).toBe(false);
    expect(houseLeagueVoteExpired(1_000, 1_100, { periodMs: 100 })).toBe(true);
    expect(houseLeagueVoteExpired(1_000, 10 ** 12, { periodMs: 0 })).toBe(false);
  });
  it("사라진 가문을 빼고, 대표가 사라졌으면 가장 오래 든 가문이 대표, 아무도 없으면 끝", () => {
    expect(pruneHouseLeague(league, () => true)).toBe(league);
    expect(pruneHouseLeague(league, (house) => house !== 12)).toEqual({ ...league, members: [10, 11, 13] });
    expect(pruneHouseLeague(league, (house) => house !== 10)).toEqual({
      ...league,
      members: [11, 12, 13],
      representative: 11,
    });
    expect(pruneHouseLeague(league, () => false)).toBeNull();
  });
});
