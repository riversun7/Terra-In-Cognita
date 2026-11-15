// 실제 유닛 읽기 DB 통합 시험 — TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
// 휴먼을 가진 사용자의 유닛(직무·피로는 정산 뒤 값 — 임금형 계약으로 일하는 유닛), 화물(위치 = −유닛 ID), 잡힌 유닛·내가 잡은 포로를 본다.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { cargoLocation } from "../world/battleResults.ts";
import { ASSET_CREDIT, ASSET_ORE } from "../world/settlement.ts";
import { addTestUnits, silentLog } from "../world/testSupport.ts";
import { HEALTHY } from "../world/unitCondition.ts";
import { type World, startWorld } from "../world/world.ts";
import { createWorldRosterSource } from "./worldUnits.ts";

const T0 = 1_800_000_000_000;
const MINUTE = 60_000;

let test: TestDatabase;
let clock = T0;
const worlds: World[] = [];

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
  clock = T0;
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  for (const world of worlds.splice(0)) await world.stop().catch(() => undefined);
  await test.drop();
});

async function boot(): Promise<World> {
  const world = startWorld({
    testBots: 0,
    paths: { kind: "inline" },
    now: () => clock,
    log: silentLog,
    pool: test.db.$client,
    writeIntervalMs: 10,
    onFatal: (error) => {
      throw error;
    },
  });
  worlds.push(world);
  await world.ready;
  return world;
}

async function fakeUser(name: string): Promise<string> {
  const found = await rows<{ id: string }>(
    test.db,
    `insert into users (name, email, username) values ($1, $2, $3) returning id`,
    [`Fake_${name}`, `fake-${name}@id.placeholder.invalid`, `fake_${name}`],
  );
  return String(found[0]?.id);
}

describe.skipIf(!TEST_DATABASE_URL)("실제 유닛 읽기", () => {
  it("유닛이 없는 사용자는 빈 목록, 일하는 휴먼은 정산 뒤 직무·피로·화물, 잡힌 유닛과 내가 잡은 포로를 나눈다", async () => {
    const world = await boot();
    const persistence = world.persistence;
    if (!persistence) throw new Error("no persistence");
    const source = createWorldRosterSource(world);
    const userA = await fakeUser("roster_a");
    const userB = await fakeUser("roster_b");
    expect(await source.read(userA, clock)).toEqual({ units: [], prisoners: [] });
    expect(await source.count(userA, clock)).toBe(0);

    const mapKey = [...world.maps.keys()][0] ?? 0;
    const [a1 = 0, a2 = 0] = addTestUnits(world, userA, mapKey, 2, clock);
    const [b1 = 0] = addTestUnits(world, userB, mapKey, 1, clock);
    const ownerA = persistence.settlement.ownerOfUser(userA, clock).id;
    const ownerB = persistence.settlement.ownerOfUser(userB, clock).id;
    // a1은 내 건물에서 임금형 계약으로 일한다(직무 = 채집)
    const placed = world.maps
      .get(mapKey)
      ?.placeBuilding({ x: 40, y: 40, width: 2, height: 2, rotation: 0 }, ownerA);
    if (!placed?.ok || placed.buildingId === undefined) throw new Error("no building");
    persistence.settlement.grantCredit(ownerA, 1_000n, clock);
    const hired = await persistence.labor.create(userA, {
      kind: "wage",
      buildingId: placed.buildingId,
      unitId: a1,
    });
    expect(hired.ok).toBe(true);
    // a1에 화물(광석) 7
    persistence.ledger.post({
      kind: "issue",
      atMs: clock,
      entries: [
        { account: persistence.ledger.systemAccount("test_issue_ore", ASSET_ORE), amount: -7n },
        { account: persistence.ledger.ownerAccount(ownerA, ASSET_ORE, cargoLocation(a1)), amount: 7n },
      ],
    });
    // a2는 B에게 잡혔고(경상, 30분 뒤 나음), B의 b1은 A가 잡았다
    const map = world.maps.get(mapKey);
    map?.setCondition(a2, { injury: 1, injuryUntilMs: clock + 30 * MINUTE, heldBy: ownerB });
    map?.setCondition(b1, { ...HEALTHY, heldBy: ownerA });

    clock += 5 * MINUTE;
    const roster = await source.read(userA, clock);
    expect(roster.units.map((unit) => unit.id)).toEqual([a1, a2]);
    const [first, second] = roster.units;
    expect(first).toMatchObject({
      type: "human",
      planetId: "s2_test_planet",
      mapKey,
      domain: "land",
      job: { kind: "test_gather", phase: "work" },
      captive: false,
      // 첫 임금(20)은 그 휴먼의 유닛 지갑(= 화물 자리, 사유재산 — D-097·D-564 1631)
      cargo: [
        { asset: ASSET_CREDIT, amount: "20" },
        { asset: ASSET_ORE, amount: "7" },
      ],
    });
    // 정산 뒤 값: 5분 일했으니 피로가 쌓였다
    expect(first?.fatigue).toBeGreaterThan(0);
    expect(second).toMatchObject({
      captive: true,
      injury: { stage: 1, untilMs: T0 + 30 * MINUTE },
      cargo: [],
    });
    expect(roster.prisoners.map((unit) => unit.id)).toEqual([b1]);
    expect(roster.prisoners[0]?.cargo).toEqual([]);
    expect(await source.count(userA, clock)).toBe(2);

    // 부상이 나을 시각이 지나면 없음
    clock = T0 + 31 * MINUTE;
    const later = await source.read(userA, clock);
    expect(later.units[1]?.injury).toEqual({ stage: 0, untilMs: null });
  });
});
