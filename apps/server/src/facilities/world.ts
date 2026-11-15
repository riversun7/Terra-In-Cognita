// 건물 서비스를 월드에 잇는다 — docs/adr/2026-11-07-buildings-runtime.md. world.ts가 부팅 복구 때 한 번 부른다.
// - 노동 계약: 계약 정산이 건물이 일하는지 묻고(30% 미만·짓는 중이면 산출 없음), 건물 서비스는 계약 중인 유닛·건물 사용을 묻는다(서로 고리라
//   늦게 잇는다). 보유 물건: 공방에서 고치는 중인 물건은 입기·벗기를 막는다. 영토: 비콘 짓기 재료를 같은 원장 빼기로 한다.
// - 건물 공격(질문 381, attack.ts): 세계 전투를 여는 길(몸·생명 수치·물약·탄 → 전투 서비스)을 받아 공성 전투를 열고, 결과의 건물 피해는
//   damage(건물 서비스·영토 서비스)가 받는다.
// - 플레이어 생산(docs/adr/2026-11-07-play-flow.md "WP3 플레이어 생산"): 계약 서비스를 이을 때 채집 산출 자료(채집 시설의 정의·레벨·도시·
//   자리 수, 유닛 1차 스탯)를 함께 넘긴다(gatherSiteOf). 임대형 임차인 몫의 건물 창고 남은 자리(storage.ts roomGrams, WP8 523 ②)도 함께.
// - 컨디션(D-534·D-535, labor/condition.ts): 채집 정산과 유닛 화면에 그 유닛의 관리 보너스를 넘긴다(주거 = 쉼터 배정 — 채집 세계가 attachRest로
//   늦게 잇는다, 음식 = 도시 생필품 충족, 선호 = 세계 시드·유닛 ID, 좋아하는 음식 = 그 도시 창고에 그 중분류가 있나).
// - 높은 티어 광석(기획 D-535 질문 1121, docs/adr/2026-11-11-city-catchment.md "바뀜 (2026-11-12): 높은 티어 광석"): 플레이어 광산도 NPC 광산과
//   같은 티어 막기(@terra/shared/catchment oreTierCapOf)를 받는다 — 높은 티어 몫 = 건물이 선 2차맵 칸의 highOrePm(산지 1000, 산지 밖
//   ore_flat_high_pm). 행성 값이 없는 2차맵(임시 지형)은 막지 않는다.
// - 낚시터 물 종류(기획 D-542 질문 1365 나): 플레이어 낚시터도 NPC 낚시터처럼 그 자리 물 종류(fishWater.ts spotWaterOfMap)의 티어 범위(설정 칸
//   fish_tier_*)로 뽑은 티어를 접는다(@terra/sim rollGatherOutputs tierRange). 행성 값이 없는 2차맵은 접지 않는다.
import { type LandCheck, createLandCheck } from "./landRule.ts";
import { type CatchmentLand, highOrePm, materialOfFacility, oreTierCapOf } from "@terra/shared/catchment";
import { type FishTierRanges, type FishWater, fishTierRangeOf } from "@terra/shared/fishWater";
import {
  HOME_HOUSING,
  type RestPlace,
  type SocietyCoefficients,
  fishTierRangesOf,
  gatherLadderBands,
  unitPreferences,
} from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import type { WorldHoldings } from "../holdings/world.ts";
import type { GatherKind } from "../gather/kinds.ts";
import { type ConditionSource, type WorkerConditionView, workerCondition } from "../labor/condition.ts";
import type { GatherSite } from "../labor/gatherWork.ts";
import type { LaborService } from "../labor/service.ts";
import { type CityCell, cityLocation, placeOfLocation } from "@terra/shared/goodsPlaces";
import type { BeaconConstruction, TerritoryService } from "../territory/service.ts";
import type { BuildingDamageSink } from "../world/battleTargets.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap } from "../world/secondMap.ts";
import type { Settlement } from "../world/settlement.ts";
import {
  type BuildingAttack,
  type BuildingAttackOptions,
  buildingDamageSinkOf,
  createBuildingAttack,
} from "./attack.ts";
import { type CatalogSource, type FacilityCatalog, facilityCatalogOf } from "./catalog.ts";
import { spotWaterOfMap } from "./fishWater.ts";
import { spendGoods } from "./materials.ts";
import { type PlaceWorld, assetWeightG, beaconMaterialScope, buildingPlace, isStorage } from "./places.ts";
import { type FacilityService, createFacilityService } from "./service.ts";
import { roomGrams } from "./storage.ts";
import { type BusinessCore, EMPTY_BUSINESS, createBusinessCore } from "../business/core.ts";
import { type BusinessCommands, createBusinessCommands } from "../business/commands.ts";
import { ASSET_CREDIT } from "../world/settlement.ts";
import { DEFAULT_TAX_BP } from "../npc/currency.ts";
import { TEST_PLANET_ID } from "../world/testMaps.ts";
import type { LoadedFacilities } from "./state.ts";

/** 월드 설정의 건물 칸(app.ts가 실효 콘텐츠 접근자를 넘긴다) */
export interface FacilitiesConfig {
  readonly content: () => CatalogSource;
  /** 원자재 오브젝트 종류(팩 gather_objects) — NPC 도시 전략 배치의 채집소 자리(docs/adr/2026-11-11-city-building-layout.md). 없으면 빈 목록 */
  readonly gatherKinds?: (() => readonly GatherKind[]) | undefined;
}

const EMPTY_SOURCE: CatalogSource = { facilities: [], items: [] };

export interface WorldFacilities {
  readonly service: FacilityService;
  /** 건물·영토 비콘 공격(질문 381, attack.ts) */
  readonly attack: BuildingAttack;
  /** 2차맵 건설 땅 규칙(landRule.ts — 짓기 명령·화면 미리 묻기) */
  readonly land: LandCheck;
  /** 전투 결과의 건물 피해를 받는 곳(전투 결과 적용이 같은 동기 처리로 부른다) */
  readonly damage: BuildingDamageSink;
  readonly catalog: () => FacilityCatalog;
  /** 원자재 오브젝트 종류(설정에 없으면 빈 목록) */
  readonly gatherKinds: () => readonly GatherKind[];
  /** 세력·사회 계수표(설정 칸 실효 값) */
  readonly rules: () => SocietyCoefficients;
  /** 노동 계약을 잇는다(계약 서비스가 건물 서비스보다 늦게 만들어진다) */
  attachLabor(labor: LaborService): void;
  /**
   * 유닛 컨디션(D-534·D-535): 일하는 채집 시설의 도시(없으면 지금 2차맵에서 ID가 가장 작은 도시)의 주거·음식·선호로 센다. 유닛이 띄운 2차맵에
   * 없으면 undefined
   */
  condition(unitId: number): WorkerConditionView | undefined;
  /** 플레이어 일꾼 쉼터를 잇는다(채집 세계가 세계 준비 뒤 labor/workerRest.ts로 만든다 — D-535 1152 나) */
  attachRest(read: RestReader): void;
  /** 사업장 장부(금고·소득세·적자·정산 — docs/adr/2026-11-15-business-ledger.md, D-548·D-555) */
  readonly business: BusinessCore;
  /** 사업장 장부 명령(값·묶음 조회 포함) */
  readonly businessCommands: BusinessCommands;
  /** 그 도시 행정 레벨(모르면 undefined — 소매 도시 판단) */
  cityAdminLevel(cityId: number): number | undefined;
}

/** 유닛의 지금 쉼터(labor/workerRest.ts restOf의 모양). 일꾼이 아니면 undefined */
export type RestReader = (
  unitId: number,
) => { readonly cityId: number; readonly place: RestPlace; readonly lodgingId: number | null } | undefined;

/** 도시 창고 식품 중분류 표를 다시 셈하기까지(ms) */
const CITY_FOOD_TTL_MS = 30_000;

/** 도시마다 창고(모든 주인)에 잔고가 있는 아이템의 중분류(원장을 한 번 훑는다) */
export function cityFoodSubcategories(
  ledger: Pick<Ledger, "accounts">,
  subcategoryOf: (item: string) => string | undefined,
): Map<number, Set<string>> {
  const out = new Map<number, Set<string>>();
  for (const account of ledger.accounts()) {
    if (account.ownerId === null || account.balance <= 0n || !account.asset.startsWith("item:")) continue;
    const place = placeOfLocation(account.location);
    if (place.kind !== "city" || place.id === null) continue;
    const sub = subcategoryOf(account.asset.slice(5));
    if (sub === undefined) continue;
    let set = out.get(place.id);
    if (!set) {
      set = new Set();
      out.set(place.id, set);
    }
    set.add(sub);
  }
  return out;
}

/**
 * 비콘 짓기(영토 서비스 construction 칸): 놓는 사용자의 주인 원장에서 레벨 1 재료를 뺀다. 그 세력에서 비콘 칸과 가장 가까운 도시의 내 도시
 * 창고 + 그 도시의 내 창고 시설에서만 꺼낸다(질문 410 ①, 화물 없음). 세력 도시가 없으면 꺼낼 곳이 없다(모자람)
 */
export function beaconConstructionOf(options: {
  readonly ledger: Ledger;
  readonly settlement: Settlement;
  readonly rules: () => SocietyCoefficients;
  /** 물자 자리 세계(건물 서비스가 만들어진 뒤 생긴다 — 창고 시설을 찾는다) */
  readonly places: () => PlaceWorld | undefined;
}): BeaconConstruction {
  return {
    rules: () => options.rules().facilityRuntime,
    spend: (userId, materials, atMs, supply) => {
      const ownerId = options.settlement.ownerOfUser(userId, atMs).id;
      const places = options.places();
      // 물자 자리 세계가 아직 없으면(건물 서비스 전) 그 도시 창고만
      const scope = !supply
        ? []
        : places
          ? beaconMaterialScope(places, ownerId, supply)
          : [cityLocation(supply.cityId)];
      return spendGoods(options.ledger, ownerId, materials, atMs, "beacon_build", scope);
    },
  };
}

/** 광산 티어 막기 자료: 2차맵 → 그 칸 높은 티어 몫(‰, 행성 값이 없으면 undefined)·산지 밖 가장 높은 티어(설정 칸 ore_low_tier_max) */
export interface OreCapSource {
  highOrePm(mapKey: number): number | undefined;
  lowTierMax(): number;
}

/** 낚시터 티어 범위 자료: 2차맵 → 물 종류(행성 값이 없으면 undefined)·물 종류마다 범위(설정 칸 fish_tier_*) */
export interface FishWaterSource {
  waterOf(mapKey: number): FishWater | undefined;
  ranges(): FishTierRanges;
}

/**
 * 그 건물이 채집 시설(팩 gather가 있는 시설)이면 채집 산출 자료: 정의·다 지은 레벨·사다리·확률표·묶음 크기·건물이 선 도시·자리 수(레벨 ×
 * 레벨당 자리, 레벨 0이면 0)·광석 시설이면 티어 막기(oreCap이 있을 때, 머리 주석). 시설 줄이 없거나 채집 시설이 아니면 undefined
 */
export function gatherSiteOf(
  service: Pick<FacilityService, "facilities" | "places">,
  catalog: FacilityCatalog,
  buildingId: number,
  oreCap?: OreCapSource,
  fishWater?: FishWaterSource,
): (GatherSite & { readonly slots: number }) | undefined {
  const record = service.facilities.get(buildingId);
  const def = record ? catalog.facility(record.facilityId) : undefined;
  if (!record || !def?.gather) return undefined;
  const material = materialOfFacility(def.id);
  const place =
    (oreCap && material === "ore") || (fishWater && material === "fish")
      ? buildingPlace(service.places, buildingId)
      : undefined;
  const highPm = place && oreCap && material === "ore" ? oreCap.highOrePm(place.mapKey) : undefined;
  const tierCap = highPm === undefined || !oreCap ? undefined : oreTierCapOf(highPm, oreCap.lowTierMax());
  const tierRange =
    place && fishWater && material === "fish"
      ? fishTierRangeOf(fishWater.ranges(), fishWater.waterOf(place.mapKey))
      : undefined;
  return {
    ...(tierCap ? { tierCap } : {}),
    ...(tierRange ? { tierRange } : {}),
    buildingId,
    facilityId: def.id,
    level: record.level,
    rule: def.gather,
    ladder: catalog.gatherLadder(def.gather),
    // 사다리 띠 표(기획 D-540 1217 나): 이 시설 주 중분류의 전용 표, 없으면 기본 표
    bands: gatherLadderBands(catalog.gatherBands, def.gather.subcategory),
    lotSize: catalog.lotSize,
    cityId: record.cityId ?? buildingPlace(service.places, buildingId)?.cityId ?? null,
    slots: Math.max(0, record.level) * Math.max(0, def.slotsPerLevel),
  };
}

/** 병원(의료 단계 시설, D-521)이면 다 지은 레벨·의사 자리 수(레벨 × 레벨당 자리). 아니면 undefined */
export function medicalSiteOf(
  service: Pick<FacilityService, "facilities">,
  catalog: FacilityCatalog,
  buildingId: number,
): { readonly level: number; readonly slots: number } | undefined {
  const record = service.facilities.get(buildingId);
  const def = record ? catalog.facility(record.facilityId) : undefined;
  if (!record || def?.stage !== "medical") return undefined;
  return { level: record.level, slots: Math.max(0, record.level) * Math.max(0, def.slotsPerLevel) };
}

export function createWorldFacilities(input: {
  readonly loaded: LoadedFacilities;
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly settlement: Settlement;
  readonly ledger: Ledger;
  readonly writer: WorldWriter;
  readonly rules: () => SocietyCoefficients;
  readonly config: FacilitiesConfig | undefined;
  readonly holdings: WorldHoldings;
  readonly territory: () => TerritoryService | undefined;
  /** 띄운 2차맵의 도시 자리(건물이 선 도시) */
  readonly cities: () => readonly CityCell[];
  /** 건물 공격(질문 381): 세계 전투를 여는 길·세력 판정 자료 */
  readonly battles: Pick<
    BuildingAttackOptions,
    "owners" | "pool" | "combatRules" | "bodies" | "startBattle" | "endsAt" | "seed"
  >;
  readonly now: () => number;
  readonly ready: () => boolean;
  /**
   * NPC 런타임(없으면 undefined): 도시의 지난 하루 끝 생필품 충족 ‰(cityDayStore, 컨디션 음식 몫)과 세계 시드(컨디션 선호, D-535 1151 나 —
   * 구인 카드와 같은 시드). 런타임이 없으면 음식은 모름, 시드는 0
   */
  readonly npc?:
    | (() =>
        | {
            necessitiesOf(cityId: number): number | undefined;
            readonly world: {
              readonly seed: number;
              /** 도시 주인 세력·행정 레벨(사업장 소득세의 국고·소매 도시 — docs/adr/2026-11-15-business-ledger.md) */
              readonly cities?: ReadonlyMap<number, { readonly owner: number; readonly adminLevel: number }>;
            };
            /** 도시 경제(세력마다 거래세 — 사업장 소득세율로 쓴다 [임시]) */
            readonly economy?:
              | { readonly economy: { readonly taxOf: ReadonlyMap<number, number> } }
              | undefined;
          }
        | undefined)
    | undefined;
  /** 2차맵 칸 행성 값(플레이어 광산 티어 막기의 높은 티어 몫 — 머리 주석). 없거나 undefined면 광산 티어를 막지 않는다 */
  readonly cellValues?: ((mapKey: number) => CatchmentLand | undefined) | undefined;
}): WorldFacilities {
  const catalog = facilityCatalogOf(input.config?.content ?? (() => EMPTY_SOURCE));
  const cellValues = input.cellValues;
  const oreCap: OreCapSource | undefined = cellValues
    ? {
        highOrePm: (mapKey) => {
          const land = cellValues(mapKey);
          return land ? highOrePm(land, input.rules().worldSeed) : undefined;
        },
        lowTierMax: () => input.rules().worldSeed.oreLowTierMax,
      }
    : undefined;
  const fishWater: FishWaterSource | undefined = cellValues
    ? {
        waterOf: (mapKey) => spotWaterOfMap(mapKey, cellValues),
        ranges: () => fishTierRangesOf(input.rules().worldSeed),
      }
    : undefined;
  let labor: LaborService | undefined;
  let business: BusinessCore | undefined;
  // 2차맵 건설 땅 규칙(landRule.ts): 짓기 명령과 화면 미리 묻기가 같은 판정
  const land = createLandCheck({
    pool: input.battles.pool,
    owners: input.battles.owners,
    writer: input.writer,
  });
  const service = createFacilityService({
    loaded: input.loaded,
    maps: input.maps,
    settlement: input.settlement,
    ledger: input.ledger,
    writer: input.writer,
    rules: input.rules,
    catalog,
    holdings: input.holdings,
    territory: input.territory,
    cities: input.cities,
    land,
    labor: {
      unitBusy: (unitId) => labor?.unitBusy(unitId) ?? false,
      buildingInUse: (buildingId) => labor?.buildingInUse(buildingId) ?? false,
    },
    now: input.now,
    ready: input.ready,
    // 적자를 한 주기 넘게 못 갚은 사업장은 멈춘다(D-555 1504), 주기 끝 처리는 노화 정시에 함께
    suspended: (buildingId) => business?.suspended(buildingId) ?? false,
    onAge: (nowMs) => business?.tick(nowMs),
    onGone: (buildingId) => business?.forget(buildingId),
  });
  input.holdings.setLocked((holdingId) => service.holdingLocked(holdingId));
  const npcCity = (cityId: number) => input.npc?.()?.world.cities?.get(cityId);
  const core = createBusinessCore({
    ledger: input.ledger,
    writer: input.writer,
    planetId: TEST_PLANET_ID,
    loaded: input.loaded.business ?? EMPTY_BUSINESS,
    place: (buildingId) => buildingPlace(service.places, buildingId),
    businesses: () => service.facilities.keys(),
    tax: (cityId) => {
      const city = npcCity(cityId);
      if (!city) return undefined;
      // 그 나라 거래세(만분율 [임시]). 도시 경제가 없으면(시험) 기본 거래세
      const bp = input.npc?.()?.economy?.economy.taxOf.get(city.owner) ?? DEFAULT_TAX_BP;
      return { treasuryOwner: city.owner, bp };
    },
    rules: () => input.rules().business,
  });
  business = core;
  // 사업장 장부 명령(프로토콜 34) — 건물 게이트웨이가 건물 서비스 고리로 넘긴다
  const commands = createBusinessCommands({
    core,
    ledger: input.ledger,
    maps: input.maps,
    catalog,
    rules: () => input.rules().business,
    place: (buildingId) => buildingPlace(service.places, buildingId),
    isBusiness: (buildingId) => service.facilities.has(buildingId),
    isStorage: (buildingId) => isStorage(service.places, buildingId),
    cityAdminLevel: (cityId) => npcCity(cityId)?.adminLevel,
    ownerOf: (userId, atMs) => input.settlement.ownerOfUser(userId, atMs).id,
    fallbackAsset: ASSET_CREDIT,
    now: input.now,
    durable: () => input.writer.durable(),
  });
  service.attachBusiness(commands);
  const attack = createBuildingAttack({
    ...input.battles,
    maps: input.maps,
    settlement: input.settlement,
    writer: input.writer,
    service,
    territory: input.territory,
    catalog,
    rules: input.rules,
    unitBusy: (unitId) => labor?.unitBusy(unitId) ?? false,
    unitAway: (unitId) => labor?.unitAway(unitId) ?? false,
    now: input.now,
    ready: input.ready,
  });
  let readRest: RestReader | undefined;
  let cityFood: { atMs: number; map: Map<number, Set<string>> } | undefined;
  const conditionSource: ConditionSource = {
    initialSum: (unitId) => input.holdings.initialSumOf(unitId),
    rest: (unitId, cityId) => {
      const rest = readRest?.(unitId);
      if (!rest || rest.cityId !== cityId) return undefined;
      const lodgingFacility =
        rest.lodgingId === null ? undefined : service.facilities.get(rest.lodgingId)?.facilityId;
      return { housing: rest.place, lodgingFacility };
    },
    necessitiesPm: (cityId) => input.npc?.()?.necessitiesOf(cityId),
    preferences: (unitId) => {
      const current = catalog();
      const housings = current.facilities.filter((def) => def.stage === "living").map((def) => def.id);
      return unitPreferences(input.npc?.()?.world.seed ?? 0, unitId, {
        foods: current.foodSubcategories,
        housings: [...housings, HOME_HOUSING],
      });
    },
    foodInCity: (cityId, subcategory) => {
      const nowMs = input.now();
      if (!cityFood || nowMs - cityFood.atMs >= CITY_FOOD_TTL_MS || nowMs < cityFood.atMs) {
        const current = catalog();
        cityFood = {
          atMs: nowMs,
          map: cityFoodSubcategories(input.ledger, (id) => current.subcategoryOf(id)),
        };
      }
      return cityFood.map.get(cityId)?.has(subcategory) ?? false;
    },
  };
  /** 컨디션 + 선호 이름(화면) */
  const conditionView = (unitId: number, cityId: number | null): WorkerConditionView => {
    const parts = workerCondition(unitId, cityId, conditionSource, input.rules());
    const current = catalog();
    const food = parts.preferences.food;
    const housing = parts.preferences.housing;
    return {
      ...parts,
      favoriteFoodName: food === null ? undefined : current.subcategoryName(food),
      preferredHousingName:
        housing === null ? undefined : housing === HOME_HOUSING ? undefined : current.facility(housing)?.name,
    };
  };
  /** 유닛 화면의 도시: 일하는 채집 시설의 도시, 없으면 지금 2차맵에서 ID가 가장 작은 도시 */
  const cityOfUnit = (unitId: number): number | null | undefined => {
    const buildingId = labor?.assignedTo(unitId);
    if (buildingId !== undefined) {
      const site = gatherSiteOf(service, catalog(), buildingId);
      if (site) return site.cityId;
    }
    for (const map of input.maps.values()) {
      if (!map.unitInfo(unitId)) continue;
      const ids = input
        .cities()
        .filter((city) => city.mapKey === map.mapKey)
        .map((city) => city.id);
      return ids.length > 0 ? Math.min(...ids) : null;
    }
    return undefined;
  };
  return {
    service,
    attack,
    land,
    damage: buildingDamageSinkOf(service, input.territory),
    catalog,
    gatherKinds: () => input.config?.gatherKinds?.() ?? [],
    rules: input.rules,
    attachLabor(next) {
      labor = next;
      // 보증금 적자·임대료 소득세(D-555 1503·1504)
      next.attachBusiness(core);
      next.attachProduction({
        site: (buildingId) => gatherSiteOf(service, catalog(), buildingId, oreCap, fishWater),
        // 병원(의료 단계 시설): 의사 직무 배치 자리(D-521, 산출 없음)
        workplace: (buildingId) => medicalSiteOf(service, catalog(), buildingId),
        primaries: (unitId) => input.holdings.primariesOf(unitId),
        // 임대형 임차인 몫의 건물 창고 상한(523 ②)
        roomGrams: (buildingId) =>
          roomGrams(
            {
              world: service.places,
              ledger: input.ledger,
              catalog: catalog(),
              rules: input.rules().facilityRuntime,
            },
            buildingId,
          ),
        weightGrams: (asset) => assetWeightG(catalog(), asset),
        // 컨디션(D-534·D-535): 그 채집 시설이 선 도시의 쉼터·음식·선호
        condition: (unitId, cityId) => workerCondition(unitId, cityId, conditionSource, input.rules()).total,
      });
    },
    condition(unitId) {
      const cityId = cityOfUnit(unitId);
      return cityId === undefined ? undefined : conditionView(unitId, cityId);
    },
    attachRest(read) {
      readRest = read;
    },
    business: core,
    businessCommands: commands,
    cityAdminLevel: (cityId) => npcCity(cityId)?.adminLevel,
  };
}
