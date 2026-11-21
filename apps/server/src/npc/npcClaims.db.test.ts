// 서버 NPC 빈 2차맵 알박기 DB 통합 시험(npc-claim-3, npc/npcClaims.ts — 질문 2331 가·2333 가) — TEST_DATABASE_URL이 있을 때만. 값은 모두 시험용
// 가짜다. 도시 경제가 도는 세계를 켜고 NPC 도시 창고에 행정 건물 재료를 넣은 뒤 판단을 돌리면:
// 1. 설정 칸 npc_claim_server가 0이면 아무것도 하지 않는다.
// 2. 1이면 내 도시 2차맵 이웃의 빈 2차맵에 레벨 0·도시 없는 행정 건물을 놓고, 재료는 바로 빠지지 않고 운반 일로 그 건물 창고에 닿는다(순간이동 없음).
// 3. 닿으면 짓기 작업이 걸리고(재료는 그 건물 창고에서 빠진다), 다 지으면 그 2차맵에 새 도시가 선다(ruins/landClaim.ts foundPending) — D-580: 주인은
//    지은 세력에서 태어난 새 NPC 가문(봉신이면 상위 = 지은 세력), 지분 1,000주·알박기 도시 줄 설립자 = 그 가문. 1분 지표에 알박기 수.
import { loadContentPack } from "@terra/content/node";
import { DAY_MS, HOUR_MS, type SocietyCoefficients, TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import { buildingLocation } from "@terra/shared/goodsPlaces";
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
/** 국가마다 도시 하나, 판단 1시간마다, 증축 끔(재료를 알박기만 쓰게), 알박기는 늘 가장 높은 점수·조건 낮춤 */
function rulesWith(server: number): SocietyCoefficients {
  return {
    ...TEST_SOCIETY_COEFFICIENTS,
    worldSeed: { ...TEST_SOCIETY_COEFFICIENTS.worldSeed, startCitiesMin: 1, startCitiesMax: 1 },
    npc: {
      ...TEST_SOCIETY_COEFFICIENTS.npc,
      decideEveryMs: HOUR_MS,
      buildMaxBuildings: 0,
      claimServer: server,
      claimScore: 1_000_000,
      claimHumansPerCity: 0,
      claimCooldownDays: 0,
      claimMaxActive: 1,
      claimMaxCities: 50,
      claimRadius: 1,
    },
  };
}
const MATERIALS = ["pine_log", "stone"];

let test: TestDatabase;
const worlds: World[] = [];
let clock = 0;
let rules = rulesWith(0);

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
  clock = 1_800_000_000_000 - (1_800_000_000_000 % DAY_MS) + 3 * HOUR_MS;
  rules = rulesWith(0);
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

/** step씩 민다(끝난 짓기 작업도 그 시각으로 적용한다) */
async function advance(world: World, ms: number, step = 15 * 60_000): Promise<void> {
  const { persistence, npc } = parts(world);
  for (let passed = 0; passed < ms; passed += step) {
    clock += step;
    persistence.facilities.service.finishDue(clock);
    await npc.tick();
  }
  await persistence.writer.durable();
}

/** 도시 없는 행정 건물(알박기 중) 줄 */
function claimRecords(world: World) {
  const { persistence } = parts(world);
  const service = persistence.facilities.service;
  return [...service.facilities.values()].filter(
    (record) =>
      record.cityId === null && service.places.catalog().facility(record.facilityId)?.stage === "government",
  );
}

describe.skipIf(!TEST_DATABASE_URL)("서버 NPC 빈 2차맵 알박기 (DB, npc-claim-3)", () => {
  it("끄면 짓지 않고, 켜면 빈 2차맵에 행정 건물 → 재료 운반 → 짓기 → 지은 NPC 가문의 새 도시(D-580)", async () => {
    const world = await boot();
    const { persistence, npc } = parts(world);
    const service = persistence.facilities.service;
    stock(world, 200n);
    await advance(world, 3 * HOUR_MS);
    expect(claimRecords(world)).toEqual([]);

    rules = rulesWith(1);
    const citiesBefore = new Set(npc.world.cities.keys());
    let claim = claimRecords(world)[0];
    for (let hour = 0; hour < 6 && !claim; hour++) {
      stock(world, 200n);
      await advance(world, HOUR_MS);
      claim = claimRecords(world)[0];
    }
    expect(claim).toBeDefined();
    if (!claim) return;
    expect(claim.level).toBe(0);
    // 놓은 2차맵은 도시·폐허가 없는 2차맵이고, 주인은 NPC 세력이다
    let mapKey = -1;
    let owner: number | null | undefined;
    for (const map of world.maps.values()) {
      const found = map.buildingOwner(claim.buildingId);
      if (found !== undefined) {
        mapKey = map.mapKey;
        owner = found;
      }
    }
    expect(owner).not.toBeNull();
    expect(npc.world.factions.has(owner ?? -1)).toBe(true);
    expect(service.places.cities().some((cell) => cell.mapKey === mapKey)).toBe(false);
    // 운반이 닿을 때까지 짓기 작업이 없다(재료는 아직 그 건물 창고에 없다 — 순간이동 없음)
    const job = () => [...service.jobs.values()].find((entry) => entry.buildingId === claim.buildingId);
    const at = buildingLocation(claim.buildingId);
    expect(job()).toBeUndefined();
    expect(persistence.ledger.balanceOf(owner ?? -1, "item:pine_log", at)).toBe(0n);
    // 닿으면 짓기 작업(재료는 그 건물 창고에서 빠진다)
    for (let hour = 0; hour < 72 && !job(); hour++) await advance(world, HOUR_MS, HOUR_MS);
    expect(job()?.kind).toBe("build");
    expect(persistence.ledger.balanceOf(owner ?? -1, "item:pine_log", at)).toBe(0n);
    // 다 지으면 그 2차맵에 새 도시 — D-580: 지은 세력이 아니라 새 NPC 가문 세력(봉신이면 상위 = 지은 세력), 지분 1,000주 = 그 가문
    const founded = () =>
      [...npc.world.cities.entries()].find(
        ([id]) => !citiesBefore.has(id) && npc.places.get(id)?.mapKey === mapKey,
      );
    for (let hour = 0; hour < 24 * 14 && !founded(); hour++) await advance(world, HOUR_MS, HOUR_MS);
    const [cityId, city] = founded() ?? [-1, undefined];
    expect(city).toBeDefined();
    expect(service.facilities.get(claim.buildingId)?.cityId).toBe(cityId);
    const house = npc.world.factions.get(city?.owner ?? -1);
    expect(house?.alive).toBe(true);
    expect(house?.id).not.toBe(owner);
    expect(house?.bornOf).toBe(owner);
    expect([null, owner]).toContain(house?.overlord);
    expect(persistence.ledger.balanceOf(house?.id ?? -1, `share_${String(cityId)}`)).toBe(1000n);
    expect(persistence.ledger.balanceOf(owner ?? -1, `share_${String(cityId)}`)).toBe(0n);
    // 저장: 새 가문 세력 행·도시 행·알박기 도시 줄(설립자 = 그 가문)
    await persistence.writer.durable();
    const row = await test.db.$client.query<{ founder_owner_id: string }>(
      "select founder_owner_id from claim_cities where city_id = $1",
      [cityId],
    );
    expect(Number(row.rows[0]?.founder_owner_id)).toBe(house?.id);
    // 1분 지표: 알박기 수(시작·다 지음)
    const metrics = npc.takeMetrics();
    expect(metrics.npcClaimFounded).toBeGreaterThanOrEqual(1);
    expect(typeof metrics.npcClaimActive).toBe("number");
  }, 180_000);
});
