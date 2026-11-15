// 채집·채굴 티어 추첨 — 기획 D-506(질문 300~302), 49 N43, docs/adr/2026-10-31-economy-core.md "바뀜 (300~302)".
// 옛 프로젝트 규칙(AntiGravt01 GatherResolverEngine.resolveGatherResult)을 정수 ‰로 옮겼다.
// - 유효 스탯 = 일꾼의 1차 + 2차(시설마다: 광산 STR + VIT, 벌목 DEX + STR, 약초 INT + WIS, 낚시 AGI + DEX)
//   + 시설 레벨 보너스(N43 n43_level_bonus × (레벨 − 1), [임시] 10 → 5, 기획 D-535 1155 나). 시설 레벨은 티어를 막지 않는다(D-506, 제작 시설은 D-5001 그대로).
// - 구간: from이 유효 스탯 이하인 마지막 구간(파일 차례 = from 차례, 첫 구간 from 0). 그 구간 가중치(‰, T0~T9, 합 1000)로 티어 하나.
// - 아이템: 그 분류(중분류 — 시설이 여럿을 적으면 그 모두, 질문 946 나)의 그 티어 아이템. 없으면 더 낮은 티어로 내려간다. 같은 티어에 여럿이면 팩 차례 가운데 고르게 하나
//   [Assumed: 옛 규칙이 같은 티어 여럿을 어떻게 골랐는지 확인하지 않았다]. T0까지 없으면 그 묶음은 아무것도 나오지 않는다.
// - 산출 묶음 하나마다 한 번 뽑는다(옛 채집 한 번 = 묶음 1개). 난수는 부르는 쪽이 준다(시드 흐름).
// 옛 1차 생산 규칙(기획 D-507, 49 N32·P8, docs/research/2026-11-02-old-primary-production.md, ADR economy-core "바뀜 (옛 1차 생산 규칙)"):
// - 진행 속도: 틱마다 진행 = max(1, ⌊주 스탯 ÷ 20⌋)(옛 BuildingGatherEngine.js 291·527). 시뮬은 시설의 시간당 작업량에 곱한다.
// - 수확량: 한 번 캘 때 개수 = min(상한, 기본 + ⌊보조 스탯 × 비율⌋)(옛 gather_type_config yield_base·yield_per_stat·yield_cap,
//   migrations/index.js 642~736). 옛 마지막 코드는 1개 고정이었고 기획 D-507이 켰다. 광석은 개수 = 묶음 수(1개 = 1kg 묶음, 49 N44).
// - 선택 + 효율(건물 채집소 — 농장·목장·약초원): 부르는 쪽이 준 티어(selectTier)에서 켜진 아이템이 있는 가장 높은 티어를 고르고 같은 티어
//   여럿이면 고르게(옛 ORDER BY tier DESC, RANDOM()). 추첨하지 않는다. 바뀜 (기획 D-566 1721·D-567): 티어 = 건물 레벨의 최고 티어(옛 49 P8
//   해금 티어 대신), 수확 배율 yieldPm(권장 스탯 미달 효율 × 면적 모듈)을 한 번 캘 때 개수에 곱한다(‰ 나머지는 그때만 난수 하나로 올림·버림).
// - 성공 확률(낚시터, docs/adr/2026-11-11-production-six.md): 한 번 시도마다 성공 ‰를 먼저 굴리고 성공한 번만 티어를 뽑는다
//   (옛 BuildingGatherEngine.js runFishingWorkers 715~735, fishing_config 0.30·0.80·0.50).
// - 낚시터 티어 범위(기획 D-542 질문 1365 나): 뽑은 티어를 그 자리 물 종류의 범위로 접는다(GatherRoll.tierRange, @terra/shared/fishWater).
// - 오브젝트 규칙(기획 D-552 — docs/adr/2026-11-15-gather-object-tiers.md): 확률표는 하나(사다리마다 띠 표 없음). 오브젝트 범위(tierRange)는
//   선택 방식에도 걸고, 그 티어에 대표 아이템(prefer)이 있으면 그것을 낸다. 굴림표 오브젝트(table)도 같은 함수가 가중치로 고른다 — 직접 채집과
//   채집소 일꾼이 같은 함수를 쓴다.
// - 바뀜 (기획 D-562 1561 "각각의 비중은 오브젝트마다 다름 에디터에서 조정가능"): 오브젝트마다 아이템별 비중(weights)을 둘 수 있다. 뽑은 티어에
//   비중을 적은 아이템이 하나라도 있으면 그 티어는 비중대로 고른다(적지 않은 아이템은 0). 비중이 없는 티어는 옛 규칙(대표 아이템 → 고르게).
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
  DEFAULT_BUILDING_GATHER,
  GATHER_TIERS,
  GATHER_WEIGHT_TOTAL,
  accessibleTier,
  buildingGatherEfficiencyPm,
  buildingGatherTier,
  buildingYieldPm,
  chosenGatherTier,
  recommendGatherTier,
  plotAreaPm,
  plotSlots,
  conditionedStats,
  gatherBandIndex,
  gatherCatchPm,
  gatherChancesPm,
  gatherLadderKey,
  gatherProgress,
  gatherStat,
  gatherSubcategories,
  gatherYield,
  tierRequiredProgress,
  type BuildingGatherRules,
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
 * 바뀜(사용자 결정 2026-11-12 "건축시 목재와 석재는 필수이다" — 기본 재료 바닥 보장, 팩 core@77): 0~59 구간 T1(석재 등)을 350‰로 올렸다.
 * 바뀜(기획 D-540 1217 나, 팩 core@83): 사다리마다 띠 표 — 올린 표(0~39 T0 500·T1 350, 40~59 T0 500·T1 350·T2 120)는 광석 사다리(ore) 전용이고,
 * 기본 표(목재·약초·어류 등)는 옛 값(0~39 T0 700·T1 150, 40~59 T0 650·T1 220·T2 100)으로 돌아갔다 — 소나무 원목(목재 T0)이 줄지 않는다(D-537 뜻).
 * 바뀜(기획 D-552 "표 하나", 팩 core@98): 광석 전용 표를 지웠다. 기본 표 하나만 남는다(석재 바닥은 오브젝트 범위가 맡는다).
 */
const UPPER_BANDS: readonly GatherBand[] = [
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
export const TEST_GATHER_BANDS: readonly GatherBand[] = [
  { from: 0, weightsPm: [700, 150, 100, 50, 0, 0, 0, 0, 0, 0] },
  { from: 20, weightsPm: [700, 150, 100, 50, 0, 0, 0, 0, 0, 0] },
  { from: 40, weightsPm: [650, 220, 100, 30, 0, 0, 0, 0, 0, 0] },
  ...UPPER_BANDS,
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

/** 그 티어 아이템 가운데 비중을 적은 것이 있으면 비중대로 하나(합이 0이면 undefined — 옛 규칙으로). 하나뿐이면 rng를 쓰지 않는다 */
function pickWeighted(
  choices: readonly string[],
  weights: ReadonlyMap<string, number>,
  rng: Rng,
): string | undefined {
  let total = 0;
  const listed: { asset: string; weight: number }[] = [];
  for (const asset of choices) {
    const weight = Math.max(0, Math.trunc(weights.get(asset) ?? 0));
    if (weight > 0) listed.push({ asset, weight });
    total += weight;
  }
  if (total <= 0) return undefined;
  if (listed.length === 1) return listed[0]?.asset;
  let left = rng.nextInt(total);
  for (const row of listed) {
    if (left < row.weight) return row.asset;
    left -= row.weight;
  }
  return listed[0]?.asset;
}

/**
 * 뽑은 티어의 아이템(ladder[티어] = 그 티어의 켜진 아이템 자산, 팩 차례). 없으면 더 낮은 티어, T0까지 없으면 undefined.
 * 그 티어에 비중(weights, 오브젝트마다 아이템별 — 기획 D-562 1561)을 적은 아이템이 있으면 비중대로. 아니면 prefer(오브젝트 대표 아이템,
 * 기획 D-552)가 있으면 그것(rng를 쓰지 않는다). 아니면 같은 티어에 여럿이면 rng로 고르게 하나(하나면 rng를 쓰지 않는다)
 */
export function pickGatherItem(
  ladder: readonly (readonly string[])[],
  tier: number,
  rng: Rng,
  prefer?: string,
  weights?: ReadonlyMap<string, number>,
): string | undefined {
  for (let t = Math.min(tier, ladder.length - 1); t >= 0; t--) {
    const choices = ladder[t] ?? [];
    if (weights && weights.size > 0 && choices.some((asset) => weights.has(asset))) {
      const weighted = pickWeighted(choices, weights, rng);
      if (weighted !== undefined) return weighted;
    }
    if (prefer !== undefined && choices.includes(prefer)) return prefer;
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
  /** 선택 + 효율(건물 채집소): 있으면 추첨하지 않고 이 티어(buildingGatherTier — 건물 레벨 최고 티어, D-566 1721)에서 고른다 */
  readonly selectTier?: number | undefined;
  /** 한 번 캘 때 나오는 개수(gatherYield, 없으면 1). 고른 아이템이 이만큼 나온다 */
  readonly yieldPerLot?: number | undefined;
  /**
   * 한 번 캘 때 개수에 곱하는 배율(‰ — 건물 채집소 효율 × 면적, buildingYieldPm, D-566 1721·D-567). 개수 × ‰ ÷ 1000의 나머지는 그 번에 난수
   * 하나로 올린다(나머지가 0이면 난수를 쓰지 않는다). 0개가 된 번은 빈 번이다. 없으면 배율 없음(난수를 더 쓰지 않는다)
   */
  readonly yieldPm?: number | undefined;
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
  /**
   * 티어 범위(오브젝트 범위 — 기획 D-552, 낚시터 물 종류 — D-542 질문 1365 나). 뽑은 티어(tierCap 뒤, 선택 방식이면 해금 티어)를 범위 안으로
   * 접는다(아래는 min으로 올리고 위는 max로 내린다. 난수를 더 쓰지 않는다). 없으면 접지 않는다(다른 시설의 결과는 그대로)
   */
  readonly tierRange?: { readonly min: number; readonly max: number } | undefined;
  /** 대표 아이템 자산(오브젝트, 기획 D-552): 그 티어에 있으면 그것이 나온다(pickGatherItem). 없으면 고르게 */
  readonly prefer?: string | undefined;
  /**
   * 아이템별 비중(오브젝트마다, 기획 D-562 1561 — 자산 → 비중). 뽑은 티어에 적은 아이템이 있으면 그 티어는 비중대로(적지 않은 아이템은 0).
   * 없거나 그 티어에 적은 것이 없으면 prefer → 고르게(옛 규칙)
   */
  readonly weights?: ReadonlyMap<string, number> | undefined;
  /**
   * 굴림표(오브젝트 table — 난파선·고래 무리, 기획 D-540 1222 나): 있으면 티어를 뽑지 않고 가중치(합 0이면 첫 줄)로 하나를 고른다. 나온 티어 =
   * 사다리 안 자리(없으면 T0 — 필요 진행이 본다)
   */
  readonly table?: readonly { readonly asset: string; readonly weightPm: number }[] | undefined;
}

/** 한 번 캘 때 개수 × 배율(‰). 나머지(‰)는 난수 하나로 올린다(나머지 0이면 난수를 쓰지 않는다) */
function scaleLot(each: bigint, yieldPm: number, rng: Rng): bigint {
  const total = each * BigInt(Math.max(0, Math.trunc(yieldPm)));
  const rest = Number(total % 1000n);
  const whole = total / 1000n;
  return rest > 0 && rng.nextInt(1000) < rest ? whole + 1n : whole;
}

/** 굴림표에서 하나(가중치 합이 0이면 첫 줄, 표가 비면 undefined) */
function pickTableAsset(
  table: readonly { readonly asset: string; readonly weightPm: number }[],
  rng: Rng,
): string | undefined {
  let total = 0;
  for (const row of table) total += Math.max(0, row.weightPm);
  if (total <= 0) return table[0]?.asset;
  let left = rng.nextInt(total);
  for (const row of table) {
    const weight = Math.max(0, row.weightPm);
    if (left < weight) return row.asset;
    left -= weight;
  }
  return table[0]?.asset;
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
    if (roll.table && roll.table.length > 0) {
      const asset = pickTableAsset(roll.table, rng);
      if (asset === undefined || each === 0n) {
        empty += 1;
        continue;
      }
      const at = Math.max(
        0,
        roll.ladder.findIndex((choices) => choices.includes(asset)),
      );
      tiers[at] = (tiers[at] ?? 0) + 1;
      landed[at] = (landed[at] ?? 0) + 1;
      lots.set(asset, (lots.get(asset) ?? 0n) + each);
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
    const range = roll.tierRange;
    if (range) tier = Math.max(0, Math.min(GATHER_TIERS - 1, Math.min(Math.max(tier, range.min), range.max)));
    tiers[tier] = (tiers[tier] ?? 0) + 1;
    const asset = pickGatherItem(roll.ladder, tier, rng, roll.prefer, roll.weights);
    if (asset === undefined || each === 0n) {
      empty += 1;
      continue;
    }
    const at = roll.ladder.findIndex((choices) => choices.includes(asset));
    landed[at] = (landed[at] ?? 0) + 1;
    const qty = roll.yieldPm === undefined ? each : scaleLot(each, roll.yieldPm, rng);
    if (qty > 0n) lots.set(asset, (lots.get(asset) ?? 0n) + qty);
  }
  // 사다리 밖 자산(굴림표 줄)은 사다리 차례 뒤에 처음 나온 차례로
  const ordered = new Set<string>();
  for (const choices of roll.ladder) for (const asset of choices) if (lots.has(asset)) ordered.add(asset);
  for (const asset of lots.keys()) ordered.add(asset);
  const unitOf = (asset: string): bigint => {
    const size = roll.lotSize.get(asset) ?? 1n;
    return size > 1n && roll.harvestGrams !== undefined ? roll.harvestGrams : size;
  };
  const outputs: { asset: string; qty: bigint }[] = [];
  for (const asset of ordered) {
    const count = lots.get(asset);
    if (count !== undefined) outputs.push({ asset, qty: count * unitOf(asset) });
  }
  return { outputs, tiers, landed, empty };
}
