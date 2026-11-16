// 물류센터 운반 대행 시험(DB 없음) — 기획 D-576·D-570 1822, docs/adr/2026-11-16-logistics-center.md.
// 평평한 시험 2차맵에 물류센터 둘·광산 하나·다른 도시의 물류센터 하나를 두고: 고를 수 있는 곳(다 지음·일함·멈추지 않음·같은 도시), 요금 0 = 받지 않음,
// 자동 맡기기 차례(한 단위 요금이 싼 차례), 요금 = 한 단위 × ⌈무게 ÷ 단위⌉ × ⌈칸 ÷ 단위⌉, 적정가(운반꾼 한 명 인건비 × 한 단위 시간 + 수수료 + 세금), 판 칸을 본다.
import { performance } from "node:perf_hooks";
import { HAUL_SERVICE_ITEM } from "@terra/shared/businessBooks";
import { fairPrice, laborCostOf } from "@terra/shared/fairPrice";
import { TEST_SOCIETY_COEFFICIENTS, haulMs } from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { FacilityCatalog, FacilityDef } from "../facilities/catalog.ts";
import type { PlaceWorld } from "../facilities/places.ts";
import type { FacilityRecord } from "../facilities/state.ts";
import { mapTerrainFromTemp } from "../world/mapTerrain.ts";
import { createInlinePathService } from "../world/pathService.ts";
import { type SecondMap, createSecondMap } from "../world/secondMap.ts";
import { flatTerrain, silentLog } from "../world/testSupport.ts";
import { testMapKey } from "../world/world.ts";
import { emptyWorldStats } from "../world/worldStats.ts";
import { createHaulService } from "./haulService.ts";

const NOW = 1_798_000_000_000;
const MAP = testMapKey(0);
const CITY = 5;
const OTHER_CITY = 6;
const OWNER = 7;
const CUSTOMER = 9;

const def = (id: string, logistics: boolean): FacilityDef => ({
  id,
  name: { ko: id, en: id },
  stage: logistics ? "transport" : "gather",
  maxLevel: 3,
  slotsPerLevel: 4,
  gather: undefined,
  build: undefined,
  repair: undefined,
  footprint: { width: 3, height: 3 },
  durability: 100,
  storageKg: undefined,
  ...(logistics ? { logistics: true as const } : {}),
});
const CENTER = def("logistics_center", true);
const MINE = def("mine", false);

const catalog: FacilityCatalog = {
  facility: (id) => (id === CENTER.id ? CENTER : id === MINE.id ? MINE : undefined),
  facilities: [CENTER, MINE],
  weightOf: () => 1000,
  unitWeightOf: () => 1,
  itemName: () => undefined,
  isGoods: () => true,
  gatherLadder: () => [],
  gatherBands: [],
  lotSize: new Map(),
  foodSubcategories: [],
  subcategoryOf: () => undefined,
  itemTier: () => undefined,
  subcategoryName: () => undefined,
};

const RULES = {
  ...TEST_SOCIETY_COEFFICIENTS,
  logistics: { ...TEST_SOCIETY_COEFFICIENTS.logistics, haulMode: 1 },
  business: {
    ...TEST_SOCIETY_COEFFICIENTS.business,
    haulUnitG: 100_000,
    haulUnitCells: 10,
    serviceFeePm: 200,
  },
};

/** 시설 줄 하나(다 지음·상태 100%) */
const record = (buildingId: number, facilityId: string, cityId: number, level = 1): FacilityRecord => ({
  buildingId,
  facilityId,
  level,
  conditionPpm: 1_000_000,
  conditionAtMs: NOW,
  builtAtMs: NOW,
  builtBy: null,
  cityId,
});

function rig() {
  const maps = new Map<number, SecondMap>();
  const paths = createInlinePathService(
    () => [...maps.values()].map((map) => map.replicaInit()),
    () => performance.now(),
  );
  const map = createSecondMap({
    mapKey: MAP,
    terrain: mapTerrainFromTemp(MAP, flatTerrain()),
    paths,
    now: () => NOW,
    stats: emptyWorldStats(),
    log: silentLog,
    persist: { saveUnit: () => {}, saveBuilding: () => {}, removeBuilding: () => {} },
  });
  maps.set(MAP, map);
  const place = (x: number): number => {
    const placed = map.placeBuilding({ x, y: 20, width: 3, height: 3, rotation: 0 }, OWNER);
    if (!placed.ok || placed.buildingId === undefined) throw new Error("no building");
    return placed.buildingId;
  };
  const a = place(10);
  const b = place(20);
  const mine = place(30);
  const far = place(40);
  const facilities = new Map<number, FacilityRecord>([
    [a, record(a, "logistics_center", CITY)],
    [b, record(b, "logistics_center", CITY)],
    [mine, record(mine, "mine", CITY)],
    [far, record(far, "logistics_center", OTHER_CITY)],
  ]);
  const places: PlaceWorld = {
    maps,
    facilities,
    catalog: () => catalog,
    cities: () => [
      { id: CITY, mapKey: MAP, x: 60, y: 60 },
      { id: OTHER_CITY, mapKey: MAP, x: 120, y: 120 },
    ],
  };
  const prices = new Map<string, bigint>();
  const stopped = new Set<number>();
  const charged: [number, number, bigint, string][] = [];
  let wallet = 1000n;
  const service = createHaulService({
    places: () => places,
    works: (id) => !stopped.has(id),
    price: (id, item) => prices.get(`${id}:${item}`),
    taxRateOf: () => 500,
    suspended: () => false,
    // 일꾼 둘 — 시간당 인건비 합 7,200(한 명 3,600)
    laborHourly: () => 7_200n,
    workerCount: () => 2,
    freeStaff: () => 1,
    rules: () => RULES,
    charge(ownerId, buildingId, fee, kind) {
      if (wallet < fee) return "insufficient_funds";
      wallet -= fee;
      charged.push([ownerId, buildingId, fee, kind]);
      return null;
    },
    now: () => NOW,
  });
  const setPrice = (id: number, value: bigint): void => {
    prices.set(`${id}:${HAUL_SERVICE_ITEM}`, value);
  };
  return {
    service,
    a,
    b,
    mine,
    far,
    facilities,
    setPrice,
    stopped,
    charged,
    setWallet: (value: bigint) => {
      wallet = value;
    },
  };
}

describe("물류센터 운반 대행", () => {
  it("적정가 = 운반꾼 한 명 인건비 × 한 단위 시간 + 수수료 + 세금, 정하지 않으면 적정가로 받는다", () => {
    const r = rig();
    const ms = haulMs(100_000n, 10, 1, RULES);
    expect(ms).toBeGreaterThan(0);
    const expected = fairPrice({ materials: 0n, labor: laborCostOf(3_600n, ms), feePm: 200, taxBp: 500 });
    expect(r.service.fair(r.a)).toEqual(expected);
    expect(r.service.rate(r.a)).toEqual({ perUnit: expected.price, set: false });
    r.setPrice(r.a, 40n);
    expect(r.service.rate(r.a)).toEqual({ perUnit: 40n, set: true });
    expect(r.service.isCenter(r.a)).toBe(true);
    expect(r.service.isCenter(r.mine)).toBe(false);
  });

  it("고를 수 있는 곳: 같은 도시·다 지음·일함, 요금 0이면 받지 않음, 자동은 한 단위 요금이 싼 차례", () => {
    const r = rig();
    const spec = { ownerId: CUSTOMER, cityId: CITY, mapKey: MAP };
    r.setPrice(r.a, 50n);
    r.setPrice(r.b, 30n);
    expect(r.service.centers(r.a, spec)).toEqual([r.a]);
    expect(r.service.centers("auto", spec)).toEqual([r.b, r.a]);
    // 광산·다른 도시 물류센터는 고를 수 없다
    expect(r.service.centers(r.mine, spec)).toBe("service_closed");
    expect(r.service.centers(r.far, spec)).toBe("service_closed");
    // 받지 않음(0)·일하지 않음·짓는 중
    r.setPrice(r.b, 0n);
    expect(r.service.centers(r.b, spec)).toBe("service_closed");
    expect(r.service.centers("auto", spec)).toEqual([r.a]);
    r.stopped.add(r.a);
    expect(r.service.centers("auto", spec)).toEqual([]);
    r.stopped.clear();
    const built = r.facilities.get(r.a);
    if (built) r.facilities.set(r.a, { ...built, level: 0 });
    expect(r.service.centers(r.a, spec)).toBe("service_closed");
  });

  it("요금 = 한 단위 요금 × ⌈무게 ÷ 100kg⌉ × ⌈칸 ÷ 10⌉, 떠날 때 지갑 → 금고(haul_service)", () => {
    const r = rig();
    r.setPrice(r.a, 40n);
    // 150kg × 25칸 = 2 × 3 = 6단위
    expect(r.service.fee(r.a, 150_000n, 25)).toBe(240n);
    expect(r.service.fee(r.a, 1n, 1)).toBe(40n);
    expect(r.service.fee(r.a, 0n, 5)).toBe(0n);
    expect(r.service.pay(CUSTOMER, r.a, 240n, NOW)).toBeNull();
    expect(r.charged).toEqual([[CUSTOMER, r.a, 240n, "haul_service"]]);
    r.setWallet(10n);
    expect(r.service.pay(CUSTOMER, r.a, 240n, NOW)).toBe("insufficient_funds");
  });

  it("판 칸: 정한 값·지금 받는 값·적정가·단위·나를 수 있는 일꾼, 도시 창고 고르기 줄", () => {
    const r = rig();
    expect(r.service.view(r.mine)).toBeUndefined();
    const unset = r.service.view(r.a);
    expect(unset).toMatchObject({ perUnit: null, unitG: 100_000, unitCells: 10, workers: 1 });
    r.setPrice(r.a, 25n);
    expect(r.service.view(r.a)).toMatchObject({ perUnit: "25", charged: "25" });
    const rows = r.service.centersView(CITY, OWNER);
    expect(rows.map((row) => row.buildingId)).toEqual([r.a, r.b]);
    expect(rows[0]).toMatchObject({ mine: true, perUnit: "25", workers: 1 });
    expect(r.service.centersView(CITY, CUSTOMER)[0]?.mine).toBe(false);
  });
});
