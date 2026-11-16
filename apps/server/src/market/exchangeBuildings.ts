// 거래소 건물 찾기·짓기 규칙·배치 유닛 주문 한도 — 기획 D-561("거래소는 건물"), D-117(도시마다 거래소), D-148(배치 유닛 INT·WIS 주문 한도),
// docs/adr/2026-11-16-exchange-buildings.md. 이름·수치는 @terra/shared/exchange.
// - 그 도시의 그 종류 거래소 = 그 도시 시설 줄 가운데 거래소 종류가 같고, 다 지었고(레벨 1 이상) 일하는 상태(건물 서비스 works — 상태 30% 이상)인
//   것의 가장 작은 건물 ID [임시](같은 종류 둘은 짓지 못하지만 옛 줄·관리자 놓기에 대비한다). 체결·돌려받기마다 불려 시설 줄만 훑는다(2차맵은 보지 않는다).
// - 짓기 규칙: 잠긴 종류(유닛·증권)는 짓지 못한다(exchange_locked). 도시 밖은 짓지 못한다(no_place). 같은 도시에 같은 종류가 이미 있으면
//   (짓는 중 포함) 짓지 못한다(exchange_exists).
// - 배치(D-148): 바뀜 (기획 D-571 1944 "거래소에 배치, 거래소 개인 창고·거래 물품 관리 역할", docs/adr/2026-11-16-exchange-buildings.md
//   "바뀜 (D-571)") — 그 종류 거래소 건물의 거래 직무 유닛(노동 직무 배치 labor_assign, 남의 거래소에도 — labor/service.ts tradeDesk). 예전
//   "건물 3칸 안에 선 유닛"은 없앴다. 주문 한도 = 기본 + 유닛마다 ⌊(INT + WIS) ÷ 나눗수⌋(입은 장비·버프 포함, holdings primariesOf), 위 끝 있음.
// 읽기만 한다(원장·시설을 바꾸지 않는다). 정수 연산만 쓴다.
import { type ExchangeKind, exchangeLocked, orderLimit, stationBonus } from "@terra/shared/exchange";
import { footprintRect } from "@terra/sim";
import type { FacilityCatalog } from "../facilities/catalog.ts";
import type { FacilityRecord } from "../facilities/state.ts";
import type { SecondMap } from "../world/secondMap.ts";

/** 거래소 건물 짓기를 막는 까닭 */
export type ExchangeBuildProblem = "exchange_locked" | "exchange_exists" | "no_place";

/** 시설 줄로 거래소 종류(거래소가 아니면 undefined) */
export function exchangeKindOf(catalog: FacilityCatalog, facilityId: string): ExchangeKind | undefined {
  return catalog.facility(facilityId)?.exchange;
}

/**
 * 거래소 건물을 지을 수 있나(플레이어 짓기 — 운영자 모드도 같다, D-564 1663은 재료·시간만 없앤다). 거래소가 아니면 undefined.
 * NPC 씨앗·증축은 이 함수를 거치지 않고 도시마다 하나만 세운다(npcSeed.ts 수 1·npc/cityBuild.ts 목표 1)
 */
export function exchangeBuildProblem(
  catalog: FacilityCatalog,
  records: Iterable<FacilityRecord>,
  facilityId: string,
  cityId: number | null,
): ExchangeBuildProblem | undefined {
  const kind = exchangeKindOf(catalog, facilityId);
  if (kind === undefined) return undefined;
  if (exchangeLocked(kind)) return "exchange_locked";
  if (cityId === null) return "no_place";
  for (const record of records)
    if (record.cityId === cityId && exchangeKindOf(catalog, record.facilityId) === kind)
      return "exchange_exists";
  return undefined;
}

export interface ExchangeWorld {
  /** 시설 줄(건물 서비스 facilities) */
  records(): Iterable<FacilityRecord>;
  catalog(): FacilityCatalog;
  /** 일하는 상태인가(건물 서비스 works) */
  works(buildingId: number): boolean;
  /** 유닛 1차 스탯(입은 장비·버프 포함). 없으면 배치 몫 0 */
  primariesOf?: ((unitId: number) => { readonly int: number; readonly wis: number }) | undefined;
  /** 그 건물의 거래 직무 유닛(노동 직무 배치 — 유닛 ID·주인). 없으면 배치 몫 0 */
  tradersAt?:
    | ((buildingId: number) => readonly { readonly unitId: number; readonly ownerId: number }[])
    | undefined;
}

export interface ExchangeDirectory {
  /** 그 도시의 그 종류 거래소 건물 ID(없으면 undefined) */
  cityExchange(cityId: number, kind: ExchangeKind): number | undefined;
  /** 그 종류 거래소가 있는 도시들(도시 → 건물 ID) */
  citiesWith(kind: ExchangeKind): Map<number, number>;
  /** 그 종류 거래소 건물(일하는 것)들의 내 거래 직무 유닛(유닛 ID 차례) */
  stationed(ownerId: number, kind: ExchangeKind): number[];
  /** 그 도시에 그 종류 거래소 건물이 있지만 일하지 않는가(상태 30% 미만·멈춘 사업장 — 기획 D-559, 질문 1950) */
  stoppedIn(cityId: number, kind: ExchangeKind): boolean;
  /** 내 주문 한도(그 종류 거래소의 배치 유닛 몫 포함) */
  orderLimit(ownerId: number, kind: ExchangeKind): number;
}

/** 건물 가운데 칸과 그 2차맵 키(없으면 undefined) — NPC 운반 시간(npcHaul.ts) */
export function buildingCenterOf(
  maps: ReadonlyMap<number, SecondMap>,
  buildingId: number,
): { readonly mapKey: number; readonly x: number; readonly y: number } | undefined {
  for (const map of maps.values()) {
    if (map.buildingOwner(buildingId) === undefined) continue;
    let found: { mapKey: number; x: number; y: number } | undefined;
    map.forEachBuilding((building) => {
      if (building.id !== buildingId) return;
      const rect = footprintRect(building.placement);
      found = {
        mapKey: map.mapKey,
        x: rect.x + Math.floor(rect.width / 2),
        y: rect.y + Math.floor(rect.height / 2),
      };
    });
    return found;
  }
  return undefined;
}

export function createExchangeDirectory(w: ExchangeWorld): ExchangeDirectory {
  const citiesWith = (kind: ExchangeKind): Map<number, number> => {
    const catalog = w.catalog();
    const out = new Map<number, number>();
    for (const record of w.records()) {
      if (record.cityId === null || record.level < 1) continue;
      if (exchangeKindOf(catalog, record.facilityId) !== kind || !w.works(record.buildingId)) continue;
      const have = out.get(record.cityId);
      if (have === undefined || record.buildingId < have) out.set(record.cityId, record.buildingId);
    }
    return out;
  };

  const stationed = (ownerId: number, kind: ExchangeKind): number[] => {
    const found = new Set<number>();
    for (const buildingId of citiesWith(kind).values())
      for (const entry of w.tradersAt?.(buildingId) ?? [])
        if (entry.ownerId === ownerId) found.add(entry.unitId);
    return [...found].toSorted((a, b) => a - b);
  };

  return {
    cityExchange: (cityId, kind) => citiesWith(kind).get(cityId),
    citiesWith,
    stationed,
    stoppedIn(cityId, kind) {
      const catalog = w.catalog();
      let any = false;
      for (const record of w.records()) {
        if (
          record.cityId !== cityId ||
          record.level < 1 ||
          exchangeKindOf(catalog, record.facilityId) !== kind
        )
          continue;
        if (w.works(record.buildingId)) return false;
        any = true;
      }
      return any;
    },
    orderLimit(ownerId, kind) {
      const primaries = w.primariesOf;
      if (!primaries) return orderLimit([]);
      return orderLimit(
        stationed(ownerId, kind).map((unitId) => {
          const p = primaries(unitId);
          return stationBonus(p.int, p.wis);
        }),
      );
    },
  };
}

/**
 * 외환 거래소가 있는 화폐들(원장 자산): 외환 거래소 건물이 선 도시의 주인 나라 화폐(D-561 "외환 거래소" — 환전은 그 화폐 나라의 외환 거래소에서).
 * currencyOfCity = 도시 → 그 도시 주인 나라 화폐(모르면 undefined)
 */
export function fxExchangeCurrencies(
  directory: ExchangeDirectory,
  currencyOfCity: (cityId: number) => string | undefined,
): Set<string> {
  const out = new Set<string>();
  for (const cityId of directory.citiesWith("fx").keys()) {
    const currency = currencyOfCity(cityId);
    if (currency !== undefined) out.add(currency);
  }
  return out;
}
