// 나라 의결 셋째 DB 통합 시험(줄기 governance-3) — TEST_DATABASE_URL이 있을 때만. 계정은 가짜 값이다.
// 군사 쿠데타(질문 2433 답·D-583 — 참가 받기·NPC 참가·전투·결과), 지분 과반을 사서 된 독재의 국고 지분 남기기(2432 (다) 답 D-583), 지배 쪽 지분 따라가기(2432 나),
// 자본주의 발의 하한(2436 다 — D-580 1), 독재 지도자의 선전포고·국고 지분 팔기 직권(2440 나·2438 답 D-583), 빈자리 자동 선출(D-584 — 도시 독립 투표 대신, 줄기 governance-5), 빈자리 후임(질문 2491 — 줄기 governance-6).
import { loadContentPack } from "@terra/content/node";
import {
  DAY_MS,
  holdingsOf,
  houseHoldingsOf,
  houseShareCode,
  moveSharesToHouse,
  shareAsset,
} from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { testRosterCatalog } from "../roster/catalog.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { createFactionIdentityServices, createFactionIdentityShared } from "../factionIdentity/services.ts";
import { createHouseFounder } from "../factionIdentity/found.ts";
import { createHouseHome } from "../factionIdentity/houseHome.ts";
import { TEST_HOUSE_RULES } from "../factionIdentity/rules.ts";
import { createHouseSuccession } from "../factionIdentity/succession.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { houseTiesOf } from "../world/houseTies.ts";
import { addTestUnits, silentLog } from "../world/testSupport.ts";
import { type World, startWorld } from "../world/world.ts";
import { attachGovernance } from "./attach.ts";
import { type GovernanceRules, TEST_GOVERNANCE_RULES } from "./rules.ts";
import type { ApprovedShareSale } from "./service.ts";

/** 기본 NPC 국가 지키기(D-593 — gov_fixed_*)를 끈 규칙(이 파일은 옛 출마·쿠데타 길을 본다 — 시험 나라는 기본 NPC 국가다) */
const BASE_RULES: GovernanceRules = {
  ...TEST_GOVERNANCE_RULES,
  fixedCoupLoyalty: 0,
  fixedCoupPowerPm: 0,
  fixedNpcRank: false,
};

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source || !loaded.pack) throw new Error("content pack");
const pack = createContentEditState(loaded.source).effective();
const roster = testRosterCatalog();
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
    // 쿠데타 전투 = 세계 전투(줄기 no-teleport-a — 실제 몸, battleBodies.ts)
    roster: () => roster,
  });
  worlds.push(world);
  await world.ready;
  const npc = world.npc;
  if (!npc) throw new Error("npc");
  // NPC 가문이 생기도록 NPC 런타임을 조금 민다
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

/** 선출 기록을 바로 적는다(시험 — 선출 길은 governance.db.test.ts가 본다) */
async function setRuling(nationRow: number, key: string): Promise<void> {
  await test.db.$client.query(
    `insert into governance_state (nation_id, ruling_house_key, updated_at_ms) values ($1, $2, $3)
     on conflict (nation_id) do update set ruling_house_key = excluded.ruling_house_key`,
    [nationRow, key, clock],
  );
}

function governance(
  world: World | (() => World),
  rules: () => GovernanceRules,
  sales: ApprovedShareSale[] = [],
) {
  return attachGovernance({
    db: test.db,
    world: typeof world === "function" ? world : () => world,
    rules,
    now: () => clock,
    log: silentLog,
    manual: true,
    approvedShareSale: async (sale) => {
      sales.push(sale);
    },
  });
}

describe.skipIf(!TEST_DATABASE_URL)("나라 의결 3(governance-3)", () => {
  it("군사 쿠데타: 꺼져 있으면 막고, 켜면 참가 받기 → NPC 참가 → 전투 → 결과(이기면 독재 지배 가문 + 지분 몰수)", async () => {
    let world = await boot();
    let { npc } = parts(world);
    // 편마다 유닛 수 상한(gov_coup_battle_units)을 넉넉히 — 본체가 가문원 뒤에서 잘리지 않게(세계 전투, 줄기 no-teleport-a)
    let rules: GovernanceRules = {
      ...BASE_RULES,
      coupGatherMs: 60_000,
      coupNpcScore: -1000,
      coupBattleUnits: 200,
    };
    const gov = governance(
      () => world,
      () => rules,
    );
    const head = await citizen(world, "Coupone");
    let faction = npc.world.factions.get(npc.houses.ownerOfRow(head.nation) ?? -1);
    if (!faction) throw new Error("nation");
    faction.regime = "democracy";
    const row = await house(world, head.userId, "혁명가문", "REV");
    // 가문 소속 메모리 표는 가문 명령 뒤에 다시 읽는다 — 시험은 창설을 바로 불러 직접 다시 읽힌다(같은 가문 번호 kin — 2715)
    await houseTiesOf(parts(world).persistence)?.reload();
    await gov.service.tick();
    // 출발값 = 꺼짐(gov_coup_enabled 0)
    expect(await gov.service.coup(head.userId)).toEqual({ ok: false, code: "coup_disabled" });
    rules = { ...rules, coupEnabled: true };
    const started = await gov.service.coup(head.userId);
    if (!started.ok) throw new Error(started.code);
    expect(started.action).toBe("coup_started");
    expect(await gov.service.coup(head.userId)).toEqual({ ok: false, code: "coup_open" });
    // 다른 사람은 어느 편이든 든다(D-583 — 일으킨 사람은 혁명군에서 못 빠진다)
    const other = await citizen(world, "Couptwo", 1);
    expect(await gov.service.coupJoin(other.userId, started.agendaId, "government")).toMatchObject({
      ok: true,
      action: "coup_joined",
    });
    expect(await gov.service.coupJoin(head.userId, started.agendaId, "government")).toEqual({
      ok: false,
      code: "invalid_choice",
    });
    // 병력 파견(줄기 no-teleport — D-591): 보낼 수 있는 내 유닛 = 사이보그 본체. 일으킨 사람의 본체는 쿠데타 도시(수도) 2차맵에 있어 보내지 않고 든다
    const headBody = parts(world).persistence.cyborgs.record(head.userId)?.unitId ?? null;
    const otherBody = parts(world).persistence.cyborgs.record(other.userId)?.unitId ?? null;
    if (headBody === null || otherBody === null) throw new Error("no cyborg body");
    expect(gov.port.userTroops(other.userId)).toEqual([{ id: otherBody, type: "body" }]);
    expect((await gov.view(head.userId)).coups[0]?.troops).toEqual([
      { id: headBody, type: "body", state: "here", arriveAt: null, sent: true },
    ]);
    // 이 시험 세계는 두 나라 시작 도시가 한 2차맵에 있다 — 다른 나라 사람의 본체도 이미 그 2차맵에 있어 보내지 않고 든다(도착 = 쿠데타 도시 2차맵 [임시 2651]).
    // 다른 2차맵에서 실제로 걸어 보내는 길은 coup.test.ts(가짜 포트)와 이동 서비스 시험이 본다
    expect(gov.port.unitMapOf(otherBody)).toBe(gov.port.unitMapOf(headBody));
    expect(
      await gov.service.coupJoin(other.userId, started.agendaId, "government", [otherBody]),
    ).toMatchObject({
      ok: true,
    });
    expect(parts(world).persistence.travel.list(other.userId)).toEqual([]);
    expect(
      await rows(test.db, "select units from governance_coup_sides where coup_id = $1 and joiner_key = $2", [
        started.agendaId,
        `u:${other.userId}`,
      ]),
    ).toEqual([{ units: [otherBody] }]);
    // 참가 받는 중: NPC 가문은 성향 규칙식으로 든다(문턱 −1000 → 모두 혁명군)
    rules = { ...rules, coupEnabled: false };
    await gov.service.tick();
    let view = await gov.view(head.userId);
    expect(view.coups[0]?.status).toBe("gathering");
    expect(view.coups[0]?.mySide).toBe("rebel");
    expect(view.coups[0]?.government).toBe(1);
    // 참가 받기 끝 → 전투(줄기 no-teleport-a — D-591·질문 2652·2653): 세계 전투를 연다. 쿠데타는 끝날 때까지 참가 받는 중(전투 중에도 든다)
    clock += 120_000;
    await gov.service.tick();
    const opened = await rows<{ status: string; result: { battleId?: number } | null }>(
      test.db,
      "select status, result from governance_coups where id = $1",
      [started.agendaId],
    );
    expect(opened[0]?.status).toBe("gathering");
    const battleId = Number(opened[0]?.result?.battleId);
    const battles = await rows<{
      kind: string;
      status: string;
      ends_at_ms: string;
      units: { id: number; side: number; kin?: number }[];
    }>(test.db, "select kind, status, ends_at_ms, init->'units' as units from world_battles where id = $1", [
      battleId,
    ]);
    expect(battles[0]).toMatchObject({ kind: "siege", status: "running" });
    // 그 도시에 있는 일으킨 사람의 본체는 혁명군(편 1), 정부군으로 보낸 본체는 정부군(편 2) — 실제 몸으로 든다
    expect(battles[0]?.units.find((unit) => unit.id === headBody)?.side).toBe(1);
    expect(battles[0]?.units.find((unit) => unit.id === otherBody)?.side).toBe(2);
    // 같은 가문 번호(kin — 기획 검토 2715, fixes-1117j): 가문장 본체는 그 가문, 가문 없는 사람은 없다(같은 kin끼리만 서로 치지 않는다 — @terra/sim combat/kin.ts)
    expect(battles[0]?.units.find((unit) => unit.id === headBody)?.kin).toBe(row);
    expect(battles[0]?.units.find((unit) => unit.id === otherBody)?.kin).toBeUndefined();
    expect((await gov.view(head.userId)).coups[0]?.battleEndsAtMs).toBe(Number(battles[0]?.ends_at_ms));
    // 넥서스(그 도시 행정 건물)도 세계 시설 목표다 — 누가 이기든 깎인 만큼 세계 건물이 깎인다(질문 2692, D-570 "건물포함", 줄기 fixes-1117i)
    const targeted = await rows<{
      targets: { building: number; kind: string; id: number; defendedOnly?: boolean }[] | null;
    }>(test.db, "select init->'targets' as targets from world_battles where id = $1", [battleId]);
    const nexus = targeted[0]?.targets?.find((target) => target.building === 1);
    expect(nexus).toMatchObject({ kind: "facility" });
    expect(nexus?.defendedOnly).toBeUndefined();
    expect(parts(world).persistence.facilities.service.facilities.has(nexus?.id ?? -1)).toBe(true);
    // 전투 중에도 편을 들고 병력을 보낸다(D-176 지원 참전 — 2652): 그 도시에 닿아 있는 새 유닛은 바로 정부군으로 참전(실제 몸·생명 수치)
    const mapKey = gov.port.unitMapOf(otherBody) ?? -1;
    const [late = 0] = addTestUnits(world, other.userId, mapKey, 1, clock);
    expect(
      await gov.service.coupJoin(other.userId, started.agendaId, "government", [otherBody, late]),
    ).toMatchObject({ ok: true });
    await gov.service.tick();
    const fighting = (await parts(world).persistence.battles.running()).find(
      (entry) => entry.id === battleId,
    );
    expect(fighting?.units.filter((unit) => unit.id === late).map((unit) => unit.side)).toEqual([2]);
    expect(fighting?.units.filter((unit) => unit.id === otherBody)).toHaveLength(1);
    const endsAfterJoin = (await parts(world).persistence.battles.get(battleId))?.endsAtMs ?? 0;
    // 끝 시각 뒤로: 끄고 다시 켜면 부팅 복구가 전투 결과(부상·돌아가기)를 적용하고, 다음 의결 틱이 쿠데타 결과를 넣는다
    await npc.tick(true);
    await parts(world).persistence.writer.durable();
    await world.stop();
    clock = endsAfterJoin + 1_000;
    world = await boot();
    npc = parts(world).npc;
    faction = npc.world.factions.get(faction.id);
    if (!faction) throw new Error("nation");
    for (let i = 0; i < 200; i++) {
      const left = await rows<{ n: string }>(
        test.db,
        "select count(*) as n from world_battles where status = 'running'",
      );
      if (Number(left[0]?.n) === 0) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    // 참전한 유닛도 결과(부상·생명 수치·돌아가기)를 받는다(battles.ts withJoins)
    const applied = await rows<{ units: { unit: number }[] }>(
      test.db,
      "select result->'units' as units from world_battle_results where battle_id = $1",
      [battleId],
    );
    expect(applied[0]?.units.some((unit) => unit.unit === late)).toBe(true);
    await gov.service.tick();
    view = await gov.view(head.userId);
    const done = view.coups[0];
    expect(done?.status === "won" || done?.status === "lost").toBe(true);
    const key = `p:${row}`;
    if (done?.status === "won") {
      // 바뀜(gov-fix-2 — 질문 2542 답 나 D-585 8 "도시만"): 시작 도시(수도)에서 이겨도 그 도시만 새 독재 나라로, 옛 나라는 체제 그대로
      const result = await rows<{ result: { city: number | null; newNationId: number | null } }>(
        test.db,
        "select result from governance_coups where id = $1",
        [started.agendaId],
      );
      const coupCity = result[0]?.result.city;
      const child = result[0]?.result.newNationId;
      if (coupCity === null || coupCity === undefined || child === null || child === undefined)
        throw new Error("no split");
      expect(faction.cities.has(coupCity)).toBe(false);
      expect(faction.regime).toBe("democracy");
      // 떨어져 나간 도시는 시작 도시 표시를 잃는다(gov-fix-3 — 질문 2572 나, D-341·D-528), 저장도 그렇다
      expect(npc.world.cities.get(coupCity)?.start).toBe(false);
      await parts(world).persistence.writer.durable();
      expect(await rows(test.db, "select start from world_cities where id = $1", [coupCity])).toEqual([
        { start: false },
      ]);
      expect(
        await rows(test.db, "select ruling_house_key from governance_state where nation_id = $1", [child]),
      ).toEqual([{ ruling_house_key: key }]);
      expect(holdingsOf(npc.world.book, coupCity)).toEqual([]);
      expect(houseHoldingsOf(npc.world.book, coupCity).map((h) => h.house)).toEqual([`${row}:`]);
      // 수도를 잃은 옛 나라는 남은 도시에서 수도를 다시 고른다(D-528 — 점령과 같은 길)
      const capital = npc.capitalOf(faction.id);
      if (faction.cities.size > 0) expect(capital !== undefined && faction.cities.has(capital)).toBe(true);
    } else {
      expect(faction.regime).toBe("democracy");
      expect(view.nation?.rulingHouse?.key).not.toBe(key);
    }
    // 쿨타임
    rules = { ...rules, coupEnabled: true };
    if (done?.status === "lost")
      expect(await gov.service.coup(head.userId)).toEqual({ ok: false, code: "coup_cooldown" });
    const audits = await rows<{ action: string }>(
      test.db,
      "select action from audit_log where action like 'governance.coup%' order by id",
    );
    expect(audits.map((a) => a.action)).toEqual([
      "governance.coup_started",
      `governance.coup_${done?.status}`,
    ]);
    gov.stop();
  }, 120_000);

  it("지분 과반을 사서 독재: 국고 지분은 국고에 남고(2432 (다)), 독재 지도자는 선전포고·국고 지분 팔기를 직권으로(2440 나·2438)", async () => {
    const world = await boot();
    const { npc } = parts(world);
    const rules: GovernanceRules = { ...BASE_RULES, graceRegimeMs: 0 };
    const sales: ApprovedShareSale[] = [];
    const gov = governance(world, () => rules, sales);
    const head = await citizen(world, "Buyone");
    const faction = npc.world.factions.get(npc.houses.ownerOfRow(head.nation) ?? -1);
    if (!faction) throw new Error("nation");
    faction.regime = "democracy";
    const row = await house(world, head.userId, "매수가문", "BUY");
    await setRuling(head.nation, `p:${row}`);
    const book = npc.world.book;
    // 지배 가문이 도시마다 600주를 샀다(시험은 국고에서 옮겨 흉내)
    for (const cityId of faction.cities) moveSharesToHouse(book, cityId, faction.id, `${row}:`, 600n, clock);
    expect((await gov.view(head.userId)).nation?.rulingSharePm).toBe(1000);
    expect(
      await gov.service.propose(head.userId, { kind: "regime_change", regime: "dictatorship" }),
    ).toMatchObject({
      ok: true,
      action: "decided",
    });
    await gov.service.tick();
    await gov.service.tick();
    expect(faction.regime).toBe("dictatorship");
    for (const cityId of faction.cities) expect(book.balanceOf(faction.id, shareAsset(cityId))).toBe(400n);
    const record = await rows<{ treasury_kept: boolean }>(
      test.db,
      "select treasury_kept from governance_share_houses where nation_id = $1",
      [head.nation],
    );
    expect(record[0]?.treasury_kept).toBe(true);
    // 독재 지도자 직권: 선전포고(바로 전쟁)
    const view = await gov.view(head.userId);
    expect(view.canPropose).toEqual(["regime_change", "war_declaration"]);
    const target = view.warTargets[0];
    if (!target) throw new Error("no target");
    expect(
      await gov.service.propose(head.userId, { kind: "war_declaration", targetNationId: target.id }),
    ).toMatchObject({ ok: true, action: "decided" });
    const targetOwner = npc.houses.ownerOfRow(target.id) ?? -2;
    expect(faction.wars.has(targetOwner) || faction.truces.has(targetOwner)).toBe(true);
    // 국고 지분 팔기 직권: 국고에 있는 만큼만, 승인된 판매는 시장 고리로
    const cityId = faction.cities.values().next().value ?? -1;
    expect(
      await gov.service.propose(head.userId, {
        kind: "treasury_share_sale",
        cityId,
        shares: "401",
        minPrice: "5",
      }),
    ).toEqual({ ok: false, code: "not_enough_shares" });
    expect(
      await gov.service.propose(head.userId, {
        kind: "treasury_share_sale",
        cityId,
        shares: "100",
        minPrice: "5",
      }),
    ).toMatchObject({ ok: true, action: "decided" });
    expect(sales).toEqual([
      expect.objectContaining({ nationRowId: head.nation, cityId, shares: 100n, minPrice: 5n }),
    ]);
    gov.stop();
  }, 120_000);

  it("독재 지배 가문이 바뀌면 옛 지배 가문 지분이 새 지배 가문으로(2432 나), 자본주의 발의 하한 아래는 막는다(2436 다)", async () => {
    const world = await boot();
    const { npc } = parts(world);
    const rules: GovernanceRules = { ...BASE_RULES };
    const gov = governance(world, () => rules);
    const first = await citizen(world, "Folone", 0);
    const second = await citizen(world, "Capone", 1);
    const dictator = npc.world.factions.get(npc.houses.ownerOfRow(first.nation) ?? -1);
    const capital = npc.world.factions.get(npc.houses.ownerOfRow(second.nation) ?? -1);
    if (!dictator || !capital) throw new Error("nations");
    dictator.regime = "dictatorship";
    capital.regime = "capitalism";
    const ruling = npc.cityHouses.rulingHouseOf(dictator.id);
    if (!ruling) throw new Error("no ruling house");
    await gov.service.tick();
    const book = npc.world.book;
    const city = [...dictator.cities][0] ?? -1;
    // 옛 지배 가문(시험 — 없는 가문 n:999999)이 지분을 가진 채 기록이 그 가문을 가리킨다 = 수도 이전으로 처음 규칙 가문이 바뀐 뒤
    const from = book.systemAccount(houseShareCode(`npc:${ruling.id}:`, city), shareAsset(city));
    book.post({
      kind: "test",
      atMs: clock,
      entries: [
        { account: from, amount: -1000n },
        { account: book.systemAccount(houseShareCode("npc:999999:", city), shareAsset(city)), amount: 1000n },
      ],
    });
    await test.db.$client.query(
      "update governance_share_houses set house_key = 'n:999999' where nation_id = $1",
      [first.nation],
    );
    await gov.service.tick();
    expect(houseHoldingsOf(book, city).map((h) => [h.house, h.amount])).toEqual([
      [`npc:${ruling.id}:`, 1000n],
    ]);
    const follow = await rows<{ action: string }>(
      test.db,
      "select action from audit_log where action = 'governance.shares_follow_ruler'",
    );
    expect(follow.length).toBe(1);
    // 자본주의: 지분이 없는 가문장은 발의·후보 등록을 못 한다(D-580 1 — 세율 안건도)
    await house(world, second.userId, "무지분가문", "NOS");
    const taxes = { incomeTaxBp: 800, residentTaxPm: 5, residentEveryDays: 7, residentNationPm: 100 };
    expect(await gov.service.propose(second.userId, { kind: "tax_change", taxes })).toEqual({
      ok: false,
      code: "not_eligible",
    });
    expect((await gov.view(second.userId)).canPropose).toEqual([]);
    gov.stop();
  }, 120_000);

  it("빈자리는 도시 독립으로 이어지지 않고 누구나 나서는 선출을 바로 연다(D-584 — D-583 3 대신), 열려 있던 도시 독립 투표는 취소", async () => {
    const world = await boot();
    const { npc } = parts(world);
    const rules: GovernanceRules = { ...BASE_RULES, vacancyElectionMs: 2 * 3_600_000 };
    const gov = governance(world, () => rules);
    const head = await citizen(world, "Vacone");
    const faction = npc.world.factions.get(npc.houses.ownerOfRow(head.nation) ?? -1);
    if (!faction) throw new Error("nation");
    faction.regime = "democracy";
    await test.db.$client.query(
      `insert into governance_state (nation_id, vacant_since_ms, term_ends_at_ms, updated_at_ms) values ($1, $2, $3, $2)
       on conflict (nation_id) do update set vacant_since_ms = excluded.vacant_since_ms`,
      [head.nation, clock - 120_000, clock + DAY_MS],
    );
    // 옛 판(1116y)이 연 도시 독립 투표 하나
    const city = [...faction.cities][0] ?? -1;
    await test.db.$client.query(
      `insert into governance_agendas (nation_id, kind, regime, payload, opened_at_ms, closes_at_ms, status)
       values ($1, 'city_independence', 'democracy', $2, $3, $4, 'open')`,
      [head.nation, JSON.stringify({ cityId: city }), clock, clock + DAY_MS],
    );
    await gov.service.tick();
    const view = await gov.view(head.userId);
    const elections = view.agendas.filter(
      (agenda) => agenda.kind === "leader_election" && agenda.status === "open",
    );
    expect(elections.length).toBe(1);
    expect(elections[0]?.closesAtMs).toBe(clock + rules.vacancyElectionMs);
    expect(elections[0]?.barred).toBeNull();
    expect(view.agendas.find((agenda) => agenda.kind === "city_independence")?.status).toBe("cancelled");
    // 같은 빈자리에 선출을 또 열지 않는다
    await gov.service.tick();
    expect(
      (await gov.view(head.userId)).agendas.filter((agenda) => agenda.kind === "leader_election").length,
    ).toBe(1);
    for (const cityId of faction.cities) expect(npc.world.cities.get(cityId)?.owner).toBe(faction.id);
    gov.stop();
  }, 120_000);
  it("빈자리면 먼저 지배 가문의 후계자·서열로 가문장을 세운다(D-588 5 — 질문 2491): 새 가문장이 지도자, 자동 선출은 열지 않는다", async () => {
    const world = await boot();
    const { npc } = parts(world);
    const gov = governance(world, () => BASE_RULES);
    const head = await citizen(world, "Sucone");
    const elder = await citizen(world, "Suctwo");
    const heir = await citizen(world, "Sucthr");
    const faction = npc.world.factions.get(npc.houses.ownerOfRow(head.nation) ?? -1);
    if (!faction) throw new Error("nation");
    faction.regime = "democracy";
    const row = await house(world, head.userId, "후임가문", "SUC");
    for (const [userId, joined] of [
      [elder.userId, clock],
      [heir.userId, clock + 1],
    ] as const)
      await test.db.$client.query(
        "insert into house_members (user_id, faction_id, role, joined_at_ms) values ($1, $2, 'member', $3)",
        [userId, row, joined],
      );
    // 가문장이 후계자를 정한다(house_heir — 서열(먼저 들어온 elder)보다 먼저)
    const pool = test.db.$client;
    const succession = createHouseSuccession({ pool, db: test.db, now: () => clock });
    expect(await succession.heir(elder.userId, heir.userId)).toEqual({ ok: false, code: "not_leader" });
    expect(await succession.heir(head.userId, heir.userId)).toEqual({
      ok: true,
      action: "heir_set",
      factionId: row,
    });
    // 해임 뒤 다시 뽑기가 실패해 빈자리가 된 나라(옛 판 — 해임된 사람을 모르므로 지금 가문장을 뺀다)
    await pool.query(
      `insert into governance_state (nation_id, ruling_house_key, vacant_since_ms, term_ends_at_ms, updated_at_ms) values ($1, $2, $3, $4, $3)
       on conflict (nation_id) do update set ruling_house_key = excluded.ruling_house_key, vacant_since_ms = excluded.vacant_since_ms,
         term_ends_at_ms = excluded.term_ends_at_ms`,
      [head.nation, `p:${row}`, clock - 120_000, clock + 60 * DAY_MS],
    );
    await gov.service.tick();
    expect(
      await rows(test.db, "select vacant_since_ms from governance_state where nation_id = $1", [head.nation]),
    ).toEqual([{ vacant_since_ms: null }]);
    expect(
      await rows(
        test.db,
        "select user_id, role from house_members where faction_id = $1 order by joined_at_ms",
        [row],
      ),
    ).toEqual([
      { user_id: head.userId, role: "member" },
      { user_id: elder.userId, role: "member" },
      { user_id: heir.userId, role: "leader" },
    ]);
    // 후계자가 가문장이 되면 후계자 줄은 지운다
    expect(await rows(test.db, "select user_id from house_heirs where faction_id = $1", [row])).toEqual([]);
    const view = await gov.view(heir.userId);
    expect(view.leader).toBe(true);
    expect((await gov.view(head.userId)).leader).toBe(false);
    expect(view.agendas.filter((agenda) => agenda.kind === "leader_election").length).toBe(0);
    const audits = await rows(test.db, "select action from audit_log where action = 'governance.successor'");
    expect(audits.length).toBe(1);
    gov.stop();
  }, 120_000);
  it("해임 빈자리는 같은 가문이 잇지 않고 누구나 나서는 선출을 연다, 가문장이 사라진 빈자리는 서열(직위 → 기여도)로 잇는다(D-591 2532)", async () => {
    const world = await boot();
    const { npc } = parts(world);
    const gov = governance(world, () => BASE_RULES);
    const head = await citizen(world, "Rkone");
    const elder = await citizen(world, "Rktwo");
    const rich = await citizen(world, "Rkthr");
    const faction = npc.world.factions.get(npc.houses.ownerOfRow(head.nation) ?? -1);
    if (!faction) throw new Error("nation");
    faction.regime = "democracy";
    const row = await house(world, head.userId, "서열가문", "RNK");
    const pool = test.db.$client;
    // 먼저 들어왔지만 기여도 0인 elder, 늦게 들어왔지만 가문 금고에 많이 넣은 rich
    for (const [userId, joined, contribution] of [
      [elder.userId, clock, "0"],
      [rich.userId, clock + 1, "500"],
    ] as const)
      await pool.query(
        "insert into house_members (user_id, faction_id, role, joined_at_ms, contribution) values ($1, $2, 'member', $3, $4)",
        [userId, row, joined, contribution],
      );
    // 해임 뒤 다시 뽑기가 실패한 빈자리(까닭 removal): 계승하지 않고 빈자리 선출(해임된 가문도 나설 수 있다 — barred 없음)
    await pool.query(
      `insert into governance_state (nation_id, ruling_house_key, vacant_since_ms, vacancy_cause, term_ends_at_ms, updated_at_ms) values ($1, $2, $3, 'removal', $4, $3)
       on conflict (nation_id) do update set ruling_house_key = excluded.ruling_house_key, vacant_since_ms = excluded.vacant_since_ms,
         vacancy_cause = excluded.vacancy_cause, term_ends_at_ms = excluded.term_ends_at_ms`,
      [head.nation, `p:${row}`, clock - 120_000, clock + 60 * DAY_MS],
    );
    await gov.service.tick();
    expect(
      await rows(test.db, "select vacancy_cause from governance_state where nation_id = $1", [head.nation]),
    ).toEqual([{ vacancy_cause: "removal" }]);
    expect(
      await rows(test.db, "select user_id from house_members where faction_id = $1 and role = 'leader'", [
        row,
      ]),
    ).toEqual([{ user_id: head.userId }]);
    const election = (await gov.view(head.userId)).agendas.find(
      (agenda) => agenda.kind === "leader_election" && agenda.status === "open",
    );
    expect(election).toBeDefined();
    expect(election?.barred ?? null).toBeNull();
    // 해임된 가문원도 스스로 나설 수 있다(자율 출마)
    expect(await gov.service.register(head.userId, election?.id ?? 0)).toMatchObject({ ok: true });
    gov.stop();
    // 가문장이 사라진 빈자리(까닭 없음 — 옛 판·떠남): 후계자가 없으면 서열 = 직위 → 기여도 → 들어온 차례 → rich가 잇는다
    await pool.query(
      "update governance_agendas set status = 'cancelled' where nation_id = $1 and status = 'open'",
      [head.nation],
    );
    await pool.query("update governance_state set vacancy_cause = null where nation_id = $1", [head.nation]);
    const again = governance(world, () => BASE_RULES);
    await again.service.tick();
    expect(
      await rows(test.db, "select user_id from house_members where faction_id = $1 and role = 'leader'", [
        row,
      ]),
    ).toEqual([{ user_id: rich.userId }]);
    expect(
      await rows(
        test.db,
        "select vacant_since_ms, vacancy_cause from governance_state where nation_id = $1",
        [head.nation],
      ),
    ).toEqual([{ vacant_since_ms: null, vacancy_cause: null }]);
    again.stop();
  }, 120_000);
});
