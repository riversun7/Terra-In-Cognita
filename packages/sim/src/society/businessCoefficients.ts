// 사업장 계수(팩 tuning 경로 "business.*", 모두 [임시]) — 기획 D-548·D-555(질문 1501~1514 답), docs/adr/2026-11-15-business-ledger.md.
// 서버 사업장 장부(apps/server/src/business)가 계수표에서 읽는다. 시뮬은 사업장 금고를 돌리지 않으므로(서버만) 시뮬 판정·출력은 그대로다.

export interface BusinessCoefficients {
  /**
   * [임시] 자동 정산 주기(ms, D-555 1501 "정해진 주기마다 자동 정산"). 주기 끝(UTC 0시 기준 같은 간격)에 적자를 먼저 갚고, 남은 금고 돈을
   * 지분 수대로 주주 지갑에 나눈다. 같은 때 한 주기 넘게 못 갚은 적자가 있으면 사업장이 멈춘다(1504). 0이면 자동 정산·멈춤 판단을 하지 않는다
   */
  readonly settlePeriodMs: number;
  /** [임시] 사업장 창고 판매의 최소 묶음(개, D-555 1507 "대량 B2B 위주"). 주인 꺼내기와 소매 도시는 1개부터 */
  readonly minLot: number;
  /** [임시] 낱개 판매(소매)를 받는 도시의 행정 건물 레벨 상한(D-555 1507 "저급 도시는 소매도"). 0이면 소매 없음 */
  readonly retailMaxAdmin: number;
  /**
   * [임시] 생산시설 지분 발행 수(주, 기획 44 §6 "생산시설 지분 100% 매각 가능" — 수는 정하지 않았다, D-130 도시 주식 1000주를 따름, 질문 1704).
   * 처음 사고팔 때 그 사업장 주인에게 한 번 발행한다(docs/adr/2026-11-15-building-screen.md)
   */
  readonly shareCount: number;
  /** [임시] 지분 동시호가 주기(ms, D-125 기존 주식 30분). 회차마다 모인 주문을 한 값으로 체결하고 남은 주문은 돌려준다 */
  readonly shareRoundMs: number;
  /** [임시] 한 사람이 한 회차에 걸어 둘 수 있는 지분 주문 수(환전 ORDER_MAX와 같은 값) */
  readonly shareOrderMax: number;
  /**
   * [임시] 지급준비금 임금 상승 여유(‰, 기획 D-564 1623 "임금이 상승할 경우도 고려하여 여유 있게"). 정산 때 자동 계산한 필요액(다음 정산
   * 주기까지 임금 + 한 달치 보증금 모자람)에 (1000 + 이 값)/1000을 곱한다
   */
  readonly reserveMarginPm: number;
  /**
   * [임시] 지급준비율 기본값(‰, D-564 1623 "남길 비율 선택"). 주인이 사업장마다 고르지 않았으면 이 값. 남길 돈 = 필요액(여유 포함) × 이 값/1000.
   * 0이면 예전처럼 모두 나눈다(보증금 자동 채우기도 없음)
   */
  readonly reserveDefaultPm: number;
  /**
   * [임시] 외주 요금(‰, 기획 D-564 1682 "조선소·상업시설은 외주를 받아 장사" — 요금은 그 사업장 금고). 남의 공방에서 장비를 고치면 쓰는 재료 기준 값
   * 합 × 이 값/1000(올림)을 그 공방 금고에 낸다. 0이면 요금 없음. 주인이 요금을 정하는 길은 질문 1785
   */
  readonly serviceFeePm: number;
  /**
   * [임시] 거래소 이용료(만분율, 기획 D-564 1682·D-548·D-160 — 질문 1948 답, docs/adr/2026-11-16-exchange-buildings.md "바뀜 (D-571)"). 물자 거래소
   * 체결마다 판 쪽이 총액 × 이 값 ÷ 10000(버림)을 그 도시 물자 거래소 건물 금고(사업장 장부)에 낸다. 거래세(국고, D-128)와 따로. 0이면 이용료 없음
   */
  readonly exchangeFeeBp: number;
  /**
   * [임시] 거래소 개인 창고 기본 크기(g, 기획 D-571 "유닛마다 작은 한도 창고"). 그 도시 물자 거래소 건물 창고에서 한 주인이 쓰는 자리(창고 물건 +
   * 걸어 둔 팔 물건 + 걸어 둔 사기 수량)의 위 끝. 넘으면 새 사기 주문·반입을 받지 않는다(이미 든 것은 그대로)
   */
  readonly exchangeLockerG: number;
  /** [임시] 거래소 개인 창고 넓히기 한 칸(g, D-571 "비용 지불하여 창고 확장") */
  readonly exchangeLockerStepG: number;
  /** [임시] 넓히기 한 칸 값(그 도시 화폐 최소 단위 — 그 거래소 건물 금고로, 사업장 장부 수입) */
  readonly exchangeLockerStepPrice: number;
  /** [임시] 넓히기 칸 수 위 끝(주인마다·도시마다) */
  readonly exchangeLockerMaxSteps: number;
  /** [임시] 한 주인이 거래소 하나에 둘 수 있는 거래 직무 유닛 수(D-571 1944 "거래소에 배치" — 주문 한도를 늘린다) */
  readonly exchangeTradeSlots: number;
}

export const START_BUSINESS: BusinessCoefficients = {
  settlePeriodMs: 86_400_000,
  minLot: 10,
  retailMaxAdmin: 2,
  shareCount: 1000,
  shareRoundMs: 1_800_000,
  shareOrderMax: 10,
  reserveMarginPm: 200,
  reserveDefaultPm: 1000,
  serviceFeePm: 200,
  exchangeFeeBp: 50,
  exchangeLockerG: 200_000,
  exchangeLockerStepG: 200_000,
  exchangeLockerStepPrice: 100,
  exchangeLockerMaxSteps: 20,
  exchangeTradeSlots: 5,
};
