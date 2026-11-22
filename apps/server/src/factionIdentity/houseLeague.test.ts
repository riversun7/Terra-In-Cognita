import { describe, expect, it } from "vitest";
import {
  type HouseLeague,
  applyHouseLeague,
  approveHouseLeague,
  declineHouseLeague,
  delegateHouseLeague,
  inviteHouseLeague,
  setHouseLeagueClause,
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

  it("대표가 나가면 가장 오래 든 가문이 대표, 혼자 남은 대표가 나가면 연맹이 끝난다(D-590 2504 나)", () => {
    const three = leagueOf(
      joinHouseLeague(leagueOf(joinHouseLeague(foundHouseLeague(1, 10, 0), 20, true)), 30, true),
    );
    const repLeft = leagueOf(leaveHouseLeague(three, 10));
    expect(repLeft.members).toEqual([20, 30]);
    expect(repLeft.representative).toBe(20);
    expect(repLeft.founder).toBe(10);
    expect(leaveHouseLeague(three, 40)).toEqual({ ok: false, code: "not_member" });
    const left = leagueOf(leaveHouseLeague(three, 30));
    expect(left.members).toEqual([10, 20]);
    expect(left.representative).toBe(10);
    const alone = foundHouseLeague(2, 10, 0);
    expect(leaveHouseLeague(alone, 10)).toEqual({ ok: true, league: null });
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

describe("연맹 들기 절차·조항 카드(league-2, D-590 2502 다·2501 다)", () => {
  const league = foundHouseLeague(1, 10, 0);
  const none = new Map<number, "invite" | "apply">();

  it("대표가 초대 → 그 가문장이 수락하면 든다", () => {
    expect(inviteHouseLeague(league, none, 20, 30)).toEqual({ ok: false, code: "not_representative" });
    expect(inviteHouseLeague(league, none, 10, 10)).toEqual({ ok: false, code: "already_member" });
    const invited = inviteHouseLeague(league, none, 10, 30);
    if (!invited.ok) throw new Error("초대 실패");
    expect(invited.joined).toBeNull();
    expect(invited.requests.get(30)).toBe("invite");
    const accepted = applyHouseLeague(invited.league, invited.requests, 30);
    if (!accepted.ok) throw new Error("수락 실패");
    expect(accepted.joined).toBe(30);
    expect(accepted.league.members).toEqual([10, 30]);
    expect(accepted.requests.size).toBe(0);
  });

  it("가문장이 신청 → 대표가 승인하면 든다. 신청한 가문을 초대해도 든다", () => {
    const applied = applyHouseLeague(league, none, 40);
    if (!applied.ok) throw new Error("신청 실패");
    expect(applied.joined).toBeNull();
    expect(applied.requests.get(40)).toBe("apply");
    expect(approveHouseLeague(league, applied.requests, 40, 40)).toEqual({
      ok: false,
      code: "not_representative",
    });
    expect(approveHouseLeague(league, none, 10, 40)).toEqual({ ok: false, code: "no_request" });
    const approved = approveHouseLeague(league, applied.requests, 10, 40);
    if (!approved.ok) throw new Error("승인 실패");
    expect(approved.league.members).toEqual([10, 40]);
    const viaInvite = inviteHouseLeague(league, applied.requests, 10, 40);
    if (!viaInvite.ok) throw new Error("초대 실패");
    expect(viaInvite.joined).toBe(40);
  });

  it("거절·거두기: 대표는 남의 것을, 가문장은 자기 것을 지운다", () => {
    const requests = new Map<number, "invite" | "apply">([
      [30, "invite"],
      [40, "apply"],
    ]);
    expect(declineHouseLeague(league, requests, 30, 40)).toEqual({ ok: false, code: "not_representative" });
    const own = declineHouseLeague(league, requests, 30);
    if (!own.ok) throw new Error("거절 실패");
    expect([...own.requests.keys()]).toEqual([40]);
    const rep = declineHouseLeague(league, requests, 10, 40);
    if (!rep.ok) throw new Error("거절 실패");
    expect([...rep.requests.keys()]).toEqual([30]);
    expect(declineHouseLeague(league, requests, 50)).toEqual({ ok: false, code: "no_request" });
  });

  it("조항 카드는 대표만 붙이고 뗀다. 겹치거나 없는 카드는 invalid_clause", () => {
    expect(setHouseLeagueClause(league, new Set(), 20, "shared_vision", true)).toEqual({
      ok: false,
      code: "not_representative",
    });
    const on = setHouseLeagueClause(league, new Set(), 10, "shared_vision", true);
    if (!on.ok) throw new Error("붙이기 실패");
    expect([...on.clauses]).toEqual(["shared_vision"]);
    expect(setHouseLeagueClause(league, on.clauses, 10, "shared_vision", true)).toEqual({
      ok: false,
      code: "invalid_clause",
    });
    const off = setHouseLeagueClause(league, on.clauses, 10, "shared_vision", false);
    if (!off.ok) throw new Error("떼기 실패");
    expect(off.clauses.size).toBe(0);
    expect(setHouseLeagueClause(league, off.clauses, 10, "fee_discount", false)).toEqual({
      ok: false,
      code: "invalid_clause",
    });
  });
});
