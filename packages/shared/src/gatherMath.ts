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
  /** 이 구간이 드는 사다리(원자재 중분류 ID, 기획 D-540 1217 나). 없으면 기본 표 */
  readonly ladder?: string | undefined;
}

/**
 * 사다리 하나가 쓰는 띠 표(기획 D-540 1217 나 — 사다리(채집 시설의 주 중분류)마다 띠 표): 그 사다리 전용 구간(ladder = 사다리)이 있으면
 * 그것만, 없으면 ladder 없는 기본 표. 적힌 차례 그대로(팩 검사가 표마다 from이 늘어나는 차례를 지킨다). 섞인 목록을 그대로 구간 함수에
 * 넘기지 않게 판정·미리 보기가 모두 이 함수로 고른다
 */
export function gatherLadderBands(bands: readonly GatherBand[], ladder: string | undefined): GatherBand[] {
  if (ladder !== undefined && bands.some((band) => band.ladder === ladder))
    return bands.filter((band) => band.ladder === ladder);
  return bands.filter((band) => band.ladder === undefined);
}

/** 띠 표가 있는 사다리들(적힌 차례, 기본 표는 빼고) */
export function gatherBandLadders(bands: readonly GatherBand[]): string[] {
  const out: string[] = [];
  for (const band of bands)
    if (band.ladder !== undefined && !out.includes(band.ladder)) out.push(band.ladder);
  return out;
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

/** 선택 + 효율의 해금 티어(49 P8): min(⌊(주 + 보조) ÷ 20⌋, 9) */
export function accessibleTier(primary: number, secondary: number): number {
  const sum = Math.max(0, primary) + Math.max(0, secondary);
  return Math.min(GATHER_TIERS - 1, Math.floor(sum / ACCESSIBLE_TIER_STEP));
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
