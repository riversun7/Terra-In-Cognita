// NPC 도시 증축 DB 통합 시험(기획 D-534 — 질문 1101 나 "유저와 같은 규칙", npc/cityBuild.ts) + NPC 휴먼 몸(질문 1106 가) — TEST_DATABASE_URL이
// 있을 때만. 값은 모두 시험용 가짜다. 도시 경제가 도는 세계를 켜고 NPC 도시 창고에 짓기 재료를 넣은 뒤 판단을 몇 번 돌리면:
// 1. NPC 도시가 전략 배치 자리에 건물을 놓고(레벨 0 + 짓기 작업 — 플레이어 짓기와 같은 줄) 재료가 창고에서 빠진다.
// 2. 작업이 끝나면 다음 판단에 도시 경제 생산 시설로 든다(생산 시설인 경우). 다시 켜도 건물·작업 줄이 그대로다.
// 3. NPC 도시 휴먼은 모두 크기 1·걷기다.
import { loadContentPack } from "@terra/content/node";
import { DAY_MS, HOUR_MS, TEST_SOCIETY_COEFFICIENTS, WALK_SPEED } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { economyCatalogFromPack } from "../economyView/catalog.ts";
import { serverEconomyCatalogAccessor } from "../market/catalog.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase } from "../testDb.ts";
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
/** 국가마다 도시 하나, 판단 1시간마다(시험을 짧게) */
const RULES = {
  ...TEST_SOCIETY_COEFFICIENTS,
  worldSeed: { ...TEST_SOCIETY_COEFFICIENTS.worldSeed, startCitiesMin: 1, startCitiesMax: 1 },
  // 도시 등급 상한(질문 1143 나)은 첫 하루 끝 전 발전도 0 = 등급 1이라 씨앗 도시가 이미 넘는다 → 이 시험은 모든 등급 16(옛 한 값)
  npc: {
    ...TEST_SOCIETY_COEFFICIENTS.npc,
    decideEveryMs: HOUR_MS,
    buildCapByGrade: [16, 16, 16, 16, 16, 16],
  },
};
/** 채울 재료와 수량 배율: 석재·잡석은 1g 기본 단위(팩 core@137)라 qty를 kg으로 보고 × 1,000 */
const MATERIALS: ReadonlyMap<string, bigint> = new Map([
  ["pine_log", 1n],
  ["stone", 1000n],
  ["rubble", 1000n],
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

function parts(world: World) {
  const persistence = world.persistence;
  const npc = world.npc;
  if (!persistence || !npc?.economy) throw new Error("world");
  return { persistence, npc };
}

/** NPC 도시 창고 짓기 재료를 그 양까지 채운다(시험값 — 도시 거래 판단이 남는 물건을 팔아도 판단 때 재료가 있게) */
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

/** 15분씩 민다(끝난 짓기 작업도 그 시각으로 적용한다). refill이면 재료를 채운 뒤 민다 */
async function advance(world: World, ms: number, refill = false): Promise<void> {
  const { persistence, npc } = parts(world);
  for (let passed = 0; passed < ms; passed += 15 * 60_000) {
    if (refill) stock(world, 200n);
    clock += 15 * 60_000;
    persistence.facilities.service.finishDue(clock);
    await npc.tick();
  }
  await persistence.writer.durable();
}

describe.skipIf(!TEST_DATABASE_URL)("NPC 도시 증축 (DB, 질문 1101 나)", () => {
  it("재료가 있으면 전략 배치 자리에 짓기 작업을 걸고, 다 지은 생산 시설은 도시 경제에 든다. 휴먼은 크기 1·걷기", async () => {
    const world = await boot();
    const { persistence, npc } = parts(world);
    const service = persistence.facilities.service;
    const before = new Set(service.facilities.keys());
    const stockOf = () => {
      let total = 0n;
      for (const [cityId, city] of npc.world.cities)
        for (const item of MATERIALS.keys())
          total += persistence.ledger.balanceOf(city.owner, `item:${item}`, cityId);
      return total;
    };
    stock(world, 200n);
    const stocked = stockOf();
    await advance(world, 3 * HOUR_MS, true);

    const added = [...service.facilities.values()].filter((record) => !before.has(record.buildingId));
    expect(added.length).toBeGreaterThan(0);
    for (const record of added) {
      expect(record.builtBy).toBeNull();
      expect(record.cityId).not.toBeNull();
      const owner = npc.world.cities.get(record.cityId ?? -1)?.owner;
      expect([...world.maps.values()].some((map) => map.buildingOwner(record.buildingId) === owner)).toBe(
        true,
      );
    }
    // 재료는 창고에서 빠졌다(플레이어 짓기와 같은 facility_build 거래 — 소멸 계정 sink로)
    expect(stocked).toBeGreaterThan(0n);
    const sunk = persistence.ledger.balance(
      persistence.ledger.systemAccount("sink:item:pine_log", "item:pine_log"),
    );
    expect(sunk).toBeGreaterThan(0n);

    // 작업이 끝난 생산 시설은 다음 판단 뒤 도시 경제 생산에 든다
    await advance(world, 3 * HOUR_MS);
    const done = added.filter((record) => record.level >= 1);
    expect(done.length).toBeGreaterThan(0);
    const producing = done.filter((record) =>
      npc.economy?.production(record.cityId ?? -1).some((run) => run.buildingId === record.buildingId),
    );
    // 나라 성격 목표(질문 1142 다)로 가공·완제품 시설(주방 등)도 서고 그 특산을 돌린다
    const producingKinds = new Set(
      "farm lumber_camp mine herb_field ranch fishing_spot kitchen smelter workshop sawmill kiln".split(" "),
    );
    expect(producing.length).toBe(done.filter((record) => producingKinds.has(record.facilityId)).length);
    // 특산이 건물로 옮겨 갔다: 지은 가공·완제품 시설은 그 나라 특산 레시피를 돌린다(도시 직무가 아니라 건물 ID로)
    const moved = done.filter((entry) =>
      ["kitchen", "smelter", "workshop", "sawmill"].includes(entry.facilityId),
    );
    for (const record of moved) {
      const runs = npc.economy?.production(record.cityId ?? -1) ?? [];
      expect(runs.find((run) => run.buildingId === record.buildingId)?.facility.recipe.facility).toBe(
        record.facilityId,
      );
      // 그 시설 특산 줄이 하나뿐인 나라(시험 프리셋)는 도시 직무로 남은 그 시설이 없다
      expect(
        runs.filter((run) => run.buildingId === null && run.facility.recipe.facility === record.facilityId),
      ).toEqual([]);
    }

    // NPC 도시 휴먼은 모두 크기 1·걷기(질문 1106 가)
    for (const unitId of npc.world.units.keys()) {
      const info = [...world.maps.values()].map((map) => map.unitInfo(unitId)).find(Boolean);
      expect(info).toMatchObject({ size: 1, speed: WALK_SPEED });
    }
    expect(await world.checkInvariants()).toEqual([]);

    // 다시 켜도 건물·시설 줄이 그대로다
    const ids = added.map((record) => record.buildingId);
    await world.stop();
    worlds.splice(worlds.indexOf(world), 1);
    const again = await boot();
    const service2 = parts(again).persistence.facilities.service;
    for (const id of ids) expect(service2.facilities.get(id)).toBeDefined();
  });
});
