// 1차 생산 셈(난수 없는 정수 함수) — 기획 D-506·D-507, 49 N32·N43·N44·P8, docs/adr/2026-10-31-economy-core.md "바뀜 (300~302)"·
// "바뀜 (옛 1차 생산 규칙)", docs/adr/2026-11-11-production-six.md. 판정(@terra/sim economy/gather.ts — 추첨·아이템 고르기)과 화면 미리 보기
// (생산 편집기 /dev/production, 유닛 추천)가 같은 함수를 쓴다(@terra/sim이 이 파일을 다시 내보낸다 — 식은 여기 하나). 정수 연산만 쓴다.

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

/** 해금 티어 한 칸의 스탯 폭(49 P8 "÷ 20", 옛 calcAccessibleTier) */
export const ACCESSIBLE_TIER_STEP = 20;

/** 진행 속도(49 N32): 틱마다 진행 = max(1, ⌊주 스탯 ÷ 나눔⌋). 나눔 = 설정 칸 n32_main_divisor(옛 20) */
export function gatherProgress(primary: number, divisor: number): number {
  return Math.max(1, Math.floor(Math.max(0, primary) / Math.max(1, divisor)));
}

/** 수확량 규칙(시설마다, 옛 gather_type_config) */
export interface GatherYieldRule {
  /** 기본 개수(옛 yield_base 1) */
  readonly base: number;
  /** 보조 스탯 1점당 추가 개수(‰, 옛 yield_per_stat 0.10 → 100) */
  readonly perStatPm: number;
  /** 상한(옛 yield_cap). 없으면 상한 없음 */
  readonly cap?: number | undefined;
}

/** 수확량: 한 번 캘 때 개수 = min(상한, 기본 + ⌊보조 × ‰ ÷ 1000⌋), 0 아래로 가지 않는다 */
export function gatherYield(secondary: number, rule: GatherYieldRule): number {
  const raw =
    Math.max(0, rule.base) + Math.floor((Math.max(0, secondary) * Math.max(0, rule.perStatPm)) / 1000);
  return rule.cap === undefined ? raw : Math.min(Math.max(0, rule.cap), raw);
}

/** 티어별 필요 진행(49 N44, 옛 tierRequiredProgress): max(기본, 기본 + 티어 × 걸음). 옛 값 30·30 → T0 30 … T9 300 */
export function tierRequiredProgress(tier: number, base: number, step: number): number {
  return Math.max(base, base + Math.max(0, tier) * step);
}

/** 선택 + 효율의 해금 티어(49 P8): min(⌊(주 + 보조) ÷ 20⌋, 9). 판정은 건물 채집소 규칙(buildingGatherTier)으로 바뀌었다 — 옛 값 비교·시험용 */
export function accessibleTier(primary: number, secondary: number): number {
  const sum = Math.max(0, primary) + Math.max(0, secondary);
  return Math.min(GATHER_TIERS - 1, Math.floor(sum / ACCESSIBLE_TIER_STEP));
}

/**
 * 건물 채집소(농장·목장·약초원 — 선택 방식 mode "select") 규칙(기획 D-566 1721·D-567, docs/adr/2026-11-15-gather-object-tiers.md
 * "바뀜 (2026-11-15, D-566·D-567)"). 값은 설정 칸(팩 tuning building_gather_*·plot_module_*) [임시]
 */
export interface BuildingGatherRules {
  /** 티어 하나의 권장 스탯 합(주 + 보조, 49 P8을 거꾸로 — 20 × 티어) */
  readonly statPerTier: number;
  /** 권장 합에서 모자란 1점마다 깎는 수확 효율(‰, 25) */
  readonly shortStepPm: number;
  /** 수확 효율 바닥(‰, 300) */
  readonly floorPm: number;
  /** 면적 모듈 하나가 더하는 수확(‰, 기획 D-567 "모듈을 추가하여 면적을 넓힌다") */
  readonly plotAreaPm: number;
  /** 시설 레벨 하나마다 붙일 수 있는 면적 모듈 수 */
  readonly plotSlotsPerLevel: number;
}

/** 설정 칸이 없을 때의 출발값(팩 tuning과 같다 [임시]) */
export const DEFAULT_BUILDING_GATHER: BuildingGatherRules = {
  statPerTier: 20,
  shortStepPm: 25,
  floorPm: 300,
  plotAreaPm: 200,
  plotSlotsPerLevel: 1,
};

/**
 * 건물 채집소가 기르는 티어 = 건물 레벨의 최고 티어(기획 D-566 1721 = D-5001 "Lv1 T1 … Lv5 T9", 2 × 레벨 − 1). 레벨 1 아래는 T0.
 * 이 셋만 D-506 "채집 시설 레벨은 티어를 막지 않는다"의 예외다(다른 채집 시설은 확률표)
 */
export function buildingGatherTier(level: number): number {
  return Math.max(0, Math.min(GATHER_TIERS - 1, Math.trunc(level) * 2 - 1));
}

/** 권장 스탯 합 미달 효율(‰): max(바닥, 1000 − 걸음 × max(0, 권장 × 티어 − (주 + 보조))). 넘쳐도 1000(보너스는 진행 속도·수확량에 이미 든다) */
export function buildingGatherEfficiencyPm(
  statSum: number,
  tier: number,
  rules: BuildingGatherRules,
): number {
  const need = Math.max(0, rules.statPerTier) * Math.max(0, tier);
  const short = Math.max(0, need - Math.max(0, statSum));
  const floor = Math.max(0, Math.min(1000, rules.floorPm));
  return Math.max(floor, 1000 - Math.max(0, rules.shortStepPm) * short);
}

/** 면적 모듈 자리 수 = 레벨 × 레벨당 수(레벨 0 = 짓는 중이면 0) */
export function plotSlots(level: number, rules: BuildingGatherRules): number {
  return Math.max(0, Math.trunc(level)) * Math.max(0, Math.trunc(rules.plotSlotsPerLevel));
}

/** 면적 배율(‰) = 1000 + 붙은 모듈 수 × 모듈 하나 몫(같은 모듈 여럿은 모두 겹친다 — D-564 1681과 같은 뜻) */
export function plotAreaPm(plots: number, rules: BuildingGatherRules): number {
  return 1000 + Math.max(0, Math.trunc(plots)) * Math.max(0, rules.plotAreaPm);
}

/** 건물 채집소 한 번 수확의 배율(‰) = 효율 × 면적 ÷ 1000 */
export function buildingYieldPm(
  statSum: number,
  tier: number,
  plots: number,
  rules: BuildingGatherRules,
): number {
  return Math.floor((buildingGatherEfficiencyPm(statSum, tier, rules) * plotAreaPm(plots, rules)) / 1000);
}

/** 성공 확률 규칙(낚시터, 옛 fishing_config): 기본·상한·스탯 몫(‰)과 스탯 몫이 다 차는 스탯 합 */
export interface GatherCatchRule {
  readonly basePm: number;
  readonly maxPm: number;
  readonly statPm: number;
  readonly fullStat: number;
}

/**
 * 한 번 시도의 성공 ‰(옛 BuildingGatherEngine.js 715~716: min(상한, 기본 + 스탯 몫 × min(1, (주 + 보조) ÷ 200))):
 * min(maxPm, basePm + ⌊statPm × min(fullStat, 스탯 합) ÷ fullStat⌋), 0~1000으로 자른다
 */
export function gatherCatchPm(statSum: number, rule: GatherCatchRule): number {
  const full = Math.max(1, rule.fullStat);
  const part = Math.floor((Math.max(0, rule.statPm) * Math.min(full, Math.max(0, statSum))) / full);
  return Math.max(0, Math.min(GATHER_WEIGHT_TOTAL, Math.min(rule.maxPm, rule.basePm + part)));
}

/**
 * 유효 스탯 = max(0, 일꾼 1차 + 2차 + 컨디션) + 레벨 보너스 × (레벨 − 1). 레벨 1 아래는 보너스 0.
 * 컨디션(관리 보너스, D-534 — 선호에 맞는 주거·음식으로 ±, 합계 상한은 부르는 쪽이 자른 값)은 유효 스탯에 더한다(D-502 더하기). 없으면 0
 */
export function gatherStat(workerStat: number, level: number, bonusPerLevel: number, condition = 0): number {
  return Math.max(0, workerStat + condition) + Math.max(0, bonusPerLevel) * Math.max(0, level - 1);
}

/**
 * 컨디션을 두 스탯에 반씩 나눠 더한 짝(기획 D-535 1154 나 — 채집 셈 전부에 컨디션: 진행 속도 = 주, 수확량 = 보조, 해금 티어·성공 확률 = 둘의 합).
 * 주 스탯이 ⌊컨디션 ÷ 2⌋(0 쪽 버림), 보조 스탯이 나머지를 받아 합이 컨디션과 같다. 0 아래로 가지 않는다. 추첨 유효 스탯(gatherStat)은 합에 그대로 더한다
 */
export function conditionedStats(primary: number, secondary: number, condition: number): [number, number] {
  const total = Math.trunc(condition);
  const half = Math.trunc(total / 2);
  return [Math.max(0, primary + half), Math.max(0, secondary + total - half)];
}

/** 유효 스탯이 드는 구간 번호(from이 스탯 이하인 마지막 구간, 첫 구간보다 작으면 0). 구간이 없으면 -1 */
export function gatherBandIndex(bands: readonly GatherBand[], stat: number): number {
  let found = bands.length === 0 ? -1 : 0;
  for (let i = 0; i < bands.length; i++) if ((bands[i]?.from ?? 0) <= stat) found = i;
  return found;
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

/** 함께 내는 중분류 수 상한(팩 facilities.gather.extraSubcategories, 질문 946 나) */
export const GATHER_EXTRA_SUBCATEGORIES_MAX = 4;

/** 사다리 중분류를 읽는 채집 칸 모양(팩 줄·시뮬 목록·서버 정의가 모두 이 두 칸을 가진다) */
export interface GatherSubcategorySource {
  /** 주 사다리 중분류 */
  readonly subcategory: string;
  /** 함께 내는 중분류(질문 946 나 — 목장 = 축산물 + 목축 부산물, 옛 RANCH_T0~T9 30개). 없으면 주 중분류 하나 */
  readonly extraSubcategories?: readonly string[] | undefined;
}

/**
 * 채집 사다리에 드는 중분류(주 중분류 + 함께 내는 중분류, 적힌 차례, 겹치는 것은 한 번). 사다리는 티어마다 이 중분류들의 켜진 아이템을
 * 팩 차례로 모은 것이다 — 추첨(roll)은 뽑은 티어에서, 선택(select)은 해금 티어에서 그 묶음 가운데 하나를 고른다(docs/adr/2026-11-11-production-six.md
 * "바뀜 (2026-11-11, 946·947)")
 */
export function gatherSubcategories(gather: GatherSubcategorySource): string[] {
  const out = [gather.subcategory];
  for (const sub of gather.extraSubcategories ?? []) if (!out.includes(sub)) out.push(sub);
  return out;
}

/** 사다리 키(중분류를 "+"로 잇는다 — 중분류 하나면 그 ID 그대로라 옛 키와 같다). 시뮬·서버가 사다리를 붙잡아 둘 때 쓴다 */
export function gatherLadderKey(gather: GatherSubcategorySource): string {
  return gatherSubcategories(gather).join("+");
}
