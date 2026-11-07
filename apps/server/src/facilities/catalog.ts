// 건물 서비스가 읽는 시설·아이템 정의(실효 콘텐츠 = 팩 + 건물 편집기·아이템 편집기 덮어쓰기, 바로 든다 D-461)
// docs/adr/2026-11-07-buildings-runtime.md. 팩 참조(ContentRef)를 ID 글자로 바꾼 모양이고, 실효 목록이 바뀔 때만 다시 만든다.
import type { FacilityEntry, ItemEntry } from "@terra/content";
import type { RepairRule } from "@terra/sim";
import type { FacilityBuildJson } from "@terra/shared/facilityBuild";
import type { LocalizedName } from "@terra/shared/roster";

/** 레벨 1 최대 내구도가 팩에 없을 때(옛 코드 기본 max_durability 100) */
export const DEFAULT_FACILITY_DURABILITY = 100;

export interface FacilityDef {
  readonly id: string;
  readonly name: LocalizedName;
  readonly stage: FacilityEntry["stage"];
  readonly maxLevel: number;
  readonly slotsPerLevel: number;
  readonly footprint: { readonly width: number; readonly height: number } | undefined;
  /** 레벨 1 최대 내구도(M15) */
  readonly durability: number;
  readonly storageKg: number | undefined;
  readonly build: FacilityBuildJson | undefined;
  /** 장비 수리 줄(공방, D-512 323). 없으면 장비를 고치지 않는다 */
  readonly repair: readonly RepairRule[] | undefined;
}

export interface FacilityCatalog {
  facility(id: string): FacilityDef | undefined;
  readonly facilities: readonly FacilityDef[];
  /** 재료 한 묶음 무게(g, 아이템 weight × lotSize). 모르면 undefined(건설 시간에서 0으로 센다) */
  weightOf(item: string): number | undefined;
  itemName(item: string): LocalizedName | undefined;
  /** 원장 물자(보유 물건이 아닌 아이템)인가 — 개발 시험 재료 받기 */
  isGoods(item: string): boolean;
}

export interface CatalogSource {
  readonly facilities: readonly FacilityEntry[];
  readonly items: readonly ItemEntry[];
}

function defOf(entry: FacilityEntry): FacilityDef {
  const { build, repair } = entry;
  return {
    id: entry.id,
    name: { ko: entry.name.ko, en: entry.name.en },
    stage: entry.stage,
    maxLevel: entry.maxLevel ?? 5,
    slotsPerLevel: entry.slotsPerLevel,
    footprint: entry.footprint ? { width: entry.footprint.width, height: entry.footprint.height } : undefined,
    durability: entry.durability ?? DEFAULT_FACILITY_DURABILITY,
    storageKg: entry.storageKg,
    build: build
      ? {
          mulPm: build.mulPm,
          levels: build.levels.map((band) => ({
            from: band.from,
            materials: band.materials.map((stack) => ({ item: stack.item.id, qty: stack.qty })),
          })),
        }
      : undefined,
    repair: repair?.map((rule) => ({
      slots: [...rule.slots],
      weaponTypes: rule.weaponTypes.map((type) => type.id),
      materials: rule.materials.map((stack) => ({ item: stack.item.id, qty: stack.qty })),
    })),
  };
}

/** 실효 콘텐츠 접근자 → 시설 목록(목록 객체가 바뀔 때만 다시 만든다) */
export function facilityCatalogOf(source: () => CatalogSource): () => FacilityCatalog {
  let cached:
    | { facilities: readonly FacilityEntry[]; items: readonly ItemEntry[]; value: FacilityCatalog }
    | undefined;
  return () => {
    const current = source();
    if (cached?.facilities === current.facilities && cached.items === current.items) return cached.value;
    const defs = current.facilities.map(defOf);
    const byId = new Map(defs.map((def) => [def.id, def]));
    const items = new Map(current.items.map((item) => [item.id, item]));
    const value: FacilityCatalog = {
      facility: (id) => byId.get(id),
      facilities: defs,
      weightOf(id) {
        const item = items.get(id);
        return item?.weight === undefined ? undefined : item.weight * (item.lotSize ?? 1);
      },
      itemName(id) {
        const item = items.get(id);
        return item ? { ko: item.name.ko, en: item.name.en } : undefined;
      },
      isGoods(id) {
        const item = items.get(id);
        // 보유 물건 모양(장비·신선도·사용 효과 — @terra/sim holdingKindOf와 같은 기준)이 아닌 것 = 원장 물자
        return (
          item !== undefined &&
          item.enabled &&
          item.category !== "equipment" &&
          item.perish === undefined &&
          item.use === undefined
        );
      },
    };
    cached = { facilities: current.facilities, items: current.items, value };
    return value;
  };
}
