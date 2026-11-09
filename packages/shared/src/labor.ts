// 노동 계약 화면 자료(tRPC labor.overview·labor.jobs) — docs/adr/2026-11-03-labor-contracts.md, 기획 D-479·49 N48
// 바꾸는 명령(맺기·해지·보증금 채우기·임대료 정하기·구인 내기·거두기·받기)은 WebSocket(@terra/protocol labor.ts)으로만 보낸다(AGENTS 4장).
// 금액은 최소 단위 정수를 10진 글자로 보낸다(JSON에 BigInt가 없다). 시각은 서버 UTC ms.

/** 10진 정수 글자(화폐 최소 단위) */
export type LaborAmount = string;

export type LaborKindView = "wage" | "lease";
export type LaborStateView = "active" | "paused" | "grace" | "ended";
export type LaborEndReasonView =
  | "owner"
  | "worker"
  | "deposit_used_up"
  | "rent_unpaid"
  | "expired"
  | "unit_gone"
  | "building_gone";

export interface LaborContractView {
  readonly id: number;
  readonly kind: LaborKindView;
  /** 내가 시설 주인(owner)·유닛 소유 주체(worker)·둘 다(both) */
  readonly role: "owner" | "worker" | "both";
  readonly unitId: number;
  readonly buildingId: number;
  /** 임금형 = 주기당 임금, 임대형 = 시간당 임대료 */
  readonly rate: LaborAmount;
  /** 임금형 보증금 잔액(임대형 "0") */
  readonly deposit: LaborAmount;
  /** 남은 보증금으로 낼 수 있는 주기 수(임금형) */
  readonly cyclesLeft: number;
  /** 남은 보증금이 N48 경고 날수 아래(임금형) */
  readonly warning: boolean;
  readonly state: LaborStateView;
  readonly startedAt: number;
  readonly endsAt: number | null;
  /** 다음 지급 시각(열린 계약만) */
  readonly nextDueAt: number | null;
  readonly graceUntil: number | null;
  readonly endedAt: number | null;
  readonly endReason: LaborEndReasonView | null;
  readonly paidTotal: LaborAmount;
  /** 마지막으로 정산한 시각(이 뒤의 지급은 아직 반영 전) */
  readonly settledAt: number;
  /** 유예가 끝나 시설에 남은 임차인 물건이 시설 주인에게 넘어간 시각(기획 341, 시설 창고가 없어 기록만). 아니면 null */
  readonly leftoversMovedAt: number | null;
}

/** 직무(서버 시설에 종류가 아직 없어 시험 채집 하나) */
export type LaborJobKindView = "gather";

/** 구인 게시 하나(시설 주인이 낸 일자리, 받으면 임금형 계약) */
export interface LaborJobView {
  readonly id: number;
  readonly buildingId: number;
  /** 시설이 선 2차맵(같은 2차맵의 유닛만 받을 수 있다, 522 ①). 시설을 못 찾으면 null */
  readonly mapKey: number | null;
  /** [임시] 시설에서 가장 가까운 도시(같은 2차맵) 번호. 없으면 null */
  readonly cityId: number | null;
  readonly job: LaborJobKindView;
  /** 고용주 조정(N28, ‰) */
  readonly adjustPm: number;
  /** 기준 유닛이 받을 주기당 임금(효율 × 단가 × 조정) */
  readonly wage: LaborAmount;
  /** 한 명 받을 때 고용주가 넣는 보증금(임금 × 보증금 주기 수) */
  readonly deposit: LaborAmount;
  readonly slots: number;
  readonly filled: number;
  /** 계약 기간(시간). null = 기간 없음 */
  readonly termHours: number | null;
  readonly postedAt: number;
  /** 내가 낸 게시 */
  readonly own: boolean;
}

/** 구인 게시판에 열린 일자리가 있는 도시(거르기) */
export interface LaborJobCityView {
  readonly id: number;
  readonly jobs: number;
}

/** labor.jobs — 남이 낸 열린 일자리(임금 높은 차례, 최대 LABOR_JOBS_LIMIT개) */
export interface LaborJobsResponse {
  readonly status: "ready" | "not_ready";
  readonly generatedAt: number;
  readonly jobs: readonly LaborJobView[];
  /** 거르기에 맞는 일자리 수(목록 상한 전) */
  readonly total: number;
  /** 열린 일자리가 있는 도시(거르기 전, 번호 차례) */
  readonly cities: readonly LaborJobCityView[];
}

/** 구인 게시판 한 번에 보내는 일자리 수 상한(화면 목록) */
export const LABOR_JOBS_LIMIT = 50;

/** 내 건물(시설) 또는 빌릴 수 있는 남의 건물 */
export interface LaborBuildingView {
  readonly id: number;
  readonly own: boolean;
  /** 시간당 임대료(빌려주지 않으면 null) */
  readonly rent: LaborAmount | null;
  /** 시설이 선 2차맵(같은 2차맵의 유닛만 일한다, 기획 정리 D-518 522 ①) */
  readonly mapKey: number;
}

export interface LaborUnitView {
  readonly id: number;
  /** 유닛 종류 코드(서버 unitKinds: 0 시험 봇, 3 사이보그 본체, 4 휴먼 …) */
  readonly kind: number;
  /** 열린 계약(일함·일시 중지)이 있다 */
  readonly busy: boolean;
  /** 유닛이 있는 2차맵 */
  readonly mapKey: number;
}

/** N48 규칙과 임금 식의 지금 값(화면이 보증금·임금을 미리 셈한다) */
export interface LaborRulesView {
  readonly wageCycleMs: number;
  readonly depositDays: number;
  readonly warnDays: number;
  readonly rentCycleMs: number;
  readonly graceMs: number;
  /** 고용주 조정 범위(N28, ‰) */
  readonly adjustMinPm: number;
  readonly adjustMaxPm: number;
  /** [임시] 기준 유닛 효율점수(유닛 스탯이 아직 없어 새 유닛 평균 1차 스탯 하나) */
  readonly efficiency: number;
  /** 기준 단가(N27, 효율 1점당 밀리 화폐) */
  readonly rateMilli: number;
  /** 보증금 주기 수(임금 × 이 수 = 보증금) */
  readonly depositCycles: number;
}

/** labor.overview */
export interface LaborOverviewResponse {
  /** not_ready = 세계(DB)가 없거나 부팅 중 */
  readonly status: "ready" | "not_ready";
  readonly generatedAt: number;
  /** [임시] 계약 화폐 = 서버 시험 화폐 자산 코드 */
  readonly currency: string;
  /** 내 지갑 잔고 */
  readonly balance: LaborAmount;
  readonly rules: LaborRulesView;
  readonly contracts: readonly LaborContractView[];
  readonly buildings: readonly LaborBuildingView[];
  readonly units: readonly LaborUnitView[];
  /** 내가 낸 열린 구인 게시 */
  readonly jobs: readonly LaborJobView[];
}
