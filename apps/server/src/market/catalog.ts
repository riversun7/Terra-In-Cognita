// 서버 도시 경제의 시뮬 경제 목록 — docs/adr/2026-11-07-play-flow.md WP4. 시뮬 CLI(packages/sim/cli/common.ts catalogOf)와 같은 모양을
// 서버 경제 화면 목록(economy.catalog, 켜진 항목·팩 수량)과 그 세계의 실효 아이템·시설·채집 확률표에서 만든다(건물·아이템 편집기 덮어쓰기가 든다).
// 중분류(채집 사다리)·시설 채집 칸(스탯 짝·수확량)·오염 값은 화면 목록에 없어 실효 항목에서 읽는다.
import type { FacilityEntry, GatherTierEntry, ItemEntry } from "@terra/content";
import { type EconomyCatalogResponse, marketKindOf } from "@terra/shared/economy";
import type { EconomyCatalog } from "@terra/sim";

/** 실효 콘텐츠 중 경제 목록에 드는 것(contentEdit effective 모양) */
export interface MarketContent {
  readonly items: readonly ItemEntry[];
  readonly facilities?: readonly FacilityEntry[] | undefined;
  readonly gatherTiers?: readonly GatherTierEntry[] | undefined;
}

/** 시뮬 경제 목록 + 호가창 물건(장비·유전자·문서 빼고, marketKindOf book) */
export interface ServerEconomyCatalog {
  readonly catalog: EconomyCatalog;
  /** 거래소를 두는 물건 ID */
  readonly bookItems: ReadonlySet<string>;
}

/** 화면 목록 + 실효 콘텐츠 → 시뮬 경제 목록 */
export function serverEconomyCatalog(
  response: EconomyCatalogResponse,
  content: MarketContent | undefined,
): ServerEconomyCatalog {
  const itemEntries = new Map((content?.items ?? []).map((item) => [item.id, item]));
  const facilityEntries = new Map((content?.facilities ?? []).map((facility) => [facility.id, facility]));
  const bookItems = new Set<string>();
  const items = response.items.map((item) => {
    const entry = itemEntries.get(item.id);
    const kind = item.market ?? (entry ? marketKindOf(entry) : "book");
    if (kind === "book") bookItems.add(item.id);
    const subcategory = entry?.subcategory?.id;
    return {
      id: item.id,
      tier: item.tier,
      category: item.category,
      startPrice: BigInt(item.startPrice),
      ...(subcategory === undefined ? {} : { subcategory }),
      ...(item.lotSize === undefined ? {} : { lotSize: BigInt(item.lotSize) }),
      // 화면 목록은 켜진 항목만 싣는다
      enabled: true,
    };
  });
  const facilities = response.facilities.map((facility) => {
    const gather = facilityEntries.get(facility.id)?.gather;
    return {
      id: facility.id,
      stage: facility.stage,
      slotsPerLevel: facility.slotsPerLevel,
      pollution: facilityEntries.get(facility.id)?.pollution ?? 0,
      ...(gather
        ? {
            gather: {
              primary: gather.primary,
              secondary: gather.secondary,
              subcategory: gather.subcategory.id,
              mode: gather.mode ?? "roll",
              yieldBase: gather.yieldBase,
              yieldPerStatPm: gather.yieldPerStatPm,
              yieldCap: gather.yieldCap,
            },
          }
        : {}),
    };
  });
  const bands = (content?.gatherTiers ?? []).map((band) => ({
    from: band.from,
    weightsPm: [...band.weightsPm],
  }));
  const catalog: EconomyCatalog = {
    items,
    recipes: response.recipes.map((recipe) => ({
      id: recipe.id,
      facility: recipe.facility,
      inputs: recipe.inputs.map((stack) => ({ item: stack.item, qty: BigInt(stack.qty) })),
      outputs: recipe.outputs.map((stack) => ({ item: stack.item, qty: BigInt(stack.qty) })),
      work: recipe.work,
      enabled: true,
    })),
    facilities,
    necessities: response.necessities.map((necessity) => ({
      id: necessity.id,
      item: necessity.item,
      perUnit: BigInt(necessity.perUnit),
      periodHours: necessity.periodHours,
      enabled: true,
    })),
    presets: response.currencies.map((currency) => ({
      id: currency.nation,
      currency: currency.code,
      tradeTaxBp: currency.tradeTaxBp,
      enabled: true,
    })),
    ...(bands.length > 0 ? { gatherBands: bands } : {}),
  };
  return { catalog, bookItems };
}

/**
 * 월드 설정의 경제 목록 접근자: 화면 목록(값 또는 접근자)과 실효 콘텐츠 접근자를 받아 시뮬 목록을 만든다(화면 목록 객체가 바뀔 때만 새로).
 * 화면 목록이 없으면 undefined(경제 없음 — 시험)
 */
export function serverEconomyCatalogAccessor(
  response: EconomyCatalogResponse | (() => EconomyCatalogResponse) | undefined,
  content: (() => MarketContent) | undefined,
): (() => ServerEconomyCatalog) | undefined {
  if (response === undefined) return undefined;
  const read = typeof response === "function" ? response : () => response;
  let built: { source: EconomyCatalogResponse; value: ServerEconomyCatalog } | undefined;
  return () => {
    const now = read();
    if (built?.source !== now) built = { source: now, value: serverEconomyCatalog(now, content?.()) };
    return built.value;
  };
}
