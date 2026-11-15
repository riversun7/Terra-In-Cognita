// D-559 배 상태 DB 통합 시험 — TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
// 도크에 든 배(유닛 줄 없음 — yard_id·owner_id)·연료·오버히트·보직·모듈 묶음 열을 쓰고 읽는다. 부팅 정리는 도크 배를 남기고 유닛 줄 없는 다른 상태만 지운다.
// 유닛 ID 셈(부팅)은 도크 배의 ID도 넘는다(꺼낼 때 그 ID로 띄운다 — 다른 유닛과 겹치지 않게).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { loadWorld } from "../world/persist/load.ts";
import { createWorldWriter } from "../world/persist/writer.ts";
import { silentLog } from "../world/testSupport.ts";
import { UNIT_KIND_BOAT } from "../world/unitKinds.ts";
import { boatJobWriter, loadBoatFacilities, loadBoatStates, pruneBoatStates } from "./store.ts";
import { FRESH_BOAT_FIELDS } from "./store.ts";

const T0 = 1_800_000_000_000;
const PLANET = "s2_test_planet";
let test: TestDatabase;

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  await test.drop();
});

describe.skipIf(!TEST_DATABASE_URL)("배 상태 D-559 열", () => {
  it("도크 배·연료·오버히트·보직·모듈 묶음을 쓰고 읽고, 정리는 도크 배를 남기며, 유닛 ID 셈이 도크 배 ID를 넘는다", async () => {
    const pool = test.db.$client;
    const user = await rows<{ id: string }>(
      test.db,
      `insert into users (name, email, username) values ('Fake_dock', 'fake-dock@id.placeholder.invalid', 'fake_dock') returning id`,
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
    const writer = createWorldWriter({ pool, log: silentLog, onFatal: () => {}, intervalMs: 10 });
    const store = boatJobWriter(writer, PLANET);
    const base = {
      typeId: "rowboat",
      hullPpm: 1_000_000,
      hullAtMs: T0,
      homeId: null,
      feePaidToMs: null,
      arrears: 0,
      tradeId: null,
      tradeUntilMs: null,
      tradeChargedToMs: null,
      ...FRESH_BOAT_FIELDS,
      crew: {},
    };
    // 2차맵 배(오버히트·보직·연료), 도크 배(유닛 줄 없음), 버려진 상태(유닛 줄도 도크도 없음)
    store.saveState({
      ...base,
      boatId: 800,
      fuelMilli: 123_000,
      fuelAtMs: T0,
      overheat: true,
      crew: { 5: "deck" },
    });
    store.saveState({
      ...base,
      boatId: 9_000,
      ownerId: 7,
      yardId: 4_321,
      yardSinceMs: T0 + 5,
      yardMapKey: 99,
      yardX: 120,
      yardY: 40,
      fuelMilli: 600_000,
    });
    store.saveState({ ...base, boatId: 901 });
    store.saveFacility({
      buildingId: 4_321,
      access: "peace",
      fee: 75,
      module: "docks",
      modules: ["docks", "build"],
    });
    await writer.durable();
    expect(await pruneBoatStates(pool, PLANET)).toBe(1);
    const states = await loadBoatStates(pool, PLANET);
    expect(states.map((state) => state.boatId)).toEqual([800, 9_000]);
    expect(states[0]).toMatchObject({
      fuelMilli: 123_000,
      overheat: true,
      crew: { 5: "deck" },
      yardId: null,
    });
    expect(states[1]).toMatchObject({
      ownerId: 7,
      yardId: 4_321,
      yardSinceMs: T0 + 5,
      yardMapKey: 99,
      yardX: 120,
      yardY: 40,
      overheat: false,
    });
    expect(await loadBoatFacilities(pool, PLANET)).toEqual([
      { buildingId: 4_321, access: "peace", fee: 75, module: "docks", modules: ["docks", "build"] },
    ]);
    // 직전 판 줄(modules 없음)은 module 하나로 읽는다
    await pool.query(`update boat_facilities set modules = null, module = 'repair' where building_id = 4321`);
    expect((await loadBoatFacilities(pool, PLANET))[0]?.modules).toEqual(["repair"]);
    const world = await loadWorld(test.db.$client, T0);
    expect(world.maxIds.unit).toBe(9_000);
  });
});
