// NPC 일꾼 경험치 DB 통합 시험(docs/adr/2026-11-27-npc-work-exp.md) — TEST_DATABASE_URL이 있을 때만. 값은 모두 시험용 가짜다.
// 도시 경제가 도는 세계에서: 시설이 생산하면 그 시설 일꾼 휴먼이 경험치를 받고, 레벨이 오르면 휴먼 줄의 레벨이 오른 값으로 남는다.
// 하루 끝(만족도가 바뀌어 휴먼 줄을 다시 쓴다)이 지나도, 다시 켜도 오른 레벨이 옛 값으로 덮이지 않는다.
import { loadContentPack } from "@terra/content/node";
import { DAY_MS, HOUR_MS, TEST_SOCIETY_COEFFICIENTS, cityWorkerUnits } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { economyCatalogFromPack } from "../economyView/catalog.ts";
import { unitGrowthOf } from "../growth/store.ts";
import { createOpsServices } from "../ops/services.ts";
import { serverEconomyCatalogAccessor } from "../market/catalog.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { legacyNationPresets, silentLog } from "../world/testSupport.ts";
import { UNIT_KIND_NPC_LEADER } from "../world/unitKinds.ts";
import { type World, startWorld } from "../world/world.ts";
import { nationPresetsOf } from "./presets.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source || !loaded.pack) throw new Error("content pack");
const pack = createContentEditState(loaded.source).effective();
const presets = legacyNationPresets(nationPresetsOf(loaded.pack));
const economy = serverEconomyCatalogAccessor(
  economyCatalogFromPack(loaded.pack, { version: "core@test", placeholder: true }),
  () => pack,
);
// 도시 하나씩, 묶음 하나의 경험치를 크게(40 > Lv1 → 2 구간 35) — 한 번 받으면 레벨이 오른다
const RULES = {
  ...TEST_SOCIETY_COEFFICIENTS,
  worldSeed: { ...TEST_SOCIETY_COEFFICIENTS.worldSeed, startCitiesMin: 1, startCitiesMax: 1 },
  gatherObjects: { ...TEST_SOCIETY_COEFFICIENTS.gatherObjects, expPerGather: 40, expPerTier: 0 },
};

let test: TestDatabase;
const worlds: World[] = [];
let clock = 0;

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
  // UTC 12시(하루 끝 열두 시간 전)
  clock = 1_800_000_000_000 - (1_800_000_000_000 % DAY_MS) + 12 * HOUR_MS;
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  for (const world of worlds.splice(0)) await world.stop().catch(() => undefined);
  await test.drop();
});

async function boot(): Promise<World> {
  const world = startWorld({
    testBots: 12,
    paths: { kind: "inline" },
    now: () => clock,
    log: silentLog,
    pool: test.db.$client,
    writeIntervalMs: 10,
    onFatal: (error) => {
      throw error;
    },
    npc: { testNations: 2, manual: true, presets },
    cyborgRules: () => RULES,
    holdings: { content: () => pack },
    facilities: { content: () => pack },
    economy,
  });
  worlds.push(world);
  await world.ready;
  return world;
}

/** 5분씩 민다 */
async function advance(world: World, ms: number): Promise<void> {
  const npc = world.npc;
  if (!npc) throw new Error("npc runtime");
  for (let passed = 0; passed < ms; passed += 5 * 60_000) {
    clock += 5 * 60_000;
    await npc.tick();
  }
  await world.persistence?.writer.durable();
}

const storedLevels = async (): Promise<Map<number, number>> =>
  new Map(
    (await rows<{ unit_id: string; level: number }>(test.db, `select unit_id, level from world_humans`)).map(
      (row) => [Number(row.unit_id), row.level],
    ),
  );

describe.skipIf(!TEST_DATABASE_URL)("모든 유닛에 스탯·레벨 (DB)", () => {
  it("NPC 지도자는 처음 읽힐 때 굴린 스탯을 unit_stats에 저장하고, 다시 켜도 같은 값이다", async () => {
    const world = await boot();
    const growth = unitGrowthOf(world.persistence);
    if (!growth) throw new Error("growth");
    await growth.loaded;
    const leaders: number[] = [];
    for (const map of world.maps.values())
      map.forEachUnit((unit) => {
        if (unit.kind === UNIT_KIND_NPC_LEADER) leaders.push(unit.id);
      });
    expect(leaders.length).toBe(2);
    const sheets = new Map(leaders.map((id) => [id, growth.sheetOf(id)]));
    for (const sheet of sheets.values()) {
      expect(sheet).toMatchObject({ kind: "unit", level: 1, exp: 0 });
      expect(sheet?.initial).toHaveLength(6);
    }
    // 몸 바탕도 그 스탯이다(전투·걷기·작업이 같은 값을 쓴다)
    const [first = 0] = leaders;
    expect(growth.baseOf(first)).toMatchObject({ kind: "stats", unitKind: "human" });
    // 경험치를 받으면 휴먼과 똑같이 레벨이 오른다(묶음 하나 40 > 구간 35)
    expect(growth.gain(first, 40)).toMatchObject({ level: 2, gainedLevels: 1 });
    await world.persistence?.writer.durable();
    const saved = await rows<{ unit_id: string; level: number; stats: number[] }>(
      test.db,
      `select unit_id, level, stats from unit_stats where unit_id = any($1::bigint[]) order by unit_id`,
      [leaders],
    );
    expect(saved.map((row) => Number(row.unit_id))).toEqual(leaders.toSorted((a, b) => a - b));
    expect(saved.find((row) => Number(row.unit_id) === first)?.level).toBe(2);

    await world.stop();
    worlds.splice(0);
    const again = await boot();
    const growthAgain = unitGrowthOf(again.persistence);
    await growthAgain?.loaded;
    for (const [id, sheet] of sheets) {
      expect(growthAgain?.sheetOf(id)?.initial).toEqual(sheet?.initial);
      expect(growthAgain?.sheetOf(id)?.level).toBe(id === first ? 2 : 1);
    }
  });
});

describe.skipIf(!TEST_DATABASE_URL)("운영 조회의 NPC 일꾼 (DB)", () => {
  it("NPC 도시 일꾼: 지금 하는 일은 하나(거르기와 같은 값)이고, 피로는 어림값으로 보이며 피로 정렬이 그 값을 쓴다", async () => {
    const world = await boot();
    const ops = createOpsServices(
      {
        pool: test.db.$client,
        world: () => world,
        worldStatus: () => world.status(),
        wsConnections: () => 0,
        now: () => clock,
      },
      { ip: "127.0.0.1" },
    );
    let maxFatigue = 0;
    let seenWorkers = 0;
    // 하루를 여섯 시간씩 넷으로 나눠 본다(일하는 때·쉬는 때가 모두 지나간다)
    for (let step = 0; step < 4; step++) {
      await advance(world, 6 * HOUR_MS);
      const list = await ops.units({
        ownerKind: "faction",
        sort: "fatigue",
        desc: true,
        limit: 200,
        offset: 0,
      });
      const workers = list.rows.filter((row) => row.npcWorker === true);
      seenWorkers = Math.max(seenWorkers, workers.length);
      for (const row of workers) {
        expect(row.job?.fatigueEstimated).toBe(true);
        // 일꾼은 "하는 일 없음"·"이동 중"으로 뜨지 않는다(일하는 중·가는 중·쉬는 중 … 가운데 하나)
        expect(["working", "to_work", "hauling", "resting", "to_rest", "need", "patrol", "evade"]).toContain(
          row.doing,
        );
      }
      // 피로 정렬(내림차순)은 보이는 피로 값 차례다
      const shown = list.rows.map((row) => row.job?.fatigue ?? 0);
      expect(shown).toEqual(shown.toSorted((a, b) => b - a));
      maxFatigue = Math.max(maxFatigue, shown[0] ?? 0);
      // 상태 거르기는 줄에 보이는 "지금 하는 일"과 같다
      for (const state of ["working", "resting", "to_work"] as const) {
        const filtered = await ops.units({ ownerKind: "faction", state, limit: 200, offset: 0 });
        expect(filtered.rows.every((row) => row.doing === state)).toBe(true);
      }
    }
    expect(seenWorkers).toBeGreaterThan(0);
    // 일하는 때를 지나면 피로가 0보다 크고 피로 상한(120)을 넘지 않는다
    expect(maxFatigue).toBeGreaterThan(0);
    expect(maxFatigue).toBeLessThanOrEqual(TEST_SOCIETY_COEFFICIENTS.fatigueMax);
  });
});

describe.skipIf(!TEST_DATABASE_URL)("NPC 일꾼 경험치 (DB)", () => {
  it("시설이 생산하면 그 시설 일꾼이 경험치를 받아 레벨이 오르고, 하루 끝·다시 켜기 뒤에도 오른 레벨이 남는다", async () => {
    const world = await boot();
    const npc = world.npc;
    const growth = unitGrowthOf(world.persistence);
    if (!npc?.economy || !growth) throw new Error("city economy");
    await growth.loaded;
    const humans = [...npc.world.units.keys()];
    expect(humans.length).toBeGreaterThan(0);
    // 처음에는 모두 레벨 1·경험치 0
    expect(humans.every((id) => growth.viewOf(id)?.level === 1 && growth.viewOf(id)?.exp === 0)).toBe(true);

    await advance(world, 6 * HOUR_MS);
    const workers = new Set(
      [...npc.world.cities.keys()].flatMap((cityId) =>
        cityWorkerUnits(npc.world, npc.economy?.economy ?? { facilities: new Map() }, cityId).map(
          (worker) => worker.unitId,
        ),
      ),
    );
    const grown = humans.filter((id) => (growth.viewOf(id)?.level ?? 1) > 1);
    // 생산이 돌았으면 레벨이 오른 휴먼이 있고, 모두 시설 일꾼이다(일 없는 휴먼·경비대는 받지 않는다)
    expect(grown.length).toBeGreaterThan(0);
    expect(grown.every((id) => workers.has(id))).toBe(true);
    // 거울 세계·저장된 휴먼 줄의 레벨이 성장 거울과 같다
    const levels = await storedLevels();
    for (const id of grown) {
      expect(npc.world.units.get(id)?.recruit?.level).toBe(growth.viewOf(id)?.level);
      expect(levels.get(id)).toBe(growth.viewOf(id)?.level);
    }

    // 하루 끝을 넘긴다(만족도가 바뀌어 휴먼 줄을 다시 쓴다) → 레벨이 내려가지 않는다
    const before = new Map(grown.map((id) => [id, growth.viewOf(id)?.level ?? 0]));
    await advance(world, 7 * HOUR_MS);
    const after = await storedLevels();
    for (const [id, level] of before) {
      if (!npc.world.units.has(id)) continue; // 수명이 다한 휴먼
      expect(growth.viewOf(id)?.level).toBeGreaterThanOrEqual(level);
      expect(after.get(id)).toBe(growth.viewOf(id)?.level);
    }

    // 다시 켜도 그대로(휴먼 줄의 레벨·unit_exp의 경험치)
    const kept = new Map(
      [...before.keys()]
        .filter((id) => npc.world.units.has(id))
        .map((id) => [id, { level: growth.viewOf(id)?.level, exp: growth.viewOf(id)?.exp }]),
    );
    expect(kept.size).toBeGreaterThan(0);
    await world.stop();
    worlds.splice(0);
    const again = await boot();
    const growthAgain = unitGrowthOf(again.persistence);
    await growthAgain?.loaded;
    for (const [id, view] of kept) {
      expect(growthAgain?.viewOf(id)).toMatchObject(view);
      expect(again.npc?.world.units.get(id)?.recruit?.level).toBe(view.level);
    }
  });
});
