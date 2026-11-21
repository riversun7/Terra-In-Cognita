import { describe, expect, it } from "vitest";
import { type FactionView, scoreActions } from "./brain.ts";
import { TEST_NPC_COEFFICIENTS as c } from "./coefficients.ts";
import {
  investChallengePm,
  investChallenges,
  investCostPenalty,
  investCostSharePm,
  investGate,
  investTemperPm,
  investTemperedChallengePm,
} from "./invest.ts";

const researchOf = (me: FactionView, roll: number): number | undefined =>
  scoreActions(me, [], c, roll).find((entry) => entry.action.kind === "research")?.score;

const me = (treasury: bigint, blocked: boolean): FactionView => ({
  id: 1,
  traits: { aggression: 100, commerce: 400, faith: 400, station: 500 },
  cities: 2,
  strength: 100,
  treasury,
  satisfaction: 70,
  foodPm: 1000,
  crowded: false,
  foundCost: 5000n,
  research: { cost: 1000n, blocked },
  sellableShares: false,
  poor: false,
  overlord: null,
  vassals: 0,
  restores: [],
  claims: [],
});

describe("NPC 투자 판단(invest.ts, D-587 질문 2465)", () => {
  it("비용 몫: 자본에 견줘 비쌀수록 크고, 점수에서 가중치만큼 뺀다", () => {
    expect(investCostSharePm(500n, 1000n)).toBe(500);
    expect(investCostSharePm(5000n, 1000n)).toBe(1000);
    expect(investCostSharePm(0n, 1000n)).toBe(0);
    expect(investCostPenalty(500n, 1000n, c)).toBe(Math.floor((500 * c.investCostWeightPm) / 1000));
  });

  it("도전 확률: 자본이 많을수록 높고 상한에서 멈춘다", () => {
    expect(investChallengePm(1000n, 1000n, c)).toBe(0);
    expect(investChallengePm(1000n, 3000n, c)).toBe(2 * c.investChallengeStepPm);
    expect(investChallengePm(1000n, 10n ** 12n, c)).toBe(c.investChallengeMaxPm);
    expect(investChallenges(1000n, 3000n, 2 * c.investChallengeStepPm - 1, c)).toBe(true);
    expect(investChallenges(1000n, 3000n, 2 * c.investChallengeStepPm, c)).toBe(false);
  });

  it("다음 기술이 막혔으면(기대 수익) 굴림과 상관없이 연구 시설이 후보다", () => {
    expect(researchOf(me(2000n, true), 999)).toBe(
      c.researchBlockedScore + 100 - investCostPenalty(1000n, 2000n, c),
    );
  });

  it("막히지 않은 연구 시설(앞선 기술)은 도전 굴림을 넘어야 후보다 — 자본이 클수록 넘기 쉽다", () => {
    const roll = 250;
    // 국고 = 값의 2배 → 도전 100‰: 250은 못 넘는다
    expect(researchOf(me(2000n, false), roll)).toBeUndefined();
    // 국고 = 값의 5배 → 도전 400‰: 넘는다. 점수 = 평소 점수 + 성향 − 비용 몫
    expect(researchOf(me(5000n, false), roll)).toBe(
      c.researchScore + 100 - investCostPenalty(1000n, 5000n, c),
    );
  });
});

describe("투자 판단 넓히기(npc-invest-2, 질문 2508)", () => {
  it("성향 배율: 가장 낮으면 500‰, 가장 높으면 1500‰", () => {
    expect(investTemperPm(c.traitMin, c)).toBe(500);
    expect(investTemperPm(c.traitMax, c)).toBe(1500);
    expect(investTemperPm(Math.floor((c.traitMin + c.traitMax) / 2), c)).toBe(1000);
  });

  it("성향을 곱한 도전 확률은 상한에서 자른다", () => {
    expect(investTemperedChallengePm(1000n, 3000n, 500, c)).toBe(c.investChallengeStepPm);
    expect(investTemperedChallengePm(1000n, 10n ** 12n, 1500, c)).toBe(c.investChallengeMaxPm);
  });

  it("수요가 있으면 굴리지 않고, 없으면 굴림이 확률보다 작을 때만 연다", () => {
    expect(investGate(10n ** 9n, 1n, true, 999, 1000, c)).toBe(true);
    expect(investGate(1000n, 3000n, false, 199, 1000, c)).toBe(true);
    expect(investGate(1000n, 3000n, false, 200, 1000, c)).toBe(false);
  });
});
