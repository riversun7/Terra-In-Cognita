// 관리인이 맡은 다친 유닛의 자율 판단 시험(league-2, D-590 2507 가 — labor/stewardCare.ts). 병원 서비스·2차맵은 가짜다.
import { describe, expect, it } from "vitest";
import { HEALTHY } from "../world/unitCondition.ts";
import { createStewardCare, injuryWeightPm, stewardRisk, stewardTreats } from "./stewardCare.ts";

/** 7축 성향 배열(@terra/shared/unitTraits 축 차례) — 모두 같은 값 */
const flat = (value: number) => Array.from({ length: 7 }, () => value);

describe("관리인 부상 자율 판단(stewardCare.ts)", () => {
  it("부상 무게 > 위험 감수면 병원, 아니면 계속 일한다(성향 없으면 가운데 500)", () => {
    expect(injuryWeightPm(1)).toBe(333);
    expect(injuryWeightPm(3)).toBe(1000);
    expect(stewardRisk(undefined)).toBe(500);
    expect(stewardTreats(0, 0)).toBe(false);
    // 가운데: 경상은 일, 중상부터 병원
    expect(stewardTreats(1, 500)).toBe(false);
    expect(stewardTreats(2, 500)).toBe(true);
    // 과감한 유닛(위험 감수 900)은 중상도 일한다, 신중한 유닛(100)은 경상에도 간다
    expect(stewardTreats(2, 900)).toBe(false);
    expect(stewardTreats(3, 900)).toBe(true);
    expect(stewardTreats(1, 100)).toBe(true);
  });

  it("관리인이 맡은 다친 유닛만, 그 도시 병원의 낼 수 있는 첫 견적으로 치료한다", async () => {
    const now = 1_000_000;
    // 유닛 1: 관리인 일·중상(성향 없음 → 병원), 2: 관리인 일·경상(가운데 → 일), 3: 관리인 일 아님·중상, 4: 다른 사람
    const condition = (injury: number) => ({ ...HEALTHY, injury, injuryUntilMs: now + 86_400_000 });
    const units = [
      { id: 1, kind: 1, ownerId: 10, traits: undefined, condition: condition(2) },
      { id: 2, kind: 1, ownerId: 10, traits: flat(500), condition: condition(1) },
      { id: 3, kind: 1, ownerId: 10, traits: undefined, condition: condition(2) },
      { id: 4, kind: 1, ownerId: 11, traits: undefined, condition: condition(2) },
    ];
    const map = {
      forEachUnit: (visit: (unit: (typeof units)[number]) => void) => units.forEach(visit),
      unitInfo: (id: number) => units.find((unit) => unit.id === id),
    };
    const treated: { userId: string; unit: number; buildingId: number }[] = [];
    const care = createStewardCare({
      maps: new Map([[1, map]]),
      hospital: () => ({
        overview: async () => ({
          units: [
            {
              unit: 1,
              options: [
                { buildingId: 7, cost: "900", affordable: false },
                { buildingId: 8, cost: "300", affordable: true },
              ],
            },
          ],
        }),
        treat: async (userId, input) => {
          treated.push({ userId, unit: input.unit, buildingId: input.buildingId });
          return { ok: true };
        },
      }),
    });
    const count = await care({
      owners: new Map([[10, "u10"]]),
      stewarded: (unitId) => unitId !== 3,
      kinds: new Set([1]),
      nowMs: now,
    });
    expect(count).toBe(1);
    expect(treated).toEqual([{ userId: "u10", unit: 1, buildingId: 8 }]);
    // 병원 서비스가 없으면 아무것도 안 한다
    expect(
      await createStewardCare({ maps: new Map([[1, map]]), hospital: () => undefined })({
        owners: new Map([[10, "u10"]]),
        stewarded: () => true,
        kinds: new Set([1]),
        nowMs: now,
      }),
    ).toBe(0);
  });
});
