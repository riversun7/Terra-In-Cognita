// 건물 서비스를 월드에 잇는다 — docs/adr/2026-11-07-buildings-runtime.md. world.ts가 부팅 복구 때 한 번 부른다.
// - 노동 계약: 계약 정산이 건물이 일하는지 묻고(30% 미만·짓는 중이면 산출 없음), 건물 서비스는 계약 중인 유닛·건물 사용을 묻는다(서로 고리라
//   늦게 잇는다). 보유 물건: 공방에서 고치는 중인 물건은 입기·벗기를 막는다. 영토: 비콘 짓기 재료를 같은 원장 빼기로 한다.
// - 건물 공격(질문 381, attack.ts): 세계 전투를 여는 길(몸·생명 수치·물약·탄 → 전투 서비스)을 받아 공성 전투를 열고, 결과의 건물 피해는
//   damage(건물 서비스·영토 서비스)가 받는다.
// - 플레이어 생산(docs/adr/2026-11-07-play-flow.md "WP3 플레이어 생산"): 계약 서비스를 이을 때 채집 산출 자료(채집 시설의 정의·레벨·도시·
//   자리 수, 유닛 1차 스탯)를 함께 넘긴다(gatherSiteOf). 임대형 임차인 몫의 건물 창고 남은 자리(storage.ts roomGrams, WP8 523 ②)도 함께.
// - 컨디션(D-534, labor/condition.ts): 채집 정산과 유닛 화면에 그 유닛의 관리 보너스를 넘긴다(주거 = 주인의 그 도시 숙소, 음식 = 도시 생필품 충족).
import type { ConditionParts, SocietyCoefficients } from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import type { WorldHoldings } from "../holdings/world.ts";
import type { GatherKind } from "../gather/kinds.ts";
import { type ConditionSource, workerCondition } from "../labor/condition.ts";
import type { GatherSite } from "../labor/gatherWork.ts";
import type { LaborService } from "../labor/service.ts";
import { type CityCell, cityLocation } from "@terra/shared/goodsPlaces";
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
   * 유닛 컨디션(D-534): 일하는 채집 시설의 도시(없으면 지금 2차맵에서 ID가 가장 작은 도시)의 주거·음식으로 센다. 유닛이 띄운 2차맵에 없으면
   * undefined
   */
  condition(unitId: number): ConditionParts | undefined;
}

/** 숙소(생활 단계 시설) 가운데 그 주인이 그 도시에 가진 다 지은 것의 가장 높은 레벨(없으면 undefined) */
export function ownerLodgingLevel(
  service: Pick<FacilityService, "facilities">,
  catalog: FacilityCatalog,
  maps: ReadonlyMap<number, SecondMap>,
  ownerId: number,
  cityId: number,
): number | undefined {
  let best: number | undefined;
  for (const record of service.facilities.values()) {
    if (record.level <= 0 || record.cityId !== cityId || (best !== undefined && record.level <= best))
      continue;
    if (catalog.facility(record.facilityId)?.stage !== "living") continue;
    for (const map of maps.values()) {
      const owner = map.buildingOwner(record.buildingId);
      if (owner === undefined) continue;
      if (owner === ownerId) best = record.level;
      break;
    }
  }
  return best;
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
    bands: catalog.gatherBands,
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
  /** 도시의 지난 하루 끝 생필품 충족 ‰(NPC 런타임 cityDayStore, 컨디션 음식 몫). 없으면 모름 */
  readonly necessitiesOf?: ((cityId: number) => number | undefined) | undefined;
}): WorldFacilities {
  const catalog = facilityCatalogOf(input.config?.content ?? (() => EMPTY_SOURCE));
  let labor: LaborService | undefined;
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
    labor: {
      unitBusy: (unitId) => labor?.unitBusy(unitId) ?? false,
      buildingInUse: (buildingId) => labor?.buildingInUse(buildingId) ?? false,
    },
    now: input.now,
    ready: input.ready,
  });
  input.holdings.setLocked((holdingId) => service.holdingLocked(holdingId));
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
  const ownerOfUnit = (unitId: number): number | undefined => {
    for (const map of input.maps.values()) {
      const info = map.unitInfo(unitId);
      if (info) return info.ownerId;
    }
    return undefined;
  };
  const conditionSource: ConditionSource = {
    initialSum: (unitId) => input.holdings.initialSumOf(unitId),
    lodgingLevel: (unitId, cityId) => {
      const owner = ownerOfUnit(unitId);
      return owner === undefined
        ? undefined
        : ownerLodgingLevel(service, catalog(), input.maps, owner, cityId);
    },
    necessitiesPm: (cityId) => input.necessitiesOf?.(cityId),
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
    damage: buildingDamageSinkOf(service, input.territory),
    catalog,
    gatherKinds: () => input.config?.gatherKinds?.() ?? [],
    rules: input.rules,
    attachLabor(next) {
      labor = next;
      next.attachProduction({
        site: (buildingId) => gatherSiteOf(service, catalog(), buildingId),
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
        // 컨디션(D-534): 그 채집 시설이 선 도시의 주거·음식
        condition: (unitId, cityId) => workerCondition(unitId, cityId, conditionSource, input.rules()).total,
      });
    },
    condition(unitId) {
      const cityId = cityOfUnit(unitId);
      return cityId === undefined
        ? undefined
        : workerCondition(unitId, cityId, conditionSource, input.rules());
    },
  };
}
