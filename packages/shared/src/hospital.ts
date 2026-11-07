// 부상·병원 화면 자료(tRPC hospital.overview) — 기획 D-521(부상 4단계 초록·흰·노랑·빨강, 단계별 자연 치유, 병원은 등급·의사 스탯·스킬로 매우
// 빠르고 비용이 든다), docs/adr/2026-11-08-injury.md. 판정은 서버(@terra/sim society/injury.ts)가 하고, 기기는 이 값을 보여 주고 치료 명령
// (hospital_treat, 프로토콜 17)에 본 값(cost)을 함께 보낸다.

/** 부상 단계: 0 초록(정상) · 1 흰 · 2 노랑 · 3 빨강 */
export type InjuryStage = 0 | 1 | 2 | 3;

/** 병원 하나 */
export interface HospitalView {
  readonly buildingId: number;
  readonly mapKey: number;
  /** 병원이 선 도시(같은 2차맵의 가장 가까운 도시). 없으면 null */
  readonly cityId: number | null;
  /** 내 병원인가(요금은 소각 [임시]) — 아니면 요금이 주인 수입 */
  readonly own: boolean;
  /** 다 지은 레벨(처음 짓는 동안 0) */
  readonly level: number;
  /** 지금 치료하나(다 지었고 30% 이상) */
  readonly works: boolean;
  /** 의사 자리·직무 배치된 의사 수 */
  readonly slots: number;
  readonly doctors: number;
  /** 가장 나은 의사(배율에 드는 의사): INT + WIS, 치유 스킬 가장 높은 등급(없으면 0). 의사가 없으면 null */
  readonly doctor: { readonly unitId: number; readonly stat: number; readonly skillGrade: number } | null;
  /** 치유 배율(‰, 1000 = 자연 치유) */
  readonly speedPm: number;
}

/** 다친 유닛 하나에 그 도시 병원의 치료 견적 */
export interface TreatmentOption {
  readonly buildingId: number;
  readonly speedPm: number;
  /** 치료하면 초록이 되는 시각 */
  readonly greenAtMs: number;
  /** 값(최소 단위, 10진 문자열) */
  readonly cost: string;
  /** 지금 잔고로 낼 수 있나 */
  readonly affordable: boolean;
}

/** 다친 내 유닛 하나(사이보그 본체 포함) */
export interface InjuredUnitView {
  readonly unit: number;
  readonly cyborg: boolean;
  readonly stage: InjuryStage;
  /** 한 단계 내려가는 시각 */
  readonly untilMs: number;
  /** 치료하지 않으면 초록이 되는 시각(지금 배율) */
  readonly greenAtMs: number;
  /** 치유 배율(‰, 치료 중이면 1000보다 크다) */
  readonly healPm: number;
  /** 포로인가(치료 못 함) */
  readonly captive: boolean;
  /** 지금 선 도시(없으면 null) */
  readonly cityId: number | null;
  /** 그 도시 병원의 견적(지금보다 빠른 병원만, 빠른 차례) */
  readonly options: readonly TreatmentOption[];
}

/** tRPC hospital.overview */
export interface HospitalOverviewResponse {
  readonly status: "ready" | "not_ready";
  /** dev·admin: 개발 시험 부상 주기(dev_injure_unit)를 쓴다 */
  readonly devGrant: boolean;
  readonly generatedAt: number;
  /** 요금 화폐 자산 코드와 내 잔고(최소 단위) */
  readonly currency: string;
  readonly balance: string;
  /** 단계마다 자연 치유 시간(ms, 칸 번호 = 단계, 0번은 0) — 화면 안내 */
  readonly healMs: readonly number[];
  readonly hospitals: readonly HospitalView[];
  readonly units: readonly InjuredUnitView[];
}
