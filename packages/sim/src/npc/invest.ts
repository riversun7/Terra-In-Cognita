// NPC 투자 판단(경제 이득 · 자본 → 도전 확률) — docs/adr/2026-11-21-npc-needs-drives.md "바뀜 (2026-11-22, D-587 연맹 바로잡기·NPC 투자 판단)"
// 사용자 답(D-587, 질문 2465): NPC는 경제적 이득이 있을 때 투자한다(재료·소모 비용, 기대 수익, 수요). 도시·나라는 군사력을 키우려고 투자한다.
// 자본이 많을수록 도전하는 시도(높은 기술, 좋은 아이템·스킬)의 확률이 높다. D-586의 "세력 확장이다 …"는 이 NPC 투자 판단을 두고 한 말이다(연맹이 아니다).
// 틀은 D-323(46 §9.1): 상태 지표 → 후보 점수(성향 가중) → 규칙식. 여기서는 판단 틀이 쓰는 두 규칙식만 둔다.
// - 비용 몫: 값 ÷ 자본(‰, 0~1000). 점수에서 비용 몫 × 가중치 ÷ 1000을 뺀다(자본에 견줘 비쌀수록 덜 한다).
// - 도전 확률: 자본 ÷ 값의 배수에서 1배를 넘는 몫 × 걸음(‰) — 상한에서 자른다. 굴림(0~999)이 이 값보다 작으면 도전한다.
// 지금 수요가 있는 투자(예: 다음 기술이 연구 시설에 막힘 = 기대 수익)는 굴리지 않고 후보가 된다. 수요가 없는 앞선 투자(지금 기술보다 높은 연구 시설)만
// 도전으로 굴린다. 가중치·걸음·상한은 설정 칸이다([임시] 출발값 — 모양은 위 요소만, D-584).
// 정수·BigInt만 쓴다(판정 코드).
import type { NpcCoefficients } from "./coefficients.ts";

type InvestCoefficients = Pick<
  NpcCoefficients,
  "investCostWeightPm" | "investChallengeStepPm" | "investChallengeMaxPm"
>;

/** 자본 대비 값의 몫(‰, 0~1000). 자본이 0 이하면 1000 */
export function investCostSharePm(cost: bigint, capital: bigint): number {
  if (cost <= 0n) return 0;
  if (capital <= 0n || cost >= capital) return 1000;
  return Number((cost * 1000n) / capital);
}

/** 점수에서 뺄 비용 몫(비용 몫 × 가중치 ÷ 1000, 내림) */
export function investCostPenalty(cost: bigint, capital: bigint, c: InvestCoefficients): number {
  return Math.floor(
    (investCostSharePm(cost, capital) * Math.max(0, Math.trunc(c.investCostWeightPm))) / 1000,
  );
}

/** 도전 확률(‰): (자본 ÷ 값 − 1배) × 걸음, 0~상한. 값이 0 이하면 상한 */
export function investChallengePm(cost: bigint, capital: bigint, c: InvestCoefficients): number {
  const max = Math.min(1000, Math.max(0, Math.trunc(c.investChallengeMaxPm)));
  if (cost <= 0n) return max;
  if (capital <= cost) return 0;
  // 배수(‰)는 크게 자라도 상한에서 자르므로 넘치지 않게 먼저 묶는다
  const cap = 1_000_000n;
  const multiplePm = Number((capital * 1000n) / cost > cap ? cap : (capital * 1000n) / cost);
  const step = Math.max(0, Math.trunc(c.investChallengeStepPm));
  return Math.min(max, Math.floor(((multiplePm - 1000) * step) / 1000));
}

/** 도전하는가: 굴림(0 이상 정수)의 1000 나머지가 도전 확률보다 작다 */
export function investChallenges(
  cost: bigint,
  capital: bigint,
  roll: number,
  c: InvestCoefficients,
): boolean {
  return Math.abs(Math.trunc(roll)) % 1000 < investChallengePm(cost, capital, c);
}
