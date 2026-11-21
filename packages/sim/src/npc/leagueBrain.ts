// 가문 연맹(도시의 가문 모임)의 투자 판단 — docs/adr/2026-11-21-npc-needs-drives.md "바뀜 (가문 연맹)"
// 사용자 방향(2026-11-21): 연맹은 세력 확장 기구다. 확장을 할지, 생산시설에 투자할지, 군사력에 투자할지는 대표의 성향에 달려 있다.
// 좋은 것(높은 기술 등급·좋은 휴먼)일수록 투자 비용이 높다 — 비용은 부르는 쪽이 넘긴다(기술 = 레벨에 비례, 경비대 = 구인 카드 값).
// - 대표는 성향 점수가 가장 높은 투자 하나를 고른다. 기금이 그 비용에 못 미치면 모은다(다른 싼 것으로 바꾸지 않는다 — 성향대로).
// - 상황 가산: 붐비는 도시는 확장, 전쟁 중이면 군사.
// 정수·BigInt만 쓴다. 점수 가중치는 [임시] 출발값.
import type { UnitTraits } from "@terra/shared/unitTraits";

export const LEAGUE_INVESTMENTS = ["expand", "production", "military", "tech"] as const;

export type LeagueInvestment = (typeof LEAGUE_INVESTMENTS)[number];

/** 투자 하나의 지금 비용. 할 수 없는 투자(구인 카드 없음·기술 상한)는 넘기지 않는다 */
export interface LeagueOptions {
  /** 확장 지원(나라 국고에 — 새 마을·빈 땅 알박기 재료를 사는 돈) */
  readonly expand?: { readonly cost: bigint } | undefined;
  /** 생산시설 지원(나라 국고에 — 증축 재료를 사는 돈) */
  readonly production?: { readonly cost: bigint } | undefined;
  /** 군사: 경비대 한 명(구인 카드 값 — 좋은 카드일수록 비싸다) */
  readonly military?: { readonly cost: bigint } | undefined;
  /** 기술: 그 도시 연구 레벨 +1(값 = 기준 × 다음 레벨 — 높을수록 비싸다) */
  readonly tech?: { readonly cost: bigint } | undefined;
}

export interface LeagueContext {
  /** 대표(연맹에서 가문원이 가장 많은 가문의 가문장)의 성향 */
  readonly traits: UnitTraits;
  readonly fund: bigint;
  readonly options: LeagueOptions;
  /** 그 도시가 주거 상한에 닿았나 */
  readonly crowded: boolean;
  /** 그 나라가 전쟁 중인가 */
  readonly atWar: boolean;
}

export interface LeagueDecision {
  /** 대표가 고른 투자(할 수 있는 것이 하나도 없으면 null) */
  readonly chosen: LeagueInvestment | null;
  /** 기금이 그 비용 이상인가(아니면 모은다) */
  readonly affordable: boolean;
  readonly cost: bigint;
  readonly scores: readonly { readonly kind: LeagueInvestment; readonly score: number }[];
}

/** [임시] 상황 가산 */
const CROWDED_BONUS = 250;
const WAR_BONUS = 300;

/** 투자별 성향 점수(0~1000 + 상황 가산) */
export function leagueScoreOf(
  kind: LeagueInvestment,
  ctx: Pick<LeagueContext, "traits" | "crowded" | "atWar">,
): number {
  const t = ctx.traits;
  if (kind === "expand")
    return (
      Math.floor((t.autonomy * 4 + t.boldness * 4 + t.openness * 2) / 10) + (ctx.crowded ? CROWDED_BONUS : 0)
    );
  if (kind === "production") return Math.floor((t.greed * 5 + t.discipline * 3 + t.communalism * 2) / 10);
  if (kind === "military")
    return Math.floor((t.belligerence * 7 + t.boldness * 3) / 10) + (ctx.atWar ? WAR_BONUS : 0);
  return Math.floor((t.openness * 5 + t.discipline * 3 + t.boldness * 2) / 10);
}

/** 대표의 투자 판단(결정적 — 점수가 같으면 LEAGUE_INVESTMENTS 차례) */
export function chooseLeagueInvestment(ctx: LeagueContext): LeagueDecision {
  const scores: { kind: LeagueInvestment; score: number }[] = [];
  for (const kind of LEAGUE_INVESTMENTS) {
    if (ctx.options[kind] === undefined) continue;
    scores.push({ kind, score: leagueScoreOf(kind, ctx) });
  }
  let best: { kind: LeagueInvestment; score: number } | undefined;
  for (const entry of scores) if (!best || entry.score > best.score) best = entry;
  if (!best) return { chosen: null, affordable: false, cost: 0n, scores };
  const cost = ctx.options[best.kind]?.cost ?? 0n;
  return { chosen: best.kind, affordable: cost > 0n && ctx.fund >= cost, cost, scores };
}

/** 연맹 분담금(가문 금고 → 연맹 기금): 금고 × 몫(‰), 내림 */
export function leagueDuesOf(vault: bigint, duesPm: number): bigint {
  if (vault <= 0n) return 0n;
  return (vault * BigInt(Math.max(0, Math.min(1000, Math.trunc(duesPm))))) / 1000n;
}

/** 기술 투자 비용: 기준 × 다음 레벨(레벨이 오를수록 비싸다 — 시뮬 연구 짓기와 같은 식) */
export function leagueTechCost(base: bigint, level: number): bigint {
  return base * BigInt(Math.max(0, Math.trunc(level)) + 1);
}
