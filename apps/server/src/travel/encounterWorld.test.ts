// 조우 규칙 월드 잇기(D-564 1641·1643, D-570 1901·1902·1904) — 가짜 월드 몫으로:
// - 좌표 유닛: 다른 나라 편이 같은 띄우지 않은 2차맵에 있으면 두 편이 판단하고, 한 편이라도 걸면 멈춤 → 띄움 → 전투(공격 편 = 편 1), 결과까지 붙잡음.
// - 띄운 2차맵: 다른 나라 유닛이 거리 안이면 같은 판단 → 그 자리에서 전투(시가지 안이면 싸우지 않음).
// - 둘 다 회피면 쉬는 시간 동안 다시 보지 않는다. 전쟁이 아니면 짐이 있을 때만 약탈(전쟁 전투 아님).
import type { CombatUnitSpec, Motion } from "@terra/sim";
import { CELL_UNITS, createMotion } from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { OwnerRow } from "../world/persist/load.ts";
import type { SecondMap, UnitView } from "../world/secondMap.ts";
import { type CoordinateWorld, startCoordinateRules } from "./encounterWorld.ts";
import type { CoordinateUnit, TravelService } from "./serviceTypes.ts";

const START = 1_798_000_000_000;
const COORD_MAP = 5050;
const LOADED_MAP = 6060;
const log = { info: () => {}, error: () => {} };
const KIND_HUMAN = 4;
const KIND_CYBORG = 3;
const KIND_BOT = 0;

const coord = (unitId: number, ownerId: number, patch: Partial<CoordinateUnit> = {}): CoordinateUnit => ({
  unitId,
  ownerId,
  kind: KIND_HUMAN,
  mapKey: COORD_MAP,
  cellX: 10 + unitId,
  cellY: 10,
  moving: unitId === 3,
  aboard: null,
  sea: false,
  ...patch,
});

const owner = (id: number, factionId: number | null, userId: string | null = null): OwnerRow => ({
  id,
  userId,
  factionId,
  settledAtMs: 0,
  upkeepArrears: 0,
  upkeepUnpaidAtMs: null,
});

const still = (x: number, y: number): Motion =>
  createMotion({
    waypoints: [{ x: x * CELL_UNITS + CELL_UNITS / 2, y: y * CELL_UNITS + CELL_UNITS / 2 }],
    departAtMs: 0,
    speed: 1,
  });

interface FakeUnit {
  readonly id: number;
  readonly ownerId: number;
  readonly kind: number;
  readonly x: number;
  readonly y: number;
}

function fakeMap(mapKey: number, units: FakeUnit[], halted: number[]): SecondMap {
  const condition = { injury: 0, injuryUntilMs: null, healPm: 1000, heldBy: null };
  const map = {
    mapKey,
    planetId: "p",
    forEachUnit: (visit: (view: UnitView) => void) => {
      for (const unit of units) {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 시험: 조우가 읽는 칸만
        const view = {
          id: unit.id,
          ownerId: unit.ownerId,
          kind: unit.kind,
          motion: still(unit.x, unit.y),
          job: { job: 0 },
        } as unknown as UnitView;
        visit(view);
      }
    },
    unitInfo: (id: number) => {
      const unit = units.find((u) => u.id === id);
      return unit
        ? // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 시험: 주인·움직임·상태만
          ({
            ownerId: unit.ownerId,
            kind: unit.kind,
            motion: still(unit.x, unit.y),
            condition,
            aboard: undefined,
          } as unknown as ReturnType<SecondMap["unitInfo"]>)
        : undefined;
    },
    halt: (id: number) => {
      halted.push(id);
      return true;
    },
    forEachBuilding: () => {},
    replicaInit: () => ({ terrainCost: new Uint16Array(256 * 256).fill(1000) }),
    terrainFile: () => {
      throw new Error("no terrain");
    },
  };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 시험: 조우가 쓰는 몫만
  return map as unknown as SecondMap;
}

function fakeWorld(options: {
  war: boolean;
  coords?: CoordinateUnit[];
  loaded?: FakeUnit[];
  cargo?: number[];
  urban?: boolean;
  owners?: OwnerRow[];
}) {
  const calls: string[] = [];
  const holds: [number, number][] = [];
  const halted: number[] = [];
  const battles: { war: boolean; sides: unknown[]; units: number[] }[] = [];
  const maps = new Map<number, SecondMap>();
  if (options.loaded) maps.set(LOADED_MAP, fakeMap(LOADED_MAP, options.loaded, halted));
  let paceOf: ((mapKey: number) => number) | undefined;
  const travel = {
    coordinateUnits: () => options.coords ?? [],
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
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 시험: 조우 규칙은 이동 서비스의 이 몫만 쓴다
      travel: travel as unknown as TravelService,
      spawn: {
        open: (mapKey: number) => {
          calls.push(`open:${mapKey}`);
          const units = (options.coords ?? []).map((u) => ({
            id: u.unitId,
            ownerId: u.ownerId,
            kind: u.kind,
            x: u.cellX,
            y: u.cellY,
          }));
          maps.set(mapKey, fakeMap(mapKey, units, halted));
          return Promise.resolve("ok" as const);
        },
      },
      bodies: {
        build: (unitId: number, place: { side: number; party: number; x: number; y: number }) =>
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 시험: 자리 칸·전력 칸만 본다
          ({
            id: unitId,
            ...place,
            maxHp: 100,
            armorHp: 0,
            shieldHp: 0,
            attack: { statAttack: 10, weaponAttack: 0 },
            attackIntervalMs: 1000,
          }) as unknown as CombatUnitSpec,
      },
      startBattle: (init: { sides: readonly unknown[]; units: readonly { id: number }[] }, war: boolean) => {
        battles.push({ war, sides: [...init.sides], units: init.units.map((u) => u.id) });
        return Promise.resolve(9);
      },
      battles: {
        get: () => Promise.resolve({ status: "running", endsAtMs: START + 120_000, outcome: null }),
      },
      owners: new Map(
        (options.owners ?? [owner(1, 100), owner(2, 100), owner(3, 200)]).map((o) => [o.id, o]),
      ),
      cyborgs: { record: () => undefined },
      ledger: {
        accounts: () => {
          const rows = (options.cargo ?? []).map((unitId) => ({
            id: unitId,
            ownerId: 0,
            systemCode: null,
            asset: "item:x",
            location: -unitId,
            balance: 5n,
          }));
          return rows.values();
        },
      },
      territory: { urbanCity: () => Promise.resolve(options.urban ? 1 : null) },
    },
    npc: {
      world: {
        factions: new Map([
          [100, { wars: new Set(options.war ? [200] : []), traits: { aggression: 500 } }],
          [200, { wars: new Set(options.war ? [100] : []), traits: { aggression: 500 } }],
        ]),
      },
    },
    maps,
    terrain: { cellValues: () => undefined },
    status: () => ({ state: "ready" }),
  } as unknown as CoordinateWorld;
  return { world, calls, holds, halted, battles, pace: () => paceOf };
}

describe("startCoordinateRules — 좌표 유닛", () => {
  it("전쟁 중 다른 나라 편이 만나면: 센 편이 걸어 멈추고 → 띄우고 → 전쟁 전투(공격 편 = 편 1) → 결과까지 붙잡고, 쉬는 시간에는 다시 보지 않는다", async () => {
    let now = START;
    const rig = fakeWorld({ war: true, coords: [coord(1, 1), coord(2, 2), coord(3, 3)] });
    const rules = startCoordinateRules(rig.world, { now: () => now, log, timer: false });
    if (!rules) throw new Error("no rules");
    // 지형 빠르기를 붙였다(행성 값이 없으면 1000)
    expect(rig.pace()?.(COORD_MAP)).toBe(1000);
    expect(await rules.scan()).toBe(1);
    expect(rig.calls).toEqual([`halt:${COORD_MAP}:1,2,3`, `open:${COORD_MAP}`]);
    expect(rig.battles).toMatchObject([
      {
        war: true,
        sides: [
          { id: 1, faction: 1, defender: false },
          { id: 2, faction: 3, defender: true },
        ],
        units: [1, 2, 3],
      },
    ]);
    expect(rig.holds.at(-1)).toEqual([COORD_MAP, START + 120_000 + 60_000]);
    // 띄운 2차맵(이제 띄운 2차맵 판정)·쉬는 시간: 다시 열지 않는다
    expect(await rules.scan()).toBe(0);
    now += 60_000;
    expect(await rules.scan()).toBe(0);
    expect(rules.takeMetrics()).toMatchObject({ encounterBattles: 1, encounterScans: 3 });
    rules.stop();
    expect(rig.pace()).toBeUndefined();
  });

  it("전쟁이 아니고 짐이 없거나, 플레이어 편(기본 회피)뿐이거나, 한 나라뿐이면 싸우지 않는다", async () => {
    const peace = fakeWorld({ war: false, coords: [coord(1, 1), coord(3, 3)] });
    const a = startCoordinateRules(peace.world, { now: () => START, log, timer: false });
    expect(await a?.scan()).toBe(0);
    expect(peace.calls).toEqual([]);
    expect(a?.takeMetrics()).toMatchObject({ encounterContacts: 1, encounterAvoided: 1 });
    a?.stop();
    const players = fakeWorld({
      war: true,
      coords: [coord(1, 1), coord(3, 3)],
      owners: [owner(1, null, "u1"), owner(3, null, "u3")],
    });
    // 플레이어 주체의 나라 = 시민권(가짜: cyborgs.record가 없으니 나라 없음) → 만나지 않음
    const b = startCoordinateRules(players.world, { now: () => START, log, timer: false });
    expect(await b?.scan()).toBe(0);
    b?.stop();
    const alone = fakeWorld({ war: true, coords: [coord(1, 1), coord(2, 2)] });
    const c = startCoordinateRules(alone.world, { now: () => START, log, timer: false });
    expect(await c?.scan()).toBe(0);
    expect(alone.calls).toEqual([]);
    c?.stop();
  });

  it("전쟁이 아니어도 상대가 짐을 지녔고 전력 비가 약탈 문턱 이상이면 약탈(전쟁 전투 아님)", async () => {
    const rig = fakeWorld({
      war: false,
      coords: [coord(1, 1), coord(2, 2), coord(3, 3)],
      cargo: [3],
    });
    const rules = startCoordinateRules(rig.world, { now: () => START, log, timer: false });
    expect(await rules?.scan()).toBe(1);
    expect(rig.battles).toMatchObject([{ war: false, units: [1, 2, 3] }]);
    rules?.stop();
  });
});

describe("startCoordinateRules — 띄운 2차맵(1901)", () => {
  it("다른 나라 유닛이 거리 안이면 그 자리에서 전투(길이 없는 유닛도 세운다), 봇은 판단하지 않는다", async () => {
    const rig = fakeWorld({
      war: true,
      loaded: [
        { id: 1, ownerId: 1, kind: KIND_CYBORG, x: 100, y: 100 },
        { id: 3, ownerId: 3, kind: KIND_CYBORG, x: 104, y: 100 },
        { id: 8, ownerId: 3, kind: KIND_BOT, x: 30, y: 30 },
      ],
    });
    const rules = startCoordinateRules(rig.world, { now: () => START, log, timer: false });
    expect(await rules?.scan()).toBe(1);
    expect(rig.calls).toEqual([`halt:${LOADED_MAP}:1,3`]);
    expect(rig.halted).toEqual([1, 3]);
    expect(rig.battles).toMatchObject([{ war: true, units: [1, 3] }]);
    rules?.stop();
  });

  it("거리 밖·시가지 안이면 싸우지 않는다", async () => {
    const far = fakeWorld({
      war: true,
      loaded: [
        { id: 1, ownerId: 1, kind: KIND_CYBORG, x: 100, y: 100 },
        { id: 3, ownerId: 3, kind: KIND_CYBORG, x: 140, y: 100 },
      ],
    });
    const a = startCoordinateRules(far.world, { now: () => START, log, timer: false });
    expect(await a?.scan()).toBe(0);
    expect(a?.takeMetrics()).toMatchObject({ encounterContacts: 0 });
    a?.stop();
    const urban = fakeWorld({
      war: true,
      urban: true,
      loaded: [
        { id: 1, ownerId: 1, kind: KIND_CYBORG, x: 100, y: 100 },
        { id: 3, ownerId: 3, kind: KIND_CYBORG, x: 104, y: 100 },
      ],
    });
    const b = startCoordinateRules(urban.world, { now: () => START, log, timer: false });
    expect(await b?.scan()).toBe(0);
    expect(urban.battles).toEqual([]);
    expect(b?.takeMetrics()).toMatchObject({ encounterSafe: 1 });
    b?.stop();
  });
});
