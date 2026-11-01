// 사이보그 만들기 DB 통합 시험(docs/adr/2026-11-01-first-login-cyborg.md) — TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
// 서버 규칙: 굴림 합 60·칸 1~20, 굴림 횟수(처음 1 + 다시 굴리기 3, 서버 저장·다시 켜도 남음), 이름 규칙·사칭·고유(대소문자 무시),
// 계정당 하나, 시작 도시 둘레에 세계 유닛으로 놓기(시야로 2차맵이 열림), 한 커밋 저장, 부팅이 잃은 본체를 다시 놓기(I13),
// 속성 분배(D-450, N36: 4원소 두 칸까지 합 10, 분배 없는 옛 사이보그는 한 번 나눔), 본체 생활비(D-453: 유지비를 내고 못 내면 비효율).
import { DEFAULT_CYBORG_APPEARANCE, zeroElements } from "@terra/shared/cyborg";
import { CELL_UNITS, positionAt } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { testRosterCatalog } from "../roster/catalog.ts";
import { realCyborgBody } from "../roster/cyborgBody.ts";
import { createWorldRosterSource } from "../roster/worldUnits.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { silentLog } from "../world/testSupport.ts";
import { UNIT_KIND_CYBORG } from "../world/unitKinds.ts";
import { TEST_MAP_KEY, type World, startWorld } from "../world/world.ts";
import { PLACE_SEARCH_RADIUS } from "./service.ts";

let test: TestDatabase;
let clock = 1_800_000_000_000;
const worlds: World[] = [];

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
  clock = 1_800_000_000_000;
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  for (const world of worlds.splice(0)) await world.stop().catch(() => undefined);
  await test.drop();
});

async function boot(): Promise<World> {
  const world = startWorld({
    testBots: 0,
    paths: { kind: "inline" },
    now: () => clock,
    log: silentLog,
    pool: test.db.$client,
    writeIntervalMs: 10,
    onFatal: (error) => {
      throw error;
    },
  });
  worlds.push(world);
  await world.ready;
  return world;
}

async function restart(world: World): Promise<World> {
  await world.stop();
  worlds.splice(worlds.indexOf(world), 1);
  return boot();
}

async function fakeUser(name: string): Promise<string> {
  const found = await rows<{ id: string }>(
    test.db,
    `insert into users (name, email, username) values ($1, $2, $3) returning id`,
    [name, `${name}@id.placeholder.invalid`, name.toLowerCase()],
  );
  return String(found[0]?.id);
}

function cyborgsOf(world: World) {
  const found = world.persistence?.cyborgs;
  if (!found) throw new Error("no cyborg service");
  return found;
}

/** 이 서버의 시작 도시(시험 NPC 세력, 시험 2차맵 가운데) */
function startOf(world: World, userId: string) {
  const faction = cyborgsOf(world).creation(userId, clock).factions[0];
  const city = faction?.cities[0];
  if (!faction || !city) throw new Error("no start city");
  return { factionId: faction.id, cityId: city.id };
}

const sum = (stats: Record<string, number>) => Object.values(stats).reduce((a, b) => a + b, 0);
const fireWind = { fire: 6, wind: 4 };

describe.skipIf(!TEST_DATABASE_URL)("사이보그 만들기", () => {
  it("굴림: 합 60·칸 1~20, 처음 1번 + 다시 굴리기 3번까지, 다 쓰면 rolls_exhausted, 다시 켜도 횟수가 남는다", async () => {
    let world = await boot();
    const user = await fakeUser("Roll_User");
    const service = cyborgsOf(world);
    expect(service.creation(user, clock).roll).toBeNull();
    expect(service.creation(user, clock).rules).toEqual({
      statSum: 60,
      statMin: 1,
      statMax: 20,
      rollsMax: 4,
      elementCells: 2,
      elementPoints: 10,
    });
    expect(await service.roll(user, "berserker")).toEqual({ ok: false, code: "unknown_temperament" });
    const lefts: number[] = [];
    for (const temperament of ["combat", "tech", "trade", "balanced"]) {
      const result = await service.roll(user, temperament);
      if (!result.ok || !result.roll) throw new Error("roll failed");
      expect(result.roll.temperament).toBe(temperament);
      expect(sum(result.roll.stats)).toBe(60);
      for (const value of Object.values(result.roll.stats)) {
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(20);
      }
      lefts.push(result.roll.rollsLeft);
    }
    expect(lefts).toEqual([3, 2, 1, 0]);
    expect(await service.roll(user, "combat")).toEqual({ ok: false, code: "rolls_exhausted" });
    const saved = await rows<{ rolls_used: number; temperament: string }>(
      test.db,
      `select rolls_used, temperament from cyborg_rolls where user_id = $1`,
      [user],
    );
    expect(saved).toEqual([{ rolls_used: 4, temperament: "balanced" }]);

    world = await restart(world);
    const again = cyborgsOf(world);
    expect(again.creation(user, clock).roll).toMatchObject({
      temperament: "balanced",
      rollsLeft: 0,
      rollsMax: 4,
    });
    expect(await again.roll(user, "tech")).toEqual({ ok: false, code: "rolls_exhausted" });
  });

  it("만들기: 굴림·이름(규칙·사칭·대소문자 무시 고유)·외형·세력·도시를 서버가 보고, 계정당 하나다", async () => {
    const world = await boot();
    const service = cyborgsOf(world);
    const a = await fakeUser("Maker_A");
    const b = await fakeUser("Maker_B");
    const start = startOf(world, a);
    const input = { name: "Nova", appearance: DEFAULT_CYBORG_APPEARANCE, ...start, elements: fireWind };
    expect(await service.create(a, input)).toEqual({ ok: false, code: "roll_required" });
    await service.roll(a, "combat");
    expect(await service.create(a, { ...input, name: "No va" })).toEqual({ ok: false, code: "name_invalid" });
    expect(await service.create(a, { ...input, name: "운영자" })).toEqual({
      ok: false,
      code: "name_reserved",
    });
    expect(
      await service.create(a, { ...input, appearance: { ...DEFAULT_CYBORG_APPEARANCE, head: "tophat" } }),
    ).toEqual({ ok: false, code: "appearance_invalid" });
    expect(await service.create(a, { ...input, factionId: 999_999 })).toEqual({
      ok: false,
      code: "unknown_faction",
    });
    expect(await service.create(a, { ...input, cityId: 999_999 })).toEqual({
      ok: false,
      code: "unknown_city",
    });
    expect(service.nameCheck("NOVA")).toEqual({ ok: true, display: "NOVA" });
    expect(await service.create(a, input)).toEqual({ ok: true });
    expect(await service.create(a, { ...input, name: "Other" })).toEqual({
      ok: false,
      code: "already_created",
    });
    expect(await service.roll(a, "tech")).toEqual({ ok: false, code: "already_created" });
    expect(service.status(a)).toEqual({
      cyborg: { name: "Nova", appearance: DEFAULT_CYBORG_APPEARANCE, elementsPending: false },
    });
    expect(service.creation(a, clock)).toMatchObject({ created: true, elementsPending: false });
    expect(service.record(a)?.elements).toEqual({ ...zeroElements(), fire: 6, wind: 4 });

    expect(service.nameCheck("nOvA")).toEqual({ ok: false, code: "taken" });
    expect(service.nameCheck("철")).toEqual({ ok: false, code: "too_short" });
    await service.roll(b, "trade");
    expect(await service.create(b, { ...input, name: "NOVA" })).toEqual({ ok: false, code: "name_taken" });
    expect(await service.create(b, { ...input, name: "노바" })).toEqual({ ok: true });
    // 추천(D-218): 두 사이보그 모두 하나뿐인 세력에 들었다. 붐빔은 그 도시에서 시작한 수
    const view = service.creation(b, clock);
    expect(view.factions[0]).toMatchObject({ recommended: true, cyborgs: 2 });
    expect(view.factions[0]?.cities[0]).toMatchObject({ cyborgs: 2, crowding: "quiet" });
  });

  it("놓기: 시작 도시 둘레의 내 세계 유닛(종류 3)이고 시야로 2차맵이 열린다. 한 커밋으로 남고 보유 유닛에는 들지 않는다", async () => {
    let world = await boot();
    const user = await fakeUser("Place_User");
    const service = cyborgsOf(world);
    const start = startOf(world, user);
    await service.roll(user, "tech");
    expect(
      await service.create(user, {
        name: "Placer",
        appearance: DEFAULT_CYBORG_APPEARANCE,
        ...start,
        elements: { earth: 10 },
      }),
    ).toEqual({
      ok: true,
    });
    const record = service.record(user);
    const unitId = record?.unitId;
    if (!record || unitId === null || unitId === undefined) throw new Error("no body unit");
    const map = world.maps.get(TEST_MAP_KEY);
    const info = map?.unitInfo(unitId);
    const ownerId = world.ownerOfUser?.(user);
    expect(info?.ownerId).toBe(ownerId);
    const [city] = await rows<{ cell_x: number; cell_y: number }>(
      test.db,
      `select cell_x, cell_y from world_cities where id = $1`,
      [start.cityId],
    );
    if (!info || !city) throw new Error("no unit or city");
    const at = positionAt(info.motion, clock);
    expect(Math.abs(Math.floor(at.x / CELL_UNITS) - city.cell_x)).toBeLessThanOrEqual(PLACE_SEARCH_RADIUS);
    expect(Math.abs(Math.floor(at.y / CELL_UNITS) - city.cell_y)).toBeLessThanOrEqual(PLACE_SEARCH_RADIUS);
    // 내 유닛이 있으니 2차맵을 볼 수 있다(탐사가 비어 2차맵이 까맣던 문제)
    expect(await map?.vision.canView({ userId: user, ownerId })).toBe(true);

    const [saved] = await rows<{
      unit_id: string;
      faction_id: string;
      kind: number;
      member: string | null;
      rolls: string;
    }>(
      test.db,
      `select c.unit_id, c.faction_id, u.kind,
              (select faction_id from faction_members m where m.user_id = c.user_id) as member,
              (select count(*) from cyborg_rolls r where r.user_id = c.user_id) as rolls
         from cyborgs c join world_units u on u.id = c.unit_id where c.user_id = $1`,
      [user],
    );
    expect(saved).toMatchObject({ kind: UNIT_KIND_CYBORG });
    expect(Number(saved?.unit_id)).toBe(unitId);
    expect(Number(saved?.member)).toBe(start.factionId);
    expect(Number(saved?.rolls)).toBe(0);
    // 본체는 보유 유닛이 아니다(D-445 178)
    const roster = createWorldRosterSource(world);
    expect(await roster.count(user, clock)).toBe(0);
    expect((await roster.read(user, clock)).units).toEqual([]);
    expect(await world.checkInvariants()).toEqual([]);

    world = await restart(world);
    const again = cyborgsOf(world);
    expect(again.record(user)).toMatchObject({ name: "Placer", unitId, temperament: "tech", level: 1 });
    expect(again.record(user)?.initial).toEqual(record.initial);
    expect(again.record(user)?.kPm).toEqual(record.kPm);
    expect(again.record(user)?.elements).toEqual({ ...zeroElements(), earth: 10 });
    expect(world.maps.get(TEST_MAP_KEY)?.unitInfo(unitId)?.ownerId).toBe(world.ownerOfUser?.(user));
    expect(await world.checkInvariants()).toEqual([]);
  });

  it("부팅: 본체 유닛 행을 잃은 사이보그는 시작 도시에 다시 놓는다(I13)", async () => {
    let world = await boot();
    const user = await fakeUser("Lost_Body");
    const service = cyborgsOf(world);
    await service.roll(user, "balanced");
    await service.create(user, {
      name: "Lost",
      appearance: DEFAULT_CYBORG_APPEARANCE,
      ...startOf(world, user),
      elements: fireWind,
    });
    const before = service.record(user)?.unitId;
    await world.stop();
    worlds.splice(worlds.indexOf(world), 1);
    await test.db.$client.query(`delete from world_units where id = $1`, [before]);
    expect(await rows(test.db, `select id from world_units where kind = $1`, [UNIT_KIND_CYBORG])).toEqual([]);
    world = await boot();
    // 새 유닛 ID는 DB의 가장 큰 ID 다음부터 세므로 지운 ID를 다시 쓸 수 있다(쓰는 프로세스 하나, S3 1절)
    const after = cyborgsOf(world).record(user)?.unitId;
    expect(after === null || after === undefined).toBe(false);
    expect(world.maps.get(TEST_MAP_KEY)?.unitInfo(Number(after))?.ownerId).toBe(world.ownerOfUser?.(user));
    const bodies = await rows<{ id: string }>(test.db, `select id from world_units where kind = $1`, [
      UNIT_KIND_CYBORG,
    ]);
    expect(bodies.map((row) => Number(row.id))).toEqual([after]);
    expect(world.status().issues).toBe(0);
    expect(await world.checkInvariants()).toEqual([]);
  });
  it("속성 분배(D-450, N36): 4원소 가운데 두 칸까지 합 10을 서버가 본다. 4판 기기로 만든 사이보그는 분배를 기다리다 한 번 나눈다", async () => {
    let world = await boot();
    const service = cyborgsOf(world);
    const user = await fakeUser("Element_User");
    const start = startOf(world, user);
    await service.roll(user, "balanced");
    const base = { name: "Ember", appearance: DEFAULT_CYBORG_APPEARANCE, ...start };
    for (const elements of [
      { water: 4, fire: 3, wind: 3 },
      { fire: 9 },
      { light: 10 },
      { fire: 5, frost: 5 },
      [10],
    ])
      expect(await service.create(user, { ...base, elements })).toEqual({
        ok: false,
        code: "elements_invalid",
      });
    expect(await service.allocateElements(user, { fire: 10 })).toEqual({ ok: false, code: "no_cyborg" });
    // 4판 기기(분배 단계가 없음)의 만들기: 분배 없이 만들고 "분배 기다림"
    expect(await service.create(user, base)).toEqual({ ok: true });
    expect(service.status(user)).toMatchObject({ cyborg: { elementsPending: true } });
    expect(service.creation(user, clock)).toMatchObject({ created: true, elementsPending: true });
    expect(service.record(user)?.elements).toBeNull();
    const [pending] = await rows<{ elements: number[] | null }>(
      test.db,
      `select elements from cyborgs where user_id = $1`,
      [user],
    );
    expect(pending?.elements).toBeNull();
    expect(await service.allocateElements(user, { water: 7, earth: 2 })).toEqual({
      ok: false,
      code: "elements_invalid",
    });
    expect(await service.allocateElements(user, { water: 7, earth: 3 })).toEqual({ ok: true });
    expect(await service.allocateElements(user, { fire: 10 })).toEqual({
      ok: false,
      code: "elements_locked",
    });
    expect(service.status(user)).toMatchObject({ cyborg: { elementsPending: false } });

    world = await restart(world);
    expect(cyborgsOf(world).record(user)?.elements).toEqual({ ...zeroElements(), water: 7, earth: 3 });
    const [saved] = await rows<{ elements: number[]; religion: string | null; faith_points: number }>(
      test.db,
      `select elements, religion, faith_points from cyborgs where user_id = $1`,
      [user],
    );
    expect(saved).toEqual({
      elements: [7, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0],
      religion: null,
      faith_points: 0,
    });
    expect(await world.checkInvariants()).toEqual([]);
  });

  it("본체 생활비(D-453): 본체도 유닛 유지비를 내고, 못 내면 효율 불이익(N38)으로 돈다. 보유 유닛 수에는 세지 않는다", async () => {
    let world = await boot();
    const user = await fakeUser("Upkeep_User");
    await cyborgsOf(world).roll(user, "combat");
    await cyborgsOf(world).create(user, {
      name: "Payer",
      appearance: DEFAULT_CYBORG_APPEARANCE,
      ...startOf(world, user),
      elements: fireWind,
    });
    const catalog = testRosterCatalog();
    const living = () => {
      const service = cyborgsOf(world);
      const record = service.record(user);
      if (!record) throw new Error("no cyborg");
      return realCyborgBody(catalog, record, service.livingUnpaid(user)).living;
    };
    const ownerOf = () => {
      const ownerId = world.ownerOfUser?.(user);
      const persistence = world.persistence;
      if (ownerId === undefined || !persistence) throw new Error("no owner");
      return { ownerId, persistence };
    };
    expect(living()).toEqual({ unpaid: false, efficiencyPm: 1000 });
    // 시험 화폐가 없다: 정시 두 번을 못 낸다(본체 하나 × 시험 유지비)
    const hour = 3_600_000;
    const boundary = (Math.floor(clock / hour) + 2) * hour;
    clock = boundary + 5;
    const first = ownerOf();
    expect(first.persistence.settlement.settleOwner(first.ownerId, clock)).toMatchObject({
      upkeepPaid: 0,
      upkeepUnpaid: 2,
    });
    expect(first.persistence.owners.get(first.ownerId)?.upkeepUnpaidAtMs).toBe(boundary);
    expect(living()).toEqual({ unpaid: true, efficiencyPm: 700 });
    // 다시 켜도 남는다
    world = await restart(world);
    expect(living()).toEqual({ unpaid: true, efficiencyPm: 700 });
    // 내면 다시 그대로
    const second = ownerOf();
    second.persistence.settlement.grantCredit(second.ownerId, 10n, clock);
    clock += hour;
    expect(second.persistence.settlement.settleOwner(second.ownerId, clock)).toMatchObject({
      upkeepPaid: 1,
      upkeepUnpaid: 0,
    });
    expect(second.persistence.owners.get(second.ownerId)?.upkeepUnpaidAtMs).toBeNull();
    expect(living()).toEqual({ unpaid: false, efficiencyPm: 1000 });
    // 보유 유닛 수(주거 상한 D-153)에는 그대로 세지 않는다
    expect(await createWorldRosterSource(world).count(user, clock)).toBe(0);
    expect(await world.checkInvariants()).toEqual([]);
  });
});
