// 사업장 장부 명령(프로토콜 34부터) — 기획 D-548·D-555(질문 1501~1514 답), docs/adr/2026-11-15-business-ledger.md
// - 정산(business_settle, 1501·1502): 주인·대주주가 사업장 금고 돈을 지분 수대로 주주 지갑에 나눈다(적자를 먼저 갚는다). amount가 없으면 전부.
// - 넣기(business_invest): 주인 지갑 → 사업장 금고(적자를 바로 갚는다 — 1504).
// - 사기(business_buy, 1507): 사업장 창고 물건을 산다. 남은 대량(B2B, 최소 묶음)으로, 저급 도시는 낱개(소매)로도. 주인도 값을 내고 꺼낸다.
//   물건은 산 사람의 그 도시 창고로, 돈은 사업장 금고로(소득세).
// - 값 정하기(business_price): 주인·대주주가 아이템 1개 값을 정한다(0 = 남에게 팔지 않음).
// - 선물(unit_gift, 1508): 내 유닛의 사유재산(유닛 지갑)에 돈을 준다. 유닛은 그 돈으로 숙박비를 낸다.
// 결과는 business_result 하나(id = 요청 id). 오류는 코드다(기기가 번역). 조회는 tRPC facilities.books다.
import { z } from "zod";

/** 사업장 장부 메시지에 필요한 가장 낮은 프로토콜 버전. 더 낮게 인사한 연결이 보내면 invalid_message로 거절한다 */
export const BUSINESS_PROTOCOL_VERSION = 34;

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
  item,
  price: amount,
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
] as const;
export type BusinessResultCode = (typeof BUSINESS_RESULT_CODES)[number];

const businessResultMessage = z.discriminatedUnion("ok", [
  z.object({
    t: z.literal("business_result"),
    id: requestId,
    ok: z.literal(true),
    /** 움직인 돈(정산 합·산 값 등, 최소 단위 글자) */
    paid: amount.optional(),
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
] as const;
export const businessServerMessages = [businessResultMessage] as const;
