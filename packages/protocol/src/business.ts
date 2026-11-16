// 사업장 장부 명령(프로토콜 34부터) — 기획 D-548·D-555(질문 1501~1514 답), docs/adr/2026-11-15-business-ledger.md
// - 정산(business_settle, 1501·1502): 주인·대주주가 사업장 금고 돈을 지분 수대로 주주 지갑에 나눈다(적자를 먼저 갚는다). amount가 없으면 전부.
// - 넣기(business_invest): 주인 지갑 → 사업장 금고(적자를 바로 갚는다 — 1504).
// - 사기(business_buy, 1507): 사업장 창고 물건을 산다. 남은 대량(B2B, 최소 묶음)으로, 저급 도시는 낱개(소매)로도. 주인도 값을 내고 꺼낸다.
//   물건은 산 사람의 그 도시 창고로, 돈은 사업장 금고로(소득세).
//   바뀜 (프로토콜 46, 기획 D-569 1781·1784): 주인도 누구나와 같은 판매(같은 판매가·최소 묶음, 0 = 아무에게도 안 팖)이고 돈은 사업장 매출로 잡힌다.
//   산 물건은 운반꾼(그 건물 일꾼 또는 산 사람의 유닛)이 도시 창고로 걸어 나른다 — 운반꾼이 없으면 no_carrier(옮김 셈을 끄거나 거리 0이면 바로).
// - 값 정하기(business_price): 주인·대주주가 아이템 1개 값을 정한다(0 = 남에게 팔지 않음). 48부터 외주 수리 시간당 요금도(item =
//   service:equipment_repair, D-570 1785). 51부터 조선소 배 판매가도(item = boat:<배 종류>, 0 = 그 종류는 만들지 않음 — 기획 대조 2057).
//   52부터 외환 거래소 환전 이용료 요율도(item = service:fx_fee, 값 = 만분율 — 질문 2086, 줄기 exchange-3 판 56).
// - 선물(unit_gift, 1508): 내 유닛의 사유재산(유닛 지갑)에 돈을 준다. 유닛은 그 돈으로 숙박비를 낸다.
// - 지분 주문(business_share_order·business_share_cancel, 프로토콜 38 — docs/adr/2026-11-15-building-screen.md): 생산시설 지분(기획 44 §6
//   "100% 매각 가능, 배당은 지분만큼")을 동시호가(D-125)로 사고판다. 사기 = 1주 상한 × 주 수를 지갑(사업장 금고 화폐)에서 묶고, 팔기 = 그 지분을
//   묶는다. 회차(설정 칸 business_share_round_ms)마다 한 값으로 체결하고 남은 것은 돌려준다. 회차 전에 거둘 수 있다.
// - 지급준비율(business_reserve, 프로토콜 40 — 기획 D-564 1623): 주인·대주주가 정산 때 금고에 남길 비율(‰, 자동 계산한 필요액 × 비율)을 고른다.
//   null이면 설정 칸 기본값으로 돌린다.
// 결과는 business_result 하나(id = 요청 id). 오류는 코드다(기기가 번역). 조회는 tRPC facilities.books다.
import { z } from "zod";

/** 사업장 장부 메시지에 필요한 가장 낮은 프로토콜 버전. 더 낮게 인사한 연결이 보내면 invalid_message로 거절한다 */
export const BUSINESS_PROTOCOL_VERSION = 34;

/** 사업장 지분 주문 메시지(business_share_order·business_share_cancel)에 필요한 가장 낮은 프로토콜 버전. 37판 기기는 보내지 않는다 */
export const BUSINESS_SHARES_PROTOCOL_VERSION = 38;

/** 지급준비율 메시지(business_reserve)에 필요한 가장 낮은 프로토콜 버전(D-564 1623). 39판 기기는 보내지 않는다 */
export const BUSINESS_RESERVE_PROTOCOL_VERSION = 40;

/** 산 물건을 나를 운반꾼이 없음(no_carrier, 기획 D-569 1784)이 생긴 판. 더 낮은 판 연결은 busy를 받는다 */
export const BUSINESS_CARRY_PROTOCOL_VERSION = 46;

const u32 = z.number().int().nonnegative().max(0xffff_ffff);
const requestId = u32;
const rowId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
/** 금액(최소 단위 정수 글자, BigInt) — 입력 한도 18자리 */
const amount = z.string().regex(/^[0-9]{1,18}$/);
/** 원장 화폐 자산 코드(s3_test_credit·cur:<코드>). 서버가 화폐인지 본다 */
const asset = z
  .string()
  .min(1)
  .max(48)
  .regex(/^[a-z0-9_:]+$/);
/** 물건 자산(item:<팩 ID>) */
const item = z
  .string()
  .min(7)
  .max(53)
  .regex(/^item:[a-z][a-z0-9_]*$/);
/**
 * 값 정하기 대상: 물건 자산, 또는 48부터 외주 수리 시간당 요금(service:equipment_repair — 기획 D-570 1785 "요금은 주인이 정한다", 수리 줄이 있는
 * 공방만, 0 = 받지 않음)
 */
const priced = z.union([
  item,
  z.literal("service:equipment_repair"),
  // 52부터 외환 거래소 환전 이용료 요율(만분율 — 외환 거래소만, 질문 2086)
  z.literal("service:fx_fee"),
  // 51부터 배 판매가(boat:<배 종류> — 조선소만, 기획 대조 2057·2072·2074)
  z.string().regex(/^boat:[a-z][a-z0-9_]{1,47}$/),
]);

// ---------- 기기 → 서버 ----------

export const businessSettleMessage = z.object({
  t: z.literal("business_settle"),
  id: requestId,
  buildingId: rowId,
  asset: asset.optional(),
  amount: amount.optional(),
});

export const businessInvestMessage = z.object({
  t: z.literal("business_invest"),
  id: requestId,
  buildingId: rowId,
  asset,
  amount,
});

export const businessBuyMessage = z.object({
  t: z.literal("business_buy"),
  id: requestId,
  buildingId: rowId,
  item,
  /** 입력 한도(게임 값 아님) 100만 */
  qty: z.number().int().positive().max(1_000_000),
});

export const businessPriceMessage = z.object({
  t: z.literal("business_price"),
  id: requestId,
  buildingId: rowId,
  item: priced,
  price: amount,
});

/** 1 이상 금액·수량(최소 단위 정수 글자) */
const positive = z.string().regex(/^[1-9][0-9]{0,17}$/);

/** 지분 주문(판 38): side = 사기·팔기, price = 1주 값(살 쪽 상한·팔 쪽 하한), shares = 주 수 */
export const businessShareOrderMessage = z.object({
  t: z.literal("business_share_order"),
  id: requestId,
  buildingId: rowId,
  side: z.enum(["buy", "sell"]),
  price: positive,
  shares: positive,
});

/** 지분 주문 거두기(판 38, 낸 사람만 — 회차 전). 묶은 것을 돌려준다 */
export const businessShareCancelMessage = z.object({
  t: z.literal("business_share_cancel"),
  id: requestId,
  orderId: rowId,
});

/** 지급준비율(판 40): ‰ 0~5000(필요액의 5배까지), null = 설정 칸 기본값 */
export const businessReserveMessage = z.object({
  t: z.literal("business_reserve"),
  id: requestId,
  buildingId: rowId,
  reservePm: z.number().int().min(0).max(5000).nullable(),
});

export const unitGiftMessage = z.object({
  t: z.literal("unit_gift"),
  id: requestId,
  unitId: rowId,
  amount,
});

// ---------- 서버 → 기기 ----------

export const BUSINESS_RESULT_CODES = [
  "busy",
  "rate_limited",
  "sign_in_required",
  "internal_error",
  "unknown_building",
  "not_business",
  "forbidden",
  "insufficient_funds",
  "invalid_amount",
  "not_money",
  "not_goods",
  "not_for_sale",
  "below_lot",
  "insufficient_goods",
  "no_place",
  "suspended",
  "in_debt",
  "nothing_to_settle",
  "unknown_unit",
  /** 판 38 지분 주문: 회차당 주문 수를 넘음·없는 주문·지분 모자람 */
  "order_limit",
  "unknown_order",
  "insufficient_shares",
  /** 판 46 사기: 산 물건을 나를 운반꾼(그 건물 일꾼·산 사람의 유닛)이 없거나 모두 바쁨(기획 D-569 1784 — 더 낮은 판 연결은 busy) */
  "no_carrier",
] as const;
export type BusinessResultCode = (typeof BUSINESS_RESULT_CODES)[number];

const businessResultMessage = z.discriminatedUnion("ok", [
  z.object({
    t: z.literal("business_result"),
    id: requestId,
    ok: z.literal(true),
    /** 움직인 돈(정산 합·산 값 등, 최소 단위 글자) */
    paid: amount.optional(),
    /** 넣은 지분 주문 번호(판 38 business_share_order) */
    orderId: rowId.optional(),
  }),
  z.object({
    t: z.literal("business_result"),
    id: requestId,
    ok: z.literal(false),
    code: z.enum(BUSINESS_RESULT_CODES),
  }),
]);

export const businessClientMessages = [
  businessSettleMessage,
  businessInvestMessage,
  businessBuyMessage,
  businessPriceMessage,
  unitGiftMessage,
  businessShareOrderMessage,
  businessShareCancelMessage,
  businessReserveMessage,
] as const;
export const businessServerMessages = [businessResultMessage] as const;
