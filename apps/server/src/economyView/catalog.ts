// 경제 화면 목록 — 콘텐츠 팩의 items·facilities·recipes·nation_presets·necessities에서 화면이 쓰는 모양을 만든다(economy.catalog).
// ADR 37 끝 "구현하며 정한 것 (경제·거래창 화면)", R2 ADR 1절(팩 분류). 켜진(enabled) 항목만 팩 순서대로 보낸다(D-398).
// 팩 항목은 참조 검사(2단계)를 통과한 파싱 결과라 참조가 객체다. 정규 JSON(참조 → ID 글자)으로 되돌린 뒤 스키마로 다시 읽어
// 타입을 얻는다(src/world/mapProps.ts와 같은 방식. 검증된 팩이라 실패하면 팩 코드가 틀린 것이다).
// 아이템은 그 세계의 실효 항목(아이템 편집기 덮어쓰기, docs/adr/2026-11-01-item-editor.md 4절)이다: economyCatalogAccessor가 실효 항목이
// 바뀔 때만 목록을 새로 만든다(요청마다 만들지 않는다). 아이템마다 거래 방식(market, marketKindOf)을 싣는다.
import {
  type ContentPack,
  type FacilityEntry,
  type ItemEntry,
  type NationPresetEntry,
  type NecessityEntry,
  type RecipeEntry,
  facilityEntrySchema,
  itemEntrySchema,
  nationPresetEntrySchema,
  necessityEntrySchema,
  recipeEntrySchema,
} from "@terra/content";
import {
  type CatalogCurrencyView,
  type CatalogFacilityView,
  type CatalogItemView,
  type CatalogNecessityView,
  type CatalogRecipeView,
  type EconomyCatalogResponse,
  marketKindOf,
} from "@terra/shared/economy";
import { BASE_EFFICIENCY, batchDurationMs } from "@terra/sim";

/** 팩 분류의 항목을 정규 JSON으로 되돌려 스키마로 읽는다 */
function entriesOf<T>(pack: ContentPack, category: string, parse: (raw: unknown) => T): T[] {
  return (pack.entries.get(category) ?? []).map((entry) => {
    const json: unknown = JSON.parse(JSON.stringify(entry));
    return parse(json);
  });
}

/** 경제 목록을 만드는 팩 분류(파싱한 것). 아이템은 실효 항목을 넘길 수 있다 */
export interface EconomyCatalogEntries {
  readonly items: readonly ItemEntry[];
  readonly facilities: readonly FacilityEntry[];
  readonly recipes: readonly RecipeEntry[];
  readonly necessities: readonly NecessityEntry[];
  readonly presets: readonly NationPresetEntry[];
}

/** 팩의 경제 분류(파싱한 것) */
export function economyCatalogEntriesOf(pack: ContentPack): EconomyCatalogEntries {
  return {
    items: entriesOf(pack, "items", (raw) => itemEntrySchema.parse(raw)),
    facilities: entriesOf(pack, "facilities", (raw) => facilityEntrySchema.parse(raw)),
    recipes: entriesOf(pack, "recipes", (raw) => recipeEntrySchema.parse(raw)),
    necessities: entriesOf(pack, "necessities", (raw) => necessityEntrySchema.parse(raw)),
    presets: entriesOf(pack, "nation_presets", (raw) => nationPresetEntrySchema.parse(raw)),
  };
}

/** 팩에서 경제 화면 목록을 만든다. version·placeholder는 서버 콘텐츠 정보(src/content.ts) */
export function economyCatalogFromPack(
  pack: ContentPack,
  info: { version: string; placeholder: boolean },
): EconomyCatalogResponse {
  return economyCatalogFrom(economyCatalogEntriesOf(pack), info);
}

/**
 * 팩 분류 위에 실효 아이템(그 세계의 덮어쓰기)을 둔 목록 접근자. 실효 항목 객체가 바뀔 때만(아이템 편집기 저장 뒤) 새로 만든다.
 * 끈 아이템을 쓰는 레시피·생필품은 함께 빠진다(시뮬 prepareCatalog와 같은 규칙)
 */
export function economyCatalogAccessor(
  pack: ContentPack,
  info: { version: string; placeholder: boolean },
  items: () => readonly ItemEntry[],
): () => EconomyCatalogResponse {
  const base = economyCatalogEntriesOf(pack);
  let built: { items: readonly ItemEntry[]; catalog: EconomyCatalogResponse } | undefined;
  return () => {
    const now = items();
    if (built?.items !== now)
      built = { items: now, catalog: economyCatalogFrom({ ...base, items: now }, info) };
    return built.catalog;
  };
}

/** 경제 분류 → 경제 화면 목록 */
export function economyCatalogFrom(
  entries: EconomyCatalogEntries,
  info: { version: string; placeholder: boolean },
): EconomyCatalogResponse {
  const items = entries.items.filter((item) => item.enabled);
  const tierOf = new Map(items.map((item) => [item.id, item.tier]));
  const itemViews: CatalogItemView[] = items.map((item) => ({
    id: item.id,
    name: { ko: item.name.ko, en: item.name.en },
    category: item.category,
    tier: item.tier,
    baseValue: String(item.baseValue),
    market: marketKindOf(item),
  }));
  const facilities: CatalogFacilityView[] = entries.facilities
    .filter((facility) => facility.enabled)
    .map((facility) => ({
      id: facility.id,
      name: facility.name,
      stage: facility.stage,
      slotsPerLevel: facility.slotsPerLevel,
    }));
  const facilityIds = new Set(facilities.map((facility) => facility.id));
  const recipes: CatalogRecipeView[] = [];
  for (const recipe of entries.recipes) {
    const facility = recipe.facility.id;
    const stacks = [...recipe.inputs, ...recipe.outputs];
    // 꺼진 시설·물건을 쓰는 레시피는 세계에 나오지 않는다(시뮬 prepareCatalog와 같은 규칙)
    if (!recipe.enabled || !facilityIds.has(facility) || stacks.some((stack) => !tierOf.has(stack.item.id)))
      continue;
    recipes.push({
      id: recipe.id,
      name: recipe.name,
      facility,
      inputs: recipe.inputs.map((stack) => ({ item: stack.item.id, qty: String(stack.qty) })),
      outputs: recipe.outputs.map((stack) => ({ item: stack.item.id, qty: String(stack.qty) })),
      work: recipe.work,
      tier: Math.max(...recipe.outputs.map((stack) => tierOf.get(stack.item.id) ?? 0)),
      baseDurationMs: batchDurationMs(recipe.work, BASE_EFFICIENCY) ?? 0,
    });
  }
  const currencies: CatalogCurrencyView[] = entries.presets
    .filter((preset) => preset.enabled)
    .map((preset) => ({
      code: preset.currency.code,
      name: preset.currency.name,
      nation: preset.id,
      nationName: preset.name,
      tradeTaxBp: preset.tradeTaxBp,
    }));
  const necessities: CatalogNecessityView[] = entries.necessities
    .filter((necessity) => necessity.enabled && tierOf.has(necessity.item.id))
    .map((necessity) => ({
      id: necessity.id,
      name: necessity.name,
      item: necessity.item.id,
      perUnit: String(necessity.perUnit),
      periodHours: necessity.periodHours,
    }));
  return {
    contentVersion: info.version,
    placeholder: info.placeholder,
    items: itemViews,
    facilities,
    recipes,
    currencies,
    necessities,
    baseCurrency: currencies[0]?.code ?? null,
  };
}

/** 빈 목록(팩을 받지 않은 서버·시험) */
export function emptyEconomyCatalog(version: string): EconomyCatalogResponse {
  return {
    contentVersion: version,
    placeholder: true,
    items: [],
    facilities: [],
    recipes: [],
    currencies: [],
    necessities: [],
    baseCurrency: null,
  };
}
