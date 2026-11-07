// NPC 판단 틀 — docs/adr/2026-11-01-npc-brain-r5.md 3절, 기획 D-323(46 §9.1)
// 상태 지표(FactionView·RivalView) → 행동 후보마다 점수(성향 가중, 정수) → 가장 높은 행동 하나. 같은 점수는 굴림으로 고른다.
// 순수 함수다: 입력은 평범한 값이고 세계를 바꾸지 않는다. 부르는 쪽(시뮬레이터 npcRun·서버)이 지표를 만들고 행동을 실행한다.
// 결과(점령·반란·기술 등)는 규칙이 정한다. 여기서는 "무엇을 해 볼지"만 고른다.
// 폐허 복원(기획 답 484 다, docs/adr/2026-11-07-ruins-restoration.md "바뀜 (기획 답 480~489)"): 부르는 쪽이 고른 후보(정부 짓기·내 사업에
// 넣기·남의 열린 모금에 투자)마다 점수(상업 성향 + 확장 — 성향 축에 확장이 없어 도시가 적을수록, 옛 내 도시면 더)를 매겨 가장 좋은 하나를 낸다.
import type { NpcCoefficients } from "./coefficients.ts";
import type { Traits } from "./traits.ts";

/** 판단하는 세력의 지표 */
export interface FactionView {
  readonly id: number;
  readonly traits: Traits;
  readonly cities: number;
  /** 힘 = 휴먼 수 */
  readonly strength: number;
  /** 국고(그 나라 화폐 최소 단위) */
  readonly treasury: bigint;
  /** 휴먼 평균 만족도(0~100) */
  readonly satisfaction: number;
  /** 가장 모자란 도시의 생필품 충족(‰) */
  readonly foodPm: number;
  /** 주거가 꽉 찬 도시가 있다(마을을 세울 사람이 있다) */
  readonly crowded: boolean;
  /** 마을 세우는 값 */
  readonly foundCost: bigint;
  /** 연구 시설을 올릴 도시가 있으면 그 값과 다음 기술 단계가 연구 시설에 막혔는지 */
  readonly research: { readonly cost: bigint; readonly blocked: boolean } | null;
  /** 팔 수 있는 도시 지분이 있다 */
  readonly sellableShares: boolean;
  /** 국고가 모자라다(부르는 쪽이 정한다: 짓는 값보다 적음 등) */
  readonly poor: boolean;
  /** 상위 세력(봉신 관계) */
  readonly overlord: { readonly id: number; readonly strength: number } | null;
  /** 내 봉신 수 */
  readonly vassals: number;
  /** 폐허 복원 후보(부르는 쪽이 규칙으로 고른 것, 폐허 ID 차례). 없으면 빈 목록 */
  readonly restores: readonly RestoreView[];
}

/**
 * 폐허 복원 후보 하나(484 다). claim = 주인 없는 폐허에 정부 짓기(cost = 정부 짓기 값), fund = 내 복원 사업에 넣기, invest = 남의 열린 모금에
 * 넣기(cost = 넣을 값). former = 내가 옛 주인인 폐허
 */
export interface RestoreView {
  readonly ruin: number;
  readonly mode: "claim" | "fund" | "invest";
  readonly cost: bigint;
  readonly former: boolean;
}

/** 다른 살아 있는 세력 하나(판단하는 세력이 본 모습) */
export interface RivalView {
  readonly id: number;
  readonly strength: number;
  /** 칠 수 있는 도시 수(시작 도시 제외, D-341) */
  readonly takeable: number;
  readonly atWar: boolean;
  /** 불가침 중(강화 조약) */
  readonly truce: boolean;
  /** 상하 관계(봉신·상위). 같은 세력이라 치지 않는다(D-250) */
  readonly related: boolean;
  /** 나에게서 반란으로 떨어져 나간 세력(정부는 소탕한다, 46 §2.4 — 강화하지 않고 친다) */
  readonly rebel: boolean;
}

export type NpcAction =
  | { readonly kind: "idle" }
  | { readonly kind: "attack"; readonly target: number; readonly declare: boolean }
  | { readonly kind: "found" }
  | { readonly kind: "research" }
  | { readonly kind: "sell_shares" }
  | { readonly kind: "peace"; readonly target: number }
  | { readonly kind: "break_vassal" }
  | { readonly kind: "restore"; readonly ruin: number; readonly mode: RestoreView["mode"] };

export interface ScoredAction {
  readonly action: NpcAction;
  readonly score: number;
}

/** 이 만족도 아래면 지친 백성(강화 쪽으로 기운다). 민심 표 반란 예고(N35 50)와 같은 크기 */
const WEARY_SATISFACTION = 50;
/** 생필품이 이만큼(‰) 모자라면 전쟁을 벌이지 않는다 */
const HUNGRY_FOOD_PM = 500;

const needs = (treasury: bigint, cost: bigint, c: NpcCoefficients): boolean =>
  treasury * 1000n >= cost * BigInt(c.reservePm);

/** 이 세력이 상대보다 충분히 센가(공격 힘 비) */
const dominates = (strength: number, other: number, c: NpcCoefficients): boolean =>
  strength * 1000 >= other * c.attackRatioPm;

/** 치기 점수(상대 하나). 칠 수 없으면 undefined */
function attackScore(me: FactionView, r: RivalView, c: NpcCoefficients): number | undefined {
  if (r.related || r.truce || r.takeable <= 0 || !dominates(me.strength, r.strength, c)) return undefined;
  const advantagePm = Math.floor(((me.strength - r.strength) * 1000) / Math.max(1, me.strength));
  let score = Math.floor((me.traits.aggression * advantagePm) / 1000);
  // 반란 세력 소탕(46 §2.4)은 바깥 전쟁이 아니다: 선포 몫·넓은 나라 몫·지친 백성 몫을 빼지 않는다
  if (r.rebel) return score + c.suppressBonus + (r.atWar ? c.attackWarBonus : 0);
  score += r.atWar ? c.attackWarBonus : -c.attackDeclarePenalty;
  score -= Math.max(0, me.cities - c.attackComfortCities) * c.attackCityPenalty;
  // 새 전쟁은 백성이 지쳤거나 굶으면 벌이지 않는다. 이미 하는 전쟁은 그대로 잇는다
  if (!r.atWar && me.satisfaction < c.attackMinSatisfaction) score -= 1000;
  if (!r.atWar && me.foodPm < HUNGRY_FOOD_PM) score -= 300;
  return score;
}

/** 강화 점수의 공통 몫(제안하는 쪽·받는 쪽이 같은 식을 쓴다) */
function peaceBase(me: FactionView, r: RivalView, c: NpcCoefficients): number {
  let score = Math.floor((1000 - me.traits.aggression) / 2);
  if (me.satisfaction < WEARY_SATISFACTION) score += c.peaceWearyScore;
  if (r.strength > me.strength) score += c.peaceWeakerScore;
  if (dominates(me.strength, r.strength, c))
    score -= Math.floor((c.peaceWinningPenalty * me.traits.aggression) / 1000);
  return score;
}

/** 폐허 복원 점수(후보 하나). 정부 짓기는 국고에 예비금이 있을 때만(undefined = 후보 아님) */
function restoreScore(me: FactionView, r: RestoreView, c: NpcCoefficients): number | undefined {
  const commerce = Math.floor(me.traits.commerce / 4);
  if (r.mode === "fund") return c.restoreFundScore + commerce;
  if (r.mode === "invest") return c.restoreInvestScore + commerce;
  if (!needs(me.treasury, r.cost, c)) return undefined;
  return (
    c.restoreClaimScore + commerce + (r.former ? c.restoreFormerBonus : 0) - me.cities * c.restoreCityPenalty
  );
}

/** 모든 후보와 점수(차례: 쉬기, 치기(상대 ID 차례), 마을, 연구, 지분, 강화(상대 ID 차례), 봉신 독립, 폐허 복원) */
export function scoreActions(
  me: FactionView,
  rivals: readonly RivalView[],
  c: NpcCoefficients,
): ScoredAction[] {
  const out: ScoredAction[] = [{ action: { kind: "idle" }, score: c.idleScore }];
  const sorted = rivals.toSorted((a, b) => a.id - b.id);
  // 치기: 상대마다가 아니라 가장 좋은 상대 하나만 후보로(같은 점수면 작은 ID)
  let best: { r: RivalView; score: number } | undefined;
  for (const r of sorted) {
    const score = attackScore(me, r, c);
    if (score !== undefined && (!best || score > best.score)) best = { r, score };
  }
  if (best)
    out.push({ action: { kind: "attack", target: best.r.id, declare: !best.r.atWar }, score: best.score });
  // 마을은 생필품이 넉넉할 때만 세운다(굶는 마을은 곧 반란이다)
  if (me.crowded && me.foodPm >= 1000 && needs(me.treasury, me.foundCost, c))
    out.push({
      action: { kind: "found" },
      score: c.foundScore + Math.floor((1000 - me.traits.aggression) / 4) - me.vassals * c.foundVassalPenalty,
    });
  if (me.research && needs(me.treasury, me.research.cost, c))
    out.push({
      action: { kind: "research" },
      score:
        (me.research.blocked ? c.researchBlockedScore : c.researchScore) +
        Math.floor((me.traits.commerce + me.traits.faith) / 8),
    });
  if (me.poor && me.sellableShares)
    out.push({
      action: { kind: "sell_shares" },
      score: c.shareSaleScore + Math.floor(me.traits.commerce / 4),
    });
  let peace: { r: RivalView; score: number } | undefined;
  for (const r of sorted) {
    // 반란 세력과는 강화하지 않는다(소탕, 46 §2.4). 교전이 없으면 백지 강화로 끝난다(S5)
    if (!r.atWar || r.rebel) continue;
    const score = peaceBase(me, r, c);
    if (!peace || score > peace.score) peace = { r, score };
  }
  if (peace) out.push({ action: { kind: "peace", target: peace.r.id }, score: peace.score });
  if (me.overlord && me.strength * 1000 >= me.overlord.strength * c.breakRatioPm)
    out.push({ action: { kind: "break_vassal" }, score: Math.floor(me.traits.aggression / 2) + 100 });
  // 폐허 복원: 후보 가운데 가장 좋은 하나만(같은 점수면 목록 앞 = 작은 폐허 ID)
  let restore: { r: RestoreView; score: number } | undefined;
  for (const r of me.restores) {
    const score = restoreScore(me, r, c);
    if (score !== undefined && (!restore || score > restore.score)) restore = { r, score };
  }
  if (restore)
    out.push({
      action: { kind: "restore", ruin: restore.r.ruin, mode: restore.r.mode },
      score: restore.score,
    });
  return out;
}

/** 가장 높은 점수의 행동. 같은 점수가 여럿이면 roll(0 이상 정수)로 고른다(목록 차례) */
export function chooseAction(scored: readonly ScoredAction[], roll: number): NpcAction {
  let top = Number.NEGATIVE_INFINITY;
  for (const entry of scored) top = Math.max(top, entry.score);
  const ties = scored.filter((entry) => entry.score === top);
  return ties[roll % Math.max(1, ties.length)]?.action ?? { kind: "idle" };
}

export function decideAction(
  me: FactionView,
  rivals: readonly RivalView[],
  roll: number,
  c: NpcCoefficients,
): NpcAction {
  return chooseAction(scoreActions(me, rivals, c), roll);
}

/** 강화를 받는 쪽의 점수(> 0이면 받는다, 질문 195 가). proposer = 받는 쪽이 본 제안자 */
export function peaceScore(me: FactionView, proposer: RivalView, c: NpcCoefficients): number {
  return peaceBase(me, proposer, c) - c.peaceAcceptBase;
}
