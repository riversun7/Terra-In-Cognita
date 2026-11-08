// 채집소 DB 통합 시험 — 사용자 지적(2026-11-08) "원자재채집소의 기능도 필요", docs/adr/2026-11-07-gather-objects.md "바뀜 (2026-11-08 …)".
// TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다. 가짜 시계로: 시험 2차맵(임시 지형)의 광맥 곁에 광산을 짓고 내 휴먼을 직무 배치 → 정산하면
// 광석이 도시 창고가 아니라 채집소 창고(그 건물 창고)에 쌓이고 반경 안 광맥 번수가 줄며, 채집소 판에 일꾼 상태·창고·버프가 보이고, 자동 옮김이
// 주인 몫을 그 도시 창고로 옮긴다. 원장 불변 조건은 그대로다.
import { buildingLocation, cityLocation } from "@terra/shared/goodsPlaces";
import { UPKEEP_PERIOD_MS, WALK_SPEED } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_FACILITY_SOURCE } from "../facilities/testFacilities.ts";
import { TEST_HOLDING_CONTENT } from "../holdings/testContent.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
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

    // 자동 옮김: 주인 몫이 도시 창고로
    const stored = stationOre();
    expect(current.station.haulNow(clock)).toBeGreaterThan(0);
    expect(stationOre()).toBe(0n);
    expect(cityOre()).toBe(cityBefore + stored);
    expect(await world.checkInvariants()).toEqual([]);
  });
});
