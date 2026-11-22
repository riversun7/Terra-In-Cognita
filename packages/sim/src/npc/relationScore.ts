// NPC 관계 점수 몫(줄기 npc-diplo — 기획 D-255 "관계 점수: 호감·신뢰. NPC의 판단과 화면 표시에 쓴다", "NPC 외교 AI는 점수로 판단한다(P0)", 질문 2663).
// 세력 쌍 호감(−100~100 — 서버 diplomacy/affinity.ts)과 상대의 세력 신뢰(−100~100 — 서버 diplomacy/breaches.ts, 위반 기록에서 셈)를 NPC 판단 점수에 더하는 몫.
// - 새 선전포고(brain.ts attackScore — 전쟁 중이 아닌 상대, 반란 소탕은 빼고): 몫을 뺀다 → 호감·신뢰가 낮을수록 선포 쪽, 높을수록 덜 친다.
// - 강화(brain.ts peaceBase — 제안하는 쪽·받는 쪽 같은 식, 서버 의결 강화·휴전 조약 답도 같은 peaceScore): 몫을 더한다 → 높을수록 강화 쪽.
// - 참전 요청 답(서버 diplomacy/service.ts — NPC가 이끄는 참가국): 요청한 나라와의 호감·그 나라 신뢰로 힘 비 문턱(‰)을 옮긴다(npcJoinsWarScored) → 높을수록 약해도 든다.
// 몫 = ⌊호감 × 호감 가중 ÷ 100⌋ + ⌊신뢰 × 신뢰 가중 ÷ 100⌋(0 쪽 자름). 가중치는 설정 칸(npc_relation_* — 기술 출발값 [임시], D-584 — 모양은 질문 2721).
// 값이 없으면 0(중립) → 몫 0. 시뮬은 호감·신뢰를 모형으로 들지 않아(고리 SimHooks.relationOf를 붙이지 않음) 판정이 그대로다(SIM_VERSION 그대로).
// 정수 연산만 쓴다(판정 코드 — 결정적).
import type { NpcCoefficients } from "./coefficients.ts";

/** 관계 점수 범위(서버 호감·세력 신뢰와 같다) */
const RELATION_MIN = -100;
const RELATION_MAX = 100;

/** 관계 몫이 보는 값(없으면 0 = 중립) */
export interface RelationInput {
  readonly affinity?: number | undefined;
  readonly trust?: number | undefined;
}

type RelationWeights = Pick<
  NpcCoefficients,
  | "relationWarAffinity"
  | "relationWarTrust"
  | "relationPeaceAffinity"
  | "relationPeaceTrust"
  | "relationJoinAffinityPm"
  | "relationJoinTrustPm"
>;

const clampRelation = (value: number | undefined): number =>
  Math.max(RELATION_MIN, Math.min(RELATION_MAX, Math.trunc(value ?? 0)));
const weight = (value: number | undefined): number => Math.max(0, Math.trunc(value ?? 0));

/** 몫 하나: 호감 × 호감 가중 ÷ 100 + 신뢰 × 신뢰 가중 ÷ 100(각각 0 쪽 자름) */
export function relationTerm(
  r: RelationInput,
  affinityWeight: number | undefined,
  trustWeight: number | undefined,
): number {
  return (
    Math.trunc((clampRelation(r.affinity) * weight(affinityWeight)) / 100) +
    Math.trunc((clampRelation(r.trust) * weight(trustWeight)) / 100)
  );
}

/** 새 선포 치기 점수에 더하는 몫(호감·신뢰가 낮으면 +, 높으면 −) */
export function warRelationOffset(r: RelationInput, c: RelationWeights): number {
  return 0 - relationTerm(r, c.relationWarAffinity, c.relationWarTrust);
}

/** 강화 점수에 더하는 몫(호감·신뢰가 높으면 +, 낮으면 −) */
export function peaceRelationOffset(r: RelationInput, c: RelationWeights): number {
  return relationTerm(r, c.relationPeaceAffinity, c.relationPeaceTrust);
}

/** 참전 힘 비 문턱(‰): 1000 − 관계 몫(‰, 0 아래로 내려가지 않음). 내 힘 × 1000 ≥ 적 힘 × 이 값이면 든다 */
export function joinRatioPm(r: RelationInput, c: RelationWeights): number {
  return Math.max(0, 1000 - relationTerm(r, c.relationJoinAffinityPm, c.relationJoinTrustPm));
}

/**
 * NPC가 이끄는 나라가 참전 요청을 받는가(서버 diplomacy/clauses.ts npcJoinsWar가 부른다): 힘 비가 문턱 이상. r = 요청한 나라와의 호감·요청한 나라의 신뢰.
 * 중립(0·0)이면 옛 규칙(힘이 적 이상) 그대로 [임시 2556]
 */
export function npcJoinsWarScored(
  myStrength: number,
  enemyStrength: number,
  r: RelationInput,
  c: RelationWeights,
): boolean {
  return myStrength * 1000 >= enemyStrength * joinRatioPm(r, c);
}
