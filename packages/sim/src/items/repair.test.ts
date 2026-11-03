// 장비 수리 규칙 시험 — D-512 323(옛 enhancement_routes.js REPAIR_MAP·재료 식, 48 §7.2 제작 직무 행, F11·F12)
import { describe, expect, it } from "vitest";
import type { StatRow } from "../combat/stats.ts";
import { TEST_SOCIETY_COEFFICIENTS } from "../society/coefficients.ts";
import {
  CRAFT_JOB_ROW,
  type RepairRule,
  craftScore,
  craftSkillPm,
  planEquipmentRepair,
  repairMaterials,
  repairRuleFor,
} from "./repair.ts";

/** 옛 REPAIR_MAP(878~883)을 우리 칸·무기 종류로: 무기·원거리·방어구(+ 방패)·장신구 공방 */
const OLD_RULES: readonly RepairRule[] = [
  {
    slots: [],
    weaponTypes: ["blade", "greatsword", "blunt", "spear", "axe", "fist"],
    materials: [{ item: "iron_ingot", qty: 2 }],
  },
  {
    slots: [],
    weaponTypes: ["bow", "crossbow", "gun", "staff", "wand"],
    materials: [
      { item: "plank", qty: 2 },
      { item: "iron_ingot", qty: 1 },
    ],
  },
  {
    slots: ["head", "body"],
    weaponTypes: ["shield"],
    materials: [
      { item: "iron_ingot", qty: 1 },
      { item: "deer_hide", qty: 1 },
    ],
  },
  { slots: ["accessory"], weaponTypes: [], materials: [{ item: "silver_ingot", qty: 1 }] },
];

/** 옛 줄 하나(없으면 시험 자료가 틀림) */
function ruleAt(index: number): RepairRule {
  const rule = OLD_RULES[index];
  if (!rule) throw new Error(`no rule ${index}`);
  return rule;
}

/** 제작 직무 행(옛 salary_engine crafting: DEX 0.5·STR 0.2·INT 0.2·WIS 0.1 → STR·DEX·AGI·VIT·INT·WIS ‰) */
const CRAFT_ROW: StatRow = {
  id: CRAFT_JOB_ROW,
  shape: "quantity",
  base: 0,
  weights: [200, 500, 0, 0, 200, 100],
};

describe("수리 줄 고르기(옛 REPAIR_MAP)", () => {
  it("무기는 무기 종류로, 방어구·장신구는 칸으로, 방패는 방어구 공방(includeShield)", () => {
    expect(repairRuleFor(OLD_RULES, { slot: "weapon", weaponType: "blade" })).toBe(OLD_RULES[0]);
    expect(repairRuleFor(OLD_RULES, { slot: "weapon", weaponType: "staff" })).toBe(OLD_RULES[1]);
    expect(repairRuleFor(OLD_RULES, { slot: "body" })).toBe(OLD_RULES[2]);
    expect(repairRuleFor(OLD_RULES, { slot: "offhand", weaponType: "shield" })).toBe(OLD_RULES[2]);
    expect(repairRuleFor(OLD_RULES, { slot: "accessory" })).toBe(OLD_RULES[3]);
  });

  it("줄에 없는 것(화살통·인공장기·무기 종류 없는 무기)은 고칠 수 없다", () => {
    expect(repairRuleFor(OLD_RULES, { slot: "offhand", weaponType: "quiver" })).toBeUndefined();
    expect(repairRuleFor(OLD_RULES, { slot: "organ" })).toBeUndefined();
    expect(repairRuleFor(OLD_RULES, { slot: "weapon" })).toBeUndefined();
    expect(repairRuleFor([], { slot: "body" })).toBeUndefined();
  });
});

describe("수리 재료(옛 955~960: max(1, ⌈기본 × 티어 × 잃은 ÷ 최대⌉))", () => {
  it("무기 공방 주괴 2: 티어 1·반 잃음 → 1, 티어 3·90% 잃음 → 6", () => {
    expect(repairMaterials(ruleAt(0), 1, 50, 100)).toEqual([{ item: "iron_ingot", qty: 1 }]);
    expect(repairMaterials(ruleAt(0), 3, 90, 100)).toEqual([{ item: "iron_ingot", qty: 6 }]);
  });

  it("줄마다 따로 셈하고 같은 아이템은 합친다. 잃은 것이 없으면 빈 목록", () => {
    expect(repairMaterials(ruleAt(1), 2, 30, 100)).toEqual([
      { item: "plank", qty: 2 },
      { item: "iron_ingot", qty: 1 },
    ]);
    const twice: RepairRule = {
      slots: ["body"],
      weaponTypes: [],
      materials: [
        { item: "iron_ingot", qty: 2 },
        { item: "iron_ingot", qty: 1 },
      ],
    };
    expect(repairMaterials(twice, 1, 100, 100)).toEqual([{ item: "iron_ingot", qty: 3 }]);
    expect(repairMaterials(ruleAt(0), 1, 0, 100)).toEqual([]);
  });
});

describe("장인 실력(제작 직무 행 ÷ 적정, D-420 틀)", () => {
  it("제작 직무 점수 = 가중치 행(DEX 0.5·STR 0.2·INT 0.2·WIS 0.1), 행이 없으면 0", () => {
    const primaries = { str: 10, dex: 20, agi: 5, vit: 5, int: 10, wis: 10 };
    // (10×200 + 20×500 + 10×200 + 10×100) ÷ 1000 = 15
    expect(craftScore(primaries, [CRAFT_ROW])).toBe(15);
    expect(craftScore(primaries, [])).toBe(0);
  });

  it("실력‰ = min(1000, 점수 × 1000 ÷ 적정): 15/50 → 300, 적정 이상이면 1000, 0이면 0", () => {
    expect(craftSkillPm(15, 50)).toBe(300);
    expect(craftSkillPm(50, 50)).toBe(1000);
    expect(craftSkillPm(200, 50)).toBe(1000);
    expect(craftSkillPm(0, 50)).toBe(0);
    expect(craftSkillPm(10, 0)).toBe(1000);
  });
});

describe("끝까지 수리(F11·F12, 재료뿐 — 수수료 없음)", () => {
  const c = TEST_SOCIETY_COEFFICIENTS;
  const rule = ruleAt(0);

  it("Lv1(−30%)·실력 0 → 최대 100 → 70, 실력 1000 → 85(반). 내구도 = 새 최대(절반 수리 없음)", () => {
    const item = { durability: 40, maxDurability: 100 };
    const slow = planEquipmentRepair(item, { rule, tier: 1, facilityLevel: 1, skillPm: 0 }, c);
    expect(slow.item).toEqual({ durability: 70, maxDurability: 70 });
    expect(slow.materials).toEqual([{ item: "iron_ingot", qty: 2 }]);
    const skilled = planEquipmentRepair(item, { rule, tier: 1, facilityLevel: 1, skillPm: 1000 }, c);
    expect(skilled.item).toEqual({ durability: 85, maxDurability: 85 });
    expect(skilled.skillPm).toBe(1000);
  });

  it("닳지 않았으면 그대로·재료 없음, 파괴(새 최대 ≤ F12)면 재료 없음", () => {
    const full = { durability: 100, maxDurability: 100 };
    expect(planEquipmentRepair(full, { rule, tier: 1, facilityLevel: 1, skillPm: 0 }, c)).toMatchObject({
      item: full,
      materials: [],
      restored: 0,
    });
    const worn = { durability: 5, maxDurability: 12 };
    const broken = planEquipmentRepair(worn, { rule, tier: 1, facilityLevel: 1, skillPm: 0 }, c);
    expect(broken.destroyed).toBe(true);
    expect(broken.item.durability).toBe(0);
    expect(broken.materials).toEqual([]);
  });
});
