// 입은 장비·버프 → 스탯·전투 DB 통합 시험(docs/adr/2026-11-03-item-holdings.md "바뀜 (2026-11-07, 입은 장비·버프 → 스탯·전투)") —
// TEST_DATABASE_URL이 있을 때만. 계정·수치는 가짜 값이다.
// 만든 사이보그가 검을 쥐면 cyborg.get(유닛 화면 서비스)의 공격력이 오르고, 세계 전투(NPC 런타임 startBattle과 같은 길: 몸 → 생명 수치 →
// 전투 서비스)의 저장된 시작 사양도 오르고 같은 시드에서 더 많이 친다. 부서진 검(내구도 0)은 아무것도 주지 않는다. 조끼는 생명 수치의
// 최대 아머를, 1차 스탯 버프 빵은 STR을 올리고, 공격 버프 약은 전투 시작 때 걸린 효과로 들어간다.
import { loadContentPack } from "@terra/content/node";
import { DEFAULT_CYBORG_APPEARANCE } from "@terra/shared/cyborg";
import { type BattleInit, type CombatUnitSpec, realAttackOf, runBattle } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { carriedBy } from "../holdings/state.ts";
import { TEST_HOLDING_CONTENT, TEST_PACK_SKILLS } from "../holdings/testContent.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { vitalsConfigOf } from "../vitals/config.ts";
import { silentLog, testEncounter } from "../world/testSupport.ts";
import { type World, startWorld } from "../world/world.ts";
import { rosterCatalogOf } from "./catalog.ts";
import { createRosterServices } from "./services.ts";
import { effectiveView, primariesOfStats } from "./unitBody.ts";

const T0 = 1_800_000_000_000;
let test: TestDatabase;
let clock = T0;
const worlds: World[] = [];

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source) throw new Error("content pack");
// 유닛 화면 전투 자료 = 팩 + 시험 아이템·효과(보유 물건 시험 자료와 같은 실효 항목)
const roster = rosterCatalogOf(loaded.source, undefined, undefined, () => ({
  items: TEST_HOLDING_CONTENT.items,
  skills: TEST_PACK_SKILLS,
  unitKinds: TEST_HOLDING_CONTENT.unitKinds,
  effects: TEST_HOLDING_CONTENT.effects,
}));

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
  clock = T0;
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
    holdings: {
      content: () => TEST_HOLDING_CONTENT,
      // 쓰는 유닛의 1차 스탯(소모품 효과량): 사이보그 화면과 같은 셈(app.ts holdingsConfigOf와 같다)
      cyborgPrimaries: (record, gear) =>
        primariesOfStats(effectiveView(roster, { kind: "cyborg", record }, gear).stats),
    },
    vitals: vitalsConfigOf(roster),
    roster: () => roster,
  });
  worlds.push(world);
  await world.ready;
  return world;
}

function persistence(world: World) {
  const found = world.persistence;
  if (!found) throw new Error("no persistence");
  return found;
}

async function fakeUser(name: string): Promise<string> {
  const found = await rows<{ id: string }>(
    test.db,
    `insert into users (name, email, username) values ($1, $2, $3) returning id`,
    [`Fake_${name}`, `fake-${name}@id.placeholder.invalid`, `fake_${name}`],
  );
  return String(found[0]?.id);
}

/** 사이보그를 만든다(굴림 → 만들기). 유닛 ID·소유 주체 */
async function makeCyborg(world: World, user: string): Promise<{ unit: number; owner: number }> {
  const p = persistence(world);
  const faction = p.cyborgs.creation(user, clock).factions[0];
  const city = faction?.cities[0];
  if (!faction || !city) throw new Error("no start city");
  await p.cyborgs.roll(user, "combat");
  const made = await p.cyborgs.create(user, {
    name: "Blade",
    appearance: DEFAULT_CYBORG_APPEARANCE,
    factionId: faction.id,
    cityId: city.id,
    elements: { fire: 6, wind: 4 },
  });
  if (!made.ok) throw new Error(`create failed: ${made.code}`);
  const unit = p.cyborgs.record(user)?.unitId;
  if (unit === null || unit === undefined) throw new Error("no cyborg unit");
  return { unit, owner: p.settlement.ownerOfUser(user, clock).id };
}

/** 시험 전투: 사이보그(편 1) 한 명 대 세계에 없는 단단한 허수아비 하나(편 2, HP 100,000·공격 못 함). 제한 시간까지 친다 */
function duelInit(cyborgUnit: number, owner: number): BattleInit {
  const base = testEncounter([cyborgUnit, 9_000_001, 9_000_002, 9_000_003], [owner, 999_999]);
  const dummy = base.units.find((spec) => spec.id === 9_000_002);
  if (!dummy) throw new Error("dummy");
  return {
    ...base,
    parties: base.parties,
    units: [
      ...base.units.filter((spec) => spec.id === cyborgUnit),
      { ...dummy, maxHp: 100_000, staminaCost: 1_000_000, staminaMax: 0 },
    ],
  };
}

/** 허수아비가 받은 피해(같은 시드, 판정 runBattle 그대로) */
function damageDealt(init: BattleInit): number {
  const { state } = runBattle(init, []);
  const dummy = state.units.find((unit) => unit.id === 9_000_002);
  return 100_000 - (dummy?.hp ?? 0);
}

const specOf = (init: BattleInit, id: number): CombatUnitSpec | undefined =>
  init.units.find((spec) => spec.id === id);

describe.skipIf(!TEST_DATABASE_URL)("입은 장비·버프 → 스탯·전투", () => {
  it("검이 cyborg.get 공격력과 세계 전투 사양·피해를 올리고, 부서진 검은 아무것도 주지 않는다", async () => {
    const world = await boot();
    const p = persistence(world);
    const user = await fakeUser("blade");
    const { unit, owner } = await makeCyborg(world, user);
    const services = createRosterServices({
      catalog: roster,
      cyborgs: () => p.cyborgs,
      gear: () => p.holdings.gearOf,
    });
    const viewer = { id: user, loginId: "Fake_blade", roles: ["player" as const] };
    const sheet = async () => (await services.cyborg(viewer, { preview: false, now: clock })).body;

    const bare = await sheet();
    expect(bare?.combat?.weapon).toBeNull();
    expect(bare?.combat?.attack.weaponAttack).toBe(0);
    // 맨손 = 스탯 공격력 그대로(D-502)
    expect(bare?.combat?.attack.real).toBe(bare?.combat?.attack.statAttack);
    const bareBattle = p.bodies.battleStart(duelInit(unit, owner), clock);
    expect(specOf(bareBattle, unit)?.attack.weaponAttack).toBe(0);

    // 검을 얻어 쥔다(굴림·내구도 = 정의의 최대 10)
    const made = p.holdings.service.acquire({
      ownerId: owner,
      item: "hold_sword",
      quantity: 1,
      location: carriedBy(unit),
      source: "dev_grant",
      atMs: clock,
      seed: 7,
    });
    const swordId = made.ok ? (made.holdings[0] ?? 0) : 0;
    expect(p.holdings.service.equip(owner, swordId, 0)).toEqual({ ok: true });
    const armed = await sheet();
    const attack = armed?.combat?.attack;
    expect(armed?.combat?.weapon).toBe("hold_sword");
    expect(attack?.weaponAttack).toBe(20);
    expect(attack?.part.appropriateMilli).toBe(25_000);
    // 실제 공격력 = 스탯 공격력 + ⌊20 × 비율‰ ÷ 1000⌋(D-502), 비율 = min(1000, STR × 1000 ÷ 25)
    expect(attack?.real).toBe(
      (attack?.statAttack ?? 0) + Math.floor((20 * (attack?.part.ratioPm ?? 0)) / 1000),
    );
    expect(attack?.real ?? 0).toBeGreaterThan(bare?.combat?.attack.real ?? 0);
    expect(armed?.slots[0]?.item?.id).toBe("hold_sword");

    // 세계 전투(NPC 런타임 startBattle과 같은 길): 저장된 시작 사양이 검을 들고, 같은 시드에서 더 많이 친다
    const armedBattle = p.vitals.service.battleStart(
      p.bodies.battleStart(duelInit(unit, owner), clock),
      clock,
    );
    const battleId = await p.battles.start(armedBattle, { war: false });
    const stored = await rows<{ units: { id: number; attack: { weaponAttack: number } }[] }>(
      test.db,
      `select init->'units' as units from world_battles where id = $1`,
      [battleId],
    );
    expect(stored[0]?.units.find((spec) => spec.id === unit)?.attack.weaponAttack).toBe(20);
    expect(specOf(armedBattle, 9_000_002)).toEqual(specOf(duelInit(unit, owner), 9_000_002));
    // 한 대의 실제 공격력은 검이 크다. 다만 맨손은 늘 맞고(명중 100%) 크리 = AGI + DEX ‰라(사용자 결정 2026-11-12) Lv 1 검(명중 749‰)보다
    // 같은 시간에 준 피해 합이 클 수 있다 → 합은 "다르다"만 본다
    const startAttack = (init: BattleInit) => specOf(init, unit)?.attack;
    const armedStart = startAttack(armedBattle);
    const bareStart = startAttack(bareBattle);
    if (!armedStart || !bareStart) throw new Error("spec");
    expect(realAttackOf(armedStart, 1000, roster.coefficients)).toBeGreaterThan(
      realAttackOf(bareStart, 1000, roster.coefficients),
    );
    expect(damageDealt(armedBattle)).not.toBe(damageDealt(bareBattle));

    // 부서진 검(내구도 0): 화면·전투 모두 맨손과 같다
    const sword = p.holdings.service.equippedOn(unit).find((record) => record.id === swordId);
    if (!sword) throw new Error("sword");
    sword.durability = 0;
    const broken = await sheet();
    expect(broken?.combat).toEqual(bare?.combat);
    expect(broken?.stats).toEqual(bare?.stats);
    expect(p.bodies.battleStart(duelInit(unit, owner), clock)).toEqual(bareBattle);
  });

  it("조끼가 생명 수치의 최대 아머를 올리고, STR 빵은 1차 스탯에, 공격 버프 약은 전투 시작 때 걸린 효과로 든다", async () => {
    const world = await boot();
    const p = persistence(world);
    const user = await fakeUser("buffed");
    const { unit, owner } = await makeCyborg(world, user);
    const before = p.vitals.service.read(unit, clock);
    const vest = p.holdings.service.acquire({
      ownerId: owner,
      item: "hold_vest",
      quantity: 1,
      location: carriedBy(unit),
      source: "dev_grant",
      atMs: clock,
      seed: 3,
    });
    const vestId = vest.ok ? (vest.holdings[0] ?? 0) : 0;
    expect(p.holdings.service.equip(owner, vestId, 3)).toEqual({ ok: true });
    const armorRoll = p.holdings.service
      .equippedOn(unit)[0]
      ?.stats.find((entry) => entry.stat === "armor_hp");
    expect(p.vitals.service.read(unit, clock)?.max.armor).toBe(
      (before?.max.armor ?? 0) + (armorRoll?.value ?? 0),
    );

    // STR 빵(1차 스탯 버프, 고정값) → 사이보그 화면 STR과 전투 사양 1차에 든다
    const services = createRosterServices({
      catalog: roster,
      cyborgs: () => p.cyborgs,
      gear: () => p.holdings.gearOf,
    });
    const viewer = { id: user, loginId: "Fake_buffed", roles: ["player" as const] };
    const plain = (await services.cyborg(viewer, { preview: false, now: clock })).body;
    const give = (item: string) => {
      const result = p.holdings.service.acquire({
        ownerId: owner,
        item,
        quantity: 1,
        location: carriedBy(unit),
        source: "dev_grant",
        atMs: clock,
        seed: 5,
      });
      return result.ok ? (result.holdings[0] ?? 0) : 0;
    };
    expect(
      p.holdings.service.use(owner, give("hold_bread"), { confirm: false, nowMs: clock, seed: 9 }).ok,
    ).toBe(true);
    const strBuff = p.holdings.service
      .effectsOn(unit, clock)
      .find((entry) => entry.effect === "hold_food_str");
    expect(strBuff?.value ?? 0).toBeGreaterThan(0);
    const fed = (await services.cyborg(viewer, { preview: false, now: clock })).body;
    expect(fed?.stats.primaries.str.bonus).toBe(
      (plain?.stats.primaries.str.bonus ?? 0) + (strBuff?.value ?? 0),
    );
    expect(fed?.primarySources.str).toContainEqual({
      kind: "effect",
      id: "hold_food_str",
      value: strBuff?.value,
    });

    // 공격 버프 약(24시간, 전투 수치 attack): 1시간 뒤 전투 시작 → 남은 23시간이 걸린 효과로
    clock += 60_000;
    expect(
      p.holdings.service.use(owner, give("hold_long_tonic"), { confirm: true, nowMs: clock, seed: 11 }).ok,
    ).toBe(true);
    const vigor = p.holdings.service.effectsOn(unit, clock).find((entry) => entry.effect === "hold_vigor");
    clock += 3_600_000;
    const started = p.bodies.battleStart(duelInit(unit, owner), clock);
    const spec = specOf(started, unit);
    expect(spec?.startEffects).toEqual([
      {
        id: "hold_vigor",
        kind: "buff",
        stat: "attack",
        valueMode: "flat",
        value: vigor?.value,
        untilMs: (vigor?.untilMs ?? 0) - clock,
      },
    ]);
    // 1차 스탯 버프(빵, 1시간)는 끝났다 → 전투 사양 STR = 화면의 버프 전 STR
    expect(spec?.primaries[0]).toBe(
      (plain?.stats.primaries.str.base ?? 0) + (plain?.stats.primaries.str.bonus ?? 0),
    );
  });
});
