// 무기 1차 적정 스탯 → 2차 적정치 시험(D-496, 질문 290 가의 계산 예와 견준다)
import { STAT_FORMULA_VARS, compileFormulaOrThrow } from "@terra/shared/formula";
import { describe, expect, it } from "vitest";
import { appropriateFromPrimaries } from "./appropriate.ts";
import { type StatRow, TEST_STAT_TABLE } from "./stats.ts";

describe("1차 적정 스탯 → 2차 적정치", () => {
  it("질문 290의 칼(STR 25·DEX 15): 물리 공격력 59, 명중 18, 크리 22, 속도 54(지금 가중치 표)", () => {
    expect(appropriateFromPrimaries({ str: 25, dex: 15 }, TEST_STAT_TABLE)).toEqual({
      physicalAttack: 59,
      elementalAttack: 0,
      hit: 18,
      crit: 22,
      speed: 54,
    });
  });

  it("적지 않은 1차는 0이다: 지팡이(INT 15·WIS 10)는 물리 칸 적정치가 0", () => {
    const staff = appropriateFromPrimaries({ int: 15, wis: 10 }, TEST_STAT_TABLE);
    expect(staff.physicalAttack).toBe(0);
    // 속성 공격력 = 15 × 2 + 10 × 0.6 = 36
    expect(staff.elementalAttack).toBe(36);
  });

  it("그 세계의 행 식을 쓴다(명중 행 식 DEX × 2 → 30)", () => {
    const vars = STAT_FORMULA_VARS.map((item) => item.name);
    const table: StatRow[] = TEST_STAT_TABLE.map((row) =>
      row.id === "hit" ? { ...row, formula: compileFormulaOrThrow("DEX * 2", vars) } : row,
    );
    expect(appropriateFromPrimaries({ str: 25, dex: 15 }, table).hit).toBe(30);
  });
});
