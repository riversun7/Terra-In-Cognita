// 경제 화면 목록 — 콘텐츠 팩의 items·facilities·recipes·nation_presets·necessities에서 화면이 쓰는 모양을 만든다(economy.catalog).
// ADR 37 끝 "구현하며 정한 것 (경제·거래창 화면)", R2 ADR 1절(팩 분류). 켜진(enabled) 항목만 팩 순서대로 보낸다(D-398). 시설은 늘 켜짐.
// 팩 항목은 참조 검사(2단계)를 통과한 파싱 결과라 참조가 객체다. 정규 JSON(참조 → ID 글자)으로 되돌린 뒤 스키마로 다시 읽어
// 타입을 얻는다(src/world/mapProps.ts와 같은 방식. 검증된 팩이라 실패하면 팩 코드가 틀린 것이다).
// 아이템·시설은 그 세계의 실효 항목(아이템 편집기·건물 편집기 덮어쓰기, docs/adr/2026-11-01-item-editor.md 4절·
// docs/adr/2026-11-02-building-editor.md)이다: economyCatalogAccessor가 실효 항목이 바뀔 때만 목록을 새로 만든다(요청마다 만들지 않는다).
// 아이템마다 거래 방식(market, marketKindOf)을 싣는다.
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
  type CatalogWorkerView,
  type EconomyCatalogResponse,
  marketKindOf,
} from "@terra/shared/economy";
import {
  BASE_EFFICIENCY,
  GATHER_TIERS,
  TEST_SOCIETY_COEFFICIENTS,
  buildingGatherTier,
  batchDurationMs,
  defaultGatherStat,
  gatherProgress,
  gatherYield,
  tierRequiredProgress,
} from "@terra/sim";

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
 * 팩 분류 위에 실효 아이템·시설(그 세계의 덮어쓰기)을 둔 목록 접근자. effective는 실효 항목 묶음(ContentEditState.effective — 스냅숏마다
 * 같은 객체)이고, 그 객체가 바뀔 때만(아이템·건물 편집기 저장 뒤) 새로 만든다. 시설이 없으면(시험) 팩 시설.
 * 끈 아이템·시설을 쓰는 레시피·생필품은 함께 빠진다(시뮬 prepareCatalog와 같은 규칙)
 */
export function economyCatalogAccessor(
  pack: ContentPack,
  info: { version: string; placeholder: boolean },
  effective: () => {
    readonly items: readonly ItemEntry[];
    readonly facilities?: readonly FacilityEntry[] | undefined;
    /** 실효 국가 프리셋(시작 국가 설정 편집기가 덮어쓴다 — 나라 화폐 이름·거래세). 없으면 팩 */
    readonly nationPresets?: readonly NationPresetEntry[] | undefined;
  },
): () => EconomyCatalogResponse {
  const base = economyCatalogEntriesOf(pack);
  let built: { source: object; catalog: EconomyCatalogResponse } | undefined;
  return () => {
    const now = effective();
    if (built?.source !== now)
      built = {
        source: now,
        catalog: economyCatalogFrom(
          {
            ...base,
            items: now.items,
            facilities: now.facilities ?? base.facilities,
            presets: now.nationPresets ?? base.presets,
          },
          info,
        ),
      };
    return built.catalog;
  };
}

/**
 * 일꾼 스탯 효과를 셀 때 쓰는 계수(세력·사회 계수표 칸: N9 초기 합, N32 진행 나눔·기본 비율, N44 필요 진행·진행 1의 시간).
 * 경제 목록은 팩 값(TEST_SOCIETY_COEFFICIENTS = 팩 tuning, 시험이 맞춰 본다)으로 센다(세계 덮어쓰기는 보지 않는다)
 */
type WorkerRules = Pick<
  typeof TEST_SOCIETY_COEFFICIENTS,
  | "productionMainDivisor"
  | "productionSubYieldPm"
  | "gatherTierProgressBase"
  | "gatherTierProgressStep"
  | "gatherTickMs"
> & { readonly cyborg: { readonly initialSum: number } };

/** 시설 스탯 짝 → 레시피 일꾼 효과(사다리 산출이면 티어별 한 번 시간, 선택 방식이면 Lv1이 기르는 티어) */
export function workerViewOf(
  gather: NonNullable<FacilityEntry["gather"]>,
  ladder: "roll" | "select" | null,
  rules: WorkerRules = TEST_SOCIETY_COEFFICIENTS,
): CatalogWorkerView {
  const unitStat = defaultGatherStat(rules.cyborg.initialSum);
  const yieldBase = gather.yieldBase ?? 1;
  const yieldPerStatPm = gather.yieldPerStatPm ?? rules.productionSubYieldPm;
  const yieldCap = gather.yieldCap ?? null;
  const unitProgress = gatherProgress(unitStat, rules.productionMainDivisor);
  return {
    primary: gather.primary,
    secondary: gather.secondary,
    progressDivisor: rules.productionMainDivisor,
    yieldBase,
    yieldPerStatPm,
    yieldCap,
    unitStat,
    unitProgress,
    unitYield: gatherYield(unitStat, {
      base: yieldBase,
      perStatPm: yieldPerStatPm,
      cap: yieldCap ?? undefined,
    }),
    tierHarvestMs:
      ladder === null
        ? null
        : Array.from({ length: GATHER_TIERS }, (_, tier) =>
            Math.ceil(
              (tierRequiredProgress(tier, rules.gatherTierProgressBase, rules.gatherTierProgressStep) *
                rules.gatherTickMs) /
                unitProgress,
            ),
          ),
    // 건물 채집소(D-566 1721): Lv1이 기르는 티어(2 × 레벨 − 1)
    unitTier: ladder === "select" ? buildingGatherTier(1) : null,
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
    startPrice: String(item.startPrice),
    market: marketKindOf(item),
    lotSize: String(item.lotSize ?? 1),
    ...(item.weight === undefined ? {} : { weight: item.weight }),
  }));
  const subOf = new Map(items.map((item) => [item.id, item.subcategory?.id]));
  // 시설은 늘 켜짐(켬·끔 없음, 팩 core@32·사용자 답 2026-11-03)
  const facilities: CatalogFacilityView[] = entries.facilities.map((facility) => ({
    id: facility.id,
    name: facility.name,
    stage: facility.stage,
    slotsPerLevel: facility.slotsPerLevel,
  }));
  const facilityIds = new Set(facilities.map((facility) => facility.id));
  const gatherOf = new Map(entries.facilities.map((facility) => [facility.id, facility.gather]));
  const recipes: CatalogRecipeView[] = [];
  for (const recipe of entries.recipes) {
    const facility = recipe.facility.id;
    const stacks = [...recipe.inputs, ...recipe.outputs];
    // 꺼진 레시피·물건을 쓰는 레시피는 세계에 나오지 않는다(시뮬 prepareCatalog와 같은 규칙)
    if (!recipe.enabled || !facilityIds.has(facility) || stacks.some((stack) => !tierOf.has(stack.item.id)))
      continue;
    // 채집 티어 추첨(선택 방식 포함): 시설에 gather가 있고 산출이 모두 그 중분류(시뮬 prepareCatalog와 같은 규칙)
    // 중분류가 여럿이면(질문 946 나) 산출이 그 가운데 어느 것이든 된다
    const gather = gatherOf.get(facility);
    const ladderSubs = gather
      ? [gather.subcategory.id, ...(gather.extraSubcategories ?? []).map((sub) => sub.id)]
      : [];
    const rolled =
      gather !== undefined &&
      recipe.outputs.every((stack) => ladderSubs.includes(subOf.get(stack.item.id) ?? ""));
    recipes.push({
      id: recipe.id,
      name: recipe.name,
      facility,
      inputs: recipe.inputs.map((stack) => ({ item: stack.item.id, qty: String(stack.qty) })),
      outputs: recipe.outputs.map((stack) => ({ item: stack.item.id, qty: String(stack.qty) })),
      work: recipe.work,
      tier: Math.max(...recipe.outputs.map((stack) => tierOf.get(stack.item.id) ?? 0)),
      baseDurationMs: batchDurationMs(recipe.work, BASE_EFFICIENCY) ?? 0,
      ...(rolled
        ? {
            gather: {
              primary: gather.primary,
              secondary: gather.secondary,
              subcategory: gather.subcategory.id,
              mode: gather.mode ?? "roll",
            },
          }
        : {}),
      // 스탯 짝이 있는 시설: 진행 속도·수확량(사다리 산출이면 티어별 한 번 시간도, D-507)
      ...(gather === undefined
        ? {}
        : { worker: workerViewOf(gather, rolled ? (gather.mode ?? "roll") : null) }),
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
