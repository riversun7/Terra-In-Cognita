// [임시] 1차맵 시험 화면용 가짜 행성 — 진짜 행성은 서버가 굽는다(ADR 36 "서버 굽기·전송", 생성기는 packages/planet).
// 서버 타일이 이어지면 이 파일·mockPlanetSource.ts·mockPlanetWorker.ts와 시험 화면의 사용처를 함께 지운다.
// 같은 시드·요청이면 늘 같은 타일이다. 모양은 진짜 타일과 같다(DecodedTile: 꼭짓점 높이 (size+1)², 칸 자료 size²).
// - 꼭짓점 높이는 그 꼭짓점 방향만의 함수다 → 같은 레벨 이웃(면 경계 너머 포함)과 위·아래 레벨이 같은 꼭짓점에서 같은 높이다.
// - 대륙: 낮은 주파수 노이즈의 문턱(땅 약 35~40%). 산맥: 능선 노이즈. 바다: 문턱에서 멀수록 깊다(연안 → 대륙붕 → 심해).
// - 기온: 위도(z = sin 위도) + 고도 감소(실제 고도 = 게임 m × 12, 6.5°C/km). 습도: 위도 띠(적도 습함, 30° 건조, 50° 습함) + 내륙 건조 + 노이즈.
// - 바이옴: 기온 × 습도 표(ADR 36의 1판 목록과 같은 종류, 번호는 이 가짜 자료만의 것), 호수·강은 노이즈 무늬.
import { planetRadiusMeters } from "@terra/planet/projection";
import { faceSTDirection } from "../planet/tileShape.ts";
import {
  type DecodedTile,
  type PlanetDescription,
  type TileRequest,
  WATER_BITS,
  WATER_DEPTH_SHIFT,
} from "../planet/planetTypes.ts";
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

/** 방향 (x, y, z)의 높이(게임 m) */
export function mockHeightAt(x: number, y: number, z: number, seed: number): number {
  const c = continentAt(x, y, z, seed) - LAND_THRESHOLD;
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

/** 가짜 타일 하나(같은 시드·요청이면 같은 값) */
export function generateMockTile(request: TileRequest, seed: number, faceLevel: number): DecodedTile {
  const { face, mapLevel, i0, j0, size } = request;
  const cellsPerFace = 2 ** mapLevel;
  const row = size + 1;
  const heightsM = new Int16Array(row * row);
  for (let cj = 0; cj < row; cj++) {
    for (let ci = 0; ci < row; ci++) {
      const d = faceSTDirection(face, (i0 + ci) / cellsPerFace, (j0 + cj) / cellsPerFace);
      heightsM[cj * row + ci] = Math.round(mockHeightAt(d[0], d[1], d[2], seed));
    }
  }
  const cells = size * size;
  const biome = new Uint8Array(cells);
  const water = new Uint8Array(cells);
  const temperatureC = new Int8Array(cells);
  const humidity = new Uint8Array(cells);
  const forest = new Uint8Array(cells);
  const river = new Uint8Array(cells);
  for (let cj = 0; cj < size; cj++) {
    for (let ci = 0; ci < size; ci++) {
      const c = cj * size + ci;
      const h00 = heightsM[cj * row + ci] ?? 0;
      const h10 = heightsM[cj * row + ci + 1] ?? 0;
      const h01 = heightsM[(cj + 1) * row + ci] ?? 0;
      const h11 = heightsM[(cj + 1) * row + ci + 1] ?? 0;
      const mean = (h00 + h10 + h01 + h11) / 4;
      const low = Math.min(h00, h10, h01, h11);
      const high = Math.max(h00, h10, h01, h11);
      const [x, y, z] = faceSTDirection(face, (i0 + ci + 0.5) / cellsPerFace, (j0 + cj + 0.5) / cellsPerFace);
      const latitude = Math.abs(z);
      const ocean = mean < 0;
      // 해수면 기온: 적도 27°C, 30° 약 24°C, 45° 약 14°C, 60° 약 −3°C, 극 −25°C(z⁴ 꼴)
      const z2 = z * z;
      const seaTemperature = 27 - 52 * z2 * z2 + noise3(x * 4, y * 4, z * 4, seed + 41) * 3;
      const temperature = ocean ? seaTemperature : seaTemperature - 0.078 * Math.max(0, mean);
      const inland = clamp((continentAt(x, y, z, seed) - LAND_THRESHOLD) * 3.2, 0, 1);
      let wet =
        band(latitude) + fbm3(x * 3.4, y * 3.4, z * 3.4, seed + 53, 2) * 0.45 - (ocean ? 0 : inland * 0.38);
      wet = clamp(wet, 0, 1);
      let bits = 0;
      let kind: number;
      let riverGrade = 0;
      if (ocean) {
        bits |= WATER_BITS.ocean;
        const depthClass = mean > -45 ? 1 : mean > -160 ? 2 : 3;
        bits |= depthClass << WATER_DEPTH_SHIFT;
        kind = depthClass === 1 ? BIOME.oceanCoastal : depthClass === 2 ? BIOME.oceanShelf : BIOME.oceanDeep;
        wet = 1;
      } else {
        const lake = noise3(x * 23, y * 23, z * 23, seed + 61) > 0.46 && mean < 160 && wet > 0.35;
        if (lake) {
          bits |= WATER_BITS.lake;
          kind = BIOME.lake;
        } else {
          kind = landBiome(temperature, wet, mean);
          const meander = Math.abs(noise3(x * 9.5, y * 9.5, z * 9.5, seed + 71));
          const width = 0.03 * (0.5 + wet);
          if (meander < width && mean < 520 && kind !== BIOME.iceSheet && kind !== BIOME.desert) {
            riverGrade = meander < width / 3 ? 3 : meander < (width * 2) / 3 ? 2 : 1;
            bits |= WATER_BITS.river;
          }
        }
      }
      if (low < 0 && high >= 0) bits |= WATER_BITS.coast;
      biome[c] = kind;
      water[c] = bits;
      temperatureC[c] = Math.round(clamp(temperature, -60, 50));
      humidity[c] = Math.round(wet * 255);
      const base = FOREST_BASE[kind] ?? 0;
      forest[c] = Math.round(
        clamp(base * (0.8 + noise3(x * 15, y * 15, z * 15, seed + 83) * 0.5), 0, 1) * 255,
      );
      river[c] = riverGrade;
    }
  }
  return {
    faceLevel,
    mapLevel,
    face,
    i0,
    j0,
    size,
    heightsM,
    biome,
    water,
    temperatureC,
    humidity,
    forest,
    river,
  };
}
