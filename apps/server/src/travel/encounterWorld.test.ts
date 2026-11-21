// 조우 규칙 월드 잇기(D-564 1641·1643, D-570 1901·1902·1904) — 가짜 월드 몫으로:
// - 좌표 유닛: 다른 나라 편이 같은 띄우지 않은 2차맵에 있으면 두 편이 판단하고, 한 편이라도 걸면 멈춤 → 띄움 → 전투(공격 편 = 편 1), 결과까지 붙잡음.
// - 띄운 2차맵: 다른 나라 유닛이 거리 안이면 같은 판단 → 그 자리에서 전투(시가지 안이면 싸우지 않음).
// - 둘 다 회피면 쉬는 시간 동안 다시 보지 않는다. 전쟁이 아니면 짐이 있을 때만 약탈(전쟁 전투 아님).
import type { CombatUnitSpec, Motion } from "@terra/sim";
import { CELL_UNITS, createMotion } from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { OwnerRow } from "../world/persist/load.ts";
import type { SecondMap, UnitView } from "../world/secondMap.ts";
import { registerGather } from "../gather/registry.ts";
import { unitTacticsOf } from "../tactics/store.ts";
import type { GatherService } from "../gather/serviceTypes.ts";
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
  speed: 1000,
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
  /** 걷기 빠르기(기본 1000) */
  readonly speed?: number;
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
            speed: unit.speed ?? 1000,
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
  /** 접속 중인 사용자 */
  online?: string[];
  /** 저장한 AI 작전 줄(unit_tactics) */
  tactics?: Record<string, unknown>[];
  /** 채집 줄이 있는 유닛(suspend가 true) */
  gathering?: number[];
  /** 나라 200의 공격 성향(기본 500) */
  aggression?: number;
  /** 사용자 → 소유 주체(일부러 치기) */
  users?: Record<string, number>;
}) {
  const calls: string[] = [];
  const holds: [number, number][] = [];
  const halted: number[] = [];
  const battles: { war: boolean; sides: unknown[]; units: number[]; targets?: unknown }[] = [];
  const inputs: unknown[] = [];
  const suspended: number[] = [];
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
      startBattle: (
        init: { sides: readonly unknown[]; units: readonly { id: number }[]; targets?: unknown },
        war: boolean,
      ) => {
        battles.push({
          war,
          sides: [...init.sides],
          units: init.units.map((u) => u.id),
          targets: init.targets,
        });
        return Promise.resolve(9);
      },
      battles: {
        get: () => Promise.resolve({ status: "running", endsAtMs: START + 120_000, outcome: null }),
        addInput: (_id: number, input: unknown) => {
          inputs.push(input);
          return Promise.resolve();
        },
      },
      settlement: {
        offlineSince: (userId: string) => ((options.online ?? []).includes(userId) ? null : 1),
        findOwnerOfUser: (userId: string) => options.users?.[userId],
      },
      pool: { query: () => Promise.resolve({ rows: options.tactics ?? [] }) },
      writer: { upsert: () => {} },
      owners: new Map(
        (options.owners ?? [owner(1, 100), owner(2, 100), owner(3, 200)]).map((o) => [o.id, o]),
      ),
      // 사용자 주체 u1은 나라 100 시민
      cyborgs: {
        record: (userId: string) => (userId === "u1" ? { factionId: 100, startCityId: 1 } : undefined),
      },
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
          [
            200,
            { wars: new Set(options.war ? [100] : []), traits: { aggression: options.aggression ?? 500 } },
          ],
        ]),
      },
    },
    maps,
    terrain: { cellValues: () => undefined },
    status: () => ({ state: "ready" }),
  } as unknown as CoordinateWorld;
  const gather = {
    suspend: (unitId: number) => {
      if (!(options.gathering ?? []).includes(unitId)) return false;
      suspended.push(unitId);
      return true;
    },
  };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 시험: 조우가 쓰는 suspend만
  registerGather(world.persistence ?? {}, gather as unknown as GatherService);
  return { world, calls, holds, halted, battles, inputs, suspended, pace: () => paceOf };
}

describe("startCoordinateRules — 좌표 유닛", () => {
  it("전쟁 중 다른 나라 편이 만나면: 센 편이 걸어 멈추고 → 띄우고 → 전쟁 전투(공격 편 = 편 1) → 결과까지 붙잡고, 쉬는 시간에는 다시 보지 않는다", async () => {
    let now = START;
    const rig = fakeWorld({ war: true, coords: [coord(1, 1), coord(2, 2), coord(3, 3)] });
    const rules = startCoordinateRules(rig.world, { now: () => now, log, timer: false, roll: () => 0 });
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

  it("전쟁이 아니고 짐이 없거나, 나라 없는 플레이어 편뿐이거나, 한 나라뿐이면 싸우지 않는다", async () => {
    const peace = fakeWorld({ war: false, coords: [coord(1, 1), coord(3, 3)] });
    const a = startCoordinateRules(peace.world, { now: () => START, log, timer: false, roll: () => 0 });
    expect(await a?.scan()).toBe(0);
    expect(peace.calls).toEqual([]);
    expect(a?.takeMetrics()).toMatchObject({ encounterContacts: 1, encounterAvoided: 1 });
    a?.stop();
    const players = fakeWorld({
      war: true,
      coords: [coord(1, 1), coord(3, 3)],
      owners: [owner(1, null, "u0"), owner(3, null, "u3")],
    });
    // 플레이어 주체의 나라 = 시민권(가짜: u3은 시민권이 없어 나라 없음) → 만나지 않음
    const b = startCoordinateRules(players.world, { now: () => START, log, timer: false, roll: () => 0 });
    expect(await b?.scan()).toBe(0);
    b?.stop();
    const alone = fakeWorld({ war: true, coords: [coord(1, 1), coord(2, 2)] });
    const c = startCoordinateRules(alone.world, { now: () => START, log, timer: false, roll: () => 0 });
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
    const rules = startCoordinateRules(rig.world, { now: () => START, log, timer: false, roll: () => 0 });
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
    const rules = startCoordinateRules(rig.world, { now: () => START, log, timer: false, roll: () => 0 });
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
    const a = startCoordinateRules(far.world, { now: () => START, log, timer: false, roll: () => 0 });
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
    const b = startCoordinateRules(urban.world, { now: () => START, log, timer: false, roll: () => 0 });
    expect(await b?.scan()).toBe(0);
    expect(urban.battles).toEqual([]);
    expect(b?.takeMetrics()).toMatchObject({ encounterSafe: 1 });
    b?.stop();
  });
});

describe("startCoordinateRules — 일부러 치기(unit_attack — fixes-1117c, D-588 2496 가·2543)", () => {
  /** 띄운 2차맵: 주인 1·2 = 같은 나라 100, 주인 3 = 나라 200 */
  const units: FakeUnit[] = [
    { id: 1, ownerId: 1, kind: KIND_CYBORG, x: 100, y: 100 },
    { id: 2, ownerId: 2, kind: KIND_CYBORG, x: 103, y: 100 },
    { id: 4, ownerId: 2, kind: KIND_HUMAN, x: 105, y: 102 },
    { id: 5, ownerId: 2, kind: KIND_HUMAN, x: 140, y: 140 },
    { id: 6, ownerId: 1, kind: KIND_CYBORG, x: 160, y: 160 },
    { id: 7, ownerId: 1, kind: KIND_BOT, x: 101, y: 100 },
  ];

  it("같은 나라 유저 유닛은 조우 틱이 저절로 싸우게 하지 않고, 일부러 치면 약탈 전투가 열린다(내 편 = 공격 편, 수비 = 대상 + 둘레의 같은 주인 유닛)", async () => {
    const rig = fakeWorld({ war: false, loaded: units, cargo: [2], users: { u1: 1 } });
    const rules = startCoordinateRules(rig.world, { now: () => START, log, timer: false, roll: () => 0 });
    if (!rules) throw new Error("no rules");
    expect(await rules.scan()).toBe(0);
    expect(rig.battles).toEqual([]);
    expect(await rules.strike({ userId: "u1", unitIds: [1], targetUnitId: 2 })).toBe("ok");
    expect(rig.battles).toMatchObject([
      {
        war: false,
        sides: [
          { id: 1, faction: 1, defender: false },
          { id: 2, faction: 2, defender: true },
        ],
        units: [1, 2, 4],
      },
    ]);
    expect(rig.halted.toSorted((a, b) => a - b)).toEqual([1, 2, 4]);
    rules.stop();
  });

  it("다른 나라 전쟁 상대면 전쟁 전투, 결과 코드: 내 것·남의 유닛으로 치기·거리 밖·모르는 대상·사용자 없음·시가지", async () => {
    const war = fakeWorld({
      war: true,
      loaded: [...units, { id: 3, ownerId: 3, kind: KIND_CYBORG, x: 98, y: 100 }],
      users: { u1: 1 },
    });
    const a = startCoordinateRules(war.world, { now: () => START, log, timer: false, roll: () => 0 });
    if (!a) throw new Error("no rules");
    const hit = (unitIds: number[], targetUnitId: number, userId = "u1") =>
      a.strike({ userId, unitIds, targetUnitId });
    expect(await hit([1], 6)).toBe("own_target");
    expect(await hit([2], 3)).toBe("forbidden");
    expect(await hit([7], 3)).toBe("forbidden");
    expect(await hit([1], 5)).toBe("out_of_reach");
    expect(await hit([6], 3)).toBe("out_of_reach");
    expect(await hit([999], 3)).toBe("out_of_reach");
    expect(await hit([1], 404)).toBe("unknown_unit");
    expect(await hit([1], 3, "nobody")).toBe("forbidden");
    expect(war.battles).toEqual([]);
    expect(await hit([1], 3)).toBe("ok");
    expect(war.battles).toMatchObject([{ war: true, units: [1, 3] }]);
    a.stop();
    expect(await a.strike({ userId: "u1", unitIds: [1], targetUnitId: 3 })).toBe("busy");
    const urban = fakeWorld({ war: false, urban: true, loaded: units, users: { u1: 1 } });
    const b = startCoordinateRules(urban.world, { now: () => START, log, timer: false, roll: () => 0 });
    expect(await b?.strike({ userId: "u1", unitIds: [1], targetUnitId: 2 })).toBe("safe_zone");
    expect(urban.battles).toEqual([]);
    b?.stop();
  });
});

/** 같은 나라 100: 내 유닛 1(빠르기 500) · 남의 유닛 2(빠르기 target) */
const pair = (target: number): FakeUnit[] => [
  { id: 1, ownerId: 1, kind: KIND_CYBORG, x: 100, y: 100, speed: 500 },
  { id: 2, ownerId: 2, kind: KIND_CYBORG, x: 102, y: 100, speed: target },
];

describe("startCoordinateRules — 일부러 치기 수비 편 회피(gov-fix-3 — 2581 (3), D-570 1904·D-573 2022 나)", () => {
  it("같은 나라 수비 편도 조우와 같은 판단: 회피를 골랐고 더 빠르면 전투 없이 빠져나가고(escaped), 느리면 전투가 열리고 수비 편이 시작 틱에 퇴각한다", async () => {
    // 공격 편이 짐이 없어 수비 편(NPC 성향 500)은 맞불(약탈)을 걸 거리가 없다 → 회피
    const fast = fakeWorld({ war: false, loaded: pair(1000), users: { u1: 1 } });
    const a = startCoordinateRules(fast.world, { now: () => START, log, timer: false, roll: () => 0 });
    expect(await a?.strike({ userId: "u1", unitIds: [1], targetUnitId: 2 })).toBe("escaped");
    expect(fast.battles).toEqual([]);
    expect(fast.halted).toEqual([]);
    expect(a?.takeMetrics()).toMatchObject({ encounterEscaped: 1, encounterBattles: 0 });
    a?.stop();
    const slow = fakeWorld({ war: false, loaded: pair(400), users: { u1: 1 } });
    const b = startCoordinateRules(slow.world, { now: () => START, log, timer: false, roll: () => 0 });
    expect(await b?.strike({ userId: "u1", unitIds: [1], targetUnitId: 2 })).toBe("ok");
    expect(slow.battles).toMatchObject([{ war: false, units: [1, 2] }]);
    expect(slow.inputs).toEqual([{ tick: 0, kind: "order", party: 201, order: { kind: "retreat" } }]);
    b?.stop();
  });

  it("수비 편이 맞불을 걸면(공격 편이 짐을 졌고 전력 비가 약탈 문턱 이상 — 수비 둘 : 공격 하나) 빠르더라도 빠져나가지 않고 그대로 싸운다(퇴각 명령 없음)", async () => {
    const loaded = [...pair(1000), { id: 3, ownerId: 2, kind: KIND_CYBORG, x: 103, y: 100, speed: 1000 }];
    const rig = fakeWorld({ war: false, loaded, cargo: [1], users: { u1: 1 } });
    const rules = startCoordinateRules(rig.world, { now: () => START, log, timer: false, roll: () => 0 });
    expect(await rules?.strike({ userId: "u1", unitIds: [1], targetUnitId: 2 })).toBe("ok");
    expect(rig.battles).toMatchObject([{ war: false, units: [1, 2, 3] }]);
    expect(rig.inputs).toEqual([]);
    rules?.stop();
  });
});

/** 띄운 2차맵: 나라 100 둘(빠르기 speeds[0]) · 나라 200 하나(speeds[1]) */
const near = (speeds: [number, number]): FakeUnit[] => [
  { id: 1, ownerId: 1, kind: KIND_CYBORG, x: 100, y: 100, speed: speeds[0] },
  { id: 2, ownerId: 2, kind: KIND_CYBORG, x: 101, y: 100, speed: speeds[0] },
  { id: 3, ownerId: 3, kind: KIND_CYBORG, x: 104, y: 100, speed: speeds[1] },
];

describe("startCoordinateRules — AI 작전·빠져나가기·채집 줄(encounter-4)", () => {
  it("D-573: 회피 편이 더 빠르면 전투 없이 빠져나가고, 느리면 전투가 열리고 그 편 파티는 시작 틱에 퇴각한다", async () => {
    const fast = fakeWorld({ war: false, cargo: [3], loaded: near([500, 1000]) });
    const a = startCoordinateRules(fast.world, { now: () => START, log, timer: false, roll: () => 0 });
    expect(await a?.scan()).toBe(0);
    expect(fast.battles).toEqual([]);
    expect(fast.halted).toEqual([]);
    expect(a?.takeMetrics()).toMatchObject({ encounterEscaped: 1, encounterBattles: 0 });
    a?.stop();
    const slow = fakeWorld({ war: false, cargo: [3], loaded: near([500, 400]) });
    const b = startCoordinateRules(slow.world, { now: () => START, log, timer: false, roll: () => 0 });
    expect(await b?.scan()).toBe(1);
    expect(slow.battles).toMatchObject([{ war: false, units: [1, 2, 3], targets: [] }]);
    expect(slow.inputs).toEqual([{ tick: 0, kind: "order", party: 201, order: { kind: "retreat" } }]);
    b?.stop();
  });

  it("플레이어 유닛은 저장한 AI 작전으로 판단하고, 오프라인이면 먼저 걸지 않는다(D-144)", async () => {
    const units: FakeUnit[] = [
      { id: 1, ownerId: 1, kind: KIND_CYBORG, x: 100, y: 100 },
      { id: 3, ownerId: 3, kind: KIND_CYBORG, x: 104, y: 100 },
    ];
    const aggressive = {
      unit_id: 1,
      preset: "aggressive",
      engage: 10,
      pursue: 8,
      cover: 3,
      escort: 2,
      save_skill: 2,
      spread: 3,
      retreat_pct: 0,
      target: "weakest",
    };
    const base = {
      war: true,
      loaded: units,
      owners: [owner(1, null, "u1"), owner(3, 200)],
      tactics: [aggressive],
      aggression: 0,
    };
    // 나라 200은 숨어 버티기(교전 1 — 문턱 × 1.4)라 같은 전력에는 걸지 않는다
    const offline = fakeWorld(base);
    const a = startCoordinateRules(offline.world, { now: () => START, log, timer: false, roll: () => 0 });
    // 게이트웨이·로스터가 찾는 저장소는 세계 저장 층(world.persistence)에 붙는다
    expect(unitTacticsOf(offline.world.persistence)).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await a?.scan()).toBe(0);
    a?.stop();
    const online = fakeWorld({ ...base, online: ["u1"] });
    const b = startCoordinateRules(online.world, { now: () => START, log, timer: false, roll: () => 0 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await b?.scan()).toBe(1);
    expect(online.battles).toMatchObject([
      {
        war: true,
        sides: [
          { id: 1, faction: 1 },
          { id: 2, faction: 3 },
        ],
      },
    ]);
    b?.stop();
    // 굴림이 교전 확률(10 × 10%)을 넘으면… 100%라 늘 건다. 균형(6)이면 굴림 600 이상은 회피
    const balanced = fakeWorld({ ...base, online: ["u1"], tactics: [] });
    const c = startCoordinateRules(balanced.world, { now: () => START, log, timer: false, roll: () => 600 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await c?.scan()).toBe(0);
    c?.stop();
  });

  it("채집 줄 유닛은 멈출 때 줄을 끝내지 않고 멈춘다(질문 2035 답)", async () => {
    const rig = fakeWorld({
      war: true,
      loaded: near([1000, 1000]),
      owners: [owner(1, null, "u1"), owner(2, 100), owner(3, 200)],
      online: ["u1"],
      gathering: [1, 3],
    });
    const rules = startCoordinateRules(rig.world, { now: () => START, log, timer: false, roll: () => 0 });
    expect(await rules?.scan()).toBe(1);
    // 사용자 주체 유닛만(NPC 유닛 3은 채집 줄을 다시 판단하지 않는다)
    expect(rig.suspended).toEqual([1]);
    rules?.stop();
  });
});
