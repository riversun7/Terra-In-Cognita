// 좌표 유닛 조우 찾기(D-564 1641, D-570 1904 — 다른 나라면 모두)
import { describe, expect, it } from "vitest";
import { groupEncounters, sidePairs } from "./encounter.ts";
import type { CoordinateUnit } from "./serviceTypes.ts";

const unit = (unitId: number, ownerId: number, mapKey: number, patch: Partial<CoordinateUnit> = {}) =>
  ({
    unitId,
    ownerId,
    kind: 4,
    mapKey,
    cellX: 10,
    cellY: 10,
    moving: false,
    aboard: null,
    sea: false,
    ...patch,
  }) satisfies CoordinateUnit;

// 주체 1·2 = 나라 100, 주체 3 = 나라 200, 주체 4 = 나라 300, 주체 5 = 나라 없음
const nations = new Map([
  [1, 100],
  [2, 100],
  [3, 200],
  [4, 300],
]);
const nationOf = (owner: number) => nations.get(owner);

describe("groupEncounters", () => {
  it("같은 2차맵의 다른 나라 좌표 유닛을 나라별 편으로(가는 중 포함, 전쟁이 아니어도)", () => {
    const found = groupEncounters(
      [unit(3, 3, 50, { moving: true }), unit(1, 1, 50), unit(2, 2, 50), unit(9, 4, 50)],
      nationOf,
      () => false,
    );
    expect(found.map((group) => group.mapKey)).toEqual([50]);
    expect(found[0]?.sides.map((side) => [side.nation, side.units.map((u) => u.unitId)])).toEqual([
      [100, [1, 2]],
      [200, [3]],
      [300, [9]],
    ]);
    expect(sidePairs(found[0]?.sides ?? []).map(([a, b]) => [a.nation, b.nation])).toEqual([
      [100, 200],
      [100, 300],
      [200, 300],
    ]);
  });

  it("다른 2차맵·한 나라뿐·나라 없음·배·승객·건너뛸 2차맵은 만나지 않는다", () => {
    expect(groupEncounters([unit(1, 1, 50), unit(3, 3, 51)], nationOf, () => false)).toEqual([]);
    expect(groupEncounters([unit(1, 1, 50), unit(2, 2, 50)], nationOf, () => false)).toEqual([]);
    expect(groupEncounters([unit(1, 1, 50), unit(8, 5, 50)], nationOf, () => false)).toEqual([]);
    expect(groupEncounters([unit(1, 1, 50, { sea: true }), unit(3, 3, 50)], nationOf, () => false)).toEqual(
      [],
    );
    expect(groupEncounters([unit(1, 1, 50, { aboard: 7 }), unit(3, 3, 50)], nationOf, () => false)).toEqual(
      [],
    );
    expect(groupEncounters([unit(1, 1, 50), unit(3, 3, 50)], nationOf, (key) => key === 50)).toEqual([]);
  });
});
