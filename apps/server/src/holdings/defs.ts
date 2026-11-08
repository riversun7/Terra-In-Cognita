// 보유 물건 서비스가 읽는 정의(팩 항목 → 보유 판정 칸)와 콘텐츠 스냅숏마다 만드는 찾기 표 — service.ts에서 나눔(파일 1,000줄 상한).
// docs/adr/2026-11-03-item-holdings.md 4절.
import type { EffectEntry, ItemEntry } from "@terra/content";
import type { HeldDef, HoldingContent } from "./serviceTypes.ts";
import type { CooldownKind } from "./state.ts";

/** 팩 항목 → 보유 판정 칸 */
export function heldDefOf(item: ItemEntry): HeldDef {
  const { equip, perish, use, gene } = item;
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    enabled: item.enabled,
    tier: item.tier,
    ...(item.subcategory ? { subcategory: item.subcategory.id } : {}),
    ...(item.stackMax === undefined ? {} : { stackMax: item.stackMax }),
    ...(gene ? { gene: { kind: gene.kind, species: gene.species.id } } : {}),
    ...(perish ? { perish: { shelfLifeMs: perish.shelfLifeMs, spoilsTo: perish.spoilsTo.id } } : {}),
    ...(use
      ? {
          use: {
            effects: use.effects.map((line) => ({
              effect: line.effect.id,
              value: line.value,
              chancePm: line.chancePm,
              ...(line.durationMs === undefined ? {} : { durationMs: line.durationMs }),
              ...(line.scale
                ? { scale: { stat: line.scale.stat, appropriate: line.scale.appropriate } }
                : {}),
              ...(line.variancePm === undefined ? {} : { variancePm: line.variancePm }),
            })),
          },
        }
      : {}),
    ...(equip
      ? {
          equip: {
            slot: equip.slot,
            stats: equip.stats.map((range) => ({
              stat: typeof range.stat === "string" ? range.stat : range.stat.id,
              min: range.min,
              max: range.max,
            })),
            ...(equip.maxDurability === undefined ? {} : { maxDurability: equip.maxDurability }),
            ...(equip.weaponType ? { weaponType: equip.weaponType.id } : {}),
            ...(equip.kinds ? { kinds: equip.kinds.map((kind) => kind.id) } : {}),
            ...(equip.weapon?.ammo ? { ammo: equip.weapon.ammo.id } : {}),
          },
        }
      : {}),
  };
}

/** 콘텐츠 스냅숏마다 한 번 만드는 찾기 표 */
export interface Lookup {
  readonly items: ReadonlyMap<string, HeldDef>;
  readonly effects: ReadonlyMap<string, EffectEntry>;
  readonly unitSlots: ReadonlyMap<string, readonly string[]>;
  readonly ammoTypes: ReadonlySet<string>;
  readonly foodSubcategories: ReadonlySet<string>;
}

export function lookupOf(content: HoldingContent): Lookup {
  return {
    items: new Map(content.items.map((item) => [item.id, heldDefOf(item)])),
    effects: new Map(content.effects.map((effect) => [effect.id, effect])),
    unitSlots: new Map(content.unitKinds.map((kind) => [kind.id, kind.slots])),
    ammoTypes: new Set(content.weaponTypes.filter((type) => type.ammo === true).map((type) => type.id)),
    foodSubcategories: new Set(
      content.itemSubcategories.filter((entry) => entry.food === true).map((entry) => entry.id),
    ),
  };
}

/**
 * 소모품의 쿨 종류(D-509·D-510): 식품 중분류(요리·음료) = food(5분), 그 밖(약·버프·중분류 없음) = potion(30초)
 * (질문 331: 버프 아이템도 물약 쿨인가)
 */
export function cooldownKindOf(def: HeldDef, map: Lookup): CooldownKind {
  return def.subcategory !== undefined && map.foodSubcategories.has(def.subcategory) ? "food" : "potion";
}
