import { describe, expect, it } from "vitest";
import { NAME_CROWD, NAME_MAX, chooseOthers, liftClear, overlaps } from "./unitNames.ts";

describe("2차맵 유닛 이름표 고르기", () => {
  it("다른 유닛 이름은 화면 가운데에서 가까운 차례로 상한까지, 너무 많으면 없다", () => {
    const center = { x: 200, y: 400 };
    const candidates = Array.from({ length: 15 }, (_, index) => ({
      unitId: index + 1,
      x: 200 + index * 10,
      y: 400,
    }));
    const chosen = chooseOthers(candidates.toReversed(), center);
    expect(chosen).toHaveLength(NAME_MAX);
    expect(chosen.map((c) => c.unitId)).toEqual(Array.from({ length: NAME_MAX }, (_, i) => i + 1));
    const crowd = Array.from({ length: NAME_CROWD + 1 }, (_, index) => ({ unitId: index + 1, x: 0, y: 0 }));
    expect(chooseOthers(crowd, center)).toEqual([]);
  });

  it("겹침: 가운데 아래 끝 기준 상자", () => {
    expect(overlaps({ x: 100, y: 100, width: 60 }, { x: 150, y: 100, width: 60 })).toBe(true);
    expect(overlaps({ x: 100, y: 100, width: 60 }, { x: 170, y: 100, width: 60 })).toBe(false);
    expect(overlaps({ x: 100, y: 100, width: 60 }, { x: 100, y: 130, width: 60 })).toBe(false);
  });

  it("늘 보이는 이름표는 지도자 이름표 위로 비키고, 다른 유닛 이름표는 겹치면 빠진다", () => {
    const leader = { x: 100, y: 100, width: 176 };
    const own = liftClear({ x: 110, y: 100, width: 70 }, [leader], 3);
    expect(own).not.toBeNull();
    expect(own && overlaps(own, leader)).toBe(false);
    expect(own?.y).toBeLessThan(100);
    expect(liftClear({ x: 110, y: 100, width: 70 }, [leader], 0)).toBeNull();
    expect(liftClear({ x: 400, y: 100, width: 70 }, [leader], 0)).toEqual({ x: 400, y: 100, width: 70 });
  });
});
