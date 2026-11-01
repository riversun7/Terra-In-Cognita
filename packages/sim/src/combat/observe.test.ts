import { describe, expect, it } from "vitest";
import { createBattle, runBattle } from "./battle.ts";
import type { BattleInit } from "./battleTypes.ts";
import { TEST_COMBAT_CATALOG, skillsOf } from "./catalog.ts";
import { TEST_COMBAT_COEFFICIENTS } from "./coefficients.ts";
import { createBattleTally } from "./observe.ts";
import { duel } from "./testBattle.ts";

/** 불꽃 화살·응급 처치를 든 3 대 3(스킬·지속 피해·회복이 다 나온다) */
function skilled(seed: number): BattleInit {
  const base = duel(3, seed);
  const skills = skillsOf(TEST_COMBAT_CATALOG, ["fire_bolt", "first_aid"]);
  return {
    ...base,
    units: base.units.map((spec) => ({
      ...spec,
      mpMax: 200,
      mpRegen: 600,
      skillAttack: { physical: spec.attack, elemental: { ...spec.attack, kind: "elemental" as const } },
      skills,
    })),
  };
}

/** 집계를 붙여 끝까지(집계의 틱은 그 전투 상태에서) */
function tallied(init: BattleInit, logMax: number) {
  let battle: ReturnType<typeof createBattle> | null = null;
  const tally = createBattleTally(init.units, { logMax, tick: () => battle?.state.tick ?? 0 });
  battle = createBattle(init, TEST_COMBAT_COEFFICIENTS, tally.trace);
  battle.runToEnd([]);
  return { state: battle.state, report: tally.report() };
}

describe("전투 집계(판정 관찰자 위, 밸런스·전투 실험실)", () => {
  it("집계를 붙여도 결과·끝 상태가 바이트까지 같다(상태·굴림을 바꾸지 않는다)", () => {
    for (const seed of [1, 2, 3]) {
      const plain = runBattle(skilled(seed), []);
      const tally = createBattleTally(skilled(seed).units, { logMax: 50, tick: () => 0 });
      const watched = runBattle(skilled(seed), [], undefined, TEST_COMBAT_COEFFICIENTS, tally.trace);
      expect(watched.result).toEqual(plain.result);
      expect(watched.finalState).toBe(plain.finalState);
    }
  });

  it("편마다 준 피해 합 = 상대 편이 받은 피해 합(출처를 아는 것), 쓰러뜨림 = 쓰러진 수, 쓰러진 유닛은 받은 피해 − 받은 회복 ≥ 최대 HP", () => {
    const { state, report } = tallied(skilled(4), 0);
    const sum = (side: number, key: "dealt" | "taken" | "kills") =>
      state.units
        .filter((unit) => unit.side === side)
        .reduce((total, unit) => total + (report.units.get(unit.id)?.[key] ?? 0), 0);
    expect(sum(1, "dealt")).toBe(sum(2, "taken"));
    expect(sum(2, "dealt")).toBe(sum(1, "taken"));
    expect(sum(1, "dealt") + sum(2, "dealt")).toBeGreaterThan(0);
    const down = state.units.filter((unit) => unit.hp <= 0);
    expect(sum(1, "kills") + sum(2, "kills")).toBe(down.length);
    for (const unit of down) {
      const row = report.units.get(unit.id);
      expect((row?.taken ?? 0) - (row?.healedReceived ?? 0)).toBeGreaterThanOrEqual(unit.maxHp);
    }
  });

  it("사건 기록은 상한까지만 담고 넘친 수를 센다. 공격·스킬 사건이 나오고 틱은 늘어난다", () => {
    const capped = tallied(skilled(5), 10).report;
    expect(capped.events.length).toBe(10);
    expect(capped.eventsDropped).toBeGreaterThan(0);
    const all = tallied(skilled(5), 10_000).report;
    const kinds = new Set(all.events.map((event) => event.kind));
    expect(kinds.has("attack")).toBe(true);
    expect(kinds.has("skill")).toBe(true);
    const ticks = all.events.map((event) => event.tick);
    expect(ticks.at(-1) ?? 0).toBeGreaterThan(ticks[0] ?? 0);
  });
});
