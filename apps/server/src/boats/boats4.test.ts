// D-570 배 시험 — 함포 칸 포획 장비·낚시 선원(1821), 정박한 항구의 상하역·항구 옆 거래소(1823), 판매가 배값(1827), 내 정박장 연료 보급(1830).
// docs/adr/2026-11-15-shipyard-harbor.md "바뀜 (D-570)"
import { buildingLocation, cargoLocation, cityLocation } from "@terra/shared/goodsPlaces";
import { mountedCatchGear, postSeats } from "@terra/shared/naval";
import { START_BOATS, anchorCenter } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CarryResult, CarrySpec } from "../gather/station.ts";
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
  // 제 조선소에서 만들어도 판매가를 제 조선소 금고에 낸다(기획 대조 2072)
  rig.grant(7, CREDIT, 10_000n);
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

  it("포획 장비 달기·떼기(1821): 집 정박장에서 배 창고의 장비를 단다(조선소는 정박하지 않음), 칸·종류를 본다, 낚시 선원과 짝짓는다", async () => {
    const rig = setup();
    const { map, service, place, grant, ledger, facilities } = rig;
    const yard = place(SHIPYARD, 40);
    const berth = place(BERTH, 44);
    for (const id of [yard, berth]) {
      const record = facilities.get(id);
      if (record) facilities.set(id, { ...record, cityId: 3 });
    }
    // 재료를 실을 배(1)와 어선
    map.addBoat({ id: 1, ownerId: 7, speed: START_BOATS.speed, cellX: 140, cellY: 60 });
    const boatId = await fishingBoat(rig, yard);
    // 조선소는 항구 정박장과 별개라 정박하지 않는다(D-559 1523 — 기획 대조 boats-5)
    expect(service.gear(7, boatId, yard, 0, "fishing_net", false)).toEqual({ ok: false, code: "not_moored" });
    expect(await service.berth("player", boatId, berth, false)).toMatchObject({ ok: true });
    await vi.advanceTimersByTimeAsync(600_000);
    expect(service.gear(7, boatId, berth, 2, "fishing_net", false)).toEqual({ ok: false, code: "bad_slot" });
    expect(service.gear(7, boatId, berth, 0, "stone", false)).toEqual({ ok: false, code: "not_catch_gear" });
    // 도시 창고의 장비는 바로 달지 않는다(싣기로 먼저 나른다 — D-555 1505)
    grant(7, "item:fishing_net", 1n, cityLocation(3));
    expect(service.gear(7, boatId, berth, 0, "fishing_net", false)).toEqual({
      ok: false,
      code: "insufficient_materials",
    });
    expect(service.gear(8, boatId, berth, 0, "fishing_net", false)).toEqual({ ok: false, code: "forbidden" });
    grant(7, "item:fishing_net", 2n, cargoLocation(boatId));
    expect(service.gear(7, boatId, berth, 0, "fishing_net", false)).toEqual({ ok: true, boatId });
    expect(service.gear(7, boatId, berth, 1, "fishing_net", false)).toEqual({ ok: true, boatId });
    // 배 창고 것만 쓴다(도시 창고 것은 그대로)
    expect(ledger.balanceOf(7, "item:fishing_net", cargoLocation(boatId))).toBe(0n);
    expect(ledger.balanceOf(7, "item:fishing_net", cityLocation(3))).toBe(1n);
    expect(service.dockJob(berth)?.nearby.find((row) => row.boatId === boatId)).toMatchObject({
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
    // 떼면 장비는 배 창고로(장비 하나 1kg — 창고 10kg 안). 배 창고가 차면 hold_full(땅으로 바로 보내지 않는다)
    grant(7, "item:fish", 10n, cargoLocation(boatId));
    expect(service.gear(7, boatId, berth, 1, null, false)).toEqual({ ok: false, code: "hold_full" });
    expect(ledger.balanceOf(7, "item:fish", cargoLocation(boatId))).toBe(10n);
    ledger.post({
      kind: "test_take",
      atMs: START,
      entries: [
        { account: ledger.ownerAccount(7, "item:fish", cargoLocation(boatId)), amount: -10n },
        { account: ledger.systemAccount("sink:item:fish", "item:fish"), amount: 10n },
      ],
    });
    expect(service.gear(7, boatId, berth, 1, null, false)).toEqual({ ok: true, boatId });
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
    // 집 정박장이어야 정박이다(기획 대조 boats-5)
    expect(service.unload(7, 1, berth, false)).toEqual({ ok: false, code: "not_moored" });
    expect(await service.berth("player", 1, berth, false)).toEqual({ ok: true });
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

  it("실제 운반(2069·2070 기획 대조 — D-555 1505): 내리기·싣기는 운반꾼이 나르고, 없으면 기다리는 줄(2212), 개인 창고가 차면 도시 창고로, 싣는 짐은 배가 떠나면 돌아간다", async () => {
    const specs: CarrySpec[] = [];
    let busy = false;
    let inbound = 0n;
    let fits = true;
    // 가짜 운반: 닿는 시각만 1분 뒤로 알리고 물건은 바로 옮긴다(진짜 운반꾼 걸음은 gather/station.ts·porter.ts 시험)
    const rig = setup({
      carrier: () => ({
        carry(spec): CarryResult {
          if (busy) return "unit_busy";
          specs.push(spec);
          for (const load of spec.loads)
            rig.ledger.post({
              kind: spec.instantKind,
              atMs: spec.atMs,
              entries: [
                {
                  account: rig.ledger.ownerAccount(spec.ownerId, load.asset, spec.source),
                  amount: -load.qty,
                },
                {
                  account: rig.ledger.ownerAccount(spec.ownerId, load.asset, spec.deliverTo),
                  amount: load.qty,
                },
              ],
            });
          return { arriveAtMs: spec.atMs + 60_000, porter: 11 };
        },
        inbound: () => inbound,
      }),
      exchangeFits: () => fits,
    });
    const { map, service, place, grant, ledger, facilities } = rig;
    const berth = place(BERTH, 40);
    const exchange = place(EXCHANGE, 46, 9);
    for (const id of [berth, exchange]) {
      const record = facilities.get(id);
      if (record) facilities.set(id, { ...record, cityId: 3 });
    }
    map.addBoat({ id: 1, ownerId: 7, speed: START_BOATS.speed, cellX: 129, cellY: 41 });
    expect(await service.berth("player", 1, berth, false)).toEqual({ ok: true });
    grant(7, "item:fish", 2n, cargoLocation(1));
    const at = Date.now();
    expect(service.unload(7, 1, berth, false)).toEqual({
      ok: true,
      boatId: 1,
      walking: true,
      readyAtMs: at + 60_000,
    });
    expect(specs[0]).toMatchObject({
      ownerId: 7,
      buildingId: berth,
      cityId: 3,
      source: cargoLocation(1),
      deliverTo: buildingLocation(exchange),
      from: { x: 126, y: 41 },
      to: { x: 126, y: 47 },
      loads: [{ asset: "item:fish", qty: 2n }],
      instantKind: "boat_unload",
    });
    // 개인 창고가 차면 도시 창고로
    fits = false;
    grant(7, "item:fish", 1n, cargoLocation(1));
    expect(service.unload(7, 1, berth, false)).toMatchObject({ ok: true, walking: true });
    expect(specs[1]).toMatchObject({ deliverTo: cityLocation(3), loads: [{ asset: "item:fish", qty: 1n }] });
    // 운반꾼이 없으면 아무것도 옮기지 않고 기다리는 줄에 선다(질문 2212 — 운반꾼이 생기면 정시 살피기가 나른다)
    busy = true;
    grant(7, "item:fish", 1n, cargoLocation(1));
    expect(service.unload(7, 1, berth, false)).toEqual({ ok: true, boatId: 1, waiting: true });
    expect(ledger.balanceOf(7, "item:fish", cargoLocation(1))).toBe(1n);
    // 다시 내리면 앞 줄을 바꾼다(배마다 내리기 한 줄)
    expect(service.unload(7, 1, berth, false)).toMatchObject({ ok: true, waiting: true });
    expect(service.cargoWaiting()).toBe(1);
    await service.tick();
    expect(service.cargoWaiting()).toBe(1);
    busy = false;
    await service.tick();
    expect(service.cargoWaiting()).toBe(0);
    expect(ledger.balanceOf(7, "item:fish", cargoLocation(1))).toBe(0n);
    // 싣기: 거래소 건물 창고(2) → 도시 창고(2) 차례로 짐 둘, 나르는 중인 짐까지 창고 상한(2kg)에 센다
    expect(ledger.balanceOf(7, "item:fish", buildingLocation(exchange))).toBe(2n);
    expect(ledger.balanceOf(7, "item:fish", cityLocation(3))).toBe(2n);
    inbound = 1000n;
    expect(service.load(7, 1, berth, "fish", 2, false)).toEqual({ ok: false, code: "hold_full" });
    inbound = 0n;
    ledger.post({
      kind: "test_take",
      atMs: START,
      entries: [
        { account: ledger.ownerAccount(7, "item:fish", buildingLocation(exchange)), amount: -1n },
        { account: ledger.systemAccount("sink:item:fish", "item:fish"), amount: 1n },
      ],
    });
    specs.length = 0;
    expect(service.load(7, 1, berth, "fish", 2, false)).toMatchObject({ ok: true, walking: true });
    expect(specs.map((spec) => [spec.source, spec.deliverTo, spec.loads[0]?.qty])).toEqual([
      [buildingLocation(exchange), cargoLocation(1), 1n],
      [cityLocation(3), cargoLocation(1), 1n],
    ]);
    expect(specs[0]).toMatchObject({
      from: { x: 126, y: 47 },
      to: { x: 126, y: 41 },
      instantKind: "boat_load",
    });
    // 배가 그 항구에 있으면 받는 자리 그대로, 집을 비우면(정박이 아니면) 꺼낸 자리로 돌려놓는다
    expect(specs[1]?.redirect?.()).toBeUndefined();
    expect(await service.berth("player", 1, null, false)).toEqual({ ok: true });
    expect(specs[1]?.redirect?.()).toBe(cityLocation(3));
    expect(ledger.balanceOf(7, "item:fish", cargoLocation(1))).toBe(2n);
  });

  it("연료 보급(1830·2071): 집 정박장·시간을 산 교역 부두에서 배 창고의 연료 아이템으로 채운다, 조선소·시간 없는 제 교역 부두는 아니다", async () => {
    const { map, service, place, grant, ledger, facilities } = setup();
    const berth = place(BERTH, 40);
    const trade = place(TRADE, 60, 8);
    const yard = place(SHIPYARD, 36);
    const ownTrade = place(TRADE, 44);
    for (const id of [berth, yard, ownTrade]) {
      const record = facilities.get(id);
      if (record) facilities.set(id, { ...record, cityId: 3 });
    }
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
    // 남의 교역 부두는 시간을 사야 한다. 제 교역 부두도 시간을 사야 한다(요금은 제 사업장 금고로 — D-555 1514). 조선소는 정박하지 않는다(D-559 1523)
    expect(service.voyage.refuel(7, 1, trade, false)).toEqual({ ok: false, code: "not_moored" });
    expect(service.voyage.refuel(7, 1, ownTrade, false)).toEqual({ ok: false, code: "not_moored" });
    expect(service.voyage.refuel(7, 1, yard, false)).toEqual({ ok: false, code: "not_moored" });
    // 내 정박장도 집 정박장이어야 한다(정박료를 제 금고에 낸다)
    expect(service.voyage.refuel(7, 1, berth, false)).toEqual({ ok: false, code: "not_moored" });
    expect(await service.berth("player", 1, berth, false)).toEqual({ ok: true });
    // 도시 창고의 연료는 태우지 않는다(싣기로 배 창고에 먼저 — D-555 1505)
    grant(7, "item:whale_oil", 10n, cityLocation(3));
    expect(service.voyage.refuel(7, 1, berth, false)).toEqual({ ok: false, code: "no_fuel_items" });
    expect(service.load(7, 1, berth, "whale_oil", 2, false)).toEqual({ ok: true, boatId: 1 });
    expect(service.voyage.refuel(7, 1, berth, false)).toEqual({ ok: true });
    expect(ledger.balanceOf(7, "item:whale_oil", cityLocation(3))).toBe(8n);
    expect(ledger.balanceOf(7, "item:whale_oil", cargoLocation(1))).toBeLessThan(2n);
    expect(service.info(1)?.fuelPm).toBe(1000);
  });

  it("배값(1827)·판매가(2057·2072): 주문자·주인 모두 판매가(주인이 정한 값, 없으면 적정가·옛 셈)를 조선소 금고에, 재료는 조선소 창고 먼저", async () => {
    const { map, service, place, grant, ledger } = setup();
    const yard = place(SHIPYARD, 40);
    map.addBoat({ id: 9, ownerId: 8, speed: START_BOATS.speed, cellX: 130, cellY: 41 });
    grant(8, CREDIT, 10_000n);
    // 주문자의 재료는 보지 않는다(D-573 2048 — 재료는 조선소가 낸다)
    grant(8, "item:pine_log", 10n, cargoLocation(9));
    expect(await service.build("other", yard, false)).toEqual({ ok: false, code: "insufficient_materials" });
    grant(7, "item:pine_log", 10n, buildingLocation(yard));
    expect(await service.build("other", yard, false)).toMatchObject({ ok: true });
    expect(ledger.balanceOf(7, "item:pine_log", buildingLocation(yard))).toBe(0n);
    expect(ledger.balanceOf(8, "item:pine_log", cargoLocation(9))).toBe(10n);
    // 제 조선소: 주인도 판매가를 낸다(제 금고로 — 매출)
    const own = place(SHIPYARD, 60);
    map.addBoat({ id: 1, ownerId: 7, speed: START_BOATS.speed, cellX: 130, cellY: 61 });
    grant(7, "item:pine_log", 10n, cargoLocation(1));
    expect(await service.build("player", own, false)).toEqual({ ok: false, code: "insufficient_funds" });
    grant(7, CREDIT, 10_000n);
    expect(await service.build("player", own, false)).toMatchObject({ ok: true });
    await vi.advanceTimersByTimeAsync(600_000);
    const fee = (BigInt(START_BOATS.shipyardRepairFee) * BigInt(START_BOATS.shipyardBuildFeePm)) / 1000n;
    expect(ledger.balanceOf(7, CREDIT, buildingLocation(own))).toBe(fee);
    expect(service.dockJob(yard)?.docked[0]).toMatchObject({ ownerId: 8, value: fee.toString() });
    expect(service.dockJob(own)?.docked[0]).toMatchObject({ ownerId: 7, value: fee.toString() });
    expect(service.dockJob(own)?.types[0]).toMatchObject({ price: fee.toString(), priceSet: false });
  });
});
