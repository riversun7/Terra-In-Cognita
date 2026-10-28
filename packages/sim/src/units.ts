// 2차맵 판정 단위 (ADR 2026-10-28-s1-second-map.md "유닛 이동", 격자 ADR)
// 게임 규칙은 칸 수로 정한다. 미터는 표시용이라 여기 두지 않는다.

/** 배치 칸 하나의 고정소수점 단위 수. 위치는 배치 칸의 1/1024 단위 정수다. */
export const CELL_UNITS = 1024;

/** 칸 모서리에서 칸 중심까지의 거리(단위) */
export const HALF_CELL_UNITS = CELL_UNITS / 2;

/** 2차맵 배치 격자 한 변의 칸 수 (256×256) */
export const PLACEMENT_SIZE = 256;

/** 배치 격자 전체 칸 수. 칸 번호는 y × PLACEMENT_SIZE + x 다. */
export const PLACEMENT_CELLS = PLACEMENT_SIZE * PLACEMENT_SIZE;

/** 2차맵 지형 격자 한 변의 칸 수 (128×128) */
export const TERRAIN_SIZE = 128;

/** 지형 꼭짓점(높이) 한 변의 수 (129×129) */
export const TERRAIN_VERTEX_SIZE = TERRAIN_SIZE + 1;

/** 지형 칸 하나가 덮는 배치 칸 수(한 변). 지형 칸 하나 = 배치 칸 2×2 */
export const PLACEMENT_PER_TERRAIN = PLACEMENT_SIZE / TERRAIN_SIZE;

/** 2차맵 한 변의 길이(단위) */
export const MAP_UNITS = PLACEMENT_SIZE * CELL_UNITS;

/** 시각은 서버 시계의 ms 정수, 속도는 단위/초 정수다. */
export const MS_PER_SECOND = 1000;

/** 2차맵 로컬 연속 좌표. 값은 고정소수점 단위(배치 칸의 1/1024) 정수다. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** 배치 칸 좌표(0 ~ 255 정수) */
export interface CellPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * 걷기 출발값(단위/초). 기획 D-120 "2차맵 하나(약 1.5km)를 10분 안에, 약 0.42칸/초 이상"에서
 * 256칸을 600초 안에 건너는 가장 느린 정수 속도: 256 × 1024 ÷ 600 = 436.9 → 437(약 0.427칸/초).
 * 구현 때 조정하는 값이다.
 */
export const WALK_SPEED = 437;

/** 차 출발값(단위/초). 기획 D-120 "약 4.7칸/초" × 1024를 올림했다. 구현 때 조정하는 값이다. */
export const CAR_SPEED = 4813;
