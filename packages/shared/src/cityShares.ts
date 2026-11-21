// 도시(정부) 지분 시장·증권 거래소 조회 모양 — 기획 D-583(질문 2438 답: "정부건물 내 전체지분 조회기능, 호가창처럼 거래가능 … 소유자는 지분을 매도가
// 정해서 걸어놓을 수 있음, 반대로 매수자는 매수금액 걸어놓기 가능. 증권거래소 건물의 주기능 해당 도시나 국가의 정부 지분이나 사업장 지분 거래 가능"),
// D-130(도시 지분 1000주 = 원장 자산 share_<도시>)·D-125(동시호가)·D-344(독재 지배 가문 과반)·D-581(국고 지분 의결권), docs/adr/2026-11-21-share-market.md.
// - 시장 = 도시마다 동시호가 하나(체결 함수는 사업장 지분·환전과 같은 @terra/sim clearCallAuction). 값을 매기는 화폐 = 그 도시 주인 나라 국고 화폐.
// - 사는 돈은 회차까지 묶는다(시스템 계정 escrow:cityshare:<도시>:<화폐>). 파는 지분은 묶지 않고 판 사람 계정에 둔 채 걸어 두고 회차 때 다시 본다
//   (도시 지분은 의결권·배당·과반·상장폐지가 계정 잔고로 센다 — 묶으면 회차 동안 그 몫이 사라진다. ADR 2절).
// 서버·화면이 같이 쓴다.
import type { LocalizedName } from "./roster.ts";
import type { ShareBookView, ShareExpectedView } from "./shareBook.ts";
import type { ShareRoundView } from "./businessBooks.ts";

/** 도시 지분 시장 거래 종류 앞머리(cityshare_escrow·cityshare_clear·cityshare_refund) */
export const CITY_SHARE_MARKET_PREFIX = "cityshare";

/** 사는 돈 에스크로 시스템 계정 코드(도시·화폐마다 하나 — 도시 주인이 바뀌어 화폐가 바뀌어도 옛 주문 돈이 섞이지 않는다) */
export function cityShareEscrowCode(cityId: number, asset: string): string {
  return `escrow:${CITY_SHARE_MARKET_PREFIX}:${cityId}:${asset}`;
}

/** 증권 거래소 건물의 시설 ID(팩 facilities.json — 화면이 건물 판에 거래소 칸을 띄울지 고른다. 서버는 팩 exchange 칸 securities로 본다) */
export const STOCK_EXCHANGE_FACILITY = "stock_exchange";

/**
 * 주주 종류: treasury = 그 도시 주인 나라 국고, nation = 다른 나라 국고, house = 가문 지분 계정(플레이어 가문 p: · NPC 가문 n:)·가문 소유 주체,
 * player = 다른 플레이어, me = 보는 사람, my_house = 보는 사람이 이끄는 가문
 */
export type CityShareHolderKind = "treasury" | "nation" | "house" | "player" | "me" | "my_house";

export interface CityShareHolderView {
  readonly kind: CityShareHolderKind;
  readonly name: LocalizedName | null;
  /** NPC 가문·NPC 나라인가 */
  readonly npc: boolean;
  readonly shares: string;
  /** 몫(‰, 내림) */
  readonly pm: number;
  /** 지금 지배 가문(D-217)인가 */
  readonly ruling?: boolean | undefined;
}

/** 주문을 낸 쪽: me = 내 계정, house = 내가 이끄는 가문(가문 지분 계정·가문 금고), treasury = 국고(승인된 국고 지분 팔기 — 보기만) */
export type CityShareActor = "me" | "house" | "treasury";

export interface CityShareOrderView {
  readonly id: number;
  readonly side: "buy" | "sell";
  readonly price: string;
  readonly shares: string;
  readonly as: CityShareActor;
}

/** 보는 사람이 낼 수 있는 쪽 하나(내 계정 · 내 가문) */
export interface CityShareWallet {
  readonly shares: string;
  readonly cash: string;
  /** 팔 수 있는 주 수(가진 주 − 이미 걸어 둔 팔 주문 — 독재 지배 가문은 과반(D-344)을 지키는 데까지) */
  readonly sellable: string;
}

export interface CityShareTreasuryView {
  /** 국고가 가진 주 수 */
  readonly shares: string;
  /** 국고 지분 팔기 안건을 올릴 수 있나(독재 = 지도자 직권, 그 밖 = 안건을 올릴 자격 — 판정은 서버 gov_propose) */
  readonly canPropose: boolean;
  readonly dictatorship: boolean;
  /**
   * 이 도시에 걸린 국고 주문(승인된 국고 지분 팔기·사기 — D-587 질문 2473 다·2479 나: 걸린 값에 남고 저절로 거두지 않는다). 옛 응답에는 없다
   */
  readonly orders?: readonly CityShareOrderView[] | undefined;
  /** 국고 주문을 거둘 수 있나(그 나라 지도자 — 질문 2473 다). 옛 응답에는 없다 */
  readonly canWithdraw?: boolean | undefined;
  /** 국고가 가진 이 도시 화폐(국고 지분 사기 안건의 묶을 돈 미리 보기 — 질문 2479 나). 옛 응답에는 없다 */
  readonly cash?: string | undefined;
}

export interface CityShareMarketView {
  readonly status: "ok";
  readonly cityId: number;
  readonly cityName: LocalizedName | null;
  readonly nationName: LocalizedName | null;
  /** 주인 나라 체제(독재면 지배 가문이 과반을 지킨다) */
  readonly regime: "dictatorship" | "democracy" | "capitalism" | null;
  /** 값을 매기는 화폐(원장 자산 — 그 나라 국고 화폐) */
  readonly asset: string;
  /** 이 도시 지분 합 */
  readonly total: string;
  /** 이 도시 주주(많은 차례) */
  readonly holders: readonly CityShareHolderView[];
  /** 그 나라 모든 도시 지분 합·주주(많은 차례) */
  readonly nationTotal: string;
  readonly nationHolders: readonly CityShareHolderView[];
  readonly lastPrice: string | null;
  readonly roundMs: number;
  readonly nextRoundMs: number;
  readonly book: ShareBookView;
  readonly expected: ShareExpectedView | null;
  readonly bidShares: string;
  readonly askShares: string;
  /** 내 계정(로그인 사용자) */
  readonly me: CityShareWallet;
  /** 내가 이끄는 가문(가문장이 아니면 null) */
  readonly house: CityShareWallet | null;
  readonly myOrders: readonly CityShareOrderView[];
  readonly orderMax: number;
  readonly rounds: readonly ShareRoundView[];
  /** 국고 지분(보는 사람이 그 나라 사람일 때 — 아니면 null) */
  readonly treasury: CityShareTreasuryView | null;
  /**
   * 보는 사람 나라의 국고 지분 사기 안건(질문 2479 나 — 제 나라·남의 나라 도시 모두). 보는 사람이 나라 사람이 아니면 null. 옛 응답에는 없다.
   * canPropose = 독재 지도자 직권 또는 안건을 올릴 자격(판정은 서버 gov_propose), cash = 그 국고의 이 도시 화폐
   */
  readonly treasuryBuy?: {
    readonly canPropose: boolean;
    readonly dictatorship: boolean;
    readonly cash: string;
    readonly own: boolean;
  } | null;
  /** 체결 때 판 쪽이 내는 거래세·증권 거래소 이용료(만분율 — D-587 질문 2474 다, 이용료는 그 도시에 증권 거래소가 있을 때만). 옛 응답에는 없다 */
  readonly levy?: { readonly taxBp: number; readonly feeBp: number | null } | undefined;
}

export type CityShareMarketResponse =
  | { readonly status: "not_ready" | "unknown_city" | "sign_in_required" }
  | CityShareMarketView;

/** 증권 거래소 목록의 도시 시장 한 줄 */
export interface CityShareSummary {
  readonly cityId: number;
  readonly name: LocalizedName | null;
  readonly asset: string;
  readonly total: string;
  readonly lastPrice: string | null;
  readonly bidShares: string;
  readonly askShares: string;
}

/** 증권 거래소 목록의 사업장 지분 시장 한 줄 */
export interface BusinessShareSummary {
  readonly buildingId: number;
  readonly cityId: number;
  readonly facilityId: string;
  readonly name: LocalizedName | null;
  readonly issued: boolean;
  readonly lastPrice: string | null;
  readonly bidShares: string;
  readonly askShares: string;
}

/** 증권 거래소 건물 판(그 건물이 선 도시의 나라 — 그 나라 도시 정부 지분 시장과 그 도시들의 사업장 지분 시장) */
export type ShareHubResponse =
  | { readonly status: "not_ready" | "not_exchange" | "stopped" }
  | {
      readonly status: "ok";
      readonly buildingId: number;
      readonly cityId: number;
      readonly nationName: LocalizedName | null;
      readonly nextRoundMs: number;
      readonly cities: readonly CityShareSummary[];
      readonly businesses: readonly BusinessShareSummary[];
    };
