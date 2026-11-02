import { describe, expect, it } from "vitest";
import { TEST_COMBAT_COEFFICIENTS } from "./coefficients.ts";
import {
  type AttackProfile,
  type DefenseProfile,
  buildingDamage,
  evadeRelativePm,
  familyValue,
  matchupPm,
  resolveAttack,
  sightRadius,
  skillAttack,
  statPlusWeapon,
  weaponRatioPm,
  weaponScaled,
} from "./formula.ts";

const NO = Array.from({ length: 12 }, () => 0);
/** 12칸 속성값·계수(칸 번호 → 값). 칸 차례: 물 빙결 불 폭렬 바람 번개 땅 크리스탈 빛 성 어둠 사령 */
const cells = (entries: Readonly<Record<number, number>>): number[] =>
  NO.map((_, index) => entries[index] ?? 0);
const WATER = 0;
const FROST = 1;
const FIRE = 2;
const BLAZE = 3;
const WIND = 4;

/** 스탯 공격력 0 + 무기 100 × (STR 50 ÷ 적정 50) = 100. 명중·크리는 DEX 50 = 적정 50이라 무기 값 그대로 */
const attacker: AttackProfile = {
  kind: "physical",
  statAttack: 0,
  weaponAttack: 100,
  attackPrimary: 50,
  attackAppropriateMilli: 50_000,
  weaponHitPm: 900,
  weaponCritPm: 200,
  dex: 50,
  dexAppropriateMilli: 50_000,
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
  elementalDefenseRatePm: 0,
  evadePm: 100,
  elements: NO,
  resistPm: NO,
};
/** 방어가 없는 상대(속성값·저항도 없음) */
const open: DefenseProfile = { ...defender, defenseRatePm: 0, defenseFlat: 0 };
const c = TEST_COMBAT_COEFFICIENTS;
/** 맞고, 피하지 못하고, 크리 없음 */
const HIT = { hit: 0, evade: 9999, crit: 9999, critPos: 0 };
/** 크리가 난 공격(방어 없는 상대)의 피해, 자리 굴림만 바꾼다 */
const critAt = (critPos: number) => resolveAttack(attacker, open, { ...HIT, crit: 0, critPos }, c).amount;

describe("공격력 = 스탯 공격력 + 무기 몫(D-502, 사용자 답 296): 무기 몫 = 무기 값 × min(1, 1차 ÷ 적정)", () => {
  it("적정이면 1배, 넘어도 1배(N10 1000‰ — 보너스 없음), 모자라면 그 비율로 준다", () => {
    expect(weaponScaled(100, 50, 50_000)).toBe(100);
    expect(weaponScaled(100, 500, 50_000)).toBe(100);
    expect(weaponScaled(100, 25, 50_000)).toBe(50);
    // 적정이 없으면(0) 비율 100%
    expect(weaponScaled(100, 0, 0)).toBe(100);
    expect(weaponRatioPm(7, 0, 1000)).toBe(1000);
  });

  it("사용자 예: 새 사이보그(1차 모두 10) + 공격력 20·적정 STR 25 검 → 10 + 8 = 18, 맨손 → 10, Lv 30 균형형(39) → 39 + 20 = 59", () => {
    // 스탯 공격력 = (STR + VIT) ÷ 2 = 10
    expect(statPlusWeapon(10, 20, 10, 25_000)).toBe(18);
    expect(statPlusWeapon(10, 0, 10, 0)).toBe(10);
    expect(statPlusWeapon(39, 20, 39, 25_000)).toBe(59);
  });

  it("맨손 명중(사용자 답 297): Lv 1 적정 = 1 × 1.5 + 10 = 11.5 → 850‰ × 10 ÷ 11.5 = 738‰(약 74%)", () => {
    expect(weaponRatioPm(10, 11_500, 1000)).toBe(869);
    expect(weaponScaled(850, 10, 11_500)).toBe(738);
  });
});

describe("공격 한 번(D-419 두 번 굴림, D-421 상한 없음)", () => {
  it("물리: 실제 공격력 × (1 − 방어율) − 고정 방어, 속성 몫 없음", () => {
    // 100 × (1000 − 200)/1000 = 80 − 5 = 75
    expect(resolveAttack(attacker, defender, HIT, c)).toEqual({
      outcome: "hit",
      crit: false,
      physical: 75,
      elemental: 0,
      amount: 75,
    });
  });

  it("명중 굴림 → 회피 굴림: 명중 확률(무기 틀) 밖이면 빗나가고, 회피 확률 안이면 피한다", () => {
    // 명중 900‰ → 굴림 < 9000이면 맞음
    expect(resolveAttack(attacker, defender, { ...HIT, hit: 9000 }, c).outcome).toBe("miss");
    expect(resolveAttack(attacker, defender, { ...HIT, hit: 8999 }, c).outcome).toBe("hit");
    // 회피 100‰ → 굴림 < 1000이면 피함
    expect(resolveAttack(attacker, defender, { ...HIT, evade: 999 }, c).outcome).toBe("evaded");
    expect(resolveAttack(attacker, defender, { ...HIT, evade: 999 }, c).amount).toBe(0);
  });

  it("물리는 맞으면 최소 1(D-438 2)", () => {
    const tank = { ...defender, defenseRatePm: 1000, defenseFlat: 1000 };
    expect(resolveAttack(attacker, tank, HIT, c)).toEqual({
      outcome: "hit",
      crit: false,
      physical: 1,
      elemental: 0,
      amount: 1,
    });
    expect(resolveAttack({ ...attacker, weaponAttack: 0 }, defender, HIT, c).amount).toBe(1);
    // 빗나가면 0 그대로
    expect(resolveAttack(attacker, tank, { ...HIT, hit: 9999 }, c).amount).toBe(0);
  });

  it("크리 배율은 범위형: 최소~최소 + 500‰ 사이를 자리 굴림으로(N12)", () => {
    expect(critAt(0)).toBe(150);
    expect(critAt(5000)).toBe(175);
    expect(critAt(9999)).toBe(199);
  });

  it("회피 상대 보정(N11): 빠른 쪽이 더 피하고, 끝값에서 멈춘다", () => {
    expect(evadeRelativePm(60, 50, c)).toBe(60);
    expect(evadeRelativePm(500, 50, c)).toBe(400);
    expect(evadeRelativePm(25, 50, c)).toBe(-200);
    expect(evadeRelativePm(0, 50, c)).toBe(-300);
    expect(evadeRelativePm(10, 0, c)).toBe(400);
    // 회피 100‰ + 보정 60‰ = 160‰ → 굴림 1599까지 피함
    const quick = { ...defender, agi: 60 };
    const slow = { ...attacker, agi: 50 };
    expect(resolveAttack(slow, quick, { ...HIT, evade: 1599 }, c).outcome).toBe("evaded");
    expect(resolveAttack(slow, quick, { ...HIT, evade: 1600 }, c).outcome).toBe("hit");
  });

  it("방어 감소(②: 비율 → 고정) 뒤에 크리·스킬·버프를 곱한다 — 48 §4.8 계산 예 = 81", () => {
    // 실제 공격력 43, 방어율 180‰ → 35, 고정 방어 3 → 32, 크리 1700‰ → 54, 스킬 1500‰ → 81
    const strike: AttackProfile = { ...attacker, weaponAttack: 43, critMulPm: 1700, skillMulPm: 1500 };
    const hare: DefenseProfile = { ...defender, defenseRatePm: 180, defenseFlat: 3 };
    expect(resolveAttack(strike, hare, { ...HIT, crit: 0, critPos: 0 }, c)).toEqual({
      outcome: "hit",
      crit: true,
      physical: 81,
      elemental: 0,
      amount: 81,
    });
  });

  it("크리 확률도 무기 틀, 크리 배율에 상한이 없다", () => {
    // 크리 확률 200‰ → 굴림 1999까지 크리. (80 − 5) × 1.5 = 112
    expect(resolveAttack(attacker, defender, { ...HIT, crit: 1999 }, c)).toMatchObject({
      crit: true,
      physical: 112,
    });
    const huge = resolveAttack({ ...attacker, critMulPm: 1_000_000 }, open, { ...HIT, crit: 0 }, c);
    expect(huge.amount).toBe(100_000);
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

describe("물리 몫과 속성 몫(D-459, 48 §4.5a)", () => {
  /** 화염의 검(불 × 5% 옵션)을 든 불 5 유닛, 실제 물리 공격력 40 */
  const flameSword: AttackProfile = {
    ...attacker,
    weaponAttack: 40,
    elements: cells({ [FIRE]: 5 }),
    skillElementsPm: cells({ [FIRE]: 50 }),
  };

  it("48 §4.5a 예: P = 40, E = 40 × 25% = 10 → 바람 계열 6 → 13 → 속성 방어율 200‰ → 10", () => {
    const windy: DefenseProfile = {
      ...open,
      elementalDefenseRatePm: 200,
      elements: cells({ [WIND]: 6 }),
    };
    expect(resolveAttack(flameSword, windy, HIT, c)).toEqual({
      outcome: "hit",
      crit: false,
      physical: 40,
      elemental: 10,
      amount: 50,
    });
  });

  it("물리 방어(비율·고정)는 P에만, 속성 방어율은 E에만 걸린다", () => {
    const armored: DefenseProfile = { ...open, defenseRatePm: 500, defenseFlat: 4 };
    // P = 40 × 0.5 − 4 = 16, E = 10 그대로
    expect(resolveAttack(flameSword, armored, HIT, c)).toMatchObject({ physical: 16, elemental: 10 });
    const warded: DefenseProfile = { ...open, elementalDefenseRatePm: 500 };
    // P = 40 그대로, E = 10 × 0.5 = 5
    expect(resolveAttack(flameSword, warded, HIT, c)).toMatchObject({ physical: 40, elemental: 5 });
  });

  it("크리·스킬 배율·버프는 두 몫에 함께 곱한다", () => {
    const boosted: AttackProfile = { ...flameSword, skillMulPm: 2000, buffPm: 1500 };
    // 크리 1500‰ × 스킬 2000‰ × 버프 1500‰ = ×4.5 → P 180, E 45
    expect(resolveAttack(boosted, open, { ...HIT, crit: 0, critPos: 0 }, c)).toMatchObject({
      crit: true,
      physical: 180,
      elemental: 45,
    });
  });

  it("속성 몫은 저항으로 0까지(물리 몫은 최소 1 그대로), 약점(음수 저항)은 키운다", () => {
    const immune: DefenseProfile = { ...open, resistPm: cells({ [FIRE]: 1000 }) };
    expect(resolveAttack(flameSword, immune, HIT, c)).toMatchObject({ physical: 40, elemental: 0 });
    const weak: DefenseProfile = { ...open, resistPm: cells({ [FIRE]: -500 }) };
    expect(resolveAttack(flameSword, weak, HIT, c)).toMatchObject({ elemental: 15 });
  });

  it("속성 무기: 전부 속성 몫, E = 실제 속성 공격력 × (1 + Σ 칸 계수 × 칸 값)", () => {
    // 불 × 10% 지팡이, 불 5 → +50%. 실제 속성 공격력 100 → 150, 물리 몫 0(최소 1 없음)
    const staff: AttackProfile = {
      ...attacker,
      kind: "elemental",
      elements: cells({ [FIRE]: 5 }),
      skillElementsPm: cells({ [FIRE]: 100 }),
    };
    expect(resolveAttack(staff, open, HIT, c)).toEqual({
      outcome: "hit",
      crit: false,
      physical: 0,
      elemental: 150,
      amount: 150,
    });
    // 물리 방어는 속성 무기에 걸리지 않는다
    expect(resolveAttack(staff, { ...open, defenseRatePm: 900, defenseFlat: 50 }, HIT, c).elemental).toBe(
      150,
    );
  });

  it("공격은 칸마다 따로(D-457): 빙결 × 5% 스킬은 빙결 값만, 물 × 5% + 빙결 × 5%는 15% + 15%", () => {
    const base: AttackProfile = {
      ...attacker,
      kind: "elemental",
      elements: cells({ [WATER]: 3, [FROST]: 3 }),
    };
    expect(resolveAttack({ ...base, skillElementsPm: cells({ [FROST]: 50 }) }, open, HIT, c).elemental).toBe(
      115,
    );
    expect(
      resolveAttack({ ...base, skillElementsPm: cells({ [WATER]: 50, [FROST]: 50 }) }, open, HIT, c)
        .elemental,
    ).toBe(130);
  });

  it("방어는 계열 값(기본 + 강화, 1:1, D-457): 물 3·빙결 3 → 물 계열 6", () => {
    expect(familyValue(cells({ [WATER]: 3, [FROST]: 3 }), 0)).toBe(6);
    expect(familyValue(cells({ [FIRE]: 10, [BLAZE]: 10 }), 1)).toBe(20);
    // 불이 물 계열 6을 치면 −0.05 × 6 = −30% → 100 × 0.7 = 70
    const fire: AttackProfile = { ...attacker, kind: "elemental", skillElementsPm: cells({ [FIRE]: 100 }) };
    const wet: DefenseProfile = { ...open, elements: cells({ [WATER]: 3, [FROST]: 3 }) };
    expect(resolveAttack(fire, wet, HIT, c).elemental).toBe(70);
  });

  it("같은 계열 내성 −0.03(C10, D-459): 불 계열 20이면 불 공격을 60% 덜 받는다", () => {
    const fire: AttackProfile = { ...attacker, kind: "elemental", skillElementsPm: cells({ [FIRE]: 100 }) };
    const hot: DefenseProfile = { ...open, elements: cells({ [FIRE]: 10, [BLAZE]: 10 }) };
    expect(matchupPm(fire.skillElementsPm, hot.elements, c)).toBe(-600);
    expect(resolveAttack(fire, hot, HIT, c).elemental).toBe(40);
  });

  it("다중 속성 상성은 스킬 계수 비중으로 평균(D-5014): 불 10% + 물 10%로 바람 6·불 4 → 불 +0.18, 물 +0.20, 평균 +0.19", () => {
    const coefs = cells({ [WATER]: 100, [FIRE]: 100 });
    const target = cells({ [WIND]: 6, [FIRE]: 4 });
    expect(matchupPm(coefs, target, c)).toBe(190);
    const hybrid: AttackProfile = { ...attacker, kind: "elemental", skillElementsPm: coefs };
    expect(resolveAttack(hybrid, { ...open, elements: target }, HIT, c).elemental).toBe(119);
  });

  it("방어 상성은 0 아래로 내려가지 않는다(하한 0, D-421): 계열 값 20인 상극은 무력화", () => {
    const fire: AttackProfile = { ...attacker, kind: "elemental", skillElementsPm: cells({ [FIRE]: 100 }) };
    // 불 → 물 계열 20: −0.05 × 20 = −100% → 0
    const drenched: DefenseProfile = { ...open, elements: cells({ [WATER]: 10, [FROST]: 10 }) };
    expect(resolveAttack(fire, drenched, HIT, c)).toMatchObject({ physical: 0, elemental: 0, amount: 0 });
  });

  it("스킬 속성 계수는 무기 옵션에 칸마다 더한다(하이브리드는 더함): 물리 스킬도 속성 몫을 낸다", () => {
    const fireSlash = {
      damage: "physical" as const,
      base: "physical" as const,
      attackMulPm: 1000,
      weaponAdd: 0,
      penetrationPm: 0,
    };
    const merged = skillAttack(flameSword, { ...fireSlash, elementPm: cells({ [FIRE]: 50, [WIND]: 30 }) });
    expect(merged.kind).toBe("physical");
    expect(merged.skillElementsPm).toEqual(cells({ [FIRE]: 100, [WIND]: 30 }));
    // 불 5 × 100‰ = +50% → E = 40 × 0.5 = 20 (바람 칸 값 0이라 가산 없음, 상성은 상대 속성값이 없어 0)
    expect(resolveAttack(merged, open, HIT, c)).toMatchObject({ physical: 40, elemental: 20 });
    // 속성 기반: 받은 사양(여기서는 그 사양의 무기 옵션 불 × 5%)의 종류를 속성으로, 전부 속성 몫
    const bolt = skillAttack(flameSword, {
      ...fireSlash,
      damage: "elemental",
      base: "elemental",
      elementPm: cells({}),
    });
    expect(resolveAttack(bolt, open, HIT, c)).toMatchObject({ physical: 0, elemental: 50 });
  });

  it("아주 큰 값도 안전 정수 안에서 끝난다", () => {
    const giant = resolveAttack(
      {
        ...flameSword,
        weaponAttack: 1_000_000,
        statAttack: 10_000_000,
        skillMulPm: 1_000_000,
        buffPm: 1_000_000,
        critMulPm: 1_000_000,
        elements: cells({ [FIRE]: 10 }),
        skillElementsPm: cells({ [FIRE]: 100_000 }),
      },
      open,
      { ...HIT, crit: 0 },
      c,
    );
    expect(Number.isSafeInteger(giant.physical)).toBe(true);
    expect(Number.isSafeInteger(giant.elemental)).toBe(true);
    expect(Number.isSafeInteger(giant.amount)).toBe(true);
  });
});
