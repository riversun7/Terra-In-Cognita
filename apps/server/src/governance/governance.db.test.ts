// 나라 의결 DB 통합 시험(docs/adr/2026-11-21-governance.md, 질문 2351~2365 답 D-580) — TEST_DATABASE_URL이 있을 때만. 계정은 가짜 값이다.
// 민주주의 NPC 나라에서 플레이어 가문장이 선출을 열고 후보로 나서 NPC 가문 표로 이겨 지배 가문이 된다(2358 가) → 지도자가 체제 전환(자본주의)을
// 올려 가결 → 7일 유예 뒤 집행(D-131) → 자본주의에서 국고 지분이 기권이면 투표권이 비고(2356 [임시]) 지배 쪽 지분 과반이라 지도자 직권으로 독재
// (D-344) → 독재는 표가 없고 지도자 직권만(D-217). 선전포고 가결은 바로 전쟁. 해임 가결은 다시 뽑기를 연다(해임된 가문은 못 나선다).
import { loadContentPack } from "@terra/content/node";
import { DAY_MS, HOUR_MS } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { createFactionIdentityServices, createFactionIdentityShared } from "../factionIdentity/services.ts";
import { createHouseFounder } from "../factionIdentity/found.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { silentLog } from "../world/testSupport.ts";
import { type World, startWorld } from "../world/world.ts";
import { attachGovernance } from "./attach.ts";
import { type GovernanceRules, TEST_GOVERNANCE_RULES } from "./rules.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source || !loaded.pack) throw new Error("content pack");
const pack = createContentEditState(loaded.source).effective();
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
    npc: { testNations: 2, manual: true },
    holdings: { content: () => pack },
    facilities: { content: () => pack },
  });
  worlds.push(world);
  await world.ready;
  return world;
}

function parts(world: World) {
  const persistence = world.persistence;
  const npc = world.npc;
  if (!persistence || !npc) throw new Error("world");
  return { persistence, npc };
}

/** 사이보그(나라 n번째, 그 나라 첫 도시) */
async function citizen(world: World, name: string, nationIndex = 0) {
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

/** 가문 창설(가문장 혼자) */
async function house(world: World, leader: string, name: string, short: string): Promise<number> {
  const pool = test.db.$client;
  const identity = createFactionIdentityServices(
    createFactionIdentityShared({ pool, now: () => clock, limits: { saves: RELAXED, uploads: RELAXED } }),
    { db: test.db, ip: null },
  );
  await identity.save(viewer(leader), {
    name,
    shortName: short,
    color: "#2980b9",
    emblem: EMBLEM,
    upload: { mode: "none" },
  });
  const nationOf = (userId: string) => parts(world).persistence.cyborgs.record(userId)?.factionId;
  const founded = await createHouseFounder({ pool, db: test.db, now: () => clock, nationOf }).found(leader, {
    cost: "0",
  });
  if (!founded.ok) throw new Error(founded.code);
  return founded.factionId;
}

describe.skipIf(!TEST_DATABASE_URL)("나라 의결(governance)", () => {
  it("선출 → 지배 가문 바뀜 → 체제 전환(유예) → 지분 과반 독재 직권 → 독재는 표 없음", async () => {
    const world = await boot();
    const { npc } = parts(world);
    // NPC 가문이 생기도록 NPC 런타임을 조금 민다
    for (let i = 0; i < 4; i += 1) {
      clock += 30 * 60_000;
      await npc.tick(true);
    }
    // NPC 표: 만족도 문턱을 100 넘게 두어 NPC 가문은 늘 바꾸는 쪽(도전자·찬성)에 선다
    let rules: GovernanceRules = { ...TEST_GOVERNANCE_RULES, npcKeepSatisfaction: 101, registerMs: HOUR_MS };
    const gov = attachGovernance({
      db: test.db,
      world: () => world,
      rules: () => rules,
      now: () => clock,
      log: silentLog,
      manual: true,
    });
    const leader = await citizen(world, "Govone");
    const outsider = await citizen(world, "Govtwo");
    const nationOwner = npc.houses.ownerOfRow(leader.nation);
    expect(nationOwner).toBeDefined();
    const faction = npc.world.factions.get(nationOwner ?? -1);
    if (!faction) throw new Error("nation");
    faction.regime = "democracy";
    const houseRow = await house(world, leader.userId, "의결가문", "GOV");
    const key = `p:${houseRow}` as const;

    // 첫 틱: 임기를 센다(바로 선출을 열지 않는다)
    await gov.service.tick();
    let view = await gov.view(leader.userId);
    expect(view.status).toBe("ready");
    expect(view.nation?.regime).toBe("democracy");
    expect(view.nation?.termEndsAtMs).toBe(clock + rules.termMs);
    const incumbent = view.nation?.rulingHouse?.key ?? null;
    expect(incumbent?.startsWith("n:")).toBe(true);
    expect(view.canPropose).toContain("leader_election");
    // 무소속은 발의권·투표권이 없다(2355 가)
    expect((await gov.view(outsider.userId)).canPropose).toEqual([]);
    expect(await gov.service.propose(outsider.userId, { kind: "leader_election" })).toEqual({
      ok: false,
      code: "not_eligible",
    });

    // 선출: 가문장이 열고 후보로 나선다. NPC 지배 가문은 스스로 나선다
    const opened = await gov.service.propose(leader.userId, { kind: "leader_election" });
    if (!opened.ok) throw new Error(opened.code);
    expect(await gov.service.propose(leader.userId, { kind: "leader_election" })).toMatchObject({
      ok: false,
    });
    expect(await gov.service.register(leader.userId, opened.agendaId)).toMatchObject({
      ok: true,
      action: "registered",
    });
    expect(await gov.service.vote(leader.userId, opened.agendaId, key)).toMatchObject({
      ok: true,
      action: "voted",
    });
    expect(await gov.service.vote(leader.userId, opened.agendaId, "yes")).toEqual({
      ok: false,
      code: "invalid_choice",
    });
    view = await gov.view(leader.userId);
    const election = view.agendas.find((agenda) => agenda.id === opened.agendaId);
    expect(new Set(election?.candidates.map((row) => row.key))).toEqual(new Set([incumbent, key]));
    expect(election?.me.choice).toBe(key);
    // 등록 기간 뒤 NPC 표 → 닫기
    clock += rules.registerMs + 60_000;
    await gov.service.tick();
    clock += rules.periodOf("leader_election");
    await gov.service.tick();
    view = await gov.view(leader.userId);
    expect(view.agendas.find((agenda) => agenda.id === opened.agendaId)).toMatchObject({
      status: "enacted",
      winner: { key },
    });
    expect(view.nation?.rulingHouse?.key).toBe(key);
    expect(view.leader).toBe(true);

    // 체제 전환(자본주의): 지도자가 올리고 NPC 가문이 찬성 → 가결 → 7일 유예 → 집행
    const regime = await gov.service.propose(leader.userId, { kind: "regime_change", regime: "capitalism" });
    if (!regime.ok) throw new Error(regime.code);
    await gov.service.vote(leader.userId, regime.agendaId, "yes");
    await gov.service.tick();
    clock += rules.periodOf("regime_change");
    await gov.service.tick();
    view = await gov.view(leader.userId);
    const passed = view.agendas.find((agenda) => agenda.id === regime.agendaId);
    expect(passed?.status).toBe("passed");
    expect(passed?.effectAtMs).toBe(clock + rules.graceRegimeMs);
    expect(faction.regime).toBe("democracy");
    clock += rules.graceRegimeMs;
    await gov.service.tick();
    expect(faction.regime).toBe("capitalism");
    const saved = await rows<{ regime: string }>(test.db, "select regime from factions where id = $1", [
      leader.nation,
    ]);
    await parts(world).persistence.writer.durable();
    expect(
      (
        await rows<{ regime: string }>(test.db, "select regime from factions where id = $1", [leader.nation])
      )[0]?.regime,
    ).toBe("capitalism");
    expect(saved).toBeDefined();

    // 자본주의: 국고 지분은 기권(투표권에서 뺌 [임시]) — 국고가 지분을 다 가져 투표권이 비고 지배 쪽 몫은 1000‰
    view = await gov.view(leader.userId);
    expect(view.nation?.rulingSharePm).toBe(1000);
    expect(view.agendas.find((agenda) => agenda.id === regime.agendaId)?.status).toBe("enacted");
    // 지분 과반 → 지도자 직권으로 독재(D-344, 2363 가) — 유예 뒤 집행
    const decree = await gov.service.propose(leader.userId, {
      kind: "regime_change",
      regime: "dictatorship",
    });
    expect(decree).toMatchObject({ ok: true, action: "decided" });
    clock += rules.graceRegimeMs;
    await gov.service.tick();
    expect(faction.regime).toBe("dictatorship");
    view = await gov.view(leader.userId);
    expect(view.nation?.termEndsAtMs).toBeNull();
    expect(view.canPropose).toEqual(["regime_change"]);
    // 독재: 지도자 직권만(선출 안건은 없다)
    expect(await gov.service.propose(leader.userId, { kind: "leader_election" })).toEqual({
      ok: false,
      code: "dictatorship",
    });
    expect(
      await gov.service.propose(leader.userId, { kind: "regime_change", regime: "dictatorship" }),
    ).toEqual({
      ok: false,
      code: "same_regime",
    });
    rules = { ...rules, graceRegimeMs: 0 };
    const back = await gov.service.propose(leader.userId, { kind: "regime_change", regime: "democracy" });
    expect(back).toMatchObject({ ok: true, action: "decided" });
    await gov.service.tick();
    expect(faction.regime).toBe("democracy");
    // 감사 기록
    const audits = await rows<{ action: string }>(
      test.db,
      "select action from audit_log where action like 'governance.%' order by id",
    );
    expect(audits.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        "governance.propose",
        "governance.ruling_house",
        "governance.regime_enacted",
        "governance.regime_decree",
      ]),
    );
    gov.stop();
  }, 120_000);

  it("선전포고 가결은 바로 전쟁, 해임 가결은 다시 뽑기(해임된 가문은 못 나섬)", async () => {
    const world = await boot();
    const { npc } = parts(world);
    for (let i = 0; i < 4; i += 1) {
      clock += 30 * 60_000;
      await npc.tick(true);
    }
    const rules: GovernanceRules = { ...TEST_GOVERNANCE_RULES, npcKeepSatisfaction: 101, npcWarTraitPm: 0 };
    const gov = attachGovernance({
      db: test.db,
      world: () => world,
      rules: () => rules,
      now: () => clock,
      log: silentLog,
      manual: true,
    });
    const leader = await citizen(world, "Warone");
    const owner = npc.houses.ownerOfRow(leader.nation) ?? -1;
    const faction = npc.world.factions.get(owner);
    if (!faction) throw new Error("nation");
    faction.regime = "democracy";
    await house(world, leader.userId, "전쟁가문", "WAR");
    await gov.service.tick();
    const view = await gov.view(leader.userId);
    const target = view.warTargets[0];
    if (!target) throw new Error("no war target");
    const war = await gov.service.propose(leader.userId, {
      kind: "war_declaration",
      targetNationId: target.id,
    });
    if (!war.ok) throw new Error(war.code);
    expect(
      await gov.service.propose(leader.userId, { kind: "war_declaration", targetNationId: leader.nation }),
    ).toEqual({
      ok: false,
      code: "limit",
    });
    await gov.service.vote(leader.userId, war.agendaId, "yes");
    await gov.service.tick();
    clock += rules.periodOf("war_declaration");
    await gov.service.tick();
    const targetOwner = npc.houses.ownerOfRow(target.id) ?? -2;
    // 전쟁이 선다(같은 틱에 NPC 판단이 강화를 맺었으면 불가침이 남는다 — 선포는 된 것)
    expect(faction.wars.has(targetOwner) || faction.truces.has(targetOwner)).toBe(true);
    expect((await gov.view(leader.userId)).agendas.find((agenda) => agenda.id === war.agendaId)?.status).toBe(
      "enacted",
    );

    // 해임: NPC 가문이 찬성(만족도 문턱 101) → 가결 → 다시 뽑기(해임된 지배 가문은 후보가 아니다)
    const before = (await gov.view(leader.userId)).nation?.rulingHouse?.key;
    const removal = await gov.service.propose(leader.userId, { kind: "leader_removal" });
    if (!removal.ok) throw new Error(removal.code);
    await gov.service.vote(leader.userId, removal.agendaId, "yes");
    await gov.service.tick();
    clock += rules.periodOf("leader_removal");
    await gov.service.tick();
    const after = await gov.view(leader.userId);
    expect(after.agendas.find((agenda) => agenda.id === removal.agendaId)?.status).toBe("enacted");
    const snap = after.agendas.find(
      (agenda) => agenda.kind === "leader_election" && agenda.status === "open",
    );
    expect(snap?.barred?.key).toBe(before);
    expect(snap?.candidates.some((row) => row.key === before)).toBe(false);
    gov.stop();
  }, 120_000);
});
