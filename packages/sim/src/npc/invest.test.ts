import { describe, expect, it } from "vitest";
import { type FactionView, scoreActions } from "./brain.ts";
import { TEST_NPC_COEFFICIENTS as c } from "./coefficients.ts";
import {
  investChallengePm,
  investChallenges,
  investCostPenalty,
  investCostSharePm,
  investGate,
  investGuardExtra,
  investPays,
  investReturnPenalty,
  investReturnPm,
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

describe("기대 수익·유지비(npc-fix-3, 질문 2566 나 + 다)", () => {
  const days = c.investPaybackDays ?? 30;
  it("기대 수익 몫 = ((하루 값 − 유지비) × 회수 기간 − 값) ÷ 값, −1000~1000에서 자른다", () => {
    // 하루 남는 몫 10 × 30일 = 300, 값 200 → (300 − 200) ÷ 200 = 500‰
    expect(investReturnPm(200n, { dailyValue: 15n, dailyUpkeep: 5n }, c)).toBe(
      Math.trunc(((10 * days - 200) * 1000) / 200),
    );
    expect(investReturnPm(1n, { dailyValue: 15n, dailyUpkeep: 5n }, c)).toBe(1000);
    expect(investReturnPm(200n, { dailyValue: 0n, dailyUpkeep: 50n }, c)).toBe(-1000);
    // 값이 0이면 하루 남는 몫의 부호
    expect(investReturnPm(0n, { dailyValue: 2n, dailyUpkeep: 1n }, c)).toBe(1000);
    expect(investReturnPm(0n, { dailyValue: 1n, dailyUpkeep: 1n }, c)).toBe(0);
    // 견줄 값(basis)이 있으면 그것으로 나눈다
    expect(investReturnPm(10n ** 9n, { dailyValue: 10n, dailyUpkeep: 0n, basis: 150n }, c)).toBe(
      Math.trunc(((10 * days - 150) * 1000) / 150),
    );
  });

  it("점수 감점은 몫이 0 아래일 때만(가중치 ‰), 0 위는 0", () => {
    expect(investReturnPenalty(200n, { dailyValue: 15n, dailyUpkeep: 5n }, c)).toBe(0);
    expect(investReturnPenalty(200n, { dailyValue: 0n, dailyUpkeep: 50n }, c)).toBe(
      c.investReturnWeightPm ?? 300,
    );
  });

  it("경제 이득: 하루 값 > 유지비이고 몫 ≥ 문턱", () => {
    expect(investPays(200n, { dailyValue: 15n, dailyUpkeep: 5n }, c)).toBe(true);
    expect(investPays(200n, { dailyValue: 5n, dailyUpkeep: 5n }, c)).toBe(false);
    // 하루 1 남지만 30일에 값 1000을 못 돌려받는다(문턱 0)
    expect(investPays(1000n, { dailyValue: 6n, dailyUpkeep: 5n }, c)).toBe(false);
    expect(investPays(1000n, { dailyValue: 6n, dailyUpkeep: 5n }, { ...c, investReturnMinPm: -1000 })).toBe(
      true,
    );
  });

  it("투자 문: 수요가 있으면 기대 수익을 보지 않고, 없으면 경제 이득이 있어야 굴림까지 간다", () => {
    const loss = { dailyValue: 1n, dailyUpkeep: 5n };
    const gain = { dailyValue: 500n, dailyUpkeep: 5n };
    expect(investGate(1000n, 3000n, true, 999, 1000, c, loss)).toBe(true);
    expect(investGate(1000n, 3000n, false, 0, 1000, c, loss)).toBe(false);
    expect(investGate(1000n, 3000n, false, 199, 1000, c, gain)).toBe(true);
    expect(investGate(1000n, 3000n, false, 200, 1000, c, gain)).toBe(false);
  });
});

describe("국방 투자로 경비대 수 늘리기(fixes-1117e, 질문 2565 나 — D-591)", () => {
  // 상한 칸 1000‰(등급 값만큼 더 — 출발값 500‰과 따로 본다)
  const c1000 = { ...c, investGuardExtraPm: 1000 };
  const at = (roll: number, more: Partial<Parameters<typeof investGuardExtra>[0]> = {}, cc = c1000) =>
    investGuardExtra(
      { base: 4, room: 10, cardCost: 100n, capital: 1000n, roll, temperPm: 1000, ...more },
      cc,
    );

  it("k번째는 카드 값 × k로 도전 굴림 — 국고가 클수록·굴림이 낮을수록 더 들인다", () => {
    // 1번째 100(국고 10배 → 900‰), 2번째 200(5배 → 400‰), 3번째 300(233‰), 4번째 400(150‰)
    expect(at(999)).toBe(0);
    expect(at(500)).toBe(1);
    expect(at(300)).toBe(2);
    expect(at(100)).toBe(4);
    expect(at(500, { capital: 100_000n })).toBe(4);
  });

  it("성향 배율이 낮으면 덜 들인다(공격 성향)", () => {
    // 배율 500‰: 450·200·116·75
    expect(at(100, { temperPm: 500 })).toBe(3);
    expect(at(100, { temperPm: 1500 })).toBe(4);
  });

  it("상한 = 등급 값 × 칸 ‰, 남는 주거를 넘지 않는다. 등급 값·칸이 0이면 늘리지 않는다", () => {
    expect(at(0, { room: 2 })).toBe(2);
    expect(at(0, { room: -3 })).toBe(0);
    expect(at(0, {}, { ...c, investGuardExtraPm: 500 })).toBe(2);
    expect(at(0, {}, { ...c, investGuardExtraPm: 0 })).toBe(0);
    expect(at(0, { base: 0 })).toBe(0);
    expect(at(0, { cardCost: 0n })).toBe(0);
  });
});
