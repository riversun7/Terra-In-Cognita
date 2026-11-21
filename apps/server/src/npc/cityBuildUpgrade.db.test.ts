// NPC 도시 인구 상한·레벨 올리기·수리 DB 통합 시험(기획 D-535 — 질문 1131 나·1143 나·1146 나·1114 가, npc/cityBuild.ts·npc/cityRest.ts) —
// TEST_DATABASE_URL이 있을 때만. 값은 모두 시험용 가짜다.
// 1. 세계 씨앗이 세운 시설은 seeded(DB 칸도)이고, 씨앗 숙소 침대는 인구 상한에 들지 않는다(시작 도시 상한 = 주거). 씨앗 뒤에 지은 숙소는 든다.
// 2. 전투에서 깎인 시설(상태 문턱 아래)은 NPC가 플레이어 수리와 같은 재료·시간으로 가득까지 고친다.
// 3. 도시 등급 상한에 닿은 도시는 새로 짓지 않고 있는 시설의 레벨을 한 단계 올린다(팩 레벨 2 재료·짓는 시간).
// 4. (기획 D-540 — 질문 1186 나) 상한에 닿기 전 나라 목표에 제재소·가마가 들어 지어지고, 도시 경제가 일꾼을 주어 판자·벽돌 레시피를 돌린다.
// 5. (질문 1190 나) 막아 낸 정원사 웨이브의 행정 건물 피해는 세계에 남고(이긴 웨이브는 정원사 결과 규칙만) NPC가 고친다.
import { loadContentPack } from "@terra/content/node";
import { CONDITION_FULL } from "@terra/shared/facilityRuntime";
import { type BattleInit, DAY_MS, HOUR_MS, TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import { SIEGE_NEXUS_ID } from "@terra/sim/siegeArena";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { facilityPoints } from "../facilities/siegeLayout.ts";
import { economyCatalogFromPack } from "../economyView/catalog.ts";
import { serverEconomyCatalogAccessor } from "../market/catalog.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { type WorldBattleInit, applyBuildingDamage, waveSiegeTargets } from "../world/battleTargets.ts";
import type { BattleOutcome } from "../world/battles.ts";
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
/** 채울 재료와 수량 배율: 석재·잡석은 1g 기본 단위(팩 core@137)라 qty를 kg으로 보고 × 1,000 */
const MATERIALS: ReadonlyMap<string, bigint> = new Map([
  ["pine_log", 1n],
  ["stone", 1000n],
  ["rubble", 1000n],
  ["plank", 1n],
  ["brick", 1n],
]);

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

/**
 * 국가마다 도시 하나, 판단 1시간마다. capByGrade = 도시 등급별 건물 수 상한(시험값), supplyLead = 레벨 재료 가공 시설이 드는 거리(질문 1291 나,
 * 없으면 계수 기본값)
 */
async function boot(capByGrade: readonly number[], supplyLead?: number): Promise<World> {
  const rules = {
    ...TEST_SOCIETY_COEFFICIENTS,
    worldSeed: { ...TEST_SOCIETY_COEFFICIENTS.worldSeed, startCitiesMin: 1, startCitiesMax: 1 },
    npc: {
      ...TEST_SOCIETY_COEFFICIENTS.npc,
      decideEveryMs: HOUR_MS,
      buildCapByGrade: [...capByGrade],
      // 상한은 시험값 그대로(성향 몫 0). 성향 몫(D-572 simulator/npcGrowthTemper.ts — ±npc_build_cap_temper채)은 세계 시드(새 DB면 켤 때 무작위)와
      // 세력 성향에 따라 달라, 상한 1에 −1 이상이 붙으면 상한 0 = 증축·레벨 올리기 끔이 되어 레벨 올리기 시험이 시드 여섯에 하나꼴로 실패했다
      // (CI 359 — 시드 1~48 가운데 8개)
      buildCapTemper: 0,
      ...(supplyLead === undefined ? {} : { buildLevelSupplyLead: supplyLead }),
    },
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
    for (const [item, scale] of MATERIALS) {
      const asset = `item:${item}`;
      const gap = qty * scale - persistence.ledger.balanceOf(city.owner, asset, cityId);
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

  it("상한에 닿기 전 나라 목표에 제재소·가마가 들어 지어지고 판자·벽돌 레시피를 일꾼과 함께 돌린다(1186 나)", async () => {
    // 거리를 상한보다 크게 = 처음부터 목표에(1291 나 전과 같은 때 — 언제 드는지는 시뮬 시험 npcLevelSupply.test.ts가 본다)
    const world = await boot([32, 32, 32, 32, 32, 32], 32);
    const { persistence, npc } = parts(world);
    const service = persistence.facilities.service;
    const has = (cityId: number, facility: string) =>
      [...service.facilities.values()].some(
        (record) => record.cityId === cityId && record.facilityId === facility && record.level >= 1,
      );
    const cities = () => [...npc.world.cities.keys()];
    for (let step = 0; step < 96 && !cities().every((id) => has(id, "kiln") && has(id, "sawmill")); step++)
      await advance(world, HOUR_MS);
    // 가마·제재소를 지은 도시(지금 목록). 아래 2시간 동안 독립·새 도시로 생긴 도시는 건물이 없어 빼고 본다 — CI 2026-11-15 run 43717483290의
    // 239줄 실패는 그 2시간 사이 생긴 셋째 세력의 빈 도시를 다시 읽은 것이었다(재현: 시험 12번 가운데 1번, 새 도시 = 도시 직무만)
    const builtCities = cities();
    for (const cityId of builtCities) {
      expect(has(cityId, "sawmill")).toBe(true);
      expect(has(cityId, "kiln")).toBe(true);
    }
    // 다 지은 가마·제재소는 다음 판단에 도시 경제에 들어 첫 레시피(벽돌·판자)를 일꾼과 함께 돈다(시설마다 적어도 한 명)
    await advance(world, 2 * HOUR_MS);
    for (const cityId of builtCities) {
      const runs = npc.economy?.production(cityId) ?? [];
      const of = (facility: string) => runs.find((entry) => entry.facility.recipe.facility === facility);
      expect(of("kiln")?.facility.recipe.id).toBe("fire_bricks");
      expect(of("sawmill")?.facility.recipe.id).toBe("saw_planks");
      expect(of("kiln")?.facility.workers).toBeGreaterThan(0);
    }
    expect(await world.checkInvariants()).toEqual([]);
  });

  it("막아 낸 웨이브는 행정 건물을 깎아 세계에 남기고(수리 대상), 이긴 웨이브는 행정 건물을 깎지 않는다(1190 나)", async () => {
    const world = await boot([32, 32, 32, 32, 32, 32]);
    const { persistence, npc } = parts(world);
    const service = persistence.facilities.service;
    const halls = [...service.facilities.values()]
      .filter(
        (record) => record.facilityId === "government_hall" && npc.world.cities.has(record.cityId ?? -1),
      )
      .toSorted((a, b) => a.buildingId - b.buildingId);
    const [kept, broken] = halls;
    if (!kept || !broken) throw new Error("two city halls");
    /** 웨이브 공성 결과(넥서스 = 그 행정 건물, 시작 = 지금 내구도 점 → 끝 = 그 endPm‰). 편 1 = 웨이브 */
    const wave = (hall: number, winner: number, endPm: number) => {
      const record = service.facilities.get(hall);
      const def = record ? persistence.facilities.catalog().facility(record.facilityId) : undefined;
      if (!record || !def) throw new Error("hall");
      const start = facilityPoints(
        record,
        def.durability,
        clock,
        persistence.facilities.rules().facilityRuntime,
      );
      const end = Math.floor((start * endPm) / 1000);
      const init: BattleInit = {
        id: hall,
        kind: "siege",
        seed: 1,
        map: {
          size: 2,
          passable: new Uint8Array(4).fill(1),
          cover: new Uint8Array(4),
          height: new Int32Array(4),
          buildings: [{ id: SIEGE_NEXUS_ID, cells: [0], durability: start, nexus: true }],
        },
        sides: [
          { id: 1, faction: 0, defender: false, edge: 3 },
          { id: 2, faction: 9, defender: true, edge: 1 },
        ],
        parties: [],
        units: [],
      };
      const targets = waveSiegeTargets(
        new Map([[SIEGE_NEXUS_ID, hall]]),
        (id) => service.facilities.has(id),
        SIEGE_NEXUS_ID,
      );
      const outcome: BattleOutcome = {
        result: { winner, reason: winner === 1 ? "nexus" : "wipe", endTick: 1 },
        units: [],
        buildings: [{ id: SIEGE_NEXUS_ID, durability: end }],
      };
      const full: WorldBattleInit = { ...init, targets };
      return applyBuildingDamage(persistence.facilities.damage, full, outcome, clock);
    };
    const before = kept.conditionPpm;
    // 이긴 웨이브: 넥서스 0이어도 세계 행정 건물은 그대로(정원사 결과 규칙 D-230)
    expect(wave(kept.buildingId, 1, 0)).toEqual({ damaged: 0, ruined: 0, missing: 0 });
    expect(service.facilities.get(kept.buildingId)?.conditionPpm).toBe(before);
    // 막아 낸 웨이브: 넥서스가 지금 내구도의 10%로 끝나면 행정 건물이 그만큼 깎인다(문턱 700‰ 아래)
    expect(wave(broken.buildingId, 2, 100)).toEqual({ damaged: 1, ruined: 0, missing: 0 });
    const hit = service.facilities.get(broken.buildingId)?.conditionPpm ?? CONDITION_FULL;
    expect(hit).toBeLessThan(700_000);
    expect(hit).toBeGreaterThan(0);
    // 깎인 상태는 DB에도 남고, NPC 도시가 수리 작업을 건다(1189 — 플레이어 수리와 같은 재료·시간)
    await persistence.writer.durable();
    const saved = await rows<{ condition_ppm: number }>(
      test.db,
      `select condition_ppm from world_facilities where building_id = $1`,
      [broken.buildingId],
    );
    expect(Number(saved[0]?.condition_ppm)).toBe(hit);
    let sawRepair = false;
    for (let step = 0; step < 32 && !sawRepair; step++) {
      await advance(world, 15 * 60_000);
      sawRepair = [...service.jobs.values()].some(
        (job) => job.kind === "repair" && job.buildingId === broken.buildingId,
      );
    }
    expect(sawRepair).toBe(true);
    await advance(world, 8 * HOUR_MS);
    expect(service.facilities.get(broken.buildingId)?.conditionPpm).toBe(CONDITION_FULL);
    expect(await world.checkInvariants()).toEqual([]);
  });
});
