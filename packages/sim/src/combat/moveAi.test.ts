import { AI_PRESET_VALUES, type AiTactics } from "@terra/shared/aiTactics";
import { DEFAULT_UNIT_TRAITS } from "@terra/shared/unitTraits";
import { describe, expect, it } from "vitest";
import {
  type MoveSkillUnit,
  type RunAiUnit,
  chooseCombatTacticFromTraits,
  moveSkillAllowed,
  wantsRun,
} from "./moveAi.ts";

function fakeUnit(overrides: Partial<RunAiUnit & MoveSkillUnit> = {}): RunAiUnit & MoveSkillUnit {
  return {
    id: 10,
    x: 10,
    y: 10,
    maxHp: 1000,
    hp: 1000,
    range: 1,
    staminaMax: 100,
    staminaMilli: 80_000,
    command: null,
    aiTactics: undefined,
    stealthUntilMs: undefined,
    detectUntilMs: undefined,
    ...overrides,
  };
}

describe("combat/moveAi (WP-4)", () => {
  it("aiTactics가 없으면 기존 규칙과 100% 동일하게 동작한다(명령 run만 달리고 이동 스킬 늘 허락)", () => {
    const plain = fakeUnit();
    const enemy = fakeUnit({ id: 20, x: 15, y: 10 });
    expect(wantsRun(plain)).toBe(false);
    expect(wantsRun(fakeUnit({ command: { kind: "move", cell: 5, run: true } }))).toBe(true);
    expect(moveSkillAllowed(plain, { id: "dash_1", move: { kind: "dash", cells: 3 } }, enemy, 1000)).toBe(
      true,
    );
  });

  it("wantsRun은 공격·추격 프리셋과 퇴각 상태에서 스태미나에 따라 달린다", () => {
    const aggressive = fakeUnit({ aiTactics: AI_PRESET_VALUES.aggressive, staminaMilli: 60_000 });
    const hold = fakeUnit({ aiTactics: AI_PRESET_VALUES.hold, staminaMilli: 90_000 });
    const tired = fakeUnit({ aiTactics: AI_PRESET_VALUES.aggressive, staminaMilli: 10_000 });

    expect(wantsRun(aggressive)).toBe(true);
    expect(wantsRun(hold)).toBe(false);
    expect(wantsRun(tired)).toBe(false);
    expect(
      wantsRun(fakeUnit({ aiTactics: AI_PRESET_VALUES.hold, staminaMilli: 20_000 }), { retreating: true }),
    ).toBe(true);
  });

  it("moveSkillAllowed는 은신·돌진·뒷걸음을 슬라이더와 기회별 결정적 굴림으로 제어한다", () => {
    const enemyNear = fakeUnit({ id: 20, x: 11, y: 10 });
    const enemyFar = fakeUnit({ id: 20, x: 16, y: 10 });

    const stealthy = fakeUnit({ aiTactics: AI_PRESET_VALUES.hold });
    expect(
      moveSkillAllowed(
        stealthy,
        { id: "stealth_1", move: { kind: "stealth", durationMs: 4000 } },
        enemyFar,
        2000,
      ),
    ).toBe(true);
    expect(
      moveSkillAllowed(
        fakeUnit({ aiTactics: AI_PRESET_VALUES.hold, stealthUntilMs: 5000 }),
        { id: "stealth_1", move: { kind: "stealth", durationMs: 4000 } },
        enemyFar,
        2000,
      ),
    ).toBe(false);

    const mid: AiTactics = { ...AI_PRESET_VALUES.balanced, engage: 5, saveSkill: 0 };
    const u = fakeUnit({ aiTactics: mid });
    const r1 = moveSkillAllowed(u, { id: "dash_1", move: { kind: "dash", cells: 3 } }, enemyFar, 3100);
    const r2 = moveSkillAllowed(u, { id: "dash_1", move: { kind: "dash", cells: 3 } }, enemyFar, 3900);
    expect(r1).toBe(r2);
    expect(moveSkillAllowed(u, { id: "dash_1", move: { kind: "dash", cells: 3 } }, enemyNear, 3100)).toBe(
      false,
    );

    const ranged = fakeUnit({
      range: 4,
      aiTactics: { ...AI_PRESET_VALUES.hold, engage: 0, cover: 10 },
    });
    expect(
      moveSkillAllowed(ranged, { id: "back_1", move: { kind: "backstep", cells: 2 } }, enemyNear, 3100),
    ).toBe(true);
  });

  it("chooseCombatTacticFromTraits는 7축 성향과 사거리로 8가지 D-558 전개 방식을 구분한다", () => {
    expect(
      chooseCombatTacticFromTraits({ ...DEFAULT_UNIT_TRAITS, belligerence: 850, boldness: 800 }, 1),
    ).toBe("assault");
    expect(
      chooseCombatTacticFromTraits({ ...DEFAULT_UNIT_TRAITS, belligerence: 200, discipline: 750 }, 1),
    ).toBe("defend");
    expect(
      chooseCombatTacticFromTraits({ ...DEFAULT_UNIT_TRAITS, boldness: 200, belligerence: 350 }, 1),
    ).toBe("delay");
    expect(chooseCombatTacticFromTraits({ ...DEFAULT_UNIT_TRAITS, discipline: 750, openness: 700 }, 3)).toBe(
      "harass",
    );
    expect(chooseCombatTacticFromTraits({ ...DEFAULT_UNIT_TRAITS, autonomy: 800, boldness: 700 }, 1)).toBe(
      "infiltrate",
    );
    expect(chooseCombatTacticFromTraits({ ...DEFAULT_UNIT_TRAITS, openness: 750, boldness: 650 }, 1)).toBe(
      "flank",
    );
    expect(
      chooseCombatTacticFromTraits({ ...DEFAULT_UNIT_TRAITS, communalism: 750, discipline: 700 }, 1),
    ).toBe("focus");
    expect(chooseCombatTacticFromTraits(DEFAULT_UNIT_TRAITS, 1)).toBe("center");
  });
});
