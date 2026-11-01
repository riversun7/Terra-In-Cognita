import { type LabUnit, newLabUnit } from "@terra/shared/battleLab";
import {
  TEST_COMBAT_CATALOG,
  TEST_COMBAT_COEFFICIENTS,
  computeSecondary,
  primaryAtLevel,
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
          physical: { attack: 30, appropriate: 20 },
          elemental: { attack: 25, appropriate: 20 },
          basic: "elemental",
          hitPm: 900,
          hitAppropriate: 20,
          critPm: 100,
          critAppropriate: 20,
          intervalMs: 1100,
          speedAppropriate: 100,
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

  it("맨손·적정치: 무기가 없으면 기본·물리·속성 모두 타고난 무기 값, 지팡이면 물리 스킬만 맨손(D-465)", () => {
    const bare = previewLabUnit(newLabUnit("human"), rules).combat;
    const human = TEST_COMBAT_CATALOG.unitKinds.find((entry) => entry.id === "human");
    expect(bare.attacks.basic).toMatchObject({
      source: "natural",
      weaponAttack: human?.naturalWeapon.physical?.attack,
      appropriate: human?.naturalWeapon.physical?.attackAppropriate,
    });
    expect(bare.attacks.elemental).toMatchObject({
      source: "natural",
      appropriate: human?.naturalElementalWeapon.elemental?.attackAppropriate,
    });
    expect(bare.appropriate.hit.appropriate).toBe(human?.naturalWeapon.hitAppropriate);
    const staff = previewLabUnit(
      { ...newLabUnit("human"), weapon: { kind: "item", id: "test_staff", pm: 500 } },
      rules,
    ).combat;
    expect(staff.attacks.basic.source).toBe("weapon");
    expect(staff.attacks.elemental).toMatchObject({ source: "weapon", weaponAttack: 18, appropriate: 40 });
    expect(staff.attacks.physical.source).toBe("natural");
    expect(staff.appropriate.speed.appropriate).toBe(100);
  });
});
