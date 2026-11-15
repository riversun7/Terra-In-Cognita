// 거래소에 올리는 물건의 자리(기획 D-564 1628 "거래소로 실어 나른 물건만", D-561 거래소는 건물, D-555 1505 자동 운반 없음,
// docs/adr/2026-11-16-exchange-buildings.md).
// - 에스크로(걸린 팔 주문의 물건)는 늘 그 도시 자리(cityLocation)다 — 거래소 금고. 거래소 건물이 생기거나 사라져도 걸린 주문은 그대로 남는다(옮기기 없음).
// - 유저 물건 자리 = 그 도시 물자 거래소 건물 창고(buildingLocation(거래소 건물)): 팔기는 여기 물건만 묶고, 사면 여기로 들어오고, 거두거나 만료되면
//   여기로 돌아온다. 도시 창고·사업장 창고 물건은 유닛이 거래소 건물로 실어 날라야 올린다(창고 넣기 storage_move in → 운반꾼, gather/station.ts haulIn).
//   그 도시에 거래소 건물이 없으면(부서짐·옛 세계) 새 주문은 받지 않고(no_exchange), 이미 걸린 주문의 체결·돌려받기는 도시 창고로 간다
//   (건물이 사라질 때 건물 창고 물건이 도시 창고로 돌아가는 것과 같다 — facilities/storage.ts rehomeBuildingGoods).
// - NPC 세력(유저가 아닌 주체) 물건 자리 = 도시 창고 그대로 [임시](질문 1945): 시뮬 NPC 경제가 도시를 자리로 쓰고(판정 그대로), NPC 운반은 보이지 않는
//   곳의 시간 셈(D-564 1626)이라 도시 창고와 그 도시 거래소 사이는 바로 잇는다고 본다.
import { buildingLocation, cityLocation } from "@terra/shared/goodsPlaces";

/** 그 도시 물자 거래소의 에스크로(거래소 금고) 원장 위치 */
export function exchangeEscrowLocation(cityId: number): number {
  return cityLocation(cityId);
}

/** 그 도시 물자 거래소 건물 창고 위치(건물이 없으면 undefined) */
export function exchangeGoodsLocation(exchangeBuildingId: number | undefined): number | undefined {
  return exchangeBuildingId === undefined ? undefined : buildingLocation(exchangeBuildingId);
}

/** 그 주인의 거래소 물건 자리: 유저 = 거래소 건물 창고(없으면 도시 창고), NPC 세력 = 도시 창고 */
export function exchangeHolding(
  cityId: number,
  isUser: boolean,
  exchangeBuildingId: number | undefined,
): number {
  if (!isUser) return cityLocation(cityId);
  return exchangeGoodsLocation(exchangeBuildingId) ?? cityLocation(cityId);
}
