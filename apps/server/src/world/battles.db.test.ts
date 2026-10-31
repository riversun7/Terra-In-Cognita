import { type BattleInit, TEST_COMBAT_COEFFICIENTS, resolveOutcomes, runBattle } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase } from "../testDb.ts";
import { type BattleOutcome, type BattleService, createBattleService } from "./battles.ts";

let test: TestDatabase;
let clock = 1_800_000_000_000;
const services: BattleService[] = [];

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
  clock = 1_800_000_000_000;
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  for (const service of services.splice(0)) service.stop();
  await test.drop();
});

const ZERO = Array.from({ length: 12 }, () => 0);
function fighter(id: number, side: number, party: number, x: number, y: number) {
  return {
    id,
    side,
    party,
    x,
    y,
    maxHp: 400,
    armorHp: 0,
    shieldHp: 0,
    attack: {
      kind: "physical" as const,
      weaponAttack: 20,
      attackStat: 10,
      attackAppropriate: 10,
      weaponHitPm: 1000,
      hitStat: 10,
      hitAppropriate: 10,
      weaponCritPm: 100,
      critStat: 10,
      critAppropriate: 10,
      critMulPm: 1500,
      penetrationPm: 0,
      skillMulPm: 1000,
      buffPm: 1000,
      elements: ZERO,
      skillElementsPm: ZERO,
    },
    defense: { defenseRatePm: 100, defenseFlat: 1, evadePm: 0, elements: ZERO, resistPm: ZERO },
    range: 1,
    arc: false,
    attackIntervalMs: 500,
    moveIntervalMs: 500,
    staminaMax: 1000,
    staminaCost: 1,
    mpMax: 0,
    mpCost: 0,
    sight: 12,
    eye: 2880,
    air: false,
    commandCap: 0,
    cyborg: false,
    buildingMulPm: 1000,
    primaries: [0, 0, 0, 0, 0, 0],
    skills: [],
  };
}

function encounter(): BattleInit {
  const size = 32;
  return {
    id: 1,
    kind: "normal",
    seed: 77,
    map: {
      size,
      passable: new Uint8Array(size * size).fill(1),
      cover: new Uint8Array(size * size),
      height: new Int32Array(size * size),
      buildings: [],
    },
    sides: [
      { id: 1, faction: 1, defender: false, edge: 3 },
      { id: 2, faction: 2, defender: true, edge: 1 },
    ],
    parties: [
      { id: 1, side: 1, retreatHpPct: 0 },
      { id: 2, side: 2, retreatHpPct: 0 },
    ],
    units: [
      fighter(1, 1, 1, 12, 10),
      fighter(2, 1, 1, 12, 12),
      fighter(11, 2, 2, 18, 10),
      fighter(12, 2, 2, 18, 12),
    ],
  };
}

function boot(results: { id: number; outcome: BattleOutcome }[]): BattleService {
  const service = createBattleService({
    pool: test.db.$client,
    now: () => clock,
    onResult: (id, outcome) => {
      results.push({ id, outcome });
    },
    onError: (error) => {
      throw error;
    },
  });
  services.push(service);
  return service;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe.skipIf(!TEST_DATABASE_URL)("전투 인스턴스(서버)", () => {
  it("만들면 빨리감기로 끝 시각을 정하고, 입력이 오면 다시 계산하고, 다시 켜도 결과를 한 번만 적용한다", async () => {
    const results: { id: number; outcome: BattleOutcome }[] = [];
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
    await settle();
    const ended = await second.get(id);
    expect(ended?.status).toBe("ended");
    expect(results).toHaveLength(1);
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
});
