import { type LabUnit, newLabUnit } from "@terra/shared/battleLab";
import {
  DEFAULT_COMBAT_FORMULA_SET,
  TEST_COMBAT_CATALOG,
  TEST_COMBAT_COEFFICIENTS,
  combatFormulaSetFrom,
  computeSecondary,
  primaryAtLevel,
  realAttackOf,
  specFromStats,
} from "@terra/sim";
import { describe, expect, it } from "vitest";
import { type LabRules, LabUnitError, buildLabUnit, previewLabUnit } from "./build.ts";

const rules: LabRules = {
  catalog: TEST_COMBAT_CATALOG,
  coefficients: TEST_COMBAT_COEFFICIENTS,
  growthPm: 100,
  maxLevel: 50,
};

const flat = (value: number) => ({ str: value, vit: value, int: value, wis: value, dex: value, agi: value });

describe("실험 유닛 → 전투 사양(서버만 계산)", () => {
  it("새 사이보그(1차 10·레벨 1·맨손)는 시뮬레이터와 같은 함수로 같은 사양", () => {
    const built = buildLabUnit(newLabUnit("cyborg"), rules);
    const stats = computeSecondary(
      { str: 10, dex: 10, agi: 10, vit: 10, int: 10, wis: 10 },
      TEST_COMBAT_CATALOG.statTable,
    );
    const kind = TEST_COMBAT_CATALOG.unitKinds.find((entry) => entry.id === "cyborg");
    if (!kind) throw new Error("test catalog has no cyborg");
    const expected = specFromStats(
      {
        id: 0,
        side: 0,
        party: 0,
        x: 0,
        y: 0,
        stats,
        weapon: kind.naturalWeapon,
        // 무기 칸이 비어 맨손(D-490: 맨손 스킬만)
        bareHanded: true,
        naturalWeapon: kind.naturalWeapon,
        naturalElementalWeapon: kind.naturalElementalWeapon,
        moveIntervalMs: 1000,
        primaries: { str: 10, dex: 10, agi: 10, vit: 10, int: 10, wis: 10 },
        elements: Array.from({ length: 12 }, () => 0),
        resistPm: Array.from({ length: 12 }, () => 0),
        defenseFlat: 0,
        penetrationPm: 0,
        cyborg: true,
        skills: [],
      },
      TEST_COMBAT_COEFFICIENTS,
    );
    expect(built.spec).toEqual(expected);
    expect(built.dropped).toEqual([]);
  });

  it("레벨 성장은 primaryAtLevel(성장률 = 규칙의 N5 값, K는 스탯마다)", () => {
    const unit: LabUnit = {
      ...newLabUnit("human"),
      level: 30,
      initial: { str: 14, vit: 14, int: 8, wis: 8, dex: 8, agi: 8 },
      kPm: { str: 1200, vit: 800, int: 1000, wis: 1000, dex: 1000, agi: 1000 },
    };
    const preview = previewLabUnit(unit, rules);
    expect(preview.primaries.str.grown).toBe(primaryAtLevel(14, 100, 1200, 30));
    expect(preview.primaries.vit.grown).toBe(primaryAtLevel(14, 100, 800, 30));
    // 성장률을 바꾸면(D1 덮어쓰기) 값이 바뀐다
    const faster = previewLabUnit(unit, { ...rules, growthPm: 200 });
    expect(faster.primaries.str.grown).toBe(primaryAtLevel(14, 200, 1200, 30));
    // 안드로이드는 성장 없음(D-416)
    const android = previewLabUnit({ ...unit, kind: "android" }, rules);
    expect(android.primaries.str.grown).toBe(14);
  });

  it("레벨 표는 Lv 1 → 만렙(규칙 값)이고 각 줄은 computeSecondary와 같다", () => {
    const unit: LabUnit = { ...newLabUnit("human"), level: 5, initial: flat(12) };
    const preview = previewLabUnit(unit, rules);
    expect(preview.levels).toHaveLength(50);
    expect(preview.levels[0]?.level).toBe(1);
    const at30 = preview.levels[29];
    const grown = primaryAtLevel(12, 100, 1000, 30);
    expect(at30?.primaries.str).toBe(grown);
    const expected = computeSecondary(
      { str: grown, dex: grown, agi: grown, vit: grown, int: grown, wis: grown },
      TEST_COMBAT_CATALOG.statTable,
    );
    expect(at30?.secondary).toEqual(TEST_COMBAT_CATALOG.statTable.map((row) => expected[row.id]));
  });

  it("장비: 팩 장비(칸 맞음)·직접 값(2차 행·1차 보너스·고정 방어·관통·저항)이 사양에 든다. 공격력 행은 뺀다", () => {
    const unit: LabUnit = {
      ...newLabUnit("human"),
      weapon: { kind: "item", id: "test_staff", pm: 1000 },
      // 사람형 칸: 0 무기·1 보조·2 머리·3 몸·4·5 장신구
      equipment: [
        { slot: 3, item: "test_vest", pm: 1000 },
        { slot: 4, item: "test_ring", pm: 0 },
        { slot: 2, item: "test_vest", pm: 0 },
      ],
      gear: {
        rows: [
          { id: "shield_hp", value: 50 },
          { id: "physical_attack", value: 999 },
        ],
        defenseFlat: 7,
        penetrationPm: 120,
        resistPm: [0, 0, 300, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        primaries: { str: 0, vit: 5, int: 0, wis: 0, dex: 0, agi: 0 },
      },
    };
    const built = buildLabUnit(unit, rules);
    const preview = previewLabUnit(unit, rules);
    // 반지 str +1, 직접 vit +5
    expect(preview.primaries.str.bonus).toBe(1);
    expect(preview.primaries.vit.bonus).toBe(5);
    // 조끼 armor_hp 40 + 직접 쉴드 50
    const shield = preview.secondary.find((row) => row.id === "shield_hp");
    expect(shield?.extra).toBe(50);
    expect(built.spec.defense.defenseFlat).toBe(7);
    expect(built.spec.attack.penetrationPm).toBe(120);
    expect(built.spec.defense.resistPm[2]).toBe(300);
    // 지팡이: 속성 기본 공격, 장비 스킬 fire_bolt
    expect(built.spec.attack.kind).toBe("elemental");
    expect(built.spec.skills.map((skill) => skill.id)).toEqual(["fire_bolt"]);
    // 머리 칸에 조끼(칸 틀림), 공격력 행은 뺐다고 알린다
    expect(built.dropped).toEqual(
      expect.arrayContaining([
        { kind: "slot", id: "test_vest" },
        { kind: "gear_row", id: "physical_attack" },
      ]),
    );
  });

  it("직접 만든 무기(두 칸 + basic)와 스킬 칸 수·등급·모르는 스킬", () => {
    const unit: LabUnit = {
      ...newLabUnit("human"),
      rebirths: 0,
      weapon: {
        kind: "custom",
        spec: {
          physical: { attack: 30 },
          elemental: { attack: 25 },
          basic: "elemental",
          appropriate: { str: 20, int: 20, dex: 20, agi: 0 },
          hitPm: 900,
          critPm: 100,
          intervalMs: 1100,
          range: 4,
          arc: false,
          staminaCost: 10,
          mpCost: 3,
          elementsPm: [0, 0, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        },
      },
      skills: [
        { id: "power_strike", grade: 3 },
        { id: "no_such_skill", grade: 1 },
        { id: "fire_bolt", grade: 1 },
        { id: "war_cry", grade: 1 },
        { id: "first_aid", grade: 1 },
      ],
    };
    const built = buildLabUnit(unit, rules);
    expect(built.spec.attack.kind).toBe("elemental");
    expect(built.spec.range).toBe(4);
    expect(built.spec.skillAttack?.physical.weaponAttack).toBe(30);
    // 직접 값 적정(D-502): STR·INT 20 → 밀리점, AGI 0 = 적정 없음(간격 그대로)
    expect(built.spec.skillAttack?.physical.attackAppropriateMilli).toBe(20_000);
    expect(built.spec.attack.attackAppropriateMilli).toBe(20_000);
    // 무기 사거리 예산 기본 켬(질문 1814): 사거리 4 → 1100 × 1300‰
    expect(built.spec.attackIntervalMs).toBe(1430);
    // 사람형 스킬 칸 3(환생 0): 모르는 스킬은 빼고 앞에서 셋
    expect(built.spec.skills.map((skill) => skill.id)).toEqual(["power_strike", "fire_bolt", "war_cry"]);
    expect(built.dropped).toContainEqual({ kind: "skill", id: "no_such_skill" });
    // 등급 3은 등급 배율 표(1200‰)로 공격 배율이 커진다
    const grade1 = buildLabUnit({ ...unit, skills: [{ id: "power_strike", grade: 1 }] }, rules);
    expect(built.spec.skills[0]?.attackMulPm).toBeGreaterThan(grade1.spec.skills[0]?.attackMulPm ?? 0);
  });

  it("모르는 유닛 종류는 LabUnitError(invalid_unit)", () => {
    expect(() => buildLabUnit(newLabUnit("dragon"), rules)).toThrow(LabUnitError);
  });

  it("미리 보기의 2차 풀이 값 = 사양에 든 값, 전투 요약은 사양에서", () => {
    const unit: LabUnit = { ...newLabUnit("human"), level: 20, initial: flat(15) };
    const built = buildLabUnit(unit, rules);
    const preview = previewLabUnit(unit, rules);
    const hp = preview.secondary.find((row) => row.id === "hp");
    expect(hp?.value).toBe(built.spec.maxHp);
    expect(preview.combat.maxHp).toBe(built.spec.maxHp);
    expect(preview.combat.attackIntervalMs).toBe(built.spec.attackIntervalMs);
    expect(preview.combat.realAttack).toBeGreaterThan(0);
    expect(preview.skills.slots).toBe(3);
  });

  it("맨손·적정: 무기가 없으면 기본·물리·속성 모두 타고난 무기(무기 몫 0, D-502), 지팡이면 물리 스킬만 맨손(D-465)", () => {
    const bare = previewLabUnit(newLabUnit("human"), rules).combat;
    // 새 휴먼(1차 모두 10, Lv 1): 공격력 = 스탯 공격력 15(STR + ⌊VIT ÷ 2⌋, 2026-11-13), 명중 늘 1000‰·크리 AGI + DEX = 20‰(사용자 결정 2026-11-12, 전에는 738‰)
    expect(bare.attacks.basic).toMatchObject({
      source: "natural",
      weaponAttack: 0,
      statAttack: 15,
      realAttack: 15,
    });
    expect(bare.attacks.elemental).toMatchObject({ source: "natural", weaponAttack: 0, appropriateMilli: 0 });
    expect(bare.appropriate.hit).toEqual({ stat: 10, appropriateMilli: 11_500, ratioPm: 869 });
    expect(bare.hitPm).toBe(1000);
    expect(bare.critPm).toBe(20);
    const staff = previewLabUnit(
      { ...newLabUnit("human"), weapon: { kind: "item", id: "test_staff", pm: 500 } },
      rules,
    ).combat;
    expect(staff.attacks.basic.source).toBe("weapon");
    // 지팡이 속성 18 · 적정 INT 23: 속성 공격력 INT + ⌊WIS ÷ 2⌋ = 15(답 1257) + 18 × 10 ÷ 23 = 15 + 7 = 22
    expect(staff.attacks.elemental).toMatchObject({
      source: "weapon",
      weaponAttack: 18,
      appropriateMilli: 23_000,
      ratioPm: 434,
      realAttack: 22,
    });
    expect(staff.attacks.physical.source).toBe("natural");
    expect(staff.appropriate.speed).toEqual({ stat: 10, appropriateMilli: 12_000, ratioPm: 833 });
  });

  it("유닛 레벨이 맨손 적정(D-502)으로 가고, 화면 요약은 판정과 같은 실효 계산식이다(계수표의 식 덮어쓰기 포함)", () => {
    const unit: LabUnit = { ...newLabUnit("human"), level: 30, initial: flat(10) };
    const built = buildLabUnit(unit, rules);
    // Lv 30 맨손 적정 = 30 × 1.5 + 10 = 55
    expect(built.spec.attack.dexAppropriateMilli).toBe(55_000);
    const preview = previewLabUnit(unit, rules);
    const cap = rules.coefficients.appropriateCapPm;
    expect(preview.combat.realAttack).toBe(realAttackOf(built.spec.attack, cap, rules.coefficients));
    expect(preview.combat.appropriate.speed.appropriateMilli).toBe(55_000);
    // 명중 식을 덮어쓰면(세계의 계산식) 화면 요약도 그 식(맨손은 맨손 명중 식 bare_hit, 2026-11-12)
    const formulas = combatFormulaSetFrom({ bare_hit: "777" });
    expect(formulas.bare_hit).not.toBe(DEFAULT_COMBAT_FORMULA_SET.bare_hit);
    const overridden = previewLabUnit(unit, {
      ...rules,
      coefficients: { ...rules.coefficients, formulas },
    });
    expect(overridden.combat.hitPm).toBe(777);
  });
});

describe("장비 전투 칸(아이템 편집기 WP-5)", () => {
  // 시험 자료에 양손 대검·방패·크리쳐 전용 반지를 더한 묶음
  const catalog = {
    ...TEST_COMBAT_CATALOG,
    equipment: [
      ...TEST_COMBAT_CATALOG.equipment,
      ...TEST_COMBAT_CATALOG.equipment
        .filter((item) => item.id === "test_sword")
        .map((item) => ({ ...item, id: "lab_greatsword", twoHanded: true })),
      {
        id: "lab_shield",
        slot: "offhand" as const,
        stats: [{ stat: "defense_rate", min: 40, max: 40 }],
        skills: [],
        defenseFlat: 5,
      },
      {
        id: "lab_beast_ring",
        slot: "ring" as const,
        stats: [{ stat: "str", min: 3, max: 3 }],
        skills: [],
        kinds: ["creature"],
      },
    ],
  };
  const gearRules: LabRules = { ...rules, catalog };

  it("양손 무기를 들면 보조 칸 장비는 빠지고(던지지 않음) 경고(two_handed)로 알린다", () => {
    const unit: LabUnit = {
      ...newLabUnit("human"),
      weapon: { kind: "item", id: "lab_greatsword", pm: 500 },
      equipment: [{ slot: 1, item: "lab_shield", pm: 0 }],
    };
    const built = buildLabUnit(unit, gearRules);
    expect(built.dropped).toEqual([{ kind: "two_handed", id: "lab_shield" }]);
    expect(built.spec.defense.defenseFlat).toBe(0);
    // 한손 칼이면 방패가 든다(고정 방어 5 = 직접 값 0 + 방패 5)
    const oneHand = buildLabUnit({ ...unit, weapon: { kind: "item", id: "test_sword", pm: 500 } }, gearRules);
    expect(oneHand.dropped).toEqual([]);
    expect(oneHand.spec.defense.defenseFlat).toBe(5);
  });

  it("그 종류가 입을 수 없는 장비(kinds)는 빠지고 경고(unit_kind), 속성값은 자기 값 + 장비(칸마다 10)", () => {
    const unit: LabUnit = {
      ...newLabUnit("human"),
      equipment: [{ slot: 4, item: "lab_beast_ring", pm: 0 }],
    };
    const built = buildLabUnit(unit, gearRules);
    expect(built.dropped).toEqual([{ kind: "unit_kind", id: "lab_beast_ring" }]);
    expect(built.loadout.primaries.str).toBe(10);
    // 사이보그 인공장기(test_heart: 불 2·빙결 3) + 자기 불 9 → 불 10에서 자름
    const cyborg: LabUnit = {
      ...newLabUnit("cyborg"),
      elements: Array.from({ length: 12 }, (_, index) => (index === 2 ? 9 : 0)),
      equipment: [{ slot: 6, item: "test_heart", pm: 0 }],
    };
    const elements = buildLabUnit(cyborg, gearRules).spec.defense.elements;
    expect(elements[2]).toBe(10);
    expect(elements[1]).toBe(3);
  });
});
