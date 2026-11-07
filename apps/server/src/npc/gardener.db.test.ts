// 정원사(서버) DB 통합 시험 — docs/adr/2026-11-01-gardener-r5b.md 5절. TEST_DATABASE_URL이 있을 때만. 값은 모두 시험용 가짜다.
// 시험 2차맵 칸(과 이웃 8칸)에 오염을 미리 넣고, 하루 끝에 웨이브 예고(8시간) → 도착하면 전투 서비스의 공성 전투 →
// 끝 시각이 지난 뒤 다시 켜면 결과(피해·쉬는 시간)가 들어가는지 본다.
import { neighbors8 } from "@terra/planet";
import {
  DAY_MS,
  TEST_COMBAT_COEFFICIENTS,
  TEST_GARDENER_COEFFICIENTS,
  TEST_SOCIETY_COEFFICIENTS,
} from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { silentLog } from "../world/testSupport.ts";
import { createWaveInboxProvider } from "./waveInbox.ts";
import { TEST_MAP_KEY, TEST_PLANET_ID, type World, startWorld } from "../world/world.ts";

const HOUR = 3_600_000;
let test: TestDatabase;
const worlds: World[] = [];
let clock = 0;

/** 확률이 오염 합 그대로(상한 1000‰ = 늘 온다)인 시험 계수 */
const PRESSURE = {
  ...TEST_SOCIETY_COEFFICIENTS,
  gardener: { ...TEST_GARDENER_COEFFICIENTS, chanceDivisor: 1, chanceMaxPm: 1000 },
};

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
  clock = 1_800_000_000_000 - (1_800_000_000_000 % DAY_MS) + DAY_MS - 60_000;
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  for (const world of worlds.splice(0)) await world.stop().catch(() => undefined);
  await test.drop();
});

async function boot(): Promise<World> {
  const world = startWorld({
    testBots: 30,
    paths: { kind: "inline" },
    now: () => clock,
    log: silentLog,
    pool: test.db.$client,
    writeIntervalMs: 10,
    onFatal: (error) => {
      throw error;
    },
    cyborgRules: () => PRESSURE,
    // 시험 시간: 웨이브 공성 제한 2분(설정 칸 C2 실효 값이 웨이브 전투에 들어가는지도 본다)
    combatRules: () => ({
      ...TEST_COMBAT_COEFFICIENTS,
      limitMs: { ...TEST_COMBAT_COEFFICIENTS.limitMs, siege: 120_000 },
    }),
    npc: { testNations: 3, manual: true },
  });
  worlds.push(world);
  await world.ready;
  return world;
}

async function waitFor(check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("timed out");
}

const waves = () =>
  rows<{
    id: string;
    city_id: string;
    state: string;
    created_at_ms: string;
    arrive_at_ms: string;
    battle_id: string | null;
    physical: number;
    strength: number;
  }>(
    test.db,
    `select id, city_id, state, created_at_ms, arrive_at_ms, battle_id, physical, strength from gardener_waves order by id`,
  );

describe.skipIf(!TEST_DATABASE_URL)("정원사(서버)", () => {
  it("오염 → 하루 끝 웨이브 예고(8시간) → 공성 전투(전투 서비스) → 다시 켜면 결과(피해·쉬는 시간)", async () => {
    // 시험 2차맵 칸과 이웃 8칸에 상한 오염
    for (const cell of [TEST_MAP_KEY, ...neighbors8(TEST_MAP_KEY)])
      await test.db.$client.query(
        `insert into planet_pollution (planet_id, cell_key, value, updated_at_ms) values ($1, $2, 10000, 0)`,
        [TEST_PLANET_ID, cell],
      );
    const first = await boot();
    const npc = first.npc;
    const writer = first.persistence?.writer;
    if (!npc || !writer) throw new Error("npc runtime");

    // 하루 끝(UTC 0시): 시작 도시 셋 모두 웨이브 예고(확률 1000‰), 도착 = 생성 + 8시간
    clock += 120_000;
    await npc.tick();
    await writer.durable();
    const noticed = await waves();
    expect(noticed).toHaveLength(3);
    for (const wave of noticed) {
      expect(wave.state).toBe("marching");
      expect(Number(wave.arrive_at_ms) - Number(wave.created_at_ms)).toBe(8 * HOUR);
      expect(wave.physical).toBeGreaterThan(0);
    }
    // 칸 오염: 하루 바뀜(감소·퍼짐)이 저장됐다
    const cells = await rows<{ n: string }>(test.db, `select count(*) as n from planet_pollution`);
    expect(Number(cells[0]?.n)).toBeGreaterThan(9);
    expect(npc.takeMetrics()).toMatchObject({ gardenerWaves: 3 });
    // 예고: 그 도시 세력에 든 계정의 처리할 일에 "웨이브가 다가옵니다"(마감 = 도착)
    const user = await rows<{ id: string }>(
      test.db,
      `insert into users (name, email, username) values ('Fake_warden', 'fake-warden@id.placeholder.invalid', 'fake_warden') returning id`,
    );
    const userId = String(user[0]?.id);
    await test.db.$client.query(
      `insert into faction_members (user_id, faction_id) select $1, faction_id from world_cities where id = $2`,
      [userId, noticed[0]?.city_id],
    );
    const inbox = await createWaveInboxProvider(test.db.$client).collect(
      { userId, roles: ["player"] },
      clock,
    );
    expect(inbox.map((entry) => [entry.key, entry.deadlineAt])).toEqual([
      [`wave_${noticed[0]?.id}`, Number(noticed[0]?.arrive_at_ms)],
    ]);

    // 8시간 뒤 도착: 수비 휴먼이 있으니 전투 서비스에 공성 전투가 들어간다
    clock += 8 * HOUR;
    await npc.tick();
    await waitFor(async () => {
      await npc.tick(true);
      await writer.durable();
      return (await waves()).every((wave) => wave.state === "fighting" && wave.battle_id !== null);
    });
    const battles = await rows<{ id: string; ends_at_ms: string; status: string }>(
      test.db,
      `select id, ends_at_ms, status from world_battles order by id`,
    );
    expect(battles).toHaveLength(3);
    expect(battles.every((battle) => battle.status === "running")).toBe(true);
    // 공성 제한 2분(1,200틱) 안에 끝난다
    for (const battle of battles) expect(Number(battle.ends_at_ms) - clock).toBeLessThanOrEqual(120_000);
    const research = await rows<{ id: string; research_level: number }>(
      test.db,
      `select id, research_level from world_cities order by id`,
    );
    await first.stop();

    // 끝 시각이 지난 뒤 다시 켠다 → 전투 결과 적용 → 웨이브 결과(이기면 시작 도시 피해, 지면 쉬는 시간)
    clock = Math.max(...battles.map((battle) => Number(battle.ends_at_ms))) + 1_000;
    const second = await boot();
    const npc2 = second.npc;
    const writer2 = second.persistence?.writer;
    if (!npc2 || !writer2) throw new Error("npc runtime");
    await waitFor(async () => {
      await npc2.tick(true);
      await writer2.durable();
      return (await waves()).every((wave) => wave.state === "won" || wave.state === "repelled");
    });
    const done = await waves();
    const after = await rows<{ id: string; research_level: number; wave_cooldown_until_ms: string }>(
      test.db,
      `select id, research_level, wave_cooldown_until_ms from world_cities order by id`,
    );
    for (const wave of done) {
      const city = after.find((row) => row.id === wave.city_id);
      const before = research.find((row) => row.id === wave.city_id)?.research_level ?? 0;
      if (wave.state === "won") expect(city?.research_level).toBe(Math.max(0, before - 1));
      else expect(Number(city?.wave_cooldown_until_ms)).toBeGreaterThan(clock);
    }
    // 시작 도시는 폐허가 되지 않는다(D-341)
    expect(after.filter((row) => done.some((wave) => wave.city_id === row.id))).toHaveLength(3);
    // 정원사 상태(모함 칸·유목 부대)가 저장된다
    const society = await rows<{
      gardener: { mothershipCell: number; nomads: unknown[]; relations: [number, number][] } | null;
    }>(test.db, `select gardener from npc_society where id = 1`);
    expect(society[0]?.gardener?.nomads).toHaveLength(3);
    // 정원사 2: 세력마다 정원 세력 관계도(49 N52, 시험 국가 셋 이상), 웨이브 종류 = 도시, 막아 낸 웨이브만 보상 기록(D-499)
    expect(society[0]?.gardener?.relations.length).toBeGreaterThanOrEqual(3);
    const recorded = await rows<{
      kind: string;
      state: string;
      strength: number;
      reward: { renown: number; genes: number; items: unknown[] } | null;
    }>(test.db, `select kind, state, strength, reward from gardener_waves order by id`);
    for (const wave of recorded) {
      expect(wave.kind).toBe("city");
      if (wave.state === "repelled") expect(wave.reward?.renown).toBe(wave.strength * 10);
      else expect(wave.reward).toBeNull();
    }
  }, 120_000);

  it("보호 레이드(D-500): 필수 NPC 세력을 친 세력의 가장 오래된 도시로, 종류 protection으로 저장되고 다시 켜도 남는다", async () => {
    const first = await boot();
    const npc = first.npc;
    const writer = first.persistence?.writer;
    if (!npc || !writer) throw new Error("npc runtime");
    const nations = [...npc.world.factions.values()]
      .filter((faction) => faction.alive && faction.fixed && faction.cities.size > 0)
      .toSorted((a, b) => a.id - b.id);
    const [target, attacker] = nations;
    if (!target || !attacker) throw new Error("test nations");
    const home = Math.min(...attacker.cities);
    expect(npc.gardener.run.protect(attacker, target, Math.min(...target.cities), clock)).toBe(true);
    await npc.tick(true);
    await writer.durable();
    const saved = await rows<{ kind: string; state: string; city_id: string; reward: unknown }>(
      test.db,
      `select kind, state, city_id, reward from gardener_waves`,
    );
    expect(saved).toEqual([{ kind: "protection", state: "marching", city_id: String(home), reward: null }]);
    await first.stop();
    const second = await boot();
    const restored = [...(second.npc?.gardener.run.waves.values() ?? [])];
    expect(restored.map((wave) => [wave.kind, wave.city])).toEqual([["protection", home]]);
  }, 120_000);
});
