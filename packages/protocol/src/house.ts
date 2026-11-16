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
  /** 기기가 본 창설 비용(10진 문자열 최소 단위). D-565부터 창설은 무료라 서버가 보지 않는다(옛 기기 호환으로 남김) */
  cost: amount,
  /** 가문 소속 도시(39판부터, D-565 — 그 도시가 속한 나라의 가문이 된다). 없으면 창설자 사이보그의 내 도시 */
  cityId: rowId.optional(),
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
  // 39판부터(소속 도시 cityId를 보낸 창설의 답에만 간다)
  /** 그런 도시가 없거나 나라를 모르는 도시다(폐허가 됐을 수 있다) */
  "unknown_city",
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
  // 24판부터(가문장 넘기기·해산 — 24판 연결에만 간다)
  /** 혼자 남은 가문장만 해산한다 */
  "not_alone",
  /** 도시를 가진 가문은 해산할 수 없다(39판부터 소속 도시 바꾸기도 — 도시를 가진 가문은 아직 바꾸지 못한다) */
  "has_city",
  // 39판부터(소속 도시 바꾸기 house_home의 답에만 간다)
  /** 그런 도시가 없거나 나라를 모르는 도시다 */
  "unknown_city",
  /** 이미 그 도시다 */
  "same_city",
  /** 소속 도시를 바꾼 지 얼마 되지 않았다(설정 칸 house_home_wait_ms) */
  "home_wait",
  // 50판부터(가문 이동 정책 house_entry_policy의 답에만 간다)
  /** 그 도시를 가진 가문(도시 정책)·독립 나라인 가문(나라 정책)의 가문장이 아니다 */
  "not_ruler",
  // 50판부터(house_home의 답에만 — 더 낮은 판 연결은 busy, legacyHouseMemberCode)
  /** 가문 금고(없으면 가문장 지갑)에 들어가는 도시·나라의 가입비가 모자라 옮기지 못한다(D-573) */
  "entry_fee_short",
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
  // 24판부터
  "handed_over",
  "dissolved",
  // 39판부터: 소속 도시를 바꿈(house_home)
  "home_set",
  // 48판부터(house_home의 답에만 — 더 낮은 판 연결은 home_set, legacyHouseMemberAction): 새 소속 도시를 공고함(D-570 — 공고 기간 뒤 가문 모두가
  // 옮긴다)·공고를 거둠(지금 소속 도시를 다시 고름)
  "home_announced",
  "home_cancelled",
  // 50판부터(house_entry_policy의 답에만): 가문 이동 정책을 정함
  "entry_policy_set",
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

// ---------- 가문장 넘기기·해산·가문 도시(프로토콜 24부터) ----------
// 질문 1003 가(넘기기 + 혼자 남은 가문장의 해산)·1005 가(마을 세우기와 폐허 복원이 같은 봉신·독립 고르기, D-340·D-339),
// docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-11, 1001~1006 답)"·docs/adr/2026-11-11-house-village.md.
// 넘기기·해산은 가입 결과(house_member_result)로 답한다. 가문 도시 명령은 house_city_result로 답한다.

/** 가문장 넘기기·해산·가문 도시 메시지에 필요한 가장 낮은 프로토콜 버전 */
export const HOUSE_CITY_PROTOCOL_VERSION = 24;

/** 가문장이 가문원 한 명에게 가문장을 넘긴다(바로 넘어가고 소식이 간다 [임시] — 질문 1036) */
export const houseHandoverMessage = z.object({
  t: z.literal("house_handover"),
  id: requestId,
  userId,
});

/** 혼자 남은 가문장이 가문을 해산한다(이름·약어가 풀린다) */
export const houseDissolveMessage = z.object({
  t: z.literal("house_dissolve"),
  id: requestId,
});

/** 가문이 도시를 처음 얻을 때 고르는 것(D-340): 나라의 봉신 | 독립 도시국가(체제를 함께 고른다) */
export const HOUSE_CITY_MODES = ["vassal", "independent"] as const;
export type HouseCityMode = (typeof HOUSE_CITY_MODES)[number];
export const HOUSE_REGIMES = ["dictatorship", "democracy", "capitalism"] as const;
export type HouseRegime = (typeof HOUSE_REGIMES)[number];

const cityChoice = {
  /** 봉신 | 독립. 이미 고른 가문은 지금 상태와 같아야 한다(바꾸지 못함) */
  mode: z.enum(HOUSE_CITY_MODES),
  /** 독립이면 체제(봉신이면 무시) */
  regime: z.enum(HOUSE_REGIMES).optional(),
};

/** 가문장이 2차맵 칸에 가문 마을을 세운다(기기가 본 값을 함께 보낸다 — 다르면 terms_changed) */
export const houseVillageMessage = z.object({
  t: z.literal("house_village"),
  id: requestId,
  /** 2차맵 키(행성 칸 키)·배치 칸 */
  mapKey: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  x: z.number().int().min(0).max(4095),
  y: z.number().int().min(0).max(4095),
  cost: amount,
  ...cityChoice,
});

/** 가문장이 주인인 폐허를 되살리면 가문 도시가 되게 한다(같은 고르기, D-339 "D-340 틀") */
export const houseRuinMessage = z.object({
  t: z.literal("house_ruin"),
  id: requestId,
  ruinId: rowId,
  ...cityChoice,
});

/** 봉신 가문 독립 선언(house_independence)이 생긴 판(기획 D-575, 프로토콜 53) */
export const HOUSE_INDEPENDENCE_PROTOCOL_VERSION = 53;

/**
 * 봉신 가문의 가문장이 독립을 선언한다(기획 D-575 "소속된 국가로 귀속을 하여도 … 독립을 선언할수도 있음", D-216 봉신 독립 선언): 위 세력과의
 * 봉신 관계를 끊고 독립 도시국가가 된다(체제를 함께 고른다, D-340). 독재 나라의 봉신은 가문 도시가 모두 알박기로 선 도시일 때만(D-575 보충 —
 * D-302 "독재 = 반란으로만"의 예외). 답은 house_city_result(mode independent, cityId = 가문의 첫 도시, paid "0")
 */
export const houseIndependenceMessage = z.object({
  t: z.literal("house_independence"),
  id: requestId,
  regime: z.enum(HOUSE_REGIMES),
});

/** 가문 도시 명령 결과 코드 */
export const HOUSE_CITY_RESULT_CODES = [
  "sign_in_required",
  "busy",
  "rate_limited",
  "internal_error",
  "no_cyborg",
  /** 가문이 없다 */
  "no_house",
  /** 가문장만 한다 */
  "not_leader",
  /** 이미 고른 상태와 다르다(봉신 ↔ 독립은 이 명령으로 바꾸지 못한다) */
  "mode_locked",
  /** 독립이면 체제를 고른다 */
  "regime_required",
  /** 지도 밖·가장자리·띄우지 않은 2차맵 */
  "bad_spot",
  /** 다른 도시·폐허와 너무 가깝다 */
  "too_close",
  /** 다른 세력의 영향권 안이다(D-519) */
  "foreign_influence",
  /** 그 자리에 놓을 수 없다(물·건물) */
  "blocked",
  /** 기기가 본 값이 지금과 다르다 */
  "terms_changed",
  "insufficient_funds",
  /** 그런 폐허가 없다 */
  "unknown_ruin",
  /** 그 폐허의 주인이 아니다 */
  "not_owner",
  /** 봉신이 아니다(도시 없는 가문·이미 독립 — house_independence만, 53부터) */
  "not_vassal",
  /** 독재 나라의 봉신인데 알박기로 서지 않은 가문 도시가 있다(반란으로만 — D-302, house_independence만, 53부터) */
  "independence_blocked",
] as const;
export type HouseCityResultCode = (typeof HOUSE_CITY_RESULT_CODES)[number];

const houseCityResultMessage = z.discriminatedUnion("ok", [
  z.object({
    t: z.literal("house_city_result"),
    id: requestId,
    ok: z.literal(true),
    /** 가문(세력 행 ID)과 지금 상태 */
    factionId: rowId,
    mode: z.enum(HOUSE_CITY_MODES),
    /** 세운 마을 ID(마을 세우기) 또는 되살아날 폐허 ID(폐허) */
    cityId: rowId,
    /** 낸 값(10진 문자열 최소 단위, 폐허는 "0") */
    paid: amount,
  }),
  z.object({
    t: z.literal("house_city_result"),
    id: requestId,
    ok: z.literal(false),
    code: z.enum(HOUSE_CITY_RESULT_CODES),
  }),
]);

// ---------- 가문 소속 도시(프로토콜 39부터) ----------
// 기획 D-565: 가문은 소속 도시를 고르고 그 도시가 속한 나라의 가문이 된다(세금 납부·랭킹 집계). 창설 때 고르고(house_found cityId), 가문장이
// 나중에 바꾼다(house_home → house_member_result, 한 일 home_set). docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-15, D-565)".

/** 소속 도시 메시지(house_found cityId·house_home)에 필요한 가장 낮은 프로토콜 버전 */
export const HOUSE_HOME_PROTOCOL_VERSION = 39;

/** 소속 도시 공고(D-570, 한 일 home_announced·home_cancelled)를 받는 가장 낮은 프로토콜 버전 */
export const HOUSE_HOME_NOTICE_PROTOCOL_VERSION = 48;

/** 그 연결 판이 모르는 한 일(공고·공고 거둠)을 home_set으로 낮춘다(47판 기기는 바뀐 소속 도시를 다시 읽는다) */
export function legacyHouseMemberAction(
  action: HouseMemberAction,
  protocolVersion: number,
): HouseMemberAction {
  return protocolVersion < HOUSE_HOME_NOTICE_PROTOCOL_VERSION &&
    (action === "home_announced" || action === "home_cancelled")
    ? "home_set"
    : action;
}

/** 가문 이동 가입비 모자람(D-573, 50판)을 더 낮은 판 연결에는 busy로 낮춘다(그 판 기기가 모르는 코드) */
export function legacyHouseMemberCode(
  code: HouseMemberResultCode,
  protocolVersion: number,
): HouseMemberResultCode {
  return protocolVersion < 50 && code === "entry_fee_short" ? "busy" : code;
}

/**
 * 가문장이 가문 소속 도시를 바꾼다(가문 나라가 그 도시의 나라로 바뀐다). D-570부터 설정 칸 house_home_notice_ms가 0보다 크면 바로 옮기지 않고
 * 공고한다(그 시각이 지나면 가문 모두가 옮긴다). 공고 중에 지금 소속 도시를 고르면 공고를 거둔다
 */
export const houseHomeMessage = z.object({
  t: z.literal("house_home"),
  id: requestId,
  cityId: rowId,
});

// ---------- 가문 이동 정책(프로토콜 50부터) ----------
// 기획 D-570 "해당 국가나 도시의 정책에 따름. 지원금이 있을지 가입비가 있을지 등"·D-526(받는 쪽이 정함), 질문 2018 답. 가문이 그 도시·나라로 옮겨
// 올 때 가문원마다 + 가입비 / − 지원금. 도시 정책 = 그 도시를 가진 가문의 가문장, 나라 정책 = 독립 나라(도시를 가진 위 세력 없는 가문)의
// 가문장(국가 지도자 = 지배 가문의 장, D-217·질문 2012 답). NPC 도시·나라는 정하지 않는다(성향 규칙식). 답은 house_member_result
// (한 일 entry_policy_set, 코드 not_in_house·not_leader·unknown_city·not_ruler). docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-16, 2011·2012·2014·2017·2018 답)".

/** 가문 이동 정책 메시지에 필요한 가장 낮은 프로토콜 버전 */
export const HOUSE_ENTRY_POLICY_PROTOCOL_VERSION = 50;

/** 가문원마다 값(부호 있는 10진 최소 단위 — + 가입비 / − 지원금, 15자리까지) */
const entryFee = z.string().regex(/^(0|-?[1-9][0-9]{0,14})$/);

/** 정책 자리: 도시(cityId 꼭) | 나라(내가 이끄는 독립 나라) */
export const HOUSE_ENTRY_SCOPES = ["city", "nation"] as const;
export type HouseEntryScope = (typeof HOUSE_ENTRY_SCOPES)[number];

/** 가문 이동 정책을 정한다(fee null = 정하지 않음 — 도시는 나라 정책을, 나라는 0을 따른다) */
export const houseEntryPolicyMessage = z.object({
  t: z.literal("house_entry_policy"),
  id: requestId,
  scope: z.enum(HOUSE_ENTRY_SCOPES),
  /** 도시 정책의 도시(scope city에 꼭 — 없으면 unknown_city) */
  cityId: rowId.optional(),
  fee: entryFee.nullable(),
});

export const houseClientMessages = [
  houseFoundMessage,
  houseInviteMessage,
  houseApplyMessage,
  houseAnswerMessage,
  houseWithdrawMessage,
  houseLeaveMessage,
  houseKickMessage,
  houseHandoverMessage,
  houseDissolveMessage,
  houseVillageMessage,
  houseRuinMessage,
  houseHomeMessage,
  houseEntryPolicyMessage,
  houseIndependenceMessage,
] as const;
export const houseServerMessages = [
  houseResultMessage,
  houseMemberResultMessage,
  houseCityResultMessage,
] as const;
