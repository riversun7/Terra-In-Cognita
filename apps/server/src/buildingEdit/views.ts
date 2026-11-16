// 건물 편집기 화면 자료(docs/adr/2026-11-02-building-editor.md) — 스냅숏 하나로 만든다.
// 파싱한 팩 항목(참조 = ContentRef)을 화면 JSON(참조 = ID 글자)으로 칸마다 옮긴다(형 검사가 모양을 지킨다).
import type {
  CombatClassEntry,
  FacilityEntry,
  GatherTierEntry,
  ItemEntry,
  ItemSubcategoryEntry,
  RecipeEntry,
  WeaponTypeEntry,
} from "@terra/content";
import type {
  BuildingEditorCombatClass,
  BuildingEditorFacility,
  BuildingEditorGatherBand,
  BuildingEditorItem,
  BuildingEditorRecipe,
  BuildingEditorSubcategory,
  BuildingEditorWeaponType,
  CombatClassJson,
  FacilityJson,
  GatherTierJson,
} from "@terra/shared/buildingEditor";
import { type FacilityLookJson, cleanFacilityLook } from "@terra/shared/facilityLook";
import { type ContentEditState, type ContentSnapshot, contentKey } from "../contentEdit/state.ts";
import { originOf, overrideViewOf } from "../contentEdit/views.ts";

const nameOf = (entry: { name: { ko: string; en: string } }) => ({ ko: entry.name.ko, en: entry.name.en });

/** 파싱한 시설 → 화면 JSON(팩 파일 한 줄 모양, 없는 선택 칸은 적지 않는다) */
export function facilityJsonOf(entry: FacilityEntry): FacilityJson {
  const { gather, build, repair } = entry;
  return {
    id: entry.id,
    name: nameOf(entry),
    stage: entry.stage,
    ...(entry.category === undefined ? {} : { category: entry.category }),
    ...(entry.maxLevel === undefined ? {} : { maxLevel: entry.maxLevel }),
    slotsPerLevel: entry.slotsPerLevel,
    ...(entry.pollution === undefined ? {} : { pollution: entry.pollution }),
    ...(gather
      ? {
          gather: {
            primary: gather.primary,
            secondary: gather.secondary,
            subcategory: gather.subcategory.id,
            ...(gather.extraSubcategories === undefined
              ? {}
              : { extraSubcategories: gather.extraSubcategories.map((sub) => sub.id) }),
            ...(gather.mode === undefined ? {} : { mode: gather.mode }),
            ...(gather.yieldBase === undefined ? {} : { yieldBase: gather.yieldBase }),
            ...(gather.yieldPerStatPm === undefined ? {} : { yieldPerStatPm: gather.yieldPerStatPm }),
            ...(gather.yieldCap === undefined ? {} : { yieldCap: gather.yieldCap }),
            ...(gather.catch === undefined ? {} : { catch: { ...gather.catch } }),
          },
        }
      : {}),
    ...(build
      ? {
          build: {
            mulPm: build.mulPm,
            levels: build.levels.map((band) => ({
              from: band.from,
              materials: band.materials.map((stack) => ({ item: stack.item.id, qty: stack.qty })),
            })),
          },
        }
      : {}),
    ...(repair
      ? {
          repair: repair.map((rule) => ({
            slots: [...rule.slots],
            weaponTypes: rule.weaponTypes.map((type) => type.id),
            materials: rule.materials.map((stack) => ({ item: stack.item.id, qty: stack.qty })),
          })),
        }
      : {}),
    // 건물 런타임 칸(docs/adr/2026-11-07-buildings-runtime.md): 칸 크기·레벨 1 최대 내구도(M15)·창고 용량(N50)
    ...(entry.footprint
      ? { footprint: { width: entry.footprint.width, height: entry.footprint.height } }
      : {}),
    // 물가 조건(질문 947 나)
    ...(entry.needsWaterWithin === undefined ? {} : { needsWaterWithin: entry.needsWaterWithin }),
    ...(entry.durability === undefined ? {} : { durability: entry.durability }),
    ...(entry.storageKg === undefined ? {} : { storageKg: entry.storageKg }),
    // 배 시설 역할·배 종류 표(docs/adr/2026-11-15-shipyard-harbor.md — 편집기는 고치지 않고 그대로 돌려보낸다)
    ...(entry.harbor === undefined ? {} : { harbor: entry.harbor }),
    // 거래소 종류(docs/adr/2026-11-16-exchange-buildings.md — 편집기는 고치지 않고 그대로 돌려보낸다)
    ...(entry.exchange === undefined ? {} : { exchange: entry.exchange }),
    // 물류센터(docs/adr/2026-11-16-logistics-center.md — 편집기는 고치지 않고 그대로 돌려보낸다)
    ...(entry.logistics === true ? { logistics: true as const } : {}),
    ...(entry.boats === undefined
      ? {}
      : {
          boats: entry.boats.map((type) => ({
            id: type.id,
            name: { ko: type.name.ko, en: type.name.en },
            materials: type.materials.map((stack) => ({ item: stack.item.id, qty: stack.qty })),
            buildMs: type.buildMs,
            speedPm: type.speedPm,
            capacity: type.capacity,
            ...(type.fuelCapacity === undefined ? {} : { fuelCapacity: type.fuelCapacity }),
            ...(type.fuelPerHour === undefined ? {} : { fuelPerHour: type.fuelPerHour }),
            ...(type.holdKg === undefined ? {} : { holdKg: type.holdKg }),
            ...(type.fuelItems === undefined
              ? {}
              : { fuelItems: type.fuelItems.map((fuel) => ({ item: fuel.item.id, units: fuel.units })) }),
            ...(type.catchGear === undefined
              ? {}
              : { catchGear: type.catchGear.map((row) => ({ item: row.item.id, maxTier: row.maxTier })) }),
            ...(type.naval === undefined
              ? {}
              : {
                  naval: {
                    shipClass: type.naval.shipClass,
                    hullPoints: type.naval.hullPoints,
                    armor: type.naval.armor,
                    modulePoints: type.naval.modulePoints,
                    guns: type.naval.guns.map((gun) => ({ caliber: gun.caliber, shells: [...gun.shells] })),
                    crew: { ...type.naval.crew },
                    hangar: type.naval.hangar,
                  },
                }),
          })),
        }),
    // 2차맵 겉모습(docs/adr/2026-11-08-building-art.md "바뀜 (2026-11-09)")
    ...(entry.look ? { look: lookJsonOf(entry.look) } : {}),
  };
}

/** 팩 look 칸 → 화면 JSON(빈 칸 빼고 팩 줄 차례) */
function lookJsonOf(look: NonNullable<FacilityEntry["look"]>): FacilityLookJson {
  return cleanFacilityLook(look) ?? {};
}

/** 레시피 → 읽기 전용 줄 */
export function recipeViewOf(recipe: RecipeEntry): BuildingEditorRecipe {
  return {
    id: recipe.id,
    name: nameOf(recipe),
    inputs: recipe.inputs.map((stack) => ({ item: stack.item.id, qty: stack.qty })),
    outputs: recipe.outputs.map((stack) => ({ item: stack.item.id, qty: stack.qty })),
    work: recipe.work,
    enabled: recipe.enabled,
  };
}

/** 시설 목록(실효 항목·팩 항목·덮어쓰기·해시·이 시설의 레시피) */
export function facilityViews(
  state: ContentEditState,
  snapshot: ContentSnapshot,
  recipes: readonly RecipeEntry[],
): BuildingEditorFacility[] {
  const packById = new Map(state.pack.facilities.map((entry) => [entry.id, entry]));
  return snapshot.effective.facilities.map((entry) => {
    const pack = packById.get(entry.id);
    return {
      entry: facilityJsonOf(entry),
      origin: originOf(state, snapshot, "facilities", entry.id),
      pack: pack ? facilityJsonOf(pack) : null,
      override: overrideViewOf(snapshot.overrides.get(contentKey("facilities", entry.id))),
      hash: state.hashOf("facilities", entry.id) ?? "",
      recipes: recipes.filter((recipe) => recipe.facility.id === entry.id).map(recipeViewOf),
    };
  });
}

/** 재료 고르기 창의 아이템(실효 아이템, 파일 차례) */
export function itemOptions(items: readonly ItemEntry[]): BuildingEditorItem[] {
  return items.map((item) => ({
    id: item.id,
    name: nameOf(item),
    category: item.category,
    tier: item.tier,
    subcategory: item.subcategory?.id ?? null,
    weight: item.weight ?? null,
    lotSize: item.lotSize ?? 1,
    enabled: item.enabled,
  }));
}

/** 채집 사다리 중분류 고르기(실효 중분류) */
export function subcategoryOptions(entries: readonly ItemSubcategoryEntry[]): BuildingEditorSubcategory[] {
  return entries.map((entry) => ({
    id: entry.id,
    name: nameOf(entry),
    major: entry.major,
    enabled: entry.enabled,
  }));
}

/** 파싱한 채집 티어 구간 → 화면 JSON(팩 gather_tiers.json 한 줄 모양) */
export function gatherTierJsonOf(entry: GatherTierEntry): GatherTierJson {
  return {
    id: entry.id,
    from: entry.from,
    weightsPm: [...entry.weightsPm],
  };
}

/** 1차 생산 티어 확률표 목록(실효 항목·팩 항목·덮어쓰기·해시) */
export function gatherBandViews(
  state: ContentEditState,
  snapshot: ContentSnapshot,
): BuildingEditorGatherBand[] {
  const packById = new Map(state.pack.gatherTiers.map((entry) => [entry.id, entry]));
  return snapshot.effective.gatherTiers.map((entry) => {
    const pack = packById.get(entry.id);
    return {
      entry: gatherTierJsonOf(entry),
      origin: originOf(state, snapshot, "gather_tiers", entry.id),
      pack: pack ? gatherTierJsonOf(pack) : null,
      override: overrideViewOf(snapshot.overrides.get(contentKey("gather_tiers", entry.id))),
      hash: state.hashOf("gather_tiers", entry.id) ?? "",
    };
  });
}

/** 수리 줄 무기 종류 고르기(실효 무기 종류, 파일 차례, D-512 323) */
export function weaponTypeOptions(entries: readonly WeaponTypeEntry[]): BuildingEditorWeaponType[] {
  return entries.map((entry) => ({ id: entry.id, name: nameOf(entry), slot: entry.slot }));
}

/** 화면 스탯 차례(STR·VIT·INT·WIS·DEX·AGI, @terra/shared PRIMARY_STATS) */
const CLASS_STAT_ORDER = ["str", "vit", "int", "wis", "dex", "agi"] as const;

/** 파싱한 전투 클래스 → 화면 JSON(팩 combat_classes.json 한 줄 모양, 조합 스탯은 화면 스탯 차례, 없는 선택 칸은 적지 않는다) */
export function combatClassJsonOf(entry: CombatClassEntry): CombatClassJson {
  return {
    id: entry.id,
    name: nameOf(entry),
    stats: CLASS_STAT_ORDER.filter((stat) => entry.stats.includes(stat)),
    ...(entry.group === undefined ? {} : { group: entry.group }),
    ...(entry.role === undefined ? {} : { role: { ko: entry.role.ko, en: entry.role.en } }),
    desc: { ko: entry.desc.ko, en: entry.desc.en },
  };
}

/** 전투 클래스 표 목록(실효 항목·팩 항목·덮어쓰기·해시, D-529) */
export function combatClassViews(
  state: ContentEditState,
  snapshot: ContentSnapshot,
): BuildingEditorCombatClass[] {
  const packById = new Map(state.pack.combatClasses.map((entry) => [entry.id, entry]));
  return snapshot.effective.combatClasses.map((entry) => {
    const pack = packById.get(entry.id);
    return {
      entry: combatClassJsonOf(entry),
      origin: originOf(state, snapshot, "combat_classes", entry.id),
      pack: pack ? combatClassJsonOf(pack) : null,
      override: overrideViewOf(snapshot.overrides.get(contentKey("combat_classes", entry.id))),
      hash: state.hashOf("combat_classes", entry.id) ?? "",
    };
  });
}
