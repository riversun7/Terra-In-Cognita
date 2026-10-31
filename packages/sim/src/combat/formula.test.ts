import { describe, expect, it } from "vitest";
import { TEST_COMBAT_COEFFICIENTS } from "./coefficients.ts";
import {
  type AttackProfile,
  type DefenseProfile,
  buildingDamage,
  elementTermPm,
  resolveAttack,
  sightRadius,
  weaponScaled,
} from "./formula.ts";

const NO = Array.from({ length: 12 }, () => 0);
const attacker: AttackProfile = {
  kind: "physical",
  weaponAttack: 100,
  attackStat: 50,
  attackAppropriate: 50,
  weaponHitPm: 900,
  hitStat: 500,
  hitAppropriate: 500,
  weaponCritPm: 200,
  critStat: 100,
  critAppropriate: 100,
  critMulPm: 1500,
  penetrationPm: 0,
  skillMulPm: 1000,
  buffPm: 1000,
  elements: NO,
  skillElementsPm: NO,
};
const defender: DefenseProfile = {
  defenseRatePm: 200,
  defenseFlat: 5,
  evadePm: 100,
  elements: NO,
  resistPm: NO,
};
const c = TEST_COMBAT_COEFFICIENTS;
/** 맞고, 피하지 못하고, 크리 없음 */
const HIT = { hit: 0, evade: 9999, crit: 9999 };

describe("무기 틀(D-420): 무기 값 × min(2, 유닛 값 ÷ 적정치)", () => {
  it("적정치면 1배, 넘으면 2배까지, 모자라면 약하다", () => {
    expect(weaponScaled(100, 50, 50)).toBe(100);
    expect(weaponScaled(100, 500, 50)).toBe(200);
    expect(weaponScaled(100, 25, 50)).toBe(50);
  });
});

describe("공격 한 번(D-419 두 번 굴림, D-421 상한 없음)", () => {
  it("물리: 실제 공격력 × (1 − 방어율) − 고정 방어", () => {
    // 100 × (1000 − 200)/1000 = 80 − 5 = 75
    expect(resolveAttack(attacker, defender, HIT, c)).toEqual({ outcome: "hit", crit: false, amount: 75 });
  });

  it("명중 굴림 → 회피 굴림: 명중 확률(무기 틀) 밖이면 빗나가고, 회피 확률 안이면 피한다", () => {
    // 명중 900‰ → 굴림 < 9000이면 맞음
    expect(resolveAttack(attacker, defender, { ...HIT, hit: 9000 }, c).outcome).toBe("miss");
    expect(resolveAttack(attacker, defender, { ...HIT, hit: 8999 }, c).outcome).toBe("hit");
    // 회피 100‰ → 굴림 < 1000이면 피함
    expect(resolveAttack(attacker, defender, { ...HIT, evade: 999 }, c).outcome).toBe("evaded");
    expect(resolveAttack(attacker, defender, { ...HIT, evade: 999 }, c).amount).toBe(0);
  });

  it("크리 확률도 무기 틀, 크리 배율에 상한이 없다", () => {
    expect(resolveAttack(attacker, defender, { ...HIT, crit: 1999 }, c)).toEqual({
      outcome: "hit",
      crit: true,
      amount: 115,
    });
    const huge = resolveAttack(
      { ...attacker, critMulPm: 1_000_000 },
      { ...defender, defenseRatePm: 0, defenseFlat: 0 },
      { ...HIT, crit: 0 },
      c,
    );
    expect(huge.amount).toBe(100_000);
  });

  it("속성: 저항이 1000‰이면 0으로 무력화되고, 계산은 넘치지 않는다", () => {
    const fire = [...NO];
    fire[2] = 5;
    const skill = [...NO];
    skill[2] = 100;
    const elemental: AttackProfile = {
      ...attacker,
      kind: "elemental",
      elements: fire,
      skillElementsPm: skill,
    };
    // 속성 항 1500 → 150, 저항 500‰ → 75, 1000‰ → 0
    const resist = (pm: number) => {
      const r = [...NO];
      r[2] = pm;
      return { ...defender, resistPm: r };
    };
    expect(resolveAttack(elemental, defender, HIT, c).amount).toBe(150);
    expect(resolveAttack(elemental, resist(500), HIT, c).amount).toBe(75);
    expect(resolveAttack(elemental, resist(1000), HIT, c).amount).toBe(0);
    // 아주 큰 값도 안전 정수 안에서 끝난다
    const giant = resolveAttack(
      {
        ...elemental,
        weaponAttack: 10_000_000,
        skillMulPm: 1_000_000,
        buffPm: 1_000_000,
        critMulPm: 1_000_000,
      },
      defender,
      { ...HIT, crit: 0 },
      c,
    );
    expect(Number.isSafeInteger(giant.amount)).toBe(true);
  });

  it("속성 항은 0 아래로 내려가지 않는다(하한 0.25 거둠, D-421)", () => {
    const skill = [...NO];
    skill[2] = 100;
    const fire: AttackProfile = { ...attacker, kind: "elemental", skillElementsPm: skill };
    // 불 계열이 물 계열(물 10·서리 10)을 치면 상성 −50 × (10 + 20) = −1500 → 1000 − 1500 → 0
    const water = [...NO];
    water[0] = 10;
    water[1] = 10;
    const wet = { ...defender, elements: water };
    expect(elementTermPm(fire, wet, c)).toBe(0);
    expect(resolveAttack(fire, wet, HIT, c)).toEqual({ outcome: "hit", crit: false, amount: 0 });
  });

  it("건물은 물리 실제 공격력 × 건물 배율만 받는다(D-5043)", () => {
    expect(buildingDamage(attacker, 2000, c)).toBe(200);
    expect(buildingDamage({ ...attacker, kind: "elemental" }, 2000, c)).toBe(0);
  });

  it("시야 = 스탯 시야 + 높이 보너스(상한)", () => {
    expect(sightRadius(12, 0, c)).toBe(12);
    expect(sightRadius(12, c.sight.heightUnit * 100, c)).toBe(12 + c.sight.heightCap);
  });
});
