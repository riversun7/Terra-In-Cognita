// 사이보그 유닛 융합·유전자 화면 자료(tRPC fusion.overview) — 기획 D-470(휴먼 + 기계 부품 → 사이보그 유닛, 수명 없음·유지비 비쌈),
// D-478·D-481·D-516(유전자: 수명이 다한 휴먼·크리쳐에서 남는 인스턴스 — 스탯 유전자 = 총합·분포·속성, 스킬 유전자 = 스킬 하나, 합성은
// 확률로 오름·내림·그대로, 인큐베이터는 총합 또는 주력 스탯 적용), 49 N46·N47, docs/adr/2026-11-07-cyborg-fusion-genes.md.
// 바꾸는 명령은 WebSocket cyborg_fuse·dev_grant_goods(프로토콜 9)·gene_*·dev_grant_gene·dev_expire_unit(프로토콜 11)이다.
// 화폐는 최소 단위 10진 문자열이다. 1차 스탯 배열 차례는 STR·DEX·AGI·VIT·INT·WIS(사이보그·구인 휴먼과 같다), 속성은 ELEMENT_IDS 차례.
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

/** 내 휴먼 하나(구인으로 고용했거나 인큐베이터로 태어난 휴먼) */
export interface FusionHumanView {
  readonly unitId: number;
  readonly level: number;
  readonly rebirths: number;
  readonly stats: readonly number[];
  /** 융합하면 나올 스탯 범위(보너스 최소·최대) */
  readonly fused: { readonly min: readonly number[]; readonly max: readonly number[] };
  /** 수명이 끝나는 시각(실제 시간 ms). 지나면 서버가 1분 안에 수명이 다한 처리를 한다(유전자가 남고 떠남) */
  readonly lifespanEndsAtMs: number;
  /** 잡힌 유닛(포로)이면 참 — 융합·주입 못 함 */
  readonly captive: boolean;
  /** 배운 스킬(스킬 유전자 주입, 스킬 ID 차례) */
  readonly skills: readonly { readonly id: string; readonly name: LocalizedName | null }[];
  /** 스킬 칸 수(유닛 종류 스킬 칸 규칙) */
  readonly skillSlots: number;
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

/** 내 유전자 하나(보유 물건 인스턴스, D-516) */
export interface FusionGeneView {
  /** 보유 물건 ID(합성·주입·인큐베이터 명령에 보낸다) */
  readonly id: number;
  readonly item: string;
  readonly name: LocalizedName;
  readonly kind: "stat" | "skill";
  /** 종(팩 unit_kinds ID — 377 나: 유닛 종류마다) */
  readonly species: string;
  /** 스탯 유전자: 총합, 분포(‰ 6칸, 합 1000), 칸마다 값(총합 × 분포), 주력 칸(0~5), 속성 12칸. 스킬 유전자면 null */
  readonly total: number | null;
  readonly dist: readonly number[] | null;
  readonly stats: readonly number[] | null;
  readonly main: number | null;
  readonly elements: readonly number[] | null;
  /** 합성 세대(수명에서 나온 것 0) */
  readonly generation: number;
  /** 스킬 유전자: 스킬 ID·이름. 스탯 유전자면 null */
  readonly skill: string | null;
  readonly skillName: LocalizedName | null;
  /** 남긴 유닛과 그 레벨(합성·개발 시험이면 null) */
  readonly fromUnit: number | null;
  readonly level: number | null;
  /** [임시] 든 유닛(지금은 사이보그 본체 — 창고 자리는 질문 361) */
  readonly unit: number | null;
  readonly createdAt: number;
}

/** 유전자 규칙(설정 칸 N47 [임시]) */
export interface GeneRulesView {
  /** 합성: 총합이 오를·내릴·그대로일 확률(‰), 오르내리는 양(바탕 총합의 ‰), 총합 상한, 속성 오차(± 점) */
  readonly upPm: number;
  readonly downPm: number;
  readonly keepPm: number;
  readonly stepPm: number;
  readonly totalMax: number;
  readonly elementVariance: number;
  /** 인큐베이터 휴먼의 바탕 1차 스탯(칸마다) */
  readonly incubateBase: number;
  /** [임시] 인큐베이터·주입 시설(팩에 아직 없다 — 시설을 보지 않는다) */
  readonly facility: string | null;
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
  readonly genes: GeneRulesView;
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
  /** 내 유전자(보유 물건 ID 차례) */
  readonly genes: readonly FusionGeneView[];
  /** 개발 시험(물자·유전자 받기, 수명 끝내기)을 쓸 수 있는가(dev·admin) */
  readonly devGrant: boolean;
  readonly generatedAt: number;
}
