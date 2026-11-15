// 좌표 유닛 조우 찾기(D-564 1641)와 조우 전투 시작 자료
import type { CombatUnitSpec } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { findEncounters } from "./encounter.ts";
import { ENCOUNTER_MAP_SIZE, encounterBattleInit } from "./encounterWorld.ts";
import type { CoordinateUnit } from "./serviceTypes.ts";

const unit = (unitId: number, ownerId: number, mapKey: number, patch: Partial<CoordinateUnit> = {}) =>
  ({
    unitId,
    ownerId,
    kind: 1,
    mapKey,
    cellX: 10,
    cellY: 10,
    moving: false,
    aboard: null,
    sea: false,
    ...patch,
  }) satisfies CoordinateUnit;

// 주체 1·2 = 나라 100, 주체 3 = 나라 200, 주체 4 = 나라 300, 주체 5 = 나라 없음. 100 ↔ 200 전쟁
const nations = new Map([
  [1, 100],
  [2, 100],
  [3, 200],
  [4, 300],
]);
const nationOf = (owner: number) => nations.get(owner);
const atWar = (a: number, b: number) => (a === 100 && b === 200) || (a === 200 && b === 100);

describe("findEncounters", () => {
  it("같은 2차맵에 전쟁 중인 두 나라 좌표 유닛이 있으면 조우(가는 중 포함, 나라마다 한 편)", () => {
    const found = findEncounters(
      [unit(3, 3, 50, { moving: true }), unit(1, 1, 50), unit(2, 2, 50), unit(9, 4, 50)],
      nationOf,
      atWar,
      () => false,
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.mapKey).toBe(50);
    expect(found[0]?.sides.map((side) => [side.nation, side.units.map((u) => u.unitId)])).toEqual([
      [100, [1, 2]],
      [200, [3]],
    ]);
  });

  it("다른 2차맵·전쟁 아님·나라 없음·배·승객·건너뛸 2차맵은 만나지 않는다", () => {
    expect(findEncounters([unit(1, 1, 50), unit(3, 3, 51)], nationOf, atWar, () => false)).toEqual([]);
    expect(findEncounters([unit(1, 1, 50), unit(9, 4, 50)], nationOf, atWar, () => false)).toEqual([]);
    expect(findEncounters([unit(1, 1, 50), unit(8, 5, 50)], nationOf, atWar, () => false)).toEqual([]);
    expect(
      findEncounters([unit(1, 1, 50, { sea: true }), unit(3, 3, 50)], nationOf, atWar, () => false),
    ).toEqual([]);
    expect(
      findEncounters([unit(1, 1, 50, { aboard: 7 }), unit(3, 3, 50)], nationOf, atWar, () => false),
    ).toEqual([]);
    expect(findEncounters([unit(1, 1, 50), unit(3, 3, 50)], nationOf, atWar, (key) => key === 50)).toEqual(
      [],
    );
  });
});

const spec = (unitId: number, spot: { side: number; party: number; x: number; y: number }) =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 시험: 자리 칸만 본다
  ({ id: unitId, ...spot }) as unknown as CombatUnitSpec;

describe("encounterBattleInit", () => {
  const encounter = findEncounters(
    [unit(1, 1, 50), unit(2, 2, 50), unit(3, 3, 50)],
    nationOf,
    atWar,
    () => false,
  )[0];

  it("편 1 = 나라 ID가 작은 쪽(서쪽), 편 2 = 맞은편, faction = 그 편 첫 유닛 주체, 열린 64칸", () => {
    if (!encounter) throw new Error("no encounter");
    const init = encounterBattleInit(encounter, (id) => id, spec, 42);
    expect(init?.kind).toBe("normal");
    expect(init?.map.size).toBe(ENCOUNTER_MAP_SIZE);
    expect(init?.map.buildings).toEqual([]);
    expect(init?.sides).toEqual([
      { id: 1, faction: 1, defender: false, edge: 3 },
      { id: 2, faction: 3, defender: true, edge: 1 },
    ]);
    expect(init?.units.map((u) => [u.id, u.side, u.x < ENCOUNTER_MAP_SIZE / 2])).toEqual([
      [1, 1, true],
      [2, 1, true],
      [3, 2, false],
    ]);
    expect(init?.parties.map((p) => p.side).toSorted()).toEqual([1, 2]);
  });

  it("한 편이 전투 사양을 하나도 얻지 못하면 null", () => {
    if (!encounter) throw new Error("no encounter");
    expect(
      encounterBattleInit(
        encounter,
        (id) => id,
        (id, spot) => (id === 3 ? undefined : spec(id, spot)),
        1,
      ),
    ).toBe(null);
  });
});
