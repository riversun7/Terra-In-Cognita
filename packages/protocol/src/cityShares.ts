// 도시(정부) 지분 주문 메시지(프로토콜 CITY_SHARE_PROTOCOL_VERSION부터) — 기획 D-583(질문 2438 답 "정부건물 내 전체지분 조회기능, 호가창처럼 거래가능
// … 소유자는 지분을 매도가 정해서 걸어놓을 수 있음, 반대로 매수자는 매수금액 걸어놓기 가능"), D-125(동시호가 그대로), docs/adr/2026-11-21-share-market.md.
// - city_share_order: 도시 하나의 지분을 사거나 판다. price = 1주 값(살 쪽 상한·팔 쪽 하한, 그 도시 주인 나라 화폐 최소 단위), shares = 주 수.
//   asHouse = 내가 이끄는 가문 이름으로(가문 지분 계정에서 팔고 가문 금고 돈으로 산다). 없으면 내 계정. 사기는 돈을 회차까지 묶는다.
// - city_share_cancel: 회차 전에 내 주문(내 계정·내 가문)을 거둔다(묶은 돈을 돌려준다).
// - 회차(설정 칸 city_share_round_ms)마다 한 값으로 체결하고 체결되지 않은 몫은 거둘 때까지 남는다. 국고 주문은 의결로 승인된 팔기·사기만 시장에
//   나온다(서버가 건다). 62부터 그 나라 지도자는 city_share_cancel로 국고 주문도 거둔다(D-587 질문 2473 다 — 꼴 그대로).
// 결과는 city_share_result 하나(id = 요청 id). 조회는 tRPC shares.city·shares.hub다. 이 꾸러미는 다른 내부 꾸러미를 가져오지 않는다.
import { z } from "zod";

/** 도시 지분 주문 메시지에 필요한 가장 낮은 프로토콜 버전(묶음 1116z 판 60) */
export const CITY_SHARE_PROTOCOL_VERSION = 60;

const requestId = z.number().int().nonnegative().max(0xffff_ffff);
const rowId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
/** 1 이상 값·주 수(최소 단위 정수 글자, BigInt) */
const positive = z.string().regex(/^[1-9][0-9]{0,17}$/);

// ---------- 기기 → 서버 ----------

export const cityShareOrderMessage = z.object({
  t: z.literal("city_share_order"),
  id: requestId,
  cityId: rowId,
  side: z.enum(["buy", "sell"]),
  price: positive,
  shares: positive,
  /** 내가 이끄는 가문 이름으로(가문장만). 없으면 내 계정 */
  asHouse: z.boolean().optional(),
  /**
   * 주문을 낸 증권 거래소 건물(그 거래소 판의 지분 목록에서 열었을 때 — 판 135부터, 줄기 gov-fix-4 D-591 2523). 체결 이용료를 이 거래소가 받는다. 없으면 그 지분 도시의
   * 증권 거래소
   */
  exchangeId: rowId.optional(),
});

export const cityShareCancelMessage = z.object({
  t: z.literal("city_share_cancel"),
  id: requestId,
  orderId: rowId,
});

/** 결과 코드. 화면 문구는 기기가 코드로 고른다 */
export const CITY_SHARE_RESULT_CODES = [
  "sign_in_required",
  /** 세계·DB가 준비 중 — 다시 해 볼 수 있다 */
  "busy",
  "rate_limited",
  "internal_error",
  /** 그런 도시가 없다(폐허·상장폐지 포함) */
  "unknown_city",
  /** 가문장이 아니다(asHouse) */
  "not_house_head",
  /** 회차에 걸 수 있는 주문 수를 넘었다(설정 칸 city_share_order_max) */
  "order_limit",
  /** 팔 지분이 모자라다(이미 걸어 둔 팔 주문 몫을 뺀 것) */
  "insufficient_shares",
  /** 묶을 돈이 모자라다 */
  "insufficient_funds",
  /** 독재 나라 지배 가문은 과반 아래로 팔지 못한다(D-344) */
  "dictatorship_majority",
  /** 그런 주문이 없다(이미 체결·거둠) */
  "unknown_order",
  /** 내 주문이 아니다 */
  "forbidden",
] as const;
export type CityShareResultCode = (typeof CITY_SHARE_RESULT_CODES)[number];

// ---------- 서버 → 기기 ----------

const cityShareResultMessage = z.discriminatedUnion("ok", [
  z.object({
    t: z.literal("city_share_result"),
    id: requestId,
    ok: z.literal(true),
    /** 넣은 주문 ID(city_share_order) */
    orderId: rowId.optional(),
  }),
  z.object({
    t: z.literal("city_share_result"),
    id: requestId,
    ok: z.literal(false),
    code: z.enum(CITY_SHARE_RESULT_CODES),
  }),
]);

export const cityShareClientMessages = [cityShareOrderMessage, cityShareCancelMessage] as const;
export const cityShareServerMessages = [cityShareResultMessage] as const;
