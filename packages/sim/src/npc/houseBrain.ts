// NPC 가문 자율 AI(houseBrain.ts) — docs/adr/2026-11-20-npc-autonomous-ai.md 1·4절
// 각 NPC 가문은 가문장 + 가문원 합성 7축 성향(resolveHouseEffectiveTraits)으로
// 금고 운용(환류·도시 투자·가문원 배당), 입단비/지원금, 분가·이주, 국가 안건 투표를 결정적으로 판단한다.
import type { UnitTraits } from "@terra/shared/unitTraits";
import type { NpcAiCoefficients } from "./aiCoefficients.ts";
import { npcHouseEntryFee7, npcRulingVaultReturnPm7 } from "./effectiveTraits.ts";

export type NpcHouseActionKind =
  | "hold"
  | "vault_return"
  | "invest_city"
  | "member_dividend"
  | "branch_out"
  | "migrate";

export interface NpcHouseContext {
  readonly houseId: number;
  readonly traits: UnitTraits;
  readonly isRulingHouse: boolean;
  readonly vaultBalance: bigint;
  readonly memberCount: number;
  readonly citySatisfaction: number;
  readonly cityCrowded: boolean;
  readonly cityNeedsInvestment: boolean;
  readonly hasMigrationTarget: boolean;
  readonly limits: {
    readonly feeMax: number;
    readonly grantMax: number;
    readonly vaultReturnMinPm: number;
    readonly vaultReturnMaxPm: number;
    readonly investMinVault: bigint;
    readonly dividendMinVault: bigint;
    readonly branchMinMembers: number;
  };
}

export interface ExplainedHouseAction {
  readonly kind: NpcHouseActionKind;
  readonly score: number;
  readonly factors: readonly { readonly key: string; readonly delta: number }[];
}

export interface NpcHouseDecision {
  readonly chosen: NpcHouseActionKind;
  readonly entryFee: number;
  readonly vaultReturnPm: number;
  readonly scores: readonly ExplainedHouseAction[];
}

export type HouseProposalKind = "tax_up" | "tax_down" | "war" | "peace" | "independence" | "invest";

export type HouseVoteChoice = "yes" | "no" | "abstain";

const clampInt = (v: number, lo: number, hi: number): number => {
  const n = Math.trunc(v);
  return n < lo ? lo : n > hi ? hi : n;
};

/** NPC 가문 다음 판단 주기(ms): [houseDecideMinMs, houseDecideMaxMs] 안에서 시드 흩기 */
export function houseDecideIntervalMs(
  roll: number,
  ai: Pick<NpcAiCoefficients, "houseDecideMinMs" | "houseDecideMaxMs">,
): number {
  const lo = Math.max(60_000, Math.min(ai.houseDecideMinMs, ai.houseDecideMaxMs));
  const hi = Math.max(lo, Math.max(ai.houseDecideMinMs, ai.houseDecideMaxMs));
  const span = hi - lo;
  if (span <= 0) return lo;
  return lo + (Math.abs(Math.trunc(roll)) % (span + 1));
}

/** NPC 가문 행동 후보 점수 + 정책 수치(입단비·금고 환류율) */
export function decideHouseAction(ctx: NpcHouseContext, roll: number, decisionTempPm = 0): NpcHouseDecision {
  const t = ctx.traits;
  const entryFee = npcHouseEntryFee7(t, {
    feeMax: ctx.limits.feeMax,
    grantMax: ctx.limits.grantMax,
  });
  const vaultReturnPm = npcRulingVaultReturnPm7(t, {
    minPm: ctx.limits.vaultReturnMinPm,
    maxPm: ctx.limits.vaultReturnMaxPm,
  });

  const scores: ExplainedHouseAction[] = [
    {
      kind: "hold",
      score: 240 + Math.floor((1000 - t.boldness) / 5),
      factors: [
        { key: "hold_base", delta: 240 },
        { key: "caution", delta: Math.floor((1000 - t.boldness) / 5) },
      ],
    },
  ];

  // 지배 가문 국고 환류: 공동체 높고 이윤욕 낮을수록 국고 지원 우선
  if (ctx.isRulingHouse && ctx.vaultBalance > 0n) {
    const comm = Math.floor(t.communalism / 3);
    const nonGreed = Math.floor((1000 - t.greed) / 4);
    scores.push({
      kind: "vault_return",
      score: 180 + comm + nonGreed,
      factors: [
        { key: "ruling_duty", delta: 180 },
        { key: "communalism", delta: comm },
        { key: "non_greed", delta: nonGreed },
      ],
    });
  }

  // 도시 시설·사업 투자: 여유 금고 + 이윤욕·개방성·과감성
  if (ctx.cityNeedsInvestment && ctx.vaultBalance >= ctx.limits.investMinVault) {
    const profit = Math.floor((t.greed * 3 + t.boldness * 2 + t.openness * 2) / 15);
    scores.push({
      kind: "invest_city",
      score: 210 + profit,
      factors: [
        { key: "city_needs_invest", delta: 210 },
        { key: "greed_bold_open", delta: profit },
      ],
    });
  }

  // 가문원 배당: 공동체 높고 이윤욕 낮고 금고 여유
  if (ctx.memberCount >= 2 && ctx.vaultBalance >= ctx.limits.dividendMinVault) {
    const shareDrive = Math.floor((t.communalism * 4 + (1000 - t.greed) * 2) / 15);
    const satBoost = ctx.citySatisfaction < 55 ? 120 : 0;
    scores.push({
      kind: "member_dividend",
      score: 170 + shareDrive + satBoost,
      factors: [
        { key: "dividend_base", delta: 170 },
        { key: "communalism", delta: shareDrive },
        ...(satBoost > 0 ? [{ key: "low_satisfaction", delta: satBoost }] : []),
      ],
    });
  }

  // 분가·개척: 도시 포화 + 충분한 인원 + 자치성·과감성·개방성
  if (ctx.cityCrowded && ctx.memberCount >= ctx.limits.branchMinMembers) {
    const ambition = Math.floor((t.autonomy * 4 + t.boldness * 3 + t.openness * 2) / 15);
    scores.push({
      kind: "branch_out",
      score: 150 + ambition,
      factors: [
        { key: "crowded_branch", delta: 150 },
        { key: "autonomy_bold_open", delta: ambition },
      ],
    });
  }

  // 이주: 도시 만족도 낮음 + 비지배 가문 + 자치성·개방성
  if (!ctx.isRulingHouse && ctx.hasMigrationTarget && ctx.citySatisfaction < 50) {
    const push = (50 - clampInt(ctx.citySatisfaction, 0, 50)) * 8;
    const traitPush = Math.floor((t.autonomy * 3 + t.openness * 2 - t.communalism) / 12);
    scores.push({
      kind: "migrate",
      score: 120 + push + traitPush,
      factors: [
        { key: "migrate_base", delta: 120 },
        { key: "unhappy_push", delta: push },
        { key: "autonomy_openness", delta: traitPush },
      ],
    });
  }

  let top = scores[0]!;
  for (const s of scores) if (s.score > top.score) top = s;
  const temp = Math.max(0, Math.trunc(decisionTempPm));
  let chosen: NpcHouseActionKind = top.kind;
  if (temp === 0) {
    const ties = scores.filter((s) => s.score === top.score);
    chosen = ties[Math.abs(Math.trunc(roll)) % Math.max(1, ties.length)]?.kind ?? top.kind;
  } else {
    const band = scores
      .filter((s) => top.score - s.score <= temp)
      .map((s) => ({ kind: s.kind, weight: Math.max(1, temp - (top.score - s.score) + 1) }));
    const total = band.reduce((sum, item) => sum + item.weight, 0);
    let left = Math.abs(Math.trunc(roll)) % Math.max(1, total);
    for (const item of band) {
      if (left < item.weight) {
        chosen = item.kind;
        break;
      }
      left -= item.weight;
    }
  }

  return { chosen, entryFee, vaultReturnPm, scores };
}

/**
 * 민주·자본 국가 안건에 대한 NPC 가문 투표 판정(D-5057 · 7축 분산).
 * - 점수 > +80 → yes, < -80 → no, 그 사이 → abstain(기권)
 */
export function decideHouseVote(
  traits: UnitTraits,
  proposal: HouseProposalKind,
  context: { readonly citySatisfaction?: number; readonly atWar?: boolean } = {},
): HouseVoteChoice {
  const sat = clampInt(context.citySatisfaction ?? 65, 0, 100);
  let score = 0;
  switch (proposal) {
    case "tax_up":
      // 공동체↑·규율↑ 찬성, 이윤욕↑·자치↑ 반대, 만족도 낮으면 강하게 반대
      score =
        Math.floor(
          (traits.communalism * 5 + traits.discipline * 3 - traits.greed * 5 - traits.autonomy * 3) / 10,
        ) + (sat < 50 ? -200 : 0);
      break;
    case "tax_down":
      score =
        Math.floor(
          (traits.greed * 5 + traits.autonomy * 3 - traits.communalism * 4 - traits.discipline * 2) / 10,
        ) + (sat < 50 ? 180 : 0);
      break;
    case "war":
      score = Math.floor((traits.belligerence * 6 + traits.boldness * 4 - 5000) / 10) + (sat < 50 ? -150 : 0);
      break;
    case "peace":
      score =
        Math.floor(
          ((1000 - traits.belligerence) * 5 + traits.communalism * 3 - traits.boldness * 2 - 3000) / 10,
        ) + (sat < 50 ? 200 : 0);
      break;
    case "independence":
      score = Math.floor((traits.autonomy * 7 + traits.boldness * 3 - 5500) / 10) + (context.atWar ? 250 : 0);
      break;
    case "invest":
      score = Math.floor((traits.openness * 4 + traits.discipline * 3 + traits.greed * 3 - 4800) / 10);
      break;
  }
  if (score > 80) return "yes";
  if (score < -80) return "no";
  return "abstain";
}
