// NPC 규칙식 — docs/adr/2026-11-01-npc-brain-r5.md 4절, 기획 D-323(정책 값은 규칙식), 질문 197·198 가
// 판단 틀의 행동 하나와 따로, 고를 수 있는 칸(세율·거래 값·점령 처리·마을 체제·편입 답·독립 찬성)을 성향과 상태로 정한다.
// 순수 함수다. 사람(유저 세력)이면 이 자리에 유저 명령이 들어간다.
import type { Regime } from "../society/shares.ts";
import type { WarCoefficients, WarOutcome } from "../society/warOutcomes.ts";
import type { NpcCoefficients } from "./coefficients.ts";
import type { Traits } from "./traits.ts";

/**
 * 거래세(만분율, D-323 예): 지난 판단 뒤 국고가 줄었으면 +1%p(휴먼 평균 만족도가 하한 아래면 올리지 않음), 늘었으면 −1%p
 * (프리셋 기본 아래로는 안 내림). NPC 규칙식 상한에서 멈춘다. 처음 판단(before 없음)은 그대로
 */
export function nextTaxBp(
  input: {
    readonly current: number;
    readonly base: number;
    readonly treasury: bigint;
    readonly before: bigint | null;
    readonly satisfaction: number;
  },
  c: NpcCoefficients,
): number {
  const { current, base, treasury, before, satisfaction } = input;
  if (before === null) return current;
  if (treasury < before && satisfaction >= c.taxSatisfactionFloor)
    return Math.min(c.taxMaxBp, Math.max(current, current + c.taxStepBp));
  if (treasury > before) return Math.max(Math.min(base, current), current - c.taxStepBp);
  return current;
}

export interface TradePolicy {
  /** 남는 물건 매도 값(지난 값의 %) */
  readonly sellPct: bigint;
  /** 크게 남을 때 매도 값(%) */
  readonly glutPct: bigint;
  /** 판단 한 번에 쓰는 국고 몫(분모) */
  readonly spendDivisor: bigint;
  /** 자기 도시 매입 호가(지난 값의 %, 기획 답 530 가) */
  readonly bidPct: bigint;
}

/** 거래 정책(D-323 "운임 = 원가 + 성향별 이익률"): 상업 성향만큼 이익률, 생필품이 모자라면 국고를 더 쓴다 */
export function tradePolicy(traits: Traits, foodShort: boolean, c: NpcCoefficients): TradePolicy {
  return {
    sellPct: 101n + BigInt(Math.floor(traits.commerce / c.tradeMarkupPerPct)),
    glutPct: 95n,
    spendDivisor: BigInt(foodShort ? c.spendDivisorShort : c.spendDivisor),
    bidPct: BigInt(Math.max(1, Math.trunc(c.cityBidPct))),
  };
}

export interface OccupationChoice {
  /**
   * 공성 결과 셋(D-520·D-527): 약탈(정부가 무너진 도시를 재건 전까지 꺼내 감, 소유 그대로) · 점령·귀속(도시를 가져가 재건 시도, 재건 비용·느린
   * 회복) · 점령 상태(소유·체제 그대로, 재정을 가져감, 정해진 끝 없음)
   */
  readonly treatment: WarOutcome;
  /** 지분 처리(점령·귀속에만 쓴다, 46 §5.1 ③) */
  readonly shares: "delist" | "keep";
}

/**
 * 공성 결과 고르기(D-520, 성향 가중 [임시] — 확인 대기 683): 가중치 약탈 = 공격 성향, 점령 상태 = 상업 성향, 점령·귀속 = war.npcAnnexWeight
 * (재건 비용을 낼 국고가 없으면 0). roll(0 이상)을 가중치 합으로 나눈 나머지로 점령·귀속 → 점령 상태 → 약탈 차례에서 고른다. 합이 0이면 낼 수
 * 있으면 점령·귀속, 아니면 약탈. 상장폐지는 아주 공격적일 때만(독재가 과반을 못 쥐면 규칙이 상장폐지로 바꾼다)
 */
export function occupationChoice(
  traits: Traits,
  roll: number,
  canAnnex: boolean,
  c: NpcCoefficients,
  war: WarCoefficients,
): OccupationChoice {
  const weights: readonly [WarOutcome, number][] = [
    ["integrate", canAnnex ? Math.max(0, Math.trunc(war.npcAnnexWeight)) : 0],
    ["occupy", Math.max(0, traits.commerce)],
    ["loot", Math.max(0, traits.aggression)],
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
  return { treatment, shares: traits.aggression >= c.delistAggression ? "delist" : "keep" };
}

export type FoundingChoice = { readonly vassal: true } | { readonly vassal: false; readonly regime: Regime };

/** 새 마을(D-340): 세우는 가문이 공격적이면 독립 도시국가 + 가장 큰 축의 체제, 아니면 봉신 */
export function foundingChoice(traits: Traits, c: NpcCoefficients): FoundingChoice {
  if (traits.aggression < c.independentAggression) return { vassal: true };
  const { aggression, commerce, faith } = traits;
  const regime: Regime =
    aggression >= commerce && aggression >= faith
      ? "dictatorship"
      : commerce >= faith
        ? "capitalism"
        : "democracy";
  return { vassal: false, regime };
}

/** 편입 제안 답(D-342): 점령자와 전쟁 중인 공격 성향 세력만 거부한다 */
export function answerOffer(
  traits: Traits,
  atWarWithOccupier: boolean,
  c: NpcCoefficients,
): "accepted" | "refused" {
  return atWarWithOccupier && traits.aggression >= c.refuseAggression ? "refused" : "accepted";
}

/** 자본주의 독립 투표 찬성(D-301): 도시 주인과 전쟁 중이거나 상업 성향이 높으면 */
export function independenceYes(traits: Traits, atWarWithRuler: boolean, c: NpcCoefficients): boolean {
  return atWarWithRuler || traits.commerce >= c.voteCommerce;
}

/**
 * 구인 규칙식(D-469, [임시] 기술 출발값): 도시 휴먼이 목표(주거 × recruitTargetPm ÷ 1000)보다 적으면 그 창의 남은 카드를 토탈 스탯이 높은
 * 차례로(같으면 싼 것, 같으면 앞 자리) 산다. 카드 하나를 살 때마다 국고가 그 값 × recruitReservePm ÷ 1000 이상이어야 한다.
 * 산 자리 목록(산 차례). 사람(유저 세력)이면 이 자리에 유저 명령이 들어간다
 */
export function recruitPicks(
  input: {
    readonly cards: readonly { readonly slot: number; readonly total: number; readonly cost: bigint }[];
    readonly taken: number;
    readonly population: number;
    readonly housing: number;
    readonly treasury: bigint;
  },
  c: NpcCoefficients,
): number[] {
  const target = Math.floor((input.housing * c.recruitTargetPm) / 1000);
  let gap = target - input.population;
  let treasury = input.treasury;
  const picks: number[] = [];
  const open = input.cards
    .filter((card) => (input.taken & (1 << card.slot)) === 0)
    .toSorted((a, b) => b.total - a.total || (a.cost < b.cost ? -1 : a.cost > b.cost ? 1 : a.slot - b.slot));
  for (const card of open) {
    if (gap <= 0) break;
    if (treasury * 1000n < card.cost * BigInt(c.recruitReservePm) || treasury < card.cost) continue;
    picks.push(card.slot);
    treasury -= card.cost;
    gap -= 1;
  }
  return picks;
}
