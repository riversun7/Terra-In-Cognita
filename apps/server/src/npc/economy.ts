// NPC 도시 경제(서버) — docs/adr/2026-11-07-play-flow.md "WP4 도시 경제·거래소", 경제 코어 ADR 2026-10-31-economy-core.md 7·8절.
// NPC 사회 런타임의 거울 세계에 시뮬과 같은 경제 실행(@terra/sim runEconomy: 생산·생필품 유지비·NPC 거래·운송·세력 고리)을 붙인다.
// 서버 몫만 여기 둔다:
// - 화폐(WP6 나라 화폐, npc/currency.ts): 도시 거래소 값 = 그 도시 주인 나라의 국가 프리셋 화폐(반란 세력은 부모 것), 거래세 = 그 프리셋 세율.
//   기준 통화 = 서버 시험 화폐(ASSET_CREDIT, 유저 지갑·서버 돈). 환전 = 나라 화폐 ↔ 기준 통화 동시호가(market/fx.ts, 시뮬 createFxMarket·onFx·quoteFx
//   그대로), 처음 발행(E6)·하루 끝 중앙은행(bankDay)도 시뮬 함수 그대로 돈다. 중앙은행의 아직 소각하지 못한 이자(interestOwed)는 메모리다(다시 켜면 0).
// - 거래소: market/books.ts 모음(도시 × 물건, 저장·복원). 시뮬 Economy.markets가 그 표를 그대로 본다.
// - 생산 시설(@terra/sim planCityFacilities): 그 도시에 선 NPC 세력 시설(건물, 다 지은 것)은 그 시설의 특산 레시피(나라 특산 = 국가 프리셋
//   성격 칸 cityJobs, 없으면 기본 셋 농장·주방·벌목장 [임시] — 특산 차례가 레시피를 고른다, 기획 답 553 나. 그 시설 특산이 없으면 팩 첫
//   레시피) + 건물이 받지 못한 특산의 도시 직무(그 시설 건물이 없거나 건물보다 특산이 많아 남은 것 — 휴먼이 Lv1, 기획 답 531 다·600 나).
//   일꾼 = 그 도시 휴먼을 굶음 먼저(생필품 사슬에 하루 몫만큼, 기획 답
//   532 나) 둔 뒤 시설마다 한 명씩 돌려 자리 수(레벨 × 자리)까지(@terra/sim assignCityWorkers). 처음·하루 끝·새 도시마다 다시 맞춘다.
// - 처음 창고(@terra/sim cityStartStock, 기획 답 554 다): NPC 도시마다 한 번 생필품 = 휴먼 수 × 몇 시간분(국가 프리셋 성격 칸
//   startNecessityHours, 없으면 48시간 — 시뮬 목표 재고와 같은 시간) + 특산 물건 = 성격 칸 startStock의 고정 양을 넣는다(원장 endow, 중복
//   방지 키 npc_endow:<도시>). 반란 세력은 부모 국가의 성격을 쓴다.
// - 도시 매입 호가(기획 답 530 가): 시뮬 NPC 거래 판단(onTrade)의 마지막 차례가 자기 도시의 모자란 물건을 지난 값의 90%로 상시 매수 주문한다
//   (시뮬·서버 같은 함수 placeCityBids — docs/adr/2026-11-07-play-flow.md "WP5 나라 성격"). 같은 판단에서 수입한 양은 뺀다(기획 답 555 나).
//   다음 판단이 주문 거두기로 함께 거둔다.
// - 환전 회차(기획 답 564 다): 회차 길이의 정시(1시간이면 매시 정각, UTC 0시부터 센 배수)에 돈다(@terra/sim nextFxRoundAt). 서버를 다시
//   켜도 화면 "다음 체결까지"가 같은 시각이고, 끈 동안 지나간 회차는 따라 돌리지 않는다(걸린 주문은 켠 뒤 첫 회차에 체결).
// - 운송은 즉시다(shipMs 0: 화물 줄을 저장하지 않아도 같은 처리 안에서 도착한다 [임시]). 운영 스위치(49 N53): 생산 끔이면 생산을 건너뛰고 다음
//   차례만 잡고, 거래소 끔이면 NPC 거래 판단을 건너뛴다(주문 명령은 거래소 서비스가 막는다).
import type { BusinessCore } from "../business/core.ts";
import {
  DAY_MS,
  type EcoFacility,
  type Economy,
  type EconomyRun,
  EVENT_FX,
  EVENT_PRODUCE,
  EVENT_TRADE,
  EVENT_UPKEEP,
  type GatherSettings,
  HOUR_MS,
  type RuinedGoodsHome,
  type ScenarioEconomy,
  type ScheduledEvent,
  type SimEvent,
  type SimFaction,
  type LedgerBook,
  type SimHooks,
  type SimLoop,
  type SimWorld,
  type SocietyCoefficients,
  assignCityWorkers,
  type CityWorkSlot,
  cityStartStock,
  defaultGatherStat,
  lotSizeOf,
  nextFxRoundAt,
  planCityFacilities,
  prepareCatalog,
  runEconomy,
  scheduleEconomy,
  scheduleProduce,
  workerEffects,
  catchmentSettingsOf,
  createCatchmentState,
  haulOn,
  haulTimeMs,
  walkMsPerCell,
  isSelectRecipe,
  npcSelectTier,
  tierTemperOf,
} from "@terra/sim";
import type { CatchmentLand } from "@terra/shared/catchment";
import { planetCatchmentGeometry } from "./catchmentGeometry.ts";
import { type CatchmentSaved, restoreCatchment } from "./catchmentStore.ts";
import type { CityRestPlan, RestFacility } from "./cityRest.ts";
import type { WorkFacility } from "./humanPlaces.ts";
import { type CarryBoard, type CarryBoardOptions, createCarryBoard, peopleCounter } from "./npcCarry.ts";
import { EVENT_NPC_DELIVER, type NpcBusiness, createNpcDeliveries } from "./npcDelivery.ts";
import { shopPriceSource } from "./npcShopPrice.ts";
import { createNpcWages } from "./npcWages.ts";
import type { NpcBuildWorld } from "./cityBuild.ts";
import type { ServerEconomyCatalog } from "../market/catalog.ts";
import { rulingVaultOf } from "../factionIdentity/houseVault.ts";
import { type MarketRegistry, createMarketRegistry } from "../market/books.ts";
import { type FxRegistry, createFxRegistry } from "../market/fx.ts";
import { fxFeeHook } from "../market/fxFeeHook.ts";
import { loadFx, loadMarkets } from "../market/load.ts";
import { type Lockers, createLockers, loadLockers } from "../market/lockers.ts";
import type { OwnerRow, QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import { ASSET_CREDIT } from "../world/settlement.ts";
import { DEFAULT_TAX_BP, MINT_KEY, mintNationCurrencies, nationCurrencies } from "./currency.ts";
import { type NationPersonality, type NationPreset, nationPresetOf } from "./nations.ts";

export { DEFAULT_TAX_BP } from "./currency.ts";
/** [임시] 보이는 운반 일정에 더하는 내려놓는 시간(ms) */
const HAUL_SHOWN_EXTRA_MS = 20_000;
/** 처음 창고 중복 방지 키 앞머리 */
const ENDOW_KEY = "npc_endow:";
/** 도시 직무 시설 ID(건물 ID와 겹치지 않게 큰 수부터, 도시마다 16칸 — 팩 성격 칸 cityJobs는 8개까지) */
const CITY_JOB_BASE = 1_000_000_000_000;
/**
 * [임시] 기본 도시 직무(국가 프리셋에 성격 칸 cityJobs가 없을 때, 기획 답 531 다의 "칸이 없으면"): 그 도시에 이 시설 건물이 없으면 휴먼이
 * 이 레시피를 Lv1로 돌린다(시뮬 econ16 농업 나라 계획과 같은 것 — 생필품 식량 사슬과 목재). 건물이 있으면 건물이 대신한다.
 * 바뀜 (2026-11-12, 기획 D-535 정리 1144 나): 통나무 벌목(cut_logs)도 — 짓기 레벨 1 재료(통나무)를 모든 나라가 스스로 캔다
 */
export const CITY_JOBS: readonly { readonly facility: string; readonly recipe: string }[] = [
  { facility: "farm", recipe: "farm_grain" },
  { facility: "kitchen", recipe: "cook_ration" },
  { facility: "lumber_camp", recipe: "cut_timber" },
  { facility: "lumber_camp", recipe: "cut_logs" },
];

/**
 * [임시] 서버 경제 손잡이(시뮬 시나리오 economy 칸 모양, econ16 값에서): 거래 판단 1시간(econ16 3시간보다 잦게 — 실제 시간 화면이라),
 * 운송 즉시, 걸어 둔 주문 수명 7일(E10 기획 잠정), 환전 회차 1시간(E8 기존 값), 1인당 하루 거래액 200(처음 발행 E6), 기준 통화 준비금 0
 * (고정 나라가 처음 받은 시험 화폐가 그 자리), 환전 로트 10(화폐 최소 단위 — 정착 지원금 72~108로도 몇 로트를 살 수 있게. 값 눈금은 로트당
 * 기준 통화 1이라 10%다, 질문 561)
 */
export const SERVER_ECONOMY_SETTINGS: ScenarioEconomy = {
  tradeEveryMs: HOUR_MS,
  fxEveryMs: HOUR_MS,
  shipMs: 0,
  orderLifeMs: 7 * DAY_MS,
  perCapitaDaily: 200n,
  baseReserveBp: 0,
  fxLot: 10n,
};

/** 그 도시에 선 시설 하나(다 지은 것) */
export interface CityFacility {
  readonly buildingId: number;
  readonly facility: string;
  readonly level: number;
  readonly ownerId: number | null;
  /** 붙은 면적 모듈 수(건물 채집소, 기획 D-569 1768). 없으면 0 */
  readonly plots?: number | undefined;
}

/** 월드가 넘기는 경제 입력(world.ts → runtime.ts) */
export interface NpcEconomyInput {
  /**
   * 사업장 장부(D-548·D-555, docs/adr/2026-11-15-business-ledger.md): 남의 숙소 요금은 그 숙소 금고로 든다(소득세 포함). 없으면 숙소 주인
   * 지갑(옛 길, 시험)
   */
  readonly business?: (NpcBusiness & Pick<BusinessCore, "settle" | "vault" | "taxIncome">) | undefined;
  /** 팩 기준 값(1단위 — 사업장 판매 기본 값, NPC 시설 판매가의 기준, 2153). 없으면 NPC는 값을 정하지 않는다 */
  readonly unitPriceOf?: ((asset: string) => bigint | undefined) | undefined;
  /** 시뮬 경제 목록(없으면 경제 끔) */
  readonly catalog: () => ServerEconomyCatalog | undefined;
  /** 팩 국가 프리셋(나라 성격: 도시 직무·처음 창고). 없으면 모든 국가가 기본 */
  readonly presets?: readonly NationPreset[] | undefined;
  /** 그 도시에 선 시설(다 지은 것, 일하는 상태) */
  readonly facilitiesIn: (cityId: number) => readonly CityFacility[];
  /**
   * 그 도시의 숙소(생활 단계 시설, 다 지은 것) 건물 ID — 일꾼의 밤 쉼터(humanPlaces.ts, docs/adr/2026-11-11-city-building-layout.md).
   * 없으면 일꾼도 도시 시청 칸 둘레에서 쉰다
   */
  readonly lodgingsIn?: ((cityId: number) => readonly number[]) | undefined;
  /**
   * 일꾼 쉼터·채집소 옮김 계획(질문 1047 다·1050 가, npc/cityRest.ts planCityRest): 그 도시 시설 일꾼(시설 ID 차례)·주거·주인으로 2차맵
   * 숙소·창고 자리를 보고 셈한다. 없거나 undefined면 생산 속도 배율 1000·옮김 0(예전과 같다)
   */
  readonly cityRest?:
    | ((
        cityId: number,
        city: { readonly ownerId: number; readonly housing: number },
        facilities: readonly RestFacility[],
        rules: SocietyCoefficients,
      ) => CityRestPlan | undefined)
    | undefined;
  /**
   * 배후지 채집 다툼(docs/adr/2026-11-11-city-catchment.md "바뀜 (2026-11-12)", 질문 1024 나·다): 1차맵 칸의 행성 값. 있고 설정 칸
   * city_catchment_radius_cells > 0이면 NPC 도시 채집 시설이 배후지 칸에서 캔 몫만큼 내고, 몫이 문턱 아래면 구인하지 않는다. 없으면 옛 경제
   */
  readonly land?: ((mapKey: number) => CatchmentLand | undefined) | undefined;
  /** NPC 증축 짓기 자리(질문 1101 나, cityBuild.ts — 건물 서비스·2차맵). 없으면 NPC가 짓지 않는다 */
  readonly build?: NpcBuildWorld | undefined;
  /**
   * 그 도시 물자 거래소 건물 ID(기획 D-561, docs/adr/2026-11-16-exchange-buildings.md — 유저 거래소 물건 자리, market/exchangeStock.ts).
   * 없으면 유저 물건도 도시 창고(예전과 같다)
   */
  readonly exchangeOf?: ((cityId: number) => number | undefined) | undefined;
  /**
   * 도시 창고 ↔ 그 도시 물자 거래소 건물 운반 시간(ms, 기획 D-564 1626 NPC 운반 시간 셈 — market/npcHaul.ts). exchangeOf와 함께 있으면 NPC도 거래소
   * 건물이 있어야 거래하고 물건 자리가 거래소 건물 창고다(질문 1945 답). 없으면 NPC는 예전처럼 도시 창고로 바로
   */
  readonly exchangeHaulMs?: ((cityId: number, buildingId: number, grams: bigint) => number) | undefined;
  /** 자산 한 기본 단위 무게(g) — NPC 운반 시간 */
  readonly weightOf?: ((asset: string) => bigint) | undefined;
  /** 거래소 건물 가운데 칸(보이는 NPC 거래소 운반꾼이 내려놓는 곳 — 기획 대조 2088). 없으면 거래소 운반은 시간 셈만 */
  readonly exchangeCenter?:
    | ((buildingId: number) => { readonly x: number; readonly y: number } | undefined)
    | undefined;
  /** 일하는 외환 거래소(도시 → 건물 ID)·그 건물의 환전 이용료 요율(만분율) — 질문 2086 환전 이용료. 둘 다 있어야 이용료를 받는다 */
  readonly fxExchanges?: (() => ReadonlyMap<number, number>) | undefined;
  readonly fxFeeBp?: ((buildingId: number) => number) | undefined;
  /** 도시 칸(시청 — 거래소 → 도시 창고 돌려보내기 운반꾼이 내려놓는 곳, 2157). 없으면 거래소 건물 가운데 */
  readonly cityCell?:
    | ((cityId: number) => { readonly x: number; readonly y: number } | undefined)
    | undefined;
  /** 물자 거래소 이용료 요율(D-574 질문 2085 — 주인이 정한 값, 없으면 적정 요율. fxFee.ts exchangeFeeOf). 없으면 설정 칸 적정 요율 */
  readonly exchangeFeeBp?: ((buildingId: number) => number) | undefined;
  /** 빈 일꾼 운반꾼이 없을 때 같은 도시 물류센터에 맡기기(기획 대조 2274 — logistics/npcOutsource.ts). 없으면 기다리기만 */
  readonly haulOutsource?: ((book: LedgerBook) => CarryBoardOptions["outsource"]) | undefined;
}

/** 시설 하나의 지금 생산(화면용) */
export interface FacilityRun {
  readonly facility: EcoFacility;
  /** 건물이면 건물 ID, 도시 직무면 null */
  readonly buildingId: number | null;
  readonly startedAtMs: number;
  readonly endsAtMs: number | null;
}

export interface ServerEconomy {
  readonly economy: Economy;
  readonly registry: MarketRegistry;
  /** 거래소 개인 창고 넓힌 칸(기획 D-571 1943, market/lockers.ts) */
  readonly lockers: Lockers;
  /** 환전 시장 모음(나라 화폐 ↔ 기준 통화) */
  readonly fx: FxRegistry;
  /** NPC 운반꾼의 실제 화물(npcCarry.ts — 시설 산출 운반·거래소 운반, 기획 대조 2052·2088) */
  readonly carry: CarryBoard;
  readonly run: EconomyRun;
  /** 세력·사회·NPC 판단에 넘기는 고리(시뮬 고리 + 서버 몫) */
  readonly hooks: SimHooks;
  /** 경제 사건이면 처리하고 true */
  handle(event: ScheduledEvent<SimEvent>, nowMs: number): boolean;
  /** 하루 끝(세력·사회 하루 끝 전): 중앙은행(시뮬 bankDay) */
  beforeDay(nowMs: number): void;
  /** 하루 끝(세력·사회 하루 끝 뒤): 하루 줄 기록·시설 다시 맞추기 */
  afterDay(nowMs: number, day: number): void;
  /** 그 도시의 생산 시설을 지금 건물대로 다시 맞춘다(NPC 증축이 다 지은 건물을 다음 판단에 넣는다 — 질문 1101 나, cityBuild.ts) */
  refreshCity(cityId: number, nowMs: number): void;
  /** 그 도시 주인 나라의 특산 줄(나라 성격 칸 cityJobs, 없으면 기본 셋 — NPC 증축 목표 질문 1142 다가 본다) */
  cityJobsOf(cityId: number): readonly { readonly facility: string; readonly recipe: string }[];
  /** 그 도시의 생산 시설(화면용, 시설 ID 차례) */
  production(cityId: number): FacilityRun[];
  /** 그 도시 일꾼 쉼터·옮김 계획(마지막 맞추기, 없으면 undefined — 휴먼 집·일터와 화면이 본다) */
  restPlan(cityId: number): CityRestPlan | undefined;
  /**
   * 휴먼 집·일터(humanPlaces.ts)가 쓰는 그 도시 시설 일꾼(시설 ID 차례). 건물 시설에 옮김 시간이 있으면 이번 산출의 끝 몫을 보이는 운반 일정으로
   * 붙인다(D-570 1886 — 판정은 시간 셈 그대로)
   */
  workFacilities(cityId: number): WorkFacility[];
  /** 만료 주문 거두기(런타임 틱이 부른다) */
  expire(nowMs: number): number;
  /** 다음 환전 회차 시각(회차 길이의 정시, 564 다: 마지막 회차 다음 정시, 아직 없으면 켠 시각 다음 정시) */
  nextFxAt(): number;
  /** 지난 호출 뒤 구간 지표 */
  takeMetrics(): Record<string, number>;
  check(): string[];
}

export interface ServerEconomyOptions {
  readonly world: SimWorld;
  readonly writer: WorldWriter;
  readonly pool: QueryPool;
  readonly owners: ReadonlyMap<number, OwnerRow>;
  readonly loop: SimLoop<SimEvent>;
  readonly rules: () => SocietyCoefficients;
  readonly input: NpcEconomyInput;
  readonly startMs: number;
  readonly now: () => number;
  readonly log: { info(obj: object, message: string): void; warn(obj: object, message: string): void };
  /** 도시 → 그 도시 2차맵(1차맵 칸 키, 배후지 칸을 센다). 없으면 배후지 다툼을 켜지 않는다 */
  readonly cityMapOf?: ((cityId: number) => number | undefined) | undefined;
  /**
   * 폐허가 된 도시 창고 물건의 갈 곳(기획 D-518 535·540 나, npc/ruinsRuntime.ts — 2차맵 칸 거리·유저 나라). 없으면 시뮬 기본(거리를 모를 때:
   * 주인의 가장 오래된 다른 도시, 다른 도시가 없는 NPC 세력 물건은 소각, 유저 물건은 자리 없음)
   */
  readonly goodsHome?: RuinedGoodsHome | undefined;
  /** 저장한 배후지 칸 재고·도시 결과(질문 1061 나, catchmentStore.ts). 배후지 다툼을 켤 때 시설을 놓기 전에 넣는다 */
  readonly catchmentSaved?: CatchmentSaved | undefined;
}

/** 세력·사회 계수표 → 채집 손잡이(시뮬 run.ts와 같은 칸) */
export function gatherSettingsOf(c: SocietyCoefficients): GatherSettings {
  return {
    levelBonus: c.gatherLevelBonus,
    defaultStat: defaultGatherStat(c.cyborg.initialSum),
    progressDivisor: c.productionMainDivisor,
    yieldPerStatPm: c.productionSubYieldPm,
    tierProgressBase: c.gatherTierProgressBase,
    tierProgressStep: c.gatherTierProgressStep,
    tickMs: c.gatherTickMs,
    oreGrams: c.gatherOreGrams,
    conditionCap: c.condition.cap,
    building: c.buildingGather,
  };
}

/** 세력의 나라 성격: 그 세력 코드의 국가 프리셋 → 반란 부모·종주 → 없음(거래세와 같은 차례, 도시 이름과 같은 nationPresetOf) */
export function personalityOfFaction(
  world: SimWorld,
  faction: SimFaction,
  presets: readonly NationPreset[],
): NationPersonality | undefined {
  return nationPresetOf(faction.id, (id) => world.factions.get(id), presets)?.personality;
}

export async function startServerEconomy(o: ServerEconomyOptions): Promise<ServerEconomy | undefined> {
  const source = o.input.catalog();
  if (!source) return undefined;
  const { world, loop, writer } = o;
  const book = world.book;
  const catalog = prepareCatalog(source.catalog);
  const loaded = await loadMarkets(o.pool, o.startMs);
  const loadedFx = await loadFx(o.pool, o.startMs);
  const keysLike = async (prefix: string): Promise<Set<string>> =>
    new Set(
      (
        await o.pool.query(`select idempotency_key from ledger_transactions where idempotency_key like $1`, [
          `${prefix}%`,
        ])
      ).rows.map((row) => String(row.idempotency_key)),
    );
  const endowed = await keysLike(ENDOW_KEY);
  const minted = await keysLike(MINT_KEY);

  // 나라 화폐(npc/currency.ts): 세력마다 화폐·세율, 화폐마다 찍는 나라
  const { currencyOf, taxOf, issuer } = nationCurrencies(world, catalog, ASSET_CREDIT);
  const isUser = (ownerId: number): boolean => (o.owners.get(ownerId)?.userId ?? null) !== null;
  // NPC 운반꾼 화물(2052·2088): 시설 산출·거래소 운반이 같이 쓴다. 빈 일꾼 운반꾼 = 그 도시 휴먼 중 운반하지 않는 사람(2155)
  const people = peopleCounter(o.now, () => world.units.values());
  const carry = createCarryBoard(book, { peopleOf: people, outsource: o.input.haulOutsource?.(book) });
  // 거래소 모음: 호가창 물건 + 있는 도시에만. 화폐·세율·국고 = 그 도시 주인
  const registry = createMarketRegistry({
    ledger: book,
    writer,
    loaded,
    allowed: (cityId, asset) => world.cities.has(cityId) && source.bookItems.has(asset.slice(5)),
    configOf: (cityId, asset) => {
      const owner = world.cities.get(cityId)?.owner ?? 0;
      return {
        currency: currencyOf.get(owner) ?? ASSET_CREDIT,
        taxBp: taxOf.get(owner) ?? DEFAULT_TAX_BP,
        treasuryOwner: owner,
        lotSize: lotSizeOf(catalog, asset),
      };
    },
    isUser,
    exchangeOf: o.input.exchangeOf,
    // 거래소 이용료(질문 1948 답, D-564 1682·D-548): 판 쪽 지갑 → 그 도시 물자 거래소 건물 금고(사업장 장부 수입·소득세)
    fee: o.input.exchangeOf
      ? {
          of(cityId) {
            const buildingId = o.input.exchangeOf?.(cityId);
            return buildingId === undefined
              ? undefined
              : {
                  buildingId,
                  // 주인이 정한 요율(D-574 질문 2085 — exchangeFeeBp 고리), 없으면 적정 요율
                  bp:
                    o.input.exchangeFeeBp?.(buildingId) ??
                    Math.max(0, Math.floor(o.rules().business.exchangeFeeBp)),
                };
          },
          charge({ seller, currency, amount, buildingId, atMs }) {
            const from = book.ownerAccount(seller, currency);
            if (book.balance(from) < amount) return;
            o.input.business?.receive({
              from,
              buildingId,
              asset: currency,
              amount,
              kind: "exchange_fee",
              atMs,
            });
          },
        }
      : undefined,
    // NPC도 거래소 건물이 있어야 거래하고 운반 시간을 센다(질문 1945 답 — D-212·D-564 1626, market/npcHaul.ts)
    npcHaul: o.input.exchangeHaulMs
      ? {
          haulMs: o.input.exchangeHaulMs,
          weightOf: o.input.weightOf,
          // 보이는 운반꾼이 기본(기획 대조 2088 — D-564 1626): 보는 2차맵은 일 없는 휴먼이 화물을 지고 거래소 건물로
          carry: o.input.exchangeCenter
            ? { board: carry, centerOf: o.input.exchangeCenter, dropOf: o.input.cityCell }
            : undefined,
        }
      : undefined,
    now: o.now,
  });
  const lockers = createLockers(await loadLockers(o.pool), writer);
  // 환전 시장(찍는 나라가 있는 화폐마다, 걸린 주문이 남은 짝은 fx.ts가 부팅 때 되살린다)
  const fx = createFxRegistry({
    ledger: book,
    writer,
    loaded: loadedFx,
    base: ASSET_CREDIT,
    lotSize: SERVER_ECONOMY_SETTINGS.fxLot,
    isUser,
    now: o.now,
    fee: fxFeeHook(o.input, book, (cityId) => currencyOf.get(world.cities.get(cityId)?.owner ?? -1)),
  });
  for (const currency of issuer.keys()) fx.ensure(currency);
  let lastOrderId = 0;
  const economy: Economy = {
    catalog,
    settings: SERVER_ECONOMY_SETTINGS,
    gather: gatherSettingsOf(o.rules()),
    base: ASSET_CREDIT,
    markets: registry.markets,
    fx: fx.markets,
    currencyOf,
    taxOf,
    baseTax: new Map(taxOf),
    issuer,
    interestOwed: new Map(),
    interestPaid: new Map(),
    facilities: new Map(),
    cityUnits: new Map(),
    cargo: new Map(),
    // 시뮬 거래소·환전 시장을 차릴 때만 쓴다(서버 거래소 주문 ID는 모음이 센다). 운송 ID는 메모리(운송이 즉시라 남지 않는다)
    nextOrderId: () => {
      lastOrderId += 1;
      return lastOrderId;
    },
    nextCargoId: (() => {
      let last = 0;
      return () => {
        last += 1;
        return last;
      };
    })(),
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
  // 배후지 채집 다툼: 행성 값이 있고 설정 칸이 켜져 있을 때(켤 때 한 번 정한다 — 끄려면 다시 켠다)
  const land = o.input.land;
  if (land && o.cityMapOf && o.rules().worldSeed.catchmentRadiusCells > 0)
    economy.catchment = createCatchmentState(planetCatchmentGeometry(land, o.cityMapOf, o.rules), () =>
      catchmentSettingsOf(o.rules().worldSeed, o.rules().territory),
    );
  if (economy.catchment && o.catchmentSaved) restoreCatchment(economy.catchment, o.catchmentSaved, world);
  // NPC 휴먼 일꾼 임금·숙박비(질문 2236, npcWages.ts) — restPlans·runs는 아래에서 만든다(부를 때 읽는다)
  const wagesRef: { current?: ReturnType<typeof createNpcWages> } = {};
  const run = runEconomy(economy, world, loop, o.rules().npc, o.goodsHome, {
    rules: () =>
      wagesRef.current?.living.rules() ?? { wageMode: 0, wagePm: 0, baseDailyWage: 0n, foodEfficiency: [] },
    wageSource: (input) => wagesRef.current?.living.wageSource?.(input),
    lodgingDue: (cityId) => wagesRef.current?.living.lodgingDue?.(cityId),
  });
  // 처음 발행(E6): 찍는 나라마다 한 번
  for (const [currency, amount] of mintNationCurrencies({
    world,
    book,
    issuer,
    minted,
    perCapitaDaily: SERVER_ECONOMY_SETTINGS.perCapitaDaily,
    atMs: o.startMs,
  }))
    economy.today.issued.set(currency, (economy.today.issued.get(currency) ?? 0n) + amount);

  // 없는 도시(폐허 등)의 복원한 거래소는 걸린 주문을 돌려주고 닫는다
  // (지우면서 훑어도 된다: Map 반복은 지운 열쇠를 건너뛴다)
  for (const cityId of registry.markets.keys())
    if (!world.cities.has(cityId)) registry.dropCity(cityId, o.startMs);
  for (const cityId of world.cities.keys()) registry.ensureCity(cityId);
  const escrow = [...registry.check(), ...fx.check()];
  if (escrow.length > 0) o.log.warn({ problems: escrow }, "market escrow differs after restore");

  const presets = o.input.presets ?? [];
  /** 도시 주인의 나라 성격(없으면 undefined = 기본) */
  const personalityOfCity = (cityId: number): NationPersonality | undefined => {
    const owner = world.factions.get(world.cities.get(cityId)?.owner ?? -1);
    return owner ? personalityOfFaction(world, owner, presets) : undefined;
  };

  /** 도시마다 경비대 수(일꾼으로 세지 않는다 — 생필품은 다른 휴먼처럼 쓴다) */
  const cityGuards = new Map<number, number>();
  const recount = (): void => {
    economy.cityUnits.clear();
    cityGuards.clear();
    for (const unit of world.units.values()) {
      economy.cityUnits.set(unit.city, (economy.cityUnits.get(unit.city) ?? 0) + 1);
      if (unit.guard === true) cityGuards.set(unit.city, (cityGuards.get(unit.city) ?? 0) + 1);
    }
  };
  recount();

  /** 처음 창고(도시마다 한 번, 554 다): 생필품 = 휴먼 수 × 나라 성격 칸 시간(없으면 48시간), 특산 물건 = 성격 칸 고정 양(팩 수량 × 묶음 크기) */
  const endow = (cityId: number, atMs: number): void => {
    const key = `${ENDOW_KEY}${cityId}`;
    const city = world.cities.get(cityId);
    if (endowed.has(key) || !city) return;
    const personality = personalityOfCity(cityId);
    const stock = cityStartStock(
      catalog,
      economy.cityUnits.get(cityId) ?? 0,
      personality?.startNecessityHours,
      personality?.startStock,
    );
    const entries = [];
    for (const [asset, qty] of stock) {
      entries.push({ account: book.systemAccount(`source:${asset}`, asset), amount: -qty });
      entries.push({ account: book.ownerAccount(city.owner, asset, cityId), amount: qty });
    }
    endowed.add(key);
    if (entries.length > 0) book.post({ kind: "endow", atMs, key, entries });
  };

  /** 도시 → 마지막 쉼터·옮김 계획(질문 1047 다·1050 가) */
  const restPlans = new Map<number, CityRestPlan>();
  /** 시설 → 시작·끝 시각(화면용) */
  const runs = new Map<number, { startedAtMs: number; endsAtMs: number | null; buildingId: number | null }>();
  wagesRef.current = createNpcWages({
    book,
    world,
    economy,
    business: o.input.business,
    restPlans,
    currencyOf: (owner) => currencyOf.get(owner) ?? ASSET_CREDIT,
    buildingOf: (facilityId) => runs.get(facilityId)?.buildingId ?? null,
    rules: o.rules,
  });
  const noteRun = (facility: EcoFacility, nowMs: number, buildingId: number | null): void => {
    runs.set(facility.id, {
      startedAtMs: nowMs,
      endsAtMs: facility.pending ? nowMs + facility.pending.durationMs : null,
      buildingId,
    });
  };

  /** 그 도시의 생산 시설을 맞춘다(건물 + 도시 직무, 일꾼 = 휴먼을 돌려 나눔) */
  const syncCity = (cityId: number, nowMs: number): void => {
    const city = world.cities.get(cityId);
    const wanted = new Map<
      number,
      {
        recipe: string;
        facility: string;
        level: number;
        buildingId: number | null;
        slots: number;
        plots: number;
        tier: number | undefined;
      }
    >();
    if (city) {
      // 건물(건물 ID 차례)은 그 시설의 특산 레시피(553 나), 건물이 받지 못한 특산은 도시 직무(531 다·600 나) — 시뮬 planCityFacilities
      const buildings = o.input
        .facilitiesIn(cityId)
        .filter((entry) => entry.ownerId === city.owner && entry.level >= 1);
      const plotsOf = new Map(buildings.map((entry) => [entry.buildingId, entry.plots ?? 0]));
      for (const plan of planCityFacilities(
        buildings,
        personalityOfCity(cityId)?.cityJobs ?? CITY_JOBS,
        catalog,
      )) {
        const plots = plan.buildingId === null ? 0 : (plotsOf.get(plan.buildingId) ?? 0);
        const recipe = catalog.recipes.get(plan.recipe);
        // 건물 채집소의 기르는 티어 = 시세 × 주인 성향 가중 고르기(기획 D-569 1761·답 1862 — 시뮬과 같은 함수, 굴림은 시설 열쇠마다 고정)
        const key = plan.buildingId ?? CITY_JOB_BASE + cityId * 16 + (plan.jobIndex ?? 0);
        const tier =
          recipe && isSelectRecipe(recipe)
            ? npcSelectTier(economy, cityId, {
                recipe,
                level: plan.level,
                plots,
                temper: tierTemperOf(world, cityId, key, o.rules().npc),
              })
            : undefined;
        wanted.set(key, {
          recipe: plan.recipe,
          facility: plan.facility,
          level: plan.level,
          buildingId: plan.buildingId,
          slots: plan.slots,
          plots,
          tier,
        });
      }
    }
    // 일꾼: 굶음 먼저(생필품 사슬에 하루 몫만큼) → 남은 휴먼은 시설마다 한 명씩 돌려 자리 수까지(기획 답 532 나)
    const slots: CityWorkSlot[] = [];
    for (const [id, want] of wanted) {
      const recipe = catalog.recipes.get(want.recipe);
      const spec = catalog.facilities.get(want.facility);
      if (!recipe || !spec) continue;
      const effects = workerEffects(
        spec.gather,
        { level: want.level, plots: want.plots, tier: want.tier },
        economy.gather,
      );
      slots.push({
        id,
        recipe,
        slots: want.slots,
        progress: effects.progress,
        yieldPerLot: effects.yieldPerLot,
      });
    }
    const workers = assignCityWorkers(
      slots,
      Math.max(0, (economy.cityUnits.get(cityId) ?? 0) - (cityGuards.get(cityId) ?? 0)),
      catalog.necessities,
    );
    // 쉼터·옮김(질문 1047 다·1050 가): 일꾼이 쉬는 숙소·집과 채집소 → 창고 칸 → 생산 속도 배율·옮김 칸
    const rules = o.rules();
    const plan =
      city && o.input.cityRest
        ? o.input.cityRest(
            cityId,
            { ownerId: city.owner, housing: city.housing },
            [...wanted].map(([id, want]) => ({
              id,
              buildingId: want.buildingId,
              workers: workers.get(id) ?? 0,
              // 건물 시설은 모두 산출을 창고로 나르는 시간을 센다(기획 D-569 1784 "거래소 반입은 실제 운반만", D-564 1626 "보이지 않는 곳은
              // 시간 자동 계산" — 예전에는 채집소만, 가공 시설 산출은 도시 창고로 바로). 도시 직무(건물 없음)는 시청 칸에서 일해 거리가 없다
              hauls: want.buildingId !== null,
            })),
            rules,
          )
        : undefined;
    if (plan) restPlans.set(cityId, plan);
    else restPlans.delete(cityId);
    // 인구 상한 = 주거 + 씨앗 뒤 숙소 침대(질문 1089 나·1131 나, @terra/sim cityHousingCap): 구인 규칙식·붐빔·만족도 주거가 본다
    if (city) city.beds = plan?.capBeds ?? 0;
    const logisticsOf = (id: number): Pick<EcoFacility, "dutyPm" | "haul"> => {
      const rest = plan?.facilities.get(id);
      if (!rest) return {};
      return {
        ...(rest.dutyPm === 1000 ? {} : { dutyPm: rest.dutyPm }),
        ...(rest.haulCells > 0 && haulOn(rules)
          ? { haul: { cells: rest.haulCells, carryG: rules.gatherObjects.carryGrams } }
          : {}),
      };
    };
    // 지금 시설과 견준다: 없어진 것은 멈추고, 새것·바뀐 것은 새로 놓는다
    for (const [id, facility] of economy.facilities) {
      if (facility.city !== cityId) continue;
      const want = wanted.get(id);
      const logistics = logisticsOf(id);
      const same =
        want &&
        want.recipe === facility.recipe.id &&
        want.level === facility.level &&
        want.plots === (facility.plots ?? 0) &&
        (want.tier === undefined || want.tier === facility.selectTier) &&
        (workers.get(id) ?? 0) === facility.workers &&
        logistics.dutyPm === facility.dutyPm &&
        logistics.haul?.cells === facility.haul?.cells &&
        logistics.haul?.carryG === facility.haul?.carryG;
      if (same) continue;
      if (facility.eventId !== undefined) loop.cancel(facility.eventId);
      economy.facilities.delete(id);
      runs.delete(id);
    }
    for (const [id, want] of wanted) {
      if (economy.facilities.has(id)) continue;
      const recipe = catalog.recipes.get(want.recipe);
      const spec = catalog.facilities.get(want.facility);
      if (!recipe || !spec) continue;
      const facility: EcoFacility = {
        id,
        city: cityId,
        recipe,
        level: want.level,
        workers: workers.get(id) ?? 0,
        ...workerEffects(
          spec.gather,
          { level: want.level, plots: want.plots, tier: want.tier },
          economy.gather,
        ),
        ...logisticsOf(id),
        batches: 0,
        eventId: undefined,
      };
      economy.facilities.set(id, facility);
      scheduleProduce(economy, world, loop, facility, nowMs);
      noteRun(facility, nowMs, want.buildingId);
    }
  };

  /**
   * 시설 산출 운반(npcDelivery.ts — 기획 대조 2052·2053): 이번 산출을 가장 가까운 창고로 나르는 시간(시뮬과 같은 haulTimeMs — 일꾼이 나눠 나름)과 내려놓는 곳.
   * 한 사람이 한 번 오가는 시간 + 내려놓는 잠깐보다 짧지 않게 [임시]. 옮김 칸·창고가 없으면 바로(0)
   */
  const haulOf = (
    facility: EcoFacility,
    plan: CityRestPlan | undefined,
    outputs: readonly { readonly asset: string; readonly qty: bigint }[],
  ): { to?: { x: number; y: number }; ms: number } => {
    const to = plan?.facilities.get(facility.id)?.haulTo;
    const haul = facility.haul;
    if (!to || !haul || haul.cells <= 0) return { ms: 0 };
    let grams = 0n;
    for (const stack of outputs) grams += stack.qty * (economy.catalog.weightG.get(stack.asset) ?? 0n);
    const timed = haulTimeMs(grams, haul.cells, facility.workers, haul.carryG);
    if (timed <= 0) return { ms: 0 };
    return {
      to: { x: to.x, y: to.y },
      ms: Math.max(timed, 2 * haul.cells * walkMsPerCell() + HAUL_SHOWN_EXTRA_MS),
    };
  };
  const deliveries = o.input.business
    ? createNpcDeliveries({
        book,
        business: o.input.business,
        board: carry,
        priceOf: (cityId, asset) =>
          registry.existing(cityId, asset)?.market.lastPrice ?? catalog.startPrice.get(asset) ?? 0n,
        lotOf: (asset) => lotSizeOf(catalog, asset),
        schedule: (atMs, id) =>
          loop.schedule(Math.max(atMs, loop.nowMs), { kind: EVENT_NPC_DELIVER, subject: id }),
        // NPC 시설 판매가(2153, npcShopPrice.ts): 팩 기준 값 × 시세 움직임 ± 상업 성향·재고
        shopPriceOf: shopPriceSource({
          unitPriceOf: o.input.unitPriceOf,
          last: (cityId, asset) => registry.existing(cityId, asset)?.market.lastPrice,
          start: (asset) => catalog.startPrice.get(asset),
          traits: (owner) => world.factions.get(owner)?.traits,
          rules: o.rules,
        }),
      })
    : undefined;

  const syncAll = (nowMs: number): void => {
    recount();
    for (const cityId of [...world.cities.keys()].toSorted((a, b) => a - b)) {
      registry.ensureCity(cityId);
      endow(cityId, nowMs);
      syncCity(cityId, nowMs);
    }
    for (const cityId of restPlans.keys()) if (!world.cities.has(cityId)) restPlans.delete(cityId);
    // 사라진 도시의 시설
    for (const [id, facility] of economy.facilities) {
      if (world.cities.has(facility.city)) continue;
      if (facility.eventId !== undefined) loop.cancel(facility.eventId);
      economy.facilities.delete(id);
      runs.delete(id);
    }
  };

  // 처음 예약: 유지비·거래 판단·환전 회차(시뮬과 같은 함수) 다음에 시설을 놓는다(시설 예약은 syncAll이 한다)
  scheduleEconomy(economy, world, loop, o.startMs);
  syncAll(o.startMs);
  // 켤 때 한 번: NPC 시설 창고에 남은 물건(끈 동안 잊은 운반)을 그 도시 창고로(npcDelivery.ts sweep)
  if (deliveries && o.rules().business.npcBooks === 1) {
    const shops = new Map<number, { cityId: number; owner: number; currency: string }>();
    for (const [id, note] of runs) {
      const facility = economy.facilities.get(id);
      const city = facility ? world.cities.get(facility.city) : undefined;
      if (note.buildingId !== null && city)
        shops.set(note.buildingId, {
          cityId: city.id,
          owner: city.owner,
          currency: currencyOf.get(city.owner) ?? ASSET_CREDIT,
        });
    }
    const swept = deliveries.sweep(shops, o.startMs);
    if (swept > 0) o.log.info({ npcShopSweep: swept }, "npc facility storage swept to city stores");
  }

  const metrics = { produced: 0, trades: 0, expired: 0, npcSales: 0 };
  let bidsSeen = 0;
  let lastFxAt: number | undefined;
  registry.onFill(() => {
    metrics.trades += 1;
  });

  const hooks: SimHooks = {
    ...run.hooks,
    factionBorn: (child, parent) => {
      run.hooks.factionBorn(child, parent);
      currencyOf.set(child.id, currencyOf.get(parent.id) ?? ASSET_CREDIT);
    },
    cityFounded: (cityId, units, nowMs) => {
      run.hooks.cityFounded?.(cityId, units, nowMs);
      registry.ensureCity(cityId);
      syncCity(cityId, nowMs);
    },
    // 독재 가문 나라의 남은 이익 국고 몫 → 지배 가문 금고(D-338, 국고와 따로 — factionIdentity/houseVault.ts)
    rulingVaultOf: (faction, asset) => rulingVaultOf(book, o.owners, faction, asset),
  };

  return {
    economy,
    registry,
    lockers,
    fx,
    carry,
    run,
    hooks,
    handle(event, nowMs) {
      const { kind, subject } = event.payload;
      const c = o.rules();
      if (kind === EVENT_PRODUCE) {
        const facility = economy.facilities.get(subject);
        // 적자로 멈춘 NPC 시설(2152 — D-570 1789): 국고에서 갚아 보고, 아직 멈췄으면 이번 차례를 건너뛴다
        const shopId = runs.get(subject)?.buildingId ?? null;
        const shopCity = facility ? world.cities.get(facility.city) : undefined;
        const paused =
          shopId !== null &&
          shopCity !== undefined &&
          c.business.npcBooks === 1 &&
          facility !== undefined &&
          deliveries?.resume({
            buildingId: shopId,
            owner: shopCity.owner,
            currency: currencyOf.get(shopCity.owner) ?? ASSET_CREDIT,
            cityId: shopCity.id,
            inputs: facility.recipe.inputs,
            atMs: nowMs,
          }) === true;
        if ((c.switches.productionEnabled === 0 || paused) && facility) {
          // 생산 끔(49 N53)·적자 멈춤: 이번 차례를 건너뛰고 다음 차례만 잡는다
          scheduleProduce(economy, world, loop, facility, nowMs);
          noteRun(facility, nowMs, runs.get(subject)?.buildingId ?? null);
          return true;
        }
        const batch = facility?.pending;
        const shortBefore = economy.today.inputShort;
        run.handle(event, nowMs);
        // NPC 사업장(기획 대조 2053·2054, npcDelivery.ts): 산출은 시설 창고로, 재료비, 일꾼이 도시 창고로 실제로 나른다(닿으면 나라가 산 매출), 하루 끝 정산
        const buildingId = runs.get(subject)?.buildingId ?? null;
        const city = facility ? world.cities.get(facility.city) : undefined;
        if (
          facility &&
          city &&
          buildingId !== null &&
          deliveries &&
          c.business.npcBooks === 1 &&
          economy.today.inputShort === shortBefore
        ) {
          const outputs = batch?.outputs ?? facility.recipe.outputs;
          const haul = haulOf(facility, restPlans.get(city.id), outputs);
          deliveries.produced({
            facilityId: facility.id,
            buildingId,
            cityId: city.id,
            owner: city.owner,
            currency: currencyOf.get(city.owner) ?? ASSET_CREDIT,
            outputs,
            inputs: facility.recipe.inputs,
            to: haul.to,
            haulMs: haul.ms,
            atMs: nowMs,
          });
          metrics.npcSales += 1;
        }
        const after = economy.facilities.get(subject);
        if (after) noteRun(after, nowMs, runs.get(subject)?.buildingId ?? null);
        metrics.produced += 1;
        return true;
      }
      if (kind === EVENT_NPC_DELIVER) {
        deliveries?.arrive(subject, nowMs);
        return true;
      }
      if (kind === EVENT_UPKEEP) recount();
      if (kind === EVENT_TRADE && c.switches.marketEnabled === 0) {
        // 거래소 끔(49 N53): 판단을 건너뛰고 다음 판단만 잡는다
        loop.schedule(nowMs + economy.settings.tradeEveryMs, { kind: EVENT_TRADE, subject });
        return true;
      }
      if (kind === EVENT_FX) lastFxAt = nowMs;
      if (kind === EVENT_FX && c.switches.marketEnabled === 0) {
        // 거래소 끔: 환전 회차도 건너뛴다(걸린 주문은 다음 회차까지 그대로, 거두기는 된다)
        loop.schedule(nextFxRoundAt(nowMs, economy.settings.fxEveryMs), { kind: EVENT_FX, subject });
        return true;
      }
      return run.handle(event, nowMs);
    },
    beforeDay(nowMs) {
      run.endOfDay(nowMs);
    },
    afterDay(nowMs, day) {
      o.log.info({ npcEcon: { day, ...run.dayLine() } }, "npc economy day");
      // 숙박비(npcWages.ts): 휴먼 지갑에서(옛 판은 국고에서)
      const fees = wagesRef.current?.chargeLodgingFees(nowMs);
      if (fees && (fees.paid > 0n || fees.short > 0))
        o.log.info({ npcLodgingFees: { day, ...fees, paid: String(fees.paid) } }, "npc lodging fees");
      syncAll(nowMs);
    },
    restPlan: (cityId) => restPlans.get(cityId),
    workFacilities(cityId) {
      const out: WorkFacility[] = [];
      for (const facility of economy.facilities.values()) {
        if (facility.city !== cityId) continue;
        const note = runs.get(facility.id);
        const buildingId = note?.buildingId ?? null;
        // 보이는 운반(기획 대조 2052): 지금 이 시설 일꾼이 나르는 일(npcCarry.ts) — 보는 2차맵이면 humanPlaces가 첫 일꾼에게 화물을 싣는다
        const job = carry.ofWorker(facility.id, o.now());
        out.push({
          id: facility.id,
          buildingId,
          workers: facility.workers,
          ...(job
            ? { haul: { x: job.x, y: job.y, fromMs: job.fromMs, untilMs: job.untilMs, key: job.key } }
            : {}),
        });
      }
      return out.toSorted((a, b) => a.id - b.id);
    },
    cityJobsOf: (cityId) => personalityOfCity(cityId)?.cityJobs ?? CITY_JOBS,
    refreshCity(cityId, nowMs) {
      recount();
      syncCity(cityId, nowMs);
    },
    production(cityId) {
      const out: FacilityRun[] = [];
      for (const facility of economy.facilities.values()) {
        if (facility.city !== cityId) continue;
        const note = runs.get(facility.id);
        out.push({
          facility,
          buildingId: note?.buildingId ?? null,
          startedAtMs: note?.startedAtMs ?? o.startMs,
          endsAtMs: note?.endsAtMs ?? null,
        });
      }
      return out.toSorted((a, b) => a.facility.id - b.facility.id);
    },
    nextFxAt: () => nextFxRoundAt(lastFxAt ?? o.startMs, economy.settings.fxEveryMs),
    expire(nowMs) {
      const count = registry.expire(nowMs);
      metrics.expired += count;
      return count;
    },
    takeMetrics() {
      const bids = run.bidsPlaced();
      const out = {
        econProduced: metrics.produced,
        econTrades: metrics.trades,
        econBids: bids - bidsSeen,
        econExpired: metrics.expired,
        econFacilities: economy.facilities.size,
        econNpcSales: metrics.npcSales,
      };
      metrics.npcSales = 0;
      metrics.produced = 0;
      metrics.trades = 0;
      bidsSeen = bids;
      metrics.expired = 0;
      return out;
    },
    check: () => [...run.check(), ...registry.check()],
  };
}
