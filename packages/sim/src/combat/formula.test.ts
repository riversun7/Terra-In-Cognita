import { describe, expect, it } from "vitest";
import { TEST_COMBAT_COEFFICIENTS } from "./coefficients.ts";
import {
  type AttackProfile,
  type DefenseProfile,
  buildingDamage,
  computeDamage,
  sightRadius,
} from "./formula.ts";

const NO_ELEMENTS = Array.from({ length: 12 }, () => 0);
const attacker: AttackProfile = {
  attack: 100,
  kind: "physical",
  penetrationPm: 0,
  critChanceBp: 0,
  critMulPm: 1500,
  skillMulPm: 1000,
  buffPm: 1000,
  elements: NO_ELEMENTS,
  skillElementsPm: NO_ELEMENTS,
};
const defender: DefenseProfile = { defenseRatioPm: 200, defenseFlat: 5, elements: NO_ELEMENTS };

describe("피해 공식(D-178 6축 곱, 천분율 정수)", () => {
  it("물리: 비율 방어(관통이 줄임) → 고정 방어 → 크리·스킬·버프 곱", () => {
    // 100 × (1000 − 200)/1000 = 80 → − 5 = 75
    expect(computeDamage(attacker, defender, 9999, TEST_COMBAT_COEFFICIENTS)).toEqual({
      amount: 75,
      crit: false,
    });
    // 관통 150 → 비율 50 → 95 − 5 = 90
    expect(
      computeDamage({ ...attacker, penetrationPm: 150 }, defender, 9999, TEST_COMBAT_COEFFICIENTS).amount,
    ).toBe(90);
    // 크리(굴림 < 확률): 75 기준 곱은 고정 방어 앞(공격 쪽 배율)이라 100 × 0.8 × 1.5 = 120 − 5 = 115
    expect(
      computeDamage({ ...attacker, critChanceBp: 5000 }, defender, 4999, TEST_COMBAT_COEFFICIENTS),
    ).toEqual({ amount: 115, crit: true });
    expect(
      computeDamage({ ...attacker, critChanceBp: 5000 }, defender, 5000, TEST_COMBAT_COEFFICIENTS).crit,
    ).toBe(false);
  });

  it("최소 피해는 1이고, 배율은 축마다 상한(하드캡)이 있다", () => {
    expect(
      computeDamage(
        { ...attacker, attack: 3 },
        { ...defender, defenseFlat: 50 },
        9999,
        TEST_COMBAT_COEFFICIENTS,
      ).amount,
    ).toBe(1);
    const capped = computeDamage(
      { ...attacker, skillMulPm: 1_000_000 },
      { ...defender, defenseRatioPm: 0, defenseFlat: 0 },
      9999,
      TEST_COMBAT_COEFFICIENTS,
    );
    expect(capped.amount).toBe((100 * TEST_COMBAT_COEFFICIENTS.caps.skillPm) / 1000);
  });

  it("속성: 공격 가산 + 방어 상성(계열 표), 하한 0.25배", () => {
    const fire = [...NO_ELEMENTS];
    fire[2] = 5; // 불(기본형) 5점
    const skill = [...NO_ELEMENTS];
    skill[2] = 100; // 불 1점당 +10%
    const elemental: AttackProfile = {
      ...attacker,
      kind: "elemental",
      elements: fire,
      skillElementsPm: skill,
    };
    // 속성 항 = 1000 + 5 × 100 = 1500, 방어자 속성 없음 → 100 × 1.5 = 150 (속성 공격은 비율·고정 방어를 거치지 않는다)
    expect(computeDamage(elemental, defender, 9999, TEST_COMBAT_COEFFICIENTS).amount).toBe(150);
    // 방어자 바람 계열 4점(바람 2 + 번개 1 × 2): 불 → 바람 rate +50 → +200 → 1700
    const wind = [...NO_ELEMENTS];
    wind[4] = 2;
    wind[5] = 1;
    expect(
      computeDamage(elemental, { ...defender, elements: wind }, 9999, TEST_COMBAT_COEFFICIENTS).amount,
    ).toBe(170);
  });

  it("건물은 물리 피해 × 건물 배율만 받는다(D-5043)", () => {
    expect(buildingDamage(attacker, 2000, TEST_COMBAT_COEFFICIENTS)).toBe(200);
    expect(buildingDamage({ ...attacker, kind: "elemental" }, 2000, TEST_COMBAT_COEFFICIENTS)).toBe(0);
  });

  it("시야 반지름 = 기본 + ⌊(WIS × a + AGI × b) ÷ 1000⌋ + 높이 보너스(상한)", () => {
    const c = TEST_COMBAT_COEFFICIENTS;
    expect(sightRadius(20, 10, 0, c)).toBe(
      c.sight.base + Math.floor((20 * c.sight.wisPm + 10 * c.sight.agiPm) / 1000),
    );
    expect(sightRadius(0, 0, c.sight.heightUnit * 100, c)).toBe(c.sight.base + c.sight.heightCap);
    expect(sightRadius(0, 0, -5, c)).toBe(c.sight.base);
  });
});
