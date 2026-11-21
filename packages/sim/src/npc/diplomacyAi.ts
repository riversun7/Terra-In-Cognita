// 5단계: 7축 외교 호감도 · 자동 의뢰 발행(D-336) · 1차맵 NPC 상단/원정 계획 — docs/adr/2026-11-20-npc-autonomous-ai.md
// 순수 결정적 정수 함수(시뮬·서버 공용, Math.random·Date.now·부동소수 초월함수 미사용).
import type { TraitRegime, UnitTraits } from "@terra/shared/unitTraits";
import type { NpcCoefficients } from "./coefficients.ts";
import { effectiveReservePm } from "./effectiveTraits.ts";

export type DiplomacyStance = "ally" | "trade_partner" | "neutral" | "rival" | "hostile";

export interface DiplomacyRelationInput {
  readonly myTraits: UnitTraits;
  readonly otherTraits: UnitTraits;
  readonly myRegime: TraitRegime;
  readonly otherRegime: TraitRegime;
  /** 누적 교역 기여도(0~500) */
  readonly tradeScore: number;
  /** 과거 전쟁/약탈 악감정(0~600) */
  readonly grievance: number;
  /** 조약·동맹 신뢰도(0~400) */
  readonly trust: number;
  /** 공동의 적 존재 여부 */
  readonly sharedEnemy: boolean;
  /** 현재 교전 중인지 */
  readonly atWar: boolean;
}

export interface DiplomacyAssessment {
  /** 종합 호감도(-1000 ~ +1000) */
  readonly affinity: number;
  readonly stance: DiplomacyStance;
  readonly factors: readonly { readonly key: string; readonly delta: number }[];
}

const clampInt = (v: number, lo: number, hi: number): number => {
  const n = Math.trunc(v);
  return n < lo ? lo : n > hi ? hi : n;
};

/**
 * 두 세력 간 7축 성향·체제·역사 기반 외교 호감도(-1000 ~ +1000)와 태도 판정.
 * - 개방성(openness)이 높고 호전성(belligerence)이 낮을수록 기본 우호도가 높다.
 * - 체제 궁합(같은 체제 +120, 독재↔민주 −120)과 7축 가치관 거리(communalism·greed 차이)를 반영한다.
 */
export function assessDiplomacy(input: DiplomacyRelationInput): DiplomacyAssessment {
  const factors: { key: string; delta: number }[] = [];
  const openAvg = Math.floor((input.myTraits.openness + input.otherTraits.openness) / 2);
  const openDelta = Math.trunc(((openAvg - 500) * 300) / 500);
  if (openDelta !== 0) factors.push({ key: "openness", delta: openDelta });

  const bellAvg = Math.floor((input.myTraits.belligerence + input.otherTraits.belligerence) / 2);
  const bellDelta = -Math.trunc(((bellAvg - 400) * 260) / 600);
  if (bellDelta !== 0) factors.push({ key: "belligerence", delta: bellDelta });

  const regimeDelta =
    input.myRegime === input.otherRegime
      ? 120
      : (input.myRegime === "dictatorship" && input.otherRegime === "democracy") ||
          (input.myRegime === "democracy" && input.otherRegime === "dictatorship")
        ? -120
        : -20;
  factors.push({ key: "regime_fit", delta: regimeDelta });

  // 경제·공동체 가치관 거리(0~1000 차이 → 최대 -150)
  const valueGap = Math.floor(
    (Math.abs(input.myTraits.greed - input.otherTraits.greed) +
      Math.abs(input.myTraits.communalism - input.otherTraits.communalism)) /
      2,
  );
  const valueDelta = 75 - Math.floor((valueGap * 225) / 1000);
  if (valueDelta !== 0) factors.push({ key: "value_alignment", delta: valueDelta });

  const trade = clampInt(input.tradeScore, 0, 500);
  if (trade > 0) factors.push({ key: "trade_history", delta: trade });

  const trust = clampInt(input.trust, 0, 400);
  if (trust > 0) factors.push({ key: "trust", delta: trust });

  const grievance = clampInt(input.grievance, 0, 600);
  if (grievance > 0) factors.push({ key: "grievance", delta: -grievance });

  if (input.sharedEnemy) factors.push({ key: "shared_enemy", delta: 220 });
  if (input.atWar) factors.push({ key: "at_war", delta: -500 });

  let sum = 0;
  for (const f of factors) sum += f.delta;
  const affinity = clampInt(sum, -1000, 1000);

  let stance: DiplomacyStance = "neutral";
  if (input.atWar || affinity <= -400) stance = "hostile";
  else if (affinity <= -150) stance = "rival";
  else if (affinity >= 450 && input.myTraits.openness >= 400) stance = "ally";
  else if (affinity >= 180) stance = "trade_partner";

  return { affinity, stance, factors };
}

/** D-336 NPC 자동 의뢰 종류 */
export type NpcQuestKind =
  | "supply_food"
  | "war_bounty"
  | "restore_ruin"
  | "escort_caravan"
  | "research_data"
  | "patrol_border";

export interface NpcQuestOffer {
  readonly kind: NpcQuestKind;
  readonly priority: number;
  /** 기본 보상 대비 보상 배율(‰, 700~1400) */
  readonly rewardRatePm: number;
}

export interface NpcQuestContext {
  readonly traits: UnitTraits;
  readonly treasury: bigint;
  readonly minQuestBudget: bigint;
  readonly foodPm: number;
  readonly atWar: boolean;
  readonly hasRuin: boolean;
  readonly researchBlocked: boolean;
  readonly hasTradePartner: boolean;
  readonly maxOffers?: number | undefined;
}

/**
 * D-336 NPC 세력 자동 의뢰 발행(결정적 우선순위 정렬).
 * - 이윤욕(greed)이 높으면 보상 배율을 낮추고, 공동체(communalism)·개방성(openness)이 높으면 보상을 후하게 준다.
 */
export function generateNpcQuests(ctx: NpcQuestContext): NpcQuestOffer[] {
  if (ctx.treasury < ctx.minQuestBudget) return [];
  const t = ctx.traits;
  const maxOffers = Math.max(1, ctx.maxOffers ?? 3);

  // 보상 배율(‰): 기본 1000 + 공동체/개방성 보너스 − 이윤욕 절감 (700~1400)
  const rewardRatePm = clampInt(
    1000 + Math.floor((t.communalism * 2 + t.openness * 2 - t.greed * 3) / 10),
    700,
    1400,
  );

  const candidates: NpcQuestOffer[] = [];

  if (ctx.foodPm < 850) {
    const urgency = 850 - clampInt(ctx.foodPm, 0, 850) + Math.floor(t.communalism / 3);
    candidates.push({ kind: "supply_food", priority: 500 + urgency, rewardRatePm });
  }
  if (ctx.atWar) {
    const warPrio = 480 + Math.floor((t.belligerence * 4 + t.boldness * 2) / 10);
    candidates.push({ kind: "war_bounty", priority: warPrio, rewardRatePm });
  }
  if (ctx.hasRuin) {
    const ruinPrio = 320 + Math.floor((t.openness * 3 + t.communalism * 2) / 10);
    candidates.push({ kind: "restore_ruin", priority: ruinPrio, rewardRatePm });
  }
  if (ctx.researchBlocked) {
    const resPrio = 360 + Math.floor((t.openness * 3 + t.discipline * 3) / 10);
    candidates.push({ kind: "research_data", priority: resPrio, rewardRatePm });
  }
  if (ctx.hasTradePartner) {
    const tradePrio = 260 + Math.floor((t.greed * 3 + t.openness * 3) / 10);
    candidates.push({ kind: "escort_caravan", priority: tradePrio, rewardRatePm });
  }
  // 평시 국경 순찰 의뢰(규율성·호전성 기반)
  candidates.push({
    kind: "patrol_border",
    priority: 180 + Math.floor((t.discipline * 3 + t.belligerence * 2) / 10),
    rewardRatePm,
  });

  return candidates
    .toSorted((a, b) => b.priority - a.priority || a.kind.localeCompare(b.kind))
    .slice(0, maxOffers);
}

/** 1차맵 NPC 원정·상단·습격 임무 종류 */
export type PrimaryMapMissionKind = "none" | "caravan" | "expedition" | "raid";

export interface PrimaryMapMissionInput {
  readonly traits: UnitTraits;
  readonly treasury: bigint;
  readonly missionCost: bigint;
  readonly idleGuards: number;
  readonly hasTradeTarget: boolean;
  readonly hasRuinOrFrontier: boolean;
  readonly hasRaidTarget: boolean;
  readonly foodPm: number;
  readonly c: NpcCoefficients;
}

export interface PrimaryMapMissionPlan {
  readonly kind: PrimaryMapMissionKind;
  readonly score: number;
  readonly escortCount: number;
}

/**
 * 1차맵 NPC 상단(caravan)·원정대(expedition)·습격대(raid) 파견 판정.
 * - 생필품 부족(foodPm < 700) 또는 예비금 부족(effectiveReservePm) 시 안전하게 파견하지 않는다.
 */
export function planPrimaryMapMission(input: PrimaryMapMissionInput): PrimaryMapMissionPlan {
  const t = input.traits;
  const reservePm = effectiveReservePm(t.boldness, input.c);
  if (input.foodPm < 700 || input.treasury * 1000n < input.missionCost * BigInt(reservePm)) {
    return { kind: "none", score: 0, escortCount: 0 };
  }

  const candidates: PrimaryMapMissionPlan[] = [{ kind: "none", score: input.c.idleScore, escortCount: 0 }];

  if (input.hasTradeTarget) {
    const score = 200 + Math.floor((t.greed * 4 + t.openness * 4 - t.belligerence * 2) / 10);
    const escorts = Math.min(input.idleGuards, Math.max(1, Math.floor((1000 - t.boldness) / 250) + 1));
    candidates.push({ kind: "caravan", score, escortCount: escorts });
  }

  if (input.hasRuinOrFrontier && input.idleGuards >= 2) {
    const score = 180 + Math.floor((t.boldness * 4 + t.openness * 4 + t.autonomy * 2) / 10);
    const escorts = Math.min(input.idleGuards, Math.max(2, Math.floor(t.discipline / 250) + 2));
    candidates.push({ kind: "expedition", score, escortCount: escorts });
  }

  if (input.hasRaidTarget && input.idleGuards >= 2) {
    const score = 140 + Math.floor((t.belligerence * 5 + t.boldness * 4 - t.communalism * 2) / 10);
    const escorts = Math.min(input.idleGuards, Math.max(2, Math.floor(t.belligerence / 200) + 2));
    candidates.push({ kind: "raid", score, escortCount: escorts });
  }

  let best = candidates[0]!;
  for (const item of candidates) {
    if (item.score > best.score) best = item;
  }
  return best;
}
