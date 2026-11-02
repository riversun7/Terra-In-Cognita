// 채집·채굴 티어 추첨 — 기획 D-506(질문 300~302), 49 N43, docs/adr/2026-10-31-economy-core.md "바뀜 (300~302)".
// 옛 프로젝트 규칙(AntiGravt01 GatherResolverEngine.resolveGatherResult)을 정수 ‰로 옮겼다.
// - 유효 스탯 = 일꾼의 1차 + 2차(시설마다: 광산 STR + VIT, 벌목 DEX + STR, 약초 INT + WIS, 낚시 AGI + DEX)
//   + 시설 레벨 보너스(N43 n43_level_bonus × (레벨 − 1), [임시] 10). 시설 레벨은 티어를 막지 않는다(D-506, 제작 시설은 D-5001 그대로).
// - 구간: from이 유효 스탯 이하인 마지막 구간(파일 차례 = from 차례, 첫 구간 from 0). 그 구간 가중치(‰, T0~T9, 합 1000)로 티어 하나.
// - 아이템: 그 분류(중분류)의 그 티어 아이템. 없으면 더 낮은 티어로 내려간다. 같은 티어에 여럿이면 팩 차례 가운데 고르게 하나
//   [Assumed: 옛 규칙이 같은 티어 여럿을 어떻게 골랐는지 확인하지 않았다]. T0까지 없으면 그 묶음은 아무것도 나오지 않는다.
// - 산출 묶음 하나마다 한 번 뽑는다(옛 프로젝트 채집량 1개 고정 = 묶음 1개). 난수는 부르는 쪽이 준다(시드 흐름).
// 정수 연산만 쓴다(판정 코드 규칙).
import type { Rng } from "@terra/shared";

/** 티어 수(T0~T9, D-5001) */
export const GATHER_TIERS = 10;
/** 구간 가중치 합(‰) */
export const GATHER_WEIGHT_TOTAL = 1000;

export interface GatherBand {
  /** 이 구간이 시작하는 유효 스탯(포함) */
  readonly from: number;
  /** T0~T9 가중치(‰, 합 1000) */
  readonly weightsPm: readonly number[];
}

/**
 * 시험·기본 확률표 = 팩 core gather_tiers(core@29, 시험이 맞춰 본다). 옛 표 %를 ‰로(22.3% → 223 등, 반올림 없이 합 1000),
 * 0~39는 [임시] T0 700·T1 150·T2 100·T3 50(사용자 답 300 "낮은 구간도 T3까지 열기")
 */
export const TEST_GATHER_BANDS: readonly GatherBand[] = [
  { from: 0, weightsPm: [700, 150, 100, 50, 0, 0, 0, 0, 0, 0] },
  { from: 20, weightsPm: [700, 150, 100, 50, 0, 0, 0, 0, 0, 0] },
  { from: 40, weightsPm: [650, 220, 100, 30, 0, 0, 0, 0, 0, 0] },
  { from: 60, weightsPm: [530, 260, 140, 60, 10, 0, 0, 0, 0, 0] },
  { from: 80, weightsPm: [430, 290, 170, 80, 25, 5, 0, 0, 0, 0] },
  { from: 100, weightsPm: [350, 280, 200, 110, 40, 15, 5, 0, 0, 0] },
  { from: 120, weightsPm: [290, 260, 210, 140, 60, 25, 10, 5, 0, 0] },
  { from: 140, weightsPm: [250, 230, 200, 160, 90, 40, 17, 9, 4, 0] },
  { from: 160, weightsPm: [223, 210, 200, 170, 110, 50, 23, 10, 4, 0] },
  { from: 180, weightsPm: [204, 200, 190, 170, 120, 60, 35, 15, 6, 0] },
  { from: 200, weightsPm: [190, 190, 180, 160, 130, 80, 45, 20, 5, 0] },
  { from: 220, weightsPm: [195, 180, 170, 160, 130, 80, 40, 25, 15, 5] },
];

/** 유효 스탯 = 일꾼 1차 + 2차 + 레벨 보너스 × (레벨 − 1). 레벨 1 아래는 보너스 0 */
export function gatherStat(workerStat: number, level: number, bonusPerLevel: number): number {
  return Math.max(0, workerStat) + Math.max(0, bonusPerLevel) * Math.max(0, level - 1);
}

/** 유효 스탯이 드는 구간 번호(from이 스탯 이하인 마지막 구간, 첫 구간보다 작으면 0). 구간이 없으면 -1 */
export function gatherBandIndex(bands: readonly GatherBand[], stat: number): number {
  let found = bands.length === 0 ? -1 : 0;
  for (let i = 0; i < bands.length; i++) if ((bands[i]?.from ?? 0) <= stat) found = i;
  return found;
}

/** 가중치(‰)로 티어 하나를 뽑는다. 합이 0이면 T0 */
export function rollGatherTier(bands: readonly GatherBand[], stat: number, rng: Rng): number {
  const band = bands[gatherBandIndex(bands, stat)];
  if (!band) return 0;
  let total = 0;
  for (const weight of band.weightsPm) total += Math.max(0, weight);
  if (total <= 0) return 0;
  let roll = rng.nextInt(total);
  for (let tier = 0; tier < band.weightsPm.length; tier++) {
    const weight = Math.max(0, band.weightsPm[tier] ?? 0);
    if (roll < weight) return tier;
    roll -= weight;
  }
  return 0;
}

/**
 * 뽑은 티어의 아이템(ladder[티어] = 그 티어의 켜진 아이템 자산, 팩 차례). 없으면 더 낮은 티어, T0까지 없으면 undefined.
 * 같은 티어에 여럿이면 rng로 고르게 하나(하나면 rng를 쓰지 않는다)
 */
export function pickGatherItem(
  ladder: readonly (readonly string[])[],
  tier: number,
  rng: Rng,
): string | undefined {
  for (let t = Math.min(tier, ladder.length - 1); t >= 0; t--) {
    const choices = ladder[t] ?? [];
    if (choices.length === 1) return choices[0];
    if (choices.length > 1) return choices[rng.nextInt(choices.length)];
  }
  return undefined;
}

/** 티어 추첨 하나의 입력 */
export interface GatherRoll {
  /** 중분류의 티어별 켜진 아이템 자산(길이 GATHER_TIERS) */
  readonly ladder: readonly (readonly string[])[];
  readonly bands: readonly GatherBand[];
  /** 유효 스탯(gatherStat) */
  readonly stat: number;
  /** 뽑을 묶음 수 */
  readonly lots: number;
  /** 아이템 자산 → 묶음 크기(기본 단위, 없으면 1) */
  readonly lotSize: ReadonlyMap<string, bigint>;
}

/**
 * 묶음마다 티어를 뽑아 산출(기본 단위)을 만든다. 같은 아이템은 합치고, 사다리 차례(티어 → 팩 차례)로 돌려준다.
 * 아무것도 나오지 않은 묶음은 빠진다. tiers = 뽑은 티어별 묶음 수(지표·시험)
 */
export function rollGatherOutputs(
  roll: GatherRoll,
  rng: Rng,
): { outputs: { asset: string; qty: bigint }[]; tiers: number[]; empty: number } {
  const lots = new Map<string, bigint>();
  const tiers = Array.from({ length: GATHER_TIERS }, () => 0);
  let empty = 0;
  for (let i = 0; i < roll.lots; i++) {
    const tier = rollGatherTier(roll.bands, roll.stat, rng);
    tiers[tier] = (tiers[tier] ?? 0) + 1;
    const asset = pickGatherItem(roll.ladder, tier, rng);
    if (asset === undefined) {
      empty += 1;
      continue;
    }
    lots.set(asset, (lots.get(asset) ?? 0n) + 1n);
  }
  const outputs: { asset: string; qty: bigint }[] = [];
  for (const choices of roll.ladder)
    for (const asset of choices) {
      const count = lots.get(asset);
      if (count !== undefined) outputs.push({ asset, qty: count * (roll.lotSize.get(asset) ?? 1n) });
    }
  return { outputs, tiers, empty };
}

/** 구간 하나에서 티어별 확률(‰, 표시·시험용): 뽑은 티어 → 나오는 아이템 티어(없으면 내려감)로 모은다 */
export function gatherChancesPm(
  bands: readonly GatherBand[],
  stat: number,
  ladder: readonly (readonly string[])[],
): { tierPm: number[]; emptyPm: number } {
  const band = bands[gatherBandIndex(bands, stat)];
  const tierPm = Array.from({ length: GATHER_TIERS }, () => 0);
  let emptyPm = 0;
  if (!band) return { tierPm, emptyPm: GATHER_WEIGHT_TOTAL };
  for (let tier = 0; tier < GATHER_TIERS; tier++) {
    const weight = band.weightsPm[tier] ?? 0;
    let landed = -1;
    for (let t = Math.min(tier, ladder.length - 1); t >= 0; t--)
      if ((ladder[t]?.length ?? 0) > 0) {
        landed = t;
        break;
      }
    if (landed < 0) emptyPm += weight;
    else tierPm[landed] = (tierPm[landed] ?? 0) + weight;
  }
  return { tierPm, emptyPm };
}
