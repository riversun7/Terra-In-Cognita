// 가문 도시 구인 DB 통합 시험(질문 1041 다, 기획 D-533 "자동 구인", docs/adr/2026-11-11-house-village.md "바뀜 (2026-11-12)") — TEST_DATABASE_URL이
// 있을 때만. 계정은 가짜 값이다.
// 봉신 마을을 세운 가문: 마을 건물(행정 건물 + 숙소, 질문 1052 다)이 도시 배치로 선다. 자동 구인(기본 켬)은 국고가 비면 사지 않고, 국고가 차면 NPC와 같은 규칙식으로 주민을 들인다. 가문장만 끄고 켠다
// (factions.recruit_auto·감사 기록). 끈 뒤 가문장이 카드를 손으로 산다(국고가 모자라면 가문장 지갑) — 기기가 본 값이 다르면 cards_changed, 산
// 칸은 taken. 다시 켜도 끔 상태와 주민이 그대로다.
import { loadContentPack } from "@terra/content/node";
import { DAY_MS, HOUR_MS } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { houseTiesOf } from "../world/houseTies.ts";
import { ASSET_CREDIT, SYSTEM_ISSUE_CREDIT } from "../world/settlement.ts";
import { silentLog } from "../world/testSupport.ts";
import { type World, startWorld } from "../world/world.ts";
import { createHouseFounder } from "./found.ts";
import { createHouseCity } from "./houseCity.ts";
import { createHouseHome } from "./houseHome.ts";
import { createHouseRecruitService } from "./houseRecruit.ts";
import { createHouseMembers } from "./members.ts";
import { TEST_HOUSE_RULES } from "./rules.ts";
import { createFactionIdentityServices, createFactionIdentityShared } from "./services.ts";

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

/** 사이보그(나라 n번째, 그 나라 첫 도시)를 만들고 시험 화폐를 준다 */
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
  const ownerId = persistence.settlement.ownerOfUser(userId, clock).id;
  persistence.ledger.post({
    kind: "issue",
    atMs: clock,
    entries: [
      { account: persistence.ledger.systemAccount(SYSTEM_ISSUE_CREDIT, ASSET_CREDIT), amount: -100_000n },
      { account: persistence.ledger.ownerAccount(ownerId, ASSET_CREDIT), amount: 100_000n },
    ],
  });
  await persistence.writer.durable();
  return { userId, ownerId, nation: faction.id, name };
}

/** 가문 창설 + 가문원 초대·받기. 가문 세력 행 */
async function house(
  world: World,
  leader: string,
  name: string,
  short: string,
  joiners: { userId: string; name: string }[],
) {
  const { persistence } = parts(world);
  const pool = test.db.$client;
  const nationOf = (userId: string) => persistence.cyborgs.record(userId)?.factionId;
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
  const founded = await createHouseFounder({
    pool,
    db: test.db,
    now: () => clock,
    nationOf,
  }).found(leader, { cost: "0" });
  if (!founded.ok) throw new Error(founded.code);
  // 창설은 도시·국가 미소속이다(ADR 2026-11-24-house-membership-separation.md) — 가문원을 들이기 전에(1인 가문은 공고 없이
  // 바로) 가문장의 출발 도시에 가입해 그 나라 가문이 된다
  const startCity = persistence.cyborgs.record(leader)?.startCityId;
  if (startCity === undefined) throw new Error("no start city");
  const joined = await createHouseHome({
    pool,
    db: test.db,
    rules: () => TEST_HOUSE_RULES,
    now: () => clock,
  }).set(leader, startCity);
  if (!joined.ok) throw new Error(`home ${joined.code}`);
  const members = createHouseMembers({
    pool,
    db: test.db,
    rules: () => TEST_HOUSE_RULES,
    now: () => clock,
    nationOf,
  });
  for (const joiner of joiners) {
    await members.invite(leader, joiner.name);
    const offer = (await identity.house(viewer(joiner.userId))).offers[0];
    if (!offer) throw new Error("no offer");
    await members.answer(joiner.userId, offer.id, true);
  }
  // 서버는 가문 일이 바뀔 때마다 가문 소속 표를 다시 읽는다(attach.ts afterChange) — 가문원 국적·내 도시가 가문 나라로 맞춰진다
  await houseTiesOf(persistence)?.reload();
  return { factionId: founded.factionId, identity };
}

/** 시험 화폐를 그 주체에 넣는다 */
function issue(world: World, ownerId: number, amount: bigint): void {
  const { persistence } = parts(world);
  persistence.ledger.post({
    kind: "issue",
    atMs: clock,
    entries: [
      { account: persistence.ledger.systemAccount(SYSTEM_ISSUE_CREDIT, ASSET_CREDIT), amount: -amount },
      { account: persistence.ledger.ownerAccount(ownerId, ASSET_CREDIT), amount },
    ],
  });
}

/** 30분씩 민다 */
async function advance(world: World, ms: number): Promise<void> {
  const { npc, persistence } = parts(world);
  for (let passed = 0; passed < ms; passed += 30 * 60_000) {
    clock += 30 * 60_000;
    await npc.tick();
  }
  await persistence.writer.durable();
}

const population = (world: World, owner: number, cityId: number): number =>
  [...parts(world).npc.world.units.values()].filter((unit) => unit.owner === owner && unit.city === cityId)
    .length;

describe.skipIf(!TEST_DATABASE_URL)("가문 도시 구인(질문 1041 다)", () => {
  it("자동 구인은 국고로 주민을 들이고, 가문장이 끄면 손으로 산다(국고가 모자라면 가문장 지갑)", async () => {
    let world = await boot();
    const leader = await citizen(world, "Recone");
    const member = await citizen(world, "Rectwo");
    const { factionId } = await house(world, leader.userId, "구인가문", "RCT", [member]);
    const cities = createHouseCity({
      pool: test.db.$client,
      db: test.db,
      rules: () => TEST_HOUSE_RULES,
      now: () => clock,
      world: () => world,
    });
    const recruit = createHouseRecruitService({
      pool: test.db.$client,
      db: test.db,
      now: () => clock,
      world: () => world,
    });
    // 도시를 얻기 전: 구인 칸 없음, 명령은 not_house_city
    expect((await cities.view(leader.userId, { factionId, leader: true })).recruit).toBeNull();
    expect(await recruit.setAuto(leader.userId, false)).toEqual({ ok: false, code: "not_house_city" });
    const site = (await cities.view(leader.userId, { factionId, leader: true })).site;
    if (!site) throw new Error("no site");
    const made = await cities.village(leader.userId, { ...site, cost: "5000", mode: "vassal" });
    if (!made.ok) throw new Error(made.code);
    const cityId = made.cityId;
    const { npc } = parts(world);
    // 마을 건물(질문 1052 다): 행정 건물(마을 칸 가운데 둘레) + 숙소 하나 + 물자 거래소(D-561, 질문 1946)가 도시 배치 함수로 선다
    await parts(world).persistence.writer.durable();
    const built = await rows<{ facility_id: string; x: number; y: number; width: number; height: number }>(
      test.db,
      `select f.facility_id, b.x, b.y, b.width, b.height from world_facilities f join world_buildings b on b.id = f.building_id
        where f.city_id = $1 order by f.facility_id`,
      [cityId],
    );
    expect(built.map((row) => row.facility_id)).toEqual(["goods_exchange", "government_hall", "lodging"]);
    const hall = built.find((row) => row.facility_id === "government_hall");
    if (!hall) throw new Error("no hall");
    expect(Math.abs(hall.x + (hall.width >> 1) - site.x)).toBeLessThanOrEqual(4);
    expect(Math.abs(hall.y + (hall.height >> 1) - site.y)).toBeLessThanOrEqual(4);
    const owner = npc.houses.ownerOfRow(factionId);
    if (owner === undefined) throw new Error("no house owner");
    const view = (await cities.view(leader.userId, { factionId, leader: true })).recruit;
    expect(view).toMatchObject({
      auto: true,
      treasury: "0",
      cities: [{ id: cityId, population: 0, housing: 8 }],
    });
    expect(view?.cities[0]?.cards.length).toBeGreaterThan(0);
    // 가문원에게는 카드를 보이지 않는다
    expect(
      (await cities.view(member.userId, { factionId, leader: false })).recruit?.cities[0]?.cards,
    ).toEqual([]);
    // 국고가 비면 자동 구인이 사지 않는다(판단 간격 6시간 ± 25%)
    await advance(world, 8 * HOUR_MS);
    expect(population(world, owner, cityId)).toBe(0);
    // 국고가 차면 NPC와 같은 규칙식으로 산다(주거 목표까지)
    issue(world, owner, 1_000_000n);
    await advance(world, 8 * HOUR_MS);
    const auto = population(world, owner, cityId);
    expect(auto).toBeGreaterThan(0);
    expect(
      Number(
        (
          await rows<{ n: string }>(test.db, "select count(*) as n from world_humans where city_id = $1", [
            cityId,
          ])
        )[0]?.n,
      ),
    ).toBe(auto);

    // 가문장만 끈다(저장·감사 기록)
    expect(await recruit.setAuto(member.userId, false)).toEqual({ ok: false, code: "not_leader" });
    expect(await recruit.setAuto(leader.userId, false)).toEqual({ ok: true, auto: false });
    expect(await rows(test.db, "select recruit_auto from factions where id = $1", [factionId])).toEqual([
      { recruit_auto: false },
    ]);
    expect(
      await rows(test.db, "select after from audit_log where action = 'faction.house_recruit_auto'"),
    ).toEqual([{ after: { factionId, auto: false } }]);
    // 끈 뒤에는 자동으로 사지 않는다(카드가 새로 나와도)
    await advance(world, DAY_MS);
    expect(population(world, owner, cityId)).toBe(auto);

    // 손으로 사기: 국고를 비우면 가문장 지갑에서 낸다
    const { persistence } = parts(world);
    persistence.ledger.post({
      kind: "drain",
      atMs: clock,
      entries: [
        {
          account: persistence.ledger.ownerAccount(owner, ASSET_CREDIT),
          amount: -persistence.ledger.balanceOf(owner, ASSET_CREDIT),
        },
        {
          account: persistence.ledger.systemAccount(SYSTEM_ISSUE_CREDIT, ASSET_CREDIT),
          amount: persistence.ledger.balanceOf(owner, ASSET_CREDIT),
        },
      ],
    });
    const board = (await cities.view(leader.userId, { factionId, leader: true })).recruit;
    const card = board?.cities[0]?.cards.find((entry) => !entry.taken);
    if (!board || !card) throw new Error("no card");
    const input = { cityId, window: board.window, slot: card.slot, cost: card.cost };
    expect(await recruit.hire(leader.userId, { ...input, cost: `${card.cost}1` })).toEqual({
      ok: false,
      code: "cards_changed",
    });
    expect(await recruit.hire(member.userId, input)).toEqual({ ok: false, code: "not_leader" });
    persistence.settlement.settleOwner(leader.ownerId, clock);
    const wallet = persistence.ledger.balanceOf(leader.ownerId, ASSET_CREDIT);
    const hired = await recruit.hire(leader.userId, input);
    if (!hired.ok) throw new Error(hired.code);
    expect(hired).toMatchObject({ auto: false, payer: "leader" });
    expect(wallet - persistence.ledger.balanceOf(leader.ownerId, ASSET_CREDIT)).toBe(BigInt(card.cost));
    expect(population(world, owner, cityId)).toBe(auto + 1);
    expect(npc.world.units.get(hired.unitId ?? 0)?.owner).toBe(owner);
    expect(
      await rows(test.db, "select city_id from world_humans where unit_id = $1", [hired.unitId]),
    ).toEqual([{ city_id: String(cityId) }]);
    expect(await recruit.hire(leader.userId, input)).toEqual({ ok: false, code: "taken" });

    // 다시 켜도 끔 상태·주민 그대로
    await world.stop();
    worlds.splice(0);
    world = await boot();
    const again = parts(world).npc;
    expect(again.houseRecruit.auto(owner)).toBe(false);
    expect(population(world, owner, cityId)).toBe(auto + 1);
    expect(await recruit.setAuto(leader.userId, true)).toEqual({ ok: true, auto: true });
    expect(again.houseRecruit.auto(owner)).toBe(true);
  });
});
