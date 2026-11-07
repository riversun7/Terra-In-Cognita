// 들어올 때의 HP·아머·쉴드(D-512) 시험 — 남은 값으로 시작하고, 끝난 값을 결과에 싣는다. 값이 없으면 옛 전투와 바이트까지 같다
import { describe, expect, it } from "vitest";
import { createBattle, restoreBattle, runBattle } from "./battle.ts";
import type { BattleInit } from "./battleTypes.ts";
import { resolveOutcomes } from "./outcome.ts";
import { duel } from "./testBattle.ts";

/** 수비 편(ID 101~) 유닛에 들어올 값을 준다 */
function withStart(init: BattleInit, start: { hp: number; armor: number; shield: number }): BattleInit {
  return {
    ...init,
    units: init.units.map((spec) => (spec.side === 2 ? { ...spec, armorHp: 30, shieldHp: 20, start } : spec)),
  };
}

describe("들어올 때의 생명 수치(D-512)", () => {
  it("값이 없으면 가득에서 시작한다(옛 시작 자료와 끝 상태가 같다)", () => {
    const init = duel(2, 7);
    const plain = runBattle(init, []);
    const undefinedStart = runBattle(
      { ...init, units: init.units.map((spec) => ({ ...spec, start: undefined })) },
      [],
    );
    expect(JSON.stringify(undefinedStart.state)).toBe(JSON.stringify(plain.state));
    expect(plain.state.units.every((unit) => unit.status !== "alive" || unit.hp > 0)).toBe(true);
  });

  it("남은 값으로 시작하고 0~최대로 자른다", () => {
    const init = withStart(duel(2, 3), { hp: 40, armor: 999, shield: -5 });
    const battle = createBattle(init);
    const defender = battle.state.units.find((unit) => unit.id === 101);
    expect(defender).toMatchObject({ hp: 40, armor: 30, shield: 0, status: "alive" });
    // 스태미나·MP는 가득에서 시작한다(D-512는 HP·아머·쉴드만)
    expect(defender?.staminaMilli).toBe((defender?.staminaMax ?? 0) * 1000);
  });

  it("다친 채 들어온 편은 가득인 같은 편보다 일찍 무너진다", () => {
    const full = runBattle(duel(3, 11), []);
    const hurt = runBattle(withStart(duel(3, 11), { hp: 30, armor: 0, shield: 0 }), []);
    expect(full.result?.winner).toBeDefined();
    expect(hurt.result?.winner).toBe(1);
    expect(hurt.result?.endTick ?? 0).toBeLessThan(full.result?.endTick ?? 0);
  });

  it("HP 0으로 들어오면 쓰러진 채다: 행동하지 않고 결과는 부상", () => {
    const init = withStart(duel(1, 5), { hp: 0, armor: 30, shield: 20 });
    const battle = createBattle(init);
    expect(battle.state.units.find((unit) => unit.id === 101)?.status).toBe("down");
    const { state, result } = runBattle(init, []);
    expect(result?.winner).toBe(1);
    const outcome = resolveOutcomes(state, { war: false }).find((entry) => entry.unit === 101);
    expect(outcome).toMatchObject({ injured: true, hp: 0, outcome: "returned" });
  });

  it("결과에 끝난 HP·아머·쉴드를 싣고, 스냅숏에서 다시 켜도 같다", () => {
    const init = withStart(duel(2, 9), { hp: 70, armor: 10, shield: 5 });
    const run = runBattle(init, []);
    const outcomes = resolveOutcomes(run.state, { war: false });
    for (const entry of outcomes) {
      const unit = run.state.units.find((candidate) => candidate.id === entry.unit);
      expect(entry).toMatchObject({
        hp: Math.max(0, unit?.hp ?? -1),
        armor: unit?.armor,
        shield: unit?.shield,
      });
    }
    // 들어올 값은 유닛 상태(사양 칸)에 있어 스냅숏에 남는다: 처음 틱의 스냅숏에서 다시 켜도 끝 상태가 바이트까지 같다
    const snapshot = JSON.stringify(createBattle(init).state);
    const restored = restoreBattle(init, snapshot).runToEnd([]);
    expect(JSON.stringify(restored.state)).toBe(JSON.stringify(run.state));
  });
});
