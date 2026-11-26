import { describe, expect, it } from "vitest";
import { TEST_JOB_RULES } from "../settle/settle.ts";
import { TEST_SOCIETY_COEFFICIENTS as c } from "./coefficients.ts";
import {
  SATISFACTION_MAX_MILLI,
  baseWageRateMilli,
  efficiencyScore,
  fatigueMoveSpeed,
  fatiguePenalty,
  production,
  recoveryPm,
  rulesWithFatigueBands,
  rulesWithRecovery,
  satisfactionTarget,
  satisfactionToward,
  topShareAverage,
  wage,
} from "./labor.ts";

const content = {
  foodPm: 1000,
  housing: 2,
  wage: 0,
  topAverageWage: 0,
  faith: false,
  war: false,
  injured: false,
};

describe("노동 공식(기획 48 §7, N21~N33)", () => {
  it("구간 불이익을 정산 규칙·걷기에 얹는다: 일 주기 = 기본 × 1000 ÷ 능력 ‰(올림), 빠르기 × 이동 ‰(내림)", () => {
    const rules = rulesWithFatigueBands(TEST_JOB_RULES, c);
    expect(rules.fatigueMax).toBe(c.fatigueMax);
    expect(rules.workBands).toEqual([
      { from: 0, cycleMs: 60_000 },
      { from: 31, cycleMs: 66_667 },
      { from: 61, cycleMs: 80_000 },
      { from: 91, cycleMs: 120_000 },
    ]);
    // 회복 규칙에도 같은 구간이 든다
    expect(rulesWithRecovery(TEST_JOB_RULES, 1000, c).workBands).toEqual(rules.workBands);
    expect(fatigueMoveSpeed(4000, 60, c)).toBe(4000);
    expect(fatigueMoveSpeed(4000, 61, c)).toBe(3400);
    expect(fatigueMoveSpeed(4000, 120, c)).toBe(2800);
    expect(fatigueMoveSpeed(1, 120, c)).toBe(1);
  });

  it("피로: 구간 불이익(N23), 회복 = 주거(N24 ×1.5·×2·×3) × 만족도 × 노숙(S25), 기본 1점/3분", () => {
    expect(fatiguePenalty(30, c)).toEqual({ abilityPm: 1000, movePm: 1000 });
    expect(fatiguePenalty(31, c)).toEqual({ abilityPm: 900, movePm: 1000 });
    expect(fatiguePenalty(90, c)).toEqual({ abilityPm: 750, movePm: 850 });
    expect(fatiguePenalty(120, c)).toEqual({ abilityPm: 500, movePm: 700 });
    expect(recoveryPm(1, SATISFACTION_MAX_MILLI, c)).toBe(1500);
    expect(recoveryPm(3, SATISFACTION_MAX_MILLI, c)).toBe(3000);
    expect(recoveryPm(2, 0, c)).toBe(1000);
    expect(recoveryPm(0, SATISFACTION_MAX_MILLI, c)).toBe(100);
    expect(rulesWithRecovery(TEST_JOB_RULES, 1000, c)).toMatchObject({
      fatigueMax: 120,
      restStepMs: 180_000,
    });
    expect(rulesWithRecovery(TEST_JOB_RULES, 2000, c).restStepMs).toBe(90_000);
  });

  it("급여 = 효율점수(직무 행 + 생활 스킬 등급 × 2, 포만감 배율) × 단가(수급) × 고용주 조정", () => {
    // 채굴 STR 400·VIT 300·DEX 200·AGI 100 (N1 직무 행 출발값)
    const mining = [400, 200, 100, 300, 0, 0];
    expect(efficiencyScore([50, 20, 10, 40, 0, 0], mining, 3, 80, c)).toBe(43);
    // 포만감 50 이하 0.7, 30 이하 0(N33)
    expect(efficiencyScore([50, 20, 10, 40, 0, 0], mining, 3, 50, c)).toBe(30);
    expect(efficiencyScore([50, 20, 10, 40, 0, 0], mining, 3, 30, c)).toBe(0);
    expect(baseWageRateMilli(100, 100, c)).toBe(2000);
    expect(baseWageRateMilli(200, 100, c)).toBe(3000);
    expect(baseWageRateMilli(10, 100, c)).toBe(1100);
    expect(baseWageRateMilli(5, 0, c)).toBe(4000);
    expect(wage(43, 2000, 1000, c)).toBe(86);
    expect(wage(43, 2000, 9999, c)).toBe(129);
  });

  it("임금 비교 = 같은 도시 같은 직무 상위 25% 평균(N30)", () => {
    expect(topShareAverage([10, 40, 20, 30, 50, 60, 70, 80], c)).toBe(75);
    expect(topShareAverage([7], c)).toBe(7);
    expect(topShareAverage([], c)).toBe(0);
  });

  it("생산(N32): 진행 = max(1, ⌊주 ÷ 20⌋), 추가 수확 = ⌊보조 × 0.08⌋", () => {
    expect(production(45, 30, c)).toEqual({ progress: 2, extra: 2 });
    expect(production(5, 10, c)).toEqual({ progress: 1, extra: 0 });
  });

  it("만족도: 요소 목표값으로 다가간다(0~100, D-438 5)", () => {
    // 기본 20 + 포만감 40 + 주거 2등급 20 = 80
    expect(satisfactionTarget(content, c)).toBe(80_000);
    expect(satisfactionTarget({ ...content, foodPm: 0, housing: 0, war: true, injured: true }, c)).toBe(0);
    // 상위 평균의 절반 임금: 임금 몫 10, 격차 불만 −10 → 80
    expect(satisfactionTarget({ ...content, wage: 5, topAverageWage: 10 }, c)).toBe(80_000);
    // 임금 틀 안인데 못 받음(판 70): 그 도시에 받은 사람이 있으면 격차 불만 −10, 없으면 임금 요소 없음
    expect(satisfactionTarget({ ...content, wage: 0, topAverageWage: 10, unpaid: true }, c)).toBe(70_000);
    expect(satisfactionTarget({ ...content, wage: 0, topAverageWage: 0, unpaid: true }, c)).toBe(80_000);
    expect(satisfactionTarget({ ...content, wage: 10, topAverageWage: 10, faith: true }, c)).toBe(100_000);
    // 하루에 차이의 30%씩
    expect(satisfactionToward(50_000, 80_000, 1000, c)).toBe(59_000);
    expect(satisfactionToward(50_000, 80_000, 10_000, c)).toBe(80_000);
    expect(satisfactionToward(50_000, 0, 1000, c)).toBe(35_000);
  });
});
