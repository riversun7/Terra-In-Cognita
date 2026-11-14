// 1차맵 영토 모양 — 국가마다 도시 원 + 도시 사이까지 덮는 넓은 영토, 도시 소유 비콘은 그 도시·국가 외곽선을 넓힌다, 다른 국가와 겹친 곳은
// 영향력 비율로 나눈다(사용자 결정 2026-11-14 "도시마다 영향권 원" → 질문 1437 답 "도시 사이도 모두 포함하는 넓은 범위로" → 기획 D-546
// 1431 "지금 배후지 기준"·1432 "영향력 비율"·1434 "도시소유의 비콘은 국가 및 도시의 최대 외곽선을 넓히는 용도라고 생각하라",
// ADR 2026-11-07-planet-view "바뀜 (2026-11-14)"·"바뀜 (2026-11-15 D-546)"). 화면 표시용(판정 아님) 순수 계산.
//
// 덮임(덩이가 점 p를 덮나): 덩이의 "뼈대"에서 반지름 안이면 덮는다. 뼈대 = 자리(도시·도시 소유 비콘) 점 + 서로 잇기 상한(설정 칸
// planet_territory_corridor_cells) 안인 같은 국가 자리 쌍의 줄 + 비콘과 그 기준 도시·같은 기준 도시 비콘끼리의 줄(거리와 상관없이) + 세 쌍이 모두 이어진 자리 셋의
// 삼각형(속을 채운다). 반지름 = 도시는 원 반지름(배후지 지금 반경 × 배율, 아래 끝 — 설정 칸), 비콘은 둘레 여유(설정 칸), 줄 위에서는 두 끝
// 반지름을 잇는 값. 그래서 도시 원들이 둥근 띠로 이어지고 도시들 사이 땅도 들며, 비콘은 그 도시 원에서 비콘까지 외곽선을 밀어낸다(비콘이
// 여럿이면 비콘·도시 삼각형이 채워져 넓은 둥근 모양 — 각진 껍질이 아니다). 멀리 떨어진 같은 국가 도시는 잇지 않는다.
// 주인: 덮는 덩이가 여럿이면 영향력 비율(거리 ÷ 영향력 반지름)이 가장 작은 자리(같으면 도시 → 작은 ID)의 덩이 — 서버 칸 소속 claimAt과
// 같은 방식. 도시의 영향력 반지름 = 그 원 반지름, 비콘 = 기준 도시 원 반지름(비콘 자리에 도시를 넓힌다). 반지름이 같은 두 도시의 경계는
// 가운데, 큰 도시가 조금 더 가진다. 다른 국가 도시가 띠를 가르면 영토가 둘로 갈린다.
// 그리기: 덩이마다 둘레를 접평면 격자에서 마칭 스퀘어로 찾는다(격자 칸 변 위 경계 점은 주인 함수 이분 탐색이라 두 국가가 같은 점을 쓴다).
// 고리마다 닫힌 다각형(위도·경도) — 칠·테두리가 같은 고리다. 국가 사이 경계 몫(받침 선)은 고리 변 바깥쪽 주인이 다른 국가인 곳이다.
// 3차원 단위 벡터로 셈해 면·경도 ±180°·극에 이음매가 없다. 표시 값은 서버 world.cities territoryDisplay(없으면 TERRITORY_DISPLAY_START) —
// 보기 전용, 판정(D-485 비콘 볼록 도형·D-104 영향권·claimAt 칸 소속)과 다를 수 있다(D-544 미결).
import {
  TERRITORY_DISPLAY_START,
  type WorldCitiesResponse,
  type WorldMapBeacon,
  type WorldMapCity,
  type WorldTerritoryDisplay,
} from "@terra/shared/worldMap";

type Vec = readonly [number, number, number];
type LatLon = readonly [latDeg: number, lonDeg: number];

const DEG = Math.PI / 180;
/** 각 반지름 위 끝 */
const MAX_RADIUS = Math.PI / 2 - 1e-6;
/** 격자 간격 = 그 덩이 가장 작은 원 반지름 ÷ 이 값 */
const GRID_PER_RADIUS = 6;
/** 덩이 하나 격자 마디 수 위 끝(넘으면 간격을 넓힌다) */
const MAX_GRID_NODES = 40_000;
/** 경계 점 이분 탐색 횟수(격자 간격 ÷ 2^n) */
const BISECT_STEPS = 10;

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

/** 영토를 그릴 자리 하나(도시 또는 영토 비콘) */
export interface TerritorySite {
  readonly kind: "city" | "beacon";
  /** 도시 ID 또는 비콘 ID(종류마다 따로 센다) */
  readonly id: number;
  readonly factionId: number;
  readonly latDeg: number;
  readonly lonDeg: number;
  /** 덮임 반지름(라디안, 0보다 크다). 도시 = 원, 비콘 = 비콘 둘레 여유(외곽선이 비콘 밖으로 이만큼) */
  readonly radius: number;
  /** 비콘의 기준 도시(도시 소유 비콘만 그린다 — 그 도시 원 반지름을 영향력으로 쓴다). 도시는 없음 */
  readonly anchorCityId?: number | null | undefined;
}

/** 국가 덩이 하나(같은 국가의 이어진 도시·비콘)의 둘레 고리들 */
export interface TerritoryArea {
  readonly factionId: number;
  /** 덩이의 도시 */
  readonly cityIds: readonly number[];
  /** 닫힌 고리(위도·경도). 바깥 고리·구멍 모두(칠은 evenodd) */
  readonly loops: readonly (readonly LatLon[])[];
  /** 화면 밖 건너뛰기용: 덩이 가운데와 가운데에서 가장 먼 고리 점 */
  readonly center: LatLon;
  readonly rim: LatLon;
}

/** 국가 이름표 자리: 그 국가 땅 가운데 가장 넓은 조각의 가운데 */
export interface TerritoryLabelSpot {
  readonly factionId: number;
  readonly latDeg: number;
  readonly lonDeg: number;
  /** 단위 구 위 넓이(스테라디안, 어림) — 이름표가 겹치면 넓은 국가가 남는다 */
  readonly area: number;
}

export interface TerritoryShapes {
  readonly areas: readonly TerritoryArea[];
  /** 두 국가가 맞닿은 선(꺾은선, 받침 선) */
  readonly dividers: readonly (readonly LatLon[])[];
  /** 맞닿은 국가 쌍(작은 ID, 큰 ID — 받침 선이 있는 쌍, ID 차례). 비슷한 색 이웃 무늬(territoryView.ts)가 쓴다 */
  readonly neighbours: readonly (readonly [number, number])[];
  readonly labels: readonly TerritoryLabelSpot[];
}

/** 한 칸 값: 유한하고 0 이상이면 그 값, 아니면 출발값 */
const valueOr = (value: number | undefined, start: number): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : start;

/** 서버 표시 값 → 쓸 값(칸마다 틀리면 출발값 — 옛 서버·깨진 값에도 그린다) */
export function territoryDisplayOf(display: WorldTerritoryDisplay | undefined): WorldTerritoryDisplay {
  const start = TERRITORY_DISPLAY_START;
  return {
    corridorCells: valueOr(display?.corridorCells, start.corridorCells),
    radiusScalePm: valueOr(display?.radiusScalePm, start.radiusScalePm),
    minCells: valueOr(display?.minCells, start.minCells),
    beaconCells: valueOr(display?.beaconCells, start.beaconCells),
  };
}

/** 1000분율 칸 → 라디안: 같은 국가 도시·비콘을 잇는 가장 먼 거리(라디안, 설정 칸 corridorCells). 환산이 없으면 0(잇지 않는다) */
export function corridorOf(
  milliPerRadian: number | undefined,
  display: WorldTerritoryDisplay = TERRITORY_DISPLAY_START,
): number {
  return milliPerRadian && milliPerRadian > 0 ? (display.corridorCells * 1000) / milliPerRadian : 0;
}

/**
 * 서버 도시·비콘 목록 → 영토 자리. 도시 바탕 반경 = 배후지(catchmentMilli), 없으면 영향권(radiusMilli). 도시 화면 반지름 = max(바탕 ×
 * radiusScalePm ÷ 1000, minCells칸), 비콘 둘레 여유 = beaconCells칸(설정 칸, 보기 전용). 1000분율 칸 → 라디안 = 값 ÷ milliPerRadian. 바탕 반경·환산이
 * 없으면 그 도시는 영토를 그리지 않는다. 비콘은 기준 도시가 이 목록에 있을 때만 뼈대에 든다(skeletonsOf)
 */
export function territorySitesOf(
  cities: readonly WorldMapCity[],
  milliPerRadian: number | undefined,
  display: WorldTerritoryDisplay = TERRITORY_DISPLAY_START,
  beacons: readonly WorldMapBeacon[] = [],
): TerritorySite[] {
  if (!milliPerRadian || milliPerRadian <= 0) return [];
  const sites: TerritorySite[] = [];
  for (const city of cities) {
    const milli = city.catchmentMilli ?? city.radiusMilli;
    if (!milli || milli <= 0) continue;
    sites.push({
      kind: "city",
      id: city.id,
      factionId: city.factionId,
      latDeg: city.latDeg,
      lonDeg: city.lonDeg,
      radius: Math.min(
        MAX_RADIUS,
        Math.max((milli * display.radiusScalePm) / 1000, display.minCells * 1000) / milliPerRadian,
      ),
    });
  }
  const beaconRadius = Math.min(MAX_RADIUS, (display.beaconCells * 1000) / milliPerRadian);
  if (beaconRadius > 0)
    for (const beacon of beacons)
      sites.push({
        kind: "beacon",
        id: beacon.id,
        factionId: beacon.factionId,
        latDeg: beacon.latDeg,
        lonDeg: beacon.lonDeg,
        radius: beaconRadius,
        anchorCityId: beacon.cityId,
      });
  return sites;
}

/** 영토를 셈할 입력(자리·잇기 거리) — 서버 world.cities 응답 하나에서. 그리기(CityOverlay)와 누르기(territoryPick)가 같이 쓴다 */
export interface TerritoryInput {
  readonly sites: readonly TerritorySite[];
  readonly corridor: number;
}

export function territoryInputOf(
  world: Pick<WorldCitiesResponse, "cities" | "milliPerRadian" | "beacons" | "territoryDisplay">,
): TerritoryInput {
  const display = territoryDisplayOf(world.territoryDisplay);
  return {
    sites: territorySitesOf(world.cities, world.milliPerRadian, display, world.beacons ?? []),
    corridor: corridorOf(world.milliPerRadian, display),
  };
}

/** 자리 차례: 도시 먼저, 같은 종류는 작은 ID(같은 거리 주인 가르기·뼈대 차례) */
const siteOrder = (a: TerritorySite, b: TerritorySite): number =>
  Number(a.kind === "beacon") - Number(b.kind === "beacon") || a.id - b.id;

interface Node {
  readonly site: TerritorySite;
  readonly p: Vec;
  /** 덮임 반지름(뼈대에서 이만큼 안이면 덮는다) */
  readonly radius: number;
  /** 영향력 반지름(주인 = 거리 ÷ 이 값이 가장 작은 자리). 도시 = 원 반지름, 비콘 = 기준 도시 원 반지름(비콘은 그 도시를 넓힌다) */
  readonly influence: number;
}

/** 뼈대 줄(같은 국가 두 자리) */
interface Link {
  readonly a: Node;
  readonly b: Node;
}

/** 국가 덩이 하나(같은 국가의 이어진 도시·비콘)의 뼈대 */
interface Skeleton {
  readonly factionId: number;
  readonly nodes: readonly Node[];
  readonly links: readonly Link[];
  readonly triangles: readonly (readonly [Node, Node, Node])[];
  /** 빠른 거르기: 뼈대를 품는 원(가운데·각 반지름, 덮임 반지름 포함) */
  readonly center: Vec;
  readonly reach: number;
}

/** 점에서 줄(대원 조각 a–b)까지 가장 가까운 점의 몫 t(0~1). 짧은 줄이라 현(chord)에 내린 수선을 쓴다 */
function nearestOnLink(p: Vec, a: Vec, b: Vec): number {
  const ab = sub(b, a);
  const length2 = dot(ab, ab);
  if (length2 <= 0) return 0;
  return Math.min(1, Math.max(0, dot(sub(p, a), ab) / length2));
}

/** 점이 세 자리 삼각형(구면, 짧다) 안인가 */
function insideTriangle(p: Vec, [a, b, c]: readonly [Node, Node, Node]): boolean {
  const s1 = dot(cross(a.p, b.p), p);
  const s2 = dot(cross(b.p, c.p), p);
  const s3 = dot(cross(c.p, a.p), p);
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
}

/** 덩이가 점을 덮나: 뼈대(자리·줄·삼각형)에서 반지름 안 */
function covers(skeleton: Skeleton, p: Vec): boolean {
  if (angleBetween(p, skeleton.center) > skeleton.reach) return false;
  for (const node of skeleton.nodes) if (angleBetween(p, node.p) <= node.radius) return true;
  for (const link of skeleton.links) {
    const t = nearestOnLink(p, link.a.p, link.b.p);
    const q = unit(add(link.a.p, scale(sub(link.b.p, link.a.p), t)));
    if (angleBetween(p, q) <= link.a.radius + (link.b.radius - link.a.radius) * t) return true;
  }
  for (const triangle of skeleton.triangles) if (insideTriangle(p, triangle)) return true;
  return false;
}

/** 자리 번호 쌍 키(작은 번호 먼저) */
const pairKey = (i: number, j: number): string => `${String(Math.min(i, j))}:${String(Math.max(i, j))}`;

/**
 * 국가마다 뼈대를 만들고 이어진 덩이로 나눈다. 줄 = 서로 corridor 안인 같은 국가 자리 쌍 + 비콘과 그 기준 도시·같은 기준 도시의 비콘끼리
 * (거리와 상관없이 — 도시 소유 비콘은 그 도시 외곽선을 넓힌다, D-546 1434), 삼각형 = 세 쌍이 모두 줄인 자리 셋. 덩이 = 줄로 이어졌거나 원이 겹친 자리들.
 * 기준 도시가 자리에 없는 비콘(모르는 도시·기준 도시 없음)은 넣지 않는다
 */
function skeletonsOf(sites: readonly TerritorySite[], corridor: number): Skeleton[] {
  const ordered = sites.filter((site) => Number.isFinite(site.radius) && site.radius > 0).toSorted(siteOrder);
  const cityNodes = new Map<number, Node>();
  const byFaction = new Map<number, Node[]>();
  const push = (node: Node): void => {
    const list = byFaction.get(node.site.factionId) ?? [];
    list.push(node);
    byFaction.set(node.site.factionId, list);
  };
  for (const site of ordered) {
    if (site.kind !== "city") continue;
    const radius = Math.min(MAX_RADIUS, site.radius);
    const node: Node = { site, p: toVec(site.latDeg, site.lonDeg), radius, influence: radius };
    cityNodes.set(site.id, node);
    push(node);
  }
  for (const site of ordered) {
    if (site.kind !== "beacon") continue;
    const anchor =
      site.anchorCityId === null || site.anchorCityId === undefined
        ? undefined
        : cityNodes.get(site.anchorCityId);
    if (!anchor || anchor.site.factionId !== site.factionId) continue;
    push({
      site,
      p: toVec(site.latDeg, site.lonDeg),
      radius: Math.min(MAX_RADIUS, site.radius),
      influence: anchor.influence,
    });
  }
  const skeletons: Skeleton[] = [];
  for (const [factionId, nodes] of byFaction) {
    const index = new Map(nodes.map((node, i) => [node, i]));
    const linked = new Set<string>();
    const joined = (i: number, j: number): boolean => linked.has(pairKey(i, j));
    nodes.forEach((a, i) => {
      nodes.forEach((b, j) => {
        if (j <= i) return;
        // 비콘 ↔ 기준 도시, 같은 기준 도시의 비콘끼리는 거리와 상관없이 잇는다(도시 + 비콘 꼭짓점 도형, D-485·D-546 1434)
        const anchored =
          (a.site.kind === "beacon" && a.site.anchorCityId === b.site.id && b.site.kind === "city") ||
          (b.site.kind === "beacon" && b.site.anchorCityId === a.site.id && a.site.kind === "city") ||
          (a.site.kind === "beacon" &&
            b.site.kind === "beacon" &&
            a.site.anchorCityId === b.site.anchorCityId);
        if (anchored || angleBetween(a.p, b.p) <= corridor) linked.add(pairKey(i, j));
      });
    });
    // 덩이: 줄로 이어졌거나 원이 겹친 자리
    const parent = nodes.map((_, i) => i);
    const find = (i: number): number => {
      let root = i;
      while ((parent[root] ?? root) !== root) root = parent[root] ?? root;
      return root;
    };
    nodes.forEach((a, i) => {
      nodes.forEach((b, j) => {
        if (j <= i) return;
        if (joined(i, j) || angleBetween(a.p, b.p) <= a.radius + b.radius) {
          const [ra, rb] = [find(i), find(j)];
          if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
        }
      });
    });
    const groups = new Map<number, Node[]>();
    nodes.forEach((node, i) => {
      const root = find(i);
      groups.set(root, [...(groups.get(root) ?? []), node]);
    });
    for (const group of groups.values()) {
      const links: Link[] = [];
      const triangles: [Node, Node, Node][] = [];
      const at = (node: Node): number => index.get(node) ?? -1;
      for (let i = 0; i < group.length; i++) {
        const a = group[i];
        if (!a) continue;
        for (let j = i + 1; j < group.length; j++) {
          const b = group[j];
          if (!b || !joined(at(a), at(b))) continue;
          links.push({ a, b });
          for (let k = j + 1; k < group.length; k++) {
            const c = group[k];
            if (c && joined(at(a), at(c)) && joined(at(b), at(c))) triangles.push([a, b, c]);
          }
        }
      }
      const center = unit(group.reduce<Vec>((sum, node) => add(sum, node.p), [0, 0, 0]));
      const reach = Math.max(...group.map((node) => angleBetween(center, node.p) + node.radius));
      skeletons.push({ factionId, nodes: group, links, triangles, center, reach });
    }
  }
  return skeletons;
}

/**
 * 점의 주인: 그 점을 덮는 덩이들의 자리 가운데 영향력 비율(거리 ÷ 영향력 반지름)이 가장 작은 자리(같으면 도시 → 작은 ID) — 서버 칸 소속
 * claimAt(@terra/shared/territory, 도시 영향권 = 거리 ÷ 반경이 가장 작은 도시)과 같은 방식(D-546 1432 "영향력 비율"). 반지름이 같으면
 * 경계는 두 도시의 가운데, 다르면 큰 도시 쪽으로 밀린다. 덮는 덩이가 없으면 undefined
 */
function ownerAmong(skeletons: readonly Skeleton[], p: Vec): { node: Node; skeleton: Skeleton } | undefined {
  let best: { node: Node; skeleton: Skeleton } | undefined;
  let bestRatio = Number.POSITIVE_INFINITY;
  for (const skeleton of skeletons) {
    if (!covers(skeleton, p)) continue;
    for (const node of skeleton.nodes) {
      const ratio = angleBetween(p, node.p) / node.influence;
      if (ratio < bestRatio || (ratio === bestRatio && best && siteOrder(node.site, best.node.site) < 0)) {
        best = { node, skeleton };
        bestRatio = ratio;
      }
    }
  }
  return best;
}

/** 점의 주인 자리(도시·비콘, 어느 국가 영토도 아니면 null). 그리기와 같은 규칙 — 누른 곳의 국가(territoryPick.ts)가 쓴다 */
export function territoryOwner(
  latDeg: number,
  lonDeg: number,
  sites: readonly TerritorySite[],
  corridor: number,
): TerritorySite | null {
  return ownerAmong(skeletonsOf(sites, corridor), toVec(latDeg, lonDeg))?.node.site ?? null;
}

/** 접평면(중심 투영) 틀: 가운데 c, 두 축 e1·e2. (u, v) ↔ 구 위 방향 */
interface Frame {
  readonly c: Vec;
  readonly e1: Vec;
  readonly e2: Vec;
}

const frameAt = (c: Vec): Frame => {
  const helper: Vec = Math.abs(c[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const e1 = unit(cross(helper, c));
  return { c, e1, e2: cross(c, e1) };
};
const toPlane = (frame: Frame, p: Vec): readonly [number, number] => {
  const w = dot(p, frame.c);
  return [dot(p, frame.e1) / w, dot(p, frame.e2) / w];
};
const fromPlane = (frame: Frame, u: number, v: number): Vec =>
  unit(add(frame.c, add(scale(frame.e1, u), scale(frame.e2, v))));

type Point2 = readonly [number, number];

/** 거의 곧은 점 빼기(닫힌 고리, 허용 거리 tol) — 고리 점 수를 줄여 프레임 투영을 가볍게 한다 */
function simplifyLoop(points: readonly Point2[], tol: number): Point2[] {
  let current = [...points];
  for (let pass = 0; pass < 3 && current.length > 8; pass++) {
    const kept: Point2[] = [];
    for (let index = 0; index < current.length; index++) {
      const prev = kept.at(-1) ?? current.at(-1);
      const point = current[index];
      const next = current[(index + 1) % current.length];
      if (!prev || !point || !next) continue;
      const dx = next[0] - prev[0];
      const dy = next[1] - prev[1];
      const length = Math.hypot(dx, dy);
      const off = length > 0 ? Math.abs(dx * (prev[1] - point[1]) - dy * (prev[0] - point[0])) / length : 0;
      if (off >= tol || kept.length === 0) kept.push(point);
    }
    if (kept.length === current.length) break;
    current = kept;
  }
  return current;
}

/** 넓이(부호, 반시계 +) */
const signedArea = (points: readonly Point2[]): number => {
  let sum = 0;
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length] ?? point;
    sum += point[0] * next[1] - next[0] * point[1];
  });
  return sum / 2;
};
const centroidOf = (points: readonly Point2[]): Point2 => {
  let cx = 0;
  let cy = 0;
  let area = 0;
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length] ?? point;
    const k = point[0] * next[1] - next[0] * point[1];
    area += k;
    cx += (point[0] + next[0]) * k;
    cy += (point[1] + next[1]) * k;
  });
  return area === 0 ? (points[0] ?? [0, 0]) : [cx / (3 * area), cy / (3 * area)];
};

/**
 * 격자에서 inside(p) 둘레를 찾는다(안이 왼쪽인 닫힌 고리). 변 위 경계 점은 이분 탐색. 안장 칸은 가운데 표본으로 가른다.
 * 격자 가장자리 마디는 늘 밖이어야 한다(덩이 상자에 여유를 둔다)
 */
function trace(
  frame: Frame,
  box: { u0: number; v0: number; step: number; nx: number; ny: number },
  inside: (p: Vec) => boolean,
): Point2[][] {
  const { u0, v0, step, nx, ny } = box;
  const at = (i: number, j: number): Point2 => [u0 + i * step, v0 + j * step];
  const value: boolean[] = [];
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i <= nx; i++) {
      const [u, v] = at(i, j);
      value.push(i > 0 && j > 0 && i < nx && j < ny && inside(fromPlane(frame, u, v)));
    }
  const get = (i: number, j: number): boolean => value[j * (nx + 1) + i] ?? false;
  // 변 번호: 가로 변 (i, j)–(i+1, j) = j·nx + i, 세로 변 (i, j)–(i, j+1) = H + j·(nx+1) + i
  const horizontal = (ny + 1) * nx;
  const hEdge = (i: number, j: number): number => j * nx + i;
  const vEdge = (i: number, j: number): number => horizontal + j * (nx + 1) + i;
  const crossing = new Map<number, Point2>();
  const pointOn = (edge: number): Point2 => {
    const known = crossing.get(edge);
    if (known) return known;
    let a: Point2;
    let b: Point2;
    if (edge < horizontal) {
      const i = edge % nx;
      const j = Math.floor(edge / nx);
      [a, b] = [at(i, j), at(i + 1, j)];
    } else {
      const rest = edge - horizontal;
      const i = rest % (nx + 1);
      const j = Math.floor(rest / (nx + 1));
      [a, b] = [at(i, j), at(i, j + 1)];
    }
    // a 쪽이 안이 되게 놓고 안 → 밖 경계를 찾는다
    let lo = 0;
    let hi = 1;
    const aInside = inside(fromPlane(frame, a[0], a[1]));
    for (let step2 = 0; step2 < BISECT_STEPS; step2++) {
      const mid = (lo + hi) / 2;
      const q = fromPlane(frame, a[0] + (b[0] - a[0]) * mid, a[1] + (b[1] - a[1]) * mid);
      if (inside(q) === aInside) lo = mid;
      else hi = mid;
    }
    const t = (lo + hi) / 2;
    const point: Point2 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    crossing.set(edge, point);
    return point;
  };
  // 칸마다 조각(시작 변 → 끝 변). 모서리를 반시계(왼아래·오른아래·오른위·왼위)로 돌며 안 → 밖 변에서 다음(이어진 안장이면)·앞(끊긴 안장이면)
  // 밖 → 안 변으로 잇는다 — 안이 늘 왼쪽
  const next = new Map<number, number>();
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const corners = [get(i, j), get(i + 1, j), get(i + 1, j + 1), get(i, j + 1)];
      const edges = [hEdge(i, j), vEdge(i + 1, j), hEdge(i, j + 1), vEdge(i, j)];
      const count = corners.filter(Boolean).length;
      if (count === 0 || count === 4) continue;
      const exits: number[] = [];
      const entries: number[] = [];
      for (let k = 0; k < 4; k++) {
        const from = corners[k] ?? false;
        const to = corners[(k + 1) % 4] ?? false;
        if (from && !to) exits.push(k);
        if (!from && to) entries.push(k);
      }
      let joinNext = true;
      if (exits.length === 2) {
        const [u, v] = at(i, j);
        joinNext = inside(fromPlane(frame, u + step / 2, v + step / 2));
      }
      for (const exit of exits) {
        // 다음(반시계) 들어오는 변 또는 앞(시계) 들어오는 변
        let pick = entries[0] ?? exit;
        for (let offset = 1; offset < 4; offset++) {
          const k = joinNext ? (exit + offset) % 4 : (exit - offset + 4) % 4;
          if (entries.includes(k)) {
            pick = k;
            break;
          }
        }
        next.set(edges[exit] ?? 0, edges[pick] ?? 0);
      }
    }
  const loops: Point2[][] = [];
  const seen = new Set<number>();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop: Point2[] = [];
    let edge = start;
    while (!seen.has(edge)) {
      seen.add(edge);
      loop.push(pointOn(edge));
      const following = next.get(edge);
      if (following === undefined) break;
      edge = following;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

/** 도시들의 국가 영토 고리·국가 경계 받침 선·국가 이름표 자리. corridor = 같은 국가 도시를 잇는 가장 먼 거리(라디안) */
export function buildTerritoryShapes(sites: readonly TerritorySite[], corridor: number): TerritoryShapes {
  const skeletons = skeletonsOf(sites, corridor);
  const areas: TerritoryArea[] = [];
  const dividers: LatLon[][] = [];
  const pairs = new Set<string>();
  const best = new Map<number, { area: number; total: number; spot: Vec }>();
  for (const skeleton of skeletons) {
    const component = skeleton.nodes;
    const center = unit(component.reduce<Vec>((sum, node) => add(sum, node.p), [0, 0, 0]));
    const frame = frameAt(center);
    const minRadius = Math.min(...component.map((node) => node.radius));
    const maxRadius = Math.max(...component.map((node) => node.radius));
    const planar = component.map((node) => toPlane(frame, node.p));
    const pad = maxRadius * 1.2;
    const u0 = Math.min(...planar.map((point) => point[0])) - pad;
    const u1 = Math.max(...planar.map((point) => point[0])) + pad;
    const v0 = Math.min(...planar.map((point) => point[1])) - pad;
    const v1 = Math.max(...planar.map((point) => point[1])) + pad;
    let step = minRadius / GRID_PER_RADIUS;
    const span = (u1 - u0) * (v1 - v0);
    if (span / (step * step) > MAX_GRID_NODES) step = Math.sqrt(span / MAX_GRID_NODES);
    const nx = Math.max(2, Math.ceil((u1 - u0) / step));
    const ny = Math.max(2, Math.ceil((v1 - v0) / step));
    // 이 덩이 땅 = 주인이 이 덩이 자리인 곳
    const inside = (p: Vec): boolean => ownerAmong(skeletons, p)?.skeleton === skeleton;
    const loops = trace(frame, { u0, v0, step, nx, ny }, inside).map((loop) =>
      simplifyLoop(loop, step * 0.05),
    );
    if (loops.length === 0) continue;
    // 국가 경계 받침: 고리 변 바깥(오른쪽) 주인이 다른 국가인 몫
    for (const loop of loops) {
      let run: LatLon[] = [];
      const flush = (): void => {
        if (run.length >= 2) dividers.push(run);
        run = [];
      };
      loop.forEach((point, index) => {
        const after = loop[(index + 1) % loop.length] ?? point;
        const dx = after[0] - point[0];
        const dy = after[1] - point[1];
        const length = Math.hypot(dx, dy) || 1;
        const probe = fromPlane(
          frame,
          (point[0] + after[0]) / 2 + (dy / length) * step * 0.5,
          (point[1] + after[1]) / 2 - (dx / length) * step * 0.5,
        );
        const other = ownerAmong(skeletons, probe)?.skeleton;
        // 한 쪽(작은 국가 ID)에서만 넣는다
        if (other && other.factionId > skeleton.factionId) {
          pairs.add(`${String(skeleton.factionId)}:${String(other.factionId)}`);
          if (run.length === 0) run.push(latLonOf(fromPlane(frame, point[0], point[1])));
          run.push(latLonOf(fromPlane(frame, after[0], after[1])));
        } else flush();
      });
      flush();
    }
    const outer = loops.map((loop) => ({ loop, area: signedArea(loop) }));
    const total = outer.reduce((sum, entry) => sum + entry.area, 0);
    const largest = outer.toSorted((a, b) => b.area - a.area)[0];
    if (largest && largest.area > 0) {
      const [cu, cv] = centroidOf(largest.loop);
      const known = best.get(skeleton.factionId);
      if (!known || largest.area > known.area)
        best.set(skeleton.factionId, {
          area: largest.area,
          total: (known?.total ?? 0) + total,
          spot: fromPlane(frame, cu, cv),
        });
      else known.total += total;
    }
    let rim: Vec = center;
    let far = -1;
    const loopsLatLon = loops.map((loop) =>
      loop.map((point) => {
        const p = fromPlane(frame, point[0], point[1]);
        const gap = angleBetween(p, center);
        if (gap > far) {
          far = gap;
          rim = p;
        }
        return latLonOf(p);
      }),
    );
    areas.push({
      factionId: skeleton.factionId,
      cityIds: component.filter((node) => node.site.kind === "city").map((node) => node.site.id),
      loops: loopsLatLon,
      center: latLonOf(center),
      rim: latLonOf(rim),
    });
  }
  const labels: TerritoryLabelSpot[] = [...best].map(([factionId, entry]) => {
    const [latDeg, lonDeg] = latLonOf(entry.spot);
    return { factionId, latDeg, lonDeg, area: Math.max(entry.area, entry.total) };
  });
  labels.sort((a, b) => b.area - a.area || a.factionId - b.factionId);
  const neighbours = [...pairs]
    .map((pair) => {
      const [a, b] = pair.split(":").map(Number);
      return [a ?? 0, b ?? 0] as const;
    })
    .toSorted((x, y) => x[0] - y[0] || x[1] - y[1]);
  return { areas, dividers, neighbours, labels };
}
