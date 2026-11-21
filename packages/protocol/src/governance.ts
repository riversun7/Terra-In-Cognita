// 나라 의결 메시지(프로토콜 GOVERNANCE_PROTOCOL_VERSION부터) — docs/adr/2026-11-21-governance.md, 질문 2351~2365 답(D-580), 기획 D-5057·D-217·D-131.
// - gov_propose: 안건을 올린다(지도자는 늘, 민주주의 = 소속 가문장, 자본주의 = 의결권 몫 하한 이상 주주 — 2351 가). 독재 지도자의 체제 전환과
//   지분 과반 지도자의 독재 전환은 직권(투표 없음 + 유예 — D-217·D-131·D-344)이라 바로 decided로 답한다.
// - gov_vote: 열린 안건에 표를 던진다(공개·위임 없음, 닫힐 때까지 바꿀 수 있다 — 2365 가). 선출은 후보 가문 열쇠(p:/n:) 또는 abstain.
// - gov_candidate: 열린 선출 안건에 내 가문을 후보로 등록한다(2358 가 — 등록 기간 안).
// 결과는 gov_result 하나로 온다(id = 요청 id). 조회는 tRPC governance.view. 이 꾸러미는 다른 내부 꾸러미를 가져오지 않는다.
import { z } from "zod";
import { NATION_TAX_LIMITS } from "./nationTax.ts";

/** 나라 의결 메시지에 필요한 가장 낮은 프로토콜 버전(묶음 1116v, 줄기 판 94) */
export const GOVERNANCE_PROTOCOL_VERSION = 56;
/**
 * 군사 쿠데타 메시지(gov_coup·gov_coup_join)·국고 지분 팔기 안건(treasury_share_sale)·새 결과 코드에 필요한 가장 낮은 프로토콜 버전(59판, 묶음 1116y — 줄기 governance-3 판 98 —
 * 질문 2433 답·D-583)
 */
export const COUP_PROTOCOL_VERSION = 59;
/**
 * 강화·화폐 단계·가문 독립 선언 안건, 쿠데타 병력(unitIds), 거래세 칸, 새 결과 코드에 필요한 가장 낮은 프로토콜 버전(줄기 governance-5 판 99 — 묶을 때 묶음 판으로).
 * 더 낮은 판 연결에는 새 결과 코드 대신 not_eligible을 보낸다(governance/gateway.ts)
 */
export const GOVERNANCE5_PROTOCOL_VERSION = 99;

const requestId = z.number().int().nonnegative().max(0xffff_ffff);
const rowId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const taxField = (range: { readonly min: number; readonly max: number }) =>
  z.number().int().min(range.min).max(range.max).nullable();

export const GOVERNANCE_AGENDA_KINDS = [
  "leader_election",
  "leader_removal",
  "regime_change",
  "war_declaration",
  /** 세율 크게 바꾸기(질문 2407 가 — 프로토콜 58(묶음 1116x, 줄기 판 98)부터, taxes 칸) */
  "tax_change",
  /** 빈자리 도시 독립 투표(질문 2434 (가) 답 D-583 — 서버가 저절로 연다, 기기가 올리지 않는다. 프로토콜 COUP_PROTOCOL_VERSION부터 보인다) */
  "city_independence",
  /** 국고 지분 팔기(질문 2438 답 D-583 — cityId·shares·minPrice 칸, 프로토콜 COUP_PROTOCOL_VERSION부터) */
  "treasury_share_sale",
  /** 강화(질문 2452 — targetNationId 칸, 프로토콜 GOVERNANCE5_PROTOCOL_VERSION부터) */
  "peace",
  /** 화폐 단계 전환(질문 2453 — monetaryMode·monetaryRateBp 칸, GOVERNANCE5_PROTOCOL_VERSION부터) */
  "currency_stage",
  /** 가문 독립 선언(질문 2454 — cityId 칸, GOVERNANCE5_PROTOCOL_VERSION부터, 투표 없이 바로) */
  "house_independence",
] as const;
/** 화폐 단계(formula = 중앙은행 공식, manual = 지도자 하루 조절) */
export const GOVERNANCE_MONETARY_MODES = ["formula", "manual"] as const;
export const GOVERNANCE_MESSAGE_REGIMES = ["dictatorship", "democracy", "capitalism"] as const;

// ---------- 기기 → 서버 ----------

export const govProposeMessage = z.object({
  t: z.literal("gov_propose"),
  id: requestId,
  kind: z.enum(GOVERNANCE_AGENDA_KINDS),
  /** 체제 전환 목표(체제 전환만) */
  regime: z.enum(GOVERNANCE_MESSAGE_REGIMES).optional(),
  /** 선전포고 상대 나라(세력 행 ID — 선전포고만) */
  targetNationId: rowId.optional(),
  /** 세율 안건이 바꾸려는 나라 세금(세율 안건만 — nation_tax와 같은 칸, null = 정하지 않음) */
  taxes: z
    .object({
      incomeTaxBp: taxField(NATION_TAX_LIMITS.incomeTaxBp),
      residentTaxPm: taxField(NATION_TAX_LIMITS.residentTaxPm),
      residentEveryDays: taxField(NATION_TAX_LIMITS.residentEveryDays),
      residentNationPm: taxField(NATION_TAX_LIMITS.residentNationPm),
      /** 거래세(만분율 — 줄기 governance-5, 질문 2460). 없으면 바꾸지 않는다 */
      tradeTaxBp: taxField(NATION_TAX_LIMITS.tradeTaxBp).optional(),
    })
    .optional(),
  /** 화폐 단계 전환: 목표 단계(currency_stage만) */
  monetaryMode: z.enum(GOVERNANCE_MONETARY_MODES).optional(),
  /** 화폐 단계 전환: 지도자 손 조절의 하루 조절(시중 통화량의 만분율, +발행 −소각 — 서버가 설정 칸 하루 상한으로 자른다) */
  monetaryRateBp: z.number().int().min(-10_000).max(10_000).optional(),
  /** 국고 지분 팔기: 도시(그 나라 도시) — treasury_share_sale만 */
  cityId: rowId.optional(),
  /** 국고 지분 팔기: 주 수(10진 정수 글자, 1 이상) */
  shares: z
    .string()
    .regex(/^[1-9][0-9]{0,17}$/)
    .optional(),
  /** 국고 지분 팔기: 한 주 가장 낮은 값(그 나라 화폐 최소 단위, 10진 정수 글자) */
  minPrice: z
    .string()
    .regex(/^(0|[1-9][0-9]{0,24})$/)
    .optional(),
});

export const govVoteMessage = z.object({
  t: z.literal("gov_vote"),
  id: requestId,
  agendaId: rowId,
  /** yes | no | abstain | 후보 가문 열쇠(p:<가문 세력 행>·n:<NPC 가문>) */
  choice: z.union([z.enum(["yes", "no", "abstain"]), z.string().regex(/^[pn]:[1-9][0-9]{0,15}$/)]),
});

export const govCandidateMessage = z.object({
  t: z.literal("gov_candidate"),
  id: requestId,
  agendaId: rowId,
});

/** 군사 쿠데타를 일으킨다(내 가문 — 지배 가문이 아닌 그 나라 소속 플레이어 가문의 장, 질문 2433 답). 참가 받기를 연다 */
export const govCoupMessage = z.object({
  t: z.literal("gov_coup"),
  id: requestId,
});

/** 열린 쿠데타에 편을 든다(D-583 2433 나 가 — 누구나 어느 편이든: rebel = 혁명군, government = 정부군) */
export const govCoupJoinMessage = z.object({
  t: z.literal("gov_coup_join"),
  id: requestId,
  coupId: rowId,
  side: z.enum(["rebel", "government"]),
  /**
   * 데려갈 병력(내 거울 세계 유닛 ID — 줄기 governance-5, 질문 2455 답 D-583 "참전 = 병력을 데려온다"). 없으면 수도에 있는 내 유닛 모두. 수도에 없는 유닛은 빠진다.
   * 병력이 없으면 편만 들고 보상은 없다. 프로토콜 GOVERNANCE5_PROTOCOL_VERSION부터
   */
  unitIds: z.array(rowId).max(200).optional(),
});

// ---------- 서버 → 기기 ----------

export const GOVERNANCE_RESULT_CODES = [
  "sign_in_required",
  "busy",
  "rate_limited",
  "internal_error",
  /** 나라가 없다(세계 준비 전·나라가 사라짐) */
  "no_nation",
  /** 자격이 없다(발의권·투표권·후보 자격 — 2351·2355·2356·2358) */
  "not_eligible",
  /** 독재는 투표가 없다(D-5057) — 지도자 직권만 */
  "dictatorship",
  /** 이 안건 종류는 꺼져 있다(설정 칸) */
  "kind_disabled",
  /** 같은 종류 안건이 이미 열려 있다 */
  "already_open",
  /** 발의자가 열어 둘 수 있는 안건 수를 넘었다 */
  "limit",
  /** 이미 그 체제다 */
  "same_regime",
  /** 지배 쪽 지분이 과반이 아니다(독재 전환 — D-344) */
  "no_majority",
  /** 선전포고 상대가 없거나 나 자신이다 */
  "unknown_target",
  /** 이미 그 나라와 전쟁 중이다 */
  "already_at_war",
  /** 없는 안건이거나 내 나라 안건이 아니다 */
  "unknown_agenda",
  /** 투표가 끝났거나 열리지 않은 안건 */
  "not_open",
  /** 후보가 아니거나 안건에 맞지 않는 표 */
  "invalid_choice",
  /** 후보 등록 기간이 끝났다 */
  "registration_closed",
  /** 해임된 가문은 다시 뽑기에 나설 수 없다 */
  "barred",
  /** 쿠데타가 꺼져 있다(설정 칸 gov_coup_enabled — 프로토콜 COUP_PROTOCOL_VERSION부터) */
  "coup_disabled",
  /** 쿠데타 쿨타임 */
  "coup_cooldown",
  /** 그 나라에 참가 받는 중인 쿠데타가 이미 있다 */
  "coup_open",
  /** 없는 쿠데타이거나 참가 받기가 끝났다 */
  "unknown_coup",
  /** 국고 지분이 모자라다(국고 지분 팔기) */
  "not_enough_shares",
  /** 그 나라와 전쟁 중이 아니다(강화 — 프로토콜 GOVERNANCE5_PROTOCOL_VERSION부터) */
  "not_at_war",
  /** 지배 가문이 바뀐 뒤 보호 기간이라 쿠데타를 일으킬 수 없다(설정 칸 gov_coup_protect_ms) */
  "coup_protected",
  /** 그 도시 지분 50% 이상을 가진 가문이 아니다(가문 독립 선언 — D-300) */
  "not_majority_holder",
] as const;
export type GovernanceResultCode = (typeof GOVERNANCE_RESULT_CODES)[number];

/** 한 일: proposed 투표 열림 · decided 직권 결정(유예 뒤 집행) · voted · registered */
export const GOVERNANCE_ACTIONS = [
  "proposed",
  "decided",
  "voted",
  "registered",
  /** 쿠데타를 일으켰다(agendaId = 쿠데타 ID — 프로토콜 COUP_PROTOCOL_VERSION부터) */
  "coup_started",
  /** 쿠데타 편을 들었다(agendaId = 쿠데타 ID) */
  "coup_joined",
] as const;
export type GovernanceAction = (typeof GOVERNANCE_ACTIONS)[number];

const govResultMessage = z.discriminatedUnion("ok", [
  z.object({
    t: z.literal("gov_result"),
    id: requestId,
    ok: z.literal(true),
    agendaId: rowId,
    action: z.enum(GOVERNANCE_ACTIONS),
  }),
  z.object({
    t: z.literal("gov_result"),
    id: requestId,
    ok: z.literal(false),
    code: z.enum(GOVERNANCE_RESULT_CODES),
  }),
]);

export const governanceClientMessages = [
  govProposeMessage,
  govVoteMessage,
  govCandidateMessage,
  govCoupMessage,
  govCoupJoinMessage,
] as const;
export const governanceServerMessages = [govResultMessage] as const;
