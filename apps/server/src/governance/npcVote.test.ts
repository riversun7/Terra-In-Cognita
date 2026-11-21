// NPC 투표 규칙식(npcVote.ts — 질문 2361 나안): 점수 고르기 + 성향 + 만족도
import { describe, expect, it } from "vitest";
import { npcVoteChoice } from "./npcVote.ts";

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
