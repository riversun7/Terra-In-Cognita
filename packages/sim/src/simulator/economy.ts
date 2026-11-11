// 시뮬레이터 경제 — docs/adr/2026-10-31-economy-core.md 7절
// 공용 경제 규칙(economy/*: 장부·호가창·동시호가·생산·생필품·중앙은행)을 세계에 붙인다. 판단(무엇을 사고팔지)은 대리 규칙
// npcTrade.ts이고, 여기는 규칙이 정한 일(생산·유지비·환전 회차·운송 도착·중앙은행·도시 주인 바뀜)만 한다.
// - 세력 화폐: 처음 고정 나라마다 국가 프리셋 하나(팩 순서), 화폐 = 그 프리셋 화폐. 반란 세력은 부모 화폐를 빌려 쓴다(D-131 0단계).
// - 기준 통화 = 첫 나라의 화폐. 환전 짝은 (화폐, 기준 통화)만 둔다.
// - 도시마다 물건마다 물자 거래소 하나. 값은 그 도시 주인의 화폐로 매기고 거래세는 그 주인 국고로 간다.
// - 운송: 출발 때 창고 → 운송 중 계정(출발지), 도착 사건에 운송 중 → 도착지 창고. 걸리는 시간은 하나(고정 속도).
// - 묶음(302·D-506): 원장·운송은 기본 단위(광석 g), 거래소 주문·값은 묶음 단위(물건마다 lotSize).
// - 채집 티어 추첨(D-506): 추첨 레시피는 한 번 돌릴 때마다 묶음마다 티어를 뽑는다(economy/gather.ts). 난수 = 흐름 7(시설, 차례).
//   유효 스탯 = 시설 계획의 일꾼 주 + 보조 스탯(없으면 새 유닛 평균) + N43 레벨 보너스. 채집 시설은 레벨 티어 상한을 받지 않는다.
// - 옛 1차 생산 규칙(D-507, 49 N32·P8): 스탯 짝이 있는 시설은 시간당 작업량 = 일꾼 × 1000 × 진행 속도(max(1, ⌊주 ÷ 20⌋)),
//   산출 = 한 번 캘 때 수확량(min(상한, 기본 + ⌊보조 × 비율⌋)) 배. 선택 방식(농장)은 해금 티어 min(⌊(주 + 보조) ÷ 20⌋, 9)에서 고른다.
import type { LedgerBook } from "../ledger/ledgerBook.ts";
import {
  type CentralBankRule,
  TEST_CENTRAL_BANK_RULE,
  centralBankStep,
  initialMint,
} from "../economy/centralBank.ts";
import { type FxMarket, createFxMarket } from "../economy/fxMarket.ts";
import { type GoodsMarket, createGoodsMarket } from "../economy/goodsMarket.ts";
import {
  accessibleTier,
  gatherCatchPm,
  gatherProgress,
  gatherStat,
  gatherYield,
  rollGatherOutputs,
  tierRequiredProgress,
} from "../economy/gather.ts";
import {
  BASE_EFFICIENCY,
  HOUR_MS,
  type RecipeSpec,
  batchDurationMs,
  maxTierForLevel,
  runRecipe,
  tierCappedByLevel,
} from "../economy/production.ts";
import { dueNecessities, payNecessities } from "../economy/upkeep.ts";
import { START_GATHER_OBJECTS } from "../society/gatherObjects.ts";
import { haulTimeMs } from "../society/logistics.ts";
import { type CatchmentState, facilitySupplyPm } from "./catchmentRun.ts";
import {
  type CatalogGather,
  type EconomyCatalog,
  type PreparedCatalog,
  currencyAsset,
  itemAsset,
  lotSizeOf,
  prepareCatalog,
} from "./catalog.ts";
import type { SimLoop } from "./loop.ts";
import type { Scenario, ScenarioEconomy } from "./scenario.ts";
import type { SimEvent } from "./npcRun.ts";
import { type RuinedGoodsHome, rehomeRuinedGoods, ruinedGoodsHome } from "./ruinedGoods.ts";
import { type SimFaction, type SimWorld, streamRng } from "./world.ts";

export const EVENT_PRODUCE = "produce";
export const EVENT_UPKEEP = "upkeep";
export const EVENT_TRADE = "trade";
export const EVENT_FX = "fx";
export const EVENT_CARGO = "cargo";
/** 난수 흐름 7: 채집 티어 추첨(대상 = 시설 ID, 차례 = 그 시설의 생산 차례) */
export const STREAM_GATHER = 7;

/** 채집 손잡이(attachEconomy가 세력·사회 계수표에서 만든다) */
export interface GatherSettings {
  /** 레벨 보너스(N43 n43_level_bonus, 유효 스탯 / 레벨) */
  readonly levelBonus: number;
  /** 시설 계획에 일꾼 스탯이 없을 때 1차 스탯 하나(새 유닛 평균, 주·보조 둘 다 이 값) */
  readonly defaultStat: number;
  /** 진행 나눔(N32 n32_main_divisor, 옛 20). 없으면 20 */
  readonly progressDivisor?: number | undefined;
  /** 시설에 수확량 비율이 없을 때 보조 스탯 ‰(N32 n32_sub_yield, 옛 80). 없으면 80 */
  readonly yieldPerStatPm?: number | undefined;
  /** 필요 진행 기본·티어당(N44 n44_tier_progress_base·step, 옛 30·30). 없으면 30·30 */
  readonly tierProgressBase?: number | undefined;
  readonly tierProgressStep?: number | undefined;
  /** 진행 1의 시간(N44 n44_tick_ms, 옛 1분 = 60,000). 없으면 60,000 */
  readonly tickMs?: number | undefined;
  /** 광석 한 번 캘 때 g(N44 n44_ore_grams, 1,000). 없으면 1,000 */
  readonly oreGrams?: number | undefined;
}

/** 시설 계획에 일꾼 스탯이 없을 때: 새 유닛 평균 1차 스탯 하나 = ⌊N9 초기 합 ÷ 6⌋([임시] 시뮬 유닛에 스탯이 없다, 출발값 60 → 10) */
export function defaultGatherStat(initialSum: number): number {
  return Math.floor(Math.max(0, initialSum) / 6);
}

export interface EcoFacility {
  readonly id: number;
  readonly city: number;
  readonly recipe: RecipeSpec;
  readonly level: number;
  readonly workers: number;
  /** 채집 티어 추첨의 유효 스탯(일꾼 주 + 보조 + 레벨 보너스). 추첨 레시피가 아니면 쓰지 않는다 */
  readonly gatherStat: number;
  /** 선택 방식의 해금 티어(49 P8). 선택 레시피가 아니면 쓰지 않는다 */
  readonly selectTier: number;
  /** 진행 속도(49 N32): 일꾼 한 명의 효율 = 1000 × 이 값. 스탯 짝이 없는 시설은 1 */
  readonly progress: number;
  /** 한 번 캘 때 수확량(옛 gather_type_config): 산출 × 이 값. 스탯 짝이 없는 시설은 1 */
  readonly yieldPerLot: number;
  /** 한 번 시도의 성공 ‰(낚시터 gather.catch). 성공 확률 규칙이 없는 시설은 undefined(늘 성공) */
  readonly catchPm?: number | undefined;
  /**
   * 숙소 셈 배율(‰, 질문 1047 다 — society/logistics.ts restDutyPm): 일꾼이 쉬는 곳(숙소 레벨·숙소 없는 집·노숙)과 일터 ↔ 쉼터 거리로 정한
   * 일한 몫을 기준(숙소 없는 집, 거리 0)에 견준 값. 생산 속도에 곱한다. 없으면 1000(예전과 같다 — 시뮬 시나리오는 시설 자리가 없다)
   */
  readonly dutyPm?: number | undefined;
  /**
   * 채집소 → 창고 옮김(질문 1050 가 — society/logistics.ts haulTimeMs): 칸 수와 화물 상한(g). 있으면 한 번의 산출 무게를 일꾼들이 나눠 나르는
   * 시간을 그 번 시간에 더한다. 없으면 옮김 시간 0(예전과 같다)
   */
  readonly haul?: { readonly cells: number; readonly carryG: number } | undefined;
  /** 생산 차례(추첨 난수의 차례) */
  batches: number;
  eventId: number | undefined;
  /** 예약한 다음 한 번(산출·걸리는 시간). 사다리 산출은 시작할 때 뽑는다 */
  pending?: PendingBatch | undefined;
}

/** 예약한 생산 한 번 */
export interface PendingBatch {
  readonly outputs: readonly { asset: string; qty: bigint }[];
  readonly durationMs: number;
}

export interface Cargo {
  readonly id: number;
  readonly owner: number;
  readonly asset: string;
  readonly from: number;
  readonly to: number;
  readonly qty: bigint;
}

export interface Economy {
  readonly catalog: PreparedCatalog;
  readonly settings: ScenarioEconomy;
  /** 채집 손잡이(N43·N32·N44, 세력·사회 계수표에서) */
  readonly gather: GatherSettings;
  /** 기준 통화 자산 코드 */
  readonly base: string;
  /** 도시 → 물건 → 거래소 */
  readonly markets: Map<number, Map<string, GoodsMarket>>;
  /** 화폐 → (화폐, 기준 통화) 환전 시장. 짝 ID 차례 = 화폐 차례 */
  readonly fx: Map<string, FxMarket>;
  readonly currencyOf: Map<number, string>;
  readonly taxOf: Map<number, number>;
  /** 세력 → 프리셋 기본 거래세(NPC 세율 규칙식이 이 아래로 내리지 않는다, 질문 197 가) */
  readonly baseTax: Map<number, number>;
  /** 화폐 → 발행하는 나라(고정 NPC 나라) */
  readonly issuer: Map<string, number>;
  readonly interestOwed: Map<string, bigint>;
  /** 나라 → 소각한 발행 이자 누적(D-303). 도시 세금 정산(D-304)이 기간 차이를 쓴다 */
  readonly interestPaid: Map<number, bigint>;
  readonly facilities: Map<number, EcoFacility>;
  /** 도시 → 사는 유닛 수(유닛은 도시를 옮기지 않는다) */
  readonly cityUnits: Map<number, number>;
  readonly cargo: Map<number, Cargo>;
  /**
   * 배후지 채집 다툼(catchmentRun.ts, docs/adr/2026-11-11-city-catchment.md "바뀜 (2026-11-12)"). 있으면 채집 시설 빠르기 = 그 원자재의 지난
   * 하루 받은 몫. 없으면 땅을 보지 않는다(옛 경제)
   */
  catchment?: CatchmentState | undefined;
  nextOrderId(): number;
  nextCargoId(): number;
  /** 오늘 센 값(하루 줄에 쓰고 비운다) */
  readonly today: {
    shortUnits: Map<string, number>;
    /** 도시마다 오늘 낼 생필품(유닛 × 회) · 못 낸 몫(만족도의 포만감, D-438 5) */
    dueByCity: Map<number, number>;
    shortByCity: Map<number, number>;
    inputShort: number;
    issued: Map<string, bigint>;
    burned: Map<string, bigint>;
    /** 오늘 생산한 양(물건 자산 → 기본 단위) */
    produced: Map<string, bigint>;
  };
}

function counter(): () => number {
  let last = 0;
  return () => {
    last += 1;
    return last;
  };
}

const consumeAccount = (book: LedgerBook) => (asset: string) => book.systemAccount(`sink:${asset}`, asset);
const sourceAccount = (book: LedgerBook) => (asset: string) => book.systemAccount(`source:${asset}`, asset);

/** 시나리오·목록에서 경제를 차린다(세계를 차린 바로 뒤, 시작 시각) */
export function createEconomy(
  world: SimWorld,
  scenario: Scenario,
  raw: EconomyCatalog,
  startMs: number,
  gather: GatherSettings = { levelBonus: 0, defaultStat: 0 },
): Economy {
  const settings = scenario.economy;
  if (!settings) throw new Error("scenario has no economy section");
  const catalog = prepareCatalog(raw);
  const { book } = world;
  const factions = [...world.factions.values()];
  if (factions.length > catalog.presets.length)
    throw new Error(
      `economy needs a nation preset per faction: ${factions.length} > ${catalog.presets.length}`,
    );
  const currencyOf = new Map<number, string>();
  const taxOf = new Map<number, number>();
  const issuer = new Map<string, number>();
  factions.forEach((faction, index) => {
    const preset = catalog.presets[index];
    if (!preset) return;
    const currency = currencyAsset(preset.currency);
    currencyOf.set(faction.id, currency);
    taxOf.set(faction.id, preset.tradeTaxBp);
    issuer.set(currency, faction.id);
  });
  const base = currencyOf.get(factions[0]?.id ?? 0) ?? "";
  const nextOrderId = counter();
  const economy: Economy = {
    catalog,
    settings,
    gather,
    base,
    markets: new Map(),
    fx: new Map(),
    currencyOf,
    taxOf,
    baseTax: new Map(taxOf),
    issuer,
    interestOwed: new Map(),
    interestPaid: new Map(),
    facilities: new Map(),
    cityUnits: new Map(),
    cargo: new Map(),
    nextOrderId,
    nextCargoId: counter(),
    today: {
      shortUnits: new Map(),
      dueByCity: new Map(),
      shortByCity: new Map(),
      inputShort: 0,
      issued: new Map(),
      burned: new Map(),
      produced: new Map(),
    },
  };
  for (const unit of world.units.values())
    economy.cityUnits.set(unit.city, (economy.cityUnits.get(unit.city) ?? 0) + 1);
  // 거래소: 도시마다 물건마다
  let marketId = 0;
  for (const city of world.cities.values()) {
    const perItem = new Map<string, GoodsMarket>();
    for (const item of catalog.items) {
      marketId += 1;
      perItem.set(
        item,
        createGoodsMarket(
          {
            id: marketId,
            location: city.id,
            item,
            currency: currencyOf.get(city.owner) ?? base,
            taxBp: taxOf.get(city.owner) ?? 0,
            treasuryOwner: city.owner,
            lotSize: lotSizeOf(catalog, item),
          },
          book,
          nextOrderId,
        ),
      );
    }
    economy.markets.set(city.id, perItem);
  }
  let pairId = 0;
  for (const currency of issuer.keys()) {
    if (currency === base) continue;
    pairId += 1;
    economy.fx.set(
      currency,
      createFxMarket({ id: pairId, base: currency, quote: base, lotSize: settings.fxLot }, book, nextOrderId),
    );
  }
  // 시설: 도시 계획대로, 일꾼은 그 도시 유닛 수와 자리 수 안에서
  const nextFacilityId = counter();
  scenario.factions.forEach((group) => {
    for (const faction of factions) {
      if (!faction.code.startsWith(group.code)) continue;
      for (const cityId of faction.cities) {
        let free = economy.cityUnits.get(cityId) ?? 0;
        for (const plan of group.cityPlan ?? []) {
          const recipe = catalog.recipes.get(plan.recipe);
          const facility = catalog.facilities.get(plan.facility);
          if (!recipe || !facility || recipe.facility !== plan.facility)
            throw new Error(`bad city plan: ${plan.recipe}`);
          if (tierCappedByLevel(facility.stage) && recipe.tier > maxTierForLevel(plan.level))
            throw new Error(`facility level too low for ${plan.recipe}`);
          const workers = Math.min(plan.workers, free, facility.slotsPerLevel * plan.level);
          free -= workers;
          const id = nextFacilityId();
          economy.facilities.set(id, {
            id,
            city: cityId,
            recipe,
            level: plan.level,
            workers,
            ...workerEffects(facility.gather, plan, gather),
            ...(plan.dutyPm === undefined ? {} : { dutyPm: plan.dutyPm }),
            ...(plan.haulCells === undefined || plan.haulCells <= 0
              ? {}
              : { haul: { cells: plan.haulCells, carryG: START_GATHER_OBJECTS.carryGrams } }),
            batches: 0,
            eventId: undefined,
          });
        }
        for (const stock of group.stock ?? []) {
          const asset = itemAsset(stock.item);
          if (stock.qty === 0n || !catalog.startPrice.has(asset)) continue;
          book.post({
            kind: "endow",
            atMs: startMs,
            entries: [
              { account: sourceAccount(book)(asset), amount: -stock.qty },
              { account: book.ownerAccount(faction.id, asset, cityId), amount: stock.qty },
            ],
          });
        }
      }
    }
  });
  // 처음 발행(E6)과 기준 통화 준비금
  for (const faction of factions) {
    const currency = currencyOf.get(faction.id);
    if (!currency) continue;
    const mint = initialMint(faction.units.size, settings.perCapitaDaily);
    issue(economy, book, currency, faction.id, mint, startMs);
    if (currency !== base)
      issue(economy, book, base, faction.id, (mint * BigInt(settings.baseReserveBp)) / 10_000n, startMs);
  }
  return economy;
}

function bump<K>(map: Map<K, bigint>, key: K, amount: bigint): void {
  map.set(key, (map.get(key) ?? 0n) + amount);
}

/** 시스템이 국고로 발행한다(D-411 5). 발행 계정 issue:<화폐> */
function issue(
  economy: Economy,
  book: LedgerBook,
  currency: string,
  owner: number,
  amount: bigint,
  atMs: number,
): void {
  if (amount <= 0n) return;
  book.post({
    kind: "issue",
    atMs,
    entries: [
      { account: book.systemAccount(`issue:${currency}`, currency), amount: -amount },
      { account: book.ownerAccount(owner, currency), amount },
    ],
  });
  bump(economy.today.issued, currency, amount);
}

function burn(
  economy: Economy,
  book: LedgerBook,
  currency: string,
  owner: number,
  amount: bigint,
  atMs: number,
): void {
  if (amount <= 0n) return;
  book.post({
    kind: "burn",
    atMs,
    entries: [
      { account: book.ownerAccount(owner, currency), amount: -amount },
      { account: book.systemAccount(`sink:${currency}`, currency), amount },
    ],
  });
  bump(economy.today.burned, currency, amount);
}

/** 화폐의 통화량 = 발행 − 소각 */
export function moneySupply(book: LedgerBook, currency: string): bigint {
  return (
    -book.balance(book.systemAccount(`issue:${currency}`, currency)) -
    book.balance(book.systemAccount(`sink:${currency}`, currency))
  );
}

/**
 * 환전 회차 시각(기획 답 564 다): 회차 길이의 배수 시각(UTC 0시부터 센 정시 — 1시간이면 매시 정각)에 맞춘다. nowMs 다음의 첫 회차 시각을
 * 돌려준다(nowMs가 회차 시각이면 그다음). 서버를 다시 켜도 회차 시각이 같고, 끈 동안 지나간 회차는 따라 돌리지 않는다. 시뮬은 0에서
 * 시작해 옛 예약(시작 + 회차 길이)과 같다
 */
export function nextFxRoundAt(nowMs: number, everyMs: number): number {
  return (Math.floor(nowMs / everyMs) + 1) * everyMs;
}

/** 처음 예약: 시설 생산, 도시 유지비(다음 정시), 세력 거래 판단, 환전 회차(회차 길이의 정시, 564 다) */
export function scheduleEconomy(
  economy: Economy,
  world: SimWorld,
  loop: SimLoop<SimEvent>,
  startMs: number,
): void {
  for (const facility of economy.facilities.values())
    scheduleProduce(economy, world, loop, facility, startMs);
  const firstHour = (Math.floor(startMs / HOUR_MS) + 1) * HOUR_MS;
  for (const city of world.cities.values())
    loop.schedule(firstHour, { kind: EVENT_UPKEEP, subject: city.id });
  let index = 0;
  for (const faction of world.factions.values()) {
    // 판단 시각을 흩어 둔다(같은 시각에 몰리지 않게)
    const offset = Math.floor((economy.settings.tradeEveryMs * index) / Math.max(1, world.factions.size));
    loop.schedule(startMs + offset + 1, { kind: EVENT_TRADE, subject: faction.id });
    index += 1;
  }
  loop.schedule(nextFxRoundAt(startMs, economy.settings.fxEveryMs), { kind: EVENT_FX, subject: 0 });
}

/**
 * 시설 계획의 일꾼 스탯이 시설에 주는 효과(D-506·D-507): 추첨 유효 스탯, 선택 해금 티어, 진행 속도, 수확량.
 * 스탯 짝(gather)이 없는 시설은 속도·수확량 1(효과 없음)
 */
export function workerEffects(
  rule: CatalogGather | undefined,
  plan: { level: number; primaryStat?: number | undefined; secondaryStat?: number | undefined },
  gather: GatherSettings,
): Pick<EcoFacility, "gatherStat" | "selectTier" | "progress" | "yieldPerLot" | "catchPm"> {
  const primary = plan.primaryStat ?? gather.defaultStat;
  const secondary = plan.secondaryStat ?? gather.defaultStat;
  if (!rule) return { gatherStat: 0, selectTier: 0, progress: 1, yieldPerLot: 1 };
  return {
    gatherStat: gatherStat(primary + secondary, plan.level, gather.levelBonus),
    selectTier: accessibleTier(primary, secondary),
    progress: gatherProgress(primary, gather.progressDivisor ?? 20),
    yieldPerLot: gatherYield(secondary, {
      base: rule.yieldBase ?? 1,
      perStatPm: rule.yieldPerStatPm ?? gather.yieldPerStatPm ?? 80,
      cap: rule.yieldCap,
    }),
    ...(rule.catch ? { catchPm: gatherCatchPm(primary + secondary, rule.catch) } : {}),
  };
}

/** 숙소 셈 배율(‰, 없으면 1000) */
function dutyOf(facility: EcoFacility): number {
  return Math.max(1, Math.trunc(facility.dutyPm ?? 1000));
}

/** 시설의 시간당 작업량(일꾼 × 기준 효율 × 진행 속도 × 숙소 셈 배율) */
function pointsPerHour(facility: EcoFacility): number {
  return Math.floor((facility.workers * BASE_EFFICIENCY * facility.progress * dutyOf(facility)) / 1000);
}

/** 한 번의 산출을 창고로 나르는 시간(ms, 시설에 옮김 칸이 없으면 0) — 무게는 팩 물건 weight(g, 기본 단위 하나) */
function haulOfBatch(economy: Economy, facility: EcoFacility, outputs: PendingBatch["outputs"]): number {
  const haul = facility.haul;
  if (!haul || haul.cells <= 0) return 0;
  let grams = 0n;
  for (const stack of outputs) grams += stack.qty * (economy.catalog.weightG.get(stack.asset) ?? 0n);
  return haulTimeMs(grams, haul.cells, facility.workers, haul.carryG);
}

/**
 * 다음 한 번의 산출과 걸리는 시간을 미리 정한다(사다리 산출은 나온 티어가 시간을 정하므로 시작할 때 뽑는다, D-507).
 * - 사다리 밖 산출: 레시피 작업량 ÷ 시간당 작업량(옛 farm_crops.required_progress처럼 레시피마다 값), 산출 × 수확량.
 * - 사다리 산출(추첨·선택): 한 번 캘 때마다 티어를 뽑고(선택은 해금 티어) 수확량만큼 낸다. 필요 진행 = 나온 아이템 티어마다
 *   max(기본, 기본 + 티어 × 걸음)(49 N44, 빈 번은 T0 값), 시간 = ⌈필요 진행 × 진행 1의 시간 ÷ (일꾼 × 진행 속도)⌉.
 *   난수 = 흐름 7(시설, 생산 차례). 일하는 사람이 없으면 undefined(예약하지 않는다)
 */
function nextBatch(economy: Economy, world: SimWorld, facility: EcoFacility): PendingBatch | undefined {
  const plain = plainBatch(economy, world, facility);
  if (!plain) return undefined;
  // 배후지 받은 몫만큼 느려진다(채집 시설만, 바닥 위 — catchmentRun.ts)
  const supplyPm = facilitySupplyPm(economy.catchment, facility.city, facility.recipe.facility);
  const worked = supplyPm >= 1000 ? plain.durationMs : Math.ceil((plain.durationMs * 1000) / supplyPm);
  // 채집소 → 창고 옮김 시간을 그 번에 더한다(질문 1050 가, 시설에 옮김 칸이 있을 때만)
  const durationMs = worked + haulOfBatch(economy, facility, plain.outputs);
  return durationMs === plain.durationMs ? plain : { outputs: plain.outputs, durationMs };
}

/** 배후지를 보지 않은 다음 한 번(nextBatch 머리 주석) */
function plainBatch(economy: Economy, world: SimWorld, facility: EcoFacility): PendingBatch | undefined {
  const roll = facility.recipe.gather;
  const ladder = roll ? economy.catalog.gatherLadders.get(roll.subcategory) : undefined;
  if (!roll || !ladder) {
    const durationMs = batchDurationMs(facility.recipe.work, pointsPerHour(facility));
    if (durationMs === undefined) return undefined;
    if (facility.yieldPerLot === 1) return { outputs: facility.recipe.outputs, durationMs };
    const times = BigInt(Math.max(0, facility.yieldPerLot));
    return {
      outputs: facility.recipe.outputs.map((stack) => ({ asset: stack.asset, qty: stack.qty * times })),
      durationMs,
    };
  }
  // 일꾼 × 진행 속도 × 숙소 셈 배율(‰ — 시간 셈에서 1000으로 나눈다)
  const speed = facility.workers * facility.progress * dutyOf(facility);
  if (speed <= 0) return undefined;
  const rules = economy.gather;
  const rng = streamRng(world.seed, STREAM_GATHER, facility.id, facility.batches);
  facility.batches += 1;
  const result = rollGatherOutputs(
    {
      ladder,
      bands: economy.catalog.gatherBands,
      stat: facility.gatherStat,
      lots: roll.lots,
      lotSize: economy.catalog.lotSize,
      selectTier: roll.mode === "select" ? facility.selectTier : undefined,
      yieldPerLot: facility.yieldPerLot,
      successPm: facility.catchPm,
      harvestGrams: BigInt(rules.oreGrams ?? 1000),
    },
    rng,
  );
  const base = rules.tierProgressBase ?? 30;
  const step = rules.tierProgressStep ?? 30;
  let progress = result.empty * tierRequiredProgress(0, base, step);
  result.landed.forEach((count, tier) => {
    progress += count * tierRequiredProgress(tier, base, step);
  });
  const durationMs = Math.max(1, Math.ceil((progress * (rules.tickMs ?? 60_000) * 1000) / speed));
  return { outputs: result.outputs, durationMs };
}

/** 시설 하나의 다음 생산을 예약한다(서버가 거울 세계에 시설을 새로 붙일 때도 부른다) */
export function scheduleProduce(
  economy: Economy,
  world: SimWorld,
  loop: SimLoop<SimEvent>,
  facility: EcoFacility,
  fromMs: number,
): void {
  facility.pending = nextBatch(economy, world, facility);
  if (!facility.pending) return;
  facility.eventId = loop.schedule(fromMs + facility.pending.durationMs, {
    kind: EVENT_PRODUCE,
    subject: facility.id,
  });
}

/**
 * 시설 한 번 생산(재료가 모자라면 세고 다음 차례를 기다린다). 생산했으면 그 도시와 오염 몫(레벨 × 시설 오염 값 × 일한 ms,
 * docs/adr/2026-11-01-gardener-r5b.md 1절)을 돌려준다. 생산하지 못했으면 undefined
 */
export function onProduce(
  economy: Economy,
  world: SimWorld,
  loop: SimLoop<SimEvent>,
  facilityId: number,
  nowMs: number,
): { city: number; weightedWorkMs: number } | undefined {
  const facility = economy.facilities.get(facilityId);
  const city = facility ? world.cities.get(facility.city) : undefined;
  if (!facility || !city) return undefined;
  const batch = facility.pending;
  const outputs = batch?.outputs ?? facility.recipe.outputs;
  const workMs = batch?.durationMs ?? 0;
  const done = runRecipe(
    world.book,
    city.owner,
    city.id,
    facility.recipe,
    { consume: consumeAccount(world.book), source: sourceAccount(world.book) },
    nowMs,
    outputs,
  );
  if (!done) economy.today.inputShort += 1;
  else for (const output of outputs) bump(economy.today.produced, output.asset, output.qty);
  scheduleProduce(economy, world, loop, facility, nowMs);
  if (!done) return undefined;
  const pollution = economy.catalog.facilities.get(facility.recipe.facility)?.pollution ?? 0;
  return { city: city.id, weightedWorkMs: facility.level * pollution * workMs };
}

/** 도시 유지비(정시) */
export function onUpkeep(
  economy: Economy,
  world: SimWorld,
  loop: SimLoop<SimEvent>,
  cityId: number,
  nowMs: number,
): void {
  const city = world.cities.get(cityId);
  if (!city) return;
  const due = dueNecessities(economy.catalog.necessities, nowMs);
  const units = economy.cityUnits.get(cityId) ?? 0;
  for (const spec of due) {
    const paid = payNecessities(
      world.book,
      city.owner,
      city.id,
      units,
      [spec],
      consumeAccount(world.book),
      nowMs,
    );
    economy.today.dueByCity.set(cityId, (economy.today.dueByCity.get(cityId) ?? 0) + units);
    if (paid.shortUnits > 0)
      economy.today.shortByCity.set(cityId, (economy.today.shortByCity.get(cityId) ?? 0) + paid.shortUnits);
    if (paid.shortUnits > 0)
      economy.today.shortUnits.set(
        spec.asset,
        (economy.today.shortUnits.get(spec.asset) ?? 0) + paid.shortUnits,
      );
  }
  loop.schedule(nowMs + HOUR_MS, { kind: EVENT_UPKEEP, subject: cityId });
}

/** 환전 회차: 화폐마다 발행 나라가 양쪽 값을 내고(대리 규칙의 시장 조성), 짝마다 체결한다 */
export function onFx(
  economy: Economy,
  world: SimWorld,
  loop: SimLoop<SimEvent>,
  nowMs: number,
  quote: (market: FxMarket, issuerFaction: SimFaction) => void,
): void {
  for (const [currency, market] of economy.fx) {
    const issuerFaction = world.factions.get(economy.issuer.get(currency) ?? 0);
    if (issuerFaction?.alive) quote(market, issuerFaction);
    market.run(nowMs);
  }
  loop.schedule(nextFxRoundAt(nowMs, economy.settings.fxEveryMs), { kind: EVENT_FX, subject: 0 });
}

/** 기준 통화로 본 로트당 값(지난 환전 체결가, 없으면 같은 값 = 로트 크기) */
export function fxRate(economy: Economy, currency: string): bigint {
  if (currency === economy.base) return economy.settings.fxLot;
  return economy.fx.get(currency)?.lastPrice ?? economy.settings.fxLot;
}

/** 운송을 보낸다(출발지 창고 → 운송 중) */
export function ship(
  economy: Economy,
  world: SimWorld,
  loop: SimLoop<SimEvent>,
  owner: number,
  asset: string,
  from: number,
  to: number,
  qty: bigint,
  nowMs: number,
): boolean {
  if (qty <= 0n || from === to || world.book.balanceOf(owner, asset, from) < qty) return false;
  const id = economy.nextCargoId();
  world.book.post({
    kind: "ship",
    atMs: nowMs,
    entries: [
      { account: world.book.ownerAccount(owner, asset, from), amount: -qty },
      { account: world.book.systemAccount(`transit:${asset}:${from}`, asset, from), amount: qty },
    ],
  });
  economy.cargo.set(id, { id, owner, asset, from, to, qty });
  loop.schedule(nowMs + economy.settings.shipMs, { kind: EVENT_CARGO, subject: id });
  return true;
}

/** 운송 도착(운송 중 → 도착지 창고) */
export function onCargo(economy: Economy, world: SimWorld, cargoId: number, nowMs: number): void {
  const cargo = economy.cargo.get(cargoId);
  if (!cargo) return;
  economy.cargo.delete(cargoId);
  world.book.post({
    kind: "cargo",
    atMs: nowMs,
    entries: [
      {
        account: world.book.systemAccount(`transit:${cargo.asset}:${cargo.from}`, cargo.asset, cargo.from),
        amount: -cargo.qty,
      },
      { account: world.book.ownerAccount(cargo.owner, cargo.asset, cargo.to), amount: cargo.qty },
    ],
  });
}

/**
 * 화폐로 매긴 생필품 시세 ÷ 시작 시세(천분율). 시작 시세 = 그 세계에서 그 물건 시장의 첫 가격(295)이라, 지수는 "세계가 처음 열릴 때 값의
 * 몇 ‰인가"다(1000 = 첫 가격 그대로). 시세(체결)가 없으면 undefined
 */
export function priceIndexMilli(economy: Economy, currency: string): number | undefined {
  let sum = 0n;
  let count = 0n;
  for (const spec of economy.catalog.necessities) {
    const startPrice = economy.catalog.startPrice.get(spec.asset) ?? 1n;
    for (const perItem of economy.markets.values()) {
      const market = perItem.get(spec.asset);
      if (!market || market.config.currency !== currency || market.lastPrice === undefined) continue;
      sum += (market.lastPrice * 1000n) / startPrice;
      count += 1n;
    }
  }
  return count === 0n ? undefined : Number(sum / count);
}

/** 하루 끝 중앙은행(발행 나라가 살아 있는 화폐마다, 화폐 차례) */
export function bankDay(
  economy: Economy,
  world: SimWorld,
  nowMs: number,
  rule: CentralBankRule = TEST_CENTRAL_BANK_RULE,
): void {
  for (const [currency, factionId] of economy.issuer) {
    const faction = world.factions.get(factionId);
    if (!faction?.alive) continue;
    const step = centralBankStep(
      {
        outstanding: moneySupply(world.book, currency),
        indexMilli: priceIndexMilli(economy, currency),
        treasury: world.book.balanceOf(factionId, currency),
        interestOwed: economy.interestOwed.get(currency) ?? 0n,
      },
      rule,
    );
    economy.interestOwed.set(currency, step.interestOwed);
    economy.interestPaid.set(factionId, (economy.interestPaid.get(factionId) ?? 0n) + step.interestBurn);
    burn(economy, world.book, currency, factionId, step.interestBurn + step.burn, nowMs);
    issue(economy, world.book, currency, factionId, step.issue, nowMs);
  }
}

/** 한 세력의 위치 있는 계정 잔고를 다른 세력으로 옮긴다(where: 위치 거르기). 거래 하나 */
export function transferHoldings(
  world: SimWorld,
  from: SimFaction,
  to: SimFaction,
  where: (location: number | null) => boolean,
  atMs: number,
): void {
  const moves: { asset: string; location: number | null; amount: bigint; account: number }[] = [];
  for (const account of world.book.accounts()) {
    if (account.ownerId !== from.id || account.balance <= 0n || !where(account.location)) continue;
    moves.push({
      asset: account.asset,
      location: account.location,
      amount: account.balance,
      account: account.id,
    });
  }
  if (moves.length === 0) return;
  const entries = [];
  for (const move of moves) {
    entries.push({ account: move.account, amount: -move.amount });
    entries.push({ account: world.book.ownerAccount(to.id, move.asset, move.location), amount: move.amount });
  }
  world.book.post({ kind: "transfer", atMs, entries });
}

/** 도시 주인이 바뀌기 전에: 그 도시 거래소를 새 주인 화폐로 바꾸고(걸린 주문은 돌려줌), 옛 주인의 그 도시 창고를 넘긴다 */
export function beforeCityTransfer(
  economy: Economy,
  world: SimWorld,
  cityId: number,
  from: SimFaction,
  to: SimFaction,
  nowMs: number,
): void {
  for (const market of economy.markets.get(cityId)?.values() ?? [])
    market.retarget(
      nowMs,
      economy.currencyOf.get(to.id) ?? economy.base,
      to.id,
      economy.taxOf.get(to.id) ?? 0,
    );
  transferHoldings(world, from, to, (location) => location === cityId, nowMs);
}

/**
 * 도시가 폐허가 되기 바로 전(docs/adr/2026-11-01-gardener-r5b.md 4절, D-464 217): 그 도시 거래소의 걸린 주문을 돌려주고 거래소를
 * 닫는다, 그 도시 시설은 멈춘다. 그 도시 창고의 물건은 주인마다 갈 곳(homeOf, ruinedGoods.ts)으로: NPC 세력·유저 모두 같은 규칙으로 그
 * 주인의 가장 가까운 다른 도시 창고로 옮기고(기획 D-518 535·540 나, D-397), 다른 도시가 없는 NPC 세력 물건만 소각한다. 걸린 주문을 먼저
 * 돌려주므로 묶였던 물건도 함께 간다. 운송 중인 화물은 그대로 도착한다(받을 곳 없음). 기본 homeOf는 거리를 모를 때의 규칙(가장 오래된 다른
 * 도시) — 시뮬 run.ts는 합성 격자 거리를, 서버는 2차맵 칸 거리를 준다
 */
export function cityRuined(
  economy: Economy,
  world: SimWorld,
  loop: SimLoop<SimEvent>,
  cityId: number,
  nowMs: number,
  homeOf: RuinedGoodsHome = ruinedGoodsHome(world),
): void {
  for (const market of economy.markets.get(cityId)?.values() ?? []) {
    const owners = [...new Set(market.orders().map((order) => order.owner))].toSorted((a, b) => a - b);
    for (const owner of owners) market.cancelOwner(owner, nowMs);
  }
  economy.markets.delete(cityId);
  for (const [id, facility] of [...economy.facilities].toSorted((a, b) => a[0] - b[0])) {
    if (facility.city !== cityId) continue;
    if (facility.eventId !== undefined) loop.cancel(facility.eventId);
    economy.facilities.delete(id);
  }
  economy.cityUnits.delete(cityId);
  rehomeRuinedGoods(world, cityId, nowMs, homeOf);
}

/** 반란 세력은 부모 화폐·세율을 빌려 쓴다 */
export function factionBorn(economy: Economy, child: SimFaction, parent: SimFaction): void {
  economy.currencyOf.set(child.id, economy.currencyOf.get(parent.id) ?? economy.base);
  economy.taxOf.set(child.id, economy.taxOf.get(parent.id) ?? 0);
  economy.baseTax.set(child.id, economy.baseTax.get(parent.id) ?? 0);
}

/** 세력의 거래세를 바꾼다: 그 세력 도시 거래소의 세율만 바꾼다(걸린 주문은 그대로) */
export function setTax(economy: Economy, faction: SimFaction, taxBp: number): void {
  economy.taxOf.set(faction.id, taxBp);
  for (const cityId of [...faction.cities].toSorted((a, b) => a - b))
    for (const market of economy.markets.get(cityId)?.values() ?? []) market.setTax(taxBp);
}

/** 경제 몫 불변 조건: 거래소·환전 에스크로, 운송 중 = 실린 화물 합 */
export function checkEconomy(economy: Economy, world: SimWorld): string[] {
  const problems: string[] = [];
  for (const perItem of economy.markets.values())
    for (const market of perItem.values()) problems.push(...market.checkEscrow());
  for (const market of economy.fx.values()) problems.push(...market.checkEscrow());
  // D-299: 도시를 모두 잃은(떠도는) 세력의 화폐는 사라져야 한다. 화폐를 찍는 세력은 고정 국가뿐이고 시작 도시를 잃지 않는다(D-341)
  for (const [currency, issuer] of economy.issuer) {
    const faction = world.factions.get(issuer);
    if (faction?.alive && faction.cities.size === 0)
      problems.push(`E3 wandering faction ${issuer} still issues ${currency}`);
  }
  const transit = new Map<string, bigint>();
  for (const cargo of economy.cargo.values())
    bump(transit, `transit:${cargo.asset}:${cargo.from}`, cargo.qty);
  for (const account of world.book.accounts()) {
    if (!account.systemCode?.startsWith("transit:")) continue;
    if (account.balance !== (transit.get(account.systemCode) ?? 0n))
      problems.push(`transit mismatch ${account.systemCode}`);
  }
  return problems;
}
