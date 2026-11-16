// NPC 건물 채집소의 기르는 티어 고르기 — 기획 D-569 1761("최고 티어 아래에서 골라 기름"), docs/adr/2026-11-15-gather-object-tiers.md
// "바뀜 (D-569)". 플레이어는 시설마다 티어를 고르고(서버 facility_gather_tier), NPC는 기술 추천으로 고른다(질문 1862 [임시]):
// - 그 도시 시세(marketRefPrice — 지난 체결값, 없으면 시작값)로 티어마다 한 묶음 값을 내고, 수확 배율(권장 스탯 미달 효율 × 면적 모듈)을 곱하고
//   한 번 캘 때의 필요 진행으로 나눈 시간당 값이 가장 큰 티어(@terra/shared/gatherMath recommendGatherTier).
// - 일꾼 스탯 합은 시설에 적어 둔 값(workerEffects statSum, 없으면 기본 스탯 × 2 — NPC 휴먼 기본).
// 시뮬 NPC 짓기 자리(npcBuild.ts settle — 판단마다)와 서버 NPC 도시 경제(apps/server/src/npc/economy.ts syncCity)가 같은 함수를 쓴다.
// 바뀜 (2026-11-16, 기획 답 1862 — D-554 "세력성향마다 지도자 성향마다 다양한 변수로" + D-212): 시간당 값이 가장 큰 티어 하나(T0만 기르던 옛 판)
// 대신 성향 가중 고르기(tierTemperOf → temperedGatherTier):
// - 후보 = 시간당 값이 가장 큰 티어의 설정 칸 npc_gather_tier_floor(‰) 이상인 티어.
// - 치우침(‰, + = 높은 티어 쪽) = 상업 성향 × 칸 npc_gather_tier_commerce + 공격 성향 × 칸 npc_gather_tier_aggression − 신앙 성향 × 칸
//   npc_gather_tier_faith(축마다 가운데에서 벗어난 몫, 끝에서 칸 값 그대로) + 지도자 기질(leaderTemperOf — (세계 시드, 세력)으로 굴린
//   ±칸 npc_gather_tier_leader 안의 값, 세력마다 하나). ±900에서 자른다.
// - 무게 = 시간당 값 × (1000 + 치우침 × (2 × 티어 − 최고) ÷ 최고) — 낮은 티어는 1000 − 치우침, 최고 티어는 1000 + 치우침.
// - 시설마다 고정된 시드 난수(세계 시드, 흐름 STREAM_GATHER_TIER, 시설 열쇠)로 무게대로 하나 — 같은 시드면 같은 결과, 시세가 크게 움직일 때만
//   바뀐다(판단마다 다시 굴리면 생산이 흔들린다).
// 칸이 모두 0이고 바닥이 1000이면 옛 판(가장 큰 티어, 같으면 시드로 하나)과 같다.
import {
  DEFAULT_BUILDING_GATHER,
  GATHER_TIERS,
  type GatherTierAdvice,
  buildingGatherTier,
  buildingYieldPm,
  recommendGatherTier,
  tierRequiredProgress,
} from "@terra/shared/gatherMath";
import type { RecipeSpec } from "../economy/production.ts";
import type { NpcCoefficients } from "../npc/coefficients.ts";
import type { EcoFacility, Economy } from "./economy.ts";
import { marketRefPrice } from "./npcTrade.ts";
import type { Traits } from "../npc/traits.ts";
import { streamRng } from "./world.ts";

/** 난수 흐름: 1~8은 다른 규칙(world.ts·society.ts·gardenerRun.ts·economy.ts·societyRecruit.ts) */
export const STREAM_GATHER_TIER = 9;
/** 지도자 기질(세력마다 하나 — 기획 D-554 "지도자 성향", 질문 1991) */
export const STREAM_LEADER = 10;

/** 치우침 끝(‰) — 무게가 0 아래로 가지 않게 */
const BIAS_LIMIT = 900;

/** 성향 가중 고르기가 보는 세계 몫(시뮬·서버 SimWorld) */
export interface TemperWorld {
  readonly seed: number;
  readonly cities: ReadonlyMap<number, { readonly owner: number }>;
  readonly factions: ReadonlyMap<
    number,
    { readonly id: number; readonly traits: Traits; readonly leaderPm?: number | undefined }
  >;
}

/** 성향 가중 고르기 몫(tierTemperOf) */
export interface TierTemper {
  /** 높은 티어 쪽 치우침(‰, −900~900) */
  readonly bias: number;
  /** 후보 바닥(가장 큰 시간당 값의 ‰, 0~1000) */
  readonly floorPm: number;
  /** 시설마다 고정된 굴림(부호 없는 32비트) */
  readonly roll: number;
}

/**
 * 지도자 기질(기획 D-554 "지도자 성향"): −폭 ~ +폭(‰, 설정 칸 npc_gather_tier_leader). 폭 0이면 0. 바뀜 (기획 D-573 1991 "국가 편집기에 성향 칸,
 * 비어 있으면 무작위"): 세력에 지도자 기질 칸(leaderPm — 폭 안 위치 ‰, 팩 국가 프리셋 temper.leader)이 있으면 폭 × 그 값 ÷ 1000(0 쪽으로 버림),
 * 없으면 예전처럼 (세계 시드, 세력)으로 굴린 값(D-327)
 */
export function leaderTemperOf(
  seed: number,
  faction: { readonly id: number; readonly leaderPm?: number | undefined },
  c: NpcCoefficients,
): number {
  const spread = Math.max(0, Math.trunc(c.gatherTierLeaderPm ?? 0));
  if (spread === 0) return 0;
  if (faction.leaderPm !== undefined) {
    const pm = Math.max(-1000, Math.min(1000, Math.trunc(faction.leaderPm)));
    return Math.trunc((spread * pm) / 1000) + 0;
  }
  return streamRng(seed, STREAM_LEADER, faction.id, 0).nextInt(spread * 2 + 1) - spread;
}

/** 성향 축 하나가 가운데에서 벗어난 몫 × 칸 값(‰). 끝에서 칸 값 그대로(도시 성장 성향 npcGrowthTemper.ts도 쓴다) */
export function axisTilt(value: number, weightPm: number | undefined, c: NpcCoefficients): number {
  const half = Math.max(1, Math.trunc((c.traitMax - c.traitMin) / 2));
  const mid = c.traitMin + half;
  return Math.trunc(((value - mid) * Math.trunc(weightPm ?? 0)) / half);
}

/**
 * 그 도시 주인 세력의 성향 가중 고르기 몫(머리 주석). 주인이 없으면 undefined(옛 판 — 가장 큰 시간당 값). subject = 시설 열쇠(시뮬 = 경제 시설
 * ID, 서버 = 건물 ID 또는 도시 직무 열쇠)
 */
export function tierTemperOf(
  world: TemperWorld,
  cityId: number,
  subject: number,
  c: NpcCoefficients,
): TierTemper | undefined {
  const owner = world.cities.get(cityId)?.owner;
  const faction = owner === undefined ? undefined : world.factions.get(owner);
  if (!faction) return undefined;
  const { traits } = faction;
  const raw =
    axisTilt(traits.commerce, c.gatherTierCommercePm, c) +
    axisTilt(traits.aggression, c.gatherTierAggressionPm, c) -
    axisTilt(traits.faith, c.gatherTierFaithPm, c) +
    leaderTemperOf(world.seed, faction, c);
  return {
    bias: Math.max(-BIAS_LIMIT, Math.min(BIAS_LIMIT, raw)),
    floorPm: Math.max(0, Math.min(1000, Math.trunc(c.gatherTierFloorPm ?? 1000))),
    roll: streamRng(world.seed, STREAM_GATHER_TIER, subject, 0).nextU32(),
  };
}

/**
 * 성향 가중 티어(머리 주석): 시간당 값(값 × 수확 배율 ÷ 필요 진행, 백만 배 정수)이 바닥 이상인 티어를 무게(시간당 값 × 티어 치우침)대로 굴림
 * 하나로 고른다. 값이 있는 티어가 없으면 기술 추천(recommendGatherTier — 최고 티어). 정수(BigInt)만 쓴다(판정 결정성)
 */
export function temperedGatherTier(advice: GatherTierAdvice, temper: TierTemper): number {
  const top = Math.max(0, Math.min(GATHER_TIERS - 1, Math.trunc(advice.maxTier)));
  const scored: { tier: number; rate: bigint }[] = [];
  let best = 0n;
  for (let tier = 0; tier <= top; tier++) {
    if (!advice.hasTier(tier)) continue;
    const value = advice.valueOf(tier);
    if (value <= 0n) continue;
    const yieldPm = BigInt(Math.max(0, Math.trunc(advice.yieldPmOf(tier))));
    const progress = BigInt(Math.max(1, Math.trunc(advice.progressOf(tier))));
    const rate = (value * yieldPm * 1_000_000n) / progress;
    scored.push({ tier, rate });
    if (rate > best) best = rate;
  }
  if (best <= 0n) return recommendGatherTier(advice);
  const floor = BigInt(Math.max(0, Math.min(1000, Math.trunc(temper.floorPm))));
  const bias = Math.max(-BIAS_LIMIT, Math.min(BIAS_LIMIT, Math.trunc(temper.bias)));
  const span = Math.max(1, top);
  const weighted: { tier: number; weight: bigint }[] = [];
  let total = 0n;
  for (const { tier, rate } of scored) {
    if (rate * 1000n < best * floor) continue;
    const tilt = 1000 + Math.trunc((bias * (2 * tier - top)) / span);
    const weight = rate * BigInt(Math.max(1, tilt));
    weighted.push({ tier, weight });
    total += weight;
  }
  if (total <= 0n) return recommendGatherTier(advice);
  // 굴림(0 ~ 2^32 − 1)을 무게 합 위의 자리로: ⌊굴림 × 합 ÷ 2^32⌋
  let left = (BigInt(temper.roll >>> 0) * total) >> 32n;
  for (const { tier, weight } of weighted) {
    if (left < weight) return tier;
    left -= weight;
  }
  return weighted.at(-1)?.tier ?? top;
}

/** 티어를 고를 시설 몫 */
export interface TierPickFacility {
  readonly recipe: RecipeSpec;
  readonly level: number;
  readonly plots?: number | undefined;
  readonly statSum?: number | undefined;
  /** 성향 가중 고르기 몫(1862 — tierTemperOf). 없으면 시간당 값이 가장 큰 티어 */
  readonly temper?: TierTemper | undefined;
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
  const advice: GatherTierAdvice = {
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
  };
  return facility.temper ? temperedGatherTier(advice, facility.temper) : recommendGatherTier(advice);
}

/** 시설의 티어를 다시 고른 모양(바뀌지 않았으면 그대로 돌려준다). 다음 생산부터 든다. temper = 성향 가중 고르기 몫(없으면 가장 큰 시간당 값) */
export function retierFacility(economy: Economy, facility: EcoFacility, temper?: TierTemper): EcoFacility {
  if (!isSelectRecipe(facility.recipe)) return facility;
  const tier = npcSelectTier(economy, facility.city, { ...facility, temper });
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
