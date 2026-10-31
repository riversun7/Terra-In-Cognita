// 시뮬 세력·사회 불변 조건 — docs/adr/2026-10-31-faction-society-core.md "불변 조건"
import type { SocietyCoefficients } from "../society/coefficients.ts";
import { SATISFACTION_MAX_MILLI } from "../society/labor.ts";
import type { IncorporationOffer } from "../society/occupation.ts";
import { holdingsOf, rulerHasMajority } from "../society/shares.ts";
import { DAY_MS } from "./metrics.ts";
import { type SimWorld, rulingFamilyOf } from "./world.ts";

/**
 * S1 지분 합 = 0, 도시 주식 수 또는 상장폐지 재발행 주식 수(D-298·D-443), S2 독재 도시 지배 주체 과반(D-338·D-349),
 * S3 만족도 범위, S4 기한 지난 편입 제안
 */
export function checkSociety(
  world: SimWorld,
  offers: readonly IncorporationOffer[],
  c: SocietyCoefficients,
  nowMs: number,
): string[] {
  const problems: string[] = [];
  let badMajority = 0;
  let badTotal = 0;
  for (const city of world.cities.values()) {
    const owner = world.factions.get(city.owner);
    const holdings = holdingsOf(world.book, city.id);
    const total = holdings.reduce((sum, h) => sum + h.amount, 0n);
    if (total !== 0n && total !== BigInt(c.sharesPerCity) && total !== BigInt(c.delistReissueShares))
      badTotal += 1;
    // 점령으로 막 바뀐 도시는 settleShares가 과반을 맞춘다
    if (owner?.regime === "dictatorship" && !rulerHasMajority(holdings, rulingFamilyOf(owner)))
      badMajority += 1;
  }
  let badSatisfaction = 0;
  for (const unit of world.units.values())
    if (unit.satisfactionMilli < 0 || unit.satisfactionMilli > SATISFACTION_MAX_MILLI) badSatisfaction += 1;
  const stale = offers.filter(
    (offer) => offer.state === "pending" && offer.deadlineMs + DAY_MS < nowMs,
  ).length;
  const add = (label: string, n: number) => {
    if (n > 0) problems.push(`${label}: ${n}`);
  };
  add("S1 city share totals not 0, sharesPerCity or delistReissueShares", badTotal);
  add("S2 dictatorship cities without a ruling majority", badMajority);
  add("S3 satisfaction out of range", badSatisfaction);
  add("S4 incorporation offers past their deadline", stale);
  return problems;
}
