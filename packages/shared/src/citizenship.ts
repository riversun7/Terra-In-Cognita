// 국적 바꾸기(귀화) 조건 자료(tRPC world.naturalization) — 기획 정리 D-523 포인터(질문 745 나: 다른 나라 정부에서 "귀화" 신청, 값·쉬는 날은
// 설정 칸)·D-526(받는 나라가 지원금 또는 입회비를 정함, 옛 나라에 반환 없음, 옛 나라 우호도 하락 — 적대 세력으로 가면 크게),
// docs/adr/2026-11-08-citizenship.md. 정부(행정 건물) 판이 내 나라가 아닌 도시에서 보인다.
// 읽기만 한다. 신청은 WebSocket nationality_change(프로토콜 19)이고, 판정은 서버가 다시 한다(이 값은 보여 주기용).
import type { LocalizedName } from "./roster.ts";

/**
 * ready 조건 · not_ready 세계·NPC 사회 런타임 준비 전 · unknown_building 없는 건물이거나 모르는 도시(정부 판과 같은 안개) · not_government 행정
 * 건물이 아니다 · no_cyborg 사이보그가 아직 없다
 */
export type NaturalizationStatus =
  | "ready"
  | "not_ready"
  | "unknown_building"
  | "not_government"
  | "no_cyborg";

/**
 * 지금 신청을 막는 첫 까닭(없으면 null = 신청할 수 있다). 서버 결과 코드(nationality_result)와 같은 이름이다:
 * same_nation 이미 그 나라 · not_joinable 받을 수 없는 나라 · captive 내 사이보그가 잡혀 있음 · wrong_city 내 사이보그가 그 도시에 없음 ·
 * resting 쉬는 날 · insufficient_funds 화폐 모자람(입회비가 잔고보다 큼)
 */
export type NaturalizationBlock =
  | "same_nation"
  | "not_joinable"
  | "captive"
  | "wrong_city"
  | "resting"
  | "insufficient_funds";

/** 나라(세력 행 ID·코드·화면 이름 — 팩 국가 프리셋, 없으면 null) */
export interface NaturalizationNation {
  readonly id: number;
  readonly code: string | null;
  readonly name: LocalizedName | null;
}

/**
 * 떠나는 나라(지금 내 나라)와의 우호도(D-526, −100~100 — 세력 호감 띠와 같은 눈금 `relationBand`): 지금 값·떨어질 양·떨어진 뒤 값,
 * 받는 나라가 옛 나라와 전쟁 중인가(적대 세력 — 크게 떨어진다)
 */
export interface NaturalizationStanding {
  readonly now: number;
  readonly drop: number;
  readonly after: number;
  readonly hostile: boolean;
}

export interface NaturalizationTerms {
  /** 받는 나라(그 행정 건물 도시의 주인)와 지금 내 나라 */
  readonly target: NaturalizationNation;
  readonly current: NaturalizationNation;
  /** 귀화하면 내 도시가 되는 곳(그 행정 건물의 도시) */
  readonly cityId: number;
  /**
   * 받는 나라가 정한 조건(D-526, 모두 10진 문자열 최소 단위): 입회비(내가 받는 나라 국고에 냄)와 지원금(받는 나라 국고에서 받음 — 국고가 모자라면
   * 있는 만큼) 둘 중 하나만 0보다 크다. cost = 입회비 − 지원금(부호 있음, 음수면 받는다) — 신청할 때 이 값을 그대로 보낸다. balance = 내 잔고
   */
  readonly fee: string;
  readonly grant: string;
  readonly cost: string;
  readonly balance: string;
  /** 옛 나라(지금 내 나라)와의 우호도 변화 */
  readonly standing: NaturalizationStanding;
  /** 받는 나라와의 지금 우호도(−100~100, 줄이 없으면 0) */
  readonly targetStanding: number;
  /** 바꾼 뒤 다시 바꿀 수 없는 기간(ms, 설정 칸) */
  readonly restMs: number;
  /** 지금 쉬는 중이면 그 끝 시각, 아니면 null */
  readonly restUntilMs: number | null;
  readonly blocked: NaturalizationBlock | null;
}

export interface NaturalizationResponse {
  readonly status: NaturalizationStatus;
  readonly buildingId: number;
  readonly terms: NaturalizationTerms | null;
  readonly generatedAt: number;
}
