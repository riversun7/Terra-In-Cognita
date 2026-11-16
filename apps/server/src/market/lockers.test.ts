// 개인 창고 유닛 세기(misc-574 — D-571 1943 "유닛마다 작은한도 창고", D-148 "누구나 어디서든 주문"): 띄운 2차맵 + 좌표 유닛, 위치와 상관없이 모든 유닛
import { describe, expect, it } from "vitest";
import { UNIT_KIND_BOT, UNIT_KIND_CYBORG, UNIT_KIND_HUMAN } from "../world/unitKinds.ts";
import { type LockerMap, lockerUnitsOf } from "./lockers.ts";

const mapWith = (units: { id: number; ownerId: number; kind: number }[]): LockerMap => ({
  forEachUnit: (visit) => {
    for (const unit of units) visit(unit);
  },
});

describe("lockerUnitsOf", () => {
  it("2차맵에 유닛이 없어도 좌표 유닛(1차맵을 걷는 유닛·띄우지 않은 2차맵)을 센다 — 겹친 유닛은 한 번", () => {
    const maps = new Map([[1, mapWith([{ id: 5, ownerId: 7, kind: UNIT_KIND_HUMAN }])]]);
    const coords = {
      coordinateUnits: () => [
        { unitId: 3, ownerId: 7, kind: UNIT_KIND_CYBORG },
        { unitId: 5, ownerId: 7, kind: UNIT_KIND_HUMAN },
        { unitId: 9, ownerId: 7, kind: UNIT_KIND_BOT },
        { unitId: 11, ownerId: 8, kind: UNIT_KIND_HUMAN },
      ],
    };
    const lockers = { steps: (_city: number, unitId: number) => (unitId === 3 ? 2 : 0) };
    expect(lockerUnitsOf(maps, lockers, 7, 1, coords)).toEqual([
      { unitId: 3, cyborg: true, steps: 2 },
      { unitId: 5, cyborg: false, steps: 0 },
    ]);
    expect(lockerUnitsOf(new Map(), lockers, 7, 1, coords).map((unit) => unit.unitId)).toEqual([3, 5]);
    expect(lockerUnitsOf(new Map(), lockers, 7, 1)).toEqual([]);
  });
});
