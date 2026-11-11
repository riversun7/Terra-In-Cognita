// 가문 창설 메시지(프로토콜 22부터)·가문 가입 메시지(23부터, 파일 아래쪽) — 질문 926 나(기획 정리 D-529 포인터: 세력 정체성을 정하는 것이 곧 가문 창설, 창설자는 자기 NPC 국가의
// 시민으로 남는다 D-216, 창설 비용은 설정 칸 출발값 0), docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-11, 926~935 답)".
// - 정체성(이름·약어·색·마크 그림)은 그 앞에 tRPC factionIdentity.save로 저장한다(그림이 WebSocket 메시지 한도 64KiB보다 크다). 이 명령은
//   저장된 정체성으로 세력 행을 만들고 값을 낸다 — 게임 상태를 바꾸는 명령이라 WebSocket이다(AGENTS.md 4장).
// - 기기는 본 창설 비용을 함께 보낸다: 그 사이 설정 칸이 바뀌어 다르면 서버가 terms_changed로 거절한다(보이지 않은 값을 내지 않게).
// 이 꾸러미는 다른 내부 꾸러미를 가져오지 않는다.
import { z } from "zod";

/** 가문 창설 메시지에 필요한 가장 낮은 프로토콜 버전. 더 낮게 인사한 연결이 보내면 invalid_message로 거절한다 */
export const HOUSE_PROTOCOL_VERSION = 22;

const requestId = z.number().int().nonnegative().max(0xffff_ffff);
const rowId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const amount = z.string().regex(/^(0|[1-9][0-9]{0,30})$/);

// ---------- 기기 → 서버 ----------

/** 저장한 정체성으로 가문을 창설한다 */
export const houseFoundMessage = z.object({
  t: z.literal("house_found"),
  id: requestId,
  /** 기기가 본 창설 비용(10진 문자열 최소 단위) */
  cost: amount,
});

// ---------- 서버 → 기기 ----------

/** 결과 코드. 화면 문구는 기기가 코드로 고른다 */
export const HOUSE_RESULT_CODES = [
  "sign_in_required",
  /** 세계가 준비 중이거나 저장 대기열이 밀림 — 다시 해 볼 수 있다 */
  "busy",
  "rate_limited",
  "internal_error",
  /** 사이보그(나라 시민권)가 아직 없다 */
  "no_cyborg",
  /** 정체성을 아직 저장하지 않았다 */
  "no_identity",
  /** 이미 가문이 있다 */
  "already_founded",
  /** 기기가 본 비용이 지금과 다르다 — 조건을 다시 받는다 */
  "terms_changed",
  /** 화폐가 모자람 */
  "insufficient_funds",
  /** 그 사이 다른 세력이 같은 약어를 정했다 — 정체성을 고친다 */
  "short_taken",
] as const;
export type HouseResultCode = (typeof HOUSE_RESULT_CODES)[number];

const houseResultMessage = z.discriminatedUnion("ok", [
  z.object({
    t: z.literal("house_result"),
    id: requestId,
    ok: z.literal(true),
    /** 만든 가문(세력 행 ID) */
    factionId: rowId,
    /** 낸 값(10진 문자열 최소 단위) */
    paid: amount,
  }),
  z.object({
    t: z.literal("house_result"),
    id: requestId,
    ok: z.literal(false),
    code: z.enum(HOUSE_RESULT_CODES),
  }),
]);

// ---------- 가문 가입(프로토콜 23부터) ----------
// 질문 985 다(초대 + 신청, 같은 나라 시민만), docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-11, 981~986 답)". 조회는 tRPC
// factionIdentity.house(@terra/shared/house). 인원·대기 수 상한은 설정 칸이다(서버가 본다).

/** 가문 가입 메시지에 필요한 가장 낮은 프로토콜 버전 */
export const HOUSE_MEMBER_PROTOCOL_VERSION = 23;

/** 사용자 ID(uuid 모양) */
const userId = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

/** 가문장이 같은 나라 시민을 사이보그 이름으로 초대한다(그 사람이 이미 신청했으면 바로 든다) */
export const houseInviteMessage = z.object({
  t: z.literal("house_invite"),
  id: requestId,
  /** 사이보그 이름(규칙은 서버가 본다) */
  name: z.string().min(1).max(32),
});

/** 내 나라의 가문에 가입을 신청한다(그 가문이 이미 나를 초대했으면 바로 든다) */
export const houseApplyMessage = z.object({
  t: z.literal("house_apply"),
  id: requestId,
  factionId: rowId,
});

/** 받은 요청에 답한다: 초대받은 사람이 초대에, 가문장이 신청에 */
export const houseAnswerMessage = z.object({
  t: z.literal("house_answer"),
  id: requestId,
  requestId: rowId,
  accept: z.boolean(),
});

/** 보낸 요청을 거둔다: 가문장이 보낸 초대, 신청한 사람이 보낸 신청 */
export const houseWithdrawMessage = z.object({
  t: z.literal("house_withdraw"),
  id: requestId,
  requestId: rowId,
});

/** 가문에서 나간다(가문장은 나갈 수 없다) */
export const houseLeaveMessage = z.object({
  t: z.literal("house_leave"),
  id: requestId,
});

/** 가문장이 가문원을 내보낸다 */
export const houseKickMessage = z.object({
  t: z.literal("house_kick"),
  id: requestId,
  userId,
});

/** 가입 명령 결과 코드. 화면 문구는 기기가 코드로 고른다 */
export const HOUSE_MEMBER_RESULT_CODES = [
  "sign_in_required",
  "busy",
  "rate_limited",
  "internal_error",
  /** 사이보그(나라 시민권)가 없다 */
  "no_cyborg",
  /** 가문장만 한다 */
  "not_leader",
  /** 그런 사이보그·가문·요청이 없다(지났거나 거둔 요청 포함) */
  "not_found",
  /** 가문에 들어 있지 않다 */
  "not_in_house",
  /** 나(신청·받기) 또는 그 사람(초대)이 이미 가문에 들어 있다 */
  "already_in_house",
  /** 같은 나라 시민이 아니다 */
  "other_nation",
  /** 가문 인원이 상한에 이르렀다 */
  "house_full",
  /** 가문의 대기 중인 초대·신청이 상한에 이르렀다 */
  "too_many_pending",
  /** 내가 보낸 신청이 상한에 이르렀다 */
  "too_many_applications",
  /** 이미 같은 요청이 있다 */
  "already_requested",
  /** 나 자신에게는 못 한다 */
  "self",
  /** 가문장은 나갈 수 없다 */
  "leader_cannot_leave",
] as const;
export type HouseMemberResultCode = (typeof HOUSE_MEMBER_RESULT_CODES)[number];

/** 성공한 일: 초대함·신청함·가문에 듦(서로 요청이 맞음 또는 받음)·거절함·거둠·나감·내보냄 */
export const HOUSE_MEMBER_ACTIONS = [
  "invited",
  "applied",
  "joined",
  "declined",
  "withdrawn",
  "left",
  "kicked",
] as const;
export type HouseMemberAction = (typeof HOUSE_MEMBER_ACTIONS)[number];

const houseMemberResultMessage = z.discriminatedUnion("ok", [
  z.object({
    t: z.literal("house_member_result"),
    id: requestId,
    ok: z.literal(true),
    action: z.enum(HOUSE_MEMBER_ACTIONS),
    /** 그 일이 일어난 가문 */
    factionId: rowId,
  }),
  z.object({
    t: z.literal("house_member_result"),
    id: requestId,
    ok: z.literal(false),
    code: z.enum(HOUSE_MEMBER_RESULT_CODES),
  }),
]);

export const houseClientMessages = [
  houseFoundMessage,
  houseInviteMessage,
  houseApplyMessage,
  houseAnswerMessage,
  houseWithdrawMessage,
  houseLeaveMessage,
  houseKickMessage,
] as const;
export const houseServerMessages = [houseResultMessage, houseMemberResultMessage] as const;
