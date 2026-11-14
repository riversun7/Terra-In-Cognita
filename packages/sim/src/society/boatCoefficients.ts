// 배 계수(팩 tuning 경로 "boats.*", 모두 [임시]) — docs/adr/2026-11-13-boats.md 1·3·4절(기획 D-540·D-5052, 49 P20 출발값 없음).
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
}

export const START_BOATS: BoatCoefficients = {
  speed: 1536,
  capacity: 4,
  costPm: 1000,
  boardCells: 3,
};
