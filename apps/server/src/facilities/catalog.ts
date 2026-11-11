// 건물 서비스가 읽는 시설·아이템 정의(실효 콘텐츠 = 팩 + 건물 편집기·아이템 편집기 덮어쓰기, 바로 든다 D-461)
// docs/adr/2026-11-07-buildings-runtime.md. 팩 참조(ContentRef)를 ID 글자로 바꾼 모양이고, 실효 목록이 바뀔 때만 다시 만든다.
import type { FacilityEntry, GatherTierEntry, ItemEntry } from "@terra/content";
import {
  type CatalogGather,
  GATHER_TIERS,
  type GatherBand,
  type RepairRule,
  TEST_GATHER_BANDS,
  itemAsset,
} from "@terra/sim";
import type { FacilityBuildJson } from "@terra/shared/facilityBuild";
import { type FacilityLookJson, cleanFacilityLook } from "@terra/shared/facilityLook";
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
  /** 채집(팩 gather, D-506·D-507: 스탯 짝·중분류·방식·수확량). 채집 시설이 아니면 undefined */
  readonly gather: CatalogGather | undefined;
  /** 2차맵 겉모습(그림 자료, 팩 look — docs/adr/2026-11-08-building-art.md "바뀜 (2026-11-09)"). 없으면 undefined */
  readonly look?: FacilityLookJson | undefined;
}

export interface FacilityCatalog {
  facility(id: string): FacilityDef | undefined;
  readonly facilities: readonly FacilityDef[];
  /** 재료 한 묶음 무게(g, 아이템 weight × lotSize). 모르면 undefined(건설 시간에서 0으로 센다) */
  weightOf(item: string): number | undefined;
  /**
   * 기본 단위 하나의 무게(g, 아이템 weight — 광석은 1g). 원장 잔고(창고·운반)는 기본 단위라 창고 무게는 이것으로 센다(302·D-506). 모르면
   * undefined
   */
  unitWeightOf(item: string): number | undefined;
  itemName(item: string): LocalizedName | undefined;
  /** 원장 물자(보유 물건이 아닌 아이템)인가 — 개발 시험 재료 받기 */
  isGoods(item: string): boolean;
  /**
   * 채집 사다리: 중분류의 티어별 켜진 아이템 자산(item:<ID>, 팩 차례, 길이 10) — @terra/sim simulator/catalog.ts prepareCatalog와 같은 규칙
   * (WP3 플레이어 생산, gatherWork.ts)
   */
  gatherLadder(subcategory: string): readonly (readonly string[])[];
  /** 채집 티어 확률표(팩 gather_tiers 실효 값, 없으면 시험 표 — 팩 core 값과 같다) */
  readonly gatherBands: readonly GatherBand[];
  /** 켜진 아이템 자산 → 묶음 크기(1이 아닌 것만, 광석 1kg = 1,000g) */
  readonly lotSize: ReadonlyMap<string, bigint>;
}

export interface CatalogSource {
  readonly facilities: readonly FacilityEntry[];
  readonly items: readonly ItemEntry[];
  /** 채집 티어 확률표(실효 콘텐츠에 있다 — contentEdit ContentEffective.gatherTiers). 없으면 시험 표 */
  readonly gatherTiers?: readonly GatherTierEntry[] | undefined;
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
    look: cleanFacilityLook(entry.look),
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
    gather: entry.gather
      ? {
          primary: entry.gather.primary,
          secondary: entry.gather.secondary,
          subcategory: entry.gather.subcategory.id,
          mode: entry.gather.mode,
          yieldBase: entry.gather.yieldBase,
          yieldPerStatPm: entry.gather.yieldPerStatPm,
          yieldCap: entry.gather.yieldCap,
          catch: entry.gather.catch,
        }
      : undefined,
  };
}

/** 실효 콘텐츠 접근자 → 시설 목록(목록 객체가 바뀔 때만 다시 만든다) */
export function facilityCatalogOf(source: () => CatalogSource): () => FacilityCatalog {
  let cached:
    | {
        facilities: readonly FacilityEntry[];
        items: readonly ItemEntry[];
        tiers: readonly GatherTierEntry[] | undefined;
        value: FacilityCatalog;
      }
    | undefined;
  return () => {
    const current = source();
    if (
      cached?.facilities === current.facilities &&
      cached.items === current.items &&
      cached.tiers === current.gatherTiers
    )
      return cached.value;
    const defs = current.facilities.map(defOf);
    const byId = new Map(defs.map((def) => [def.id, def]));
    const items = new Map(current.items.map((item) => [item.id, item]));
    const enabled = current.items.filter((item) => item.enabled);
    const ladders = new Map<string, string[][]>();
    const value: FacilityCatalog = {
      facility: (id) => byId.get(id),
      facilities: defs,
      weightOf(id) {
        const item = items.get(id);
        return item?.weight === undefined ? undefined : item.weight * (item.lotSize ?? 1);
      },
      unitWeightOf: (id) => items.get(id)?.weight,
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
      gatherLadder(subcategory) {
        const found = ladders.get(subcategory);
        if (found) return found;
        const ladder = Array.from({ length: GATHER_TIERS }, (): string[] => []);
        for (const item of enabled)
          if (item.subcategory?.id === subcategory)
            ladder[Math.min(GATHER_TIERS - 1, item.tier)]?.push(itemAsset(item.id));
        ladders.set(subcategory, ladder);
        return ladder;
      },
      gatherBands:
        current.gatherTiers && current.gatherTiers.length > 0
          ? current.gatherTiers.map((band) => ({ from: band.from, weightsPm: [...band.weightsPm] }))
          : TEST_GATHER_BANDS,
      lotSize: new Map(
        enabled
          .filter((item) => (item.lotSize ?? 1) !== 1)
          .map((item) => [itemAsset(item.id), BigInt(item.lotSize ?? 1)]),
      ),
    };
    cached = { facilities: current.facilities, items: current.items, tiers: current.gatherTiers, value };
    return value;
  };
}
