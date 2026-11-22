// NPC 휴먼 세 들기 시험(바뀜 npc-rent — 질문 2674, D-555 1509): 고르기 규칙식(성향·노숙·지갑 여유), 그 도시 나라 화폐로 걷기(사업장 금고 없으면 건물 주인 지갑),
// 정원 지킴, 훑기 상한·커서, 그만두기, 다음 기간 못 내면 쉼(빚 없음), 화폐 바꾸기(올림), 쉼터 계획 → 한 기간 숙박비
import { unitPurseLocation } from "@terra/shared/businessBooks";
import { TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { createLedger } from "../economy/ledger.ts";
import type { CityRestPlan } from "../npc/cityRest.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import { type ResidenceBuildingFacts, type ResidenceWorld, createResidenceBook } from "./book.ts";
import {
  type NpcRentWorld,
  type NpcRest,
  type NpcTenantUnit,
  createNpcRentSweeper,
  npcAwarePayer,
  npcRentWillingPm,
  pickNpcRent,
  resolveNpcRentRules,
} from "./npcRent.ts";
import { convertUp, npcRestsOf } from "./npcRentWorld.ts";
import { type RentPayer, createRentTable, renewResidenceRents } from "./rent.ts";

const CUR = "cur:nation_a";
const RULES = resolveNpcRentRules({});

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

describe("NPC 세 들기 고르기 규칙식(D-323 성향, [임시])", () => {
  it("의향 = 기본 + (500 − 이윤 성향) × 무게 ÷ 500", () => {
    expect(npcRentWillingPm(500, RULES)).toBe(1000);
    expect(npcRentWillingPm(1000, RULES)).toBe(800);
    expect(npcRentWillingPm(0, RULES)).toBe(1200);
  });

  it("숙소 일꾼은 집세 ≤ 숙박비 × 의향인 가장 싼 집, 노숙이면 값 상관없이 가장 싼 집, 지갑 여유가 모자라면 고르지 않는다", () => {
    const offers = [
      { buildingId: 7, price: 110n, level: 1 },
      { buildingId: 8, price: 90n, level: 1 },
      { buildingId: 9, price: 90n, level: 3 },
    ];
    const rest: NpcRest = { lodgingId: 50, homeless: false, cost: 100n };
    // 같은 값이면 레벨 높은 집
    expect(pickNpcRent({ offers, rest, purse: 1_000n, greed: 500, rules: RULES })).toBe(9);
    // 숙박비가 싸면(80) 중립 성향은 고르지 않고, 공공 성향(의향 1200 → 96)은 고른다
    const cheap: NpcRest = { ...rest, cost: 80n };
    expect(pickNpcRent({ offers, rest: cheap, purse: 1_000n, greed: 500, rules: RULES })).toBeNull();
    expect(pickNpcRent({ offers, rest: cheap, purse: 1_000n, greed: 0, rules: RULES })).toBe(9);
    // 노숙 → 가장 싼 집
    const homeless: NpcRest = { lodgingId: null, homeless: true, cost: 0n };
    expect(pickNpcRent({ offers, rest: homeless, purse: 1_000n, greed: 1000, rules: RULES })).toBe(9);
    // 지갑 여유(집세 × 2) 모자람
    expect(pickNpcRent({ offers, rest: homeless, purse: 179n, greed: 500, rules: RULES })).toBeNull();
    // 집에서 쉬는 일꾼·일꾼 아님(숙박비 0)은 집세 0인 집만
    expect(pickNpcRent({ offers, rest: undefined, purse: 1_000n, greed: 0, rules: RULES })).toBeNull();
    expect(
      pickNpcRent({
        offers: [...offers, { buildingId: 10, price: 0n, level: 1 }],
        rest: undefined,
        purse: 0n,
        greed: 500,
        rules: RULES,
      }),
    ).toBe(10);
    // 지금 쉬는 숙소 건물은 고르지 않는다
    expect(
      pickNpcRent({
        offers: [{ buildingId: 50, price: 1n, level: 1 }],
        rest,
        purse: 1_000n,
        greed: 500,
        rules: RULES,
      }),
    ).toBeNull();
  });

  it("화폐 바꾸기: 지난 체결가로 올림, 체결가가 없거나 같은 화폐면 그대로", () => {
    const economy = {
      base: "credit",
      currencyOf: new Map<number, string>(),
      fx: new Map([[CUR, { lastPrice: 300n }]]),
      settings: { fxLot: 1000n },
    };
    // 기준 100 → 나라 화폐 100 × 1000 ÷ 300 = 333.3… → 334
    expect(convertUp(economy, 100n, "credit", CUR)).toBe(334n);
    expect(convertUp(economy, 100n, "credit", "credit")).toBe(100n);
    expect(convertUp(economy, 100n, "credit", "cur:none")).toBe(100n);
    expect(convertUp(undefined, 100n, "credit", CUR)).toBe(100n);
  });

  it("쉼터 계획 → 휴먼마다 한 기간 숙박비(밤 수 × 하룻밤 요금), 노숙 표시", () => {
    const plan: CityRestPlan = {
      workers: [
        { facilityId: 1, lodgingId: 70, place: { kind: "lodging", level: 1 }, commuteCells: 0 },
        { facilityId: 1, lodgingId: null, place: { kind: "homeless" }, commuteCells: 0 },
      ],
      facilities: new Map(),
      occupancy: new Map(),
      beds: new Map(),
      owners: new Map(),
      bedTotal: 0,
      capBeds: 0,
    };
    const rests = npcRestsOf(
      plan,
      [
        { unitId: 11, facilityId: 1, index: 0 },
        { unitId: 12, facilityId: 1, index: 1 },
      ],
      86_400_000,
      TEST_SOCIETY_COEFFICIENTS,
    );
    expect(rests.get(11)?.lodgingId).toBe(70);
    expect(rests.get(11)?.cost ?? 0n).toBeGreaterThan(0n);
    expect(rests.get(12)).toEqual({ lodgingId: null, homeless: true, cost: 0n });
  });
});

/** 세계: 플레이어 주인 10의 세 놓은 집 200(도시 6), NPC 세력 30의 휴먼 41~45(도시 6) */
function setup(o: { capacity?: number; business?: boolean } = {}) {
  let account = 0;
  let tx = 0;
  const ledger = createLedger({ writer, nextAccountId: () => ++account, nextTxId: () => ++tx, accounts: [] });
  const buildings = new Map<number, ResidenceBuildingFacts>([
    [200, { cityId: 6, level: 2, living: true, ownerId: 10, capacity: o.capacity ?? 4, rent: 10n }],
  ]);
  const units = new Map<number, NpcTenantUnit>();
  for (const id of [41, 42, 43, 44, 45]) units.set(id, { id, owner: 30, city: 6 });
  let now = 1_000;
  const world: ResidenceWorld = {
    unitOwner: (unitId) => units.get(unitId)?.owner,
    building: (id) => buildings.get(id),
    lodgingOf: () => undefined,
    now: () => now,
  };
  const book = createResidenceBook(world);
  const rents = createRentTable();
  rents.put({ buildingId: 200, ownerId: 10, rent: 10n, setAtMs: 0 });
  const npcWorld: NpcRentWorld = {
    units,
    isNpcOwner: (owner) => owner === 30,
    currencyOf: (cityId) => (cityId === 6 ? CUR : undefined),
    // 시험 환율: 집세 × 2
    toLocal: (amount) => amount * 2n,
    traits: () => undefined,
    restsIn: () =>
      new Map<number, NpcRest>(
        [...units.keys()].map((id) => [id, { lodgingId: null, homeless: true, cost: 0n }]),
      ),
  };
  const base: RentPayer = {
    periodMs: () => 1_000,
    priceOf: () => undefined,
    purseBalance: () => 0n,
    pay: () => false,
  };
  const received: string[] = [];
  const payer = npcAwarePayer(base, {
    npc: () => npcWorld,
    ledger,
    world,
    ...(o.business
      ? {
          business: {
            receive(input) {
              received.push(`${input.kind}:${input.buildingId}:${input.asset}:${input.amount}`);
              ledger.post({
                kind: input.kind,
                atMs: input.atMs,
                entries: [
                  { account: input.from, amount: -input.amount },
                  {
                    account: ledger.systemAccount(`vault:${input.buildingId}`, input.asset),
                    amount: input.amount,
                  },
                ],
              });
              return true;
            },
          },
        }
      : {}),
  });
  const purse = (unitId: number): number => ledger.ownerAccount(30, CUR, unitPurseLocation(unitId));
  const fund = (unitId: number, amount: bigint): void => {
    ledger.post({
      kind: "test",
      atMs: 0,
      entries: [
        { account: ledger.systemAccount(`issue:${CUR}`, CUR), amount: -amount },
        { account: purse(unitId), amount },
      ],
    });
  };
  let rules = {};
  const sweeper = createNpcRentSweeper({
    book,
    rents,
    world,
    payer,
    npc: () => npcWorld,
    rules: () => rules,
  });
  return {
    ledger,
    book,
    buildings,
    units,
    payer,
    received,
    purse,
    fund,
    sweeper,
    setRules: (next: object) => {
      rules = next;
    },
    setNow: (ms: number) => {
      now = ms;
    },
  };
}

describe("NPC 세 들기 훑기(바뀜 npc-rent)", () => {
  it("노숙 휴먼이 세 든다: 그 나라 화폐로 바꾼 첫 기간을 지갑 → 건물 주인 지갑(장부 없음), 정원까지만", async () => {
    const w = setup({ capacity: 2 });
    for (const id of [41, 42, 43]) w.fund(id, 100n);
    const result = await w.sweeper.sweep(1_000);
    expect(result).toEqual({ evaluated: 5, rented: 2, left: 0 });
    expect(w.book.chosenPlace(41)).toEqual({ buildingId: 200, cityId: 6 });
    expect(w.book.chosenPlace(42)).toEqual({ buildingId: 200, cityId: 6 });
    expect(w.book.choiceOf(43)).toBeUndefined();
    expect(w.book.choiceOf(41)?.paidUntilMs).toBe(2_000);
    // 집세 10 → 나라 화폐 20
    expect(w.ledger.balance(w.purse(41))).toBe(80n);
    expect(w.ledger.balance(w.ledger.ownerAccount(10, CUR))).toBe(40n);
    expect(w.book.occupants(200)).toBe(2);
  });

  it("사업장 금고로 받는다(거래 종류 residence_rent, 나라 화폐)", async () => {
    const w = setup({ business: true });
    w.fund(41, 100n);
    await w.sweeper.sweep(1_000);
    expect(w.received).toEqual([`residence_rent:200:${CUR}:20`]);
  });

  it("훑기마다 상한까지, 다음 훑기는 커서 다음 휴먼부터 — 끄면 새로 세 들지 않는다", async () => {
    const w = setup();
    for (const id of [41, 42, 43, 44, 45]) w.fund(id, 100n);
    w.setRules({ npcRentSweepCap: 2 });
    expect(await w.sweeper.sweep(1_000)).toEqual({ evaluated: 2, rented: 2, left: 0 });
    expect([...w.book.all()].map((c) => c.unitId)).toEqual([41, 42]);
    expect(await w.sweeper.sweep(1_000)).toEqual({ evaluated: 2, rented: 2, left: 0 });
    expect([...w.book.all()].map((c) => c.unitId)).toEqual([41, 42, 43, 44]);
    w.setRules({ npcRentMode: 0 });
    expect(await w.sweeper.sweep(1_000)).toEqual({ evaluated: 0, rented: 0, left: 0 });
  });

  it("다음 기간: 같은 길로 걷고, 못 내면 쉰다(빚 없음) — 다른 도시로 옮기면 그만둔다", async () => {
    const w = setup();
    w.fund(41, 25n);
    w.setRules({ npcRentReservePm: 1000 });
    await w.sweeper.sweep(1_000);
    expect(w.ledger.balance(w.purse(41))).toBe(5n);
    w.setNow(2_000);
    expect(w.book.chosenPlace(41)).toBeUndefined();
    expect(await renewResidenceRents(w.book, w.payer, undefined, 2_000)).toBe(0);
    expect(w.ledger.balance(w.purse(41))).toBe(5n);
    w.fund(41, 15n);
    expect(await renewResidenceRents(w.book, w.payer, undefined, 2_000)).toBe(1);
    expect(w.book.chosenPlace(41)).toEqual({ buildingId: 200, cityId: 6 });
    // 다른 도시로 옮김 → 지운다
    w.units.set(41, { id: 41, owner: 30, city: 7 });
    expect((await w.sweeper.sweep(2_000)).left).toBe(1);
    expect(w.book.choiceOf(41)).toBeUndefined();
  });

  it("플레이어 유닛·가문 휴먼은 base 길, NPC는 숙소 미리 내기를 셀 수 없다", () => {
    const w = setup();
    expect(w.payer.priceOf(41, 200, "rent")).toBe(20n);
    expect(w.payer.priceOf(41, 200, "lodging")).toBeUndefined();
    expect(w.payer.priceOf(99, 200, "rent")).toBeUndefined();
    expect(w.payer.purseBalance(10, 99)).toBe(0n);
  });
});
