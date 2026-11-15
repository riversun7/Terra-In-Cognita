// 옛 배·부두 지우기 DB 통합 시험(기획 D-547 1499 "배·부두만 지움", purge.ts) — TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
// 띄운 2차맵: 배의 승객을 먼저 땅에 내리고 배를 지운다, 옛 부두는 건물 창고 물건을 도시 창고로·화폐를 주인 지갑으로 돌려놓고 건물을 지운다.
// 띄우지 않은 2차맵의 배 유닛 줄·작업 줄·배 상태·시설 설정을 지운다. 표지·감사 기록이 남고, 두 번째 부르면 아무것도 하지 않는다(멱등).
import { buildingLocation, cityLocation } from "@terra/shared/goodsPlaces";
import { START_BOATS, SURFACE_WATER, anchorAt, createLedgerBook, positionAt } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PlaceWorld } from "../facilities/places.ts";
import type { FacilityRecord } from "../facilities/state.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { createTestMap, flatTerrain } from "../world/testSupport.ts";
import { UNIT_KIND_BOAT, UNIT_KIND_HUMAN } from "../world/unitKinds.ts";
import { LEGACY_DOCK_ID, purgeLegacyBoats } from "./purge.ts";

const T0 = 1_800_000_000_000;
const PLANET = "s2_test_planet";
const CREDIT = "s3_test_credit";
let test: TestDatabase;

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  await test.drop();
});

function coastTerrain() {
  const terrain = flatTerrain();
  for (let ty = 0; ty < 128; ty++)
    for (let tx = 64; tx < 128; tx++) terrain.surface[ty * 128 + tx] = SURFACE_WATER;
  return terrain;
}

describe.skipIf(!TEST_DATABASE_URL)("옛 배·부두 지우기(D-547 1499)", () => {
  it("승객을 땅에 내리고 배·부두·작업을 지운 뒤 표지·감사 기록을 남긴다, 다시 부르면 그대로", async () => {
    const pool = test.db.$client;
    // 띄우지 않은 2차맵에 남은 배 유닛 줄(가짜 사용자 주체)
    const user = await rows<{ id: string }>(
      test.db,
      `insert into users (name, email, username) values ('Fake_boat', 'fake-boat@id.placeholder.invalid', 'fake_boat') returning id`,
    );
    await pool.query(`insert into world_owners (id, user_id, settled_at_ms) values (7, $1, $2)`, [
      user[0]?.id,
      T0,
    ]);
    await pool.query(
      `insert into world_units (id, owner_id, kind, size, speed, map_key, planet_id, domain, path, depart_at_ms)
       values (800, 7, $1, 2, 1536, 99, $2, 'sea', '{1000,1000,1000,1000}', $3)`,
      [UNIT_KIND_BOAT, PLANET, T0],
    );
    await pool.query(
      `insert into boat_jobs (id, owner_id, building_id, planet_id, materials, started_at_ms, done_at_ms)
       values (1, 7, 12345, $1, '[{"item":"pine_log","qty":14}]', $2, $3)`,
      [PLANET, T0, T0 + 60_000],
    );
    await pool.query(
      `insert into boat_states (boat_id, planet_id, type_id, hull_ppm, hull_at_ms) values (800, $1, 'rowboat', 1000000, $2)`,
      [PLANET, T0],
    );
    // 띄운 2차맵: 배 + 승객, 옛 부두(건물 창고에 물건·화폐)
    const { map } = createTestMap({ terrain: coastTerrain() });
    const maps = new Map([[map.mapKey, map]]);
    expect(map.addBoat({ id: 1, ownerId: 7, speed: START_BOATS.speed, cellX: 129, cellY: 50 })).toBe(true);
    map.addUnit({ id: 2, size: 1, speed: 437, cellX: 126, cellY: 50, ownerId: 7, kind: UNIT_KIND_HUMAN });
    expect(map.board(2, 1)).toBe(true);
    const placed = map.placeBuilding({ x: 125, y: 40, width: 3, height: 3, rotation: 0 }, 7);
    if (!placed.ok || placed.buildingId === undefined) throw new Error("dock not placed");
    const dockId = placed.buildingId;
    const facilities = new Map<number, FacilityRecord>([
      [
        dockId,
        {
          buildingId: dockId,
          facilityId: LEGACY_DOCK_ID,
          level: 2,
          conditionPpm: 1_000_000,
          conditionAtMs: T0,
          builtAtMs: T0,
          builtBy: "player",
          cityId: 3,
        },
      ],
    ]);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 시험: 시설 줄만 쓰는 가짜 자리 세계
    const places = { maps, facilities, catalog: () => ({}), cities: () => [] } as unknown as PlaceWorld;
    let accountId = 0;
    let txId = 0;
    const ledger = createLedgerBook({ nextAccountId: () => ++accountId, nextTxId: () => ++txId });
    for (const [asset, qty] of [
      ["item:pine_log", 5n],
      [CREDIT, 40n],
    ] as const)
      ledger.post({
        kind: "test_grant",
        atMs: T0,
        entries: [
          { account: ledger.systemAccount(`issue:${asset}`, asset), amount: -qty },
          { account: ledger.ownerAccount(7, asset, buildingLocation(dockId)), amount: qty },
        ],
      });
    const logged: string[] = [];
    const deps = {
      pool,
      planetId: PLANET,
      maps,
      places,
      ledger,
      now: () => T0,
      durable: () => Promise.resolve(),
      log: { info: (_obj: object, message: string) => logged.push(message) },
    };
    const report = await purgeLegacyBoats(deps);
    expect(report).toMatchObject({
      boats: [{ boatId: 1, ownerId: 7, mapKey: map.mapKey }],
      unloadedBoats: 1,
      landed: 1,
      relocated: 0,
      jobs: [{ id: 1, ownerId: 7 }],
      docks: [{ buildingId: dockId, ownerId: 7, level: 2, cityId: 3, rehomed: 2 }],
      unloadedDocks: [],
    });
    // 승객은 땅에(바다는 배치 칸 x ≥ 128)
    const rider = map.unitInfo(2);
    expect(rider?.aboard).toBeUndefined();
    expect(anchorAt(positionAt(rider!.motion, T0), 1).x).toBeLessThan(128);
    expect(map.unitInfo(1)).toBeUndefined();
    expect(map.buildingOwner(dockId)).toBeUndefined();
    // 물건은 도시 창고, 화폐는 주인 지갑(D-548 사업장 금고 → 주인)
    expect(ledger.balanceOf(7, "item:pine_log", cityLocation(3))).toBe(5n);
    expect(ledger.balanceOf(7, CREDIT)).toBe(40n);
    expect(ledger.balanceOf(7, CREDIT, buildingLocation(dockId))).toBe(0n);
    // 표들
    expect(await rows(test.db, `select id from world_units where kind = $1`, [UNIT_KIND_BOAT])).toEqual([]);
    expect(await rows(test.db, `select id from boat_jobs`)).toEqual([]);
    expect(await rows(test.db, `select boat_id from boat_states`)).toEqual([]);
    const marker = await rows<{ planet_id: string }>(test.db, `select planet_id from boat_resets`);
    expect(marker.map((row) => row.planet_id)).toEqual([PLANET]);
    const audit = await rows<{ action: string }>(
      test.db,
      `select action from audit_log where action = 'world.boat_reset'`,
    );
    expect(audit).toHaveLength(1);
    expect(logged).toContain("boat reset: legacy boats and docks removed (D-547 1499)");
    // 두 번째: 아무것도 하지 않는다(새 배는 그대로)
    expect(map.addBoat({ id: 3, ownerId: 7, speed: START_BOATS.speed, cellX: 140, cellY: 50 })).toBe(true);
    expect(await purgeLegacyBoats(deps)).toBeUndefined();
    expect(map.unitInfo(3)?.kind).toBe(UNIT_KIND_BOAT);
    expect(
      await rows(test.db, `select action from audit_log where action = 'world.boat_reset'`),
    ).toHaveLength(1);
  });
});
