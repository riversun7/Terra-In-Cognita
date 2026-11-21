// 지도자끼리 조약(외교 화면) 전송 타입·고정 목록 — 사용자 결정 D-588(질문 2497 "가,나 외교파트" — 받는 쪽이 기한 안에 받는 제안(가)과 조항을 주고받으며
// 고치는 협상(나) 둘 다, D-292 조항 카드), 질문 2498(동맹·보호 효과는 기술에 맡김 — D-291 참전 절차·D-292 조항 카드 틀 안에서), D-444 167(조약 카드마다 투표 필요 칸),
// docs/adr/2026-11-21-diplomacy-treaties.md. 진입점은 @terra/shared/treaty다(첫 화면 묶음에 넣지 않는다).
// - 판정(제안·받기·집행·위반·만료·공물)은 서버가 한다. 기기는 그리기만 한다.
// - 조항 카드 종류 이름은 @terra/shared/faction TREATY_KINDS와 같다(ceasefire = 휴전·강화 카드). 지금 서버가 집행하는 카드만 여기에 든다.
import { type Regime, TREATY_CARD_RULES, type TreatyDecision } from "./faction.ts";
import type { GovernanceName } from "./governance.ts";

/**
 * 서버가 집행하는 조항 카드(D-292·D-255 카드 가운데):
 * - ceasefire(휴전·강화): 전쟁을 끝낸다(세력·사회 강화 조약 — 불가침 d292_truce). 전쟁 중인 상대와만, 전쟁 중이면 꼭 든다.
 * - non_aggression(불가침): 조약 기간 동안 불가침(그동안 같은 상대에게 선포하면 위반 — 조약은 공격을 막지 않는다 D-329 86).
 * - alliance(동맹): 불가침 + 참전 요청·수락(D-291 — 요청 → 수락 → 전쟁 참가자 등록) [기술 기본값 2498].
 * - protection(보호): 불가침 + 보호받는 쪽이 전쟁에 들면 보호하는 쪽에 참전 요청이 저절로 간다 + 공물(보호받는 쪽 국고의 ‰, 공물 주기마다) [기술 기본값 2498].
 * 영토 이전·배상금·포로 교환·교역 협정·시야·통행·공동 정화·교환 카드는 아직 집행하지 않는다(질문 2551).
 */
export const TREATY_CLAUSE_KINDS = ["ceasefire", "non_aggression", "alliance", "protection"] as const;
export type TreatyClauseKind = (typeof TREATY_CLAUSE_KINDS)[number];

/** 조항 하나(저장·전송 모양). 보호는 보호하는 나라(세력 행)와 공물 ‰ */
export interface TreatyClause {
  readonly kind: TreatyClauseKind;
  /** 보호: 보호하는 쪽 나라(세력 행 ID) */
  readonly protectorNationId?: number;
  /** 보호: 공물(보호받는 쪽 국고의 ‰, 0 = 없음, 상한 설정 칸 dip_tribute_max_pm) */
  readonly tributePm?: number;
}

/**
 * 조약 상태: proposed(처음 제안 — 답 기다림) · negotiating(맞제안이 오간 뒤 — 답 기다림) · active(맺음 — 서버가 집행) · expired(기간 끝) ·
 * broken(맺은 동안 둘이 전쟁 상태가 됨 — 위반) · declined(거절·거둠·자기 나라 투표 부결) · lapsed(답 기한이 지남)
 */
export const TREATY_STATES = [
  "proposed",
  "negotiating",
  "active",
  "expired",
  "broken",
  "declined",
  "lapsed",
] as const;
export type TreatyState = (typeof TREATY_STATES)[number];

/** 아직 답을 기다리는 상태 */
export const isOpenTreaty = (state: TreatyState): boolean => state === "proposed" || state === "negotiating";

/**
 * 조약 하나를 그 체제의 나라가 받아들이는 길(D-444 167 — 카드마다 투표 필요 칸): 투표가 필요한 카드가 하나라도 있으면 투표, 그 카드가 모두 짧은 투표
 * (휴전·강화)면 짧은 투표. 독재는 늘 지도자(D-217). 체제를 모르면(null) 투표 쪽
 */
export function treatyPathOf(kinds: readonly TreatyClauseKind[], regime: Regime | null): TreatyDecision {
  if (regime === "dictatorship") return "leader";
  const voting = kinds.filter((kind) => TREATY_CARD_RULES[kind].needsVote);
  if (voting.length === 0) return "leader";
  return voting.every((kind) => TREATY_CARD_RULES[kind].shortVote) ? "short_vote" : "vote";
}

/** 조약 날 수의 바닥(하루) */
export const TREATY_MIN_DAYS = 1;

/** 다음에 누가 할 차례인가(보는 나라 기준): 우리 투표 · 우리 답 · 상대 투표 · 상대 답 · 없음(끝남·맺음) */
export type TreatyWaiting = "our_vote" | "us" | "their_vote" | "them" | null;

/** 참전 요청 상태(D-291 요청 → 수락 → 전쟁 참가자 등록): 요청됨 · 참가함 · 거절 · 기한 지남 */
export const WAR_JOIN_STATES = ["requested", "joined", "declined", "lapsed"] as const;
export type WarJoinState = (typeof WAR_JOIN_STATES)[number];

export interface DiplomacyNationRef {
  readonly id: number;
  readonly name: GovernanceName | null;
}

/** 조항(화면) — 보호하는 쪽을 보는 나라 기준으로 */
export interface TreatyClauseView {
  readonly kind: TreatyClauseKind;
  /** 보호: 우리가 보호하는 쪽인가 */
  readonly weProtect: boolean | null;
  readonly tributePm: number | null;
}

export interface TreatyView {
  readonly id: number;
  readonly other: DiplomacyNationRef;
  /** 우리가 처음 제안했나 */
  readonly initiatedByUs: boolean;
  /** 지금 조항을 우리가 썼나(맞제안이면 바뀐다) */
  readonly authoredByUs: boolean;
  readonly revision: number;
  readonly clauses: readonly TreatyClauseView[];
  /** 조약 기간(날) */
  readonly days: number;
  readonly state: TreatyState;
  readonly waiting: TreatyWaiting;
  /** 우리 나라가 이 조약을 받아들이는 길(D-444 167) */
  readonly path: TreatyDecision;
  /** 답 기한(열린 조약). 없으면 null */
  readonly respondByMs: number | null;
  /** 우리 나라 비준 투표(열려 있으면 그 안건 ID — 의결 칸에서 표를 던진다) */
  readonly agendaId: number | null;
  readonly createdAtMs: number;
  readonly activatedAtMs: number | null;
  readonly expiresAtMs: number | null;
  readonly endedAtMs: number | null;
  /** 위반으로 끝났을 때 어긴 쪽(맺은 동안 선포한 나라 — D-255·D-329 86). 모르면·위반이 아니면 null */
  readonly brokenBy: "us" | "them" | null;
  /** 보는 사람(지도자)이 지금 할 수 있는 것 */
  readonly can: { readonly accept: boolean; readonly counter: boolean; readonly decline: boolean };
}

export interface WarJoinView {
  readonly id: number;
  readonly treatyId: number;
  /** 요청한 나라(전쟁 중인 동맹·보호받는 나라) */
  readonly requester: DiplomacyNationRef;
  /** 참가할 나라 */
  readonly joiner: DiplomacyNationRef;
  readonly enemy: DiplomacyNationRef;
  readonly state: WarJoinState;
  /** 보호 조약이 저절로 낸 요청 */
  readonly auto: boolean;
  readonly createdAtMs: number;
  readonly respondByMs: number;
  /** 보는 사람(참가할 나라 지도자)이 답할 수 있나 */
  readonly canAnswer: boolean;
}

/** 제안 상대로 고를 수 있는 나라 */
export interface DiplomacyPartner extends DiplomacyNationRef {
  readonly atWar: boolean;
  /** 불가침 끝(없으면 null) */
  readonly truceUntilMs: number | null;
  /** 플레이어가 이끄는 나라(아니면 NPC 규칙이 답한다) */
  readonly playerLed: boolean;
  /** 그 나라와 맺은 동맹(또는 우리가 보호받는 보호) 조약 — 참전을 요청할 때 쓴다. 없으면 null */
  readonly requestTreatyId: number | null;
  /** 그 조약으로 참전을 요청할 수 있는 적(우리가 전쟁 중이고 그 나라는 아닌 상대) */
  readonly requestable: readonly DiplomacyNationRef[];
  /** 그 나라의 세력 신뢰와 조약 위반 수 */
  readonly trust: number;
  readonly breaches: number;
}

/** 세력 신뢰(D-255 "모두가 보는 신뢰"·D-443 154 — 세력마다 하나, −100~100, 시작 0). 조약을 어길 때마다 설정 칸만큼 내려간다 */
export interface NationTrust {
  readonly trust: number;
  readonly breaches: number;
}

export type DiplomacyStatus = "ready" | "not_ready" | "no_nation";

export interface DiplomacyResponse {
  readonly status: DiplomacyStatus;
  readonly nation: (DiplomacyNationRef & NationTrust & { readonly regime: Regime }) | null;
  /** 보는 사람이 지도자(지배 가문의 장)인가 — 제안·답·참전은 지도자만 [임시 2552] */
  readonly leader: boolean;
  /** 조약 기간 상한(날 — 설정 칸 dip_treaty_max_days)·공물 상한(‰ — dip_tribute_max_pm) */
  readonly maxDays: number;
  readonly tributeMaxPm: number;
  readonly partners: readonly DiplomacyPartner[];
  /** 열린 조약·맺은 조약·최근 끝난 조약(새것부터) */
  readonly treaties: readonly TreatyView[];
  /** 우리 나라가 든 참전 요청(받은 것·보낸 것, 새것부터) */
  readonly warJoins: readonly WarJoinView[];
}
