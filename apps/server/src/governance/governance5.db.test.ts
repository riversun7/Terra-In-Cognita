// 나라 의결 다섯째 DB 통합 시험(줄기 governance-5) — TEST_DATABASE_URL이 있을 때만. 계정은 가짜 값이다.
// 질문 2451~2460 답·사용자 결정 D-584·D-585: 강화 직권(2452)·화폐 단계(2453)·지도자 나라 거래세(2460)·가문 독립 선언(2454 — 플레이어·NPC)·쿠데타 보호 기간·병력(2455·2457)·
// 쿠데타 성공 = 차지한 도시만 새 나라(D-585)·지도자 신임도 줄과 반란 고리(D-585).
import { loadContentPack } from "@terra/content/node";
import { DAY_MS, holdingsOf, moveSharesToHouse } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { testRosterCatalog } from "../roster/catalog.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { attachAffinityBook } from "../diplomacy/affinity.ts";
import { economyCatalogFromPack } from "../economyView/catalog.ts";
import { serverEconomyCatalogAccessor } from "../market/catalog.ts";
import { nationPresetsOf } from "../npc/presets.ts";
import { createFactionIdentityServices, createFactionIdentityShared } from "../factionIdentity/services.ts";
import { createHouseFounder } from "../factionIdentity/found.ts";
import { createHouseHome } from "../factionIdentity/houseHome.ts";
import { TEST_HOUSE_RULES } from "../factionIdentity/rules.ts";
import { attachNationTaxes } from "../government/nationTax.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { legacyNationPresets, silentLog } from "../world/testSupport.ts";
import { type World, startWorld } from "../world/world.ts";
import { rebellionShift } from "./approval.ts";
import { attachGovernance } from "./attach.ts";
import { type GovernanceRules, TEST_GOVERNANCE_RULES } from "./rules.ts";
import type { AgendaRow } from "./store.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source || !loaded.pack) throw new Error("content pack");
const pack = createContentEditState(loaded.source).effective();
const roster = testRosterCatalog();
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
    // 쿠데타 전투 = 세계 전투(줄기 no-teleport-a — 실제 몸, battleBodies.ts)
    roster: () => roster,
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
  // 첫 접속은 국가 미소속으로 시작한다(ADR 2026-11-24-house-membership-separation.md). 이 시험은 그 나라 시민에서
  // 출발하므로, 가문이 그 나라 도시에 가입했을 때와 같은 맞춤(alignHome)으로 국적을 준다
  persistence.cyborgs.alignHome(userId, { factionId: faction.id, cityId: city.id });
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
  // 창설은 도시·국가 미소속이다(ADR 2026-11-24-house-membership-separation.md) — 가문장의 출발 도시에 가입해 그 나라 가문이
  // 된다(1인 가문은 공고 없이 바로)
  const startCity = parts(world).persistence.cyborgs.record(leader)?.startCityId;
  if (startCity === undefined) throw new Error("no start city");
  const joined = await createHouseHome({
    pool,
    db: test.db,
    rules: () => TEST_HOUSE_RULES,
    now: () => clock,
  }).set(leader, startCity);
  if (!joined.ok) throw new Error(`home ${joined.code}`);
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
    // 신임도: 플레이어 지도자는 낮게 시작(설정 칸 300), 반란 고리가 걸린다(기준점 500 아래만 — 폭 20 × (500 − 300) ÷ 500 = 8, 줄기 gov-coup)
    expect(
      await rows(test.db, "select house_key, approval from governance_approval where nation_id = $1", [
        head.nation,
      ]),
    ).toEqual([{ house_key: `p:${row}`, approval: 300 }]);
    expect(rebellionShift(npc.world, owner)).toBe(8);
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
    // 목표 물가 상한(줄기 gov-coup — D-588 2499): 정하지 않으면 설정 칸 출발값, 정하면 칸 범위로 자른다
    expect(live?.bankPriceCap?.(owner)).toBe(rules.monetaryCapMilli);
    expect(
      await gov.service.propose(head.userId, {
        kind: "currency_stage",
        monetaryMode: "manual",
        monetaryRateBp: 50,
        monetaryCapMilli: 999_999,
      }),
    ).toMatchObject({ ok: true, action: "decided" });
    await gov.service.tick();
    expect(live?.bankPriceCap?.(owner)).toBe(rules.monetaryCapMaxMilli);
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
    // 세력 쌍 호감 장부(외교가 붙이는 것 — 이 시험은 외교 없이 붙인다, gov-fix-4 affinity.ts)
    const affinity = attachAffinityBook(parts(world).persistence.ledger, {
      rules: () => rules,
      nations: () => [],
      rowOfOwner: () => undefined,
    });
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
    // 독립한 나라는 옛 나라와 호감이 크게 깎인 채 시작한다(D-591 2531 — 자동 전쟁 없음)
    expect(affinity.get(head.nation, done.agendaId)).toBe(-rules.independenceAffinity);
    expect(npc.world.factions.get(owner)?.wars.size ?? 0).toBe(0);
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
    const npcChild = (
      await rows<{ id: string }>(
        test.db,
        "select (after->>'newNationId') as id from audit_log where action = 'governance.house_independent' order by id desc limit 1",
      )
    )[0]?.id;
    expect(affinity.get(second.nation, Number(npcChild))).toBe(-rules.independenceAffinity);
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
    // 쿠데타 도시(줄기 gov-coup — D-588 2492 가): 그 나라 도시가 아니면 막는다
    expect(await gov.service.coup(head.userId, 999_999)).toEqual({ ok: false, code: "invalid_choice" });
    expect(await gov.service.coup(head.userId)).toEqual({ ok: false, code: "coup_protected" });
    // NPC 쿠데타: 시작 도시가 아닌 도시의 NPC 가문(점수 문턱 −1000·힘 비 0 — 기본 NPC 국가의 힘 비 문(fixes-1117j 2713)도 0)
    const city = looseCity(world, owner);
    const rebel = npc.cityHouses.housesOfCity(city).find((id) => id !== ruling.id);
    if (rebel === undefined) throw new Error("no rebel house");
    rules = { ...rules, coupProtectMs: 0, coupNpcScore: -1000, coupNpcPowerPm: 0, fixedCoupPowerPm: 0 };
    await gov.service.tick();
    const coups = await rows<{ id: string; house_key: string; city_id: string | null }>(
      test.db,
      "select id, house_key, city_id from governance_coups where nation_id = $1",
      [head.nation],
    );
    expect(coups.length).toBe(1);
    // NPC 쿠데타는 그 가문 도시에서 일어난다(수도가 아니어도 — D-588 2492 가)
    const rebelKey = coups[0]?.house_key ?? "";
    const seat = [...faction.cities].find((cityId) =>
      npc.cityHouses.housesOfCity(cityId).some((id) => `n:${id}` === rebelKey),
    );
    expect(Number(coups[0]?.city_id)).toBe(seat);
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
      result: { newNationId: number | null; city: number | null; battleId?: number; reason?: string } | null;
    }>(test.db, "select status, result from governance_coups where id = $1", [coupId]);
    const key = coups[0]?.house_key ?? "";
    // 바뀜(줄기 no-teleport-a — D-591·질문 2653): 쿠데타 전투는 세계 전투 — 혁명군이 그 도시에 있으면 전투가 열리고 끝날 때까지 참가 받는 중이다
    // (끝까지의 결과는 governance3.db.test.ts가 본다). 혁명군이 하나도 없으면 싸우지 않고 진다
    if (done[0]?.status === "gathering") {
      const battle = await rows<{ kind: string; status: string }>(
        test.db,
        "select kind, status from world_battles where id = $1",
        [done[0].result?.battleId ?? -1],
      );
      expect(battle).toEqual([{ kind: "siege", status: "running" }]);
    } else if (done[0]?.status === "lost") expect(done[0].result?.reason).toBe("no_rebels");
    else if (done[0]?.status === "won") {
      const coupCity = done[0].result?.city;
      const child = done[0].result?.newNationId;
      if (coupCity !== null && coupCity !== undefined && child !== null && child !== undefined) {
        // 싸운 도시만 떨어져 나가고 옛 나라는 남는다(D-585·D-588)
        expect(coupCity).toBe(seat);
        expect(npc.world.cities.get(coupCity)?.owner).not.toBe(owner);
        expect(faction.alive).toBe(true);
        expect(faction.regime).toBe("democracy");
        expect(
          await rows(test.db, "select ruling_house_key from governance_state where nation_id = $1", [child]),
        ).toEqual([{ ruling_house_key: key }]);
      } else expect(faction.regime).toBe("dictatorship");
    } else throw new Error(`coup ${done[0]?.status}`);
    gov.stop();
  }, 180_000);

  it("신임도 오르내림(줄기 gov-coup — D-588 2493): 처음 틱은 기준만, 세금을 올리면 내리고 내리면 오른다, 해임 문턱이 기준점 아래에서 낮아진다", async () => {
    const world = await boot();
    const { npc, persistence } = parts(world);
    const rules: GovernanceRules = TEST_GOVERNANCE_RULES;
    const gov = governance(world, () => rules);
    const head = await citizen(world, "Approve");
    const owner = npc.houses.ownerOfRow(head.nation) ?? -1;
    const faction = npc.world.factions.get(owner);
    if (!faction) throw new Error("nation");
    faction.regime = "democracy";
    const ruling = npc.cityHouses.rulingHouseOf(owner);
    if (!ruling) throw new Error("ruling");
    await setState(head.nation, `n:${ruling.id}`, clock);
    await gov.service.tick();
    const read = async () =>
      (
        await rows<{ approval: number; tax_level_pm: number | null; cities: number; wars: number }>(
          test.db,
          "select approval, tax_level_pm, cities, wars from governance_approval where nation_id = $1",
          [head.nation],
        )
      )[0];
    const first = await read();
    expect(first?.approval).toBe(rules.approvalNpcStart);
    expect(first?.cities).toBe(faction.cities.size);
    // 소득세 100‰(1000bp)를 매긴다 → 세금 수준 +100‰ → 신임도 −100 × 3
    await test.db.$client.query(
      "insert into nation_taxes (faction_id, income_tax_bp, set_at_ms) values ($1, 1000, $2)",
      [head.nation, clock],
    );
    const table = attachNationTaxes({
      pool: test.db.$client,
      ledger: persistence.ledger,
      owners: persistence.owners,
    });
    await table.reload();
    clock += 60_000;
    await gov.service.tick();
    const raised = await read();
    expect(raised?.approval).toBe(rules.approvalNpcStart - 100 * rules.approval.taxPerPm);
    expect((await gov.view(head.userId)).nation?.approval).toBe(raised?.approval);
    // 신임도 200 < 기준점 500 → 해임 문턱 666 − ⌊300 × 300 ÷ 500⌋ = 486
    const removal: AgendaRow = {
      id: 1,
      nationId: head.nation,
      kind: "leader_removal",
      regime: "democracy",
      proposerKey: null,
      proposerUser: null,
      payload: {},
      openedAtMs: clock,
      registerUntilMs: null,
      closesAtMs: clock,
      status: "open",
      result: null,
      decidedAtMs: null,
      effectAtMs: null,
      enactedAtMs: null,
    };
    expect(gov.service.thresholdFor(removal)).toBe(
      rules.thresholdOf("leader_removal") - Math.floor((rules.approvalRemovalEasePm * 300) / 500),
    );
    // 세금을 내리면 오른다
    await test.db.$client.query("update nation_taxes set income_tax_bp = 500 where faction_id = $1", [
      head.nation,
    ]);
    await table.reload();
    clock += 60_000;
    await gov.service.tick();
    expect((await read())?.approval).toBe((raised?.approval ?? 0) + 50 * rules.approval.taxPerPm);
    gov.stop();
  }, 180_000);
});
