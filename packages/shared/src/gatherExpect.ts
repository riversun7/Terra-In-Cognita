// 예상 채집 확률표 — 기획 D-534(사용자 원문 "각 대략적인 스탯별(총합30,40,50 등), 레벨별(1,20,40,50,60) 등 예상되는 채집확률구간도 에디터에서
// 볼수있게"), 48 §8. 생산 편집기(/dev/production 공용 "예상 확률" 탭)가 그린다.
// 줄 = 두 스탯(주 + 보조)의 초기 합, 칸 = 레벨. 칸마다 K 범위(N6, 출발 0.8~1.2)의 유효 스탯 범위와 T0~T9 확률(‰).
// 판정과 같은 함수만 쓴다: 성장 primaryAtLevel(statGrowth.ts, D-417), 유효 스탯 gatherStat·구간 gatherBandIndex(gatherMath.ts, D-506·D-534).
// 확률 = 두 스탯의 K를 범위 안 고른 칸(양 끝 포함 K_STEPS × K_STEPS)으로 나눠 그 칸들의 구간 가중치를 평균한 것(K는 생성 때 범위 안 균등, N6).
// 정수 연산만 쓴다(화면 계산이지만 판정 함수와 같은 결과를 보이게).
import { GATHER_TIERS, GATHER_WEIGHT_TOTAL, type GatherBand, gatherBandIndex, gatherStat } from "./gatherMath.ts";
import { primaryAtLevel } from "./statGrowth.ts";

/** 기본 줄: 두 스탯 초기 합(15·15 = 30, 18·18 = 36은 D-534 원문 예) */
export const GATHER_EXPECT_SUMS: readonly number[] = [20, 30, 36, 40, 50, 60, 70, 80];
/** 기본 칸: 레벨(D-534 원문 1·20·40·50·60, 만렙 N7 50 · 특수 만렙 60) */
export const GATHER_EXPECT_LEVELS: readonly number[] = [1, 20, 40, 50, 60];
/** K 범위를 나누는 점 수(양 끝 포함) */
export const GATHER_EXPECT_K_STEPS = 9;

export interface GatherExpectInput {
  readonly bands: readonly GatherBand[];
  /** 레벨당 성장률(‰, N5) */
  readonly growthPm: number;
  /** K 범위(‰, N6) */
  readonly kMinPm: number;
  readonly kMaxPm: number;
  /** 시설 레벨당 유효 스탯 보너스(N43 n43_level_bonus) */
  readonly levelBonus: number;
  /** 시설 레벨(1~5) */
  readonly facilityLevel: number;
  /** 컨디션(관리 보너스, 이미 상한으로 자른 값, D-534) */
  readonly condition: number;
}

export interface GatherExpectCell {
  readonly sum: number;
  readonly level: number;
  /** 두 스탯 초기 값(합을 반씩, 홀수면 주 스탯이 1 더) */
  readonly stats: readonly [number, number];
  /** K 최소·최대일 때의 유효 스탯 */
  readonly statMin: number;
  readonly statMax: number;
  /** T0~T9 확률(‰, 합 1000. 구간이 없으면 모두 0) */
  readonly tierPm: readonly number[];
  /** 기대 티어(밀리, 1000 = T1) */
  readonly averageTierMilli: number;
}

/** 두 스탯 초기 합을 반씩 나눈다(홀수면 주 스탯이 1 더) */
export function splitStatSum(sum: number): [number, number] {
  const total = Math.max(0, Math.trunc(sum));
  const secondary = Math.floor(total / 2);
  return [total - secondary, secondary];
}

/** K 범위 안 고른 점(양 끝 포함, 정수 ‰) */
export function expectKSteps(minPm: number, maxPm: number, steps = GATHER_EXPECT_K_STEPS): number[] {
  const lo = Math.min(minPm, maxPm);
  const hi = Math.max(minPm, maxPm);
  const count = Math.max(1, Math.trunc(steps));
  if (count === 1 || lo === hi) return [lo];
  return Array.from({ length: count }, (_, index) => lo + Math.floor(((hi - lo) * index) / (count - 1)));
}

/** 두 스탯 초기 값·레벨·K 둘 → 유효 스탯(판정과 같은 셈) */
export function expectedGatherStat(
  stats: readonly [number, number],
  level: number,
  kPm: readonly [number, number],
  input: Pick<GatherExpectInput, "growthPm" | "levelBonus" | "facilityLevel" | "condition">,
): number {
  const grown =
    primaryAtLevel(stats[0], input.growthPm, kPm[0], level) + primaryAtLevel(stats[1], input.growthPm, kPm[1], level);
  return gatherStat(grown, Math.max(1, input.facilityLevel), input.levelBonus, input.condition);
}

/** 가중치 합(‰ 단위 몫)을 합 1000으로 맞춘다(가장 큰 나머지, 같으면 낮은 티어 먼저) */
function toPermille(totals: readonly number[]): number[] {
  const sum = totals.reduce((acc, value) => acc + value, 0);
  if (sum <= 0) return totals.map(() => 0);
  const parts = totals.map((value, index) => {
    const scaled = value * GATHER_WEIGHT_TOTAL;
    return { index, value: Math.floor(scaled / sum), rest: scaled % sum };
  });
  let spare = GATHER_WEIGHT_TOTAL - parts.reduce((acc, part) => acc + part.value, 0);
  for (const part of parts.toSorted((a, b) => b.rest - a.rest || a.index - b.index)) {
    if (spare <= 0) break;
    part.value += 1;
    spare -= 1;
  }
  return parts.map((part) => part.value);
}

/** 칸 하나: 두 스탯의 K 칸마다 유효 스탯 → 그 구간 가중치(구간 합으로 나눈 몫)를 모아 평균 */
export function expectedGatherCell(sum: number, level: number, input: GatherExpectInput): GatherExpectCell {
  const stats = splitStatSum(sum);
  const ks = expectKSteps(input.kMinPm, input.kMaxPm);
  // 구간마다 가중치 합이 달라도 K 칸마다 같은 무게로 섞이게, 가중치를 그 구간 합으로 나눈 몫(백만분율)으로 모은다
  const totals = Array.from({ length: GATHER_TIERS }, () => 0);
  for (const ka of ks)
    for (const kb of ks) {
      const stat = expectedGatherStat(stats, level, [ka, kb], input);
      const band = input.bands[gatherBandIndex(input.bands, stat)];
      if (!band) continue;
      let bandTotal = 0;
      for (let tier = 0; tier < GATHER_TIERS; tier++) bandTotal += Math.max(0, band.weightsPm[tier] ?? 0);
      if (bandTotal <= 0) continue;
      for (let tier = 0; tier < GATHER_TIERS; tier++)
        totals[tier] =
          (totals[tier] ?? 0) + Math.floor((Math.max(0, band.weightsPm[tier] ?? 0) * 1_000_000) / bandTotal);
    }
  const tierPm = toPermille(totals);
  const averageTierMilli = tierPm.reduce((acc, pm, tier) => acc + pm * tier, 0);
  const lo = ks[0] ?? input.kMinPm;
  const hi = ks.at(-1) ?? input.kMaxPm;
  return {
    sum,
    level,
    stats,
    statMin: expectedGatherStat(stats, level, [lo, lo], input),
    statMax: expectedGatherStat(stats, level, [hi, hi], input),
    tierPm,
    averageTierMilli,
  };
}

/** 표 전체(줄 = 초기 합, 칸 = 레벨) */
export function expectedGatherTable(
  input: GatherExpectInput,
  sums: readonly number[] = GATHER_EXPECT_SUMS,
  levels: readonly number[] = GATHER_EXPECT_LEVELS,
): GatherExpectCell[][] {
  return sums.map((sum) => levels.map((level) => expectedGatherCell(sum, level, input)));
}
