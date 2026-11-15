// NPC 건물 채집소의 기르는 티어 고르기 — 기획 D-569 1761("최고 티어 아래에서 골라 기름"), docs/adr/2026-11-15-gather-object-tiers.md
// "바뀜 (D-569)". 플레이어는 시설마다 티어를 고르고(서버 facility_gather_tier), NPC는 기술 추천으로 고른다(질문 1862 [임시]):
// - 그 도시 시세(marketRefPrice — 지난 체결값, 없으면 시작값)로 티어마다 한 묶음 값을 내고, 수확 배율(권장 스탯 미달 효율 × 면적 모듈)을 곱하고
//   한 번 캘 때의 필요 진행으로 나눈 시간당 값이 가장 큰 티어(@terra/shared/gatherMath recommendGatherTier).
// - 일꾼 스탯 합은 시설에 적어 둔 값(workerEffects statSum, 없으면 기본 스탯 × 2 — NPC 휴먼 기본).
// 시뮬 NPC 짓기 자리(npcBuild.ts settle — 판단마다)와 서버 NPC 도시 경제(apps/server/src/npc/economy.ts syncCity)가 같은 함수를 쓴다.
import {
  DEFAULT_BUILDING_GATHER,
  buildingGatherTier,
  buildingYieldPm,
  recommendGatherTier,
  tierRequiredProgress,
} from "@terra/shared/gatherMath";
import type { RecipeSpec } from "../economy/production.ts";
import type { EcoFacility, Economy } from "./economy.ts";
import { marketRefPrice } from "./npcTrade.ts";

/** 티어를 고를 시설 몫 */
export interface TierPickFacility {
  readonly recipe: RecipeSpec;
  readonly level: number;
  readonly plots?: number | undefined;
  readonly statSum?: number | undefined;
}

/** 건물 채집소(선택 방식 사다리 레시피)인가 */
export const isSelectRecipe = (recipe: RecipeSpec): boolean => recipe.gather?.mode === "select";

/** NPC가 고르는 티어(머리 주석). 선택 방식이 아니면 최고 티어(쓰이지 않는다) */
export function npcSelectTier(economy: Economy, cityId: number, facility: TierPickFacility): number {
  const top = buildingGatherTier(facility.level);
  const roll = facility.recipe.gather;
  const ladder =
    roll && isSelectRecipe(facility.recipe) ? economy.catalog.gatherLadders.get(roll.subcategory) : undefined;
  if (!ladder) return top;
  const rules = economy.gather;
  const building = rules.building ?? DEFAULT_BUILDING_GATHER;
  const statSum = facility.statSum ?? Math.max(0, rules.defaultStat) * 2;
  const plots = facility.plots ?? 0;
  return recommendGatherTier({
    maxTier: top,
    hasTier: (tier) => (ladder[tier]?.length ?? 0) > 0,
    valueOf: (tier) => {
      const assets = ladder[tier] ?? [];
      if (assets.length === 0) return 0n;
      let sum = 0n;
      for (const asset of assets) sum += marketRefPrice(economy, cityId, asset);
      return sum / BigInt(assets.length);
    },
    progressOf: (tier) =>
      tierRequiredProgress(tier, rules.tierProgressBase ?? 30, rules.tierProgressStep ?? 30),
    yieldPmOf: (tier) => buildingYieldPm(statSum, tier, plots, building),
  });
}

/** 시설의 티어를 다시 고른 모양(바뀌지 않았으면 그대로 돌려준다). 다음 생산부터 든다 */
export function retierFacility(economy: Economy, facility: EcoFacility): EcoFacility {
  if (!isSelectRecipe(facility.recipe)) return facility;
  const tier = npcSelectTier(economy, facility.city, facility);
  if (tier === facility.selectTier) return facility;
  const statSum = facility.statSum ?? Math.max(0, economy.gather.defaultStat) * 2;
  return {
    ...facility,
    selectTier: tier,
    yieldPm: buildingYieldPm(
      statSum,
      tier,
      facility.plots ?? 0,
      economy.gather.building ?? DEFAULT_BUILDING_GATHER,
    ),
  };
}
