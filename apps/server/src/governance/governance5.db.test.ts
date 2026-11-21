// 나라 의결 다섯째 DB 통합 시험(줄기 governance-5) — TEST_DATABASE_URL이 있을 때만. 계정은 가짜 값이다.
// 질문 2451~2460 답·사용자 결정 D-584·D-585: 강화 직권(2452)·화폐 단계(2453)·지도자 나라 거래세(2460)·가문 독립 선언(2454 — 플레이어·NPC)·쿠데타 보호 기간·병력(2455·2457)·
// 쿠데타 성공 = 차지한 도시만 새 나라(D-585)·지도자 신임도 줄과 반란 고리(D-585).
import { loadContentPack } from "@terra/content/node";
import { DAY_MS, holdingsOf, moveSharesToHouse } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { economyCatalogFromPack } from "../economyView/catalog.ts";
import { serverEconomyCatalogAccessor } from "../market/catalog.ts";
import { nationPresetsOf } from "../npc/presets.ts";
import { createFactionIdentityServices, createFactionIdentityShared } from "../factionIdentity/services.ts";
import { createHouseFounder } from "../factionIdentity/found.ts";
import { attachNationTaxes } from "../government/nationTax.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { legacyNationPresets, silentLog } from "../world/testSupport.ts";
import { type World, startWorld } from "../world/world.ts";
import { rebellionShift } from "./approval.ts";
import { attachGovernance } from "./attach.ts";
import { type GovernanceRules, TEST_GOVERNANCE_RULES } from "./rules.ts";

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
    npc: { testNations: 2, manual: true, presets },
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

async function setState(
  nationRow: number,
  key: string | null,
  electedAtMs: number | null = null,
): Promise<void> {
  await test.db.$client.query(
    `insert into governance_state (nation_id, ruling_house_key, elected_at_ms, updated_at_ms) values ($1, $2, $3, $4)
     on conflict (nation_id) do update set ruling_house_key = excluded.ruling_house_key, elected_at_ms = excluded.elected_at_ms`,
    [nationRow, key, electedAtMs, clock],
  );
}

function governance(world: World, rules: () => GovernanceRules) {
  return attachGovernance({
    db: test.db,
    world: () => world,
    rules,
    now: () => clock,
    log: silentLog,
    manual: true,
  });
}

/** 시작 도시가 아닌 도시 하나(서버 시험 나라의 처음 도시는 모두 시작 도시라 하나를 마을처럼 둔다) */
function looseCity(world: World, ownerId: number): number {
  const { npc } = parts(world);
  const faction = npc.world.factions.get(ownerId);
  const cities = [...(faction?.cities ?? [])].toSorted((a, b) => a - b);
  const village = npc.world.cities.get(cities.at(-1) ?? -1);
  if (!village || cities.length < 2) throw new Error("need two cities");
  Object.assign(village, { start: false });
  return village.id;
}

describe.skipIf(!TEST_DATABASE_URL)("나라 의결 5(governance-5)", () => {
  it("독재 지도자 직권: 강화(2452 — NPC 상대는 강화 규칙식), 화폐 단계(2453 — 손 조절이 중앙은행에 걸림), 지도자 나라 거래세(2460), 신임도 줄(D-585)", async () => {
    const world = await boot();
    const { npc, persistence } = parts(world);
    const rules: GovernanceRules = { ...TEST_GOVERNANCE_RULES, approvalRebellionEase: 20 };
    const gov = governance(world, () => rules);
    const head = await citizen(world, "Leadone");
    const owner = npc.houses.ownerOfRow(head.nation) ?? -1;
    const faction = npc.world.factions.get(owner);
    if (!faction) throw new Error("nation");
    faction.regime = "dictatorship";
    const row = await house(world, head.userId, "지도가문", "LDR");
    await setState(head.nation, `p:${row}`);
    await gov.service.tick();
    // 신임도: 플레이어 지도자는 낮게 시작(설정 칸 300), 반란 고리가 걸린다(폭 20 × (1000 − 300) ÷ 1000 = 14)
    expect(
      await rows(test.db, "select house_key, approval from governance_approval where nation_id = $1", [
        head.nation,
      ]),
    ).toEqual([{ house_key: `p:${row}`, approval: 300 }]);
    expect(rebellionShift(npc.world, owner)).toBe(14);
    // 강화: 전쟁 중이 아니면 막는다
    const view = await gov.view(head.userId);
    const target = view.warTargets[0];
    if (!target) throw new Error("no target");
    expect(await gov.service.propose(head.userId, { kind: "peace", targetNationId: target.id })).toEqual({
      ok: false,
      code: "not_at_war",
    });
    expect(
      await gov.service.propose(head.userId, { kind: "war_declaration", targetNationId: target.id }),
    ).toMatchObject({
      ok: true,
    });
    const peace = await gov.service.propose(head.userId, { kind: "peace", targetNationId: target.id });
    expect(peace).toMatchObject({ ok: true, action: "decided" });
    const targetOwner = npc.houses.ownerOfRow(target.id) ?? -2;
    const peaceRow = await rows<{ status: string }>(
      test.db,
      "select status from governance_agendas where kind = 'peace' and nation_id = $1",
      [head.nation],
    );
    // NPC 강화 규칙식이 받으면 강화 조약(불가침), 아니면 거절(failed) — 전쟁은 그대로
    if (peaceRow[0]?.status === "enacted") expect(faction.truces.has(targetOwner)).toBe(true);
    else {
      expect(peaceRow[0]?.status).toBe("failed");
      expect(faction.wars.has(targetOwner)).toBe(true);
    }
    // 화폐 단계: 공식 → 손 조절(직권), 틱 뒤 중앙은행에 걸린다, 같은 단계의 조절량만 바꾸기도 직권
    expect(
      await gov.service.propose(head.userId, { kind: "currency_stage", monetaryMode: "formula" }),
    ).toEqual({
      ok: false,
      code: "invalid_choice",
    });
    expect(
      await gov.service.propose(head.userId, {
        kind: "currency_stage",
        monetaryMode: "manual",
        monetaryRateBp: 50,
      }),
    ).toMatchObject({ ok: true, action: "decided" });
    await gov.service.tick();
    const live = npc.economy?.economy;
    expect(live?.bankOverride?.(owner)).toBe(50);
    expect(
      await gov.service.propose(head.userId, {
        kind: "currency_stage",
        monetaryMode: "manual",
        monetaryRateBp: -20,
      }),
    ).toMatchObject({ ok: true, action: "decided" });
    await gov.service.tick();
    expect(live?.bankOverride?.(owner)).toBe(-20);
    expect(
      await gov.service.propose(head.userId, { kind: "currency_stage", monetaryMode: "formula" }),
    ).toMatchObject({
      ok: true,
    });
    await gov.service.tick();
    expect(live?.bankOverride).toBeUndefined();
    // 거래세: 지도자가 정한 값(nation_taxes.trade_tax_bp)을 지도자 나라 거래소에 건다
    await test.db.$client.query(
      "insert into nation_taxes (faction_id, trade_tax_bp, set_at_ms) values ($1, 777, $2)",
      [head.nation, clock],
    );
    const table = attachNationTaxes({
      pool: test.db.$client,
      ledger: persistence.ledger,
      owners: persistence.owners,
    });
    await table.reload();
    await gov.service.tick();
    expect(live?.taxOf.get(owner)).toBe(777);
    gov.stop();
  }, 180_000);

  it("가문 독립 선언(2454 — D-300): 자본주의 도시 지분 50% 이상 가문만, 그 도시가 새 도시국가 + 그 가문이 지배 가문. NPC 가문은 성향·힘 비로", async () => {
    const world = await boot();
    const { npc } = parts(world);
    let rules: GovernanceRules = { ...TEST_GOVERNANCE_RULES, houseIndependenceNpcScore: 10_000 };
    const gov = governance(world, () => rules);
    const head = await citizen(world, "Indone");
    const owner = npc.houses.ownerOfRow(head.nation) ?? -1;
    const faction = npc.world.factions.get(owner);
    if (!faction) throw new Error("nation");
    faction.regime = "capitalism";
    const row = await house(world, head.userId, "독립가문", "IND");
    const city = looseCity(world, owner);
    expect(await gov.service.propose(head.userId, { kind: "house_independence", cityId: city })).toEqual({
      ok: false,
      code: "not_majority_holder",
    });
    const book = npc.world.book;
    // 국고 지분을 모두 그 가문으로(틱 전 — 자본주의 처음 지분 옮기기 D-582가 돌기 전)
    const treasury = holdingsOf(book, city).find((h) => h.owner === owner)?.amount ?? 0n;
    expect(treasury > 0n).toBe(true);
    moveSharesToHouse(book, city, owner, `${row}:`, treasury, clock);
    const done = await gov.service.propose(head.userId, { kind: "house_independence", cityId: city });
    if (!done.ok) throw new Error(done.code);
    expect(npc.world.cities.get(city)?.owner).not.toBe(owner);
    expect(
      await rows(test.db, "select ruling_house_key from governance_state where nation_id = $1", [
        done.agendaId,
      ]),
    ).toEqual([{ ruling_house_key: `p:${row}` }]);
    // NPC 가문: 둘째 나라 시작 도시가 아닌 도시의 NPC 가문이 지분 과반 + 성향 문턱(−1000)·힘 비(0)면 틱에서 선언한다
    const second = await citizen(world, "Indtwo", 1);
    const otherOwner = npc.houses.ownerOfRow(second.nation) ?? -1;
    const other = npc.world.factions.get(otherOwner);
    if (!other) throw new Error("nation 2");
    other.regime = "capitalism";
    const otherCity = looseCity(world, otherOwner);
    const npcHouse = npc.cityHouses.housesOfCity(otherCity)[0];
    if (npcHouse === undefined) throw new Error("no npc house");
    const otherTreasury = holdingsOf(book, otherCity).find((h) => h.owner === otherOwner)?.amount ?? 0n;
    moveSharesToHouse(book, otherCity, otherOwner, `npc:${npcHouse}:`, otherTreasury, clock);
    await gov.service.tick();
    expect(npc.world.cities.get(otherCity)?.owner).toBe(otherOwner);
    rules = { ...rules, houseIndependenceNpcScore: -1000, houseIndependencePowerPm: 0 };
    await gov.service.tick();
    expect(npc.world.cities.get(otherCity)?.owner).not.toBe(otherOwner);
    const audits = await rows<{ action: string }>(
      test.db,
      "select action from audit_log where action = 'governance.house_independent'",
    );
    expect(audits.length).toBe(2);
    gov.stop();
  }, 180_000);

  it("쿠데타: 보호 기간이면 막고(2457), 병력 = 수도에 있는 내 유닛만(2455), 이기면 차지한 도시만 새 독재 나라(D-585)", async () => {
    const world = await boot();
    const { npc } = parts(world);
    let rules: GovernanceRules = {
      ...TEST_GOVERNANCE_RULES,
      coupEnabled: true,
      coupGatherMs: 60_000,
      coupNpcScore: 10_000,
      coupProtectMs: DAY_MS,
    };
    const gov = governance(world, () => rules);
    const head = await citizen(world, "Protone");
    const owner = npc.houses.ownerOfRow(head.nation) ?? -1;
    const faction = npc.world.factions.get(owner);
    if (!faction) throw new Error("nation");
    faction.regime = "democracy";
    await house(world, head.userId, "보호가문", "PRT");
    const ruling = npc.cityHouses.rulingHouseOf(owner);
    if (!ruling) throw new Error("ruling");
    await setState(head.nation, `n:${ruling.id}`, clock);
    await gov.service.tick();
    expect(await gov.service.coup(head.userId)).toEqual({ ok: false, code: "coup_protected" });
    // NPC 쿠데타: 시작 도시가 아닌 도시의 NPC 가문(점수 문턱 −1000·힘 비 0)
    const city = looseCity(world, owner);
    const rebel = npc.cityHouses.housesOfCity(city).find((id) => id !== ruling.id);
    if (rebel === undefined) throw new Error("no rebel house");
    rules = { ...rules, coupProtectMs: 0, coupNpcScore: -1000, coupNpcPowerPm: 0 };
    await gov.service.tick();
    const coups = await rows<{ id: string; house_key: string }>(
      test.db,
      "select id, house_key from governance_coups where nation_id = $1",
      [head.nation],
    );
    expect(coups.length).toBe(1);
    const coupId = Number(coups[0]?.id);
    // 병력: 내 것이 아닌 유닛을 골라도 빠진다 → 병력 없이 편만 듦(보상 없음)
    expect(await gov.service.coupJoin(head.userId, coupId, "government", [999_999])).toMatchObject({
      ok: true,
    });
    expect(
      await rows(test.db, "select units from governance_coup_sides where coup_id = $1 and joiner_key = $2", [
        coupId,
        `u:${head.userId}`,
      ]),
    ).toEqual([{ units: [] }]);
    rules = { ...rules, coupEnabled: false };
    clock += 120_000;
    await gov.service.tick();
    const done = await rows<{
      status: string;
      result: { newNationId: number | null; city: number | null } | null;
    }>(test.db, "select status, result from governance_coups where id = $1", [coupId]);
    const key = coups[0]?.house_key ?? "";
    if (done[0]?.status === "won") {
      const coupCity = done[0].result?.city;
      const child = done[0].result?.newNationId;
      if (coupCity !== null && coupCity !== undefined && child !== null && child !== undefined) {
        // 차지한 도시만 떨어져 나가고 옛 나라는 남는다(D-585)
        expect(npc.world.cities.get(coupCity)?.owner).not.toBe(owner);
        expect(faction.alive).toBe(true);
        expect(faction.regime).toBe("democracy");
        expect(
          await rows(test.db, "select ruling_house_key from governance_state where nation_id = $1", [child]),
        ).toEqual([{ ruling_house_key: key }]);
      } else expect(faction.regime).toBe("dictatorship");
    } else expect(done[0]?.status).toBe("lost");
    gov.stop();
  }, 180_000);
});
