import { describe, expect, it } from "vitest";
import { TEST_COMBAT_CATALOG, UNARMED as UNARMED_PHYSICAL, UNARMED_ELEMENTAL } from "./catalog.ts";
import { TEST_COMBAT_COEFFICIENTS } from "./coefficients.ts";
import { itemAt, loadoutOf } from "./equipment.ts";
import { realAttackOf, realCritPm, realHitPm } from "./formula.ts";
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
/** 두 칸 무기(마검, D-465): 물리 25·적정 STR 45, 속성 30·적정 INT 50(D-502 몫마다 하나), 불 옵션 50 */
const magicSword = (basic: "physical" | "elemental"): WeaponSpec => ({
  ...weaponOf("test_sword"),
  physical: { attack: 25 },
  elemental: { attack: 30 },
  appropriate: { str: 45, int: 50, dex: 12, agi: 12 },
  basic,
  skillElementsPm: fire(50),
});

describe("스킬은 든 무기의 공격력 칸으로 센다(D-465), 맞는 칸이 없으면 쓸 수 없다(D-490)", () => {
  it("칼(물리 칸만): 물리 기반 = 칼 물리 값과 물리 공격력. 스킬용 무기 칸은 물리뿐", () => {
    const spec = body(weaponOf("test_sword"));
    expect(spec.attack.kind).toBe("physical");
    const physical = spec.skillAttack?.physical;
    expect([physical?.kind, physical?.weaponAttack, physical?.attackAppropriateMilli]).toEqual([
      "physical",
      20,
      25_000,
    ]);
    expect(physical?.statAttack).toBe(stats.physical_attack);
    expect(physical?.attackPrimary).toBe(primaries.str);
    expect(spec.weaponFields).toEqual(["physical"]);
  });

  it("불 지팡이(속성 칸만): 속성 기반 = 지팡이(옵션 계수 그대로). 스킬용 무기 칸은 속성뿐", () => {
    const spec = body(weaponOf("test_staff"));
    const elemental = spec.skillAttack?.elemental;
    expect([elemental?.kind, elemental?.weaponAttack, elemental?.attackAppropriateMilli]).toEqual([
      "elemental",
      18,
      23_000,
    ]);
    expect(elemental?.attackPrimary).toBe(primaries.int);
    expect(elemental?.skillElementsPm[2]).toBe(100);
    expect(spec.weaponFields).toEqual(["elemental"]);
  });

  it("두 칸 마검: 물리 기반(강타) = 마검 물리 값과 물리 공격력, 속성 기반(화염구) = 마검 속성 값과 속성 공격력", () => {
    const spec = body(magicSword("physical"));
    const physical = spec.skillAttack?.physical;
    expect([physical?.kind, physical?.weaponAttack, physical?.attackAppropriateMilli]).toEqual([
      "physical",
      25,
      45_000,
    ]);
    expect(physical?.statAttack).toBe(stats.physical_attack);
    const elemental = spec.skillAttack?.elemental;
    expect([elemental?.kind, elemental?.weaponAttack, elemental?.attackAppropriateMilli]).toEqual([
      "elemental",
      30,
      50_000,
    ]);
    expect(elemental?.statAttack).toBe(stats.elemental_attack);
    // 무기 옵션 계수는 두 칸이 같이 쓴다(물리 = 옵션 속성 몫, 속성 = 가산 계수, 48 §4.5a)
    expect(physical?.skillElementsPm[2]).toBe(50);
    expect(elemental?.skillElementsPm[2]).toBe(50);
    expect(spec.weaponFields).toEqual(["physical", "elemental"]);
  });

  it("맨손 스킬은 늘 유닛 종류의 타고난 무기·맨손 속성 자료로 센다(든 무기의 옵션 계수는 붙지 않는다)", () => {
    // 맨손이 아닌 타고난 속성 자료(크리쳐 숨결 같은): 무기 몫이 있다
    const breath: WeaponSpec = { ...UNARMED_ELEMENTAL, unarmed: false, elemental: { attack: 40 } };
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
    // 사람형 맨손: 무기 몫 0, 스탯 공격력만(D-502)
    expect([spec.bareHandAttack?.physical.weaponAttack, spec.bareHandAttack?.physical.statAttack]).toEqual([
      0,
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
    expect([physical.kind, physical.weaponAttack, physical.statAttack]).toEqual([
      "physical",
      25,
      stats.physical_attack,
    ]);
    const elemental = body(magicSword("elemental")).attack;
    expect([elemental.kind, elemental.weaponAttack, elemental.statAttack]).toEqual([
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

/** 1차 6개가 모두 value인 유닛 */
const all = (value: number) => ({ str: value, dex: value, agi: value, vit: value, int: value, wis: value });

/** 1차·무기·레벨 → 전투 사양 */
const specOf = (p: ReturnType<typeof all>, weapon: WeaponSpec, level = 1) =>
  specFromStats({
    id: 1,
    side: 1,
    party: 1,
    x: 0,
    y: 0,
    stats: computeSecondary(p, TEST_STAT_TABLE),
    weapon,
    primaries: p,
    level,
    moveIntervalMs: 1000,
  });

/** 1차 모두 10에 AGI만 바꾼 맨손 유닛의 기본 공격 간격(ms) */
const bareIntervalAt = (agi: number, level = 1): number =>
  specOf({ ...all(10), agi }, UNARMED_PHYSICAL, level).attackIntervalMs;

describe("공격력 = 스탯 공격력 + 무기 몫, 명중·크리 DEX, 공격 간격 AGI(D-502, 사용자 답 296~298)", () => {
  const c = TEST_COMBAT_COEFFICIENTS;
  /** 사용자 예의 검: 공격력 20·적정 STR 25(명중·크리·간격 적정은 [임시] DEX·AGI 12) */
  const sword = weaponOf("test_sword");

  it("스탯 공격력 = STR + ⌊VIT ÷ 2⌋(2026-11-13 맨손 기본 공격력 B2)·INT + ⌊WIS ÷ 2⌋(답 1257)", () => {
    const stat = computeSecondary({ str: 11, dex: 0, agi: 0, vit: 20, int: 7, wis: 8 }, TEST_STAT_TABLE);
    expect(stat.physical_attack).toBe(21);
    expect(stat.elemental_attack).toBe(11);
  });

  it("새 사이보그(1차 모두 10) + 검: 15 + 20 × 10/25 = 23, 명중 900 × 833‰ = 749‰, 크리 100 × 10/12 = 83‰, 간격 1000 ÷ 0.833² = 1,443ms", () => {
    const spec = specOf(all(10), sword);
    expect(realAttackOf(spec.attack, c.appropriateCapPm, c)).toBe(23);
    expect(realHitPm(spec.attack, c)).toBe(749);
    expect(realCritPm(spec.attack, c)).toBe(83);
    expect(spec.attackIntervalMs).toBe(1443);
  });

  it('새 사이보그 맨손: 공격력 15(STR + ⌊VIT ÷ 2⌋, 무기 몫 0), 명중 늘 1000‰(사용자 결정 2026-11-12 "맨손 항상 100%", 전에는 850 × 10/11.5 = 738‰)', () => {
    const spec = specOf(all(10), UNARMED_PHYSICAL);
    expect(realAttackOf(spec.attack, c.appropriateCapPm, c)).toBe(15);
    expect(realHitPm(spec.attack, c)).toBe(1000);
    // DEX가 아주 낮거나 레벨이 높아도(맨손 적정 55) 늘 맞는다 — 빗나감은 방어자 회피 굴림만
    expect(realHitPm(specOf({ ...all(10), dex: 1 }, UNARMED_PHYSICAL, 30).attack, c)).toBe(1000);
  });

  it('맨손 크리 = AGI + DEX ‰(사용자 결정 2026-11-12 "10,10이면 2%"), 명중 100%', () => {
    // AGI 10·DEX 10 → 20‰ = 2%(전에는 맨손 자료 크리 50‰ × min(1, 10 ÷ 11.5) = 43‰)
    const ten = specOf(all(10), UNARMED_PHYSICAL);
    expect(ten.attack.unarmed).toBe(true);
    expect(realCritPm(ten.attack, c)).toBe(20);
    // DEX 12·AGI 15 → 27‰. 적정을 넘어도 계속 오른다(레벨·맨손 적정과 상관없음)
    const p = { ...all(10), dex: 12, agi: 15 };
    expect(realCritPm(specOf(p, UNARMED_PHYSICAL).attack, c)).toBe(27);
    expect(realCritPm(specOf(p, UNARMED_PHYSICAL, 30).attack, c)).toBe(27);
    expect(realCritPm(specOf(all(100), UNARMED_PHYSICAL).attack, c)).toBe(200);
    // 명중은 늘 1000‰(맨손 식 bare_hit)
    expect(realHitPm(ten.attack, c)).toBe(1000);
    // 크리쳐 발톱처럼 맨손이 아닌 타고난 무기는 무기 틀 그대로(50 × min(1, 12 ÷ 12) = 50)
    const claws: WeaponSpec = { ...UNARMED_PHYSICAL, unarmed: false, appropriate: { dex: 12, agi: 12 } };
    const clawSpec = specOf(p, claws);
    expect(clawSpec.attack.unarmed).toBeUndefined();
    expect(realCritPm(clawSpec.attack, c)).toBe(50);
    expect(realHitPm(clawSpec.attack, c)).toBe(850);
    // 발톱도 무기 간격 식(같은 꼴, 2026-11-13): 1000 ÷ (15 ÷ 12)² = 640ms
    expect(clawSpec.attackIntervalMs).toBe(640);
  });

  it("맨손 간격 = 2,000 ÷ (AGI ÷ 그 레벨 보통 유닛 AGI)², 0.25~5초(사용자 답 1252)", () => {
    // Lv 1 기준 AGI 10: 10 → 2,000ms, 20 → 500ms, 15 → 888ms, 7 → 4,081ms, 6 이하 → 5,000ms(상한), 100 → 250ms(하한)
    expect(bareIntervalAt(10)).toBe(2000);
    expect(bareIntervalAt(20)).toBe(500);
    expect(bareIntervalAt(15)).toBe(888);
    expect(bareIntervalAt(7)).toBe(4081);
    expect(bareIntervalAt(6)).toBe(5000);
    expect(bareIntervalAt(0)).toBe(5000);
    expect(bareIntervalAt(100)).toBe(250);
    // 초기 10인 유닛은 레벨이 올라도 약 2초(Lv 10 AGI 19 → 2,000, Lv 30 AGI 39 → 2,000·38 → 2,109)
    expect(bareIntervalAt(19, 10)).toBe(2000);
    expect(bareIntervalAt(39, 30)).toBe(2000);
    expect(bareIntervalAt(38, 30)).toBe(2109);
  });

  it("맨손 스킬 사양(타고난 무기·맨손 속성 자료)도 맨손 크리 식을 쓴다", () => {
    const spec = specOf({ ...all(10), dex: 12, agi: 15 }, weaponOf("test_sword"));
    expect(realCritPm(spec.bareHandAttack?.physical ?? spec.attack, c)).toBe(27);
    expect(realCritPm(spec.bareHandAttack?.elemental ?? spec.attack, c)).toBe(27);
    // 든 검의 크리는 무기 틀(100 × min(1, 12 ÷ 12) = 100)
    expect(realCritPm(spec.attack, c)).toBe(100);
  });

  it("Lv 30 균형형(1차 모두 39) + 검: 58 + 20 = 78(적정을 넘는 보너스 없음), 명중·크리는 무기 값, 간격은 적정 2배 상한 250ms", () => {
    const spec = specOf(all(39), sword, 30);
    expect(realAttackOf(spec.attack, c.appropriateCapPm, c)).toBe(78);
    expect(realHitPm(spec.attack, c)).toBe(900);
    expect(realCritPm(spec.attack, c)).toBe(100);
    // AGI 39 ÷ 적정 12 = 3.25 → 속도 상한 2(사용자 "장비는 그래서 적정스탯 상한이 필요하다") → 1000 ÷ 4 = 250ms
    expect(spec.attackIntervalMs).toBe(250);
  });

  it("적정이 없는 무기는 비율 100%, 공격 몫은 STR만 본다(DEX·VIT를 섞지 않음)", () => {
    const { appropriate: _drop, ...plain } = sword;
    const spec = specOf(all(1), plain);
    expect(realAttackOf(spec.attack, c.appropriateCapPm, c)).toBe(1 + 20);
    expect(realHitPm(spec.attack, c)).toBe(900);
    expect(spec.attackIntervalMs).toBe(1000);
    // STR만 올리면 무기 몫이 오르고, DEX만 올리면 공격력은 그대로(명중만)
    const strOnly = specOf({ ...all(10), str: 25 }, sword);
    const dexOnly = specOf({ ...all(10), dex: 25 }, sword);
    expect(realAttackOf(strOnly.attack, c.appropriateCapPm, c)).toBe(30 + 20);
    expect(realAttackOf(dexOnly.attack, c.appropriateCapPm, c)).toBe(23);
    expect(realHitPm(dexOnly.attack, c)).toBe(900);
  });

  it("속성 무기는 INT ÷ 적정 INT(불꽃 지팡이 공격력 20·적정 INT 25): 새 사이보그 15(INT + ⌊WIS ÷ 2⌋) + 8 = 23", () => {
    const staff = TEST_COMBAT_CATALOG.equipment.find((item) => item.id === "fire_staff")?.weapon;
    if (!staff) throw new Error("fixture");
    const spec = specOf(all(10), staff);
    expect(spec.attack.kind).toBe("elemental");
    expect(realAttackOf(spec.attack, c.appropriateCapPm, c)).toBe(23);
  });
});
