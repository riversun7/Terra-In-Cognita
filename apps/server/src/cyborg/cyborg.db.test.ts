// 사이보그 만들기 DB 통합 시험(docs/adr/2026-11-01-first-login-cyborg.md) — TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
// 서버 규칙: 굴림 합 60·칸 1~20, 굴림 횟수(처음 1 + 다시 굴리기 5, 서버 저장·다시 켜도 남음), 이름 규칙·사칭·고유(대소문자 무시),
// 계정당 하나, 시작 도시 둘레에 세계 유닛으로 놓기(시야로 2차맵이 열림), 한 커밋 저장, 부팅이 잃은 본체를 다시 놓기(I13),
// 속성 분배(D-450, N36: 4원소 두 칸까지 합 10, 분배 없는 옛 사이보그는 한 번 나눔), 본체 생활비(D-453: 유지비를 내고 못 내면 비효율).
import {
  CHARACTER_PRESETS,
  DEFAULT_CHARACTER_LOOK,
  characterLookFromLegacy,
  characterSeedOf,
  isCharacterLook,
} from "@terra/shared/characterLook";
import { DEFAULT_CYBORG_APPEARANCE, zeroElements } from "@terra/shared/cyborg";
import { cityLocation } from "@terra/shared/goodsPlaces";
import { CELL_UNITS, positionAt } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { testRosterCatalog } from "../roster/catalog.ts";
import { realCyborgBody } from "../roster/cyborgBody.ts";
import { createWorldRosterSource } from "../roster/worldUnits.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { silentLog } from "../world/testSupport.ts";
import { ASSET_CREDIT, SYSTEM_ISSUE_CREDIT } from "../world/settlement.ts";
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
  it("굴림: 합 60·칸 1~20, 처음 1번 + 다시 굴리기 5번까지, 다 쓰면 rolls_exhausted, 다시 켜도 횟수가 남는다", async () => {
    let world = await boot();
    const user = await fakeUser("Roll_User");
    const service = cyborgsOf(world);
    expect(service.creation(user, clock).roll).toBeNull();
    expect(service.creation(user, clock).rules).toEqual({
      statSum: 60,
      statMin: 1,
      statMax: 20,
      rollsMax: 6,
      rollsUnlimited: false,
      elementCells: 2,
      elementPoints: 10,
    });
    expect(await service.roll(user, "berserker")).toEqual({ ok: false, code: "unknown_temperament" });
    const lefts: number[] = [];
    for (const temperament of ["combat", "tech", "trade", "combat", "tech", "balanced"]) {
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
    expect(lefts).toEqual([5, 4, 3, 2, 1, 0]);
    expect(await service.roll(user, "combat")).toEqual({ ok: false, code: "rolls_exhausted" });
    const saved = await rows<{ rolls_used: number; temperament: string }>(
      test.db,
      `select rolls_used, temperament from cyborg_rolls where user_id = $1`,
      [user],
    );
    expect(saved).toEqual([{ rolls_used: 6, temperament: "balanced" }]);

    world = await restart(world);
    const again = cyborgsOf(world);
    expect(again.creation(user, clock).roll).toMatchObject({
      temperament: "balanced",
      rollsLeft: 0,
      rollsMax: 6,
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
    // 3D 외형 없이 만든 사이보그(35판 기기): 3D 외형은 옛 외형에서 넘긴 값(사용자 ID 씨앗)으로 저장하고 한 번 고를 수 있다(옛 칸은 저장하지 않는다)
    expect(service.status(a)).toEqual({
      cyborg: {
        name: "Nova",
        look: characterLookFromLegacy(DEFAULT_CYBORG_APPEARANCE, characterSeedOf(a)),
        elementsPending: false,
      },
    });
    expect(service.record(a)?.lookAuto).toBe(true);
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

  it("3D 외형(docs/adr/2026-11-11-character-3d.md 5절): 서버가 목록·범위를 보고 저장한다. 옛 칸은 그 외형에서 넘긴 값, 다시 켜도 남는다", async () => {
    const world = await boot();
    const service = cyborgsOf(world);
    const a = await fakeUser("Look_A");
    const start = startOf(world, a);
    const look = CHARACTER_PRESETS[12]?.look ?? DEFAULT_CHARACTER_LOOK;
    const input = {
      name: "Lumen",
      appearance: DEFAULT_CYBORG_APPEARANCE,
      ...start,
      elements: fireWind,
      look,
    };
    await service.roll(a, "tech");
    // 목록 밖 ID·범위 밖 수·빠진 칸·더 있는 칸·옛 판은 만들지 않는다
    for (const bad of [
      { ...look, head: "tophat" },
      { ...look, height: 150 },
      { ...look, plating: 9 },
      { ...look, primary: "#ff0000" },
      { ...look, v: 1 },
      { ...look, hat: "cap" },
      { v: 2 },
      "knight",
      null,
    ]) {
      expect(await service.create(a, { ...input, look: bad })).toEqual({
        ok: false,
        code: "appearance_invalid",
      });
    }
    expect(service.record(a)).toBeUndefined();
    // 3D 외형이 없으면 옛 칸 모양을 본다(35판 기기) — 틀리면 만들지 않는다
    const { look: _look, ...withoutLook } = input;
    expect(await service.create(a, { ...withoutLook, appearance: { head: "dome" } })).toEqual({
      ok: false,
      code: "appearance_invalid",
    });
    // 36판 기기는 옛 칸을 보내지 않는다(D-560 1421)
    const { appearance: _old, ...lookOnly } = input;
    expect(await service.create(a, lookOnly)).toEqual({ ok: true });
    expect(service.record(a)?.look).toEqual(look);
    expect(service.record(a)?.lookAuto).toBe(false);
    expect(service.status(a)).toEqual({ cyborg: { name: "Lumen", look, elementsPending: false } });
    // 옛 2D 칸은 저장하지 않는다(null)
    const stored = await rows<{ look: unknown; appearance: unknown; look_auto: boolean }>(
      test.db,
      `select look, appearance, look_auto from cyborgs where user_id = $1`,
      [a],
    );
    expect(stored[0]?.look).toEqual(look);
    expect(isCharacterLook(stored[0]?.look)).toBe(true);
    expect(stored[0]?.appearance).toBeNull();
    expect(stored[0]?.look_auto).toBe(false);
    // 다시 켜도 같다. DB 값이 목록에서 빠진 ID면 옛 외형(없으면 기본 2D 외형)에서 넘긴 값으로 채우고 한 번 고를 수 있게 한다
    const again = await restart(world);
    expect(cyborgsOf(again).record(a)?.look).toEqual(look);
    await test.db.$client.query(
      `update cyborgs set look = jsonb_set(look, '{head}', '"tophat"') where user_id = $1`,
      [a],
    );
    const fixed = await restart(again);
    expect(cyborgsOf(fixed).record(a)?.look).toEqual(
      characterLookFromLegacy(DEFAULT_CYBORG_APPEARANCE, characterSeedOf(a)),
    );
    expect(cyborgsOf(fixed).record(a)?.lookAuto).toBe(true);
  });

  it("옛 2D 외형 정리(D-560 1421): 켤 때 3D 외형 없는 옛 사이보그를 3D 외형으로 옮기고 옛 칸을 비운다(멱등, 세계 새로 시작 없음)", async () => {
    const world = await boot();
    const service = cyborgsOf(world);
    const a = await fakeUser("Legacy_A");
    const b = await fakeUser("Legacy_B");
    await service.roll(a, "tech");
    await service.roll(b, "tech");
    const base = { ...startOf(world, a), elements: fireWind };
    expect(await service.create(a, { ...base, name: "OldOne", look: DEFAULT_CHARACTER_LOOK })).toEqual({
      ok: true,
    });
    expect(await service.create(b, { ...base, name: "Chosen", look: DEFAULT_CHARACTER_LOOK })).toEqual({
      ok: true,
    });
    // 직전 앱이 만든 줄 흉내: a = 3D 외형 없이 옛 칸만, b = 3D 외형 + 옛 칸
    const legacy = { ...DEFAULT_CYBORG_APPEARANCE, head: "crest", face: "mono", primary: "coral" } as const;
    await test.db.$client.query(`update cyborgs set look = null, appearance = $2 where user_id = $1`, [
      a,
      JSON.stringify(legacy),
    ]);
    await test.db.$client.query(`update cyborgs set appearance = $2 where user_id = $1`, [
      b,
      JSON.stringify(DEFAULT_CYBORG_APPEARANCE),
    ]);
    const moved = await restart(world);
    const expected = characterLookFromLegacy(legacy, characterSeedOf(a));
    expect(cyborgsOf(moved).record(a)?.look).toEqual(expected);
    expect(cyborgsOf(moved).record(a)?.lookAuto).toBe(true);
    expect(cyborgsOf(moved).record(b)?.look).toEqual(DEFAULT_CHARACTER_LOOK);
    expect(cyborgsOf(moved).record(b)?.lookAuto).toBe(false);
    // 켤 때 다시 쓴 줄이 저장될 때까지(쓰기 대기열)
    const saved = async () =>
      rows<{ user_id: string; look: unknown; appearance: unknown; look_auto: boolean }>(
        test.db,
        `select user_id, look, appearance, look_auto from cyborgs where user_id in ($1, $2) order by user_id`,
        [a, b],
      );
    const deadline = Date.now() + 10_000;
    let stored = await saved();
    while (stored.some((row) => row.appearance !== null) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      stored = await saved();
    }
    expect(stored.map((row) => row.appearance)).toEqual([null, null]);
    expect(stored.find((row) => row.user_id === a)?.look).toEqual(expected);
    expect(stored.find((row) => row.user_id === a)?.look_auto).toBe(true);
    // 다시 켜도 같은 답(할 일 없음). 옮겨 채운 사이보그는 한 번 고를 수 있다
    const again = await restart(moved);
    expect(cyborgsOf(again).record(a)?.look).toEqual(expected);
    const pick = CHARACTER_PRESETS[3]?.look ?? DEFAULT_CHARACTER_LOOK;
    expect(await cyborgsOf(again).chooseLook(a, pick)).toEqual({ ok: true });
    expect(await cyborgsOf(again).chooseLook(a, DEFAULT_CHARACTER_LOOK)).toEqual({
      ok: false,
      code: "look_locked",
    });
  });

  it("3D 외형 한 번 고르기(질문 961 나): 3D 외형 없이 만든 사이보그만 한 번 고른다. 저장하면 옛 칸도 맞추고, 그 뒤로는 look_locked", async () => {
    const world = await boot();
    const service = cyborgsOf(world);
    const a = await fakeUser("Relook_A");
    const b = await fakeUser("Relook_B");
    const none = await fakeUser("Relook_C");
    const look = CHARACTER_PRESETS[5]?.look ?? DEFAULT_CHARACTER_LOOK;
    // 사이보그가 없으면 no_cyborg
    expect(await service.chooseLook(none, look)).toEqual({ ok: false, code: "no_cyborg" });
    // a = 옛 기기(3D 외형 없음), b = 만들 때 3D 외형을 고름
    await service.roll(a, "tech");
    await service.roll(b, "tech");
    const base = { appearance: DEFAULT_CYBORG_APPEARANCE, ...startOf(world, a), elements: fireWind };
    expect(await service.create(a, { ...base, name: "Relook" })).toEqual({ ok: true });
    expect(await service.create(b, { ...base, name: "Chosen", look: DEFAULT_CHARACTER_LOOK })).toEqual({
      ok: true,
    });
    // 만들 때 고른 사이보그는 고를 수 없다
    expect(await service.chooseLook(b, look)).toEqual({ ok: false, code: "look_locked" });
    expect(service.record(b)?.look).toEqual(DEFAULT_CHARACTER_LOOK);
    // 틀린 외형은 저장하지 않고 기회도 쓰지 않는다
    for (const bad of [{ ...look, head: "tophat" }, { ...look, height: 150 }, { v: 2 }, null]) {
      expect(await service.chooseLook(a, bad)).toEqual({ ok: false, code: "appearance_invalid" });
    }
    // 옛 기기(옛 칸만)로 만든 사이보그는 서버가 옛 칸에서 넘긴 3D 외형을 갖고 한 번 고를 수 있다
    expect(service.record(a)?.look).toEqual(
      characterLookFromLegacy(DEFAULT_CYBORG_APPEARANCE, characterSeedOf(a)),
    );
    expect(service.record(a)?.lookAuto).toBe(true);
    // 한 번 고른다: 저장한다(옛 칸은 쓰지 않는다 — D-560 1421)
    expect(await service.chooseLook(a, look)).toEqual({ ok: true });
    expect(service.record(a)?.look).toEqual(look);
    expect(service.record(a)?.lookAuto).toBe(false);
    expect(service.status(a)).toMatchObject({ cyborg: { look } });
    const stored = await rows<{ look: unknown; appearance: unknown; look_auto: boolean }>(
      test.db,
      `select look, appearance, look_auto from cyborgs where user_id = $1`,
      [a],
    );
    expect(stored[0]?.look).toEqual(look);
    expect(stored[0]?.appearance).toBeNull();
    expect(stored[0]?.look_auto).toBe(false);
    // 두 번째는 막는다(다른 외형이어도) — 다시 켜도 같다
    expect(await service.chooseLook(a, DEFAULT_CHARACTER_LOOK)).toEqual({ ok: false, code: "look_locked" });
    const again = await restart(world);
    expect(cyborgsOf(again).record(a)?.look).toEqual(look);
    expect(await cyborgsOf(again).chooseLook(a, DEFAULT_CHARACTER_LOOK)).toEqual({
      ok: false,
      code: "look_locked",
    });
    // 다른 길(속성 분배·신앙)이 사이보그 행을 다시 써도 고른 외형이 남는다
    cyborgsOf(again).addFaith(a, 3);
    const later = await restart(again);
    expect(cyborgsOf(later).record(a)?.look).toEqual(look);
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
    // 정착 지원금(108 = 정시 108번의 본체 유지비)으로 처음 4.5일을 낸다(D-455 190). 정시 110번이면 마지막 두 번을 못 낸다
    const hour = 3_600_000;
    const boundary = (Math.floor(clock / hour) + 110) * hour;
    clock = boundary + 5;
    const first = ownerOf();
    expect(first.persistence.settlement.settleOwner(first.ownerId, clock)).toMatchObject({
      upkeepPaid: 108,
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
  it("정착 지원금(D-455 190, N39): 강하 때 한 번, 그 세력 국고에서 옮긴다(새 화폐를 만들지 않음). 덜 붐빈 세력일수록 많다", async () => {
    let world = await boot();
    const service = cyborgsOf(world);
    const persistence = world.persistence;
    if (!persistence) throw new Error("no persistence");
    const npc = persistence.npcOwnerId;
    const issued = () =>
      persistence.ledger.balance(persistence.ledger.systemAccount(SYSTEM_ISSUE_CREDIT, ASSET_CREDIT));
    const issuedBefore = issued();
    const treasuryBefore = persistence.ledger.balanceOf(npc, ASSET_CREDIT);
    const first = await fakeUser("Grant_One");
    // 세력이 하나라 늘 "가장 덜 붐빔" → 배율 최대(1500‰): 72 × 1.5 = 108(화면에 보이는 양과 같다)
    expect(service.creation(first, clock).factions[0]?.grant).toBe("108");
    await service.roll(first, "combat");
    expect(
      await service.create(first, {
        name: "Granted",
        appearance: DEFAULT_CYBORG_APPEARANCE,
        ...startOf(world, first),
        elements: fireWind,
      }),
    ).toEqual({ ok: true });
    const owner = world.ownerOfUser?.(first);
    if (owner === undefined) throw new Error("no owner");
    expect(persistence.ledger.balanceOf(owner, ASSET_CREDIT)).toBe(108n);
    expect(persistence.ledger.balanceOf(npc, ASSET_CREDIT)).toBe(treasuryBefore - 108n);
    // 발행 계정은 그대로(국고에서 옮겼다)
    expect(issued()).toBe(issuedBefore);
    expect(service.record(first)?.startGrant).toBe(108n);
    // 시작 재료(WP3 플레이어 생산, 설정 칸 [임시] 원목 20·석재 10,000g): 그 시작 도시의 내 도시 창고(위치 = 도시 ID)로, 생산원에서
    const startCity = service.record(first)?.startCityId ?? 0;
    expect(persistence.ledger.balanceOf(owner, "item:pine_log", cityLocation(startCity))).toBe(20n);
    expect(persistence.ledger.balanceOf(owner, "item:stone", cityLocation(startCity))).toBe(10_000n);
    const goods = await rows<{ idempotency_key: string }>(
      test.db,
      `select idempotency_key from ledger_transactions where kind = 'start_goods'`,
    );
    expect(goods).toEqual([{ idempotency_key: `start_goods:${first}` }]);
    const [tx] = await rows<{ kind: string; idempotency_key: string; grant: string }>(
      test.db,
      `select t.kind, t.idempotency_key, c.start_grant as grant
         from ledger_transactions t, cyborgs c where t.kind = 'settlement_grant' and c.user_id = $1`,
      [first],
    );
    expect(tx).toEqual({
      kind: "settlement_grant",
      idempotency_key: `settlement_grant:${first}`,
      grant: "108",
    });
    expect(await world.checkInvariants()).toEqual([]);

    world = await restart(world);
    expect(cyborgsOf(world).record(first)?.startGrant).toBe(108n);
    expect(await world.checkInvariants()).toEqual([]);
  });
  it("지원금 전에 만든 사이보그(D-456): 한 번 속성 분배 때 지금 세력 국고에서 한 번 받는다. 다시 나누기·다시 켜기로는 다시 받지 않는다", async () => {
    let world = await boot();
    const user = await fakeUser("Old_Timer");
    const start = startOf(world, user);
    await world.stop();
    worlds.splice(worlds.indexOf(world), 1);
    // 옛 앱이 만든 모양(속성·지원금 없음). 본체 유닛 행은 부팅이 시작 도시에 다시 놓는다(I13)
    await test.db.$client.query(
      `insert into cyborgs (user_id, name, name_key, temperament, initial, k_pm, appearance, faction_id, start_city_id,
                            created_at_ms)
       values ($1, 'Oldie', 'oldie', 'balanced', '{10,10,10,10,10,10}', '{1000,1000,1000,1000,1000,1000}', $2::jsonb,
               $3, $4, $5)`,
      [user, JSON.stringify(DEFAULT_CYBORG_APPEARANCE), start.factionId, start.cityId, clock],
    );
    world = await boot();
    const service = cyborgsOf(world);
    expect(service.record(user)).toMatchObject({ elements: null, startGrant: null });
    const persistence = world.persistence;
    if (!persistence) throw new Error("no persistence");
    const issued = () =>
      persistence.ledger.balance(persistence.ledger.systemAccount(SYSTEM_ISSUE_CREDIT, ASSET_CREDIT));
    const issuedBefore = issued();
    const treasuryBefore = persistence.ledger.balanceOf(persistence.npcOwnerId, ASSET_CREDIT);
    expect(await service.allocateElements(user, { earth: 10 })).toEqual({ ok: true });
    // 자기를 뺀 시작 수 0 = 가장 덜 붐빈 세력 → 72 × 1500‰ = 108
    const owner = world.ownerOfUser?.(user);
    if (owner === undefined) throw new Error("no owner");
    expect(persistence.ledger.balanceOf(owner, ASSET_CREDIT)).toBe(108n);
    expect(persistence.ledger.balanceOf(persistence.npcOwnerId, ASSET_CREDIT)).toBe(treasuryBefore - 108n);
    expect(issued()).toBe(issuedBefore);
    expect(service.record(user)?.startGrant).toBe(108n);
    // 다시 나누기는 막히고 지원금도 다시 없다
    expect(await service.allocateElements(user, { fire: 10 })).toEqual({
      ok: false,
      code: "elements_locked",
    });
    expect(persistence.ledger.balanceOf(owner, ASSET_CREDIT)).toBe(108n);

    world = await restart(world);
    expect(cyborgsOf(world).record(user)).toMatchObject({ startGrant: 108n });
    expect(world.persistence?.ledger.balanceOf(owner, ASSET_CREDIT)).toBe(108n);
    const grants = await rows<{ n: string }>(
      test.db,
      `select count(*) as n from ledger_transactions where idempotency_key = $1`,
      [`settlement_grant:${user}`],
    );
    expect(grants).toEqual([{ n: "1" }]);
    expect(await world.checkInvariants()).toEqual([]);
  });
});
