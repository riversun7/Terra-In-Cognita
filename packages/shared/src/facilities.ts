// 건물(시설) 화면 자료 모양 — tRPC facilities.overview(조회만, 바꾸는 명령은 WebSocket facility_*, 프로토콜 9).
// docs/adr/2026-11-07-buildings-runtime.md. 서버(apps/server/src/facilities/views.ts)와 경제 화면(apps/game/src/economy/FacilityPanel.tsx)이 같이 쓴다.
// 수량은 묶음 단위 정수, 원장 잔고는 10진 글자(BigInt). 상태는 ppm(가득 1,000,000, @terra/shared/facilityRuntime).
import type { ConditionState, FacilityRuntimeRules } from "./facilityRuntime.ts";
import type { LocalizedName } from "./roster.ts";

export type { ConditionState } from "./facilityRuntime.ts";

export interface FacilityStackView {
  readonly item: string;
  readonly qty: number;
}

/** 짓거나 올릴 수 있는 시설 하나(실효 팩) */
export interface FacilityCatalogView {
  readonly id: string;
  readonly name: LocalizedName;
  readonly stage: string;
  readonly maxLevel: number;
  /** 2차맵 칸 크기(회전 전). 없으면 2차맵에 지을 수 없다 */
  readonly footprint: { readonly width: number; readonly height: number } | null;
  /** 레벨 1 최대 내구도 */
  readonly durability: number;
  /** 레벨마다 재료·건설 시간(일꾼 없이, ms) */
  readonly levels: readonly {
    readonly level: number;
    readonly materials: readonly FacilityStackView[];
    readonly timeMs: number;
  }[];
  /** 장비를 고치는 시설(공방) */
  readonly repairsEquipment: boolean;
}

export type FacilityJobKind = "build" | "upgrade" | "repair" | "beacon_repair" | "equipment";

export interface FacilityJobView {
  readonly id: number;
  readonly kind: FacilityJobKind;
  readonly buildingId: number | null;
  readonly beaconId: number | null;
  readonly holdingId: number | null;
  readonly targetLevel: number | null;
  readonly restorePpm: number | null;
  readonly unitIds: readonly number[];
  readonly materials: readonly FacilityStackView[];
  readonly startedAtMs: number;
  readonly doneAtMs: number;
}

/** 다음 한 걸음 미리 셈(재료, 일꾼 없이 걸리는 시간) */
export interface FacilityStepView {
  readonly materials: readonly FacilityStackView[];
  readonly timeMs: number;
}

export interface FacilityView {
  readonly buildingId: number;
  readonly facilityId: string;
  readonly name: LocalizedName;
  /** 다 지은 레벨(처음 짓는 동안 0) */
  readonly level: number;
  readonly maxLevel: number;
  readonly mapKey: number;
  readonly x: number;
  readonly y: number;
  readonly conditionPpm: number;
  readonly state: ConditionState;
  /** 지금 일하나(다 지었고 30% 이상) */
  readonly works: boolean;
  readonly durability: number;
  readonly maxDurability: number;
  /** 창고 용량(kg, 지금 레벨). 창고 없는 시설은 null */
  readonly storageKg: number | null;
  readonly job: FacilityJobView | null;
  /** 레벨업(최고 레벨이면 null) */
  readonly upgrade: FacilityStepView | null;
  /** 수리 한 번(10%, 가득이면 null) — 고칠 양·재료·시간(일꾼 하나) */
  readonly repairStep: (FacilityStepView & { readonly restorePpm: number }) | null;
  /** 30%까지 노화가 걸리는 남은 시간(쓰지 않을 때, 화면 안내). 이미 아래면 null */
  readonly idleMsToDisabled: number | null;
  readonly repairsEquipment: boolean;
}

/** 내 세력 영토 비콘(건물 규칙, 기획 336) */
export interface FacilityBeaconView {
  readonly id: number;
  readonly planetId: string;
  readonly cellKey: number;
  readonly conditionPpm: number;
  readonly state: ConditionState;
  readonly durability: number;
  readonly maxDurability: number;
  readonly readyAtMs: number | null;
  readonly job: FacilityJobView | null;
  readonly repairStep: (FacilityStepView & { readonly restorePpm: number }) | null;
}

export interface FacilityUnitView {
  readonly id: number;
  /** 사이보그 본체인가 */
  readonly cyborg: boolean;
  /** 다른 작업·계약 중 */
  readonly busy: boolean;
  /** 제작 직무 점수(가중치 표 job_crafting, 장인 보정) */
  readonly craftScore: number;
}

/** 고칠 수 있는 내 장비(닳은 것) */
export interface FacilityHoldingView {
  readonly id: number;
  readonly item: string;
  readonly name: LocalizedName | null;
  readonly tier: number;
  readonly durability: number;
  readonly maxDurability: number;
  readonly equipped: boolean;
  /** 지금 고치는 중 */
  readonly busy: boolean;
  /** 이 장비를 받는 내 공방(건물 ID)과 그 공방에서의 재료(고치기 전 잃은 양으로 셈) */
  readonly shops: readonly {
    readonly buildingId: number;
    readonly materials: readonly FacilityStackView[];
  }[];
}

/** 설정 칸 N50·M15·N54 실효 값(화면 미리 셈이 @terra/shared/facilityRuntime 함수에 그대로 넘긴다) */
export type FacilityRulesView = FacilityRuntimeRules;

export interface FacilitiesOverviewResponse {
  readonly status: "ready" | "not_ready";
  readonly generatedAt: number;
  readonly rules: FacilityRulesView;
  /** 지을 수 있는 2차맵(서버가 띄운 것) */
  readonly maps: readonly number[];
  readonly catalog: readonly FacilityCatalogView[];
  readonly facilities: readonly FacilityView[];
  readonly beacons: readonly FacilityBeaconView[];
  /** 건설·수리 재료로 쓰는 물자와 내 잔고(모든 자리 합, 10진 글자) */
  readonly materials: readonly {
    readonly item: string;
    readonly name: LocalizedName | null;
    readonly have: string;
  }[];
  readonly units: readonly FacilityUnitView[];
  readonly holdings: readonly FacilityHoldingView[];
  /** 개발 시험 명령(재료 받기·바로 끝내기)을 쓸 수 있나 */
  readonly dev: boolean;
}
