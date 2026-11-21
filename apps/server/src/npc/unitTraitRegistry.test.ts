import { DEFAULT_UNIT_TRAITS } from "@terra/shared/unitTraits";
import { DEFAULT_NPC_AI_COEFFICIENTS } from "@terra/sim/npcAi";
import { describe, expect, it } from "vitest";
import { createUnitTraitRegistry } from "./unitTraitRegistry.ts";

describe("unitTraitRegistry", () => {
  it("같은 시드·유닛 ID는 결정적으로 같은 7축 성향을 만들고 최초 1회만 persist를 부른다", () => {
    const saved: number[][] = [];
    const regA = createUnitTraitRegistry(12345);
    const regB = createUnitTraitRegistry(12345);

    const tA = regA.getOrCreate({
      unitId: 501,
      role: "guard",
      anchor: DEFAULT_UNIT_TRAITS,
      ai: DEFAULT_NPC_AI_COEFFICIENTS,
      persist: (arr) => saved.push([...arr]),
    });
    const tA2 = regA.getOrCreate({
      unitId: 501,
      role: "guard",
      anchor: DEFAULT_UNIT_TRAITS,
      ai: DEFAULT_NPC_AI_COEFFICIENTS,
      persist: (arr) => saved.push([...arr]),
    });
    const tB = regB.getOrCreate({
      unitId: 501,
      role: "guard",
      anchor: DEFAULT_UNIT_TRAITS,
      ai: DEFAULT_NPC_AI_COEFFICIENTS,
    });

    expect(tA).toEqual(tA2);
    expect(tA).toEqual(tB);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toHaveLength(7);
  });

  it("DB에서 복원된 persisted 배열이 있으면 생성 대신 그대로 복원한다", () => {
    const reg = createUnitTraitRegistry(99);
    const t = reg.getOrCreate({
      unitId: 77,
      role: "citizen",
      persisted: [100, 200, 300, 400, 500, 600, 700],
      ai: DEFAULT_NPC_AI_COEFFICIENTS,
    });
    expect(t.belligerence).toBe(100);
    expect(t.discipline).toBe(700);
    reg.delete(77);
    expect(reg.peek(77)).toBeUndefined();
  });
});
