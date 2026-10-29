// 칸 정보(D-214 정보창의 1단계) — 누른 점의 위도·경도 → 미리보기 면 레벨의 칸 → 생성 결과 값. ADR 38 7절, 설계 D.5·F
// 길: 위도·경도 → 방향(엔진과 같은 식, 옮겨 적음) → xyzToCell(면 레벨 F) → decodeCellKey → 칸 번호 면·n² + j·n + i
// → 결과 배열의 정확한 값(타일 값이 아니다: 타일은 모은 값이고 강수가 없다).
// 수심 등급은 물 비트(4~5번)에서 읽는다. 생성기는 등급을 반올림 전 깊이로 정하고 저장 고도는 12m 단위로 반올림하므로,
// 경계에서는 보이는 고도와 등급이 어긋날 수 있다(예: "실제 60m · 연안", generator/surface.ts) — 창이 이 점을 적는다.
// 칸 경계 위의 점은 xyzToCell 규칙대로 한쪽 칸이 된다. 위도·경도를 거치면 방향에 1e-16 정도의 오차가 생겨(예: 경도 ±180°는
// 면 3의 칸 경계라 sin(±π)의 부호가 칸을 정한다) 경계 바로 위에서는 엔진이 고른 칸과 이웃 칸으로 갈릴 수 있다.
// 누른 점은 위도·경도로 기억한다: 새 결과(다른 면 레벨)가 와도 같은 곳의 값을 다시 읽는다(설계 D.5).
// 설명 묶음(바이옴 판정 설명 explainBiome 등, 생성기 도우미 WP-A·특수 지형)은 explainers로 붙인다: 창 부품은 칸 값과
// 묶음 목록만 받는다(ADR 38 7절). 이 파일은 저장 필드만 읽으므로 생성기 판이 바뀌어도 그대로다.
import {
  type CellKey,
  type Face,
  WATER_COAST,
  WATER_DEPTH_MASK,
  WATER_DEPTH_SHIFT,
  WATER_LAKE,
  WATER_OCEAN,
  WATER_RIVER,
  cellsPerSide,
  decodeCellKey,
} from "@terra/planet";
import { type PlanetBiome, type PlanetFields, VERTICAL_SCALE } from "@terra/planet/generator";
import { type Vec3, xyzToCell } from "@terra/planet/projection";
import { OCEAN_DEPTH_CLASSES, type OceanDepthClass } from "@terra/shared";

/** 도(°) → 라디안. 엔진(packages/engine globeCamera.ts)과 같은 상수·같은 곱셈 순서라 방향 값이 비트까지 같다 */
const DEG = Math.PI / 180;

/** 위도·경도(°) → 구 위 방향. 엔진 globeCamera.ts directionOfLatLon과 같은 식이다(그쪽은 내보내지 않아 옮겨 적는다) */
export function directionOfLatLon(latDeg: number, lonDeg: number): Vec3 {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
}

/** 결과 배열 안의 칸 하나 */
export interface CellLocation {
  readonly key: CellKey;
  readonly faceLevel: number;
  readonly face: Face;
  readonly i: number;
  readonly j: number;
  /** 결과 배열 번호 = 면 × n² + j × n + i */
  readonly index: number;
}

/** 위도·경도(°)가 들어 있는 면 레벨 faceLevel의 칸. 위도·경도가 유한한 수가 아니면 RangeError */
export function cellAtLatLon(faceLevel: number, latDeg: number, lonDeg: number): CellLocation {
  if (!Number.isFinite(latDeg) || !Number.isFinite(lonDeg)) {
    throw new RangeError(`latitude and longitude must be finite: ${latDeg}, ${lonDeg}`);
  }
  const key = xyzToCell(directionOfLatLon(latDeg, lonDeg), faceLevel);
  const { face, i, j } = decodeCellKey(key);
  const n = cellsPerSide(faceLevel);
  return { key, faceLevel, face, i, j, index: face * n * n + j * n + i };
}

/** 물 비트를 푼 값 */
export interface CellWater {
  readonly ocean: boolean;
  readonly lake: boolean;
  /** 강 비트(하천 등급 > 0인 육지 칸) */
  readonly river: boolean;
  /** 해안(바다와 맞닿은 바다 아닌 칸) */
  readonly coast: boolean;
  /** 수심 등급(바다만, 4~5비트). 바다가 아니거나 0이면 null */
  readonly depthClass: OceanDepthClass | null;
}

/** 물 비트 → 뜻 */
export function decodeWater(water: number): CellWater {
  const depth = (water & WATER_DEPTH_MASK) >> WATER_DEPTH_SHIFT;
  const ocean = (water & WATER_OCEAN) !== 0;
  return {
    ocean,
    lake: (water & WATER_LAKE) !== 0,
    river: (water & WATER_RIVER) !== 0,
    coast: (water & WATER_COAST) !== 0,
    // 등급 1·2·3 = 연안·대륙붕·심해(OCEAN_DEPTH_CLASSES 순서)
    depthClass: ocean && depth > 0 ? (OCEAN_DEPTH_CLASSES[depth - 1] ?? null) : null,
  };
}

/** 칸 하나의 정확한 값(생성 결과 배열에서) */
export interface CellValues {
  readonly location: CellLocation;
  /** 누른 점(칸 가운데가 아니다) */
  readonly latDeg: number;
  readonly lonDeg: number;
  /** 고도(게임 m, 해수면 0). 바다·호수는 바닥 */
  readonly elevationM: number;
  /** 실제 환산 고도(m) = 게임 m × VERTICAL_SCALE(12) */
  readonly realElevationM: number;
  /** 물 비트 그대로 + 푼 값 */
  readonly waterBits: number;
  readonly water: CellWater;
  /** 하천 등급(Strahler, 0 = 없음) */
  readonly riverOrder: number;
  readonly temperatureC: number;
  readonly precipitationMm: number;
  /** 습도 0~255 */
  readonly humidity: number;
  /** 숲 밀도 0~255 */
  readonly forest: number;
  /** 바이옴 표 번호와 ID(표에 없으면 null) */
  readonly biomeIndex: number;
  readonly biomeId: string | null;
  /** 출처: 생성기 판(결과 메타) */
  readonly generatorVersion: number;
}

/** 칸 값 → 설명 묶음 하나(없으면 null). 바이옴 판정 설명·특수 지형 설명이 이 모양으로 붙는다 */
export type CellExplainer<S> = (values: CellValues, biomes: readonly PlanetBiome[]) => S | null;

export interface CellReport<S> {
  readonly values: CellValues;
  /** 설명 묶음(explainers 순서, null은 뺀다) */
  readonly sections: readonly S[];
}

function at(array: ArrayLike<number>, index: number): number {
  const value = array[index];
  if (value === undefined) throw new RangeError(`cell ${index} is outside the result`);
  return value;
}

/** 결과(fields)에서 위도·경도의 칸 값을 읽는다. 바이옴 표(biomes)는 그 결과를 만든 생성기 입력의 표다 */
export function readCell(
  fields: PlanetFields,
  biomes: readonly PlanetBiome[],
  latDeg: number,
  lonDeg: number,
): CellValues {
  const location = cellAtLatLon(fields.meta.faceLevel, latDeg, lonDeg);
  const { index } = location;
  const elevationM = at(fields.elevationM, index);
  const waterBits = at(fields.water, index);
  const biomeIndex = at(fields.biome, index);
  return {
    location,
    latDeg,
    lonDeg,
    elevationM,
    realElevationM: elevationM * VERTICAL_SCALE,
    waterBits,
    water: decodeWater(waterBits),
    riverOrder: at(fields.river, index),
    temperatureC: at(fields.temperatureC, index),
    precipitationMm: at(fields.precipitationMm, index),
    humidity: at(fields.humidity, index),
    forest: at(fields.forest, index),
    biomeIndex,
    biomeId: biomes[biomeIndex]?.id ?? null,
    generatorVersion: fields.meta.generatorVersion,
  };
}

/** 칸 값 + 설명 묶음. 설명 함수가 늘어나도(WP-A explainBiome, 특수 지형) 이 함수는 그대로다 */
export function cellReport<S>(
  fields: PlanetFields,
  biomes: readonly PlanetBiome[],
  latDeg: number,
  lonDeg: number,
  explainers: readonly CellExplainer<S>[] = [],
): CellReport<S> {
  const values = readCell(fields, biomes, latDeg, lonDeg);
  const sections: S[] = [];
  for (const explain of explainers) {
    const section = explain(values, biomes);
    if (section !== null) sections.push(section);
  }
  return { values, sections };
}
