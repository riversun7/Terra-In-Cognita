// 나라 세금 정하기 메시지(프로토콜 57부터, 묶음 1116w) — 기획 D-128(세금 7종, "세율은 정부가 정한다", 시스템 상한 없음 — 50 E32)·
// D-579(주민세 주기·세율은 나라가 정함, 도시세 → 국세 2중 구조), 질문 2322 나(임금 소득세율을 거래세와 나눠 나라가 정한다)·2373 가(나라 주민세 칸 저장).
// docs/adr/2026-11-15-business-ledger.md "바뀜 (tax-2 …)".
// - 정하는 사람: 그 나라의 지도자 = 지배 가문의 장(D-217·질문 2012 답 — 플레이어 나라는 도시를 가진 독립 가문의 가문장). NPC 나라는 정하는 사람이 없고
//   성향 규칙식(D-323)을 쓴다. 투표 체제(민주주의·자본주의)의 안건 절차는 governance 줄기 몫이다(지금은 지도자가 바로 정한다 — 서버 TODO).
// - 칸마다 null = 정하지 않음(설정 칸 기본값을 따른다 — 소득세는 그 나라 거래세율). 조회는 tRPC world.government(정부 판 taxes 칸)다.
// - 답은 nation_tax_result 하나(id = 요청 id). 판정·저장은 서버가 한다.
// 이 꾸러미는 다른 내부 꾸러미를 가져오지 않는다.
import { z } from "zod";

/** 이 파일의 메시지에 필요한 가장 낮은 프로토콜 버전(더 낮게 인사한 연결이 보내면 invalid_message) */
export const NATION_TAX_PROTOCOL_VERSION = 57;

const requestId = z.number().int().nonnegative().max(0xffff_ffff);

/** 나라 세금 칸의 범위(세율 상한은 없다 — D-128. 만분율·‰는 셈이 뜻을 갖는 끝까지) */
export const NATION_TAX_LIMITS = {
  /** 임금·사업장 수입 소득세(만분율, 10000 = 100%) */
  incomeTaxBp: { min: 0, max: 10_000 },
  /** 주민세(재산 ‰, 주기마다) */
  residentTaxPm: { min: 0, max: 1000 },
  /** 주민세 주기(날) */
  residentEveryDays: { min: 1, max: 365 },
  /** 주민세 국세 몫(‰) */
  residentNationPm: { min: 0, max: 1000 },
  /** 거래세(만분율 — 줄기 governance-5, 질문 2460) */
  tradeTaxBp: { min: 0, max: 10_000 },
} as const;

const intIn = (range: { readonly min: number; readonly max: number }) =>
  z.number().int().min(range.min).max(range.max).nullable();

/** 지도자가 나라 세금을 정한다(칸마다 null = 정하지 않음) */
export const nationTaxMessage = z.object({
  t: z.literal("nation_tax"),
  id: requestId,
  incomeTaxBp: intIn(NATION_TAX_LIMITS.incomeTaxBp),
  residentTaxPm: intIn(NATION_TAX_LIMITS.residentTaxPm),
  residentEveryDays: intIn(NATION_TAX_LIMITS.residentEveryDays),
  residentNationPm: intIn(NATION_TAX_LIMITS.residentNationPm),
  /** 거래세(만분율 — 줄기 governance-5, 질문 2460, 프로토콜 61(묶음 1117a, 줄기 판 99)부터). 없으면 바꾸지 않는다(옛 기기), null = 정하지 않음 */
  tradeTaxBp: intIn(NATION_TAX_LIMITS.tradeTaxBp).optional(),
});

/** 결과 코드. 화면 문구는 기기가 코드로 고른다 */
export const NATION_TAX_RESULT_CODES = [
  "sign_in_required",
  /** 세계·DB가 준비 중 — 다시 해 볼 수 있다 */
  "busy",
  "rate_limited",
  "internal_error",
  /** 가문이 없다(나라를 이끄는 사람이 아니다) */
  "not_in_house",
  /** 가문장이 아니다 */
  "not_leader",
  /** 내 가문이 나라가 아니다(도시를 가진 독립 가문이 아님 — 봉신·도시 없는 가문) */
  "not_ruler",
] as const;
export type NationTaxResultCode = (typeof NATION_TAX_RESULT_CODES)[number];

const rowId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

const nationTaxResultMessage = z.discriminatedUnion("ok", [
  z.object({
    t: z.literal("nation_tax_result"),
    id: requestId,
    ok: z.literal(true),
    /** 정한 나라(세력 행 ID) */
    factionId: rowId,
    /**
     * 바로 정하지 않고 세율 안건을 열었으면 그 안건 ID(질문 2407 가 — 민주주의·자본주의에서 폭이 설정 칸 이상, 프로토콜 58(묶음 1116x, 줄기 판 98)부터). 없으면 바로 정함.
     * 더 낮은 판 기기는 이 칸을 모른 채 받는다(정함으로 보인다)
     */
    agendaId: rowId.optional(),
  }),
  z.object({
    t: z.literal("nation_tax_result"),
    id: requestId,
    ok: z.literal(false),
    code: z.enum(NATION_TAX_RESULT_CODES),
  }),
]);

export const nationTaxClientMessages = [nationTaxMessage] as const;
export const nationTaxServerMessages = [nationTaxResultMessage] as const;
