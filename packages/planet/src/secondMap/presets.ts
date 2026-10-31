// 2차맵 시험 자리 찾기·칸 값 — 개발자 2차맵 시험 화면(/dev/second-map, ADR 46 "구현하며 정한 것 (개발자 2차맵 시험)").
// 서버(월드 행성 값)와 기기 워커(편집기 2차맵 미리보기 워커의 행성 값)가 같은 함수를 쓴다. 정수 계산만 한다(결정성 검사 대상).
// - 자리 찾기: 행성 값 전체를 3×3 칸 묶음으로 훑어 종류마다 점수가 가장 높은 묶음의 가운데 칸 = 2차맵 키.
//   점수는 2차맵 측정 명령(bench/secondMap.ts)과 같은 생각이다(강·바닷가·호수·산·숲) + 초지. 같은 점수면 먼저 찾은 것(면·j·i 차례).
// - 칸 값: 2차맵 하나 = 면 레벨 F 칸 하나다. 바이옴·기온·습도 같은 값은 그 칸 하나의 값이다(2차맵 안에서는 지형만 이어 그린다).
import { cellKey, decodeCellKey, isCellKey } from "../cellKey.ts";
import { FACES } from "../faces.ts";
import { cellsPerSide } from "../levels.ts";
import { type PlanetValues, readPlanetValuesCell } from "./planetValues.ts";

/** 시험 자리 종류 */
export const MAP_PRESETS = ["river", "coast", "lake", "mountain", "forest", "grassland"] as const;
export type MapPreset = (typeof MAP_PRESETS)[number];

/** 물 비트(생성기 water): 바다 1, 호수 2, 강 4, 해안 8 */
const WATER_OCEAN = 1;
const WATER_LAKE = 2;
const WATER_RIVER = 4;
/** 강 점수에 세는 하천 등급(걸어서 못 건너는 큰 강 쪽) */
const RIVER_ORDER_MIN = 2;
/** 산 점수: 이 높이(게임 m)보다 높은 칸 */
const HIGH_M = 250;

function blockScore(
  values: PlanetValues,
  preset: MapPreset,
  grassland: number,
  cells: readonly number[],
): number {
  let ocean = 0;
  let lake = 0;
  let river = 0;
  let forest = 0;
  let grass = 0;
  let high = 0;
  let low = 32_767;
  let top = -32_768;
  for (const c of cells) {
    const water = values.water[c] ?? 0;
    if (water & WATER_OCEAN) ocean++;
    if (water & WATER_LAKE) lake++;
    if (water & WATER_RIVER && (values.river[c] ?? 0) >= RIVER_ORDER_MIN) river++;
    forest += values.forest[c] ?? 0;
    if ((values.biome[c] ?? -1) === grassland) grass++;
    const elevation = values.elevationM[c] ?? 0;
    if (elevation > HIGH_M) high++;
    if (elevation < low) low = elevation;
    if (elevation > top) top = elevation;
  }
  const relief = top - low;
  const centre = cells[4] ?? 0;
  const centreWater = values.water[centre] ?? 0;
  switch (preset) {
    case "coast":
      // 바다가 조금(묶음의 절반 아래) 있고 가운데는 땅
      return ocean > 0 && ocean < 4 && (centreWater & WATER_OCEAN) === 0 ? ocean * 10 + river : -1;
    case "lake":
      return lake > 0 && ocean === 0 ? lake * 10 + river : -1;
    case "mountain":
      // 높이 차가 큰 곳(고저 과장 시험): 높이 차 + 높은 칸
      return ocean === 0 ? relief * 4 + high : -1;
    case "forest":
      return ocean === 0 && lake === 0 ? forest : -1;
    case "grassland":
      return grassland >= 0 && ocean === 0 && lake === 0 ? grass * 4096 - relief : -1;
    default:
      // 강: 가운데 칸에 큰 강이 지나면 더한다
      return ocean === 0 ? river * 2 + ((centreWater & WATER_RIVER) !== 0 ? 5 : 0) : -1;
  }
}

/**
 * 종류에 맞는 2차맵 키(면 레벨 F 칸). 맞는 곳이 없으면 null(예: 바다가 없는 행성의 바닷가).
 * 면마다 가장자리 한 줄은 묶음 가운데로 쓰지 않는다(묶음이 면 하나 안에 들게)
 */
export function findMapPreset(values: PlanetValues, preset: MapPreset): number | null {
  const level = values.faceLevel;
  const n = cellsPerSide(level);
  const grassland = values.biomeIds.indexOf("grassland");
  const cells: number[] = Array.from({ length: 9 }, () => 0);
  let best = -1;
  let found: number | null = null;
  for (const face of FACES) {
    const offset = face * n * n;
    for (let j = 1; j + 1 < n; j += 3) {
      for (let i = 1; i + 1 < n; i += 3) {
        let k = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) cells[k++] = offset + (j + dj) * n + (i + di);
        }
        const score = blockScore(values, preset, grassland, cells);
        if (score > best) {
          best = score;
          found = cellKey(face, level, i, j);
        }
      }
    }
  }
  return found;
}

/** 2차맵 하나(면 레벨 F 칸)의 행성 값 */
export interface PlanetCellValues {
  readonly mapKey: number;
  readonly face: number;
  readonly i: number;
  readonly j: number;
  /** 바이옴 ID(행성 바이옴 표). 표 밖이면 null */
  readonly biomeId: string | null;
  /** 칸 고도(게임 m, 해수면 0) */
  readonly elevationM: number;
  readonly temperatureC: number;
  /** 0 ~ 255 */
  readonly humidity: number;
  readonly precipitationMm: number;
  /** 물 비트(바다 1·호수 2·강 4·해안 8, 바다는 수심 등급 비트도 있다) */
  readonly water: number;
  /** 하천 등급(0 = 강 없음) */
  readonly riverOrder: number;
  /** 숲 밀도 0 ~ 255 */
  readonly forest: number;
}

/** 키 → 면·i·j·배열 번호(면 레벨 faceLevel). 셀 키가 아니거나 레벨이 다르면 RangeError */
function cellOf(mapKey: number, faceLevel: number) {
  if (!isCellKey(mapKey)) throw new RangeError(`map key must be a cell key: ${mapKey}`);
  const { face, level, i, j } = decodeCellKey(mapKey);
  if (level !== faceLevel) {
    throw new RangeError(`map key level ${level} differs from planet face level ${faceLevel}`);
  }
  const n = cellsPerSide(level);
  return { face, i, j, index: face * n * n + j * n + i };
}

/** 2차맵 키의 행성 값. 셀 키가 아니거나 면 레벨이 다르면 RangeError */
export function planetCellValues(values: PlanetValues, mapKey: number): PlanetCellValues {
  const { face, i, j, index: c } = cellOf(mapKey, values.faceLevel);
  const biome = values.biome[c] ?? 0;
  return {
    mapKey,
    face,
    i,
    j,
    biomeId: values.biomeIds[biome] ?? null,
    elevationM: values.elevationM[c] ?? 0,
    temperatureC: values.temperatureC[c] ?? 0,
    humidity: values.humidity[c] ?? 0,
    precipitationMm: values.precipitationMm[c] ?? 0,
    water: values.water[c] ?? 0,
    riverOrder: values.river[c] ?? 0,
    forest: values.forest[c] ?? 0,
  };
}

/**
 * 행성 값 파일(서버 캐시·행성 서비스가 주는 바이트)에서 2차맵 키의 칸 값만 읽는다(전체를 풀지 않는다). 틀리면 RangeError
 */
export function planetCellValuesFromFile(bytes: Uint8Array, mapKey: number): PlanetCellValues {
  if (!isCellKey(mapKey)) throw new RangeError(`map key must be a cell key: ${mapKey}`);
  const level = decodeCellKey(mapKey).level;
  const { face, i, j, index } = cellOf(mapKey, level);
  const cell = readPlanetValuesCell(bytes, index);
  if (cell.faceLevel !== level) {
    throw new RangeError(`map key level ${level} differs from planet face level ${cell.faceLevel}`);
  }
  return {
    mapKey,
    face,
    i,
    j,
    biomeId: cell.biomeId,
    elevationM: cell.elevationM,
    temperatureC: cell.temperatureC,
    humidity: cell.humidity,
    precipitationMm: cell.precipitationMm,
    water: cell.water,
    riverOrder: cell.river,
    forest: cell.forest,
  };
}
