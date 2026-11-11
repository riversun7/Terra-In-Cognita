// 가문 도시 DB 통합 시험(질문 1005 가, D-216·D-340·D-339, docs/adr/2026-11-11-house-village.md) — TEST_DATABASE_URL이 있을 때만. 계정은 가짜 값이다.
// 봉신 마을: 가문장만·기기가 본 값·자리 규칙(가장자리·다른 도시와 가까움·다른 나라 영향권)·값 소각·가문 소유 주체·위 세력 = 나라·지분 1000주·
// 가문원 소식·시야 묶음(가문 주체 → 나라)·고른 상태는 바꾸지 못함·도시 가진 가문은 해산 못 함·다시 켜도 거울 세계에 가문(판단 없음).
// 독립 + 폐허 고르기: 가문장이 정부를 지어 주인이 된 폐허를 가문 도시로(독립은 체제를 고름) → 되살아날 세력 = 가문, 위 세력 없음·체제,
// 가문원 시야 = 가문(옛 나라와 따로), 같은 상태로 마을도 세운다.
import { loadContentPack } from "@terra/content/node";
import { DAY_MS, shareAsset } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { nationOfOwner } from "../world/nationVision.ts";
import { ASSET_CREDIT, SYSTEM_ISSUE_CREDIT } from "../world/settlement.ts";
import { silentLog } from "../world/testSupport.ts";
import { type World, startWorld } from "../world/world.ts";
import { createHouseFounder } from "./found.ts";
import { createHouseCity } from "./houseCity.ts";
import { createHouseMembers } from "./members.ts";
import { TEST_HOUSE_RULES } from "./rules.ts";
import { createFactionIdentityServices, createFactionIdentityShared } from "./services.ts";
import { createHouseSuccession } from "./succession.ts";

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
    appearance: { head: "dome", face: "visor", body: "slim", limbs: "piston", primary: "mint", accent: "lemon" },
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
async function house(world: World, leader: string, name: string, short: string, joiners: { userId: string; name: string }[]) {
  const { persistence } = parts(world);
  const pool = test.db.$client;
  const nationOf = (userId: string) => persistence.cyborgs.record(userId)?.factionId;
  const identity = createFactionIdentityServices(
    createFactionIdentityShared({ pool, now: () => clock, limits: { saves: RELAXED, uploads: RELAXED } }),
    { db: test.db, ip: null },
  );
  await identity.save(viewer(leader), { name, shortName: short, color: "#2980b9", emblem: EMBLEM, upload: { mode: "none" } });
  const founded = await createHouseFounder({ pool, db: test.db, rules: () => TEST_HOUSE_RULES, now: () => clock, nationOf }).found(
    leader,
    { cost: "0" },
  );
  if (!founded.ok) throw new Error(founded.code);
  const members = createHouseMembers({ pool, db: test.db, rules: () => TEST_HOUSE_RULES, now: () => clock, nationOf });
  for (const joiner of joiners) {
    await members.invite(leader, joiner.name);
    const offer = (await identity.house(viewer(joiner.userId))).offers[0];
    if (!offer) throw new Error("no offer");
    await members.answer(joiner.userId, offer.id, true);
  }
  return { factionId: founded.factionId, identity };
}

const service = (world: World) =>
  createHouseCity({ pool: test.db.$client, db: test.db, rules: () => TEST_HOUSE_RULES, now: () => clock, world: () => world });

/** 아무 도시·폐허에서도 멀고 놓을 수 있는 칸(own 영향권만 내 편) */
function freeSpot(world: World, own: number[]): { mapKey: number; x: number; y: number } {
  const { npc } = parts(world);
  for (const map of world.maps.values())
    for (let y = 20; y < 236; y += 6)
      for (let x = 20; x < 236; x += 6)
        if (
          map.canPlace({ x, y, width: 1, height: 1, rotation: 0 }) &&
          npc.houses.siteCheck(map.mapKey, x, y, own) === null
        )
          return { mapKey: map.mapKey, x, y };
  throw new Error("no free spot");
}

describe.skipIf(!TEST_DATABASE_URL)("가문 도시(질문 1005 가)", () => {
  it("봉신 마을: 가문장·값·자리 규칙 → 가문 주체(위 세력 = 나라)·지분·소식·시야, 상태 고정, 해산 막힘, 다시 켜도 거울 세계에 가문", async () => {
    let world = await boot();
    let { persistence, npc } = parts(world);
    const leader = await citizen(world, "Lordone");
    const member = await citizen(world, "Vasone");
    const { factionId } = await house(world, leader.userId, "봉신가문", "VSL", [member]);
    const cities = service(world);
    // 가문장 둘레에서 서버가 고른 마을 자리(봉신 = 내 나라 영향권 안도 된다)
    const view = await cities.view(leader.userId, { factionId, leader: true });
    expect(view).toMatchObject({ status: null, cities: [], villageCost: "5000", villageHousing: 8, ready: true });
    const site = view.site;
    if (!site) throw new Error("no site");
    const input = { ...site, cost: "5000", mode: "vassal" as const };
    expect(await cities.village(member.userId, input)).toEqual({ ok: false, code: "not_leader" });
    expect(await cities.village(leader.userId, { ...input, cost: "1" })).toEqual({ ok: false, code: "terms_changed" });
    expect(await cities.village(leader.userId, { ...input, mode: "independent" })).toEqual({
      ok: false,
      code: "regime_required",
    });
    expect(await cities.village(leader.userId, { ...input, x: 2 })).toEqual({ ok: false, code: "bad_spot" });
    persistence.settlement.settleOwner(leader.ownerId, clock);
    const before = persistence.ledger.balanceOf(leader.ownerId, ASSET_CREDIT);
    const result = await cities.village(leader.userId, input);
    if (!result.ok) throw new Error(result.code);
    expect(result).toMatchObject({ factionId, mode: "vassal", paid: "5000" });
    const cityId = result.cityId;
    // 가문 소유 주체·위 세력 = 나라·도시 행·지분·값
    const owner = npc.houses.ownerOfRow(factionId);
    if (owner === undefined) throw new Error("no house owner");
    expect(await rows(test.db, "select id from world_owners where faction_id = $1", [factionId])).toEqual([
      { id: String(owner) },
    ]);
    expect(await rows(test.db, "select parent_id, code, dissolved_at_ms from factions where id = $1", [factionId])).toEqual([
      { parent_id: String(leader.nation), code: null, dissolved_at_ms: null },
    ]);
    expect(
      await rows(test.db, "select faction_id, map_key, cell_x, cell_y, housing, start from world_cities where id = $1", [cityId]),
    ).toEqual([
      { faction_id: String(factionId), map_key: String(site.mapKey), cell_x: site.x, cell_y: site.y, housing: 8, start: false },
    ]);
    expect(persistence.ledger.balanceOf(owner, shareAsset(cityId))).toBe(1000n);
    expect(before - persistence.ledger.balanceOf(leader.ownerId, ASSET_CREDIT)).toBe(5000n);
    expect(npc.world.factions.get(owner)).toMatchObject({ player: true, overlord: npc.houses.ownerOfRow(leader.nation) });
    // 가문원 소식·시야(가문 주체 → 나라, 가문원 → 나라)
    const notices = await rows<{ kind: string; reason: string }>(
      test.db,
      "select kind, reason from house_notices where user_id = $1",
      [member.userId],
    );
    expect(notices).toContainEqual({ kind: "city_gained", reason: "vassal" });
    expect(nationOfOwner(world, owner)).toBe(leader.nation);
    expect(nationOfOwner(world, member.ownerId)).toBe(leader.nation);
    // 상태는 바꾸지 못하고, 같은 자리는 너무 가깝다
    expect(await cities.village(leader.userId, { ...input, mode: "independent", regime: "democracy" })).toEqual({
      ok: false,
      code: "mode_locked",
    });
    expect(await cities.village(leader.userId, input)).toEqual({ ok: false, code: "too_close" });
    // 다른 나라 도시 영향권(띄움 거리 밖, 영향권 안)
    const otherCity = [...npc.world.cities.values()].find(
      (city) => city.owner !== owner && city.owner !== npc.houses.ownerOfRow(leader.nation),
    );
    const otherPlace = otherCity ? npc.places.get(otherCity.id) : undefined;
    if (!otherPlace) throw new Error("no foreign city");
    const map = world.maps.get(otherPlace.mapKey);
    let foreign: { x: number; y: number } | undefined;
    for (const [dx, dy] of [
      [16, 0],
      [-16, 0],
      [0, 16],
      [0, -16],
      [17, 17],
      [-17, -17],
    ] as const)
      if (!foreign && map?.canPlace({ x: otherPlace.cellX + dx, y: otherPlace.cellY + dy, width: 1, height: 1, rotation: 0 }))
        foreign = { x: otherPlace.cellX + dx, y: otherPlace.cellY + dy };
    if (!foreign) throw new Error("no placeable cell near the foreign city");
    expect(await cities.village(leader.userId, { ...input, mapKey: otherPlace.mapKey, ...foreign })).toEqual({
      ok: false,
      code: "foreign_influence",
    });
    // 도시 가진 가문은 해산하지 못한다
    expect(await createHouseSuccession({ pool: test.db.$client, now: () => clock }).dissolve(leader.userId)).toEqual({
      ok: false,
      code: "has_city",
    });
    const after = await cities.view(leader.userId, { factionId, leader: true });
    expect(after).toMatchObject({ status: "vassal", regime: null, cities: [{ id: cityId, mapKey: site.mapKey }] });

    // 다시 켜도 거울 세계에 가문(판단 없음, 도시 그대로)
    await world.stop();
    worlds.splice(0);
    world = await boot();
    ({ persistence, npc } = parts(world));
    const mirror = npc.houses.mirrorOf(factionId);
    expect(mirror).toMatchObject({ ownerId: owner, vassal: true, cities: [cityId] });
    expect(npc.world.factions.get(owner)?.player).toBe(true);
    expect(npc.world.factions.get(owner)?.eventId).toBeUndefined();
    await npc.tick(true);
    expect(await rows(test.db, "select code, dissolved_at_ms, parent_id from factions where id = $1", [factionId])).toEqual([
      { code: null, dissolved_at_ms: null, parent_id: String(leader.nation) },
    ]);
  });

  it("독립 + 폐허 고르기: 정부를 지은 폐허를 가문 도시로(체제), 가문원 시야 = 가문, 같은 상태로 마을", async () => {
    const world = await boot();
    const { persistence, npc } = parts(world);
    const { ruins, facilities } = persistence;
    const leader = await citizen(world, "Freeone");
    const member = await citizen(world, "Freetwo");
    const outsider = await citizen(world, "Stayer");
    const { factionId } = await house(world, leader.userId, "자유가문", "FREE", [member]);
    const cities = service(world);

    // 가문장이 폐허에 정부를 지어 주인(되살리면 지금은 나라로)
    const made = await ruins.devMakeRuin(leader.userId);
    if (!made.ok || made.ruinId === undefined) throw new Error("dev ruin");
    const ruinId = made.ruinId;
    const overview = ruins.overview({ id: leader.userId, devGrant: true }, clock);
    const card = overview?.ruins.find((r) => r.id === ruinId);
    const at = card?.buildAt;
    if (!card || !at || !overview?.government) throw new Error("no build cell");
    const spot = { mapKey: card.mapKey, x: at.x, y: at.y };
    for (const stack of overview.government.materials)
      await facilities.service.devFacilityGrant(leader.userId, stack.item, stack.qty, spot);
    expect(await facilities.service.build(leader.userId, { ...spot, facility: "government_hall", rotation: 0 })).toMatchObject({
      ok: true,
    });
    expect(npc.world.ruins.get(ruinId)?.joinFaction).toBe(npc.houses.ownerOfRow(leader.nation));
    expect((await cities.view(leader.userId, { factionId, leader: true })).ruins).toEqual([{ id: ruinId, name: null }]);

    // 고르기: 주인이 아니면 못 함, 독립은 체제가 있어야
    expect(await cities.ruin(member.userId, { ruinId, mode: "vassal" })).toEqual({ ok: false, code: "not_leader" });
    expect(await cities.ruin(leader.userId, { ruinId: 999_999, mode: "vassal" })).toEqual({ ok: false, code: "unknown_ruin" });
    expect(await cities.ruin(leader.userId, { ruinId, mode: "independent" })).toEqual({ ok: false, code: "regime_required" });
    const chosen = await cities.ruin(leader.userId, { ruinId, mode: "independent", regime: "capitalism" });
    expect(chosen).toEqual({ ok: true, factionId, mode: "independent", cityId: ruinId, paid: "0" });
    const owner = npc.houses.ownerOfRow(factionId);
    if (owner === undefined) throw new Error("no house owner");
    expect(npc.world.ruins.get(ruinId)?.joinFaction).toBe(owner);
    expect(await rows(test.db, "select join_faction_id from world_ruins where id = $1", [ruinId])).toEqual([
      { join_faction_id: String(factionId) },
    ]);
    expect(await rows(test.db, "select parent_id, regime from factions where id = $1", [factionId])).toEqual([
      { parent_id: null, regime: "capitalism" },
    ]);
    // 시야: 가문 주체·가문원 = 가문(옛 나라와 따로), 가문 밖 시민 = 나라
    expect(nationOfOwner(world, owner)).toBe(factionId);
    expect(nationOfOwner(world, member.ownerId)).toBe(factionId);
    expect(nationOfOwner(world, leader.ownerId)).toBe(factionId);
    expect(nationOfOwner(world, outsider.ownerId)).toBe(leader.nation);

    // 같은 상태로 마을(독립 = 내 나라 영향권도 남의 것)
    const free = freeSpot(world, [owner]);
    expect(
      await cities.village(leader.userId, { ...free, cost: "5000", mode: "vassal" }),
    ).toEqual({ ok: false, code: "mode_locked" });
    const village = await cities.village(leader.userId, { ...free, cost: "5000", mode: "independent" });
    expect(village).toMatchObject({ ok: true, factionId, mode: "independent" });
    const view = await cities.view(leader.userId, { factionId, leader: true });
    expect(view).toMatchObject({ status: "independent", regime: "capitalism", ruins: [] });
    expect(view.cities).toHaveLength(1);
    // 가문원에게는 마을 자리·폐허가 없다
    expect(await cities.view(member.userId, { factionId, leader: false })).toMatchObject({ site: null, ruins: [] });
  });
});
