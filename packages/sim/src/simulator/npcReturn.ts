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
// 바뀜 (fixes-1117e, 질문 2604 나 — D-587 8 "수요 등 경제적 이점"): 시설 산출 값을 그 도시 하루 수요 안으로 자른다(cityDailyFlow·facilityReturn의
// 다섯째 인수). 수요 = 그 도시가 하루에 쓰는 양(생필품 유닛 × 회 + 다 지은 시설이 먹는 재료 — 목표 재고 cityTargets와 같은 셈의 하루 몫 + 지으려는·
// 알박기 재료), 공급 = 그 도시 다 지은 시설이 하루에 내는 양(같은 어림 — 일꾼 × 기준 효율 × 진행 속도 × 24시간). 새 산출은 (수요 − 공급) 안까지만
// 그 도시 지난 값으로 치고, 넘는 몫은 넘침 값 ‰(npc_invest_surplus_value_pm)로 친다. 먹는 재료는 그대로 다 친다. 거래소 체결량은 하루 창이 없어(누적만)
// 쓰지 않는다. 같은 나라 다른 도시·다른 나라로 파는 몫은 넘침 값이 대신한다([임시] — ADR npc-needs-drives "바뀜 (fixes-1117e)").
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
import { GLUT_MULTIPLE, cityTargets, marketRefPrice } from "./npcTrade.ts";

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

/** 도시의 하루 흐름(자산 → 기본 단위): 그 도시가 쓰는 양(수요)과 다 지은 시설이 내는 양(공급) — 위 머리 주석 "바뀜 (fixes-1117e)" */
export interface CityFlow {
  readonly demand: ReadonlyMap<string, bigint>;
  readonly supply: ReadonlyMap<string, bigint>;
  /** 이미 넘치는 물건: 그 도시 재고가 목표 재고 × 넘침 배수(npcTrade.ts GLUT_MULTIPLE)와 하루 공급을 모두 넘는다 — 시장이 받아 주지 못해 쌓인다 */
  readonly glutted: ReadonlySet<string>;
}

/** 산출 값을 수요로 자를 때의 입력: 도시 흐름과 넘치는 몫의 값 ‰(0~1000) */
export interface DemandCap {
  readonly flow: CityFlow;
  readonly surplusPm: number;
}

/** 표에 양을 더한다(0 이하는 넣지 않는다) */
function add(map: Map<string, bigint>, asset: string, qty: bigint): void {
  if (qty > 0n) map.set(asset, (map.get(asset) ?? 0n) + qty);
}

/**
 * 도시의 하루 흐름(npcTrade.ts cityTargets와 같은 셈의 하루 몫): 생필품 = 사는 유닛 × 회당 양 × 24 ÷ 주기 시간, 다 지은 시설(일꾼이 있는 것)마다 하루
 * 차례 수 = ⌊24 × 일꾼 × 기준 효율 × 진행 속도 ÷ 작업량⌋ — 먹는 재료는 수요, 산출은 공급. 지으려는·알박기 재료(buildWants·claimWants)는 수요에 한 번 더한다
 */
export function cityDailyFlow(
  economy: Economy,
  cityId: number,
  stockOf: (asset: string) => bigint,
): CityFlow {
  const demand = new Map<string, bigint>();
  const supply = new Map<string, bigint>();
  const units = BigInt(economy.cityUnits.get(cityId) ?? 0);
  for (const spec of economy.catalog.necessities)
    add(demand, spec.asset, (units * spec.perUnit * 24n) / BigInt(Math.max(1, spec.periodHours)));
  for (const facility of economy.facilities.values()) {
    if (facility.city !== cityId || facility.workers === 0 || facility.recipe.work <= 0) continue;
    const batches = BigInt(
      Math.floor((24 * facility.workers * BASE_EFFICIENCY * facility.progress) / facility.recipe.work),
    );
    for (const input of facility.recipe.inputs) add(demand, input.asset, input.qty * batches);
    for (const output of facility.recipe.outputs) add(supply, output.asset, output.qty * batches);
  }
  for (const wants of [economy.buildWants?.get(cityId), economy.claimWants?.get(cityId)])
    for (const [asset, qty] of wants ?? []) add(demand, asset, qty);
  const glutted = new Set<string>();
  const targets = cityTargets(economy, cityId);
  for (const [asset, daily] of supply) {
    const target = (targets.get(asset) ?? 0n) * GLUT_MULTIPLE;
    const stock = stockOf(asset);
    if (stock > target && stock > daily) glutted.add(asset);
  }
  return { demand, supply, glutted };
}

/**
 * 하루 산출 qty 가운데 값으로 칠 양: (수요 − 공급) 안은 다. 넘는 몫은 시장이 받아 주는 물건(넘치지 않음)이면 다, 이미 넘치는 물건(재고가 쌓임)이면
 * 넘침 값 ‰만큼(내림)
 */
function sellableQty(cap: DemandCap, asset: string, qty: bigint): bigint {
  if (!cap.flow.glutted.has(asset)) return qty;
  const room = (cap.flow.demand.get(asset) ?? 0n) - (cap.flow.supply.get(asset) ?? 0n);
  const sold = room <= 0n ? 0n : room < qty ? room : qty;
  const pm = BigInt(Math.min(1000, Math.max(0, Math.trunc(cap.surplusPm))));
  return sold + ((qty - sold) * pm) / 1000n;
}

/** 하루 물건 양의 값(수량 × 그 도시 지난 값 ÷ 묶음 크기, 내림) */
function qtyValue(economy: Economy, cityId: number, asset: string, qty: bigint): bigint {
  if (qty <= 0n) return 0n;
  const lot = lotSizeOf(economy.catalog, asset);
  return (qty * marketRefPrice(economy, cityId, asset)) / (lot > 0n ? lot : 1n);
}

/**
 * 시설(레벨 하나만큼의 일꾼 자리 workers명)의 하루 기대 수익 입력. 레시피가 없는 시설이면 undefined. wage = 일꾼 하루 임금(npcWorkerDailyWage).
 * cap(fixes-1117e, 질문 2604 나)이 있으면 산출마다 하루 양을 그 도시 수요 − 공급 안으로 자르고(넘는 몫은 넘침 값 ‰) 값으로 바꾼다. 없으면 옛 셈 그대로
 */
export function facilityReturn(
  economy: Economy,
  cityId: number,
  facility: string,
  workers: number,
  wage: bigint,
  cap?: DemandCap,
): InvestReturn | undefined {
  const recipe = firstRecipeOf(economy.catalog, facility);
  const n = BigInt(Math.max(0, Math.trunc(workers)));
  if (!recipe || recipe.work <= 0 || n === 0n) return undefined;
  if (cap) {
    const work = BigInt(recipe.work);
    let value = 0n;
    for (const output of recipe.outputs) {
      const qty = (output.qty * DAY_POINTS * n) / work;
      value += qtyValue(economy, cityId, output.asset, sellableQty(cap, output.asset, qty));
    }
    for (const input of recipe.inputs)
      value -= qtyValue(economy, cityId, input.asset, (input.qty * DAY_POINTS * n) / work);
    return { dailyValue: value, dailyUpkeep: wage * n };
  }
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
