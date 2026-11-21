// 건물 서비스가 읽는 시설·아이템 정의(실효 콘텐츠 = 팩 + 건물 편집기·아이템 편집기 덮어쓰기, 바로 든다 D-461)
// docs/adr/2026-11-07-buildings-runtime.md. 팩 참조(ContentRef)를 ID 글자로 바꾼 모양이고, 실효 목록이 바뀔 때만 다시 만든다.
import {
  type FacilityEntry,
  type GatherTierEntry,
  type ItemEntry,
  type ItemSubcategoryEntry,
  gatherBandOfEntry,
} from "@terra/content";
import {
  type CatalogGather,
  GATHER_TIERS,
  type GatherBand,
  type RepairRule,
  type GatherSubcategorySource,
  TEST_GATHER_BANDS,
  gatherLadderKey,
  gatherSubcategories,
  itemAsset,
} from "@terra/sim";
import { bareHandAcceptsOf, bareHandFlag } from "@terra/shared/bareHandMaterials";
import type { ExchangeKind } from "@terra/shared/exchange";
import type { FacilityBuildJson } from "@terra/shared/facilityBuild";
import { type FacilityCategory, facilityCategoryOf } from "@terra/shared/facilityCategory";
import { type FacilityLookJson, cleanFacilityLook } from "@terra/shared/facilityLook";
import type { HarborRole } from "@terra/shared/harbor";
import type { CatchGear, FuelItem, NavalSpec } from "@terra/shared/naval";
import type { LocalizedName } from "@terra/shared/roster";

/** 레벨 1 최대 내구도가 팩에 없을 때(옛 코드 기본 max_durability 100) */
export const DEFAULT_FACILITY_DURABILITY = 100;

export interface FacilityDef {
  readonly id: string;
  readonly name: LocalizedName;
  readonly stage: FacilityEntry["stage"];
  /** 시설 분류(기획 D-560, 팩 칸 → 생산 단계에서 고른 값). 화면 묶음·이름표 색만 — 판정에 쓰지 않는다 */
  readonly category?: FacilityCategory | undefined;
  readonly maxLevel: number;
  readonly slotsPerLevel: number;
  readonly footprint: { readonly width: number; readonly height: number } | undefined;
  /** 물가 조건(배치 칸 반경, 팩 needsWaterWithin — 질문 947 나). 없으면 땅 조건 없음 */
  readonly needsWaterWithin?: number | undefined;
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
  /** 배 시설 역할(조선소·정박장·교역 부두 — docs/adr/2026-11-15-shipyard-harbor.md). 없으면 배 시설이 아니다 */
  readonly harbor?: HarborRole | undefined;
  /** 조선소의 배 종류 표(D-547 1484). 조선소가 아니면 undefined */
  readonly boats?: readonly BoatTypeDef[] | undefined;
  /** 거래소 종류(기획 D-561, docs/adr/2026-11-16-exchange-buildings.md). 없으면 거래소가 아니다 */
  readonly exchange?: ExchangeKind | undefined;
  /** 물류센터(운반 대행 사업장 — docs/adr/2026-11-16-logistics-center.md). 없으면 물류센터가 아니다 */
  readonly logistics?: true | undefined;
}

/** 배 종류 한 줄(팩 참조를 ID 글자로) */
export interface BoatTypeDef {
  readonly id: string;
  readonly name: LocalizedName;
  readonly materials: readonly { readonly item: string; readonly qty: number }[];
  readonly buildMs: number;
  readonly speedPm: number;
  readonly capacity: number;
  /** 연료 통·한 시간 연료(D-559 1529, 없으면 설정 칸) */
  readonly fuelCapacity?: number | undefined;
  readonly fuelPerHour?: number | undefined;
  /** 함선 칸(D-559 1533·1537, 없으면 함장 1·갑판병 1) */
  readonly naval?: NavalSpec | undefined;
  /** 배 창고(kg, D-568, 없으면 설정 칸 boat_hold_kg)·태우는 연료 아이템(D-564 1687, 없으면 보급 못 함) */
  readonly holdKg?: number | undefined;
  readonly fuelItems?: readonly FuelItem[] | undefined;
  /** 함포 칸에 다는 포획 장비(D-570 1821, 없으면 달지 못함) */
  readonly catchGear?: readonly CatchGear[] | undefined;
}

export interface FacilityCatalog {
  facility(id: string): FacilityDef | undefined;
  readonly facilities: readonly FacilityDef[];
  /** 건설 재료 한 기본 단위의 무게(g, 짓기 수량은 기본 단위). 모르면 undefined(건설 시간에서 0으로 센다) */
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
   * 기본 단위 하나의 기준 값(팩 startPrice ÷ 묶음 크기, 내림, 최소 1) — 사업장 창고 판매 처음 값·주인 꺼내기 값(D-555 1507 [임시]). 모르면 undefined
   */
  unitPriceOf?(item: string): bigint | undefined;
  /**
   * 채집 사다리: 시설 채집 칸의 중분류들(주 + 함께 내는 것, 질문 946 나)의 티어별 켜진 아이템 자산(item:<ID>, 팩 차례, 길이 10) —
   * @terra/sim simulator/catalog.ts prepareCatalog와 같은 규칙(WP3 플레이어 생산, gatherWork.ts)
   */
  gatherLadder(gather: GatherSubcategorySource): readonly (readonly string[])[];
  /** 채집 티어 확률표(팩 gather_tiers 실효 값, 없으면 시험 표 — 팩 core 값과 같다) */
  readonly gatherBands: readonly GatherBand[];
  /** 켜진 아이템 자산 → 묶음 크기(1이 아닌 것만, 광석 1kg = 1,000g) */
  readonly lotSize: ReadonlyMap<string, bigint>;
  /** 식품 중분류 ID(item_subcategories food: true, 켜진 것 — 컨디션 좋아하는 음식 후보, D-535 1151 나). 중분류 목록이 없으면 빈 목록 */
  readonly foodSubcategories: readonly string[];
  /** 아이템의 중분류 ID(없으면 undefined) */
  subcategoryOf(item: string): string | undefined;
  /** 아이템 티어(없으면 undefined — 오브젝트 대표 아이템 티어, 기획 D-552) */
  itemTier(item: string): number | undefined;
  /**
   * 재료 줄 아이템 → 그 줄로 받는 아이템(첫째 = 그 아이템, 원자재 T0~T1이면 같은 중분류 켜진 T0~T1 — 기획 D-562 1563·1564,
   * @terra/shared/bareHandMaterials). 없으면 그 아이템만 받는다(옛 시험 목록)
   */
  bareHandAccepts?(item: string): readonly string[];
  /** 중분류 이름(목록에 없으면 undefined) */
  subcategoryName(id: string): LocalizedName | undefined;
}

export interface CatalogSource {
  readonly facilities: readonly FacilityEntry[];
  readonly items: readonly ItemEntry[];
  /** 채집 티어 확률표(실효 콘텐츠에 있다 — contentEdit ContentEffective.gatherTiers). 없으면 시험 표 */
  readonly gatherTiers?: readonly GatherTierEntry[] | undefined;
  /** 아이템 중분류(실효 콘텐츠에 있다 — 컨디션 좋아하는 음식 후보·이름). 없으면 빈 목록 */
  readonly itemSubcategories?: readonly ItemSubcategoryEntry[] | undefined;
}

function defOf(entry: FacilityEntry): FacilityDef {
  const { build, repair } = entry;
  return {
    id: entry.id,
    name: { ko: entry.name.ko, en: entry.name.en },
    stage: entry.stage,
    category: facilityCategoryOf(entry),
    maxLevel: entry.maxLevel ?? 5,
    slotsPerLevel: entry.slotsPerLevel,
    footprint: entry.footprint ? { width: entry.footprint.width, height: entry.footprint.height } : undefined,
    ...(entry.needsWaterWithin === undefined ? {} : { needsWaterWithin: entry.needsWaterWithin }),
    durability: entry.durability ?? DEFAULT_FACILITY_DURABILITY,
    storageKg: entry.storageKg,
    look: cleanFacilityLook(entry.look),
    ...(entry.harbor === undefined ? {} : { harbor: entry.harbor }),
    ...(entry.exchange === undefined ? {} : { exchange: entry.exchange }),
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
          ...(entry.gather.extraSubcategories
            ? { extraSubcategories: entry.gather.extraSubcategories.map((sub) => sub.id) }
            : {}),
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
        subs: readonly ItemSubcategoryEntry[] | undefined;
        value: FacilityCatalog;
      }
    | undefined;
  return () => {
    const current = source();
    if (
      cached?.facilities === current.facilities &&
      cached.items === current.items &&
      cached.tiers === current.gatherTiers &&
      cached.subs === current.itemSubcategories
    )
      return cached.value;
    const defs = current.facilities.map(defOf);
    const byId = new Map(defs.map((def) => [def.id, def]));
    const items = new Map(current.items.map((item) => [item.id, item]));
    const enabled = current.items.filter((item) => item.enabled);
    const ladders = new Map<string, string[][]>();
    const subcategoryById = new Map((current.itemSubcategories ?? []).map((sub) => [sub.id, sub]));
    const value: FacilityCatalog = {
      facility: (id) => byId.get(id),
      facilities: defs,
      weightOf: (id) => items.get(id)?.weight,
      unitWeightOf: (id) => items.get(id)?.weight,
      unitPriceOf(id) {
        const item = items.get(id);
        if (!item) return undefined;
        const per = BigInt(item.startPrice) / BigInt(Math.max(1, item.lotSize ?? 1));
        return per > 0n ? per : 1n;
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
      gatherLadder(gather) {
        const key = gatherLadderKey(gather);
        const found = ladders.get(key);
        if (found) return found;
        const subs = new Set(gatherSubcategories(gather));
        const ladder = Array.from({ length: GATHER_TIERS }, (): string[] => []);
        for (const item of enabled)
          if (item.subcategory !== undefined && subs.has(item.subcategory.id))
            ladder[Math.min(GATHER_TIERS - 1, item.tier)]?.push(itemAsset(item.id));
        ladders.set(key, ladder);
        return ladder;
      },
      gatherBands:
        current.gatherTiers && current.gatherTiers.length > 0
          ? current.gatherTiers.map(gatherBandOfEntry)
          : TEST_GATHER_BANDS,
      lotSize: new Map(
        enabled
          .filter((item) => (item.lotSize ?? 1) !== 1)
          .map((item) => [itemAsset(item.id), BigInt(item.lotSize ?? 1)]),
      ),
      foodSubcategories: [...subcategoryById.values()]
        .filter((sub) => sub.food === true && sub.enabled)
        .map((sub) => sub.id),
      subcategoryOf: (id) => items.get(id)?.subcategory?.id,
      itemTier: (id) => items.get(id)?.tier,
      bareHandAccepts: bareHandAcceptsOf(
        current.items.map((item) => ({
          id: item.id,
          category: item.category,
          subcategory: item.subcategory?.id,
          tier: item.tier,
          enabled: item.enabled,
          // 레벨 0 건축 재료 칸(아이템·중분류, 기획 D-569 1764 — 아이템 편집기)
          bareHand: bareHandFlag(
            item,
            item.subcategory ? subcategoryById.get(item.subcategory.id) : undefined,
          ),
        })),
      ),
      subcategoryName(id) {
        const sub = subcategoryById.get(id);
        return sub ? { ko: sub.name.ko, en: sub.name.en } : undefined;
      },
    };
    cached = {
      facilities: current.facilities,
      items: current.items,
      tiers: current.gatherTiers,
      subs: current.itemSubcategories,
      value,
    };
    return value;
  };
}
