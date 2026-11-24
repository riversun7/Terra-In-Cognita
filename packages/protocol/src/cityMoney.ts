// 도시 화폐(도시의 기축 통화) 고르기 메시지(프로토콜 69부터) — 사용자 결정 2026-11-24 "도시는 기축통화로 화폐 한가지를 정해야하며 도시내 모든 사업장은
// 기축통화로 거래 및 세금을 낸다 … 타국가 화폐이용시 국고에 100000개이상 보관필요". docs/adr/2026-11-24-city-money.md.
// - 고르는 사람: 그 도시 주인 나라의 지도자(나라 세금 정하기 nation_tax와 같은 사람 — 독립 나라 가문장, 선출로 NPC 나라를 이끄는 가문장).
// - currency = 화폐 코드(cur: 앞머리 없는 코드), null = 주인 나라 화폐로 되돌림. 주인 나라 화폐가 아니면 그 나라 국고에 그 화폐가 정한 양 이상 있어야 한다
//   (reserve_short). 조회는 tRPC world.government(정부 판 city.money 칸)다.
// - 답은 city_currency_result 하나(id = 요청 id). 판정·저장은 서버가 한다.
// 이 꾸러미는 다른 내부 꾸러미를 가져오지 않는다.
import { z } from "zod";

/** 이 파일의 메시지에 필요한 가장 낮은 프로토콜 버전(더 낮게 인사한 연결이 보내면 invalid_message) */
export const CITY_MONEY_PROTOCOL_VERSION = 69;

const requestId = z.number().int().nonnegative().max(0xffff_ffff);
const rowId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

/** 지도자가 도시 화폐를 고른다(null = 주인 나라 화폐) */
export const cityCurrencyMessage = z.object({
  t: z.literal("city_currency"),
  id: requestId,
  cityId: rowId,
  /** 화폐 코드(원장 자산 cur:<코드>의 코드) */
  currency: z
    .string()
    .regex(/^[a-z][a-z0-9_]{1,47}$/)
    .nullable(),
});

/** 결과 코드. 화면 문구는 기기가 코드로 고른다 */
export const CITY_MONEY_RESULT_CODES = [
  "sign_in_required",
  /** 세계·DB·도시 경제가 준비 중 — 다시 해 볼 수 있다 */
  "busy",
  "rate_limited",
  "internal_error",
  /** 가문이 없다 */
  "not_in_house",
  /** 가문장이 아니다 */
  "not_leader",
  /** 내 가문이 그 도시 주인 나라를 이끌지 않는다 */
  "not_ruler",
  /** 없는 도시·내 나라 도시가 아니다 */
  "unknown_city",
  /** 화폐를 찍는 나라가 없는 화폐 */
  "unknown_currency",
  /** 다른 나라 화폐인데 국고에 그 화폐가 모자란다 */
  "reserve_short",
] as const;
export type CityMoneyResultCode = (typeof CITY_MONEY_RESULT_CODES)[number];

const cityCurrencyResultMessage = z.discriminatedUnion("ok", [
  z.object({
    t: z.literal("city_currency_result"),
    id: requestId,
    ok: z.literal(true),
    cityId: rowId,
    /** 이제 그 도시가 쓰는 화폐 코드 */
    currency: z.string(),
  }),
  z.object({
    t: z.literal("city_currency_result"),
    id: requestId,
    ok: z.literal(false),
    code: z.enum(CITY_MONEY_RESULT_CODES),
  }),
]);

export const cityMoneyClientMessages = [cityCurrencyMessage] as const;
export const cityMoneyServerMessages = [cityCurrencyResultMessage] as const;
