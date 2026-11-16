// 정박한 항구(기획 D-570 1823 "모든 배가 동일한데, 항구에 정박하면 교역을 위한 물건 상하역이나 배연료 보급, 유닛 식량 등 정비. 항구근처의 교역소나 정유소, 물류
// 등등이 중요하며 항구도시로 발전.", 1830 "교역 부두와 내 정박장 모두") — docs/adr/2026-11-15-shipyard-harbor.md "바뀜 (D-570)"·"바뀜 (boats-5)".
// 내리기·싣기·연료 보급·포획 장비 달기(cargo.ts·voyage.ts·gear.ts)가 같은 "정박" 조건과 물건 자리를 쓴다.
// - 정박 = 배가 배 시설 둘레 harborReachCells 안이고(조선소는 정박하지 않는다 — D-559 1523 "항구 정박장과 조선소는 아예 별개"):
//   교역 부두(누구 것이든, 제 부두도)는 시간을 샀을 때(교역 부두 요금 → 그 부두 사업장 금고, 제 부두도 — D-555 1514),
//   정박장은 그 배의 집 정박장일 때(정박료를 낸다 — 제 정박장이면 제 사업장 금고로, D-555 1514).
// - 물건 자리 = 그 시설이 선 도시의 내 도시 창고. 그 도시 물자 거래소 건물(다 짓고 일하는 것)이 시설에서 exchangeReachCells 칸 안이면 그 건물 창고의 내 몫이
//   항구 옆 교역소다: 내리면 거래소 건물 창고로 가 그 자리에서 팔고(D-561 "거래소로 실어 나른 물건만"), 실을 때도 거기서 먼저 꺼낸다.
//   배 창고와 물건 자리 사이는 운반꾼이 실제로 나른다(D-555 1505 — cargo.ts). 연료·포획 장비는 배 창고에서만 꺼낸다(싣기로 먼저 싣는다).
//   정유소는 석유 자리만(D-536), 물류(운반 대행 사업장)는 아직 없다(질문 2067 → 2213).
import { buildingLocation, cityLocation } from "@terra/shared/goodsPlaces";
import { cityAt } from "../facilities/places.ts";
import type { CellPoint } from "@terra/sim";
import { UNIT_KIND_BOAT } from "../world/unitKinds.ts";
import type { SecondMap } from "../world/secondMap.ts";
import {
  type BoatCommandResult,
  type BoatDeps,
  type FoundBuilding,
  facilityOf,
  fail,
  findBuilding,
  mapOfUnit,
  rectGap,
} from "./core.ts";
import type { Harbor } from "./harbor.ts";
import { isBerth, isTradeDock } from "./rules.ts";
import type { BoatState } from "./store.ts";

/** 정박한 항구 하나 */
export interface Port {
  readonly map: SecondMap;
  readonly boatOwner: number;
  readonly state: BoatState;
  readonly dock: FoundBuilding;
  /** 그 시설이 선 도시(모르면 null — 물건 자리가 없다: 배 창고만 쓴다) */
  readonly cityId: number | null;
  /** 항구 옆 물자 거래소 건물(없으면 null) */
  readonly exchangeId: number | null;
  /** 물건 자리(원장 위치) 차례 — 항구 옆 거래소 건물 창고가 있으면 먼저, 그다음 도시 창고 */
  readonly places: readonly number[];
  /** places와 같은 차례의 운반꾼이 오가는 칸(거래소 건물 가운데·도시 칸) */
  readonly spots: readonly CellPoint[];
  /** 배 시설 가운데 칸(운반꾼이 배 창고를 오가는 쪽) */
  readonly at: CellPoint;
}

/** 칸 네모의 가운데 칸 */
const centerOf = (rect: { x: number; y: number; width: number; height: number }): CellPoint => ({
  x: rect.x + (rect.width >> 1),
  y: rect.y + (rect.height >> 1),
});

/** 그 도시의 물자 거래소 건물이 그 시설에서 reach 칸 안이면 그 건물 ID(가장 작은 ID, 다 짓고 일하는 것만) */
export function exchangeNear(
  deps: BoatDeps,
  dock: FoundBuilding,
  cityId: number,
  reach: number,
): number | null {
  const places = deps.places();
  if (!places || reach <= 0) return null;
  const catalog = places.catalog();
  let best: number | null = null;
  for (const record of places.facilities.values()) {
    if (record.cityId !== cityId || record.level < 1) continue;
    if (catalog.facility(record.facilityId)?.exchange !== "goods" || !deps.works(record.buildingId)) continue;
    if (best !== null && record.buildingId >= best) continue;
    const found = findBuilding(deps.maps, record.buildingId);
    if (!found || found.map !== dock.map || rectGap(found.rect, dock.rect) > reach) continue;
    best = record.buildingId;
  }
  return best;
}

/**
 * 배가 그 시설에 정박해 있나(머리 주석). me = 부르는 소유 주체(운영자는 남의 배도). 정박이면 항구, 아니면 실패 결과
 */
export function portOf(
  deps: BoatDeps,
  harbor: Harbor,
  me: number | undefined,
  boatId: number,
  buildingId: number,
  operator: boolean,
): Port | BoatCommandResult {
  const map = mapOfUnit(deps.maps, boatId);
  const boat = map?.unitInfo(boatId);
  if (!map || !boat) return fail("unknown_unit");
  if (!operator && boat.ownerId !== me) return fail("forbidden");
  if (boat.kind !== UNIT_KIND_BOAT) return fail("not_boat");
  const state = harbor.stateOf(boatId);
  if (!state) return fail("unknown_unit");
  const dock = findBuilding(deps.maps, buildingId);
  if (!dock) return fail("unknown_building");
  if (dock.map !== map) return fail("wrong_map");
  const places = deps.places();
  const fac = facilityOf(places, buildingId);
  if (!places || !fac?.def.harbor) return fail("not_dock");
  const at = deps.now();
  // 교역 부두는 시간을 사고(제 부두도 요금 — D-555 1514), 정박장은 집 정박장일 때만, 조선소는 정박하지 않는다(D-559 1523)
  if (isTradeDock(fac.def)) {
    if (state.tradeId !== buildingId || (state.tradeUntilMs ?? 0) <= at) return fail("not_moored");
  } else if (!isBerth(fac.def) || state.homeId !== buildingId) return fail("not_moored");
  const rules = deps.rules();
  if (!harbor.near(boatId, dock, rules.harborReachCells, at)) return fail("not_moored");
  const cityId = fac.record.cityId ?? cityAt(places, dock.map.mapKey, dock.rect.x, dock.rect.y);
  const exchangeId =
    cityId === null ? null : exchangeNear(deps, dock, cityId, Math.max(0, rules.exchangeReachCells));
  const at0 = centerOf(dock.rect);
  const exchangeRect = exchangeId === null ? undefined : findBuilding(deps.maps, exchangeId)?.rect;
  const city = cityId === null ? undefined : places.cities().find((entry) => entry.id === cityId);
  return {
    map,
    boatOwner: boat.ownerId,
    state,
    dock,
    cityId,
    exchangeId,
    places: [
      ...(exchangeId === null ? [] : [buildingLocation(exchangeId)]),
      ...(cityId === null ? [] : [cityLocation(cityId)]),
    ],
    spots: [
      ...(exchangeId === null ? [] : [exchangeRect ? centerOf(exchangeRect) : at0]),
      ...(cityId === null ? [] : [city ? { x: city.x, y: city.y } : at0]),
    ],
    at: at0,
  };
}

/** portOf 결과가 실패인가 */
export const portFailed = (value: Port | BoatCommandResult): value is BoatCommandResult => "ok" in value;
