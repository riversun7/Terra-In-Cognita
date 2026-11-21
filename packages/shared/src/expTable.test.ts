// 유닛 공통 경험치 테이블 계산 시험 — 기본표 구간 합(1→50 = 100만, 50→60 = 100만), 단조 증가, 레벨업 누적/진행
import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXP_TABLE,
  EXP_TABLE_LIMITS,
  applyExpGain,
  cumulativeExpAt,
  expLevelId,
  expMaxLevelOf,
  expSpanAt,
  expTableMilestones,
  levelFromTotalExp,
} from "./expTable.ts";

describe("유닛 공통 경험치 테이블(@terra/shared/expTable)", () => {
  it("기본표는 59구간(Lv 1→60), 1→50 누적 100만, 50→60 합 100만(1:1), 단조 증가다", () => {
    expect(DEFAULT_EXP_TABLE).toHaveLength(59);
    expect(DEFAULT_EXP_TABLE[0]).toEqual({ id: "lv_01", level: 1, requiredExp: 35 });
    expect(DEFAULT_EXP_TABLE[48]).toEqual({ id: "lv_49", level: 49, requiredExp: 57473 });
    expect(DEFAULT_EXP_TABLE[49]).toEqual({ id: "lv_50", level: 50, requiredExp: 61093 });
    expect(DEFAULT_EXP_TABLE[58]).toEqual({ id: "lv_59", level: 59, requiredExp: 148401 });

    const summary = expTableMilestones(DEFAULT_EXP_TABLE);
    expect(summary.maxLevel).toBe(60);
    expect(summary.baseCapLevel).toBe(50);
    expect(summary.expToBaseCap).toBe(1_000_000);
    expect(summary.expAfterBaseCap).toBe(1_000_000);
    expect(summary.totalExp).toBe(2_000_000);
    expect(summary.prestigeRatioPm).toBe(1000);
    expect(summary.nonMonotoneLevels).toEqual([]);
  });

  it("expLevelId·expSpanAt·cumulativeExpAt가 경계값을 안전하게 처리한다", () => {
    expect(expLevelId(1)).toBe("lv_01");
    expect(expLevelId(50)).toBe("lv_50");
    expect(expLevelId(0)).toBe("lv_01");
    expect(expLevelId(999)).toBe(`lv_${EXP_TABLE_LIMITS.levelMax}`);

    expect(expMaxLevelOf(DEFAULT_EXP_TABLE)).toBe(60);
    expect(expMaxLevelOf([])).toBe(1);
    expect(expSpanAt(DEFAULT_EXP_TABLE, 1)).toBe(35);
    expect(expSpanAt(DEFAULT_EXP_TABLE, 59)).toBe(148401);
    expect(expSpanAt(DEFAULT_EXP_TABLE, 60)).toBe(0);
    expect(expSpanAt(DEFAULT_EXP_TABLE, 0)).toBe(0);

    expect(cumulativeExpAt(DEFAULT_EXP_TABLE, 1)).toBe(0);
    expect(cumulativeExpAt(DEFAULT_EXP_TABLE, 2)).toBe(35);
    expect(cumulativeExpAt(DEFAULT_EXP_TABLE, 50)).toBe(1_000_000);
    expect(cumulativeExpAt(DEFAULT_EXP_TABLE, 60)).toBe(2_000_000);
    expect(cumulativeExpAt(DEFAULT_EXP_TABLE, 99)).toBe(2_000_000);
  });

  it("levelFromTotalExp·applyExpGain은 다중 레벨업과 상한(만렙)을 정확히 계산한다", () => {
    expect(levelFromTotalExp(DEFAULT_EXP_TABLE, 0)).toEqual({
      level: 1,
      expInto: 0,
      expSpan: 35,
      maxed: false,
    });
    expect(levelFromTotalExp(DEFAULT_EXP_TABLE, 35)).toEqual({
      level: 2,
      expInto: 0,
      expSpan: 132,
      maxed: false,
    });
    expect(levelFromTotalExp(DEFAULT_EXP_TABLE, 1_000_000)).toEqual({
      level: 50,
      expInto: 0,
      expSpan: 61093,
      maxed: false,
    });
    expect(levelFromTotalExp(DEFAULT_EXP_TABLE, 1_000_000, 50)).toEqual({
      level: 50,
      expInto: 0,
      expSpan: 0,
      maxed: true,
    });
    expect(levelFromTotalExp(DEFAULT_EXP_TABLE, 2_500_000)).toEqual({
      level: 60,
      expInto: 0,
      expSpan: 0,
      maxed: true,
    });

    // Lv 1에서 500 XP 획득: 35 + 132 + 285 = 452 → Lv 4, 남은 48 / 492
    expect(applyExpGain(DEFAULT_EXP_TABLE, 1, 0, 500)).toEqual({
      level: 4,
      expInto: 48,
      expSpan: 492,
      maxed: false,
      gainedLevels: 3,
    });

    // Lv 49에서 10만 XP, 상한 50 적용
    expect(applyExpGain(DEFAULT_EXP_TABLE, 49, 0, 100_000, 50)).toEqual({
      level: 50,
      expInto: 0,
      expSpan: 0,
      maxed: true,
      gainedLevels: 1,
    });
  });

  it("비단조 구간이 있으면 nonMonotoneLevels에 잡힌다", () => {
    const sample = [
      { id: "lv_01", level: 1, requiredExp: 100 },
      { id: "lv_02", level: 2, requiredExp: 80 },
      { id: "lv_03", level: 3, requiredExp: 200 },
    ];
    expect(expTableMilestones(sample, 3).nonMonotoneLevels).toEqual([2]);
  });
});
