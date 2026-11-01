import { createRng } from "@terra/shared";
import { describe, expect, it } from "vitest";
import {
  type FactionView,
  type RivalView,
  chooseAction,
  decideAction,
  peaceScore,
  scoreActions,
} from "./brain.ts";
import { TEST_NPC_COEFFICIENTS as c } from "./coefficients.ts";
import { inheritTraits, rollTraits, type Traits } from "./traits.ts";

const calm: Traits = { aggression: 100, commerce: 500, faith: 500, station: 500 };
const warlike: Traits = { aggression: 900, commerce: 200, faith: 200, station: 500 };

function view(over: Partial<FactionView> = {}): FactionView {
  return {
    id: 1,
    traits: calm,
    cities: 2,
    strength: 100,
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
    ...over,
  };
}

function rival(over: Partial<RivalView> = {}): RivalView {
  return {
    id: 2,
    strength: 40,
    takeable: 1,
    atWar: false,
    truce: false,
    related: false,
    rebel: false,
    ...over,
  };
}

describe("성향(D-327, 질문 192 가)", () => {
  it("축마다 범위 안 정수, 같은 시드는 같은 값", () => {
    const a = rollTraits(createRng(7), c);
    expect(rollTraits(createRng(7), c)).toEqual(a);
    for (const value of Object.values(a)) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(c.traitMin);
      expect(value).toBeLessThanOrEqual(c.traitMax);
    }
  });

  it("유동 세력은 부모 값 ± 폭 안(범위에서 자름)", () => {
    const parent: Traits = { aggression: 950, commerce: 20, faith: 500, station: 500 };
    for (let seed = 0; seed < 50; seed++) {
      const child = inheritTraits(parent, createRng(seed), c);
      expect(Math.abs(child.aggression - parent.aggression)).toBeLessThanOrEqual(c.traitDrift);
      expect(child.aggression).toBeLessThanOrEqual(c.traitMax);
      expect(child.commerce).toBeGreaterThanOrEqual(c.traitMin);
      expect(Math.abs(child.faith - parent.faith)).toBeLessThanOrEqual(c.traitDrift);
    }
  });
});

describe("판단 틀(D-323): 지표 → 후보 점수 → 가장 높은 행동", () => {
  it("할 만한 것이 없으면 쉰다", () => {
    expect(decideAction(view(), [], 0, c)).toEqual({ kind: "idle" });
  });

  it("공격 성향이 높고 힘이 세면 약한 이웃을 친다(새 선포)", () => {
    const action = decideAction(view({ traits: warlike }), [rival()], 0, c);
    expect(action).toEqual({ kind: "attack", target: 2, declare: true });
  });

  it("공격 성향이 낮으면 같은 상황에서 치지 않는다", () => {
    expect(decideAction(view(), [rival()], 0, c).kind).not.toBe("attack");
  });

  it("힘 비가 모자라거나 불가침·상하 관계·칠 도시가 없으면 치지 않는다", () => {
    const me = view({ traits: warlike });
    expect(decideAction(me, [rival({ strength: 90 })], 0, c).kind).toBe("idle");
    expect(decideAction(me, [rival({ truce: true })], 0, c).kind).toBe("idle");
    expect(decideAction(me, [rival({ related: true })], 0, c).kind).toBe("idle");
    expect(decideAction(me, [rival({ takeable: 0 })], 0, c).kind).toBe("idle");
  });

  it("만족도가 낮으면 치지 않는다(전쟁은 만족도를 낮춘다)", () => {
    const action = decideAction(view({ traits: warlike, satisfaction: 50 }), [rival()], 0, c);
    expect(action.kind).not.toBe("attack");
  });

  it("이미 전쟁 중인 상대가 새 상대보다 먼저다(선포가 아님)", () => {
    const action = decideAction(
      view({ traits: warlike }),
      [rival({ id: 2, strength: 30 }), rival({ id: 3, strength: 50, atWar: true })],
      0,
      c,
    );
    expect(action).toEqual({ kind: "attack", target: 3, declare: false });
  });

  it("다음 기술 단계가 연구 시설에 막혀 있으면 연구 시설을 올린다", () => {
    const action = decideAction(view({ research: { cost: 2000n, blocked: true } }), [], 0, c);
    expect(action).toEqual({ kind: "research" });
  });

  it("연구 시설 값의 예비금이 없으면 올리지 않는다", () => {
    const action = decideAction(
      view({ treasury: 3000n, research: { cost: 2000n, blocked: true } }),
      [],
      0,
      c,
    );
    expect(action.kind).toBe("idle");
  });

  it("붐비는 도시가 있고 돈이 있으면 마을을 세운다", () => {
    expect(decideAction(view({ crowded: true }), [], 0, c)).toEqual({ kind: "found" });
    expect(decideAction(view({ crowded: true, treasury: 6000n }), [], 0, c).kind).toBe("idle");
  });

  it("국고가 모자라면 상업 성향 세력은 지분을 판다", () => {
    const merchant: Traits = { aggression: 100, commerce: 900, faith: 100, station: 500 };
    const action = decideAction(view({ traits: merchant, poor: true, sellableShares: true }), [], 0, c);
    expect(action).toEqual({ kind: "sell_shares" });
  });

  it("지는 전쟁·지친 백성이면 강화를 제안한다", () => {
    const action = decideAction(
      view({ satisfaction: 45 }),
      [rival({ id: 5, strength: 150, atWar: true })],
      0,
      c,
    );
    expect(action).toEqual({ kind: "peace", target: 5 });
  });

  it("상위 세력보다 세지면 공격 성향 봉신은 독립을 선언한다", () => {
    const action = decideAction(
      view({ traits: warlike, overlord: { id: 9, strength: 80 } }),
      [rival({ id: 9, related: true, strength: 80 })],
      0,
      c,
    );
    expect(action).toEqual({ kind: "break_vassal" });
  });

  it("같은 점수는 굴림으로 고르고, 점수 목록은 결정적이다", () => {
    const scored = [
      { action: { kind: "found" } as const, score: 500 },
      { action: { kind: "research" } as const, score: 500 },
      { action: { kind: "idle" } as const, score: 100 },
    ];
    expect(chooseAction(scored, 0)).toEqual({ kind: "found" });
    expect(chooseAction(scored, 1)).toEqual({ kind: "research" });
    const me = view({ traits: warlike, crowded: true, research: { cost: 10n, blocked: false } });
    expect(scoreActions(me, [rival()], c)).toEqual(scoreActions(me, [rival()], c));
  });

  it("강화 수락: 이기고 있는 공격 성향 세력은 받지 않고, 지는 쪽·순한 쪽은 받는다", () => {
    const proposer = rival({ id: 2, strength: 40, atWar: true });
    expect(peaceScore(view({ traits: warlike, strength: 100 }), proposer, c)).toBeLessThanOrEqual(0);
    expect(peaceScore(view({ traits: calm, strength: 100 }), proposer, c)).toBeGreaterThan(0);
    expect(peaceScore(view({ traits: warlike, strength: 20 }), rival({ strength: 40 }), c)).toBeGreaterThan(
      0,
    );
  });
});
