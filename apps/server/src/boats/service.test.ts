// 배 시험 — 물 길찾기(배는 물로만, 걷는 유닛은 물에 못 들어감)·타기·내리기(docs/adr/2026-11-13-boats.md),
// 조선소 만들기·수리·정박장(집·정박료·받기 범위)·교역 부두(시간 사기·초과 요금)·내구도·운행 정지(docs/adr/2026-11-15-shipyard-harbor.md, 기획 D-547)
import { performance } from "node:perf_hooks";
import { buildingLocation, cargoLocation } from "@terra/shared/goodsPlaces";
import { HULL_FULL } from "@terra/shared/harbor";
import { START_BOATS, anchorCenter, arrivalAt, positionAt } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapTerrainFromTemp } from "../world/mapTerrain.ts";
import { createInlinePathService } from "../world/pathService.ts";
import { type SecondMap, type UnitRow, createSecondMap } from "../world/secondMap.ts";
import { silentLog } from "../world/testSupport.ts";
import { emptyWorldStats } from "../world/worldStats.ts";
import { UNIT_KIND_BOAT, UNIT_KIND_HUMAN } from "../world/unitKinds.ts";
import { DAY_MS, HOUR_MS } from "./rules.ts";
import { createBoatService } from "./service.ts";
import type { BoatJob } from "./store.ts";
import { BERTH, CREDIT, SHIPYARD, START, TRADE, boatsOn, cellOf, coastTerrain, setup } from "./testHarbor.ts";

describe("배", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });
  afterEach(() => vi.useRealTimers());

  it("배는 물 칸에만 서고 물 길로 가며, 걷는 유닛은 물에 들어가지 못한다", async () => {
    const { map } = setup();
    expect(map.addBoat({ id: 1, ownerId: 7, speed: START_BOATS.speed, cellX: 100, cellY: 50 })).toBe(false);
    expect(map.addBoat({ id: 1, ownerId: 7, speed: START_BOATS.speed, cellX: 140, cellY: 50 })).toBe(true);
    expect(map.unitInfo(1)?.kind).toBe(UNIT_KIND_BOAT);
    expect(map.unitInfo(1)?.domain).toBe("sea");
    const sail = await map.moveUnit(1, anchorCenter(200, 220, 2));
    expect(sail.ok).toBe(true);
    const motion = map.unitInfo(1)?.motion;
    if (!motion) throw new Error("no boat");
    for (let t = START; t <= arrivalAt(motion); t += 2_000)
      expect(cellOf(positionAt(motion, t), 2).x).toBeGreaterThanOrEqual(128);
    expect(await map.moveUnit(1, anchorCenter(20, 20, 2))).toEqual({ ok: false, code: "goal_blocked" });
    expect(
      map.addUnit({ id: 2, size: 1, speed: 437, cellX: 120, cellY: 50, ownerId: 7, kind: UNIT_KIND_HUMAN }),
    ).toBe(true);
    expect(await map.moveUnit(2, anchorCenter(160, 50, 1))).toEqual({ ok: false, code: "goal_blocked" });
  });

  it("가까우면 바로 타고, 배를 따라가며, 물가에서 내린다. 자리 수는 배 종류(작은 배 2)", async () => {
    const { map, service } = setup();
    map.addBoat({ id: 1, ownerId: 7, speed: START_BOATS.speed, cellX: 129, cellY: 50 });
    map.addUnit({ id: 2, size: 1, speed: 437, cellX: 126, cellY: 50, ownerId: 7, kind: UNIT_KIND_HUMAN });
    expect(await service.board("stranger", 2, 1, false)).toEqual({ ok: false, code: "forbidden" });
    expect(await service.board("player", 2, 1, false)).toEqual({ ok: true });
    expect(map.passengers(1)).toEqual([2]);
    expect(await service.board("player", 2, 1, false)).toEqual({ ok: false, code: "already_aboard" });
    // 상태가 없던 배는 처음 볼 때 그 세계 처음 종류(작은 배, 자리 2)·가득
    expect(service.info(1)).toMatchObject({ typeId: "rowboat", capacity: 2, hullPm: 1000, homeId: null });
    for (const id of [3, 4]) {
      map.addUnit({ id, size: 1, speed: 437, cellX: 126, cellY: 51, ownerId: 7, kind: UNIT_KIND_HUMAN });
    }
    expect(await service.board("player", 3, 1, false)).toEqual({ ok: true });
    expect(await service.board("player", 4, 1, false)).toEqual({ ok: false, code: "boat_full" });
    expect((await map.moveUnit(1, anchorCenter(180, 120, 2))).ok).toBe(true);
    vi.setSystemTime(START + 600_000);
    expect(service.leave("player", 1, false)).toEqual({ ok: false, code: "no_shore" });
    expect((await map.moveUnit(1, anchorCenter(129, 60, 2))).ok).toBe(true);
    vi.setSystemTime(START + 1_200_000);
    expect(service.leave("player", 1, false)).toEqual({ ok: true });
    expect(map.unitInfo(2)?.aboard).toBeUndefined();
    expect(service.leave("player", 1, false)).toEqual({ ok: false, code: "empty" });
  });

  it("저장한 줄로 다시 켜면 승객이 배에 다시 붙는다(배가 없으면 내려서 땅에 선다)", () => {
    const rows = new Map<number, UnitRow>();
    const make = (): SecondMap => {
      const holder: { map?: SecondMap } = {};
      const paths = createInlinePathService(
        () => (holder.map ? [holder.map.replicaInit()] : []),
        () => performance.now(),
      );
      const map = createSecondMap({
        mapKey: 9,
        terrain: mapTerrainFromTemp(9, coastTerrain()),
        paths,
        now: () => Date.now(),
        stats: emptyWorldStats(),
        log: silentLog,
        persist: {
          saveUnit: (row) => rows.set(row.id, row),
          saveBuilding: () => {},
          removeBuilding: () => {},
        },
      });
      holder.map = map;
      paths.start();
      return map;
    };
    const first = make();
    first.addBoat({ id: 1, ownerId: 7, speed: START_BOATS.speed, cellX: 129, cellY: 50 });
    first.addUnit({ id: 2, size: 1, speed: 437, cellX: 126, cellY: 50, ownerId: 7, kind: UNIT_KIND_HUMAN });
    expect(first.board(2, 1)).toBe(true);
    const second = make();
    second.restore([...rows.values()], []);
    expect(second.passengers(1)).toEqual([2]);
    const third = make();
    third.restore([rows.get(2)!], []);
    expect(third.unitInfo(2)?.aboard).toBeUndefined();
    expect(cellOf(positionAt(third.unitInfo(2)!.motion, Date.now())).x).toBeLessThan(128);
  });

  it("조선소에서 배 종류를 골라 만든다(재료·시간 = 종류 표), 도크 1척, 정박 자리 없이도 만든다(1484·1485), 다 된 배는 도크에 든다(D-559 1523)", async () => {
    const { map, service, place, grant, saved } = setup();
    map.addUnit({ id: 2, size: 1, speed: 437, cellX: 120, cellY: 30, ownerId: 7, kind: UNIT_KIND_HUMAN });
    const berth = place(BERTH, 70);
    // 옛 부두(= 정박장)에서는 만들지 않는다
    expect(service.build("player", berth, false)).toEqual({ ok: false, code: "not_shipyard" });
    const yard = place(SHIPYARD, 40);
    expect(service.build("stranger", yard, false)).toEqual({ ok: false, code: "forbidden" });
    expect(service.build("player", yard, false, "submarine")).toEqual({
      ok: false,
      code: "unknown_boat_type",
    });
    expect(service.build("player", yard, false)).toEqual({ ok: false, code: "insufficient_materials" });
    grant(7, "item:pine_log", 10n, cargoLocation(2));
    // 작은 배: 10분 × 1000‰
    expect(service.build("player", yard, false, "rowboat")).toEqual({ ok: true, readyAtMs: START + 600_000 });
    expect(saved.has("boatJobs:1")).toBe(true);
    // 도크 하나 — 짐배는 기다린다
    expect(service.build("admin", yard, true, "cargo_boat")).toEqual({
      ok: false,
      code: "dock_busy",
      readyAtMs: START + 600_000,
    });
    expect(service.dockJob(yard)).toMatchObject({
      role: "shipyard",
      capacity: 1,
      used: 1,
      readyAtMs: START + 600_000,
    });
    await vi.advanceTimersByTimeAsync(600_000);
    // 다 된 배는 2차맵에 뜨지 않고 도크에 든다 — 꺼낼 때까지 도크를 쓴다
    expect(boatsOn(map)).toEqual([]);
    const docked = service.dockJob(yard)?.docked ?? [];
    expect(docked).toMatchObject([{ typeId: "rowboat", hullPm: 1000, repairUntil: null, storageDue: "0" }]);
    const boatId = docked[0]?.boatId;
    expect(service.dockJob(yard)?.used).toBe(1);
    expect(service.build("admin", yard, true, "cargo_boat")).toMatchObject({ ok: false, code: "dock_busy" });
    expect(service.release("other", boatId!, false)).toEqual({ ok: false, code: "forbidden" });
    expect(service.release("player", boatId!, false)).toEqual({ ok: true, boatId });
    expect(boatsOn(map)).toEqual([boatId]);
    expect(service.release("player", boatId!, false)).toEqual({ ok: false, code: "not_docked" });
    expect(service.info(boatId!)).toMatchObject({
      typeId: "rowboat",
      capacity: 2,
      hullPm: 1000,
      homeId: null,
    });
    expect(saved.has(`boatStates:${String(boatId)}`)).toBe(true);
    // 짐배(운영자, 1/100 시간): 빠르기 500‰
    const cargo = service.build("admin", yard, true, "cargo_boat");
    expect(cargo).toEqual({ ok: true, readyAtMs: Date.now() + 12_000 });
    await vi.advanceTimersByTimeAsync(12_000);
    const cargoId = service.dockJob(yard)?.docked[0]?.boatId;
    expect(service.release("admin", cargoId!, true)).toEqual({ ok: true, boatId: cargoId });
    expect(service.speedPm(cargoId!)).toBe(500);
  });

  it("조선소 모듈: 레벨 2부터 레벨마다 하나 더, 도크 늘림·건조 특화(1483·D-559 1521)", () => {
    const { service, place } = setup();
    const yard = place(SHIPYARD, 40);
    expect(service.policy("player", yard, { module: "docks" }, false)).toEqual({
      ok: false,
      code: "module_locked",
    });
    const yard3 = place(SHIPYARD, 80, 7, 3);
    expect(service.policy("other", yard3, { module: "docks" }, false)).toEqual({
      ok: false,
      code: "forbidden",
    });
    // 조선소도 받기 범위를 둔다(남의 배 수리, D-559 1522)
    expect(service.policy("player", yard3, { access: "owner" }, false)).toEqual({ ok: true });
    expect(service.policy("player", yard3, { module: "docks" }, false)).toEqual({ ok: true });
    expect(service.dockJob(yard3)?.capacity).toBe(1 + START_BOATS.shipyardDockModule);
    // 레벨 3 = 자리 둘: 도크 늘림 둘은 겹치고, 건조 특화 둘은 막는다
    expect(service.policy("player", yard3, { modules: ["docks", "docks"] }, false)).toEqual({ ok: true });
    expect(service.dockJob(yard3)).toMatchObject({
      capacity: 3,
      moduleSlots: 2,
      modules: ["docks", "docks"],
    });
    expect(service.policy("player", yard3, { modules: ["build", "build"] }, false)).toEqual({
      ok: false,
      code: "invalid_policy",
    });
    expect(service.policy("player", yard3, { modules: ["docks", "docks", "build"] }, false)).toEqual({
      ok: false,
      code: "invalid_policy",
    });
    // 옛 판 기기의 module 하나 = 첫 자리
    expect(service.policy("player", yard3, { module: "build" }, false)).toEqual({ ok: true });
    expect(service.dockJob(yard3)).toMatchObject({ capacity: 2, modules: ["build", "docks"] });
    expect(service.dockJob(yard3)?.types[0]?.buildMs).toBe(
      (600_000 * START_BOATS.shipyardBuildSpecPm) / 1000,
    );
  });

  it("정박장: 자리를 잡고 배가 그리로 간다, 정박 중이면 덜 닳고 집이 없으면 더 빨리 닳는다(1485·1487·1496)", async () => {
    const { map, service, place } = setup();
    map.addBoat({ id: 1, ownerId: 7, speed: START_BOATS.speed, cellX: 160, cellY: 150 });
    map.addBoat({ id: 2, ownerId: 7, speed: START_BOATS.speed, cellX: 162, cellY: 150 });
    map.addBoat({ id: 3, ownerId: 7, speed: START_BOATS.speed, cellX: 164, cellY: 150 });
    const berth = place(BERTH, 40);
    const yard = place(SHIPYARD, 80);
    expect(await service.berth("player", 1, yard, false)).toEqual({ ok: false, code: "not_berth" });
    expect(await service.berth("other", 1, berth, false)).toEqual({ ok: false, code: "forbidden" });
    expect(await service.berth("player", 1, berth, false)).toEqual({ ok: true, walking: true });
    expect(await service.berth("player", 2, berth, false)).toEqual({ ok: true, walking: true });
    // 레벨 1 = 자리 2
    expect(await service.berth("player", 3, berth, false)).toEqual({ ok: false, code: "no_berth" });
    expect(service.dockJob(berth)).toMatchObject({ role: "berth", capacity: 2, used: 2 });
    await vi.advanceTimersByTimeAsync(300_000);
    const home = service.dockJob(berth);
    expect(home?.boats.map((row) => row.boatId)).toEqual([1, 2]);
    // 열흘: 정박 중(1·2) = 2‰/일, 집 없음(3) = 10‰ × 4/일
    vi.setSystemTime(Date.now() + 10 * DAY_MS);
    await service.tick();
    // 가는 동안(밖)의 닳음이 조금 더해진다
    expect(service.info(1)?.hullPm).toBeGreaterThanOrEqual(1000 - 10 * START_BOATS.wearBerthedPd - 1);
    expect(service.info(1)?.hullPm).toBeLessThanOrEqual(1000 - 10 * START_BOATS.wearBerthedPd);
    const homeless = 1000 - 10 * START_BOATS.wearAwayPd * START_BOATS.wearHomelessMul;
    expect(service.info(3)?.hullPm).toBeGreaterThanOrEqual(homeless - 1);
    expect(service.info(3)?.hullPm).toBeLessThanOrEqual(homeless);
    // 집 비우기
    expect(await service.berth("player", 2, null, false)).toEqual({ ok: true });
    expect(service.info(2)?.homeId).toBeNull();
  });

  it("남의 배: 받기 범위·정박료는 정박장 금고로·체납이면 집을 잃는다(1490·1491·1486, D-548)", async () => {
    const { map, service, place, grant, ledger } = setup();
    const berth = place(BERTH, 40);
    map.addBoat({ id: 1, ownerId: 8, speed: START_BOATS.speed, cellX: 130, cellY: 41 });
    map.addBoat({ id: 2, ownerId: 9, speed: START_BOATS.speed, cellX: 132, cellY: 41 });
    // 다른 나라(9 → 나라 2)는 처음 값 nation에서 막힌다
    expect(await service.berth("p9", 2, berth, false)).toEqual({ ok: false, code: "berth_denied" });
    expect(service.policy("player", berth, { access: "owner" }, false)).toEqual({ ok: true });
    expect(await service.berth("other", 1, berth, false)).toEqual({ ok: false, code: "berth_denied" });
    expect(service.policy("player", berth, { access: "nation", fee: 25 }, false)).toEqual({ ok: true });
    expect(await service.berth("other", 1, berth, false)).toEqual({ ok: true });
    grant(8, CREDIT, 60n);
    // 이틀: 50을 정박장 금고(주인 7 · 건물 위치)에 낸다 — 주인 지갑이 아니다
    vi.setSystemTime(START + 2 * DAY_MS);
    await service.tick();
    expect(ledger.balanceOf(7, CREDIT, buildingLocation(berth))).toBe(50n);
    expect(ledger.balanceOf(7, CREDIT)).toBe(0n);
    expect(ledger.balanceOf(8, CREDIT)).toBe(10n);
    expect(service.dockJob(berth)?.cash).toBe("50");
    // 사흘 더: 10만 내고 못 낸 날이 3에 닿아 집을 잃는다
    vi.setSystemTime(START + 5 * DAY_MS);
    await service.tick();
    expect(ledger.balanceOf(7, CREDIT, buildingLocation(berth))).toBe(60n);
    expect(service.info(1)?.homeId).toBeNull();
  });

  it("교역 부두: 시간을 사면 부두 금고에 내고, 산 시간을 넘기면 초과 시간마다 높은 요금(1488·1489)", async () => {
    const { map, service, place, grant, ledger } = setup();
    const dock = place(TRADE, 40);
    map.addBoat({ id: 1, ownerId: 8, speed: START_BOATS.speed, cellX: 129, cellY: 41 });
    expect(await service.dockTime("other", 1, dock, 2, false)).toEqual({
      ok: false,
      code: "insufficient_funds",
    });
    grant(8, CREDIT, 100n);
    expect(await service.dockTime("other", 1, dock, 99, false)).toEqual({
      ok: false,
      code: "invalid_policy",
    });
    expect(await service.dockTime("other", 1, dock, 2, false)).toEqual({ ok: true });
    const paid = BigInt(START_BOATS.tradeFeePerHour * 2);
    expect(ledger.balanceOf(7, CREDIT, buildingLocation(dock))).toBe(paid);
    expect(service.dockJob(dock)).toMatchObject({ role: "trade_dock", capacity: 4, used: 1 });
    // 3시간 뒤까지 머묾 → 초과 1시간 × 요금 × 배율
    vi.setSystemTime(START + 3 * HOUR_MS);
    await service.tick();
    const over = BigInt(START_BOATS.tradeFeePerHour * START_BOATS.tradeOverstayMul);
    expect(ledger.balanceOf(7, CREDIT, buildingLocation(dock))).toBe(paid + over);
    // 떠나면 머묾이 끝난다
    expect((await map.moveUnit(1, anchorCenter(200, 200, 2))).ok).toBe(true);
    vi.setSystemTime(START + 6 * HOUR_MS);
    await service.tick();
    expect(service.info(1)?.tradeUntil).toBeNull();
  });

  it("수리: 조선소 둘레로 가서 도크에서 고친다, 가득이면 hull_full, 내구도 0이면 아주 느리다(1494·1495), 고친 배는 도크에 남는다(D-559 1523)", async () => {
    const { map, service, place, grant, errors } = setup();
    map.addUnit({ id: 2, size: 1, speed: 437, cellX: 120, cellY: 30, ownerId: 7, kind: UNIT_KIND_HUMAN });
    const yard = place(SHIPYARD, 40);
    map.addBoat({ id: 1, ownerId: 7, speed: START_BOATS.speed, cellX: 200, cellY: 200 });
    expect(await service.repair("player", 1, yard, false)).toEqual({ ok: false, code: "hull_full" });
    // 집 없이 바다에서 한 달 → 0
    vi.setSystemTime(START + 40 * DAY_MS);
    await service.tick();
    expect(service.info(1)?.hullPm).toBe(0);
    expect(service.speedPm(1)).toBe(START_BOATS.brokenSpeedPm);
    expect(await service.repair("player", 1, yard, false)).toEqual({
      ok: false,
      code: "insufficient_materials",
    });
    grant(7, "item:pine_log", 100n, cargoLocation(2));
    expect(await service.repair("player", 1, yard, false)).toEqual({ ok: true, walking: true });
    // 조선소 옆으로 간 뒤 수리가 시작되고(잃은 몫 × 만드는 시간 × 300‰ = 3분) 끝나면 가득 — 배는 도크에 남는다(2차맵에 없다)
    await vi.advanceTimersByTimeAsync(HOUR_MS);
    expect(errors).toEqual([]);
    expect(service.dockJob(yard)?.jobs).toEqual([]);
    expect(map.unitInfo(1)).toBeUndefined();
    expect(service.dockJob(yard)?.docked).toMatchObject([{ boatId: 1, hullPm: 1000, repairUntil: null }]);
    expect(service.release("player", 1, false)).toEqual({ ok: true, boatId: 1 });
    expect(service.info(1)?.hullPm).toBe(HULL_FULL / 1000);
  });

  it("운행 정지: 내구도가 기준 아래면 새 배·임시 정박·작업을 받지 않는다, 폐허면 집을 잃는다(1500)", async () => {
    const { map, service, place, facilities } = setup();
    const berth = place(BERTH, 40);
    const yard = place(SHIPYARD, 80);
    map.addBoat({ id: 1, ownerId: 7, speed: START_BOATS.speed, cellX: 129, cellY: 41 });
    expect(await service.berth("player", 1, berth, false)).toEqual({ ok: true });
    // D-559 1527: 기준 30%
    facilities.get(berth)!.conditionPpm = 200_000;
    facilities.get(yard)!.conditionPpm = 200_000;
    map.addBoat({ id: 2, ownerId: 7, speed: START_BOATS.speed, cellX: 131, cellY: 41 });
    expect(await service.berth("player", 2, berth, false)).toEqual({ ok: false, code: "harbor_closed" });
    expect(service.build("admin", yard, true)).toEqual({ ok: false, code: "harbor_closed" });
    expect(service.dockJob(berth)?.closed).toBe(true);
    // 이미 든 배는 그대로
    await service.tick();
    expect(service.info(1)?.homeId).toBe(berth);
    facilities.get(berth)!.conditionPpm = 0;
    await service.tick();
    expect(service.info(1)?.homeId).toBeNull();
  });

  it("작업 줄을 다시 켜면 이어지고, 조선소가 없어졌으면 버린다(재료는 돌려주지 않음)", async () => {
    const made = setup();
    const yard = made.place(SHIPYARD, 40);
    const job: BoatJob = {
      id: 7,
      ownerId: 7,
      buildingId: yard,
      materials: [],
      startedAtMs: START,
      doneAtMs: START + 30_000,
      kind: "build",
      typeId: "cargo_boat",
      boatId: null,
    };
    const gone: BoatJob = { ...job, id: 8, buildingId: 999 };
    const again = createBoatService({
      maps: made.maps,
      now: () => Date.now(),
      log: { error: () => {} },
      ledger: made.ledger,
      rules: () => START_BOATS,
      nextUnitId: () => 900,
      ownerOf: () => 7,
      places: () => undefined,
      works: () => true,
      unitBusy: () => false,
      jobs: [job, gone],
      manual: true,
    });
    expect(again.building).toBe(2);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(again.building).toBe(0);
    // 다 된 배는 도크에 들고(D-559 1523) 꺼내면 뜬다
    expect(made.map.unitInfo(900)).toBeUndefined();
    expect(again.release("admin", 900, true)).toEqual({ ok: true, boatId: 900 });
    expect(made.map.unitInfo(900)?.kind).toBe(UNIT_KIND_BOAT);
    again.stop();
    made.service.stop();
  });
});
