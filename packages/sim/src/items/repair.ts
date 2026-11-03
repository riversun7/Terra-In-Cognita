// 장비 수리 규칙 — 기획 D-512 323(D-5031·F11·F12·49 N49), docs/adr/2026-11-03-item-holdings.md "바뀜 (D-512)".
// 옛 프로젝트 공방 수리(AntiGravt01 0ea5299 terra-server/routes/character/enhancement_routes.js:860~1010)를 따른다.
// - ① 끝까지만 고친다(옛 실제 경로 1006~1009 "내구도 완전 복구", 절반 수리 없음). 최대 내구도 감소·파괴는 society/cyborgUpkeep.ts
//   repairDurable 하나(F11·F12, 인공장기와 같은 함수).
// - ② 노동 = 일한 장인의 직무 시간(D-171). 따로 붙는 수수료·인건비는 없다(옛 building_service_routes.js의 수리량 × 0.5·재료 시세 10%는
//   쓰지 않는다). 그래서 이 함수가 셈하는 비용은 재료뿐이다. 수리 한 번의 직무 시간은 아직 규칙이 없다(시설 직무 줄기에서 묻는다).
// - ③ 시설마다 수리 줄(팩 facilities repair, 옛 REPAIR_MAP 878~883): 고칠 수 있는 칸·무기 종류와 기본 재료. 재료 양 =
//   max(1, ⌈기본 양 × 티어 × 잃은 ÷ 최대⌉)(옛 955~960, holding.ts repairMaterialQty). 출발값은 옛 값, 건물 편집기에서 고친다.
// - ④ 장인 실력‰ = min(1000, 제작 직무 점수 × 1000 ÷ 적정 점수)(D-420 틀). 제작 직무 점수 = 가중치 표의 제작 직무 행(팩 stat_rows
//   job_crafting, 48 §7.2 = 옛 salary_engine.js:40~47 DEX 0.5·STR 0.2·INT 0.2·WIS 0.1). 실력 1000이면 최대 감소가 반(F11).
// 정수만 쓴다.
import { appropriateRatioPm } from "../combat/formula.ts";
import { type Primaries, type StatRow, computeSecondary } from "../combat/stats.ts";
import type { SocietyCoefficients } from "../society/coefficients.ts";
import { type DurableRepair, type Durable, repairDurable } from "../society/cyborgUpkeep.ts";
import { repairMaterialQty } from "./holding.ts";

/** 가중치 표의 제작 직무 행 ID(팩 stat_rows, 48 §3.3 "직무 효율 — 직무마다 한 행") */
export const CRAFT_JOB_ROW = "job_crafting";

/** 재료 한 줄(아이템 ID·묶음 수량) */
export interface RepairMaterial {
  readonly item: string;
  readonly qty: number;
}

/**
 * 수리 줄 하나(시설 하나가 고치는 장비 묶음과 기본 재료, 옛 REPAIR_MAP 한 공방): 무기 종류가 weaponTypes에 있거나 칸이 slots에 있으면
 * 고친다(옛: 무기 칸은 무기 종류로 가르고, 방어구 공방은 방패 무기 종류도 받음 — includeShield)
 */
export interface RepairRule {
  readonly slots: readonly string[];
  readonly weaponTypes: readonly string[];
  readonly materials: readonly RepairMaterial[];
}

/** 고칠 장비의 칸·무기 종류(실효 아이템 정의) */
export interface RepairTarget {
  readonly slot: string;
  readonly weaponType?: string | undefined;
}

/** 이 장비를 고치는 첫 줄(시설의 줄 차례). 없으면 undefined(그 시설에서 고칠 수 없다) */
export function repairRuleFor(rules: readonly RepairRule[], target: RepairTarget): RepairRule | undefined {
  return rules.find(
    (rule) =>
      (target.weaponType !== undefined && rule.weaponTypes.includes(target.weaponType)) ||
      rule.slots.includes(target.slot),
  );
}

/** 수리 재료(줄마다 repairMaterialQty, 같은 아이템은 합친다, 양이 0인 줄은 뺀다). 잃은 것이 없으면 빈 목록 */
export function repairMaterials(
  rule: RepairRule,
  tier: number,
  lost: number,
  maxDurability: number,
): RepairMaterial[] {
  const total = new Map<string, number>();
  for (const material of rule.materials) {
    const qty = repairMaterialQty(material.qty, tier, lost, maxDurability);
    if (qty > 0) total.set(material.item, (total.get(material.item) ?? 0) + qty);
  }
  return [...total].map(([item, qty]) => ({ item, qty }));
}

/** 제작 직무 점수: 가중치 표의 제작 직무 행으로 셈한 값(행 식이 있으면 그 식). 행이 없으면 0 */
export function craftScore(primaries: Primaries, table: readonly StatRow[]): number {
  const row = table.find((entry) => entry.id === CRAFT_JOB_ROW);
  if (!row) return 0;
  return computeSecondary(primaries, [row])[CRAFT_JOB_ROW] ?? 0;
}

/** 장인 실력‰ = min(1000, 점수 × 1000 ÷ 적정)(D-420 틀). 적정이 1보다 작으면 1로 친다 */
export function craftSkillPm(score: number, appropriate: number): number {
  return appropriateRatioPm(score, Math.max(1, Math.floor(appropriate)), 1000);
}

/** 장비 수리 한 번의 계획: 최대 감소·파괴(repairDurable)와 재료(비용은 재료뿐, 수수료 없음) */
export interface EquipmentRepairPlan<T extends Durable> extends DurableRepair<T> {
  readonly materials: readonly RepairMaterial[];
  /** 쓴 장인 실력‰ */
  readonly skillPm: number;
}

/**
 * 장비 하나를 끝까지 고친다(D-512 323): 재료는 고치기 전 잃은 양으로 셈하고(옛 955~960), 최대 감소는 시설 Lv·장인 실력(F11),
 * 파괴 문턱(F12). 닳지 않았거나 파괴되면 재료 없음
 */
export function planEquipmentRepair<T extends Durable>(
  item: T,
  input: {
    readonly rule: RepairRule;
    readonly tier: number;
    readonly facilityLevel: number;
    readonly skillPm: number;
  },
  c: Pick<SocietyCoefficients, "durability">,
): EquipmentRepairPlan<T> {
  const materials = repairMaterials(
    input.rule,
    input.tier,
    item.maxDurability - item.durability,
    item.maxDurability,
  );
  const done = repairDurable(item, input.facilityLevel, input.skillPm, c);
  // 파괴되면 재료를 쓰지 않는다(인공장기 수리 repairOrgan이 파괴 때 비용 0인 것과 같다)
  return { ...done, materials: done.restored > 0 ? materials : [], skillPm: input.skillPm };
}
