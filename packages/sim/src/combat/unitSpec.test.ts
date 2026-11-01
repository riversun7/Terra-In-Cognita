import { describe, expect, it } from "vitest";
import { TEST_COMBAT_CATALOG, UNARMED as UNARMED_PHYSICAL, UNARMED_ELEMENTAL } from "./catalog.ts";
import { itemAt, loadoutOf } from "./equipment.ts";
import { skillUsable } from "./skills.ts";
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

const fire = (pm: number): number[] => Array.from({ length: 12 }, (_, i) => (i === 2 ? pm : 0));
/** 두 칸 무기(마검, D-465): 물리 25·적정 45, 속성 30·적정 50, 불 옵션 50 */
const magicSword = (basic: "physical" | "elemental"): WeaponSpec => ({
  ...weaponOf("test_sword"),
  physical: { attack: 25, attackAppropriate: 45 },
  elemental: { attack: 30, attackAppropriate: 50 },
  basic,
  skillElementsPm: fire(50),
});

describe("스킬은 든 무기의 공격력 칸으로 센다(D-465), 맞는 칸이 없으면 쓸 수 없다(D-490)", () => {
  it("칼(물리 칸만): 물리 기반 = 칼 물리 값과 물리 공격력. 스킬용 무기 칸은 물리뿐", () => {
    const spec = body(weaponOf("test_sword"));
    expect(spec.attack.kind).toBe("physical");
    const physical = spec.skillAttack?.physical;
    expect([physical?.kind, physical?.weaponAttack, physical?.attackAppropriate]).toEqual([
      "physical",
      20,
      40,
    ]);
    expect(physical?.attackStat).toBe(stats.physical_attack);
    expect(spec.weaponFields).toEqual(["physical"]);
  });

  it("불 지팡이(속성 칸만): 속성 기반 = 지팡이(옵션 계수 그대로). 스킬용 무기 칸은 속성뿐", () => {
    const spec = body(weaponOf("test_staff"));
    const elemental = spec.skillAttack?.elemental;
    expect([elemental?.kind, elemental?.weaponAttack, elemental?.attackAppropriate]).toEqual([
      "elemental",
      18,
      40,
    ]);
    expect(elemental?.skillElementsPm[2]).toBe(100);
    expect(spec.weaponFields).toEqual(["elemental"]);
  });

  it("두 칸 마검: 물리 기반(강타) = 마검 물리 값과 물리 공격력, 속성 기반(화염구) = 마검 속성 값과 속성 공격력", () => {
    const spec = body(magicSword("physical"));
    const physical = spec.skillAttack?.physical;
    expect([physical?.kind, physical?.weaponAttack, physical?.attackAppropriate]).toEqual([
      "physical",
      25,
      45,
    ]);
    expect(physical?.attackStat).toBe(stats.physical_attack);
    const elemental = spec.skillAttack?.elemental;
    expect([elemental?.kind, elemental?.weaponAttack, elemental?.attackAppropriate]).toEqual([
      "elemental",
      30,
      50,
    ]);
    expect(elemental?.attackStat).toBe(stats.elemental_attack);
    // 무기 옵션 계수는 두 칸이 같이 쓴다(물리 = 옵션 속성 몫, 속성 = 가산 계수, 48 §4.5a)
    expect(physical?.skillElementsPm[2]).toBe(50);
    expect(elemental?.skillElementsPm[2]).toBe(50);
    expect(spec.weaponFields).toEqual(["physical", "elemental"]);
  });

  it("맨손 스킬은 늘 유닛 종류의 타고난 무기·맨손 속성 자료로 센다(든 무기의 옵션 계수는 붙지 않는다)", () => {
    const breath: WeaponSpec = { ...UNARMED_ELEMENTAL, elemental: { attack: 40, attackAppropriate: 20 } };
    const spec = specFromStats({
      id: 1,
      side: 1,
      party: 1,
      x: 0,
      y: 0,
      stats,
      weapon: weaponOf("test_staff"),
      naturalElementalWeapon: breath,
      moveIntervalMs: 1000,
    });
    expect(spec.bareHandAttack?.elemental.weaponAttack).toBe(40);
    expect(spec.bareHandAttack?.elemental.skillElementsPm.every((pm) => pm === 0)).toBe(true);
    expect([spec.bareHandAttack?.physical.weaponAttack, spec.bareHandAttack?.physical.attackStat]).toEqual([
      5,
      stats.physical_attack,
    ]);
  });
});

const skill = (
  base: "physical" | "elemental",
  extra: { weaponField?: "physical" | "elemental" | "any"; bareHand?: boolean } = {},
) => ({ weaponField: extra.weaponField ?? base, bareHand: extra.bareHand === true });
const fields = (weapon: WeaponSpec, bareHanded = false) =>
  specFromStats({
    id: 1,
    side: 1,
    party: 1,
    x: 0,
    y: 0,
    stats,
    weapon,
    bareHanded,
    moveIntervalMs: 1000,
  });

describe("맨손으로는 스킬을 쓸 수 없다(D-490, 맨손 스킬 제외)", () => {
  it("필요한 칸이 든 무기에 있어야 쓴다: 칼 = 물리 스킬만, 지팡이 = 속성 스킬만, 마검 = 둘 다", () => {
    const sword = fields(weaponOf("test_sword"));
    const staff = fields(weaponOf("test_staff"));
    const both = fields(magicSword("physical"));
    expect([skillUsable(sword, skill("physical")), skillUsable(sword, skill("elemental"))]).toEqual([
      true,
      false,
    ]);
    expect([skillUsable(staff, skill("physical")), skillUsable(staff, skill("elemental"))]).toEqual([
      false,
      true,
    ]);
    expect([skillUsable(both, skill("physical")), skillUsable(both, skill("elemental"))]).toEqual([
      true,
      true,
    ]);
  });

  it("맨손이면 맨손 스킬만 쓴다. 필요한 칸 any는 칸이 하나라도 있는 무기면 된다", () => {
    const bare = fields(UNARMED_PHYSICAL, true);
    expect(bare.weaponFields).toEqual([]);
    expect(skillUsable(bare, skill("physical"))).toBe(false);
    expect(skillUsable(bare, skill("elemental", { weaponField: "any" }))).toBe(false);
    expect(skillUsable(bare, skill("physical", { bareHand: true }))).toBe(true);
    expect(skillUsable(fields(weaponOf("test_staff")), skill("physical", { weaponField: "any" }))).toBe(true);
    // 칸 목록이 없는 사양(시험 유닛·옛 스냅숏)은 모든 스킬을 쓴다
    expect(skillUsable({}, skill("elemental"))).toBe(true);
  });

  it("장비: 무기가 없으면 맨손, 타고난 무기를 무기로 치는 종류(크리쳐 발톱)는 맨손이 아니다", () => {
    const base = { str: 10, dex: 10, agi: 10, vit: 10, int: 10, wis: 10 };
    const sword = TEST_COMBAT_CATALOG.equipment.find((item) => item.id === "test_sword");
    if (!sword) throw new Error("fixture");
    const human = { base, slots: ["weapon"] as const, table: TEST_STAT_TABLE, unarmed: UNARMED_PHYSICAL };
    expect(loadoutOf({ ...human, equipped: [null] }).bareHanded).toBe(true);
    expect(loadoutOf({ ...human, equipped: [itemAt(sword, 500)] }).bareHanded).toBe(false);
    const creature = TEST_COMBAT_CATALOG.unitKinds.find((kind) => kind.id === "creature");
    expect(creature?.naturalWeaponIsWeapon).toBe(true);
    expect(TEST_COMBAT_CATALOG.unitKinds.find((kind) => kind.id === "human")?.naturalWeaponIsWeapon).toBe(
      false,
    );
    expect(
      loadoutOf({
        base,
        slots: [],
        equipped: [],
        table: TEST_STAT_TABLE,
        unarmed: UNARMED_PHYSICAL,
        naturalIsWeapon: true,
      }).bareHanded,
    ).toBe(false);
  });
});

describe("기본 공격(스킬 없음)의 칸(질문 235 가)", () => {
  it("한 칸 무기는 그 칸: 칼 = 물리, 지팡이 = 속성", () => {
    expect([
      body(weaponOf("test_sword")).attack.kind,
      body(weaponOf("test_sword")).attack.weaponAttack,
    ]).toEqual(["physical", 20]);
    expect([
      body(weaponOf("test_staff")).attack.kind,
      body(weaponOf("test_staff")).attack.weaponAttack,
    ]).toEqual(["elemental", 18]);
  });

  it("두 칸 무기는 무기 자료가 적은 칸(basic)으로 친다", () => {
    const physical = body(magicSword("physical")).attack;
    expect([physical.kind, physical.weaponAttack, physical.attackStat]).toEqual([
      "physical",
      25,
      stats.physical_attack,
    ]);
    const elemental = body(magicSword("elemental")).attack;
    expect([elemental.kind, elemental.weaponAttack, elemental.attackStat]).toEqual([
      "elemental",
      30,
      stats.elemental_attack,
    ]);
    // 스킬 쪽은 기본 공격 칸과 상관없이 같다
    expect(body(magicSword("elemental")).skillAttack).toEqual(body(magicSword("physical")).skillAttack);
  });

  it("공격력 칸이 없거나 basic이 없는 칸을 가리키면 RangeError(팩 검사가 먼저 막는 값)", () => {
    const { physical: _drop, ...noField } = weaponOf("test_sword");
    expect(() => body(noField)).toThrow(RangeError);
    expect(() => body({ ...weaponOf("test_sword"), basic: "elemental" })).toThrow(RangeError);
  });
});
