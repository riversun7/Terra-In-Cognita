// 칸 걸음 배율 — 경로 구간 빠르기(기획 D-541·D-5052, ADR 2026-11-14-segment-speed.md)
// 걸음 배율(천분율) = 1000 × 유닛 기본 속도 ÷ 그 칸에서 그 유닛이 내는 속도. 이동 계산(motion.ts)이 구간마다 쓴다.
// - 도로가 없는 칸: 속도 = 기본 속도 × 1000 ÷ 지형 비용 → 배율 = 지형 비용(숲 1.8배·얕은 물 2.5배·느려짐 소품 1.5배가 이미 들어 있다).
// - 도로 칸(D-5052 "실제 속도 = min(수단 최고 속도, 도로 최고 속도)"): 속도 = min(기본 속도, 도로 최고 속도) → 배율 = max(1000, ⌈1000 × 기본 ÷ 도로 최고⌉).
//   걷기는 도로 최고 속도보다 느려서 도로 위에서 늘 1000이다(D-5052 "걷기는 도로와 거의 상관없다" — 도로는 숲·바위 같은 지형 늦춤을 없앤다).
// - 대형 유닛(크기 등급 2·3): 차지하는 s×s 칸 중 가장 큰 배율(길찾기 footprintCost와 같은 꼴).
// 길 고르기(A*)의 도로 비용(ROAD_COST, D-108 예시 배율)은 그대로다 — 질문 1342.
import type { SizeClass } from "../grid/clearance.ts";
import type { PlacementGrid } from "../grid/placementGrid.ts";
import { MAX_PACE, PACE_BASE } from "../motion/motion.ts";
import { PLACEMENT_SIZE } from "../units.ts";

/**
 * [임시] 도로 종류 → 최고 속도(단위/초, 번호는 grid/costs.ts ROAD_*). 기획 49 M10·P23은 출발값이 없다 → 질문 1341.
 * 지금 2차맵에는 도로가 없다(배치 격자 도로 층을 채우는 코드가 없다, Verified). 차(CAR_SPEED 4,813)가 길·마을길에서 조금 느려지는 값.
 */
export const ROAD_MAX_SPEED: Readonly<Uint32Array> = Uint32Array.of(0, 3072, 4096, 8192, 12_288, 20_480);

/** 칸 하나의 걸음 배율(천분율). 지나갈 수 없는 칸(비용 0)은 MAX_PACE */
export function cellPace(grid: PlacementGrid, index: number, unitSpeed: number): number {
  const road = grid.road[index] ?? 0;
  if (road !== 0) {
    const roadMax = ROAD_MAX_SPEED[road] ?? 0;
    if (roadMax <= 0) return MAX_PACE;
    if (unitSpeed <= roadMax) return PACE_BASE;
    return Math.min(MAX_PACE, Math.ceil((PACE_BASE * unitSpeed) / roadMax));
  }
  const cost = grid.terrainCost[index] ?? 0;
  return cost === 0 ? MAX_PACE : cost;
}

/** 크기 등급 size 유닛이 기준 칸 index에 들어갈 때의 걸음 배율: 차지하는 s×s 칸 중 가장 큰 값 */
export function footprintPace(
  grid: PlacementGrid,
  index: number,
  size: SizeClass,
  unitSpeed: number,
): number {
  if (size === 1) return cellPace(grid, index, unitSpeed);
  let highest = 0;
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const pace = cellPace(grid, index + dy * PLACEMENT_SIZE + dx, unitSpeed);
      if (pace > highest) highest = pace;
    }
  }
  return highest;
}
