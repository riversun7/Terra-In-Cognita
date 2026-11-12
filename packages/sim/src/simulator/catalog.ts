// 경제 목록(시뮬 쪽 평범한 자료) — docs/adr/2026-10-31-economy-core.md 1절
// 실행 도구(cli/common.ts)가 콘텐츠 팩의 items·recipes·facilities·necessities·nation_presets에서 만든다. 시뮬 코드는 팩 형식(zod)을
// 모른다. 켬·끔(D-398): 꺼진 항목은 세계에 새로 놓지 않는다(지금 시뮬은 처음 차릴 때만 본다). 시설은 켬·끔 없이 늘 켜짐(사용자 답 2026-11-03).
// 묶음 크기(302·D-506): 팩의 레시피·생필품 수량은 묶음 단위, 원장(창고)은 기본 단위다. prepareCatalog가 수량 × 묶음 크기로 바꿔
// RecipeSpec·NecessitySpec은 기본 단위로 둔다. 거래소는 묶음 단위로 사고판다(goodsMarket lotSize).
// 채집 티어 추첨(D-506): 시설에 gather가 있고 산출이 모두 그 중분류인 레시피는 산출 묶음마다 티어를 뽑는다(economy/gather.ts).
// 선택 방식(gather.mode select, 농장·목장)은 뽑지 않고 일꾼 해금 티어에서 고른다(49 P8). 진행 속도·수확량은 simulator/economy.ts.
import {
  GATHER_TIERS,
  type GatherBand,
  type GatherCatchRule,
  TEST_GATHER_BANDS,
  gatherLadderKey,
  gatherSubcategories,
} from "../economy/gather.ts";
import { type NecessitySpec } from "../economy/upkeep.ts";
import { type GatherMode, type RecipeSpec } from "../economy/production.ts";
import type { FacilityBuildJson } from "@terra/shared/facilityBuild";

export interface CatalogItem {
  readonly id: string;
  readonly tier: number;
  readonly category: string;
  /**
   * 시작 시세(팩 startPrice, 295 D-501): 그 세계에서 이 물건의 시장이 처음 열릴 때의 첫 가격으로만 쓴다. 체결이 생기면 그 뒤 계산은
   * 시장 시세(마지막 체결가)다: NPC 매물 값 = 마지막 체결가(없을 때만 시작 시세), 물가 지수 = 지금 시세 ÷ 시작 시세(그 세계의 첫 가격 대비)
   */
  readonly startPrice: bigint;
  /** 중분류(팩 subcategory). 채집 티어 추첨의 사다리가 본다 */
  readonly subcategory?: string | undefined;
  /** 거래 묶음 크기(기본 단위 개수, 팩 lotSize, 없으면 1) */
  readonly lotSize?: bigint | undefined;
  /** 기본 단위 하나의 무게(g, 팩 weight). 없으면 0 — 채집소 → 창고 옮김(질문 1050 가)이 본다 */
  readonly weight?: number | undefined;
  readonly enabled: boolean;
}

export interface CatalogRecipe {
  readonly id: string;
  readonly facility: string;
  readonly inputs: readonly { item: string; qty: bigint }[];
  readonly outputs: readonly { item: string; qty: bigint }[];
  readonly work: number;
  readonly enabled: boolean;
}

export interface CatalogFacility {
  readonly id: string;
  readonly stage: string;
  readonly slotsPerLevel: number;
  /** 오염 값(레벨 1·1시간, 팩 facilities pollution, 없으면 0 — docs/adr/2026-11-01-gardener-r5b.md) */
  readonly pollution?: number | undefined;
  /**
   * 채집(팩 facilities gather, D-506·D-507): 스탯 짝(primary 진행 속도, secondary 수확량), 사다리 = 그 중분류,
   * mode roll(추첨, 유효 스탯 = primary + secondary) 또는 select(해금 티어, 49 P8), 수확량 규칙(옛 gather_type_config)
   */
  readonly gather?: CatalogGather | undefined;
  /**
   * 짓기 재료(팩 facilities build, 레벨 구간별 — @terra/shared/facilityBuild). NPC 증축(질문 1101 나, simulator/npcBuild.ts)이 플레이어 짓기와
   * 같은 식으로 재료·시간을 셈한다. 없으면 NPC가 짓지 않는다
   */
  readonly build?: FacilityBuildJson | undefined;
  /** 레벨 상한(팩 facilities maxLevel, 없으면 FACILITY_LEVEL_MAX). NPC 레벨 올리기(질문 1146 나)가 본다 */
  readonly maxLevel?: number | undefined;
}

/** 시설의 채집 칸(수확량 칸이 없으면 기본 1개 + 설정 칸 N32 비율, 상한 없음) */
export interface CatalogGather {
  readonly primary: string;
  readonly secondary: string;
  readonly subcategory: string;
  /** 함께 내는 중분류(질문 946 나, 목장 = 축산물 + 목축 부산물). 없으면 주 중분류 하나 */
  readonly extraSubcategories?: readonly string[] | undefined;
  readonly mode?: GatherMode | undefined;
  /** 옛 yield_base(개) */
  readonly yieldBase?: number | undefined;
  /** 옛 yield_per_stat(‰, 0.10 → 100) */
  readonly yieldPerStatPm?: number | undefined;
  /** 옛 yield_cap(개) */
  readonly yieldCap?: number | undefined;
  /** 성공 확률 규칙(낚시터, 옛 fishing_config). 없으면 늘 성공 */
  readonly catch?: GatherCatchRule | undefined;
}

export interface CatalogNecessity {
  readonly id: string;
  readonly item: string;
  readonly perUnit: bigint;
  readonly periodHours: number;
  readonly enabled: boolean;
}

export interface CatalogPreset {
  readonly id: string;
  readonly currency: string;
  readonly tradeTaxBp: number;
  readonly enabled: boolean;
}

export interface EconomyCatalog {
  readonly items: readonly CatalogItem[];
  readonly recipes: readonly CatalogRecipe[];
  readonly facilities: readonly CatalogFacility[];
  readonly necessities: readonly CatalogNecessity[];
  readonly presets: readonly CatalogPreset[];
  /** 채집 티어 확률표(팩 gather_tiers, 49 N43). 없으면 TEST_GATHER_BANDS */
  readonly gatherBands?: readonly GatherBand[] | undefined;
}

/** 물건 자산 코드 */
export const itemAsset = (id: string): string => `item:${id}`;
/** 화폐 자산 코드(세력 화폐, D-124) */
export const currencyAsset = (code: string): string => `cur:${code}`;

/** 시뮬이 쓰는 꼴로 바꾼 목록 */
export interface PreparedCatalog {
  /** 켜진 물건 자산 코드(목록 차례) */
  readonly items: readonly string[];
  /** 켜진 물건 자산 코드 → 시작 시세(시장의 첫 가격) */
  readonly startPrice: ReadonlyMap<string, bigint>;
  readonly recipes: ReadonlyMap<string, RecipeSpec>;
  readonly facilities: ReadonlyMap<string, CatalogFacility>;
  readonly necessities: readonly NecessitySpec[];
  readonly presets: readonly CatalogPreset[];
  /** 켜진 물건 자산 코드 → 묶음 크기(1이 아닌 것만) */
  readonly lotSize: ReadonlyMap<string, bigint>;
  /** 켜진 물건 자산 코드 → 기본 단위 하나의 무게(g, 0보다 큰 것만). 채집소 → 창고 옮김 시간(질문 1050 가) */
  readonly weightG: ReadonlyMap<string, bigint>;
  /**
   * 사다리 키(gatherLadderKey — 중분류 하나면 그 ID, 여럿이면 "+"로 이음) → 티어별 켜진 물건 자산(팩 차례, 길이 GATHER_TIERS).
   * 추첨 시설이 가리키는 사다리만
   */
  readonly gatherLadders: ReadonlyMap<string, readonly (readonly string[])[]>;
  readonly gatherBands: readonly GatherBand[];
}

/** 자산의 묶음 크기(기본 단위, 없으면 1) */
export function lotSizeOf(catalog: Pick<PreparedCatalog, "lotSize">, asset: string): bigint {
  return catalog.lotSize.get(asset) ?? 1n;
}

export function prepareCatalog(catalog: EconomyCatalog): PreparedCatalog {
  const items = catalog.items.filter((item) => item.enabled);
  const tierOf = new Map(items.map((item) => [item.id, item.tier]));
  const subOf = new Map(items.map((item) => [item.id, item.subcategory]));
  const lots = new Map(items.map((item) => [item.id, item.lotSize ?? 1n]));
  // 시설은 켬·끔이 없다(늘 켜짐, 팩 core@32·사용자 답 2026-11-03)
  const facilities = new Map(catalog.facilities.map((facility) => [facility.id, facility]));
  // 추첨 시설이 가리키는 사다리(티어마다 그 중분류들의 켜진 물건, 팩 차례 — 중분류 여럿이면 한 사다리로, 질문 946 나)
  const gatherLadders = new Map<string, string[][]>();
  for (const facility of facilities.values()) {
    if (!facility.gather) continue;
    const key = gatherLadderKey(facility.gather);
    if (gatherLadders.has(key)) continue;
    const subs = new Set(gatherSubcategories(facility.gather));
    const ladder = Array.from({ length: GATHER_TIERS }, (): string[] => []);
    for (const item of items)
      if (item.subcategory !== undefined && subs.has(item.subcategory))
        ladder[Math.min(GATHER_TIERS - 1, item.tier)]?.push(itemAsset(item.id));
    gatherLadders.set(key, ladder);
  }
  const base = (stack: { item: string; qty: bigint }) => ({
    asset: itemAsset(stack.item),
    qty: stack.qty * (lots.get(stack.item) ?? 1n),
  });
  const recipes = new Map<string, RecipeSpec>();
  for (const recipe of catalog.recipes) {
    if (!recipe.enabled) continue;
    const stacks = [...recipe.inputs, ...recipe.outputs];
    if (stacks.some((stack) => !tierOf.has(stack.item))) continue;
    const gather = facilities.get(recipe.facility)?.gather;
    const ladderSubs = gather ? gatherSubcategories(gather) : [];
    const rolled =
      gather !== undefined &&
      recipe.outputs.every((stack) => ladderSubs.includes(subOf.get(stack.item) ?? ""));
    let rolledLots = 0n;
    for (const stack of recipe.outputs) rolledLots += stack.qty;
    recipes.set(recipe.id, {
      id: recipe.id,
      facility: recipe.facility,
      inputs: recipe.inputs.map(base),
      outputs: recipe.outputs.map(base),
      work: recipe.work,
      tier: Math.max(...recipe.outputs.map((stack) => tierOf.get(stack.item) ?? 0)),
      ...(rolled
        ? {
            gather: {
              subcategory: gatherLadderKey(gather),
              lots: Number(rolledLots),
              mode: gather.mode ?? "roll",
            },
          }
        : {}),
    });
  }
  return {
    items: items.map((item) => itemAsset(item.id)),
    startPrice: new Map(items.map((item) => [itemAsset(item.id), item.startPrice])),
    recipes,
    facilities,
    necessities: catalog.necessities
      .filter((necessity) => necessity.enabled && tierOf.has(necessity.item))
      .map((necessity) => ({
        asset: itemAsset(necessity.item),
        perUnit: necessity.perUnit * (lots.get(necessity.item) ?? 1n),
        periodHours: necessity.periodHours,
      })),
    presets: catalog.presets.filter((preset) => preset.enabled),
    weightG: new Map(
      items
        .filter((item) => (item.weight ?? 0) > 0)
        .map((item) => [itemAsset(item.id), BigInt(Math.trunc(item.weight ?? 0))]),
    ),
    lotSize: new Map(
      items
        .filter((item) => (item.lotSize ?? 1n) !== 1n)
        .map((item) => [itemAsset(item.id), item.lotSize ?? 1n]),
    ),
    gatherLadders,
    gatherBands: catalog.gatherBands ?? TEST_GATHER_BANDS,
  };
}
