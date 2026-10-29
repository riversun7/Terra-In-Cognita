// [임시] S2 합성 행성 생성 — 실제 생성기(packages/planet, ADR 36 "생성기 1판")가 합쳐지기 전까지 서버 굽기·타일 전송·
// 렌더러 연결을 시험하려고 둔다. 기획 값이 아니다. 실제 생성기가 합쳐지면 이 파일과 TEMP_S2_PLANET(sources.ts)을 지운다.
// - 정육면체 면 위 정수 좌표에서 3D 값 노이즈(fBm)를 쓴다 → 면 경계에서 끊기지 않는다.
// - 위도 = 구 위 점의 z(역삼각함수 없이). 기온은 위도·고도(1:12 축척이라 × 12로 실제 고도), 습도는 강수에서.
// - 사칙연산과 Math.floor·sqrt·round·imul·min·max·abs만 쓴다(같은 시드면 늘 같은 결과).
import {
  FACES,
  FACE_FRAMES,
  type PlanetFields,
  WATER_COAST,
  WATER_DEPTH_SHIFT,
  WATER_LAKE,
  WATER_OCEAN,
  WATER_RIVER,
  cellsPerSide,
  wrapFaceIJ,
} from "@terra/planet";
import { NORMAL_PRESETS, resolvePlanetSettings } from "@terra/planet/generator";

/** 합성 행성 생성기 버전. 출력이 바뀌면 올린다(캐시·타일 주소가 바뀐다) */
export const SYNTHETIC_GENERATOR_VERSION = 1;

/** 임시 바이옴 표 번호 (ADR 36 "바이옴 표 1판은 임시" 목록 순서) */
export const SYNTHETIC_BIOME = {
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

/** [임시] 바이옴 범례 — 콘텐츠 팩 biomes 분류(생성기 작업)가 생기면 그 값으로 바꾼다 */
export const SYNTHETIC_BIOMES = [
  { index: 0, id: "ice_sheet", colour: "#eef4fa", name: { ko: "빙상", en: "Ice sheet" } },
  { index: 1, id: "tundra", colour: "#a9b7a0", name: { ko: "툰드라", en: "Tundra" } },
  { index: 2, id: "taiga", colour: "#4f7a5a", name: { ko: "타이가", en: "Taiga" } },
  { index: 3, id: "temperate_forest", colour: "#4e8f3a", name: { ko: "온대림", en: "Temperate forest" } },
  { index: 4, id: "grassland", colour: "#a7c66b", name: { ko: "초지", en: "Grassland" } },
  { index: 5, id: "desert", colour: "#e3cf8f", name: { ko: "사막", en: "Desert" } },
  { index: 6, id: "savanna", colour: "#c8b45a", name: { ko: "사바나", en: "Savanna" } },
  {
    index: 7,
    id: "tropical_rainforest",
    colour: "#2f7a32",
    name: { ko: "열대우림", en: "Tropical rainforest" },
  },
  { index: 8, id: "wetland", colour: "#5f8f7a", name: { ko: "습지", en: "Wetland" } },
  { index: 9, id: "alpine", colour: "#9a8f86", name: { ko: "고산", en: "Alpine" } },
  { index: 10, id: "ocean_coastal", colour: "#5aa3c8", name: { ko: "연안", en: "Coastal waters" } },
  { index: 11, id: "ocean_shelf", colour: "#3b7fb0", name: { ko: "대륙붕", en: "Continental shelf" } },
  { index: 12, id: "ocean_deep", colour: "#1f4f86", name: { ko: "심해", en: "Deep ocean" } },
  { index: 13, id: "lake", colour: "#4f9fd0", name: { ko: "호수", en: "Lake" } },
] as const;

export interface SyntheticPlanetParams {
  /** 면 레벨(4~14) */
  readonly faceLevel: number;
  /** 시드(u32) */
  readonly seed: number;
}

/** 정수 격자점 해시 → [-1, 1) */
function lattice(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x, 0x8da6_b343) ^ Math.imul(y, 0xd816_3841) ^ Math.imul(z, 0xcb1a_b31f) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b_3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a_2d39);
  h ^= h >>> 15;
  return ((h >>> 0) / 0x1_0000_0000) * 2 - 1;
}

/** 부드러운 걸음(3t² − 2t³) */
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 3D 값 노이즈 (좌표는 0 이상) */
function valueNoise(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const u = smooth(x - xi);
  const v = smooth(y - yi);
  const w = smooth(z - zi);
  const x00 = lerp(lattice(xi, yi, zi, seed), lattice(xi + 1, yi, zi, seed), u);
  const x10 = lerp(lattice(xi, yi + 1, zi, seed), lattice(xi + 1, yi + 1, zi, seed), u);
  const x01 = lerp(lattice(xi, yi, zi + 1, seed), lattice(xi + 1, yi, zi + 1, seed), u);
  const x11 = lerp(lattice(xi, yi + 1, zi + 1, seed), lattice(xi + 1, yi + 1, zi + 1, seed), u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}

/** fBm: 옥타브마다 주파수 2배·세기 반. 점 (x, y, z)는 정육면체 면 위 [-1, 1]³ */
function fbm(x: number, y: number, z: number, octaves: number, baseFrequency: number, seed: number): number {
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  let frequency = baseFrequency;
  for (let octave = 0; octave < octaves; octave++) {
    sum +=
      amplitude *
      valueNoise((x + 1) * frequency, (y + 1) * frequency, (z + 1) * frequency, seed + octave * 0x9e37);
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / total;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** 땅 칸의 바이옴 (기온 °C, 습도 0~255, 고도 게임 m) */
function landBiome(temperature: number, humidity: number, elevation: number): number {
  if (temperature < -16) return SYNTHETIC_BIOME.iceSheet;
  if (temperature < -5) return SYNTHETIC_BIOME.tundra;
  if (elevation > 520) return SYNTHETIC_BIOME.alpine;
  if (temperature < 3) return SYNTHETIC_BIOME.taiga;
  if (humidity < 50) return temperature > 18 ? SYNTHETIC_BIOME.desert : SYNTHETIC_BIOME.grassland;
  if (humidity < 110) return temperature > 20 ? SYNTHETIC_BIOME.savanna : SYNTHETIC_BIOME.grassland;
  if (temperature > 20) return SYNTHETIC_BIOME.tropicalRainforest;
  if (elevation < 60 && humidity > 200) return SYNTHETIC_BIOME.wetland;
  return SYNTHETIC_BIOME.temperateForest;
}

/** 바이옴별 숲 밀도 기본값 */
const FOREST_BY_BIOME: readonly number[] = [0, 10, 160, 190, 25, 0, 50, 230, 90, 5, 0, 0, 0, 0];

/** FNV-1a 32비트 (16진수 8자) — 출력 해시(meta.hash) */
function fnv1a(arrays: readonly ArrayBufferView[]): string {
  let hash = 0x811c_9dc5;
  for (const array of arrays) {
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x0100_0193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** [임시] 합성 행성 하나 (면 레벨 9 = 칸 157만 개, 개발 컨테이너에서 약 1초 — 작업 기록) */
export function generateSyntheticPlanet(params: SyntheticPlanetParams): PlanetFields {
  const { faceLevel } = params;
  const seed = params.seed >>> 0;
  const n = cellsPerSide(faceLevel);
  const count = 6 * n * n;
  const elevationM = new Int16Array(count);
  const biome = new Uint8Array(count);
  const temperatureC = new Int8Array(count);
  const precipitationMm = new Uint16Array(count);
  const humidity = new Uint8Array(count);
  const water = new Uint8Array(count);
  const river = new Uint8Array(count);
  const forest = new Uint8Array(count);

  for (const face of FACES) {
    const { normal, uAxis, vAxis } = FACE_FRAMES[face];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        // 칸 가운데의 정육면체 위 점 [-1, 1]³ (면 경계 양쪽 칸이 같은 3D 공간을 쓴다)
        const s = (2 * i + 1 - n) / n;
        const t = (2 * j + 1 - n) / n;
        const x = normal[0] + s * uAxis[0] + t * vAxis[0];
        const y = normal[1] + s * uAxis[1] + t * vAxis[1];
        const z = normal[2] + s * uAxis[2] + t * vAxis[2];
        const sinLatitude = z / Math.sqrt(x * x + y * y + z * z);
        const at = face * n * n + j * n + i;

        const height = fbm(x, y, z, 6, 1.5, seed) + 0.35 * fbm(x, y, z, 2, 0.7, seed ^ 0x5bd1_e995) - 0.1;
        const elevation = clamp(Math.round(height * 1900), -950, 740);
        elevationM[at] = elevation;

        // 기온: 적도 30°C → 극 −18°C, 실제 고도(× 12) 1km마다 −6.5°C, 노이즈 ±4°C
        const realHeightKm = (Math.max(0, elevation) * 12) / 1000;
        const temperature = Math.round(
          30 -
            48 * sinLatitude * sinLatitude -
            6.5 * realHeightKm +
            4 * fbm(x, y, z, 1, 2, seed ^ 0x27d4_eb2f),
        );
        temperatureC[at] = clamp(temperature, -60, 45);

        // 강수: 적도·중위도 습윤, 노이즈로 건조 지대
        const wet = fbm(x, y, z, 2, 1.2, seed ^ 0x1656_67b1);
        const precipitation = clamp(Math.round(1300 + 1400 * wet - 700 * Math.abs(sinLatitude)), 0, 4000);
        precipitationMm[at] = precipitation;
        humidity[at] = clamp(Math.round((precipitation * 255) / 2600), 0, 255);

        if (elevation < 0) {
          const depth = elevation > -60 ? 1 : elevation > -250 ? 2 : 3;
          water[at] = WATER_OCEAN | (depth << WATER_DEPTH_SHIFT);
          biome[at] = SYNTHETIC_BIOME.oceanCoastal + depth - 1;
          continue;
        }
        // 강: 노이즈가 0을 지나는 곳(가는 줄), 호수: 낮은 땅의 작은 덩어리
        const channel = Math.abs(fbm(x, y, z, 2, 3, seed ^ 0x2f69_3a5d));
        if (elevation < 600 && channel < 0.02) {
          river[at] = channel < 0.006 ? 3 : channel < 0.012 ? 2 : 1;
          water[at] = WATER_RIVER;
        } else if (elevation < 300 && fbm(x, y, z, 1, 6, seed ^ 0x7f4a_7c15) > 0.5) {
          water[at] = WATER_LAKE;
          biome[at] = SYNTHETIC_BIOME.lake;
          continue;
        }
        const kind = landBiome(temperatureC[at] ?? 0, humidity[at] ?? 0, elevation);
        biome[at] = kind;
        const jitter = Math.round(20 * fbm(x, y, z, 1, 8, seed ^ 0x3c6e_f372));
        forest[at] = clamp((FOREST_BY_BIOME[kind] ?? 0) + (FOREST_BY_BIOME[kind] ? jitter : 0), 0, 255);
      }
    }
  }

  // 해안: 4이웃에 바다가 있는 땅 칸. 면 가장자리 칸만 wrapFaceIJ로 이웃 면을 본다
  const oceanAt = (at: number): boolean => ((water[at] ?? 0) & WATER_OCEAN) !== 0;
  const steps: readonly (readonly [number, number])[] = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  for (const face of FACES) {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const at = face * n * n + j * n + i;
        if (oceanAt(at)) continue;
        let coast: boolean;
        if (i > 0 && i < n - 1 && j > 0 && j < n - 1) {
          coast = oceanAt(at - 1) || oceanAt(at + 1) || oceanAt(at - n) || oceanAt(at + n);
        } else {
          coast = steps.some(([di, dj]) => {
            const next = wrapFaceIJ(face, faceLevel, i + di, j + dj);
            return next !== null && oceanAt(next.face * n * n + next.j * n + next.i);
          });
        }
        if (coast) water[at] = (water[at] ?? 0) | WATER_COAST;
      }
    }
  }

  const arrays = [elevationM, biome, temperatureC, precipitationMm, humidity, water, river, forest];
  return {
    elevationM,
    biome,
    temperatureC,
    precipitationMm,
    humidity,
    water,
    river,
    forest,
    meta: {
      generatorVersion: SYNTHETIC_GENERATOR_VERSION,
      seed,
      faceLevel,
      // 합성 원본은 세부 수치를 쓰지 않는다(메타 모양만 맞춘다)
      settings: resolvePlanetSettings(NORMAL_PRESETS),
      hash: fnv1a(arrays),
    },
  };
}
