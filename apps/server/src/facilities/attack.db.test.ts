// 건물·영토 비콘 공격 DB 통합 시험(질문 381·410 ①, docs/adr/2026-11-07-buildings-runtime.md "바뀜 (전투·건물)") — TEST_DATABASE_URL이
// 있을 때만. 계정·수치는 시험용 가짜 값이다.
// 남의 시설을 넥서스로 연 공성 전투가 끝 시각에 결과와 같은 커밋으로 상태를 0(폐허 = 기능 정지, 칸 그대로)으로 만들고, 든 물건은 그대로
// 꺼낼 수 있으며(넣기는 막힘), 수리로 되돌린다. 다른 세력 비콘은 0이 되어도 지우지 않고 꼭짓점에서만 빠진다. 비콘 짓기·수리 재료는 그
// 세력의 가장 가까운 도시 창고 + 그 도시의 창고 시설에서만 꺼낸다(위치 없는 장부·화물은 쓰지 않는다).
import { CONDITION_FULL } from "@terra/shared/facilityRuntime";
import { TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import { buildingLocation, cargoLocation, cityLocation } from "@terra/shared/goodsPlaces";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_HOLDING_CONTENT } from "../holdings/testContent.ts";
import { testRosterCatalog } from "../roster/catalog.ts";
import {
  TEST_DATABASE_URL,
  type TestDatabase,
  createTestDatabase,
  joinCityFaction,
  rows,
} from "../testDb.ts";
import { targetsOf } from "../world/battleTargets.ts";
import { addTestUnits, silentLog } from "../world/testSupport.ts";
import { TEST_MAP_KEY, TEST_PLANET_ID, type World, startWorld } from "../world/world.ts";
import { facilityScreenSourceOf } from "./appSource.ts";
import { goodsAsset, grantGoods } from "./materials.ts";
import { TEST_FACILITY_SOURCE } from "./testFacilities.ts";

const T0 = 1_800_000_000_000;
/**
 * 시가지(D-146)는 D-568부터 1차맵 영토 원 ÷ 3(질문 1923 — 아래 끝 4칸이면 약 1.33칸으로 시험 2차맵 전체)이라, 이 시험은 영토 원을 작게
 * 둔다(원 = 배후지 × 0.1, 아래 끝 0.1칸 → 시가지는 도시 둘레 배치 칸 십여 칸): 시가지 안·밖 건물을 한 2차맵에서 함께 본다
 */
const SMALL_TERRITORY = {
  ...TEST_SOCIETY_COEFFICIENTS,
  territoryDisplay: { ...TEST_SOCIETY_COEFFICIENTS.territoryDisplay, radiusScalePm: 100, minCells: 0.1 },
};
let test: TestDatabase;
let clock = T0;
const worlds: World[] = [];
const roster = testRosterCatalog();

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
    facilities: { content: () => TEST_FACILITY_SOURCE },
    holdings: { content: () => TEST_HOLDING_CONTENT },
    roster: () => roster,
    territory: { beaconFacility: () => ({ enabled: true, materials: [{ item: "pine_log", qty: 3 }] }) },
    cyborgRules: () => SMALL_TERRITORY,
  });
  worlds.push(world);
  await world.ready;
  return world;
}

function persistence(world: World) {
  const found = world.persistence;
  if (!found) throw new Error("no persistence");
  return found;
}

async function fakeUser(name: string): Promise<string> {
  const found = await rows<{ id: string }>(
    test.db,
    `insert into users (name, email, username) values ($1, $2, $3) returning id`,
    [`Fake_${name}`, `fake-${name}@id.placeholder.invalid`, `fake_${name}`],
  );
  return String(found[0]?.id);
}

async function waitFor(check: () => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 300; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("timed out");
}

/** 전투를 끝 시각 뒤로 넘긴다: 끄고, 시계를 끝 뒤로, 다시 켜서 부팅 복구가 결과를 적용하기를 기다린다 */
async function finishBattle(world: World, doneAtMs: number): Promise<World> {
  await persistence(world).writer.durable();
  await world.stop();
  clock = doneAtMs + 1_000;
  const next = await boot();
  await waitFor(async () => {
    const found = await rows<{ n: string }>(
      test.db,
      `select count(*) as n from world_battles where status = 'running'`,
    );
    return Number(found[0]?.n) === 0;
  });
  await persistence(next).writer.durable();
  return next;
}

describe.skipIf(!TEST_DATABASE_URL)("건물·영토 비콘 공격(질문 381)", () => {
  it("남의 시설: 공성 전투 결과가 같은 커밋으로 상태를 깎아 0이면 폐허(칸 그대로·든 물건 꺼내기 됨), 수리로 되돌린다", async () => {
    let world = await boot();
    let p = persistence(world);
    const owner = await fakeUser("yard_owner");
    const ownerId = p.settlement.ownerOfUser(owner, clock).id;
    // 땅 규칙(docs/adr/2026-11-14-second-map-build.md): 주인만 시험 도시 세력에 든다(공격자는 세력 없음 — 남의 시설을 친다)
    await joinCityFaction(test.db, owner, TEST_MAP_KEY);
    const raider = await fakeUser("raider");
    const raiderId = p.settlement.ownerOfUser(raider, clock).id;
    const raiders = addTestUnits(world, raider, TEST_MAP_KEY, 3, clock);
    expect(raiders).toHaveLength(3);
    // 주인: 야적장(옛 hp 30)을 짓고 소나무를 넣는다
    expect(await p.facilities.service.devFacilityGrant(owner, "pine_log", 40)).toEqual({ ok: true });
    // 시험 도시 시가지 안의 야적장(먼저 지어 둔다 — 뒤 시각을 늦추지 않게)
    const inner = await p.facilities.service.build(owner, {
      mapKey: TEST_MAP_KEY,
      facility: "stockpile",
      x: 124,
      y: 124,
      rotation: 0,
    });
    if (!inner.ok || inner.buildingId === undefined)
      throw new Error(`build failed: ${JSON.stringify(inner)}`);
    const innerId = inner.buildingId;
    clock = inner.doneAtMs ?? clock;
    p.facilities.service.finishDue(clock);
    // 이웃 야적장(질문 1114 가 — 전투맵 창 안의 둘레 시설도 결과 목표다)
    const near = await p.facilities.service.build(owner, {
      mapKey: TEST_MAP_KEY,
      facility: "stockpile",
      x: 60,
      y: 70,
      rotation: 0,
    });
    if (!near.ok || near.buildingId === undefined) throw new Error(`build failed: ${JSON.stringify(near)}`);
    const nearId = near.buildingId;
    clock = near.doneAtMs ?? clock;
    p.facilities.service.finishDue(clock);
    const built = await p.facilities.service.build(owner, {
      mapKey: TEST_MAP_KEY,
      facility: "stockpile",
      x: 60,
      y: 60,
      rotation: 0,
    });
    if (!built.ok || built.buildingId === undefined)
      throw new Error(`build failed: ${JSON.stringify(built)}`);
    const yard = built.buildingId;
    clock = built.doneAtMs ?? clock;
    p.facilities.service.finishDue(clock);
    const pine = goodsAsset("pine_log");
    expect(
      await p.facilities.service.storageMove(owner, {
        buildingId: yard,
        asset: pine,
        qty: 10,
        direction: "in",
      }),
    ).toEqual({ ok: true });

    // 판정 셈: 잃은 점 × 가득 ÷ 최대(30)만큼 준다(올림)
    expect(p.facilities.damage.damageFacility(yard, 15, false, clock)).toBe(true);
    expect(p.facilities.service.facilities.get(yard)?.conditionPpm).toBe(CONDITION_FULL / 2);
    expect(p.facilities.damage.damageFacility(999_999, 1, false, clock)).toBe(false);

    // 칠 수 없는 경우
    const attack = p.facilities.attack;
    expect(await attack.attack(owner, { buildingId: yard }, raiders)).toEqual({
      ok: false,
      code: "own_target",
    });
    expect(await attack.attack(raider, { buildingId: 999_999 }, raiders)).toEqual({
      ok: false,
      code: "unknown_building",
    });
    expect(await attack.attack(raider, { buildingId: yard }, [999_999])).toEqual({
      ok: false,
      code: "unknown_unit",
    });
    const helper = addTestUnits(world, owner, TEST_MAP_KEY, 1, clock);
    expect(await attack.attack(raider, { buildingId: yard }, [...raiders, ...helper])).toEqual({
      ok: false,
      code: "forbidden",
    });
    // 도시 시가지(안전지대 D-146: 시험 도시 (128, 128) 둘레 영토 원 ÷ 3 — SMALL_TERRITORY) 안의 건물은 공성 시간에만
    // → 지금은 막는다
    expect(await attack.attack(raider, { buildingId: innerId }, raiders)).toEqual({
      ok: false,
      code: "safe_zone",
    });

    // 화면 자료: 습격자에게 야적장이 칠 수 있는 대상으로 보인다(주인에게는 안 보인다)
    const source = facilityScreenSourceOf(world);
    const seen = await source?.targetsOf(raider, clock);
    expect(seen?.map((target) => [target.kind, target.id, target.durability])).toEqual([
      ["facility", nearId, expect.any(Number)],
      ["facility", yard, 15],
    ]);
    expect(seen?.find((target) => target.id === yard)?.unitIds).toEqual(raiders.toSorted((a, b) => a - b));
    expect(await source?.targetsOf(owner, clock)).toEqual([]);

    const started = await attack.attack(raider, { buildingId: yard }, raiders);
    expect(started).toEqual({ ok: true, doneAtMs: expect.any(Number) });
    const doneAtMs = started.ok ? (started.doneAtMs ?? 0) : 0;
    expect(doneAtMs).toBeGreaterThan(clock);
    const battle = await rows<{ init: unknown; war: boolean; nexus: number }>(
      test.db,
      `select init, war, (init->'map'->'buildings'->0->>'durability')::int as nexus from world_battles`,
    );
    expect(battle).toHaveLength(1);
    const init: unknown = battle[0]?.init;
    // 넥서스 = 지금 내구도 점(15), 목표 = 그 시설, 전쟁이 아니다
    expect(battle[0]?.war).toBe(false);
    expect(battle[0]?.nexus).toBe(15);
    // 목표 = 대상(넥서스) + 창 안의 둘레 시설(질문 1114 가 — 부서지면 세계 시설도 깎인다)
    const targets = typeof init === "object" && init !== null ? targetsOf(init) : [];
    expect(targets[0]).toEqual({ building: 1, kind: "facility", id: yard });
    expect(targets.slice(1)).toContainEqual({ building: expect.any(Number), kind: "facility", id: nearId });
    // 전투맵 = 2차맵 구역(D-533·질문 1046 가): 넥서스 칸 수 = 야적장 실제 칸 수
    let area = 0;
    world.maps.get(TEST_MAP_KEY)?.forEachBuilding((building) => {
      if (building.id === yard) area = building.placement.width * building.placement.height;
    });
    const shape = await rows<{ nexus_cells: number }>(
      test.db,
      `select jsonb_array_length(init->'map'->'buildings'->0->'cells')::int as nexus_cells from world_battles`,
    );
    expect(shape[0]?.nexus_cells).toBe(area);
    // 아직 끝나지 않았다(결과는 끝 시각에)
    expect(p.facilities.service.facilities.get(yard)?.conditionPpm).toBe(CONDITION_FULL / 2);

    world = await finishBattle(world, doneAtMs);
    p = persistence(world);
    const result = await rows<{
      result: { result: { winner: number }; buildings: { durability: number }[] };
    }>(test.db, `select result from world_battle_results`);
    expect(result[0]?.result.result.winner).toBe(1);
    expect(result[0]?.result.buildings[0]?.durability).toBeLessThanOrEqual(0);
    // 폐허: 상태 0(DB도), 일하지 않고, 칸은 그대로(지우지 않는다 — 366 "지금 코드대로")
    expect(p.facilities.service.facilities.get(yard)?.conditionPpm).toBe(0);
    const saved = await rows<{ condition_ppm: number }>(
      test.db,
      `select condition_ppm from world_facilities where building_id = $1`,
      [yard],
    );
    expect(saved).toEqual([{ condition_ppm: 0 }]);
    expect(p.facilities.service.works(yard)).toBe(false);
    expect(world.maps.get(TEST_MAP_KEY)?.buildingOwner(yard)).toBe(ownerId);
    // 다시 켜도 다시 깎지 않는다(결과 기록 한 줄)
    expect(await rows(test.db, `select battle_id from world_battle_results`)).toHaveLength(1);
    // 든 물건은 그대로(416 기본안): 넣기는 막히고 꺼내기는 된다
    expect(p.ledger.balanceOf(ownerId, pine, buildingLocation(yard))).toBe(10n);
    expect(
      await p.facilities.service.storageMove(owner, {
        buildingId: yard,
        asset: pine,
        qty: 1,
        direction: "in",
      }),
    ).toEqual({ ok: false, code: "facility_disabled" });
    expect(
      await p.facilities.service.storageMove(owner, {
        buildingId: yard,
        asset: pine,
        qty: 4,
        direction: "out",
      }),
    ).toEqual({ ok: true });
    // 폐허는 칠 수 없다
    expect(await p.facilities.attack.attack(raider, { buildingId: yard }, raiders)).toEqual({
      ok: false,
      code: "target_ruined",
    });
    // 수리로 되돌린다(일꾼 하나, 끝까지)
    const repaired = await p.facilities.service.repair(owner, { buildingId: yard }, 10, helper);
    expect(repaired.ok).toBe(true);
    clock = repaired.ok ? (repaired.doneAtMs ?? clock) : clock;
    p.facilities.service.finishDue(clock);
    expect(p.facilities.service.facilities.get(yard)?.conditionPpm).toBe(CONDITION_FULL);
    expect(p.facilities.service.works(yard)).toBe(true);
    expect(raiderId).not.toBe(ownerId);
    expect(await world.checkInvariants()).toEqual([]);
  });

  it("다른 세력 비콘: 0이 되어도 지우지 않고 꼭짓점에서만 빠지며, 비콘 재료는 가장 가까운 세력 도시 창고에서만 꺼낸다(410 ①)", async () => {
    let world = await boot();
    let p = persistence(world);
    const factionRows = await rows<{ id: string }>(
      test.db,
      `select id from factions where code = 's3_test_npc'`,
    );
    const faction = Number(factionRows[0]?.id);
    const cityRows = await rows<{ id: string }>(
      test.db,
      `select id from world_cities where faction_id = $1 and map_key = $2`,
      [faction, TEST_MAP_KEY],
    );
    const cityId = Number(cityRows[0]?.id);
    // 비콘 칸 가운데가 시험 도시의 시가지(안전지대) 안이면 칠 수 없다 → 도시 시청을 2차맵 귀퉁이로 옮긴다(영토는 도시를 그때 읽는다)
    await rows(test.db, `update world_cities set cell_x = 8, cell_y = 8 where id = $1`, [cityId]);
    const member = await fakeUser("beacon_member");
    await rows(test.db, `insert into faction_members (user_id, faction_id) values ($1, $2)`, [
      member,
      faction,
    ]);
    const memberId = p.settlement.ownerOfUser(member, clock).id;
    const territory = p.territory;
    const place = () =>
      territory.place(
        { userId: member, devPlace: false },
        { planetId: TEST_PLANET_ID, cellKey: TEST_MAP_KEY },
      );

    // 위치 없는 장부·유닛 화물의 소나무는 쓰지 않는다
    grantGoods(p.ledger, memberId, "pine_log", 50, clock, null);
    const [carrier] = addTestUnits(world, member, TEST_MAP_KEY, 1, clock);
    if (carrier === undefined) throw new Error("no unit");
    grantGoods(p.ledger, memberId, "pine_log", 50, clock, cargoLocation(carrier));
    expect(await place()).toEqual({ ok: false, code: "insufficient_materials" });
    // 그 세력에서 비콘 칸과 가장 가까운 도시(시험 도시)의 내 도시 창고면 된다
    grantGoods(p.ledger, memberId, "pine_log", 5, clock, cityLocation(cityId));
    const placed = await place();
    expect(placed).toEqual({ ok: true, beaconId: expect.any(Number) });
    const beaconId = placed.ok ? (placed.beaconId ?? 0) : 0;
    expect(p.ledger.balanceOf(memberId, goodsAsset("pine_log"), cityLocation(cityId))).toBe(2n);
    expect(p.ledger.balanceOf(memberId, goodsAsset("pine_log"), null)).toBe(50n);
    expect(await territory.supplyCity(beaconId)).toEqual({ cityId, mapKey: TEST_MAP_KEY });
    // 지금 켠 세계의 영토 서비스(다시 켜면 바뀐다)
    const vertex = async () =>
      (await persistence(world).territory.planetView(TEST_PLANET_ID, null))?.groups.some((group) =>
        group.members.some((entry) => entry.kind === "beacon" && entry.id === beaconId),
      );
    expect(await vertex()).toBe(true);

    // 내 세력 비콘은 칠 수 없다
    expect(await p.facilities.attack.attack(member, { beaconId }, [carrier])).toEqual({
      ok: false,
      code: "own_target",
    });
    // 세력이 없는 습격자: 비콘 칸의 2차맵에 있는 내 유닛으로
    const raider = await fakeUser("beacon_raider");
    const raiders = addTestUnits(world, raider, TEST_MAP_KEY, 3, clock);
    const started = await p.facilities.attack.attack(raider, { beaconId }, raiders);
    expect(started).toEqual({ ok: true, doneAtMs: expect.any(Number) });
    world = await finishBattle(world, started.ok ? (started.doneAtMs ?? 0) : 0);
    p = persistence(world);

    // 0이어도 지우지 않는다(380): 목록에는 있고 꼭짓점이 아니다
    const state = p.territory.beaconState(beaconId, clock);
    expect(state?.conditionPpm).toBe(0);
    expect(await vertex()).toBe(false);
    expect((await p.territory.planetView(TEST_PLANET_ID, null))?.beacons.map((b) => b.id)).toContain(
      beaconId,
    );

    // 수리 재료도 그 도시 창고(+ 그 도시의 창고 시설)에서만: 화물·장부의 돌은 쓰지 않는다
    grantGoods(p.ledger, memberId, "stone", 50, clock, null);
    expect(await p.facilities.service.repair(member, { beaconId }, 10, [carrier])).toEqual({
      ok: false,
      code: "insufficient_materials",
    });
    grantGoods(p.ledger, memberId, "pine_log", 10, clock, cityLocation(cityId));
    grantGoods(p.ledger, memberId, "stone", 10, clock, cityLocation(cityId));
    const repaired = await p.facilities.service.repair(member, { beaconId }, 10, [carrier]);
    expect(repaired.ok).toBe(true);
    clock = repaired.ok ? (repaired.doneAtMs ?? clock) : clock;
    p.facilities.service.finishDue(clock);
    expect(p.territory.beaconState(beaconId, clock)?.conditionPpm).toBe(CONDITION_FULL);
    expect(await vertex()).toBe(true);
    expect(await world.checkInvariants()).toEqual([]);
  });
});
