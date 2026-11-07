import { describe, expect, it } from "vitest";
import { TEST_SOCIETY_COEFFICIENTS as sc } from "../society/coefficients.ts";
import { TEST_NPC_COEFFICIENTS as c } from "./coefficients.ts";
import {
  answerOffer,
  foundingChoice,
  independenceYes,
  nextTaxBp,
  occupationChoice,
  recruitPicks,
  tradePolicy,
} from "./policy.ts";
import type { Traits } from "./traits.ts";

const t = (aggression: number, commerce = 500, faith = 500): Traits => ({
  aggression,
  commerce,
  faith,
  station: 500,
});

describe("세율 규칙식(D-323, 질문 197 가)", () => {
  it("국고가 줄면 1%p 올리고, 늘면 1%p 내린다(프리셋 기본 아래로는 안 내림)", () => {
    expect(nextTaxBp({ current: 200, base: 200, treasury: 900n, before: 1000n, satisfaction: 70 }, c)).toBe(
      300,
    );
    expect(nextTaxBp({ current: 500, base: 200, treasury: 1100n, before: 1000n, satisfaction: 70 }, c)).toBe(
      400,
    );
    expect(nextTaxBp({ current: 200, base: 200, treasury: 1100n, before: 1000n, satisfaction: 70 }, c)).toBe(
      200,
    );
  });

  it("만족도 50 아래면 올리지 않는다, 상한에서 멈춘다, 처음 판단은 그대로", () => {
    expect(nextTaxBp({ current: 200, base: 200, treasury: 900n, before: 1000n, satisfaction: 49 }, c)).toBe(
      200,
    );
    expect(nextTaxBp({ current: 2000, base: 200, treasury: 1n, before: 1000n, satisfaction: 90 }, c)).toBe(
      2000,
    );
    expect(nextTaxBp({ current: 300, base: 200, treasury: 1n, before: null, satisfaction: 90 }, c)).toBe(300);
  });
});

describe("거래 정책(D-323 운임 = 원가 + 성향별 이익률)", () => {
  it("상업 성향이 높을수록 비싸게 내놓고, 생필품이 모자라면 국고를 더 쓴다", () => {
    expect(tradePolicy(t(0, 0), false, c)).toEqual({ sellPct: 101n, glutPct: 95n, spendDivisor: 4n });
    expect(tradePolicy(t(0, 1000), true, c)).toEqual({ sellPct: 105n, glutPct: 95n, spendDivisor: 2n });
  });
});

describe("점령 처리·마을·편입 제안·독립 투표(질문 198 가)", () => {
  it("공격 성향이 높고 약탈 뒤에도 반란 문턱 위면 약탈, 아니면 통합. 상장폐지는 아주 공격적일 때만", () => {
    expect(occupationChoice(t(700), 80, c, sc)).toEqual({ treatment: "loot", shares: "keep" });
    // 80 − 25(약탈) = 55 ≤ 40 + 10? 아니다 → 약탈. 70 − 25 = 45 ≤ 50 → 통합
    expect(occupationChoice(t(700), 70, c, sc)).toEqual({ treatment: "integrate", shares: "keep" });
    expect(occupationChoice(t(300), 90, c, sc)).toEqual({ treatment: "integrate", shares: "keep" });
    expect(occupationChoice(t(850), 90, c, sc)).toEqual({ treatment: "loot", shares: "delist" });
    // 폐허 문턱(900) 이상이면 약탈하고 폐허로 둔다(486 나) — 만족도와 상관없이
    expect(occupationChoice(t(900), 90, c, sc)).toEqual({ treatment: "raze", shares: "delist" });
    expect(occupationChoice(t(950), 30, c, sc).treatment).toBe("raze");
  });

  it("마을: 공격 성향이 높은 가문은 독립하고 가장 큰 축이 체제, 아니면 봉신", () => {
    expect(foundingChoice(t(300), c)).toEqual({ vassal: true });
    expect(foundingChoice(t(700, 100, 100), c)).toEqual({ vassal: false, regime: "dictatorship" });
    expect(foundingChoice(t(650, 900, 100), c)).toEqual({ vassal: false, regime: "capitalism" });
    expect(foundingChoice(t(650, 100, 900), c)).toEqual({ vassal: false, regime: "democracy" });
  });

  it("편입 제안은 점령자와 전쟁 중인 공격 성향 세력만 거부한다", () => {
    expect(answerOffer(t(600), true, c)).toBe("refused");
    expect(answerOffer(t(600), false, c)).toBe("accepted");
    expect(answerOffer(t(400), true, c)).toBe("accepted");
  });

  it("독립 투표: 도시 주인과 전쟁 중이거나 상업 성향이 높으면 찬성", () => {
    expect(independenceYes(t(0, 600), false, c)).toBe(true);
    expect(independenceYes(t(0, 400), true, c)).toBe(true);
    expect(independenceYes(t(0, 400), false, c)).toBe(false);
  });
});

describe("구인 규칙식(D-469, [임시] 목표 = 주거, 예비금 = 카드 값 × 2)", () => {
  const cards = [
    { slot: 0, total: 35, cost: 60n },
    { slot: 1, total: 44, cost: 78n },
    { slot: 2, total: 44, cost: 70n },
    { slot: 3, total: 30, cost: 50n },
  ];
  const base = { cards, taken: 0, population: 8, housing: 10, treasury: 10_000n };

  it("모자란 만큼만, 토탈 스탯 높은 차례(같으면 싼 것)로 산다", () => {
    expect(recruitPicks(base, c)).toEqual([2, 1]);
    expect(recruitPicks({ ...base, population: 10 }, c)).toEqual([]);
    expect(recruitPicks({ ...base, population: 0 }, c)).toEqual([2, 1, 0, 3]);
  });

  it("이미 산 칸은 건너뛰고, 국고가 카드 값 × 예비 ‰ 아래면 그 카드는 사지 않는다", () => {
    expect(recruitPicks({ ...base, taken: 0b0100 }, c)).toEqual([1, 0]);
    // 국고 150: 70 × 2 = 140 ≤ 150 → 산 뒤 80, 78 × 2 > 80 → 못 삼, 60 × 2 > 80, 50 × 2 > 80
    expect(recruitPicks({ ...base, population: 0, treasury: 150n }, c)).toEqual([2]);
    expect(recruitPicks({ ...base, treasury: 0n }, c)).toEqual([]);
    // 목표 ‰ = 500이면 주거 10의 절반(5)까지만
    expect(recruitPicks({ ...base, population: 4 }, { ...c, recruitTargetPm: 500 })).toEqual([2]);
  });
});
