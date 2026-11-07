// 신전·생명과학 연구소 조회 모양(tRPC temple.overview) — 기획 D-517·D-311·D-441·D-451·49 S15, docs/adr/2026-11-07-temple-religion.md.
// D-517: 수명이 다한 휴먼은 비활성(일하지 않음, 고르지 않으면 그대로 남음) — 신전에서 환생·신격화, 생명과학 연구소에서 유전자로 변환.
// 바꾸는 명령은 WebSocket temple_pray·temple_offer·temple_rite·dev_inactivate_unit·gene_convert(프로토콜 12)이다. 금액은 10진 문자열(최소 단위)이다.
import type { LocalizedName } from "./roster.ts";

/** 신전 규칙 값(설정 칸 실효 값) */
export interface TempleRulesView {
  /** 비활성 기다림 상한(수명 끝 → 떠남, ms). 0 = 상한 없음(떠나지 않음, D-517) */
  readonly inactiveCapMs: number;
  /** 유전자 변환 화폐(생명과학 연구소) */
  readonly convertCurrency: string;
  readonly rebirthFaith: number;
  readonly rebirthCurrency: string;
  readonly deifyFaith: number;
  readonly deifyCurrency: string;
  /** 수호신 도시당 상한(49 S15) */
  readonly guardianCap: number;
  readonly prayFaith: number;
  readonly prayCooldownMs: number;
  /** 헌금: 신앙도 1당 화폐 */
  readonly offeringPerFaith: string;
}

/** 신전(신앙 단계 시설) 또는 생명과학 연구소(생명공학 단계 시설) 하나 */
export interface TempleView {
  readonly buildingId: number;
  readonly facilityId: string;
  readonly name: LocalizedName;
  /** 신전이 선 도시(같은 2차맵의 가장 가까운 도시). 모르면 null */
  readonly cityId: number | null;
  readonly mapKey: number;
  /** 다 지은 레벨(짓는 중이면 0) */
  readonly level: number;
  /** 상태(ppm, 가득 1,000,000) */
  readonly conditionPpm: number;
  /** 기도·헌금·의식·변환을 받는가(다 지었고 30% 이상) */
  readonly works: boolean;
  /** 내 시설인가(내 시설 요금은 소각, 남의 시설은 주인 수입 [임시]) */
  readonly mine: boolean;
  /** 그 도시의 수호신 수 */
  readonly guardians: number;
}

/** 내 휴먼 하나(유저가 고용한 휴먼) */
export interface TempleHumanView {
  readonly unitId: number;
  readonly level: number;
  readonly rebirths: number;
  /** 신앙도 0~100(D-451 문턱) */
  readonly faith: number;
  /** 신앙 포인트(D-451 쓰는 재화 — 쓰는 곳은 신앙 콘텐츠) */
  readonly faithPoints: number;
  readonly lifespanEndsAtMs: number;
  /** 비활성이 떠나는 시각(수명 끝 + 상한). 상한이 없으면 null */
  readonly departsAtMs: number | null;
  /** 지금 비활성인가(일하지 않음) */
  readonly inactive: boolean;
  /** 지금 선 칸의 도시(신전·연구소와 같은 도시여야 의식·변환을 받는다). 모르면 null */
  readonly cityId: number | null;
  /** 지금 선 칸(2차맵) */
  readonly cell: { readonly mapKey: number; readonly x: number; readonly y: number } | null;
  readonly captive: boolean;
}

/** 수호신 하나(신격화한 휴먼의 기록, D-311·D-5059) */
export interface TempleGuardianView {
  /** 바탕 휴먼 유닛 ID */
  readonly unitId: number;
  readonly cityId: number;
  readonly level: number;
  readonly rebirths: number;
  readonly deifiedAtMs: number;
  readonly mine: boolean;
}

export interface TempleOverviewResponse {
  readonly status: "ready" | "not_ready";
  readonly hasCyborg: boolean;
  /** 화폐 잔고(시험 화폐 [임시]) */
  readonly balance: string;
  /** 내 사이보그 신앙도·신앙 포인트(사이보그가 없으면 null) */
  readonly cyborgFaith: { readonly faith: number; readonly faithPoints: number } | null;
  /** 다음 기도를 할 수 있는 시각(지금 할 수 있으면 0) */
  readonly prayReadyAtMs: number;
  readonly rules: TempleRulesView;
  readonly temples: readonly TempleView[];
  /** 생명과학 연구소(생명공학 단계 시설, 비활성 휴먼 유전자 변환 — D-517) */
  readonly labs: readonly TempleView[];
  readonly humans: readonly TempleHumanView[];
  readonly guardians: readonly TempleGuardianView[];
  /** 개발 시험(비활성 만들기)을 쓸 수 있는가(dev·admin) */
  readonly devGrant: boolean;
  readonly generatedAt: number;
}
