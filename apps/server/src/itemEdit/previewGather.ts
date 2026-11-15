// 아이템 편집기 미리 보기 — 채집 티어 추첨(D-506, 49 N43, docs/adr/2026-10-31-economy-core.md "바뀜 (300~302)")과
// 옛 1차 생산 규칙(D-507, 49 N32·N44·P8, 같은 ADR "바뀜 (옛 1차 생산 규칙)").
// 초안이 켜진 채집 시설(팩 facilities gather)의 사다리(같은 중분류)에 있으면: 기준 유닛의 primary + secondary, 시설 Lv1~5의 유효 스탯
// (+ 실효 레벨 보너스 N43), 한 번 캘 때 이 아이템이 나올 확률(만분율). 선택 방식(건물 채집소 — 농장·목장·약초원)이면 레벨마다 그 레벨의 최고
// 티어(2 × 레벨 − 1, 기획 D-566 1721·D-568)에서 고른다(레벨 보너스 없음 — 스탯은 수확 효율·작업량).
// 진행 속도·수확량·이 티어 한 번의 필요 진행과 시간, 스탯 표. 셈은 시뮬과 같은 @terra/sim 함수.
// 사다리 = 그 세계 실효 아이템(초안이 같은 ID를 대신한다) 가운데 켜진 같은 중분류(시설이 함께 내는 중분류 포함, 질문 946 나). 확률표는 팩 gather_tiers(세계 덮어쓰기 없음).
import type { FacilityEntry } from "@terra/content";
import type { ItemGatherPreview, ItemGatherWork, ItemPreviewUnit } from "@terra/shared/itemEditor";
import {
  GATHER_TIERS,
  type GatherBand,
  buildingGatherTier,
  gatherBandIndex,
  gatherChancesPm,
  gatherProgress,
  gatherStat,
  gatherYield,
  tierRequiredProgress,
} from "@terra/sim";
import { gatherCatchPm, gatherSubcategories } from "@terra/shared/gatherMath";

/** 시설 레벨(D-5001 Lv1~5) */
const LEVELS = [1, 2, 3, 4, 5] as const;
/** 스탯 표의 행(주·보조가 같은 값): 새 유닛 10부터 옛 표 끝 240까지 */
const STAT_ROWS = [10, 20, 40, 60, 100, 160, 240] as const;

/** 사다리를 만드는 데 필요한 아이템 칸 */
export interface GatherItem {
  readonly id: string;
  readonly subcategory?: string | undefined;
  readonly tier: number;
  readonly enabled: boolean;
  /** 거래 묶음(기본 단위 개수, 없으면 1). 1보다 크면 기본 단위가 g인 광석(한 번 = N44 g) */
  readonly lotSize?: number | undefined;
}

/** 옛 1차 생산 규칙 계수(세력·사회 계수표 실효 값: N32·N44) */
export interface GatherWorkRules {
  readonly productionMainDivisor: number;
  readonly productionSubYieldPm: number;
  readonly gatherTierProgressBase: number;
  readonly gatherTierProgressStep: number;
  readonly gatherTickMs: number;
  readonly gatherOreGrams: number;
}

export interface GatherContext {
  /** 팩 시설(덮어쓰지 않는다) */
  readonly facilities: readonly FacilityEntry[];
  /** 팩 확률표(파일 차례) */
  readonly bands: readonly GatherBand[];
  /** 레벨 보너스(설정 칸 N43 실효 값) */
  readonly levelBonus: number;
  readonly rules: GatherWorkRules;
}

/** 진행 속도·수확량·이 티어 한 번 시간(옛 1차 생산 규칙, D-507) */
function workOf(
  ctx: GatherContext,
  gather: NonNullable<FacilityEntry["gather"]>,
  tier: number,
  draft: GatherItem,
  unit: { primary: number; secondary: number },
): ItemGatherWork {
  const { rules } = ctx;
  const yieldRule = {
    base: gather.yieldBase ?? 1,
    perStatPm: gather.yieldPerStatPm ?? rules.productionSubYieldPm,
    cap: gather.yieldCap,
  };
  const requiredProgress = tierRequiredProgress(
    tier,
    rules.gatherTierProgressBase,
    rules.gatherTierProgressStep,
  );
  const harvestMs = (progress: number) => Math.ceil((requiredProgress * rules.gatherTickMs) / progress);
  const unitProgress = gatherProgress(unit.primary, rules.productionMainDivisor);
  return {
    divisor: rules.productionMainDivisor,
    yieldBase: yieldRule.base,
    yieldPerStatPm: yieldRule.perStatPm,
    yieldCap: yieldRule.cap ?? null,
    requiredProgress,
    tickMs: rules.gatherTickMs,
    harvestGrams: (draft.lotSize ?? 1) > 1 ? rules.gatherOreGrams : null,
    unitPrimary: unit.primary,
    unitSecondary: unit.secondary,
    unitProgress,
    unitYield: gatherYield(unit.secondary, yieldRule),
    unitHarvestMs: harvestMs(unitProgress),
    rows: STAT_ROWS.map((stat) => {
      const progress = gatherProgress(stat, rules.productionMainDivisor);
      return { stat, progress, yield: gatherYield(stat, yieldRule), harvestMs: harvestMs(progress) };
    }),
  };
}

/** 사다리 중분류 = 주 + 함께 내는 것(질문 946 나 — 목장의 목축 부산물도 목장 사다리에 든다) */
function subsOf(gather: NonNullable<FacilityEntry["gather"]>): string[] {
  return gatherSubcategories({
    subcategory: gather.subcategory.id,
    extraSubcategories: gather.extraSubcategories?.map((ref) => ref.id),
  });
}

/** 초안의 채집 미리 보기. 채집 시설 사다리에 없으면 null */
export function previewGather(
  ctx: GatherContext,
  draft: GatherItem,
  items: readonly GatherItem[],
  unit: ItemPreviewUnit,
): ItemGatherPreview | null {
  const sub = draft.subcategory;
  if (sub === undefined || ctx.bands.length === 0) return null;
  // 시설은 늘 켜짐(켬·끔 없음, 팩 core@32)
  const facility = ctx.facilities.find((entry) => entry.gather && subsOf(entry.gather).includes(sub));
  const gather = facility?.gather;
  if (!facility || !gather) return null;
  const subs = subsOf(gather);
  // 띠 표: 이 시설 주 중분류의 전용 표, 없으면 기본 표(기획 D-540 1217 나)
  const bands = ctx.bands;
  // 사다리: 초안이 같은 ID의 실효 항목을 대신한다(새로 만드는 초안이면 더한다)
  const pool = [...items.filter((item) => item.id !== draft.id), draft];
  const ladder = Array.from({ length: GATHER_TIERS }, (): string[] => []);
  for (const item of pool)
    if (item.enabled && item.subcategory !== undefined && subs.includes(item.subcategory))
      ladder[Math.min(GATHER_TIERS - 1, item.tier)]?.push(item.id);
  const tier = Math.min(GATHER_TIERS - 1, draft.tier);
  const sameTier = ladder[tier]?.length ?? 0;
  const primary = unit.primaries[gather.primary];
  const secondary = unit.primaries[gather.secondary];
  const unitStat = primary + secondary;
  const mode = gather.mode ?? "roll";
  // 선택 방식(건물 채집소): 그 레벨의 최고 티어부터 내려가며 켜진 아이템이 있는 첫 티어가 이 아이템 티어면 그 티어 몫(같은 티어 여럿이면 나눔)
  const unitTier = null;
  const selectBp = (level: number): number => {
    if (!draft.enabled || sameTier === 0) return 0;
    // pickGatherItem과 같은 규칙
    let landedTier = -1;
    for (let t = buildingGatherTier(level); t >= 0 && landedTier < 0; t--)
      if ((ladder[t]?.length ?? 0) > 0) landedTier = t;
    return landedTier === tier ? Math.floor(10_000 / sameTier) : 0;
  };
  const catchPm = gather.catch ? gatherCatchPm(unitStat, gather.catch) : 1000;
  const levels = LEVELS.map((level) => {
    if (mode === "select") return { level, stat: unitStat, band: -1, chanceBp: selectBp(level) };
    const stat = gatherStat(unitStat, level, ctx.levelBonus);
    const { tierPm } = gatherChancesPm(bands, stat, ladder);
    // 성공 확률(낚시터 gather.catch): 성공한 시도만 티어를 뽑는다 → 그 티어 확률 × 성공 ‰
    const landPm = Math.floor(((tierPm[tier] ?? 0) * catchPm) / 1000);
    const chanceBp = draft.enabled && sameTier > 0 ? Math.floor((landPm * 10) / sameTier) : 0;
    return { level, stat, band: gatherBandIndex(bands, stat), chanceBp };
  });
  return {
    facility: facility.id,
    facilityName: { ko: facility.name.ko, en: facility.name.en },
    primary: gather.primary,
    secondary: gather.secondary,
    unitStat,
    levelBonus: mode === "select" ? 0 : ctx.levelBonus,
    levels,
    bands: bands.map((band, index) => {
      const next = bands[index + 1];
      return { from: band.from, to: next ? next.from - 1 : null, weightsPm: [...band.weightsPm] };
    }),
    tier,
    sameTier,
    enabled: draft.enabled,
    mode,
    unitTier,
    work: workOf(ctx, gather, tier, draft, { primary, secondary }),
  };
}
