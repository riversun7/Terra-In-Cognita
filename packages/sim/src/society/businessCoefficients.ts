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
}

export const START_BUSINESS: BusinessCoefficients = {
  settlePeriodMs: 86_400_000,
  minLot: 10,
  retailMaxAdmin: 2,
};
