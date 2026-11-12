// 숙소 회복·채집소 옮김 계수(팩 tuning 경로 "logistics.*", 모두 [임시]) — 셈은 logistics.ts. 질문 1047 다·1050 가(D-533),
// docs/adr/2026-11-11-city-building-layout.md "바뀜 (2026-11-12)". 계수표(coefficients.ts)가 읽으므로 셈 모듈과 나눠 둔다.

export interface LogisticsCoefficients {
  /** [임시] 1 = 숙소 회복을 도시 경제 생산 속도에 셈한다, 0 = 옛(숙소는 쉼터 자리만) */
  readonly lodgingMode: number;
  /** [임시] 숙소 레벨 하나의 침대 수(수용 인원 = 레벨 × 이 값). 숙소 침대도 도시 주거로 센다(749 다) */
  readonly lodgingBedsPerLevel: number;
  /** [임시] 숙소 하룻밤(쉼 한 번) 요금(최소 단위, 시설 주인이 받는다 — D-245). 도시 주인 세력 숙소는 같은 주머니라 오가지 않는다 */
  readonly lodgingFeePerNight: number;
  /** [임시] 숙소 없는 집(도시 주거 수 안)의 회복 배율(‰). 48 §7.1 "기본" */
  readonly homeRecoveryPm: number;
  /** [임시] 1 = 채집소 산출을 창고로 나르는 시간을 셈한다, 0 = 옛(거리 상관없이 바로) */
  readonly haulMode: number;
  /**
   * [임시] 1 = NPC 일꾼이 피로 바퀴(일 = 피로 상한 × 일 주기, 쉼 = 쉼터 회복)로 일터 ↔ 쉼터를 오간다(질문 1095 가, 48 §7.1 "한도에 닿으면
   * 스스로 숙소로"), 0 = 옛(지역 낮에 일터·밤에 쉼터, npc_work_start_pm·npc_work_end_pm)
   */
  readonly restCycleMode: number;
}

export const START_LOGISTICS: LogisticsCoefficients = {
  lodgingMode: 1,
  lodgingBedsPerLevel: 10,
  lodgingFeePerNight: 1,
  homeRecoveryPm: 1000,
  haulMode: 1,
  restCycleMode: 1,
};
