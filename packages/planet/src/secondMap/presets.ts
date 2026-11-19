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

/** 3×3 묶음 안에서 바이옴 대표 2차맵 점수(높을수록 그 바이옴 특징·오브젝트가 잘 드러난다) */
function biomeBlockScore(
  values: PlanetValues,
  biomeIndex: number,
  biomeId: string,
  cells: readonly number[],
): number {
  let same = 0;
  let ocean = 0;
  let lake = 0;
  let river = 0;
  let land = 0;
  let forest = 0;
  for (const c of cells) {
    if ((values.biome[c] ?? -1) === biomeIndex) same += 1;
    const w = values.water[c] ?? 0;
    if (w & WATER_OCEAN) ocean += 1;
    if (w & WATER_LAKE) lake += 1;
    if (w & WATER_RIVER) river += 1;
    if ((w & (WATER_OCEAN | WATER_LAKE)) === 0) land += 1;
    forest += values.forest[c] ?? 0;
  }
  let score = same * 100;
  if (biomeId === "ocean_coastal") {
    // 연안은 물·모래사장·갯바위가 함께 드러나는 해안 경계 묶음을 우선한다
    if (ocean > 0 && land > 0) score += 250 + Math.min(ocean, land) * 20;
  } else if (biomeId === "lake") {
    // 호수도 호숫가·물 위 오브젝트가 함께 보이게 땅이 닿은 묶음을 우선한다
    if (lake > 0 && land > 0) score += 250 + Math.min(lake, land) * 20;
  } else if (biomeId === "wetland") {
    score += river * 25 + Math.floor(forest / 32);
  } else if (biomeId === "temperate_forest" || biomeId === "tropical_rainforest" || biomeId === "taiga") {
    score += Math.floor(forest / 24) + (river > 0 ? 20 : 0);
  } else if (biomeId === "savanna" || biomeId === "grassland") {
    score += (river > 0 ? 25 : 0) + Math.floor(forest / 48);
  }
  return score;
}

/**
 * 바이옴마다 대표 2차맵 키 목록(최대 maxPerBiome개, 행성 24구역 가운데 점수가 높은 서로 떨어진 자리).
 * 개발자 지형 오브젝트·2차맵 통합 화면이 14개 바이옴 어디로든 바로 건너뛸 때 쓴다.
 */
export function findBiomeMapKeys(values: PlanetValues, maxPerBiome = 8): Map<string, number[]> {
  const level = values.faceLevel;
  const n = cellsPerSide(level);
  const half = Math.max(1, Math.floor(n / 2));
  const biomeCount = values.biomeIds.length;
  const bucketsPerBiome = FACES.length * 4;
  // 바이옴 × 구역마다 최고 점수 후보 하나만 남긴다(메모리 일정, 서로 떨어진 자리 보장)
  const bestScore = new Int32Array(biomeCount * bucketsPerBiome).fill(-1);
  const bestKey = new Float64Array(biomeCount * bucketsPerBiome);
  const cells: number[] = Array.from({ length: 9 }, () => 0);

  const scan = (step: number, onlyMissing: boolean): void => {
    for (const face of FACES) {
      const offset = face * n * n;
      for (let j = 1; j + 1 < n; j += step) {
        const bj = j >= half ? 2 : 0;
        for (let i = 1; i + 1 < n; i += step) {
          const centre = offset + j * n + i;
          const biomeIndex = values.biome[centre] ?? -1;
          if (biomeIndex < 0 || biomeIndex >= biomeCount) continue;
          const biomeId = values.biomeIds[biomeIndex] ?? "";
          const bucket = biomeIndex * bucketsPerBiome + face * 4 + bj + (i >= half ? 1 : 0);
          if (onlyMissing && (bestScore[bucket] ?? -1) >= 0) continue;
          let k = 0;
          for (let dj = -1; dj <= 1; dj++) {
            for (let di = -1; di <= 1; di++) cells[k++] = offset + (j + dj) * n + (i + di);
          }
          const score = biomeBlockScore(values, biomeIndex, biomeId, cells);
          if (score > (bestScore[bucket] ?? -1)) {
            bestScore[bucket] = score;
            bestKey[bucket] = cellKey(face, level, i, j);
          }
        }
      }
    }
  };

  scan(3, false);
  // 3칸 띄워 훑어서 한 칸도 못 찾은 드문 바이옴이 있으면 1칸 간격으로 채운다
  let hasMissing = false;
  for (let b = 0; b < biomeCount; b++) {
    let any = false;
    for (let slot = 0; slot < bucketsPerBiome; slot++) {
      if ((bestScore[b * bucketsPerBiome + slot] ?? -1) >= 0) {
        any = true;
        break;
      }
    }
    if (!any) {
      hasMissing = true;
      break;
    }
  }
  if (hasMissing) scan(1, true);

  const out = new Map<string, number[]>();
  const cap = Math.max(1, Math.floor(maxPerBiome));
  for (let b = 0; b < biomeCount; b++) {
    const id = values.biomeIds[b];
    if (!id) continue;
    const picked: { score: number; key: number }[] = [];
    for (let slot = 0; slot < bucketsPerBiome; slot++) {
      const score = bestScore[b * bucketsPerBiome + slot] ?? -1;
      if (score >= 0) picked.push({ score, key: bestKey[b * bucketsPerBiome + slot] ?? 0 });
    }
    picked.sort((a, bItem) => bItem.score - a.score || a.key - bItem.key);
    out.set(
      id,
      picked.slice(0, cap).map((item) => item.key),
    );
  }
  return out;
}

/** 바이옴 하나의 대표 2차맵 키(variant로 서로 다른 후보를 돈다). 행성에 그 바이옴이 없으면 null */
export function findBiomeMapKey(values: PlanetValues, biomeId: string, variant = 0): number | null {
  const list = findBiomeMapKeys(values).get(biomeId);
  if (!list || list.length === 0) return null;
  const index = Math.abs(Math.floor(variant)) % list.length;
  return list[index] ?? null;
}

/** 2차맵 하나(면 레벨 F 칸)의 행성 값 */
export interface PlanetCellValues {
  readonly mapKey: number;
  readonly face: number;
  readonly i: number;
  readonly j: number;
  /** 면 레벨 F(2차맵 키의 레벨 — 칸 자리 노이즈, @terra/shared/catchment resourceNoisePm) */
  readonly faceLevel?: number;
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
    faceLevel: values.faceLevel,
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
    faceLevel: level,
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
