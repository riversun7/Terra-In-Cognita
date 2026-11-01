import { describe, expect, it } from "vitest";
import { runBattle } from "./battle.ts";
import { TEST_COMBAT_CATALOG, skillsOf } from "./catalog.ts";
import { TEST_COMBAT_COEFFICIENTS } from "./coefficients.ts";
import { type BattleObserver, createBattleTally } from "./observe.ts";
import { duel } from "./testBattle.ts";

/** 불꽃·응급 처치를 든 3 대 3(스킬·지속 피해·회복이 다 나온다) */
function skilled(seed: number) {
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

describe("전투 관찰자(BattleObserver, 밸런스·전투 실험실)", () => {
  it("관찰자가 있어도 결과·끝 상태가 바이트까지 같다(상태·굴림을 바꾸지 않는다)", () => {
    for (const seed of [1, 2, 3]) {
      const plain = runBattle(skilled(seed), []);
      const tally = createBattleTally(skilled(seed).units, { logMax: 50 });
      const watched = runBattle(skilled(seed), [], undefined, TEST_COMBAT_COEFFICIENTS, tally.observer);
      expect(watched.result).toEqual(plain.result);
      expect(watched.finalState).toBe(plain.finalState);
    }
  });

  it("받은 피해의 합 = 처음 (HP + 아머 + 쉴드) − 끝, 준 피해 합 ≤ 받은 피해 합, 쓰러뜨림 = 쓰러진 수", () => {
    const init = skilled(4);
    const tally = createBattleTally(init.units, { logMax: 0 });
    const { state } = runBattle(init, [], undefined, TEST_COMBAT_COEFFICIENTS, tally.observer);
    const report = tally.report();
    for (const unit of state.units) {
      const row = report.units.get(unit.id);
      expect(row).toBeDefined();
      if (!row) continue;
      // 회복은 HP만 올린다: 끝 = 처음 − 받은 피해 + 받은 회복
      const start = unit.maxHp + unit.armorHp + unit.shieldHp;
      const end = Math.max(0, unit.hp) + Math.max(0, unit.armor) + Math.max(0, unit.shield);
      expect(start - row.taken + row.healedReceived).toBe(end);
    }
    let dealt = 0;
    let taken = 0;
    let kills = 0;
    for (const row of report.units.values()) {
      dealt += row.dealt;
      taken += row.taken;
      kills += row.kills;
    }
    expect(dealt).toBeLessThanOrEqual(taken);
    expect(dealt).toBeGreaterThan(0);
    const down = state.units.filter((unit) => unit.status === "down" || unit.hp <= 0).length;
    expect(kills).toBe(down);
  });

  it("사건 기록은 상한까지만 담고 넘친 수를 센다. 공격·스킬 사건이 나온다", () => {
    const init = skilled(5);
    const tally = createBattleTally(init.units, { logMax: 10 });
    runBattle(init, [], undefined, TEST_COMBAT_COEFFICIENTS, tally.observer);
    const report = tally.report();
    expect(report.events.length).toBe(10);
    expect(report.eventsDropped).toBeGreaterThan(0);
    const all = createBattleTally(init.units, { logMax: 10_000 });
    runBattle(skilled(5), [], undefined, TEST_COMBAT_COEFFICIENTS, all.observer);
    const kinds = new Set(all.report().events.map((event) => event.kind));
    expect(kinds.has("attack") || kinds.has("skill")).toBe(true);
    expect(kinds.has("skill")).toBe(true);
  });

  it("관찰자는 빈 함수만 있어도 된다(모든 칸 선택)", () => {
    const observer: BattleObserver = {};
    const plain = runBattle(duel(2, 9), []);
    const watched = runBattle(duel(2, 9), [], undefined, TEST_COMBAT_COEFFICIENTS, observer);
    expect(watched.finalState).toBe(plain.finalState);
  });
});
