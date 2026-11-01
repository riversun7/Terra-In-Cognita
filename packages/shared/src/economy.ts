// 경제 화면 응답 모양 — tRPC economy.*(조회만). 서버(apps/server/src/economyView/)가 만들고 게임 앱 경제 화면(apps/game/src/economy/)이 읽는다.
// ADR 2026-10-29-app-shell(37) 끝 "구현하며 정한 것 (경제·거래창 화면)", 경제 코어 ADR 2026-10-31-economy-core(R2).
// - 금액·수량은 최소 단위 정수다(AGENTS 4장, 서버·시뮬은 BigInt). JSON에 BigInt가 없어 10진 글자(DecimalString)로 보낸다.
//   화면은 BigInt로 바꿔 계산한다(실수 계산 없음).
// - 시안 자료(dev·admin이 켠 preview)는 응답의 preview 칸으로 알린다. 화면은 "시험 자료"를 표시한다(ADR 37 6절 [결정 2]).
// - status "not_ready" = 그 시스템을 서버가 아직 돌리지 않는다(거래소·생산 등). 그때 목록 칸은 비어 있다.
// - 팩 항목 이름은 두 언어(LocalizedName), 사람·NPC가 지은 이름(도시)은 글자 하나다(번역하지 않는다, D-6046).
// 이 파일은 타입과 상수(+ 작은 규칙 함수 marketKindOf)만 둔다(첫 화면 묶음에 넣지 않는다: 경로 "@terra/shared/economy"로만 가져온다).

/** 최소 단위 정수의 10진 글자(음수 없음, 앞자리 0 없음. "0"은 된다) */
export type DecimalString = string;

/** 팩 항목의 두 언어 이름 */
export interface LocalizedName {
  readonly ko: string;
  readonly en: string;
}

/** 그 시스템을 서버가 돌리는지 */
export type EconomyStatus = "ready" | "not_ready";

/** 응답 공통 머리 */
export interface EconomyResponseHead {
  /** 응답을 만든 서버 시각(UTC ms). 남은 시간·관측 시각 글은 이것을 기준으로 쓴다 */
  readonly generatedAt: number;
  /** 시안 자료인지(dev·admin이 켠 것) */
  readonly preview: boolean;
  readonly status: EconomyStatus;
}

// ── 목록(콘텐츠 팩) ─────────────────────────────────────────

/**
 * 거래 방식: book = 호가창(같은 물건끼리 바꿔 쓴다), auction = 경매 매물(장비 같은 완제품, D-282), none = 거래소에 올리지 않음
 * (문서 D-152, 거래 불가·계정 귀속 D-7014). 서버가 marketKindOf로 셈해 보낸다
 */
export type MarketKind = "book" | "auction" | "none";

/** 거래 방식 규칙 하나(서버 경제 시안·아이템 편집기·화면 옛 규칙 사본을 모았다, 아이템 편집기 설계안 5.1) */
export function marketKindOf(item: {
  readonly category: string;
  readonly tradable?: boolean | undefined;
  readonly bound?: boolean | undefined;
}): MarketKind {
  if (item.bound === true || item.tradable === false) return "none";
  if (item.category === "document") return "none";
  return item.category === "equipment" ? "auction" : "book";
}

export interface CatalogItemView {
  readonly id: string;
  readonly name: LocalizedName;
  /** 대분류(D-5029, @terra/content ITEM_CATEGORIES) */
  readonly category: string;
  /** 티어 T0~T9(D-5001) */
  readonly tier: number;
  /** [임시] 기준 가치(그 나라 화폐 최소 단위) */
  readonly baseValue: DecimalString;
  /**
   * 거래 방식(marketKindOf). 이 칸이 없는 옛 서버면 화면은 옛 규칙(장비 → 경매, 문서 → 없음, 나머지 → 호가창)을 쓴다
   * (PWA 기기는 서버보다 옛것이거나 새것일 수 있다)
   */
  readonly market?: MarketKind | undefined;
}

export interface CatalogFacilityView {
  readonly id: string;
  readonly name: LocalizedName;
  /** 생산 단계(D-114, @terra/content FACILITY_STAGES) */
  readonly stage: string;
  /** [임시] 레벨당 일하는 자리 수 */
  readonly slotsPerLevel: number;
}

export interface CatalogStack {
  readonly item: string;
  readonly qty: DecimalString;
}

export interface CatalogRecipeView {
  readonly id: string;
  readonly name: LocalizedName;
  readonly facility: string;
  readonly inputs: readonly CatalogStack[];
  readonly outputs: readonly CatalogStack[];
  /** [임시] 작업량(효율 1000 일꾼 한 시간 = 1000) */
  readonly work: number;
  /** 레시피 티어 = 산출 가운데 가장 높은 티어(R2 ADR 2절) */
  readonly tier: number;
  /** 기준 일꾼 한 명이 한 번 만드는 시간(ms, @terra/sim batchDurationMs) */
  readonly baseDurationMs: number;
}

export interface CatalogCurrencyView {
  /** 화폐 코드(원장 자산 "cur:<code>") */
  readonly code: string;
  readonly name: LocalizedName;
  /** 발행 나라 프리셋 ID */
  readonly nation: string;
  readonly nationName: LocalizedName;
  /** [임시] 거래세(만분율, 판 쪽이 낸다) */
  readonly tradeTaxBp: number;
}

export interface CatalogNecessityView {
  readonly id: string;
  readonly name: LocalizedName;
  readonly item: string;
  readonly perUnit: DecimalString;
  readonly periodHours: number;
}

/** economy.catalog — 켜진(enabled) 항목만, 팩 순서 */
export interface EconomyCatalogResponse {
  /** "<팩 ID>@<판>" */
  readonly contentVersion: string;
  /** 기획 확정 전 임시 팩인지 */
  readonly placeholder: boolean;
  readonly items: readonly CatalogItemView[];
  readonly facilities: readonly CatalogFacilityView[];
  readonly recipes: readonly CatalogRecipeView[];
  readonly currencies: readonly CatalogCurrencyView[];
  readonly necessities: readonly CatalogNecessityView[];
  /** 기준 통화(첫 나라 프리셋의 화폐, R2 ADR 6절). 나라가 없으면 null */
  readonly baseCurrency: string | null;
}

// ── 창고 ─────────────────────────────────────────

/** 보유 한 줄 = 원장 계정 하나(주체, 자산, 위치) */
export interface HoldingLine {
  /** 원장 자산 코드(예: "item:iron_ore", "cur:placeholder_cur_01", 시험 자원 "s3_test_ore") */
  readonly asset: string;
  /** 팩 물건 ID(자산이 item:<ID>일 때). 아니면 null */
  readonly item: string | null;
  /** 화폐 코드(자산이 cur:<코드>일 때). 아니면 null */
  readonly currency: string | null;
  readonly qty: DecimalString;
  /** 거래소 주문에 묶인 양(에스크로, 이미 qty에서 빠졌다). 모르면 "0" */
  readonly locked: DecimalString;
  /** 식품이 상하기 시작하는 가장 이른 시각(UTC ms, D-121·D-5030). 상하지 않거나 모르면 null */
  readonly spoilsAt: number | null;
  /** 시안 자료 줄(실제 잔고와 섞여 보일 때 화면이 "시험 자료"를 붙인다) */
  readonly preview?: true;
}

/** 창고 종류(D-121). [임시] 종류별 규칙은 기획 Step 5 */
export type StoreKind = "general" | "food" | "armory";

/** 보유가 있는 곳 */
export interface HoldingPlace {
  /** 곳 ID: 창고 위치(도시) ID, 위치 없는 계정은 "ledger", 유닛이 실은 화물은 "cargo_<유닛 ID>" */
  readonly id: string;
  readonly kind: "warehouse" | "ledger" | "cargo";
  /** 도시 이름(번역하지 않는다). 모르면 null */
  readonly name: string | null;
  readonly store: StoreKind | null;
  /** [임시] 용량(물건 개수 합). 모르면 null */
  readonly capacity: { readonly used: DecimalString; readonly max: DecimalString } | null;
  readonly lines: readonly HoldingLine[];
  /** 시안 자료 창고 */
  readonly preview?: true;
}

/** economy.holdings — 로그인한 본인의 원장 잔고(+ 시안 자료) */
export interface EconomyHoldingsResponse extends EconomyResponseHead {
  /** 월드에 이 계정의 소유 주체가 있는지(없으면 아직 아무것도 없다) */
  readonly hasOwner: boolean;
  /** 화폐(위치 없는 화폐 계정) */
  readonly wallet: readonly HoldingLine[];
  readonly places: readonly HoldingPlace[];
}

// ── 생산 ─────────────────────────────────────────

export type FacilityStatus = "running" | "idle" | "no_input" | "storage_full";

export interface ProductionRun {
  readonly recipe: string;
  readonly startedAt: number;
  readonly endsAt: number;
}

export interface ProductionFacility {
  /** 시설 하나(건물) ID */
  readonly id: string;
  /** 시설 종류(팩 facilities ID) */
  readonly facility: string;
  /** 있는 도시 이름 */
  readonly place: string;
  /** 레벨 Lv1~5(D-5001). 다루는 최고 티어 = 2 × Lv − 1 */
  readonly level: number;
  readonly workers: number;
  /** 일하는 자리 수(Lv × slotsPerLevel) */
  readonly slots: number;
  readonly status: FacilityStatus;
  readonly current: ProductionRun | null;
  /** 생산 예약(차례대로, 묶음 수) */
  readonly queue: readonly { readonly recipe: string; readonly batches: number }[];
}

/** 반복 예약 조건(D-6016: 주기·조건) */
export type RepeatCondition =
  | { readonly kind: "below"; readonly item: string; readonly qty: DecimalString }
  | { readonly kind: "every"; readonly hours: number };

export interface RepeatOrder {
  readonly id: string;
  /** 시설 하나 ID(ProductionFacility.id) */
  readonly facility: string;
  readonly recipe: string;
  readonly condition: RepeatCondition;
  readonly enabled: boolean;
}

/** 급여 한 줄(D-431·D-432): 급여 = 효율점수 × 단가, 단가 = 도시 기준값 + 고용주 조정 */
export interface WageLine {
  /** 직무(시설 종류 ID) */
  readonly job: string;
  readonly place: string;
  readonly workers: number;
  /** 평균 효율점수(1000 = 기준 일꾼) */
  readonly efficiency: number;
  /** 도시 기준 단가(하루, 화폐 최소 단위) */
  readonly baseWage: DecimalString;
  /** 고용주 조정(만분율, 음수 가능) */
  readonly adjustBp: number;
  readonly currency: string;
}

/** economy.production */
export interface EconomyProductionResponse extends EconomyResponseHead {
  readonly facilities: readonly ProductionFacility[];
  readonly repeats: readonly RepeatOrder[];
  readonly wages: readonly WageLine[];
}

// ── 거래창(물자, 연속 체결 D-125) ─────────────────────────────

export type OrderSide = "buy" | "sell";

/** 남은 주문 수(D-148·D-6034): 쓴 수/한도, 한도에 닿으면 다시 되는 시각 */
export interface OrderLimit {
  readonly used: number;
  readonly max: number;
  /** 하나가 다시 되는 시각(UTC ms). 여유가 있으면 null */
  readonly recoversAt: number | null;
}

export interface MarketItemSummary {
  readonly item: string;
  /** 이 물건을 거래하는 도시 수 */
  readonly cities: number;
  /** 지난 24시간 체결 수량(모든 도시 합) */
  readonly volume: DecimalString;
  /** 기준 도시(homeCity)의 마지막 체결가와 화폐. 없으면 null */
  readonly last: DecimalString | null;
  readonly currency: string | null;
  /** 24시간 바뀐 정도(만분율). 모르면 null */
  readonly changeBp: number | null;
  /** 기준 도시의 시간마다 종가(오래된 차례, 최대 24개) */
  readonly spark: readonly DecimalString[];
}

/** economy.marketItems */
export interface MarketItemsResponse extends EconomyResponseHead {
  /** 가격을 보이는 기준 도시(내 창고가 있는 첫 도시 [임시]). 없으면 null */
  readonly homeCity: { readonly id: string; readonly name: string } | null;
  readonly items: readonly MarketItemSummary[];
}

/** 도시별 목록 한 줄(D-6032: 가격·거리·운임·관측 시각) */
export interface MarketCityRow {
  readonly city: string;
  readonly name: string;
  readonly currency: string;
  readonly bestBid: DecimalString | null;
  readonly bestAsk: DecimalString | null;
  readonly last: DecimalString | null;
  readonly changeBp: number | null;
  readonly volume: DecimalString;
  /** 기준 도시에서의 거리(km). 기준 도시 자신은 0 */
  readonly distanceKm: number;
  /** [임시] 기준 도시까지 정규 운송 운임(물건 1개, 이 도시 화폐). 기준 도시는 null */
  readonly freightPerUnit: DecimalString | null;
  /** 이 값을 본 시각. 시야 밖 도시는 마지막 관측값이다(D-6032) */
  readonly observedAt: number;
  readonly inSight: boolean;
  /** 이 도시에 내 창고가 있는지(없는 도시에서 사면 보관·운송 발주, D-6032) */
  readonly hasWarehouse: boolean;
}

/** economy.marketCities */
export interface MarketCitiesResponse extends EconomyResponseHead {
  readonly item: string;
  readonly rows: readonly MarketCityRow[];
}

/** 호가 한 단계 */
export interface BookLevel {
  readonly price: DecimalString;
  readonly qty: DecimalString;
  readonly orders: number;
  /** 이 단계의 내 주문 양("0"이면 없음) */
  readonly mine: DecimalString;
}

/** 체결 한 건 */
export interface TradeTick {
  readonly at: number;
  readonly price: DecimalString;
  readonly qty: DecimalString;
  /** 들어온 주문의 쪽(buy = 매도 호가를 사 갔다) */
  readonly side: OrderSide;
}

/** 봉 하나(시가·고가·저가·종가·거래량) */
export interface Candle {
  /** 봉이 시작한 시각 */
  readonly at: number;
  readonly open: DecimalString;
  readonly high: DecimalString;
  readonly low: DecimalString;
  readonly close: DecimalString;
  readonly volume: DecimalString;
}

/** economy.marketBook — 도시 하나 × 물건 하나의 호가창·체결·봉·주문표 자료 */
export interface MarketBookResponse extends EconomyResponseHead {
  readonly item: string;
  readonly city: string;
  readonly cityName: string;
  readonly currency: string;
  /** 거래세(만분율, 판 쪽이 낸다. R2 ADR 4절) */
  readonly taxBp: number;
  /** 매도 호가(낮은 값 차례) */
  readonly asks: readonly BookLevel[];
  /** 매수 호가(높은 값 차례) */
  readonly bids: readonly BookLevel[];
  readonly last: DecimalString | null;
  readonly changeBp: number | null;
  readonly high: DecimalString | null;
  readonly low: DecimalString | null;
  readonly volume: DecimalString;
  /** 최근 체결(새것 먼저) */
  readonly trades: readonly TradeTick[];
  /** 봉(오래된 차례) */
  readonly candles: readonly Candle[];
  /** 봉 하나의 길이(ms) */
  readonly candleMs: number;
  /** 내 몫: 이 도시 창고의 이 물건(팔 수 있는 양), 지갑의 이 화폐(살 수 있는 돈) */
  readonly mine: { readonly goods: DecimalString; readonly cash: DecimalString };
  readonly limit: OrderLimit;
  /** [임시] 고를 수 있는 지정가 만료(날). 기획 잠정 7일(E10) */
  readonly expiryDays: readonly number[];
  readonly observedAt: number;
  readonly inSight: boolean;
}

export type MyOrderType = "limit" | "conditional";

/** 걸려 있는 내 주문 */
export interface MyOrder {
  readonly id: string;
  readonly item: string;
  readonly city: string;
  readonly cityName: string;
  readonly currency: string;
  readonly side: OrderSide;
  readonly type: MyOrderType;
  readonly price: DecimalString;
  readonly qty: DecimalString;
  readonly remaining: DecimalString;
  readonly placedAt: number;
  readonly expiresAt: number;
}

/** 끝난 내 주문(체결·만료·취소) */
export interface MyOrderDone {
  readonly id: string;
  readonly item: string;
  readonly city: string;
  readonly cityName: string;
  readonly currency: string;
  readonly side: OrderSide;
  readonly price: DecimalString;
  readonly qty: DecimalString;
  readonly filled: DecimalString;
  readonly status: "filled" | "expired" | "cancelled";
  readonly at: number;
}

/** economy.orders — 내 주문(/economy/orders, D-329) */
export interface EconomyOrdersResponse extends EconomyResponseHead {
  readonly open: readonly MyOrder[];
  readonly done: readonly MyOrderDone[];
  readonly limit: OrderLimit;
}

// ── 환전(동시호가 D-125, R2 ADR 6절) ─────────────────────────

/** 동시호가 호가 한 단계(로트 수) */
export interface FxLevel {
  readonly price: DecimalString;
  readonly lots: DecimalString;
}

/** 화폐 X ↔ 기준 통화 짝 */
export interface FxPairView {
  readonly currency: string;
  /** 로트 = X 최소 단위 몇 개 */
  readonly lotSize: DecimalString;
  /** 지난 회차 체결가(로트당 기준 통화 최소 단위). 없으면 null */
  readonly last: DecimalString | null;
  /** 지금 모인 주문으로 낸 예상 체결가·체결 로트. 체결이 없으면 null·"0" */
  readonly indicative: DecimalString | null;
  readonly indicativeLots: DecimalString;
  readonly changeBp: number | null;
  /** 이번 회차 살 쪽(값 높은 차례)·팔 쪽(값 낮은 차례) */
  readonly buys: readonly FxLevel[];
  readonly sells: readonly FxLevel[];
  /** 지난 회차 체결가(오래된 차례) */
  readonly history: readonly { readonly at: number; readonly price: DecimalString }[];
  /** 내 X 잔고 */
  readonly balance: DecimalString;
}

/** economy.exchange */
export interface EconomyExchangeResponse extends EconomyResponseHead {
  /** 기준 통화 코드. 없으면 null */
  readonly base: string | null;
  readonly baseBalance: DecimalString;
  /** 회차 길이(ms, E8 기존 1시간) */
  readonly intervalMs: number;
  /** 다음 체결 시각 */
  readonly nextAuctionAt: number;
  readonly pairs: readonly FxPairView[];
}

/** 10진 글자 모양(최소 단위 정수, 음수·앞자리 0 없음) */
export const DECIMAL_PATTERN = /^(0|[1-9]\d*)$/;
