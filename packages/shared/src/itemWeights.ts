// 아이템 무게 출발값(g) — 기획 D-535 1137 나(옛 아이템 표에 없는 아이템도 화물 상한·인벤토리 무게에 쓰이므로 분류마다 실제에 가까운 [임시] 무게).
// 옛 아이템 표(Consolidated_Item.md ITM-10, D-507·1094)에 있는 원자재·요리는 그 값을 팩에 그대로 두고, 표에 없는 것(장비·생활용품·문서 등)만
// 이 표를 따른다. 팩 core@77이 이 표로 채웠고, 아이템 편집기의 새 항목 틀(newItemTemplate)도 이 값으로 시작한다. 값은 [임시]다.
// 차례: 장비면 칸(무기는 물리 = 검, 원소 = 지팡이) → 중분류 → 대분류 → 기본 1kg.
import type { EquipSlot } from "./roster.ts";

/** 장비 칸마다(g): 투구 1.4kg, 가벼운 몸 갑옷 4kg, 방패 2.5kg, 반지 10g, 인공 장기 400g, 사이보그 부품 500g, 안장 8kg */
export const ITEM_WEIGHT_BY_SLOT: Readonly<Record<EquipSlot, number>> = {
  weapon: 1500,
  offhand: 2500,
  head: 1400,
  body: 4000,
  accessory: 10,
  organ: 400,
  part: 500,
  saddle: 8000,
  // 옛 프로젝트 칸(사용자 결정 2026-11-24): 장갑 600g, 신발 1kg, 토템 300g, 반지 10g, 목걸이 30g, 인공장기 400g·임플란트 100g
  hands: 600,
  feet: 1000,
  totem: 300,
  ring: 10,
  necklace: 30,
  organ_head: 400,
  organ_body: 400,
  organ_heart: 400,
  organ_arm: 400,
  organ_leg: 400,
  implant: 100,
};

/** 무기 칸 세부(g): 물리 공격 무기 = 한손검 1.2kg, 원소 공격 무기 = 지팡이 1.8kg */
export const WEAPON_WEIGHT = { physical: 1200, elemental: 1800 } as const;

/** 옛 표에 없는 중분류(g) */
export const ITEM_WEIGHT_BY_SUBCATEGORY: Readonly<Record<string, number>> = {
  // 생활용품 하루치(생필품 daily_goods 한 단위)
  buff_item: 1000,
  blueprint: 20,
  recipe_book: 300,
  medicine: 100,
  drink: 500,
  dish: 500,
  circuit: 10,
  gene: 1,
  machine_part: 500,
  furniture: 15_000,
  facility_module: 50_000,
  defense_structure: 100_000,
  energy_resource: 1000,
};

/** 대분류(g) — 중분류 표에도 없을 때 */
export const ITEM_WEIGHT_BY_CATEGORY: Readonly<Record<string, number>> = {
  raw: 1000,
  processed: 1000,
  part: 300,
  equipment: 1500,
  consumable: 500,
  gem: 5,
  construction: 1500,
  document: 20,
  precious: 10,
};

/** 어느 표에도 없을 때(g) */
export const ITEM_WEIGHT_FALLBACK = 1000;

/** 무게를 고르는 데 쓰는 아이템 칸(팩 항목·편집기 초안이 모두 이 모양을 가진다) */
export interface ItemWeightSource {
  readonly category: string;
  readonly subcategory?: string | undefined;
  readonly equip?:
    | {
        readonly slot: EquipSlot;
        readonly weapon?: { readonly physical?: unknown; readonly elemental?: unknown } | undefined;
      }
    | undefined;
}

/** 분류로 고른 무게 출발값(g) */
export function defaultItemWeight(item: ItemWeightSource): number {
  const equip = item.category === "equipment" ? item.equip : undefined;
  if (equip) {
    if (equip.slot === "weapon" && equip.weapon) {
      if (equip.weapon.elemental !== undefined && equip.weapon.physical === undefined)
        return WEAPON_WEIGHT.elemental;
      return WEAPON_WEIGHT.physical;
    }
    return ITEM_WEIGHT_BY_SLOT[equip.slot];
  }
  const sub = item.subcategory === undefined ? undefined : ITEM_WEIGHT_BY_SUBCATEGORY[item.subcategory];
  if (sub !== undefined) return sub;
  return ITEM_WEIGHT_BY_CATEGORY[item.category] ?? ITEM_WEIGHT_FALLBACK;
}
