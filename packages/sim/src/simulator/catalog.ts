// 경제 목록(시뮬 쪽 평범한 자료) — docs/adr/2026-10-31-economy-core.md 1절
// 실행 도구(cli/common.ts)가 콘텐츠 팩의 items·recipes·facilities·necessities·nation_presets에서 만든다. 시뮬 코드는 팩 형식(zod)을
// 모른다. 켬·끔(D-398): 꺼진 항목은 세계에 새로 놓지 않는다(지금 시뮬은 처음 차릴 때만 본다).
import { type NecessitySpec } from "../economy/upkeep.ts";
import { type RecipeSpec } from "../economy/production.ts";

export interface CatalogItem {
  readonly id: string;
  readonly tier: number;
  readonly category: string;
  /**
   * 시작 시세(팩 startPrice, 295 D-501): 그 세계에서 이 물건의 시장이 처음 열릴 때의 첫 가격으로만 쓴다. 체결이 생기면 그 뒤 계산은
   * 시장 시세(마지막 체결가)다: NPC 매물 값 = 마지막 체결가(없을 때만 시작 시세), 물가 지수 = 지금 시세 ÷ 시작 시세(그 세계의 첫 가격 대비)
   */
  readonly startPrice: bigint;
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
  readonly enabled: boolean;
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
}

export function prepareCatalog(catalog: EconomyCatalog): PreparedCatalog {
  const items = catalog.items.filter((item) => item.enabled);
  const tierOf = new Map(items.map((item) => [item.id, item.tier]));
  const recipes = new Map<string, RecipeSpec>();
  for (const recipe of catalog.recipes) {
    if (!recipe.enabled) continue;
    const stacks = [...recipe.inputs, ...recipe.outputs];
    if (stacks.some((stack) => !tierOf.has(stack.item))) continue;
    recipes.set(recipe.id, {
      id: recipe.id,
      facility: recipe.facility,
      inputs: recipe.inputs.map((stack) => ({ asset: itemAsset(stack.item), qty: stack.qty })),
      outputs: recipe.outputs.map((stack) => ({ asset: itemAsset(stack.item), qty: stack.qty })),
      work: recipe.work,
      tier: Math.max(...recipe.outputs.map((stack) => tierOf.get(stack.item) ?? 0)),
    });
  }
  return {
    items: items.map((item) => itemAsset(item.id)),
    startPrice: new Map(items.map((item) => [itemAsset(item.id), item.startPrice])),
    recipes,
    facilities: new Map(
      catalog.facilities.filter((facility) => facility.enabled).map((facility) => [facility.id, facility]),
    ),
    necessities: catalog.necessities
      .filter((necessity) => necessity.enabled && tierOf.has(necessity.item))
      .map((necessity) => ({
        asset: itemAsset(necessity.item),
        perUnit: necessity.perUnit,
        periodHours: necessity.periodHours,
      })),
    presets: catalog.presets.filter((preset) => preset.enabled),
  };
}
