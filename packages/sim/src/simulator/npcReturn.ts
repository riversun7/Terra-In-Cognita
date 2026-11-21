// NPC 투자 판단의 기대 수익·유지비 셈(npc-fix-3, 질문 2566 나 + 다 — 기획 D-587 8 "재료나 소모비용, 기대 수익. 수요 등 경제적 이점이 있을때").
// docs/adr/2026-11-21-npc-needs-drives.md "바뀜 (npc-fix-3)". 규칙식(몫·문·점수)은 npc/invest.ts, 여기는 그 입력(하루 값·하루 유지비)만 셈한다.
// 시뮬(run.ts)과 서버 NPC 런타임이 같은 판단 함수(buildPolicy·recruitPolicy)를 거쳐 이 함수를 부른다.
// - 시설: 그 시설의 첫 레시피(시뮬 짓기 자리가 다 지은 시설에 거는 것과 같은 레시피)를 일꾼 workers명이 기준 효율(1000 — 스탯 진행 속도·수확량 배율은
//   보지 않는 어림)로 하루(24시간) 돌린 산출 값 − 먹는 재료 값. 값 = 수량 × 그 도시 지난 값(묶음 값, npcTrade.ts marketRefPrice) ÷ 묶음 크기.
//   유지비 = 일꾼 하루 임금(NPC 일꾼 임금 — humanPurse.ts와 같은 셈: 기준 임금 × business_npc_wage_pm ÷ 1000, 임금을 끈 판이면 0) × workers.
//   생산하지 않는 시설(숙소 등)은 값으로 셈할 산출이 없다(undefined — 문·점수에 들지 않는다).
// - 더 좋은 일꾼 구인 카드: 가장 싼 카드 대신 살 때 늘어나는 효율(토탈 ÷ 6 — 기준 임금과 같은 셈)의 하루 임금 시세(D-431 임금 = 효율 × 단가 — 그 일꾼이
//   더 내는 값의 대리)를 산출 값, 늘어나는 카드 값을 견줄 값으로 둔다. 유지비(NPC 일꾼 임금)는 효율과 상관없이 같아 덧붙는 몫에서는 0이다. 생필품은 유닛
//   지갑이 낸다(D-097·D-555 1507)라 국고 유지비에 넣지 않는다.
// 정수·BigInt만 쓴다(판정 코드).
import type { InvestReturn } from "../npc/invest.ts";
import type { RecipeSpec, Stack } from "../economy/production.ts";
import { BASE_EFFICIENCY } from "../economy/production.ts";
import type { SocietyCoefficients } from "../society/coefficients.ts";
import { wage as laborWage } from "../society/labor.ts";
import type { PreparedCatalog } from "./catalog.ts";
import { lotSizeOf } from "./catalog.ts";
import type { Economy } from "./economy.ts";
import { npcBaseDailyWage } from "./humanPurse.ts";
import { marketRefPrice } from "./npcTrade.ts";

/** 하루 작업량(효율 1000 일꾼 한 명 — 1000 × 24시간) */
const DAY_POINTS = BigInt(BASE_EFFICIENCY * 24);

/** 목록마다 시설 → 첫 레시피(목록은 켤 때 한 번 만들어 바뀌지 않는다) */
const firstRecipes = new WeakMap<PreparedCatalog, Map<string, RecipeSpec>>();

/** 시설의 첫 레시피(목록 차례 — simNpcBuilder firstRecipe와 같다). 없으면 undefined */
export function firstRecipeOf(catalog: PreparedCatalog, facility: string): RecipeSpec | undefined {
  let map = firstRecipes.get(catalog);
  if (!map) {
    map = new Map();
    for (const recipe of catalog.recipes.values())
      if (!map.has(recipe.facility)) map.set(recipe.facility, recipe);
    firstRecipes.set(catalog, map);
  }
  return map.get(facility);
}

/** NPC 일꾼 하루 임금(최소 단위 — humanPurse.ts livingDay와 같은 셈, 포만감 배율 1000‰). 임금을 끈 판이면 0 */
export function npcWorkerDailyWage(c: SocietyCoefficients): bigint {
  if (Math.trunc(c.business.npcWageMode) === 0) return 0n;
  const pm = BigInt(Math.max(0, Math.trunc(c.business.npcWagePm)));
  return (npcBaseDailyWage(c) * pm) / 1000n;
}

/** 물건 줄의 값(수량 × 그 도시 지난 값 ÷ 묶음 크기, 내림) */
function stacksValue(economy: Economy, cityId: number, stacks: readonly Stack[]): bigint {
  let total = 0n;
  for (const stack of stacks) {
    if (stack.qty <= 0n) continue;
    const lot = lotSizeOf(economy.catalog, stack.asset);
    total += (stack.qty * marketRefPrice(economy, cityId, stack.asset)) / (lot > 0n ? lot : 1n);
  }
  return total;
}

/**
 * 시설(레벨 하나만큼의 일꾼 자리 workers명)의 하루 기대 수익 입력. 레시피가 없는 시설이면 undefined. wage = 일꾼 하루 임금(npcWorkerDailyWage)
 */
export function facilityReturn(
  economy: Economy,
  cityId: number,
  facility: string,
  workers: number,
  wage: bigint,
): InvestReturn | undefined {
  const recipe = firstRecipeOf(economy.catalog, facility);
  const n = BigInt(Math.max(0, Math.trunc(workers)));
  if (!recipe || recipe.work <= 0 || n === 0n) return undefined;
  const perBatch = stacksValue(economy, cityId, recipe.outputs) - stacksValue(economy, cityId, recipe.inputs);
  return {
    dailyValue: (perBatch * DAY_POINTS * n) / BigInt(recipe.work),
    dailyUpkeep: wage * n,
  };
}

/**
 * 더 좋은 일꾼 구인 카드의 덧붙는 기대 수익 입력(위 머리 주석): 가장 싼 카드(base) 대신 이 카드를 살 때 늘어나는 하루 임금 시세(효율 차이 × 단가 — 그 일꾼이 더
 * 내는 값의 대리)를 산출 값으로, 늘어나는 값(cost − base 값)을 견줄 값으로 둔다. NPC 일꾼 임금(유지비)은 효율과 상관없이 같아 덧붙는 몫에서는 0이다 — 몇
 * 장을 살지는 수요(주거·경비대 목표 — 질문 2565 가)가 정하고 그 임금은 그 수요가 진다
 */
export function workerCardReturn(
  card: { readonly total: number; readonly cost: bigint },
  base: { readonly total: number; readonly cost: bigint },
  c: SocietyCoefficients,
): InvestReturn {
  const value = (total: number) =>
    BigInt(Math.max(0, laborWage(Math.floor(Math.max(0, Math.trunc(total)) / 6), c.wageRateMilli, 1000, c)));
  return {
    dailyValue: value(card.total) - value(base.total),
    dailyUpkeep: 0n,
    basis: card.cost > base.cost ? card.cost - base.cost : 0n,
  };
}
