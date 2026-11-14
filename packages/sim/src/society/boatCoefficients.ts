// 배 계수(팩 tuning 경로 "boats.*", 모두 [임시]) — docs/adr/2026-11-13-boats.md 1·3·4절(기획 D-540·D-5052, 49 P20 출발값 없음),
// 만드는 시간·유지비는 "바뀜 (2026-11-14, B2)"(기획 D-541 1271 나·1277 다).
// 서버 배 서비스(apps/server/src/boats)가 계수표에서 읽는다. 판정 셈(길찾기)은 grid/waterGrid.ts.

export interface BoatCoefficients {
  /** [임시] 배 빠르기(고정소수점 단위/초, 49 P20 "수단 최고 속도" D-5052). 1,536 = 1.5칸/초 ≈ 8.9m/s(걷기 437과 차 4,813 사이) */
  readonly speed: number;
  /** [임시] 배 하나에 탈 수 있는 유닛 수 */
  readonly capacity: number;
  /** [임시] 배 값 = 부두 레벨 1 건설 재료 × 이 값 ÷ 1000 */
  readonly costPm: number;
  /** [임시] 타고 내리는 거리(배치 칸): 유닛 몸과 배 몸 사이가 이 안이면 바로 탄다, 내릴 땅 칸을 이 안에서 찾는다 */
  readonly boardCells: number;
  /**
   * [임시] 배 만드는 시간 = 부두 레벨 1 건설 시간(M14 buildTimeAt) × 이 값 ÷ 1000(질문 1271 나, 기획 D-541). 일꾼 배율은 없다.
   * 0이면 바로 만든다
   */
  readonly buildTimePm: number;
  /** [임시] 배 유지비 무게(‰, 보통 유닛 1000 — 질문 1277 다, 기획 D-541 "사람보다 싸게") */
  readonly upkeepPm: number;
}

export const START_BOATS: BoatCoefficients = {
  speed: 1536,
  capacity: 4,
  costPm: 1000,
  boardCells: 3,
  buildTimePm: 1000,
  upkeepPm: 300,
};
