// NPC 일꾼 직무 판 DB 통합 시험(docs/adr/2026-11-27-npc-worker-jobs.md) — TEST_DATABASE_URL이 있을 때만. 값은 모두 시험용 가짜다.
// 도시 경제가 도는 세계에서: 일꾼 휴먼이 플레이어 유닛과 같은 직무 상태(일·쉼, 피로)를 갖고, 묶음마다 피로가 쌓여 쉬러 가며, 쉬는 일꾼은
// 생산에서 빠지고(시설 생산 속도), 쉼터에서 회복해 돌아온다. 소유 주체 정산은 이 유닛들의 직무 상태를 건드리지 않는다.
import { loadContentPack } from "@terra/content/node";
import {
  DAY_MS,
  HOUR_MS,
  JOB_GATHER,
  JOB_NONE,
  PHASE_REST,
  PHASE_WORK,
  type SocietyCoefficients,
  TEST_SOCIETY_COEFFICIENTS,
  cityWorkerUnits,
} from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { economyCatalogFromPack } from "../economyView/catalog.ts";
import { serverEconomyCatalogAccessor } from "../market/catalog.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { legacyNationPresets, silentLog } from "../world/testSupport.ts";
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
// 도시 하나씩. 쉬러 가는 때를 빨리 보려고 묶음 피로를 크게(40 × 시설 배율 900‰ = 36 → 세 묶음이면 쉬러 가는 피로 90 언저리)
const RULES: SocietyCoefficients = {
  ...TEST_SOCIETY_COEFFICIENTS,
  worldSeed: { ...TEST_SOCIETY_COEFFICIENTS.worldSeed, startCitiesMin: 1, startCitiesMax: 1 },
  gatherObjects: { ...TEST_SOCIETY_COEFFICIENTS.gatherObjects, jobFatiguePerLot: 40 },
};
const OLD_RULES: SocietyCoefficients = { ...RULES, logistics: { ...RULES.logistics, npcJobMode: 0 } };
let rules = RULES;

let test: TestDatabase;
const worlds: World[] = [];
let clock = 0;

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
  rules = RULES;
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
    cyborgRules: () => rules,
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

/** 그 세계의 일꾼 휴먼(유닛 ID → 시설 ID) */
function workersOf(world: World): Map<number, number> {
  const npc = world.npc;
  const out = new Map<number, number>();
  if (!npc?.economy) return out;
  for (const cityId of npc.world.cities.keys())
    for (const worker of cityWorkerUnits(npc.world, npc.economy.economy, cityId))
      out.set(worker.unitId, worker.facilityId);
  return out;
}
const infoOf = (world: World, unitId: number) => {
  for (const map of world.maps.values()) {
    const info = map.unitInfo(unitId);
    if (info) return info;
  }
  return undefined;
};

// [잰 값] 하루 생산 묶음 수(기본 묶음 피로 10): 일꾼 직무 판(켬) 대 옛 셈(끔). 세계마다 새 DB라 시험을 둘로 나눈다
const BASE: SocietyCoefficients = {
  ...RULES,
  gatherObjects: {
    ...RULES.gatherObjects,
    jobFatiguePerLot: TEST_SOCIETY_COEFFICIENTS.gatherObjects.jobFatiguePerLot,
  },
};
const producedInDay = async (mode: SocietyCoefficients): Promise<number> => {
  rules = mode;
  const world = await boot();
  const npc = world.npc;
  if (!npc) throw new Error("npc runtime");
  npc.takeMetrics();
  let count = 0;
  for (let hour = 0; hour < 24; hour++) {
    await advance(world, HOUR_MS);
    count += npc.takeMetrics()["econProduced"] ?? 0;
  }
  return count;
};

describe.skipIf(!TEST_DATABASE_URL)("NPC 일꾼 직무 판 (DB)", () => {
  it("일꾼은 직무 상태를 갖고, 묶음마다 피로가 쌓여 쉬러 가고, 쉬는 일꾼은 생산에서 빠졌다가 회복해 돌아온다", async () => {
    const world = await boot();
    const npc = world.npc;
    const settlement = world.persistence?.settlement;
    if (!npc?.economy || !settlement) throw new Error("city economy");
    await advance(world, 10 * 60_000);
    const workers = workersOf(world);
    expect(workers.size).toBeGreaterThan(0);
    // 일꾼은 모두 직무가 켜져 있다(일 단계, 피로 0부터). 일꾼이 아닌 휴먼은 직무가 없다
    for (const unitId of workers.keys()) {
      expect(npc.workerJobs.has(unitId)).toBe(true);
      expect(infoOf(world, unitId)?.job).toMatchObject({ job: JOB_GATHER });
    }
    const others = [...npc.world.units.keys()].filter((id) => !workers.has(id));
    for (const unitId of others) expect(infoOf(world, unitId)?.job.job ?? JOB_NONE).toBe(JOB_NONE);

    // 소유 주체 정산은 이 유닛들의 직무 상태를 건드리지 않는다(일 주기마다 1점씩 쌓지 않는다)
    const [someWorker = 0] = workers.keys();
    const before = { ...infoOf(world, someWorker)?.job };
    const ownerId = infoOf(world, someWorker)?.ownerId ?? 0;
    clock += 2 * HOUR_MS;
    settlement.settleOwner(ownerId, clock);
    expect(infoOf(world, someWorker)?.job).toEqual(before);

    // 생산이 돌면 피로가 쌓이고(묶음 하나 36), 세 묶음째에 쉬러 간다
    let rested: number | undefined;
    for (let hour = 0; hour < 24 && rested === undefined; hour++) {
      await advance(world, HOUR_MS);
      rested = [...workersOf(world).keys()].find((id) => infoOf(world, id)?.job.phase === PHASE_REST);
    }
    if (rested === undefined) throw new Error("no worker went to rest in a day");
    const fatigues = [...workersOf(world).keys()].map((id) => infoOf(world, id)?.job.fatigue ?? 0);
    expect(Math.max(...fatigues)).toBeGreaterThan(0);
    expect(fatigues.every((value) => value % 36 === 0 || value <= 120)).toBe(true);
    const resting = infoOf(world, rested);
    expect(resting?.job.fatigue).toBeGreaterThanOrEqual(72);
    // 쉬는 일꾼은 쉼터로 간다(움직임이 직무 단계를 따른다)
    expect(resting?.home?.shift?.on).toBe(false);
    expect(npc.workerJobs.workingOf(rested)).toBe(false);
    // 그 시설의 생산 속도는 지금 일하는 일꾼 몫이다
    const facilityId = workersOf(world).get(rested) ?? -1;
    const facility = npc.economy.economy.facilities.get(facilityId);
    const crew = [...workersOf(world)].filter(([, id]) => id === facilityId).map(([id]) => id);
    const working = crew.filter((id) => infoOf(world, id)?.job.phase === PHASE_WORK).length;
    expect(facility?.dutyPm).toBe(Math.min(1000, Math.floor((working * 1000) / (facility?.workers ?? 1))));
    expect(facility?.dutyPm).toBeLessThan(1000);

    // 쉼터에서 회복한다: 피로가 내려가고(3분에 1 × 회복 배율), 다시 일하는 피로(0)에 닿으면 일 단계로 돌아온다
    const peak = resting?.job.fatigue ?? 0;
    await advance(world, HOUR_MS);
    const cooling = infoOf(world, rested)?.job;
    expect(cooling?.fatigue).toBeLessThan(peak);
    expect(cooling?.phase).toBe(PHASE_REST);
    for (let hour = 0; hour < 12 && infoOf(world, rested)?.job.phase === PHASE_REST; hour++)
      await advance(world, HOUR_MS);
    expect(infoOf(world, rested)?.job).toMatchObject({ job: JOB_GATHER, phase: PHASE_WORK });
    expect(infoOf(world, rested)?.home?.shift?.on).toBe(true);

    // 저장: 직무 상태가 유닛 줄에 남는다(다시 켜면 그대로 잇는다)
    await world.persistence?.writer.durable();
    const saved = await rows<{ id: string; job: number; job_phase: number; fatigue: number }>(
      test.db,
      `select id, job, job_phase, fatigue from world_units where id = any($1::bigint[])`,
      [[...workersOf(world).keys()]],
    );
    expect(saved.length).toBe(workersOf(world).size);
    expect(saved.every((row) => row.job === JOB_GATHER)).toBe(true);
  });

  it("설정 칸을 끄면 옛 셈: 일꾼에게 직무 상태가 없고 생산 속도는 쉼터 계획 배율을 쓴다", async () => {
    rules = OLD_RULES;
    const world = await boot();
    const npc = world.npc;
    if (!npc?.economy) throw new Error("city economy");
    await advance(world, 6 * HOUR_MS);
    const workers = workersOf(world);
    expect(workers.size).toBeGreaterThan(0);
    expect(npc.workerJobs.size).toBe(0);
    for (const unitId of workers.keys()) {
      expect(infoOf(world, unitId)?.job).toMatchObject({ job: JOB_NONE, fatigue: 0 });
      expect(infoOf(world, unitId)?.home?.shift?.on).toBeUndefined();
    }
  });

  it("[잰 값] 하루 생산 묶음 수 — 일꾼 직무 판 켬", async () => {
    const count = await producedInDay(BASE);
    console.info(`npc worker jobs: produced/day on=${count}`);
    expect(count).toBeGreaterThan(0);
  });
  it("[잰 값] 하루 생산 묶음 수 — 옛 셈(끔)", async () => {
    const count = await producedInDay({ ...BASE, logistics: { ...BASE.logistics, npcJobMode: 0 } });
    console.info(`npc worker jobs: produced/day off=${count}`);
    expect(count).toBeGreaterThan(0);
  });
});
