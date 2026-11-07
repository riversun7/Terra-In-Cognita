// 정원 세력 관계도 — docs/adr/2026-11-01-gardener-r5b.md "바뀜 (2026-11-07, 정원사 2)", 기획 49 N52, D-499·D-500·D-509·D-510
// 정원 세력은 세력마다 관계도(친화도) 하나를 둔다. 눈금은 옛 NPC 외교 우호도(옛 ai/NpcDiplomacyAI.js): −100~+100, 시작 0,
// 단계 = 동맹 70 이상 · 우호 30 이상 · 중립 −20 이상 · 경계 −50 이상 · 그 아래 적대(D-510).
// 하루 바뀜(D-510 "세력 오염이 쌓이면 내려가고 정화·평화로 올라간다"): 세력 오염 걸음마다 −1(하루 상한), 전쟁이 없는 날 +, 정화 한 번 +.
// 필수 NPC 세력(고정 국가)만 양수까지 오른다(D-500 "필수 NPC 세력은 관계도가 양수가 될 수 있고 협력도 가능"). 다른 세력의 상한은 설정 칸.
// 관계도 단계는 그 세력 도시의 웨이브 확률 배율을 정한다(동맹 = 웨이브 없음). 순수 정수 함수(판정 코드).
import type { GardenerCoefficients } from "./coefficients.ts";

export const RELATION_STAGES = ["allied", "friendly", "neutral", "wary", "hostile"] as const;
export type RelationStage = (typeof RELATION_STAGES)[number];

type RelationRules = Pick<
  GardenerCoefficients,
  | "relationMin"
  | "relationMax"
  | "relationStart"
  | "relationAllied"
  | "relationFriendly"
  | "relationNeutral"
  | "relationWary"
  | "relationOthersMax"
  | "relationPollutionStep"
  | "relationDropMax"
  | "relationPeaceDaily"
  | "relationPurifyGain"
  | "stageChancePm"
>;

/** 관계도 → 단계(문턱 이상이면 그 단계) */
export function relationStage(value: number, c: RelationRules): RelationStage {
  if (value >= c.relationAllied) return "allied";
  if (value >= c.relationFriendly) return "friendly";
  if (value >= c.relationNeutral) return "neutral";
  if (value >= c.relationWary) return "wary";
  return "hostile";
}

/** 그 세력이 오를 수 있는 관계도 상한(필수 NPC 세력 = 범위 상한, 나머지 = min(범위 상한, relationOthersMax)) */
export function relationCap(fixed: boolean, c: RelationRules): number {
  return fixed ? c.relationMax : Math.min(c.relationMax, c.relationOthersMax);
}

/** 관계도를 범위·상한 안으로 */
export function clampRelation(value: number, fixed: boolean, c: RelationRules): number {
  return Math.max(c.relationMin, Math.min(relationCap(fixed, c), Math.trunc(value)));
}

/**
 * 하루 바뀜 뒤 관계도: 지난 값 − min(하루 상한, ⌊세력 오염 ÷ 걸음⌋) + (전쟁이 없으면 평화 몫), 범위·상한 안으로.
 * 세력 오염 = 그 세력 도시 영향권 칸 오염의 합(D-509·D-511 기술 해석)
 */
export function nextRelation(
  value: number,
  factionPollution: number,
  atPeace: boolean,
  fixed: boolean,
  c: RelationRules,
): number {
  const drop = Math.min(
    Math.max(0, c.relationDropMax),
    Math.floor(Math.max(0, factionPollution) / Math.max(1, c.relationPollutionStep)),
  );
  return clampRelation(value - drop + (atPeace ? Math.max(0, c.relationPeaceDaily) : 0), fixed, c);
}

/** 그 단계의 도시 웨이브 확률 배율(‰). 칸이 없으면 1000(그대로) */
export function stageChancePm(stage: RelationStage, c: RelationRules): number {
  return Math.max(0, c.stageChancePm[RELATION_STAGES.indexOf(stage)] ?? 1000);
}

/** 도시 웨이브 확률(‰)에 관계도 단계 배율을 곱한다(내림, 1000 상한) */
export function relationChancePm(chancePm: number, stage: RelationStage, c: RelationRules): number {
  return Math.min(1000, Math.floor((Math.max(0, chancePm) * stageChancePm(stage, c)) / 1000));
}
