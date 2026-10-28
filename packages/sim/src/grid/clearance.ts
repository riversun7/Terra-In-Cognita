// 크기 등급별 통과 폭(clearance) — 기획 D-135, ADR 33 "크기 등급마다 통과 가능 지도"
//
// 정의: clearance[칸] = 그 칸을 왼쪽 위 모서리로 하는 정사각형 중, 모든 칸이 열린(지나갈 수 있는)
// 가장 큰 정사각형의 변 길이. MAX_SIZE_CLASS에서 자른다.
// 크기 등급 s 유닛은 s×s 칸을 차지하고, 그 정사각형의 왼쪽 위 칸(기준 칸)으로 위치를 나타낸다.
// 그래서 "등급 s가 기준 칸 c에 설 수 있다" ⇔ clearance[c] ≥ s 다.
// 등급마다 지도를 따로 두는 대신 배열 하나에 담았다(등급 s의 통과 지도 = clearance ≥ s).
//
// 점화식(오른쪽·아래·대각선 이웃): c(x,y) = 열림 ? min(K, 1 + min(c(x+1,y), c(x,y+1), c(x+1,y+1))) : 0
// 지도 밖은 0(막힘)으로 본다. 잘린 값 c(x,y)는 K×K 정사각형 안의 칸만으로 정해진다.
import { PLACEMENT_SIZE } from "../units.ts";

/** 크기 등급 = 통과 폭(칸). 1: 일반, 2: 대형(약 12m, D-095·D-135), 3: 초대형(필요할 때) */
export type SizeClass = 1 | 2 | 3;

export const SIZE_SMALL: SizeClass = 1;
export const SIZE_LARGE: SizeClass = 2;
export const SIZE_HUGE: SizeClass = 3;

/** 통과 폭을 자르는 값(가장 큰 크기 등급) */
export const MAX_SIZE_CLASS = 3;

export function isSizeClass(value: unknown): value is SizeClass {
  return value === 1 || value === 2 || value === 3;
}

/** 통과 폭 계산에 필요한 칸 층 */
export interface CellLayers {
  /** 지형 비용(천분율). 0이면 막힘 */
  readonly terrainCost: Uint16Array;
  /** 도로 종류(0 = 없음). 도로가 있으면 지형이 막혀도 열린다(다리·터널) */
  readonly road: Uint8Array;
  /** 건물 ID(0 = 없음). 건물이 있으면 막힘 */
  readonly building: Uint32Array;
}

/** 칸이 열려 있는가: 건물이 없고, 도로가 있거나 지형이 막히지 않았다 */
export function isOpenCell(layers: CellLayers, index: number): boolean {
  return layers.building[index] === 0 && (layers.road[index] !== 0 || layers.terrainCost[index] !== 0);
}

/** 전체 통과 폭을 새 배열로 계산한다(국소 갱신 검증·처음 만들 때) */
export function computeClearance(layers: CellLayers): Uint8Array {
  const out = new Uint8Array(PLACEMENT_SIZE * PLACEMENT_SIZE);
  fillRegion(layers, out, 0, 0, PLACEMENT_SIZE - 1, PLACEMENT_SIZE - 1);
  return out;
}

/**
 * 직사각형(x, y, width, height)의 칸이 열림·막힘이 바뀐 뒤, 값이 바뀔 수 있는 칸만 다시 계산한다.
 * 영향 범위: 정사각형(K×K)이 바뀐 칸과 겹치는 기준 칸 = 왼쪽·위로 K-1칸 넓힌 범위.
 */
export function refreshClearance(
  layers: CellLayers,
  clearance: Uint8Array,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const x0 = Math.max(0, x - (MAX_SIZE_CLASS - 1));
  const y0 = Math.max(0, y - (MAX_SIZE_CLASS - 1));
  const x1 = Math.min(PLACEMENT_SIZE - 1, x + width - 1);
  const y1 = Math.min(PLACEMENT_SIZE - 1, y + height - 1);
  if (x1 < x0 || y1 < y0) return;
  fillRegion(layers, clearance, x0, y0, x1, y1);
}

/**
 * 범위(양 끝 포함)를 오른쪽 아래에서 왼쪽 위로 채운다.
 * 범위 밖 오른쪽·아래 칸의 값은 이미 맞다고 본다(그 칸들의 정사각형은 바뀐 칸과 겹치지 않는다).
 */
function fillRegion(
  layers: CellLayers,
  out: Uint8Array,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  const last = PLACEMENT_SIZE - 1;
  for (let y = y1; y >= y0; y--) {
    const row = y * PLACEMENT_SIZE;
    for (let x = x1; x >= x0; x--) {
      const index = row + x;
      if (!isOpenCell(layers, index)) {
        out[index] = 0;
        continue;
      }
      const right = x < last ? (out[index + 1] ?? 0) : 0;
      const down = y < last ? (out[index + PLACEMENT_SIZE] ?? 0) : 0;
      const diagonal = x < last && y < last ? (out[index + PLACEMENT_SIZE + 1] ?? 0) : 0;
      const smallest =
        right < down ? (right < diagonal ? right : diagonal) : down < diagonal ? down : diagonal;
      out[index] = smallest + 1 < MAX_SIZE_CLASS ? smallest + 1 : MAX_SIZE_CLASS;
    }
  }
}
