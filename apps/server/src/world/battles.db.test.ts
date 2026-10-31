import { TEST_COMBAT_COEFFICIENTS, resolveOutcomes, runBattle } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase } from "../testDb.ts";
import { type BattleOutcome, type BattleService, createBattleService } from "./battles.ts";
import { type WorldWriter, createWorldWriter } from "./persist/writer.ts";
import { silentLog, testEncounter as encounter } from "./testSupport.ts";

let test: TestDatabase;
let clock = 1_800_000_000_000;
const services: BattleService[] = [];
const writers: WorldWriter[] = [];

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
  clock = 1_800_000_000_000;
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  for (const service of services.splice(0)) service.stop();
  for (const writer of writers.splice(0)) await writer.drain();
  await test.drop();
});

function boot(results: { id: number; outcome: BattleOutcome; atMs: number }[]): BattleService {
  const writer = createWorldWriter({
    pool: test.db.$client,
    log: silentLog,
    intervalMs: 10,
    onFatal: (error) => {
      throw error;
    },
  });
  writers.push(writer);
  const service = createBattleService({
    pool: test.db.$client,
    writer,
    now: () => clock,
    apply: (id, _init, outcome, atMs) => {
      results.push({ id, outcome, atMs });
    },
    onError: (error) => {
      throw error;
    },
  });
  services.push(service);
  return service;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

/** 결과 적용을 기다린다(부하가 크면 50ms로 모자라다) */
async function untilEnded(service: BattleService, id: number): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if ((await service.get(id))?.status === "ended") return;
    await settle();
  }
  throw new Error("battle did not end");
}

describe.skipIf(!TEST_DATABASE_URL)("전투 인스턴스(서버)", () => {
  it("만들면 빨리감기로 끝 시각을 정하고, 입력이 오면 다시 계산하고, 다시 켜도 결과를 한 번만 적용한다", async () => {
    const results: { id: number; outcome: BattleOutcome; atMs: number }[] = [];
    const first = boot(results);
    expect(await first.restore()).toBe(0);
    const id = await first.start(encounter(), { war: false });
    const created = await first.get(id);
    expect(created?.status).toBe("running");
    const plainEnd = created?.endsAtMs ?? 0;
    expect(plainEnd).toBeGreaterThan(clock);
    // 10틱 뒤에 편 1 유닛 하나를 퇴각시키면 끝(또는 결과)이 바뀐다
    clock += 10 * TEST_COMBAT_COEFFICIENTS.tickMs;
    await first.addInput(id, { tick: 10, kind: "command", unit: 1, command: { kind: "retreat" } });
    const changed = await first.get(id);
    expect(changed?.status).toBe("running");
    first.stop();

    // 서버를 다시 켠다(같은 DB): 끝 시각이 지났으면 곧바로 결과를 적용한다
    clock = (changed?.endsAtMs ?? 0) + 1;
    const second = boot(results);
    expect(await second.restore()).toBe(1);
    await untilEnded(second, id);
    const ended = await second.get(id);
    expect(ended?.status).toBe("ended");
    expect(results).toHaveLength(1);
    // 결과는 실시간으로 끝나는 시각에 적용한 것으로 친다(D-189)
    expect(results[0]?.atMs).toBe(changed?.endsAtMs);
    // 서버 결과(입력 → 다시 계산 → 다시 켜서 스냅숏 + 입력)가 메모리에서 같은 입력으로 끝까지 돌린 것과 같다
    const input = { tick: 10, kind: "command" as const, unit: 1, command: { kind: "retreat" as const } };
    const local = runBattle(encounter(), [input]);
    expect(results[0]?.outcome.result).toEqual(local.result);
    expect(results[0]?.outcome.units).toEqual(resolveOutcomes(local.state, { war: false }));
    expect(local.result).not.toEqual(runBattle(encounter(), []).result);
    // 다시 켜도 두 번 적용하지 않는다
    const third = boot(results);
    expect(await third.restore()).toBe(0);
    await settle();
    expect(results).toHaveLength(1);
  });

  it("결과 기록이 커밋된 뒤 status를 고치기 전에 죽었으면, 다시 켤 때 다시 적용하지 않고 status만 고친다", async () => {
    const results: { id: number; outcome: BattleOutcome; atMs: number }[] = [];
    const first = boot(results);
    await first.restore();
    const id = await first.start(encounter(), { war: false });
    first.stop();
    // 결과 기록만 있는 상태를 만든다(적용 묶음은 커밋됐고 status 고치기 전에 죽음)
    await test.db.$client.query(
      `insert into world_battle_results (battle_id, applied_at_ms, result) values ($1, $2, '{"done": true}')`,
      [id, clock],
    );
    clock += 3_600_000;
    const second = boot(results);
    expect(await second.restore()).toBe(0);
    await settle();
    expect(results).toHaveLength(0);
    expect((await second.get(id))?.status).toBe("ended");
  });
});
