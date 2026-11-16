// D-570 배 시험 — 함포 칸 포획 장비·낚시 선원(1821), 정박한 항구의 상하역·항구 옆 거래소(1823), 판매가 배값(1827), 내 정박장 연료 보급(1830).
// docs/adr/2026-11-15-shipyard-harbor.md "바뀜 (D-570)"
import { buildingLocation, cargoLocation, cityLocation } from "@terra/shared/goodsPlaces";
import { mountedCatchGear, postSeats } from "@terra/shared/naval";
import { START_BOATS, anchorCenter } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UNIT_KIND_HUMAN } from "../world/unitKinds.ts";
import { boatBody } from "./navalHooks.ts";
import { HOUR_MS } from "./rules.ts";
import { BERTH, CREDIT, EXCHANGE, SHIPYARD, START, TRADE, setup } from "./testHarbor.ts";

const FISHING = SHIPYARD.boats?.find((type) => type.id === "fishing_boat");

describe("D-570 배 셈", () => {
  it("단 포획 장비만 칸 차례로 읽고, 장비를 단 칸의 함포는 쉰다", () => {
    const options = [{ item: "fishing_net", maxTier: 3 }];
    expect(mountedCatchGear(["fishing_net", null, "stone", "fishing_net"], 3, options)).toEqual([
      { slot: 0, gear: { item: "fishing_net", maxTier: 3 } },
    ]);
    expect(postSeats(FISHING?.naval, "fisher")).toBe(2);
    expect(postSeats(undefined, "fisher")).toBe(0);
    const state = { hullPpm: 1_000_000, fuelEmpty: false, overheat: false };
    expect(boatBody(FISHING, state, { gunner: 2 }, START_BOATS).guns).toHaveLength(2);
    expect(boatBody(FISHING, state, { gunner: 2 }, START_BOATS, ["fishing_net"]).guns).toHaveLength(1);
  });
});

/** 내 조선소에서 어선을 만들어 꺼낸다(배 ID) */
const fishingBoat = async (rig: ReturnType<typeof setup>, yard: number): Promise<number> => {
  rig.grant(7, "item:plank", 2n, cargoLocation(1));
  expect(await rig.service.build("player", yard, false, "fishing_boat")).toMatchObject({ ok: true });
  await vi.advanceTimersByTimeAsync(600_000);
  const boatId = rig.service.dockJob(yard)?.docked[0]?.boatId ?? 0;
  expect(rig.service.release("player", boatId, false)).toEqual({ ok: true, boatId });
  return boatId;
};

describe("D-570 배 서비스", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });
  afterEach(() => vi.useRealTimers());

  it("포획 장비 달기·떼기(1821): 정박한 내 조선소에서 배 창고·도시 창고의 장비를 단다, 칸·종류를 본다, 낚시 선원과 짝짓는다", async () => {
    const rig = setup();
    const { map, service, place, grant, ledger, facilities } = rig;
    const yard = place(SHIPYARD, 40);
    const record = facilities.get(yard);
    if (record) facilities.set(yard, { ...record, cityId: 3 });
    // 재료를 실을 배(1)와 어선
    map.addBoat({ id: 1, ownerId: 7, speed: START_BOATS.speed, cellX: 140, cellY: 60 });
    const boatId = await fishingBoat(rig, yard);
    expect(service.gear(7, boatId, yard, 2, "fishing_net", false)).toEqual({ ok: false, code: "bad_slot" });
    expect(service.gear(7, boatId, yard, 0, "stone", false)).toEqual({ ok: false, code: "not_catch_gear" });
    expect(service.gear(7, boatId, yard, 0, "fishing_net", false)).toEqual({
      ok: false,
      code: "insufficient_materials",
    });
    expect(service.gear(8, boatId, yard, 0, "fishing_net", false)).toEqual({ ok: false, code: "forbidden" });
    grant(7, "item:fishing_net", 1n, cityLocation(3));
    grant(7, "item:fishing_net", 1n, cargoLocation(boatId));
    expect(service.gear(7, boatId, yard, 0, "fishing_net", false)).toEqual({ ok: true, boatId });
    expect(service.gear(7, boatId, yard, 1, "fishing_net", false)).toEqual({ ok: true, boatId });
    // 배 창고 것을 먼저, 그다음 도시 창고 것
    expect(ledger.balanceOf(7, "item:fishing_net", cargoLocation(boatId))).toBe(0n);
    expect(ledger.balanceOf(7, "item:fishing_net", cityLocation(3))).toBe(0n);
    expect(service.dockJob(yard)?.nearby.find((row) => row.boatId === boatId)).toMatchObject({
      slots: [
        { caliber: "light", gear: "fishing_net" },
        { caliber: "light", gear: "fishing_net" },
      ],
      gearOptions: [{ item: "fishing_net", maxTier: 3 }],
    });
    // 선원 없이는 일꾼이 없다(이끄는 유닛 혼자 장비 없는 티어)
    expect(service.catchCrew(boatId)).toEqual({ fishers: [], bareMaxTier: START_BOATS.bareCatchTier });
    // 낚시 선원 둘(자리 2)·셋째는 자리가 없다
    for (const [id, y] of [
      [11, 41],
      [12, 42],
      [13, 43],
    ] as const)
      map.addUnit({ id, size: 1, speed: 1024, cellX: 124, cellY: y, ownerId: 7, kind: UNIT_KIND_HUMAN });
    for (const id of [11, 12, 13]) expect(map.board(id, boatId)).toBe(true);
    expect(service.voyage.crew(7, boatId, 12, "fisher", false)).toEqual({ ok: true });
    expect(service.voyage.crew(7, boatId, 11, "fisher", false)).toEqual({ ok: true });
    expect(service.voyage.crew(7, boatId, 13, "fisher", false)).toEqual({ ok: false, code: "post_full" });
    expect(service.catchCrew(boatId)?.fishers).toEqual([
      { unitId: 11, maxTier: 3 },
      { unitId: 12, maxTier: 3 },
    ]);
    // 떼면 장비는 배 창고로(장비 하나 1kg — 창고 10kg 안)
    expect(service.gear(7, boatId, yard, 1, null, false)).toEqual({ ok: true, boatId });
    expect(ledger.balanceOf(7, "item:fishing_net", cargoLocation(boatId))).toBe(1n);
    expect(service.catchCrew(boatId)?.fishers).toEqual([{ unitId: 11, maxTier: 3 }]);
  });

  it("상하역(1823): 항구 옆 거래소 건물이 있으면 내리기는 그 건물 창고로, 싣기는 거기서 먼저·창고 상한", async () => {
    const { map, service, place, grant, ledger, facilities } = setup();
    const berth = place(BERTH, 40);
    const exchange = place(EXCHANGE, 46, 9);
    for (const id of [berth, exchange]) {
      const record = facilities.get(id);
      if (record) facilities.set(id, { ...record, cityId: 3 });
    }
    map.addBoat({ id: 1, ownerId: 7, speed: START_BOATS.speed, cellX: 129, cellY: 41 });
    expect(service.dockJob(berth)?.exchangeId).toBe(exchange);
    grant(7, "item:fish", 2n, cargoLocation(1));
    expect(service.unload(7, 1, berth, false)).toEqual({ ok: true, boatId: 1 });
    expect(ledger.balanceOf(7, "item:fish", buildingLocation(exchange))).toBe(2n);
    expect(ledger.balanceOf(7, "item:fish", cityLocation(3))).toBe(0n);
    // 싣기: 거래소 건물 창고 1 + 도시 창고 1, 배 창고(작은 배 2kg) 상한
    grant(7, "item:fish", 1n, cityLocation(3));
    expect(service.load(7, 1, berth, "fish", 3, false)).toEqual({ ok: false, code: "hold_full" });
    expect(service.load(7, 1, berth, "peat", 1, false)).toEqual({
      ok: false,
      code: "insufficient_materials",
    });
    expect(service.dockJob(berth)?.nearby[0]?.loadable).toEqual([{ item: "fish", lots: 3 }]);
    expect(service.load(7, 1, berth, "fish", 2, false)).toEqual({ ok: true, boatId: 1 });
    expect(ledger.balanceOf(7, "item:fish", cargoLocation(1))).toBe(2n);
    expect(ledger.balanceOf(7, "item:fish", buildingLocation(exchange))).toBe(0n);
    expect(ledger.balanceOf(7, "item:fish", cityLocation(3))).toBe(1n);
    // 다시 내리면 또 거래소 건물 창고로
    expect(service.unload(7, 1, berth, false)).toEqual({ ok: true, boatId: 1 });
    expect(ledger.balanceOf(7, "item:fish", buildingLocation(exchange))).toBe(2n);
  });

  it("연료 보급(1830): 내 정박장에 대어 있으면 그 도시 창고의 연료 아이템으로 채운다", async () => {
    const { map, service, place, grant, ledger, facilities } = setup();
    const berth = place(BERTH, 40);
    const trade = place(TRADE, 60, 8);
    const record = facilities.get(berth);
    if (record) facilities.set(berth, { ...record, cityId: 3 });
    map.addBoat({ id: 1, ownerId: 7, speed: START_BOATS.speed, cellX: 129, cellY: 41 });
    // 배 상태는 처음 볼 때 생긴다(연료 가득)
    expect(service.info(1)).toMatchObject({ fuelPm: 1000 });
    await service.tick();
    expect((await map.moveUnit(1, anchorCenter(250, 250, 2))).ok).toBe(true);
    vi.setSystemTime(Date.now() + 60_000);
    await service.tick();
    vi.setSystemTime(Date.now() + 3 * HOUR_MS);
    await service.tick();
    expect((await map.moveUnit(1, anchorCenter(130, 41, 2))).ok).toBe(true);
    vi.setSystemTime(Date.now() + 3 * HOUR_MS);
    await service.tick();
    // 남의 교역 부두는 시간을 사야 한다
    expect(service.voyage.refuel(7, 1, trade, false)).toEqual({ ok: false, code: "not_moored" });
    expect(service.voyage.refuel(7, 1, berth, false)).toEqual({ ok: false, code: "no_fuel_items" });
    grant(7, "item:whale_oil", 10n, cityLocation(3));
    expect(service.voyage.refuel(7, 1, berth, false)).toEqual({ ok: true });
    expect(ledger.balanceOf(7, "item:whale_oil", cityLocation(3))).toBeLessThan(10n);
    expect(service.info(1)?.fuelPm).toBe(1000);
  });

  it("배값(1827): 남의 조선소 주문은 판매가(주문 요금), 제 조선소에서 만든 배는 재료 시작 시세", async () => {
    const { map, service, place, grant } = setup();
    const yard = place(SHIPYARD, 40);
    map.addBoat({ id: 9, ownerId: 8, speed: START_BOATS.speed, cellX: 130, cellY: 41 });
    grant(8, "item:pine_log", 10n, cargoLocation(9));
    grant(8, CREDIT, 10_000n);
    expect(await service.build("other", yard, false)).toMatchObject({ ok: true });
    // 내 배(다른 내 조선소에서 — 재료 10 × 시세 5 = 50)
    const own = place(SHIPYARD, 60);
    map.addBoat({ id: 1, ownerId: 7, speed: START_BOATS.speed, cellX: 130, cellY: 61 });
    grant(7, "item:pine_log", 10n, cargoLocation(1));
    expect(await service.build("player", own, false)).toMatchObject({ ok: true });
    await vi.advanceTimersByTimeAsync(600_000);
    const fee = (BigInt(START_BOATS.shipyardRepairFee) * BigInt(START_BOATS.shipyardBuildFeePm)) / 1000n;
    expect(service.dockJob(yard)?.docked[0]).toMatchObject({ ownerId: 8, value: fee.toString() });
    expect(service.dockJob(own)?.docked[0]).toMatchObject({ ownerId: 7, value: "50" });
  });
});
