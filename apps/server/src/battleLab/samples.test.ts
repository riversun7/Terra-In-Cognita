// 샘플 프리셋이 형식 검사를 지나고, 실제 팩(core)의 참조만 쓰며, 사양을 만들 때 빠지는 것이 없는지
import { loadContentPack } from "@terra/content/node";
import { TEST_COMBAT_COEFFICIENTS } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { combatCatalogOf } from "../world/combatCatalog.ts";
import { buildLabUnit } from "./build.ts";
import { LAB_SAMPLES } from "./samples.ts";
import { labPartySchema, labUnitSchema, LAB_SAMPLE_ID } from "./schema.ts";

describe("샘플 프리셋([임시] 수치, 읽기 전용)", () => {
  const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
  if (!loaded.source) throw new Error("content pack");
  const catalog = combatCatalogOf(loaded.source);
  const rules = { catalog, coefficients: TEST_COMBAT_COEFFICIENTS, growthPm: 100, maxLevel: 50 };

  it("요청한 샘플이 다 있다(새 사이보그·Lv 30 전사·탱커·마법사(불)·치유사·크리쳐 둘)", () => {
    const names = LAB_SAMPLES.map((preset) => preset.name.ko);
    for (const name of ["새 사이보그", "Lv 30 전사", "Lv 30 탱커", "Lv 30 마법사(불)", "Lv 30 치유사"])
      expect(names).toContain(name);
    expect(
      LAB_SAMPLES.filter((preset) => preset.kind === "unit" && preset.data.kind === "creature"),
    ).toHaveLength(2);
    expect(new Set(LAB_SAMPLES.map((preset) => preset.id)).size).toBe(LAB_SAMPLES.length);
  });

  it("형식 검사를 지나고, 팩 참조가 다 있어 사양을 만들 때 빠지는 것이 없다", () => {
    for (const preset of LAB_SAMPLES) {
      expect(preset.id).toMatch(LAB_SAMPLE_ID);
      const units = preset.kind === "unit" ? [preset.data] : preset.data.units;
      if (preset.kind === "unit") expect(labUnitSchema.safeParse(preset.data).success).toBe(true);
      else expect(labPartySchema.safeParse(preset.data).success).toBe(true);
      for (const unit of units) expect(buildLabUnit(unit, rules).dropped).toEqual([]);
    }
  });

  it("D-490: 유닛 샘플마다 기본 무기(크리쳐는 타고난 무기)·장비와 스킬 1~2개, 스킬 기반 칸이 든 무기에 있다", () => {
    const skills = new Map(catalog.skills.map((skill) => [skill.id, skill]));
    for (const preset of LAB_SAMPLES) {
      const units = preset.kind === "unit" ? [preset.data] : preset.data.units;
      for (const unit of units) {
        const kind = catalog.unitKinds.find((entry) => entry.id === unit.kind);
        const hasWeaponSlot = kind?.slots.includes("weapon") ?? false;
        if (hasWeaponSlot) expect(unit.weapon.kind, preset.id).toBe("item");
        expect(unit.equipment.length, preset.id).toBeGreaterThanOrEqual(1);
        expect(unit.skills.length, preset.id).toBeGreaterThanOrEqual(1);
        expect(unit.skills.length, preset.id).toBeLessThanOrEqual(2);
        const weapon = buildLabUnit(unit, rules).weapon;
        for (const entry of unit.skills) {
          const base = skills.get(entry.id)?.base;
          expect(base && weapon[base], `${preset.id} ${entry.id}`).toBeTruthy();
        }
      }
    }
  });

  it("마법사는 속성 기본 공격·불 속성 스킬, 치유사는 아군 회복, 탱커는 아머가 크다", () => {
    const mage = LAB_SAMPLES.find((preset) => preset.id === "sample_lv30_mage_fire");
    const tank = LAB_SAMPLES.find((preset) => preset.id === "sample_lv30_tank");
    const warrior = LAB_SAMPLES.find((preset) => preset.id === "sample_lv30_warrior");
    if (mage?.kind !== "unit" || tank?.kind !== "unit" || warrior?.kind !== "unit")
      throw new Error("samples");
    const m = buildLabUnit(mage.data, rules).spec;
    expect(m.attack.kind).toBe("elemental");
    expect(m.skills.map((skill) => skill.id)).toContain("fire_bolt");
    // 치유사는 빛 지팡이의 아군 회복·쉴드 스킬(팩 core@20 마법 스킬)
    const healer = LAB_SAMPLES.find((preset) => preset.id === "sample_lv30_healer");
    if (healer?.kind !== "unit") throw new Error("healer");
    expect(buildLabUnit(healer.data, rules).spec.skills.map((skill) => skill.id)).toEqual([
      "light_heal",
      "radiant_ward",
    ]);
    expect(buildLabUnit(tank.data, rules).spec.armorHp).toBeGreaterThan(
      buildLabUnit(warrior.data, rules).spec.armorHp,
    );
  });
});
