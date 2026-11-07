// 보유 물건 시험 자료 — 실제 팩(유닛 종류 칸 배치·무기 종류·효과 사전) 위에 시험 아이템·효과를 더한다. 시험 파일끼리 import하지 않게 여기에 둔다.
// 값은 형식 확인용 가짜 값이다(게임 수치 아님).
import { type EffectEntry, type ItemEntry, effectEntrySchema, itemEntrySchema } from "@terra/content";
import { loadContentPack } from "@terra/content/node";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { type HoldingRules, TEST_HOLDING_RULES } from "./rules.ts";
import type { HoldingContent } from "./service.ts";

export const HOUR_MS = 3_600_000;

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source) throw new Error("content pack");
const pack = createContentEditState(loaded.source).effective();

const name = (id: string) => ({ ko: id, en: id });

const item = (raw: Record<string, unknown>): ItemEntry =>
  itemEntrySchema.parse({ tier: 1, startPrice: 1, enabled: true, name: name(String(raw.id)), ...raw });

const buff = (
  id: string,
  exclusive: string | undefined,
  kind = "buff",
  durationMs = HOUR_MS,
  stat = "attack",
): EffectEntry =>
  effectEntrySchema.parse({
    id,
    name: name(id),
    durationMs,
    kind,
    ...(kind === "buff" ? { stat } : {}),
    valueMode: "flat",
    tickMs: 0,
    stacking: "refresh",
    maxStacks: 1,
    ...(exclusive ? { exclusive } : {}),
    enabled: true,
  });

/**
 * 시험 아이템: 내구도 장비, 탄약(화살통 3발·50발), 신선도 묶음(72시간 → 썩은 생선), 신선도 있는 음료, 요리·버프 아이템(같은 배타 묶음,
 * 쿨 종류는 다름), 24시간 버프 약, 회복약, 꺼진 장비, 내구도 있는 검, 탄약을 쓰는 활, 주기 회복 연고, 1차 스탯(STR) 버프 빵
 */
export const TEST_HOLDING_ITEMS: readonly ItemEntry[] = [
  item({
    id: "hold_vest",
    category: "equipment",
    equip: {
      slot: "body",
      stats: [
        { stat: "defense_rate", min: 30, max: 60 },
        { stat: "armor_hp", min: 20, max: 40 },
      ],
      maxDurability: 100,
    },
  }),
  item({
    id: "hold_quiver",
    category: "equipment",
    equip: { slot: "offhand", stats: [], weaponType: "quiver", maxDurability: 3 },
  }),
  item({
    id: "hold_quiver_b",
    category: "equipment",
    equip: { slot: "offhand", stats: [], weaponType: "quiver", maxDurability: 50 },
  }),
  item({
    id: "hold_ring",
    category: "equipment",
    equip: { slot: "accessory", stats: [{ stat: "str", min: 1, max: 3 }] },
  }),
  item({
    id: "hold_fish",
    category: "raw",
    stackMax: 50,
    perish: { shelfLifeMs: 72 * HOUR_MS, spoilsTo: "hold_rotten_fish" },
  }),
  item({ id: "hold_rotten_fish", category: "raw" }),
  // 신선도 있는 요리(D-512 320 효과 × 신선도): 10시간이면 상한다
  item({
    id: "hold_milk",
    category: "consumable",
    subcategory: "drink",
    perish: { shelfLifeMs: 10 * HOUR_MS, spoilsTo: "hold_rotten_fish" },
    use: {
      effects: [
        {
          effect: "hold_meal_str",
          value: 40,
          chancePm: 1000,
          scale: { stat: "vit", appropriate: 10 },
          variancePm: 250,
        },
      ],
    },
  }),
  // 1시간이 넘는 버프(D-512 328: 지속은 편집기 값, 1시간 상한 없음)
  item({
    id: "hold_long_tonic",
    category: "consumable",
    subcategory: "medicine",
    use: { effects: [{ effect: "hold_vigor", value: 7, chancePm: 1000, durationMs: 24 * HOUR_MS }] },
  }),
  item({
    id: "hold_stew",
    category: "consumable",
    subcategory: "dish",
    stackMax: 20,
    use: {
      effects: [
        {
          effect: "hold_meal_str",
          value: 40,
          chancePm: 1000,
          scale: { stat: "vit", appropriate: 10 },
          variancePm: 250,
        },
      ],
    },
  }),
  item({
    id: "hold_soup",
    category: "consumable",
    subcategory: "buff_item",
    use: { effects: [{ effect: "hold_meal_int", value: 30, chancePm: 1000 }] },
  }),
  item({
    id: "hold_tonic",
    category: "consumable",
    subcategory: "medicine",
    use: { effects: [{ effect: "hold_vigor", value: 5, chancePm: 1000 }] },
  }),
  item({
    id: "hold_potion",
    category: "consumable",
    subcategory: "medicine",
    use: { effects: [{ effect: "hold_mend", value: 100, chancePm: 1000 }] },
  }),
  item({
    id: "hold_big_potion",
    category: "consumable",
    subcategory: "medicine",
    use: { effects: [{ effect: "hold_mend", value: 400, chancePm: 1000 }] },
  }),
  item({
    id: "hold_mega_potion",
    category: "consumable",
    subcategory: "medicine",
    use: { effects: [{ effect: "hold_mend", value: 800, chancePm: 1000 }] },
  }),
  item({ id: "hold_off", category: "equipment", enabled: false, equip: { slot: "body", stats: [] } }),
  // 내구도 있는 무기(입은 장비 → 스탯·전투 시험): 무기 사양은 팩 시험 검과 같다(공격력 20·적정 STR 25·DEX 12·AGI 12)
  item({
    id: "hold_sword",
    category: "equipment",
    equip: {
      slot: "weapon",
      stats: [{ stat: "crit_multiplier", min: 0, max: 100 }],
      weapon: {
        physical: { attack: 20 },
        appropriate: { str: 25, dex: 12, agi: 12 },
        hitPm: 900,
        critPm: 100,
        intervalMs: 1000,
        range: 1,
        arc: false,
        staminaCost: 10,
        mpCost: 0,
      },
      maxDurability: 10,
    },
  }),
  // 탄약을 쓰는 활(287·D-497: 화살통 종류, 원거리 6칸)
  item({
    id: "hold_bow",
    category: "equipment",
    equip: {
      slot: "weapon",
      stats: [],
      weapon: {
        physical: { attack: 18 },
        appropriate: { str: 10, dex: 10, agi: 10 },
        hitPm: 900,
        critPm: 100,
        intervalMs: 1000,
        range: 6,
        arc: false,
        staminaCost: 10,
        mpCost: 0,
        ammo: "quiver",
      },
    },
  }),
  // 주기 회복 연고(D-514 346: 1초마다 5, 10초 — 전투 중에는 걸린 효과, 전투 밖에서는 분 단위)
  item({
    id: "hold_regen_salve",
    category: "consumable",
    subcategory: "medicine",
    use: { effects: [{ effect: "hold_regen", value: 5, chancePm: 1000, durationMs: 10_000 }] },
  }),
  // 1차 스탯 버프 요리(D-472 모양: STR 고정값 +, 1시간)
  item({
    id: "hold_bread",
    category: "consumable",
    subcategory: "buff_item",
    use: { effects: [{ effect: "hold_food_str", value: 6, chancePm: 1000 }] },
  }),
];

export const TEST_HOLDING_EFFECTS: readonly EffectEntry[] = [
  buff("hold_meal_str", "meal"),
  buff("hold_meal_int", "meal"),
  buff("hold_mend", undefined, "heal", 0),
  buff("hold_vigor", undefined),
  buff("hold_food_str", "meal", "buff", HOUR_MS, "str"),
  effectEntrySchema.parse({
    id: "hold_regen",
    name: name("hold_regen"),
    durationMs: 10_000,
    kind: "heal",
    valueMode: "flat",
    tickMs: 1000,
    stacking: "refresh",
    maxStacks: 1,
    enabled: true,
  }),
];

/** 팩 스킬(실효 항목, 유닛 화면 전투 자료를 시험 아이템과 함께 만들 때) */
export const TEST_PACK_SKILLS = pack.skills;

/** 팩 유닛 종류·무기 종류·효과 + 시험 아이템·효과 */
export const TEST_HOLDING_CONTENT: HoldingContent = {
  items: [...pack.items, ...TEST_HOLDING_ITEMS],
  itemSubcategories: pack.itemSubcategories,
  effects: [...pack.effects, ...TEST_HOLDING_EFFECTS],
  unitKinds: pack.unitKinds,
  weaponTypes: pack.weaponTypes,
};

/** 시험 규칙: 닳기만 바꾼다(확률 ‰·양) */
export function rulesWithWear(wear: {
  readonly chancePm: number;
  readonly amount: number;
  readonly lossChancePm: number;
  readonly lossAmount: number;
}): HoldingRules {
  return {
    ...TEST_HOLDING_RULES,
    durability: {
      ...TEST_HOLDING_RULES.durability,
      wearChancePm: wear.chancePm,
      wearAmount: wear.amount,
      wearLossChancePm: wear.lossChancePm,
      wearLossAmount: wear.lossAmount,
    },
  };
}
