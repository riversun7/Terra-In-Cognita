// 물자 거래소 메시지(프로토콜 14부터) — docs/adr/2026-11-07-play-flow.md "WP4 도시 경제·거래소", 경제 코어 ADR 2026-10-31-economy-core.md
// 4·5절(연속 체결·에스크로·커밋 뒤 응답), 기획 D-125·D-6033~D-6035(주문표)·44 §(도시마다 거래소, 산 물건은 그 도시 창고).
// - 바꾸는 명령: 주문 넣기(market_place: 지정가 = 남은 양을 만료까지 걸어 둠, 시장가 = 안전망 값까지 바로 체결하고 남은 양은 거둠),
//   주문 취소(market_cancel). 값은 묶음 하나당 화폐 최소 단위, 수량은 묶음 수(10진 문자열). 판 물건은 그 도시 내 창고에서 묶이고,
//   산 물건은 그 도시 내 창고로 들어간다. 결과는 market_result(커밋 뒤).
// - 체결 알림(market_watch로 켠 연결에만): 내 걸린 주문이 남의 주문과 체결되면 market_fill.
// - 조회(호가창·체결·봉·내 주문·도시별 값)는 tRPC economy.*다.
// - 환전(프로토콜 15부터, docs/adr/2026-11-07-play-flow.md "WP6 나라 화폐·체결 알림"): 나라 화폐 ↔ 기준 통화 동시호가(D-125)에 주문 내기
//   (fx_place: 값 = 로트당 기준 통화 최소 단위, 수량 = 로트 수, 회차(1시간)에 한꺼번에 체결되고 남은 양은 회차 뒤 돌려받음)·회차 전 거두기
//   (fx_cancel) → fx_result(커밋 뒤). 화폐는 팩 화폐 코드(원장 자산 cur:<코드>의 코드)다.
// 이 꾸러미는 다른 내부 꾸러미를 가져오지 않는다: 도시·물건·잔고 확인은 서버가 하고, 여기서는 모양만 본다.
import { z } from "zod";

/** 거래소 메시지에 필요한 가장 낮은 프로토콜 버전. 더 낮게 인사한 연결이 보내면 invalid_message로 거절한다 */
export const MARKET_PROTOCOL_VERSION = 14;
/** 환전 메시지에 필요한 가장 낮은 프로토콜 버전 */
export const FX_PROTOCOL_VERSION = 15;
/** 거래소 건물(기획 D-561): 결과 코드 no_exchange(물자·환전)가 생긴 판. 더 낮은 판 연결은 unknown_city·unknown_currency를 받는다 */
export const EXCHANGE_MARKET_PROTOCOL_VERSION = 47;
/**
 * 거래소 개인 창고(기획 D-571 1943): market_locker_expand 메시지와 결과 코드 locker_full·locker_max가 생긴 판. 더 낮은 판 연결은 이 메시지를 보내지
 * 못하고(invalid_message), 사기 주문의 locker_full은 invalid_amount로 받는다
 */
export const LOCKER_PROTOCOL_VERSION = 56;
/** 지정가 만료로 고를 수 있는 가장 긴 날(기획 잠정 7일 E10, 서버가 고를 수 있는 날만 받는다) */
export const MARKET_EXPIRY_DAYS_MAX = 30;

const requestId = z.number().int().nonnegative().max(0xffff_ffff);
const rowId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const amount = z.string().regex(/^(0|[1-9][0-9]{0,30})$/);
const positiveAmount = z.string().regex(/^[1-9][0-9]{0,30}$/);
const itemId = z.string().regex(/^[a-z][a-z0-9_]{1,47}$/);
/** 팩 화폐 코드(국가 프리셋 currency.code) */
const currencyCode = z.string().regex(/^[a-z][a-z0-9_]{1,47}$/);
const side = z.enum(["buy", "sell"]);
const timestampMs = z.number().int().nonnegative();

// ---------- 기기 → 서버 ----------

/**
 * 주문 넣기. kind limit = 지정가(price에 걸어 둔다, expiryDays 날 뒤 만료), market = 시장가(price = 안전망: 살 때 최대·팔 때 최소 값,
 * 그 값까지 바로 체결하고 남은 양은 걸지 않는다 — D-6035)
 */
export const marketPlaceMessage = z.object({
  t: z.literal("market_place"),
  id: requestId,
  city: rowId,
  item: itemId,
  side,
  kind: z.enum(["limit", "market"]),
  price: positiveAmount,
  qty: positiveAmount,
  expiryDays: z.number().int().min(1).max(MARKET_EXPIRY_DAYS_MAX).optional(),
});

/** 내 걸린 주문을 거둔다(묶인 물건·돈을 돌려받는다) */
export const marketCancelMessage = z.object({
  t: z.literal("market_cancel"),
  id: requestId,
  order: rowId,
});

/** 그 도시 거래소 개인 창고를 한 칸 넓힌다(그 도시 화폐로 한 칸 값을 낸다 — D-571 1943, 판 56) */
export const marketLockerExpandMessage = z.object({
  t: z.literal("market_locker_expand"),
  id: requestId,
  city: rowId,
});

/** 이 연결에 체결 알림(market_fill)을 켜고 끈다(거래창을 연 동안) */
export const marketWatchMessage = z.object({
  t: z.literal("market_watch"),
  id: requestId,
  on: z.boolean(),
});

/** 환전 주문 내기(동시호가, 다음 회차에 체결). side buy = 그 화폐를 기준 통화로 산다(price = 상한), sell = 판다(price = 하한) */
export const fxPlaceMessage = z.object({
  t: z.literal("fx_place"),
  id: requestId,
  currency: currencyCode,
  side,
  price: positiveAmount,
  lots: positiveAmount,
});

/** 회차 전에 내 환전 주문을 거둔다(묶인 것을 돌려받는다) */
export const fxCancelMessage = z.object({
  t: z.literal("fx_cancel"),
  id: requestId,
  order: rowId,
});

// ---------- 서버 → 기기 ----------

/** 결과 코드. 화면 문구는 기기가 코드로 고른다 */
export const MARKET_RESULT_CODES = [
  "sign_in_required",
  /** 세계·도시 경제가 준비 중이거나 저장 대기열이 밀림 — 다시 해 볼 수 있다 */
  "busy",
  "rate_limited",
  "internal_error",
  /** 운영 스위치로 거래소가 잠시 멈춤(49 N53) */
  "market_paused",
  /** 없는 도시(폐허가 됐거나 다른 행성) */
  "unknown_city",
  /** 거래소에 올리지 않는 물건(장비·유전자·문서·없는 ID) */
  "unknown_item",
  /** 없는 주문(이미 끝났음) */
  "unknown_order",
  /** 내 주문이 아님 */
  "not_owner",
  /** 그 도시 내 창고의 물건이 모자람(팔기) */
  "insufficient_goods",
  /** 화폐가 모자람(사기) */
  "insufficient_funds",
  /** 넣을 수 없는 값(수량·값이 너무 큼, 만료 날을 고를 수 없음) */
  "invalid_amount",
  /** 걸어 둔 주문 수가 한도에 닿음(D-148·D-6034) */
  "order_limit",
  /** 시장가인데 안전망 안에 반대쪽 호가가 없음 */
  "no_liquidity",
  /**
   * 그 도시에 물자 거래소 건물이 없음(기획 D-561 — 47, 더 낮은 판 연결은 unknown_city, EXCHANGE_MARKET_PROTOCOL_VERSION). 거래소에 올릴 물건은 거래소
   * 건물 창고로 실어 나른다
   */
  "no_exchange",
  /** 거래소 개인 창고에 자리가 모자람(사기 — 산 물건이 들어올 자리, 기획 D-571 1943 — 56, 더 낮은 판은 invalid_amount) */
  "locker_full",
  /** 개인 창고를 더 넓힐 수 없음(넓히기 칸 수 위 끝 — 56) */
  "locker_max",
] as const;
export type MarketResultCode = (typeof MARKET_RESULT_CODES)[number];

const marketResultMessage = z.discriminatedUnion("ok", [
  z.object({
    t: z.literal("market_result"),
    id: requestId,
    ok: z.literal(true),
    /** 넣은 주문 ID(넣기). 취소·알림 켜기에는 없다 */
    orderId: rowId.optional(),
    /** 바로 체결한 수량(묶음)·걸어 둔 남은 수량(묶음, 시장가는 늘 "0") */
    filled: amount.optional(),
    resting: amount.optional(),
  }),
  z.object({
    t: z.literal("market_result"),
    id: requestId,
    ok: z.literal(false),
    code: z.enum(MARKET_RESULT_CODES),
  }),
]);

/** 환전 결과 코드(프로토콜 15부터) */
export const FX_RESULT_CODES = [
  "sign_in_required",
  "busy",
  "rate_limited",
  "internal_error",
  /** 운영 스위치로 거래소가 잠시 멈춤(49 N53, 환전도 같은 스위치) */
  "market_paused",
  /** 환전 짝이 없는 화폐(발행하는 나라가 없음·기준 통화) */
  "unknown_currency",
  "unknown_order",
  "not_owner",
  /** 사기 = 기준 통화, 팔기 = 그 화폐가 모자람 */
  "insufficient_funds",
  "invalid_amount",
  /** 회차에 낼 수 있는 주문 수가 한도에 닿음 */
  "order_limit",
  /** 그 화폐를 쓰는 나라의 도시에 외환 거래소 건물이 없음(기획 D-561 — 47, 더 낮은 판 연결은 unknown_currency) */
  "no_exchange",
] as const;
export type FxResultCode = (typeof FX_RESULT_CODES)[number];

const fxResultMessage = z.discriminatedUnion("ok", [
  z.object({
    t: z.literal("fx_result"),
    id: requestId,
    ok: z.literal(true),
    /** 낸 주문 ID(내기). 거두기에는 없다 */
    orderId: rowId.optional(),
  }),
  z.object({
    t: z.literal("fx_result"),
    id: requestId,
    ok: z.literal(false),
    code: z.enum(FX_RESULT_CODES),
  }),
]);

/** 내 걸린 주문이 체결됐다(그 주문의 남은 양 remaining, 다 찼으면 "0") */
const marketFillMessage = z.object({
  t: z.literal("market_fill"),
  order: rowId,
  city: rowId,
  item: itemId,
  side,
  price: positiveAmount,
  qty: positiveAmount,
  remaining: amount,
  at: timestampMs,
});

export const marketClientMessages = [
  marketPlaceMessage,
  marketCancelMessage,
  marketWatchMessage,
  marketLockerExpandMessage,
  fxPlaceMessage,
  fxCancelMessage,
] as const;
export const marketServerMessages = [marketResultMessage, marketFillMessage, fxResultMessage] as const;
