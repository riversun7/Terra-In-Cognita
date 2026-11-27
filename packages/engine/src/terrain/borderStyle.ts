// 2차맵 경계 표시 세기 — 카메라 거리(확대 단계)에 따라 중심 테두리·이웃 간 경계·인접 구역 톤 낮추기 세기를 구한다.
// 순수 함수(three.js 없음, 시험 대상).
// - 멀리 볼 때(1/6~2/6): 중심 테두리 점선과 인접 톤 낮추기가 뚜렷하고, 이웃 2차맵끼리의 경계선도 연하게 보인다.
// - 가까이 확대할 때(4/6~6/6): 인접 톤 낮추기와 이웃 간 경계는 서서히 사라지고, 중심 테두리만 은은하게 남아 심리스 이동을 해치지 않는다.
import type { DistanceRange } from "../camera/secondMapZoom.ts";

export interface TerrainBorderStyle {
  /** 중심 2차맵 사각형 테두리 점선 세기(0 ~ 1) */
  readonly mainLine: number;
  /** 인접 2차맵끼리의 경계 점선 세기(0 ~ 1) */
  readonly subLine: number;
  /** 인접 2차맵 톤 낮추기(채도·명도·경계 음영) 세기(0 ~ 1) */
  readonly neighbourTone: number;
}

export const NO_TERRAIN_BORDER: TerrainBorderStyle = {
  mainLine: 0,
  subLine: 0,
  neighbourTone: 0,
};

/** 6/6 최대 확대에서도 경계 바로 옆에 서면 위치를 가늠할 수 있게 남기는 중심 점선 최소 세기 */
const MAIN_LINE_CLOSE = 0.22;
const EDGE_EPSILON = 1e-6;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * 카메라 거리 → 줌 진행도(0 = 가장 멀리 1/6 ~ 1 = 가장 가까이 6/6, 로그 눈금).
 * 확대 범위가 한 점이면 1(가장 가까이)로 본다.
 */
export function zoomProgress(distance: number, range: DistanceRange): number {
  if (
    !Number.isFinite(distance) ||
    !Number.isFinite(range.minDistance) ||
    !Number.isFinite(range.maxDistance) ||
    range.minDistance <= 0 ||
    range.maxDistance <= range.minDistance * (1 + EDGE_EPSILON)
  ) {
    return 1;
  }
  const span = Math.log(range.maxDistance / range.minDistance);
  const pos = Math.log(range.maxDistance / clamp(distance, range.minDistance, range.maxDistance));
  return clamp(pos / span, 0, 1);
}

/**
 * 카메라 거리·확대 범위·이웃 유무 → 2차맵 경계 표시 세기.
 * 이웃 2차맵이 하나도 없으면(단독 1장 보기) 0을 돌려주어 기존 화면을 그대로 둔다.
 */
export function borderStyleForZoom(
  distance: number,
  range: DistanceRange,
  hasNeighbours: boolean,
): TerrainBorderStyle {
  if (!hasNeighbours) return NO_TERRAIN_BORDER;
  const t = zoomProgress(distance, range);
  return {
    mainLine: 1 - (1 - MAIN_LINE_CLOSE) * smoothstep(0.18, 0.92, t),
    subLine: 1 - smoothstep(0.12, 0.78, t),
    neighbourTone: 1 - smoothstep(0.15, 0.8, t),
  };
}
