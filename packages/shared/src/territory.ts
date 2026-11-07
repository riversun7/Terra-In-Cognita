// 영토 층 — 도시·영토 비콘 꼭짓점의 볼록 껍질, 소속 판정, 겹침 규칙. docs/adr/2026-11-03-territory-layer.md
// 기획: D-485(영토 비콘, 도시·비콘을 꼭짓점으로 이은 도형 안 = 세력 영향권, 그 땅은 가까운 도시의 지방), D-486(볼록 껍질,
// 겹침: 도시 영향권끼리 영향력 가중·비콘 영역끼리 중간 지점·비콘 대 다른 세력 도시는 도시 우선), D-104(도시 영향권 반경),
// 49 N42(도시 등급별 비콘 수·최대 거리)·N51(비콘 건물)·M2·M3.
//
// 점 = 구 위 방향을 정수 벡터로 둔 것(성분 |x| ≤ TERRITORY_POINT_SCALE = 2^16). 행성 칸 → 점은 @terra/planet/territory가 만든다
// (칸 중심 단위 벡터 × 2^16을 반올림, 결정적 투영). 이 모듈은 행성 격자를 모른다(평면 격자 시험·시뮬레이터도 (x, y, 1)로 쓸 수 있다).
// - 껍질과 안팎 판정은 정수로만 셈한다: 방향 판정 = 삼중곱 부호. 성분 ≤ 2^16이라 외적 성분 ≤ 2^33, 삼중곱 ≤ 3·2^49 < 2^53 →
//   배정밀도에서 정확하다(BigInt 없음). 그래서 엔진과 상관없이 같은 껍질이 나온다.
// - 껍질 = 구면 볼록 껍질(가장자리 = 대원). 점들이 열린 반구 하나에 있어야 한다: 고정 기준 방향 26개(면 6·모서리 12·꼭짓점 8) 가운데
//   모든 점과 내적이 양수인 첫 방향의 중심 투영 평면에서 단조 사슬(Andrew)을 돈다. 중심 투영은 대원을 직선으로 보내므로 평면 껍질 =
//   구면 껍질이고, 기준 방향을 무엇으로 고르든 같은 껍질이다. 줄 위의 점(삼중곱 0)은 꼭짓점에서 뺀다.
// - 거리 = 두 방향 사이 각 × 칸/라디안(평균 칸, 1000분율)이다. 각은 detAtan2(|a×b|, a·b)(결정적 근사)라 엔진과 상관없이 같다.
//   거리는 정확한 값이 아니라 같은 값이 목적이다(겹침 판정·비콘 거리 검사).
import { detAtan2 } from "./detMath.ts";

/** 점 = 정수 벡터(구 위 방향, 길이 무관) */
export type TerritoryVec = readonly [x: number, y: number, z: number];

/** 점 성분의 절댓값 상한(2^16). 이보다 크면 정수 셈이 넘친다 */
export const TERRITORY_POINT_SCALE = 65_536;

/** 도시 등급 수(마을·읍·소도시·도시·대도시·거대도시, D-104) */
export const CITY_GRADE_COUNT = 6;

export function isTerritoryVec(value: unknown): value is TerritoryVec {
  if (!Array.isArray(value) || value.length !== 3) return false;
  const items: readonly unknown[] = value;
  let nonZero = false;
  for (const item of items) {
    if (typeof item !== "number" || !Number.isSafeInteger(item) || Math.abs(item) > TERRITORY_POINT_SCALE)
      return false;
    if (item !== 0) nonZero = true;
  }
  return nonZero;
}

function cross(a: TerritoryVec, b: TerritoryVec): TerritoryVec {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: TerritoryVec, b: TerritoryVec): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** 방향 판정: c가 대원 a→b의 왼쪽(밖에서 보아 반시계)이면 1, 오른쪽 −1, 대원 위 0. 정확하다(모듈 머리 주석) */
export function orient(a: TerritoryVec, b: TerritoryVec, c: TerritoryVec): -1 | 0 | 1 {
  const value = dot(cross(a, b), c);
  return value > 0 ? 1 : value < 0 ? -1 : 0;
}

/** 두 방향 사이 각(라디안, 0 ~ π, 결정적) */
export function territoryAngle(a: TerritoryVec, b: TerritoryVec): number {
  const n = cross(a, b);
  return detAtan2(Math.sqrt(dot(n, n)), dot(a, b));
}

/** 두 방향 사이 코사인(가까움 비교용, 결정적) */
function cosine(a: TerritoryVec, b: TerritoryVec): number {
  return dot(a, b) / Math.sqrt(dot(a, a) * dot(b, b));
}

interface Frame {
  readonly c: TerritoryVec;
  readonly e1: TerritoryVec;
  readonly e2: TerritoryVec;
}

/** 기준 방향 26개(고정 차례: 면 6 → 모서리 12 → 꼭짓점 8)와 그 투영 평면의 축 e1·e2(e1 × e2는 c 쪽) */
const FRAMES: readonly Frame[] = (() => {
  const list: TerritoryVec[] = [];
  const signs = [1, -1];
  for (let axis = 0; axis < 3; axis++)
    for (const s of signs) list.push([axis === 0 ? s : 0, axis === 1 ? s : 0, axis === 2 ? s : 0]);
  for (let skip = 0; skip < 3; skip++)
    for (const s of signs)
      for (const t of signs) {
        const parts = skip === 0 ? [0, s, t] : skip === 1 ? [s, 0, t] : [s, t, 0];
        list.push([parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]);
      }
  for (const s of signs) for (const t of signs) for (const u of signs) list.push([s, t, u]);
  return list.map((c) => {
    const options: TerritoryVec[] = [
      [c[1], -c[0], 0],
      [0, c[2], -c[1]],
      [c[2], 0, -c[0]],
    ];
    const e1 = options.find((v) => v[0] !== 0 || v[1] !== 0 || v[2] !== 0) ?? [0, 1, 0];
    return { c, e1, e2: cross(c, e1) };
  });
})();

/** 모든 점과 내적이 양수인 첫 기준 방향(열린 반구). 없으면 undefined */
function frameFor(points: readonly TerritoryVec[]): Frame | undefined {
  return FRAMES.find((frame) => points.every((p) => dot(p, frame.c) > 0));
}

/** 중심 투영 평면 좌표 비교(x = p·e ÷ p·c). 분모가 양수라 교차 곱셈으로 정확히 비교한다 */
function compareAlong(p: TerritoryVec, q: TerritoryVec, e: TerritoryVec, c: TerritoryVec): number {
  const left = dot(p, e) * dot(q, c);
  const right = dot(q, e) * dot(p, c);
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * 구면 볼록 껍질: 꼭짓점이 되는 입력 번호(밖에서 보아 반시계 차례, 첫 꼭짓점 = 투영 평면에서 가장 왼쪽 아래).
 * 같은 방향의 점은 번호가 작은 것 하나만 본다. 꼭짓점이 셋 미만(점이 셋 미만·모두 한 대원 위)이거나 열린 반구 하나에 들지 않으면 null
 */
export function convexHull(points: readonly TerritoryVec[]): number[] | null {
  if (points.length < 3 || !points.every((p) => isTerritoryVec(p))) return null;
  const frame = frameFor(points);
  if (!frame) return null;
  const { c, e1, e2 } = frame;
  const at = (index: number): TerritoryVec => points[index] ?? [0, 0, 1];
  const order = points
    .map((_, index) => index)
    .toSorted((a, b) => compareAlong(at(a), at(b), e1, c) || compareAlong(at(a), at(b), e2, c) || a - b);
  const unique: number[] = [];
  for (const index of order) {
    const last = unique.at(-1);
    if (
      last !== undefined &&
      compareAlong(at(last), at(index), e1, c) === 0 &&
      compareAlong(at(last), at(index), e2, c) === 0
    )
      continue;
    unique.push(index);
  }
  if (unique.length < 3) return null;
  const chain = (indices: readonly number[]): number[] => {
    const out: number[] = [];
    for (const index of indices) {
      while (out.length >= 2) {
        const a = out[out.length - 2] ?? index;
        const b = out[out.length - 1] ?? index;
        if (orient(at(a), at(b), at(index)) > 0) break;
        out.pop();
      }
      out.push(index);
    }
    return out;
  };
  const lower = chain(unique);
  const upper = chain(unique.toReversed());
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  return hull.length >= 3 ? hull : null;
}

/** 볼록 다각형(반시계 꼭짓점) 안이거나 가장자리 위인가. 정확하다 */
export function polygonContains(vertices: readonly TerritoryVec[], p: TerritoryVec): boolean {
  if (vertices.length < 3) return false;
  for (let index = 0; index < vertices.length; index++) {
    const a = vertices[index];
    const b = vertices[(index + 1) % vertices.length];
    if (!a || !b || orient(a, b, p) < 0) return false;
  }
  return true;
}

// ── 영토 배치 ──

/** 도시 하나(영향권 원의 중심 = 꼭짓점) */
export interface TerritoryCityInput {
  readonly id: number;
  readonly faction: number;
  readonly point: TerritoryVec;
  /** 도시 등급 1~6(마을~거대도시) */
  readonly grade: number;
}

/** 영토 비콘 하나(꼭짓점). anchorCity = 개수·거리를 센 도시(같은 세력의 도시가 아니게 되면 연결만 끊긴다) */
export interface TerritoryBeaconInput {
  readonly id: number;
  readonly faction: number;
  readonly point: TerritoryVec;
  readonly anchorCity: number | null;
}

/** 영토 규칙(설정 칸 실효 값 → @terra/sim 계수표 territory 칸, 거리는 1000분율 칸) */
export interface TerritoryRules {
  /** 도시 등급별 영향권 반경(M3, D-104 표의 칸 값 × 1000) */
  readonly influenceMilli: readonly number[];
  /** 도시 등급별 비콘 최대 거리(N42, 옛 15·20km를 평균 칸 1.5007km로 나눈 값 × 1000) */
  readonly beaconRangeMilli: readonly number[];
  /** 도시 등급별 비콘 수 상한(N42, D-485 기본 3~5) */
  readonly beaconsPerCity: readonly number[];
}

/**
 * 영토 계수(@terra/sim 세력·사회 계수표 territory 칸, 팩 tuning 경로 "territory.*"). 출발값은 START_TERRITORY_COEFFICIENTS
 */
export interface TerritoryCoefficients extends TerritoryRules {
  /** [임시] 도시 등급 문턱(M2 출발값 없음): 발전도(0~100)가 n번째 값 이상이면 등급 n + 2. 다섯 칸(읍·소도시·도시·대도시·거대도시) */
  readonly gradeAtDevelopment: readonly number[];
  /** 비콘 내구도(N51 옛 영토 신호기 10). 유지 = 내구도(D-171) — 닳는 규칙은 아직 없다 */
  readonly beaconDurability: number;
}

/**
 * 출발값: 영향권 = D-104 표의 칸 값(0.1·0.2·0.5·1.1·1.9·3.6칸), 비콘 수 = D-485 기본 3~5 [임시] 등급 배분, 비콘 거리 = N42 옛
 * 사령부 15km·중앙 통제소 20km ÷ 평균 칸 1.5007km(10칸·13.333칸, 등급 1~3·4~6 [임시] 배분), 등급 문턱 [임시] 발전도 17점 간격
 */
export const START_TERRITORY_COEFFICIENTS: TerritoryCoefficients = {
  influenceMilli: [100, 200, 500, 1100, 1900, 3600],
  beaconRangeMilli: [10_000, 10_000, 10_000, 13_333, 13_333, 13_333],
  beaconsPerCity: [3, 3, 4, 4, 5, 5],
  gradeAtDevelopment: [17, 34, 51, 68, 85],
  beaconDurability: 10,
};

/** 발전도 → 도시 등급 1~6(문턱 몇 개를 넘었나 + 1) */
export function cityGrade(development: number, c: Pick<TerritoryCoefficients, "gradeAtDevelopment">): number {
  let grade = 1;
  for (const threshold of c.gradeAtDevelopment) if (development >= threshold) grade += 1;
  return Math.min(CITY_GRADE_COUNT, grade);
}

/** 각(라디안) → 1000분율 칸 */
export interface TerritoryMetric {
  readonly milliPerRadian: number;
}

export type TerritoryVertexKind = "city" | "beacon";

export interface TerritoryVertex {
  readonly kind: TerritoryVertexKind;
  readonly id: number;
  readonly point: TerritoryVec;
}

/** 한 세력의 이어진 꼭짓점 묶음(서로 비콘 거리 안으로 이어진 도시·비콘) 하나와 그 볼록 껍질 */
export interface TerritoryGroup {
  readonly faction: number;
  readonly members: readonly TerritoryVertex[];
  /** 껍질 꼭짓점(반시계). 꼭짓점이 셋 미만이면 null(도시 영향권만 남는다) */
  readonly hull: readonly TerritoryVertex[] | null;
}

export interface TerritoryCity extends TerritoryCityInput {
  readonly radiusMilli: number;
}

export interface TerritoryLayout {
  readonly metric: TerritoryMetric;
  readonly cities: readonly TerritoryCity[];
  readonly beacons: readonly TerritoryBeaconInput[];
  readonly groups: readonly TerritoryGroup[];
}

/** 소속: 세력, 지방(가까운 도시, D-485), 어느 규칙으로 정해졌나(도시 영향권 | 껍질) */
export interface TerritoryClaim {
  readonly faction: number;
  readonly province: number | null;
  readonly source: "city" | "hull";
}

const gradeIndex = (grade: number): number =>
  Math.min(CITY_GRADE_COUNT - 1, Math.max(0, Math.trunc(grade) - 1));

/** 도시 등급 → 표의 값(표가 짧으면 마지막 값, 없으면 0) */
export function gradeValue(table: readonly number[], grade: number): number {
  return table[Math.min(gradeIndex(grade), table.length - 1)] ?? 0;
}

/** 두 점 사이 거리(1000분율 칸, 결정적) */
export function territoryDistanceMilli(a: TerritoryVec, b: TerritoryVec, metric: TerritoryMetric): number {
  return territoryAngle(a, b) * metric.milliPerRadian;
}

/**
 * 영토 배치를 만든다. 세력마다 꼭짓점(도시 + 비콘)을 잇는다: 비콘은 제 기준 도시와 늘 이어지고, 두 꼭짓점 사이 거리가 둘 중 큰
 * "비콘 거리"(도시 = 등급 N42 거리, 비콘 = 기준 도시의 거리, 기준 도시가 없으면 마을 거리) 안이면 잇는다. 이어진 묶음마다 볼록 껍질.
 * 입력 차례와 상관없다(도시·비콘을 ID 차례로 본다)
 */
export function buildTerritory(
  cities: readonly TerritoryCityInput[],
  beacons: readonly TerritoryBeaconInput[],
  rules: TerritoryRules,
  metric: TerritoryMetric,
): TerritoryLayout {
  const sortedCities = cities
    .filter((city) => isTerritoryVec(city.point))
    .toSorted((a, b) => a.id - b.id)
    .map((city) => ({ ...city, radiusMilli: gradeValue(rules.influenceMilli, city.grade) }));
  const sortedBeacons = beacons
    .filter((beacon) => isTerritoryVec(beacon.point))
    .toSorted((a, b) => a.id - b.id);
  const cityById = new Map(sortedCities.map((city) => [city.id, city]));
  const factions = [...new Set([...sortedCities, ...sortedBeacons].map((item) => item.faction))].toSorted(
    (a, b) => a - b,
  );
  const groups: TerritoryGroup[] = [];
  for (const faction of factions) {
    const vertices: (TerritoryVertex & { readonly range: number; readonly anchor: number | null })[] = [];
    for (const city of sortedCities)
      if (city.faction === faction)
        vertices.push({
          kind: "city",
          id: city.id,
          point: city.point,
          range: gradeValue(rules.beaconRangeMilli, city.grade),
          anchor: null,
        });
    for (const beacon of sortedBeacons) {
      if (beacon.faction !== faction) continue;
      const anchor = beacon.anchorCity === null ? undefined : cityById.get(beacon.anchorCity);
      const own = anchor && anchor.faction === faction ? anchor : undefined;
      vertices.push({
        kind: "beacon",
        id: beacon.id,
        point: beacon.point,
        range: gradeValue(rules.beaconRangeMilli, own?.grade ?? 1),
        anchor: own?.id ?? null,
      });
    }
    // 서로소 집합(작은 번호가 뿌리)
    const parent = vertices.map((_, index) => index);
    const find = (index: number): number => {
      let root = index;
      while ((parent[root] ?? root) !== root) root = parent[root] ?? root;
      return root;
    };
    const join = (a: number, b: number): void => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
    };
    for (let a = 0; a < vertices.length; a++) {
      const va = vertices[a];
      if (!va) continue;
      for (let b = a + 1; b < vertices.length; b++) {
        const vb = vertices[b];
        if (!vb) continue;
        const anchored =
          (va.kind === "city" && vb.kind === "beacon" && vb.anchor === va.id) ||
          (vb.kind === "city" && va.kind === "beacon" && va.anchor === vb.id);
        if (anchored || territoryDistanceMilli(va.point, vb.point, metric) <= Math.max(va.range, vb.range))
          join(a, b);
      }
    }
    const byRoot = new Map<number, TerritoryVertex[]>();
    vertices.forEach((vertex, index) => {
      const root = find(index);
      const list = byRoot.get(root) ?? [];
      list.push({ kind: vertex.kind, id: vertex.id, point: vertex.point });
      byRoot.set(root, list);
    });
    for (const root of [...byRoot.keys()].toSorted((a, b) => a - b)) {
      const members = byRoot.get(root) ?? [];
      const hullIndices = convexHull(members.map((member) => member.point));
      groups.push({
        faction,
        members,
        hull: hullIndices ? hullIndices.flatMap((index) => members[index] ?? []) : null,
      });
    }
  }
  return { metric, cities: sortedCities, beacons: sortedBeacons, groups };
}

/** 세력의 가장 가까운 도시(코사인이 큰 것, 같으면 작은 ID). 없으면 null */
function nearestCity(layout: TerritoryLayout, faction: number, p: TerritoryVec): number | null {
  let best: number | null = null;
  let bestCos = -2;
  for (const city of layout.cities) {
    if (city.faction !== faction) continue;
    const value = cosine(p, city.point);
    if (value > bestCos) {
      best = city.id;
      bestCos = value;
    }
  }
  return best;
}

/**
 * 점의 소속(D-486 겹침 규칙). 없으면 null.
 * 1. 도시 영향권(반경 안): 영향력 가중 = (거리 ÷ 반경)이 가장 작은 도시(같으면 작은 ID). 세력·지방 = 그 도시. 다른 세력의 비콘
 *    껍질보다 앞선다(도시 우선).
 * 2. 껍질: 점을 품은 묶음의 세력이 하나면 그 세력. 여럿이면 그 묶음들의 꼭짓점 가운데 가장 가까운 것의 세력(비콘 영역끼리 중간
 *    지점, 같으면 작은 세력 ID). 지방 = 그 세력의 가장 가까운 도시.
 */
export function claimAt(layout: TerritoryLayout, p: TerritoryVec): TerritoryClaim | null {
  let bestCity: TerritoryCity | undefined;
  let bestRatio = Number.POSITIVE_INFINITY;
  for (const city of layout.cities) {
    if (city.radiusMilli <= 0 || dot(p, city.point) <= 0) continue;
    const distance = territoryDistanceMilli(p, city.point, layout.metric);
    if (distance > city.radiusMilli) continue;
    const ratio = distance / city.radiusMilli;
    if (ratio < bestRatio) {
      bestCity = city;
      bestRatio = ratio;
    }
  }
  if (bestCity) return { faction: bestCity.faction, province: bestCity.id, source: "city" };

  const containing = layout.groups.filter(
    (group) =>
      group.hull !== null &&
      polygonContains(
        group.hull.map((vertex) => vertex.point),
        p,
      ),
  );
  if (containing.length === 0) return null;
  let faction = containing[0]?.faction ?? 0;
  if (containing.some((group) => group.faction !== faction)) {
    let bestCos = -2;
    for (const group of containing)
      for (const member of group.members) {
        const value = cosine(p, member.point);
        if (value > bestCos || (value === bestCos && group.faction < faction)) {
          bestCos = value;
          faction = group.faction;
        }
      }
  }
  return { faction, province: nearestCity(layout, faction, p), source: "hull" };
}

// ── 비콘 놓기 검사(서버 권위, 화면 미리 보기도 같은 함수) ──

export const BEACON_PLACE_PROBLEMS = [
  /** 그 세력의 도시가 비콘 거리(N42) 안에 없다 */
  "out_of_range",
  /** 거리 안 도시들의 비콘 수가 모두 찼다(N42) */
  "beacon_limit",
  /** 다른 세력 도시의 영향권 안(D-486: 비콘으로 남의 도시를 잠식하지 못한다) */
  "foreign_city",
] as const;
export type BeaconPlaceProblem = (typeof BEACON_PLACE_PROBLEMS)[number];

/**
 * 비콘을 이 점에 놓을 수 있나: 거리 안의 그 세력 도시 가운데 자리가 남은 가장 가까운 도시(같으면 작은 ID)가 기준 도시다.
 * 다른 세력 도시 영향권 안이면 막는다. 같은 칸 비콘·켬끔·세력 확인은 부르는 쪽(서버)이 먼저 한다
 */
export function checkBeaconPlacement(
  layout: TerritoryLayout,
  rules: TerritoryRules,
  faction: number,
  point: TerritoryVec,
):
  | { readonly ok: true; readonly anchorCity: number }
  | { readonly ok: false; readonly problem: BeaconPlaceProblem } {
  const claim = claimAt(layout, point);
  if (claim && claim.source === "city" && claim.faction !== faction)
    return { ok: false, problem: "foreign_city" };
  const used = new Map<number, number>();
  for (const beacon of layout.beacons)
    if (beacon.faction === faction && beacon.anchorCity !== null)
      used.set(beacon.anchorCity, (used.get(beacon.anchorCity) ?? 0) + 1);
  let inRange = false;
  let best: { readonly id: number; readonly cos: number } | undefined;
  for (const city of layout.cities) {
    if (city.faction !== faction) continue;
    const distance = territoryDistanceMilli(point, city.point, layout.metric);
    if (distance > gradeValue(rules.beaconRangeMilli, city.grade)) continue;
    inRange = true;
    if ((used.get(city.id) ?? 0) >= gradeValue(rules.beaconsPerCity, city.grade)) continue;
    const value = cosine(point, city.point);
    if (!best || value > best.cos) best = { id: city.id, cos: value };
  }
  if (best) return { ok: true, anchorCity: best.id };
  return { ok: false, problem: inRange ? "beacon_limit" : "out_of_range" };
}

/** 시가지 반경 = 영향권 반경 ÷ 이 값(기획 D-104·49 M4 "영향권은 시가지 반경의 3배다") */
export const URBAN_RADIUS_DIVISOR = 3;

/**
 * 점이 어느 도시의 시가지(안전지대, D-146) 안인가: 도시 중심에서 시가지 반경(영향권 반경 ÷ 3) 안인 도시 가운데 작은 ID. 없으면 null.
 * 시가지 안의 건물은 공성 시간에만 공격받는다(D-174·D-184, 기획 45 "시가지 안의 시설은 공성 시간에 공격받는다") — 건물 공격 판정이 쓴다
 */
export function urbanCityAt(layout: TerritoryLayout, point: TerritoryVec): number | null {
  for (const city of layout.cities)
    if (territoryDistanceMilli(point, city.point, layout.metric) * URBAN_RADIUS_DIVISOR <= city.radiusMilli)
      return city.id;
  return null;
}

/** 새 도시 세우기 검사가 보는 도시 하나(영향권 반경 = 지금 등급의 M3 값) */
export interface FoundingCity {
  readonly id: number;
  readonly faction: number;
  readonly point: TerritoryVec;
  readonly radiusMilli: number;
}

/**
 * 이 점에 새 도시를 세우면 다른 세력 도시의 영향권과 겹치나(D-104 영향권·D-486 "남의 도시를 잠식하지 못한다", 사용자 지적 2026-11-07
 * "다른 세력 범위에 도시를 건설할 수 없다"): 같은 편(own)이 아닌 도시 가운데 거리 ≤ 그 도시 영향권 반경 + 새 도시 영향권 반경인 첫 도시
 * (ID 차례)의 ID, 없으면 null. 두 원이 닿기만 해도 막는다(새 도시 원이 남의 원 안으로 들어가지 않게). 세계 씨앗의 시작 도시 자리·NPC
 * 마을 자리(서버)·나중의 플레이어 도시 세우기가 같은 함수를 쓴다. 폐허 복원은 같은 자리라 이 검사를 거치지 않는다
 */
export function foundingConflict(
  cities: readonly FoundingCity[],
  metric: TerritoryMetric,
  own: (faction: number) => boolean,
  point: TerritoryVec,
  newRadiusMilli: number,
): number | null {
  if (!isTerritoryVec(point)) return null;
  let blocking: number | null = null;
  for (const city of cities) {
    if (own(city.faction) || !isTerritoryVec(city.point)) continue;
    if (blocking !== null && city.id > blocking) continue;
    const reach = Math.max(0, city.radiusMilli) + Math.max(0, newRadiusMilli);
    if (territoryDistanceMilli(point, city.point, metric) <= reach) blocking = city.id;
  }
  return blocking;
}

/**
 * 그 세력에서 점과 가장 가까운 도시(같으면 작은 ID). 없으면 null. 영토 비콘(1차맵) 짓기·수리 재료를 꺼내는 도시다(질문 410 ①, 기획
 * D-121 "가장 가까운 창고" 포인터): 기준 도시(비콘 수가 남은 도시)와 다를 수 있다. 서버 판정과 화면 미리 셈이 같은 함수를 쓴다
 */
export function nearestFactionCity(
  cities: readonly { readonly id: number; readonly faction: number; readonly point: TerritoryVec }[],
  faction: number,
  point: TerritoryVec,
): number | null {
  let best: { readonly id: number; readonly cos: number } | undefined;
  for (const city of cities) {
    if (city.faction !== faction || !isTerritoryVec(city.point)) continue;
    const value = cosine(point, city.point);
    if (!best || value > best.cos || (value === best.cos && city.id < best.id))
      best = { id: city.id, cos: value };
  }
  return best?.id ?? null;
}
