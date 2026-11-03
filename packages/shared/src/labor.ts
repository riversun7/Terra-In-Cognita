// 노동 계약 화면 자료(tRPC labor.overview) — docs/adr/2026-11-03-labor-contracts.md, 기획 D-479·49 N48
// 바꾸는 명령(맺기·해지·보증금 채우기·임대료 정하기)은 WebSocket(@terra/protocol labor.ts)으로만 보낸다(AGENTS 4장).
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
}

/** 내 건물(시설) 또는 빌릴 수 있는 남의 건물 */
export interface LaborBuildingView {
  readonly id: number;
  readonly own: boolean;
  /** 시간당 임대료(빌려주지 않으면 null) */
  readonly rent: LaborAmount | null;
}

export interface LaborUnitView {
  readonly id: number;
  /** 유닛 종류 코드(서버 unitKinds: 0 시험 봇, 1 시험 일꾼, 3 사이보그 본체 …) */
  readonly kind: number;
  /** 열린 계약(일함·일시 중지)이 있다 */
  readonly busy: boolean;
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
}
