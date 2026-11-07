// 사이보그 유닛 융합·유전자 조각 화면 자료(tRPC fusion.overview) — 기획 D-470(휴먼 + 기계 부품 → 사이보그 유닛, 수명 없음·유지비 비쌈),
// D-478·D-481(유전자 조각: 사망 때 그 종의 조각, 한 번 쓰면 사라짐), 49 N46·N47, docs/adr/2026-11-07-cyborg-fusion-genes.md.
// 바꾸는 명령은 WebSocket cyborg_fuse·unit_rebirth·dev_grant_goods(프로토콜 9)다. 화폐는 최소 단위 10진 문자열이다.
// 1차 스탯 배열 차례는 STR·DEX·AGI·VIT·INT·WIS(사이보그·구인 휴먼과 같다).
import type { LocalizedName } from "./roster.ts";

/** 1차 스탯 배열 차례(STR·DEX·AGI·VIT·INT·WIS) */
export const FUSION_STAT_ORDER = ["str", "dex", "agi", "vit", "int", "wis"] as const;

/** 재료 한 줄(쌓이는 물자, 내 장부 잔고) */
export interface FusionMaterialView {
  readonly item: string;
  readonly name: LocalizedName;
  readonly qty: number;
  readonly have: string;
}

/** 내 휴먼 하나(구인으로 고용한 휴먼) */
export interface FusionHumanView {
  readonly unitId: number;
  readonly level: number;
  readonly rebirths: number;
  readonly stats: readonly number[];
  /** 융합하면 나올 스탯 범위(보너스 최소·최대) */
  readonly fused: { readonly min: readonly number[]; readonly max: readonly number[] };
  /** 수명이 끝나는 시각(실제 시간 ms) */
  readonly lifespanEndsAtMs: number;
  /** 잡힌 유닛(포로)이면 참 — 융합·환생 못 함 */
  readonly captive: boolean;
  /** 유전자 환생에 드는 조각 수(max(최소, ⌈레벨 ÷ 나눗수⌉)) */
  readonly rebirthShards: number;
}

/** 내 사이보그 유닛 하나(융합으로 만든 것) */
export interface FusionCyborgUnitView {
  readonly unitId: number;
  readonly level: number;
  readonly stats: readonly number[];
  readonly bonusPm: number;
  readonly fusedAtMs: number;
  /** 바탕이 된 휴먼의 스탯 */
  readonly humanStats: readonly number[];
  /** 부품 쪽: parts = 기계 부품(지금은 이것만), android = 안드로이드 유닛 */
  readonly donor: "parts" | "android";
}

/** 가진 유전자 조각 한 종 */
export interface FusionGeneView {
  readonly item: string;
  readonly name: LocalizedName;
  readonly kind: "stat" | "skill";
  /** 종(팩 unit_kinds ID) */
  readonly species: string;
  /** 얻는 길(데이터) */
  readonly drops: readonly string[];
  readonly qty: string;
}

export interface FusionRulesView {
  /** 융합 화폐(시험 화폐 최소 단위) */
  readonly currency: string;
  readonly materials: readonly FusionMaterialView[];
  /** 부품 쪽 스탯(안드로이드 대신 기계 부품) */
  readonly donorStats: readonly number[];
  readonly physicalDonorPm: number;
  readonly mentalHumanPm: number;
  readonly bonusMinPm: number;
  readonly bonusMaxPm: number;
  /** 사이보그 유닛 유지비 배율(‰, 보통 유닛 1000) */
  readonly upkeepPm: number;
  /** [임시] 만드는 곳(팩 시설 ID, 아직 시설 배치를 보지 않는다) */
  readonly facility: string;
  /** 환생 조각: 레벨 나눗수·최소·조각 1개의 스탯 + */
  readonly geneLevelDivisor: number;
  readonly geneMin: number;
  readonly genePoints: number;
}

export interface FusionOverviewResponse {
  readonly status: "ready" | "not_ready";
  /** 사이보그가 있는가(유닛 소유자 = 사이보그, D-469) */
  readonly hasCyborg: boolean;
  /** 내 시험 화폐 잔고(최소 단위) */
  readonly balance: string;
  readonly rules: FusionRulesView;
  readonly humans: readonly FusionHumanView[];
  readonly cyborgUnits: readonly FusionCyborgUnitView[];
  readonly genes: readonly FusionGeneView[];
  /** 개발 시험 물자 받기를 쓸 수 있는가(dev·admin) */
  readonly devGrant: boolean;
  readonly generatedAt: number;
}
