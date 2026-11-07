// 사이보그 유닛 융합·유전자 DB 통합 시험(D-470·D-478·D-516, 49 N46·N47) — TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
// 융합(휴먼 + 화폐·재료 → 같은 유닛이 사이보그 유닛, 휴먼 행 지움·사이보그 유닛 행, 유지비 무게), 유전자(수명이 다한 유저 휴먼 = 비활성 →
// 변환하면 스탯·스킬 유전자 인스턴스·지닌 물건 옮김·유닛 떠남(D-517), 합성, 주입·스킬 칸, 인큐베이터)를 본다.
import { loadContentPack } from "@terra/content/node";
import {
  DAY_MS,
  OLD_FUSION_COEFFICIENTS,
  TEST_UPKEEP_PER_UNIT,
  UPKEEP_PERIOD_MS,
  fuseStats,
  partsDonorStats,
} from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { carriedBy } from "../holdings/state.ts";
import { rosterCatalogOf } from "../roster/catalog.ts";
import { createWorldRosterSource } from "../roster/worldUnits.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { silentLog } from "../world/testSupport.ts";
import { ASSET_CREDIT, SYSTEM_ISSUE_CREDIT } from "../world/settlement.ts";
import { UNIT_KIND_CYBORG_UNIT, UNIT_KIND_HUMAN } from "../world/unitKinds.ts";
import { type World, type WorldConfig, startWorld } from "../world/world.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source) throw new Error("content pack");
const pack = createContentEditState(loaded.source).effective();
const rosterCatalog = rosterCatalogOf(loaded.source);

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

describe.skipIf(!TEST_DATABASE_URL)("유전자(D-478·D-516)", () => {
  it("수명이 다하면 비활성으로 남고(D-517), 변환하면 스탯 유전자 1 + 배운 스킬마다 스킬 유전자, 지닌 물건은 본체로, 유닛은 떠난다, 다시 켜도 값이 남는다", async () => {
    const world = await boot({ roster: () => rosterCatalog });
    const persistence = persistenceOf(world);
    const { fusion, holdings } = persistence;
    const { userId, ownerId, unitId, stats } = await withHuman(world, "GeneLife", 2_000n);
    const view = await fusion.overview({ id: userId, devGrant: true }, clock);
    expect(view.humans.map((h) => [h.unitId, h.skills, h.skillSlots])).toEqual([[unitId, [], 3]]);
    expect(view.genes).toEqual([]);
    // 스킬 유전자 셋을 받아 둘을 주입한다(등급 1), 같은 스킬은 다시 못 배운다
    const first = await fusion.devGrantGene(userId, { kind: "skill", skill: "fire_bolt" });
    const second = await fusion.devGrantGene(userId, { kind: "skill", skill: "first_aid" });
    const again = await fusion.devGrantGene(userId, { kind: "skill", skill: "fire_bolt" });
    if (!first.ok || !second.ok || !again.ok || !first.gene || !second.gene || !again.gene)
      throw new Error("dev gene");
    expect(await fusion.inject(userId, { gene: first.gene, unit: unitId })).toEqual({
      ok: true,
      unitId,
      skill: "fire_bolt",
    });
    expect(await fusion.inject(userId, { gene: second.gene, unit: unitId })).toMatchObject({ ok: true });
    expect(await fusion.inject(userId, { gene: again.gene, unit: unitId })).toEqual({
      ok: false,
      code: "skill_known",
    });
    expect(await fusion.inject(userId, { gene: first.gene, unit: unitId })).toEqual({
      ok: false,
      code: "unknown_gene",
    });
    // 사람이 든 물건(보유 물건)
    const carried = holdings.service.acquire({
      ownerId,
      item: "test_sword",
      quantity: 1,
      location: carriedBy(unitId),
      source: "dev_grant",
      atMs: clock,
      seed: 3,
    });
    if (!carried.ok) throw new Error("acquire");
    // 수명이 다하게(DB 행을 고친다) → 1분 처리: 비활성으로 남는다(상한 출발값 없음, D-517) → 주입·융합을 받지 않는다
    await persistence.writer.durable();
    await test.db.$client.query(
      `update world_humans set born_at_ms = $1, lifespan_ms = 1000 where unit_id = $2`,
      [clock - 10_000, unitId],
    );
    expect(await fusion.expireDue(clock)).toBe(0);
    expect([...world.maps.values()].some((map) => map.unitInfo(unitId))).toBe(true);
    expect(fusion.temple.isInactive(unitId)).toBe(true);
    expect(await fusion.inject(userId, { gene: again.gene, unit: unitId })).toEqual({
      ok: false,
      code: "wrong_kind",
    });
    // 변환(개발 시험 바로 변환 = 연구소 변환과 같은 처리, 연구소 길은 temple.db.test.ts)
    expect(await fusion.devExpire(userId, { unit: unitId })).toMatchObject({ ok: true, unitId });
    expect([...world.maps.values()].some((map) => map.unitInfo(unitId))).toBe(false);
    await persistence.writer.durable();
    expect(await rows(test.db, `select id from world_units where id = $1`, [unitId])).toEqual([]);
    expect(await rows(test.db, `select unit_id from unit_skills where unit_id = $1`, [unitId])).toEqual([]);
    const cyborgUnit = persistence.cyborgs.record(userId)?.unitId;
    if (!cyborgUnit) throw new Error("cyborg unit");
    const after = await fusion.overview({ id: userId, devGrant: true }, clock);
    expect(after.humans).toEqual([]);
    const stat = after.genes.find((g) => g.kind === "stat");
    expect(stat).toMatchObject({
      item: "gene_stat_human",
      species: "human",
      total: stats.reduce((a, b) => a + b, 0),
      stats,
      fromUnit: unitId,
      level: 1,
      generation: 0,
      unit: cyborgUnit,
    });
    expect(stat?.dist?.reduce((a, b) => a + b, 0)).toBe(1000);
    // 남은 스킬 유전자 = 배운 스킬 둘(그 유닛에서) + 주입하지 않은 하나(받은 그대로)
    expect(
      after.genes
        .filter((g) => g.kind === "skill")
        .map((g) => `${g.skill ?? ""}:${String(g.fromUnit)}`)
        .toSorted(),
    ).toEqual([`fire_bolt:${String(unitId)}`, "fire_bolt:null", `first_aid:${String(unitId)}`].toSorted());
    // 들던 칼은 본체가 든다
    const sword = holdings.service.list(ownerId, clock).holdings.find((h) => h.itemId === "test_sword");
    expect(sword?.location).toBe(carriedBy(cyborgUnit));
    expect(await world.checkInvariants()).toEqual([]);
    // 다시 켜도 유전자 값이 남는다
    await world.stop();
    worlds.splice(worlds.indexOf(world), 1);
    const reborn = await boot({ roster: () => rosterCatalog });
    const reloaded = await persistenceOf(reborn).fusion.overview({ id: userId, devGrant: false }, clock);
    expect(reloaded.genes.find((g) => g.kind === "stat")).toEqual(stat);
  });

  it("합성: 같은 종 스탯 유전자 둘 → 새 유전자 하나(총합 = 평균 ± 걸음, 세대 +1), 둘은 사라진다", async () => {
    const world = await boot({ roster: () => rosterCatalog });
    const { fusion } = persistenceOf(world);
    const { userId } = await withHuman(world, "GeneSynth", 2_000n);
    const made: number[] = [];
    for (let i = 0; i < 2; i++) {
      const granted = await fusion.devGrantGene(userId, { kind: "stat" });
      if (!granted.ok || !granted.gene) throw new Error("dev gene");
      made.push(granted.gene);
    }
    const skill = await fusion.devGrantGene(userId, { kind: "skill" });
    if (!skill.ok || !skill.gene) throw new Error("dev skill gene");
    const [a, b] = made;
    if (a === undefined || b === undefined) throw new Error("genes");
    const before = await fusion.overview({ id: userId, devGrant: true }, clock);
    const totals = before.genes.filter((g) => g.kind === "stat").map((g) => g.total ?? 0);
    const mean = Math.floor(((totals[0] ?? 0) + (totals[1] ?? 0)) / 2);
    expect(await fusion.synthesize(userId, { a, b: a })).toEqual({ ok: false, code: "same_gene" });
    expect(await fusion.synthesize(userId, { a, b: skill.gene })).toEqual({ ok: false, code: "wrong_gene" });
    expect(await fusion.synthesize(userId, { a, b: 999_999 })).toEqual({ ok: false, code: "unknown_gene" });
    const result = await fusion.synthesize(userId, { a, b });
    if (!result.ok || result.gene === undefined || result.total === undefined) throw new Error("synth");
    const step = Math.max(1, Math.floor((mean * OLD_FUSION_COEFFICIENTS.geneStepPm) / 1000));
    expect(result.total).toBe(
      result.outcome === "up" ? mean + step : result.outcome === "down" ? mean - step : mean,
    );
    const after = await fusion.overview({ id: userId, devGrant: true }, clock);
    const stats = after.genes.filter((g) => g.kind === "stat");
    expect(stats.map((g) => [g.id, g.total, g.generation])).toEqual([[result.gene, result.total, 1]]);
    expect(await world.checkInvariants()).toEqual([]);
  });

  it("인큐베이터: 휴먼 스탯 유전자 → 새 휴먼(주력 스탯 적용, 속성 = 유전자), 스킬 칸이 차면 주입 거절", async () => {
    const world = await boot({ roster: () => rosterCatalog });
    const persistence = persistenceOf(world);
    const { fusion } = persistence;
    const { userId, ownerId, unitId } = await withHuman(world, "GeneIncubate", 2_000n);
    const granted = await fusion.devGrantGene(userId, { kind: "stat" });
    if (!granted.ok || !granted.gene) throw new Error("dev gene");
    const before = await fusion.overview({ id: userId, devGrant: true }, clock);
    const gene = before.genes.find((g) => g.id === granted.gene);
    const main = gene?.main ?? null;
    if (!gene?.stats || main === null) throw new Error("gene view");
    const born = await fusion.incubate(userId, { gene: granted.gene, apply: "main" });
    if (!born.ok || !born.unitId || !born.stats) throw new Error("incubate");
    const expected = gene.stats.map((value, index) => (index === main ? Math.max(10, value) : 10));
    expect(born.stats).toEqual(expected);
    const bornId = born.unitId;
    const info = [...world.maps.values()].map((map) => map.unitInfo(bornId)).find((x) => x);
    expect(info?.kind).toBe(UNIT_KIND_HUMAN);
    expect(info?.ownerId).toBe(ownerId);
    await persistence.writer.durable();
    const saved = await rows<{ stats: number[]; elements: number[]; city_id: string | null }>(
      test.db,
      `select stats, elements, city_id from world_humans where unit_id = $1`,
      [bornId],
    );
    expect(saved[0]?.stats.map(Number)).toEqual(expected);
    expect(saved[0]?.elements.map(Number)).toEqual(gene.elements);
    expect(saved[0]?.city_id).toBeNull();
    const after = await fusion.overview({ id: userId, devGrant: true }, clock);
    expect(after.genes.some((g) => g.id === granted.gene)).toBe(false);
    expect(after.humans.map((h) => h.unitId).toSorted((x, y) => x - y)).toEqual([unitId, bornId]);
    // 스킬 칸 3(팩 human skillSlots.base): 넷째는 no_skill_slot, 스탯 유전자는 주입 못 함
    const results: string[] = [];
    for (const skill of ["power_strike", "fire_bolt", "shock_bash", "war_cry"]) {
      const one = await fusion.devGrantGene(userId, { kind: "skill", skill });
      if (!one.ok || !one.gene) throw new Error("skill gene");
      const injected = await fusion.inject(userId, { gene: one.gene, unit: unitId });
      results.push(injected.ok ? "ok" : injected.code);
    }
    expect(results).toEqual(["ok", "ok", "ok", "no_skill_slot"]);
    const statGene = await fusion.devGrantGene(userId, { kind: "stat" });
    if (!statGene.ok || !statGene.gene) throw new Error("stat gene");
    expect(await fusion.inject(userId, { gene: statGene.gene, unit: unitId })).toEqual({
      ok: false,
      code: "wrong_gene",
    });
    expect(await world.checkInvariants()).toEqual([]);
  });
});
