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
   * [임시] 적정가 수수료(‰, 기획 D-570 1822 "적정가격 계산은 필요 재료비 인건비, 수수료 세금 등을 대략계산"). 값을 정하는 화면의 적정가 =
   * (재료비 + 인건비) × (1000 + 이 값)/1000을 세금 뒤에 남기는 값(@terra/shared/fairPrice). 바뀜 (D-570 1785): 예전에는 외주 수리 요금(재료 기준 값
   * × 이 값)이었다 — 이제 외주 요금은 주인이 정하고(정하지 않으면 적정가), 이 칸은 적정가 셈에만 쓴다
   */
  readonly serviceFeePm: number;
  /**
   * [임시] NPC 사업장 장부(기획 D-570 1887 — D-212 "NPC도 같은 시스템"·D-569 1781 "무조건 판매"): 1이면 NPC 세력 시설의 산출을 플레이어 사업장처럼
   * 시설 창고에 쌓고 실제로 나른다(서버 npc/npcDelivery.ts). 그 도시 창고에 닿은 만큼 나라가 시세에 사들인 매출, 레시피 재료는 시설이 사들인 재료비로
   * 시설 금고에 적고, 금고는 하루 끝 자동 정산으로 국고에 든다(바뀜 기획 대조 2053·2054 — D-555 1509·1510·D-571 1945). 0이면 예전처럼 도시 창고로 바로
   * (장부 없음). 시뮬 판정은 그대로
   */
  readonly npcBooks: number;
  /**
   * [임시] NPC 일꾼 소유자가 일시 중지된 임금형 계약을 기다리는 날(기획 D-573 2045 — NPC 소유자는 성향 규칙 D-212·D-323, apps/server/src/labor/npcWait.ts).
   * 실제 날 = 이 값 × (1500 − 상업 성향 치우침‰) ÷ 1000. 지나면 해지하고 다른 곳으로 간다. 0이면 바로 해지. 플레이어 소유자는 처리할 일로 손으로 정한다
   */
  readonly npcWaitDays: number;
  /**
   * [임시] NPC 시설 판매가의 상업 성향 폭(‰, 기획 대조 2153 — D-564 1627·D-570 1822 "판매자가 정한다", apps/server/src/npc/npcShopPrice.ts). 상업 성향
   * 치우침이 축 끝이면 기준 값의 +이 값, 0이면 −이 값. 0이면 성향을 보지 않는다
   */
  readonly npcPriceTemperPm: number;
  /** [임시] NPC 시설 판매가의 재고 폭(‰, 2153): 시설 창고가 비면 +이 값, 목표의 두 배 넘게 쌓이면 −이 값(그 사이는 곧은 선). 0이면 재고를 보지 않는다 */
  readonly npcPriceStockPm: number;
  /** [임시] NPC 시설 판매가의 목표 재고(판매 최소 묶음 수, 2153). 이만큼 쌓였으면 재고 폭 0 */
  readonly npcPriceStockLots: number;
  /**
   * [임시] 거래소 이용료(만분율, 기획 D-564 1682·D-548·D-160 — 질문 1948 답, docs/adr/2026-11-16-exchange-buildings.md "바뀜 (D-571)"). 물자 거래소
   * 체결마다 판 쪽이 총액 × 이 값 ÷ 10000(버림)을 그 도시 물자 거래소 건물 금고(사업장 장부)에 낸다. 거래세(국고, D-128)와 따로. 0이면 이용료 없음
   */
  readonly exchangeFeeBp: number;
  /**
   * [임시] 거래소 개인 창고 기본 크기(g, 기획 D-571 1943 "유닛마다 작은 한도 창고"). 바뀜 (줄기 exchange-3, 질문 2081): 유닛 하나의 창고 크기다.
   * 한 주인이 그 도시 물자 거래소 건물 창고에서 쓰는 자리(창고 물건 + 걸어 둔 팔 물건 + 걸어 둔 사기 수량)의 위 끝 = 그 주인 유닛마다(기본 +
   * 그 유닛 넓힌 칸)의 합. 넘으면 새 사기 주문·반입을 받지 않는다(이미 든 것은 그대로)
   */
  readonly exchangeLockerG: number;
  /** [임시] 거래소 개인 창고 넓히기 한 칸(g, D-571 "비용 지불하여 창고 확장") */
  readonly exchangeLockerStepG: number;
  /** [임시] 넓히기 한 칸 값(그 도시 화폐 최소 단위 — 그 거래소 건물 금고로, 사업장 장부 수입) */
  readonly exchangeLockerStepPrice: number;
  /** [임시] 넓히기 칸 수 위 끝(유닛마다·도시마다 — 질문 2081) */
  readonly exchangeLockerMaxSteps: number;
  /**
   * [임시] 거래소 거래 직무 자리 수(레벨마다, D-571 1944 "거래소에 배치" — 주문 한도를 늘린다). 바뀜 (질문 2083): 거래소 건물 하나의 자리 = 레벨 × 이 값.
   * 주인의 직무 배치·남의 임대형 계약(주인이 자리 값을 낸다)·고용(구인 게시판)이 함께 쓴다
   */
  readonly exchangeTradeSlots: number;
  /** [임시] 거래 직무 유닛이 그 거래소 반입·반출을 나를 때 걸리는 시간 배율(‰, 질문 2084 — 1000 = 다른 운반꾼과 같음) */
  readonly exchangeDeskHaulPm: number;
  /** [임시] 외환 거래소 환전 이용료 적정 요율(만분율, 질문 2086 — 주인이 정하지 않으면 이 값) */
  readonly exchangeFxFeeBp: number;
  /** [임시] 외환 거래소 주인이 정할 수 있는 환전 이용료 위 끝(만분율) */
  readonly exchangeFxFeeMaxBp: number;
  /**
   * [임시] 물자 거래소 주인이 정할 수 있는 이용료 아래·위 끝(만분율, 기획 D-574 질문 2085 "요율은 거래소 주인이 정하고 위아래 한도는 설정값"). 정하지 않으면
   * 적정 요율 exchangeFeeBp(이 범위로 자름). 선택 칸 — 없으면 0·10000
   */
  readonly exchangeFeeMinBp?: number | undefined;
  readonly exchangeFeeMaxBp?: number | undefined;
  /** [임시] 환전 이용료 아래 끝(만분율, 같은 틀 — misc-574). 선택 칸 — 없으면 0 */
  readonly exchangeFxFeeMinBp?: number | undefined;
  /**
   * [임시] NPC 거래소가 내는 거래 직무 자리 값(시간당) = 적정 자리 값(일꾼 한 명 시간당 인건비 + 수수료 serviceFeePm) × 이 값 ÷ 1000(기획 대조 2204 — D-555 1509·
   * D-212, misc-574). 0이면 NPC 거래소는 자리를 내지 않는다. 선택 칸 — 없으면 1000
   */
  readonly exchangeNpcDeskRentPm?: number | undefined;
  /**
   * [임시] 물류센터 운반 대행 요금 한 단위의 무게(g, 질문 2213 요금 단위 나 "100kg × 10칸마다" — 기획 D-576 "기술 추천", docs/adr/2026-11-16-logistics-center.md).
   * 단위 수 = ⌈짐 무게 ÷ 이 값⌉ × ⌈칸 ÷ haulUnitCells⌉(@terra/shared/logistics haulUnits). 서버만 읽는다
   */
  readonly haulUnitG: number;
  /** [임시] 물류센터 운반 대행 요금 한 단위의 칸 수(체비셰프 배치 칸) */
  readonly haulUnitCells: number;
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
  npcBooks: 1,
  npcWaitDays: 3,
  npcPriceTemperPm: 100,
  npcPriceStockPm: 200,
  npcPriceStockLots: 10,
  exchangeFeeBp: 50,
  exchangeLockerG: 200_000,
  exchangeLockerStepG: 200_000,
  exchangeLockerStepPrice: 100,
  exchangeLockerMaxSteps: 20,
  exchangeTradeSlots: 5,
  exchangeDeskHaulPm: 500,
  exchangeFxFeeBp: 50,
  exchangeFxFeeMaxBp: 1000,
  exchangeFeeMinBp: 0,
  exchangeFeeMaxBp: 1000,
  exchangeFxFeeMinBp: 0,
  exchangeNpcDeskRentPm: 1000,
  haulUnitG: 100_000,
  haulUnitCells: 10,
};
