// 영토 층 — 도시·영토 비콘 배치, 소속 판정, 비콘 놓기 검사. docs/adr/2026-11-03-territory-layer.md
// 기획: D-568(판정도 1차맵 지도대로 — 비콘 놓기·세금·지방이 1차맵 영토 모양을 쓴다. D-485 비콘 볼록 도형 판정·D-544 "표시만"을 대체),
// D-546·D-555(영향력 비율 경계, 도시 소유 비콘은 도시·국가 외곽선을 넓힌다), D-104(도시 영향권 반경 — 시가지·새 도시 겹침 검사),
// 49 N42(도시 등급별 비콘 수·최대 거리)·N51(비콘 건물)·M2·M3.
//
// 점 = 구 위 방향을 정수 벡터로 둔 것(성분 |x| ≤ TERRITORY_POINT_SCALE = 2^16). 행성 칸 → 점은 @terra/planet/territory가 만든다
// (칸 중심 단위 벡터 × 2^16을 반올림, 결정적 투영). 이 모듈은 행성 격자를 모른다(평면 격자 시험·시뮬레이터도 (x, y, 1)로 쓸 수 있다).
// - 영토 모양(도시 원·도시 사이 띠·비콘 외곽선·영향력 비율 주인)은 @terra/shared/territoryMap 하나다. 1차맵 화면(territoryShapes.ts)도 같은
//   함수를 부른다(D-568). 여기는 서버 자료 → 지도 자리(도시 원 반지름 = 배후지 또는 영향권 × 설정 칸)와 비콘 수·거리 규칙을 맡는다.
// - 거리 = 두 방향 사이 각 × 칸/라디안(평균 칸, 1000분율)이다. 각은 detAtan2(|a×b|, a·b)(결정적 근사)라 엔진과 상관없이 같다.
//   거리는 정확한 값이 아니라 같은 값이 목적이다(겹침 판정·비콘 거리 검사).
import { detAtan2 } from "./detMath.ts";
import {
  TERRITORY_MAP_START,
  type TerritoryMap,
  type TerritoryMapClaim,
  type TerritoryMapSite,
  type TerritoryMapValues,
  buildTerritoryMap,
  territoryBeaconRadius,
  territoryCircleMilli,
  territoryCorridorRadius,
  territoryMapClaim,
  territoryMilliToRadius,
} from "./territoryMap.ts";

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

// ── 영토 배치 ──

/** 도시 하나(영토 원의 중심) */
export interface TerritoryCityInput {
  readonly id: number;
  readonly faction: number;
  readonly point: TerritoryVec;
  /** 도시 등급 1~6(마을~거대도시) */
  readonly grade: number;
  /**
   * 배후지 지금 반경(1000분율 칸, @terra/shared/catchment catchmentRadiusMilli). 영토 원 바탕(D-546 1431 "지금 배후지 기준"). 배후지 규칙이
   * 꺼진 세계(null·없음)는 영향권 반경(M3)이 바탕이다 — 1차맵 화면(world.cities catchmentMilli ?? radiusMilli)과 같다
   */
  readonly catchmentMilli?: number | null | undefined;
}

/** 영토 비콘 하나. anchorCity = 개수·거리를 센 기준 도시(같은 세력의 도시가 아니면 영토를 넓히지 않는다, D-546 1434) */
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

/** 한 세력의 이어진 영토 덩이(도시 원·띠·비콘 외곽선이 이어진 도시·비콘) 하나 — territoryMap 덩이와 같다 */
export interface TerritoryGroup {
  readonly faction: number;
  readonly members: readonly TerritoryVertex[];
}

export interface TerritoryCity extends TerritoryCityInput {
  /** 영향권 반경(1000분율 칸, M3 — 시가지·새 도시 겹침 검사) */
  readonly radiusMilli: number;
  /** 영토 원 반지름(1000분율 칸, 1차맵 지도와 같다 — D-546·D-568). 0이면 영토가 없다 */
  readonly territoryMilli: number;
}

export interface TerritoryLayout {
  readonly metric: TerritoryMetric;
  readonly cities: readonly TerritoryCity[];
  readonly beacons: readonly TerritoryBeaconInput[];
  readonly groups: readonly TerritoryGroup[];
  /** 1차맵 영토 지도(판정·표시 공용, @terra/shared/territoryMap) */
  readonly map: TerritoryMap;
}

/** 소속: 세력, 지방(주인 도시, 비콘이면 그 기준 도시), 주인 자리 종류(도시 | 비콘) */
export type TerritoryClaim = TerritoryMapClaim;

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
 * 영토 배치를 만든다(D-568 — 1차맵 지도와 같은 모양): 도시마다 영토 원(바탕 = 배후지 지금 반경, 없으면 영향권 × 배율, 아래 끝 칸),
 * 같은 국가 도시·비콘을 잇기 상한 안이면 띠로, 비콘은 제 기준 도시(같은 세력)와 늘 잇는다. values = 설정 칸 planet_territory_* 실효 값.
 * 입력 차례와 상관없다(도시·비콘을 ID 차례로 본다)
 */
export function buildTerritory(
  cities: readonly TerritoryCityInput[],
  beacons: readonly TerritoryBeaconInput[],
  rules: TerritoryRules,
  metric: TerritoryMetric,
  values: TerritoryMapValues = TERRITORY_MAP_START,
): TerritoryLayout {
  const sortedCities = cities
    .filter((city) => isTerritoryVec(city.point))
    .toSorted((a, b) => a.id - b.id)
    .map((city) => {
      const radiusMilli = gradeValue(rules.influenceMilli, city.grade);
      const base = typeof city.catchmentMilli === "number" ? city.catchmentMilli : radiusMilli;
      return { ...city, radiusMilli, territoryMilli: territoryCircleMilli(base, values) };
    });
  const sortedBeacons = beacons
    .filter((beacon) => isTerritoryVec(beacon.point))
    .toSorted((a, b) => a.id - b.id);
  const beaconRadius = territoryBeaconRadius(values, metric.milliPerRadian);
  const sites: TerritoryMapSite[] = [
    ...sortedCities.map(
      (city): TerritoryMapSite => ({
        kind: "city",
        id: city.id,
        faction: city.faction,
        point: city.point,
        radius: territoryMilliToRadius(city.territoryMilli, metric.milliPerRadian),
      }),
    ),
    ...sortedBeacons.map(
      (beacon): TerritoryMapSite => ({
        kind: "beacon",
        id: beacon.id,
        faction: beacon.faction,
        point: beacon.point,
        radius: beaconRadius,
        anchorCity: beacon.anchorCity,
      }),
    ),
  ];
  const map = buildTerritoryMap(sites, territoryCorridorRadius(values, metric.milliPerRadian));
  const groups: TerritoryGroup[] = map.groups.map((group) => ({
    faction: group.faction,
    members: group.nodes.map((node) => ({ kind: node.site.kind, id: node.site.id, point: node.site.point })),
  }));
  return { metric, cities: sortedCities, beacons: sortedBeacons, groups, map };
}

/** 점의 소속(1차맵 영토 지도 그대로, D-568). 어느 국가 영토도 아니면 null */
export function claimAt(layout: TerritoryLayout, p: TerritoryVec): TerritoryClaim | null {
  return territoryMapClaim(layout.map, p);
}

// ── 비콘 놓기 검사(서버 권위, 화면 미리 보기도 같은 함수) ──

export const BEACON_PLACE_PROBLEMS = [
  /** 그 세력의 도시가 비콘 거리(N42) 안에 없다 */
  "out_of_range",
  /** 거리 안 도시들의 비콘 수가 모두 찼다(N42) */
  "beacon_limit",
  /**
   * 다른 세력 영토 안(1차맵 지도 그대로, D-568 — 옛 D-486 "다른 세력 도시 영향권 안"을 넓힘: 비콘으로 남의 영토를 잠식하지 못한다).
   * 결과 코드 이름은 프로토콜 그대로 둔다
   */
  "foreign_city",
] as const;
export type BeaconPlaceProblem = (typeof BEACON_PLACE_PROBLEMS)[number];

/**
 * 비콘을 이 점에 놓을 수 있나: 거리 안의 그 세력 도시 가운데 자리가 남은 가장 가까운 도시(같으면 작은 ID)가 기준 도시다.
 * 그 점이 다른 세력 영토(1차맵 지도, D-568)면 막는다. 영토 밖(빈 땅)·내 영토 안은 된다. 같은 칸 비콘·켬끔·세력 확인은 부르는 쪽(서버)이
 * 먼저 한다
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
  if (claim && claim.faction !== faction) return { ok: false, problem: "foreign_city" };
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
