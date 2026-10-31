// 사이보그 초기 스탯·성장 K 굴리기 — 기획 D-6039(성향 + 치우친 무작위 합 60 + 다시 굴리기), D-417(K 숨김, N6 범위 균등),
// D-445 168·169(성향 넷, 치우침·횟수는 설정값). ADR 2026-11-01-first-login-cyborg 3절.
// 환생의 분포 다시 굴리기(D-444 164 "생성 때처럼 성향을 골라 다시 굴린다")도 이 함수를 쓴다.
// - 평균: 합 × (그 스탯 가중치 ÷ 가중치 합). 균형은 모두 같고, 다른 성향은 치우친 두 스탯이 favoredPm, 나머지가 otherPm.
// - 흩어짐: 균등 정수 셋의 합(어윈-홀 근사 정규분포, 0.001점 단위, 한 개 폭 ±spreadMilli → 표준편차 ≈ spreadMilli ÷ 1000점).
//   옛 CHR §4.2 "평균 10, 표준편차 ~3"을 출발값으로 썼다. 초월함수 없이 정수만 쓴다(판정 코드 규칙).
// - 반올림 → 칸 범위로 자르기 → 합이 맞을 때까지 시드 난수로 고른 칸을 한 점씩 올리거나 내린다(범위를 지킨다).
// 시드가 같으면 어디서나 같은 값이다(서버가 crypto로 뽑은 시드를 굴림 행에 남긴다).
import { type Rng, createRng } from "@terra/shared";
import type { Primaries } from "../combat/stats.ts";

export const PRIMARY_KEYS = ["str", "dex", "agi", "vit", "int", "wis"] as const;
type PrimaryKey = (typeof PRIMARY_KEYS)[number];

/** 성향(D-445 168: 균형·전투·기술·교역). 치우친 스탯은 기획이 정한 구조라 코드다. 저장된 ID라 바꾸지 않는다 */
export const CYBORG_TEMPERAMENTS = [
  { id: "balanced", favored: [] },
  { id: "combat", favored: ["str", "vit"] },
  { id: "tech", favored: ["int", "dex"] },
  { id: "trade", favored: ["int", "wis"] },
] as const satisfies readonly { readonly id: string; readonly favored: readonly PrimaryKey[] }[];
export type CyborgTemperamentId = (typeof CYBORG_TEMPERAMENTS)[number]["id"];

/** 만들기 계수(설정값, 팩 tuning n9_*) */
export interface CyborgCreationCoefficients {
  /** 성향이 치우친 스탯의 가중치(‰) */
  readonly favoredPm: number;
  /** 나머지 스탯의 가중치(‰). 균형은 모든 스탯이 같다 */
  readonly otherPm: number;
  /** 균등 정수 하나의 반폭(0.001점). 셋을 더하므로 표준편차 ≈ 이 값 ÷ 1000점 */
  readonly spreadMilli: number;
  /** 다시 굴리기 횟수(처음 굴림 1번은 따로). 굴림 상한 = 1 + 이 값 */
  readonly rerolls: number;
  /** 시작 도시 붐빔 띠 문턱(그 도시에서 시작한 사이보그 수, D-6041·D-445 175): 이 수부터 보통, 다음 수부터 붐빔 */
  readonly crowdNormal: number;
  readonly crowdBusy: number;
}

/** 출발값(D-445: 설정값 출발값) — 팩 tuning의 값이 이것과 같다(서버 시험이 본다) */
export const TEST_CYBORG_CREATION: CyborgCreationCoefficients = {
  favoredPm: 1400,
  otherPm: 800,
  spreadMilli: 3000,
  rerolls: 3,
  crowdNormal: 20,
  crowdBusy: 50,
};

/** 시작 도시 붐빔 띠 */
export function crowdingBand(cyborgs: number, c: CyborgCreationCoefficients): "quiet" | "normal" | "busy" {
  if (cyborgs >= c.crowdBusy) return "busy";
  if (cyborgs >= c.crowdNormal) return "normal";
  return "quiet";
}

/** 합·칸 범위(팩 tuning N9 n9_initial_*: 세력·사회 계수표 cyborg.initialSum·initialMin·initialMax) */
export interface InitialStatRange {
  readonly sum: number;
  readonly min: number;
  readonly max: number;
}

/** K 범위(‰, N6 cyborg.kMinPm·kMaxPm) */
export interface GrowthKRange {
  readonly minPm: number;
  readonly maxPm: number;
}

/** 굴림 한 번에 쓰는 균등 정수 수(어윈-홀) */
const NOISE_TERMS = 3;
/** K 굴림 하나의 눈 수(환생 rerollK와 같다: 0~9999) */
const K_ROLL_SIDES = 10_000;

export function isCyborgTemperament(id: string): id is CyborgTemperamentId {
  return CYBORG_TEMPERAMENTS.some((entry) => entry.id === id);
}

/** 굴림 상한(처음 1번 + 다시 굴리기) */
export function cyborgRollLimit(c: CyborgCreationCoefficients): number {
  return 1 + Math.max(0, c.rerolls);
}

/** 성향의 스탯 가중치(‰). 모르는 성향이면 undefined */
export function temperamentWeights(
  id: string,
  c: CyborgCreationCoefficients,
): { readonly [K in PrimaryKey]: number } | undefined {
  const entry = CYBORG_TEMPERAMENTS.find((candidate) => candidate.id === id);
  if (!entry) return undefined;
  const favored: readonly PrimaryKey[] = entry.favored;
  const weight = (stat: PrimaryKey): number =>
    favored.length === 0 ? 1000 : favored.includes(stat) ? c.favoredPm : c.otherPm;
  return {
    str: weight("str"),
    dex: weight("dex"),
    agi: weight("agi"),
    vit: weight("vit"),
    int: weight("int"),
    wis: weight("wis"),
  };
}

function checkRange(range: InitialStatRange): void {
  const ok =
    Number.isInteger(range.sum) &&
    Number.isInteger(range.min) &&
    Number.isInteger(range.max) &&
    range.min <= range.max &&
    range.min * PRIMARY_KEYS.length <= range.sum &&
    range.sum <= range.max * PRIMARY_KEYS.length;
  if (!ok) throw new RangeError(`initial stat range cannot reach the sum: ${JSON.stringify(range)}`);
}

function noise(rng: Rng, spreadMilli: number): number {
  const half = Math.max(0, Math.floor(spreadMilli));
  let total = 0;
  for (let i = 0; i < NOISE_TERMS; i++) total += rng.nextInt(half * 2 + 1) - half;
  return total;
}

/**
 * 초기 스탯 한 번 굴리기. 결과는 늘 합 = range.sum, 칸마다 range.min~max다.
 * 모르는 성향이면 RangeError(부르는 쪽이 isCyborgTemperament로 먼저 거른다)
 */
export function rollInitialStats(
  seed: number,
  temperament: string,
  range: InitialStatRange,
  c: CyborgCreationCoefficients,
): Primaries {
  checkRange(range);
  const weights = temperamentWeights(temperament, c);
  if (!weights) throw new RangeError(`unknown temperament: ${temperament}`);
  let weightSum = 0;
  for (const stat of PRIMARY_KEYS) weightSum += Math.max(0, weights[stat]);
  const rng = createRng(seed);
  const values = new Map<PrimaryKey, number>();
  let total = 0;
  for (const stat of PRIMARY_KEYS) {
    const meanMilli =
      weightSum > 0 ? Math.floor((range.sum * 1000 * Math.max(0, weights[stat])) / weightSum) : 0;
    const raw = Math.floor((meanMilli + noise(rng, c.spreadMilli) + 500) / 1000);
    const value = Math.min(range.max, Math.max(range.min, raw));
    values.set(stat, value);
    total += value;
  }
  // 합 맞추기: 올릴(내릴) 수 있는 칸 가운데 하나를 골라 한 점씩. range가 합에 닿을 수 있으므로 끝난다
  while (total !== range.sum) {
    const up = total < range.sum;
    const open = PRIMARY_KEYS.filter((stat) => {
      const value = values.get(stat) ?? 0;
      return up ? value < range.max : value > range.min;
    });
    const stat = open[rng.nextInt(open.length)];
    if (stat === undefined) throw new Error("no stat can move toward the sum");
    values.set(stat, (values.get(stat) ?? 0) + (up ? 1 : -1));
    total += up ? 1 : -1;
  }
  const at = (stat: PrimaryKey): number => values.get(stat) ?? range.min;
  return { str: at("str"), dex: at("dex"), agi: at("agi"), vit: at("vit"), int: at("int"), wis: at("wis") };
}

/** 성장 K 여섯(‰, N6 범위 안 균등, 양 끝 포함). 환생 rerollK와 같은 식: min + ⌊(max − min + 1) × 눈 ÷ 10000⌋ */
export function rollGrowthK(seed: number, range: GrowthKRange): Primaries {
  if (!Number.isInteger(range.minPm) || !Number.isInteger(range.maxPm) || range.minPm > range.maxPm)
    throw new RangeError(`bad K range: ${JSON.stringify(range)}`);
  const rng = createRng(seed);
  const span = range.maxPm - range.minPm + 1;
  const k = (): number => range.minPm + Math.floor((span * rng.nextInt(K_ROLL_SIDES)) / K_ROLL_SIDES);
  return { str: k(), dex: k(), agi: k(), vit: k(), int: k(), wis: k() };
}

/** 값이 초기 스탯 분포 규칙(합·칸 범위)에 맞는지(DB에서 읽은 값 확인) */
export function isInitialDistribution(stats: Primaries, range: InitialStatRange): boolean {
  let sum = 0;
  for (const stat of PRIMARY_KEYS) {
    const value = stats[stat];
    if (!Number.isInteger(value) || value < range.min || value > range.max) return false;
    sum += value;
  }
  return sum === range.sum;
}
