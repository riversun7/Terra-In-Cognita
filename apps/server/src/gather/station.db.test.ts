// 채집소 DB 통합 시험 — 사용자 지적(2026-11-08) "원자재채집소의 기능도 필요", docs/adr/2026-11-07-gather-objects.md "바뀜 (2026-11-08 …)".
// TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다. 가짜 시계로: 시험 2차맵(임시 지형)의 광맥 곁에 광산을 짓고 내 휴먼을 직무 배치 → 정산하면
// 광석이 도시 창고가 아니라 채집소 창고(그 건물 창고)에 쌓이고 반경 안 광맥 번수가 줄며, 채집소 판에 일꾼 상태·창고·버프가 보이고, 자동 옮김이
// 주인 몫을 그 도시 창고로 옮긴다. 농장(오브젝트 없음, 기획 정리 756 ②)도 직무 배치 산출이 채집소 창고로 가고 판에 수확·피로 버프(반경·다시 자람
// 없음)·자동 옮김이 보이며 자동 옮김이 도시 창고로 옮긴다. 원장 불변 조건은 그대로다.
import { TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import { buildingLocation, cityLocation } from "@terra/shared/goodsPlaces";
import { UPKEEP_PERIOD_MS, WALK_SPEED } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_FACILITY_SOURCE } from "../facilities/testFacilities.ts";
import { waterOk } from "../facilities/water.ts";
import { TEST_HOLDING_CONTENT } from "../holdings/testContent.ts";
import {
  TEST_DATABASE_URL,
  type TestDatabase,
  createTestDatabase,
  joinCityFaction,
  rows,
} from "../testDb.ts";
import { silentLog } from "../world/testSupport.ts";
import { UNIT_KIND_HUMAN } from "../world/unitKinds.ts";
import { type World, startWorld } from "../world/world.ts";
import type { GatherKind } from "./kinds.ts";
import { gatherReadsOf } from "./reads.ts";
import { type WorldGather, startWorldGather } from "./world.ts";

const HOUR = 3_600_000;
/** 정시 + 1ms에서 시작 */
const T0 = 1_800_000_000_000 - (1_800_000_000_000 % UPKEEP_PERIOD_MS) + 1;
const KINDS: GatherKind[] = [
  {
    id: "ore_vein",
    name: { ko: "광맥", en: "Ore vein" },
    source: "rock",
    arts: [],
    chancePm: 1000,
    art: 0,
    surfaces: [],
    minCells: 0,
    material: null,
    direct: true,
    item: "copper_ore",
    lots: 1,
    workMs: 10_000,
    uses: 5,
    regrowMs: 6 * HOUR,
    facility: "mine",
    primary: "str",
    secondary: "vit",
  },
];

let test: TestDatabase;
let clock = T0;
const running: { world: World; gather: WorldGather }[] = [];

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
  clock = T0;
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  for (const entry of running.splice(0)) {
    entry.gather.stop();
    await entry.world.stop().catch(() => undefined);
  }
  await test.drop();
});

async function boot(): Promise<{ world: World; gather: WorldGather }> {
  const world = startWorld({
    testBots: 0,
    testMaps: 1,
    paths: { kind: "inline" },
    now: () => clock,
    log: silentLog,
    pool: test.db.$client,
    writeIntervalMs: 10,
    onFatal: (error) => {
      throw error;
    },
    facilities: { content: () => TEST_FACILITY_SOURCE },
    holdings: { content: () => TEST_HOLDING_CONTENT },
    // 자동 옮김을 켠다(기본값은 끔 — 기획 D-555 1505. 이 시험은 켰을 때의 옮김을 본다)
    cyborgRules: () => ({
      ...TEST_SOCIETY_COEFFICIENTS,
      gatherObjects: { ...TEST_SOCIETY_COEFFICIENTS.gatherObjects, stationHaulMs: 600_000 },
    }),
  });
  await world.ready;
  const gather = startWorldGather(world, { kinds: () => KINDS, now: () => clock, log: silentLog });
  for (let i = 0; i < 300 && !gather.current(); i++) await new Promise((resolve) => setTimeout(resolve, 10));
  const entry = { world, gather };
  running.push(entry);
  return entry;
}

const oreAssets = TEST_HOLDING_CONTENT.items
  .filter((item) => item.subcategory?.id === "ore")
  .map((item) => `item:${item.id}`);
const assetsOf = (sub: string): string[] =>
  TEST_HOLDING_CONTENT.items.filter((item) => item.subcategory?.id === sub).map((item) => `item:${item.id}`);
const cropAssets = TEST_HOLDING_CONTENT.items
  .filter((item) => item.subcategory?.id === "crop")
  .map((item) => `item:${item.id}`);

describe.skipIf(!TEST_DATABASE_URL)("채집소(DB)", () => {
  it("광산 직무 배치: 채집소 창고에 쌓이고 반경 안 광맥을 쓰며, 판에 보이고, 자동 옮김이 도시 창고로", async () => {
    const { world, gather } = await boot();
    const current = gather.current();
    const p = world.persistence;
    const map = [...world.maps.values()][0];
    if (!current || !p || !map) throw new Error("gather is not ready");
    const objects = current.service.objects(map.mapKey) ?? [];
    const vein = objects[0];
    if (!vein) throw new Error("temp terrain has no rock block");
    const found = await rows<{ id: string }>(
      test.db,
      `insert into users (name, email, username) values ($1, $2, $3) returning id`,
      ["Fake_station", "fake-station@id.placeholder.invalid", "fake_station"],
    );
    const userId = String(found[0]?.id);
    const ownerId = p.settlement.ownerOfUser(userId, clock).id;
    // 땅 규칙(docs/adr/2026-11-14-second-map-build.md): 시험 세계 2차맵에는 NPC 도시가 있어 그 세력에 들어야 짓는다
    await joinCityFaction(test.db, userId, map.mapKey);
    p.settlement.grantCredit(ownerId, 100_000n, clock);
    const service = p.facilities.service;

    // 광맥 둘레에서 지을 수 있는 칸을 찾는다(재료는 그 칸의 도시 창고로 개발 받기)
    let mineId: number | undefined;
    for (let ring = 6; ring < 30 && mineId === undefined; ring += 3)
      for (const [dx, dy] of [
        [ring, ring],
        [-ring, ring],
        [ring, -ring],
        [-ring, -ring],
      ] as const) {
        if (mineId !== undefined) break;
        const x = vein.x + dx;
        const y = vein.y + dy;
        if (x < 0 || y < 0 || x > 250 || y > 250) continue;
        for (const [item, qty] of Object.entries({ pine_log: 20, stone: 20 }))
          await service.devFacilityGrant(userId, item, qty, { mapKey: map.mapKey, x, y });
        const built = await service.build(userId, {
          mapKey: map.mapKey,
          facility: "mine",
          x,
          y,
          rotation: 0,
        });
        if (built.ok && built.buildingId !== undefined) mineId = built.buildingId;
      }
    if (mineId === undefined) throw new Error("no place for the mine");
    clock += 6 * HOUR;
    service.finishDue(clock);
    expect(service.facilities.get(mineId)?.level).toBe(1);
    const cityId = service.facilities.get(mineId)?.cityId ?? null;
    expect(cityId).not.toBeNull();

    // 내 휴먼(같은 2차맵)을 광산에 직무 배치
    const unitId = p.nextId.unit();
    let placed = false;
    for (let ring = 1; ring < 12 && !placed; ring++)
      placed = map.addUnit({
        id: unitId,
        size: 1,
        speed: WALK_SPEED,
        cellX: vein.x + ring,
        cellY: vein.y - ring,
        ownerId,
        kind: UNIT_KIND_HUMAN,
      });
    expect(placed).toBe(true);
    expect(await p.labor.assign(userId, mineId, unitId)).toEqual({ ok: true });

    const site = current.station.site(mineId);
    if (!site) throw new Error("mine is not a station");
    expect(site.kind).toBe("objects");
    const before = current.station.objectsIn(site, clock).reduce((sum, entry) => sum + entry.usesLeft, 0);
    expect(before).toBeGreaterThan(0);
    const cityOre = (): bigint =>
      oreAssets.reduce(
        (sum, asset) => sum + p.ledger.balanceOf(ownerId, asset, cityLocation(cityId ?? 0)),
        0n,
      );
    const stationOre = (): bigint =>
      oreAssets.reduce(
        (sum, asset) => sum + p.ledger.balanceOf(ownerId, asset, buildingLocation(mineId)),
        0n,
      );
    const cityBefore = cityOre();

    // 2시간 정산: 광석은 채집소 창고로, 반경 안 번수가 준다
    clock += 2 * HOUR;
    p.settlement.settleOwner(ownerId, clock);
    expect(stationOre()).toBeGreaterThan(0n);
    expect(cityOre()).toBe(cityBefore);
    const after = current.station.objectsIn(site, clock).reduce((sum, entry) => sum + entry.usesLeft, 0);
    expect(after).toBeLessThan(before);
    expect(current.station.status(unitId)).toMatchObject({ buildingId: mineId });

    // 채집소 판
    const view = gatherReadsOf(() => gather.current()).station(
      { id: userId, loginId: "fake_station", roles: [] },
      mineId,
      clock,
    );
    expect(view).toMatchObject({
      status: "ok",
      kind: "objects",
      level: 1,
      mine: true,
      cityId,
      buffs: { radiusCells: 40, yieldPm: 1000, fatiguePm: 500, regrowPm: 500 },
      haul: { everyMs: 600_000 },
    });
    expect(view.objects?.usesLeft).toBe(after);
    expect(view.workers).toEqual([expect.objectContaining({ unitId, via: "assign", mine: true })]);
    expect(view.storage.goods.length).toBeGreaterThan(0);
    expect(view.upgrade?.level).toBe(2);

    // 자동 옮김: 주인 몫이 걸어 나르는 시간 뒤 도시 창고로(질문 1050 가 — 정시에 떠나고 닿을 때 넣는다)
    const stored = stationOre();
    current.station.haulNow(clock);
    const arrive = current.station.trip(mineId)?.arriveAtMs ?? clock;
    expect(arrive).toBeGreaterThan(clock);
    expect(current.station.haulNow(arrive)).toBeGreaterThan(0);
    expect(stationOre()).toBe(0n);
    expect(cityOre()).toBe(cityBefore + stored);
    expect(await world.checkInvariants()).toEqual([]);
  });

  it("농장 직무 배치(756 ②): 채집소 창고에 쌓이고 판에 수확·피로 버프·자동 옮김이 보이며, 자동 옮김이 도시 창고로", async () => {
    const { world, gather } = await boot();
    const current = gather.current();
    const p = world.persistence;
    const map = [...world.maps.values()][0];
    if (!current || !p || !map) throw new Error("gather is not ready");
    const found = await rows<{ id: string }>(
      test.db,
      `insert into users (name, email, username) values ($1, $2, $3) returning id`,
      ["Fake_farm_station", "fake-farm-station@id.placeholder.invalid", "fake_farm_station"],
    );
    const userId = String(found[0]?.id);
    const ownerId = p.settlement.ownerOfUser(userId, clock).id;
    // 땅 규칙(docs/adr/2026-11-14-second-map-build.md): 시험 세계 2차맵에는 NPC 도시가 있어 그 세력에 들어야 짓는다
    await joinCityFaction(test.db, userId, map.mapKey);
    p.settlement.grantCredit(ownerId, 100_000n, clock);
    const service = p.facilities.service;
    for (const [item, qty] of Object.entries({ pine_log: 20 }))
      expect(await service.devFacilityGrant(userId, item, qty, { mapKey: map.mapKey, x: 50, y: 50 })).toEqual(
        {
          ok: true,
        },
      );
    const built = await service.build(userId, {
      mapKey: map.mapKey,
      facility: "farm",
      x: 50,
      y: 50,
      rotation: 0,
    });
    if (!built.ok || built.buildingId === undefined)
      throw new Error(`build failed: ${JSON.stringify(built)}`);
    const farmId = built.buildingId;
    clock += 6 * HOUR;
    service.finishDue(clock);
    expect(service.facilities.get(farmId)?.level).toBe(1);
    const cityId = service.facilities.get(farmId)?.cityId ?? null;
    expect(cityId).not.toBeNull();

    const unitId = p.nextId.unit();
    expect(
      map.addUnit({
        id: unitId,
        size: 1,
        speed: WALK_SPEED,
        cellX: 30,
        cellY: 30,
        ownerId,
        kind: UNIT_KIND_HUMAN,
      }),
    ).toBe(true);
    expect(await p.labor.assign(userId, farmId, unitId)).toEqual({ ok: true });
    expect(current.station.site(farmId)?.kind).toBe("facility");

    const sum = (location: number): bigint =>
      cropAssets.reduce((total, asset) => total + p.ledger.balanceOf(ownerId, asset, location), 0n);
    const cityBefore = sum(cityLocation(cityId ?? 0));
    // 농장(선택 방식): 스탯 10·10 → 해금 T1, 필요 진행 60 = 1시간에 하나 → 90분 정산(직무 피로 상한 120 전이라 일하는 중)
    clock += 90 * 60_000;
    p.settlement.settleOwner(ownerId, clock);
    expect(sum(buildingLocation(farmId))).toBeGreaterThan(0n);
    expect(sum(cityLocation(cityId ?? 0))).toBe(cityBefore);
    expect(current.station.status(unitId)).toMatchObject({ buildingId: farmId, state: "working" });
    // 피로: 90주기 × 1점 − 레벨 1 피로 덜기 (1000 − 500)‰ = 45점
    expect(map.unitInfo(unitId)?.job.fatigue).toBe(45);

    const view = gatherReadsOf(() => gather.current()).station(
      { id: userId, loginId: "fake_farm_station", roles: [] },
      farmId,
      clock,
    );
    expect(view).toMatchObject({
      status: "ok",
      kind: "facility",
      mine: true,
      objects: null,
      buffs: { radiusCells: null, yieldPm: 1000, fatiguePm: 500, regrowPm: null },
      haul: { everyMs: 600_000 },
    });
    expect(view.haul.nextAtMs).not.toBeNull();
    expect(view.storage.capacityGrams).toBe("300000");
    expect(view.storage.goods.length).toBeGreaterThan(0);
    expect(view.workers).toEqual([
      expect.objectContaining({ unitId, via: "assign", state: "working", fatigue: 45 }),
    ]);
    expect(view.upgrade?.buffs).toMatchObject({ radiusCells: null, yieldPm: 1200, regrowPm: null });

    const stored = sum(buildingLocation(farmId));
    current.station.haulNow(clock);
    const arrive = current.station.trip(farmId)?.arriveAtMs ?? clock;
    expect(current.station.haulNow(arrive)).toBeGreaterThan(0);
    expect(sum(buildingLocation(farmId))).toBe(0n);
    expect(sum(cityLocation(cityId ?? 0))).toBe(cityBefore + stored);
    expect(await world.checkInvariants()).toEqual([]);
  });

  it("목장·낚시터 직무 배치(1차 생산 여섯 가지): 농장처럼 시설 안 생산 — 그 사다리 물건이 채집소 창고에 쌓인다", async () => {
    const { world, gather } = await boot();
    const current = gather.current();
    const p = world.persistence;
    const map = [...world.maps.values()][0];
    if (!current || !p || !map) throw new Error("gather is not ready");
    const found = await rows<{ id: string }>(
      test.db,
      `insert into users (name, email, username) values ($1, $2, $3) returning id`,
      ["Fake_six_station", "fake-six-station@id.placeholder.invalid", "fake_six_station"],
    );
    const userId = String(found[0]?.id);
    const ownerId = p.settlement.ownerOfUser(userId, clock).id;
    // 땅 규칙(docs/adr/2026-11-14-second-map-build.md): 시험 세계 2차맵에는 NPC 도시가 있어 그 세력에 들어야 짓는다
    await joinCityFaction(test.db, userId, map.mapKey);
    p.settlement.grantCredit(ownerId, 100_000n, clock);
    const service = p.facilities.service;
    for (const [item, qty] of Object.entries({ pine_log: 40, stone: 10 }))
      expect(await service.devFacilityGrant(userId, item, qty, { mapKey: map.mapKey, x: 50, y: 50 })).toEqual(
        { ok: true },
      );
    const buildAt = async (facility: string, x: number, y = 50): Promise<number> => {
      const built = await service.build(userId, { mapKey: map.mapKey, facility, x, y, rotation: 0 });
      if (!built.ok || built.buildingId === undefined)
        throw new Error(`build failed: ${facility} ${JSON.stringify(built)}`);
      return built.buildingId;
    };
    const ranchId = await buildAt("ranch", 50);
    // 낚시터는 물가에만(질문 947 나, 팩 needsWaterWithin 5): 놓을 수 있는 물가 자리를 찾아 그 자리 재료로 짓는다
    const fishing = p.facilities.catalog().facility("fishing_spot");
    if (!fishing) throw new Error("no fishing_spot");
    let dock: { x: number; y: number } | undefined;
    for (let y = 8; y < 248 && !dock; y += 3)
      for (let x = 8; x < 248 && !dock; x += 3)
        if (map.canPlace({ x, y, width: 3, height: 3, rotation: 0 }) && waterOk(map, fishing, x, y, 0))
          dock = { x, y };
    if (!dock) throw new Error("no water-side spot");
    for (const [item, qty] of Object.entries({ pine_log: 20, stone: 5 }))
      expect(await service.devFacilityGrant(userId, item, qty, { mapKey: map.mapKey, ...dock })).toEqual({
        ok: true,
      });
    const dockId = await buildAt("fishing_spot", dock.x, dock.y);
    clock += 12 * HOUR;
    service.finishDue(clock);
    expect(service.facilities.get(ranchId)?.level).toBe(1);
    expect(service.facilities.get(dockId)?.level).toBe(1);
    // 오브젝트가 맡지 않는 채집 시설 = 시설 안 생산(농장과 같은 채집소 종류)
    expect(current.station.site(ranchId)?.kind).toBe("facility");
    expect(current.station.site(dockId)?.kind).toBe("facility");

    const addHuman = (cellX: number): number => {
      const unitId = p.nextId.unit();
      expect(
        map.addUnit({
          id: unitId,
          size: 1,
          speed: WALK_SPEED,
          cellX,
          cellY: 30,
          ownerId,
          kind: UNIT_KIND_HUMAN,
        }),
      ).toBe(true);
      return unitId;
    };
    const rancher = addHuman(30);
    const fisher = addHuman(32);
    expect(await p.labor.assign(userId, ranchId, rancher)).toEqual({ ok: true });
    expect(await p.labor.assign(userId, dockId, fisher)).toEqual({ ok: true });

    const sum = (assets: string[], location: number): bigint =>
      assets.reduce((total, asset) => total + p.ledger.balanceOf(ownerId, asset, location), 0n);
    // 목장 사다리 = 축산물 + 목축 부산물(질문 946 나, core@63)
    const meat = [...assetsOf("livestock_product"), ...assetsOf("livestock_byproduct")];
    const fish = assetsOf("fish");
    expect(meat.length).toBeGreaterThan(0);
    expect(fish.length).toBeGreaterThan(0);
    // 90분 정산(직무 피로 상한 전): 목장은 선택 방식 — 스탯 10·10 → 해금 T1(필요 진행 60 = 1시간에 하나)
    clock += 90 * 60_000;
    p.settlement.settleOwner(ownerId, clock);
    expect(sum(meat, buildingLocation(ranchId))).toBeGreaterThan(0n);
    // 목장 창고에는 목장 사다리 물건만, 낚시터 창고에는 어류만(없을 수도 — 성공 350‰)
    expect(sum(fish, buildingLocation(ranchId))).toBe(0n);
    expect(sum(meat, buildingLocation(dockId))).toBe(0n);
    expect(current.station.status(rancher)).toMatchObject({ buildingId: ranchId, state: "working" });
    expect(current.station.status(fisher)).toMatchObject({ buildingId: dockId });

    const view = gatherReadsOf(() => gather.current()).station(
      { id: userId, loginId: "fake_six_station", roles: [] },
      dockId,
      clock,
    );
    expect(view).toMatchObject({ status: "ok", kind: "facility", mine: true, objects: null });
    expect(view.storage.capacityGrams).toBe("200000");
    expect(await world.checkInvariants()).toEqual([]);
  });
});
