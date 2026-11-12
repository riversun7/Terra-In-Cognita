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
  restsPerDay,
} from "@terra/sim";
import type { CatchmentLand } from "@terra/shared/catchment";
import { planetCatchmentGeometry } from "./catchmentGeometry.ts";
import { type CatchmentSaved, restoreCatchment } from "./catchmentStore.ts";
import type { CityRestPlan, RestFacility } from "./cityRest.ts";
import type { ServerEconomyCatalog } from "../market/catalog.ts";
import { type MarketRegistry, createMarketRegistry } from "../market/books.ts";
import { type FxRegistry, createFxRegistry } from "../market/fx.ts";
import { loadFx, loadMarkets } from "../market/load.ts";
import type { OwnerRow, QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import { ASSET_CREDIT } from "../world/settlement.ts";
import { DEFAULT_TAX_BP, MINT_KEY, mintNationCurrencies, nationCurrencies } from "./currency.ts";
import { type NationPersonality, type NationPreset, nationPresetOf } from "./nations.ts";

export { DEFAULT_TAX_BP } from "./currency.ts";
/** 처음 창고 중복 방지 키 앞머리 */
const ENDOW_KEY = "npc_endow:";
/** 도시 직무 시설 ID(건물 ID와 겹치지 않게 큰 수부터, 도시마다 16칸 — 팩 성격 칸 cityJobs는 8개까지) */
const CITY_JOB_BASE = 1_000_000_000_000;
/**
 * [임시] 기본 도시 직무(국가 프리셋에 성격 칸 cityJobs가 없을 때, 기획 답 531 다의 "칸이 없으면"): 그 도시에 이 시설 건물이 없으면 휴먼이
 * 이 레시피를 Lv1로 돌린다(시뮬 econ16 농업 나라 계획과 같은 세 가지 — 생필품 식량 사슬과 목재). 건물이 있으면 건물이 대신한다
 */
export const CITY_JOBS: readonly { readonly facility: string; readonly recipe: string }[] = [
  { facility: "farm", recipe: "farm_grain" },
  { facility: "kitchen", recipe: "cook_ration" },
  { facility: "lumber_camp", recipe: "cut_timber" },
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
}

/** 월드가 넘기는 경제 입력(world.ts → runtime.ts) */
export interface NpcEconomyInput {
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
  /** 환전 시장 모음(나라 화폐 ↔ 기준 통화) */
  readonly fx: FxRegistry;
  readonly run: EconomyRun;
  /** 세력·사회·NPC 판단에 넘기는 고리(시뮬 고리 + 서버 몫) */
  readonly hooks: SimHooks;
  /** 경제 사건이면 처리하고 true */
  handle(event: ScheduledEvent<SimEvent>, nowMs: number): boolean;
  /** 하루 끝(세력·사회 하루 끝 전): 중앙은행(시뮬 bankDay) */
  beforeDay(nowMs: number): void;
  /** 하루 끝(세력·사회 하루 끝 뒤): 하루 줄 기록·시설 다시 맞추기 */
  afterDay(nowMs: number, day: number): void;
  /** 그 도시의 생산 시설(화면용, 시설 ID 차례) */
  production(cityId: number): FacilityRun[];
  /** 그 도시 일꾼 쉼터·옮김 계획(마지막 맞추기, 없으면 undefined — 휴먼 집·일터와 화면이 본다) */
  restPlan(cityId: number): CityRestPlan | undefined;
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
    now: o.now,
  });
  // 환전 시장(찍는 나라가 있는 화폐마다, 걸린 주문이 남은 짝은 fx.ts가 부팅 때 되살린다)
  const fx = createFxRegistry({
    ledger: book,
    writer,
    loaded: loadedFx,
    base: ASSET_CREDIT,
    lotSize: SERVER_ECONOMY_SETTINGS.fxLot,
    isUser,
    now: o.now,
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
  const run = runEconomy(economy, world, loop, o.rules().npc, o.goodsHome);
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
      { recipe: string; facility: string; level: number; buildingId: number | null; slots: number }
    >();
    if (city) {
      // 건물(건물 ID 차례)은 그 시설의 특산 레시피(553 나), 건물이 받지 못한 특산은 도시 직무(531 다·600 나) — 시뮬 planCityFacilities
      const buildings = o.input
        .facilitiesIn(cityId)
        .filter((entry) => entry.ownerId === city.owner && entry.level >= 1);
      for (const plan of planCityFacilities(
        buildings,
        personalityOfCity(cityId)?.cityJobs ?? CITY_JOBS,
        catalog,
      ))
        wanted.set(plan.buildingId ?? CITY_JOB_BASE + cityId * 16 + (plan.jobIndex ?? 0), {
          recipe: plan.recipe,
          facility: plan.facility,
          level: plan.level,
          buildingId: plan.buildingId,
          slots: plan.slots,
        });
    }
    // 일꾼: 굶음 먼저(생필품 사슬에 하루 몫만큼) → 남은 휴먼은 시설마다 한 명씩 돌려 자리 수까지(기획 답 532 나)
    const slots: CityWorkSlot[] = [];
    for (const [id, want] of wanted) {
      const recipe = catalog.recipes.get(want.recipe);
      const spec = catalog.facilities.get(want.facility);
      if (!recipe || !spec) continue;
      const effects = workerEffects(spec.gather, { level: want.level }, economy.gather);
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
              station:
                want.buildingId !== null && catalog.facilities.get(want.facility)?.gather !== undefined,
            })),
            rules,
          )
        : undefined;
    if (plan) restPlans.set(cityId, plan);
    else restPlans.delete(cityId);
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
        ...workerEffects(spec.gather, { level: want.level }, economy.gather),
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
   * 숙소 요금(D-245 "요금은 시설 주인이", 설정 칸 lodging_fee_per_night [임시]): 하루 끝에 그 도시 일꾼이 쓴 남의 숙소(도시 주인 세력이 아닌
   * 주인 — 플레이어가 NPC 도시에 지은 숙소 등)마다 일꾼 × 하루 쉬는 번 수 × 요금을 도시 주인 국고(나라 화폐)에서 숙소 주인에게 낸다.
   * 국고가 모자라면 남은 만큼만. 도시 주인 세력의 숙소는 같은 주머니라 오가지 않는다
   */
  const chargeLodgingFees = (nowMs: number): { paid: bigint; lodgings: number } => {
    const c = o.rules();
    const fee = BigInt(Math.max(0, Math.trunc(c.logistics.lodgingFeePerNight)));
    let paid = 0n;
    let lodgings = 0;
    if (fee <= 0n) return { paid, lodgings };
    for (const [cityId, plan] of [...restPlans].toSorted((a, b) => a[0] - b[0])) {
      const city = world.cities.get(cityId);
      if (!city) continue;
      const currency = currencyOf.get(city.owner) ?? ASSET_CREDIT;
      const due = new Map<number, bigint>();
      for (const worker of plan.workers) {
        if (worker.lodgingId === null) continue;
        const owner = plan.owners.get(worker.lodgingId) ?? null;
        if (owner === null || owner === city.owner) continue;
        const nights = BigInt(restsPerDay(worker.place, worker.commuteCells, c));
        due.set(worker.lodgingId, (due.get(worker.lodgingId) ?? 0n) + nights * fee);
      }
      for (const [lodgingId, amount] of due) {
        const owner = plan.owners.get(lodgingId);
        if (owner === null || owner === undefined) continue;
        const from = book.ownerAccount(city.owner, currency);
        const pay = book.balance(from) < amount ? book.balance(from) : amount;
        if (pay <= 0n) continue;
        book.post({
          kind: "lodging_fee",
          atMs: nowMs,
          key: `lodging_fee:${cityId}:${lodgingId}:${nowMs}`,
          entries: [
            { account: from, amount: -pay },
            { account: book.ownerAccount(owner, currency), amount: pay },
          ],
        });
        paid += pay;
        lodgings += 1;
      }
    }
    return { paid, lodgings };
  };

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

  const metrics = { produced: 0, trades: 0, expired: 0 };
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
  };

  return {
    economy,
    registry,
    fx,
    run,
    hooks,
    handle(event, nowMs) {
      const { kind, subject } = event.payload;
      const c = o.rules();
      if (kind === EVENT_PRODUCE) {
        const facility = economy.facilities.get(subject);
        if (c.switches.productionEnabled === 0 && facility) {
          // 생산 끔(49 N53): 이번 차례를 건너뛰고 다음 차례만 잡는다
          scheduleProduce(economy, world, loop, facility, nowMs);
          noteRun(facility, nowMs, runs.get(subject)?.buildingId ?? null);
          return true;
        }
        run.handle(event, nowMs);
        const after = economy.facilities.get(subject);
        if (after) noteRun(after, nowMs, runs.get(subject)?.buildingId ?? null);
        metrics.produced += 1;
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
      const fees = chargeLodgingFees(nowMs);
      if (fees.paid > 0n)
        o.log.info({ npcLodgingFees: { day, ...fees, paid: String(fees.paid) } }, "npc lodging fees");
      syncAll(nowMs);
    },
    restPlan: (cityId) => restPlans.get(cityId),
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
      };
      metrics.produced = 0;
      metrics.trades = 0;
      bidsSeen = bids;
      metrics.expired = 0;
      return out;
    },
    check: () => [...run.check(), ...registry.check()],
  };
}
