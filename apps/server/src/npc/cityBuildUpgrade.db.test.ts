// NPC 도시 인구 상한·레벨 올리기·수리 DB 통합 시험(기획 D-535 — 질문 1131 나·1143 나·1146 나·1114 가, npc/cityBuild.ts·npc/cityRest.ts) —
// TEST_DATABASE_URL이 있을 때만. 값은 모두 시험용 가짜다.
// 1. 세계 씨앗이 세운 시설은 seeded(DB 칸도)이고, 씨앗 숙소 침대는 인구 상한에 들지 않는다(시작 도시 상한 = 주거). 씨앗 뒤에 지은 숙소는 든다.
// 2. 전투에서 깎인 시설(상태 문턱 아래)은 NPC가 플레이어 수리와 같은 재료·시간으로 가득까지 고친다.
// 3. 도시 등급 상한에 닿은 도시는 새로 짓지 않고 있는 시설의 레벨을 한 단계 올린다(팩 레벨 2 재료·짓는 시간).
import { loadContentPack } from "@terra/content/node";
import { CONDITION_FULL } from "@terra/shared/facilityRuntime";
import { DAY_MS, HOUR_MS, TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
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
const MATERIALS = ["pine_log", "stone", "rubble", "plank", "brick"];

let test: TestDatabase;
const worlds: World[] = [];
let clock = 0;

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
  clock = 1_800_000_000_000 - (1_800_000_000_000 % DAY_MS) + 3 * HOUR_MS;
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  for (const world of worlds.splice(0)) await world.stop().catch(() => undefined);
  await test.drop();
});

/** 국가마다 도시 하나, 판단 1시간마다. capByGrade = 도시 등급별 건물 수 상한(시험값) */
async function boot(capByGrade: readonly number[]): Promise<World> {
  const rules = {
    ...TEST_SOCIETY_COEFFICIENTS,
    worldSeed: { ...TEST_SOCIETY_COEFFICIENTS.worldSeed, startCitiesMin: 1, startCitiesMax: 1 },
    npc: { ...TEST_SOCIETY_COEFFICIENTS.npc, decideEveryMs: HOUR_MS, buildCapByGrade: [...capByGrade] },
  };
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

function parts(world: World) {
  const persistence = world.persistence;
  const npc = world.npc;
  if (!persistence || !npc?.economy) throw new Error("world");
  return { persistence, npc };
}

/** NPC 도시 창고 재료를 그 양까지 채운다(시험값) */
function stock(world: World, qty: bigint): void {
  const { persistence, npc } = parts(world);
  for (const [cityId, city] of npc.world.cities)
    for (const item of MATERIALS) {
      const asset = `item:${item}`;
      const gap = qty - persistence.ledger.balanceOf(city.owner, asset, cityId);
      if (gap <= 0n) continue;
      persistence.ledger.post({
        kind: "endow",
        atMs: clock,
        entries: [
          { account: persistence.ledger.systemAccount(`source:${asset}`, asset), amount: -gap },
          { account: persistence.ledger.ownerAccount(city.owner, asset, cityId), amount: gap },
        ],
      });
    }
}

/** 15분씩 민다(재료를 채우고, 끝난 작업을 그 시각으로 적용한다) */
async function advance(world: World, ms: number): Promise<void> {
  const { persistence, npc } = parts(world);
  for (let passed = 0; passed < ms; passed += 15 * 60_000) {
    stock(world, 400n);
    clock += 15 * 60_000;
    persistence.facilities.service.finishDue(clock);
    await npc.tick();
  }
  await persistence.writer.durable();
}

describe.skipIf(!TEST_DATABASE_URL)("NPC 도시 인구 상한·레벨 올리기·수리 (DB, D-535)", () => {
  it("씨앗 숙소 침대는 인구 상한에 들지 않고(seeded 칸), 지은 숙소는 든다. 깎인 시설은 NPC가 고친다", async () => {
    // 상한 넉넉히(짓기가 막히지 않게)
    const world = await boot([32, 32, 32, 32, 32, 32]);
    const { persistence, npc } = parts(world);
    const service = persistence.facilities.service;
    const seeded = [...service.facilities.values()].filter((record) => record.seeded === true);
    expect(seeded.length).toBeGreaterThan(0);
    const saved = await rows<{ n: string }>(
      test.db,
      `select count(*) as n from world_facilities where seeded`,
    );
    expect(Number(saved[0]?.n)).toBe(seeded.length);
    await advance(world, 15 * 60_000);
    for (const [cityId, city] of npc.world.cities) {
      const lodgings = seeded.filter((record) => record.cityId === cityId && record.facilityId === "lodging");
      if (lodgings.length === 0) continue;
      // 씨앗 숙소의 쉼터 침대는 있지만 상한에 더하는 침대는 0 → 상한 = 주거(npc_seed_housing)
      expect(npc.economy?.restPlan(cityId)?.bedTotal).toBeGreaterThan(0);
      expect(city.beds ?? 0).toBe(0);
    }

    // 깎인 시설(전투 피해와 같은 길 — service.damage): 문턱(700‰) 아래 → 다음 판단에 수리 작업 → 끝나면 가득
    const [cityId] = [...npc.world.cities.keys()];
    const target = seeded.find((record) => record.cityId === cityId && record.facilityId === "storehouse");
    if (!target) throw new Error("no seeded storehouse");
    expect(service.damage(target.buildingId, 1_000_000, false, clock)).toBe(true);
    expect(target.conditionPpm).toBeLessThan(700_000);
    // 판단마다 수리 작업을 거는지 보며 민다(끝나면 작업 줄이 지워진다)
    let sawRepair = false;
    for (let step = 0; step < 32 && !sawRepair; step++) {
      await advance(world, 15 * 60_000);
      sawRepair = [...service.jobs.values()].some(
        (job) => job.kind === "repair" && job.buildingId === target.buildingId,
      );
    }
    expect(sawRepair).toBe(true);
    await advance(world, 6 * HOUR_MS);
    expect(service.facilities.get(target.buildingId)?.conditionPpm).toBe(CONDITION_FULL);
    expect(await world.checkInvariants()).toEqual([]);

    // 씨앗 뒤에 지은 숙소는 인구 상한에 든다(NPC 증축과 같은 길 — 건물 서비스 npcBuild)
    const city = npc.world.cities.get(cityId ?? -1);
    const before = city?.beds ?? 0;
    const built = [...service.facilities.values()].filter(
      (record) => record.cityId === cityId && record.facilityId === "lodging" && record.seeded !== true,
    );
    if (built.length === 0) {
      // 판단이 숙소를 짓지 않았으면 그대로(상한 = 주거) — 짓기 길은 cityBuild.db.test.ts가 본다
      expect(before).toBe(0);
    } else {
      const levels = built
        .filter((record) => record.level >= 1)
        .reduce((sum, record) => sum + record.level, 0);
      expect(before).toBe(levels * TEST_SOCIETY_COEFFICIENTS.logistics.lodgingBedsPerLevel);
    }
  });

  it("도시 등급 상한에 닿은 도시는 새로 짓지 않고 레벨을 한 단계 올린다(팩 레벨 2 재료)", async () => {
    // 상한 1: 씨앗 도시는 처음부터 상한 위다
    const world = await boot([1, 1, 1, 1, 1, 1]);
    const { persistence, npc } = parts(world);
    const service = persistence.facilities.service;
    const before = new Set(service.facilities.keys());
    const sunkPlank = () =>
      persistence.ledger.balance(persistence.ledger.systemAccount("sink:item:plank", "item:plank"));
    await advance(world, 4 * HOUR_MS);
    const jobs = await rows<{ kind: string; target_level: number }>(
      test.db,
      `select kind, target_level from facility_jobs`,
    );
    const upgraded = [...service.facilities.values()].filter((record) => record.level >= 2);
    expect(jobs.some((job) => job.kind === "upgrade") || upgraded.length > 0).toBe(true);
    // 새 건물은 서지 않는다
    expect([...service.facilities.keys()].filter((id) => !before.has(id))).toEqual([]);
    await advance(world, 8 * HOUR_MS);
    const levelled = [...service.facilities.values()].filter(
      (record) => record.level >= 2 && npc.world.cities.has(record.cityId ?? -1),
    );
    expect(levelled.length).toBeGreaterThan(0);
    // 레벨 2 재료(판자·벽돌)는 창고에서 빠졌다(플레이어 레벨업과 같은 facility_upgrade 거래 — 소멸 계정)
    expect(sunkPlank()).toBeGreaterThan(0n);
    // 다 올린 시설은 다음 판단에 도시 경제에서 레벨이 오른 채 돈다(생산 시설이면 — 막 끝난 것은 아직일 수 있다)
    const runs = levelled.flatMap(
      (record) =>
        npc.economy
          ?.production(record.cityId ?? -1)
          .filter((entry) => entry.buildingId === record.buildingId)
          .map((entry) => [entry.facility.level, record.level]) ?? [],
    );
    expect(runs.some(([run, record]) => run === record && (record ?? 0) >= 2)).toBe(true);
    expect(await world.checkInvariants()).toEqual([]);
  });
});
