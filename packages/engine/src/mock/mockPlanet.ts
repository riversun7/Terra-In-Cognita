// [임시] 가짜 행성 — 엔진 단위 시험용(1차맵 화면은 서버가 실제 생성기로 구운 타일을 그린다, ADR 36 "서버 굽기·전송").
// 시드 노이즈로 면 레벨 F의 칸 값(PlanetFields)을 만들고, 타일은 서버 굽기와 같은 코드(@terra/planet의
// aggregatePlanetLevels·planetCornerHeights·buildPlanetTile)로 만든다. 그래서 진짜 타일과 규칙이 같다(ADR 36 "타일"):
// - 윗 레벨 칸 = 아래 2×2칸에서 모은다(고도·기온·습도·숲 평균, 바이옴 최빈, 물·하천 규칙).
// - 꼭짓점 높이 = 그 꼭짓점을 나누는 칸들의 평균(면 경계 너머 칸 포함, 큐브 꼭짓점은 3칸).
//   → 같은 레벨 이웃은 맞닿은 변 높이가 같고, 레벨이 다른 타일은 같은 자리 꼭짓점이라도 높이가 다르다(치마가 막아야 하는 차이).
// 처음 타일을 만들 때 행성 전체 칸 값을 한 번 만든다(면 레벨 9 = 157만 칸, 이 컨테이너에서 몇 초 — 시험은 작은 면 레벨을 쓴다).
// 칸 값: 대륙(낮은 주파수 노이즈의 문턱, 땅 약 35~40%)·산맥(능선)·언덕, 바다 수심 등급(얕을수록 연안),
// 기온(위도 z = sin 위도 + 고도 감소: 게임 m × 12, 6.5°C/km), 습도(위도 띠 + 내륙 건조 + 노이즈), 바이옴(기온 × 습도 표),
// 호수·강(노이즈 무늬), 해안(바다와 맞닿은 8이웃 칸). 같은 시드·면 레벨이면 늘 같은 값이다.
import {
  DEPTH_COASTAL,
  DEPTH_DEEP,
  DEPTH_SHELF,
  type Face,
  FACES,
  type PlanetFields,
  type PlanetFieldsMeta,
  type PlanetLevel,
  WATER_COAST,
  WATER_DEPTH_SHIFT,
  WATER_LAKE,
  WATER_OCEAN,
  WATER_RIVER,
  aggregatePlanetLevels,
  buildPlanetTile,
  planetCellCount,
  planetCornerHeights,
  planetTileKey,
  planetTileSize,
  wrapFaceIJ,
} from "@terra/planet";
import { planetRadiusMeters } from "@terra/planet/projection";
import type { PlanetSettings } from "@terra/shared";
import type { DecodedTile, PlanetDescription, TileRequest } from "../planet/planetTypes.ts";
import { faceSTDirection } from "../planet/tileShape.ts";
import { fbm3, noise3 } from "./mockNoise.ts";

/** [임시] 가짜 바이옴 표(번호 = 순서). 이름·색은 표시용 */
export const MOCK_PLANET_BIOMES = [
  { id: "ice_sheet", name: { ko: "빙상", en: "Ice sheet" }, color: 0xf2f7fb },
  { id: "tundra", name: { ko: "툰드라", en: "Tundra" }, color: 0xc7ceb3 },
  { id: "taiga", name: { ko: "타이가", en: "Taiga" }, color: 0x5f9a72 },
  { id: "temperate_forest", name: { ko: "온대림", en: "Temperate forest" }, color: 0x6fbf63 },
  { id: "grassland", name: { ko: "초지", en: "Grassland" }, color: 0xaed98d },
  { id: "desert", name: { ko: "사막", en: "Desert" }, color: 0xf1d89c },
  { id: "savanna", name: { ko: "사바나", en: "Savanna" }, color: 0xd9cf7b },
  { id: "tropical_rainforest", name: { ko: "열대우림", en: "Tropical rainforest" }, color: 0x3f9e5a },
  { id: "wetland", name: { ko: "습지", en: "Wetland" }, color: 0x7fb59a },
  { id: "alpine", name: { ko: "고산", en: "Alpine" }, color: 0xb5ada4 },
  { id: "ocean_coastal", name: { ko: "연안", en: "Coastal sea" }, color: 0x9fdcef },
  { id: "ocean_shelf", name: { ko: "대륙붕", en: "Shelf sea" }, color: 0x7cc6e6 },
  { id: "ocean_deep", name: { ko: "심해", en: "Deep sea" }, color: 0x4f97cf },
  { id: "lake", name: { ko: "호수", en: "Lake" }, color: 0x86cbe8 },
] as const;

const BIOME = {
  iceSheet: 0,
  tundra: 1,
  taiga: 2,
  temperateForest: 3,
  grassland: 4,
  desert: 5,
  savanna: 6,
  tropicalRainforest: 7,
  wetland: 8,
  alpine: 9,
  oceanCoastal: 10,
  oceanShelf: 11,
  oceanDeep: 12,
  lake: 13,
} as const;

/** 바이옴별 기본 숲 밀도(0~1) */
const FOREST_BASE: Readonly<Record<number, number>> = {
  [BIOME.taiga]: 0.65,
  [BIOME.temperateForest]: 0.75,
  [BIOME.tropicalRainforest]: 0.92,
  [BIOME.savanna]: 0.22,
  [BIOME.wetland]: 0.35,
  [BIOME.grassland]: 0.1,
};

/** 가장 높은 땅(게임 m, 에베레스트 8,849m ÷ 12 ≈ 737m) */
export const MOCK_MAX_ELEVATION_M = 760;
const MIN_ELEVATION_M = -950;
/** 대륙 문턱: 이보다 크면 땅 */
const LAND_THRESHOLD = 0.04;

/** 생성기 메타의 세부 수치 자리(타일 만들기는 읽지 않는다 — 가짜 행성은 노이즈만 쓴다) */
const MOCK_SETTINGS: PlanetSettings = {
  landPercent: 38,
  shelfPercent: 0,
  plateCount: 2,
  upliftPercent: 0,
  ruggednessPercent: 100,
  erosionPercent: 0,
  hotspotCount: 0,
  volcanismPercent: 0,
  equatorTemperatureC: 27,
  poleTemperatureC: -25,
  precipitationPercent: 100,
  riverDensityPercent: 100,
  lakePercent: 100,
};

/** 생성기 메타 자리(가짜): 타일 만들기는 면 레벨만 읽는다 */
export function mockFieldsMeta(seed: number, faceLevel: number): PlanetFieldsMeta {
  return { generatorVersion: 0, seed, faceLevel, settings: MOCK_SETTINGS, hash: "00000000" };
}

export function mockPlanetDescription(faceLevel = 9): PlanetDescription {
  return {
    faceLevel,
    radiusM: planetRadiusMeters(faceLevel),
    biomeColors: MOCK_PLANET_BIOMES.map((biome) => biome.color),
    maxElevationM: MOCK_MAX_ELEVATION_M,
  };
}

/** 대륙 값(약 −0.6 ~ 0.6): 문턱보다 크면 땅 */
function continentAt(x: number, y: number, z: number, seed: number): number {
  const warp = fbm3(x * 2.3 + 11.1, y * 2.3, z * 2.3, seed + 31, 2) * 0.25;
  return fbm3(x * 1.15 + warp, y * 1.15 - warp, z * 1.15 + warp, seed, 5);
}

/** 방향 (x, y, z)의 높이(게임 m). continent = continentAt(같은 방향) */
function heightAt(x: number, y: number, z: number, seed: number, continent: number): number {
  const c = continent - LAND_THRESHOLD;
  if (c < 0) return Math.max(MIN_ELEVATION_M, c * 3600 - 4);
  const ridge = 1 - Math.abs(noise3(x * 5.2, y * 5.2, z * 5.2, seed + 7));
  const mountainMask = Math.max(0, fbm3(x * 1.7, y * 1.7, z * 1.7, seed + 13, 2) + 0.12);
  const hills = fbm3(x * 9, y * 9, z * 9, seed + 17, 3) * 30;
  // 가까이서 보이는 굴곡: 파장 약 13km(칸 9개)부터 세 겹, 산이 많은 곳일수록 크게 + 잔 능선
  const detail = fbm3(x * 40, y * 40, z * 40, seed + 19, 3) * (16 + 380 * mountainMask);
  const fine = 1 - Math.abs(noise3(x * 23, y * 23, z * 23, seed + 23));
  const height =
    2 +
    c * 260 +
    ridge * ridge * ridge * mountainMask * 1300 +
    hills +
    detail +
    fine * fine * mountainMask * 420;
  return Math.min(MOCK_MAX_ELEVATION_M, Math.max(1, height));
}

/** 위도 띠 습도(|z| = sin 위도의 조각 선형 표) */
const HUMIDITY_BANDS: readonly (readonly [number, number])[] = [
  [0, 0.88],
  [0.22, 0.66],
  [0.45, 0.24],
  [0.62, 0.6],
  [0.8, 0.56],
  [1, 0.3],
];

function band(latitude: number): number {
  for (let i = 1; i < HUMIDITY_BANDS.length; i++) {
    const [x1, y1] = HUMIDITY_BANDS[i] ?? [1, 0];
    const [x0, y0] = HUMIDITY_BANDS[i - 1] ?? [0, 0];
    if (latitude <= x1) return y0 + ((y1 - y0) * (latitude - x0)) / (x1 - x0);
  }
  return HUMIDITY_BANDS[HUMIDITY_BANDS.length - 1]?.[1] ?? 0.3;
}

function landBiome(temperature: number, humidity: number, height: number): number {
  if (temperature < -12) return BIOME.iceSheet;
  if (height > 430 && temperature < 4) return BIOME.alpine;
  if (temperature < -2) return BIOME.tundra;
  if (temperature < 5) return humidity > 0.45 ? BIOME.taiga : BIOME.tundra;
  if (humidity > 0.84 && height < 40) return BIOME.wetland;
  if (temperature < 19)
    return humidity > 0.55 ? BIOME.temperateForest : humidity > 0.28 ? BIOME.grassland : BIOME.desert;
  return humidity > 0.66 ? BIOME.tropicalRainforest : humidity > 0.32 ? BIOME.savanna : BIOME.desert;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** 8이웃(면 경계 너머 포함, 큐브 꼭짓점 너머는 없다) 중 바다가 있는지 */
function touchesOcean(water: Uint8Array, faceLevel: number, face: Face, i: number, j: number): boolean {
  const n = 1 << faceLevel;
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      if (di === 0 && dj === 0) continue;
      const target = wrapFaceIJ(face, faceLevel, i + di, j + dj);
      if (!target) continue;
      if (((water[target.face * n * n + target.j * n + target.i] ?? 0) & WATER_OCEAN) !== 0) return true;
    }
  }
  return false;
}

/**
 * 면 레벨 faceLevel의 칸 값 전부(생성기 출력과 같은 모양 PlanetFields, 칸 순서 = 면 × n² + j × n + i).
 * 칸 값은 칸 가운데 방향의 노이즈다. 강수는 타일에 넣지 않으므로 0이다.
 */
export function generateMockFields(seed: number, faceLevel: number): PlanetFields {
  const n = 1 << faceLevel;
  const count = planetCellCount(faceLevel);
  const elevationM = new Int16Array(count);
  const biome = new Uint8Array(count);
  const temperatureC = new Int8Array(count);
  const humidity = new Uint8Array(count);
  const water = new Uint8Array(count);
  const river = new Uint8Array(count);
  const forest = new Uint8Array(count);
  for (const face of FACES) {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const index = face * n * n + j * n + i;
        const [x, y, z] = faceSTDirection(face, (i + 0.5) / n, (j + 0.5) / n);
        const continent = continentAt(x, y, z, seed);
        const height = Math.round(heightAt(x, y, z, seed, continent));
        elevationM[index] = height;
        // 해수면 기온: 적도 27°C, 30° 약 24°C, 45° 약 14°C, 60° 약 −3°C, 극 −25°C(z⁴ 꼴)
        const z2 = z * z;
        const seaTemperature = 27 - 52 * z2 * z2 + noise3(x * 4, y * 4, z * 4, seed + 41) * 3;
        if (height < 0) {
          const depthClass = height > -45 ? DEPTH_COASTAL : height > -160 ? DEPTH_SHELF : DEPTH_DEEP;
          water[index] = WATER_OCEAN | (depthClass << WATER_DEPTH_SHIFT);
          biome[index] =
            depthClass === DEPTH_COASTAL
              ? BIOME.oceanCoastal
              : depthClass === DEPTH_SHELF
                ? BIOME.oceanShelf
                : BIOME.oceanDeep;
          temperatureC[index] = Math.round(clamp(seaTemperature, -60, 50));
          humidity[index] = 255;
          continue;
        }
        const temperature = seaTemperature - 0.078 * height;
        const inland = clamp((continent - LAND_THRESHOLD) * 3.2, 0, 1);
        const wet = clamp(
          band(Math.abs(z)) + fbm3(x * 3.4, y * 3.4, z * 3.4, seed + 53, 2) * 0.45 - inland * 0.38,
          0,
          1,
        );
        let kind: number;
        let bits = 0;
        let grade = 0;
        if (noise3(x * 23, y * 23, z * 23, seed + 61) > 0.46 && height < 160 && wet > 0.35) {
          bits |= WATER_LAKE;
          kind = BIOME.lake;
        } else {
          kind = landBiome(temperature, wet, height);
          const meander = Math.abs(noise3(x * 9.5, y * 9.5, z * 9.5, seed + 71));
          const width = 0.03 * (0.5 + wet);
          if (meander < width && height < 520 && kind !== BIOME.iceSheet && kind !== BIOME.desert) {
            grade = meander < width / 3 ? 3 : meander < (width * 2) / 3 ? 2 : 1;
            bits |= WATER_RIVER;
          }
        }
        water[index] = bits;
        biome[index] = kind;
        river[index] = grade;
        temperatureC[index] = Math.round(clamp(temperature, -60, 50));
        humidity[index] = Math.round(wet * 255);
        const base = FOREST_BASE[kind] ?? 0;
        forest[index] = Math.round(
          clamp(base * (0.8 + noise3(x * 15, y * 15, z * 15, seed + 83) * 0.5), 0, 1) * 255,
        );
      }
    }
  }
  // 해안: 바다와 맞닿은(8이웃) 바다가 아닌 칸 — 바다를 모두 정한 뒤에 본다(@terra/planet fields.ts의 뜻)
  for (const face of FACES) {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const index = face * n * n + j * n + i;
        const bits = water[index] ?? 0;
        if ((bits & WATER_OCEAN) === 0 && touchesOcean(water, faceLevel, face, i, j)) {
          water[index] = bits | WATER_COAST;
        }
      }
    }
  }
  return {
    elevationM,
    biome,
    temperatureC,
    precipitationMm: new Uint16Array(count),
    humidity,
    water,
    river,
    forest,
    meta: mockFieldsMeta(seed, faceLevel),
  };
}

/** 가짜 행성 타일 만들기 — 칸 값은 처음 쓸 때 한 번 만들고, 꼭짓점 높이는 맵 레벨마다 한 번 만든다 */
export interface MockTileMaker {
  readonly seed: number;
  readonly faceLevel: number;
  /** 맵 레벨 하나의 칸 값(ADR 36 모으기 결과, 행성 전체) — 시험이 규칙을 본다 */
  level(mapLevel: number): PlanetLevel;
  /** 타일 하나(서버 굽기와 같은 코드: buildPlanetTile). 요청이 타일 경계와 맞지 않으면 RangeError */
  tile(request: TileRequest): DecodedTile;
}

/** 시드 노이즈 가짜 행성의 타일 만들기 */
export function createMockTileMaker(seed: number, faceLevel: number): MockTileMaker {
  return createTileMaker(seed, faceLevel, () => generateMockFields(seed, faceLevel));
}

/** 칸 값(처음 쓸 때 makeFields로 한 번 만든다) → 타일 만들기. 시험이 정한 칸 값으로도 쓴다 */
export function createTileMaker(
  seed: number,
  faceLevel: number,
  makeFields: () => PlanetFields,
): MockTileMaker {
  let levels: Map<number, PlanetLevel> | null = null;
  const corners = new Map<number, Int16Array>();
  const levelOf = (mapLevel: number): PlanetLevel => {
    levels ??= new Map(aggregatePlanetLevels(makeFields()).map((level) => [level.level, level]));
    const level = levels.get(mapLevel);
    if (!level)
      throw new RangeError(`map level ${mapLevel} is not a 1st-map level of face level ${faceLevel}`);
    return level;
  };
  return {
    seed,
    faceLevel,
    level: levelOf,
    tile(request) {
      const { face, mapLevel, i0, j0, size } = request;
      if (size !== planetTileSize(mapLevel))
        throw new RangeError(`tile size must be ${planetTileSize(mapLevel)}`);
      const level = levelOf(mapLevel);
      let levelCorners = corners.get(mapLevel);
      if (!levelCorners) {
        levelCorners = planetCornerHeights(level);
        corners.set(mapLevel, levelCorners);
      }
      const key = planetTileKey(mapLevel, face, i0, j0);
      return buildPlanetTile(faceLevel, level, levelCorners, { key, mapLevel, face, i0, j0, size });
    },
  };
}
