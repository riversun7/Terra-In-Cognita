import { describe, expect, it } from "vitest";
import { TEST_COMBAT_CATALOG, UNARMED, UNARMED_ELEMENTAL } from "./catalog.ts";
import { TEST_STAT_TABLE, computeSecondary } from "./stats.ts";
import { type WeaponSpec, specFromStats } from "./unitSpec.ts";

const weaponOf = (id: string): WeaponSpec => {
  const weapon = TEST_COMBAT_CATALOG.equipment.find((item) => item.id === id)?.weapon;
  if (!weapon) throw new Error(`fixture ${id}`);
  return weapon;
};
const primaries = { str: 30, dex: 20, agi: 20, vit: 20, int: 12, wis: 14 };
const stats = computeSecondary(primaries, TEST_STAT_TABLE);
const body = (weapon: WeaponSpec) =>
  specFromStats({ id: 1, side: 1, party: 1, x: 0, y: 0, stats, weapon, moveIntervalMs: 1000, primaries });

describe("스킬 기반(D-463 211): 물리 기반은 물리 무기, 속성 기반은 속성 무기(없으면 맨손 속성)와 속성 공격력", () => {
  it("칼을 들면: 물리 기반 = 칼과 물리 공격력, 속성 기반 = 맨손 속성 자료와 속성 공격력(m.atk)", () => {
    const sword = weaponOf("test_sword");
    const spec = body(sword);
    expect(spec.attack.kind).toBe("physical");
    expect(spec.skillAttack?.physical).toEqual(spec.attack);
    const elemental = spec.skillAttack?.elemental;
    expect(elemental?.kind).toBe("elemental");
    expect(elemental?.weaponAttack).toBe(UNARMED_ELEMENTAL.attack);
    expect(elemental?.attackAppropriate).toBe(UNARMED_ELEMENTAL.attackAppropriate);
    expect(elemental?.attackStat).toBe(stats.elemental_attack);
    expect(elemental?.skillElementsPm.every((pm) => pm === 0)).toBe(true);
  });

  it("지팡이를 들면: 속성 기반 = 지팡이(옵션 계수 그대로), 물리 기반 = 맨손과 물리 공격력", () => {
    const staff = weaponOf("test_staff");
    const spec = body(staff);
    expect(spec.skillAttack?.elemental).toEqual(spec.attack);
    expect(spec.skillAttack?.elemental.skillElementsPm[2]).toBe(100);
    const physical = spec.skillAttack?.physical;
    expect(physical?.kind).toBe("physical");
    expect(physical?.weaponAttack).toBe(UNARMED.attack);
    expect(physical?.attackStat).toBe(stats.physical_attack);
  });

  it("유닛 종류의 타고난 무기를 주면 그것을 쓴다(D-436)", () => {
    const breath: WeaponSpec = { ...UNARMED_ELEMENTAL, attack: 40 };
    const spec = specFromStats({
      id: 1,
      side: 1,
      party: 1,
      x: 0,
      y: 0,
      stats,
      weapon: weaponOf("test_sword"),
      naturalElementalWeapon: breath,
      moveIntervalMs: 1000,
    });
    expect(spec.skillAttack?.elemental.weaponAttack).toBe(40);
  });
});
