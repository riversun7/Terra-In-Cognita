// 빈자리 도시 독립 투표(질문 2434 (가) 답 D-583) — 열 도시 고르기·도시 투표권 나라 모양
import { describe, expect, it } from "vitest";
import { cityElectorateNation, citiesToVote } from "./cityVotes.ts";
import type { GovernanceNation } from "./port.ts";

const nation: GovernanceNation = {
  rowId: 10,
  ownerId: 3,
  code: "n",
  playerHouse: false,
  regime: "democracy",
  traits: { aggression: 500, commerce: 500, faith: 500 },
  cities: [1, 2, 3],
};

describe("빈자리 도시 독립 투표", () => {
  it("시작 도시와 이 빈자리 동안 이미 연 도시는 빼다", () => {
    const agendas = [
      { kind: "city_independence" as const, payload: { cityId: 2 }, openedAtMs: 500 },
      // 지난 빈자리 때 연 것은 세지 않는다
      { kind: "city_independence" as const, payload: { cityId: 3 }, openedAtMs: 50 },
      { kind: "leader_election" as const, payload: {}, openedAtMs: 600 },
    ];
    expect(citiesToVote(nation, 100, agendas, (cityId) => cityId === 1)).toEqual([3]);
  });

  it("도시 독립 투표의 투표권은 그 도시만 든 나라 모양으로 센다", () => {
    expect(
      cityElectorateNation({ kind: "city_independence", payload: { cityId: 2 } }, nation).cities,
    ).toEqual([2]);
    expect(cityElectorateNation({ kind: "war_declaration", payload: {} }, nation)).toBe(nation);
  });
});
