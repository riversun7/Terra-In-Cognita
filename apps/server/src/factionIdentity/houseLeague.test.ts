import { describe, expect, it } from "vitest";
import {
  type HouseLeague,
  delegateHouseLeague,
  foundHouseLeague,
  joinHouseLeague,
  leaveHouseLeague,
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
