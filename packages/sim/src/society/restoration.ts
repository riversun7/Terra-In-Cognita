// 폐허 복원 규칙(결정적 정수) — 기획 D-510(정부를 먼저 지은 쪽이 주인, 복원 사업으로 지분 투자 모집)·D-339(낸 돈만큼 도시 지분)·
// D-343(누구나 낸다)·D-344(독재는 지배 가문 과반), docs/adr/2026-11-07-ruins-restoration.md.
// - 정부 짓기: NPC는 국고에서 정부 짓기 값(claimCost)을 내고 주인이 된다(시설 칸 없이 — 연구 시설과 같은 꼴). 유저는 서버 건물 짓기로.
// - 복원 사업: 목표(goal)를 채우면 도시가 되살아난다. 넣는 값은 남은 몫까지만 받는다.
// - 지분: 1000주를 낸 값 비례로(가장 큰 나머지, shares.ts allocateShares). 도시가 드는 세력이 독재면 지배 주체가 과반(> 50%)을 늘 갖는다
//   — 지배 주체 몫이 과반에 못 미치면 ⌊총 ÷ 2⌋ + 1주를 주고 나머지를 다른 주체가 낸 값 비례로 나눈다(D-344, 확인 대기 질문 483).
// - NPC 규칙식 몫(하루 끝): 주인 NPC가 넣는 국고 몫(‰), 다른 NPC가 열린 모금에 넣는 몫(‰ × 상업 성향 ÷ 1000).
import { type Holding, type Regime, allocateShares } from "./shares.ts";

export interface RestorationCoefficients {
  /** [임시] NPC 정부 짓기 값(국고 화폐 최소 단위, 시설 칸 없는 NPC의 행정 건물 값) */
  readonly claimCost: number;
  /** [임시] 복원 목표(도시가 드는 세력 국고 화폐 최소 단위) */
  readonly goal: number;
  /** [임시] 옛 주인이 아닌 NPC 세력이 주인 없는 폐허에 정부를 지을 수 있게 되는 날 수(폐허가 된 뒤) */
  readonly npcClaimAfterDays: number;
  /** [임시] 주인 NPC가 하루에 넣는 국고 몫(‰) */
  readonly npcFundPm: number;
  /** [임시] 다른 NPC가 열린 모금에 하루 넣는 국고 몫(‰, 상업 성향 1000일 때) */
  readonly npcInvestPm: number;
}

/** 출발값 — 모두 [임시](옛 규칙 없음, D-515). 목표는 마을 세우기 값(시나리오 foundCost 5,000)의 두 배 */
export const START_RESTORATION_COEFFICIENTS: RestorationCoefficients = {
  claimCost: 2000,
  goal: 10_000,
  npcClaimAfterDays: 7,
  npcFundPm: 100,
  npcInvestPm: 20,
};

/** 넣으려는 값 가운데 받는 값(남은 몫까지, 음수·0은 0) */
export function acceptedContribution(goal: bigint, raised: bigint, amount: bigint): bigint {
  const left = goal - raised;
  if (amount <= 0n || left <= 0n) return 0n;
  return amount < left ? amount : left;
}

/** 낸 값 합 */
export const raisedOf = (contributions: ReadonlyMap<number, bigint>): bigint => {
  let sum = 0n;
  for (const amount of contributions.values()) sum += amount;
  return sum;
};

/** 낸 값 → 지분 주체 목록(주체 ID 차례, 0은 뺀다) */
export function contributionList(contributions: ReadonlyMap<number, bigint>): Holding[] {
  return [...contributions]
    .filter(([, amount]) => amount > 0n)
    .map(([owner, amount]) => ({ owner, amount }))
    .toSorted((a, b) => a.owner - b.owner);
}

/**
 * 복원 지분 배정(D-339·D-344). total주를 낸 값 비례로 나눈다(가장 큰 나머지). 독재면 지배 주체가 과반을 갖게 고친다:
 * 비례 몫이 과반이면 그대로, 아니면 지배 주체 ⌊total ÷ 2⌋ + 1주 + 나머지를 다른 주체가 낸 값 비례로. 낸 사람이 없으면 지배 주체에게 모두
 */
export function restorationShares(
  contributions: readonly Holding[],
  total: bigint,
  regime: Regime,
  ruler: number,
): Holding[] {
  if (total <= 0n) return [];
  const paid = contributions.filter((c) => c.amount > 0n);
  if (paid.length === 0) return [{ owner: ruler, amount: total }];
  const plain = allocateShares(paid, total);
  if (regime !== "dictatorship") return plain;
  const own = plain.find((h) => h.owner === ruler)?.amount ?? 0n;
  if (own * 2n > total) return plain;
  const majority = total / 2n + 1n;
  const others = allocateShares(
    paid.filter((c) => c.owner !== ruler),
    total - majority,
  );
  return [...others, { owner: ruler, amount: majority }].toSorted((a, b) => a.owner - b.owner);
}

/** 주인 NPC가 오늘 넣는 값(국고 × ‰, 남은 몫까지) */
export function npcFundAmount(treasury: bigint, goal: bigint, raised: bigint, pm: number): bigint {
  if (treasury <= 0n || pm <= 0) return 0n;
  return acceptedContribution(goal, raised, (treasury * BigInt(pm)) / 1000n);
}

/** 다른 NPC가 오늘 열린 모금에 넣는 값(국고 × ‰ × 상업 ÷ 1000, 남은 몫까지) */
export function npcInvestAmount(
  treasury: bigint,
  goal: bigint,
  raised: bigint,
  pm: number,
  commerce: number,
): bigint {
  if (treasury <= 0n || pm <= 0 || commerce <= 0) return 0n;
  return acceptedContribution(goal, raised, (treasury * BigInt(pm) * BigInt(commerce)) / 1_000_000n);
}
