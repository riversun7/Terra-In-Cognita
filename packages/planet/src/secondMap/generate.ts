// 2차맵 생성기 — 행성 값(면 레벨 F 칸)에서 2차맵 하나(지형 칸 128²·꼭짓점 129²)를 만든다. ADR 2026-10-31-second-map-from-planet(46).
// 결정적이다: 정수·사칙연산·Math.sqrt만 쓴다(판정 자료를 만든다). 같은 입력이면 서버·기기·엔진과 무관하게 같은 결과·해시다.
// 이음매: 높이·물 높이를 이루는 값(바탕 높이, 잔기복 세기, 바다·호수 몫, 호수 수면, 노이즈, 강 물길)이 모두
// 공유 변·꼭짓점에서 맞닿은 2차맵과 같은 값을 낸다(cellPatch.ts·latticeNoise.ts·rivers.ts 머리 주석). 시험: seams.test.ts.
// 차례: 바탕 높이(칸 고도의 2차 조각) + 잔기복(노이즈 5겹 × 세기) → 강 깎기 → 호수 깎기 → 물 높이 → 지형 칸마다 바이옴·지표
// → 배치 칸마다 엄폐 값·소품 그림(placement.ts, 소품 규칙 = 콘텐츠 map_props).
import { WATER_LAKE, WATER_OCEAN } from "../tiles/fields.ts";
import { NEIGHBOR_DI, NEIGHBOR_DJ } from "../generator/grid.ts";
import { wrapFaceIJ } from "../faces.ts";
import { cellsPerSide, pow2 } from "../levels.ts";
import { cellSizeMeters, planetRadiusMeters } from "../projection.ts";
import { NET_SCALE, bernsteinTable, controlNet, netSum, netValue } from "./cellPatch.ts";
import { hashSecondMap } from "./hash.ts";
import { latticeNoiseGrid, layerSalt } from "./latticeNoise.ts";
import { SM_PLACEMENT, SM_TERRAIN, SM_VERTICES, floorDiv, mapCoords, neighbourhood } from "./layout.ts";
import { placeProps } from "./placement.ts";
import type { PlanetValues } from "./planetValues.ts";
import type { PropRuleSet } from "./props.ts";
import { cellFaceIJ, rasterizeChannels, riverLayout } from "./rivers.ts";
import { BIOME_ROUGHNESS, BIOME_SURFACES, DEFAULT_MIX, SM_SURFACE, pickSurface } from "./surfaces.ts";
import { SECOND_MAP_GENERATOR_VERSION } from "./version.ts";

/** 물이 없는 꼭짓점의 물 높이 */
export const NO_WATER = -2_147_483_648;

/** 2차맵 하나의 결과(판정 자료: 서버가 원본, 지형 파일 TCTR 2판으로 보낸다) */
export interface SecondMapTerrain {
  readonly mapKey: number;
  readonly faceLevel: number;
  readonly generatorVersion: number;
  /** 꼭짓점 높이(cm, 해수면 0) 129², 행 우선(행 r × 129 + 열 c) */
  readonly heightsCm: Int32Array;
  /** 꼭짓점 물 높이(cm). 물이 없으면 NO_WATER. 물은 높이 < 물 높이인 곳에 있다 */
  readonly waterLevelCm: Int32Array;
  /** 지형 칸 지표(SM_SURFACE) 128² */
  readonly surface: Uint8Array;
  /** 배치 칸 엄폐 값(0 없음·1 은폐·2 차폐, ADR 35) 256² */
  readonly cover: Uint8Array;
  /** 배치 칸 소품 그림 번호(@terra/shared MAP_PROP_ARTS, 기기 장식용) 256² */
  readonly art: Uint8Array;
  /** 쓴 소품 규칙의 해시(결과가 규칙에 달려 있어 캐시 열쇠에 넣는다) */
  readonly propRulesHash: string;
  /** 지형 칸 한 변 실제 길이(mm, 표시용: 2차맵마다 약 ±10%) */
  readonly cellSizeMm: number;
  /** 결과 해시(FNV-1a 32비트 16진수 8자리) */
  readonly hash: string;
}

/** 노이즈 층 소금 번호(행성 시드와 섞는다) */
const LAYER_DETAIL = 1;
const LAYER_RIVER = 2;
const LAYER_BIOME = 3;
const LAYER_SURFACE = 4;
const LAYER_SHORE = 5;

/** 잔기복 노이즈 겹: [격자 간격 log2(꼭짓점), 무게]. 약 750m ~ 47m(넓은 둔덕 + 잔물결), 무게 합 31 */
const DETAIL_OCTAVES: readonly (readonly [number, number])[] = [
  [6, 16],
  [5, 8],
  [4, 4],
  [3, 2],
  [2, 1],
];
const DETAIL_WEIGHT_SUM = 31;

/** [임시] 잔기복 세기(cm) = 150 + 둘레 높이 차(게임 m) × 25, 150 ~ 3,000, 바이옴 배율(천분율) */
const ROUGHNESS_BASE_CM = 150;
const ROUGHNESS_PER_M = 25;
const ROUGHNESS_MAX_CM = 3000;
/** 비탈이 이 높이 차(cm, 지형 칸 네 꼭짓점) 이상이면 바위 지표(S1 임시값 ROCK_RELIEF_CM과 같다) */
const ROCK_RELIEF_CM = 450;
/**
 * 이 기온(°C, 칸 가운데) 이하면 풀·흙·자갈·진흙에 눈이 덮인다. 문턱을 노이즈로 ±2°C 흔든다: 1차맵 칸 기온이 정수라
 * 등온선이 곧은 줄이 되는 곳이 있었다(헤드리스 그림, 고산 블록)
 */
export const SNOW_TEMPERATURE_C = -2;
const SNOW_JITTER_CENTI = 200;
/**
 * 물가 모양: 바다·호수 몫(0 ~ 1000, 1차맵 칸의 바다·호수 비트를 같은 2차 조각으로 매끈하게 한 값) + 노이즈(±150)가 500인 곳이
 * 물가다. 물가에서는 높이가 수면 ± 30cm이고, 몫 차이 300까지 원래 높이로 부드럽게(smoothstep) 돌아간다(clamp가 아니라 섞기라
 * 끊기는 곳이 없다). 그래서 1차맵의 땅·물 구분을 따르면서 이웃과 이어진다. 바다 쪽은 땅 칸을 0으로 본 깊이, 땅 쪽은 바다 칸을
 * 0으로 본 높이를 쓴다(깊은 바다 칸이 바닷가 땅을 물 아래로 끌어내리지 않게).
 */
const SHORE_HALF = 500;
const SHORE_LIFT_CM = 30;
const SHORE_RAMP = 300;
const SHORE_NOISE = 150;
const SHORE_RAMP_CUBE = SHORE_RAMP * SHORE_RAMP * SHORE_RAMP;

/** 물가에서 몫 차이 d(0 이상)만큼 떨어진 곳의 원래 높이 몫(정수 smoothstep, 분모 SHORE_RAMP³) */
function shoreRamp(d: number): number {
  const x = Math.min(SHORE_RAMP, Math.max(0, d));
  return x * x * (3 * SHORE_RAMP - 2 * x);
}

/** 물가 높이 target에서 원래 높이 natural로 몫 차이 d만큼 돌아간 높이 */
function towardShore(target: number, natural: number, d: number): number {
  return target + floorDiv((natural - target) * shoreRamp(d), SHORE_RAMP_CUBE);
}

const isOcean = (values: PlanetValues, cell: number): boolean =>
  cell >= 0 && ((values.water[cell] ?? 0) & WATER_OCEAN) !== 0;

/**
 * 칸 하나의 잔기복 세기(cm): 둘레 8칸 가운데 같은 쪽(바다끼리·땅끼리) 칸과의 가장 큰 고도 차로 정한다.
 * 칸 번호의 함수라 어느 2차맵에서 보아도 같다. 바닷가 땅이 깊은 바다 칸 때문에 거칠어지지 않게 다른 쪽 칸은 뺀다.
 */
function roughnessCm(values: PlanetValues, cell: number): number {
  if (cell < 0) return ROUGHNESS_BASE_CM;
  const { face, i, j } = cellFaceIJ(values.faceLevel, cell);
  const n = cellsPerSide(values.faceLevel);
  const own = values.elevationM[cell] ?? 0;
  const ocean = isOcean(values, cell);
  let maxDiff = 0;
  for (let k = 0; k < 8; k++) {
    const next = wrapFaceIJ(face, values.faceLevel, i + (NEIGHBOR_DI[k] ?? 0), j + (NEIGHBOR_DJ[k] ?? 0));
    if (!next) continue;
    const other = next.face * n * n + next.j * n + next.i;
    if (isOcean(values, other) !== ocean) continue;
    const diff = Math.abs((values.elevationM[other] ?? 0) - own);
    if (diff > maxDiff) maxDiff = diff;
  }
  const base = Math.min(ROUGHNESS_MAX_CM, ROUGHNESS_BASE_CM + maxDiff * ROUGHNESS_PER_M);
  const biomeId = values.biomeIds[values.biome[cell] ?? 0] ?? "";
  return floorDiv(base * (BIOME_ROUGHNESS[biomeId] ?? 1000), 1000);
}

/**
 * 조절점 9개(controlNet과 같은 차례)마다 그 점을 이루는 칸들의 호수 수면 최댓값(cm). 호수 칸이 없으면 NO_WATER.
 * 칸 모음이 면 틀과 상관없이 같아 공유 변에서 같은 값이 나온다.
 */
function lakeControlLevels(values: PlanetValues, nb: Int32Array): Int32Array {
  const at = (di: number, dj: number): number => nb[(dj + 1) * 3 + (di + 1)] ?? -1;
  const levelOf = (cells: readonly number[]): number => {
    let best = NO_WATER;
    for (const cell of cells) {
      if (cell < 0 || ((values.water[cell] ?? 0) & WATER_LAKE) === 0) continue;
      best = Math.max(best, (values.lakeSurfaceM[cell] ?? 0) * 100);
    }
    return best;
  };
  const out = new Int32Array(9);
  for (let b = 0; b < 3; b++) {
    for (let a = 0; a < 3; a++) {
      const di = a - 1;
      const dj = b - 1;
      const cells: number[] = [at(0, 0)];
      if (di !== 0) cells.push(at(di, 0));
      if (dj !== 0) cells.push(at(0, dj));
      if (di !== 0 && dj !== 0) cells.push(at(di, dj));
      out[b * 3 + a] = levelOf(cells);
    }
  }
  return out;
}

/** 칸 안 위치 x(0 ~ 128)에서 무게가 0이 아닌 조절점 열(0·1·2) */
const activeColumns = (x: number): readonly number[] => (x === 0 ? [0] : x === SM_TERRAIN ? [2] : [0, 1, 2]);

/**
 * 2차맵 하나를 만든다. 행성 값의 면 레벨과 2차맵 키의 레벨이 다르거나, 소품 규칙이 다른 바이옴 표로 만든 것이면 RangeError.
 * rules는 compileMapProps(콘텐츠 map_props, 행성 바이옴 표)의 결과다.
 */
export function generateSecondMap(
  values: PlanetValues,
  mapKey: number,
  rules: PropRuleSet,
): SecondMapTerrain {
  const map = mapCoords(mapKey);
  if (map.faceLevel !== values.faceLevel) {
    throw new RangeError(`map key level ${map.faceLevel} differs from planet face level ${values.faceLevel}`);
  }
  const nb = neighbourhood(map);
  const t7 = bernsteinTable(7);
  const t8 = bernsteinTable(8);
  const full7 = NET_SCALE * pow2(28);

  const elevationNet = controlNet(nb, (cell) => (values.elevationM[cell] ?? 0) * 100);
  // 바닷가용: 땅 쪽 높이(바다 칸 = 0)와 바다 쪽 깊이(땅 칸 = 0)
  const landElevationNet = controlNet(nb, (cell) =>
    isOcean(values, cell) ? 0 : (values.elevationM[cell] ?? 0) * 100,
  );
  const seaElevationNet = controlNet(nb, (cell) =>
    isOcean(values, cell) ? (values.elevationM[cell] ?? 0) * 100 : 0,
  );
  const roughnessNet = controlNet(nb, (cell) => roughnessCm(values, cell));
  const oceanNet = controlNet(nb, (cell) => (((values.water[cell] ?? 0) & WATER_OCEAN) !== 0 ? 1 : 0));
  const lakeNet = controlNet(nb, (cell) => (((values.water[cell] ?? 0) & WATER_LAKE) !== 0 ? 1 : 0));
  const temperatureNet = controlNet(nb, (cell) => (values.temperatureC[cell] ?? 0) * 100);
  const lakeLevels = lakeControlLevels(values, nb);

  // 잔기복 노이즈 겹(꼭짓점 129², 격자 줄 b = 행 128 − r)
  const vertexLevel = map.faceLevel + 7;
  const x0 = map.i * SM_TERRAIN;
  const y0 = map.j * SM_TERRAIN;
  const detailSalt = layerSalt(values.seed, LAYER_DETAIL);
  const octaves = DETAIL_OCTAVES.map(([k], index) =>
    latticeNoiseGrid(
      map.face,
      vertexLevel,
      x0,
      y0,
      1,
      SM_VERTICES,
      SM_VERTICES,
      k,
      (detailSalt + index) >>> 0,
    ),
  );

  const shoreNoise = latticeNoiseGrid(
    map.face,
    vertexLevel,
    x0,
    y0,
    1,
    SM_VERTICES,
    SM_VERTICES,
    4,
    layerSalt(values.seed, LAYER_SHORE),
  );
  const count = SM_VERTICES * SM_VERTICES;
  const heightsCm = new Int32Array(count);
  const waterLevelCm = new Int32Array(count).fill(NO_WATER);
  const layout = riverLayout(values, map, nb, layerSalt(values.seed, LAYER_RIVER));
  const channels = rasterizeChannels(layout);

  for (let r = 0; r < SM_VERTICES; r++) {
    const y = SM_TERRAIN - r;
    for (let c = 0; c < SM_VERTICES; c++) {
      const index = r * SM_VERTICES + c;
      const gridIndex = y * SM_VERTICES + c;
      const amplitude = netValue(netSum(roughnessNet, t7, c, y), 7);
      let noise = 0;
      for (let octave = 0; octave < DETAIL_OCTAVES.length; octave++) {
        noise += (DETAIL_OCTAVES[octave]?.[1] ?? 0) * ((octaves[octave]?.[gridIndex] ?? 32768) - 32768);
      }
      const detail = floorDiv(amplitude * noise, DETAIL_WEIGHT_SUM * 32768);
      let height: number;
      let level = NO_WATER;
      const jitter = floorDiv(((shoreNoise[gridIndex] ?? 32768) - 32768) * SHORE_NOISE, 32768);
      // 바다 물가: 땅 몫(1 − 바다 몫) + 노이즈가 500인 곳이 물가. 바다 몫이 조금이라도 있으면 수면 0.
      // 바다 몫이 0인 곳에서는 땅 몫이 850 이상이라 원래 높이(땅 쪽 높이 = 원래 높이)로 다 돌아가 있다 — 이어진다
      const oceanSum = netSum(oceanNet, t7, c, y);
      if (oceanSum > 0) {
        level = 0;
        const landShare = floorDiv((full7 - oceanSum) * 1000, full7) + jitter;
        if (landShare >= SHORE_HALF) {
          const natural = netValue(netSum(landElevationNet, t7, c, y), 7) + detail;
          height = towardShore(SHORE_LIFT_CM, natural, landShare - SHORE_HALF);
        } else {
          const natural = netValue(netSum(seaElevationNet, t7, c, y), 7) + detail;
          height = towardShore(-SHORE_LIFT_CM, natural, SHORE_HALF - landShare);
        }
      } else {
        height = netValue(netSum(elevationNet, t7, c, y), 7) + detail;
      }
      // 호수 물가: 호수 몫 − 노이즈가 500 넘으면 호수(수면 = 그 점을 이루는 호수 칸 수면의 최댓값). 물가에서는 수면 ± 30cm,
      // 호수 쪽은 바닥으로, 땅 쪽은 원래 높이로 부드럽게 돌아간다. 호수 몫 0인 곳에서는 몫 차이가 350 넘어 원래 높이다
      const lakeSum = netSum(lakeNet, t7, c, y);
      if (lakeSum > 0) {
        let lakeLevel = NO_WATER;
        for (const a of activeColumns(c)) {
          for (const b of activeColumns(y))
            lakeLevel = Math.max(lakeLevel, lakeLevels[b * 3 + a] ?? NO_WATER);
        }
        if (lakeLevel !== NO_WATER) {
          const lakeShare = floorDiv(lakeSum * 1000, full7) - jitter;
          if (lakeShare >= SHORE_HALF) {
            level = Math.max(level, lakeLevel);
            height = Math.min(
              lakeLevel - SHORE_LIFT_CM,
              towardShore(lakeLevel - SHORE_LIFT_CM, height, lakeShare - SHORE_HALF),
            );
          } else {
            height = towardShore(lakeLevel + SHORE_LIFT_CM, height, SHORE_HALF - lakeShare);
          }
        }
      }
      // 강: 깎고 물길 깊이의 4/5까지 물
      const carve = channels.carveCm[index] ?? 0;
      height -= carve;
      if (carve > 0) level = Math.max(level, height + floorDiv(carve * 4, 5));
      heightsCm[index] = height;
      waterLevelCm[index] = level;
    }
  }

  const { surface, biome } = buildSurfaces(
    values,
    map,
    nb,
    heightsCm,
    waterLevelCm,
    channels.order,
    temperatureNet,
    oceanNet,
    t8,
  );
  const { cover, art } = placeProps({ values, map, nb, heightsCm, surface, biome, rules });
  const cellSizeMm = Math.round(
    (cellSizeMeters(map.key, planetRadiusMeters(map.faceLevel)) * 1000) / SM_TERRAIN,
  );
  const hash = hashSecondMap(heightsCm, waterLevelCm, surface, cover, art);
  return {
    mapKey,
    faceLevel: map.faceLevel,
    generatorVersion: SECOND_MAP_GENERATOR_VERSION,
    heightsCm,
    waterLevelCm,
    surface,
    cover,
    art,
    propRulesHash: rules.hash,
    cellSizeMm,
    hash,
  };
}

/**
 * 지형 칸마다 바이옴(둘레 칸과 섞음)과 지표. 칸은 2차맵마다 따로라 이음매에서 같을 필요는 없고, 섞는 무게가 경계에서 이어진다.
 * 고른 바이옴 번호도 돌려준다(배치 규칙의 열쇠).
 */
function buildSurfaces(
  values: PlanetValues,
  map: ReturnType<typeof mapCoords>,
  nb: Int32Array,
  heightsCm: Int32Array,
  waterLevelCm: Int32Array,
  channelOrder: Uint8Array,
  temperatureNet: Float64Array,
  oceanNet: Float64Array,
  t8: Float64Array,
): { surface: Uint8Array; biome: Uint8Array } {
  const out = new Uint8Array(SM_TERRAIN * SM_TERRAIN);
  const biomeOut = new Uint8Array(SM_TERRAIN * SM_TERRAIN);
  const placementLevel = map.faceLevel + 8;
  const px0 = map.i * SM_PLACEMENT + 1;
  const py0 = map.j * SM_PLACEMENT + 1;
  const biomeSalt = layerSalt(values.seed, LAYER_BIOME);
  // 지표 고르기 노이즈: 넓은 덩이(32칸 ≈ 375m) 2 + 잔 덩이(8칸) 1 — 한 겹이면 소금·후추처럼 잘게 섞였다(헤드리스 그림)
  const surfaceSalt = layerSalt(values.seed, LAYER_SURFACE);
  const surfaceCoarse = latticeNoiseGrid(
    map.face,
    placementLevel,
    px0,
    py0,
    2,
    SM_TERRAIN,
    SM_TERRAIN,
    6,
    surfaceSalt,
  );
  const surfaceFine = latticeNoiseGrid(
    map.face,
    placementLevel,
    px0,
    py0,
    2,
    SM_TERRAIN,
    SM_TERRAIN,
    4,
    (surfaceSalt ^ 0x5bd1e995) >>> 0,
  );
  // 둘레 3×3에 있는 바이옴마다 몫 조절점과 섞는 노이즈
  const present = [
    ...new Set([...nb].filter((cell) => cell >= 0).map((cell) => values.biome[cell] ?? 0)),
  ].toSorted((a, b) => a - b);
  const biomeNets = present.map((biome) =>
    controlNet(nb, (cell) => ((values.biome[cell] ?? -1) === biome ? 1 : 0)),
  );
  const jitter =
    present.length > 1
      ? present.map((biome) =>
          latticeNoiseGrid(
            map.face,
            placementLevel,
            px0,
            py0,
            2,
            SM_TERRAIN,
            SM_TERRAIN,
            4,
            (biomeSalt ^ (biome * 0x45d9f3b)) >>> 0,
          ),
        )
      : [];
  const share = NET_SCALE * pow2(22);

  for (let r = 0; r < SM_TERRAIN; r++) {
    const y8 = 2 * (SM_TERRAIN - r) - 1;
    const gridRow = SM_TERRAIN - 1 - r;
    for (let c = 0; c < SM_TERRAIN; c++) {
      const x8 = 2 * c + 1;
      const noiseIndex = gridRow * SM_TERRAIN + c;
      // 네 꼭짓점: 물에 잠긴 수, 높이 차
      let wet = 0;
      let low = Number.POSITIVE_INFINITY;
      let high = Number.NEGATIVE_INFINITY;
      let riverOrder = 0;
      for (let k = 0; k < 4; k++) {
        const corner = (r + (k >> 1)) * SM_VERTICES + c + (k & 1);
        const height = heightsCm[corner] ?? 0;
        if ((waterLevelCm[corner] ?? NO_WATER) > height) wet += 1;
        low = Math.min(low, height);
        high = Math.max(high, height);
        riverOrder = Math.max(riverOrder, channelOrder[corner] ?? 0);
      }
      let biome = present[0] ?? 0;
      if (present.length > 1) {
        let best = Number.NEGATIVE_INFINITY;
        for (let index = 0; index < present.length; index++) {
          const net = biomeNets[index];
          if (!net) continue;
          const weight = floorDiv(netSum(net, t8, x8, y8), share);
          if (weight <= 0) continue;
          const score = weight + (((jitter[index]?.[noiseIndex] ?? 32768) - 32768) >> 7);
          if (score > best) {
            best = score;
            biome = present[index] ?? biome;
          }
        }
      }
      const biomeId = values.biomeIds[biome] ?? "";
      let kind: number;
      if (wet >= 3) {
        kind =
          riverOrder >= 1 && riverOrder <= 2 && netSum(oceanNet, t8, x8, y8) === 0
            ? SM_SURFACE.shallowWater
            : SM_SURFACE.water;
      } else if (high - low >= ROCK_RELIEF_CM) {
        kind = SM_SURFACE.rock;
      } else if (wet === 2) {
        kind = netSum(oceanNet, t8, x8, y8) > 0 ? SM_SURFACE.sand : SM_SURFACE.mud;
      } else {
        const pick = floorDiv(2 * (surfaceCoarse[noiseIndex] ?? 0) + (surfaceFine[noiseIndex] ?? 0), 3);
        kind = pickSurface(BIOME_SURFACES[biomeId] ?? DEFAULT_MIX, pick);
        const temperatureCenti = netValue(netSum(temperatureNet, t8, x8, y8), 8);
        const snowJitter = floorDiv(((surfaceFine[noiseIndex] ?? 32768) - 32768) * SNOW_JITTER_CENTI, 32768);
        if (
          temperatureCenti + snowJitter <= SNOW_TEMPERATURE_C * 100 &&
          (kind === SM_SURFACE.grass ||
            kind === SM_SURFACE.dirt ||
            kind === SM_SURFACE.gravel ||
            kind === SM_SURFACE.mud)
        ) {
          kind = SM_SURFACE.snow;
        }
      }
      out[r * SM_TERRAIN + c] = kind;
      biomeOut[r * SM_TERRAIN + c] = biome;
    }
  }
  return { surface: out, biome: biomeOut };
}
