// 사이보그 유닛 융합·유전자 조각 DB 통합 시험(D-470·D-478, 49 N46·N47) — TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
// 융합(휴먼 + 화폐·재료 → 같은 유닛이 사이보그 유닛, 휴먼 행 지움·사이보그 유닛 행, 유지비 무게), 유전자 환생(수명이 다한 휴먼 +
// 조각 → 레벨 1·수명 다시·환생 +1·스탯 +조각), 사망 조각(NPC 휴먼이 수명으로 죽으면 그 세력이 조각을 받는다)을 본다.
import { loadContentPack } from "@terra/content/node";
import {
  DAY_MS,
  OLD_FUSION_COEFFICIENTS,
  TEST_SOCIETY_COEFFICIENTS,
  TEST_UPKEEP_PER_UNIT,
  UPKEEP_PERIOD_MS,
  fuseStats,
  partsDonorStats,
} from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { createWorldRosterSource } from "../roster/worldUnits.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { silentLog } from "../world/testSupport.ts";
import { ASSET_CREDIT, SYSTEM_ISSUE_CREDIT } from "../world/settlement.ts";
import { UNIT_KIND_CYBORG_UNIT, UNIT_KIND_HUMAN } from "../world/unitKinds.ts";
import { type World, type WorldConfig, startWorld } from "../world/world.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source) throw new Error("content pack");
const pack = createContentEditState(loaded.source).effective();

let test: TestDatabase;
const worlds: World[] = [];
let clock = 0;

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
  // UTC 0시에서 한 시간 뒤(하루 끝·12시간 창 경계와 멀게)
  clock = 1_800_000_000_000 - (1_800_000_000_000 % DAY_MS) + 3_600_000;
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  for (const world of worlds.splice(0)) await world.stop().catch(() => undefined);
  await test.drop();
});

async function boot(extra: Partial<WorldConfig> = {}, testBots = 12): Promise<World> {
  const world = startWorld({
    testBots,
    paths: { kind: "inline" },
    now: () => clock,
    log: silentLog,
    pool: test.db.$client,
    writeIntervalMs: 10,
    onFatal: (error) => {
      throw error;
    },
    npc: { testNations: 2, manual: true },
    holdings: { content: () => pack },
    ...extra,
  });
  worlds.push(world);
  await world.ready;
  return world;
}

function persistenceOf(world: World) {
  const found = world.persistence;
  if (!found) throw new Error("persistence");
  return found;
}

async function fakeUser(name: string): Promise<string> {
  const found = await rows<{ id: string }>(
    test.db,
    `insert into users (name, email, username) values ($1, $2, $3) returning id`,
    [name, `${name}@id.placeholder.invalid`, name.toLowerCase()],
  );
  return String(found[0]?.id);
}

/** 사이보그를 만들고 시험 화폐를 더 준 뒤, 가장 싼 구인 카드로 휴먼 하나를 고용한다 */
async function withHuman(world: World, name: string, credit: bigint) {
  const persistence = persistenceOf(world);
  const userId = await fakeUser(name);
  const creation = persistence.cyborgs.creation(userId, clock);
  const faction = creation.factions[0];
  const city = faction?.cities[0];
  if (!faction || !city) throw new Error("no start city");
  await persistence.cyborgs.roll(userId, "balanced");
  const made = await persistence.cyborgs.create(userId, {
    name,
    appearance: {
      head: "dome",
      face: "visor",
      body: "slim",
      limbs: "piston",
      primary: "mint",
      accent: "lemon",
    },
    factionId: faction.id,
    cityId: city.id,
    elements: { fire: 6, wind: 4 },
  });
  if (!made.ok) throw new Error(`cyborg ${made.code}`);
  const ownerId = persistence.settlement.ownerOfUser(userId, clock).id;
  persistence.ledger.post({
    kind: "issue",
    atMs: clock,
    entries: [
      { account: persistence.ledger.systemAccount(SYSTEM_ISSUE_CREDIT, ASSET_CREDIT), amount: -credit },
      { account: persistence.ledger.ownerAccount(ownerId, ASSET_CREDIT), amount: credit },
    ],
  });
  const board = persistence.recruits.board({ id: userId, owner: false }, undefined, clock);
  if (!board || board.cityId === null) throw new Error("no board");
  const card = board.cards.toSorted((a, b) => Number(BigInt(a.cost) - BigInt(b.cost)))[0];
  if (!card) throw new Error("no card");
  const hired = await persistence.recruits.hire(userId, {
    cityId: board.cityId,
    window: board.window,
    slot: card.slot,
    cost: card.cost,
  });
  if (!hired.ok) throw new Error(`hire ${hired.code}`);
  await persistence.writer.durable();
  const stats = [
    card.stats.str,
    card.stats.dex,
    card.stats.agi,
    card.stats.vit,
    card.stats.int,
    card.stats.wis,
  ];
  return { userId, ownerId, unitId: hired.unitId, stats };
}

describe.skipIf(!TEST_DATABASE_URL)("사이보그 유닛 융합(D-470)", () => {
  it("휴먼 + 화폐·재료 → 같은 유닛이 사이보그 유닛(종류 5), 휴먼 행 지움·사이보그 유닛 행, 다시 켜도 남는다", async () => {
    const world = await boot();
    const persistence = persistenceOf(world);
    const { fusion, ledger } = persistence;
    const { userId, ownerId, unitId, stats } = await withHuman(world, "FuseOne", 20_000n);
    const view = await fusion.overview({ id: userId, devGrant: true }, clock);
    expect(view.status).toBe("ready");
    expect(view.rules.currency).toBe("5000");
    expect(view.rules.materials.map((m) => [m.item, m.qty, m.have])).toEqual([
      ["titanium_ingot", 50, "0"],
      ["microchip", 20, "0"],
    ]);
    expect(view.humans.map((h) => [h.unitId, h.stats])).toEqual([[unitId, stats]]);
    // 거절: 본 값이 다름, 재료 없음, 내 유닛 아님
    expect(await fusion.fuse(userId, { human: unitId, cost: "4999" })).toEqual({
      ok: false,
      code: "cost_changed",
    });
    expect(await fusion.fuse(userId, { human: unitId, cost: "5000" })).toEqual({
      ok: false,
      code: "insufficient_materials",
    });
    expect(await fusion.fuse(userId, { human: 999_999, cost: "5000" })).toEqual({
      ok: false,
      code: "unknown_unit",
    });
    expect(await fusion.devGrant(userId, { item: "titanium_ingot", quantity: 50 })).toEqual({ ok: true });
    expect(await fusion.devGrant(userId, { item: "microchip", quantity: 20 })).toEqual({ ok: true });
    // 장비는 쌓이는 물자가 아니다(보유 물건 dev_grant_item)
    expect(await fusion.devGrant(userId, { item: "test_sword", quantity: 1 })).toEqual({
      ok: false,
      code: "unknown_item",
    });
    const before = ledger.balanceOf(ownerId, ASSET_CREDIT);
    const fused = await fusion.fuse(userId, { human: unitId, cost: "5000" });
    if (!fused.ok || fused.bonusPm === undefined) throw new Error("fuse failed");
    expect(fused.unitId).toBe(unitId);
    expect(fused.bonusPm).toBeGreaterThanOrEqual(1050);
    expect(fused.bonusPm).toBeLessThanOrEqual(1150);
    expect(fused.stats).toEqual(
      fuseStats(stats, partsDonorStats(OLD_FUSION_COEFFICIENTS), fused.bonusPm, OLD_FUSION_COEFFICIENTS),
    );
    expect(ledger.balanceOf(ownerId, ASSET_CREDIT)).toBe(before - 5000n);
    expect(ledger.balanceOf(ownerId, "titanium_ingot")).toBe(0n);
    expect(ledger.balanceOf(ownerId, "microchip")).toBe(0n);
    // 같은 유닛은 이제 휴먼이 아니다
    expect(await fusion.fuse(userId, { human: unitId, cost: "5000" })).toEqual({
      ok: false,
      code: "wrong_kind",
    });
    await persistence.writer.durable();
    const unitRows = await rows<{ kind: string }>(test.db, `select kind from world_units where id = $1`, [
      unitId,
    ]);
    expect(unitRows.map((r) => Number(r.kind))).toEqual([UNIT_KIND_CYBORG_UNIT]);
    expect(await rows(test.db, `select unit_id from world_humans where unit_id = $1`, [unitId])).toEqual([]);
    const saved = await rows<{ stats: number[]; human_stats: number[]; donor: string; bonus_pm: number }>(
      test.db,
      `select stats, human_stats, donor, bonus_pm from cyborg_units where unit_id = $1`,
      [unitId],
    );
    expect(saved[0]?.stats.map(Number)).toEqual(fused.stats);
    expect(saved[0]?.human_stats.map(Number)).toEqual(stats);
    expect(saved[0]?.donor).toBe("parts");
    expect(Number(saved[0]?.bonus_pm)).toBe(fused.bonusPm);
    const after = await fusion.overview({ id: userId, devGrant: false }, clock);
    expect(after.humans).toEqual([]);
    expect(after.cyborgUnits.map((c) => [c.unitId, c.stats])).toEqual([[unitId, fused.stats]]);
    // 유닛 화면 종류 = cyborg
    const roster = await createWorldRosterSource(world).read(userId, clock);
    expect(roster.units.find((u) => u.id === unitId)?.type).toBe("cyborg");
    expect(await world.checkInvariants()).toEqual([]);
    // 다시 켜면 사이보그 유닛 그대로
    await world.stop();
    worlds.splice(worlds.indexOf(world), 1);
    const again = await boot();
    const reloaded = [...again.maps.values()].map((map) => map.unitInfo(unitId)).find((info) => info);
    expect(reloaded?.kind).toBe(UNIT_KIND_CYBORG_UNIT);
  });

  it("사이보그 유닛은 유지비 무게 n46_upkeep(3000‰): 본체 + 사이보그 유닛 = 유닛당 유지비 × 4", async () => {
    const world = await boot();
    const persistence = persistenceOf(world);
    const { userId, ownerId, unitId } = await withHuman(world, "FuseUpkeep", 20_000n);
    await persistence.fusion.devGrant(userId, { item: "titanium_ingot", quantity: 50 });
    await persistence.fusion.devGrant(userId, { item: "microchip", quantity: 20 });
    const fused = await persistence.fusion.fuse(userId, { human: unitId, cost: "5000" });
    expect(fused.ok).toBe(true);
    persistence.settlement.settleOwner(ownerId, clock);
    const before = persistence.ledger.balanceOf(ownerId, ASSET_CREDIT);
    // 다음 유지비 경계 하나를 지나게
    clock = (Math.floor(clock / UPKEEP_PERIOD_MS) + 1) * UPKEEP_PERIOD_MS + 1;
    const report = persistence.settlement.settleOwner(ownerId, clock);
    expect(report.upkeepPaid).toBe(1);
    expect(before - persistence.ledger.balanceOf(ownerId, ASSET_CREDIT)).toBe(
      (TEST_UPKEEP_PER_UNIT * 4000n) / 1000n,
    );
  });
});

describe.skipIf(!TEST_DATABASE_URL)("유전자 조각(D-478)", () => {
  it("유전자 환생: 수명이 다한 휴먼 + 휴먼 스탯 유전자 max(1, ⌈레벨 ÷ 10⌉)개 → 레벨 1·수명 다시·환생 +1·스탯 +1", async () => {
    const world = await boot();
    const persistence = persistenceOf(world);
    const { fusion, ledger } = persistence;
    const { userId, ownerId, unitId, stats } = await withHuman(world, "GeneOne", 2_000n);
    const view = await fusion.overview({ id: userId, devGrant: true }, clock);
    const human = view.humans[0];
    expect(human?.rebirthShards).toBe(1);
    expect(view.genes.map((g) => g.item)).toEqual([
      "gene_skill_creature",
      "gene_skill_human",
      "gene_stat_creature",
      "gene_stat_human",
    ]);
    expect(await fusion.rebirth(userId, { unit: unitId, shards: 1 })).toEqual({ ok: false, code: "alive" });
    // 수명이 다하게(DB 행을 바로 고친다: 유저 휴먼의 수명은 서버가 아직 돌리지 않는다)
    await test.db.$client.query(
      `update world_humans set born_at_ms = $1, lifespan_ms = 1000 where unit_id = $2`,
      [clock - 10_000, unitId],
    );
    expect(await fusion.rebirth(userId, { unit: unitId, shards: 1 })).toEqual({
      ok: false,
      code: "insufficient_genes",
    });
    expect(await fusion.rebirth(userId, { unit: unitId, shards: 2 })).toEqual({
      ok: false,
      code: "cost_changed",
    });
    expect(await fusion.devGrant(userId, { item: "gene_stat_human", quantity: 3 })).toEqual({ ok: true });
    const reborn = await fusion.rebirth(userId, { unit: unitId, shards: 1 });
    if (!reborn.ok || !reborn.stats) throw new Error("rebirth failed");
    expect(reborn.shards).toBe(1);
    expect(reborn.stats.reduce((a, b) => a + b, 0)).toBe(stats.reduce((a, b) => a + b, 0) + 1);
    expect(ledger.balanceOf(ownerId, "gene_stat_human")).toBe(2n);
    await persistence.writer.durable();
    const saved = await rows<{
      level: number;
      rebirths: number;
      born_at_ms: string;
      lifespan_ms: string;
      stats: number[];
    }>(
      test.db,
      `select level, rebirths, born_at_ms, lifespan_ms, stats from world_humans where unit_id = $1`,
      [unitId],
    );
    expect(Number(saved[0]?.level)).toBe(1);
    expect(Number(saved[0]?.rebirths)).toBe(1);
    expect(Number(saved[0]?.born_at_ms)).toBe(clock);
    expect(Number(saved[0]?.lifespan_ms)).toBeGreaterThanOrEqual(TEST_SOCIETY_COEFFICIENTS.lifespanMinMs);
    expect(saved[0]?.stats.map(Number)).toEqual(reborn.stats);
    // 다시 수명이 생겼다
    expect(await fusion.rebirth(userId, { unit: unitId, shards: 1 })).toEqual({ ok: false, code: "alive" });
    const kind = await rows<{ kind: number }>(test.db, `select kind from world_units where id = $1`, [
      unitId,
    ]);
    expect(Number(kind[0]?.kind)).toBe(UNIT_KIND_HUMAN);
  });

  it("사망 조각: NPC 휴먼이 수명으로 죽으면 그 세력이 휴먼 스탯 유전자 조각 1개씩을 받는다(원장에 저장)", async () => {
    // 환생·신격화 0이면 모두 죽는다. 하루 끝(UTC 0시)을 지나게 시계를 맞춘다
    clock = 1_800_000_000_000 - (1_800_000_000_000 % DAY_MS) + DAY_MS - 60_000;
    const world = await boot({
      cyborgRules: () => ({ ...TEST_SOCIETY_COEFFICIENTS, rebirthPm: 0, deifyPm: 0 }),
    });
    const npc = world.npc;
    const persistence = persistenceOf(world);
    if (!npc) throw new Error("npc runtime");
    const owners = new Set([...npc.world.units.values()].map((unit) => unit.owner));
    const humans = npc.world.units.size;
    expect(humans).toBe(12);
    for (const unit of npc.world.units.values()) unit.bornAtMs = clock - unit.lifespanMs - 1;
    clock += 120_000;
    await npc.tick();
    await persistence.writer.durable();
    expect(npc.world.units.size).toBe(0);
    let total = 0n;
    for (const owner of owners) total += persistence.ledger.balanceOf(owner, "gene_stat_human");
    expect(total).toBe(BigInt(humans));
    // 크리쳐 조각은 휴먼 죽음에서 나오지 않는다
    for (const owner of owners) expect(persistence.ledger.balanceOf(owner, "gene_stat_creature")).toBe(0n);
    const saved = await rows<{ total: string }>(
      test.db,
      `select coalesce(sum(balance), 0) as total from ledger_accounts where owner_id is not null and asset = 'gene_stat_human'`,
    );
    expect(Number(saved[0]?.total)).toBe(humans);
    expect(await world.checkInvariants()).toEqual([]);
  });
});
