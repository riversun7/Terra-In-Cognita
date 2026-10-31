// 반란·독립 — docs/adr/2026-10-31-faction-society-core.md "반란·독립", 기획 46 §2.4·§3.2·§1.1, D-216·D-253·D-256·D-300~D-302·D-341
// - 반란(D-253·D-256): 도시 평균 만족도가 문턱(S26) 이하이면, 만족도가 문턱 이하인 휴먼이 반란군이 된다. 싸움은 도시 안 공성
//   (부르는 쪽이 전투로 정한다). 반란군이 시청을 점령하면 새 NPC 세력(원래 화폐·체제를 이어받고 원래 세력과 전쟁).
//   시작 도시는 주인이 바뀌지 않고 만족도 회복 사건으로 끝난다(D-341).
// - 독립(D-300~D-302): 자본주의 = 지분 1위 가문이 열고 찬성 지분 합 ≥ 문턱(S27 50%, 혼자 ≥ 문턱이면 투표 없이),
//   민주주의 = 그 도시 가문 수 과반, 독재 = 투표 없음(반란으로만). 시작 도시는 없다(D-341).
// - 봉신 독립 선언(D-216): 상위 관계를 끊는 사건(부르는 쪽이 overlord를 지운다).
// - 민심 표(D-443 155, 49 N35): 안정 · 태업 조짐 · 반란 예고(반란 문턱 바로 위 구간) · 반란 중(문턱 이하 = 이미 반란, D-253).
//   문턱은 모두 "이하"로 읽는다(S26과 같다).
import type { SocietyCoefficients } from "./coefficients.ts";
import type { Holding, Regime } from "./shares.ts";

/** 도시 평균 만족도(밀리점)와 휴먼마다의 만족도로 반란군을 고른다. 반란이 아니면 빈 목록 */
export function rebelsOf(
  units: readonly { readonly id: number; readonly satisfactionMilli: number }[],
  c: SocietyCoefficients,
): number[] {
  if (units.length === 0) return [];
  const threshold = c.rebellionThreshold * 1000;
  const average = Math.floor(units.reduce((sum, u) => sum + u.satisfactionMilli, 0) / units.length);
  if (average > threshold) return [];
  return units
    .filter((u) => u.satisfactionMilli <= threshold)
    .map((u) => u.id)
    .toSorted((a, b) => a - b);
}

export type UnrestBand = "stable" | "sabotage" | "warning" | "rebellion";

/** 도시 평균 만족도(밀리점) → 민심 표 단계 */
export function unrestBand(averageMilli: number, c: SocietyCoefficients): UnrestBand {
  if (averageMilli <= c.rebellionThreshold * 1000) return "rebellion";
  if (averageMilli <= c.rebellionWarningAt * 1000) return "warning";
  if (averageMilli <= c.sabotageAt * 1000) return "sabotage";
  return "stable";
}

export type IndependenceVote =
  | { readonly kind: "none" }
  | { readonly kind: "declare" | "passed" | "failed"; readonly leader: number; readonly yesPm: number };

/**
 * 자본주의 독립 투표(D-300·D-301): 지배 주체가 아닌 지분 1위가 연다. 찬성 = 발의자 + yes(찬성한 주체).
 * 발의자 혼자 문턱 이상이면 선언, 찬성 합이 문턱 이상이면 통과
 */
export function capitalistIndependence(
  holdings: readonly Holding[],
  ruler: number,
  yes: ReadonlySet<number>,
  c: SocietyCoefficients,
): IndependenceVote {
  const total = holdings.reduce((sum, h) => sum + h.amount, 0n);
  if (total === 0n) return { kind: "none" };
  let leader: Holding | undefined;
  for (const h of holdings) if (h.owner !== ruler && (!leader || h.amount > leader.amount)) leader = h;
  if (!leader) return { kind: "none" };
  // 1위가 지배 주체면 열 사람이 없다(지배 주체보다 많아야 1위)
  const rulerAmount = holdings.find((h) => h.owner === ruler)?.amount ?? 0n;
  if (rulerAmount >= leader.amount) return { kind: "none" };
  const pm = (amount: bigint) => Number((amount * 1000n) / total);
  const leaderPm = pm(leader.amount);
  if (leaderPm >= c.independencePassPm) return { kind: "declare", leader: leader.owner, yesPm: leaderPm };
  let yesAmount = leader.amount;
  for (const h of holdings)
    if (h.owner !== leader.owner && h.owner !== ruler && yes.has(h.owner)) yesAmount += h.amount;
  const yesPm = pm(yesAmount);
  return { kind: yesPm >= c.independencePassPm ? "passed" : "failed", leader: leader.owner, yesPm };
}

/** 민주주의 독립 투표(D-302): 그 도시 가문마다 한 표, 과반이면 통과 */
export function democraticIndependence(families: number, yesVotes: number): boolean {
  return families > 0 && yesVotes * 2 > families;
}

/** 독립할 수 있는 도시인가: 시작 도시가 아니고 독재가 아님(독재는 반란으로만, D-302·D-341) */
export function independenceAllowed(regime: Regime, startCity: boolean): boolean {
  return !startCity && regime !== "dictatorship";
}
