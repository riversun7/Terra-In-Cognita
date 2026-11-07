// 경제 화면 글 — 팩 이름 고르기(지금 언어), 분류·단계·상태 이름 표, 시각·남은 시간 글.
// 키로 고르는 문구는 정적 표로 둔다(m[key]처럼 계산해서 읽지 않는다, AGENTS 6장 oxlint).
import type {
  CatalogCurrencyView,
  CatalogFacilityView,
  CatalogItemView,
  CatalogRecipeView,
  EconomyCatalogResponse,
  FacilityStatus,
  HoldingLine,
  LocalizedName,
  StoreKind,
} from "@terra/shared/economy";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { formatAmount } from "./amount.ts";

/** 금액·수량 글(지금 언어의 자리 나눔) */
export function fmt(value: bigint | string): string {
  return formatAmount(value, getLocale());
}

/** 팩 이름 → 지금 언어(영어가 아니면 한국어). 없으면 fallback(ID) */
export function pickName(name: LocalizedName | undefined, fallback: string): string {
  if (!name) return fallback;
  return getLocale() === "en" ? name.en : name.ko;
}

/** 목록 찾기 표(화면마다 한 번 만든다) */
export interface CatalogIndex {
  readonly items: ReadonlyMap<string, CatalogItemView>;
  readonly facilities: ReadonlyMap<string, CatalogFacilityView>;
  readonly recipes: ReadonlyMap<string, CatalogRecipeView>;
  readonly currencies: ReadonlyMap<string, CatalogCurrencyView>;
}

const EMPTY_INDEX: CatalogIndex = {
  items: new Map(),
  facilities: new Map(),
  recipes: new Map(),
  currencies: new Map(),
};

export function indexCatalog(catalog: EconomyCatalogResponse | null): CatalogIndex {
  if (!catalog) return EMPTY_INDEX;
  return {
    items: new Map(catalog.items.map((item) => [item.id, item])),
    facilities: new Map(catalog.facilities.map((facility) => [facility.id, facility])),
    recipes: new Map(catalog.recipes.map((recipe) => [recipe.id, recipe])),
    currencies: new Map(catalog.currencies.map((currency) => [currency.code, currency])),
  };
}

export const itemName = (index: CatalogIndex, id: string): string => pickName(index.items.get(id)?.name, id);

/** 물건의 거래 묶음 크기(기본 단위 개수, 302·D-506). 목록에 칸이 없으면(옛 서버) 1 */
export function lotOf(item: CatalogItemView | undefined): bigint {
  if (item?.lotSize === undefined) return 1n;
  const lot = BigInt(item.lotSize);
  return lot > 0n ? lot : 1n;
}

/** g → 무게 글(정수 셈, g·kg·t) */
function gramsText(grams: bigint): string {
  if (grams >= 1_000_000n && grams % 1_000_000n === 0n) return `${fmt(grams / 1_000_000n)} t`;
  if (grams >= 1000n && grams % 1000n === 0n) return `${fmt(grams / 1000n)} kg`;
  return `${fmt(grams)} g`;
}

/** 묶음 하나의 크기 글: 무게를 알면 무게(1 kg), 모르면 개수 */
export function lotText(item: CatalogItemView | undefined): string {
  const lot = lotOf(item);
  const weight = item?.weight;
  return weight !== undefined && weight > 0
    ? gramsText(lot * BigInt(weight))
    : m.economy_lot_units({ n: fmt(lot) });
}

/** 스탯 코드 두 개 → "STR+VIT"(스탯 약자는 두 언어 같은 글자) */
export function statPairText(primary: string, secondary: string): string {
  return `${primary.toUpperCase()}+${secondary.toUpperCase()}`;
}
export const facilityName = (index: CatalogIndex, id: string): string =>
  pickName(index.facilities.get(id)?.name, id);
export const recipeName = (index: CatalogIndex, id: string): string =>
  pickName(index.recipes.get(id)?.name, id);
export const currencyName = (index: CatalogIndex, code: string): string =>
  pickName(index.currencies.get(code)?.name, code);

/** 시험 자원(S3 정산) 이름 */
const TEST_ASSETS: Readonly<Record<string, () => string>> = {
  s3_test_credit: m.economy_asset_test_credit,
  s3_test_ore: m.economy_asset_test_ore,
};

/** 보유 한 줄의 이름: 물건 → 화폐 → 시험 자원 → 원장 자산 코드 */
export function assetName(index: CatalogIndex, line: HoldingLine): string {
  if (line.item !== null) return itemName(index, line.item);
  if (line.currency !== null) return currencyName(index, line.currency);
  const test = TEST_ASSETS[line.asset];
  return test ? test() : line.asset;
}

const CATEGORY_NAMES: Readonly<Record<string, () => string>> = {
  raw: m.economy_cat_raw,
  processed: m.economy_cat_processed,
  part: m.economy_cat_part,
  equipment: m.economy_cat_equipment,
  consumable: m.economy_cat_consumable,
  gem: m.economy_cat_gem,
  construction: m.economy_cat_construction,
  document: m.economy_cat_document,
  precious: m.economy_cat_precious,
};

/** 대분류 이름(모르는 분류는 ID) */
export function categoryName(category: string): string {
  return CATEGORY_NAMES[category]?.() ?? category;
}

const STAGE_NAMES: Readonly<Record<string, () => string>> = {
  gather: m.economy_stage_gather,
  process: m.economy_stage_process,
  part: m.economy_stage_part,
  finish: m.economy_stage_finish,
  territory: m.economy_stage_territory,
  storage: m.economy_stage_storage,
  religion: m.economy_stage_religion,
  biotech: m.economy_stage_biotech,
};

export function stageName(stage: string): string {
  return STAGE_NAMES[stage]?.() ?? stage;
}

export const STATUS_NAMES: Readonly<Record<FacilityStatus, () => string>> = {
  running: m.economy_status_running,
  idle: m.economy_status_idle,
  no_input: m.economy_status_no_input,
  storage_full: m.economy_status_storage_full,
};

export const STORE_NAMES: Readonly<Record<StoreKind, () => string>> = {
  general: m.economy_store_general,
  food: m.economy_store_food,
  armory: m.economy_store_armory,
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const unitFormats = new Map<string, Intl.NumberFormat>();

function unit(value: number, name: "minute" | "hour" | "day"): string {
  const locale = getLocale();
  const key = `${locale}|${name}`;
  let format = unitFormats.get(key);
  if (format === undefined) {
    format = new Intl.NumberFormat(locale, { style: "unit", unit: name, unitDisplay: "short" });
    unitFormats.set(key, format);
  }
  return format.format(value);
}

/** 남은 시간 글(내림, 늘려 말하지 않는다): "2일 3시간", "3시간 12분", "12분", 1분 미만은 "1분" 미만도 1분 */
export function formatDuration(ms: number): string {
  const total = Math.max(MINUTE, ms);
  if (total >= DAY) {
    const days = Math.floor(total / DAY);
    const hours = Math.floor((total % DAY) / HOUR);
    return hours > 0 ? `${unit(days, "day")} ${unit(hours, "hour")}` : unit(days, "day");
  }
  if (total >= HOUR) {
    const hours = Math.floor(total / HOUR);
    const minutes = Math.floor((total % HOUR) / MINUTE);
    return minutes > 0 ? `${unit(hours, "hour")} ${unit(minutes, "minute")}` : unit(hours, "hour");
  }
  return unit(Math.floor(total / MINUTE), "minute");
}

/** 만료 날 수 글("7일", "7 days") */
export function formatDays(days: number): string {
  return new Intl.NumberFormat(getLocale(), { style: "unit", unit: "day", unitDisplay: "long" }).format(days);
}

const relativeFormats = new Map<string, Intl.RelativeTimeFormat>();

/** 지난 시각 글("3분 전", "2 hr. ago"). 1분 안이면 "지금" */
export function formatAgo(atMs: number, nowMs: number): string {
  const locale = getLocale();
  let format = relativeFormats.get(locale);
  if (format === undefined) {
    format = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
    relativeFormats.set(locale, format);
  }
  const diff = Math.max(0, nowMs - atMs);
  if (diff < HOUR) return format.format(-Math.floor(diff / MINUTE), "minute");
  if (diff < DAY) return format.format(-Math.floor(diff / HOUR), "hour");
  return format.format(-Math.floor(diff / DAY), "day");
}

const clockFormats = new Map<string, Intl.DateTimeFormat>();

/** 시각 글: 같은 날이면 "14:05", 아니면 "10. 31. 14:05"(기기 시간대) */
export function formatClock(atMs: number, nowMs: number): string {
  const locale = getLocale();
  const sameDay = new Date(atMs).toDateString() === new Date(nowMs).toDateString();
  const key = `${locale}|${sameDay ? "t" : "d"}`;
  let format = clockFormats.get(key);
  if (format === undefined) {
    format = new Intl.DateTimeFormat(
      locale,
      sameDay
        ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }
        : { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
    );
    clockFormats.set(key, format);
  }
  return format.format(atMs);
}
