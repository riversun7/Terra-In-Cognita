import { DEFAULT_UNIT_TRAITS } from "@terra/shared/unitTraits";
import { describe, expect, it } from "vitest";
import { DEFAULT_NPC_AI_COEFFICIENTS } from "./aiCoefficients.ts";
import {
  decideUnitState,
  dwellDurationMs,
  guardPatrolRadiusCells,
  reevalIntervalMs,
  simulateDailySchedule,
  unitJobOf,
} from "./unitBrain.ts";

describe("unitBrain (5상태 예약 FSM)", () => {
  const ai = DEFAULT_NPC_AI_COEFFICIENTS;

  it("최소 체류 시간 안에서는 일반 상태 전환을 막아 진동을 방지하고, 긴급 대피/운반은 즉시 전환한다", () => {
    const baseCtx = {
      unitId: 101,
      role: "worker" as const,
      traits: { ...DEFAULT_UNIT_TRAITS, discipline: 700, boldness: 200, belligerence: 200 },
      currentState: "work" as const,
      stateEnteredAtMs: 100_000,
      nowMs: 105_000, // 5초 경과 (최소 체류 시간 미만)
      isWorkHours: false, // 밤이 되어 rest 점수가 더 높아도 체류 중이면 유지
      hasWorkplace: true,
      hasHaulJob: false,
      hasMarket: true,
      fatiguePm: 900,
      fedPm: 1000,
      satisfactionMilli: 70_000,
      threatNear: false,
      cityAtWar: false,
      ai,
    };
    const hold = decideUnitState(baseCtx, 0);
    expect(hold.state).toBe("work");
    expect(hold.changed).toBe(false);
    expect(hold.interrupted).toBe(false);

    // 위협 감지 시 체류 시간을 뚫고 즉시 evade 전환
    const evade = decideUnitState({ ...baseCtx, threatNear: true }, 0);
    expect(evade.state).toBe("evade");
    expect(evade.changed).toBe(true);
    expect(evade.interrupted).toBe(true);

    // 쉬는 중에 운반 일정이 오면 체류 시간을 뚫고 즉시 일(운반)로 전환
    const haul = decideUnitState({ ...baseCtx, currentState: "rest", hasHaulJob: true }, 0);
    expect(haul.state).toBe("work");
    expect(haul.job).toBe("haul");
    expect(haul.changed).toBe(true);
    expect(haul.interrupted).toBe(true);
    // 일터에서 일하던 중이면 상태는 그대로 일, 일감만 운반으로 바뀐다
    const swap = decideUnitState({ ...baseCtx, hasHaulJob: true }, 0);
    expect(swap.state).toBe("work");
    expect(swap.job).toBe("haul");
    expect(swap.changed).toBe(false);

    // 최소 체류 시간 경과 후에는 정상적으로 rest로 전환
    const dwell = dwellDurationMs(baseCtx.traits, baseCtx.role, ai);
    const rest = decideUnitState({ ...baseCtx, nowMs: 100_000 + dwell + 1_000 }, 0);
    expect(rest.state).toBe("rest");
    expect(rest.changed).toBe(true);
  });

  it("경비대 순찰 반경과 재평가 주기는 설정 구간 [min, max] 안에 결정적으로 들어간다", () => {
    const timid = guardPatrolRadiusCells({ ...DEFAULT_UNIT_TRAITS, boldness: 0, openness: 0 }, ai);
    const bold = guardPatrolRadiusCells({ ...DEFAULT_UNIT_TRAITS, boldness: 1000, openness: 1000 }, ai);
    expect(timid).toBe(ai.guardPatrolMinCells);
    expect(bold).toBe(ai.guardPatrolMaxCells);
    expect(bold).toBeGreaterThan(timid);

    const r1 = reevalIntervalMs(DEFAULT_UNIT_TRAITS, 42, ai);
    const r2 = reevalIntervalMs(DEFAULT_UNIT_TRAITS, 42, ai);
    expect(r1).toBe(r2);
    expect(r1).toBeGreaterThanOrEqual(ai.unitReevalMinMs);
    expect(r1).toBeLessThanOrEqual(ai.unitReevalMaxMs);
  });

  it("24시간 일과 시뮬레이션은 직군과 성향에 따라 다른 행동 패턴을 낸다", () => {
    const worker = simulateDailySchedule({
      traits: { ...DEFAULT_UNIT_TRAITS, discipline: 850 },
      role: "worker",
      hasWorkplace: true,
      hasMarket: true,
      ai,
    });
    const guard = simulateDailySchedule({
      traits: { ...DEFAULT_UNIT_TRAITS, belligerence: 800, discipline: 800 },
      role: "guard",
      hasWorkplace: false,
      hasMarket: true,
      ai,
    });
    expect(worker).toHaveLength(24);
    expect(worker.some((s) => s.state === "work")).toBe(true);
    expect(worker.some((s) => s.state === "rest")).toBe(true);
    expect(guard.filter((s) => s.state === "patrol").length).toBeGreaterThan(10);
    expect(worker.find((s) => s.state === "work")?.job).toBe("post");
  });

  it("굶은 유닛은 일터 대신 욕구를 풀러 가고, 만족도가 낮으면 일하는 시간이 준다(태업)", () => {
    const traits = { ...DEFAULT_UNIT_TRAITS, discipline: 700 };
    const day = {
      unitId: 7,
      role: "worker" as const,
      traits,
      currentState: "rest" as const,
      stateEnteredAtMs: 0,
      nowMs: 10 * 3_600_000,
      isWorkHours: true,
      hasWorkplace: true,
      hasHaulJob: false,
      hasMarket: true,
      fatiguePm: 100,
      satisfactionMilli: 70_000,
      threatNear: false,
      cityAtWar: false,
      ai,
    };
    expect(decideUnitState({ ...day, fedPm: 1000 }, 0).state).toBe("work");
    expect(decideUnitState({ ...day, fedPm: 0 }, 0).state).toBe("need");

    // 같은 피로(절반)에서 만족도가 높으면 계속 일하고, 낮으면 쉰다(기획 46 §2.4 태업: 더 자주 쉰다)
    const tired = { ...day, currentState: "work" as const, fedPm: 1000, fatiguePm: 500 };
    expect(decideUnitState({ ...tired, satisfactionMilli: 95_000 }, 0).state).toBe("work");
    expect(decideUnitState({ ...tired, satisfactionMilli: 10_000 }, 0).state).toBe("rest");
  });

  it("일터 없는 시민의 일감은 둘레 채집이고, 경비대·지도자는 운반 말고는 일감이 없다", () => {
    const base = { hasHaulJob: false, hasWorkplace: false };
    expect(unitJobOf({ ...base, role: "citizen" })).toBe("forage");
    expect(unitJobOf({ ...base, role: "worker" })).toBeNull();
    expect(unitJobOf({ ...base, role: "guard" })).toBeNull();
    expect(unitJobOf({ ...base, role: "guard", hasHaulJob: true })).toBe("haul");
  });
});
