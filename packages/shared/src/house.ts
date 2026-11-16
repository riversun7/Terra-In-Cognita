// 가문 가입·구성원 조회 모양(tRPC factionIdentity.house) — 질문 985 다(초대 + 신청), 986 가(운영자가 신고된 이름을 "가문 #ID"로 되돌린다).
// docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-11, 981~986 답)". 기획 D-565(2026-11-15): 가문은 소속 도시를 골라 그 도시 나라의
// 가문이 된다 — 같은 나라 시민만 든다(985 다)·귀화하면 가문이 따라간다(983 가)는 D-565가 대신한다(가문은 시작 국가와 별개, "바뀜 (D-565)").
// 바꾸는 명령(초대·신청·받기·거절·거두기·나가기·내보내기)은 WebSocket(@terra/protocol house.ts)이다. 이 파일은 조회 모양과 공용 값만 둔다.
import type { LocalizedName } from "./faction.ts";
import type { NationEmblemSpec } from "./nationEmblem.ts";
import type { RecruitCardView } from "./recruit.ts";

/** 가문 안 역할: 가문장 | 가문원 */
export type HouseRole = "leader" | "member";

/** 대기 중인 요청 종류: 가문장이 보낸 초대 | 플레이어가 보낸 가입 신청 */
export type HouseRequestKind = "invite" | "apply";

/** 가문 표지(목록·초대 줄) */
export interface HouseBadge {
  readonly factionId: number;
  readonly name: string;
  readonly shortName: string;
  readonly color: string;
  readonly emblem: NationEmblemSpec;
  /** 올린 그림 해시(있으면 그림이 먼저) */
  readonly uploaded: string | null;
  readonly memberCount: number;
  /** 가문장 사이보그 이름(없으면 null) */
  readonly leaderName: string | null;
}

/** 가문원 한 줄 */
export interface HouseMemberRow {
  readonly userId: string;
  /** 사이보그 이름(없으면 null) */
  readonly name: string | null;
  readonly role: HouseRole;
  readonly joinedAt: number;
}

/** 대기 중인 요청 한 줄(가문장이 보는 것 — 보낸 초대·받은 신청) */
export interface HouseRequestRow {
  readonly id: number;
  readonly kind: HouseRequestKind;
  readonly userId: string;
  readonly name: string | null;
  readonly createdAt: number;
  readonly expiresAt: number;
}

/** 내가 받은 초대·내가 보낸 신청 한 줄 */
export interface HouseOfferRow {
  readonly id: number;
  readonly kind: HouseRequestKind;
  readonly house: HouseBadge;
  readonly createdAt: number;
  readonly expiresAt: number;
}

/**
 * 가문 소식(확인하면 지운다). 닫힌 목록이 아니다 — 더 새 서버의 모르는 종류는 기기가 "가문 소식"으로 그린다.
 * - invite_accepted·invite_declined: 내(가문장)가 보낸 초대를 받았다·거절했다(other = 그 사람)
 * - apply_accepted·apply_declined: 내 가입 신청을 가문장이 받았다·거절했다
 * - member_left: 가문원이 나갔다(other)
 * - kicked: 가문장이 나를 내보냈다
 * - nation_left: 나와 가문의 나라가 달라져 가문에서 빠졌다(내가 귀화했거나 가문장이 귀화해 가문이 옮겼다 — 983)
 * - house_moved: 가문장인 내가 귀화해 가문이 새 나라로 옮겼다(count = 빠진 가문원 수)
 * - name_reset: 운영자가 가문 이름을 "가문 #ID"로 되돌렸다(reason = 사유). 이름 바꾸기 대기 없이 다시 정한다(986)
 * - leader_given: 가문장이 나에게 가문장을 넘겼다(other = 앞 가문장, 1003 가)
 * - leader_changed: 가문장이 바뀌었다(other = 새 가문장)
 * - city_gained: 가문이 도시를 얻었다(reason = vassal | independent, 1005 가)
 * - home_changed: 가문장이 가문 소속 도시를 바꿨다(other = 가문장, reason = 새 소속 도시 이름 — 없으면 null, D-565)
 * - claim_halted: 빈 2차맵에 짓던 정부 건물이 멈췄다 — 다른 편 도시가 먼저 섰다(D-572 "자원과 시간만 날릴수있음", 질문 2194). 가문 없는
 *   사람이면 house_name은 빈 글자
 */
export const HOUSE_NOTICE_KINDS = [
  "invite_accepted",
  "invite_declined",
  "apply_accepted",
  "apply_declined",
  "member_left",
  "kicked",
  "nation_left",
  "house_moved",
  "name_reset",
  "leader_given",
  "leader_changed",
  "city_gained",
  "home_changed",
  // D-570: 가문장이 새 소속 도시를 공고함(reason = 새 도시 이름)·공고를 거둠(reason = has_city·unknown_city면 서버가 거둠, 없으면 가문장)
  "home_announced",
  "home_cancelled",
  // 알박기(D-572·D-574): 짓던 정부 건물이 멈춤(ruins/landClaim.ts)
  "claim_halted",
] as const;
export type HouseNoticeKind = (typeof HOUSE_NOTICE_KINDS)[number];

export const isHouseNoticeKind = (value: string): value is HouseNoticeKind =>
  (HOUSE_NOTICE_KINDS as readonly string[]).includes(value);

export interface HouseNoticeRow {
  readonly id: number;
  /** 종류(모르는 값이 올 수 있다) */
  readonly kind: string;
  /** 그때의 가문 이름 */
  readonly houseName: string;
  /** 상대 사이보그 이름(없으면 null) */
  readonly other: string | null;
  readonly reason: string | null;
  readonly count: number;
  readonly at: number;
}

/** 가문 가입 설정값(설정 칸 — 화면이 안내한다) */
export interface HouseLimits {
  /** 가문 인원 상한(가문장 포함) */
  readonly memberMax: number;
  /** 가문마다 대기 중인 초대·신청 상한 */
  readonly pendingMax: number;
  /** 사람마다 동시에 보낼 수 있는 가입 신청 수 */
  readonly applyMax: number;
  /** 초대·신청이 사라지는 시간(ms) */
  readonly requestTtlMs: number;
}

/** 가문이 도시를 처음 얻을 때 고른 상태(D-340): 나라의 봉신 | 독립 도시국가. 아직 도시를 얻지 않았으면 null */
export type HouseCityStatus = "vassal" | "independent";

/** 가문 도시 한 줄 */
export interface HouseCityRow {
  readonly id: number;
  /** 도시 이름(아직 없으면 null) */
  readonly name: string | null;
  readonly mapKey: number;
  readonly x: number;
  readonly y: number;
}

/** 가문 도시 칸(질문 1005 가 — 마을 세우기와 폐허 복원이 같은 봉신·독립 고르기) */
export interface HouseCityView {
  /** 고른 상태(아직이면 null — 처음 도시를 얻을 때 고른다) */
  readonly status: HouseCityStatus | null;
  /** 독립이면 그 체제 */
  readonly regime: "dictatorship" | "democracy" | "capitalism" | null;
  readonly cities: readonly HouseCityRow[];
  /** 마을 세우기 값(10진 글자 최소 단위, 설정 칸 house_village_cost)·새 마을 주거(설정 칸 house_village_housing) */
  readonly villageCost: string;
  readonly villageHousing: number;
  /**
   * 가문장 사이보그 둘레에서 서버가 고른 마을 자리(다른 세력 영향권 밖·다른 도시와 띄움 — NPC 마을과 같은 규칙). 가문장이 아니거나 자리가
   * 없거나 세계가 준비 중이면 null
   */
  readonly site: { readonly mapKey: number; readonly x: number; readonly y: number } | null;
  /** 가문장이 주인이고 아직 가문 도시로 정하지 않은 폐허(되살리면 내 나라로 간다 — [가문 도시로] 고르기) */
  readonly ruins: readonly { readonly id: number; readonly name: string | null }[];
  /** 마을 세우기·폐허 고르기를 할 수 있나(NPC 사회 런타임이 돌 때만) */
  readonly ready: boolean;
  /** 가문 도시 구인(질문 1041 다 — 가문을 거울 세계에 들인 뒤에만, 옛 서버는 보내지 않는다) */
  readonly recruit?: HouseRecruitView | null | undefined;
  /**
   * 봉신 가문의 독립 선언(D-575, house_independence): open = 가문장이 선언할 수 있다(가문 도시가 모두 알박기로 선 도시), blocked = 알박기가 아닌
   * 도시가 있어 막힘(46 §3.2 독립 규칙 몫), 봉신이 아니면 null. 옛 서버는 보내지 않는다
   */
  readonly independence?: "open" | "blocked" | null | undefined;
}

/** 가문 도시 하나의 구인(인구·주거·가문장이 보는 지금 창 카드) */
export interface HouseRecruitCity {
  readonly id: number;
  readonly population: number;
  readonly housing: number;
  /** 가문장만(가문원은 빈 목록) */
  readonly cards: readonly RecruitCardView[];
}

/** 가문 도시 구인 칸(자동 구인 = NPC와 같은 구인 규칙식, 끄면 가문장이 손으로 산다) */
export interface HouseRecruitView {
  readonly auto: boolean;
  /** 가문 국고(그 가문 화폐 최소 단위)·가문장 지갑(기준 통화, 가문장만 — 국고가 모자라면 여기서 낸다 [임시]) */
  readonly treasury: string;
  readonly leaderWallet: string | null;
  /** 갱신 창(사기 명령이 보낸다)·다음 갱신 시각 */
  readonly window: number;
  readonly endsAtMs: number;
  readonly cities: readonly HouseRecruitCity[];
}

/** 소속 도시 한 줄(D-565): 도시와 그 도시가 속한 나라(최상위 세력 — 봉신 관계를 따라 올라간다) */
export interface HouseHomeCity {
  readonly id: number;
  /** 도시 이름(아직 없으면 null — 화면이 "도시 #ID") */
  readonly name: string | null;
  /** 그 도시가 속한 나라(세력 행 ID) */
  readonly nationId: number;
  /** 나라 이름(팩 국가 프리셋·가문 정체성 이름). 모르면 null(화면이 "세력 #ID") */
  readonly nation: LocalizedName | null;
}

/**
 * 소속 도시 칸(D-565): 가문은 소속 도시를 골라 그 도시 나라의 가문이 된다(세금 납부·랭킹 집계). 가문 없는 사람은 "무소속"이고 소속 도시는
 * 사이보그의 내 도시(cyborgs.start_city_id — 귀화하면 바뀐다)다.
 */
export interface HouseHomeView {
  /** 지금 소속 도시(가문이면 가문 소속 도시, 무소속이면 내 도시). 모르면 null */
  readonly city: HouseHomeCity | null;
  /** 가문장이 소속 도시를 다시 바꿀 수 있게 되는 시각(지금 바꿀 수 있거나 가문장이 아니면 null) */
  readonly changeAt: number | null;
  /** 소속 도시 바꾸기 대기(ms, 설정 칸 house_home_wait_ms) */
  readonly waitMs: number;
  /** 도시를 가진 가문은 아직 소속 도시를 바꾸지 못한다([임시] 질문 1743) */
  readonly locked: boolean;
  /** 고를 수 있는 도시(가문장만 받는다 — 가문원·무소속은 빈 목록. 무소속이 가문을 만들 때는 factionIdentity.mine의 homeChoices) */
  readonly choices: readonly HouseHomeCity[];
  /**
   * 공고한 새 소속 도시(D-570 — at이 지나면 가문 모두가 옮긴다. 원치 않는 가문원은 그 사이 나간다). terms = 그 도시·나라 정책으로 가문이 한꺼번에
   * 내거나 받는 합(D-573 — 가문원마다 값 × 지금 가문원 수, 10진 문자열 최소 단위, + 가입비 / − 지원금, "0" = 없음). 공고가 없으면 null. 옛 서버는
   * 보내지 않는다
   */
  readonly pending?: { readonly city: HouseHomeCity; readonly at: number; readonly terms: string } | null;
  /** 공고 기간(ms, 설정 칸 house_home_notice_ms — 0이면 바로 옮긴다). 옛 서버는 보내지 않는다 */
  readonly noticeMs?: number;
}

/** 소속 도시 후보 상한(나라·도시 ID 차례) */
export const HOUSE_HOME_CHOICE_LIMIT = 300;

/** factionIdentity.house 응답 */
export interface HouseView {
  /** 내 나라(사이보그 시민권). 사이보그가 없으면 null — 가입·초대를 할 수 없다 */
  readonly nationId: number | null;
  /** 내가 든 가문(없으면 null) */
  readonly house:
    | (HouseBadge & {
        readonly role: HouseRole;
        readonly nationId: number | null;
        readonly members: readonly HouseMemberRow[];
        /** 대기 중인 요청(가문장만 받는다 — 가문원은 빈 목록) */
        readonly requests: readonly HouseRequestRow[];
        /** 가문 도시(옛 서버는 보내지 않는다) */
        readonly city?: HouseCityView | undefined;
      })
    | null;
  /** 내가 받은 초대·내가 보낸 신청(가문이 없을 때) */
  readonly offers: readonly HouseOfferRow[];
  /** 가입 신청할 수 있는 가문(가문이 없을 때 — 인원 많은 차례, 상한 HOUSE_LIST_LIMIT. D-565부터 나라를 가리지 않는다) */
  readonly joinable: readonly HouseBadge[];
  readonly notices: readonly HouseNoticeRow[];
  readonly limits: HouseLimits;
  /** 소속 도시(D-565 — 가문이면 가문 소속 도시, 없으면 무소속의 내 도시). 옛 서버는 보내지 않는다 */
  readonly home?: HouseHomeView | undefined;
}

/** 가입 신청 목록 상한 */
export const HOUSE_LIST_LIMIT = 50;

/** 운영자가 되돌린 가문 이름(986 가 — 사람이 넣는 이름 규칙에는 '#'이 없어 겹치지 않는다) */
export const houseResetName = (factionId: number): string => `가문 #${String(factionId)}`;

/** 운영자가 되돌린 약어(H + 36진수 대문자, 2~5자 — 가문 ID 36^4 = 1,679,616 아래) */
export const houseResetShort = (factionId: number): string =>
  `H${Math.max(1, Math.trunc(factionId)).toString(36).toUpperCase()}`.slice(0, 5);
