// 건물 서비스를 월드에 잇는다 — docs/adr/2026-11-07-buildings-runtime.md. world.ts가 부팅 복구 때 한 번 부른다.
// - 노동 계약: 계약 정산이 건물이 일하는지 묻고(30% 미만·짓는 중이면 산출 없음), 건물 서비스는 계약 중인 유닛·건물 사용을 묻는다(서로 고리라
//   늦게 잇는다). 보유 물건: 공방에서 고치는 중인 물건은 입기·벗기를 막는다. 영토: 비콘 짓기 재료를 같은 원장 빼기로 한다.
// - 건물 공격(질문 381, attack.ts): 세계 전투를 여는 길(몸·생명 수치·물약·탄 → 전투 서비스)을 받아 공성 전투를 열고, 결과의 건물 피해는
//   damage(건물 서비스·영토 서비스)가 받는다.
import type { SocietyCoefficients } from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import type { WorldHoldings } from "../holdings/world.ts";
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
import { type PlaceWorld, beaconMaterialScope } from "./places.ts";
import { type FacilityService, createFacilityService } from "./service.ts";
import type { LoadedFacilities } from "./state.ts";

/** 월드 설정의 건물 칸(app.ts가 실효 콘텐츠 접근자를 넘긴다) */
export interface FacilitiesConfig {
  readonly content: () => CatalogSource;
}

const EMPTY_SOURCE: CatalogSource = { facilities: [], items: [] };

export interface WorldFacilities {
  readonly service: FacilityService;
  /** 건물·영토 비콘 공격(질문 381, attack.ts) */
  readonly attack: BuildingAttack;
  /** 전투 결과의 건물 피해를 받는 곳(전투 결과 적용이 같은 동기 처리로 부른다) */
  readonly damage: BuildingDamageSink;
  readonly catalog: () => FacilityCatalog;
  /** 세력·사회 계수표(설정 칸 실효 값) */
  readonly rules: () => SocietyCoefficients;
  /** 노동 계약을 잇는다(계약 서비스가 건물 서비스보다 늦게 만들어진다) */
  attachLabor(labor: LaborService): void;
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
    now: input.now,
    ready: input.ready,
  });
  return {
    service,
    attack,
    damage: buildingDamageSinkOf(service, input.territory),
    catalog,
    rules: input.rules,
    attachLabor(next) {
      labor = next;
    },
  };
}
