// 아이템 편집기 미리 보기 — 채집 티어 추첨(D-506, 49 N43, docs/adr/2026-10-31-economy-core.md "바뀜 (300~302)").
// 초안이 켜진 추첨 시설(팩 facilities gather)의 사다리(같은 중분류)에 있으면: 기준 유닛의 primary + secondary, 시설 Lv1~5의 유효 스탯
// (+ 실효 레벨 보너스 N43), 묶음 하나에서 이 아이템이 나올 확률(만분율). 셈은 시뮬과 같은 @terra/sim gatherStat·gatherChancesPm.
// 사다리 = 그 세계 실효 아이템(초안이 같은 ID를 대신한다) 가운데 켜진 같은 중분류. 확률표는 팩 gather_tiers(세계 덮어쓰기 없음).
import type { FacilityEntry } from "@terra/content";
import type { ItemGatherPreview, ItemPreviewUnit } from "@terra/shared/itemEditor";
import { GATHER_TIERS, type GatherBand, gatherBandIndex, gatherChancesPm, gatherStat } from "@terra/sim";

/** 시설 레벨(D-5001 Lv1~5) */
const LEVELS = [1, 2, 3, 4, 5] as const;

/** 사다리를 만드는 데 필요한 아이템 칸 */
export interface GatherItem {
  readonly id: string;
  readonly subcategory?: string | undefined;
  readonly tier: number;
  readonly enabled: boolean;
}

export interface GatherContext {
  /** 팩 시설(덮어쓰지 않는다) */
  readonly facilities: readonly FacilityEntry[];
  /** 팩 확률표(파일 차례) */
  readonly bands: readonly GatherBand[];
  /** 레벨 보너스(설정 칸 N43 실효 값) */
  readonly levelBonus: number;
}

/** 초안의 채집 추첨 미리 보기. 추첨 시설 사다리에 없으면 null */
export function previewGather(
  ctx: GatherContext,
  draft: GatherItem,
  items: readonly GatherItem[],
  unit: ItemPreviewUnit,
): ItemGatherPreview | null {
  const sub = draft.subcategory;
  if (sub === undefined || ctx.bands.length === 0) return null;
  const facility = ctx.facilities.find((entry) => entry.enabled && entry.gather?.subcategory.id === sub);
  const gather = facility?.gather;
  if (!facility || !gather) return null;
  // 사다리: 초안이 같은 ID의 실효 항목을 대신한다(새로 만드는 초안이면 더한다)
  const pool = [...items.filter((item) => item.id !== draft.id), draft];
  const ladder = Array.from({ length: GATHER_TIERS }, (): string[] => []);
  for (const item of pool)
    if (item.enabled && item.subcategory === sub)
      ladder[Math.min(GATHER_TIERS - 1, item.tier)]?.push(item.id);
  const tier = Math.min(GATHER_TIERS - 1, draft.tier);
  const sameTier = ladder[tier]?.length ?? 0;
  const unitStat = unit.primaries[gather.primary] + unit.primaries[gather.secondary];
  const levels = LEVELS.map((level) => {
    const stat = gatherStat(unitStat, level, ctx.levelBonus);
    const { tierPm } = gatherChancesPm(ctx.bands, stat, ladder);
    const landPm = tierPm[tier] ?? 0;
    const chanceBp = draft.enabled && sameTier > 0 ? Math.floor((landPm * 10) / sameTier) : 0;
    return { level, stat, band: gatherBandIndex(ctx.bands, stat), chanceBp };
  });
  return {
    facility: facility.id,
    facilityName: { ko: facility.name.ko, en: facility.name.en },
    primary: gather.primary,
    secondary: gather.secondary,
    unitStat,
    levelBonus: ctx.levelBonus,
    levels,
    bands: ctx.bands.map((band, index) => {
      const next = ctx.bands[index + 1];
      return { from: band.from, to: next ? next.from - 1 : null, weightsPm: [...band.weightsPm] };
    }),
    tier,
    sameTier,
    enabled: draft.enabled,
  };
}
