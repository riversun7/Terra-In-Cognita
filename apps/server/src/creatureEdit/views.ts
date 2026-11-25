// 크리처 편집기 화면 자료(/dev/creatures) — 스냅숏 하나로 만든다.
// 파싱한 팩 항목(참조 = ContentRef)을 화면 JSON(참조 = ID 글자)으로 칸마다 옮긴다.
import type { CreatureClassEntry, CreatureEntry, ItemEntry, SkillEntry, UnitKindEntry } from "@terra/content";
import type {
  CreatureClassJson,
  CreatureClassRow,
  CreatureEditorItemOption,
  CreatureEditorRow,
  CreatureEditorSkillOption,
  CreatureEditorUnitKindOption,
  CreatureJson,
  CreatureNaturalWeaponJson,
} from "@terra/shared/creatureEditor";
import { type ContentEditState, type ContentSnapshot, contentKey } from "../contentEdit/state.ts";
import { originOf, overrideViewOf } from "../contentEdit/views.ts";

const nameOf = (entry: { name: { ko: string; en: string } }) => ({ ko: entry.name.ko, en: entry.name.en });

function weaponJsonOf(weapon: NonNullable<CreatureEntry["naturalWeapon"]>): CreatureNaturalWeaponJson {
  return {
    ...(weapon.name ? { name: { ko: weapon.name.ko, en: weapon.name.en } } : {}),
    ...(weapon.appropriate === undefined ? {} : { appropriate: weapon.appropriate }),
    ...(weapon.physical
      ? {
          physical: {
            attack: weapon.physical.attack,
            min: weapon.physical.min,
            max: weapon.physical.max,
            ...(weapon.physical.elementsPm ? { elementsPm: [...weapon.physical.elementsPm] } : {}),
          },
        }
      : {}),
    ...(weapon.elemental
      ? {
          elemental: {
            attack: weapon.elemental.attack,
            min: weapon.elemental.min,
            max: weapon.elemental.max,
            ...(weapon.elemental.elementsPm ? { elementsPm: [...weapon.elemental.elementsPm] } : {}),
          },
        }
      : {}),
    ...(weapon.skillElementsPm ? { skillElementsPm: [...weapon.skillElementsPm] } : {}),
    ...(weapon.hitPm === undefined ? {} : { hitPm: weapon.hitPm }),
    ...(weapon.critPm === undefined ? {} : { critPm: weapon.critPm }),
    intervalMs: weapon.intervalMs,
    range: weapon.range,
    ...(weapon.arc === undefined ? {} : { arc: weapon.arc }),
    ...(weapon.staminaCost === undefined ? {} : { staminaCost: weapon.staminaCost }),
    ...(weapon.mpCost === undefined ? {} : { mpCost: weapon.mpCost }),
    ...(weapon.stats
      ? {
          stats: weapon.stats.map((row) => ({
            stat: row.stat,
            min: row.min,
            max: row.max,
          })),
        }
      : {}),
  };
}

/** 파싱한 크리처 → 화면 JSON(팩 파일 한 줄 모양, 없는 선택 칸은 적지 않는다) */
export function creatureJsonOf(entry: CreatureEntry): CreatureJson {
  return {
    id: entry.id,
    name: nameOf(entry),
    ...(entry.description ? { description: { ko: entry.description.ko, en: entry.description.en } } : {}),
    category: entry.category.id,
    grade: entry.grade,
    size: entry.size,
    ...(entry.giant3Tile === undefined ? {} : { giant3Tile: entry.giant3Tile }),
    ...(entry.tags ? { tags: [...entry.tags] } : {}),
    ...(entry.image === undefined ? {} : { image: entry.image }),
    ...(entry.portraitCrop
      ? {
          portraitCrop: {
            cxPm: entry.portraitCrop.cxPm,
            cyPm: entry.portraitCrop.cyPm,
            radiusPm: entry.portraitCrop.radiusPm,
          },
        }
      : {}),
    ...(entry.model === undefined ? {} : { model: entry.model }),
    ...(entry.variantOf ? { variantOf: entry.variantOf.id } : {}),
    primaries: {
      str: entry.primaries.str,
      dex: entry.primaries.dex,
      agi: entry.primaries.agi,
      vit: entry.primaries.vit,
      int: entry.primaries.int,
      wis: entry.primaries.wis,
    },
    ...(entry.primarySpread
      ? {
          primarySpread: {
            str: entry.primarySpread.str,
            dex: entry.primarySpread.dex,
            agi: entry.primarySpread.agi,
            vit: entry.primarySpread.vit,
            int: entry.primarySpread.int,
            wis: entry.primarySpread.wis,
          },
        }
      : {}),
    elements: [...entry.elements],
    ...(entry.resistPm ? { resistPm: [...entry.resistPm] } : {}),
    ...(entry.allowedSubspecies ? { allowedSubspecies: [...entry.allowedSubspecies] } : {}),
    skillSlots: {
      base: entry.skillSlots.base,
      perRebirth: entry.skillSlots.perRebirth,
      max: entry.skillSlots.max,
    },
    ...(entry.skills
      ? {
          skills: entry.skills.map((link) => ({
            skill: link.skill.id,
            ...(link.unlockLevel === undefined ? {} : { unlockLevel: link.unlockLevel }),
            ...(link.innate === undefined ? {} : { innate: link.innate }),
          })),
        }
      : {}),
    ...(entry.naturalWeapon ? { naturalWeapon: weaponJsonOf(entry.naturalWeapon) } : {}),
    ...(entry.drops
      ? {
          drops: entry.drops.map((drop) => ({
            item: drop.item.id,
            chancePm: drop.chancePm,
            min: drop.min,
            max: drop.max,
          })),
        }
      : {}),
    ...(entry.unitKind ? { unitKind: entry.unitKind.id } : {}),
    enabled: entry.enabled,
  };
}

/** 크리처 목록(실효 항목·팩 항목·덮어쓰기·해시) */
export function creatureViews(state: ContentEditState, snapshot: ContentSnapshot): CreatureEditorRow[] {
  const packById = new Map(state.pack.creatures.map((entry) => [entry.id, entry]));
  return snapshot.effective.creatures.map((entry) => {
    const pack = packById.get(entry.id);
    return {
      entry: creatureJsonOf(entry),
      origin: originOf(state, snapshot, "creatures", entry.id),
      pack: pack ? creatureJsonOf(pack) : null,
      override: overrideViewOf(snapshot.overrides.get(contentKey("creatures", entry.id))),
      hash: state.hashOf("creatures", entry.id) ?? "",
    };
  });
}

/** 파싱한 분류 → 화면 JSON(팩 파일 한 줄 모양) */
export function creatureClassJsonOf(entry: CreatureClassEntry): CreatureClassJson {
  return {
    id: entry.id,
    name: nameOf(entry),
    ...(entry.parent ? { parent: entry.parent.id } : {}),
    ...(entry.icon === undefined ? {} : { icon: entry.icon }),
  };
}

/** 분류 트리(실효 항목·팩 항목·덮어쓰기·해시, 파일 차례) */
export function creatureClassViews(state: ContentEditState, snapshot: ContentSnapshot): CreatureClassRow[] {
  const packById = new Map(state.pack.creatureClasses.map((entry) => [entry.id, entry]));
  return snapshot.effective.creatureClasses.map((entry) => {
    const pack = packById.get(entry.id);
    return {
      entry: creatureClassJsonOf(entry),
      origin: originOf(state, snapshot, "creature_classes", entry.id),
      pack: pack ? creatureClassJsonOf(pack) : null,
      override: overrideViewOf(snapshot.overrides.get(contentKey("creature_classes", entry.id))),
      hash: state.hashOf("creature_classes", entry.id) ?? "",
    };
  });
}

/** 드롭 테이블 아이템 고르기 창(실효 아이템, 파일 차례) */
export function creatureItemOptions(items: readonly ItemEntry[]): CreatureEditorItemOption[] {
  return items.map((item) => ({
    id: item.id,
    name: nameOf(item),
    category: item.category,
    tier: item.tier,
    startPrice: item.startPrice ?? null,
    enabled: item.enabled,
  }));
}

/** 스킬 고르기 창(실효 스킬, 파일 차례) */
export function creatureSkillOptions(skills: readonly SkillEntry[]): CreatureEditorSkillOption[] {
  return skills.map((skill) => ({
    id: skill.id,
    name: nameOf(skill),
    base: skill.base,
    bareHand: skill.bareHand === true,
    enabled: skill.enabled,
  }));
}

/** 유닛 종류 고르기 창(실효 유닛 종류, 파일 차례) */
export function creatureUnitKindOptions(unitKinds: readonly UnitKindEntry[]): CreatureEditorUnitKindOption[] {
  return unitKinds.map((kind) => ({
    id: kind.id,
    name: nameOf(kind),
    slots: [...kind.slots],
    enabled: kind.enabled,
  }));
}
