import { DEFAULT_UNIT_TRAITS } from "@terra/shared/unitTraits";
import { describe, expect, it } from "vitest";
import { deriveUnitDrives } from "./unitDrives.ts";

describe("unitDrives (1차 값 → 2차 지수)", () => {
  const traits = { ...DEFAULT_UNIT_TRAITS, discipline: 800, greed: 600, communalism: 500 };

  it("만족도가 낮을수록, 굶을수록 근로 의욕이 떨어진다", () => {
    const full = deriveUnitDrives({ traits, satisfactionMilli: 100_000, fedPm: 1000 });
    const unhappy = deriveUnitDrives({ traits, satisfactionMilli: 20_000, fedPm: 1000 });
    const hungry = deriveUnitDrives({ traits, satisfactionMilli: 100_000, fedPm: 0 });
    // 성향 바탕 = (800×5 + 600×3 + 500×2) ÷ 10 = 680
    expect(full.work).toBe(680);
    expect(unhappy.work).toBeLessThan(full.work);
    expect(hungry.work).toBe(340);
  });

  it("만족도를 아직 세지 않았으면 만족도 요소를 빼고, 복종도는 가득이다", () => {
    const unknown = deriveUnitDrives({ traits, satisfactionMilli: null, fedPm: null });
    expect(unknown.work).toBe(680);
    expect(unknown.obedience).toBe(1000);
  });

  it("복종도는 만족도가 낮고 자치 성향이 높을수록 떨어진다", () => {
    const loyal = deriveUnitDrives({ traits, satisfactionMilli: 90_000, fedPm: 1000 });
    const sullen = deriveUnitDrives({ traits, satisfactionMilli: 30_000, fedPm: 1000 });
    const rebel = deriveUnitDrives({
      traits: { ...traits, autonomy: 950, discipline: 100 },
      satisfactionMilli: 30_000,
      fedPm: 1000,
    });
    expect(loyal.obedience).toBeGreaterThan(sullen.obedience);
    expect(sullen.obedience).toBeGreaterThan(rebel.obedience);
  });

  it("모든 지수는 0~1000 안이다", () => {
    for (const v of [0, 500, 1000]) {
      const d = deriveUnitDrives({
        traits: {
          belligerence: v,
          greed: v,
          boldness: v,
          communalism: v,
          autonomy: v,
          openness: v,
          discipline: v,
        },
        satisfactionMilli: v * 100,
        fedPm: v,
      });
      for (const value of Object.values(d)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1000);
      }
    }
  });
});
