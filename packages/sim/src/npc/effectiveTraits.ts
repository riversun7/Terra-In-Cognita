// 7축 성향 분산 판단·점수 분해·규칙식 — docs/adr/2026-11-20-npc-autonomous-ai.md
// 기존 4축(commerce 13곳 편중, station 0곳 미사용)을 7축 양극 스펙트럼으로 분산해
// 한 콘텐츠가 2~3개 축의 조합과 맞바꿈으로 결정되도록 한다. 순수 정수 함수(시뮬·서버·에디터 실험실 공용).
import { type AiTactics, presetTactics } from "@terra/shared/aiTactics";
import {
  type LoyaltyUnitKind,
  type TraitRegime,
  type UnitTraits,
  blendCityTraits,
  blendFactionTraits,
  blendHouseTraits,
  blendTacticsByLoyalty,
  loyaltyOverridePm,
  tacticsFromUnitTraits,
  upgradeLegacyTraits,
} from "@terra/shared/unitTraits";
import type { Regime } from "../society/shares.ts";
import type { WarCoefficients, WarOutcome } from "../society/warOutcomes.ts";
import { type NpcAiCoefficients, blendRulesFromAi, loyaltyRulesFromAi } from "./aiCoefficients.ts";
import type { FactionView, NpcAction, RestoreView, RivalView, ScoredAction } from "./brain.ts";
import type { NpcCoefficients } from "./coefficients.ts";
import type { FoundingChoice, OccupationChoice, TradePolicy } from "./policy.ts";
import type { Traits } from "./traits.ts";

/** 행동 후보 하나의 점수 분해(에디터 AI 판단 실험실 시각화용) */
export interface ExplainedAction extends ScoredAction {
  readonly factors: readonly { readonly key: string; readonly delta: number }[];
}

/** 7축 실효 성향을 사용하는 세력 지표(기존 FactionView 확장) */
export interface FactionView7 extends Omit<FactionView, "traits"> {
  readonly traits: UnitTraits;
}

const WEARY_SATISFACTION = 50;
const HUNGRY_FOOD_PM = 500;

/**
 * boldness(과감성)에 따라 예비금 배율을 조절한다:
 * boldness 500 = 기존 reservePm 그대로, 1000 = reservePm × 75%, 0 = reservePm × 125%
 */
export function effectiveReservePm(boldness: number, c: NpcCoefficients): number {
  const shiftPm = Math.trunc(((500 - boldness) * 250) / 500);
  return Math.max(1000, Math.floor((c.reservePm * (1000 + shiftPm)) / 1000));
}

const hasReserve7 = (treasury: bigint, cost: bigint, boldness: number, c: NpcCoefficients): boolean =>
  treasury * 1000n >= cost * BigInt(effectiveReservePm(boldness, c));

/**
 * boldness(과감성)에 따라 공격 최소 힘 비 문턱을 조절한다:
 * boldness 1000 = 문턱 × 85%(과감), 0 = 문턱 × 115%(신중)
 */
export function effectiveAttackRatioPm(boldness: number, c: NpcCoefficients): number {
  const shiftPm = Math.trunc(((500 - boldness) * 150) / 500);
  return Math.max(500, Math.floor((c.attackRatioPm * (1000 + shiftPm)) / 1000));
}

const dominates7 = (strength: number, other: number, boldness: number, c: NpcCoefficients): boolean =>
  strength * 1000 >= other * effectiveAttackRatioPm(boldness, c);

/**
 * 7축 분산 행동 점수 + 요인 분해(ADR 2026-11-20 1절 콘텐츠 × 성향 매트릭스):
 * - 치기: belligerence(주) + boldness(문턱·가산) + autonomy(반란 소탕)
 * - 마을 세우기: boldness(예비금) + openness(확장) − belligerence
 * - 연구 시설: openness(주) + discipline(계획) + (1000 − communalism)(실리)
 * - 지분 매각: greed(주) + boldness(예비금)
 * - 강화 제안: (1000 − belligerence)(주) + communalism(민심 보호)
 * - 봉신 독립: autonomy(주) + boldness(과감) (기존 aggression 대신 autonomy 분리!)
 * - 폐허 복원: openness(주) + boldness(예비금) + greed(보조)
 */
export function explainActions7(
  me: FactionView7,
  rivals: readonly RivalView[],
  c: NpcCoefficients,
): ExplainedAction[] {
  const t = me.traits;
  const out: ExplainedAction[] = [
    { action: { kind: "idle" }, score: c.idleScore, factors: [{ key: "idle_base", delta: c.idleScore }] },
  ];
  const sorted = rivals.toSorted((a, b) => a.id - b.id);

  // 1. 치기(belligerence + boldness + autonomy)
  let bestAtk: { r: RivalView; score: number; factors: { key: string; delta: number }[] } | undefined;
  for (const r of sorted) {
    if (r.related || r.truce || r.takeable <= 0 || !dominates7(me.strength, r.strength, t.boldness, c))
      continue;
    const advPm = Math.floor(((me.strength - r.strength) * 1000) / Math.max(1, me.strength));
    const factors: { key: string; delta: number }[] = [];
    const base = Math.floor((t.belligerence * advPm) / 1000);
    factors.push({ key: "belligerence_adv", delta: base });
    const boldBonus = Math.trunc(((t.boldness - 500) * 120) / 500);
    if (boldBonus !== 0) factors.push({ key: "boldness", delta: boldBonus });
    let score = base + boldBonus;
    if (r.rebel) {
      const sup = c.suppressBonus + Math.floor(t.autonomy / 8);
      factors.push({ key: "suppress_rebel", delta: sup });
      score += sup;
      if (r.atWar) {
        factors.push({ key: "at_war", delta: c.attackWarBonus });
        score += c.attackWarBonus;
      }
    } else {
      const warDelta = r.atWar ? c.attackWarBonus : -c.attackDeclarePenalty;
      factors.push({ key: r.atWar ? "at_war" : "declare_penalty", delta: warDelta });
      score += warDelta;
      const cityPen = Math.max(0, me.cities - c.attackComfortCities) * c.attackCityPenalty;
      if (cityPen > 0) {
        factors.push({ key: "city_comfort_penalty", delta: -cityPen });
        score -= cityPen;
      }
      if (!r.atWar && me.satisfaction < c.attackMinSatisfaction) {
        factors.push({ key: "low_satisfaction", delta: -1000 });
        score -= 1000;
      }
      if (!r.atWar && me.foodPm < HUNGRY_FOOD_PM) {
        factors.push({ key: "low_food", delta: -300 });
        score -= 300;
      }
    }
    if (!bestAtk || score > bestAtk.score) bestAtk = { r, score, factors };
  }
  if (bestAtk) {
    out.push({
      action: { kind: "attack", target: bestAtk.r.id, declare: !bestAtk.r.atWar },
      score: bestAtk.score,
      factors: bestAtk.factors,
    });
  }

  // 2. 마을 세우기(openness + boldness 예비금 − belligerence)
  if (me.crowded && me.foodPm >= 1000 && hasReserve7(me.treasury, me.foundCost, t.boldness, c)) {
    const peacePart = Math.floor((1000 - t.belligerence) / 6);
    const openPart = Math.floor(t.openness / 6);
    const vassalPen = me.vassals * c.foundVassalPenalty;
    const factors = [
      { key: "found_base", delta: c.foundScore },
      { key: "peaceful_tilt", delta: peacePart },
      { key: "openness", delta: openPart },
      ...(vassalPen > 0 ? [{ key: "vassal_penalty", delta: -vassalPen }] : []),
    ];
    out.push({
      action: { kind: "found" },
      score: c.foundScore + peacePart + openPart - vassalPen,
      factors,
    });
  }

  // 3. 연구 시설(openness + discipline + 세속/실리(1000 − communalism))
  if (me.research && hasReserve7(me.treasury, me.research.cost, t.boldness, c)) {
    const base = me.research.blocked ? c.researchBlockedScore : c.researchScore;
    const openPart = Math.floor(t.openness / 8);
    const discPart = Math.floor(t.discipline / 10);
    const secularPart = Math.floor((1000 - t.communalism) / 16);
    out.push({
      action: { kind: "research" },
      score: base + openPart + discPart + secularPart,
      factors: [
        { key: me.research.blocked ? "research_blocked" : "research_base", delta: base },
        { key: "openness", delta: openPart },
        { key: "discipline", delta: discPart },
        { key: "secular_tilt", delta: secularPart },
      ],
    });
  }

  // 4. 지분 매각(greed)
  if (me.poor && me.sellableShares) {
    const greedPart = Math.floor(t.greed / 4);
    out.push({
      action: { kind: "sell_shares" },
      score: c.shareSaleScore + greedPart,
      factors: [
        { key: "share_sale_base", delta: c.shareSaleScore },
        { key: "greed", delta: greedPart },
      ],
    });
  }

  // 5. 강화 제안(평화 + communalism 민심 보호)
  let bestPeace: { r: RivalView; score: number; factors: { key: string; delta: number }[] } | undefined;
  for (const r of sorted) {
    if (!r.atWar || r.rebel) continue;
    const peaceTilt = Math.floor((1000 - t.belligerence) / 2);
    const commBonus = Math.floor(t.communalism / 10);
    const factors: { key: string; delta: number }[] = [
      { key: "peace_tilt", delta: peaceTilt },
      { key: "communalism", delta: commBonus },
    ];
    let score = peaceTilt + commBonus;
    if (me.satisfaction < WEARY_SATISFACTION) {
      factors.push({ key: "weary", delta: c.peaceWearyScore });
      score += c.peaceWearyScore;
    }
    if (r.strength > me.strength) {
      factors.push({ key: "weaker", delta: c.peaceWeakerScore });
      score += c.peaceWeakerScore;
    }
    if (dominates7(me.strength, r.strength, t.boldness, c)) {
      const pen = Math.floor((c.peaceWinningPenalty * t.belligerence) / 1000);
      factors.push({ key: "winning_penalty", delta: -pen });
      score -= pen;
    }
    if (!bestPeace || score > bestPeace.score) bestPeace = { r, score, factors };
  }
  if (bestPeace) {
    out.push({
      action: { kind: "peace", target: bestPeace.r.id },
      score: bestPeace.score,
      factors: bestPeace.factors,
    });
  }

  // 6. 봉신 독립(autonomy 주축 + boldness 보조)
  if (me.overlord && me.strength * 1000 >= me.overlord.strength * c.breakRatioPm) {
    const autoPart = Math.floor(t.autonomy / 2);
    const boldPart = Math.floor(t.boldness / 10);
    out.push({
      action: { kind: "break_vassal" },
      score: 100 + autoPart + boldPart,
      factors: [
        { key: "break_base", delta: 100 },
        { key: "autonomy", delta: autoPart },
        { key: "boldness", delta: boldPart },
      ],
    });
  }

  // 7. 폐허 복원(openness 주축 + greed 보조)
  let bestRestore: { r: RestoreView; score: number; factors: { key: string; delta: number }[] } | undefined;
  for (const r of me.restores) {
    if (!hasReserve7(me.treasury, r.cost, t.boldness, c)) continue;
    const openPart = Math.floor(t.openness / 6);
    const greedPart = Math.floor(t.greed / 10);
    const former = r.former ? c.restoreFormerBonus : 0;
    const cityPen = me.cities * c.restoreCityPenalty;
    const score = c.restoreClaimScore + openPart + greedPart + former - cityPen;
    const factors = [
      { key: "restore_base", delta: c.restoreClaimScore },
      { key: "openness", delta: openPart },
      { key: "greed", delta: greedPart },
      ...(former > 0 ? [{ key: "former_city", delta: former }] : []),
      ...(cityPen > 0 ? [{ key: "city_penalty", delta: -cityPen }] : []),
    ];
    if (!bestRestore || score > bestRestore.score) bestRestore = { r, score, factors };
  }
  if (bestRestore) {
    out.push({
      action: { kind: "restore", ruin: bestRestore.r.ruin },
      score: bestRestore.score,
      factors: bestRestore.factors,
    });
  }

  // 8. 알박기(빈 2차맵 정부 짓기: greed·openness 주축 − belligerence, boldness 예비금)
  const wars = sorted.filter((r) => r.atWar && !r.rebel).length;
  let bestClaim:
    | { v: (typeof me.claims)[number]; score: number; factors: { key: string; delta: number }[] }
    | undefined;
  for (const v of me.claims) {
    if (!hasReserve7(me.treasury, v.cost, t.boldness, c) || me.foodPm < HUNGRY_FOOD_PM) continue;
    const econPart = Math.floor(((t.greed + t.openness) * c.claimCommerce) / 2000);
    const aggPart = Math.floor((t.belligerence * c.claimAggression) / 1000);
    const cityPen = me.cities * c.claimCityPenalty;
    const warPen = wars * c.claimWarPenalty;
    const crowded = me.crowded ? c.claimCrowdedBonus : 0;
    const contested = v.contested ? c.claimContestPenalty : 0;
    const score = c.claimScore + econPart - aggPart - cityPen - warPen + crowded - contested;
    const factors = [
      { key: "claim_base", delta: c.claimScore },
      { key: "claim_econ", delta: econPart },
      { key: "belligerence", delta: -aggPart },
      ...(cityPen > 0 ? [{ key: "city_penalty", delta: -cityPen }] : []),
      ...(warPen > 0 ? [{ key: "war_penalty", delta: -warPen }] : []),
      ...(crowded > 0 ? [{ key: "crowded_bonus", delta: crowded }] : []),
      ...(contested > 0 ? [{ key: "contested_penalty", delta: -contested }] : []),
    ];
    if (!bestClaim || score > bestClaim.score) bestClaim = { v, score, factors };
  }
  if (bestClaim) {
    out.push({
      action: { kind: "claim", site: bestClaim.v.site },
      score: bestClaim.score,
      factors: bestClaim.factors,
    });
  }

  return out;
}

/**
 * 탐색 온도(decisionTempPm)를 반영한 최종 행동 고르기:
 * - tempPm = 0: 완전 결정적 최고 점수 1개(동점만 roll)
 * - tempPm > 0: 최고 점수에서 tempPm 이내에 있는 상위 후보를 점수 차에 비례한 가중치로 1회 시드 추첨
 */
export function chooseActionWithTemp(
  scored: readonly ScoredAction[],
  roll: number,
  tempPm: number,
): NpcAction {
  if (scored.length === 0) return { kind: "idle" };
  let top = Number.NEGATIVE_INFINITY;
  for (const entry of scored) top = Math.max(top, entry.score);
  const temp = Math.max(0, Math.trunc(tempPm));
  if (temp === 0) {
    const ties = scored.filter((entry) => entry.score === top);
    return ties[Math.abs(Math.trunc(roll)) % Math.max(1, ties.length)]?.action ?? { kind: "idle" };
  }
  const band = scored
    .filter((entry) => top - entry.score <= temp)
    .map((entry) => ({ action: entry.action, weight: Math.max(1, temp - (top - entry.score) + 1) }));
  const total = band.reduce((sum, item) => sum + item.weight, 0);
  let left = Math.abs(Math.trunc(roll)) % Math.max(1, total);
  for (const item of band) {
    if (left < item.weight) return item.action;
    left -= item.weight;
  }
  return band.at(-1)?.action ?? { kind: "idle" };
}

/** 7축 거래 정책(greed = 마진, boldness = 지출 과감도) */
export function tradePolicy7(traits: UnitTraits, foodShort: boolean, c: NpcCoefficients): TradePolicy {
  return {
    sellPct: 101n + BigInt(Math.floor(traits.greed / Math.max(1, c.tradeMarkupPerPct))),
    glutPct: 95n,
    spendDivisor: BigInt(foodShort ? c.spendDivisorShort : c.spendDivisor),
    bidPct: BigInt(Math.max(1, Math.trunc(c.cityBidPct))),
  };
}

/** 7축 공성 점령 처리(귀속 = 고정, 점령 = greed, 약탈 = belligerence, 상장폐지 = belligerence) */
export function occupationChoice7(
  traits: UnitTraits,
  roll: number,
  canAnnex: boolean,
  c: NpcCoefficients,
  war: WarCoefficients,
): OccupationChoice {
  const weights: readonly [WarOutcome, number][] = [
    ["integrate", canAnnex ? Math.max(0, Math.trunc(war.npcAnnexWeight)) : 0],
    ["occupy", Math.max(0, traits.greed)],
    ["loot", Math.max(0, traits.belligerence)],
  ];
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  let treatment: WarOutcome = canAnnex ? "integrate" : "loot";
  if (total > 0) {
    let left = Math.abs(Math.trunc(roll)) % total;
    for (const [outcome, weight] of weights) {
      if (left < weight) {
        treatment = outcome;
        break;
      }
      left -= weight;
    }
  }
  return { treatment, shares: traits.belligerence >= c.delistAggression ? "delist" : "keep" };
}

/** 7축 새 마을 체제(autonomy가 독립/봉신을 가르고, 독립 시 belligerence·greed·communalism 최대 축으로 체제 결정) */
export function foundingChoice7(traits: UnitTraits, c: NpcCoefficients): FoundingChoice {
  if (traits.autonomy < c.independentAggression) return { vassal: true };
  const { belligerence, greed, communalism } = traits;
  const regime: Regime =
    belligerence >= greed && belligerence >= communalism
      ? "dictatorship"
      : greed >= communalism
        ? "capitalism"
        : "democracy";
  return { vassal: false, regime };
}

/** 7축 편입 제안 답(전쟁 중 + autonomy 문턱) */
export function answerOffer7(
  traits: UnitTraits,
  atWarWithOccupier: boolean,
  c: NpcCoefficients,
): "accepted" | "refused" {
  return atWarWithOccupier && traits.autonomy >= c.refuseAggression ? "refused" : "accepted";
}

/** 7축 자본주의 독립 투표 찬성(전쟁 중 또는 autonomy 문턱) */
export function independenceYes7(traits: UnitTraits, atWarWithRuler: boolean, c: NpcCoefficients): boolean {
  return atWarWithRuler || traits.autonomy >= c.voteCommerce;
}

/**
 * 7축 가문 이주 정책(openness + greed 조합):
 * 개방적(openness 높음)이면 지원금 쪽, 폐쇄+이윤적(greed 높고 openness 낮음)이면 가입비 쪽
 */
export function npcHouseEntryFee7(
  traits: UnitTraits,
  limits: { readonly feeMax: number; readonly grantMax: number },
): number {
  const signal = Math.trunc((traits.greed - traits.openness) / 2); // -500 ~ +500
  if (signal > 0) return Math.floor((Math.max(0, Math.trunc(limits.feeMax)) * signal) / 500);
  if (signal < 0) return -Math.floor((Math.max(0, Math.trunc(limits.grantMax)) * -signal) / 500);
  return 0;
}

/** 7축 독재 지배 가문 금고 환류율(greed 낮고 communalism 높을수록 국고로 많이 돌려보낸다) */
export function npcRulingVaultReturnPm7(
  traits: UnitTraits,
  limits: { readonly minPm: number; readonly maxPm: number },
): number {
  const low = Math.min(1000, Math.max(0, Math.trunc(Math.min(limits.minPm, limits.maxPm))));
  const high = Math.min(1000, Math.max(0, Math.trunc(Math.max(limits.minPm, limits.maxPm))));
  // 사유화 성향(0~1000) = greed 65% + (1000 − communalism) 35%
  const hoard = Math.floor((traits.greed * 65 + (1000 - traits.communalism) * 35) / 100);
  return high - Math.floor(((high - low) * hoard) / 1000);
}

/** 계수표를 적용한 세력 실효 7축 성향 산출 */
export function resolveFactionEffectiveTraits(input: {
  readonly regime: TraitRegime;
  readonly legacyBase: Traits;
  readonly leaderPm?: number | undefined;
  readonly leader?: UnitTraits | undefined;
  readonly houses?: readonly { readonly traits: UnitTraits; readonly weight: number }[] | undefined;
  readonly avgLoyalty?: number | undefined;
  readonly ai: NpcAiCoefficients;
}): UnitTraits {
  const base = upgradeLegacyTraits(input.legacyBase, input.leaderPm);
  return blendFactionTraits({
    regime: input.regime,
    leader: input.leader,
    houses: input.houses,
    base,
    avgLoyalty: input.avgLoyalty,
    rules: blendRulesFromAi(input.ai),
  });
}

/** 계수표를 적용한 가문 실효 7축 성향 산출 */
export function resolveHouseEffectiveTraits(input: {
  readonly leader?: UnitTraits | undefined;
  readonly members?: readonly UnitTraits[] | undefined;
  readonly override?: UnitTraits | undefined;
  readonly avgLoyalty?: number | undefined;
  readonly ai: NpcAiCoefficients;
}): UnitTraits {
  return blendHouseTraits({
    leader: input.leader,
    members: input.members,
    override: input.override,
    avgLoyalty: input.avgLoyalty,
    rules: blendRulesFromAi(input.ai),
  });
}

/** 계수표를 적용한 도시 실효 7축 성향 산출 */
export function resolveCityEffectiveTraits(input: {
  readonly mayor?: UnitTraits | undefined;
  readonly citizens?: readonly UnitTraits[] | undefined;
  readonly nation: UnitTraits;
  readonly avgLoyalty?: number | undefined;
  readonly ai: NpcAiCoefficients;
}): UnitTraits {
  return blendCityTraits({
    mayor: input.mayor,
    citizens: input.citizens,
    nation: input.nation,
    avgLoyalty: input.avgLoyalty,
    rules: blendRulesFromAi(input.ai),
  });
}

/**
 * 유닛 1기의 실효 전투·조우 작전 산출(플레이어 설정 + 충성도 개입률 + 지휘관 비중):
 * - NPC 유닛(playerTactics 없음): 유닛 7축 성향(+ 지휘관 성향)에서 산출한 작전 그대로
 * - 플레이어 유닛: 충성도 개입률(loyaltyOverridePm)만큼 플레이어 작전 위에 유닛 본능을 섞는다
 */
export function resolveUnitCombatTactics(input: {
  readonly kind: LoyaltyUnitKind;
  readonly traits: UnitTraits;
  readonly commander?: UnitTraits | undefined;
  readonly playerTactics?: AiTactics | undefined;
  readonly loyaltyMilli: number | null | undefined;
  readonly ai: NpcAiCoefficients;
}): { readonly tactics: AiTactics; readonly overridePm: number; readonly instinct: AiTactics } {
  const instinct = tacticsFromUnitTraits(
    input.traits,
    input.commander ? { traits: input.commander, sharePm: input.ai.commanderSharePm } : undefined,
  );
  if (!input.playerTactics) {
    return { tactics: instinct, overridePm: 1000, instinct };
  }
  const overridePm = loyaltyOverridePm({
    kind: input.kind,
    loyaltyMilli: input.loyaltyMilli,
    traits: input.traits,
    rules: loyaltyRulesFromAi(input.ai),
  });
  return {
    tactics: blendTacticsByLoyalty(input.playerTactics, instinct, overridePm),
    overridePm,
    instinct,
  };
}

/** 에디터 실험실용: 플레이어 기본 프리셋(균형) 대비 충성도별 실효 작전 반환 */
export function previewPlayerTacticsByLoyalty(input: {
  readonly kind: LoyaltyUnitKind;
  readonly traits: UnitTraits;
  readonly loyaltyMilli: number | null;
  readonly playerPreset?: AiTactics | undefined;
  readonly ai: NpcAiCoefficients;
}): { readonly tactics: AiTactics; readonly overridePm: number; readonly instinct: AiTactics } {
  return resolveUnitCombatTactics({
    kind: input.kind,
    traits: input.traits,
    playerTactics: input.playerPreset ?? presetTactics("balanced"),
    loyaltyMilli: input.loyaltyMilli,
    ai: input.ai,
  });
}
