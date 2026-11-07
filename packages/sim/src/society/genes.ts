// 스탯 유전자 판정 — 기획 D-478(수명이 다한 휴먼·크리쳐의 스탯·스킬이 유전자로 남는다, 스탯 유전자는 인큐베이터에서 새 휴먼의
// 어드밴티지), D-481(조합할 때 속성값은 평균 + 오차 범위), D-516(스탯 유전자 = 총합 스탯·스탯마다 분포·속성값, 총합이나 주력 스탯을 골라
// 적용, 합성하면 확률로 오름·내림·그대로 — 무한 증가 없음, "무작위 +1" 없음), docs/adr/2026-11-07-cyborg-fusion-genes.md "바뀜 (D-516)".
// - 스탯 유전자 하나 = 총합(1차 스탯 6칸의 합) + 분포(칸마다 ‰, 합 1000) + 속성값 12칸(0~10). 유전자 하나하나가 다른 물건(보유 물건 인스턴스)이다.
// - 합성: 바탕 총합 = 두 총합의 평균(내림). 확률(‰ 셋)로 오름(+걸음)·내림(−걸음)·그대로, 걸음 = max(1, ⌊바탕 × 걸음‰ ÷ 1000⌋),
//   [0, 상한]으로 자른다. 분포 = 두 분포의 평균을 다시 1000으로, 속성 = 칸마다 평균(내림) ± 오차(D-481), [0, 10].
// - 인큐베이터 적용: 총합(total) = 유전자 총합을 여섯 칸에 고르게(바탕 총합보다 작으면 바탕), 주력(main) = 바탕 스탯에 분포가 가장 큰 칸만
//   유전자의 그 칸 값(바탕보다 작으면 바탕). 속성은 유전자 값을 그대로 받는다 [임시].
// 판정은 정수와 시드 굴림만 쓴다(AGENTS 4장). 배열 차례는 STR·DEX·AGI·VIT·INT·WIS, 속성은 @terra/shared ELEMENT_IDS 차례.
import type { Rng } from "@terra/shared";
import { ELEMENT_IDS, ELEMENT_MAX } from "@terra/shared/cyborg";
import { FUSION_STAT_COUNT, type FusionCoefficients, sixStats } from "./fusion.ts";

/** 속성 칸 수(@terra/shared ELEMENT_IDS) */
export const GENE_ELEMENT_COUNT = ELEMENT_IDS.length;
/** 분포의 합(‰) */
export const GENE_DIST_TOTAL = 1000;

/** 스탯 유전자(D-516): 총합·분포(‰)·속성값 */
export interface StatGene {
  readonly total: number;
  /** 1차 스탯 6칸의 몫(‰, 합 1000) */
  readonly dist: readonly number[];
  /** 속성값 12칸(0~10) */
  readonly elements: readonly number[];
}

/** 합성 결과 총합이 어떻게 됐나 */
export type GeneSynthesisOutcome = "up" | "down" | "keep";

/** 인큐베이터 적용 방식(D-516 "총합이나 주력 스탯 등을 선택하여 적용") */
export type GeneApply = "total" | "main";

/**
 * 정수 total을 무게대로 나눈다(가장 큰 나머지 방식): 칸마다 ⌊total × 무게 ÷ 무게 합⌋, 남은 몫은 나머지가 큰 칸부터(같으면 앞 칸) 1씩.
 * 무게 합이 0이면 고르게 나눈다. 합 = total
 */
export function apportion(weights: readonly number[], total: number): number[] {
  const safe = weights.map((weight) => (Number.isInteger(weight) && weight > 0 ? weight : 0));
  const sum = safe.reduce((a, b) => a + b, 0);
  const used = sum > 0 ? safe : safe.map(() => 1);
  const usedSum = sum > 0 ? sum : used.length;
  const amount = Math.max(0, Math.floor(total));
  if (usedSum === 0) return [];
  const base = used.map((weight) => Math.floor((amount * weight) / usedSum));
  const rest = used.map((weight, index) => ({ index, rem: (amount * weight) % usedSum }));
  let left = amount - base.reduce((a, b) => a + b, 0);
  for (const entry of rest.toSorted((a, b) => b.rem - a.rem || a.index - b.index)) {
    if (left <= 0) break;
    base[entry.index] = (base[entry.index] ?? 0) + 1;
    left -= 1;
  }
  return base;
}

/** 배열을 속성 12칸으로 맞춘다(정수가 아니거나 음수면 0, 10보다 크면 10) */
export function twelveElements(elements: readonly number[] | null | undefined): number[] {
  return Array.from({ length: GENE_ELEMENT_COUNT }, (_, index) => {
    const value = elements?.[index];
    return value !== undefined && Number.isInteger(value) && value > 0 ? Math.min(ELEMENT_MAX, value) : 0;
  });
}

/** 수명이 다한 유닛 → 스탯 유전자(D-516): 총합 = 1차 스탯 합, 분포 = 칸 몫(‰), 속성 = 그 유닛 값 */
export function statGeneOf(
  stats: readonly number[],
  elements: readonly number[] | null | undefined,
): StatGene {
  const six = sixStats(stats);
  return {
    total: six.reduce((a, b) => a + b, 0),
    dist: apportion(six, GENE_DIST_TOTAL),
    elements: twelveElements(elements),
  };
}

/** 유전자 → 칸마다 스탯 값(총합을 분포대로 나눔, 합 = 총합) */
export function geneStatValues(gene: StatGene): number[] {
  return apportion(sixStats(gene.dist), gene.total);
}

/** 주력 스탯 칸(분포가 가장 큰 칸, 같으면 앞 칸) */
export function mainStatIndex(gene: StatGene): number {
  const dist = sixStats(gene.dist);
  let best = 0;
  for (let index = 1; index < FUSION_STAT_COUNT; index++)
    if ((dist[index] ?? 0) > (dist[best] ?? 0)) best = index;
  return best;
}

/** 합성 확률 굴림: [0, 오름) 오름, [오름, 오름+내림) 내림, 나머지 그대로. 셋의 합이 0이면 그대로(굴리지 않는다) */
function rollOutcome(rng: Rng, c: FusionCoefficients): GeneSynthesisOutcome {
  const up = Math.max(0, c.geneUpPm);
  const down = Math.max(0, c.geneDownPm);
  const sum = up + down + Math.max(0, c.geneKeepPm);
  if (sum <= 0) return "keep";
  const roll = rng.nextInt(sum);
  if (roll < up) return "up";
  if (roll < up + down) return "down";
  return "keep";
}

/**
 * 스탯 유전자 둘 → 새 스탯 유전자 하나(D-516). 굴림 차례: 결과 1번 → (오차가 있으면) 속성 칸마다 1번. 같은 시드·같은 입력이면 같다
 */
export function synthesizeStatGenes(
  a: StatGene,
  b: StatGene,
  rng: Rng,
  c: FusionCoefficients,
): { readonly gene: StatGene; readonly outcome: GeneSynthesisOutcome; readonly step: number } {
  const cap = Math.max(0, c.geneTotalMax);
  const baseTotal = Math.floor((Math.max(0, a.total) + Math.max(0, b.total)) / 2);
  const outcome = rollOutcome(rng, c);
  const step = c.geneStepPm > 0 ? Math.max(1, Math.floor((baseTotal * c.geneStepPm) / 1000)) : 0;
  const moved = outcome === "up" ? baseTotal + step : outcome === "down" ? baseTotal - step : baseTotal;
  const total = Math.min(cap, Math.max(0, moved));
  const da = sixStats(a.dist);
  const db = sixStats(b.dist);
  const dist = apportion(
    da.map((value, index) => value + (db[index] ?? 0)),
    GENE_DIST_TOTAL,
  );
  const ea = twelveElements(a.elements);
  const eb = twelveElements(b.elements);
  const variance = Math.max(0, c.geneElementVariance);
  const elements = ea.map((value, index) => {
    const mean = Math.floor((value + (eb[index] ?? 0)) / 2);
    const noise = variance > 0 ? rng.nextInt(variance * 2 + 1) - variance : 0;
    return Math.min(ELEMENT_MAX, Math.max(0, mean + noise));
  });
  return { gene: { total, dist, elements }, outcome, step: total - baseTotal };
}

/**
 * 인큐베이터로 태어나는 휴먼의 1차 스탯(D-478 "그 스탯 어드밴티지를 갖고 태어남", D-516 "총합이나 주력 스탯을 골라 적용").
 * 바탕 = 칸마다 incubateBaseStat. total = 유전자 총합(바탕 총합보다 작으면 바탕 총합)을 고르게, main = 바탕 + 주력 칸만 유전자 값
 */
export function incubateStats(gene: StatGene, apply: GeneApply, c: FusionCoefficients): number[] {
  const base = Math.max(0, c.incubateBaseStat);
  const flat = Array.from({ length: FUSION_STAT_COUNT }, () => base);
  if (apply === "total") {
    const total = Math.max(gene.total, base * FUSION_STAT_COUNT);
    return apportion(
      flat.map(() => 1),
      total,
    );
  }
  const main = mainStatIndex(gene);
  const value = geneStatValues(gene)[main] ?? 0;
  return flat.map((stat, index) => (index === main ? Math.max(stat, value) : stat));
}
