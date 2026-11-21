// 부상·병원 DB 통합 시험(D-521, docs/adr/2026-11-08-injury.md) — TEST_DATABASE_URL이 있을 때만. 계정은 가짜 값이다.
// 개발 시험 부상(빨강) → 단계별 자연 치유(빨강 3일 → 노랑 2일 → 흰 1일) → 병원(의료 단계 시설) 견적 → 의사 직무 배치(INT + WIS가 배율에 듦) →
// 치료(값 확인·잔고·배율 저장·다시 치료는 not_faster) → 다시 켜도 배율이 남음, 작업 중 부상(직무가 있는 의사가 정산에서 다침)을 본다.
import { loadContentPack } from "@terra/content/node";
import { CELL_UNITS, DAY_MS, TEST_SOCIETY_COEFFICIENTS, positionAt } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { rosterCatalogOf } from "../roster/catalog.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { ASSET_CREDIT, SYSTEM_ISSUE_CREDIT } from "../world/settlement.ts";
import { silentLog } from "../world/testSupport.ts";
import { configureInjuryRules, injuryAt } from "../world/unitCondition.ts";
import { type World, startWorld } from "../world/world.ts";
import { hospitalServiceOf } from "./attach.ts";
import { giveTestHouse } from "../factionIdentity/testHouses.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source) throw new Error("content pack");
const pack = createContentEditState(loaded.source).effective();
const roster = rosterCatalogOf(loaded.source);
const C = TEST_SOCIETY_COEFFICIENTS.injury;

let test: TestDatabase;
const worlds: World[] = [];
let clock = 0;

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
  clock = 1_800_000_000_000 - (1_800_000_000_000 % DAY_MS) + 3_600_000;
});
afterEach(async () => {
  configureInjuryRules(undefined);
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
    roster: () => roster,
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

/** 사이보그를 만들고 시험 화폐를 준 뒤 구인 카드로 휴먼 둘을 고용한다(신전 시험과 같은 차림) */
async function withHumans(world: World, name: string) {
  const persistence = persistenceOf(world);
  const userId = await fakeUser(name);
  const creation = persistence.cyborgs.creation(userId, clock);
  const faction = creation.factions[0];
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
  const credit = 1_000_000_000n;
  persistence.ledger.post({
    kind: "issue",
    atMs: clock,
    entries: [
      { account: persistence.ledger.systemAccount(SYSTEM_ISSUE_CREDIT, ASSET_CREDIT), amount: -credit },
      { account: persistence.ledger.ownerAccount(ownerId, ASSET_CREDIT), amount: credit },
    ],
  });
  // 유닛을 고용하려면 가문이 있어야 한다(D-565)
  await giveTestHouse(test.db.$client, userId, persistence);
  const board = persistence.recruits.board({ id: userId, owner: false }, undefined, clock);
  if (!board || board.cityId === null) throw new Error("no board");
  const units: number[] = [];
  for (const card of board.cards.slice(0, 2)) {
    const hired = await persistence.recruits.hire(userId, {
      cityId: board.cityId,
      window: board.window,
      slot: card.slot,
      cost: card.cost,
    });
    if (!hired.ok) throw new Error(`hire ${hired.code}`);
    units.push(hired.unitId);
  }
  await persistence.writer.durable();
  return { userId, ownerId, units };
}

/** 유닛 둘레 빈 칸에 병원을 짓고(그 칸 도시 창고로 시험 재료) 바로 끝낸다. 건물 ID */
async function buildHospital(world: World, userId: string, unitId: number): Promise<number> {
  const service = persistenceOf(world).facilities.service;
  for (const map of world.maps.values()) {
    const info = map.unitInfo(unitId);
    if (!info) continue;
    const point = positionAt(info.motion, clock);
    const cx = Math.floor(point.x / CELL_UNITS);
    const cy = Math.floor(point.y / CELL_UNITS);
    for (const [dx, dy] of [
      [3, 3],
      [-6, 3],
      [3, -6],
      [-6, -6],
      [8, 0],
      [0, 8],
      [12, 12],
    ] as const) {
      const at = { mapKey: map.mapKey, x: cx + dx, y: cy + dy };
      // 석재는 1g 기본 단위(팩 core@137): 원목 40개·석재 40kg
      for (const [item, qty] of [
        ["pine_log", 40],
        ["stone", 40_000],
      ] as const)
        expect(await service.devFacilityGrant(userId, item, qty, at)).toEqual({ ok: true });
      const built = await service.build(userId, { ...at, facility: "hospital", rotation: 0 });
      if (!built.ok || built.buildingId === undefined) continue;
      expect(await service.devFinish(userId, { buildingId: built.buildingId })).toMatchObject({ ok: true });
      return built.buildingId;
    }
  }
  throw new Error("no room for hospital");
}

describe.skipIf(!TEST_DATABASE_URL)("부상·병원(D-521)", () => {
  it("빨강 → 자연 치유 한 단계씩, 병원 견적 → 의사 배치 → 치료(값·잔고·배율), 다시 켜도 배율이 남는다", async () => {
    const world = await boot();
    const p = persistenceOf(world);
    const hospital = hospitalServiceOf(world, { skills: () => roster.combat.skills, now: () => clock });
    const service = hospital();
    if (!service) throw new Error("hospital service");
    const { userId, ownerId, units } = await withHumans(world, "MedicOne");
    const [patient, doctor] = units;
    if (patient === undefined || doctor === undefined) throw new Error("two humans");
    const hospitalId = await buildHospital(world, userId, patient);

    let view = await service.overview({ id: userId, devGrant: false }, clock);
    expect(view.status).toBe("ready");
    expect(view.healMs).toEqual([...C.healMs]);
    expect(view.hospitals.map((h) => [h.buildingId, h.works, h.own, h.level, h.speedPm, h.doctor])).toEqual([
      [hospitalId, true, true, 1, C.hospital.baseSpeedPm, null],
    ]);
    expect(view.units).toEqual([]);
    // 다치지 않은 유닛은 치료하지 않는다
    expect(await service.treat(userId, { buildingId: hospitalId, unit: patient, cost: "0" })).toEqual({
      ok: false,
      code: "not_injured",
    });

    // 개발 시험 빨강: 3일 뒤 노랑, 그 2일 뒤 흰, 1일 뒤 초록(6일)
    expect(await service.devInjure(userId, { unit: patient, stage: 3 })).toEqual({
      ok: true,
      unitId: patient,
      stage: 3,
      untilMs: clock + 3 * DAY_MS,
      greenAtMs: clock + 6 * DAY_MS,
    });
    const info = () => [...world.maps.values()].map((map) => map.unitInfo(patient)).find(Boolean);
    const condition = info()?.condition;
    if (!condition) throw new Error("patient");
    expect(injuryAt(condition, clock + 3 * DAY_MS - 1)).toBe(3);
    expect(injuryAt(condition, clock + 3 * DAY_MS)).toBe(2);
    expect(injuryAt(condition, clock + 5 * DAY_MS)).toBe(1);
    expect(injuryAt(condition, clock + 6 * DAY_MS)).toBe(0);

    view = await service.overview({ id: userId, devGrant: false }, clock);
    const injured = view.units.find((unit) => unit.unit === patient);
    expect(injured).toMatchObject({
      stage: 3,
      untilMs: clock + 3 * DAY_MS,
      greenAtMs: clock + 6 * DAY_MS,
      healPm: 1000,
    });
    expect(injured?.cityId).toBe(view.hospitals[0]?.cityId);
    // 레벨 1·의사 없음: 배율 4000‰, 값 = 남은 6일 × 하루 200
    expect(injured?.options).toEqual([
      {
        buildingId: hospitalId,
        speedPm: C.hospital.baseSpeedPm,
        greenAtMs: clock + (6 * DAY_MS * 1000) / C.hospital.baseSpeedPm,
        cost: String(6 * C.hospital.costPerDay),
        affordable: true,
      },
    ]);

    // 의사 직무 배치(채집 시설과 같은 길): INT + WIS가 배율에 든다
    expect(await p.labor.assign(userId, hospitalId, doctor)).toEqual({ ok: true });
    view = await service.overview({ id: userId, devGrant: false }, clock);
    const stat = Math.trunc(p.holdings.primariesOf(doctor).int + p.holdings.primariesOf(doctor).wis);
    const speed = C.hospital.baseSpeedPm + C.hospital.statSpeedPm * stat;
    expect(view.hospitals[0]?.doctor).toEqual({ unitId: doctor, stat, skillGrade: 0 });
    expect(view.hospitals[0]?.speedPm).toBe(speed);
    const option = view.units.find((unit) => unit.unit === patient)?.options[0];
    expect(option?.speedPm).toBe(speed);

    // 값이 다르면 거절, 맞으면 치료(내 병원 = 소각 [임시])
    expect(await service.treat(userId, { buildingId: hospitalId, unit: patient, cost: "1" })).toEqual({
      ok: false,
      code: "cost_changed",
    });
    const before = p.ledger.balanceOf(ownerId, ASSET_CREDIT);
    const treated = await service.treat(userId, {
      buildingId: hospitalId,
      unit: patient,
      cost: option?.cost ?? "",
    });
    expect(treated).toMatchObject({
      ok: true,
      unitId: patient,
      stage: 3,
      greenAtMs: option?.greenAtMs,
      paid: option?.cost,
    });
    expect(p.ledger.balanceOf(ownerId, ASSET_CREDIT)).toBe(before - BigInt(option?.cost ?? "0"));
    expect(info()?.condition.injuryHealPm).toBe(speed);
    // 같은 배율로는 다시 치료하지 않는다
    expect(
      await service.treat(userId, { buildingId: hospitalId, unit: patient, cost: option?.cost ?? "" }),
    ).toEqual({
      ok: false,
      code: "not_faster",
    });
    view = await service.overview({ id: userId, devGrant: false }, clock);
    expect(view.units.find((unit) => unit.unit === patient)).toMatchObject({ healPm: speed, options: [] });

    // 다시 켜도 배율이 남는다(world_units.injury_heal_pm)
    await p.writer.durable();
    const saved = await rows<{ injury: number; injury_heal_pm: number }>(
      test.db,
      `select injury, injury_heal_pm from world_units where id = $1`,
      [patient],
    );
    expect(saved).toEqual([{ injury: 3, injury_heal_pm: speed }]);
    await world.stop();
    worlds.splice(0);
    const again = await boot();
    const restored = [...again.maps.values()].map((map) => map.unitInfo(patient)).find(Boolean);
    expect(restored?.condition.injuryHealPm).toBe(speed);
    expect(injuryAt(restored?.condition ?? condition, option?.greenAtMs ?? 0)).toBe(0);
  });

  it("작업 중 부상: 직무가 있는 유닛은 정산의 작업 주기 경계에서 확률로 다친다(나눠 정산해도 같은 결과)", async () => {
    const world = await boot();
    const p = persistenceOf(world);
    const { userId, ownerId, units } = await withHumans(world, "MedicTwo");
    const [worker] = units;
    if (worker === undefined) throw new Error("human");
    const hospitalId = await buildHospital(world, userId, worker);
    expect(await p.labor.assign(userId, hospitalId, worker)).toEqual({ ok: true });
    // 확률 1000‰로 올리면 첫 작업 주기 경계에서 다친다
    configureInjuryRules(() => ({ ...C, workChancePm: 1000 }));
    clock += 2 * 3_600_000;
    p.settlement.settleOwner(ownerId, clock);
    const condition = [...world.maps.values()].map((map) => map.unitInfo(worker)).find(Boolean)?.condition;
    expect(condition && injuryAt(condition, clock)).toBeGreaterThan(0);
  });
});
