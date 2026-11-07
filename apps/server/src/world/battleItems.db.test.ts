// 세계 전투의 물건(287) DB 통합 시험 — TEST_DATABASE_URL이 있을 때만. 계정·수치는 가짜 값이다.
// NPC 런타임 startBattle과 같은 길(몸 → 생명 수치 → 물약·탄 → 전투 서비스)로 연 전투에서, HP가 낮은 채 들어간 사이보그가 든 물약을
// 저절로 마시고(D-510) 활은 화살통 내구도만큼만 쏜다(D-497). 끝 시각이 지난 뒤 다시 켜면 결과와 같은 커밋으로 물약 수량·물약 쿨·탄약
// 내구도가 바뀌고, 한 번만 적용된다. 병원 치료(D-514 개발 고리)는 부상을 지우고 HP를 가득 채운다.
import { loadContentPack } from "@terra/content/node";
import { DEFAULT_CYBORG_APPEARANCE } from "@terra/shared/cyborg";
import type { BattleInit } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { carriedBy } from "../holdings/state.ts";
import { TEST_HOLDING_CONTENT, TEST_PACK_SKILLS } from "../holdings/testContent.ts";
import { rosterCatalogOf } from "../roster/catalog.ts";
import { effectiveView, primariesOfStats } from "../roster/unitBody.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase } from "../testDb.ts";
import { vitalsConfigOf } from "../vitals/config.ts";
import { silentLog, testEncounter } from "./testSupport.ts";
import { type World, startWorld } from "./world.ts";

const T0 = 1_800_000_000_000;
let test: TestDatabase;
let clock = T0;
const worlds: World[] = [];

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source) throw new Error("content pack");
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

async function waitFor(check: () => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("timed out");
}

async function makeCyborg(world: World): Promise<{ unit: number; owner: number }> {
  const p = persistence(world);
  const found = await test.db.$client.query(
    `insert into users (name, email, username) values ('Fake_archer', 'fake-archer@id.placeholder.invalid', 'fake_archer') returning id`,
  );
  const user = String(found.rows[0]?.id);
  const faction = p.cyborgs.creation(user, clock).factions[0];
  const city = faction?.cities[0];
  if (!faction || !city) throw new Error("no start city");
  await p.cyborgs.roll(user, "combat");
  const made = await p.cyborgs.create(user, {
    name: "Archer",
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

/** 사이보그(편 1) 대 세계에 없는 허수아비(편 2, 공격 못 함) — 제한 시간까지 간다 */
function duelInit(unit: number, owner: number): BattleInit {
  const base = testEncounter([unit, 9_000_001, 9_000_002, 9_000_003], [owner, 999_999]);
  const dummy = base.units.find((spec) => spec.id === 9_000_002);
  if (!dummy) throw new Error("dummy");
  return {
    ...base,
    units: [
      ...base.units.filter((spec) => spec.id === unit),
      { ...dummy, maxHp: 100_000, staminaCost: 1_000_000, staminaMax: 0 },
    ],
  };
}

describe.skipIf(!TEST_DATABASE_URL)("세계 전투의 물건(287)", () => {
  it("물약을 저절로 마시고 탄은 화살통만큼 쏜다 — 끝나면 같은 커밋으로 수량·쿨·내구도가 바뀐다(한 번만)", async () => {
    const first = await boot();
    const p = persistence(first);
    const { unit, owner } = await makeCyborg(first);
    const give = (item: string, quantity = 1): number => {
      const result = p.holdings.service.acquire({
        ownerId: owner,
        item,
        quantity,
        location: carriedBy(unit),
        source: "dev_grant",
        atMs: clock,
        seed: 3,
      });
      return result.ok ? (result.holdings[0] ?? 0) : 0;
    };
    const potion = give("hold_potion", 3);
    const bow = give("hold_bow");
    const quiver = give("hold_quiver");
    expect(p.holdings.service.equip(owner, bow, 0)).toEqual({ ok: true });
    expect(p.holdings.service.equip(owner, quiver, 1)).toEqual({ ok: true });
    // 앞 전투에서 HP 5만 남았다
    p.vitals.service.applyBattle(
      duelInit(unit, owner),
      [{ unit, side: 1, outcome: "stays", injured: false, hp: 5, armor: 0, shield: 0 }],
      clock,
    );
    const init = p.items.battleStart(
      p.vitals.service.battleStart(p.bodies.battleStart(duelInit(unit, owner), clock), clock),
      clock,
    );
    const spec = init.units.find((entry) => entry.id === unit);
    expect(spec?.ammo).toBe(3);
    expect(spec?.potions?.items).toEqual([{ id: potion, count: 3, instant: 100 }]);
    expect(spec?.start?.hp).toBe(5);
    const battleId = await p.battles.start(init, { war: false });
    const endsAtMs = (await p.battles.get(battleId))?.endsAtMs ?? 0;
    await p.writer.durable();
    await first.stop();

    clock = endsAtMs + 1_000;
    const second = await boot();
    const q = persistence(second);
    await waitFor(async () => (await q.battles.get(battleId))?.status === "ended");
    await q.writer.durable();
    const outcome = (await q.battles.get(battleId))?.outcome?.units.find((entry) => entry.unit === unit);
    expect(outcome?.shots).toBe(3);
    expect(outcome?.potions).toEqual([{ id: potion, used: 1 }]);
    const listed = q.holdings.service.list(owner, clock).holdings;
    expect(listed.find((h) => h.id === potion)?.quantity).toBe(2);
    // 화살통은 0이 되어 벗겨졌다(같은 종류 예비가 없다)
    const left = listed.find((h) => h.id === quiver);
    expect([left?.durability, left?.slot]).toEqual([0, null]);
    // 물약 쿨 = 전투 시작 실제 시각 + 판정의 쿨 끝(첫 틱에 마셨다)
    expect(q.holdings.service.cooldownUntil(unit, "potion")).toBe(T0 + 30_000);
    await second.stop();

    // 다시 켜도 다시 빼지 않는다
    const third = await boot();
    const r = persistence(third);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(r.holdings.service.list(owner, clock).holdings.find((h) => h.id === potion)?.quantity).toBe(2);
  });

  it("병원 치료(개발 고리): 부상을 지우고 HP를 가득 채운다", async () => {
    const world = await boot();
    const p = persistence(world);
    const { unit, owner } = await makeCyborg(world);
    p.vitals.service.applyBattle(
      duelInit(unit, owner),
      [{ unit, side: 1, outcome: "returned", injured: true, hp: 0, armor: 0, shield: 0 }],
      clock,
    );
    const map = [...world.maps.values()].find((entry) => entry.unitInfo(unit) !== undefined);
    const info = map?.unitInfo(unit);
    if (!map || !info) throw new Error("unit");
    map.setCondition(unit, { ...info.condition, injury: 2, injuryUntilMs: clock + 4 * 3_600_000 });
    // 부상 중이라 1분 회복이 느리다(중상 250‰), 1차 스탯 불이익(중상 400‰)으로 최대 HP도 낮다
    const max = p.vitals.service.read(unit, clock)?.max.hp ?? 0;
    const slowed = p.vitals.service.read(unit, clock + 60_000)?.values.hp ?? 0;
    expect(slowed).toBeGreaterThan(0);
    expect(slowed).toBeLessThan(max);
    expect(p.holdings.access.treat?.(unit, clock)).toBe(true);
    expect(map.unitInfo(unit)?.condition).toMatchObject({ injury: 0, injuryUntilMs: null });
    // 불이익이 풀려 최대 HP가 돌아오고(D-514 부상 불이익), HP는 그 최대까지 찬다
    const healed = p.vitals.service.read(unit, clock);
    expect(healed?.max.hp ?? 0).toBeGreaterThan(max);
    expect(healed?.values.hp).toBe(healed?.max.hp);
    expect(p.holdings.access.treat?.(123_456_789, clock)).toBe(false);
  });
});
