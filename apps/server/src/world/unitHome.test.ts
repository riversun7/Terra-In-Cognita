// 적색 부상으로 진 유닛의 귀환(D-594 "부상입고 주거지 귀환" + 보충 "유닛도 동일. 적색부상 사망은 주거지 귀환 없으면 소속도시, 없으면 소속국가 정부건물로 귀환"
// + 보충 2 "적색부상이 아닌 다른 부상은 강제 귀환되지 않고 다시 싸울 수 있다" + 보충 3 "적색부상은 주거지로 순간이동 귀환" — battleReturn.ts returnHome,
// unitHome.ts, unitHomeWorld.ts, battleResults.ts): 돌아갈 곳 차례(사는 곳 같은 2차맵·다른 2차맵 → 소속 도시 → 소속 국가 정부 건물), 플레이어·NPC 유닛을
// 바로 옮기기(같은 2차맵·다른 2차맵, 가던 길 버림), 빨강만 강제 귀환(가벼운 부상은 그 자리).
import { type BattleInit, WALK_SPEED, anchorAt, positionAt } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLedger } from "../economy/ledger.ts";
import { type ResidenceWorld, createResidenceBook, registerResidenceBook } from "../residence/book.ts";
import type { TravelService } from "../travel/serviceTypes.ts";
import { returnHome } from "./battleReturn.ts";
import { type BattleWorld, applyBattleOutcome } from "./battleResults.ts";
import type { CityRow } from "./cities.ts";
import type { OwnerRow } from "./persist/load.ts";
import type { WorldWriter } from "./persist/writer.ts";
import type { SecondMap } from "./secondMap.ts";
import { createTestMap, testEncounter } from "./testSupport.ts";
import { type UnitHome, standNear } from "./unitHome.ts";
import { createUnitHomeWorld } from "./unitHomeWorld.ts";
import { UNIT_KIND_BOT, UNIT_KIND_CYBORG, UNIT_KIND_HUMAN } from "./unitKinds.ts";

const START = 1_798_000_000_000;
const PLAYER_OWNER = 7;
const NPC_OWNER = 8;
const NATION_ROW = 80;

beforeEach(() => {
  vi.useFakeTimers({ now: START });
});
afterEach(() => {
  vi.useRealTimers();
});

const writer: WorldWriter = {
  upsert() {},
  remove() {},
  append() {},
  durable: async () => {},
  drain: async () => {},
  pendingCount: 0,
  takeMetrics: () => ({}),
  crash: async () => {},
};

/** 시험 2차맵 + 유닛 하나(21) */
function rig(kind = UNIT_KIND_CYBORG) {
  const { map } = createTestMap({ mapKey: 9 });
  map.addUnit({ id: 21, size: 1, speed: WALK_SPEED, cellX: 40, cellY: 100, ownerId: PLAYER_OWNER, kind });
  const info = map.unitInfo(21);
  if (!info) throw new Error("no unit");
  return { map, info };
}

/** 지금 선 칸 */
function cellOf(map: SecondMap, unitId: number) {
  const info = map.unitInfo(unitId);
  if (!info) throw new Error("no unit");
  return anchorAt(positionAt(info.motion, Date.now()), 1);
}

/** 두 칸의 맨해튼 거리 */
const apart = (p: { x: number; y: number }, q: { x: number; y: number }) =>
  Math.abs(p.x - q.x) + Math.abs(p.y - q.y);

describe("바로 옮기기 (battleReturn.ts returnHome — D-594 보충 3, D-591의 유일한 예외)", () => {
  it("같은 2차맵이면 그 칸 둘레로 바로 선다(걷지 않음, 돌아가는 중 표시 없음)", () => {
    const { map, info } = rig();
    const unitHome: UnitHome = {
      homeOf: () => ({ mapKey: 9, x: 150, y: 100, tier: "residence" }),
      teleport: (from, unitId, _owner, to) => from.relocateToSafety(unitId, to),
    };
    expect(returnHome({ unitHome: () => unitHome }, map, 21, info, START)).toBe("residence");
    const after = map.unitInfo(21);
    expect(after?.motion.waypoints).toHaveLength(1);
    expect(apart(cellOf(map, 21), { x: 150, y: 100 })).toBeLessThan(12);
    expect(after?.condition.returningUntilMs).toBeUndefined();
    map.stop();
  });

  it("돌아갈 곳이 없거나 옮기지 못하면 undefined — 그 자리에 남는다", () => {
    const { map, info } = rig();
    const none: UnitHome = { homeOf: () => undefined, teleport: () => true };
    expect(returnHome({ unitHome: () => none }, map, 21, info, START)).toBe(undefined);
    expect(returnHome({}, map, 21, info, START)).toBe(undefined);
    const blocked: UnitHome = {
      homeOf: () => ({ mapKey: 77, x: 1, y: 1, tier: "government" }),
      teleport: () => false,
    };
    expect(returnHome({ unitHome: () => blocked }, map, 21, info, START)).toBe(undefined);
    expect(cellOf(map, 21)).toEqual({ x: 40, y: 100 });
    map.stop();
  });

  it("설 칸 찾기: 설 수 없는 칸이면 둘레의 가장 가까운 설 칸", () => {
    const { map } = createTestMap({ mapKey: 9 });
    map.placeBuilding({ x: 150, y: 100, width: 6, height: 6, rotation: 0 }, PLAYER_OWNER);
    const cell = standNear(map, { x: 153, y: 103 }, 1);
    expect(cell).toBeDefined();
    expect(map.isStandable(cell?.x ?? -1, cell?.y ?? -1, 1)).toBe(true);
    map.stop();
  });
});

/**
 * 세계 둘(2차맵 9·10): 플레이어 주인 7(사용자 u7, 시민권 나라 행 80), NPC 주인 8(나라 행 80 — 그 나라 주체). 도시 3(2차맵 10), 도시 4(2차맵 9),
 * 수도 5(2차맵 10, 행정 건물 700). 사는 곳 = 숙소 배정(lodging)으로 잇는다(건물 500 = 2차맵 9, 600 = 2차맵 10)
 */
function homeWorld(o: {
  lodging?: Map<number, { buildingId: number; cityId: number }>;
  /** 플레이어 유닛(21·22) 가문의 소속 도시(D-569 — fixes-1117k 2755). 없으면 무소속(가문 없음) */
  startCityId?: number;
  /** 시민권 나라를 둔다(가문 없는 플레이어도 — 기본은 startCityId가 있을 때만) */
  citizen?: boolean;
  npcCity?: number;
  capital?: number;
  hall?: boolean;
  /** 전쟁 중인 세력 쌍(거울 세계) */
  wars?: readonly (readonly [number, number])[];
  /** 도시 주인 주체(거울 세계) */
  cityOwners?: ReadonlyMap<number, number>;
  /** 부팅 도시 표의 수도(시작 도시 5)를 둔다(기본 둔다) */
  bootCapital?: boolean;
  /** 띄우지 않은 2차맵(99)을 띄울 수 있다(봇 귀환 — fixes-1117k 2752) */
  spawn?: boolean;
}) {
  const a = createTestMap({ mapKey: 9 }).map;
  const b = createTestMap({ mapKey: 10 }).map;
  const maps = new Map<number, SecondMap>([
    [9, a],
    [10, b],
  ]);
  a.placeBuilding({ x: 150, y: 60, width: 4, height: 4, rotation: 0 }, PLAYER_OWNER, 500);
  b.placeBuilding({ x: 60, y: 150, width: 4, height: 4, rotation: 0 }, NPC_OWNER, 600);
  if (o.hall !== false) b.placeBuilding({ x: 120, y: 120, width: 6, height: 6, rotation: 0 }, NPC_OWNER, 700);
  a.addUnit({
    id: 21,
    size: 1,
    speed: WALK_SPEED,
    cellX: 40,
    cellY: 100,
    ownerId: PLAYER_OWNER,
    kind: UNIT_KIND_HUMAN,
  });
  a.addUnit({
    id: 31,
    size: 1,
    speed: WALK_SPEED,
    cellX: 40,
    cellY: 110,
    ownerId: NPC_OWNER,
    kind: UNIT_KIND_BOT,
  });
  let account = 0;
  let tx = 0;
  const ledger = createLedger({ writer, nextAccountId: () => ++account, nextTxId: () => ++tx, accounts: [] });
  const lodging = o.lodging ?? new Map();
  const residence: ResidenceWorld = {
    unitOwner: (unitId) => (unitId === 21 ? PLAYER_OWNER : unitId === 31 ? NPC_OWNER : undefined),
    building: () => undefined,
    lodgingOf: (unitId) => lodging.get(unitId),
  };
  registerResidenceBook(ledger, createResidenceBook(residence));
  const owners = new Map<number, OwnerRow>([
    [
      PLAYER_OWNER,
      {
        id: PLAYER_OWNER,
        userId: "u7",
        factionId: null,
        settledAtMs: 0,
        upkeepArrears: 0,
        upkeepUnpaidAtMs: null,
      },
    ],
    [
      NPC_OWNER,
      {
        id: NPC_OWNER,
        userId: null,
        factionId: NATION_ROW,
        settledAtMs: 0,
        upkeepArrears: 0,
        upkeepUnpaidAtMs: null,
      },
    ],
  ]);
  // 가던 길 버리기 기록(플레이어 = cancel, NPC = cancelNpc)
  const cancelled: string[] = [];
  /** 띄우지 않은 2차맵 좌표 유닛으로 세운 기록(fixes-1117k 2752) */
  const parkedRows: { unitId: number; mapKey: number; x: number; y: number }[] = [];
  const travel: Pick<TravelService, "cancel" | "cancelNpc" | "parkAt"> = {
    parkAt(row, mapKey, cell) {
      parkedRows.push({ unitId: row.id, mapKey, x: cell.x, y: cell.y });
    },
    cancel(userId, unitId) {
      cancelled.push(`player:${userId}:${unitId}`);
      return { ok: false, code: "not_traveling" };
    },
    cancelNpc(unitId) {
      cancelled.push(`npc:${unitId}`);
      return false;
    },
  };
  const cities: CityRow[] =
    o.bootCapital === false
      ? []
      : [{ id: 5, factionId: NATION_ROW, planetId: "p", mapKey: 10, cellX: 100, cellY: 100, start: true }];
  const cells = [
    { id: 3, mapKey: 10, x: 30, y: 30 },
    { id: 4, mapKey: 9, x: 160, y: 160 },
    { id: 5, mapKey: 10, x: 100, y: 100 },
    // 띄우지 않은 2차맵의 도시
    { id: 6, mapKey: 99, x: 1, y: 1 },
  ];
  const facilities = new Map([[700, { facilityId: "government_hall", cityId: 5 }]]);
  const home = createUnitHomeWorld({
    maps,
    ledger,
    owners,
    planetId: "p",
    houseCityOf: (_unitId, userId) => (userId === "u7" ? o.startCityId : undefined),
    cyborgOf: (userId) =>
      userId === "u7" && (o.startCityId !== undefined || o.citizen === true)
        ? { startCityId: o.startCityId ?? 4, factionId: NATION_ROW }
        : undefined,
    npcCityOf: (unitId) => (unitId === 31 ? o.npcCity : undefined),
    npcCapitalOf: (ownerId) => (ownerId === NPC_OWNER ? o.capital : undefined),
    npcWorld: () => {
      const factions = new Map<number, { wars: Set<number>; overlord: number | null }>();
      const faction = (id: number) => {
        const have = factions.get(id) ?? { wars: new Set<number>(), overlord: null };
        factions.set(id, have);
        return have;
      };
      faction(NPC_OWNER);
      for (const [x, y] of o.wars ?? []) {
        faction(x).wars.add(y);
        faction(y).wars.add(x);
      }
      const cityMap = new Map<number, { owner: number }>();
      for (const [id, owner] of o.cityOwners ?? []) cityMap.set(id, { owner });
      return { cities: cityMap, factions };
    },
    cities: () => cities,
    cityCells: () => cells,
    facilities: () => facilities,
    travel: () => travel,
    spawn: () =>
      o.spawn === true
        ? {
            canOpen: (mapKey) => mapKey === 99 && !maps.has(99),
            open: async (mapKey) => {
              maps.set(mapKey, createTestMap({ mapKey }).map);
              return "ok";
            },
          }
        : undefined,
  });
  const stop = () => {
    for (const map of maps.values()) map.stop();
  };
  return { home, maps, a, b, cancelled, parkedRows, stop, ledger, owners };
}

describe("돌아갈 곳 차례 (unitHome.ts·unitHomeWorld.ts)", () => {
  it("1) 사는 곳: 같은 2차맵(플레이어)·다른 2차맵(NPC) 건물 가운데 칸 — 소속 도시보다 먼저", () => {
    const lodging = new Map([
      [21, { buildingId: 500, cityId: 4 }],
      [31, { buildingId: 600, cityId: 3 }],
    ]);
    const w = homeWorld({ lodging, startCityId: 3, npcCity: 4, capital: 5 });
    expect(w.home.homeOf(21, PLAYER_OWNER)).toEqual({ mapKey: 9, x: 152, y: 62, tier: "residence" });
    expect(w.home.homeOf(31, NPC_OWNER)).toEqual({ mapKey: 10, x: 62, y: 152, tier: "residence" });
    w.stop();
  });

  it("2) 소속 도시: 플레이어 = 그 유닛 가문의 소속 도시(fixes-1117k 2755), NPC = 거울 휴먼의 사는 도시(시청 칸)", () => {
    const w = homeWorld({ startCityId: 3, npcCity: 4, capital: 5 });
    expect(w.home.homeOf(21, PLAYER_OWNER)).toEqual({ mapKey: 10, x: 30, y: 30, tier: "home_city" });
    expect(w.home.homeOf(31, NPC_OWNER)).toEqual({ mapKey: 9, x: 160, y: 160, tier: "home_city" });
    w.stop();
  });

  it("3) 소속 국가 정부 건물: 소속 도시가 없거나(노숙 0·폐허·가문 없음) 모르면 수도 행정 건물, 건물이 없으면 수도 시청 칸", () => {
    // NPC 노숙(0)·가문 없는 플레이어 유닛(무소속 — fixes-1117k 2755) → 정부 건물(행정 건물 700 기준 칸)
    const w = homeWorld({ citizen: true, npcCity: 0, capital: 5 });
    expect(w.home.homeOf(31, NPC_OWNER)).toEqual({ mapKey: 10, x: 120, y: 120, tier: "government" });
    // 플레이어: 시민권 나라 행 80 → 그 나라 주체(8)의 런타임 수도 5
    expect(w.home.homeOf(21, PLAYER_OWNER)).toEqual({ mapKey: 10, x: 120, y: 120, tier: "government" });
    w.stop();
    // 행정 건물이 없고 런타임 수도도 모름 → 부팅 도시 표 수도(시작 도시 5)의 시청 칸
    const v = homeWorld({ citizen: true, hall: false });
    expect(v.home.homeOf(21, PLAYER_OWNER)).toEqual({ mapKey: 10, x: 100, y: 100, tier: "government" });
    v.stop();
  });

  it("fixes-1117k 2752: 소속 도시가 띄우지 않은 2차맵이어도 다음 차례로 건너뛰지 않는다 — 그 2차맵 칸의 좌표 유닛으로 세운다", () => {
    const w = homeWorld({ startCityId: 6, capital: 5 });
    const target = w.home.homeOf(21, PLAYER_OWNER);
    expect(target).toEqual({ mapKey: 99, x: 1, y: 1, tier: "home_city" });
    if (!target) throw new Error("no target");
    expect(w.home.teleport(w.a, 21, PLAYER_OWNER, target, START)).toBe(true);
    // 2차맵에서 빠지고 이동 서비스 좌표 유닛 장부에(가던 길은 먼저 버린다)
    expect(w.a.unitInfo(21)).toBeUndefined();
    expect(w.parkedRows).toEqual([{ unitId: 21, mapKey: 99, x: 1, y: 1 }]);
    expect(w.cancelled).toEqual(["player:u7:21"]);
    w.stop();
  });

  it("fixes-1117k 2752: 봇(NPC 휴먼)은 좌표 유닛이 되지 않아 띄우지 않은 2차맵을 띄운 뒤 옮긴다", async () => {
    const w = homeWorld({ npcCity: 6, capital: 5, spawn: true });
    const target = w.home.homeOf(31, NPC_OWNER);
    expect(target).toEqual({ mapKey: 99, x: 1, y: 1, tier: "home_city" });
    if (!target) throw new Error("no target");
    expect(w.home.teleport(w.a, 31, NPC_OWNER, target, START)).toBe(true);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(w.a.unitInfo(31)).toBeUndefined();
    expect(w.maps.get(99)?.unitInfo(31)?.kind).toBe(UNIT_KIND_BOT);
    expect(w.parkedRows).toEqual([]);
    w.stop();
  });

  it("4) 소속 국가 정부 건물도 없으면 적대 세력(전쟁 중)이 아닌 가까운 도시 — 같은 2차맵 먼저, 전쟁 중인 세력 도시는 건너뛴다", () => {
    const at = { mapKey: 9, x: 40, y: 100 };
    // 플레이어: 사이보그 기록 없음(소속 도시·나라 없음) → 같은 2차맵 도시 4
    const w = homeWorld({
      cityOwners: new Map([
        [3, 41],
        [4, 40],
        [5, 42],
      ]),
    });
    expect(w.home.homeOf(21, PLAYER_OWNER, at)).toEqual({ mapKey: 9, x: 160, y: 160, tier: "nearby_city" });
    w.stop();
    // NPC(나라 주체 8, 수도 모름·노숙): 도시 4의 주인 40과 전쟁 중 → 다른 2차맵 도시 중 작은 ID 3
    const v = homeWorld({
      npcCity: 0,
      bootCapital: false,
      wars: [[NPC_OWNER, 40]],
      cityOwners: new Map([
        [3, 41],
        [4, 40],
        [5, 42],
      ]),
    });
    expect(v.home.homeOf(31, NPC_OWNER, at)).toEqual({ mapKey: 10, x: 30, y: 30, tier: "nearby_city" });
    v.stop();
    // 도시 주인의 위 나라와 전쟁 중이어도 적대: 모든 도시가 적대면 undefined(그 자리)
    const u = homeWorld({
      npcCity: 0,
      bootCapital: false,
      wars: [
        [NPC_OWNER, 40],
        [NPC_OWNER, 41],
        [NPC_OWNER, 42],
      ],
      // 띄우지 않은 2차맵 도시 6도 센다(fixes-1117k 2752)
      cityOwners: new Map([
        [3, 41],
        [4, 40],
        [5, 42],
        [6, 42],
      ]),
    });
    expect(u.home.homeOf(31, NPC_OWNER, at)).toBeUndefined();
    u.stop();
  });

  it("넷 다 없으면 undefined(그 자리에 남는다 — 지금 자리를 모르면 4번도 없음)", () => {
    const w = homeWorld({});
    // 플레이어: 사이보그 기록 없음 → 소속 도시·나라 없음
    expect(w.home.homeOf(21, PLAYER_OWNER)).toBeUndefined();
    // 주인을 모르는 유닛
    expect(w.home.homeOf(31, 999)).toBeUndefined();
    w.stop();
  });

  it("옮기기: 플레이어 유닛은 같은 2차맵 안, NPC 휴먼은 다른 2차맵으로(봇도 옮긴다) — 가던 길을 먼저 버린다", () => {
    const w = homeWorld({ startCityId: 4, npcCity: 3, capital: 5 });
    const mine = w.home.homeOf(21, PLAYER_OWNER);
    const theirs = w.home.homeOf(31, NPC_OWNER);
    if (!mine || !theirs) throw new Error("no target");
    expect(w.home.teleport(w.a, 21, PLAYER_OWNER, mine, START)).toBe(true);
    expect(w.a.unitInfo(21)?.motion.waypoints).toHaveLength(1);
    expect(apart(cellOf(w.a, 21), { x: 160, y: 160 })).toBeLessThan(12);
    expect(w.home.teleport(w.a, 31, NPC_OWNER, theirs, START)).toBe(true);
    expect(w.a.unitInfo(31)).toBeUndefined();
    expect(w.b.unitInfo(31)?.kind).toBe(UNIT_KIND_BOT);
    expect(apart(cellOf(w.b, 31), { x: 30, y: 30 })).toBeLessThan(12);
    expect(w.cancelled).toEqual(["player:u7:21", "npc:31"]);
    // 봇은 좌표 유닛이 되지 않는다: 돌아갈 2차맵을 띄울 길(spawn)이 없으면 옮기지 않는다(그 자리)
    expect(w.home.teleport(w.b, 31, NPC_OWNER, { mapKey: 99, x: 1, y: 1, tier: "home_city" }, START)).toBe(
      false,
    );
    expect(w.parkedRows).toEqual([]);
    expect(w.b.unitInfo(31)).toBeDefined();
    w.stop();
  });
});

/** 진 편(2) 유닛 셋: 21 플레이어 휴먼, 31 NPC 휴먼, 22 플레이어 휴먼. 이긴 편(1)은 세계에 없는 유닛 */
function battle(w: ReturnType<typeof homeWorld>, conditions: Map<number, number>) {
  w.a.addUnit({
    id: 22,
    size: 1,
    speed: WALK_SPEED,
    cellX: 44,
    cellY: 104,
    ownerId: PLAYER_OWNER,
    kind: UNIT_KIND_HUMAN,
  });
  for (const [unitId, stage] of conditions)
    w.a.setCondition(unitId, { injury: stage, injuryUntilMs: START + 86_400_000, heldBy: null });
  const base = testEncounter([1, 2, 21, 31], [1, 2]);
  const loser = base.units[3];
  if (!loser) throw new Error("no fighter");
  const init: BattleInit = { ...base, units: [...base.units, { ...loser, id: 22 }] };
  const world: BattleWorld = {
    mapOf: (unitId) => [...w.maps.values()].find((map) => map.unitInfo(unitId) !== undefined),
    safeCellFor: () => undefined,
    // 이긴 쪽 주인이 세계에 없다 → 포로·탈취 없음
    ownerExists: () => false,
    ledger: w.ledger,
    unitHome: () => w.home,
  };
  // 진 유닛은 HP를 잃지 않았다(새 부상 굴림 0) — 미리 둔 부상 단계가 끝난 때 단계다
  const units = [21, 31, 22].map((unit) => {
    const spec = init.units.find((one) => one.id === unit);
    return {
      unit,
      side: 2,
      outcome: "returned" as const,
      injured: false,
      hp: spec?.maxHp ?? 1,
      armor: 0,
      shield: 0,
    };
  });
  return applyBattleOutcome(
    world,
    1,
    init,
    { result: { winner: 1, reason: "wipe", endTick: 10 }, units },
    START,
  );
}

describe("빨강만 강제 귀환 (battleResults.ts — D-594 보충 2)", () => {
  it("가벼운 부상(흰·노랑)·부상 없음은 그 자리에 남아 다시 싸울 수 있다", () => {
    const w = homeWorld({ startCityId: 4, npcCity: 4, capital: 5 });
    const applied = battle(
      w,
      new Map([
        [21, 1],
        [31, 2],
      ]),
    );
    expect(applied).toMatchObject({ returned: 3, sentHome: 0, prisoners: 0 });
    // 그 자리 그대로(옮기지 않음), 길 버리기도 없음
    expect(cellOf(w.a, 21)).toEqual({ x: 40, y: 100 });
    expect(cellOf(w.a, 31)).toEqual({ x: 40, y: 110 });
    expect(w.cancelled).toEqual([]);
    w.stop();
  });

  it("빨강은 돌아갈 곳 차례대로 바로 옮긴다: 같은 2차맵 소속 도시(플레이어), 다른 2차맵 사는 곳(NPC). 노랑은 그 자리", () => {
    // 21(플레이어): 내 도시 4 = 같은 2차맵 9. 31(NPC): 사는 곳 600(2차맵 10). 22: 노랑 → 그 자리
    const lodging = new Map([[31, { buildingId: 600, cityId: 3 }]]);
    const w = homeWorld({ lodging, startCityId: 4, npcCity: 4, capital: 5 });
    const applied = battle(
      w,
      new Map([
        [21, 3],
        [31, 3],
        [22, 2],
      ]),
    );
    expect(applied).toMatchObject({ returned: 3, sentHome: 2 });
    expect(apart(cellOf(w.a, 21), { x: 160, y: 160 })).toBeLessThan(12);
    expect(w.a.unitInfo(21)?.condition.returningUntilMs).toBeUndefined();
    expect(w.a.unitInfo(31)).toBeUndefined();
    expect(apart(cellOf(w.b, 31), { x: 62, y: 152 })).toBeLessThan(12);
    // 다친 채로(빨강 그대로)
    expect(w.b.unitInfo(31)?.condition.injury).toBe(3);
    expect(cellOf(w.a, 22)).toEqual({ x: 44, y: 104 });
    w.stop();
  });

  it("빨강인데 사는 곳·소속 도시(가문)가 없으면 소속 국가 정부 건물로(다른 2차맵 — 플레이어 유닛)", () => {
    const w = homeWorld({ citizen: true, capital: 5 });
    const applied = battle(w, new Map([[21, 3]]));
    expect(applied.sentHome).toBe(1);
    expect(w.a.unitInfo(21)).toBeUndefined();
    expect(apart(cellOf(w.b, 21), { x: 120, y: 120 })).toBeLessThan(12);
    w.stop();
  });
});
