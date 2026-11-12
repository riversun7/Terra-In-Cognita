// 채집·채굴 티어 추첨 — 기획 D-506(질문 300~302), 49 N43, docs/adr/2026-10-31-economy-core.md "바뀜 (300~302)".
// 옛 프로젝트 규칙(AntiGravt01 GatherResolverEngine.resolveGatherResult)을 정수 ‰로 옮겼다.
// - 유효 스탯 = 일꾼의 1차 + 2차(시설마다: 광산 STR + VIT, 벌목 DEX + STR, 약초 INT + WIS, 낚시 AGI + DEX)
//   + 시설 레벨 보너스(N43 n43_level_bonus × (레벨 − 1), [임시] 10). 시설 레벨은 티어를 막지 않는다(D-506, 제작 시설은 D-5001 그대로).
// - 구간: from이 유효 스탯 이하인 마지막 구간(파일 차례 = from 차례, 첫 구간 from 0). 그 구간 가중치(‰, T0~T9, 합 1000)로 티어 하나.
// - 아이템: 그 분류(중분류 — 시설이 여럿을 적으면 그 모두, 질문 946 나)의 그 티어 아이템. 없으면 더 낮은 티어로 내려간다. 같은 티어에 여럿이면 팩 차례 가운데 고르게 하나
//   [Assumed: 옛 규칙이 같은 티어 여럿을 어떻게 골랐는지 확인하지 않았다]. T0까지 없으면 그 묶음은 아무것도 나오지 않는다.
// - 산출 묶음 하나마다 한 번 뽑는다(옛 채집 한 번 = 묶음 1개). 난수는 부르는 쪽이 준다(시드 흐름).
// 옛 1차 생산 규칙(기획 D-507, 49 N32·P8, docs/research/2026-11-02-old-primary-production.md, ADR economy-core "바뀜 (옛 1차 생산 규칙)"):
// - 진행 속도: 틱마다 진행 = max(1, ⌊주 스탯 ÷ 20⌋)(옛 BuildingGatherEngine.js 291·527). 시뮬은 시설의 시간당 작업량에 곱한다.
// - 수확량: 한 번 캘 때 개수 = min(상한, 기본 + ⌊보조 스탯 × 비율⌋)(옛 gather_type_config yield_base·yield_per_stat·yield_cap,
//   migrations/index.js 642~736). 옛 마지막 코드는 1개 고정이었고 기획 D-507이 켰다. 광석은 개수 = 묶음 수(1개 = 1kg 묶음, 49 N44).
// - 선택 + 효율(농장·목장): 해금 티어 = min(⌊(주 + 보조) ÷ 20⌋, 9)(49 P8, 옛 calcAccessibleTier)에서 켜진 아이템이 있는 가장 높은
//   티어를 고르고 같은 티어 여럿이면 고르게(옛 ORDER BY tier DESC, RANDOM()). 추첨하지 않는다.
// - 성공 확률(낚시터, docs/adr/2026-11-11-production-six.md): 한 번 시도마다 성공 ‰를 먼저 굴리고 성공한 번만 티어를 뽑는다
//   (옛 BuildingGatherEngine.js runFishingWorkers 715~735, fishing_config 0.30·0.80·0.50).
// 정수 연산만 쓴다(판정 코드 규칙).
import type { Rng } from "@terra/shared";
import {
  GATHER_TIERS,
  GATHER_WEIGHT_TOTAL,
  type GatherBand,
  gatherBandIndex,
} from "@terra/shared/gatherMath";

// 난수 없는 셈(구간 찾기·진행·수확량·필요 진행·해금 티어·성공 확률·나올 확률)은 @terra/shared/gatherMath에 있다(화면 미리 보기와 같은 식)
export {
  ACCESSIBLE_TIER_STEP,
  GATHER_TIERS,
  GATHER_WEIGHT_TOTAL,
  accessibleTier,
  gatherBandIndex,
  gatherCatchPm,
  gatherChancesPm,
  gatherLadderKey,
  gatherProgress,
  gatherStat,
  gatherSubcategories,
  gatherYield,
  tierRequiredProgress,
  type GatherBand,
  type GatherCatchRule,
  type GatherSubcategorySource,
  type GatherYieldRule,
} from "@terra/shared/gatherMath";

/**
 * 시험·기본 확률표 = 팩 core gather_tiers(core@29, 시험이 맞춰 본다). 옛 표 %를 ‰로(22.3% → 223 등, 반올림 없이 합 1000),
 * 0~39는 [임시] T0 700·T1 150·T2 100·T3 50(사용자 답 300 "낮은 구간도 T3까지 열기").
 * 바뀜(D-534, 팩 core@76): T9는 200~219에서 드물게(2‰), 220부터 늘어난다(15‰ → 240 25‰ → 260 35‰, 240·260 구간을 더함 [임시]).
 * 성장률 0.1이라 두 스탯 18·18이 만렙(50)에 약 212, 15·15는 약 176 + 컨디션 +40 = 216(200 구간)이다.
 * 바뀜(사용자 결정 2026-11-12 "건축시 목재와 석재는 필수이다" — 기본 재료 바닥 보장, 팩 core@77): 0~59 구간 T1(석재 등)을 350‰로 올렸다
 * (0~39 T0 700 → 500·T1 150 → 350, 40~59 T0 650 → 500·T1 220 → 350·T2 100 → 120) — 처음 유닛도 Lv1 건물 석재를 쓸 만큼 캔다. 잡석(T0)은 벽돌용으로 남는다
 */
export const TEST_GATHER_BANDS: readonly GatherBand[] = [
  { from: 0, weightsPm: [500, 350, 100, 50, 0, 0, 0, 0, 0, 0] },
  { from: 20, weightsPm: [500, 350, 100, 50, 0, 0, 0, 0, 0, 0] },
  { from: 40, weightsPm: [500, 350, 120, 30, 0, 0, 0, 0, 0, 0] },
  { from: 60, weightsPm: [530, 260, 140, 60, 10, 0, 0, 0, 0, 0] },
  { from: 80, weightsPm: [430, 290, 170, 80, 25, 5, 0, 0, 0, 0] },
  { from: 100, weightsPm: [350, 280, 200, 110, 40, 15, 5, 0, 0, 0] },
  { from: 120, weightsPm: [290, 260, 210, 140, 60, 25, 10, 5, 0, 0] },
  { from: 140, weightsPm: [250, 230, 200, 160, 90, 40, 17, 9, 4, 0] },
  { from: 160, weightsPm: [223, 210, 200, 170, 110, 50, 23, 10, 4, 0] },
  { from: 180, weightsPm: [204, 200, 190, 170, 120, 60, 35, 15, 6, 0] },
  { from: 200, weightsPm: [188, 190, 180, 160, 130, 80, 45, 20, 5, 2] },
  { from: 220, weightsPm: [180, 175, 165, 155, 130, 85, 45, 30, 20, 15] },
  { from: 240, weightsPm: [160, 165, 160, 150, 130, 90, 55, 35, 30, 25] },
  { from: 260, weightsPm: [140, 155, 155, 150, 130, 95, 60, 45, 35, 35] },
];

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
  /** 뽑을 묶음 수(캐는 횟수) */
  readonly lots: number;
  /** 아이템 자산 → 묶음 크기(기본 단위, 없으면 1) */
  readonly lotSize: ReadonlyMap<string, bigint>;
  /** 선택 + 효율(농장·목장): 있으면 추첨하지 않고 이 해금 티어(accessibleTier)에서 고른다 */
  readonly selectTier?: number | undefined;
  /** 한 번 캘 때 나오는 개수(gatherYield, 없으면 1). 고른 아이템이 이만큼 나온다 */
  readonly yieldPerLot?: number | undefined;
  /**
   * 기본 단위가 g이고 묶음이 큰 아이템(lotSize > 1, 광석)의 한 개 = 이 g(49 N44, 옛 1개 = 1kg → 1,000). 없으면 묶음 크기.
   * 그 밖의 아이템은 한 개 = 기본 단위 하나 × 묶음 크기(1)
   */
  readonly harvestGrams?: bigint | undefined;
  /**
   * 한 번 시도의 성공 ‰(gatherCatchPm, 낚시터). 있으면 티어를 뽑기 전에 먼저 굴리고, 실패한 번은 빈 번이다(티어 난수를 쓰지 않는다).
   * 없으면 늘 성공(난수를 더 쓰지 않는다 — 다른 시설의 결과는 그대로)
   */
  readonly successPm?: number | undefined;
  /**
   * 티어 막기(광석 고도 몫 — 기획 D-533 "높은 티어 광석은 산지", simulator/catchmentRun.ts oreTierCap). 추첨으로 maxTier 위가 나오면
   * keepAbovePm(‰)만큼만 그대로 두고 나머지는 maxTier로 내린다(그때만 난수를 하나 더 쓴다. 0이면 난수 없이 늘 내린다). 선택 방식은 보지 않는다.
   * 없으면 막지 않는다(다른 시설의 결과는 그대로)
   */
  readonly tierCap?: { readonly maxTier: number; readonly keepAbovePm: number } | undefined;
}

/**
 * 한 번 캘 때마다 티어를 뽑아(선택 방식이면 해금 티어로) 산출(기본 단위)을 만든다. 한 번 캘 때 yieldPerLot개가 나온다. 같은 아이템은
 * 합치고, 사다리 차례(티어 → 팩 차례)로 돌려준다. 아무것도 나오지 않은 번은 빠진다(empty). tiers = 뽑은 티어별 횟수,
 * landed = 실제로 나온 아이템 티어별 횟수(더 낮은 티어로 내려간 것 포함, 필요 진행이 본다)
 */
export function rollGatherOutputs(
  roll: GatherRoll,
  rng: Rng,
): { outputs: { asset: string; qty: bigint }[]; tiers: number[]; landed: number[]; empty: number } {
  const lots = new Map<string, bigint>();
  const tiers = Array.from({ length: GATHER_TIERS }, () => 0);
  const landed = Array.from({ length: GATHER_TIERS }, () => 0);
  const each = BigInt(Math.max(0, roll.yieldPerLot ?? 1));
  let empty = 0;
  for (let i = 0; i < roll.lots; i++) {
    if (roll.successPm !== undefined && rng.nextInt(GATHER_WEIGHT_TOTAL) >= roll.successPm) {
      empty += 1;
      continue;
    }
    let tier =
      roll.selectTier === undefined
        ? rollGatherTier(roll.bands, roll.stat, rng)
        : Math.max(0, Math.min(GATHER_TIERS - 1, roll.selectTier));
    const cap = roll.selectTier === undefined ? roll.tierCap : undefined;
    if (cap && tier > cap.maxTier) {
      const keep = cap.keepAbovePm > 0 && rng.nextInt(GATHER_WEIGHT_TOTAL) < cap.keepAbovePm;
      if (!keep) tier = Math.max(0, cap.maxTier);
    }
    tiers[tier] = (tiers[tier] ?? 0) + 1;
    const asset = pickGatherItem(roll.ladder, tier, rng);
    if (asset === undefined || each === 0n) {
      empty += 1;
      continue;
    }
    const at = roll.ladder.findIndex((choices) => choices.includes(asset));
    landed[at] = (landed[at] ?? 0) + 1;
    lots.set(asset, (lots.get(asset) ?? 0n) + each);
  }
  const unitOf = (asset: string): bigint => {
    const size = roll.lotSize.get(asset) ?? 1n;
    return size > 1n && roll.harvestGrams !== undefined ? roll.harvestGrams : size;
  };
  const outputs: { asset: string; qty: bigint }[] = [];
  for (const choices of roll.ladder)
    for (const asset of choices) {
      const count = lots.get(asset);
      if (count !== undefined) outputs.push({ asset, qty: count * unitOf(asset) });
    }
  return { outputs, tiers, landed, empty };
}
