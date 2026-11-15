// 사이보그 판 효율 묶음의 원자재별 채집 예상 — 사용자 요청 2026-11-12 "효율에 스탯에 따른 원자재별 티어구간이나 최적 작업을 보여줌".
// 실효 팩의 채집 시설(1차 생산 여섯 가지, 팩 차례)마다 판정과 같은 함수로 셈한다. 새 식은 없다:
// - 유효 스탯·해금 티어·진행 속도·수확량·성공 확률 = @terra/sim workerEffects(시뮬 시설·서버 채집 직무 labor/gatherWork.ts와 같은 함수, 시설 레벨 1).
//   컨디션은 채집 직무처럼 설정 칸 condition_cap으로 자른다(clampCondition).
// - 티어 구간 = @terra/shared/gatherMath gatherBandIndex로 고른 팩 gather_tiers 구간(표 하나 — 기획 D-552)의 가중치(‰). select(농장·목장)는 해금 티어 한 칸.
// - 최적 작업 = @terra/shared/unitGuide recommendProduction 첫째(유닛 추천 표와 같은 고르기: 주 + 보조가 큰 차례, 같으면 주 스탯).
// 표시만 하고 판정에 쓰지 않는다. 2차맵 산지 티어 막기(광산 oreTierCapOf)·시설 레벨 보너스는 자리마다라 넣지 않는다.
// 바뀜 (2026-11-14, 기획 D-542 질문 1365 나): 낚시터 물 종류도 자리마다라 기본 줄은 접지 않고, 어류 시설 줄에 물 종류마다(설정 칸 fish_tier_*)
// 접은 확률(@terra/shared/fishWater foldTierPm — 판정 rollGatherOutputs tierRange와 같은 접기)을 함께 싣는다(waters).
import {
  type FacilityEntry,
  type GatherTierEntry,
  type ItemSubcategoryEntry,
  gatherBandOfEntry,
} from "@terra/content";
import { type GatherBand, gatherBandIndex } from "@terra/shared/gatherMath";
import type { PrimaryStat, RosterGather } from "@terra/shared/roster";
import { materialOfFacility } from "@terra/shared/catchment";
import { fishWaterRangeViews, foldTierPm } from "@terra/shared/fishWater";
import { recommendProduction } from "@terra/shared/unitGuide";
import { type SocietyCoefficients, clampCondition, fishTierRangesOf, workerEffects } from "@terra/sim";
import { gatherSettingsOf } from "../labor/gatherWork.ts";
import { productionTypesOf } from "./guide.ts";

/** 채집 예상의 출처(실효 팩 + 설정 칸) */
export interface GatherSheetSource {
  readonly facilities: readonly FacilityEntry[];
  readonly gatherTiers: readonly GatherTierEntry[];
  readonly itemSubcategories: readonly ItemSubcategoryEntry[];
}

/** 시설 레벨(예상은 레벨 1 — 레벨 보너스 0) */
const SHEET_LEVEL = 1;

/** 구간의 T0~T9 가중치(‰, 음수는 0) */
const weightsOf = (band: GatherBand | undefined): number[] =>
  Array.from({ length: 10 }, (_, tier) => Math.max(0, band?.weightsPm[tier] ?? 0));

/**
 * 원자재별 채집 예상(팩 차례). stats = 1차 값(몸 + 장비·버프), condition = 컨디션 합계(모르면 0), society = 설정 칸 실효 계수표.
 * 채집 시설이 없으면 빈 목록
 */
export function gatherSheetOf(
  source: GatherSheetSource,
  stats: Readonly<Record<PrimaryStat, number>>,
  condition: number,
  society: SocietyCoefficients,
): RosterGather[] {
  const types = productionTypesOf(source.facilities);
  if (types.length === 0) return [];
  const settings = gatherSettingsOf(society);
  const clamped = clampCondition(condition, { cap: settings.conditionCap ?? 0 });
  const allBands: GatherBand[] = source.gatherTiers.map(gatherBandOfEntry);
  const best = recommendProduction(stats, types, 1)[0]?.type.facility;
  const subName = new Map(source.itemSubcategories.map((entry) => [entry.id, entry.name]));
  const facilityById = new Map(source.facilities.map((entry) => [entry.id, entry]));
  return types.flatMap((type): RosterGather[] => {
    const gather = facilityById.get(type.facility)?.gather;
    if (!gather) return [];
    const subcategory = gather.subcategory.id;
    const primaryValue = Math.max(0, stats[type.primary]);
    const secondaryValue = Math.max(0, stats[type.secondary]);
    const effects = workerEffects(
      {
        primary: gather.primary,
        secondary: gather.secondary,
        subcategory,
        mode: gather.mode,
        yieldBase: gather.yieldBase,
        yieldPerStatPm: gather.yieldPerStatPm,
        yieldCap: gather.yieldCap,
        catch: gather.catch,
      },
      { level: SHEET_LEVEL, primaryStat: primaryValue, secondaryStat: secondaryValue, condition: clamped },
      settings,
    );
    // 띠 표 하나(기획 D-552 "표 하나")
    const bands = allBands.toSorted((a, b) => a.from - b.from);
    const index = gatherBandIndex(bands, effects.gatherStat);
    const band = bands[index];
    const select = type.mode === "select";
    const name = subName.get(subcategory);
    const tierPm = select
      ? Array.from({ length: 10 }, (_, tier) => (tier === effects.selectTier ? 1000 : 0))
      : weightsOf(band);
    const waters =
      !select && materialOfFacility(type.facility) === "fish"
        ? fishWaterRangeViews(fishTierRangesOf(society.worldSeed)).map((range) => ({
            ...range,
            tierPm: foldTierPm(tierPm, range),
          }))
        : undefined;
    return [
      {
        facility: type.facility,
        name: type.name,
        subcategory,
        material: name ? { ko: name.ko, en: name.en } : { ko: subcategory, en: subcategory },
        mode: type.mode,
        primary: type.primary,
        secondary: type.secondary,
        primaryValue,
        secondaryValue,
        condition: clamped,
        stat: effects.gatherStat,
        bandFrom: band?.from ?? 0,
        bandNext: bands[index + 1]?.from ?? null,
        tierPm,
        ...(waters ? { waters } : {}),
        selectTier: effects.selectTier,
        progress: effects.progress,
        yieldPerLot: effects.yieldPerLot,
        ...(effects.catchPm === undefined ? {} : { catchPm: effects.catchPm }),
        best: type.facility === best,
      },
    ];
  });
}
