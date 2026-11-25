// NPC 시설 일자리 DB 통합 시험(docs/adr/2026-11-25-npc-facility-jobs.md) — TEST_DATABASE_URL이 있을 때만. 계정·값은 시험용 가짜다.
// NPC 나라가 채집 시설에 낸 일자리를 플레이어 사이보그 본체가 받아 임금형 계약을 맺고, 임금이 그 자원 값의 상한 안이며 실제로 들어오는지 본다.
import { loadContentPack } from "@terra/content/node";
import { DEFAULT_CYBORG_APPEARANCE } from "@terra/shared/cyborg";
import { DAY_MS, HOUR_MS, TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { economyCatalogFromPack } from "../economyView/catalog.ts";
import { serverEconomyCatalogAccessor } from "../market/catalog.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { legacyNationPresets, silentLog } from "../world/testSupport.ts";
import { type World, startWorld } from "../world/world.ts";
import { npcJobValueOf } from "./npcJobValue.ts";
import { NPC_JOB_MARGIN_PM, npcJobBudget } from "./npcJobs.ts";
import { nationPresetsOf } from "./presets.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source || !loaded.pack) throw new Error("content pack");
const pack = createContentEditState(loaded.source).effective();
const presets = legacyNationPresets(nationPresetsOf(loaded.pack));
const economy = serverEconomyCatalogAccessor(
  economyCatalogFromPack(loaded.pack, { version: "core@test", placeholder: true }),
  () => pack,
);
const ONE_CITY = {
  ...TEST_SOCIETY_COEFFICIENTS,
  worldSeed: { ...TEST_SOCIETY_COEFFICIENTS.worldSeed, startCitiesMin: 1, startCitiesMax: 1 },
};
const valueOf = npcJobValueOf(
  () => ({
    facilities: pack.facilities,
    gatherTiers: pack.gatherTiers,
    itemSubcategories: pack.itemSubcategories,
    items: pack.items,
    kinds: [],
  }),
  () => ONE_CITY,
);

let test: TestDatabase;
const worlds: World[] = [];
let clock = 0;

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
  clock = 1_800_000_000_000 - (1_800_000_000_000 % DAY_MS) + HOUR_MS;
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  for (const world of worlds.splice(0)) await world.stop().catch(() => undefined);
  await test.drop();
});

async function boot(): Promise<World> {
  const world = startWorld({
    testBots: 30,
    paths: { kind: "inline" },
    now: () => clock,
    log: silentLog,
    pool: test.db.$client,
    writeIntervalMs: 10,
    onFatal: (error) => {
      throw error;
    },
    npc: { testNations: 3, manual: true, presets },
    cyborgRules: () => ONE_CITY,
    holdings: { content: () => pack },
    facilities: { content: () => pack },
    economy,
    npcJobValue: valueOf,
  });
  worlds.push(world);
  await world.ready;
  return world;
}

describe.skipIf(!TEST_DATABASE_URL)("NPC 시설 일자리", () => {
  it("NPC 나라가 채집 시설에 자원 값 안의 임금으로 일자리를 내고, 플레이어 본체가 받아 임금을 받는다", async () => {
    const world = await boot();
    const persistence = world.persistence;
    const jobs = world.npcJobs;
    const econ = world.npc?.economy;
    if (!persistence || !jobs || !econ) throw new Error("npc jobs");
    const { labor, ledger, writer, cyborgs } = persistence;
    const first = jobs.tick(clock);
    await writer.durable();
    expect(first.open).toBeGreaterThan(0);
    expect(first.posted).toBe(first.open);
    // 낸 일자리마다: 주인 = 그 도시 나라, 임금 ≤ 그 시설 기대 금액에서 NPC 몫을 뺀 값
    const sites = new Map(econ.shops().map((site) => [site.buildingId, site]));
    const posted = await rows<{ building_id: string; owner_id: string; adjust_pm: number; slots: number }>(
      test.db,
      "select building_id, owner_id, adjust_pm, slots from labor_postings where state = 'open' order by id",
    );
    expect(posted.length).toBe(first.open);
    for (const row of posted) {
      const site = sites.get(Number(row.building_id));
      if (!site) throw new Error("posting outside npc facilities");
      expect(Number(row.owner_id)).toBe(site.owner);
      const value = valueOf(site, (item) => econ.lastPrice(site.cityId, `item:${item}`)) ?? 0n;
      const terms = labor.npcJobs.terms(row.adjust_pm);
      expect(terms.wage).toBeGreaterThan(0n);
      expect(terms.wage).toBeLessThanOrEqual(npcJobBudget(value, terms.cycleMs, NPC_JOB_MARGIN_PM));
    }
    // 플레이어: 일자리가 난 도시에서 시작해 본체로 받는다
    const found = await rows<{ id: string }>(
      test.db,
      `insert into users (name, email, username) values ($1, $2, $3) returning id`,
      ["Job_Taker", "job_taker@id.placeholder.invalid", "job_taker"],
    );
    const userId = String(found[0]?.id);
    // 가입비를 받는 나라에서는 시작할 수 없다 → 시작할 수 있는 나라의 도시에 난 일자리를 고른다
    const creation = cyborgs.creation(userId, clock, { entryFees: await cyborgs.startFees() });
    const startable = creation.factions.filter((entry) => entry.entryFee === undefined);
    const target = posted
      .map((row) => sites.get(Number(row.building_id)))
      .find(
        (site) =>
          site !== undefined &&
          startable.some((entry) => entry.cities.some((city) => city.id === site.cityId)),
      );
    if (!target) throw new Error("no job site in a startable nation");
    const faction = startable.find((entry) => entry.cities.some((city) => city.id === target.cityId));
    if (!faction) throw new Error("job city is not a start city");
    await cyborgs.roll(userId, "combat");
    expect(
      await cyborgs.create(userId, {
        name: "Worker",
        appearance: DEFAULT_CYBORG_APPEARANCE,
        factionId: faction.id,
        cityId: target.cityId,
        elements: { fire: 6, wind: 4 },
      }),
    ).toEqual({ ok: true });
    const unitId = cyborgs.record(userId)?.unitId;
    if (unitId === undefined || unitId === null) throw new Error("no body unit");
    const board = labor.jobs(userId, { buildingId: target.buildingId });
    const job = board.jobs[0];
    if (!job) throw new Error("npc job not on the board");
    expect(job.own).toBe(false);
    const me = persistence.settlement.findOwnerOfUser(userId);
    if (me === undefined) throw new Error("no owner");
    const asset = persistence.facilities.money(target.buildingId);
    const before = ledger.balanceOf(me, asset);
    const accepted = await labor.acceptJob(userId, job.id, unitId);
    expect(accepted).toMatchObject({ ok: true });
    const contract = [...labor.contracts.values()].find((c) => c.unitId === unitId);
    if (!contract) throw new Error("no contract");
    expect(contract.ownerId).toBe(target.owner);
    expect(contract.asset).toBe(asset);
    expect(contract.rate).toBe(BigInt(job.wage));
    // 첫 임금은 맺을 때 선불로 들어온다(본체 = 플레이어 지갑). 보증금은 NPC 시설 금고에서 묶였다
    expect(ledger.balanceOf(me, asset)).toBe(before + contract.rate);
    expect(contract.deposit).toBeGreaterThan(0n);
    // 임금 주기 둘이 지나면 임금이 더 들어온다(그 사이 본체 생활비는 나간다 — 받은 임금 합으로 본다)
    clock += 2 * labor.npcJobs.terms(job.adjustPm).cycleMs + HOUR_MS;
    persistence.settlement.settleOwner(me, clock);
    await writer.durable();
    expect(contract.paidTotal).toBeGreaterThanOrEqual(3n * contract.rate);
    expect(contract.state).toBe("active");
    // 다음 점검: 일하는 시설의 창고 물건을 걷고(있으면), 남은 자리로 게시를 맞춘다
    const second = jobs.tick(clock);
    await writer.durable();
    expect(second.open).toBeGreaterThanOrEqual(0);
    expect(labor.check()).toEqual([]);
    expect(await world.checkInvariants()).toEqual([]);
  });
});
