// 좌표 이동의 지형 빠르기 — 기획 D-564 2차 답 1643("좌표 이동도 지형 감속"), docs/adr/2026-11-15-unloaded-second-maps.md "바뀜 (D-564)" WP-4,
// docs/adr/2026-11-14-segment-speed.md(구간 빠르기: 걸음 배율 = 그 칸 지형 비용 ‰).
// - 띄우지 않은 2차맵은 지형이 없으므로 행성 값(바이옴·기온·숲·물, 그 2차맵 = 1차맵 칸 하나)으로 그 2차맵의 평균 걸음 배율을 셈한다.
//   표는 2차맵 생성기·띄운 2차맵과 같은 것을 쓴다: 바이옴 바닥 비중(@terra/planet/secondMap BIOME_SURFACES — 생성기가 바닥을 고르는 표) ×
//   지표 비용(@terra/sim SURFACE_COST — 띄운 2차맵 구간 빠르기의 칸 값), 기온이 눈 문턱(생성기 SNOW_TEMPERATURE_C) 이하면 풀·흙·자갈·진흙은 눈,
//   숲 밀도(0 ~ 255)를 숲 칸 몫으로 보고 그 몫만 숲 비용 배율(FOREST_COST_PM)을 곱한다(Assumed — 생성기 숲 칸 몫과 밀도가 비례한다고 본다).
//   [임시] 바다·호수 2차맵(걷는 유닛이 좌표로 지날 때)은 얕은 물 비용.
// - 바뀜(기획 D-564 1643·질문 1903 — 사용자 "강·비탈 포함", 좌표 이동 3): 강과 비탈도 넣는다. 모두 [임시](질문 2031·2032).
//   · 강: 하천 등급 1~2는 생성기처럼 얕은 물이라 그 2차맵의 RIVER_SHALLOW_PM × 등급 몫을 얕은 물 비용으로 바꾼다. 등급 3 이상은 깊은 물(막힘)이라
//     돌아가는 몫 RIVER_DETOUR_PM × 등급만큼 배율을 늘린다.
//   · 비탈: 이웃 2차맵(동서남북 넷, 행성 값)과의 고도 차 가장 큰 값을 그 2차맵을 가로지르는 기울기로 보고, 생성기가 바위로 만드는 지형 칸 높이 차
//     (ROCK_RELIEF_CM 450cm) × 지형 칸 수(128) = 576m에서 2차맵 전체가 바위라고 보아 그 몫만 바위 비용으로 바꾼다(Assumed — 지형 노이즈가 더하는
//     잔 높이 차는 보지 않는다). 해수면 아래 고도는 0으로 본다(해안 절벽을 바다 바닥과 견주지 않게).
// - 도로(D-5052)는 2차맵에 아직 없다(Verified: 구간 빠르기 ADR 2절) — 도로 기능 때 도로 칸 배율(max(1000, 기본 ÷ 도로 최고))을 넣는다.
// - 좌표 구간 하나(hop)는 여러 2차맵을 지난다: 지나는 띄우지 않은 2차맵(+ 출발·목적이 띄우지 않은 것이면 그것도)의 배율을 고르게 평균해
//   곧은 거리에 곱한다(시간 거리). 배(물 길)는 배율 없이 1000(구간 빠르기 ADR 2절 — 물 위 빠르기 기획 없음).
// 정수 사칙연산·Math.floor·Math.ceil만 쓴다(같은 행성 값이면 늘 같은 값).
import {
  BIOME_SURFACES,
  DEFAULT_MIX,
  SM_SURFACE,
  SNOW_TEMPERATURE_C,
  stepMapCell,
} from "@terra/planet/secondMap";
import type { PlanetCellValues } from "@terra/planet/secondMap";
import { isCellKey } from "@terra/planet";
import { FOREST_COST_PM, MAX_PACE, PACE_BASE, SURFACE_COST } from "@terra/sim";

/** 물 비트(생성기 water): 바다 1, 호수 2 */
const WATER_OCEAN = 1;
const WATER_LAKE = 2;
/** 숲 밀도 상한(행성 값 0 ~ 255) */
const FOREST_MAX = 255;
/** [임시] 하천 등급 1~2: 등급 하나마다 얕은 물로 건너는 몫(‰) */
export const RIVER_SHALLOW_PM = 30;
/** [임시] 하천 등급 3 이상(깊은 물 — 막힘): 등급 하나마다 돌아가는 몫(‰) */
export const RIVER_DETOUR_PM = 40;
/** 2차맵 전체가 바위가 되는 이웃 고도 차(m) = 생성기 바위 높이 차 4.5m × 지형 칸 128 */
export const ROCK_FULL_RELIEF_M = 576;
/** 얕은 물로 건너는 강의 가장 높은 등급(생성기와 같다) */
const SHALLOW_RIVER_MAX = 2;

const snowy = (kind: number): boolean =>
  kind === SM_SURFACE.grass ||
  kind === SM_SURFACE.dirt ||
  kind === SM_SURFACE.gravel ||
  kind === SM_SURFACE.mud;

/** 비탈 바위 몫(‰): 이웃과의 고도 차 가장 큰 값 ÷ ROCK_FULL_RELIEF_M(해수면 아래는 0) */
export function slopeRockPm(
  cell: PlanetCellValues,
  neighbors: readonly (PlanetCellValues | undefined)[],
): number {
  const here = Math.max(0, cell.elevationM);
  let relief = 0;
  for (const next of neighbors)
    if (next) relief = Math.max(relief, Math.abs(here - Math.max(0, next.elevationM)));
  return Math.min(1000, Math.floor((relief * 1000) / ROCK_FULL_RELIEF_M));
}

/** 동서남북 이웃 2차맵 키(정육면체 면 경계를 넘는다). 셀 키가 아니면(시험 2차맵 등) 빈 목록 */
export function neighborMapKeys(mapKey: number): number[] {
  const out: number[] = [];
  if (!isCellKey(mapKey)) return out;
  try {
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const step = stepMapCell(mapKey, 0, 0, 0, dx, dy);
      if (step && step.mapKey !== mapKey) out.push(step.mapKey);
    }
  } catch {
    return [];
  }
  return out;
}

/** 바닥 비용을 몫(‰)만큼 다른 비용으로 바꾼다 */
const blend = (base: number, other: number, sharePm: number): number =>
  Math.floor((base * (1000 - sharePm) + other * sharePm) / 1000);

/**
 * 그 2차맵(행성 값 칸 하나)의 평균 걸음 배율(‰, 1000 ~ MAX_PACE). 값을 모르면 1000. neighbors = 이웃 2차맵 행성 값(비탈, 없으면 비탈 없음)
 */
export function coordPacePm(
  cell: PlanetCellValues | undefined,
  neighbors: readonly (PlanetCellValues | undefined)[] = [],
): number {
  if (!cell) return PACE_BASE;
  let surface: number;
  if ((cell.water & (WATER_OCEAN | WATER_LAKE)) !== 0)
    surface = SURFACE_COST[SM_SURFACE.shallowWater] ?? PACE_BASE;
  else {
    const mix = (cell.biomeId === null ? undefined : BIOME_SURFACES[cell.biomeId]) ?? DEFAULT_MIX;
    const snow = cell.temperatureC <= SNOW_TEMPERATURE_C;
    let total = 0;
    let weighted = 0;
    for (const [kind, weight] of mix) {
      const shown = snow && snowy(kind) ? SM_SURFACE.snow : kind;
      const cost = SURFACE_COST[shown] ?? 0;
      // 막힌 바닥(물 0)은 평균에 넣지 않는다(그 칸은 돌아간다)
      if (cost === 0 || weight <= 0) continue;
      total += weight;
      weighted += weight * cost;
    }
    surface = total > 0 ? Math.floor(weighted / total) : PACE_BASE;
    // 비탈(바위)·얕은 강(1903)
    surface = blend(surface, SURFACE_COST[SM_SURFACE.rock] ?? PACE_BASE, slopeRockPm(cell, neighbors));
    if (cell.riverOrder >= 1 && cell.riverOrder <= SHALLOW_RIVER_MAX)
      surface = blend(
        surface,
        SURFACE_COST[SM_SURFACE.shallowWater] ?? PACE_BASE,
        Math.min(1000, cell.riverOrder * RIVER_SHALLOW_PM),
      );
  }
  const forest = Math.max(0, Math.min(FOREST_MAX, cell.forest));
  const scale = FOREST_MAX * 1000;
  let pace = Math.floor((surface * (scale + forest * (FOREST_COST_PM - 1000))) / scale);
  // 깊은 강(등급 3 이상)은 돌아간다(1903)
  const landRiver = (cell.water & (WATER_OCEAN | WATER_LAKE)) === 0 && cell.riverOrder > SHALLOW_RIVER_MAX;
  if (landRiver) pace = Math.floor((pace * (1000 + cell.riverOrder * RIVER_DETOUR_PM)) / 1000);
  return Math.max(PACE_BASE, Math.min(MAX_PACE, pace));
}

/**
 * 좌표 구간 하나의 시간 거리(단위·배율 반영): route[from..to] 가운데 지형이 없는 2차맵(띄운 출발·도착 2차맵은 변에서 끝나므로 뺀다)의
 * 배율 평균 × 곧은 거리. 셀 2차맵이 없으면 곧은 거리 그대로
 */
export function hopPaceDistance(
  route: readonly number[],
  hop: { readonly from: number; readonly to: number; readonly distance: number },
  paceOf: (mapKey: number) => number,
  loaded: (mapKey: number) => boolean,
): number {
  let sum = 0;
  let count = 0;
  for (let index = hop.from; index <= hop.to; index++) {
    const mapKey = route[index];
    if (mapKey === undefined) continue;
    if ((index === hop.from || index === hop.to) && loaded(mapKey)) continue;
    sum += paceOf(mapKey);
    count += 1;
  }
  if (count === 0) return hop.distance;
  const average = Math.floor(sum / count);
  return Math.ceil((hop.distance * average) / PACE_BASE);
}
