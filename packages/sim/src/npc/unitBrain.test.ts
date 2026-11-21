import { DEFAULT_UNIT_TRAITS } from "@terra/shared/unitTraits";
import { describe, expect, it } from "vitest";
import { DEFAULT_NPC_AI_COEFFICIENTS } from "./aiCoefficients.ts";
import {
  decideUnitState,
  dwellDurationMs,
  guardPatrolRadiusCells,
  reevalIntervalMs,
  simulateDailySchedule,
} from "./unitBrain.ts";

describe("unitBrain (8상태 예약 FSM)", () => {
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

    // 운반 일정 할당 시 체류 시간을 뚫고 즉시 haul 전환
    const haul = decideUnitState({ ...baseCtx, hasHaulJob: true }, 0);
    expect(haul.state).toBe("haul");
    expect(haul.changed).toBe(true);
    expect(haul.interrupted).toBe(true);

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
  });
});
