// 채집 중 부상 고리(createGatherInjury, docs/adr/2026-11-08-injury.md 5절): 지난 작업 주기 경계마다 굴리고, 같은 경계는 같은 결과
import { TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import { afterEach, describe, expect, it } from "vitest";
import {
  type ConditionMap,
  HEALTHY,
  type UnitCondition,
  configureInjuryRules,
  createGatherInjury,
  injuryAt,
} from "./unitCondition.ts";

const C = TEST_SOCIETY_COEFFICIENTS.injury;
const HOUR = C.workPeriodMs;

/** 유닛 하나의 상태만 든 가짜 2차맵 */
function fakeMap(
  start: UnitCondition = HEALTHY,
): ConditionMap & { condition: UnitCondition; writes: number } {
  const map = {
    condition: start,
    writes: 0,
    unitInfo: (unitId: number) => (unitId === 7 ? { condition: map.condition } : undefined),
    setCondition: (_unitId: number, condition: UnitCondition) => {
      map.condition = condition;
      map.writes += 1;
      return true;
    },
  };
  return map;
}

afterEach(() => configureInjuryRules(undefined));

describe("채집 중 부상 고리", () => {
  it("경계를 넘지 않으면 굴리지 않는다(확률 1000‰이어도)", () => {
    configureInjuryRules(() => ({ ...C, workChancePm: 1000 }));
    const map = fakeMap();
    const hook = createGatherInjury();
    expect(hook(map, 7, 0, 100, 10 * HOUR + 1, 11 * HOUR - 1)).toBe(0);
    expect(map.writes).toBe(0);
  });

  it("경계를 넘으면 확률대로 다치고 상태를 쓴다(1000‰ = 늘)", () => {
    configureInjuryRules(() => ({ ...C, workChancePm: 1000 }));
    const map = fakeMap();
    const stage = createGatherInjury()(map, 7, 0, 100, 10 * HOUR + 1, 11 * HOUR + 5);
    expect(stage).toBeGreaterThan(0);
    expect(map.writes).toBe(1);
    expect(injuryAt(map.condition, 11 * HOUR + 5)).toBe(stage);
  });

  it("확률 0이면 다치지 않고, 없는 유닛은 건너뛴다", () => {
    configureInjuryRules(() => ({ ...C, workChancePm: 0 }));
    const map = fakeMap();
    expect(createGatherInjury()(map, 7, 100, 100, 0, 30 * HOUR)).toBe(0);
    configureInjuryRules(() => ({ ...C, workChancePm: 1000 }));
    expect(createGatherInjury()(map, 8, 0, 100, 0, 30 * HOUR)).toBe(0);
    expect(map.writes).toBe(0);
  });

  it("같은 경계는 나눠 굴려도 같은 결과(직무 정산과 같은 시드·경계 번호)", () => {
    configureInjuryRules(() => ({ ...C, workChancePm: 400 }));
    const whole = fakeMap();
    createGatherInjury()(whole, 7, 50, 100, 0, 12 * HOUR);
    const split = fakeMap();
    const hook = createGatherInjury();
    hook(split, 7, 50, 100, 0, 5 * HOUR + 30);
    hook(split, 7, 50, 100, 5 * HOUR + 30, 12 * HOUR);
    expect(split.condition).toEqual(whole.condition);
  });
});
