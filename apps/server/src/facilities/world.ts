// 건물 서비스를 월드에 잇는다 — docs/adr/2026-11-07-buildings-runtime.md. world.ts가 부팅 복구 때 한 번 부른다.
// - 노동 계약: 계약 정산이 건물이 일하는지 묻고(30% 미만·짓는 중이면 산출 없음), 건물 서비스는 계약 중인 유닛·건물 사용을 묻는다(서로 고리라
//   늦게 잇는다). 보유 물건: 공방에서 고치는 중인 물건은 입기·벗기를 막는다. 영토: 비콘 짓기 재료를 같은 원장 빼기로 한다.
import type { SocietyCoefficients } from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import type { WorldHoldings } from "../holdings/world.ts";
import type { LaborService } from "../labor/service.ts";
import type { BeaconConstruction, TerritoryService } from "../territory/service.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap } from "../world/secondMap.ts";
import type { Settlement } from "../world/settlement.ts";
import { type CatalogSource, type FacilityCatalog, facilityCatalogOf } from "./catalog.ts";
import { spendGoods } from "./materials.ts";
import { type FacilityService, createFacilityService } from "./service.ts";
import type { LoadedFacilities } from "./state.ts";

/** 월드 설정의 건물 칸(app.ts가 실효 콘텐츠 접근자를 넘긴다) */
export interface FacilitiesConfig {
  readonly content: () => CatalogSource;
}

const EMPTY_SOURCE: CatalogSource = { facilities: [], items: [] };

export interface WorldFacilities {
  readonly service: FacilityService;
  readonly catalog: () => FacilityCatalog;
  /** 세력·사회 계수표(설정 칸 실효 값) */
  readonly rules: () => SocietyCoefficients;
  /** 노동 계약을 잇는다(계약 서비스가 건물 서비스보다 늦게 만들어진다) */
  attachLabor(labor: LaborService): void;
}

/** 비콘 짓기(영토 서비스 construction 칸): 놓는 사용자의 주인 원장에서 레벨 1 재료를 뺀다 */
export function beaconConstructionOf(options: {
  readonly ledger: Ledger;
  readonly settlement: Settlement;
  readonly rules: () => SocietyCoefficients;
}): BeaconConstruction {
  return {
    rules: () => options.rules().facilityRuntime,
    spend: (userId, materials, atMs) =>
      spendGoods(options.ledger, options.settlement.ownerOfUser(userId, atMs).id, materials, atMs, "beacon_build"),
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
    labor: {
      unitBusy: (unitId) => labor?.unitBusy(unitId) ?? false,
      buildingInUse: (buildingId) => labor?.buildingInUse(buildingId) ?? false,
    },
    now: input.now,
    ready: input.ready,
  });
  input.holdings.setLocked((holdingId) => service.holdingLocked(holdingId));
  return {
    service,
    catalog,
    rules: input.rules,
    attachLabor(next) {
      labor = next;
    },
  };
}
