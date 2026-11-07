// 랭킹 점수 규칙 — 기획 20 §8.2(점수 = 앞 점수 × (1 − 감쇠) + 이번 기간 점수, 절대량은 로그·상대는 배율·효율은 그대로),
// D-037(감쇠형)·D-041(백분위 등급)·D-042(①언더독 ④로그 스케일)·D-7022(시간제 수치는 뺀다: 여기 재료는 모두 성과·소유 — 스탯을 쓰지 않는다).
// docs/adr/2026-11-07-ranking.md. 순수 함수이고 정수만 쓴다(실수 로그 없음: 비트 길이 + 제곱 되풀이, 결정적).
import type { RankingFactionWeights } from "./coefficients.ts";

/** 로그 소수 자릿수(이진 10자리 = 1/1024) */
const FRACTION_BITS = 10;
const Q = 65_536;
const FRACTION_SCALE = 1024;

/** ⌊1000 × log2(x)⌋에 가까운 값(x ≥ 1, 오차 1/1024 안). 정수 비트 길이 + 가수 제곱 되풀이(이진 자릿수를 하나씩 뽑는다) */
export function log2Milli(x: bigint): number {
  if (x < 1n) throw new RangeError(`log2Milli needs x >= 1: ${x}`);
  const exponent = x.toString(2).length - 1;
  // 가수 m = x ÷ 2^e를 Q16 고정 소수로(65536 ≤ m < 131072)
  let m = exponent >= 16 ? Number(x >> BigInt(exponent - 16)) : Number(x) * (1 << (16 - exponent));
  let fraction = 0;
  for (let bit = 0; bit < FRACTION_BITS; bit++) {
    m = Math.floor((m * m) / Q);
    fraction *= 2;
    if (m >= 2 * Q) {
      fraction += 1;
      m = Math.floor(m / 2);
    }
  }
  return exponent * 1000 + Math.floor((fraction * 1000) / FRACTION_SCALE);
}

/** 1000 × log2(1 + 값 ÷ 기준) — 절대량 지표의 로그 압축(D-042 ④). 값이 0 이하면 0 */
export function logOver(value: bigint, base: bigint): number {
  if (value <= 0n || base < 1n) return 0;
  return Math.max(0, log2Milli(base + value) - log2Milli(base));
}

/** 산출 양 → 지표 값(로그) */
export const productionValue = (qty: bigint): number => logOver(qty, 1n);

/** 가진 도시 → 지표 값: 1000 × log2(1 + Σ(1 + 발전도 ÷ 100)). 도시 하나·발전도 0 = 1000 */
export function citiesValue(cities: number, developmentSum: number): number {
  return logOver(BigInt(Math.max(0, cities) * 100 + Math.max(0, developmentSum)), 100n);
}

/** 지은 시설 → 지표 값: 1000 × log2(1 + Σ(레벨 × 상태 ÷ 가득)). 가득 찬 1레벨 하나 = 1000. levelPpm = Σ 레벨 × 상태(ppm) */
export const facilitiesValue = (levelPpm: bigint): number => logOver(levelPpm, 1_000_000n);

/**
 * 전투 승리 한 번의 점수(‰, D-042 ① 언더독): ⌊1000 × 상대 전력 ÷ 내 전력⌋, 상한 capPm. 약자를 이기면 0에 가깝다.
 * 전력 = 편의 유닛 수(버프가 들지 않는 값, D-7022) [임시]
 */
export function underdogPm(enemy: number, own: number, capPm: number): number {
  if (own <= 0 || enemy <= 0) return 0;
  return Math.min(Math.max(0, capPm), Math.floor((enemy * 1000) / own));
}

/** 이번 기간 점수 = Σ ⌊지표 값 × 가중치 ÷ 1000⌋ (20 §8.2) */
export function periodGain(
  values: Readonly<Record<string, number | undefined>>,
  weights: readonly { readonly measure: string; readonly weightPm: number }[],
): number {
  let gain = 0;
  for (const { measure, weightPm } of weights) {
    const value = values[measure] ?? 0;
    if (value > 0 && weightPm > 0) gain += Math.floor((value * weightPm) / 1000);
  }
  return gain;
}

/** 점수 상한(곱셈이 안전 정수를 넘지 않게) */
const SCORE_CAP = Math.floor(Number.MAX_SAFE_INTEGER / 1000);

/** 감쇠(D-037): 집계 periods번 = periods번 ⌊점수 × (1000 − 감쇠) ÷ 1000⌋. 0이 되면 멈춘다 */
export function decayScore(score: number, decayPm: number, periods: number): number {
  const keep = 1000 - Math.min(1000, Math.max(0, decayPm));
  let next = Math.min(SCORE_CAP, Math.max(0, Math.floor(score)));
  for (let step = 0; step < periods && next > 0; step++) next = Math.floor((next * keep) / 1000);
  return next;
}

/** 다음 점수 = 감쇠한 앞 점수 + 이번 기간 점수(상한 안) */
export function nextScore(prev: number, gain: number, decayPm: number, periods: number): number {
  return Math.min(SCORE_CAP, decayScore(prev, decayPm, periods) + Math.max(0, Math.floor(gain)));
}

export interface ScoredEntry {
  readonly key: number;
  readonly score: number;
}

export interface RankedEntry extends ScoredEntry {
  readonly rank: number;
}

/**
 * 순위: 점수가 있는 것(> 0)만, 점수 높은 순·같으면 키 작은 순(결정적 차례). 같은 점수는 같은 순위(1·2·2·4).
 */
export function rankEntries(entries: readonly ScoredEntry[]): RankedEntry[] {
  const sorted = entries
    .filter((entry) => entry.score > 0)
    .toSorted((a, b) => b.score - a.score || a.key - b.key);
  const ranked: RankedEntry[] = [];
  for (const [index, entry] of sorted.entries()) {
    const before = ranked[index - 1];
    const rank = before !== undefined && before.score === entry.score ? before.rank : index + 1;
    ranked.push({ ...entry, rank });
  }
  return ranked;
}

/** 든 백분위 등급(D-041): 순위 × 1000 ≤ 참가자 × 문턱인 가장 작은 문턱(‰). 어디에도 들지 않으면 null */
export function tierPmOf(rank: number, total: number, tiersPm: readonly number[]): number | null {
  for (const tier of tiersPm.toSorted((a, b) => a - b)) if (rank * 1000 <= total * tier) return tier;
  return null;
}

/** 문턱마다 그 등급에 드는 가장 낮은 점수(순위가 문턱 안인 마지막 줄). 든 줄이 없으면 null */
export function tierCuts(
  ranked: readonly RankedEntry[],
  tiersPm: readonly number[],
): { tierPm: number; minScore: number | null }[] {
  const total = ranked.length;
  return tiersPm
    .toSorted((a, b) => a - b)
    .map((tierPm) => {
      let minScore: number | null = null;
      for (const entry of ranked) if (entry.rank * 1000 <= total * tierPm) minScore = entry.score;
      return { tierPm, minScore };
    });
}

/** 세력 규모(D-322와 같은 재료) */
export interface FactionSize {
  readonly cities: number;
  readonly developmentSum: number;
  readonly humans: number;
  readonly treasury: bigint;
}

/** 세력 판 점수 = 도시 × 점수 + 발전도 합 × 점수 + 휴먼 × 점수 + ⌊국고 ÷ 단위⌋. 빚(음수 국고)은 0 */
export function factionScore(size: FactionSize, w: RankingFactionWeights): number {
  const treasury = size.treasury > 0n ? size.treasury / BigInt(Math.max(1, w.treasuryUnit)) : 0n;
  const total =
    Math.max(0, size.cities) * w.cityPoints +
    Math.max(0, size.developmentSum) * w.developmentPoints +
    Math.max(0, size.humans) * w.humanPoints +
    Number(treasury > BigInt(SCORE_CAP) ? BigInt(SCORE_CAP) : treasury);
  return Math.min(SCORE_CAP, Math.max(0, total));
}
