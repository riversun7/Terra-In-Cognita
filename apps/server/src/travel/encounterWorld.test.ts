// 좌표 규칙 월드 잇기(D-564 1641·1643) — 가짜 월드 몫으로: 지형 빠르기를 붙이고, 전쟁 중인 두 나라 좌표 유닛이 같은 띄우지 않은 2차맵에 있으면
// 지나던 유닛을 멈추고 그 2차맵을 띄워 전쟁 전투를 열고, 결과 적용까지 붙잡고, 쉬는 시간 동안 다시 찾지 않는다. 전쟁이 없으면 아무것도 하지 않는다.
import type { CombatUnitSpec } from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { OwnerRow } from "../world/persist/load.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { type CoordinateWorld, startCoordinateRules } from "./encounterWorld.ts";
import type { CoordinateUnit, TravelService } from "./serviceTypes.ts";

const START = 1_798_000_000_000;
const MAP = 5050;
const log = { info: () => {}, error: () => {} };

const unit = (unitId: number, ownerId: number, patch: Partial<CoordinateUnit> = {}): CoordinateUnit => ({
  unitId,
  ownerId,
  kind: 1,
  mapKey: MAP,
  cellX: 10,
  cellY: 10,
  moving: unitId === 3,
  aboard: null,
  sea: false,
  ...patch,
});

const owner = (id: number, factionId: number): OwnerRow => ({
  id,
  userId: null,
  factionId,
  settledAtMs: 0,
  upkeepArrears: 0,
  upkeepUnpaidAtMs: null,
});

function fakeWorld(options: { war: boolean; units: CoordinateUnit[] }) {
  const calls: string[] = [];
  const holds: [number, number][] = [];
  const battles: { war: boolean; sides: number[]; units: number[] }[] = [];
  const maps = new Map<number, Pick<SecondMap, "unitInfo">>();
  let paceOf: ((mapKey: number) => number) | undefined;
  const travel = {
    coordinateUnits: () => options.units,
    haltOn: (mapKey: number, ids: ReadonlySet<number>) => {
      calls.push(`halt:${mapKey}:${[...ids].join(",")}`);
      return [];
    },
    holdMap: (mapKey: number, until: number) => {
      holds.push([mapKey, until]);
    },
    attachPace: (next: ((mapKey: number) => number) | undefined) => {
      paceOf = next;
    },
  };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 시험: 가짜 몫(아래 칸만 쓴다)
  const world = {
    persistence: {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 시험: 좌표 규칙은 이동 서비스의 이 몫만 쓴다
      travel: travel as unknown as TravelService,
      spawn: {
        open: (mapKey: number) => {
          calls.push(`open:${mapKey}`);
          maps.set(mapKey, {
            unitInfo: (id: number) => {
              const found = options.units.find((u) => u.unitId === id);
              // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 시험: 주인만 읽는다
              return found ? ({ ownerId: found.ownerId } as ReturnType<SecondMap["unitInfo"]>) : undefined;
            },
          });
          return Promise.resolve("ok" as const);
        },
      },
      bodies: {
        build: (unitId: number, place: { side: number; party: number; x: number; y: number }) =>
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 시험: 자리 칸만 본다
          ({ id: unitId, ...place }) as unknown as CombatUnitSpec,
      },
      startBattle: (
        init: { sides: readonly { faction: number }[]; units: readonly { id: number }[] },
        war: boolean,
      ) => {
        battles.push({ war, sides: init.sides.map((s) => s.faction), units: init.units.map((u) => u.id) });
        return Promise.resolve(9);
      },
      battles: {
        get: () => Promise.resolve({ status: "running", endsAtMs: START + 120_000, outcome: null }),
      },
      owners: new Map([
        [1, owner(1, 100)],
        [2, owner(2, 100)],
        [3, owner(3, 200)],
      ]),
      cyborgs: { record: () => undefined },
    },
    npc: {
      world: {
        factions: new Map([
          [100, { wars: new Set(options.war ? [200] : []) }],
          [200, { wars: new Set(options.war ? [100] : []) }],
        ]),
      },
    },
    maps,
    terrain: { cellValues: () => undefined },
    status: () => ({ state: "ready" }),
  } as unknown as CoordinateWorld;
  return { world, calls, holds, battles, pace: () => paceOf };
}

describe("startCoordinateRules", () => {
  it("전쟁 중인 두 나라 좌표 유닛이 만나면: 멈추고 → 띄우고 → 전쟁 전투 → 결과 적용까지 붙잡고, 쉬는 시간에는 다시 찾지 않는다", async () => {
    let now = START;
    const rig = fakeWorld({ war: true, units: [unit(1, 1), unit(2, 2), unit(3, 3)] });
    const rules = startCoordinateRules(rig.world, { now: () => now, log, timer: false });
    if (!rules) throw new Error("no rules");
    // 지형 빠르기를 붙였다(행성 값이 없으면 1000)
    expect(rig.pace()?.(MAP)).toBe(1000);
    expect(await rules.scan()).toBe(1);
    expect(rig.calls).toEqual([`halt:${MAP}:1,2,3`, `open:${MAP}`]);
    expect(rig.battles).toEqual([{ war: true, sides: [1, 3], units: [1, 2, 3] }]);
    expect(rig.holds.at(-1)).toEqual([MAP, START + 120_000 + 60_000]);
    // 띄운 2차맵·쉬는 시간: 다시 찾지 않는다
    expect(await rules.scan()).toBe(0);
    now += 60_000;
    expect(await rules.scan()).toBe(0);
    rules.stop();
    expect(rig.pace()).toBeUndefined();
  });

  it("전쟁이 없거나 한 나라뿐이면 아무것도 하지 않는다", async () => {
    const peace = fakeWorld({ war: false, units: [unit(1, 1), unit(3, 3)] });
    const rules = startCoordinateRules(peace.world, { now: () => START, log, timer: false });
    expect(await rules?.scan()).toBe(0);
    expect(peace.calls).toEqual([]);
    rules?.stop();
    const alone = fakeWorld({ war: true, units: [unit(1, 1), unit(2, 2)] });
    const second = startCoordinateRules(alone.world, { now: () => START, log, timer: false });
    expect(await second?.scan()).toBe(0);
    expect(alone.calls).toEqual([]);
    second?.stop();
  });
});
