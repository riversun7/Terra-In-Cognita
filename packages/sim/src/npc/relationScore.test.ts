// NPC 관계 점수 몫 시험(relationScore.ts — 줄기 npc-diplo, D-255 "NPC 외교 AI는 점수로 판단한다", 질문 2663)
import { describe, expect, it } from "vitest";
import { type FactionView, type RivalView, peaceScore, scoreActions } from "./brain.ts";
import { TEST_NPC_COEFFICIENTS as c } from "./coefficients.ts";
import {
  joinRatioPm,
  npcJoinsWarScored,
  peaceRelationOffset,
  relationTerm,
  warRelationOffset,
} from "./relationScore.ts";

const me: FactionView = {
  id: 1,
  traits: { aggression: 700, commerce: 500, faith: 500, station: 500 },
  cities: 2,
  strength: 300,
  treasury: 100_000n,
  satisfaction: 70,
  foodPm: 1000,
  crowded: false,
  foundCost: 5000n,
  research: null,
  sellableShares: false,
  poor: false,
  overlord: null,
  vassals: 0,
  restores: [],
  claims: [],
};

const rival = (over: Partial<RivalView> = {}): RivalView => ({
  id: 2,
  strength: 100,
  takeable: 2,
  atWar: false,
  truce: false,
  related: false,
  rebel: false,
  ...over,
});

const scoreOf = (kind: string, rivals: readonly RivalView[]): number | undefined =>
  scoreActions(me, rivals, c).find((entry) => entry.action.kind === kind)?.score;

describe("관계 몫(호감·신뢰 −100~100)", () => {
  it("값이 없거나 0이면 몫 0(시뮬 — 판정 그대로)", () => {
    expect(relationTerm({}, 150, 100)).toBe(0);
    expect(warRelationOffset({}, c)).toBe(0);
    expect(peaceRelationOffset({ affinity: 0, trust: 0 }, c)).toBe(0);
    expect(joinRatioPm({}, c)).toBe(1000);
  });

  it("몫 = 호감 × 가중 ÷ 100 + 신뢰 × 가중 ÷ 100(0 쪽 자름, 범위 밖은 자른다)", () => {
    expect(relationTerm({ affinity: -80, trust: -30 }, 150, 100)).toBe(-120 - 30);
    expect(relationTerm({ affinity: 33, trust: 0 }, 150, 100)).toBe(49);
    expect(relationTerm({ affinity: -33 }, 150, 100)).toBe(-49);
    expect(relationTerm({ affinity: 500, trust: -500 }, 150, 100)).toBe(150 - 100);
    // 음수 가중은 0
    expect(relationTerm({ affinity: 50 }, -150, 0)).toBe(0);
  });
});

describe("NPC 판단 점수에 든다(brain.ts)", () => {
  it("새 선포: 호감·신뢰가 낮을수록 치기 점수가 오르고 높을수록 내려간다", () => {
    const neutral = scoreOf("attack", [rival()]);
    expect(neutral).toBeDefined();
    expect(scoreOf("attack", [rival({ affinity: -80 })])).toBe((neutral ?? 0) + 120);
    expect(scoreOf("attack", [rival({ trust: -30 })])).toBe((neutral ?? 0) + 30);
    expect(scoreOf("attack", [rival({ affinity: 60 })])).toBe((neutral ?? 0) - 90);
  });

  it("이미 하는 전쟁·반란 소탕은 관계 몫을 보지 않는다", () => {
    expect(scoreOf("attack", [rival({ atWar: true, affinity: -80 })])).toBe(
      scoreOf("attack", [rival({ atWar: true })]),
    );
    expect(scoreOf("attack", [rival({ rebel: true, affinity: -80 })])).toBe(
      scoreOf("attack", [rival({ rebel: true })]),
    );
  });

  it("치기 상대 고르기: 힘이 같으면 호감이 낮은 쪽을 고른다", () => {
    const picked = scoreActions(me, [rival({ id: 2 }), rival({ id: 3, affinity: -50 })], c).find(
      (entry) => entry.action.kind === "attack",
    );
    expect(picked?.action).toEqual({ kind: "attack", target: 3, declare: true });
  });

  it("강화: 호감·신뢰가 높을수록 제안·받기 점수가 오르고 낮을수록 내려간다(같은 식)", () => {
    const war = rival({ atWar: true });
    const neutral = scoreOf("peace", [war]) ?? 0;
    expect(scoreOf("peace", [rival({ atWar: true, affinity: 40 })])).toBe(neutral + 60);
    expect(scoreOf("peace", [rival({ atWar: true, affinity: -80, trust: -30 })])).toBe(neutral - 150);
    expect(peaceScore(me, rival({ atWar: true, affinity: -80 }), c)).toBe(peaceScore(me, war, c) - 120);
  });
});

describe("NPC 참전 답(서버 diplomacy가 부른다)", () => {
  it("중립이면 힘이 적 이상(옛 규칙), 호감이 높으면 약해도 들고 낮으면 더 세야 든다", () => {
    expect(npcJoinsWarScored(10, 10, {}, c)).toBe(true);
    expect(npcJoinsWarScored(9, 10, {}, c)).toBe(false);
    // 호감 +40 → 문턱 800‰
    expect(npcJoinsWarScored(8, 10, { affinity: 40 }, c)).toBe(true);
    // 호감 −40 → 1200‰
    expect(npcJoinsWarScored(11, 10, { affinity: -40 }, c)).toBe(false);
    expect(npcJoinsWarScored(12, 10, { affinity: -40 }, c)).toBe(true);
    // 요청국 신뢰 −60(위반 둘) → 1180‰
    expect(joinRatioPm({ trust: -60 }, c)).toBe(1180);
    // 문턱은 0 아래로 내려가지 않는다
    expect(
      joinRatioPm({ affinity: 100, trust: 100 }, { relationJoinAffinityPm: 2000, relationJoinTrustPm: 2000 }),
    ).toBe(0);
  });
});
