// NPC 물류센터 시험(house-10, 기획 대조 2301 — D-555 1505·1509·D-554): 운반꾼 세우기(시설 일꾼 다음 일 없는 휴먼), 성향 가중 증축 판단, 운반 길 일꾼 줄
// 바뀜(fixes-1116t, 2347 나·2348 다): 운반꾼 임금(금고 → 휴먼 지갑, 모자라면 국고가 넣음), 물류센터 목표 수(둘째·셋째), 운반꾼 수(staffIn)
import {
  START_BUSINESS,
  type SocietyCoefficients,
  TEST_SOCIETY_COEFFICIENTS,
  createLedgerBook,
  humanPurseAccount,
  npcBaseDailyWage,
} from "@terra/sim";
import { describe, expect, it } from "vitest";
import { EMPTY_BUSINESS, createBusinessCore } from "../business/core.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import {
  LOGISTICS_WORK_BASE,
  assignCenterStaff,
  centerTarget,
  createNpcLogistics,
  npcCenterHourly,
  payCenterHaulers,
  withNpcStaff,
} from "./npcLogistics.ts";

describe("NPC 물류센터 운반꾼", () => {
  it("assignCenterStaff: 건물 ID 차례로 자리 수만큼 앞에서부터, 사람이 모자라면 뒤 물류센터는 빈다", () => {
    const staff = assignCenterStaff(
      [11, 12, 13, 14, 15],
      [
        { buildingId: 9, slots: 4 },
        { buildingId: 3, slots: 2 },
      ],
    );
    expect([...staff]).toEqual([
      [3, [11, 12]],
      [9, [13, 14, 15]],
    ]);
    expect([...assignCenterStaff([], [{ buildingId: 1, slots: 2 }])]).toEqual([[1, []]]);
  });

  it("도시 경제 시설 일꾼 다음 일 없는 휴먼(경비대 빼고)이 그 나라 물류센터 운반꾼 — 남의 물류센터·레벨 0·다른 시설은 빼고, 보이는 일터는 맨 뒤", () => {
    const units = new Map(
      [1, 2, 3, 4, 5, 6].map((id) => [id, { id, city: 7, owner: 50, guard: id === 6 ? true : undefined }]),
    );
    let now = 1_000;
    const logistics = createNpcLogistics({
      world: { cities: new Map([[7, { owner: 50 }]]), units },
      // 도시 경제 시설 하나가 일꾼 둘(휴먼 1·2)
      economy: { facilities: new Map([[100, { id: 100, city: 7, workers: 2 }]]) },
      facilitiesIn: () => [
        { buildingId: 40, facility: "logistics_center", level: 1, ownerId: 50 },
        { buildingId: 41, facility: "logistics_center", level: 1, ownerId: 99 },
        { buildingId: 42, facility: "logistics_center", level: 0, ownerId: 50 },
        { buildingId: 43, facility: "farm", level: 1, ownerId: 50 },
      ],
      defOf: (id) =>
        id === "logistics_center" ? { logistics: true, slotsPerLevel: 2 } : { slotsPerLevel: 3 },
      cityOf: (buildingId) => (buildingId >= 40 ? 7 : undefined),
      now: () => now,
    });
    expect(logistics.staffAt(40)).toEqual([3, 4]);
    expect(logistics.staffAt(41)).toEqual([]);
    expect(logistics.staffAt(99)).toEqual([]);
    expect(logistics.workFacilities(7)).toEqual([
      { id: LOGISTICS_WORK_BASE + 40, buildingId: 40, workers: 2 },
    ]);
    // 운반꾼 수(자기 짐 운반꾼에서 뺀다)·물류센터마다 운반꾼
    expect(logistics.staffIn(7)).toBe(2);
    expect(logistics.staffIn(8)).toBe(0);
    expect([...logistics.centersIn(7)]).toEqual([[40, [3, 4]]]);
    // 1초 안에는 같은 표, 지나면 다시 센다(휴먼이 줄면 운반꾼도 준다)
    units.delete(4);
    expect(logistics.staffAt(40)).toEqual([3, 4]);
    now += 1_000;
    expect(logistics.staffAt(40)).toEqual([3, 5]);
  });

  it("withNpcStaff: 노동 계약 일꾼이 있으면 그대로, 없으면 NPC 운반꾼(주인 모르는 유닛은 뺀다)", () => {
    const hired = [{ unitId: 8, workerOwnerId: 2, via: "wage" as const }];
    expect(withNpcStaff(hired, [3], () => 50)).toBe(hired);
    expect(withNpcStaff([], [3, 4], (unitId) => (unitId === 3 ? 50 : undefined))).toEqual([
      { unitId: 3, workerOwnerId: 50, via: "npc" },
    ]);
    expect(withNpcStaff([], undefined, () => 50)).toEqual([]);
  });

  it("적정가 인건비: 운반꾼 수 × NPC 기준 임금 ÷ 24", () => {
    const daily = npcBaseDailyWage(TEST_SOCIETY_COEFFICIENTS);
    expect(npcCenterHourly(3, TEST_SOCIETY_COEFFICIENTS)).toBe((3n * daily) / 24n);
    expect(npcCenterHourly(0, TEST_SOCIETY_COEFFICIENTS)).toBe(0n);
  });
});

describe("NPC 물류센터 증축 판단(성향 가중)", () => {
  const rule = { traitMin: 0, traitMax: 1000, npcBuildWaits: 3, npcBuildHumans: 30 };
  const want = (waiting: number, humans: number, commerce: number, existing = 0) =>
    centerTarget({ waiting, humans, commerce, existing }, rule);

  it("첫 물류센터: 기다리는 일 × 상업 성향 배율 ≥ 문턱, 휴먼이 모자라면 짓지 않는다", () => {
    // 가운데 성향(1000‰): 3개면 짓는다, 2개면 안 짓는다
    expect(want(3, 40, 500)).toBe(1);
    expect(want(2, 40, 500)).toBe(0);
    // 상업 성향 가장 높음(1500‰): 2개로도 짓는다, 가장 낮음(500‰): 6개가 있어야
    expect(want(2, 40, 1000)).toBe(1);
    expect(want(5, 40, 0)).toBe(0);
    expect(want(6, 40, 0)).toBe(1);
    // 휴먼 하한
    expect(want(9, 29, 1000)).toBe(0);
  });

  it("둘째·셋째(2348 다): 문턱·휴먼 하한 × (지금 수 + 1)을 넘으면 하나 더, 아니면 지금 수 그대로", () => {
    expect(want(5, 60, 500, 1)).toBe(1);
    expect(want(6, 60, 500, 1)).toBe(2);
    // 휴먼이 둘째 하한(60)에 모자란다
    expect(want(9, 59, 500, 1)).toBe(1);
    expect(want(9, 90, 500, 2)).toBe(3);
    expect(want(0, 90, 500, 2)).toBe(2);
  });
});

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

describe("NPC 물류센터 운반꾼 임금(2347 나)", () => {
  const NATION = 9;
  const CITY = 3;
  const CENTER = 40;
  const CUR = "cur:aaa";

  function setup(options: { treasury: bigint; mode?: number; books?: boolean }) {
    let ids = 1;
    const book = createLedgerBook({ nextAccountId: () => ids++, nextTxId: () => ids++ });
    const business = createBusinessCore({
      ledger: book,
      writer,
      planetId: "p",
      loaded: EMPTY_BUSINESS,
      place: (buildingId) => (buildingId === CENTER ? { ownerId: NATION, cityId: CITY } : undefined),
      businesses: () => [CENTER],
      tax: () => ({ treasuryOwner: NATION, bp: 0 }),
      rules: () => START_BUSINESS,
    });
    const rules: SocietyCoefficients = {
      ...TEST_SOCIETY_COEFFICIENTS,
      business: {
        ...TEST_SOCIETY_COEFFICIENTS.business,
        npcWageMode: options.mode ?? 1,
        npcBooks: options.books === false ? 0 : 1,
      },
    };
    if (options.treasury > 0n)
      book.post({
        kind: "grant",
        atMs: 0,
        entries: [
          { account: book.systemAccount(`source:${CUR}`, CUR), amount: -options.treasury },
          { account: book.ownerAccount(NATION, CUR), amount: options.treasury },
        ],
      });
    const deps = {
      book,
      world: {
        cities: new Map([[CITY, { owner: NATION }]]),
        units: new Map([101, 102].map((id) => [id, { owner: NATION }])),
      },
      business,
      logistics: { centersIn: (cityId: number) => new Map(cityId === CITY ? [[CENTER, [101, 102]]] : []) },
      currencyOf: () => CUR,
      rules: () => rules,
    };
    return { book, business, deps };
  }
  const wage =
    (npcBaseDailyWage(TEST_SOCIETY_COEFFICIENTS) * BigInt(TEST_SOCIETY_COEFFICIENTS.business.npcWagePm)) /
    1000n;
  const purse = (book: ReturnType<typeof createLedgerBook>, unitId: number) =>
    book.balance(humanPurseAccount(book, NATION, CUR, unitId));

  it("물류센터 금고에서 운반꾼 지갑으로 — 금고가 비면 NPC 주인이 국고에서 넣는다", () => {
    expect(wage).toBeGreaterThan(0n);
    const { book, business, deps } = setup({ treasury: wage * 10n });
    const result = payCenterHaulers(deps, 1_000);
    expect(result).toEqual({ paid: wage * 2n, paidHaulers: 2, unpaidHaulers: 0 });
    expect(purse(book, 101)).toBe(wage);
    expect(purse(book, 102)).toBe(wage);
    // 국고 → 금고(넣기) → 지갑: 국고가 두 몫만큼 줄고 금고는 빈다
    expect(book.balance(book.ownerAccount(NATION, CUR))).toBe(wage * 8n);
    expect(business.vaultBalance(CENTER, NATION, CUR)).toBe(0n);
  });

  it("국고도 모자라면 넣지 않아 받지 못하고(시설 일꾼과 같은 길), 장부를 끄면 국고에서(모자라면 앞 운반꾼만), 임금 판을 끄면 없다", () => {
    const short = setup({ treasury: wage + 1n });
    expect(payCenterHaulers(short.deps, 1_000)).toEqual({ paid: 0n, paidHaulers: 0, unpaidHaulers: 2 });
    expect(purse(short.book, 101)).toBe(0n);
    const shortTreasury = setup({ treasury: wage + 1n, books: false });
    expect(payCenterHaulers(shortTreasury.deps, 1_000)).toEqual({
      paid: wage,
      paidHaulers: 1,
      unpaidHaulers: 1,
    });
    expect(purse(shortTreasury.book, 102)).toBe(0n);
    const noBooks = setup({ treasury: wage * 3n, books: false });
    expect(payCenterHaulers(noBooks.deps, 1_000).paidHaulers).toBe(2);
    expect(noBooks.book.balance(noBooks.book.ownerAccount(NATION, CUR))).toBe(wage);
    const off = setup({ treasury: wage * 3n, mode: 0 });
    expect(payCenterHaulers(off.deps, 1_000)).toEqual({ paid: 0n, paidHaulers: 0, unpaidHaulers: 0 });
  });
});
