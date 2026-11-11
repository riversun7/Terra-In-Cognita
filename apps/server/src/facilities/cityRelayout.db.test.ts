// NPC 도시 건물 다시 놓기 DB 통합 시험 — docs/adr/2026-11-11-city-building-layout.md 4절. TEST_DATABASE_URL이 있을 때만. 값은 시험용 가짜다.
// 옛 배치(city_layout_mode 0)로 선 세계에 예약을 적고 다시 켜면: NPC 건물만 같은 ID로 옮기고(행정 건물 가운데), 플레이어가 걸린 건물(임대 조건)과
// 다른 주인 건물은 그대로, 시설 줄·건물 수는 그대로, 예약에 든 시각·결과, 감사 기록 world.city_relayout, 불변 조건 위반 없음.
import { loadContentPack } from "@terra/content/node";
import { DAY_MS, TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { nationPresetsOf } from "../npc/presets.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { legacyNationPresets, silentLog } from "../world/testSupport.ts";
import { type World, startWorld } from "../world/world.ts";
import { loadRelayoutInputs, planCityRelayout } from "./cityRelayout.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source || !loaded.pack) throw new Error("content pack");
const pack = createContentEditState(loaded.source).effective();
const presets = legacyNationPresets(nationPresetsOf(loaded.pack));
const OLD = {
  ...TEST_SOCIETY_COEFFICIENTS,
  worldSeed: { ...TEST_SOCIETY_COEFFICIENTS.worldSeed, cityLayoutMode: 0 },
};

let test: TestDatabase;
const worlds: World[] = [];
let clock = 0;

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
  clock = 1_800_000_000_000 - (1_800_000_000_000 % DAY_MS) + 3_600_000;
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  for (const world of worlds.splice(0)) await world.stop().catch(() => undefined);
  await test.drop();
});

async function boot(rules?: typeof TEST_SOCIETY_COEFFICIENTS): Promise<World> {
  const world = startWorld({
    testBots: 0,
    testMaps: 2,
    paths: { kind: "inline" },
    now: () => clock,
    log: silentLog,
    pool: test.db.$client,
    writeIntervalMs: 10,
    onFatal: (error) => {
      throw error;
    },
    npc: { testNations: 2, manual: true, presets },
    cyborgRules: rules ? () => rules : undefined,
    holdings: { content: () => pack },
    facilities: { content: () => pack },
  });
  worlds.push(world);
  await world.ready;
  await world.persistence?.writer.durable();
  return world;
}

type BuildingLine = {
  id: string;
  facility_id: string;
  city_id: string;
  owner_id: string;
  x: number;
  y: number;
  cell_x: number;
  cell_y: number;
};
const buildings = () =>
  rows<BuildingLine>(
    test.db,
    `select b.id, wf.facility_id, wf.city_id, b.owner_id, b.x, b.y, c.cell_x, c.cell_y
       from world_facilities wf join world_buildings b on b.id = wf.building_id join world_cities c on c.id = wf.city_id
      order by b.id`,
  );

const at = (lines: BuildingLine[], id: string) => lines.find((line) => line.id === id);

describe.skipIf(!TEST_DATABASE_URL)("NPC 도시 건물 다시 놓기(예약 → 다음 시작)", () => {
  it("NPC 건물만 같은 ID로 옮기고, 플레이어가 걸린 건물·다른 주인 건물은 그대로, 결과·감사 기록", async () => {
    const old = await boot(OLD);
    await old.stop();
    worlds.splice(0);
    const before = await buildings();
    expect(before.length).toBeGreaterThan(10);
    // 옛 배치: 행정 건물이 도시 칸에서 떨어져 있다
    const oldHalls = before.filter((line) => line.facility_id === "government_hall");
    expect(oldHalls.every((hall) => hall.x + 1 !== hall.cell_x || hall.y + 1 !== hall.cell_y)).toBe(true);

    // 플레이어가 걸린 건물(임대 조건이 있는 농장 하나), 다른 주인 건물(다른 국가 주체로 바꾼 창고 하나)
    const farm = before.find((line) => line.facility_id === "farm");
    const store = before.find((line) => line.facility_id === "storehouse" && line.city_id !== farm?.city_id);
    if (!farm || !store) throw new Error("fixture");
    await test.db.$client.query(
      `insert into labor_rents (building_id, owner_id, asset, rent_per_hour, updated_at_ms) values ($1, $2, 'credit', 10, 0)`,
      [farm.id, farm.owner_id],
    );
    const other = await rows<{ id: string }>(
      test.db,
      `select id from world_owners where faction_id is not null and id <> $1 order by id limit 1`,
      [store.owner_id],
    );
    await test.db.$client.query(`update world_buildings set owner_id = $2 where id = $1`, [
      store.id,
      other[0]?.id,
    ]);
    await test.db.$client.query(
      `insert into world_city_layout_requests (planet_id, requested_by, requested_at_ms) values ('s2_test_planet', null, 1)`,
    );

    const world = await boot();
    const after = await buildings();
    // 옛 건물·시설 줄의 ID는 그대로(주인을 바꾼 창고 자리는 같은 부팅의 세계 씨앗이 창고 하나를 더 세운다 — 다시 놓기가 아니다)
    const known = new Set(before.map((line) => line.id));
    expect(
      after.filter((line) => known.has(line.id)).map((line) => [line.id, line.facility_id, line.city_id]),
    ).toEqual(before.map((line) => [line.id, line.facility_id, line.city_id]));
    expect(after.length - before.length).toBe(1);
    expect([at(after, farm.id)?.x, at(after, farm.id)?.y]).toEqual([farm.x, farm.y]);
    expect([at(after, store.id)?.x, at(after, store.id)?.y]).toEqual([store.x, store.y]);
    // 옮긴 건물이 있고, 행정 건물은 대부분 도시 칸 가운데(몇 칸 안)
    const moved = after.filter((line) => {
      const was = at(before, line.id);
      return was && (was.x !== line.x || was.y !== line.y);
    });
    expect(moved.length).toBeGreaterThan(5);
    const halls = after.filter((line) => line.facility_id === "government_hall");
    for (const hall of halls)
      expect(
        Math.max(Math.abs(hall.x + 1 - hall.cell_x), Math.abs(hall.y + 1 - hall.cell_y)),
      ).toBeLessThanOrEqual(4);

    const request = await rows<{ applied_at_ms: string | null; report: { moved: number; pinned: number } }>(
      test.db,
      `select applied_at_ms, report from world_city_layout_requests`,
    );
    expect(request[0]?.applied_at_ms).not.toBeNull();
    expect(request[0]?.report.moved).toBe(moved.length);
    expect(request[0]?.report.pinned).toBeGreaterThanOrEqual(1);
    const audit = await rows<{ action: string }>(
      test.db,
      `select action from audit_log where action = 'world.city_relayout'`,
    );
    expect(audit).toHaveLength(1);
    expect(await world.checkInvariants()).toEqual([]);

    // 미리 보기(읽기만): 다시 놓은 세계는 더 옮길 것이 거의 없다(같은 계획)
    const persistence = world.persistence;
    if (!persistence) throw new Error("persistence");
    const inputs = await loadRelayoutInputs(test.db.$client, "s2_test_planet");
    const plans = planCityRelayout(
      {
        maps: world.maps,
        facilities: persistence.facilities.service.facilities,
        catalog: persistence.facilities.catalog(),
        gatherKinds: [],
        seed: TEST_SOCIETY_COEFFICIENTS.worldSeed,
      },
      inputs,
    );
    expect(plans.length).toBeGreaterThan(0);
    expect(plans.every((plan) => plan.planned.walledIn === 0)).toBe(true);
    expect(plans.some((plan) => plan.pinned > 0)).toBe(true);
    // 다시 켜도 예약은 한 번만 든다
    await world.stop();
    worlds.splice(0);
    await boot();
    expect(await buildings()).toEqual(after);
  }, 180_000);
});
