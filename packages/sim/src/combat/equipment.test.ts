import { describe, expect, it } from "vitest";
import { TEST_COMBAT_CATALOG, UNARMED } from "./catalog.ts";
import {
  type EquipDef,
  type EquippedItem,
  itemAt,
  loadoutOf,
  rollItem,
  skillSlotCount,
  wrongStatGroup,
} from "./equipment.ts";
import { computeSecondary } from "./stats.ts";
import { specFromStats } from "./unitSpec.ts";

const base = { str: 10, dex: 10, agi: 10, vit: 10, int: 10, wis: 10 };
const def = (id: string): EquipDef => {
  const found = TEST_COMBAT_CATALOG.equipment.find((item) => item.id === id);
  if (!found) throw new Error(`fixture ${id}`);
  return found;
};
const kind = (id: string) => {
  const found = TEST_COMBAT_CATALOG.unitKinds.find((entry) => entry.id === id);
  if (!found) throw new Error(`fixture ${id}`);
  return found;
};
const table = TEST_COMBAT_CATALOG.statTable;

describe("장비 칸과 스탯(D-422~D-424)", () => {
  it("칸 배치: 사람형 공통 6칸 + 종류별 강화 칸, 크리쳐 2칸", () => {
    expect(kind("human").slots).toEqual(["weapon", "offhand", "head", "body", "accessory", "accessory"]);
    expect(kind("cyborg").slots.slice(6)).toEqual(["organ", "organ", "organ"]);
    expect(kind("android").slots.slice(6)).toEqual(["part", "part", "part"]);
    expect(kind("creature").slots).toHaveLength(2);
  });

  it("무기·방어구는 2차 수치, 장신구·인공장기는 1차 스탯을 올린다(D-423)", () => {
    const slots = kind("cyborg").slots;
    const equipped: (EquippedItem | null)[] = [
      itemAt(def("test_sword"), 1000),
      null,
      null,
      itemAt(def("test_vest"), 0),
      itemAt(def("test_ring"), 1000),
      null,
      itemAt(def("test_heart"), 0),
    ];
    const out = loadoutOf({ base, slots, equipped, table, unarmed: UNARMED });
    expect(out.primaries).toEqual({ ...base, str: 13, vit: 12 });
    // 2차 수치는 가중치 표의 장비 칸으로 들어간다(양 모양은 그대로 더하고, 확률 모양은 점수에 더한다, [임시])
    expect(out.stats).toEqual(
      computeSecondary(out.primaries, table, { crit_chance: 20, defense_rate: 30, armor_hp: 20 }),
    );
    expect(out.stats.armor_hp).toBe((computeSecondary(out.primaries, table).armor_hp ?? 0) + 20);
    expect(out.weapon).toBe(def("test_sword").weapon);
  });

  it("칸에 맞지 않는 장비와 칸 묶음에 맞지 않는 스탯은 거절한다", () => {
    const slots = kind("human").slots;
    expect(() =>
      loadoutOf({ base, slots, equipped: [itemAt(def("test_vest"), 0)], table, unarmed: UNARMED }),
    ).toThrow(RangeError);
    expect(wrongStatGroup("weapon", [{ stat: "str" }])).toBe("str");
    expect(wrongStatGroup("accessory", [{ stat: "hp" }])).toBe("hp");
    expect(wrongStatGroup("organ", [{ stat: "vit" }])).toBeUndefined();
  });

  it("적정치에 못 미쳐도 낄 수 있고, 성능은 무기 틀 비율로 준다(D-424)", () => {
    const weak = { str: 1, dex: 1, agi: 1, vit: 1, int: 1, wis: 1 };
    const out = loadoutOf({
      base: weak,
      slots: kind("human").slots,
      equipped: [itemAt(def("test_sword"), 0)],
      table,
      unarmed: UNARMED,
    });
    const spec = specFromStats({
      id: 1,
      side: 1,
      party: 1,
      x: 0,
      y: 0,
      stats: out.stats,
      weapon: out.weapon,
      primaries: out.primaries,
      moveIntervalMs: 1000,
    });
    expect(spec.attack.weaponAttack).toBe(20);
    expect(spec.attack.attackStat).toBeLessThan(spec.attack.attackAppropriate);
  });

  it("맨손이면 맨손 무기, 장비 스킬은 고유 스킬 뒤에 붙고 스킬 칸 수에서 자른다(D-426·D-427)", () => {
    const staff = itemAt(def("test_staff"), 500);
    const out = loadoutOf({
      base,
      slots: kind("human").slots,
      equipped: [staff],
      table,
      unarmed: UNARMED,
      innateSkills: ["power_strike", "iron_skin"],
      skillSlots: 2,
    });
    expect(out.skills).toEqual(["power_strike", "iron_skin"]);
    const more = loadoutOf({
      base,
      slots: kind("human").slots,
      equipped: [staff],
      table,
      unarmed: UNARMED,
      innateSkills: ["iron_skin"],
      skillSlots: skillSlotCount(3, 0, 10),
    });
    expect(more.skills).toEqual(["iron_skin", "fire_bolt"]);
    expect(loadoutOf({ base, slots: [], equipped: [], table, unarmed: UNARMED }).weapon).toBe(UNARMED);
  });

  it("스킬 칸 = 종 기본 + 환생, 상한 10(구조 값)", () => {
    expect(skillSlotCount(3, 2, 10)).toBe(5);
    expect(skillSlotCount(4, 20, 10)).toBe(10);
  });

  it("장비를 만들면 스탯마다 [최소, 최대] 안의 값 하나(시드 굴림)", () => {
    const vest = def("test_vest");
    const low = rollItem(vest, () => 0);
    const high = rollItem(vest, (n) => n - 1);
    expect(low.values.map((v) => v.value)).toEqual([30, 20]);
    expect(high.values.map((v) => v.value)).toEqual([60, 40]);
  });
});
