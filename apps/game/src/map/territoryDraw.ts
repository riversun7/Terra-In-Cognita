// 1차맵 영토 프레임 그리기 — 영토 모양(territoryShapes.ts, 위도·경도 고리)을 엔진 투영기로 화면 SVG 경로·국가 이름표 자리로 바꾼다.
// CityOverlay가 엔진 프레임마다 부른다(React 상태를 바꾸지 않는다, PLAN 5.7). ADR 2026-11-07-planet-view "바뀜 (2026-11-14)".
// - 국가 덩이마다 가운데와 가장 먼 고리 점을 먼저 투영해 화면 반지름을 잰다: 지평선 너머·카메라 뒤·화면 밖이면 그 덩이를 건너뛰고,
//   화면 반지름이 작으면 고리 점을 솎는다.
// - 국가가 화면에서 MIN_BLOB_PX보다 작으면(1단계 행성 전체에서 도시 하나 국가 등) 그 국가 이름표 자리에 그 크기 둥근 표시를 칠한다
//   (질문 1437 답 "1~3단계에서도 영토가 보이게"). 실제 넓이가 아니라 보기 표시다.
// - 고리 점 하나라도 카메라 뒤(null)면 그 고리는 그리지 않는다(가까이 기울인 보기에서 화면 아래 밖에만 생긴다).
import type { PlanetProjector, ProjectedPoint } from "@terra/engine/planet";
import type { TerritoryLabelSpot, TerritoryShapes } from "./territoryShapes.ts";

type LatLon = readonly [latDeg: number, lonDeg: number];

/** 화면 밖 여유(반지름 몫) */
const CULL_MARGIN = 1.2;
/** 국가가 이보다 작게 보이면 이 반지름(px) 둥근 표시로 칠한다 */
export const MIN_BLOB_PX = 12;
/** 이름표 사이 여유(px) */
const LABEL_GAP_PX = 4;
/** 도시 표시 둘레 피할 반지름(px, 표시 점 + 테두리) */
const MARKER_AVOID_PX = 12;

/** 화면 반지름(px) → 고리 점 솎기 간격 */
export function vertexStep(radiusPx: number): number {
  if (radiusPx < 12) return 4;
  if (radiusPx < 40) return 2;
  return 1;
}

export interface TerritoryFrame {
  /** 국가 → 영토 경로(칠·테두리 같은 경로, evenodd) */
  readonly fills: Map<number, string>;
  /** 두 국가가 맞닿은 선(받침) */
  readonly dividers: string;
  /** 그린 국가 덩이 수와 둥근 표시로 그린 국가 수(시험·측정용) */
  readonly areas: number;
  readonly blobs: number;
}

const fmt = (point: ProjectedPoint): string => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`;

/** 점들을 투영해 닫힌 또는 열린 경로 조각. 하나라도 카메라 뒤면 빈 문자열 */
function pathOf(
  projector: PlanetProjector,
  points: readonly LatLon[],
  step: number,
  closed: boolean,
): string {
  let path = "";
  const last = points.length - 1;
  for (let index = 0; index <= last; index++) {
    // 솎을 때도 열린 선의 끝점은 남긴다
    if (index % step !== 0 && (closed || index !== last)) continue;
    const [lat, lon] = points[index] ?? [0, 0];
    const point = projector.project(lat, lon);
    if (!point) return "";
    path += `${path === "" ? "M" : "L"}${fmt(point)}`;
  }
  if (path === "") return "";
  return closed ? `${path}Z` : path;
}

/** 화면 점 둘레 둥근 표시 경로 */
const blobPath = (x: number, y: number, r: number): string =>
  `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;

const append = (map: Map<number, string>, key: number, part: string): void => {
  if (part !== "") map.set(key, (map.get(key) ?? "") + part);
};

/** 영토 모양을 이 프레임의 화면 경로로 */
export function projectTerritory(projector: PlanetProjector, shapes: TerritoryShapes): TerritoryFrame {
  const { width, height } = projector.viewport;
  const fills = new Map<number, string>();
  // 국가마다 화면에서 가장 큰 덩이 반지름(px)
  const biggest = new Map<number, number>();
  let drawn = 0;
  for (const area of shapes.areas) {
    const middle = projector.project(area.center[0], area.center[1]);
    const edge = projector.project(area.rim[0], area.rim[1]);
    if (!middle?.visible || !edge) continue;
    const radius = Math.hypot(edge.x - middle.x, edge.y - middle.y);
    biggest.set(area.factionId, Math.max(biggest.get(area.factionId) ?? 0, radius));
    const reach = radius * CULL_MARGIN + MIN_BLOB_PX;
    if (middle.x + reach < 0 || middle.x - reach > width || middle.y + reach < 0 || middle.y - reach > height)
      continue;
    if (radius < MIN_BLOB_PX) continue;
    const step = vertexStep(radius);
    for (const loop of area.loops) append(fills, area.factionId, pathOf(projector, loop, step, true));
    drawn += 1;
  }
  // 작게 보이는 국가: 이름표 자리에 둥근 표시
  let blobs = 0;
  for (const spot of shapes.labels) {
    if ((biggest.get(spot.factionId) ?? 0) >= MIN_BLOB_PX) continue;
    const point = projector.project(spot.latDeg, spot.lonDeg);
    if (!point?.visible) continue;
    if (
      point.x < -MIN_BLOB_PX ||
      point.x > width + MIN_BLOB_PX ||
      point.y < -MIN_BLOB_PX ||
      point.y > height + MIN_BLOB_PX
    )
      continue;
    append(fills, spot.factionId, blobPath(point.x, point.y, MIN_BLOB_PX));
    blobs += 1;
  }
  let dividers = "";
  for (const line of shapes.dividers) dividers += pathOf(projector, line, 1, false);
  return { fills, dividers, areas: drawn, blobs };
}

/** 이름표 크기(px) */
export interface LabelSize {
  readonly width: number;
  readonly height: number;
}

interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

const overlaps = (a: Box, b: Box): boolean =>
  a.left < b.right + LABEL_GAP_PX &&
  b.left < a.right + LABEL_GAP_PX &&
  a.top < b.bottom + LABEL_GAP_PX &&
  b.top < a.bottom + LABEL_GAP_PX;

/**
 * 국가 이름표 자리(이름표 가운데 화면 점). 넓은 국가부터(spots 차례) 후보 자리(가운데 → 위 → 아래 → 두 칸 위·아래 → 오른쪽 → 왼쪽) 가운데 다른 이름표·피할 점(보이는 도시
 * 표시)과 겹치지 않고 화면 안인 첫 자리, 그런 자리가 없으면 표시와만 겹치는 가운데. 다른 이름표와 늘 겹치면 넣지 않는다(감춘다)
 */
export function placeLabels(
  projector: PlanetProjector,
  spots: readonly TerritoryLabelSpot[],
  sizes: ReadonlyMap<number, LabelSize>,
  avoid: readonly { readonly x: number; readonly y: number }[],
): Map<number, { x: number; y: number }> {
  const { width, height } = projector.viewport;
  const markers: Box[] = avoid.map((point) => ({
    left: point.x - MARKER_AVOID_PX,
    right: point.x + MARKER_AVOID_PX,
    top: point.y - MARKER_AVOID_PX,
    bottom: point.y + MARKER_AVOID_PX,
  }));
  const labels: Box[] = [];
  const placed = new Map<number, { x: number; y: number }>();
  for (const spot of spots) {
    const size = sizes.get(spot.factionId);
    if (!size || size.width <= 0) continue;
    const point = projector.project(spot.latDeg, spot.lonDeg);
    if (!point?.visible) continue;
    const boxAt = (x: number, y: number): Box => ({
      left: x - size.width / 2,
      right: x + size.width / 2,
      top: y - size.height / 2,
      bottom: y + size.height / 2,
    });
    const inside = (box: Box): boolean =>
      box.left >= 0 && box.top >= 0 && box.right <= width && box.bottom <= height;
    const free = (box: Box): boolean => inside(box) && !labels.some((other) => overlaps(box, other));
    // 가운데·위·아래(두 칸까지)·오른쪽·왼쪽 가운데 도시 표시도 피하는 첫 자리, 없으면 가운데(표시 위에 겹쳐도 — 표시가 이름표 위에 그려진다)
    const stepY = size.height + MARKER_AVOID_PX;
    const stepX = size.width / 2 + MARKER_AVOID_PX * 2;
    const candidates = [
      boxAt(point.x, point.y),
      ...[-1, 1, -2, 2].map((shift) => boxAt(point.x, point.y + shift * stepY)),
      boxAt(point.x + stepX, point.y),
      boxAt(point.x - stepX, point.y),
    ];
    const chosen =
      candidates.find((box) => free(box) && !markers.some((marker) => overlaps(box, marker))) ??
      candidates.find((box, index) => index === 0 && free(box));
    if (!chosen) continue;
    placed.set(spot.factionId, { x: (chosen.left + chosen.right) / 2, y: (chosen.top + chosen.bottom) / 2 });
    labels.push(chosen);
  }
  return placed;
}
