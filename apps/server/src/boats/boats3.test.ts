// D-564·D-568 배 시험 — 같은 모듈 겹침(1681)·남의 조선소 주문(1682)·압류와 소유권 넘어감(1686)·배 창고 내리기(D-568)·
// 배 창고 셈(hold.ts). 같은 나라 나포 막음(1690)·창고째 넘김은 dock.test.ts 빼앗기 시험. docs/adr/2026-11-15-shipyard-harbor.md "바뀜 (D-564·D-568)"
import { buildingLocation, cargoLocation, cityLocation } from "@terra/shared/goodsPlaces";
import { START_BOATS, anchorCenter } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { burnFuelItems, holdCapGrams, holdStacks, moveHoldOwner } from "./hold.ts";
import { DAY_MS, HOUR_MS, boatBuildMs, repairPlan, shipyardDocks } from "./rules.ts";
import { BERTH, CREDIT, SHIPYARD, START, TRADE, boatsOn, setup } from "./testHarbor.ts";

describe("D-564·D-568 배 셈", () => {
  it("같은 모듈 여러 개는 모두 겹친다(1681)", () => {
    const type = { materials: [{ item: "pine_log", qty: 100 }], buildMs: 1_000_000 };
    const one = boatBuildMs(type, START_BOATS, ["build"], false);
    const two = boatBuildMs(type, START_BOATS, ["build", "build"], false);
    expect(one).toBe(Math.floor((1_000_000 * START_BOATS.shipyardBuildSpecPm) / 1000));
    expect(two).toBe(Math.floor((one * START_BOATS.shipyardBuildSpecPm) / 1000));
    const repairOne = repairPlan(type, 0, START_BOATS, ["repair"], false);
    const repairTwo = repairPlan(type, 0, START_BOATS, ["repair", "repair"], false);
    expect(repairTwo?.ms).toBeLessThan(repairOne?.ms ?? 0);
    expect(repairTwo?.materials[0]?.qty).toBeLessThan(repairOne?.materials[0]?.qty ?? 0);
    expect(shipyardDocks(3, ["docks", "docks"], START_BOATS)).toBe(1 + 2 * START_BOATS.shipyardDockModule);
  });

  it("배 창고 상한·연료 아이템 태우기·창고째 넘기기", async () => {
    const { ledger, grant } = setup();
    expect(holdCapGrams({ holdKg: 5 }, START_BOATS)).toBe(5000);
    expect(holdCapGrams(undefined, START_BOATS)).toBe(START_BOATS.holdKg * 1000);
    grant(7, "item:whale_oil", 2n, cargoLocation(1));
    grant(7, "item:peat", 5n, cityLocation(3));
    const fuels = [
      { item: "whale_oil", units: 200 },
      { item: "peat", units: 60 },
    ];
    // 500단위가 모자라다: 고래 기름 2개(400) → 이탄 2개(120, 넘친 20은 버림)
    const burned = burnFuelItems(
      ledger,
      { lotSize: new Map() },
      7,
      fuels,
      [cargoLocation(1), cityLocation(3)],
      500_000,
      START,
    );
    expect(burned).toEqual({ milli: 500_000, lots: 4 });
    expect(ledger.balanceOf(7, "item:whale_oil", cargoLocation(1))).toBe(0n);
    expect(ledger.balanceOf(7, "item:peat", cityLocation(3))).toBe(3n);
    // 태울 것이 모자라면 있는 만큼만
    expect(
      burnFuelItems(ledger, { lotSize: new Map() }, 7, fuels, [cargoLocation(1)], 500_000, START),
    ).toEqual({
      milli: 0,
      lots: 0,
    });
    grant(7, "item:fish", 4n, cargoLocation(1));
    expect(moveHoldOwner(ledger, 1, 7, 8, START, "boat_seize")).toBe(1);
    expect(holdStacks(ledger, 8, 1)).toEqual([{ asset: "item:fish", qty: 4n }]);
    expect(holdStacks(ledger, 7, 1)).toEqual([]);
  });
});

describe("D-564·D-568 배 서비스", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });
  afterEach(() => vi.useRealTimers());

  it("남의 조선소에 배 짓기 주문: 받기 범위 안이면 재료는 주문자, 요금은 조선소 금고, 다 된 배는 주문자 것(1682)", async () => {
    const { map, service, place, grant, ledger } = setup();
    const yard = place(SHIPYARD, 40);
    // 주문자 8(같은 나라)의 배 화물에 재료, 9(다른 나라)는 받기 범위 밖
    map.addBoat({ id: 1, ownerId: 8, speed: START_BOATS.speed, cellX: 130, cellY: 41 });
    expect(await service.build("p9", yard, false)).toEqual({ ok: false, code: "berth_denied" });
    expect(await service.build("other", yard, false)).toEqual({ ok: false, code: "insufficient_materials" });
    grant(8, "item:pine_log", 10n, cargoLocation(1));
    expect(await service.build("other", yard, false)).toEqual({ ok: false, code: "insufficient_funds" });
    const fee = (BigInt(START_BOATS.shipyardRepairFee) * BigInt(START_BOATS.shipyardBuildFeePm)) / 1000n;
    expect(service.dockJob(yard)?.orderFee).toBe(fee.toString());
    grant(8, CREDIT, fee);
    expect(await service.build("other", yard, false)).toEqual({ ok: true, readyAtMs: START + 600_000 });
    expect(ledger.balanceOf(7, CREDIT, buildingLocation(yard))).toBe(fee);
    expect(ledger.balanceOf(8, "item:pine_log", cargoLocation(1))).toBe(0n);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(service.dockJob(yard)?.docked).toMatchObject([{ ownerId: 8, storageDue: "0" }]);
    // 주인 자신의 만들기는 요금이 없다
    expect(ledger.balanceOf(7, CREDIT)).toBe(0n);
  });

  it("보관료가 밀리면 압류, 밀린 돈이 배값을 넘으면 조선소 주인 것(1686)", async () => {
    const { map, service, place, grant, ledger } = setup();
    const yard = place(SHIPYARD, 40);
    map.addBoat({ id: 9, ownerId: 8, speed: START_BOATS.speed, cellX: 130, cellY: 41 });
    grant(8, "item:pine_log", 10n, cargoLocation(9));
    grant(8, CREDIT, 10_000n);
    expect(await service.build("other", yard, false)).toMatchObject({ ok: true });
    await vi.advanceTimersByTimeAsync(600_000);
    const boatId = service.dockJob(yard)?.docked[0]?.boatId ?? 0;
    grant(8, "item:fish", 3n, cargoLocation(boatId));
    // 배값 = 재료 10 × 시세 5 = 50. 보관료 하루 20: 압류 문턱(3일) 전에는 압류가 아니다
    vi.setSystemTime(Date.now() + START_BOATS.storageFreeHours * HOUR_MS + DAY_MS + 1);
    expect(service.dockJob(yard)?.docked[0]).toMatchObject({ impounded: false, value: "50" });
    vi.setSystemTime(Date.now() + DAY_MS);
    expect(service.dockJob(yard)?.docked[0]).toMatchObject({ impounded: true, storageDue: "60" });
    // 밀린 60 > 배값 50: 정시 살피기가 조선소 주인(7) 것으로, 배 창고도 함께
    await service.tick();
    expect(service.dockJob(yard)?.docked[0]).toMatchObject({ ownerId: 7, impounded: false, storageDue: "0" });
    expect(ledger.balanceOf(7, "item:fish", cargoLocation(boatId))).toBe(3n);
    expect(service.release("other", boatId, false)).toEqual({ ok: false, code: "forbidden" });
    expect(service.release("player", boatId, false)).toEqual({ ok: true, boatId });
  });

  it("배 창고 내리기(D-568): 교역 부두는 시간을 사고 대어 있을 때 그 도시 내 창고로, 내 정박장은 대어 있으면", async () => {
    const { map, service, place, grant, ledger, facilities } = setup();
    const trade = place(TRADE, 40, 8);
    const berth = place(BERTH, 60, 7);
    for (const id of [trade, berth]) {
      const record = facilities.get(id);
      if (record) facilities.set(id, { ...record, cityId: id === trade ? 3 : 4 });
    }
    map.addBoat({ id: 1, ownerId: 7, speed: START_BOATS.speed, cellX: 129, cellY: 41 });
    expect(service.unload(7, 1, trade, false)).toEqual({ ok: false, code: "not_moored" });
    grant(7, CREDIT, 1000n);
    expect(await service.dockTime("player", 1, trade, 1, false)).toMatchObject({ ok: true });
    expect(service.unload(7, 1, trade, false)).toEqual({ ok: false, code: "hold_empty" });
    grant(7, "item:fish", 5n, cargoLocation(1));
    expect(service.unload(8, 1, trade, false)).toEqual({ ok: false, code: "forbidden" });
    expect(service.unload(7, 1, trade, false)).toEqual({ ok: true, boatId: 1 });
    expect(ledger.balanceOf(7, "item:fish", cityLocation(3))).toBe(5n);
    // 판의 내 배 줄에 배 창고 무게·상한
    grant(7, "item:fish", 1n, cargoLocation(1));
    expect(service.dockJob(berth)?.nearby).toMatchObject([
      { boatId: 1, holdGrams: 1000, holdCapGrams: 2000 },
    ]);
    expect(service.unload(7, 1, berth, false)).toEqual({ ok: false, code: "not_moored" });
    expect((await map.moveUnit(1, anchorCenter(130, 61, 2))).ok).toBe(true);
    vi.setSystemTime(Date.now() + HOUR_MS);
    expect(service.unload(7, 1, berth, false)).toEqual({ ok: true, boatId: 1 });
    expect(ledger.balanceOf(7, "item:fish", cityLocation(4))).toBe(1n);
    expect(boatsOn(map)).toEqual([1]);
  });
});
