// 가문 가입·구성원 조회 모양(tRPC factionIdentity.house) — 질문 985 다(초대 + 신청, 같은 나라 시민만), 983 가(가문은 창설자를 따라 나라를
// 옮긴다), 986 가(운영자가 신고된 이름을 "가문 #ID"로 되돌린다). docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-11, 981~986 답)".
// 바꾸는 명령(초대·신청·받기·거절·거두기·나가기·내보내기)은 WebSocket(@terra/protocol house.ts)이다. 이 파일은 조회 모양과 공용 값만 둔다.
import type { NationEmblemSpec } from "./nationEmblem.ts";

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
      })
    | null;
  /** 내가 받은 초대·내가 보낸 신청(가문이 없을 때) */
  readonly offers: readonly HouseOfferRow[];
  /** 내 나라의 가문(가문이 없을 때 — 가입 신청 대상, 인원 많은 차례, 상한 HOUSE_LIST_LIMIT) */
  readonly joinable: readonly HouseBadge[];
  readonly notices: readonly HouseNoticeRow[];
  readonly limits: HouseLimits;
}

/** 가입 신청 목록 상한 */
export const HOUSE_LIST_LIMIT = 50;

/** 운영자가 되돌린 가문 이름(986 가 — 사람이 넣는 이름 규칙에는 '#'이 없어 겹치지 않는다) */
export const houseResetName = (factionId: number): string => `가문 #${String(factionId)}`;

/** 운영자가 되돌린 약어(H + 36진수 대문자, 2~5자 — 가문 ID 36^4 = 1,679,616 아래) */
export const houseResetShort = (factionId: number): string =>
  `H${Math.max(1, Math.trunc(factionId)).toString(36).toUpperCase()}`.slice(0, 5);
