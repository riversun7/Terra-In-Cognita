// 경제 화면 시안 자료의 세계 — 도시·창고·보유(ADR 37 6절 "시안 자료"[결정 2], 끝의 "구현하며 정한 것 (경제·거래창 화면)").
// 서버가 거래소·생산·도시를 아직 돌리지 않아(R2 ADR "결과", 도시는 R4b) 화면 모양을 보려고 만든 가짜 세계다. dev·admin이 켠
// 시안 자료(권한 home: preview)에서만 쓴다. 응답마다 preview: true가 붙고 화면은 "시험 자료"를 표시한다.
// - 도시 이름은 사람·NPC가 지은 이름처럼 두 언어에서 같은 글자다(D-6046, src/inbox/preview.ts와 같다). 하나는 긴 이름(넘침 확인).
// - 화폐는 팩 나라 프리셋 차례로 쓴다(첫 나라 = 기준 통화, R2 ADR 6절). 나라가 모자라면 돌려 쓴다.
// - 값은 모두 [임시]다(게임 규칙·수치가 아니다). 시험 자료라 수치 근거가 없다.
import type {
  CatalogItemView,
  EconomyCatalogResponse,
  HoldingLine,
  HoldingPlace,
  StoreKind,
} from "@terra/shared/economy";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** 시안 거래 가격 배율: 팩 기준 가치(임시, 4~100)가 작아 호가 한 칸이 너무 크다 → [임시] 100배로 본다 */
export const PREVIEW_PRICE_SCALE = 100n;

/** 시안 "내" 소유 주체(가짜 거래자 1~6과 겹치지 않는다) */
export const PREVIEW_ME = 99;

export interface PreviewCity {
  readonly id: string;
  readonly name: string;
  /** 나라 차례(catalog.currencies 차례, 모자라면 돌려 씀) */
  readonly nation: number;
  /** 기준 도시(첫 도시)에서의 거리(km) */
  readonly distanceKm: number;
  /** 시야 밖이면 마지막 관측이 이만큼 전이다 */
  readonly observedAgoMs: number;
  readonly inSight: boolean;
  /** 내 창고 종류(없으면 null) */
  readonly store: StoreKind | null;
  /** [임시] 창고 용량(물건 개수) */
  readonly capacity: bigint;
  /** 그 나라 화폐 가치 배율(천분율): 같은 물건이라도 화폐마다 값이 다르게 */
  readonly currencyPm: number;
}

/** 시안 도시. 첫 도시가 기준 도시(가격을 보이는 곳, 내 창고) */
export const PREVIEW_CITIES: readonly PreviewCity[] = [
  {
    id: "101",
    name: "Nova",
    nation: 0,
    distanceKm: 0,
    observedAgoMs: 0,
    inSight: true,
    store: "general",
    capacity: 5_000n,
    currencyPm: 1000,
  },
  {
    id: "102",
    name: "Aster",
    nation: 0,
    distanceKm: 38,
    observedAgoMs: 0,
    inSight: true,
    store: "food",
    capacity: 3_000n,
    currencyPm: 1000,
  },
  {
    id: "103",
    name: "Halden",
    nation: 1,
    distanceKm: 126,
    observedAgoMs: 0,
    inSight: true,
    store: null,
    capacity: 0n,
    currencyPm: 3200,
  },
  {
    id: "104",
    name: "Velmara Eastreach Free Port",
    nation: 2,
    distanceKm: 418,
    observedAgoMs: 3 * HOUR + 20 * MINUTE,
    inSight: false,
    store: "armory",
    capacity: 4_000_000n,
    currencyPm: 480,
  },
];

export function previewCity(id: string): PreviewCity | undefined {
  return PREVIEW_CITIES.find((city) => city.id === id);
}

/** 도시의 화폐 코드(나라가 없으면 null) */
export function cityCurrency(catalog: EconomyCatalogResponse, city: PreviewCity): string | null {
  const list = catalog.currencies;
  if (list.length === 0) return null;
  return list[city.nation % list.length]?.code ?? null;
}

/** 도시의 거래세(만분율) */
export function cityTaxBp(catalog: EconomyCatalogResponse, city: PreviewCity): number {
  const list = catalog.currencies;
  return list.length === 0 ? 0 : (list[city.nation % list.length]?.tradeTaxBp ?? 0);
}

/** 호가창(연속 체결)으로 사고파는 물건인지. 장비 같은 완제품은 경매 매물 목록(D-282), 문서는 거래하지 않음(D-152) [임시] */
export function tradesOnBook(item: CatalogItemView): boolean {
  return item.category !== "equipment" && item.category !== "document";
}

/** 그 도시·물건의 시안 기준 값(그 도시 화폐 최소 단위) */
export function previewBasePrice(item: CatalogItemView, city: PreviewCity): bigint {
  const base = BigInt(item.baseValue) * PREVIEW_PRICE_SCALE;
  const scaled = (base * BigInt(city.currencyPm)) / 1000n;
  return scaled > 0n ? scaled : 1n;
}

/** 시안 보유 한 줄 [임시]. 도시 ID → 물건 ID → 양 */
interface StockSpec {
  readonly item: string;
  readonly qty: bigint;
  /** 상하기 시작하는 시각 = now + 이 값(식품만) */
  readonly spoilsInMs?: number;
}

/** 창고마다 시안 보유. 팩에 없는 물건은 빠진다 */
const PREVIEW_STOCK: Readonly<Record<string, readonly StockSpec[]>> = {
  "101": [
    { item: "grain", qty: 1_240n, spoilsInMs: 5 * HOUR },
    { item: "iron_ore", qty: 310n },
    { item: "iron_ingot", qty: 96n },
    { item: "timber", qty: 220n },
    { item: "household_goods", qty: 14n },
    { item: "test_sword", qty: 1n },
  ],
  "102": [
    { item: "ration", qty: 860n, spoilsInMs: 9 * HOUR },
    { item: "grain", qty: 400n, spoilsInMs: 30 * HOUR },
  ],
  "104": [
    { item: "iron_ore", qty: 2_450_000n },
    { item: "test_vest", qty: 12n },
  ],
};

/** 시안에서 내 주문에 묶인 양(도시 ID → 물건 ID). 거래소 시안의 내 매도 주문과 맞춘다 */
export const PREVIEW_LOCKED_GOODS: Readonly<Record<string, Readonly<Record<string, bigint>>>> = {
  "101": { iron_ore: 40n },
};

/** 화폐마다 시안 지갑(나라 차례 → 양) [임시] */
const PREVIEW_CASH: readonly bigint[] = [1_250_000n, 84_000n, 9_870_000_000n];

/** 시안 지갑에서 화폐 코드의 잔고 */
export function previewCash(catalog: EconomyCatalogResponse, currency: string): bigint {
  const index = catalog.currencies.findIndex((entry) => entry.code === currency);
  return index < 0 ? 0n : (PREVIEW_CASH[index] ?? 0n);
}

/** 시안 창고에서 그 도시·물건의 (팔 수 있는) 양 */
export function previewGoods(cityId: string, itemId: string): bigint {
  return PREVIEW_STOCK[cityId]?.find((stock) => stock.item === itemId)?.qty ?? 0n;
}

/** 시안 지갑 줄(나라 셋까지) */
export function previewWallet(catalog: EconomyCatalogResponse): HoldingLine[] {
  return catalog.currencies.slice(0, PREVIEW_CASH.length).map((currency, index) => ({
    asset: `cur:${currency.code}`,
    item: null,
    currency: currency.code,
    qty: String(PREVIEW_CASH[index] ?? 0n),
    locked: "0",
    spoilsAt: null,
    preview: true,
  }));
}

/** 시안 창고들(내 창고가 있는 도시 + 유닛이 실은 화물 하나) */
export function previewPlaces(catalog: EconomyCatalogResponse, now: number): HoldingPlace[] {
  const known = new Set(catalog.items.map((item) => item.id));
  const places: HoldingPlace[] = [];
  for (const city of PREVIEW_CITIES) {
    if (city.store === null) continue;
    const stock = (PREVIEW_STOCK[city.id] ?? []).filter((line) => known.has(line.item));
    const used = stock.reduce((sum, line) => sum + line.qty, 0n);
    places.push({
      id: city.id,
      kind: "warehouse",
      name: city.name,
      store: city.store,
      capacity: { used: String(used), max: String(city.capacity) },
      lines: stock.map((line) => ({
        asset: `item:${line.item}`,
        item: line.item,
        currency: null,
        qty: String(line.qty),
        locked: String(PREVIEW_LOCKED_GOODS[city.id]?.[line.item] ?? 0n),
        spoilsAt: line.spoilsInMs === undefined ? null : now + line.spoilsInMs,
        preview: true,
      })),
      preview: true,
    });
  }
  // 운송 차량이 실은 화물(직접 운반, 43 §7.1). 유닛 ID는 시안 값
  if (known.has("timber")) {
    places.push({
      id: "cargo_7",
      kind: "cargo",
      name: null,
      store: null,
      capacity: null,
      lines: [
        {
          asset: "item:timber",
          item: "timber",
          currency: null,
          qty: "60",
          locked: "0",
          spoilsAt: null,
          preview: true,
        },
      ],
      preview: true,
    });
  }
  return places;
}
