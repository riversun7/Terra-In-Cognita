// NPC 일꾼의 작업 중 부상(질문 2702 나 — D-521·D-555 1509, npcWorkInjury.ts): 일터를 받은 휴먼만, 그 도시에 실제로 있을 때만, 경계마다 한 번
import { TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import { afterEach, describe, expect, it } from "vitest";
import type { BotHome } from "../world/bots.ts";
import {
  HEALTHY,
  INJURY_CRITICAL,
  type UnitCondition,
  configureInjuryRules,
  injuryAt,
} from "../world/unitCondition.ts";
import { createNpcWorkInjury } from "./npcWorkInjury.ts";

const C = TEST_SOCIETY_COEFFICIENTS.injury;
const HOUR = C.workPeriodMs;
/** 늘 일하는 때(피로 바퀴 = 바퀴 전체가 일) */
const ALWAYS: BotHome["shift"] = {
  lonDeg: 0,
  startPm: 0,
  endPm: 0,
  cycle: { workMs: HOUR, periodMs: HOUR },
};
const WORK = { x: 10, y: 10, radius: 3 };

interface FakeUnit {
  condition: UnitCondition;
  home?: BotHome | undefined;
  held?: boolean | undefined;
}

/** 유닛 몇 개만 든 가짜 2차맵 */
function fakeMap(units: Map<number, FakeUnit>) {
  const map = {
    writes: 0,
    unitInfo: (unitId: number) => {
      const unit = units.get(unitId);
      return unit ? { condition: unit.condition, home: unit.home, held: unit.held } : undefined;
    },
    setCondition: (unitId: number, condition: UnitCondition) => {
      const unit = units.get(unitId);
      if (!unit) return false;
      unit.condition = condition;
      map.writes += 1;
      return true;
    },
  };
  return map;
}

afterEach(() => configureInjuryRules(undefined));

describe("NPC 일꾼 작업 중 부상", () => {
  it("일터를 받은 휴먼만 경계마다 한 번 굴린다(경비대·일터 없음·이동 중·빨강·다른 2차맵은 빼고)", () => {
    configureInjuryRules(() => ({ ...C, workChancePm: 1000 }));
    const red: UnitCondition = { injury: INJURY_CRITICAL, injuryUntilMs: 100 * HOUR, heldBy: null };
    const onMap = new Map<number, FakeUnit>([
      [1, { condition: HEALTHY, home: { x: 0, y: 0, work: WORK, shift: ALWAYS } }],
      [2, { condition: HEALTHY, home: { x: 0, y: 0 } }],
      [3, { condition: HEALTHY, home: { x: 0, y: 0, work: WORK, shift: ALWAYS }, held: true }],
      [4, { condition: red, home: { x: 0, y: 0, work: WORK, shift: ALWAYS } }],
      [5, { condition: HEALTHY, home: { x: 0, y: 0, work: WORK, shift: ALWAYS } }],
    ]);
    const map = fakeMap(onMap);
    const other = fakeMap(
      new Map([[6, { condition: HEALTHY, home: { x: 0, y: 0, work: WORK, shift: ALWAYS } }]]),
    );
    const units = new Map([
      [1, { id: 1, city: 10 }],
      [2, { id: 2, city: 10 }],
      [3, { id: 3, city: 10 }],
      [4, { id: 4, city: 10 }],
      [5, { id: 5, city: 10, guard: true }],
      // 집 도시(10) 2차맵에 없다 — 다른 2차맵(20)에 서 있다
      [6, { id: 6, city: 10 }],
    ]);
    const injury = createNpcWorkInjury({
      units,
      places: new Map([[10, { mapKey: 100 }]]),
      maps: new Map([
        [100, map],
        [200, other],
      ]),
      startMs: 10 * HOUR + 5,
    });
    // 경계를 넘지 않으면 굴리지 않는다
    expect(injury.roll(11 * HOUR - 1)).toBe(0);
    expect(map.writes).toBe(0);
    // 경계 하나(11시) — 유닛 1만
    expect(injury.roll(11 * HOUR + 3)).toBe(1);
    expect(map.writes).toBe(1);
    expect(injuryAt(onMap.get(1)?.condition ?? HEALTHY, 11 * HOUR + 3)).toBeGreaterThan(0);
    expect(onMap.get(2)?.condition).toBe(HEALTHY);
    expect(onMap.get(3)?.condition).toBe(HEALTHY);
    expect(onMap.get(5)?.condition).toBe(HEALTHY);
    expect(other.writes).toBe(0);
    // 같은 경계는 다시 굴리지 않는다
    expect(injury.roll(11 * HOUR + 50)).toBe(0);
  });

  it("fixes-1117j 2741: 건물 없는 도시 직무 일꾼(cityJob)도 일하는 때에 굴린다 — 일 없는 휴먼은 그대로 뺀다", () => {
    configureInjuryRules(() => ({ ...C, workChancePm: 1000 }));
    const onMap = new Map<number, FakeUnit>([
      [1, { condition: HEALTHY, home: { x: 0, y: 0, cityJob: true, shift: ALWAYS } }],
      [2, { condition: HEALTHY, home: { x: 0, y: 0 } }],
      // 도시 직무지만 쉬는 바퀴(일 0ms)면 굴리지 않는다
      [
        3,
        {
          condition: HEALTHY,
          home: { x: 0, y: 0, cityJob: true, shift: { ...ALWAYS, cycle: { workMs: 0, periodMs: HOUR } } },
        },
      ],
    ]);
    const map = fakeMap(onMap);
    const injury = createNpcWorkInjury({
      units: new Map([
        [1, { id: 1, city: 10 }],
        [2, { id: 2, city: 10 }],
        [3, { id: 3, city: 10 }],
      ]),
      places: new Map([[10, { mapKey: 100 }]]),
      maps: new Map([[100, map]]),
      startMs: 10 * HOUR + 5,
    });
    expect(injury.roll(11 * HOUR + 3)).toBe(1);
    expect(injuryAt(onMap.get(1)?.condition ?? HEALTHY, 11 * HOUR + 3)).toBeGreaterThan(0);
    expect(onMap.get(2)?.condition).toBe(HEALTHY);
    expect(onMap.get(3)?.condition).toBe(HEALTHY);
  });

  it("확률 0이면 다치지 않고, 일하는 때가 아니면 굴리지 않는다", () => {
    configureInjuryRules(() => ({ ...C, workChancePm: 0 }));
    const onMap = new Map<number, FakeUnit>([
      [1, { condition: HEALTHY, home: { x: 0, y: 0, work: WORK, shift: ALWAYS } }],
    ]);
    const map = fakeMap(onMap);
    const injury = createNpcWorkInjury({
      units: new Map([[1, { id: 1, city: 10 }]]),
      places: new Map([[10, { mapKey: 100 }]]),
      maps: new Map([[100, map]]),
      startMs: 0,
    });
    expect(injury.roll(30 * HOUR)).toBe(0);
    expect(map.writes).toBe(0);
    // 쉬는 바퀴(일 0ms): 확률 1000‰이어도 굴리지 않는다
    configureInjuryRules(() => ({ ...C, workChancePm: 1000 }));
    onMap.set(1, {
      condition: HEALTHY,
      home: { x: 0, y: 0, work: WORK, shift: { ...ALWAYS, cycle: { workMs: 0, periodMs: HOUR } } },
    });
    expect(injury.roll(40 * HOUR)).toBe(0);
    expect(map.writes).toBe(0);
  });

  it("상태 기반 피로 저장소(fatigue)를 넘기면 실제로 일하는 중일 때만 실제 피로로 굴린다", () => {
    const seen: [number, number, number][] = [];
    const onMap = new Map<number, FakeUnit>([
      [1, { condition: HEALTHY, home: { x: 0, y: 0, work: WORK, shift: ALWAYS } }],
      [2, { condition: HEALTHY, home: { x: 0, y: 0, work: WORK, shift: ALWAYS } }],
    ]);
    const map = fakeMap(onMap);
    const injury = createNpcWorkInjury({
      units: new Map([
        [1, { id: 1, city: 10 }],
        [2, { id: 2, city: 10 }],
      ]),
      places: new Map([[10, { mapKey: 100 }]]),
      maps: new Map([[100, map]]),
      startMs: 10 * HOUR + 5,
      fatigue: {
        isWorking: (unitId) => unitId === 1,
        fatigueOf: (unitId) => (unitId === 1 ? 95 : 40),
        fatigueMax: () => 120,
      },
      hook: (_map, unitId, fatigue, fatigueMax) => {
        seen.push([unitId, fatigue, fatigueMax]);
        return 0;
      },
    });
    expect(injury.roll(11 * HOUR + 3)).toBe(0);
    // 쉬거나 비가동인 유닛 2는 건너뛰고, 일하는 유닛 1만 실제 피로(95/120)로 굴린다
    expect(seen).toEqual([[1, 95, 120]]);
  });
});
