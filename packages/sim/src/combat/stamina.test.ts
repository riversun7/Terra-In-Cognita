// 스태미나 적정 스탯 개념(D-511) — docs/adr/2026-10-31-combat-core.md "바뀜 (274 스태미나 적정 스탯 개념)".
// 보통 유닛(1차 처음 모두 10, 성장률 100‰ × K 1)은 어느 레벨이든 소모·회복 배율이 1이고, 시험 자료(팩과 같은 값)의 모든 무기로
// 기본 공격을 이어 칠 수 있다(초당 회복 ≥ 초당 소모). 스킬을 쿨타임마다 더 쓰면 줄어든다. 적정보다 STA 점수가 낮으면 빨리 줄어든다.
import { describe, expect, it } from "vitest";
import { TEST_COMBAT_CATALOG } from "./catalog.ts";
import { TEST_COMBAT_COEFFICIENTS, specStaminaCostMilli } from "./coefficients.ts";
import type { CombatUnitSpec } from "./battleTypes.ts";
import { type Primaries, computeSecondary, primaryAtLevel } from "./stats.ts";
import { type WeaponSpec, specFromStats } from "./unitSpec.ts";

const c = TEST_COMBAT_COEFFICIENTS;
const catalog = TEST_COMBAT_CATALOG;
const even = (value: number): Primaries => ({
  str: value,
  dex: value,
  agi: value,
  vit: value,
  int: value,
  wis: value,
});
/** 보통 유닛의 1차(레벨마다) */
const typical = (level: number): Primaries => even(primaryAtLevel(10, 100, 1000, level));

function unit(primaries: Primaries, level: number, weapon: WeaponSpec): CombatUnitSpec {
  return specFromStats(
    {
      id: 1,
      side: 1,
      party: 1,
      x: 0,
      y: 0,
      stats: computeSecondary(primaries, catalog.statTable, {}, {}, level),
      weapon,
      moveIntervalMs: 1000,
      primaries,
      level,
    },
    c,
  );
}

/** 기본 공격 한 번 소모(밀리점) */
const basicCost = (spec: CombatUnitSpec): number => specStaminaCostMilli(spec, spec.staminaCost, c);
/** 처음 스태미나를 다 쓴 뒤 분당 기본 공격 수(간격과 회복 가운데 작은 쪽) */
const sustainedPerMinute = (spec: CombatUnitSpec): number =>
  Math.min(60_000 / spec.attackIntervalMs, (spec.staminaRegen * 1000) / basicCost(spec));

const WEAPONS: readonly { readonly id: string; readonly weapon: WeaponSpec }[] = [
  ...catalog.equipment.flatMap((item) => (item.weapon ? [{ id: item.id, weapon: item.weapon }] : [])),
  ...catalog.unitKinds.map((kind) => ({ id: `natural_${kind.id}`, weapon: kind.naturalWeapon })),
];
const LEVELS = [1, 2, 10, 30, 60, 100];

describe("스태미나 적정 스탯 개념(D-511)", () => {
  it("보통 유닛은 어느 레벨이든 소모 = 기본 소모, 회복 = 2차 스탯 스태미나 회복(배율 1)", () => {
    const bare = catalog.unitKinds.find((kind) => kind.id === "human")?.naturalWeapon;
    if (!bare) throw new Error("human 타고난 무기 없음");
    for (const level of LEVELS) {
      const spec = unit(typical(level), level, bare);
      expect(spec.staminaAppropriateMilli).toBe(spec.staminaScore * 1000);
      expect(basicCost(spec)).toBe(spec.staminaCost * 1000);
      expect(spec.staminaRegen).toBe(720);
    }
  });

  it("보통 유닛은 Lv 1에서 모든 무기로 기본 공격을 이어 친다. 적정 AGI를 넘는 높은 레벨은 스태미나가 공격 수를 막는다", () => {
    expect(WEAPONS.length).toBeGreaterThan(5);
    for (const { id, weapon } of WEAPONS) {
      const spec = unit(typical(1), 1, weapon);
      // 분당 회복 × 간격(ms) ≥ 60 × 한 번 소모(밀리점) ⇔ 회복/초 ≥ 소모 ÷ 간격
      expect(spec.staminaRegen * spec.attackIntervalMs, `${id} Lv 1`).toBeGreaterThanOrEqual(
        60 * basicCost(spec),
      );
      expect(sustainedPerMinute(spec)).toBe(60_000 / spec.attackIntervalMs);
    }
    // 무기 간격은 AGI ÷ 적정 AGI의 제곱(2026-11-13, 적정 2배 상한)이라 레벨이 올라 AGI가 자라면 낮은 무기는 0.25배까지 빨라지고,
    // 그때는 스태미나(분당 회복 ÷ 한 번 소모)가 이어 치는 수를 정한다(질문 1258). 맨손(레벨 기준 AGI와 견줌)은 어느 레벨이든 이어진다
    for (const level of LEVELS)
      for (const { id, weapon } of WEAPONS) {
        const spec = unit(typical(level), level, weapon);
        expect(sustainedPerMinute(spec), `${id} Lv ${level}`).toBeLessThanOrEqual(
          60_000 / spec.attackIntervalMs,
        );
        if (weapon.unarmed === true)
          expect(sustainedPerMinute(spec), `${id} Lv ${level}`).toBe(60_000 / spec.attackIntervalMs);
      }
  });

  it("스태미나 스킬을 쿨타임마다 기본 공격과 함께 쓰면 줄어든다(Lv 30 검)", () => {
    const sword = catalog.equipment.find((item) => item.id === "test_sword")?.weapon;
    if (!sword) throw new Error("test_sword 없음");
    const spec = unit(typical(30), 30, sword);
    const skills = catalog.skills.filter(
      (skill) => skill.trigger === "active" && skill.resource === "stamina" && skill.cooldownMs > 0,
    );
    expect(skills.length).toBeGreaterThan(0);
    // 초당 밀리점: 기본 공격 + 스킬마다 소모 ÷ 쿨타임
    const spendPerSecond =
      (basicCost(spec) * 1000) / spec.attackIntervalMs +
      skills.reduce(
        (sum, skill) => sum + (specStaminaCostMilli(spec, skill.cost, c) * 1000) / skill.cooldownMs,
        0,
      );
    const regenPerSecond = (spec.staminaRegen * 1000) / 60;
    expect(spendPerSecond).toBeGreaterThan(regenPerSecond);
  });

  it("같은 1차라도 레벨이 높으면(적정 STA가 크면) 소모가 늘고 회복이 준다", () => {
    const sword = catalog.equipment.find((item) => item.id === "test_sword")?.weapon;
    if (!sword) throw new Error("test_sword 없음");
    const at30 = unit(even(39), 30, sword);
    const at60 = unit(even(39), 60, sword);
    expect(at30.staminaAppropriateMilli).toBe(39_000);
    expect(at60.staminaAppropriateMilli).toBe(69_000);
    // 10 × 69 ÷ 39 = 17.692, 720 × 39 ÷ 69 = 406
    expect(basicCost(at60)).toBe(17_690);
    expect(at60.staminaRegen).toBe(406);
    expect(sustainedPerMinute(at60)).toBeLessThan(sustainedPerMinute(at30) / 2);
  });

  it("STA 점수가 적정의 절반이면 소모 약 2배·회복 약 절반 → 이어 치는 수가 4분의 1 남짓", () => {
    const sword = catalog.equipment.find((item) => item.id === "test_sword")?.weapon;
    if (!sword) throw new Error("test_sword 없음");
    const full = unit(even(39), 30, sword);
    const half = unit({ ...even(39), agi: 19, vit: 19 }, 30, sword);
    expect(half.staminaScore).toBe(19);
    expect(basicCost(half)).toBe(20_520);
    expect(half.staminaRegen).toBe(350);
    // 적정의 2배를 넘는 AGI라 간격 250ms(분당 240번) → 스태미나가 분당 72번(720 ÷ 10)으로 막는다
    expect(sustainedPerMinute(full)).toBe(72);
    expect(sustainedPerMinute(half)).toBeLessThan(18);
  });

  it("적정보다 높은 STA 점수: 소모는 최소 소모(N13 500‰)까지, 회복은 2배까지", () => {
    const sword = catalog.equipment.find((item) => item.id === "test_sword")?.weapon;
    if (!sword) throw new Error("test_sword 없음");
    const strong = unit(even(200), 1, sword);
    expect(basicCost(strong)).toBe(5_000);
    expect(strong.staminaRegen).toBe(1_440);
  });
});
