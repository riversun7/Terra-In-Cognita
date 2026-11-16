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

/** 구인 규칙식이 고른 카드 한 장: 자리와 경비대로 들일지(기획 답 920 나) */
export interface RecruitPick {
  readonly slot: number;
  readonly guard: boolean;
}

/**
 * 구인 규칙식(D-469, [임시] 기술 출발값): 도시 휴먼이 목표(주거 × recruitTargetPm ÷ 1000)보다 적으면 그 창의 남은 카드를 토탈 스탯이 높은
 * 차례로(같으면 싼 것, 같으면 앞 자리) 산다. 카드 하나를 살 때마다 국고가 그 값 × recruitReservePm ÷ 1000 이상이어야 한다.
 * 경비대 다시 채우기(기획 답 920 나, docs/adr/2026-11-10-nation-editor.md "바뀜 (2026-11-11, 916~925 답)"): 그 도시 경비대가 등급 값
 * (guardTarget)보다 적으면 모자란 수만큼 먼저(좋은 카드부터) 경비대로 산다. 값·예비금은 같은 카드 규칙이고, 경비대도 휴먼이라 산 만큼 휴먼
 * 목표의 모자람도 준다(경비대 채우기는 주거 목표와 따로 — 주거가 차 있어도 등급 값까지 채운다). population은 경비대를 포함한 그 도시 휴먼 수.
 * 산 차례대로 돌려준다. 사람(유저 세력)이면 이 자리에 유저 명령이 들어간다
 */
export function recruitPicks(
  input: {
    readonly cards: readonly { readonly slot: number; readonly total: number; readonly cost: bigint }[];
    readonly taken: number;
    readonly population: number;
    readonly housing: number;
    readonly treasury: bigint;
    /** 그 도시 경비대 수(population 안에 든다). 없으면 0 */
    readonly guards?: number | undefined;
    /** 경비대 목표(등급 값). 없거나 0이면 경비대를 사지 않는다 */
    readonly guardTarget?: number | undefined;
    /**
     * 배후지에서 받은 몫이 문턱 아래(성장 멈춤, docs/adr/2026-11-11-city-catchment.md "바뀜 (2026-11-12)"): 주거 목표로는 사지 않는다(경비대
     * 다시 채우기는 그대로 — 지키는 사람은 늘리는 것이 아니라 메우는 것)
     */
    readonly growthBlocked?: boolean | undefined;
  },
  c: NpcCoefficients,
): RecruitPick[] {
  const target = Math.floor((input.housing * c.recruitTargetPm) / 1000);
  let gap = input.growthBlocked === true ? Math.min(0, target - input.population) : target - input.population;
  let guardGap = Math.max(0, (input.guardTarget ?? 0) - (input.guards ?? 0));
  let treasury = input.treasury;
  const picks: RecruitPick[] = [];
  const open = input.cards
    .filter((card) => (input.taken & (1 << card.slot)) === 0)
    .toSorted((a, b) => b.total - a.total || (a.cost < b.cost ? -1 : a.cost > b.cost ? 1 : a.slot - b.slot));
  for (const card of open) {
    if (gap <= 0 && guardGap <= 0) break;
    if (treasury * 1000n < card.cost * BigInt(c.recruitReservePm) || treasury < card.cost) continue;
    const guard = guardGap > 0;
    picks.push({ slot: card.slot, guard });
    treasury -= card.cost;
    gap -= 1;
    if (guard) guardGap -= 1;
  }
  return picks;
}

/**
 * NPC 나라의 가문 이동 정책(기획 D-570 "해당 국가나 도시의 정책 — 지원금이 있을지 가입비가 있을지", D-526 받는 쪽이 정함, D-323 성향 규칙식,
 * 질문 2018 답): 가문원마다 + 가입비 / − 지원금(최소 단위). 상업 성향(D-327)이 가운데보다 높으면 높은 만큼 가입비(가장 높음 = feeMax), 낮으면
 * 낮은 만큼 지원금(가장 낮음 = grantMax). 가운데는 0 [임시 — 질문 2141]. 서버가 정책을 정하지 않은 NPC 나라에 읽을 때 쓴다(시뮬은 부르지 않는다)
 */
export function npcHouseEntryFee(
  commerce: number,
  c: Pick<NpcCoefficients, "traitMin" | "traitMax">,
  limits: { readonly feeMax: number; readonly grantMax: number },
): number {
  const min = Math.min(c.traitMin, c.traitMax);
  const max = Math.max(c.traitMin, c.traitMax);
  const value = Math.min(max, Math.max(min, Math.trunc(commerce)));
  // 가운데의 두 배(나누지 않고 정수로 비교한다)
  const mid2 = min + max;
  const span2 = max - min;
  if (span2 <= 0) return 0;
  const lead2 = value * 2 - mid2;
  if (lead2 > 0) return Math.floor((Math.max(0, Math.trunc(limits.feeMax)) * lead2) / span2);
  if (lead2 < 0) return -Math.floor((Math.max(0, Math.trunc(limits.grantMax)) * -lead2) / span2);
  return 0;
}

/** ‰ 값(0~1000, 정수) */
const clampPm = (value: number): number => Math.min(1000, Math.max(0, Math.trunc(value)));

/**
 * NPC 지배 가문 금고에서 국고로 돌려보내는 몫(‰) — 기획 대조 2223 고침(D-338 "도시 세금의 남은 이익은 지배 가문 금고로"·D-555 1509 "NPC만으로도
 * 똑같이"·D-574 지배 가문 = 수도의 첫 가문·D-554 "세력 성향마다 다양한 변수"). 상업 성향(D-327)이 낮을수록 금고 돈을 국고 지원으로 더 돌려보내고
 * (가장 낮음 = maxPm), 높을수록 가문 금고에 더 쌓는다(가장 높음 = minPm). 둘 사이는 선형. 서버가 독재 NPC 나라의 남은 이익을 금고에 넣은 뒤 쓴다
 * (시뮬은 가문 층이 없어 부르지 않는다). 국고가 마르지 않게 하는 길이다 [임시 — 질문 2255]
 */
export function npcRulingVaultReturnPm(
  commerce: number,
  c: Pick<NpcCoefficients, "traitMin" | "traitMax">,
  limits: { readonly minPm: number; readonly maxPm: number },
): number {
  const low = clampPm(Math.min(limits.minPm, limits.maxPm));
  const high = clampPm(Math.max(limits.minPm, limits.maxPm));
  const min = Math.min(c.traitMin, c.traitMax);
  const max = Math.max(c.traitMin, c.traitMax);
  const span = max - min;
  if (span <= 0) return high;
  const value = Math.min(max, Math.max(min, Number.isFinite(commerce) ? Math.trunc(commerce) : min));
  // 상업 성향이 높을수록 low 쪽(정수 나눗셈 — 결정적)
  return high - Math.floor(((high - low) * (value - min)) / span);
}
