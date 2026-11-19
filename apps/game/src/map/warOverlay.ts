// 1차맵 세력 전쟁·외교 전선과 도시 이름 우선순위 도우미 — 삼국지·4X 전략 지도처럼 전쟁 중인 국가 사이의 최단 전선 호,
// 교전 배지(⚔), 불가침·봉신 연결선, 수도·주요 도시 우선 이름표 배치를 프레임마다 가볍게 셈한다.
import type { PlanetProjector, ProjectedPoint } from "@terra/engine/planet";
import type { WorldMapCity, WorldMapFaction, WorldMapRelation } from "@terra/shared/worldMap";
import { pairKey } from "./territoryDraw.ts";

type LatLon = readonly [latDeg: number, lonDeg: number];

const DEG = Math.PI / 180;

const toUnit = (latDeg: number, lonDeg: number): readonly [number, number, number] => {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
};

const chordSq = (a: readonly [number, number, number], b: readonly [number, number, number]): number =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

const midpointLatLon = (a: LatLon, b: LatLon): LatLon => {
  const ua = toUnit(a[0], a[1]);
  const ub = toUnit(b[0], b[1]);
  const x = ua[0] + ub[0];
  const y = ua[1] + ub[1];
  const z = ua[2] + ub[2];
  const len = Math.hypot(x, y, z);
  if (len < 1e-6) return a;
  return [Math.asin(Math.max(-1, Math.min(1, z / len))) / DEG, Math.atan2(y, x) / DEG];
};

export interface DiplomacyArc {
  readonly key: string;
  readonly kind: "war" | "truce" | "vassal";
  readonly factionA: number;
  readonly factionB: number;
  readonly from: LatLon;
  readonly to: LatLon;
  /** 전선·외교 중심 위도·경도(카메라 전선 이동용) */
  readonly mid: LatLon;
}

export interface ProjectedWarClash {
  readonly key: string;
  readonly factionA: number;
  readonly factionB: number;
  readonly x: number;
  readonly y: number;
}

export interface ProjectedDiplomacyFrame {
  readonly warPath: string;
  readonly focusedWarPath: string;
  readonly trucePath: string;
  readonly vassalPath: string;
  readonly clashes: readonly ProjectedWarClash[];
}

/** 전쟁 중인 국가 쌍 열쇠 집합("작은ID:큰ID")과 국가별 전쟁 여부 */
export function warSetsOf(relations: readonly WorldMapRelation[] | undefined): {
  readonly pairs: Set<string>;
  readonly warringFactions: Set<number>;
  readonly wars: readonly WorldMapRelation[];
  readonly truces: readonly WorldMapRelation[];
} {
  const pairs = new Set<string>();
  const warringFactions = new Set<number>();
  const wars: WorldMapRelation[] = [];
  const truces: WorldMapRelation[] = [];
  for (const relation of relations ?? []) {
    if (relation.state === "war") {
      pairs.add(pairKey(relation.factionA, relation.factionB));
      warringFactions.add(relation.factionA);
      warringFactions.add(relation.factionB);
      wars.push(relation);
    } else if (relation.state === "truce") {
      truces.push(relation);
    }
  }
  return { pairs, warringFactions, wars, truces };
}

/** 두 국가 사이의 가장 가까운 두 도시(전선)를 찾는다 */
function closestCityPair(
  citiesA: readonly WorldMapCity[],
  citiesB: readonly WorldMapCity[],
): readonly [WorldMapCity, WorldMapCity] | null {
  let best: readonly [WorldMapCity, WorldMapCity] | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const a of citiesA) {
    const ua = toUnit(a.latDeg, a.lonDeg);
    for (const b of citiesB) {
      const dist = chordSq(ua, toUnit(b.latDeg, b.lonDeg));
      if (dist < bestDist) {
        bestDist = dist;
        best = [a, b];
      }
    }
  }
  return best;
}

/** 국가 대표 도시(수도 > 시작 도시 > 가장 등급 높은 도시) */
export function capitalCityOf(cities: readonly WorldMapCity[], factionId: number): WorldMapCity | null {
  let best: WorldMapCity | null = null;
  for (const city of cities) {
    if (city.factionId !== factionId) continue;
    if (!best) {
      best = city;
      continue;
    }
    const better =
      (city.capital === true && best.capital !== true) ||
      (city.capital === best.capital && city.start && !best.start) ||
      (city.capital === best.capital && city.start === best.start && (city.grade ?? 0) > (best.grade ?? 0));
    if (better) best = city;
  }
  return best;
}

/** 세력 외교 관계(전쟁·불가침·봉신) → 1차맵 연결 호 목록 */
export function buildDiplomacyArcs(
  cities: readonly WorldMapCity[],
  factions: readonly WorldMapFaction[],
  relations: readonly WorldMapRelation[] | undefined,
): DiplomacyArc[] {
  const byFaction = new Map<number, WorldMapCity[]>();
  for (const city of cities) {
    const list = byFaction.get(city.factionId) ?? [];
    list.push(city);
    byFaction.set(city.factionId, list);
  }
  const arcs: DiplomacyArc[] = [];
  for (const rel of relations ?? []) {
    const listA = byFaction.get(rel.factionA);
    const listB = byFaction.get(rel.factionB);
    if (!listA || !listB || listA.length === 0 || listB.length === 0) continue;
    const pair = closestCityPair(listA, listB);
    if (!pair) continue;
    const from: LatLon = [pair[0].latDeg, pair[0].lonDeg];
    const to: LatLon = [pair[1].latDeg, pair[1].lonDeg];
    arcs.push({
      key: `${rel.state}:${pairKey(rel.factionA, rel.factionB)}`,
      kind: rel.state,
      factionA: rel.factionA,
      factionB: rel.factionB,
      from,
      to,
      mid: midpointLatLon(from, to),
    });
  }
  for (const faction of factions) {
    if (faction.parentId == null) continue;
    const childCap = capitalCityOf(cities, faction.id);
    const parentCap = capitalCityOf(cities, faction.parentId);
    if (!childCap || !parentCap) continue;
    const from: LatLon = [parentCap.latDeg, parentCap.lonDeg];
    const to: LatLon = [childCap.latDeg, childCap.lonDeg];
    arcs.push({
      key: `vassal:${String(faction.parentId)}:${String(faction.id)}`,
      kind: "vassal",
      factionA: faction.parentId,
      factionB: faction.id,
      from,
      to,
      mid: midpointLatLon(from, to),
    });
  }
  return arcs;
}

const fmtCoord = (x: number, y: number): string => `${x.toFixed(1)} ${y.toFixed(1)}`;

/** 한 프레임의 전쟁 전선 호·교전 배지·외교 선을 투영한다 */
export function projectDiplomacyArcs(
  projector: PlanetProjector,
  arcs: readonly DiplomacyArc[],
  focusFactionId: number | null,
  showNonWar: boolean,
): ProjectedDiplomacyFrame {
  const { width, height } = projector.viewport;
  let warPath = "";
  let focusedWarPath = "";
  let trucePath = "";
  let vassalPath = "";
  const clashes: ProjectedWarClash[] = [];
  const margin = 80;
  for (const arc of arcs) {
    const involvesFocus =
      focusFactionId !== null && (arc.factionA === focusFactionId || arc.factionB === focusFactionId);
    if (arc.kind !== "war" && !showNonWar && !involvesFocus) continue;
    const a = projector.project(arc.from[0], arc.from[1]);
    const b = projector.project(arc.to[0], arc.to[1]);
    if (!a || !b || (!a.visible && !b.visible)) continue;
    const onScreen =
      (a.x >= -margin && a.x <= width + margin && a.y >= -margin && a.y <= height + margin) ||
      (b.x >= -margin && b.x <= width + margin && b.y >= -margin && b.y <= height + margin);
    if (!onScreen) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 6) continue;
    // 부드러운 곡선 호(위쪽·바깥쪽으로 살짝 휘어 전략 전선 느낌)
    const bow = Math.min(48, Math.max(12, len * 0.16));
    const nx = -dy / len;
    const ny = dx / len;
    const sign = ny <= 0 ? 1 : -1;
    const cx = (a.x + b.x) / 2 + nx * bow * sign;
    const cy = (a.y + b.y) / 2 + ny * bow * sign;
    const segment = `M${fmtCoord(a.x, a.y)}Q${fmtCoord(cx, cy)} ${fmtCoord(b.x, b.y)}`;
    if (arc.kind === "war") {
      if (involvesFocus) focusedWarPath += segment;
      else warPath += segment;
      // 곡선 정중앙(t = 0.5)에 ⚔ 교전 배지 자리
      const mx = 0.25 * a.x + 0.5 * cx + 0.25 * b.x;
      const my = 0.25 * a.y + 0.5 * cy + 0.25 * b.y;
      if (mx >= 16 && mx <= width - 16 && my >= 16 && my <= height - 16) {
        clashes.push({ key: arc.key, factionA: arc.factionA, factionB: arc.factionB, x: mx, y: my });
      }
    } else if (arc.kind === "truce") {
      trucePath += segment;
    } else {
      vassalPath += segment;
    }
  }
  return { warPath, focusedWarPath, trucePath, vassalPath, clashes };
}

/** 국가별 대체 기준점(수도 우선, 다음은 큰 도시 순) — 중심이 화면 밖일 때 국가 이름표가 사라지지 않게 */
export function factionFallbackAnchors(cities: readonly WorldMapCity[]): Map<number, LatLon[]> {
  const ordered = cities.toSorted(
    (a, b) =>
      Number(b.capital === true) - Number(a.capital === true) ||
      Number(b.start) - Number(a.start) ||
      (b.grade ?? 0) - (a.grade ?? 0) ||
      a.id - b.id,
  );
  const map = new Map<number, LatLon[]>();
  for (const city of ordered) {
    const list = map.get(city.factionId) ?? [];
    list.push([city.latDeg, city.lonDeg]);
    map.set(city.factionId, list);
  }
  return map;
}

/** 국가 규모 등급(도시 수 기준) — 큰 제국은 이름표를 한 단계 더 힘 있게 */
export function factionScaleOf(cityCount: number): "major" | "medium" | "minor" {
  if (cityCount >= 5) return "major";
  if (cityCount >= 3) return "medium";
  return "minor";
}

interface CityLabelEntry {
  readonly city: WorldMapCity;
  readonly point: ProjectedPoint;
  readonly count: number;
}

/**
 * 우선순위 기반 도시 이름표 고르기(수도·선택 도시·교전 도시가 먼저 이름을 띄우고 서로 안 겹치는 도시만 추가).
 * 예전처럼 가까운 두 도시가 서로 이름을 지워 버려 수도 이름까지 사라지는 문제를 없앤다.
 */
export function selectCityLabelIds(
  shown: readonly CityLabelEntry[],
  selectedCityId: number | null,
  nationLabelPoints: ReadonlyMap<number, { readonly x: number; readonly y: number }>,
): Set<number> {
  const priority = (entry: CityLabelEntry): number => {
    let score = entry.city.grade ?? 1;
    if (entry.city.id === selectedCityId) score += 1000;
    if (entry.city.capital) score += 200;
    if (entry.city.occupation && !entry.city.occupation.recent) score += 120;
    if (entry.city.start) score += 40;
    return score;
  };
  const sorted = shown.toSorted((a, b) => priority(b) - priority(a) || a.city.id - b.city.id);
  const kept: { readonly x: number; readonly y: number }[] = [];
  const visible = new Set<number>();
  const nationSpots = [...nationLabelPoints.values()];
  for (const entry of sorted) {
    if (entry.count !== 1) continue;
    const isSelected = entry.city.id === selectedCityId;
    if (!isSelected) {
      const labelY = entry.point.y + 18;
      const clashesCity = kept.some(
        (other) => Math.abs(other.x - entry.point.x) < 74 && Math.abs(other.y - labelY) < 22,
      );
      if (clashesCity) continue;
      // 일반 도시는 국가 이름표와 겹치면 양보(수도는 유지)
      if (!entry.city.capital) {
        const clashesNation = nationSpots.some(
          (spot) => Math.abs(spot.x - entry.point.x) < 62 && Math.abs(spot.y - labelY) < 22,
        );
        if (clashesNation) continue;
      }
    }
    visible.add(entry.city.id);
    kept.push({ x: entry.point.x, y: entry.point.y + 18 });
  }
  return visible;
}
