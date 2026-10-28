// 칸 이동 비용 — 천분율 정수(1000 = 평지 기준). 0은 지나갈 수 없다는 뜻이다.
// 도로 종류별 비용은 기획 D-102·D-108(속도 배율은 예시)에서 온 S1 임시값이다.
// 비용 = 1000 ÷ 속도 배율(반올림). 실제 수치는 물류 기획(Step 4-3)과 콘텐츠 팩으로 옮긴다.

/** 평지(풀밭) 한 칸의 비용 */
export const BASE_COST = 1000;

/** 지형 비용으로 쓸 수 있는 가장 큰 값(Uint16) */
export const MAX_TERRAIN_COST = 0xffff;

/** 도로 없음 */
export const ROAD_NONE = 0;
/** 길(자연 발생, 1칸) — 예시 배율 ×1.1 */
export const ROAD_TRAIL = 1;
/** 마을길(1차로, 1칸) — ×1.2 */
export const ROAD_VILLAGE = 2;
/** 2차로 도로(2칸) — ×1.5 */
export const ROAD_TWO_LANE = 3;
/** 4차로 도로(3칸) — ×1.8 */
export const ROAD_FOUR_LANE = 4;
/** 고속도로(4칸) — ×2.5 */
export const ROAD_HIGHWAY = 5;

/**
 * 도로 종류 → 칸 비용(천분율). 번호가 표의 위치다.
 * 철도(×4.0)는 역에서만 타고 내리는 별도 이동이라 S1 걷기 경로에 넣지 않았다.
 */
export const ROAD_COST: Readonly<Uint16Array> = Uint16Array.of(0, 909, 833, 667, 556, 400);

/** 알려진 도로 종류인가(ROAD_NONE 포함) */
export function isRoadType(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < ROAD_COST.length;
}
