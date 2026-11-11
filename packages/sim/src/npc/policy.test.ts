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
    expect(tradePolicy(t(0, 0), false, c)).toEqual({
      sellPct: 101n,
      glutPct: 95n,
      spendDivisor: 4n,
      bidPct: 90n,
    });
    expect(tradePolicy(t(0, 1000), true, c)).toEqual({
      sellPct: 105n,
      glutPct: 95n,
      spendDivisor: 2n,
      bidPct: 90n,
    });
  });
});

describe("공성 결과·마을·편입 제안·독립 투표(질문 198 가, D-520)", () => {
  it("공성 결과(D-520): 가중치 점령·귀속(war.npcAnnexWeight) → 점령 상태(상업) → 약탈(공격) 차례로 굴림을 나눈다", () => {
    const war = { ...sc.war, npcAnnexWeight: 300 };
    // 공격 700·상업 200: 합 1200 = 점령·귀속 0~299, 점령 상태 300~499, 약탈 500~1199
    expect(occupationChoice(t(700, 200), 0, true, c, war)).toEqual({
      treatment: "integrate",
      shares: "keep",
    });
    expect(occupationChoice(t(700, 200), 299, true, c, war).treatment).toBe("integrate");
    expect(occupationChoice(t(700, 200), 300, true, c, war).treatment).toBe("occupy");
    expect(occupationChoice(t(700, 200), 499, true, c, war).treatment).toBe("occupy");
    expect(occupationChoice(t(700, 200), 500, true, c, war).treatment).toBe("loot");
    expect(occupationChoice(t(700, 200), 1200, true, c, war).treatment).toBe("integrate");
    // 재건 비용을 낼 수 없으면 점령·귀속 가중 0: 합 900 = 점령 상태 0~199, 약탈 200~899
    expect(occupationChoice(t(700, 200), 0, false, c, war).treatment).toBe("occupy");
    expect(occupationChoice(t(700, 200), 250, false, c, war).treatment).toBe("loot");
    // 가중치가 모두 0이면 낼 수 있을 때 점령·귀속, 아니면 약탈. 상장폐지는 아주 공격적일 때만
    const none = { ...war, npcAnnexWeight: 0 };
    expect(occupationChoice(t(0, 0), 7, true, c, none).treatment).toBe("integrate");
    expect(occupationChoice(t(0, 0), 7, false, c, none).treatment).toBe("loot");
    expect(occupationChoice(t(850, 0), 0, true, c, war)).toEqual({
      treatment: "integrate",
      shares: "delist",
    });
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

/** 산 자리만(경비대 표시 없이) */
const slots = (...args: Parameters<typeof recruitPicks>): number[] =>
  recruitPicks(...args).map((pick) => pick.slot);

describe("구인 규칙식(D-469, [임시] 목표 = 주거, 예비금 = 카드 값 × 2)", () => {
  const cards = [
    { slot: 0, total: 35, cost: 60n },
    { slot: 1, total: 44, cost: 78n },
    { slot: 2, total: 44, cost: 70n },
    { slot: 3, total: 30, cost: 50n },
  ];
  const base = { cards, taken: 0, population: 8, housing: 10, treasury: 10_000n };

  it("모자란 만큼만, 토탈 스탯 높은 차례(같으면 싼 것)로 산다", () => {
    expect(slots(base, c)).toEqual([2, 1]);
    expect(slots({ ...base, population: 10 }, c)).toEqual([]);
    expect(slots({ ...base, population: 0 }, c)).toEqual([2, 1, 0, 3]);
  });

  it("이미 산 칸은 건너뛰고, 국고가 카드 값 × 예비 ‰ 아래면 그 카드는 사지 않는다", () => {
    expect(slots({ ...base, taken: 0b0100 }, c)).toEqual([1, 0]);
    // 국고 150: 70 × 2 = 140 ≤ 150 → 산 뒤 80, 78 × 2 > 80 → 못 삼, 60 × 2 > 80, 50 × 2 > 80
    expect(slots({ ...base, population: 0, treasury: 150n }, c)).toEqual([2]);
    expect(slots({ ...base, treasury: 0n }, c)).toEqual([]);
    // 목표 ‰ = 500이면 주거 10의 절반(5)까지만
    expect(slots({ ...base, population: 4 }, { ...c, recruitTargetPm: 500 })).toEqual([2]);
  });

  it("경비대 다시 채우기(920 나): 모자란 경비대를 좋은 카드부터 먼저 사고, 등급 값에서 멈춘다", () => {
    // 주거가 차 있어도(휴먼 10/10) 경비대 3 → 목표 5 = 둘만 경비대로 산다
    expect(recruitPicks({ ...base, population: 10, guards: 3, guardTarget: 5 }, c)).toEqual([
      { slot: 2, guard: true },
      { slot: 1, guard: true },
    ]);
    // 경비대가 이미 목표면 사지 않는다(휴먼 목표도 차 있다)
    expect(recruitPicks({ ...base, population: 10, guards: 5, guardTarget: 5 }, c)).toEqual([]);
    // 휴먼 8/10, 경비대 4/5 → 경비대 하나(가장 좋은 카드) 다음 휴먼 하나(경비대도 휴먼이라 모자람 2 → 1)
    expect(recruitPicks({ ...base, guards: 4, guardTarget: 5 }, c)).toEqual([
      { slot: 2, guard: true },
      { slot: 1, guard: false },
    ]);
    // 목표가 없으면 경비대를 사지 않는다(옛 결과 그대로)
    expect(recruitPicks({ ...base, guards: 0 }, c).every((pick) => !pick.guard)).toBe(true);
  });

  it("경비대도 같은 값·예비금 규칙: 국고가 모자라면 채우지 않는다", () => {
    expect(recruitPicks({ ...base, population: 10, guards: 0, guardTarget: 5, treasury: 0n }, c)).toEqual([]);
    // 국고 150: 경비대 하나(70)만 산다
    expect(recruitPicks({ ...base, population: 10, guards: 0, guardTarget: 5, treasury: 150n }, c)).toEqual([
      { slot: 2, guard: true },
    ]);
  });
});
