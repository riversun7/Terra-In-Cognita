// 1차맵 영토 프레임 그리기 — 영토 모양(territoryShapes.ts, 위도·경도)을 엔진 투영기로 화면 SVG 경로·국가 이름표 자리로 바꾼다.
// CityOverlay가 엔진 프레임마다 부른다(React 상태를 바꾸지 않는다, PLAN 5.7). ADR 2026-11-07-planet-view "바뀜 (2026-11-14)".
// - 도시마다 가운데와 원 첫 꼭짓점을 먼저 투영해 화면 반지름을 잰다: 지평선 너머·카메라 뒤·화면 밖·1px 미만이면 그 도시 원·이긴 조각·
//   테두리를 모두 건너뛴다. 화면 반지름이 작으면 꼭짓점을 솎는다(48 → 24·12·6) — 1단계(행성 전체)에서 도시 50곳이 몇 px씩이다.
// - 꼭짓점 하나라도 카메라 뒤(null)면 그 다각형은 그리지 않는다(가까이 기울인 보기에서 화면 아래 밖에만 생긴다).
import type { PlanetProjector, ProjectedPoint } from "@terra/engine/planet";
import type { TerritoryLabelSpot, TerritoryShapes } from "./territoryShapes.ts";

type LatLon = readonly [latDeg: number, lonDeg: number];

/** 이 화면 반지름(px)보다 작은 원은 그리지 않는다 */
const MIN_RADIUS_PX = 1;
/** 화면 밖 여유(반지름 몫) */
const CULL_MARGIN = 1.2;
/** 테두리를 긋는 가장 작은 화면 반지름(px) — 더 작으면 칠만 */
const MIN_EDGE_PX = 3;
/** 이름표 사이 여유(px) */
const LABEL_GAP_PX = 4;
/** 도시 표시 둘레 피할 반지름(px, 표시 점 + 테두리) */
const MARKER_AVOID_PX = 12;

/** 화면 반지름(px) → 꼭짓점 솎기 간격(48각형 기준 48·24·12·6 꼭짓점) */
export function vertexStep(radiusPx: number): number {
  if (radiusPx < 4) return 8;
  if (radiusPx < 10) return 4;
  if (radiusPx < 24) return 2;
  return 1;
}

export interface TerritoryFrame {
  /** 국가 → 원 바탕 경로 */
  readonly base: Map<number, string>;
  /** 국가 → 이긴 조각 경로(바탕 위) */
  readonly wins: Map<number, string>;
  /** 국가 → 테두리 경로(열린 꺾은선들) */
  readonly edges: Map<number, string>;
  /** 두 국가가 맞닿은 선만(국가 색 선 밑에 깔 받침) */
  readonly dividers: string;
  /** 그린 도시 수(시험·측정용) */
  readonly cities: number;
}

const fmt = (point: ProjectedPoint): string => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`;

/** 점들을 투영해 닫힌(closed) 또는 열린 경로 조각. 하나라도 카메라 뒤면 빈 문자열 */
function pathOf(
  projector: PlanetProjector,
  points: readonly LatLon[],
  step: number,
  closed: boolean,
): string {
  let path = "";
  const last = points.length - 1;
  for (let index = 0; index <= last; index++) {
    // 솎을 때도 열린 선의 끝점은 남긴다(이웃 선과 이어지게)
    if (index % step !== 0 && (closed || index !== last)) continue;
    const [lat, lon] = points[index] ?? [0, 0];
    const point = projector.project(lat, lon);
    if (!point) return "";
    path += `${path === "" ? "M" : "L"}${fmt(point)}`;
  }
  if (path === "") return "";
  return closed ? `${path}Z` : path;
}

const append = (map: Map<number, string>, key: number, part: string): void => {
  if (part !== "") map.set(key, (map.get(key) ?? "") + part);
};

/** 영토 모양을 이 프레임의 화면 경로로. centers = 도시 ID → 가운데 위도·경도 */
export function projectTerritory(
  projector: PlanetProjector,
  shapes: TerritoryShapes,
  centers: ReadonlyMap<number, LatLon>,
): TerritoryFrame {
  const { width, height } = projector.viewport;
  // 도시마다 화면 반지름(px). 없으면 이 프레임에 그리지 않는다
  const radiusOf = new Map<number, number>();
  for (const circle of shapes.circles) {
    const center = centers.get(circle.cityId);
    const rim = circle.points[0];
    if (!center || !rim) continue;
    const middle = projector.project(center[0], center[1]);
    const edge = projector.project(rim[0], rim[1]);
    if (!middle?.visible || !edge) continue;
    const radius = Math.hypot(edge.x - middle.x, edge.y - middle.y);
    const reach = radius * CULL_MARGIN;
    if (radius < MIN_RADIUS_PX) continue;
    if (middle.x + reach < 0 || middle.x - reach > width || middle.y + reach < 0 || middle.y - reach > height)
      continue;
    radiusOf.set(circle.cityId, radius);
  }
  const base = new Map<number, string>();
  const wins = new Map<number, string>();
  const edges = new Map<number, string>();
  let dividers = "";
  for (const circle of shapes.circles) {
    const radius = radiusOf.get(circle.cityId);
    if (radius === undefined) continue;
    append(base, circle.factionId, pathOf(projector, circle.points, vertexStep(radius), true));
  }
  for (const piece of shapes.wins) {
    // 이긴 조각은 자른 꼭짓점이 섞여 솎지 않는다(다른 국가 원과 겹친 도시만이라 적다)
    if (radiusOf.has(piece.cityId)) append(wins, piece.factionId, pathOf(projector, piece.points, 1, true));
  }
  for (const border of shapes.borders) {
    const radius = radiusOf.get(border.cityId);
    if (radius === undefined || radius < MIN_EDGE_PX) continue;
    const part = pathOf(projector, border.points, vertexStep(radius), false);
    for (const faction of border.factions) append(edges, faction, part);
    if (border.factions.length > 1) dividers += part;
  }
  return { base, wins, edges, dividers, cities: radiusOf.size };
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
 * 국가 이름표 자리(이름표 가운데 화면 점). 넓은 국가부터(spots 차례) 가운데 → 위 → 아래 → 두 칸 위·아래 자리 가운데 다른 이름표·피할 점(보이는 도시
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
    const boxAt = (y: number): Box => ({
      left: point.x - size.width / 2,
      right: point.x + size.width / 2,
      top: y - size.height / 2,
      bottom: y + size.height / 2,
    });
    const inside = (box: Box): boolean =>
      box.left >= 0 && box.top >= 0 && box.right <= width && box.bottom <= height;
    const free = (box: Box): boolean => inside(box) && !labels.some((other) => overlaps(box, other));
    // 가운데·위·아래(두 칸까지) 가운데 도시 표시도 피하는 첫 자리, 없으면 가운데(표시 위에 겹쳐도 — 표시가 이름표 위에 그려진다)
    const candidates = [0, -1, 1, -2, 2].map((shift) =>
      boxAt(point.y + shift * (size.height + MARKER_AVOID_PX)),
    );
    const chosen =
      candidates.find((box) => free(box) && !markers.some((marker) => overlaps(box, marker))) ??
      candidates.find((box, index) => index === 0 && free(box));
    if (!chosen) continue;
    placed.set(spot.factionId, { x: point.x, y: (chosen.top + chosen.bottom) / 2 });
    labels.push(chosen);
  }
  return placed;
}
