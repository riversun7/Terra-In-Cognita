// NPC 판단 예약 저장·이어 하기 DB 통합 시험(decideSchedule.ts, ADR 2026-11-01-npc-brain-r5 "바뀜 (2026-11-21)") — TEST_DATABASE_URL이 있을 때만.
// 값은 모두 시험용 가짜다. 켜면 세력 행에 다음 판단 시각을 쓰고, 다시 켜면 그 시각을 그대로 잇고, 지난 시각이면 짧은 창 안에 판단한다.
import { DAY_MS, TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { silentLog } from "../world/testSupport.ts";
import { type World, startWorld } from "../world/world.ts";
import { CATCH_UP_MS, resumeDecideAt } from "./decideSchedule.ts";

let test: TestDatabase;
const worlds: World[] = [];
/** 시작 도시는 국가마다 하나, 처음 인구는 끔(runtime.db.test.ts와 같은 작은 세계) */
const RULES = {
  ...TEST_SOCIETY_COEFFICIENTS,
  worldSeed: {
    ...TEST_SOCIETY_COEFFICIENTS.worldSeed,
    startCitiesMin: 1,
    startCitiesMax: 1,
    populationPm: 0,
  },
};
const EVERY_MS = RULES.npc.decideEveryMs;
/** 시험 시계(UTC 0시에서 한 시간 뒤 — 하루 끝이 판단 사이에 끼지 않게) */
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
    npc: { testNations: 3, manual: true },
    cyborgRules: () => RULES,
  });
  worlds.push(world);
  await world.ready;
  return world;
}

async function stop(world: World): Promise<void> {
  await world.persistence?.writer.durable();
  await world.stop();
  worlds.splice(worlds.indexOf(world), 1);
}

/** 살아 있는 NPC 국가의 소유 주체 ID → (저장된 다음 판단 시각, 판단 차례) */
async function stored(): Promise<Map<number, { at: number | null; aiStep: number }>> {
  const found = await rows<{ owner_id: string; next_decide_ms: string | null; ai_step: number }>(
    test.db,
    `select o.id as owner_id, f.next_decide_ms, f.ai_step from factions f join world_owners o on o.faction_id = f.id
     where f.kind = 'npc' and f.code is not null and f.dissolved_at_ms is null order by o.id`,
  );
  return new Map(
    found.map((row) => [
      Number(row.owner_id),
      { at: row.next_decide_ms === null ? null : Number(row.next_decide_ms), aiStep: row.ai_step },
    ]),
  );
}

describe.skipIf(!TEST_DATABASE_URL)("NPC 판단 예약 이어 하기", () => {
  it("처음 켜면 [0, 간격) 시드 점에 걸어 저장하고, 다시 켜면 같은 시각을 잇는다", async () => {
    const first = await boot();
    const seed = first.npc?.world.seed ?? 0;
    await first.persistence?.writer.durable();
    const before = await stored();
    expect(before.size).toBe(3);
    for (const [id, row] of before) {
      // 저장된 시각이 없던 첫 실행: 시드 고른 점(시뮬의 4.5~7.5시간이 아니라 [0, 간격))
      expect(row.at).toBe(
        resumeDecideAt({
          seed,
          faction: { id, aiStep: row.aiStep },
          stored: null,
          startMs: clock,
          everyMs: EVERY_MS,
        }),
      );
      expect(row.at).toBeLessThan(clock + EVERY_MS);
    }
    expect(first.npc?.takeMetrics().npcNextDecideMin).toBe(
      Math.round((Math.min(...[...before.values()].map((row) => row.at ?? Infinity)) - clock) / 6000) / 10,
    );
    await stop(first);

    // 한 시간 뒤 다시 켠다(배포): 시각이 밀리지 않는다
    clock += 3_600_000;
    const second = await boot();
    await second.persistence?.writer.durable();
    const after = await stored();
    for (const [id, row] of before) {
      const at = row.at ?? 0;
      // 이미 지난 판단은 짧은 창 안으로, 남은 판단은 그대로
      if (at >= clock) expect(after.get(id)?.at).toBe(at);
      else expect(after.get(id)?.at).toBeLessThan(clock + CATCH_UP_MS);
    }
    // 가장 이른 판단 시각이 되면 판단한다
    const earliest = Math.min(...[...after.values()].map((row) => row.at ?? Infinity));
    clock = earliest + 1;
    await second.npc?.tick();
    expect(second.npc?.takeMetrics().npcDecisions).toBeGreaterThanOrEqual(1);
  });

  it("저장된 시각이 지났으면 켠 뒤 짧은 창 안에 국가마다 흩어 판단한다", async () => {
    const first = await boot();
    await stop(first);
    // 몇 시간 꺼져 있었다: 모든 판단이 지났다
    await test.db.$client.query(`update factions set next_decide_ms = $1 where kind = 'npc'`, [
      clock - 60_000,
    ]);
    clock += 4 * 3_600_000;
    const second = await boot();
    const npc = second.npc;
    if (!npc) throw new Error("npc runtime");
    await second.persistence?.writer.durable();
    const resumed = [...(await stored()).values()].map((row) => row.at ?? 0);
    for (const at of resumed) {
      expect(at).toBeGreaterThanOrEqual(clock);
      expect(at).toBeLessThan(clock + CATCH_UP_MS);
    }
    // 한 시각에 몰리지 않는다
    expect(new Set(resumed).size).toBe(resumed.length);
    npc.takeMetrics();
    clock += CATCH_UP_MS;
    await npc.tick();
    expect(npc.takeMetrics().npcDecisions).toBe(3);
    // 판단한 뒤 다음 시각(시뮬과 같은 간격 ±25%)을 다시 저장한다
    await second.persistence?.writer.durable();
    for (const row of (await stored()).values()) {
      expect(row.at).toBeGreaterThan(clock + EVERY_MS / 2);
      expect(row.aiStep).toBeGreaterThanOrEqual(1);
    }
  });
});
