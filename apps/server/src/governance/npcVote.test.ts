// NPC 투표 규칙식(npcVote.ts — 질문 2361 나안): 점수 고르기 + 성향 + 만족도
import { describe, expect, it } from "vitest";
import { npcChallengers, npcRunScore, npcVoteChoice } from "./npcVote.ts";

const rules = { npcKeepSatisfaction: 50, npcWarTraitPm: 600 };
const traits = { aggression: 500, commerce: 500, faith: 500 };
const base = { incumbent: "n:1" as const, self: "n:2" as const, candidates: [], traits };

describe("npcVoteChoice", () => {
  it("선출: 자기 가문이 후보면 자기, 만족하면 현직, 아니면 먼저 등록한 도전자", () => {
    const candidates = ["p:9", "n:1", "p:8"] as const;
    expect(
      npcVoteChoice(
        { ...base, kind: "leader_election", candidates: [...candidates, "n:2"], satisfaction: 10 },
        rules,
      ),
    ).toBe("n:2");
    expect(
      npcVoteChoice(
        { ...base, kind: "leader_election", candidates: [...candidates], satisfaction: 80 },
        rules,
      ),
    ).toBe("n:1");
    expect(
      npcVoteChoice(
        { ...base, kind: "leader_election", candidates: [...candidates], satisfaction: 20 },
        rules,
      ),
    ).toBe("p:9");
    expect(npcVoteChoice({ ...base, kind: "leader_election", candidates: [], satisfaction: 20 }, rules)).toBe(
      "abstain",
    );
    // 해임된 가문은 고르지 않는다
    expect(
      npcVoteChoice(
        { ...base, kind: "leader_election", candidates: ["n:1", "p:9"], barred: "n:1", satisfaction: 80 },
        rules,
      ),
    ).toBe("p:9");
  });
  it("해임·체제 전환: 만족도가 낮으면 찬성, 높으면 반대", () => {
    expect(npcVoteChoice({ ...base, kind: "leader_removal", satisfaction: 20 }, rules)).toBe("yes");
    expect(npcVoteChoice({ ...base, kind: "leader_removal", satisfaction: 80 }, rules)).toBe("no");
    expect(
      npcVoteChoice(
        {
          ...base,
          kind: "regime_change",
          targetRegime: "capitalism",
          satisfaction: 50,
          traits: { ...traits, commerce: 900 },
        },
        rules,
      ),
    ).toBe("yes");
    expect(
      npcVoteChoice(
        {
          ...base,
          kind: "regime_change",
          targetRegime: "capitalism",
          satisfaction: 50,
          traits: { ...traits, faith: 900 },
        },
        rules,
      ),
    ).toBe("no");
    expect(
      npcVoteChoice({ ...base, kind: "regime_change", targetRegime: "capitalism", satisfaction: 50 }, rules),
    ).toBe("abstain");
  });
  it("선전포고: 공격 성향 문턱", () => {
    expect(
      npcVoteChoice(
        { ...base, kind: "war_declaration", satisfaction: 50, traits: { ...traits, aggression: 600 } },
        rules,
      ),
    ).toBe("yes");
    expect(
      npcVoteChoice(
        { ...base, kind: "war_declaration", satisfaction: 90, traits: { ...traits, aggression: 599 } },
        rules,
      ),
    ).toBe("no");
  });
});

describe("NPC 후보(질문 2404 나)", () => {
  const runRules = { npcKeepSatisfaction: 50, npcRunScore: 20, npcRunMax: 1 };
  it("출마 점수 = 만족도 모자람 × 2 + 공격 − 신앙", () => {
    expect(npcRunScore({ key: "n:3", id: 3, satisfaction: 40, traits }, runRules)).toBe(20);
    expect(
      npcRunScore(
        { key: "n:3", id: 3, satisfaction: 50, traits: { aggression: 1000, commerce: 500, faith: 0 } },
        runRules,
      ),
    ).toBe(100);
    expect(npcRunScore({ key: "n:3", id: 3, satisfaction: undefined, traits }, runRules)).toBe(0);
  });
  it("문턱 이상 가운데 점수 높은 차례로 상한까지(같으면 ID 작은 쪽), 상한 0이면 없다", () => {
    const houses = [
      { key: "n:4" as const, id: 4, satisfaction: 30, traits },
      { key: "n:3" as const, id: 3, satisfaction: 30, traits },
      { key: "n:5" as const, id: 5, satisfaction: 10, traits },
      { key: "n:6" as const, id: 6, satisfaction: 49, traits },
    ];
    expect(npcChallengers(houses, runRules)).toEqual(["n:5"]);
    expect(npcChallengers(houses, { ...runRules, npcRunMax: 3 })).toEqual(["n:5", "n:3", "n:4"]);
    expect(npcChallengers(houses, { ...runRules, npcRunMax: 0 })).toEqual([]);
  });
});
