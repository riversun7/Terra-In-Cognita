// 가문 도시 구인 메시지(프로토콜 25부터) — 질문 1041 다(기획 D-533 "자동 구인"), docs/adr/2026-11-11-house-village.md "바뀜 (2026-11-12)".
// - house_recruit_auto: 가문장이 가문 도시 자동 구인(NPC와 같은 구인 규칙식, 기본 켬)을 켜거나 끈다.
// - house_recruit_hire: 가문장이 가문 도시 행정 건물의 지금 창 카드 한 장을 산다(가문 국고에서, 모자라면 가문장 지갑에서 [임시] — 질문 1097).
//   기기는 본 창·자리·값을 함께 보낸다(다르면 cards_changed — recruit_hire와 같은 틀).
// 결과는 house_recruit_result 하나로 온다(id = 요청 id). 이 꾸러미는 다른 내부 꾸러미를 가져오지 않는다.
import { z } from "zod";

/** 가문 도시 구인 메시지에 필요한 가장 낮은 프로토콜 버전 */
export const HOUSE_RECRUIT_PROTOCOL_VERSION = 25;

const requestId = z.number().int().nonnegative().max(0xffff_ffff);
const rowId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const amount = z.string().regex(/^(0|[1-9][0-9]{0,30})$/);

// ---------- 기기 → 서버 ----------

/** 자동 구인 켬·끔 */
export const houseRecruitAutoMessage = z.object({
  t: z.literal("house_recruit_auto"),
  id: requestId,
  on: z.boolean(),
});

/** 가문 도시 구인 카드 한 장 */
export const houseRecruitHireMessage = z.object({
  t: z.literal("house_recruit_hire"),
  id: requestId,
  /** 가문 도시 */
  cityId: rowId,
  /** 기기가 본 갱신 창 */
  window: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  slot: z.number().int().nonnegative().max(63),
  /** 기기가 본 값(최소 단위, 10진 문자열) */
  cost: amount,
});

// ---------- 서버 → 기기 ----------

export const HOUSE_RECRUIT_RESULT_CODES = [
  "sign_in_required",
  "busy",
  "rate_limited",
  "internal_error",
  "no_cyborg",
  "no_house",
  "not_leader",
  /** 가문 도시가 아니다(아직 도시를 얻지 않았거나 다른 세력 도시) */
  "not_house_city",
  /** 창·자리·값이 지금 카드와 다르다 — 목록을 다시 받는다 */
  "cards_changed",
  /** 이 창에 이미 산 카드 */
  "taken",
  /** 가문 국고와 가문장 지갑 모두 모자람 */
  "insufficient_funds",
] as const;
export type HouseRecruitResultCode = (typeof HOUSE_RECRUIT_RESULT_CODES)[number];

/** 낸 곳: 가문 국고 | 가문장 지갑 */
export const HOUSE_RECRUIT_PAYERS = ["treasury", "leader"] as const;
export type HouseRecruitPayer = (typeof HOUSE_RECRUIT_PAYERS)[number];

const houseRecruitResultMessage = z.discriminatedUnion("ok", [
  z.object({
    t: z.literal("house_recruit_result"),
    id: requestId,
    ok: z.literal(true),
    /** 지금 자동 구인 상태 */
    auto: z.boolean(),
    /** 산 휴먼 유닛(켬·끔이면 없음) */
    unitId: rowId.optional(),
    /** 낸 곳(사기만) */
    payer: z.enum(HOUSE_RECRUIT_PAYERS).optional(),
  }),
  z.object({
    t: z.literal("house_recruit_result"),
    id: requestId,
    ok: z.literal(false),
    code: z.enum(HOUSE_RECRUIT_RESULT_CODES),
  }),
]);

export const houseRecruitClientMessages = [houseRecruitAutoMessage, houseRecruitHireMessage] as const;
export const houseRecruitServerMessages = [houseRecruitResultMessage] as const;
