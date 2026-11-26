// 유닛 생활 규칙(쉬러 가는 때) — 모양 검사·성향 기본값·상한 자르기
import { describe, expect, it } from "vitest";
import { clampLifeRules, defaultLifeRules, isUnitLifeRules } from "./unitLife.ts";

describe("유닛 생활 규칙", () => {
  it("모양: 정수, 1 ≤ 쉬러 가는 피로 ≤ 상한, 0 ≤ 다시 일하는 피로 < 쉬러 가는 피로", () => {
    expect(isUnitLifeRules({ restAt: 90, resumeAt: 0 })).toBe(true);
    expect(isUnitLifeRules({ restAt: 120, resumeAt: 119 })).toBe(true);
    expect(isUnitLifeRules({ restAt: 121, resumeAt: 0 })).toBe(false);
    expect(isUnitLifeRules({ restAt: 0, resumeAt: 0 })).toBe(false);
    expect(isUnitLifeRules({ restAt: 50, resumeAt: 50 })).toBe(false);
    expect(isUnitLifeRules({ restAt: 50.5, resumeAt: 0 })).toBe(false);
    expect(isUnitLifeRules({ restAt: 100, resumeAt: 0 }, 90)).toBe(false);
    expect(isUnitLifeRules(null)).toBe(false);
  });

  it("성향 기본값: 첫 불이익 구간 시작에서 규율만큼 앞뒤로(±20), 성향이 없으면 구간 시작", () => {
    const base = { penaltyFrom: 90, fatigueMax: 120 };
    expect(defaultLifeRules(base)).toEqual({ restAt: 90, resumeAt: 0 });
    expect(defaultLifeRules({ ...base, discipline: 500 }).restAt).toBe(90);
    expect(defaultLifeRules({ ...base, discipline: 1000 }).restAt).toBe(110);
    expect(defaultLifeRules({ ...base, discipline: 0 }).restAt).toBe(70);
    expect(defaultLifeRules({ ...base, discipline: 750 }).restAt).toBe(100);
    // 상한을 넘지 않는다
    expect(defaultLifeRules({ penaltyFrom: 115, fatigueMax: 120, discipline: 1000 }).restAt).toBe(120);
    expect(defaultLifeRules({ penaltyFrom: 5, fatigueMax: 120, discipline: 0 }).restAt).toBe(1);
  });

  it("실효 상한에 맞게 자른다", () => {
    expect(clampLifeRules({ restAt: 110, resumeAt: 100 }, 90)).toEqual({ restAt: 90, resumeAt: 89 });
    expect(clampLifeRules({ restAt: 80, resumeAt: 20 }, 120)).toEqual({ restAt: 80, resumeAt: 20 });
  });
});
