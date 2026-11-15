// 거래소에 올리는 물건의 자리(기획 D-564 1628 "거래소로 실어 나른 물건만", D-561 거래소는 건물, D-555 1505 자동 운반 없음).
// 물자 거래소 팔기 주문은 이 자리의 물건만 묶는다(market/service.ts 주문 넣기 확인·market/books.ts 거래소 설정 location이 같은 값).
// - 지금: 거래소 건물(D-561)이 아직 없어 "그 도시 거래소 = 그 도시 창고"다. 사업장 창고(건물 위치) 물건은 올리지 못하고, 유닛이 실제로 도시 창고로
//   실어 날라야 올린다(채집소 창고 꺼내기 = 운반꾼이 걸어서 나름, gather/station.ts). 사업장 창고에서 바로 파는 길은 business_buy(D-555 1507)다.
// - 거래소 건물이 생기면 이 함수만 그 건물 창고 위치(buildingLocation(거래소 건물))를 돌려주게 바꾸고, 옛 도시 창고 주문은 돌려준다(retarget과 같은 길).
//   질문 1784(docs/questions/2026-11-15-business-2.md).
// - 바뀜 (기획 D-569 1784 "거래소 반입은 실제 운반만 — 우회 길 없음"): 도시 창고로 들어오는 길이 모두 실제 운반이다 — 시설 건물 창고 꺼내기·사업장 판매
//   (business_buy)는 운반꾼이 걸어 나르고(gather/station.ts haulOut), 임금형·직무 배치 산출은 건물 창고로 가며(labor/workBook.ts), NPC 건물 시설 산출은
//   나르는 시간을 생산 시간에 더한다(npc/economy.ts). 남은 세부는 질문 1885(docs/questions/2026-11-16-business-3.md).
import { cityLocation } from "@terra/shared/goodsPlaces";

/** 그 도시 물자 거래소가 팔 물건을 꺼내는 원장 위치 */
export function exchangeGoodsLocation(cityId: number): number {
  return cityLocation(cityId);
}
