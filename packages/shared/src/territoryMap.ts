// 1차맵 영토 지도 — 판정과 표시가 함께 쓰는 영토 모양(기획 D-568 "판정도 지도대로": 비콘 놓기·세금·지방 판정이 1차맵 영토 표시와 같은
// 모양을 쓴다. D-485 비콘 볼록 도형 판정·D-544 "표시만, 판정은 나중에"를 대체). 모양 규칙은 D-543·D-544·D-546·D-555(기획 42 §2.4):
// - 도시 원: 반지름 = max(도시 배후지 지금 반경 × 배율 ÷ 1000, 아래 끝 칸) (설정 칸 planet_territory_radius_scale_pm·min_cells).
//   배후지 규칙이 꺼진 세계는 배후지 대신 D-104 영향권 반경을 쓴다(부르는 쪽이 고른다).
// - 국가 영토 = 덩이마다 "뼈대"에서 반지름 안. 뼈대 = 자리(도시·도시 소유 비콘) 점 + 서로 잇기 상한(planet_territory_corridor_cells) 안인 같은
//   국가 자리 쌍의 줄 + 비콘과 그 기준 도시·같은 기준 도시 비콘끼리의 줄(거리와 상관없이 — D-546 1434 비콘은 도시·국가 외곽선을 넓힌다) +
//   세 쌍이 모두 이어진 자리 셋의 삼각형(속을 채운다). 반지름 = 도시는 원 반지름, 비콘은 둘레 여유(planet_territory_beacon_cells), 줄 위는
//   두 끝 반지름을 잇는 값. 기준 도시가 같은 국가 자리에 없는 비콘은 넣지 않는다.
// - 주인(겹친 곳): 그 점을 덮는 덩이들의 자리 가운데 영향력 비율(거리 ÷ 영향력 반지름)이 가장 작은 자리(같으면 도시 → 작은 ID) — D-546 1432.
//   도시의 영향력 반지름 = 원 반지름, 비콘 = 기준 도시 원 반지름(비콘 자리에 도시를 넓힌다). 지방 = 주인 도시(비콘이면 그 기준 도시).
//
// 결정성(서버 판정, AGENTS.md 4장): 사칙연산·Math.sqrt·detAtan2·detCos만 쓴다(엔진과 상관없이 같은 답). 서버는 점을 @terra/planet/territory
// territoryPoint(정수 벡터)로, 반지름을 1000분율 칸 ÷ milliPerRadian으로 준다. 화면(apps/game/src/map/territoryShapes.ts)도 같은 함수를
// 부른다 — 서버가 world.cities에 실은 같은 점(point)과 같은 값이면 같은 답이다(옛 서버면 위도·경도에서 만든 점이라 경계가 아주 조금 다를 수 있다).
// 이 모듈은 행성 격자를 모른다(점 = 구 위 방향, 길이 무관).
import { detAtan2, detCos } from "./detMath.ts";

/** 점 = 구 위 방향(길이 무관, 0 벡터가 아님). 서버는 정수 벡터(@terra/shared/territory TerritoryVec) */
export type TerritoryMapVec = readonly [x: number, y: number, z: number];

/** 1차맵 영토 값(설정 칸 planet_territory_* 실효 값). 판정과 표시가 같이 쓴다(D-568) */
export interface TerritoryMapValues {
  /** 같은 국가 도시·비콘을 잇는 가장 먼 거리(칸) */
  readonly corridorCells: number;
  /** 도시 원 = 바탕 반경 × 이 천분율 */
  readonly radiusScalePm: number;
  /** 도시 원 반지름 아래 끝(칸) */
  readonly minCells: number;
  /** 도시 소유 비콘 둘레 여유(칸) */
  readonly beaconCells: number;
}

/** 출발값(팩 tuning planet_territory_* 와 같다) */
export const TERRITORY_MAP_START: TerritoryMapValues = {
  corridorCells: 12,
  radiusScalePm: 2000,
  minCells: 4,
  beaconCells: 2,
};

/** 각 반지름 위 끝(반구 안) */
export const TERRITORY_MAP_MAX_RADIUS = Math.PI / 2 - 1e-6;

/** 도시 원 반지름(1000분율 칸): max(바탕 × 배율 ÷ 1000, 아래 끝 × 1000). 바탕이 없거나 0 이하면 0(그 도시는 영토가 없다) */
export function territoryCircleMilli(
  baseMilli: number | null | undefined,
  values: TerritoryMapValues,
): number {
  if (typeof baseMilli !== "number" || !Number.isFinite(baseMilli) || baseMilli <= 0) return 0;
  return Math.max((baseMilli * values.radiusScalePm) / 1000, values.minCells * 1000);
}

/** 1000분율 칸 → 라디안(위 끝 TERRITORY_MAP_MAX_RADIUS). 환산이 없으면 0 */
export function territoryMilliToRadius(milli: number, milliPerRadian: number): number {
  if (!(milliPerRadian > 0) || !(milli > 0)) return 0;
  return Math.min(TERRITORY_MAP_MAX_RADIUS, milli / milliPerRadian);
}

/** 잇기 상한(라디안) */
export const territoryCorridorRadius = (values: TerritoryMapValues, milliPerRadian: number): number =>
  milliPerRadian > 0 && values.corridorCells > 0 ? (values.corridorCells * 1000) / milliPerRadian : 0;

/** 비콘 둘레 여유(라디안) */
export const territoryBeaconRadius = (values: TerritoryMapValues, milliPerRadian: number): number =>
  territoryMilliToRadius(values.beaconCells * 1000, milliPerRadian);

/** 영토 자리 하나(도시 또는 영토 비콘) */
export interface TerritoryMapSite {
  readonly kind: "city" | "beacon";
  /** 도시 ID 또는 비콘 ID(종류마다 따로 센다) */
  readonly id: number;
  readonly faction: number;
  readonly point: TerritoryMapVec;
  /** 덮임 반지름(라디안, 0보다 크다). 도시 = 원, 비콘 = 둘레 여유 */
  readonly radius: number;
  /** 비콘의 기준 도시(같은 국가 도시 자리가 있어야 뼈대에 든다). 도시는 없음 */
  readonly anchorCity?: number | null | undefined;
}

type Vec = readonly [number, number, number];

/** 뼈대 자리 */
export interface TerritoryMapNode {
  readonly site: TerritoryMapSite;
  /** 단위 벡터 */
  readonly u: Vec;
  readonly radius: number;
  readonly cosRadius: number;
  /** 영향력 반지름(주인 = 거리 ÷ 이 값이 가장 작은 자리) */
  readonly influence: number;
}

/** 빠른 거르기 원(가운데 단위 벡터·각 반지름의 코사인): 점과 내적이 cos보다 작으면 그 조각 밖이다 */
interface Cap {
  readonly center: Vec;
  readonly cos: number;
}

/** 뼈대 줄(같은 국가 두 자리)과 그 줄을 덮는 원 */
export interface TerritoryMapLink {
  readonly a: TerritoryMapNode;
  readonly b: TerritoryMapNode;
  readonly cap: Cap;
}

/** 뼈대 삼각형(세 자리)과 그 삼각형을 덮는 원 */
export interface TerritoryMapTriangle {
  readonly nodes: readonly [TerritoryMapNode, TerritoryMapNode, TerritoryMapNode];
  readonly cap: Cap;
}

/** 국가 덩이 하나(같은 국가의 이어진 도시·비콘)의 뼈대 */
export interface TerritoryMapGroup {
  readonly faction: number;
  readonly nodes: readonly TerritoryMapNode[];
  readonly links: readonly TerritoryMapLink[];
  readonly triangles: readonly TerritoryMapTriangle[];
  /** 빠른 거르기: 뼈대를 품는 원(가운데 단위 벡터·각 반지름, 덮임 반지름 포함) */
  readonly center: Vec;
  readonly reach: number;
  readonly cosReach: number;
}

export interface TerritoryMap {
  readonly groups: readonly TerritoryMapGroup[];
}

const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k, a[2] * k];
const unit = (a: Vec): Vec => {
  const length = Math.sqrt(dot(a, a));
  return length > 0 ? scale(a, 1 / length) : a;
};

/** 두 방향 사이 각(라디안, 0 ~ π, 길이 무관, 결정적) */
export function territoryMapAngle(a: TerritoryMapVec, b: TerritoryMapVec): number {
  const n = cross(a, b);
  return detAtan2(Math.sqrt(dot(n, n)), dot(a, b));
}

const cosOf = (radius: number): number => (radius >= Math.PI ? -2 : detCos(radius));

/** 자리 차례: 도시 먼저, 같은 종류는 작은 ID(같은 비율 주인 가르기·뼈대 차례) */
export const territorySiteOrder = (a: TerritoryMapSite, b: TerritoryMapSite): number =>
  Number(a.kind === "beacon") - Number(b.kind === "beacon") || a.id - b.id;

const validPoint = (p: TerritoryMapVec): boolean =>
  p.every((value) => Number.isFinite(value)) && (p[0] !== 0 || p[1] !== 0 || p[2] !== 0);

/** 점에서 줄(대원 조각 a–b, 단위 벡터)까지 가장 가까운 점의 몫 t(0~1). 짧은 줄이라 현(chord)에 내린 수선을 쓴다 */
function nearestOnLink(p: Vec, a: Vec, b: Vec): number {
  const ab = sub(b, a);
  const length2 = dot(ab, ab);
  if (length2 <= 0) return 0;
  return Math.min(1, Math.max(0, dot(sub(p, a), ab) / length2));
}

/** 점이 세 자리 삼각형(구면, 짧다) 안인가 */
function insideTriangle(p: Vec, { nodes: [a, b, c] }: TerritoryMapTriangle): boolean {
  const s1 = dot(cross(a.u, b.u), p);
  const s2 = dot(cross(b.u, c.u), p);
  const s3 = dot(cross(c.u, a.u), p);
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
}

/** 덩이가 점(단위 벡터)을 덮나: 뼈대(자리·줄·삼각형)에서 반지름 안 */
function covers(group: TerritoryMapGroup, p: Vec): boolean {
  if (dot(p, group.center) < group.cosReach) return false;
  for (const node of group.nodes) if (dot(p, node.u) >= node.cosRadius) return true;
  for (const { a, b, cap } of group.links) {
    if (dot(p, cap.center) < cap.cos) continue;
    const t = nearestOnLink(p, a.u, b.u);
    const q = unit(add(a.u, scale(sub(b.u, a.u), t)));
    if (territoryMapAngle(p, q) <= a.radius + (b.radius - a.radius) * t) return true;
  }
  for (const triangle of group.triangles)
    if (dot(p, triangle.cap.center) >= triangle.cap.cos && insideTriangle(p, triangle)) return true;
  return false;
}

/** 덮는 원의 여유(코사인): 거르기가 경계 위 점을 빼지 않게 조금 넓힌다 */
const CAP_SLACK = 1e-9;

/** 점들(과 둘레 반지름)을 덮는 원: 가운데 = 단위 벡터 합의 방향, 반지름 = 가장 먼 점까지 각 + 그 점 반지름(작은 조각이라 가장 먼 곳은 꼭짓점) */
function capOf(points: readonly Vec[], margins: readonly number[]): Cap {
  const sum = points.reduce<Vec>((total, point) => add(total, point), [0, 0, 0]);
  if (dot(sum, sum) <= 0) return { center: [0, 0, 1], cos: -2 };
  const center = unit(sum);
  let reach = 0;
  points.forEach((point, index) => {
    reach = Math.max(reach, territoryMapAngle(center, point) + (margins[index] ?? 0));
  });
  return { center, cos: cosOf(reach) - CAP_SLACK };
}

const pairKey = (i: number, j: number): number => Math.min(i, j) * 1_000_003 + Math.max(i, j);

/**
 * 영토 지도: 국가마다 뼈대를 만들고 이어진 덩이로 나눈다. 줄 = 서로 corridor(라디안) 안인 같은 국가 자리 쌍 + 비콘과 그 기준 도시·같은 기준
 * 도시의 비콘끼리(거리와 상관없이), 삼각형 = 세 쌍이 모두 줄인 자리 셋. 덩이 = 줄로 이어졌거나 원이 겹친 자리들. 입력 차례와 상관없다
 * (자리를 도시 → ID 차례로 본다). 덩이 차례 = 국가 ID → 덩이의 첫 자리 차례
 */
export function buildTerritoryMap(sites: readonly TerritoryMapSite[], corridor: number): TerritoryMap {
  const ordered = sites
    .filter((site) => Number.isFinite(site.radius) && site.radius > 0 && validPoint(site.point))
    .toSorted(territorySiteOrder);
  const cityNodes = new Map<number, TerritoryMapNode>();
  const byFaction = new Map<number, TerritoryMapNode[]>();
  const push = (node: TerritoryMapNode): void => {
    const list = byFaction.get(node.site.faction) ?? [];
    list.push(node);
    byFaction.set(node.site.faction, list);
  };
  for (const site of ordered) {
    if (site.kind !== "city" || cityNodes.has(site.id)) continue;
    const radius = Math.min(TERRITORY_MAP_MAX_RADIUS, site.radius);
    const node: TerritoryMapNode = {
      site,
      u: unit(site.point),
      radius,
      cosRadius: cosOf(radius),
      influence: radius,
    };
    cityNodes.set(site.id, node);
    push(node);
  }
  for (const site of ordered) {
    if (site.kind !== "beacon") continue;
    const anchor =
      site.anchorCity === null || site.anchorCity === undefined ? undefined : cityNodes.get(site.anchorCity);
    if (!anchor || anchor.site.faction !== site.faction) continue;
    const radius = Math.min(TERRITORY_MAP_MAX_RADIUS, site.radius);
    push({ site, u: unit(site.point), radius, cosRadius: cosOf(radius), influence: anchor.influence });
  }
  const groups: TerritoryMapGroup[] = [];
  for (const faction of [...byFaction.keys()].toSorted((a, b) => a - b)) {
    const nodes = byFaction.get(faction) ?? [];
    const linked = new Set<number>();
    const joined = (i: number, j: number): boolean => linked.has(pairKey(i, j));
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      if (!a) continue;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        if (!b) continue;
        // 비콘 ↔ 기준 도시, 같은 기준 도시의 비콘끼리는 거리와 상관없이 잇는다(D-546 1434)
        const anchored =
          (a.site.kind === "beacon" && b.site.kind === "city" && a.site.anchorCity === b.site.id) ||
          (b.site.kind === "beacon" && a.site.kind === "city" && b.site.anchorCity === a.site.id) ||
          (a.site.kind === "beacon" && b.site.kind === "beacon" && a.site.anchorCity === b.site.anchorCity);
        if (anchored || territoryMapAngle(a.u, b.u) <= corridor) linked.add(pairKey(i, j));
      }
    }
    // 덩이: 줄로 이어졌거나 원이 겹친 자리(서로소 집합, 작은 번호가 뿌리)
    const parent = nodes.map((_, i) => i);
    const find = (i: number): number => {
      let root = i;
      while ((parent[root] ?? root) !== root) root = parent[root] ?? root;
      return root;
    };
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      if (!a) continue;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        if (!b) continue;
        if (joined(i, j) || territoryMapAngle(a.u, b.u) <= a.radius + b.radius) {
          const ra = find(i);
          const rb = find(j);
          if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
        }
      }
    }
    const members = new Map<number, number[]>();
    for (let i = 0; i < nodes.length; i++) {
      const root = find(i);
      const list = members.get(root) ?? [];
      list.push(i);
      members.set(root, list);
    }
    for (const root of [...members.keys()].toSorted((a, b) => a - b)) {
      const indices = members.get(root) ?? [];
      const group = indices.flatMap((i) => nodes[i] ?? []);
      const links: TerritoryMapLink[] = [];
      const triangles: TerritoryMapTriangle[] = [];
      for (let x = 0; x < indices.length; x++) {
        const i = indices[x] ?? 0;
        const a = nodes[i];
        if (!a) continue;
        for (let y = x + 1; y < indices.length; y++) {
          const j = indices[y] ?? 0;
          const b = nodes[j];
          if (!b || !joined(i, j)) continue;
          links.push({ a, b, cap: capOf([a.u, b.u], [a.radius, b.radius]) });
          for (let z = y + 1; z < indices.length; z++) {
            const k = indices[z] ?? 0;
            const c = nodes[k];
            if (c && joined(i, k) && joined(j, k))
              triangles.push({ nodes: [a, b, c], cap: capOf([a.u, b.u, c.u], [0, 0, 0]) });
          }
        }
      }
      const sum = group.reduce<Vec>((total, node) => add(total, node.u), [0, 0, 0]);
      const degenerate = dot(sum, sum) <= 0;
      const center = degenerate ? (group[0]?.u ?? [0, 0, 1]) : unit(sum);
      const reach = degenerate
        ? Math.PI
        : Math.max(...group.map((node) => territoryMapAngle(center, node.u) + node.radius));
      groups.push({ faction, nodes: group, links, triangles, center, reach, cosReach: cosOf(reach) });
    }
  }
  return { groups };
}

/** 점의 주인 자리와 그 덩이(어느 국가 영토도 아니면 undefined) */
export function territoryMapOwnerOf(
  map: TerritoryMap,
  point: TerritoryMapVec,
): { readonly node: TerritoryMapNode; readonly group: TerritoryMapGroup } | undefined {
  if (!validPoint(point)) return undefined;
  const p = unit(point);
  let best: { node: TerritoryMapNode; group: TerritoryMapGroup } | undefined;
  let bestRatio = Number.POSITIVE_INFINITY;
  for (const group of map.groups) {
    if (!covers(group, p)) continue;
    for (const node of group.nodes) {
      const ratio = territoryMapAngle(p, node.u) / node.influence;
      if (
        ratio < bestRatio ||
        (ratio === bestRatio && best && territorySiteOrder(node.site, best.node.site) < 0)
      ) {
        best = { node, group };
        bestRatio = ratio;
      }
    }
  }
  return best;
}

/** 점의 소속: 국가, 지방(주인 도시 — 비콘이면 그 기준 도시), 주인 자리 종류. 영토 밖이면 null */
export interface TerritoryMapClaim {
  readonly faction: number;
  readonly province: number | null;
  readonly source: "city" | "beacon";
}

export function territoryMapClaim(map: TerritoryMap, point: TerritoryMapVec): TerritoryMapClaim | null {
  const owner = territoryMapOwnerOf(map, point)?.node.site;
  if (!owner) return null;
  return {
    faction: owner.faction,
    province: owner.kind === "city" ? owner.id : (owner.anchorCity ?? null),
    source: owner.kind,
  };
}
