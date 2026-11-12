// 1차맵 영토 레이어에서 누른 곳의 국가 — 화면 표시용(판정 아님). ADR 2026-11-07-planet-view "바뀜 (2026-11-12)".
// 서버가 준 자료(world.cities: 아는 도시·영향권 반경, 아는 껍질)만 쓴다(안개 규칙 그대로 — 모르는 국가는 나오지 않는다).
// 차례는 서버 소속 규칙(@terra/shared/territory claimAt, ADR 2026-11-03-territory-layer 2절)과 같은 모양이다:
// 1. 도시 영향권 안이면 (거리 ÷ 반경)이 가장 작은 도시(같으면 작은 ID), 2. 아니면 그 점을 품은 껍질의 국가(여럿이면 첫 껍질).
// 위도·경도 실수 근사라 경계 몇 m 안에서는 서버 칸 표와 다를 수 있다(보기만 한다).
import type { WorldMapCity, WorldMapHull } from "@terra/shared/worldMap";

type Vec = readonly [number, number, number];

const toVec = (latDeg: number, lonDeg: number): Vec => {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
};
const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** 두 점 사이 각(라디안) */
const angleBetween = (a: Vec, b: Vec): number => Math.atan2(Math.hypot(...cross(a, b)), dot(a, b));

export interface TerritoryHit {
  readonly factionId: number;
  /** 영향권으로 잡힌 도시(껍질로 잡혔으면 그 국가의 가장 가까운 아는 도시, 없으면 null) */
  readonly cityId: number | null;
}

/** 볼록 껍질 안인지: 모든 변의 같은 쪽(삼중곱 부호가 모두 같다 — 꼭짓점 돌기 방향과 상관없이) */
function insideHull(point: Vec, hull: WorldMapHull): boolean {
  const corners = hull.points.map(([lat, lon]) => toVec(lat, lon));
  if (corners.length < 3) return false;
  const sides = corners.map((corner, index) =>
    dot(cross(corner, corners[(index + 1) % corners.length] ?? corner), point),
  );
  return sides.every((side) => side >= 0) || sides.every((side) => side <= 0);
}

/** 그 점의 국가(영토 밖이면 null). milliPerRadian = 영향권 반경 환산(0이면 영향권을 보지 않는다) */
export function territoryAt(
  latDeg: number,
  lonDeg: number,
  cities: readonly WorldMapCity[],
  hulls: readonly WorldMapHull[],
  milliPerRadian: number,
): TerritoryHit | null {
  const point = toVec(latDeg, lonDeg);
  let best: { city: WorldMapCity; ratio: number } | null = null;
  for (const city of cities) {
    const radius = milliPerRadian > 0 && city.radiusMilli ? city.radiusMilli / milliPerRadian : 0;
    if (radius <= 0) continue;
    const ratio = angleBetween(point, toVec(city.latDeg, city.lonDeg)) / radius;
    if (ratio > 1) continue;
    if (!best || ratio < best.ratio || (ratio === best.ratio && city.id < best.city.id))
      best = { city, ratio };
  }
  if (best) return { factionId: best.city.factionId, cityId: best.city.id };
  const hull = hulls.find((entry) => insideHull(point, entry));
  if (!hull) return null;
  let nearest: { id: number; angle: number } | null = null;
  for (const city of cities) {
    if (city.factionId !== hull.factionId) continue;
    const angle = angleBetween(point, toVec(city.latDeg, city.lonDeg));
    if (!nearest || angle < nearest.angle) nearest = { id: city.id, angle };
  }
  return { factionId: hull.factionId, cityId: nearest?.id ?? null };
}
