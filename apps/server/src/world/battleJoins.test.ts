// 참전 입력을 합친 시작 자료(battles.ts withJoins — 줄기 no-teleport-a, D-591·D-176): 결과 적용이 참전한 유닛도 시작 유닛과 같은 셈(부상·생명 수치·돌아가기)으로 받는다.
import type { BattleInput } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { withJoins } from "./battles.ts";
import { testEncounter, testFighter } from "./testSupport.ts";

describe("withJoins", () => {
  it("참전 입력이 없으면 같은 객체, 있으면 편(없는 편만)·파티·유닛을 뒤에 더한다", () => {
    const init = testEncounter();
    expect(withJoins(init, [])).toBe(init);
    const join: BattleInput = {
      tick: 30,
      kind: "join",
      side: { id: 2, faction: 2, defender: true, edge: 1 },
      party: { id: 9, side: 2, retreatHpPct: 0 },
      units: [testFighter(21, 2, 9, 20, 10)],
    };
    const command: BattleInput = { tick: 31, kind: "command", unit: 1, command: { kind: "retreat" } };
    const merged = withJoins(init, [join, command]);
    expect(merged.sides).toEqual(init.sides);
    expect(merged.parties.map((party) => party.id)).toEqual([1, 2, 9]);
    expect(merged.units.map((unit) => unit.id)).toEqual([1, 2, 11, 12, 21]);
    // 새 편으로 든 참전은 편도 더한다
    const third = withJoins(init, [{ ...join, side: { id: 3, faction: 5, defender: false, edge: 0 } }]);
    expect(third.sides.map((side) => side.id)).toEqual([1, 2, 3]);
  });
});
