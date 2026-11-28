// syncCity 진행 중 생산 배치 진행률 보존(P0-4) 및 refreshPresence 1:1 교대 감지(P0-2) 시험
import {
  EVENT_PRODUCE,
  HOUR_MS,
  type SimEvent,
  type SimWorld,
  TEST_SOCIETY_COEFFICIENTS,
  batchDurationFor,
  createLedgerAudit,
  createLedgerBook,
  createSimLoop,
  newFaction,
  rollTraits,
  streamRng,
  STREAM_TRAITS,
} from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { ServerEconomyCatalog } from "../market/catalog.ts";
import type { OwnerRow, QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import { silentLog } from "../world/testSupport.ts";
import type { CityRestPlan } from "./cityRest.ts";
import {
  BATCH_PROGRESS_PPM,
  type CityFacility,
  elapsedBatchPpm,
  remainingBatchMs,
  startServerEconomy,
} from "./economy.ts";

const writer: WorldWriter = {
  upsert: () => {},
  remove: () => {},
  append: () => {},
  durable: () => Promise.resolve(),
  drain: () => Promise.resolve(),
  pendingCount: 0,
  takeMetrics: () => ({}),
  crash: () => Promise.resolve(),
};

const emptyPool: QueryPool = {
  query: async () => ({ rows: [] }),
};

/** 시험용 최소 경제 목록: 일반 가공(work 1000 → 1명 1시간) + 선택형 농장(티어 1/3) */
function testCatalog(): ServerEconomyCatalog {
  return {
    bookItems: new Set(["timber", "plank", "grain", "wheat"]),
    catalog: {
      presets: [{ id: "alpha", currency: "gold", tradeTaxBp: 500, enabled: true }],
      items: [
        {
          id: "timber",
          category: "raw",
          startPrice: 10n,
          lotSize: 1n,
          weight: 100,
          subcategory: "wood",
          tier: 0,
          enabled: true,
        },
        {
          id: "plank",
          category: "processed",
          startPrice: 20n,
          lotSize: 1n,
          weight: 100,
          subcategory: "lumber",
          tier: 0,
          enabled: true,
        },
        {
          id: "grain",
          category: "raw",
          startPrice: 10n,
          lotSize: 1n,
          weight: 100,
          subcategory: "crop",
          tier: 1,
          enabled: true,
        },
        {
          id: "wheat",
          category: "raw",
          startPrice: 100n,
          lotSize: 1n,
          weight: 100,
          subcategory: "crop",
          tier: 3,
          enabled: true,
        },
      ],
      necessities: [],
      facilities: [
        { id: "sawmill", stage: "process", slotsPerLevel: 10 },
        {
          id: "farm",
          stage: "gather",
          slotsPerLevel: 10,
          gather: {
            primary: "vit",
            secondary: "int",
            mode: "select",
            subcategory: "crop",
            yieldBase: 1,
            yieldPerStatPm: 0,
            yieldCap: 4,
          },
        },
      ],
      recipes: [
        {
          id: "cut_plank",
          facility: "sawmill",
          work: 1_000,
          inputs: [],
          outputs: [{ item: "plank", qty: 1n }],
          enabled: true,
        },
        {
          id: "cut_timber",
          facility: "sawmill",
          work: 2_000,
          inputs: [],
          outputs: [{ item: "timber", qty: 1n }],
          enabled: true,
        },
        {
          id: "farm_crop",
          facility: "farm",
          work: 1_000,
          inputs: [],
          outputs: [{ item: "grain", qty: 1n }],
          enabled: true,
        },
      ],
    },
  };
}

function makeWorld(unitCount: number): SimWorld {
  let accountId = 0;
  let txId = 0;
  const book = createLedgerBook({
    nextAccountId: () => ++accountId,
    nextTxId: () => ++txId,
  });
  const faction = newFaction(1, "alpha", {
    fixed: true,
    tech: 1,
    regime: "democracy",
    settledAtMs: 0,
    traits: rollTraits(streamRng(1, STREAM_TRAITS, 1, 0), TEST_SOCIETY_COEFFICIENTS.npc),
  });
  faction.cities.add(10);
  const units = new Map();
  for (let i = 1; i <= unitCount; i++) {
    faction.units.add(i);
    units.set(i, {
      id: i,
      city: 10,
      owner: 1,
      job: { job: 0, phase: 0, progressMs: 0, fatigue: 0 },
      pos: { x: 0, y: 0 },
      tripStep: 0,
      eventId: undefined,
      satisfactionMilli: 60_000,
      bornAtMs: 0,
      lifespanMs: 0,
      recruit: null,
      rebirths: 0,
    });
  }
  return {
    seed: 1,
    factions: new Map([[1, faction]]),
    cities: new Map([
      [
        10,
        {
          id: 10,
          owner: 1,
          start: true,
          housing: 20,
          adminLevel: 1,
          recruitDraw: null,
          researchLevel: 0,
          development: 0,
          nextRebellionMs: 0,
        },
      ],
    ]),
    units,
    ruins: new Map(),
    occupations: new Map(),
    book,
    audit: createLedgerAudit([]),
    testJobs: false,
    nextFactionId: () => 99,
    nextCityId: () => 99,
    nextUnitId: () => 999,
  };
}

describe("배치 진행률 수학(elapsedBatchPpm / remainingBatchMs)", () => {
  it("10시간짜리 배치가 30초마다 반복 재조정되어도 진행률이 누적되어 정상 완료된다", () => {
    const full = 10 * HOUR_MS;
    const step = 30_000;
    let donePpm = 0;
    let segStart = 0;
    let endsAt = full;
    for (let t = step; t <= full; t += step) {
      donePpm = elapsedBatchPpm({ endsAtMs: endsAt, segmentStartMs: segStart, donePpm }, t);
      const rem = remainingBatchMs(full, donePpm);
      segStart = t;
      endsAt = t + rem;
    }
    // 10시간이 지나면 거의 100%(99.9% 이상)에 도달해 잔여 시간이 1~2분 안쪽이다
    expect(donePpm).toBeGreaterThan(BATCH_PROGRESS_PPM - 2_000);
    expect(remainingBatchMs(full, donePpm)).toBeLessThan(2 * 60_000);
  });
});

describe("syncCity 진행 중 생산 배치 진행률 보존(P0-4)", () => {
  it("배치 절반(50%)에서 일꾼이 2배로 늘면 남은 50%만 새 속도로 진행해 완료하고 경험치를 준다", async () => {
    const world = makeWorld(2);
    const away = new Set<number>([2]); // 처음에는 1명만 근무(1시간 배치)
    let now = 0;
    const gained: [number, number][] = [];
    const econRef: { current?: Awaited<ReturnType<typeof startServerEconomy>> } = {};
    const loop = createSimLoop<SimEvent>({
      startMs: 0,
      handle: (event, sim) => {
        econRef.current?.handle(event, sim.nowMs);
      },
    });
    const facilities: CityFacility[] = [{ buildingId: 100, facility: "sawmill", level: 1, ownerId: 1 }];
    const econ = await startServerEconomy({
      world,
      writer,
      pool: emptyPool,
      owners: new Map<number, OwnerRow>(),
      loop,
      rules: () => TEST_SOCIETY_COEFFICIENTS,
      input: {
        catalog: () => testCatalog(),
        presets: [
          {
            code: "alpha",
            name: { ko: "알파", en: "Alpha" },
            currency: { code: "gold", name: { ko: "골드", en: "Gold" } },
            tradeTaxBp: 500,
            personality: { cityJobs: [{ facility: "sawmill", recipe: "cut_plank" }] },
          },
        ],
        facilitiesIn: () => facilities,
      },
      startMs: 0,
      now: () => now,
      log: silentLog,
      away: (unitId) => away.has(unitId),
      gainExp: (unitId, amount) => void gained.push([unitId, amount]),
    });
    if (!econ) throw new Error("economy");
    econRef.current = econ;

    const firstRun = econ.production(10)[0];
    expect(firstRun?.facility.workers).toBe(1);
    expect(firstRun?.endsAtMs).toBe(HOUR_MS);

    // 30분(50%) 경과 시점에 2번 휴먼 복귀 → 일꾼 2명(전체 길이 30분) → 잔여 15분(총 45분 시점 완료)
    now = 30 * 60_000;
    loop.runUntil(now);
    away.delete(2);
    expect(econ.refreshPresence(now)).toBe(1);
    const resized = econ.production(10)[0];
    expect(resized?.facility.workers).toBe(2);
    expect(resized?.endsAtMs).toBe(45 * 60_000);

    // 45분 시점: 초기화였다면 60분까지 생산 0회였겠지만, 진행률 보존으로 즉시 완료·경험치 지급
    now = 45 * 60_000 + 1;
    loop.runUntil(now);
    expect(world.book.balanceOf(1, "item:plank", 10)).toBe(1n);
    expect(gained).toHaveLength(1);
  });

  it("워커가 0명이 되면 pending을 비워(unstaffed) 일시정지하고, 워커가 돌아오면 남은 진행률부터 재개한다", async () => {
    const world = makeWorld(1);
    const away = new Set<number>();
    let now = 0;
    const econRef: { current?: Awaited<ReturnType<typeof startServerEconomy>> } = {};
    const loop = createSimLoop<SimEvent>({
      startMs: 0,
      handle: (event, sim) => {
        econRef.current?.handle(event, sim.nowMs);
      },
    });
    const econ = await startServerEconomy({
      world,
      writer,
      pool: emptyPool,
      owners: new Map<number, OwnerRow>(),
      loop,
      rules: () => TEST_SOCIETY_COEFFICIENTS,
      input: {
        catalog: () => testCatalog(),
        presets: [
          {
            code: "alpha",
            name: { ko: "알파", en: "Alpha" },
            currency: { code: "gold", name: { ko: "골드", en: "Gold" } },
            tradeTaxBp: 500,
            personality: { cityJobs: [{ facility: "sawmill", recipe: "cut_plank" }] },
          },
        ],
        facilitiesIn: () => [{ buildingId: 100, facility: "sawmill", level: 1, ownerId: 1 }],
      },
      startMs: 0,
      now: () => now,
      log: silentLog,
      away: (unitId) => away.has(unitId),
    });
    if (!econ) throw new Error("economy");
    econRef.current = econ;

    // 36분(60%) 경과 시점에 유일한 일꾼 이탈 → pending undefined(unstaffed), endsAtMs null
    now = 36 * 60_000;
    loop.runUntil(now);
    away.add(1);
    econ.refreshPresence(now);
    const paused = econ.production(10)[0];
    expect(paused?.facility.workers).toBe(0);
    expect(paused?.facility.pending).toBeUndefined();
    expect(paused?.endsAtMs).toBeNull();

    // 2시간 동안 생산 없음
    now += 2 * HOUR_MS;
    loop.runUntil(now);
    expect(world.book.balanceOf(1, "item:plank", 10)).toBe(0n);

    // 일꾼 복귀 → 남은 40%(24분)만 진행해 완료
    away.delete(1);
    econ.refreshPresence(now);
    const resumed = econ.production(10)[0];
    expect(resumed?.facility.workers).toBe(1);
    expect(resumed?.endsAtMs).toBe(now + 24 * 60_000);
    now += 24 * 60_000 + 1;
    loop.runUntil(now);
    expect(world.book.balanceOf(1, "item:plank", 10)).toBe(1n);
  });

  it("dutyPm·selectTier 변동 시 batches·진행 중 배치를 보존하고, selectTier는 다음 배치부터 적용한다", async () => {
    const world = makeWorld(1);
    let now = 0;
    let dutyPm = 1000;
    const econRef: { current?: Awaited<ReturnType<typeof startServerEconomy>> } = {};
    const loop = createSimLoop<SimEvent>({
      startMs: 0,
      handle: (event, sim) => {
        econRef.current?.handle(event, sim.nowMs);
      },
    });
    const econ = await startServerEconomy({
      world,
      writer,
      pool: emptyPool,
      owners: new Map<number, OwnerRow>(),
      loop,
      rules: () => TEST_SOCIETY_COEFFICIENTS,
      input: {
        catalog: () => testCatalog(),
        presets: [
          {
            code: "alpha",
            name: { ko: "알파", en: "Alpha" },
            currency: { code: "gold", name: { ko: "골드", en: "Gold" } },
            tradeTaxBp: 500,
            personality: { cityJobs: [{ facility: "farm", recipe: "farm_crop" }] },
          },
        ],
        facilitiesIn: () => [{ buildingId: 200, facility: "farm", level: 2, ownerId: 1 }],
        cityRest: () =>
          ({
            workers: [{ facilityId: 200, lodgingId: null, place: { kind: "home" }, commuteCells: 0 }],
            facilities: new Map([[200, { dutyPm, haulCells: 0 }]]),
            occupancy: new Map(),
            beds: new Map(),
            owners: new Map(),
            bedTotal: 0,
            capBeds: 0,
          }) satisfies CityRestPlan,
      },
      startMs: 0,
      now: () => now,
      log: silentLog,
    });
    if (!econ) throw new Error("economy");
    econRef.current = econ;

    const initial = econ.production(10)[0];
    if (!initial?.facility.pending || initial.endsAtMs === null) throw new Error("farm run");
    const firstOutputs = initial.facility.pending.outputs;
    const firstEndsAt = initial.endsAtMs;
    const initialBatches = initial.facility.batches;
    expect(initialBatches).toBe(1);
    expect(batchDurationFor(econ.economy, initial.facility, initial.facility.pending)).toBe(
      initial.facility.pending.durationMs,
    );

    // 시세를 크게 흔들어 selectTier가 달라져도 진행 중 배치의 endsAtMs·outputs·eventId는 그대로 유지된다
    const initialTier = initial.facility.selectTier;
    const altAsset = initialTier === 3 ? "item:grain" : "item:wheat";
    const curAsset = initialTier === 3 ? "item:wheat" : "item:grain";
    const prices = econ.economy.catalog.startPrice;
    if (!(prices instanceof Map)) throw new Error("mutable startPrice map expected");
    prices.set(altAsset, 1_000_000n);
    prices.set(curAsset, 1n);
    now = Math.floor(firstEndsAt / 3);
    loop.runUntil(now);
    econ.refreshCity(10, now);
    const afterTier = econ.production(10)[0];
    expect(afterTier?.facility.selectTier).not.toBe(initialTier);
    expect(afterTier?.endsAtMs).toBe(firstEndsAt);
    expect(afterTier?.facility.pending?.outputs).toEqual(firstOutputs);
    expect(afterTier?.facility.batches).toBe(initialBatches);

    // dutyPm이 2000으로 2배 빨라지면 batches는 유지되고 잔여 시간이 절반으로 줄어든다
    dutyPm = 2000;
    econ.refreshCity(10, now);
    const faster = econ.production(10)[0];
    expect(faster?.facility.batches).toBe(initialBatches);
    expect(faster?.endsAtMs).toBeLessThan(firstEndsAt);
    // 진행 중 배치가 끝나면 다음 배치로 넘어가며 batches가 +1 된다
    const fasterEnd = faster?.endsAtMs ?? firstEndsAt;
    now = fasterEnd + 1;
    loop.runUntil(now);
    expect(econ.production(10)[0]?.facility.batches).toBe(initialBatches + 1);
  });

  it("레시피 ID가 바뀌면 진행 중 배치를 취소하고 0%부터 새로 시작한다", async () => {
    const world = makeWorld(1);
    let now = 0;
    let recipe = "cut_plank";
    const loop = createSimLoop<SimEvent>({ startMs: 0, handle: () => {} });
    const econ = await startServerEconomy({
      world,
      writer,
      pool: emptyPool,
      owners: new Map<number, OwnerRow>(),
      loop,
      rules: () => TEST_SOCIETY_COEFFICIENTS,
      input: {
        catalog: () => testCatalog(),
        presets: [
          {
            code: "alpha",
            name: { ko: "알파", en: "Alpha" },
            currency: { code: "gold", name: { ko: "골드", en: "Gold" } },
            tradeTaxBp: 500,
            get personality() {
              return { cityJobs: [{ facility: "sawmill", recipe }] };
            },
          },
        ],
        facilitiesIn: () => [{ buildingId: 100, facility: "sawmill", level: 1, ownerId: 1 }],
      },
      startMs: 0,
      now: () => now,
      log: silentLog,
    });
    if (!econ) throw new Error("economy");
    expect(econ.production(10)[0]?.endsAtMs).toBe(HOUR_MS);
    now = 30 * 60_000;
    loop.runUntil(now);
    recipe = "cut_timber";
    econ.refreshCity(10, now);
    const switched = econ.production(10)[0];
    expect(switched?.facility.recipe.id).toBe("cut_timber");
    // cut_timber는 work 2000(2시간)이므로 0%부터 시작해 now + 2시간
    expect(switched?.endsAtMs).toBe(now + 2 * HOUR_MS);
  });

  it("refreshPresence는 같은 인원 수로 1명 이탈·1명 복귀가 동시에 일어나도 변동을 감지한다(P0-2)", async () => {
    const world = makeWorld(2);
    const away = new Set<number>([1]);
    let now = 0;
    const loop = createSimLoop<SimEvent>({ startMs: 0, handle: () => {} });
    const econ = await startServerEconomy({
      world,
      writer,
      pool: emptyPool,
      owners: new Map<number, OwnerRow>(),
      loop,
      rules: () => TEST_SOCIETY_COEFFICIENTS,
      input: {
        catalog: () => testCatalog(),
        facilitiesIn: () => [{ buildingId: 100, facility: "sawmill", level: 1, ownerId: 1 }],
      },
      startMs: 0,
      now: () => now,
      log: silentLog,
      away: (unitId) => away.has(unitId),
    });
    if (!econ) throw new Error("economy");
    expect(world.units.get(1)?.away).toBe(true);
    expect(world.units.get(2)?.away).toBeUndefined();

    // 1번 복귀 + 2번 이탈 동시 발생 → cityAway 수는 1 → 1로 같지만 유닛 구성이 바뀜
    away.delete(1);
    away.add(2);
    now = 30_000;
    expect(econ.refreshPresence(now)).toBe(1);
    expect(world.units.get(1)?.away).toBeUndefined();
    expect(world.units.get(2)?.away).toBe(true);
    expect(EVENT_PRODUCE).toBe("produce");
  });
});
