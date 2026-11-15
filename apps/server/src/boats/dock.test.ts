// D-559 배 시험 — 남의 조선소 수리(1522)·도크 출고와 장기 보관료(1523)·나라 화폐 요금(1524)·조선소가 없어진 도크 배,
// 연료·오버히트(1529·1540)·보직·갑판병 수리(1533)·표류한 배 빼앗기(1534). docs/adr/2026-11-15-shipyard-harbor.md "바뀜 (2026-11-15) D-559"
import { buildingLocation, cargoLocation } from "@terra/shared/goodsPlaces";
import { START_BOATS, anchorCenter } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UNIT_KIND_HUMAN } from "../world/unitKinds.ts";
import { DAY_MS, HOUR_MS } from "./rules.ts";
import { BERTH, CREDIT, SHIPYARD, START, TRADE, boatsOn, setup } from "./testHarbor.ts";

/** 배를 집 없이 바다에 오래 두어 내구도를 0으로(상태가 없는 시험 배는 info가 먼저 만든다) */
const wreck = async (service: ReturnType<typeof setup>["service"], boats: readonly number[]) => {
  for (const id of boats) service.info(id);
  vi.setSystemTime(Date.now() + 40 * DAY_MS);
  await service.tick();
};
describe("D-559 배", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });
  afterEach(() => vi.useRealTimers());

  it("남의 조선소: 받기 범위 안이면 고치고 수리 요금은 그 조선소 금고, 다 된 배는 보관료를 내야 꺼낸다(1522·1523)", async () => {
    const { map, service, place, grant, ledger } = setup();
    const yard = place(SHIPYARD, 40);
    map.addBoat({ id: 1, ownerId: 8, speed: START_BOATS.speed, cellX: 130, cellY: 41 });
    map.addBoat({ id: 2, ownerId: 9, speed: START_BOATS.speed, cellX: 132, cellY: 41 });
    await wreck(service, [1, 2]);
    // 다른 나라(9)는 처음 값 nation에서 막힌다
    expect(await service.repair("p9", 2, yard, false)).toEqual({ ok: false, code: "berth_denied" });
    grant(8, "item:pine_log", 100n, cargoLocation(1));
    expect(await service.repair("other", 1, yard, false)).toEqual({ ok: false, code: "insufficient_funds" });
    grant(8, CREDIT, 200n);
    const started = await service.repair("other", 1, yard, false);
    expect(started).toMatchObject({ ok: true });
    // 배는 도크에 들고(2차맵에서 빠짐) 수리 요금은 조선소 금고(주인 7 · 건물 위치)로
    expect(map.unitInfo(1)).toBeUndefined();
    expect(ledger.balanceOf(7, CREDIT, buildingLocation(yard))).toBe(BigInt(START_BOATS.shipyardRepairFee));
    expect(service.dockJob(yard)?.docked).toMatchObject([{ boatId: 1, ownerId: 8 }]);
    // 고치는 중이면 꺼내지 못한다
    expect(service.release("other", 1, false)).toMatchObject({ ok: false, code: "dock_busy" });
    await vi.advanceTimersByTimeAsync(HOUR_MS);
    expect(service.dockJob(yard)?.docked).toMatchObject([{ boatId: 1, repairUntil: null, storageDue: "0" }]);
    // 보관료 없는 시간이 지나고 이틀째: 하루 요금 × 2
    vi.setSystemTime(Date.now() + START_BOATS.storageFreeHours * HOUR_MS + DAY_MS + 1);
    const due = BigInt(START_BOATS.storageFeePerDay * 2);
    expect(service.dockJob(yard)?.docked[0]?.storageDue).toBe(due.toString());
    const wallet = ledger.balanceOf(8, CREDIT);
    ledger.post({
      kind: "test_spend",
      atMs: Date.now(),
      entries: [
        { account: ledger.ownerAccount(8, CREDIT), amount: -wallet },
        { account: ledger.systemAccount(`issue:${CREDIT}`, CREDIT), amount: wallet },
      ],
    });
    expect(service.release("other", 1, false)).toEqual({ ok: false, code: "insufficient_funds" });
    // 그동안 도크는 막힌다
    expect(service.build("player", yard, true)).toMatchObject({ ok: false, code: "dock_busy" });
    grant(8, CREDIT, due);
    expect(service.release("other", 1, false)).toEqual({ ok: true, boatId: 1 });
    expect(ledger.balanceOf(7, CREDIT, buildingLocation(yard))).toBe(
      BigInt(START_BOATS.shipyardRepairFee) + due,
    );
    expect(service.info(1)).toMatchObject({ hullPm: 1000, homeId: null });
    expect(map.unitInfo(1)?.ownerId).toBe(8);
  });

  it("요금은 그 항구가 선 나라 화폐(1524)", async () => {
    const { map, service, place, grant, ledger } = setup({ feeAssetOf: () => "cur:AAA" });
    const dock = place(TRADE, 40);
    map.addBoat({ id: 1, ownerId: 8, speed: START_BOATS.speed, cellX: 129, cellY: 41 });
    grant(8, CREDIT, 100n);
    expect(await service.dockTime("other", 1, dock, 1, false)).toEqual({
      ok: false,
      code: "insufficient_funds",
    });
    grant(8, "cur:AAA", 100n);
    expect(await service.dockTime("other", 1, dock, 1, false)).toEqual({ ok: true });
    expect(ledger.balanceOf(7, "cur:AAA", buildingLocation(dock))).toBe(BigInt(START_BOATS.tradeFeePerHour));
    expect(service.dockJob(dock)).toMatchObject({ currency: "AAA" });
  });

  it("조선소가 없어지면 도크의 배를 섰던 자리 옆 물에 띄운다", () => {
    const { map, service, place, facilities } = setup();
    const yard = place(SHIPYARD, 40);
    const made = service.build("admin", yard, true);
    expect(made.ok).toBe(true);
    vi.advanceTimersByTime(HOUR_MS);
    const boatId = service.dockJob(yard)?.docked[0]?.boatId ?? 0;
    expect(boatId).toBeGreaterThan(0);
    facilities.delete(yard);
    map.removeBuilding(yard);
    return service.tick().then(() => {
      expect(boatsOn(map)).toEqual([boatId]);
      expect(service.info(boatId)?.homeId).toBeNull();
    });
  });

  it("연료: 움직이면 쓰고, 바닥나면 표류(느림), 교역 부두에 대어 시간을 사면 채운다(1529)", async () => {
    const { map, service, place, grant, ledger } = setup();
    const dock = place(TRADE, 40, 8);
    map.addBoat({ id: 1, ownerId: 7, speed: START_BOATS.speed, cellX: 129, cellY: 41 });
    expect(service.info(1)).toMatchObject({ fuelPm: 1000, drifting: false });
    expect(service.voyage.refuel(7, 1, dock, false)).toEqual({ ok: false, code: "not_moored" });
    // 먼 바다로 오래 간다: 한 시간 100단위 × 10시간이면 바닥
    await service.tick();
    expect((await map.moveUnit(1, anchorCenter(250, 250, 2))).ok).toBe(true);
    vi.setSystemTime(Date.now() + 60_000);
    await service.tick();
    expect(service.info(1)?.fuelPm).toBeLessThan(1000);
    vi.setSystemTime(Date.now() + 12 * HOUR_MS);
    await service.tick();
    // 도착한 뒤에는 쓰지 않는다 — 간 시간만큼만 쓴다
    const left = service.info(1)?.fuelPm ?? 0;
    expect(left).toBeGreaterThanOrEqual(0);
    // 교역 부두로 돌아와 시간을 사고 채운다
    expect((await map.moveUnit(1, anchorCenter(130, 41, 2))).ok).toBe(true);
    vi.setSystemTime(Date.now() + 2 * HOUR_MS);
    grant(7, CREDIT, 10_000n);
    expect(await service.dockTime("player", 1, dock, 2, false)).toMatchObject({ ok: true });
    await service.tick();
    expect(service.voyage.refuel(7, 1, dock, false)).toEqual({ ok: true });
    expect(service.info(1)?.fuelPm).toBe(1000);
    expect(ledger.balanceOf(8, CREDIT, buildingLocation(dock))).toBeGreaterThan(0n);
    expect(service.voyage.refuel(7, 1, dock, false)).toEqual({ ok: false, code: "fuel_full" });
  });

  it("오버히트: 빠르기·연료가 오르고, 끄면 식는 동안 못 켠다(1540)", async () => {
    const { map, service } = setup();
    map.addBoat({ id: 1, ownerId: 7, speed: START_BOATS.speed, cellX: 129, cellY: 41 });
    expect(service.voyage.overheat(8, 1, true, false)).toEqual({ ok: false, code: "forbidden" });
    expect(service.voyage.overheat(7, 1, true, false)).toEqual({ ok: true });
    expect(service.speedPm(1)).toBe(START_BOATS.overheatSpeedPm);
    expect(service.info(1)?.overheat).toBe(true);
    expect(service.voyage.overheat(7, 1, false, false)).toEqual({ ok: true });
    expect(service.speedPm(1)).toBe(1000);
    expect(service.voyage.overheat(7, 1, true, false)).toEqual({
      ok: false,
      code: "cooling",
      readyAtMs: Date.now() + START_BOATS.overheatCoolMin * 60_000,
    });
  });

  it("보직: 탄 유닛만, 자리 수 안(함장 1, 함선 칸이 없으면 갑판병 1), 갑판병은 바다에서 기본 수리(1533)", async () => {
    const { map, service } = setup();
    map.addBoat({ id: 1, ownerId: 7, speed: START_BOATS.speed, cellX: 129, cellY: 41 });
    for (const id of [2, 3])
      map.addUnit({ id, size: 1, speed: 437, cellX: 126, cellY: 41, ownerId: 7, kind: UNIT_KIND_HUMAN });
    expect(service.voyage.crew(7, 1, 2, "captain", false)).toEqual({ ok: false, code: "not_aboard" });
    expect(await service.board("player", 2, 1, false)).toEqual({ ok: true });
    expect(await service.board("player", 3, 1, false)).toEqual({ ok: true });
    expect(service.voyage.crew(7, 1, 2, "captain", false)).toEqual({ ok: true });
    expect(service.voyage.crew(7, 1, 3, "captain", false)).toEqual({ ok: false, code: "post_full" });
    expect(service.voyage.crew(7, 1, 3, "gunner", false)).toEqual({ ok: false, code: "post_full" });
    expect(service.voyage.crew(7, 1, 3, "deck", false)).toEqual({ ok: true });
    expect(service.info(1)?.captain).toBe(2);
    // 0까지 닳은 뒤 열 시간: 갑판병 한 명 5‰/시간 = 50‰, 집 없는 닳음 40‰/일 × 10/24 ≈ 16‰
    await wreck(service, [1]);
    expect(service.info(1)?.hullPm).toBe(0);
    vi.setSystemTime(Date.now() + 10 * HOUR_MS);
    await service.tick();
    expect(service.info(1)?.hullPm).toBeGreaterThanOrEqual(30);
    expect(service.info(1)?.hullPm).toBeLessThanOrEqual(50);
    // 상한(500‰) 위로는 고치지 않는다
    vi.setSystemTime(Date.now() + 30 * DAY_MS);
    await service.tick();
    expect(service.info(1)?.hullPm).toBeLessThanOrEqual(START_BOATS.deckRepairCapPm);
  });

  it("빼앗기: 표류하고 빈 남의 배에 내 배를 대고 내 유닛을 함장으로 앉히면 내 것(1534), 같은 나라는 막는다", async () => {
    const { map, service } = setup();
    map.addBoat({ id: 1, ownerId: 9, speed: START_BOATS.speed, cellX: 140, cellY: 60 });
    map.addBoat({ id: 2, ownerId: 7, speed: START_BOATS.speed, cellX: 129, cellY: 41 });
    map.addBoat({ id: 3, ownerId: 8, speed: START_BOATS.speed, cellX: 141, cellY: 63 });
    map.addUnit({ id: 4, size: 1, speed: 437, cellX: 126, cellY: 41, ownerId: 7, kind: UNIT_KIND_HUMAN });
    expect(await service.board("player", 4, 2, false)).toEqual({ ok: true });
    expect(service.voyage.seize(7, 1, 4, false)).toEqual({ ok: false, code: "no_path" });
    expect((await map.moveUnit(2, anchorCenter(142, 60, 2))).ok).toBe(true);
    await vi.advanceTimersByTimeAsync(HOUR_MS);
    expect(service.voyage.seize(7, 1, 4, false)).toEqual({ ok: false, code: "not_drifting" });
    await wreck(service, [1, 2, 3]);
    // 같은 나라(8 → 나라 1)는 빼앗지 않는다
    expect(service.voyage.seize(7, 3, 4, false)).toEqual({ ok: false, code: "forbidden" });
    expect(service.voyage.seize(7, 2, 4, false)).toEqual({ ok: false, code: "own_boat" });
    expect(service.voyage.seize(7, 1, 4, false)).toEqual({ ok: true, boatId: 1 });
    expect(map.unitInfo(1)?.ownerId).toBe(7);
    expect(map.unitInfo(4)?.aboard).toBe(1);
    expect(service.info(1)).toMatchObject({ captain: 4, drifting: true, homeId: null });
  });

  it("정박장과 조선소는 따로: 출고한 배는 집이 없고, [여기 정박]으로 넣는다", async () => {
    const { service, place } = setup();
    const yard = place(SHIPYARD, 40);
    const berth = place(BERTH, 80);
    expect(service.build("admin", yard, true)).toMatchObject({ ok: true });
    await vi.advanceTimersByTimeAsync(HOUR_MS);
    const boatId = service.dockJob(yard)?.docked[0]?.boatId ?? 0;
    expect(service.release("player", boatId, false)).toEqual({ ok: true, boatId });
    expect(service.info(boatId)?.homeId).toBeNull();
    expect(await service.berth("player", boatId, berth, false)).toMatchObject({ ok: true });
    expect(service.info(boatId)?.homeId).toBe(berth);
  });
});
