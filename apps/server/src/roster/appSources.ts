// 유닛·사이보그 화면 출처를 app.ts에서 잇는다(app.ts 1,000줄 상한 — 여기서 만든다).
// - 사이보그 판 채집 예상(gatherSheet.ts): 실효 팩 채집 시설·티어 구간·중분류·아이템 + 채집 오브젝트 종류(시설 묶음 범위·물 종류 범위, 기획 D-562
//   1562) + 유닛 자리(일하는 채집 시설 레벨 — D-556 1255, 그 도시 거래소 마지막 체결가 — D-562 1569).
// - 유닛 추천 표(guide.ts): 실효 팩 시설·전투 클래스 + 설정 칸 분류 문턱 + 낚시터 물 종류 범위(팩 오브젝트에서 끌어냄, D-562 1562 — 옛 설정 칸
//   fish_tier_*는 없앴다).
import type { ContentEditState } from "../contentEdit/state.ts";
import type { GatherKind } from "../gather/kinds.ts";
import { fishRangesOfKinds } from "../gather/npcTiers.ts";
import { currencyCode } from "../market/fxViews.ts";
import type { TuningState } from "../tuning/state.ts";
import { ASSET_CREDIT } from "../world/settlement.ts";
import type { World } from "../world/world.ts";
import type { GatherPlace, GatherSheetSource } from "./gatherSheet.ts";
import type { UnitGuideSource } from "./guide.ts";

/** 유닛 자리 읽기(세계가 준비되고 NPC 도시 경제가 돌 때만 시세가 있다) */
export function worldGatherPlace(world: World | undefined): (unitId: number) => GatherPlace | undefined {
  return (unitId) => {
    if (!world || world.status().state !== "ready") return undefined;
    const place = world.persistence?.facilities.unitPlace(unitId);
    if (!place) return undefined;
    const runtime = world.npc;
    const economy = runtime?.economy;
    const cityId = place.cityId;
    const owner = cityId === null ? undefined : runtime?.world.cities.get(cityId)?.owner;
    const currency =
      cityId === null || !economy
        ? undefined
        : currencyCode(economy.economy.currencyOf.get(owner ?? 0) ?? ASSET_CREDIT);
    return {
      ...(place.workplace ? { workplace: place.workplace } : {}),
      lastPrice: (item) => {
        if (cityId === null || !economy) return undefined;
        const book = economy.registry.existing(cityId, `item:${item}`);
        return book?.market.lastPrice ?? book?.trades.at(-1)?.price;
      },
      ...(currency ? { currency } : {}),
    };
  };
}

/** 사이보그 판 채집 예상 출처(실효 팩이 없으면 undefined) */
export function gatherSheetSourceOf(
  content: ContentEditState | undefined,
  kinds: () => readonly GatherKind[],
  world: World | undefined,
): (() => GatherSheetSource) | undefined {
  if (!content) return undefined;
  const place = worldGatherPlace(world);
  return () => {
    const effective = content.effective();
    return {
      facilities: effective.facilities,
      gatherTiers: effective.gatherTiers,
      itemSubcategories: effective.itemSubcategories,
      items: effective.items,
      kinds: kinds(),
      place,
    };
  };
}

/** 유닛 추천 표 출처(실효 팩이 없으면 undefined) */
export function unitGuideSourceOf(
  content: ContentEditState | undefined,
  tuning: TuningState | undefined,
  kinds: () => readonly GatherKind[],
): (() => UnitGuideSource) | undefined {
  if (!content) return undefined;
  return () => {
    const effective = content.effective();
    const tiers = new Map(effective.items.map((item) => [item.id, item.tier]));
    return {
      facilities: effective.facilities,
      combatClasses: effective.combatClasses,
      rule: tuning?.society().combatClass,
      fishTiers: fishRangesOfKinds(kinds(), (id) => tiers.get(id)),
    };
  };
}
