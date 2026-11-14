// 1차맵 영토 모양 — 도시마다 영향권 원, 국가마다 원들의 합, 다른 국가 원이 겹친 곳은 두 도시의 가운데가 경계(사용자 결정 2026-11-14,
// ADR 2026-11-07-planet-view "바뀜 (2026-11-14)"). 화면 표시용(판정 아님) 순수 계산 — 시험 대상, three.js·DOM을 쓰지 않는다.
//
// 주인 규칙: 점 p의 주인 = 원이 p를 덮는 도시 가운데 p에서 가장 가까운 도시(같으면 작은 ID). 그래서
// - 한 원만 덮는 땅은 그 원의 것(겹치지 않은 곳은 원 그대로 — 큰 원 안 작은 도시도 제 원을 지킨다),
// - 두 원이 덮는 땅(렌즈)은 두 도시의 수직 이등분선(가운데)이 가른다. 국가 영토 = 그 국가 도시가 주인인 땅(둘로 갈릴 수 있다).
// 그리는 법(칠): 한 묶음(불투명 칠 + 묶음 투명도) 안에서 ① 원 바탕(반지름 큰 차례) ② 다른 국가 원과 겹친 도시만 "이긴 조각"
// (원 ∩ 겹친 다른 국가 도시마다 이 도시 쪽 반구 = 볼록)을 위에 덧칠한다. 이긴 조각은 늘 맞는 색이고, 이긴 조각 밖은 대개 덮는 원이
// 하나라 바탕이 맞다(셋 이상이 얽힌 드문 곳만 바탕 차례를 따른다). 테두리는 원의 변·이긴 조각의 자른 변을 잘게 나눠, 양쪽 주인의
// 국가가 다른 곳(국가 경계·바깥 둘레)만 긋는다 — 같은 국가 원끼리 겹친 안쪽 호는 긋지 않는다.
// 3차원 단위 벡터로만 셈하므로 행성 면(정육면체 면)·경도 ±180°·극에서 이음매가 없다. 화면에는 꼭짓점의 위도·경도를 하나씩 투영한다.
// 반경 = 도시 배후지 반경(서버 world.cities catchmentMilli, ADR 2026-11-11-city-catchment), 없으면 영향권 반경(radiusMilli, D-104).
import type { WorldMapCity } from "@terra/shared/worldMap";

type Vec = readonly [number, number, number];
type LatLon = readonly [latDeg: number, lonDeg: number];

const DEG = Math.PI / 180;
/** 원 하나를 그리는 꼭짓점 수(48각형 — 화면 반지름 100px에서 호와 줄의 틈 0.2px) */
export const TERRITORY_SEGMENTS = 48;
/** 테두리를 가를 때 변 하나를 나누는 수(겹친 원만) */
const BORDER_SPLITS = 4;
/** 테두리 양쪽을 볼 거리(반지름에 견준 몫) — 48각형 변이 원보다 안쪽으로 들어간 몫(0.2%)보다 커야 한다 */
const SIDE_OFFSET = 0.02;
/** 각 반지름 위 끝 */
const MAX_RADIUS = Math.PI / 2 - 1e-6;

const toVec = (latDeg: number, lonDeg: number): Vec => {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
};
const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k, a[2] * k];
const lerp = (a: Vec, b: Vec, t: number): Vec => add(a, scale(sub(b, a), t));
const norm = (a: Vec): number => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec): Vec => {
  const length = norm(a);
  return length > 0 ? scale(a, 1 / length) : a;
};
const latLonOf = (v: Vec): LatLon => {
  const length = norm(v) || 1;
  return [Math.asin(Math.max(-1, Math.min(1, v[2] / length))) / DEG, Math.atan2(v[1], v[0]) / DEG];
};
/** 두 방향 사이 각(라디안, 길이 무관) */
const angleBetween = (a: Vec, b: Vec): number => Math.atan2(norm(cross(a, b)), dot(a, b));

/** 영토를 그릴 도시 하나 */
export interface TerritorySite {
  readonly id: number;
  readonly factionId: number;
  readonly latDeg: number;
  readonly lonDeg: number;
  /** 원의 각 반지름(라디안, 0보다 크다) */
  readonly radius: number;
}

/** 칠할 다각형(꼭짓점 위도·경도, 볼록) */
export interface TerritoryPolygon {
  readonly cityId: number;
  readonly factionId: number;
  readonly points: readonly LatLon[];
}

/** 테두리 꺾은선 하나: 양쪽 주인 국가가 다른 곳. factions = 맞닿은 국가(바깥 둘레면 하나, 국가 경계면 둘) */
export interface TerritoryBorder {
  /** 이 선이 나온 도시(화면 밖 도시를 건너뛸 때 쓴다) */
  readonly cityId: number;
  readonly factions: readonly number[];
  readonly points: readonly LatLon[];
}

/** 국가 이름표 자리: 그 국가 원들의 넓이 가중 가운데 */
export interface TerritoryLabelSpot {
  readonly factionId: number;
  readonly latDeg: number;
  readonly lonDeg: number;
  /** 단위 구 위 넓이(스테라디안) — 이름표가 겹치면 넓은 국가가 남는다 */
  readonly area: number;
}

export interface TerritoryShapes {
  /** 원 바탕(반지름 큰 차례 — 작은 원이 위) */
  readonly circles: readonly TerritoryPolygon[];
  /** 다른 국가 원과 겹친 도시의 이긴 조각(바탕 위에 덧칠) */
  readonly wins: readonly TerritoryPolygon[];
  readonly borders: readonly TerritoryBorder[];
  readonly labels: readonly TerritoryLabelSpot[];
}

/**
 * 서버 도시 목록 → 영토 도시. 반경 = 배후지(catchmentMilli), 없으면 영향권(radiusMilli). 1000분율 칸 → 라디안 = 값 ÷ milliPerRadian.
 * 반경·환산이 없으면 그 도시는 영토를 그리지 않는다
 */
export function territorySitesOf(
  cities: readonly WorldMapCity[],
  milliPerRadian: number | undefined,
): TerritorySite[] {
  if (!milliPerRadian || milliPerRadian <= 0) return [];
  const sites: TerritorySite[] = [];
  for (const city of cities) {
    const milli = city.catchmentMilli ?? city.radiusMilli;
    if (!milli || milli <= 0) continue;
    sites.push({
      id: city.id,
      factionId: city.factionId,
      latDeg: city.latDeg,
      lonDeg: city.lonDeg,
      radius: Math.min(MAX_RADIUS, milli / milliPerRadian),
    });
  }
  return sites;
}

interface Prepared {
  readonly site: TerritorySite;
  readonly center: Vec;
  readonly radius: number;
}

const prepare = (sites: readonly TerritorySite[]): Prepared[] =>
  sites
    .filter((site) => Number.isFinite(site.radius) && site.radius > 0)
    .toSorted((a, b) => a.id - b.id)
    .map((site) => ({
      site,
      center: toVec(site.latDeg, site.lonDeg),
      radius: Math.min(MAX_RADIUS, site.radius),
    }));

/** 후보 가운데 p의 주인(원이 덮고 가장 가까운 도시, 같으면 작은 ID — 후보는 ID 차례). 없으면 undefined */
function ownerAmong(candidates: readonly Prepared[], p: Vec): Prepared | undefined {
  let best: Prepared | undefined;
  let bestAngle = Number.POSITIVE_INFINITY;
  for (const entry of candidates) {
    const angle = angleBetween(p, entry.center);
    if (angle > entry.radius) continue;
    if (angle < bestAngle) {
      best = entry;
      bestAngle = angle;
    }
  }
  return best;
}

/** 점의 주인 도시(원이 덮지 않으면 null). 그리기와 같은 규칙 — 누른 곳의 국가(territoryPick.ts)가 쓴다 */
export function territoryOwner(
  latDeg: number,
  lonDeg: number,
  sites: readonly TerritorySite[],
): TerritorySite | null {
  return ownerAmong(prepare(sites), toVec(latDeg, lonDeg))?.site ?? null;
}

/** 꼭짓점과, 그 꼭짓점에서 다음 꼭짓점으로 가는 변의 출처(-1 = 원의 호, 아니면 자른 도시의 차례) */
interface Corner {
  readonly p: Vec;
  readonly edge: number;
}

/** 원을 다각형으로(꼭짓점은 단위 벡터) */
function capPolygon(entry: Prepared, segments: number): Corner[] {
  const a = entry.center;
  // a에 수직인 두 축(극 근처에서도 안정하게 덜 평행한 축으로)
  const helper: Vec = Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = unit(cross(helper, a));
  const v = cross(a, u);
  const sin = Math.sin(entry.radius);
  const cos = Math.cos(entry.radius);
  const corners: Corner[] = [];
  for (let index = 0; index < segments; index++) {
    const angle = (2 * Math.PI * index) / segments;
    const offset = add(scale(u, Math.cos(angle) * sin), scale(v, Math.sin(angle) * sin));
    corners.push({ p: add(scale(a, cos), offset), edge: -1 });
  }
  return corners;
}

/** 다각형을 평면 p·n ≥ 0 쪽으로 자른다(서덜랜드–호지먼). 새로 생긴 변(평면 위)의 출처 = by */
function clipPolygon(corners: readonly Corner[], n: Vec, by: number): Corner[] {
  const out: Corner[] = [];
  const count = corners.length;
  for (let index = 0; index < count; index++) {
    const current = corners[index];
    const next = corners[(index + 1) % count];
    if (!current || !next) continue;
    const dc = dot(current.p, n);
    const dn = dot(next.p, n);
    const inside = dc >= 0;
    if (inside) out.push(current);
    if (inside !== dn >= 0) {
      // 안 → 밖: 교점에서 다음 들어오는 점까지가 평면 위 변. 밖 → 안: 교점에서 다음 점까지는 원래 변의 남은 몫
      out.push({ p: lerp(current.p, next.p, dc / (dc - dn)), edge: inside ? by : current.edge });
    }
  }
  return out;
}

/** 변 위 점 q(변 방향 along)의 양쪽 주인 국가(덮지 않으면 null) */
function sidesAt(
  candidates: readonly Prepared[],
  q: Vec,
  along: Vec,
  offset: number,
): [number | null, number | null] {
  const side = scale(unit(cross(q, along)), offset);
  const left = ownerAmong(candidates, add(q, side));
  const right = ownerAmong(candidates, sub(q, side));
  return [left?.site.factionId ?? null, right?.site.factionId ?? null];
}

/** 열린 꺾은선들을 모으는 도우미: 같은 국가 묶음이 이어지면 한 선으로 */
function borderCollector(cityId: number, out: TerritoryBorder[]) {
  let points: Vec[] = [];
  let key = "";
  let factions: number[] = [];
  const flush = (): void => {
    if (points.length >= 2) out.push({ cityId, factions, points: points.map(latLonOf) });
    points = [];
    key = "";
  };
  return {
    /** a → b 조각이 테두리면 이어 붙이고, 아니면 지금 선을 끝낸다 */
    segment(a: Vec, b: Vec, sides: readonly [number | null, number | null]): void {
      const [left, right] = sides;
      if (left === right) {
        flush();
        return;
      }
      const list = [left, right].filter((value): value is number => value !== null).toSorted((x, y) => x - y);
      const next = list.join(",");
      if (next !== key || points.length === 0) {
        flush();
        key = next;
        factions = list;
        points = [a];
      }
      points.push(b);
    },
    flush,
  };
}

/** 볼록 다각형의 넓이(평면 부채꼴 어림)와 넓이 가중 가운데(길이는 정하지 않은 방향) */
function areaAndCentroid(points: readonly Vec[]): { area: number; centroid: Vec } {
  const first = points[0];
  if (!first || points.length < 3) return { area: 0, centroid: [0, 0, 0] };
  let area = 0;
  let centroid: Vec = [0, 0, 0];
  for (let index = 1; index + 1 < points.length; index++) {
    const b = points[index];
    const c = points[index + 1];
    if (!b || !c) continue;
    const triangle = norm(cross(sub(b, first), sub(c, first))) / 2;
    area += triangle;
    centroid = add(centroid, scale(add(add(first, b), c), triangle / 3));
  }
  return { area, centroid };
}

/** 도시들의 원 바탕·이긴 조각·테두리·국가 이름표 자리. 겹치지 않는 두 원은 서로 보지 않는다(셈을 줄인다 — 결과는 같다) */
export function buildTerritoryShapes(
  sites: readonly TerritorySite[],
  segments = TERRITORY_SEGMENTS,
): TerritoryShapes {
  const prepared = prepare(sites);
  // 겹치는(닿는) 원 목록 — 자기 포함, ID 차례
  const near = prepared.map((entry) =>
    prepared.filter(
      (other) => other === entry || angleBetween(entry.center, other.center) < entry.radius + other.radius,
    ),
  );
  const circles: TerritoryPolygon[] = [];
  const wins: TerritoryPolygon[] = [];
  const borders: TerritoryBorder[] = [];
  const byFaction = new Map<number, { area: number; centroid: Vec }>();
  prepared.forEach((entry, index) => {
    const candidates = near[index] ?? [entry];
    const ring = capPolygon(entry, segments);
    const ringPoints = ring.map((corner) => corner.p);
    circles.push({
      cityId: entry.site.id,
      factionId: entry.site.factionId,
      points: ringPoints.map(latLonOf),
    });
    const { area, centroid } = areaAndCentroid(ringPoints);
    const sum = byFaction.get(entry.site.factionId) ?? { area: 0, centroid: [0, 0, 0] };
    byFaction.set(entry.site.factionId, { area: sum.area + area, centroid: add(sum.centroid, centroid) });

    // 테두리(원의 변): 겹친 원이 없으면 원 둘레 전체가 바깥 둘레
    const offset = entry.radius * SIDE_OFFSET;
    const collect = borderCollector(entry.site.id, borders);
    const alone = candidates.length === 1;
    for (let corner = 0; corner < segments; corner++) {
      const a = ringPoints[corner];
      const b = ringPoints[(corner + 1) % segments];
      if (!a || !b) continue;
      if (alone) {
        collect.segment(a, b, [entry.site.factionId, null]);
        continue;
      }
      for (let part = 0; part < BORDER_SPLITS; part++) {
        const from = lerp(a, b, part / BORDER_SPLITS);
        const to = lerp(a, b, (part + 1) / BORDER_SPLITS);
        collect.segment(from, to, sidesAt(candidates, lerp(from, to, 0.5), sub(to, from), offset));
      }
    }
    collect.flush();

    // 이긴 조각: 다른 국가 원과 겹치면 그 도시들과의 가운데로 자른 원
    const rivals = candidates.filter((other) => other.site.factionId !== entry.site.factionId);
    if (rivals.length === 0) return;
    let corners: Corner[] = ring;
    for (const rival of rivals) {
      const n = sub(entry.center, rival.center);
      if (norm(n) < 1e-12) {
        // 같은 자리: 작은 ID만 남는다
        if (rival.site.id < entry.site.id) corners = [];
        continue;
      }
      corners = clipPolygon(corners, n, prepared.indexOf(rival));
      if (corners.length < 3) break;
    }
    if (corners.length < 3) return;
    wins.push({
      cityId: entry.site.id,
      factionId: entry.site.factionId,
      points: corners.map((c) => latLonOf(c.p)),
    });
    // 테두리(자른 변 = 가운데 선): 렌즈 밖으로 나간 몫은 양쪽이 같은 주인이라 빠진다
    const cut = borderCollector(entry.site.id, borders);
    const cutOffset = Math.min(entry.radius, ...rivals.map((rival) => rival.radius)) * SIDE_OFFSET;
    corners.forEach((corner, at) => {
      const next = corners[(at + 1) % corners.length];
      if (corner.edge < 0 || !next) {
        cut.flush();
        return;
      }
      const splits = BORDER_SPLITS * 2;
      for (let part = 0; part < splits; part++) {
        const from = lerp(corner.p, next.p, part / splits);
        const to = lerp(corner.p, next.p, (part + 1) / splits);
        cut.segment(from, to, sidesAt(candidates, lerp(from, to, 0.5), sub(to, from), cutOffset));
      }
    });
    cut.flush();
  });
  circles.sort((a, b) => {
    const ra = prepared.find((entry) => entry.site.id === a.cityId)?.radius ?? 0;
    const rb = prepared.find((entry) => entry.site.id === b.cityId)?.radius ?? 0;
    return rb - ra || a.cityId - b.cityId;
  });
  const labels: TerritoryLabelSpot[] = [];
  for (const [factionId, sum] of byFaction) {
    if (sum.area <= 0) continue;
    const [latDeg, lonDeg] = latLonOf(sum.centroid);
    labels.push({ factionId, latDeg, lonDeg, area: sum.area });
  }
  labels.sort((a, b) => b.area - a.area || a.factionId - b.factionId);
  return { circles, wins, borders, labels };
}
