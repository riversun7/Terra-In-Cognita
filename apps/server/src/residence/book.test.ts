// 사는 곳 장부·서비스 시험(D-585 1) — 고를 수 있는 집, 쉬는 고른 것(옛 길로), 도시별 거주, 고르기 명령 결과, 주민세 거주 출처에 들어감
import { describe, expect, it } from "vitest";
import { withChosenResidences } from "../npc/residentProperty.ts";
import {
  type ResidenceBuildingFacts,
  type ResidenceWorld,
  createResidenceBook,
  registerResidenceBook,
  residenceBookOf,
} from "./book.ts";
import { evictWarResidences, sweepResidencePauses } from "./attach.ts";
import { type RentPayer, chargeResidence, createRentTable, renewResidenceRents } from "./rent.ts";
import { createResidenceService } from "./service.ts";

/** 건물 표·유닛 주인·숙소 배정을 바꿀 수 있는 가짜 세계 */
function fakeWorld() {
  const buildings = new Map<number, ResidenceBuildingFacts>([
    // 주인 10의 집(도시 5)
    [100, { cityId: 5, level: 1, living: true, ownerId: 10, capacity: 4 }],
    // 주인 10의 집(도시 6)
    [101, { cityId: 6, level: 2, living: true, ownerId: 10, capacity: 4 }],
    // 남의 숙소(도시 6, 주인 20)
    [200, { cityId: 6, level: 1, living: true, ownerId: 20, capacity: 4 }],
    // 주인 10의 창고(주거 아님)
    [300, { cityId: 5, level: 1, living: false, ownerId: 10, capacity: 4 }],
    // 도시 밖 집
    [400, { cityId: null, level: 1, living: true, ownerId: 10, capacity: 4 }],
    // 다 짓지 않은 집
    [500, { cityId: 5, level: 0, living: true, ownerId: 10, capacity: 4 }],
  ]);
  const owners = new Map<number, number>([
    [1, 10],
    [2, 10],
    [3, 20],
  ]);
  const lodging = new Map<number, { buildingId: number; cityId: number }>([
    [2, { buildingId: 200, cityId: 6 }],
  ]);
  const world: ResidenceWorld = {
    unitOwner: (unitId) => owners.get(unitId),
    building: (id) => buildings.get(id),
    lodgingOf: (unitId) => lodging.get(unitId),
  };
  return { world, buildings, owners, lodging };
}

describe("사는 곳 장부(D-585 1)", () => {
  it("고를 수 있는 집: 내 주거 건물 또는 배정받은 숙소, 도시 안·다 지은 것만", () => {
    const { world } = fakeWorld();
    const book = createResidenceBook(world);
    expect(book.blockOf(1, 10, 100)).toBeNull();
    expect(book.blockOf(1, 10, 300)).toBe("not_housing");
    expect(book.blockOf(1, 10, 400)).toBe("no_city");
    expect(book.blockOf(1, 10, 500)).toBe("unknown_building");
    expect(book.blockOf(1, 10, 999)).toBe("unknown_building");
    // 남의 숙소: 배정받은 유닛 2만
    expect(book.blockOf(1, 10, 200)).toBe("not_eligible");
    expect(book.blockOf(2, 10, 200)).toBeNull();
  });

  it("정원(질문 2481 가): 고른 차례로 앞에서 정원까지만 산다 — 다 차면 full, 정원이 줄면 뒤에 고른 유닛부터 쉰다", () => {
    const { world, buildings, owners } = fakeWorld();
    owners.set(4, 10);
    buildings.set(100, { cityId: 5, level: 1, living: true, ownerId: 10, capacity: 2 });
    const book = createResidenceBook(world);
    book.put({ unitId: 1, ownerId: 10, buildingId: 100, chosenAtMs: 1 });
    book.put({ unitId: 2, ownerId: 10, buildingId: 100, chosenAtMs: 2 });
    expect(book.blockOf(4, 10, 100)).toBe("full");
    // 이미 고른 유닛은 그대로 산다(자기 자리를 세지 않는다)
    expect(book.blockOf(2, 10, 100)).toBeNull();
    // 층(레벨)이 올라 정원이 늘면 고를 수 있다
    buildings.set(100, { cityId: 5, level: 2, living: true, ownerId: 10, capacity: 4 });
    expect(book.blockOf(4, 10, 100)).toBeNull();
    // 정원이 1로 줄면 나중에 고른 유닛 2가 쉰다
    buildings.set(100, { cityId: 5, level: 1, living: true, ownerId: 10, capacity: 1 });
    expect(book.chosenPlace(1)).toEqual({ buildingId: 100, cityId: 5 });
    expect(book.chosenPlace(2)).toBeUndefined();
  });

  it("쉼 훑기(질문 2485 가): 쓸 수 없게 되면 쉰 시각을 적고(처리할 일), 다시 쓸 수 있으면 지운다", async () => {
    const { world, buildings } = fakeWorld();
    const book = createResidenceBook(world);
    book.put({ unitId: 1, ownerId: 10, buildingId: 100, chosenAtMs: 1 });
    expect(await sweepResidencePauses(book, undefined, 50)).toBe(0);
    buildings.set(100, { cityId: 5, level: 1, living: true, ownerId: 99, capacity: 4 });
    expect(await sweepResidencePauses(book, undefined, 60)).toBe(1);
    expect(book.choiceOf(1)?.pausedSinceMs).toBe(60);
    // 같은 쉼은 다시 적지 않는다
    expect(await sweepResidencePauses(book, undefined, 70)).toBe(0);
    buildings.set(100, { cityId: 5, level: 1, living: true, ownerId: 10, capacity: 4 });
    expect(await sweepResidencePauses(book, undefined, 80)).toBe(1);
    expect(book.choiceOf(1)?.pausedSinceMs).toBeNull();
  });

  it("고른 집이 있으면 그 집, 없거나 쉬면 숙소 배정(옛 길), 둘 다 없으면 없음", () => {
    const { world, buildings, owners } = fakeWorld();
    const book = createResidenceBook(world);
    expect(book.residenceOf(1)).toBeUndefined();
    expect(book.residenceOf(2)).toEqual({ buildingId: 200, cityId: 6, source: "lodging" });
    book.put({ unitId: 2, ownerId: 10, buildingId: 100, chosenAtMs: 1 });
    expect(book.residenceOf(2)).toEqual({ buildingId: 100, cityId: 5, source: "chosen" });
    expect(book.residenceCityOf(2)).toBe(5);
    // 집을 잃으면 고른 것이 쉰다 → 숙소 배정
    buildings.set(100, { cityId: 5, level: 1, living: true, ownerId: 99, capacity: 4 });
    expect(book.residenceOf(2)).toEqual({ buildingId: 200, cityId: 6, source: "lodging" });
    buildings.set(100, { cityId: 5, level: 1, living: true, ownerId: 10, capacity: 4 });
    // 유닛 주인이 바뀌어도 쉰다
    owners.set(2, 30);
    expect(book.chosenPlace(2)).toBeUndefined();
    owners.set(2, 10);
    expect(book.chosenPlace(2)).toEqual({ buildingId: 100, cityId: 5 });
  });

  it("도시별 고른 거주·주인의 사는 도시(고른 것만)", () => {
    const { world } = fakeWorld();
    const book = createResidenceBook(world);
    book.load([
      { unitId: 2, ownerId: 10, buildingId: 101, chosenAtMs: 1 },
      { unitId: 1, ownerId: 10, buildingId: 100, chosenAtMs: 1 },
      // 쉬는 것(남의 숙소 — 배정 없음)
      { unitId: 3, ownerId: 20, buildingId: 101, chosenAtMs: 1 },
    ]);
    expect(book.chosenIn(5)).toEqual([{ unit: 1, owner: 10, lodging: 100 }]);
    expect(book.chosenIn(6)).toEqual([{ unit: 2, owner: 10, lodging: 101 }]);
    expect(book.ownerResidenceCities(10)).toEqual([5, 6]);
    expect(book.ownerResidenceCities(20)).toEqual([]);
  });

  it("고르기 명령: 내 유닛만, 막는 까닭, 같은 집은 unchanged, null = 풀기", async () => {
    const { world } = fakeWorld();
    const book = createResidenceBook(world);
    const service = createResidenceService({
      book,
      ownerOf: (userId) => (userId === "me" ? 10 : undefined),
      unitOwner: (unitId) => world.unitOwner(unitId),
      now: () => 42,
    });
    expect(await service.set("me", 3, 100)).toEqual({ ok: false, code: "unknown_unit" });
    expect(await service.set("other", 1, 100)).toEqual({ ok: false, code: "unknown_unit" });
    expect(await service.set("me", 1, 300)).toEqual({ ok: false, code: "not_housing" });
    expect(await service.set("me", 1, 200)).toEqual({ ok: false, code: "not_eligible" });
    expect(await service.set("me", 1, null)).toEqual({ ok: false, code: "unchanged" });
    expect(await service.set("me", 1, 100)).toEqual({ ok: true, unitId: 1, buildingId: 100, cityId: 5 });
    expect(book.choiceOf(1)).toEqual({
      unitId: 1,
      ownerId: 10,
      buildingId: 100,
      chosenAtMs: 42,
      paidUntilMs: null,
    });
    expect(await service.set("me", 1, 100)).toEqual({ ok: false, code: "unchanged" });
    // 집을 여럿 가져도 사는 곳은 하나 — 바꾸면 앞의 것을 덮는다
    expect(await service.set("me", 1, 101)).toEqual({ ok: true, unitId: 1, buildingId: 101, cityId: 6 });
    expect(book.chosenIn(5)).toEqual([]);
    expect(await service.set("me", 1, null)).toEqual({ ok: true, unitId: 1, buildingId: null, cityId: null });
    expect(book.choiceOf(1)).toBeUndefined();
    expect(service.view("me", 2, 200, 7)).toEqual({
      status: "ok",
      unitId: 2,
      current: { buildingId: 200, cityId: 6, source: "lodging" },
      building: { buildingId: 200, block: null },
      choice: null,
      generatedAt: 7,
    });
    expect(service.view("me", 3, undefined, 7).status).toBe("unknown_unit");
  });

  it("주민세 거주: 고른 집이 있는 유닛은 그 집 도시에서만 센다(숙소 배정·NPC 사는 도시보다 앞)", () => {
    const { world } = fakeWorld();
    const book = createResidenceBook(world);
    const ledger = {};
    registerResidenceBook(ledger, book);
    expect(residenceBookOf(ledger)).toBe(book);
    // 옛 길: 유닛 1은 도시 6에 살고(NPC 사는 도시), 일꾼 2는 도시 6 숙소 200에 배정
    const base6 = [
      { unit: 1, owner: 10, lodging: null },
      { unit: 2, owner: 10, lodging: 200 },
    ];
    expect(withChosenResidences(6, base6, undefined)).toEqual(base6);
    expect(withChosenResidences(6, base6, book)).toEqual(base6);
    book.put({ unitId: 2, ownerId: 10, buildingId: 100, chosenAtMs: 1 });
    book.put({ unitId: 1, ownerId: 10, buildingId: 101, chosenAtMs: 1 });
    expect(withChosenResidences(6, base6, book)).toEqual([{ unit: 1, owner: 10, lodging: 101 }]);
    expect(withChosenResidences(5, [], book)).toEqual([{ unit: 2, owner: 10, lodging: 100 }]);
  });
});

/** 집세·숙박비 가짜 지갑(유닛 → 잔고), 낸 기록 */
function fakePayer(period = 1_000) {
  const purses = new Map<number, bigint>();
  const paid: string[] = [];
  const payer: RentPayer = {
    periodMs: () => period,
    priceOf: (unitId, buildingId, kind) =>
      kind === "own" ? 0n : kind === "lodging" ? 3n : buildingId === 200 ? 7n : undefined,
    purseBalance: (_owner, unitId) => purses.get(unitId) ?? 0n,
    pay(input) {
      purses.set(input.unitId, (purses.get(input.unitId) ?? 0n) - input.amount);
      paid.push(`${input.kind}:${input.unitId}:${input.buildingId}:${input.amount}`);
      return true;
    },
  };
  return { payer, purses, paid };
}

describe("집세·미리 내는 숙박비(D-591 2 — 줄기 residence-3)", () => {
  it("내는 길: 배정받은 숙소 = lodging, 내 집 = own, 세를 놓은 남의 집 = rent, 아니면 고를 수 없다", () => {
    const { world, buildings } = fakeWorld();
    const book = createResidenceBook(world);
    expect(book.payKindOf(1, 10, 100)).toBe("own");
    expect(book.payKindOf(2, 10, 200)).toBe("lodging");
    expect(book.payKindOf(1, 10, 200)).toBeNull();
    expect(book.blockOf(1, 10, 200)).toBe("not_eligible");
    buildings.set(200, { cityId: 6, level: 1, living: true, ownerId: 20, capacity: 4, rent: 7n });
    expect(book.payKindOf(1, 10, 200)).toBe("rent");
    expect(book.blockOf(1, 10, 200)).toBeNull();
  });

  it("고르면 첫 기간을 낸다(모자라면 insufficient_funds), 낸 기간 안에서만 쓰고, 다른 집을 고르면 남은 몫은 버린다", async () => {
    const { world, buildings } = fakeWorld();
    let now = 100;
    const timed: ResidenceWorld = { ...world, now: () => now };
    buildings.set(200, { cityId: 6, level: 1, living: true, ownerId: 20, capacity: 4, rent: 7n });
    const book = createResidenceBook(timed);
    const { payer, purses, paid } = fakePayer();
    const service = createResidenceService({
      book,
      ownerOf: () => 10,
      unitOwner: (unitId) => world.unitOwner(unitId),
      now: () => now,
      extras: {
        rents: createRentTable(),
        payer,
        buildingFacts: (id) => world.building(id),
        floorsOf: () => undefined,
        floorQuote: () => null,
      },
    });
    // 지갑 비어 있음 → 모자람, 아무것도 적지 않는다
    expect(await service.set("me", 1, 200)).toEqual({ ok: false, code: "insufficient_funds" });
    expect(book.choiceOf(1)).toBeUndefined();
    purses.set(1, 10n);
    expect(await service.set("me", 1, 200)).toEqual({ ok: true, unitId: 1, buildingId: 200, cityId: 6 });
    expect(paid).toEqual(["rent:1:200:7"]);
    expect(book.choiceOf(1)?.paidUntilMs).toBe(1_100);
    expect(book.chosenPlace(1)).toEqual({ buildingId: 200, cityId: 6 });
    expect(book.prepaidAt(1, 200, 1_099)).toBe(true);
    // 같은 집을 다시 고르면 unchanged(다시 내지 않는다)
    expect(await service.set("me", 1, 200)).toEqual({ ok: false, code: "unchanged" });
    // 세를 거둬도 낸 기간 끝까지 산다
    buildings.set(200, { cityId: 6, level: 1, living: true, ownerId: 20, capacity: 4, rent: null });
    expect(book.chosenPlace(1)).toEqual({ buildingId: 200, cityId: 6 });
    // 기간이 지나면 쉰다(옛 길)
    now = 1_100;
    expect(book.chosenPlace(1)).toBeUndefined();
    expect(book.renewable(1)).toBe(false);
    // 내 집으로 바꾸면 값 없음, 옛 집 남은 몫은 버린다
    now = 500;
    buildings.set(200, { cityId: 6, level: 1, living: true, ownerId: 20, capacity: 4, rent: 7n });
    expect(await service.set("me", 1, 100)).toEqual({ ok: true, unitId: 1, buildingId: 100, cityId: 5 });
    expect(book.choiceOf(1)?.paidUntilMs).toBeNull();
    expect(paid).toEqual(["rent:1:200:7"]);
    // 다시 그 남의 집 → 새로 낸다(지갑 3 → 모자람)
    expect(await service.set("me", 1, 200)).toEqual({ ok: false, code: "insufficient_funds" });
    // 배정받은 숙소(유닛 2)는 숙박비를 미리
    purses.set(2, 5n);
    expect(await service.set("me", 2, 200)).toEqual({ ok: true, unitId: 2, buildingId: 200, cityId: 6 });
    expect(paid.at(-1)).toBe("lodging:2:200:3");
    // 조회: 이 유닛이 낼 값·기간·주인 집세
    const view = service.view("me", 2, 200, now);
    expect(view.periodMs).toBe(1_000);
    expect(view.choice).toEqual({ buildingId: 200, paidUntilMs: 1_500, paused: false });
    expect(view.building).toMatchObject({ payKind: "lodging", price: "3", mine: false, occupants: 1 });
  });

  it("다음 기간 걷기: 기간이 끝난 고른 것만, 모자라면 걷지 않고 쉰다 — 돈이 생기면 다시 산다", async () => {
    const { world, buildings } = fakeWorld();
    let now = 0;
    buildings.set(200, { cityId: 6, level: 1, living: true, ownerId: 20, capacity: 4, rent: 7n });
    const book = createResidenceBook({ ...world, now: () => now });
    const { payer, purses, paid } = fakePayer();
    book.load([
      // 기간이 남음
      { unitId: 2, ownerId: 10, buildingId: 200, chosenAtMs: 1, paidUntilMs: 2_000 },
      // 기간이 끝남(세 든 남의 집)
      { unitId: 1, ownerId: 10, buildingId: 200, chosenAtMs: 2, paidUntilMs: 500 },
    ]);
    now = 1_000;
    expect(book.chosenPlace(1)).toBeUndefined();
    expect(await renewResidenceRents(book, payer, undefined, now)).toBe(0);
    purses.set(1, 7n);
    expect(await renewResidenceRents(book, payer, undefined, now)).toBe(1);
    expect(paid).toEqual(["rent:1:200:7"]);
    expect(book.choiceOf(1)?.paidUntilMs).toBe(2_000);
    expect(book.chosenPlace(1)).toEqual({ buildingId: 200, cityId: 6 });
    // 내 집은 걷지 않는다
    expect(chargeResidence(payer, { ownerId: 10, unitId: 1, buildingId: 100, kind: "own", atMs: 0 })).toEqual(
      {
        ok: true,
        paidUntilMs: null,
        amount: 0n,
      },
    );
  });

  it("전쟁 발발 시 적국 도시의 주거지는 강제 퇴거되고 비적대 도시는 남는다", async () => {
    const { world } = fakeWorld();
    const book = createResidenceBook(world);
    book.load([
      // 도시 5(비적대)
      { unitId: 1, ownerId: 10, buildingId: 100, chosenAtMs: 1 },
      // 도시 6(적국)
      { unitId: 2, ownerId: 10, buildingId: 101, chosenAtMs: 2 },
    ]);
    const evicted = await evictWarResidences(
      book,
      world,
      (ownerId, cityId) => ownerId === 10 && cityId === 6,
      undefined,
    );
    expect(evicted).toBe(1);
    expect(book.choiceOf(1)?.buildingId).toBe(100);
    expect(book.choiceOf(2)).toBeUndefined();
  });
});
