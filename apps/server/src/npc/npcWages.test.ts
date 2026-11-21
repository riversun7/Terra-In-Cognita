// NPC 휴먼 일꾼 임금 낼 곳·숙박비(질문 2236 — D-569 1782·D-555 1507·1509, npcWages.ts)
import { unitPurseLocation } from "@terra/shared/businessBooks";
import {
  START_BUSINESS,
  TEST_SOCIETY_COEFFICIENTS,
  type SocietyCoefficients,
  createLedgerBook,
  humanPurseAccount,
  restDutyPm,
  restsPerDay,
} from "@terra/sim";
import { describe, expect, it } from "vitest";
import { EMPTY_BUSINESS, createBusinessCore } from "../business/core.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { CityRestPlan } from "./cityRest.ts";
import { createNpcWages } from "./npcWages.ts";

const NATION = 9;
const CITY = 3;
const FARM = 40;
const LODGING = 50;
const CUR = "cur:aaa";

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

function setup(options: { treasury?: bigint; mode?: number } = {}) {
  let ids = 1;
  const book = createLedgerBook({ nextAccountId: () => ids++, nextTxId: () => ids++ });
  const business = createBusinessCore({
    ledger: book,
    writer,
    planetId: "p",
    loaded: EMPTY_BUSINESS,
    place: (buildingId) =>
      buildingId === FARM || buildingId === LODGING ? { ownerId: NATION, cityId: CITY } : undefined,
    businesses: () => [FARM, LODGING],
    tax: () => ({ treasuryOwner: NATION, bp: 0 }),
    rules: () => START_BUSINESS,
  });
  const rules: SocietyCoefficients = {
    ...TEST_SOCIETY_COEFFICIENTS,
    business: { ...TEST_SOCIETY_COEFFICIENTS.business, npcWageMode: options.mode ?? 1 },
    logistics: { ...TEST_SOCIETY_COEFFICIENTS.logistics, lodgingFeePerNight: 2 },
  };
  const treasury = options.treasury ?? 1000n;
  if (treasury > 0n)
    book.post({
      kind: "grant",
      atMs: 0,
      entries: [
        { account: book.systemAccount(`source:${CUR}`, CUR), amount: -treasury },
        { account: book.ownerAccount(NATION, CUR), amount: treasury },
      ],
    });
  const units = new Map(
    [101, 102, 103].map((id) => [
      id,
      { id, city: CITY, owner: NATION, guard: id === 103 ? true : undefined },
    ]),
  );
  const place = { kind: "lodging", level: 1 } as const;
  const plan: CityRestPlan = {
    workers: [
      { facilityId: FARM, lodgingId: LODGING, place, commuteCells: 0 },
      { facilityId: FARM, lodgingId: null, place: { kind: "home" }, commuteCells: 0 },
    ],
    facilities: new Map(),
    occupancy: new Map([[LODGING, 1]]),
    beds: new Map([[LODGING, 10]]),
    owners: new Map([[LODGING, NATION]]),
    bedTotal: 10,
    capBeds: 10,
  };
  const wages = createNpcWages({
    book,
    world: { cities: new Map([[CITY, { owner: NATION }]]), units },
    economy: { facilities: new Map([[FARM, { id: FARM, city: CITY, workers: 2 }]]) },
    business,
    restPlans: new Map([[CITY, plan]]),
    currencyOf: () => CUR,
    buildingOf: (id) => (id === FARM ? FARM : null),
    rules: () => rules,
  });
  const nights = BigInt(restsPerDay(place, 0, rules));
  return { book, business, wages, nights, rules };
}

describe("NPC 일꾼 숙박비(휴먼 지갑에서)", () => {
  it("숙소에서 쉬는 일꾼만 하룻밤 요금 × 쉬는 번 수를 제 지갑에서 그 숙소 금고로 낸다 — 다음 숙박비 몫은 lodgingDue로 알린다", () => {
    const { book, business, wages, nights } = setup();
    const purse = humanPurseAccount(book, NATION, CUR, 101);
    book.post({
      kind: "grant",
      atMs: 0,
      entries: [
        { account: book.ownerAccount(NATION, CUR), amount: -100n },
        { account: purse, amount: 100n },
      ],
    });
    expect(wages.living.lodgingDue?.(CITY)).toEqual(new Map([[`${FARM}:0`, 2n * nights]]));
    const treasury = book.balanceOf(NATION, CUR);
    const fees = wages.chargeLodgingFees(1);
    expect(fees).toEqual({ paid: 2n * nights, lodgings: 1, short: 0 });
    expect(book.balance(purse)).toBe(100n - 2n * nights);
    expect(business.vaultBalance(LODGING, NATION, CUR)).toBe(2n * nights);
    // 국고는 내지 않는다
    expect(book.balanceOf(NATION, CUR)).toBe(treasury);
  });

  it("지갑이 모자라면 있는 만큼만 내고 다 못 낸 일꾼을 센다(국고가 대신 내지 않는다)", () => {
    const { book, business, wages } = setup();
    const treasury = book.balanceOf(NATION, CUR);
    expect(wages.chargeLodgingFees(1)).toEqual({ paid: 0n, lodgings: 0, short: 1 });
    expect(business.vaultBalance(LODGING, NATION, CUR)).toBe(0n);
    expect(book.balanceOf(NATION, CUR)).toBe(treasury);
    expect(book.balanceOf(NATION, CUR, unitPurseLocation(101))).toBe(0n);
  });

  it("다 못 낸 일꾼은 회복이 노숙으로 떨어져 그 시설 생산 속도 배율이 준다(빈틈 2293 — 플레이어 일꾼과 같다), 다 내면 풀린다", () => {
    const { book, wages, rules } = setup();
    const plan: CityRestPlan = {
      workers: [
        { facilityId: FARM, lodgingId: LODGING, place: { kind: "lodging", level: 1 }, commuteCells: 0 },
        { facilityId: FARM, lodgingId: null, place: { kind: "home" }, commuteCells: 0 },
      ],
      facilities: new Map([[FARM, { dutyPm: 1100, haulCells: 4 }]]),
      occupancy: new Map(),
      beds: new Map(),
      owners: new Map(),
      bedTotal: 0,
      capBeds: 0,
    };
    // 아직 걷지 않았으면 그대로
    expect(wages.restPlan(CITY, plan)).toBe(plan);
    expect(wages.chargeLodgingFees(1).short).toBe(1);
    const hit = wages.restPlan(CITY, plan);
    const lodging = restDutyPm({ kind: "lodging", level: 1 }, 0, rules);
    const homeless = restDutyPm({ kind: "homeless" }, 0, rules);
    const home = restDutyPm({ kind: "home" }, 0, rules);
    expect(homeless).toBeLessThan(lodging);
    // 숙소 일꾼(101 — 첫 자리)만 노숙 회복으로, 집 일꾼은 그대로. 옮김 칸은 그대로
    expect(hit.facilities.get(FARM)).toEqual({ dutyPm: Math.floor((homeless + home) / 2), haulCells: 4 });
    expect(hit.workers).toBe(plan.workers);
    // 지갑을 채워 다 내면 풀린다
    book.post({
      kind: "grant",
      atMs: 0,
      entries: [
        { account: book.ownerAccount(NATION, CUR), amount: -100n },
        { account: humanPurseAccount(book, NATION, CUR, 101), amount: 100n },
      ],
    });
    expect(wages.chargeLodgingFees(2).short).toBe(0);
    expect(wages.restPlan(CITY, plan)).toBe(plan);
  });

  it("끈 판(business_npc_wage_mode 0)은 옛 길: 국고가 숙박비를 낸다", () => {
    const { book, business, wages, nights } = setup({ mode: 0 });
    expect(wages.living.lodgingDue?.(CITY)).toBeUndefined();
    const treasury = book.balanceOf(NATION, CUR);
    expect(wages.chargeLodgingFees(1).paid).toBe(2n * nights);
    expect(book.balanceOf(NATION, CUR)).toBe(treasury - 2n * nights);
    expect(business.vaultBalance(LODGING, NATION, CUR)).toBe(2n * nights);
  });
});

describe("NPC 일꾼 임금 낼 곳", () => {
  it("건물 시설은 그 사업장 금고 — 모자라면 NPC 주인이 국고에서 운영 자금을 넣는다", () => {
    const { book, business, wages } = setup();
    const source = wages.living.wageSource?.({
      facilityId: FARM,
      cityId: CITY,
      owner: NATION,
      currency: CUR,
      need: 40n,
      atMs: 1,
    });
    expect(source).toBe(business.vault(NATION, CUR, FARM));
    expect(business.vaultBalance(FARM, NATION, CUR)).toBe(40n);
    expect(book.balanceOf(NATION, CUR)).toBe(960n);
  });

  it("도시 직무(건물 없음)는 국고(undefined), 국고도 모자라면 금고에 넣지 않는다", () => {
    const { business, wages } = setup({ treasury: 10n });
    expect(
      wages.living.wageSource?.({
        facilityId: 9_000_001,
        cityId: CITY,
        owner: NATION,
        currency: CUR,
        need: 40n,
        atMs: 1,
      }),
    ).toBeUndefined();
    wages.living.wageSource?.({
      facilityId: FARM,
      cityId: CITY,
      owner: NATION,
      currency: CUR,
      need: 40n,
      atMs: 1,
    });
    expect(business.vaultBalance(FARM, NATION, CUR)).toBe(0n);
  });
});
