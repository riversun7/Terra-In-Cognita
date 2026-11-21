// 지도자끼리 조약 메시지(프로토콜 DIPLOMACY_PROTOCOL_VERSION부터) — 사용자 결정 D-588(질문 2497 가·나, 2498 기술 기본값), 기획 D-291·D-292·D-444 167·D-5057,
// docs/adr/2026-11-21-diplomacy-treaties.md.
// - dip_propose: 다른 나라에 조약(조항 카드 묶음 + 기간)을 낸다(가 — 상대가 기한 안에 받으면 맺음). 우리 나라가 투표로 받아들여야 하는 조약이면 비준 투표를 먼저 연다.
// - dip_counter: 받은 조약의 조항을 고쳐 되돌려 보낸다(나 — 협상). 고친 쪽이 새 조항의 지은이가 되고 상대가 답할 차례가 된다.
// - dip_respond: 받은 조약을 받거나(accept — 우리 나라 비준 투표가 필요하면 투표를 연다) 거절·거둔다(accept false).
// - dip_war_request: 동맹·보호 조약 상대에게 우리 전쟁에 참가해 달라고 요청한다(D-291 요청). dip_war_respond: 받은 요청에 답한다(수락 = 전쟁 참가자 등록).
// 결과는 dip_result 하나(id = 요청 id). 조회는 tRPC diplomacy.view. 이 꾸러미는 다른 내부 꾸러미를 가져오지 않는다.
import { z } from "zod";

/** 조약 메시지에 필요한 가장 낮은 프로토콜 버전(줄기 diplomacy 판 131 — 합칠 때 묶음 판으로 바꾼다) */
export const DIPLOMACY_PROTOCOL_VERSION = 131;

const requestId = z.number().int().nonnegative().max(0xffff_ffff);
const rowId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

/** 서버가 집행하는 조항 카드(@terra/shared/treaty TREATY_CLAUSE_KINDS와 같다) */
export const DIPLOMACY_CLAUSE_KINDS = ["ceasefire", "non_aggression", "alliance", "protection"] as const;

/** 조항 하나: 보호는 보호하는 쪽(보내는 나라 기준 us | them)과 공물 ‰ */
export const diplomacyClause = z.object({
  kind: z.enum(DIPLOMACY_CLAUSE_KINDS),
  protector: z.enum(["us", "them"]).optional(),
  tributePm: z.number().int().min(0).max(1000).optional(),
});

const clauses = z.array(diplomacyClause).min(1).max(DIPLOMACY_CLAUSE_KINDS.length);
/** 조약 기간(날 — 서버가 설정 칸 dip_treaty_max_days로 막는다) */
const days = z.number().int().min(1).max(3650);

// ---------- 기기 → 서버 ----------

export const dipProposeMessage = z.object({
  t: z.literal("dip_propose"),
  id: requestId,
  targetNationId: rowId,
  clauses,
  days,
});

export const dipCounterMessage = z.object({
  t: z.literal("dip_counter"),
  id: requestId,
  treatyId: rowId,
  clauses,
  days,
});

export const dipRespondMessage = z.object({
  t: z.literal("dip_respond"),
  id: requestId,
  treatyId: rowId,
  accept: z.boolean(),
});

export const dipWarRequestMessage = z.object({
  t: z.literal("dip_war_request"),
  id: requestId,
  treatyId: rowId,
  enemyNationId: rowId,
});

export const dipWarRespondMessage = z.object({
  t: z.literal("dip_war_respond"),
  id: requestId,
  requestId: rowId,
  accept: z.boolean(),
});

/** 결과 코드. 화면 문구는 기기가 코드로 고른다 */
export const DIPLOMACY_RESULT_CODES = [
  "sign_in_required",
  "busy",
  "rate_limited",
  "internal_error",
  /** 나라가 없다(세계 준비 전·나라가 사라짐) */
  "no_nation",
  /** 지도자(지배 가문의 장)가 아니다 */
  "not_leader",
  /** 그런 나라가 없다(우리 나라 포함) */
  "unknown_target",
  /** 조항이 맞지 않다(같은 카드 둘·보호 칸·공물 상한·기간 상한, 전쟁 중인데 휴전·강화가 없음, 전쟁이 아닌데 휴전·강화) */
  "invalid_clauses",
  /** 두 나라 사이에 이미 열린 조약이 있다 */
  "already_open",
  /** 그런 조약·요청이 없다(다른 나라 것 포함) */
  "unknown_treaty",
  /** 지금 우리가 답할 차례가 아니다(상대 차례·우리 비준 투표 중·끝난 조약) */
  "not_your_turn",
  /** 동맹·보호 조약이 맺어져 있지 않다 */
  "not_ally",
  /** 그 적과 전쟁 중이 아니다(요청하는 쪽) 또는 이미 전쟁 중이다(참가할 쪽) */
  "not_at_war",
  "already_at_war",
  /** 같은 요청이 이미 있다 */
  "already_requested",
] as const;
export type DiplomacyResultCode = (typeof DIPLOMACY_RESULT_CODES)[number];

/**
 * 성공 행동: sent(상대에게 감 — 답 기다림) · voting(우리 나라 비준 투표를 엶) · active(맺음) · declined(거절·거둠) · requested(참전 요청을 보냄) ·
 * joined(전쟁 참가자로 등록됨) · refused(참전 요청을 거절함)
 */
export const DIPLOMACY_ACTIONS = [
  "sent",
  "voting",
  "active",
  "declined",
  "requested",
  "joined",
  "refused",
] as const;
export type DiplomacyAction = (typeof DIPLOMACY_ACTIONS)[number];

// ---------- 서버 → 기기 ----------

const dipResultMessage = z.discriminatedUnion("ok", [
  z.object({
    t: z.literal("dip_result"),
    id: requestId,
    ok: z.literal(true),
    action: z.enum(DIPLOMACY_ACTIONS),
    /** 조약 ID(조약 메시지) 또는 참전 요청 ID(참전 메시지) */
    ref: rowId,
  }),
  z.object({
    t: z.literal("dip_result"),
    id: requestId,
    ok: z.literal(false),
    code: z.enum(DIPLOMACY_RESULT_CODES),
  }),
]);

export const diplomacyClientMessages = [
  dipProposeMessage,
  dipCounterMessage,
  dipRespondMessage,
  dipWarRequestMessage,
  dipWarRespondMessage,
] as const;
export const diplomacyServerMessages = [dipResultMessage] as const;
