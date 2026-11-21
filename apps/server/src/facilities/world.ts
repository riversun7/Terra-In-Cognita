// 건물 서비스를 월드에 잇는다 — docs/adr/2026-11-07-buildings-runtime.md. world.ts가 부팅 복구 때 한 번 부른다.
// - 노동 계약: 계약 정산이 건물이 일하는지 묻고(30% 미만·짓는 중이면 산출 없음), 건물 서비스는 계약 중인 유닛·건물 사용을 묻는다(서로 고리라
//   늦게 잇는다). 보유 물건: 공방에서 고치는 중인 물건은 입기·벗기를 막는다. 영토: 비콘 짓기 재료를 같은 원장 빼기로 한다.
// - 건물 공격(질문 381, attack.ts): 세계 전투를 여는 길(몸·생명 수치·물약·탄 → 전투 서비스)을 받아 공성 전투를 열고, 결과의 건물 피해는
//   damage(건물 서비스·영토 서비스)가 받는다.
// - 플레이어 생산(docs/adr/2026-11-07-play-flow.md "WP3 플레이어 생산"): 계약 서비스를 이을 때 채집 산출 자료(채집 시설의 정의·레벨·도시·
//   자리 수, 유닛 1차 스탯)를 함께 넘긴다(gatherSiteOf). 임대형 임차인 몫의 건물 창고 남은 자리(storage.ts roomGrams, WP8 523 ②)도 함께.
// - 컨디션(D-534·D-535, labor/condition.ts): 채집 정산과 유닛 화면에 그 유닛의 관리 보너스를 넘긴다(주거 = 쉼터 배정 — 채집 세계가 attachRest로
//   늦게 잇는다, 음식 = 도시 생필품 충족, 선호 = 세계 시드·유닛 ID, 좋아하는 음식 = 그 도시 창고에 그 중분류가 있나).
// - 바뀜 (기획 D-552, docs/adr/2026-11-15-gather-object-tiers.md): 플레이어 광산의 칸 산지 막기와 플레이어 낚시터의 물 종류 범위를 지웠다 —
//   채집소 일꾼은 묶음마다 그 묶음이 쓰는 오브젝트의 티어 범위로 굴린다(gather/station.ts lotRoll). NPC 경제의 배후지 막기는 그대로다.
import { type LandCheck, createLandCheck } from "./landRule.ts";
import { HOME_HOUSING, type RestPlace, type SocietyCoefficients, unitPreferences } from "@terra/sim";
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
import { spendGoods } from "./materials.ts";
import { type PlaceWorld, assetWeightG, beaconMaterialScope, buildingPlace } from "./places.ts";
import { type FacilityService, createFacilityService } from "./service.ts";
import { roomGrams } from "./storage.ts";
import { type BusinessCore, EMPTY_BUSINESS, createBusinessCore } from "../business/core.ts";
import { type BusinessCommands, createBusinessCommands } from "../business/commands.ts";
import { EMPTY_SHARES, type ShareMarkets, createShareMarkets } from "../business/shares.ts";
import { createWorldShareLevy } from "../cityShares/levyWorld.ts";
import { ASSET_CREDIT } from "../world/settlement.ts";
import { nationIncomeTaxBp } from "../government/nationTax.ts";
import { creditAttackHook, creditUpkeepHook } from "../credit/hooks.ts";
import { DEFAULT_TAX_BP } from "../npc/currency.ts";
import { TEST_PLANET_ID } from "../world/testMaps.ts";
import type { LoadedFacilities } from "./state.ts";
import { type HaulService, createHaulService } from "../logistics/haulService.ts";
import { createAutoHaulPrefs } from "../logistics/autoHaul.ts";
import { type HaulEconomy, haulMoneyOf } from "../logistics/haulMoney.ts";
import { npcCenterHourly } from "../npc/npcLogistics.ts";

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
  /**
   * 유닛이 있는 도시(condition과 같은 고르기 — 없으면 null, 띄운 2차맵에 없으면 undefined)와 일하는 채집 시설(시설 ID·레벨). 사이보그 판 채집
   * 예상(기획 D-556 1255 "예상에 일터 레벨 반영", D-562 1569 "그 도시 거래소 체결가")이 읽는다
   */
  unitPlace(unitId: number):
    | {
        readonly cityId: number | null;
        readonly workplace?: {
          readonly facility: string;
          readonly level: number;
          readonly plots?: number;
          readonly tier?: number | null;
        };
      }
    | undefined;
  /** 플레이어 일꾼 쉼터를 잇는다(채집 세계가 세계 준비 뒤 labor/workerRest.ts로 만든다 — D-535 1152 나) */
  attachRest(read: RestReader): void;
  /** 사업장 장부(금고·소득세·적자·정산 — docs/adr/2026-11-15-business-ledger.md, D-548·D-555) */
  readonly business: BusinessCore;
  /** 사업장 장부 명령(값·묶음 조회 포함) */
  readonly businessCommands: BusinessCommands;
  /** 생산시설 지분 시장(docs/adr/2026-11-15-building-screen.md) */
  readonly shares: ShareMarkets;
  /** 그 도시 행정 레벨(모르면 undefined — 소매 도시 판단) */
  cityAdminLevel(cityId: number): number | undefined;
  /** 물류센터 운반 대행(기획 D-576 — logistics/haulService.ts, docs/adr/2026-11-16-logistics-center.md) */
  readonly haul: HaulService;
  /** 물류센터의 지금 나를 수 있는 일꾼 수를 잇는다(채집 세계의 운반꾼 — gather/station.ts freeStaff) */
  attachHaulStaff(read: (buildingId: number, mapKey: number, nowMs: number) => number): void;
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

/**
 * 그 건물이 채집 시설(팩 gather가 있는 시설)이면 채집 산출 자료: 정의·다 지은 레벨·사다리·확률표·묶음 크기·건물이 선 도시·자리 수(레벨 ×
 * 레벨당 자리, 레벨 0이면 0). 시설 줄이 없거나 채집 시설이 아니면 undefined
 */
export function gatherSiteOf(
  service: Pick<FacilityService, "facilities" | "places">,
  catalog: FacilityCatalog,
  buildingId: number,
): (GatherSite & { readonly slots: number }) | undefined {
  const record = service.facilities.get(buildingId);
  const def = record ? catalog.facility(record.facilityId) : undefined;
  if (!record || !def?.gather) return undefined;
  return {
    buildingId,
    facilityId: def.id,
    level: record.level,
    rule: def.gather,
    ladder: catalog.gatherLadder(def.gather),
    // 확률표 하나(기획 D-552)
    bands: catalog.gatherBands,
    lotSize: catalog.lotSize,
    cityId: record.cityId ?? buildingPlace(service.places, buildingId)?.cityId ?? null,
    slots: Math.max(0, record.level) * Math.max(0, def.slotsPerLevel),
    // 면적 모듈(건물 채집소, D-567)·고른 기르는 티어(D-569 1761)
    plots: record.plots ?? 0,
    tier: record.gatherTier ?? null,
  };
}

/**
 * 채집이 아닌 일터면 다 지은 레벨·자리 수(레벨 × 레벨당 자리). 아니면 undefined. 병원(의료 단계 시설, D-521 — 의사), 물류센터(운반꾼 — 기획 D-576,
 * docs/adr/2026-11-16-logistics-center.md), 그리고 장비 수리 줄이 있는 공방(기획 D-570 1785 "그 공방(사업장) 일꾼이 고친다" — 외주 수리 일꾼, 레벨당 자리가
 * 0이면 1 [임시])
 */
export function medicalSiteOf(
  service: Pick<FacilityService, "facilities">,
  catalog: FacilityCatalog,
  buildingId: number,
): { readonly level: number; readonly slots: number } | undefined {
  const record = service.facilities.get(buildingId);
  const def = record ? catalog.facility(record.facilityId) : undefined;
  if (!record || !def) return undefined;
  if (def.stage === "medical" || def.logistics === true)
    return { level: record.level, slots: Math.max(0, record.level) * Math.max(0, def.slotsPerLevel) };
  if ((def.repair?.length ?? 0) === 0) return undefined;
  return { level: record.level, slots: Math.max(0, record.level) * Math.max(1, def.slotsPerLevel) };
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
            /** 도시 경제(세력마다 거래세 — 사업장 소득세율로 쓴다 [임시]; 나라 화폐·환전 체결가 — 물류센터 요금 화폐, 기획 대조 2277) */
            readonly economy?:
              | {
                  readonly economy: { readonly taxOf: ReadonlyMap<number, number> } & HaulEconomy;
                  /** NPC 물류센터 운반꾼(house-10 2301 — 적정가 인건비) */
                  centerStaff(buildingId: number): readonly number[];
                }
              | undefined;
          }
        | undefined)
    | undefined;
}): WorldFacilities {
  const catalog = facilityCatalogOf(input.config?.content ?? (() => EMPTY_SOURCE));
  let labor: LaborService | undefined;
  let business: BusinessCore | undefined;
  let shares: ShareMarkets | undefined;
  // 2차맵 건설 땅 규칙(landRule.ts): 짓기 명령과 화면 미리 묻기가 같은 판정. 짓는 자리의 1차맵 영토 주인은 막지 않고 알림만(D-572 알박기 우선)
  const land = createLandCheck({
    pool: input.battles.pool,
    owners: input.battles.owners,
    writer: input.writer,
    territoryFaction: async (mapKey, x, y) => {
      const claims = await input.territory()?.claimsAt(TEST_PLANET_ID, [{ mapKey, x, y }]);
      return claims === undefined ? undefined : (claims[0]?.faction ?? null);
    },
    // 가문 도시가 정하지 않은 남의 가문 짓기(D-574 2124, 설정 칸 house_city_build_default)
    buildDefault: () => input.rules().house.cityBuildDefault !== 0,
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
    // 건물이 선 도시(세금 귀속·재료 자리) = 1차맵 영토 지도의 지방(D-568). 영토 밖·셈 전이면 옛 규칙
    province: (mapKey, x, y) => {
      const hit = input.territory()?.provinceAt(TEST_PLANET_ID, mapKey, x, y);
      return hit === undefined ? undefined : (hit?.city ?? null);
    },
    land,
    labor: {
      unitBusy: (unitId) => labor?.unitBusy(unitId) ?? false,
      buildingInUse: (buildingId) => labor?.buildingInUse(buildingId) ?? false,
      workersAt: (buildingId) => labor?.workersAt(buildingId) ?? [],
      unitAway: (unitId) => labor?.unitAway(unitId) ?? false,
    },
    now: input.now,
    ready: input.ready,
    // 적자를 한 주기 넘게 못 갚은 사업장은 멈춘다(D-555 1504), 주기 끝 처리는 노화 정시에 함께
    suspended: (buildingId) => business?.suspended(buildingId) ?? false,
    // 지분 동시호가 회차도 같은 정시에(경계를 지났을 때만 체결)
    onAge: (nowMs) => {
      shares?.tick(nowMs);
      business?.tick(nowMs);
    },
    onGone: (buildingId) => {
      shares?.forget(buildingId, input.now());
      business?.forget(buildingId, input.now());
    },
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
      // 그 나라 소득세(만분율): 나라가 정한 값(정부 세금 칸 — 질문 2322 나, government/nationTax.ts), 없으면 그 나라 거래세(옛 판). 도시 경제가 없으면(시험)
      // 기본 거래세
      const trade = input.npc?.()?.economy?.economy.taxOf.get(city.owner) ?? DEFAULT_TAX_BP;
      return { treasuryOwner: city.owner, bp: nationIncomeTaxBp(input.ledger, city.owner, trade) };
    },
    rules: () => input.rules().business,
    holders: (buildingId) => shares?.holders(buildingId) ?? [],
    now: input.now,
  });
  business = core;
  // 생산시설 지분 시장(값 = 사업장 금고 화폐 [임시] — shares.ts)
  const shareMarkets = createShareMarkets({
    ledger: input.ledger,
    writer: input.writer,
    planetId: TEST_PLANET_ID,
    loaded: input.loaded.business?.shares ?? EMPTY_SHARES,
    asset: ASSET_CREDIT,
    owner: (buildingId) => {
      const place = buildingPlace(service.places, buildingId);
      return place === undefined ? undefined : place.ownerId;
    },
    isBusiness: (buildingId) => service.facilities.has(buildingId),
    rules: () => input.rules().business,
    now: input.now,
    // 거래세·증권 거래소 이용료(D-587 질문 2474 다 — cityShares/levyWorld.ts)
    cityOf: (buildingId) => service.facilities.get(buildingId)?.cityId,
    levy: () =>
      createWorldShareLevy({
        records: () => service.facilities.values(),
        catalog,
        works: (buildingId) => service.works(buildingId),
        business: core,
        businessRules: () => input.rules().business,
        cityOwner: (cityId) => npcCity(cityId)?.owner,
        taxOf: (owner) => input.npc?.()?.economy?.economy.taxOf.get(owner),
        balance: (account) => input.ledger.balance(account),
      }),
  });
  shares = shareMarkets;
  // 사업장 장부 명령(프로토콜 34) — 건물 게이트웨이가 건물 서비스 고리로 넘긴다
  const commands = createBusinessCommands({
    core,
    ledger: input.ledger,
    unitOwner: (unitId) => {
      for (const map of input.maps.values()) {
        const info = map.unitInfo(unitId);
        if (info) return info.ownerId;
      }
      return undefined;
    },
    catalog,
    rules: () => input.rules().business,
    place: (buildingId) => buildingPlace(service.places, buildingId),
    isBusiness: (buildingId) => service.facilities.has(buildingId),
    // 산 물건은 운반꾼이 나른다(기획 D-569 1784 — 채집 세계가 잇는 창고 꺼내기 고리)
    carry: (seller, buyer, buildingId, asset, qty, atMs, via, keep) =>
      service.carryOut(seller, buyer, buildingId, asset, qty, atMs, via, keep),
    cityAdminLevel: (cityId) => npcCity(cityId)?.adminLevel,
    ownerOf: (userId, atMs) => input.settlement.ownerOfUser(userId, atMs).id,
    fallbackAsset: ASSET_CREDIT,
    now: input.now,
    durable: () => input.writer.durable(),
    shares: () => shareMarkets,
    // 외주 수리 요금(D-570 1785): 수리 줄이 있는 공방·그 공방 일꾼 시간당 인건비(적정가)
    repairShop: (buildingId) => {
      const record = service.facilities.get(buildingId);
      return (catalog().facility(record?.facilityId ?? "")?.repair?.length ?? 0) > 0;
    },
    laborHourly: (buildingId) => labor?.hourlyLabor(buildingId) ?? 0n,
    // 물류센터 운반 대행 한 단위 요금(D-576)
    haulShop: (buildingId) =>
      catalog().facility(service.facilities.get(buildingId)?.facilityId ?? "")?.logistics === true,
    // 환전 이용료 요율(질문 2086): 외환 거래소
    fxShop: (buildingId) =>
      catalog().facility(service.facilities.get(buildingId)?.facilityId ?? "")?.exchange === "fx",
    // 공방이 내는 외주 수리 시간당 재료비(기획 대조 2167 — 적정가에 넣는다)
    materialsHourly: (buildingId) => service.repairMaterialsHourly(buildingId),
    // 물자 거래소 이용료 요율(D-574 질문 2085): 물자 거래소
    goodsExchange: (buildingId) =>
      catalog().facility(service.facilities.get(buildingId)?.facilityId ?? "")?.exchange === "goods",
    // 증권 거래소 이용료 요율(D-587 질문 2474 다): 증권 거래소
    shareExchange: (buildingId) =>
      catalog().facility(service.facilities.get(buildingId)?.facilityId ?? "")?.exchange === "securities",
    // 배 판매가(기획 대조 2057): 그 조선소가 만드는 배 종류
    boatTypes: (buildingId) =>
      (catalog().facility(service.facilities.get(buildingId)?.facilityId ?? "")?.boats ?? []).map(
        (type) => type.id,
      ),
  });
  service.attachBusiness(commands);
  // 물류센터 운반 대행(D-576): 요금은 주인이 정한 한 단위 값(없으면 적정가), 떠날 때 맡긴 사람 지갑 → 그 사업장 금고
  let haulStaff: ((buildingId: number, mapKey: number, nowMs: number) => number) | undefined;
  const haul = createHaulService({
    places: () => service.places,
    works: (buildingId) => service.works(buildingId),
    price: (buildingId, item) => core.price(buildingId, item),
    taxRateOf: (buildingId, ownerId) => core.taxRateOf(buildingId, ownerId),
    suspended: (buildingId) => core.suspended(buildingId),
    // 노동 계약 일꾼이 없는 NPC 물류센터는 NPC 운반꾼·NPC 기준 임금 시간당(house-10 2301 — npc/npcLogistics.ts)
    laborHourly: (buildingId) =>
      labor?.hourlyLabor(buildingId) ||
      npcCenterHourly(input.npc?.()?.economy?.centerStaff(buildingId).length ?? 0, input.rules()),
    workerCount: (buildingId) =>
      labor?.workersAt(buildingId).length || (input.npc?.()?.economy?.centerStaff(buildingId).length ?? 0),
    freeStaff: (buildingId, mapKey, nowMs) =>
      haulStaff?.(buildingId, mapKey, nowMs) ?? labor?.workersAt(buildingId).length ?? 0,
    rules: input.rules,
    charge: (ownerId, buildingId, fee, kind, atMs, asset, keep) =>
      commands.chargeService(ownerId, buildingId, fee, kind, atMs, asset, keep),
    fallbackAsset: ASSET_CREDIT,
    now: input.now,
  });
  // 요금 화폐(기획 대조 2277 — 그 도시 주인 나라 화폐)·계정 자동 맡기기(2272 — user_settings.auto_haul, 켤 때 한 번 읽는다)
  haul.attachMoney(
    haulMoneyOf(
      () => input.npc?.(),
      (buildingId) => service.facilities.get(buildingId)?.cityId,
    ),
  );
  const autoHaul = createAutoHaulPrefs({
    pool: input.battles.pool,
    userOf: (ownerId) => input.battles.owners.get(ownerId)?.userId,
  });
  haul.attachPrefs(autoHaul);
  void autoHaul.load().catch(() => {
    // 읽지 못하면 모두 끔으로 시작한다(설정 화면에서 다시 켜면 메모리에 든다)
  });
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
    onAttack: creditAttackHook(input.ledger),
  });
  // 유지비 체납 → 신용(질문 2447 나, 줄기 governance-5)
  input.settlement.onUpkeep(creditUpkeepHook(input.ledger));
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
      // 지급준비금 필요액·보증금 자동 채우기(D-564 1623·1624)
      core.attachLabor({
        wageNeeds: (buildingId, periodMs) => next.wageNeeds(buildingId, periodMs),
        fund: (contractId, amount, atMs) => next.fundDeposit(contractId, amount, atMs),
      });
      next.attachProduction({
        site: (buildingId) => gatherSiteOf(service, catalog(), buildingId),
        // 병원(의료 단계 시설): 의사 직무 배치 자리(D-521, 산출 없음)
        workplace: (buildingId) => medicalSiteOf(service, catalog(), buildingId),
        // 거래소 거래 직무(기획 D-571 1944, 질문 2083): 물자·외환 거래소, 자리 = 레벨 × 설정 칸 exchange_trade_slots(주인 배치·남의 계약이 함께 쓴다)
        tradeDesk: (buildingId) => {
          const record = service.facilities.get(buildingId);
          const kind = record ? catalog().facility(record.facilityId)?.exchange : undefined;
          if (!record || (kind !== "goods" && kind !== "fx")) return undefined;
          const perLevel = Math.max(0, Math.floor(input.rules().business.exchangeTradeSlots));
          // NPC 거래소도 자리를 낸다(기획 대조 2204 — D-555 1509·D-212): 소유 주체에 사용자가 없고 세력이 있으면 자리 값 ‰(labor/deskRent.ts)
          const ownerId = buildingPlace(service.places, buildingId)?.ownerId;
          const owner =
            ownerId === undefined || ownerId === null ? undefined : input.battles.owners.get(ownerId);
          const npc = owner !== undefined && owner.userId === null && owner.factionId !== null;
          return {
            level: record.level,
            slots: Math.max(0, record.level) * perLevel,
            ...(npc ? { npcRentPm: input.rules().business.exchangeNpcDeskRentPm ?? 1000 } : {}),
          };
        },
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
    unitPlace(unitId) {
      const cityId = cityOfUnit(unitId);
      if (cityId === undefined) return undefined;
      const buildingId = labor?.assignedTo(unitId);
      const record = buildingId === undefined ? undefined : service.facilities.get(buildingId);
      return record && record.level >= 1
        ? {
            cityId,
            // 면적 모듈(건물 채집소, D-567)
            workplace: {
              facility: record.facilityId,
              level: record.level,
              plots: record.plots ?? 0,
              tier: record.gatherTier ?? null,
            },
          }
        : { cityId };
    },
    attachRest(read) {
      readRest = read;
    },
    business: core,
    businessCommands: commands,
    shares: shareMarkets,
    cityAdminLevel: (cityId) => npcCity(cityId)?.adminLevel,
    haul,
    attachHaulStaff(read) {
      haulStaff = read;
    },
  };
}
