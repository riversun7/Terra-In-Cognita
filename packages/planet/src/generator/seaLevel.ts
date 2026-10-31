// 생성 2단계: 해수면 — 육지 비율(면적)의 백분위로 정하고, 바다와 이어지지 않은 낮은 땅은 땅(웅덩이)으로 둔다.
// 정육면체 꼭짓점 8곳(2차맵 3장만 만나는 특이점)과 그 둘레는 늘 바다다(PLAN 5.2).
import { CUBE_CORNERS } from "../corners.ts";
import { type PlanetGrid, areaOf, neighbors8 } from "./grid.ts";
import { areaPercentile } from "./util.ts";

/** 이보다 작은(구 면적 대비) 해수면 아래 낮은 땅은 바다가 아니라 웅덩이다: 0.2% ≈ 실제 환산 100만 km² */
const MIN_OCEAN_SHARE = 0.002;
/**
 * 꼭짓점 둘레를 바다로 누르는 반경(라디안, 약 100km). 칸이 이보다 크면 칸 1.2개.
 * 무늬 공간 회전(tectonics.ts)이 꼭짓점을 대개 바다에 두므로, 이것은 드문 경우의 안전망이다.
 */
const CORNER_SEA_RADIUS = 0.016;
/** 꼭짓점 둘레를 해수면보다 이만큼(실제 환산 m) 낮춘다 */
const CORNER_SEA_DEPTH = 400;

export interface SeaLevel {
  /** 해수면(기본 고도와 같은 실제 환산 m 척도) */
  readonly seaLevel: number;
  /** 바다면 1 */
  readonly ocean: Uint8Array;
}

/** 꼭짓점 칸(면마다 모서리 칸, 8곳 × 3칸)의 칸 번호 */
export function cornerCells(grid: PlanetGrid): number[] {
  const last = grid.n - 1;
  const cells: number[] = [];
  for (const corner of CUBE_CORNERS) {
    for (const { face, u, v } of corner.faces) {
      cells.push(face * grid.faceCells + (v > 0 ? last : 0) * grid.n + (u > 0 ? last : 0));
    }
  }
  return cells;
}

/**
 * 꼭짓점 둘레 칸(늘 바다로 누르는 칸)이면 1. 꼭짓점 쪽으로 반경 CORNER_SEA_RADIUS(칸이 크면 칸 1.2개) 안과 꼭짓점 칸.
 * classifyOcean과 해안선 흔들기(landforms.ts)가 같은 칸을 쓴다
 */
export function cornerSeaMask(grid: PlanetGrid): Uint8Array {
  const count = grid.cellCount;
  const radius = Math.max(CORNER_SEA_RADIUS, 1.2 * grid.meanCellAngle);
  const limit = 2 - radius * radius; // 2·cos θ ≥ 2 − θ²: 현 길이² = 2 − 2·cos
  const forced = new Uint8Array(count);
  for (const corner of CUBE_CORNERS) {
    const [sx, sy, sz] = corner.axisSigns;
    const norm = Math.sqrt(3);
    for (let c = 0; c < count; c++) {
      const cos = ((grid.x[c] ?? 0) * sx + (grid.y[c] ?? 0) * sy + (grid.z[c] ?? 0) * sz) / norm;
      if (2 * cos >= limit) forced[c] = 1;
    }
  }
  for (const c of cornerCells(grid)) forced[c] = 1;
  return forced;
}

/**
 * 바다 판정: 해수면 아래 칸(below)을 8이웃으로 이어진 덩어리로 묶고, 넓거나(구 면적의 0.2% 이상) 꼭짓점 칸(forced)을
 * 품은 덩어리만 바다(1)로 둔다. 나머지 해수면 아래 칸은 땅(웅덩이)이다. 결과는 덩어리를 찾는 순서와 무관하다
 */
export function oceanComponents(
  grid: PlanetGrid,
  below: (c: number) => boolean,
  forced: Uint8Array,
): Uint8Array {
  const count = grid.cellCount;
  const ocean = new Uint8Array(count);
  const seen = new Uint8Array(count);
  const queue = new Int32Array(count);
  const out = new Int32Array(8);
  const minArea = MIN_OCEAN_SHARE * 4 * Math.PI;
  for (let start = 0; start < count; start++) {
    if (seen[start] === 1 || !below(start)) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    let area = 0;
    let touchesCorner = false;
    while (head < tail) {
      const c = queue[head++] ?? 0;
      area += areaOf(grid, c);
      if (forced[c] === 1) touchesCorner = true;
      neighbors8(grid, c, out);
      for (let k = 0; k < 8; k++) {
        const next = out[k] ?? -1;
        if (next < 0 || seen[next] === 1 || !below(next)) continue;
        seen[next] = 1;
        queue[tail++] = next;
      }
    }
    if (area >= minArea || touchesCorner) {
      for (let k = 0; k < tail; k++) ocean[queue[k] ?? 0] = 1;
    }
  }
  return ocean;
}

/**
 * 해수면을 정하고 바다를 표시한다. 꼭짓점 둘레의 고도는 바다 깊이로 누른다(elevation을 고친다).
 * @param landPercent 육지 면적 비율(%)
 */
export function classifyOcean(grid: PlanetGrid, elevation: Float32Array, landPercent: number): SeaLevel {
  const seaLevel = areaPercentile(grid, elevation, 1 - landPercent / 100);
  // 꼭짓점 둘레: 해수면 아래로
  const forced = cornerSeaMask(grid);
  for (let c = 0; c < grid.cellCount; c++) {
    if (forced[c] === 1) elevation[c] = Math.min(elevation[c] ?? 0, seaLevel - CORNER_SEA_DEPTH);
  }
  // 해수면 아래 칸을 이어진 덩어리로 묶고, 넓거나 꼭짓점을 품은 덩어리만 바다로
  const ocean = oceanComponents(grid, (c) => (elevation[c] ?? 0) < seaLevel, forced);
  return { seaLevel, ocean };
}
