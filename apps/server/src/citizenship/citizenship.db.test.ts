// 국적·가문 소속 DB 통합 시험(ADR 2026-11-24-house-membership-separation.md) — TEST_DATABASE_URL이 있을 때만. 계정은 가짜 값이다.
// 1) 개인 국가 가입(귀화)은 허용하지 않는다(조건·명령 모두 in_house, 첫 접속 사이보그는 국가 미소속).
// 2) 가문 단위 소속: 가문원 시민권·내 도시 = 가문 소속 도시와 그 나라(가문 표 다시 읽기가 맞춘다), 사이보그와 보유한 모든 유닛이 주인의 가문에 속한다,
//    가문을 나가면 보유 유닛도 함께 무소속, 도시를 가진 가문의 소속 도시 = 그 가문 도시.
import { loadContentPack } from "@terra/content/node";
import { DAY_MS, TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { GOVERNMENT_FACILITY } from "../government/reads.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import type { Viewer } from "../trpc/context.ts";
import { houseTiesOf } from "../world/houseTies.ts";
import { ASSET_CREDIT, SYSTEM_ISSUE_CREDIT } from "../world/settlement.ts";
import { silentLog } from "../world/testSupport.ts";
import { type World, startWorld } from "../world/world.ts";
import { citizenshipServiceOf } from "./attach.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source) throw new Error("content pack");
const pack = createContentEditState(loaded.source).effective();
const FEE = BigInt(TEST_SOCIETY_COEFFICIENTS.cyborg.naturalizeFee);
const APPEARANCE = {
  head: "dome",
  face: "visor",
  body: "slim",
  limbs: "piston",
  primary: "mint",
  accent: "lemon",
} as const;

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
    testBots: 8,
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

/** 나라 index(첫 접속 목록 차례)의 첫 시작 도시에 사이보그를 만든다(국가 미소속으로 시작). extra = 더 줄 시험 화폐 */
async function cyborgIn(world: World, name: string, index: number, extra: bigint) {
  const p = persistenceOf(world);
  const userId = await fakeUser(name);
  const creation = p.cyborgs.creation(userId, clock);
  const faction = creation.factions[index];
  const city = faction?.cities[0];
  if (!faction || !city) throw new Error("no start city");
  await p.cyborgs.roll(userId, "balanced");
  const made = await p.cyborgs.create(userId, {
    name,
    appearance: APPEARANCE,
    factionId: faction.id,
    cityId: city.id,
    elements: { fire: 6, wind: 4 },
  });
  if (!made.ok) throw new Error(`cyborg ${made.code}`);
  const ownerId = p.settlement.ownerOfUser(userId, clock).id;
  if (extra > 0n)
    p.ledger.post({
      kind: "issue",
      atMs: clock,
      entries: [
        { account: p.ledger.systemAccount(SYSTEM_ISSUE_CREDIT, ASSET_CREDIT), amount: -extra },
        { account: p.ledger.ownerAccount(ownerId, ASSET_CREDIT), amount: extra },
      ],
    });
  await p.writer.durable();
  return { userId, ownerId, factionId: faction.id, cityId: city.id };
}

/** 그 나라(세력 행 ID)의 시작 도시 하나와 그 행정 건물 */
function hallOf(world: World, factionRow: number): { cityId: number; buildingId: number } {
  const p = persistenceOf(world);
  const npc = world.npc;
  if (!npc) throw new Error("npc runtime");
  for (const record of p.facilities.service.facilities.values()) {
    if (record.facilityId !== GOVERNMENT_FACILITY || record.cityId === null) continue;
    const city = npc.world.cities.get(record.cityId);
    if (city && p.owners.get(city.owner)?.factionId === factionRow)
      return { cityId: city.id, buildingId: record.buildingId };
  }
  throw new Error(`no government hall for faction ${factionRow}`);
}

/** 사이보그 본체를 그 도시 시청 칸 둘레로 옮긴다(다른 2차맵이면 넘긴다) */
function moveBodyTo(world: World, userId: string, cityId: number): void {
  const p = persistenceOf(world);
  const place = world.npc?.places.get(cityId);
  const unitId = p.cyborgs.record(userId)?.unitId;
  if (!place || unitId === undefined || unitId === null) throw new Error("place or body");
  const from = [...world.maps.values()].find((map) => map.unitInfo(unitId));
  const to = world.maps.get(place.mapKey);
  if (!from || !to) throw new Error("maps");
  if (from === to) {
    expect(to.relocateToSafety(unitId, { x: place.cellX + 4, y: place.cellY + 4 })).toBe(true);
    return;
  }
  const row = from.transferOut(unitId);
  if (!row) throw new Error("transfer out");
  for (let d = 4; d < 30; d++) if (to.transferIn(row, place.cellX + d, place.cellY + d)) return;
  throw new Error("transfer in");
}

describe.skipIf(!TEST_DATABASE_URL)("국적·가문 소속 (ADR 2026-11-24)", () => {
  it("개인 국가 가입(귀화)은 허용하지 않고(in_house), 첫 접속 사이보그는 국가 미소속이다", async () => {
    const world = await boot();
    const p = persistenceOf(world);
    const service = citizenshipServiceOf(world, { now: () => clock })();
    if (!service) throw new Error("citizenship service");
    const me = await cyborgIn(world, "Wanderer", 0, 1_000n);
    const viewer: Viewer = { id: me.userId, loginId: "wanderer", roles: [] };
    expect(p.cyborgs.record(me.userId)?.factionId).toBeNull();
    expect(
      await rows(test.db, "select faction_id from faction_members where user_id = $1", [me.userId]),
    ).toEqual([]);
    const target = p.cyborgs.creation(me.userId, clock).factions.find((f) => f.id !== me.factionId);
    if (!target) throw new Error("second nation");
    const hall = hallOf(world, target.id);
    moveBodyTo(world, me.userId, hall.cityId);

    const terms = await service.terms(viewer, hall.buildingId, clock);
    expect(terms.status).toBe("ready");
    expect(terms.terms?.blocked).toBe("in_house");
    expect(
      await service.change(me.userId, {
        buildingId: hall.buildingId,
        factionId: target.id,
        cost: String(FEE),
      }),
    ).toEqual({ ok: false, code: "in_house" });
    // 행정 건물이 아닌 건물
    const notHall = [...p.facilities.service.facilities.values()].find(
      (f) => f.facilityId !== GOVERNMENT_FACILITY,
    );
    if (notHall)
      expect(
        await service.change(me.userId, {
          buildingId: notHall.buildingId,
          factionId: target.id,
          cost: String(FEE),
        }),
      ).toEqual({ ok: false, code: "not_government" });
  });

  it("가문 소속과 보유 유닛 통일: 가문원 시민권·내 도시 = 가문 소속 도시, 보유한 모든 유닛이 가문에 속함, 탈퇴 시 모두 무소속, 도시 가진 가문", async () => {
    const world = await boot();
    const p = persistenceOf(world);
    const ties = houseTiesOf(p);
    if (!ties) throw new Error("house ties");
    const service = citizenshipServiceOf(world, { now: () => clock })();
    if (!service) throw new Error("citizenship service");
    const me = await cyborgIn(world, "Onenation", 0, 1_000n);
    const target = p.cyborgs.creation(me.userId, clock).factions.find((f) => f.id !== me.factionId);
    if (!target) throw new Error("second nation");
    const hall = hallOf(world, target.id);
    // 나라 B 도시를 소속 도시로 둔 가문에 든다(가문장)
    const made = await rows<{ id: string }>(
      test.db,
      "insert into factions (kind, born_of) values ('player', $1) returning id",
      [target.id],
    );
    const houseId = Number(made[0]?.id);
    await test.db.$client.query(
      "insert into house_members (user_id, faction_id, role, joined_at_ms) values ($1, $2, 'leader', 0)",
      [me.userId, houseId],
    );
    await test.db.$client.query(
      "insert into house_homes (faction_id, city_id, set_at_ms) values ($1, $2, 0)",
      [houseId, hall.cityId],
    );
    await ties.reload();
    expect(p.cyborgs.record(me.userId)).toMatchObject({ factionId: target.id, startCityId: hall.cityId });
    expect(
      await rows(test.db, "select faction_id from faction_members where user_id = $1", [me.userId]),
    ).toEqual([{ faction_id: String(target.id) }]);
    expect(
      await rows(test.db, "select faction_id, start_city_id from cyborgs where user_id = $1", [me.userId]),
    ).toEqual([{ faction_id: String(target.id), start_city_id: String(hall.cityId) }]);
    // 같은 나라 정부는 same_nation, 다른 나라 정부는 in_house
    const home = hallOf(world, me.factionId);
    moveBodyTo(world, me.userId, home.cityId);
    const viewer: Viewer = { id: me.userId, loginId: "onenation", roles: [] };
    expect((await service.terms(viewer, hall.buildingId, clock)).terms?.blocked).toBe("same_nation");
    expect((await service.terms(viewer, home.buildingId, clock)).terms?.blocked).toBe("in_house");
    expect(
      await service.change(me.userId, {
        buildingId: home.buildingId,
        factionId: me.factionId,
        cost: String(FEE),
      }),
    ).toEqual({ ok: false, code: "in_house" });

    // 보유 유닛 가문 소속 통일: 사이보그 본체뿐 아니라 이미 보유한 모든 유닛이 주인의 가문에 속한다
    const body = p.cyborgs.record(me.userId)?.unitId ?? 0;
    ties.assignUnit(900_001, me.userId, clock);
    await p.writer.durable();
    expect(ties.unitHouseOf(900_001, me.userId)).toBe(houseId);
    expect(ties.unitHouseOf(body, me.userId)).toBe(houseId);
    expect(ties.unitHouseOf(900_002, me.userId)).toBe(houseId);

    // 도시를 가진 가문(D-569 1743): 소속 도시 = 그 가문 도시, 독립이면 나라 = 그 가문
    await test.db.$client.query(
      "insert into world_owners (id, faction_id, settled_at_ms) values (99101, $1, 0)",
      [houseId],
    );
    await test.db.$client.query(
      "insert into world_cities (id, faction_id, map_key, cell_x, cell_y, start, founded_at_ms) values (990101, $1, 7, 3, 3, false, 0)",
      [houseId],
    );
    await ties.reload();
    expect(await rows(test.db, "select city_id from house_homes where faction_id = $1", [houseId])).toEqual([
      { city_id: "990101" },
    ]);
    expect(p.cyborgs.record(me.userId)).toMatchObject({ factionId: houseId, startCityId: 990101 });
    // 다시 읽어도 그대로(멱등)
    await ties.reload();
    expect(p.cyborgs.record(me.userId)).toMatchObject({ factionId: houseId, startCityId: 990101 });

    // 가문을 나가면 보유 유닛 모두 무소속이 된다
    await test.db.$client.query("delete from house_members where user_id = $1", [me.userId]);
    await ties.reload();
    expect(ties.houseOfUser(me.userId)).toBeUndefined();
    expect(ties.unitHouseOf(900_001, me.userId)).toBeUndefined();
    expect(ties.unitHouseOf(900_002, me.userId)).toBeUndefined();
    expect(ties.unitHouseOf(body, me.userId)).toBeUndefined();
  });
});
