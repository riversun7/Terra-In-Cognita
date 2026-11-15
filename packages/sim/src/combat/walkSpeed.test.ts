// 걷기 속도 식(walk_speed, 사용자 결정 D-540 "걷기만 AGI 반영") — 기본 식이 지금 걷기 빠르기와 이어지는지
import { BATTLE_BASE_MOVE_MS, battleMoveIntervalMs, combatFormulaSetFrom, walkSpeedOf } from "./formulas.ts";
import { TEST_COMBAT_COEFFICIENTS } from "./coefficients.ts";
import { WALK_SPEED } from "../units.ts";
import { describe, expect, it } from "vitest";

const c = TEST_COMBAT_COEFFICIENTS;

describe("걷기 속도(walk_speed)", () => {
  it("처음 AGI 10 유닛 = 지금 서버 걷기(WALK_SPEED 437, D-120 2차맵 하나 약 10분)", () => {
    expect(walkSpeedOf(10, c)).toBe(WALK_SPEED);
  });

  it("옛 CHR §13 비율: 기울기 = 기본 × 1%, 상한 = 기본 × 4(AGI 300에서 닿는다)", () => {
    expect(walkSpeedOf(0, c)).toBe(397);
    expect(walkSpeedOf(-50, c)).toBe(397);
    expect(walkSpeedOf(20, c)).toBe(476);
    expect(walkSpeedOf(100, c)).toBe(794);
    expect(walkSpeedOf(299, c)).toBe(1585);
    expect(walkSpeedOf(300, c)).toBe(1589);
    expect(walkSpeedOf(10_000, c)).toBe(1589);
  });

  it("AGI가 오르면 줄지 않는다", () => {
    let last = 0;
    for (let agi = 0; agi <= 400; agi++) {
      const speed = walkSpeedOf(agi, c);
      expect(speed).toBeGreaterThanOrEqual(last);
      last = speed;
    }
  });

  it("고친 식을 따르고 1 이상·전송 상한 안으로 자른다", () => {
    const fast = { ...c, formulas: combatFormulaSetFrom({ walk_speed: "AGI * 1000000" }) };
    expect(walkSpeedOf(10, fast)).toBe(0x10_0000);
    const zero = { ...c, formulas: combatFormulaSetFrom({ walk_speed: "0" }) };
    expect(walkSpeedOf(10, zero)).toBe(1);
  });
});

describe("전투맵 걸음(사용자 1265, D-553 — 2차맵과 같은 walk_speed 식)", () => {
  it("AGI 10 = 기본 간격 1초, AGI가 오르면 줄고 상한(기본 × 4)에서 멈춘다, 정수", () => {
    expect(battleMoveIntervalMs(BATTLE_BASE_MOVE_MS, 10, c)).toBe(1000);
    // 1000 × 437 ÷ 476 = 918.06…
    expect(battleMoveIntervalMs(BATTLE_BASE_MOVE_MS, 20, c)).toBe(918);
    expect(battleMoveIntervalMs(BATTLE_BASE_MOVE_MS, 100, c)).toBe(550);
    expect(battleMoveIntervalMs(BATTLE_BASE_MOVE_MS, 300, c)).toBe(275);
    expect(battleMoveIntervalMs(BATTLE_BASE_MOVE_MS, 10_000, c)).toBe(275);
    // AGI 0(아래 끝 397): 1000 × 437 ÷ 397 = 1100.7…
    expect(battleMoveIntervalMs(BATTLE_BASE_MOVE_MS, 0, c)).toBe(1100);
  });
});
