// 아이템 편집기 화면 자료 — 파싱한 팩 항목(참조 = ContentRef)을 화면 JSON(참조 = ID 문자열)으로 칸마다 옮긴다(형 검사가 모양을 지킨다).
// docs/adr/2026-11-01-item-editor.md 3절. 목록은 요약(ItemRow)만, 항목 통째는 items.get.
import type { ItemEntry, ItemSubcategoryEntry, ItemTagEntry, WeaponTypeEntry } from "@terra/content";
import type { ContentEditCategory, ContentEditOrigin } from "@terra/shared/contentEdit";
import {
  type ItemEquipJson,
  type ItemJson,
  type ItemRow,
  type ItemTagJson,
  type ItemWeaponJson,
  type SubcategoryJson,
  type TaxonomyRow,
  type WeaponTypeJson,
  defaultStorageOf,
  marketKindOf,
} from "@terra/shared/itemEditor";
import type { ContentEditState, ContentSnapshot } from "../contentEdit/state.ts";
import { contentKey } from "../contentEdit/state.ts";

const idOf = (ref: { readonly id: string }): string => ref.id;
const name = (text: { ko: string; en: string }) => ({ ko: text.ko, en: text.en });

type PackWeapon = NonNullable<NonNullable<ItemEntry["equip"]>["weapon"]>;

function weaponJsonOf(weapon: PackWeapon): ItemWeaponJson {
  return {
    ...(weapon.physical ? { physical: { ...weapon.physical } } : {}),
    ...(weapon.elemental ? { elemental: { ...weapon.elemental } } : {}),
    ...(weapon.basic === undefined ? {} : { basic: weapon.basic }),
    hitPm: weapon.hitPm,
    critPm: weapon.critPm,
    intervalMs: weapon.intervalMs,
    range: weapon.range,
    arc: weapon.arc,
    staminaCost: weapon.staminaCost,
    mpCost: weapon.mpCost,
    ...(weapon.skillElementsPm ? { skillElementsPm: [...weapon.skillElementsPm] } : {}),
    ...(weapon.appropriate ? { appropriate: { ...weapon.appropriate } } : {}),
    ...(weapon.twoHanded === undefined ? {} : { twoHanded: weapon.twoHanded }),
    ...(weapon.ammo ? { ammo: weapon.ammo.id } : {}),
  };
}

function equipJsonOf(equip: NonNullable<ItemEntry["equip"]>): ItemEquipJson {
  return {
    slot: equip.slot,
    stats: equip.stats.map((range) => ({
      stat: typeof range.stat === "string" ? range.stat : range.stat.id,
      min: range.min,
      max: range.max,
    })),
    ...(equip.weapon ? { weapon: weaponJsonOf(equip.weapon) } : {}),
    ...(equip.skills ? { skills: equip.skills.map(idOf) } : {}),
    ...(equip.elements ? { elements: equip.elements.map((entry) => ({ ...entry })) } : {}),
    ...(equip.weaponType ? { weaponType: equip.weaponType.id } : {}),
    ...(equip.maxDurability === undefined ? {} : { maxDurability: equip.maxDurability }),
    ...(equip.combat
      ? {
          combat: {
            ...(equip.combat.resistPm ? { resistPm: [...equip.combat.resistPm] } : {}),
            ...(equip.combat.defenseFlat === undefined ? {} : { defenseFlat: equip.combat.defenseFlat }),
            ...(equip.combat.penetrationPm === undefined
              ? {}
              : { penetrationPm: equip.combat.penetrationPm }),
          },
        }
      : {}),
    ...(equip.kinds ? { kinds: equip.kinds.map(idOf) } : {}),
    ...(equip.creature ? { creature: { ...equip.creature } } : {}),
  };
}

/** 파싱한 아이템 → 화면 JSON(팩 파일 한 줄 모양) */
export function itemJsonOf(entry: ItemEntry): ItemJson {
  return {
    id: entry.id,
    name: name(entry.name),
    ...(entry.description ? { description: name(entry.description) } : {}),
    category: entry.category,
    ...(entry.subcategory ? { subcategory: entry.subcategory.id } : {}),
    ...(entry.microcategory === undefined ? {} : { microcategory: entry.microcategory }),
    ...(entry.tags ? { tags: entry.tags.map(idOf) } : {}),
    tier: entry.tier,
    startPrice: entry.startPrice,
    ...(entry.weight === undefined ? {} : { weight: entry.weight }),
    ...(entry.lotSize === undefined ? {} : { lotSize: entry.lotSize }),
    ...(entry.stackMax === undefined ? {} : { stackMax: entry.stackMax }),
    ...(entry.tradable === undefined ? {} : { tradable: entry.tradable }),
    ...(entry.bound === undefined ? {} : { bound: entry.bound }),
    ...(entry.icon === undefined ? {} : { icon: entry.icon }),
    ...(entry.equip ? { equip: equipJsonOf(entry.equip) } : {}),
    ...(entry.perish
      ? { perish: { shelfLifeMs: entry.perish.shelfLifeMs, spoilsTo: entry.perish.spoilsTo.id } }
      : {}),
    ...(entry.use
      ? {
          use: {
            effects: entry.use.effects.map((part) => ({
              effect: part.effect.id,
              value: part.value,
              chancePm: part.chancePm,
              ...(part.durationMs === undefined ? {} : { durationMs: part.durationMs }),
              ...(part.scale ? { scale: { ...part.scale } } : {}),
              ...(part.variancePm === undefined ? {} : { variancePm: part.variancePm }),
            })),
          },
        }
      : {}),
    enabled: entry.enabled,
  };
}

export function subcategoryJsonOf(entry: ItemSubcategoryEntry): SubcategoryJson {
  return {
    id: entry.id,
    name: name(entry.name),
    major: entry.major,
    ...(entry.order === undefined ? {} : { order: entry.order }),
    ...(entry.storage === undefined ? {} : { storage: entry.storage }),
    ...(entry.food === undefined ? {} : { food: entry.food }),
    ...(entry.foodFamily === undefined ? {} : { foodFamily: entry.foodFamily }),
    ...(entry.micros
      ? {
          micros: entry.micros.map((micro) => ({
            id: micro.id,
            name: name(micro.name),
            ...(micro.slot === undefined ? {} : { slot: micro.slot }),
            ...(micro.ammo === undefined ? {} : { ammo: micro.ammo }),
            enabled: micro.enabled,
          })),
        }
      : {}),
    enabled: entry.enabled,
  };
}

export const tagJsonOf = (entry: ItemTagEntry): ItemTagJson => ({
  id: entry.id,
  name: name(entry.name),
  enabled: entry.enabled,
});

export function weaponTypeJsonOf(entry: WeaponTypeEntry): WeaponTypeJson {
  return {
    id: entry.id,
    name: name(entry.name),
    slot: entry.slot,
    ...(entry.order === undefined ? {} : { order: entry.order }),
    ...(entry.ammo === undefined ? {} : { ammo: entry.ammo }),
    enabled: entry.enabled,
  };
}

export function originOf(
  state: ContentEditState,
  snapshot: ContentSnapshot,
  category: ContentEditCategory,
  id: string,
): ContentEditOrigin {
  if (!state.packEntry(category, id)) return "created";
  return snapshot.overrides.has(contentKey(category, id)) ? "edited" : "pack";
}

/** 분류 자료 줄들(실효 차례, 목록 차례 칸 order가 있으면 그것 먼저) */
export function taxonomyRows<E extends { id: string; order?: number | undefined }, J>(
  state: ContentEditState,
  snapshot: ContentSnapshot,
  category: ContentEditCategory,
  entries: readonly E[],
  toJson: (entry: E) => J,
): TaxonomyRow<J>[] {
  const ordered = entries
    .map((entry, index) => ({ entry, index }))
    .toSorted((a, b) => (a.entry.order ?? 10_001) - (b.entry.order ?? 10_001) || a.index - b.index);
  return ordered.map(({ entry }) => ({
    entry: toJson(entry),
    origin: originOf(state, snapshot, category, entry.id),
    hash: state.hashOf(category, entry.id) ?? "",
  }));
}

/** 목록 한 줄(요약) */
export function itemRowOf(
  state: ContentEditState,
  snapshot: ContentSnapshot,
  entry: ItemEntry,
  extra: {
    readonly advice: number;
    readonly codeRef: boolean;
    readonly foodSubcategories: ReadonlySet<string>;
  },
  storageOf: (subcategory: string | undefined) => string | undefined,
): ItemRow {
  const weapon = entry.equip?.weapon;
  const food = entry.subcategory ? extra.foodSubcategories.has(entry.subcategory.id) : false;
  const storage = storageOf(entry.subcategory?.id);
  return {
    id: entry.id,
    name: name(entry.name),
    category: entry.category,
    subcategory: entry.subcategory?.id ?? null,
    microcategory: entry.microcategory ?? null,
    tags: (entry.tags ?? []).map(idOf),
    tier: entry.tier,
    startPrice: entry.startPrice,
    weight: entry.weight ?? null,
    enabled: entry.enabled,
    origin: originOf(state, snapshot, "items", entry.id),
    hash: state.hashOf("items", entry.id) ?? "",
    storage:
      storage === "food" || storage === "armory" || storage === "general" || storage === "tank"
        ? storage
        : defaultStorageOf(entry.category, food),
    market: marketKindOf(entry),
    slot: entry.equip?.slot ?? null,
    weaponType: entry.equip?.weaponType?.id ?? null,
    kinds: (entry.equip?.kinds ?? []).map(idOf),
    attack: weapon
      ? { physical: weapon.physical?.attack ?? null, elemental: weapon.elemental?.attack ?? null }
      : null,
    appropriate: weapon?.appropriate ? { ...weapon.appropriate } : null,
    stats: (entry.equip?.stats ?? []).slice(0, 3).map((range) => ({
      stat: typeof range.stat === "string" ? range.stat : range.stat.id,
      min: range.min,
      max: range.max,
    })),
    effects: (entry.use?.effects ?? []).map((part) => part.effect.id),
    shelfLifeMs: entry.perish?.shelfLifeMs ?? null,
    advice: extra.advice,
    codeRef: extra.codeRef,
  };
}
