// 근처 목록 계산 — 순수 함수(시험 대상, 엔진·React 없음). docs/adr/2026-11-08-seamless-second-map.md WP-2.
// 기준점(기준 유닛의 지금 자리, 배치 칸)에서 가까운 차례로 줄을 세운다. 거리가 같으면 작은 ID 먼저(늘 같은 차례).
import type { BuildingFootprint } from "@terra/engine";

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Ranked<T> {
  readonly item: T;
  /** 기준점에서 거리(배치 칸) */
  readonly cells: number;
}

/** items를 기준점에서 가까운 차례로(limit개까지, 없으면 전부). at이 null이면 원래 차례 그대로(거리 0) */
export function rankByDistance<T>(
  items: readonly T[],
  at: Point | null,
  pointOf: (item: T) => Point,
  idOf: (item: T) => number,
  limit = Number.POSITIVE_INFINITY,
): Ranked<T>[] {
  const ranked = items.map((item) => {
    if (!at) return { item, cells: 0 };
    const point = pointOf(item);
    return { item, cells: Math.hypot(point.x - at.x, point.y - at.y) };
  });
  if (at) ranked.sort((a, b) => a.cells - b.cells || idOf(a.item) - idOf(b.item));
  return ranked.slice(0, limit);
}

/** 건물 차지 칸의 가운데(돌림을 본다, 배치 칸) */
export function buildingCentre(building: BuildingFootprint): Point {
  const quarter = building.rotation === 1 || building.rotation === 3;
  const width = quarter ? building.depth : building.width;
  const height = quarter ? building.width : building.depth;
  return { x: building.cellX + width / 2, y: building.cellY + height / 2 };
}

/** 오브젝트 칸의 가운데(배치 칸) */
export const objectCentre = (object: { readonly x: number; readonly y: number }): Point => ({
  x: object.x + 0.5,
  y: object.y + 0.5,
});

/** 거리(m) 글자 값: 1km 아래는 정수 m, 넘으면 km 소수 한 자리. 칸 크기를 모르면(0) null */
export function distanceParts(
  cells: number,
  cellM: number,
): { readonly unit: "m" | "km"; readonly value: number } | null {
  if (!(cellM > 0)) return null;
  const metres = cells * cellM;
  if (metres < 1000) return { unit: "m", value: Math.round(metres) };
  return { unit: "km", value: Math.round(metres / 100) / 10 };
}

/** 목록 끝 가까이 내렸나(더 보이기) — 끝에서 slack px 안 */
export function nearListEnd(
  element: { readonly scrollTop: number; readonly clientHeight: number; readonly scrollHeight: number },
  slack = 24,
): boolean {
  return element.scrollTop + element.clientHeight >= element.scrollHeight - slack;
}
