// 사이보그 판 효율 묶음의 원자재별 채집 예상 — 사용자 요청 2026-11-12 "효율에 스탯에 따른 원자재별 티어구간이나 최적 작업을 보여줌".
// 실효 팩의 채집 시설(1차 생산 여섯 가지, 팩 차례)마다 판정과 같은 함수로 셈한다. 새 식은 없다:
// - 유효 스탯·해금 티어·진행 속도·수확량·성공 확률 = @terra/sim workerEffects(시뮬 시설·서버 채집 직무 labor/gatherWork.ts와 같은 함수, 시설 레벨 1).
//   컨디션은 채집 직무처럼 설정 칸 condition_cap으로 자른다(clampCondition).
// - 티어 구간 = @terra/shared/gatherMath gatherBandIndex로 고른 팩 gather_tiers 구간(표 하나 — 기획 D-552)의 가중치(‰). select(농장·목장)는 해금 티어 한 칸.
// - 최적 작업 = @terra/shared/unitGuide recommendProduction 첫째(유닛 추천 표와 같은 고르기: 주 + 보조가 큰 차례, 같으면 주 스탯).
// 표시만 하고 판정에 쓰지 않는다. 2차맵 산지 티어 막기(광산 oreTierCapOf)·시설 레벨 보너스는 자리마다라 넣지 않는다.
// 바뀜 (2026-11-14, 기획 D-542 질문 1365 나): 낚시터 물 종류도 자리마다라 기본 줄은 접지 않고, 어류 시설 줄에 물 종류마다(설정 칸 fish_tier_*)
// 접은 확률(@terra/shared/fishWater foldTierPm — 판정 rollGatherOutputs tierRange와 같은 접기)을 함께 싣는다(waters).
// 바뀜 (2026-11-15, 기획 D-562 1562·1569, D-556 1255·1256): 물 종류 범위는 설정 칸이 아니라 팩 오브젝트 범위에서 끌어낸다(gather/npcTiers.ts).
// 유닛이 일하는 채집 시설이면 그 레벨(레벨 보너스)로 센다. 최적 작업 = 시간당 기대 금액(gatherValue.ts — 시설 오브젝트 묶음 위 끝·같은 티어 비중,
// 시세 = 그 유닛이 있는 도시 거래소의 마지막 체결가, 없으면 시작 시세)이 가장 큰 일. 금액이 모두 0이면 옛 고르기(주 + 보조).
import {
  type FacilityEntry,
  type GatherTierEntry,
  type ItemEntry,
  type ItemSubcategoryEntry,
  gatherBandOfEntry,
} from "@terra/content";
import { type GatherBand, gatherBandIndex, gatherSubcategories } from "@terra/shared/gatherMath";
import type { PrimaryStat, RosterGather } from "@terra/shared/roster";
import { materialOfFacility } from "@terra/shared/catchment";
import { fishWaterRangeViews, foldTierPm } from "@terra/shared/fishWater";
import { npcFishRanges, npcTierRollOf } from "@terra/shared/npcGatherTiers";
import { recommendProduction } from "@terra/shared/unitGuide";
import { type SocietyCoefficients, clampCondition, workerEffects } from "@terra/sim";
import type { GatherKind } from "../gather/kinds.ts";
import { npcTiersOfKinds } from "../gather/npcTiers.ts";
import { gatherSettingsOf } from "../labor/gatherWork.ts";
import { gatherValuePerHour } from "./gatherValue.ts";
import { productionTypesOf } from "./guide.ts";

/** 유닛 자리(기획 D-562 1569·D-556 1255): 일하는 채집 시설과 그 도시 거래소 시세 */
export interface GatherPlace {
  /** 일하는 채집 시설(시설 ID·레벨). 없으면 모든 줄 레벨 1 */
  readonly workplace?: { readonly facility: string; readonly level: number } | undefined;
  /** 아이템 ID → 그 도시 거래소 마지막 체결가(없으면 undefined — 시작 시세) */
  readonly lastPrice: (item: string) => bigint | undefined;
  /** 그 도시 화폐 코드(모르면 없음) */
  readonly currency?: string | undefined;
}

/** 채집 예상의 출처(실효 팩 + 설정 칸) */
export interface GatherSheetSource {
  readonly facilities: readonly FacilityEntry[];
  readonly gatherTiers: readonly GatherTierEntry[];
  readonly itemSubcategories: readonly ItemSubcategoryEntry[];
  /** 아이템(사다리·시작 시세 — 기대 금액). 없으면 금액을 세지 않는다 */
  readonly items?: readonly ItemEntry[] | undefined;
  /** 채집 오브젝트 종류(시설 묶음 위 끝·같은 티어 비중·낚시터 물 종류 범위). 없으면 접지 않는다 */
  readonly kinds?: readonly GatherKind[] | undefined;
  /** 유닛 자리(유닛 ID → 일터·도시 시세). 없으면 레벨 1·시작 시세 */
  readonly place?: ((unitId: number) => GatherPlace | undefined) | undefined;
}

/** 일터가 아닌 줄의 시설 레벨(레벨 보너스 0) */
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
  unitId?: number | null,
): RosterGather[] {
  const types = productionTypesOf(source.facilities);
  if (types.length === 0) return [];
  const settings = gatherSettingsOf(society);
  const clamped = clampCondition(condition, { cap: settings.conditionCap ?? 0 });
  const allBands: GatherBand[] = source.gatherTiers.map(gatherBandOfEntry);
  const fallbackBest = recommendProduction(stats, types, 1)[0]?.type.facility;
  const subName = new Map(source.itemSubcategories.map((entry) => [entry.id, entry.name]));
  const facilityById = new Map(source.facilities.map((entry) => [entry.id, entry]));
  const items = source.items ?? [];
  const itemById = new Map(items.map((item) => [item.id, item]));
  const tiers = npcTiersOfKinds(source.kinds ?? [], (id) => itemById.get(id)?.tier);
  const fishRanges = npcFishRanges(tiers);
  const place = unitId === undefined || unitId === null ? undefined : source.place?.(unitId);
  const priceOf = (item: string) => {
    const last = place?.lastPrice(item);
    return last === undefined
      ? { price: BigInt(itemById.get(item)?.startPrice ?? 0), market: false }
      : { price: last, market: true };
  };
  const rows = types.flatMap((type): (RosterGather & { readonly perHour: bigint })[] => {
    const gather = facilityById.get(type.facility)?.gather;
    if (!gather) return [];
    const subcategory = gather.subcategory.id;
    const primaryValue = Math.max(0, stats[type.primary]);
    const secondaryValue = Math.max(0, stats[type.secondary]);
    const level =
      place?.workplace?.facility === type.facility ? Math.max(1, place.workplace.level) : SHEET_LEVEL;
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
      { level, primaryStat: primaryValue, secondaryStat: secondaryValue, condition: clamped },
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
      !select && fishRanges && materialOfFacility(type.facility) === "fish"
        ? fishWaterRangeViews(fishRanges).map((range) => ({
            ...range,
            tierPm: foldTierPm(tierPm, range),
          }))
        : undefined;
    // 시간당 기대 금액(gatherValue.ts): 시설 사다리(켜진 아이템, 팩 차례)·오브젝트 묶음(자리를 모르면 산지·모든 물 묶음)·그 도시 시세
    const subs = new Set(
      gatherSubcategories({
        subcategory,
        extraSubcategories: gather.extraSubcategories?.map((sub) => sub.id),
      }),
    );
    const ladder = Array.from({ length: 10 }, (): string[] => []);
    for (const item of items)
      if (item.enabled && item.subcategory && subs.has(item.subcategory.id))
        ladder[Math.min(9, Math.max(0, item.tier))]?.push(item.id);
    const roll = npcTierRollOf(tiers.get(type.facility), {});
    const value = gatherValuePerHour({
      tierPm,
      maxTier: roll.tierRange?.max,
      ladder,
      weights: roll.weights,
      priceOf,
      yieldPerLot: effects.yieldPerLot,
      progress: effects.progress,
      catchPm: effects.catchPm,
      tierProgressBase: settings.tierProgressBase ?? 30,
      tierProgressStep: settings.tierProgressStep ?? 30,
      tickMs: settings.tickMs ?? 60_000,
    });
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
        level,
        ...(items.length > 0
          ? {
              valuePerHour: String(value.perHour),
              priceSource: value.market ? ("market" as const) : ("start" as const),
              ...(place?.currency ? { currency: place.currency } : {}),
            }
          : {}),
        best: false,
        perHour: value.perHour,
      },
    ];
  });
  // 최적 작업 = 시간당 기대 금액이 가장 큰 일(같으면 앞 줄), 모두 0이면 옛 고르기
  let best: string | undefined;
  let top = 0n;
  for (const row of rows)
    if (row.perHour > top) {
      top = row.perHour;
      best = row.facility;
    }
  best ??= fallbackBest;
  return rows.map(({ perHour: _perHour, ...row }) => ({ ...row, best: row.facility === best }));
}
