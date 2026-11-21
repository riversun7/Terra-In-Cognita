// 지도자끼리 조약 DB 통합 시험(줄기 diplomacy) — TEST_DATABASE_URL이 있을 때만. 계정은 가짜 값이다.
// 사용자 결정 D-588(질문 2497 가·나 — 제안·협상, 167 다 투표 필요 카드, 받는 쪽 NPC = NPC 규칙)·질문 2498(동맹·보호 효과 기술 기본값 — D-291 참전 요청·수락).
import { loadContentPack } from "@terra/content/node";
import { DAY_MS, factionView } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { economyCatalogFromPack } from "../economyView/catalog.ts";
import { createHouseFounder } from "../factionIdentity/found.ts";
import { createFactionIdentityServices, createFactionIdentityShared } from "../factionIdentity/services.ts";
import { attachGovernance } from "../governance/attach.ts";
import { type GovernanceRules, TEST_GOVERNANCE_RULES } from "../governance/rules.ts";
import { serverEconomyCatalogAccessor } from "../market/catalog.ts";
import { nationPresetsOf } from "../npc/presets.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { legacyNationPresets, silentLog } from "../world/testSupport.ts";
import { type World, startWorld } from "../world/world.ts";
import { type DiplomacyAttached, attachDiplomacy } from "./attach.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source || !loaded.pack) throw new Error("content pack");
const pack = createContentEditState(loaded.source).effective();
const presets = legacyNationPresets(nationPresetsOf(loaded.pack));
const economy = serverEconomyCatalogAccessor(
  economyCatalogFromPack(loaded.pack, { version: "core@test", placeholder: true }),
  () => pack,
);
const EMBLEM = { shape: "shield", division: "pale", charge: "tree", scheme: 1 };
const RELAXED = { capacity: 1000, refillPerMinute: 1000 };
const viewer = (id: string) => ({ id, roles: ["player" as const] });

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
    npc: { testNations: 3, manual: true, presets },
    holdings: { content: () => pack },
    facilities: { content: () => pack },
    economy,
  });
  worlds.push(world);
  await world.ready;
  const npc = world.npc;
  if (!npc) throw new Error("npc");
  for (let i = 0; i < 4; i += 1) {
    clock += 30 * 60_000;
    await npc.tick(true);
  }
  return world;
}

function parts(world: World) {
  const persistence = world.persistence;
  const npc = world.npc;
  if (!persistence || !npc) throw new Error("world");
  return { persistence, npc };
}

async function citizen(world: World, name: string, nationIndex: number) {
  const { persistence } = parts(world);
  const found = await rows<{ id: string }>(
    test.db,
    `insert into users (name, email, username) values ($1, $2, $3) returning id`,
    [name, `${name}@id.placeholder.invalid`, name.toLowerCase()],
  );
  const userId = String(found[0]?.id);
  const faction = persistence.cyborgs.creation(userId, clock).factions[nationIndex];
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
  await persistence.writer.durable();
  return { userId, nation: faction.id };
}

/** 지도자로 세운다: 가문 창설 + 그 나라 지배 가문 기록 + 체제 */
async function leader(
  world: World,
  name: string,
  short: string,
  nationIndex: number,
  regime: "dictatorship" | "democracy",
) {
  const head = await citizen(world, name, nationIndex);
  const pool = test.db.$client;
  const identity = createFactionIdentityServices(
    createFactionIdentityShared({ pool, now: () => clock, limits: { saves: RELAXED, uploads: RELAXED } }),
    { db: test.db, ip: null },
  );
  await identity.save(viewer(head.userId), {
    name: `${name}가문`,
    shortName: short,
    color: "#2980b9",
    emblem: EMBLEM,
    upload: { mode: "none" },
  });
  const nationOf = (userId: string) => parts(world).persistence.cyborgs.record(userId)?.factionId;
  const founded = await createHouseFounder({ pool, db: test.db, now: () => clock, nationOf }).found(
    head.userId,
    {
      cost: "0",
    },
  );
  if (!founded.ok) throw new Error(founded.code);
  await pool.query(
    `insert into governance_state (nation_id, ruling_house_key, elected_at_ms, term_ends_at_ms, updated_at_ms) values ($1, $2, $3, $4, $3)
     on conflict (nation_id) do update set ruling_house_key = excluded.ruling_house_key, term_ends_at_ms = excluded.term_ends_at_ms`,
    [head.nation, `p:${founded.factionId}`, clock, clock + 365 * DAY_MS],
  );
  const { npc } = parts(world);
  const owner = npc.houses.ownerOfRow(head.nation) ?? -1;
  const faction = npc.world.factions.get(owner);
  if (!faction) throw new Error("nation");
  faction.regime = regime;
  return { ...head, owner, faction };
}

function attach(world: World, rules: () => GovernanceRules) {
  let ref: DiplomacyAttached | undefined;
  const gov = attachGovernance({
    db: test.db,
    world: () => world,
    rules,
    now: () => clock,
    log: silentLog,
    manual: true,
    diplomacy: () =>
      ref && { hooks: ref.service.hooks, tick: () => ref?.service.tick() ?? Promise.resolve() },
  });
  const dip = attachDiplomacy({
    db: test.db,
    world: () => world,
    governance: gov,
    now: () => clock,
    log: silentLog,
  });
  ref = dip;
  const tick = async () => {
    await gov.service.tick();
    await dip.service.tick();
  };
  return { gov, dip, tick };
}

const treatyRow = async (id: number) =>
  (
    await rows<{
      state: string;
      revision: number;
      author_nation: string;
      agenda_id: string | null;
      broken_by: string | null;
    }>(
      test.db,
      "select state, revision, author_nation, agenda_id, broken_by from diplomacy_treaties where id = $1",
      [id],
    )
  )[0];

/** 비준 투표를 가결로 만든다(표 셈은 의결 시험이 본다 — 여기서는 가결 뒤 집행 길) */
async function pass(agendaId: string | null | undefined): Promise<void> {
  if (!agendaId) throw new Error("no agenda");
  await test.db.$client.query(
    "update governance_agendas set status = 'passed', decided_at_ms = $2, effect_at_ms = $2 where id = $1",
    [agendaId, clock],
  );
}

describe.skipIf(!TEST_DATABASE_URL)("지도자끼리 조약(diplomacy)", () => {
  it("NPC 상대(가 — 제안): 독재 지도자 바로 → NPC 규칙이 답함, 동맹 불가침·참전 요청(D-291), 선포하면 위반(broken)", async () => {
    const world = await boot();
    const { npc } = parts(world);
    const rules: GovernanceRules = { ...TEST_GOVERNANCE_RULES };
    const { gov, dip, tick } = attach(world, () => rules);
    const me = await leader(world, "Dipone", "DPO", 0, "dictatorship");
    await tick();
    const view = await dip.view(me.userId);
    expect(view.status).toBe("ready");
    expect(view.leader).toBe(true);
    expect(view.maxDays).toBe(30);
    const [target, enemy] = view.partners.filter((row) => !row.playerLed);
    if (!target || !enemy) throw new Error("need two NPC nations");
    const targetFaction = npc.world.factions.get(npc.houses.ownerOfRow(target.id) ?? -1);
    if (!targetFaction) throw new Error("target");
    // 지도자가 아니면 막는다·전쟁이 아닌데 휴전·강화는 맞지 않다·기간 상한
    const other = await citizen(world, "Dipcit", 0);
    expect(
      await dip.service.propose(other.userId, {
        targetNationId: target.id,
        clauses: [{ kind: "alliance" }],
        days: 5,
      }),
    ).toEqual({ ok: false, code: "not_leader" });
    expect(
      await dip.service.propose(me.userId, {
        targetNationId: target.id,
        clauses: [{ kind: "ceasefire" }],
        days: 5,
      }),
    ).toEqual({ ok: false, code: "invalid_clauses" });
    expect(
      await dip.service.propose(me.userId, {
        targetNationId: target.id,
        clauses: [{ kind: "alliance" }],
        days: 31,
      }),
    ).toEqual({ ok: false, code: "invalid_clauses" });
    // 차분한 NPC(공격 성향 100)는 동맹을 받는다 → 바로 맺음(서버 집행: 조약 기간 불가침)
    targetFaction.traits = { ...targetFaction.traits, aggression: 100 };
    const made = await dip.service.propose(me.userId, {
      targetNationId: target.id,
      clauses: [{ kind: "alliance" }],
      days: 10,
    });
    expect(made).toMatchObject({ ok: true, action: "active" });
    if (!made.ok) throw new Error("propose");
    expect(await treatyRow(made.ref)).toMatchObject({ state: "active", revision: 0 });
    expect(me.faction.truces.get(targetFaction.id)).toBe(clock + 10 * DAY_MS);
    expect(targetFaction.truces.get(me.faction.id)).toBe(clock + 10 * DAY_MS);
    // 사나운 NPC(공격 성향 900)는 불가침을 거절한다
    const enemyFaction = npc.world.factions.get(npc.houses.ownerOfRow(enemy.id) ?? -1);
    if (!enemyFaction) throw new Error("enemy");
    enemyFaction.traits = { ...enemyFaction.traits, aggression: 900 };
    expect(
      await dip.service.propose(me.userId, {
        targetNationId: enemy.id,
        clauses: [{ kind: "non_aggression" }],
        days: 5,
      }),
    ).toMatchObject({ ok: true, action: "declined" });
    // 동맹 참전 요청: 우리가 전쟁 중이 아니면 막고, 선포(독재 직권) 뒤 요청 → NPC 동맹이 힘으로 답한다(D-291 — 참가 = 그 적과 전쟁)
    expect(await dip.service.requestWar(me.userId, { treatyId: made.ref, enemyNationId: enemy.id })).toEqual({
      ok: false,
      code: "not_at_war",
    });
    expect(
      await gov.service.propose(me.userId, { kind: "war_declaration", targetNationId: enemy.id }),
    ).toMatchObject({ ok: true });
    const ctx = npc.houseRecruit.context();
    if (!ctx) throw new Error("npc context");
    const mine = factionView(ctx, targetFaction, clock).strength;
    const theirs = factionView(ctx, enemyFaction, clock).strength;
    const asked = await dip.service.requestWar(me.userId, { treatyId: made.ref, enemyNationId: enemy.id });
    expect(asked).toMatchObject({ ok: true, action: mine >= theirs ? "joined" : "refused" });
    expect(targetFaction.wars.has(enemyFaction.id)).toBe(mine >= theirs);
    expect((await dip.view(me.userId)).warJoins[0]).toMatchObject({
      state: mine >= theirs ? "joined" : "declined",
      auto: false,
    });
    // 동맹 상대에게 선포하면(조약은 공격을 막지 않는다 — D-329 86) 다음 틱에 위반(broken)
    expect(
      await gov.service.propose(me.userId, { kind: "war_declaration", targetNationId: target.id }),
    ).toMatchObject({ ok: true });
    await tick();
    // 어긴 나라 = 맺은 동안 선포한 우리 나라(fixes-1117c — D-255·D-329 86): 세력 신뢰가 내려가고, 위반 기록이 제재 명분이 된다(D-290)
    expect(await treatyRow(made.ref)).toMatchObject({ state: "broken", broken_by: String(me.nation) });
    const after = await dip.view(me.userId);
    expect(after.nation).toMatchObject({ breaches: 1, trust: -rules.breachTrustPenalty });
    expect(after.treaties.find((row) => row.id === made.ref)?.brokenBy).toBe("us");
    expect((await dip.view(other.userId)).nation).toMatchObject({ breaches: 1 });
    const book = dip.service.breaches();
    expect(book?.breachesOf(me.faction.id)).toBe(1);
    expect(book?.causeBonus(targetFaction.id, me.faction.id, clock)).toBe(rules.sanctionCauseBonus);
    expect(book?.causeBonus(me.faction.id, targetFaction.id, clock)).toBe(0);
    expect(book?.causeBonus(targetFaction.id, me.faction.id, clock + rules.sanctionWindowMs + 1)).toBe(0);
    gov.stop();
  }, 180_000);

  it("플레이어 지도자끼리(나 — 협상): 비준 투표·맞제안·받기, 보호 공물·저절로 참전 요청, 기한 지남, 강화 안건 → 휴전·강화 조약", async () => {
    const world = await boot();
    const { npc, persistence } = parts(world);
    const rules: GovernanceRules = { ...TEST_GOVERNANCE_RULES };
    const { gov, dip, tick } = attach(world, () => rules);
    const a = await leader(world, "Diplea", "DLA", 0, "democracy");
    const b = await leader(world, "Dipleb", "DLB", 1, "dictatorship");
    await tick();
    const bView = await dip.view(b.userId);
    const aRef = bView.partners.find((row) => row.id === a.nation);
    expect(aRef?.playerLed).toBe(true);
    // 민주주의 A가 보호(우리가 보호받음, 공물 30‰)를 낸다 → 보호는 투표 필요 카드(D-444 167) → 비준 투표를 연다
    const offered = await dip.service.propose(a.userId, {
      targetNationId: b.nation,
      clauses: [{ kind: "protection", protector: "them", tributePm: 30 }],
      days: 20,
    });
    expect(offered).toMatchObject({ ok: true, action: "voting" });
    if (!offered.ok) throw new Error("propose");
    const voting = await treatyRow(offered.ref);
    expect(voting).toMatchObject({ state: "proposed" });
    expect((await dip.view(a.userId)).treaties[0]).toMatchObject({ waiting: "our_vote", path: "vote" });
    // B는 아직 답할 수 없다(A 나라 투표 중)
    expect(await dip.service.respond(b.userId, { treatyId: offered.ref, accept: true })).toEqual({
      ok: false,
      code: "not_your_turn",
    });
    // 같은 두 나라 사이에 또 열 수 없다
    expect(
      await dip.service.propose(b.userId, {
        targetNationId: a.nation,
        clauses: [{ kind: "alliance" }],
        days: 3,
      }),
    ).toEqual({ ok: false, code: "already_open" });
    await pass(voting?.agenda_id);
    await tick();
    expect((await dip.view(b.userId)).treaties[0]).toMatchObject({
      waiting: "us",
      can: { accept: true, counter: true, decline: true },
    });
    // B(독재)가 고쳐 되돌린다: 공물 50‰ + 동맹, 15일 → 판 1, 지은이 B, A 차례
    const countered = await dip.service.counter(b.userId, {
      treatyId: offered.ref,
      clauses: [{ kind: "protection", protector: "us", tributePm: 50 }, { kind: "alliance" }],
      days: 15,
    });
    expect(countered).toMatchObject({ ok: true, action: "sent" });
    expect(await treatyRow(offered.ref)).toMatchObject({
      state: "negotiating",
      revision: 1,
      author_nation: String(b.nation),
    });
    // 공물 상한(50‰) 넘음은 맞지 않다
    expect(
      await dip.service.counter(a.userId, {
        treatyId: offered.ref,
        clauses: [{ kind: "protection", protector: "them", tributePm: 60 }],
        days: 15,
      }),
    ).toEqual({ ok: false, code: "invalid_clauses" });
    // A가 받는다 → 다시 비준 투표 → 가결 → 맺음
    expect(await dip.service.respond(a.userId, { treatyId: offered.ref, accept: true })).toMatchObject({
      ok: true,
      action: "voting",
    });
    await pass((await treatyRow(offered.ref))?.agenda_id);
    await tick();
    expect(await treatyRow(offered.ref)).toMatchObject({ state: "active", revision: 1 });
    expect(a.faction.truces.get(b.faction.id)).toBe(clock + 15 * DAY_MS);
    // 공물: 공물 주기(봉신 공물 주기 칸) 뒤 틱에 A 국고의 50‰가 B 국고로
    const ledger = persistence.ledger;
    const asset = npc.economy?.economy.currencyOf.get(a.owner);
    if (!asset) throw new Error("currency");
    const before = ledger.balanceOf(a.owner, asset);
    clock += rules.tributeEveryMs;
    await tick();
    const paid = (before * 50n) / 1000n;
    expect(ledger.balanceOf(a.owner, asset)).toBe(before - paid);
    expect(
      (await rows(test.db, "select action from audit_log where action = 'diplomacy.tribute'")).length,
    ).toBe(1);
    // 보호받는 A가 전쟁에 들면(A 나라 NPC 셋째 나라와) B에 참전 요청이 저절로 간다(플레이어 B는 화면에서 답한다)
    const third = (await dip.view(a.userId)).partners.find((row) => row.id !== b.nation);
    if (!third) throw new Error("third");
    const thirdFaction = npc.world.factions.get(npc.houses.ownerOfRow(third.id) ?? -1);
    if (!thirdFaction) throw new Error("third faction");
    npc.society.declareWar(thirdFaction, a.faction, clock);
    await tick();
    const auto = (await dip.view(b.userId)).warJoins[0];
    expect(auto).toMatchObject({ auto: true, state: "requested", canAnswer: true, enemy: { id: third.id } });
    if (!auto) throw new Error("auto");
    expect(await dip.service.respondWar(b.userId, { requestId: auto.id, accept: true })).toMatchObject({
      ok: true,
      action: "joined",
    });
    expect(b.faction.wars.has(thirdFaction.id)).toBe(true);
    // 기한 지남: B가 셋째 나라(NPC가 아닌 길은 이미 봤다) 대신 A에게 불가침을 새로 내면 열린 조약이 없어 낼 수 있다 — 이미 맺은 조약은 막지 않는다
    const second = await dip.service.propose(b.userId, {
      targetNationId: a.nation,
      clauses: [{ kind: "non_aggression" }],
      days: 3,
    });
    expect(second).toMatchObject({ ok: true, action: "sent" });
    if (!second.ok) throw new Error("second");
    clock += rules.peaceOfferMs + 60_000;
    await tick();
    expect(await treatyRow(second.ref)).toMatchObject({ state: "lapsed" });
    // 강화 안건 → 휴전·강화 조약(옛 2497 길 대신): B와 A가 전쟁(위의 보호 조약은 위반으로 끝남), B 직권 강화 → A에게 휴전·강화 조약이 간다
    npc.society.declareWar(b.faction, a.faction, clock);
    await tick();
    // 선포를 알리지 않은 길(시뮬 안 다른 길)은 어긴 나라를 모른다 [임시 2582] — 신뢰는 그대로
    expect(await treatyRow(offered.ref)).toMatchObject({ state: "broken", broken_by: null });
    expect(await gov.service.propose(b.userId, { kind: "peace", targetNationId: a.nation })).toMatchObject({
      ok: true,
      action: "decided",
    });
    const peace = (await dip.view(a.userId)).treaties.find((row) => row.state === "proposed");
    expect(peace).toMatchObject({ clauses: [{ kind: "ceasefire" }], waiting: "us", path: "short_vote" });
    if (!peace) throw new Error("peace offer");
    // A가 받는다(민주주의 — 휴전·강화만이라 짧은 투표) → 가결 → 전쟁 끝
    expect(await dip.service.respond(a.userId, { treatyId: peace.id, accept: true })).toMatchObject({
      ok: true,
      action: "voting",
    });
    await pass((await treatyRow(peace.id))?.agenda_id);
    await tick();
    expect(await treatyRow(peace.id)).toMatchObject({ state: "active" });
    expect(a.faction.wars.has(b.faction.id)).toBe(false);
    gov.stop();
  }, 240_000);
});
