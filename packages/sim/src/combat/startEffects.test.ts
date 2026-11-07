// 들어올 때 걸려 있는 효과(아이템 버프 D-501, 서버 표 unit_effects) 시험 — 판정의 걸린 효과로 들어가 효과 합이 그대로 읽는다.
// 값이 없으면 옛 전투와 바이트까지 같고, 끝나는 시각이 지나면 빠지고, 스냅숏에서 다시 켜도 같다
import { describe, expect, it } from "vitest";
import { createBattle, restoreBattle, runBattle } from "./battle.ts";
import type { BattleInit, StartEffect } from "./battleTypes.ts";
import { duel } from "./testBattle.ts";

/** 공격 편(편 1) 유닛에 들어올 효과를 준다 */
function withEffects(init: BattleInit, effects: readonly StartEffect[]): BattleInit {
  return {
    ...init,
    units: init.units.map((spec) => (spec.side === 1 ? { ...spec, startEffects: effects } : spec)),
  };
}

const attackUp = (value: number, untilMs: number): StartEffect => ({
  id: "test_attack_up",
  kind: "buff",
  stat: "attack",
  valueMode: "permille",
  value,
  untilMs,
});

describe("들어올 때 걸려 있는 효과(D-501 아이템 버프)", () => {
  it("값이 없거나 빈 목록이면 옛 시작 자료와 끝 상태가 같다", () => {
    const init = duel(2, 7);
    const plain = runBattle(init, []);
    const empty = runBattle(withEffects(init, []), []);
    // 빈 목록 칸(사양 칸이 상태에 남는다)만 빼면 같은 끝 상태다
    expect(JSON.stringify(empty.state.units.map((unit) => ({ ...unit, startEffects: undefined })))).toBe(
      JSON.stringify(plain.state.units),
    );
    expect(empty.result).toEqual(plain.result);
  });

  it("걸린 효과로 시작하고, 끝나는 시각이 0 이하인 것은 넣지 않는다", () => {
    const battle = createBattle(withEffects(duel(1, 3), [attackUp(500, 60_000), attackUp(900, 0)]));
    const attacker = battle.state.units.find((unit) => unit.side === 1);
    expect(attacker?.effects).toEqual([
      {
        id: "test_attack_up",
        kind: "buff",
        stat: "attack",
        valueMode: "permille",
        status: null,
        tickMs: 0,
        value: 500,
        stacks: 1,
        untilMs: 60_000,
        nextTickMs: 0,
      },
    ]);
  });

  it("공격 ‰ 버프를 든 편이 더 빨리 이긴다(효과 합 modifiersOf가 그대로 읽는다)", () => {
    const plain = runBattle(duel(3, 11), []);
    const buffed = runBattle(withEffects(duel(3, 11), [attackUp(2000, 600_000)]), []);
    expect(buffed.result?.winner).toBe(1);
    expect(buffed.result?.endTick ?? 0).toBeLessThan(plain.result?.endTick ?? 0);
  });

  it("끝나는 시각이 지나면 빠진다", () => {
    const battle = createBattle(withEffects(duel(1, 5), [attackUp(500, 1_000)]));
    battle.step([]);
    expect(battle.state.units.find((unit) => unit.side === 1)?.effects).toHaveLength(1);
    for (let i = 0; i < 12; i++) battle.step([]);
    expect(battle.state.units.find((unit) => unit.side === 1)?.effects).toHaveLength(0);
  });

  it("스냅숏에서 다시 켜도 처음부터 돌린 것과 같다", () => {
    const init = withEffects(duel(2, 9), [attackUp(800, 20_000)]);
    const run = runBattle(init, []);
    // 걸린 효과는 유닛 상태에 있어 스냅숏에 남는다: 처음 틱의 스냅숏에서 다시 켜도 끝 상태가 바이트까지 같다
    const snapshot = JSON.stringify(createBattle(init).state);
    const again = restoreBattle(init, snapshot).runToEnd([]);
    expect(JSON.stringify(again.state)).toBe(JSON.stringify(run.state));
  });
});
