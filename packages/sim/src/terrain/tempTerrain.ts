// S1 임시 지형 생성기 (ADR 2026-10-28-s1-second-map.md "2차맵 데이터 (임시 지형)")
// - 칸 키에서 만든 시드 → 정수 값 노이즈 높이(꼭짓점 129×129) + 임시 지표 종류(지형 칸 128×128).
// - 지형 칸 하나 = 배치 칸 2×2. 물과 가파른 비탈은 지나갈 수 없다(비용 0).
// - 초월함수 없이 정수 해시·정수 보간만 쓴다. 같은 시드면 어디서나 같은 결과다.
// - 행성 생성기(S2, packages/planet)가 생기면 바뀐다. 이웃 2차맵과 경계는 이어지지 않는다(임시).
// - 수치(해수면·높이 배율·비탈 기준·지표 비용)는 S1 임시값이다. 출력이 바뀌면 TEMP_TERRAIN_GENERATOR_VERSION을 올린다.
import { createFnv1a, mix32 } from "../math/hash.ts";
import { TERRAIN_SIZE, TERRAIN_VERTEX_SIZE } from "../units.ts";
import { TEMP_TERRAIN_GENERATOR_VERSION } from "../version.ts";
import { CLIFF_RELIEF_CM, SURFACE_COST, cellRelief, placementCostsFromLayers } from "./layerCosts.ts";
import { valueNoise } from "./noise.ts";

// 지표 비용·벼랑 기준은 layerCosts.ts(행성 값 2차맵과 같은 표)에 있다. 이전 이름 그대로 내보낸다
export { CLIFF_RELIEF_CM, SURFACE_COST };

/** 지표 종류(임시) */
export const SURFACE_WATER = 0;
export const SURFACE_GRASS = 1;
export const SURFACE_DIRT = 2;
export const SURFACE_ROCK = 3;

/** 높이 노이즈 옥타브: [간격 log2(꼭짓점), 가중치]. 넓은 언덕 + 잔물결 */
const HEIGHT_OCTAVES: readonly (readonly [number, number])[] = [
  [6, 16],
  [5, 8],
  [4, 4],
  [3, 2],
  [2, 1],
];
const HEIGHT_WEIGHT_SUM = 31;
/** 노이즈(0 ~ 65535) 중 해수면 높이 */
const SEA_LEVEL = 26_000;
/** 노이즈 1당 높이 = HEIGHT_CM_PER_1000 ÷ 1000 cm */
const HEIGHT_CM_PER_1000 = 400;
/** 이 높이(cm) 위는 바위 */
const ROCK_ALTITUDE_CM = 13_000;
/** 지형 칸 꼭짓점 4개의 높이 차(cm)가 이 이상이면 바위 */
export const ROCK_RELIEF_CM = 450;
/** 습도 노이즈가 이 이상이면 풀, 아니면 흙 */
const GRASS_MOISTURE = 26_000;

export interface TempTerrain {
  readonly generatorVersion: number;
  readonly seed: number;
  /** 꼭짓점 높이(cm, 해수면 0 기준) 129×129, 행 우선 */
  readonly heights: Int32Array;
  /** 지형 칸 지표 종류 128×128, 행 우선 */
  readonly surface: Uint8Array;
}

/** 칸 키(53비트 안 안전 정수) → 32비트 시드 */
export function seedFromCellKey(cellKey: number): number {
  if (!Number.isSafeInteger(cellKey) || cellKey < 0) {
    throw new RangeError(`cell key must be a non-negative safe integer: ${cellKey}`);
  }
  const low = cellKey >>> 0;
  const high = Math.floor(cellKey / 0x1_0000_0000);
  return mix32(mix32(low) ^ Math.imul(high + 1, 0x9e3779b1));
}

/** 시드(32비트 부호 없는 정수)로 임시 지형을 만든다 */
export function generateTempTerrain(seed: number): TempTerrain {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError(`seed must be a 32-bit unsigned integer: ${seed}`);
  }
  const heights = new Int32Array(TERRAIN_VERTEX_SIZE * TERRAIN_VERTEX_SIZE);
  const octaveSeeds = HEIGHT_OCTAVES.map((_, octave) => mix32(seed + octave * 0x632be5ab));
  for (let vy = 0; vy < TERRAIN_VERTEX_SIZE; vy++) {
    for (let vx = 0; vx < TERRAIN_VERTEX_SIZE; vx++) {
      let sum = 0;
      HEIGHT_OCTAVES.forEach(([spacingLog2, weight], octave) => {
        sum += weight * valueNoise(octaveSeeds[octave] ?? 0, vx, vy, spacingLog2);
      });
      const noise = Math.floor(sum / HEIGHT_WEIGHT_SUM);
      heights[vy * TERRAIN_VERTEX_SIZE + vx] = Math.floor(((noise - SEA_LEVEL) * HEIGHT_CM_PER_1000) / 1000);
    }
  }

  const surface = new Uint8Array(TERRAIN_SIZE * TERRAIN_SIZE);
  const moistureSeed = mix32(seed ^ 0x5bd1e995);
  const partial = { heights };
  for (let ty = 0; ty < TERRAIN_SIZE; ty++) {
    for (let tx = 0; tx < TERRAIN_SIZE; tx++) {
      const corners = cornerHeights(partial, tx, ty);
      const average = Math.floor((corners[0] + corners[1] + corners[2] + corners[3]) / 4);
      const relief = Math.max(...corners) - Math.min(...corners);
      let kind = SURFACE_GRASS;
      if (average < 0) kind = SURFACE_WATER;
      else if (relief >= ROCK_RELIEF_CM || average >= ROCK_ALTITUDE_CM) kind = SURFACE_ROCK;
      else if (moisture(moistureSeed, tx, ty) < GRASS_MOISTURE) kind = SURFACE_DIRT;
      surface[ty * TERRAIN_SIZE + tx] = kind;
    }
  }
  return { generatorVersion: TEMP_TERRAIN_GENERATOR_VERSION, seed, heights, surface };
}

/** 습도(0 ~ 65535): 지형 칸 간격 16·8 두 옥타브 */
function moisture(seed: number, tx: number, ty: number): number {
  return Math.floor((2 * valueNoise(seed, tx, ty, 4) + valueNoise(seed ^ 0x2545f491, tx, ty, 3)) / 3);
}

function cornerHeights(
  terrain: Pick<TempTerrain, "heights">,
  tx: number,
  ty: number,
): [number, number, number, number] {
  const top = ty * TERRAIN_VERTEX_SIZE + tx;
  const bottom = top + TERRAIN_VERTEX_SIZE;
  const h = terrain.heights;
  return [h[top] ?? 0, h[top + 1] ?? 0, h[bottom] ?? 0, h[bottom + 1] ?? 0];
}

/** 지형 칸 (tx, ty) 꼭짓점 4개의 높이 차(cm) — 비탈의 세기 */
export function terrainCellRelief(terrain: TempTerrain, tx: number, ty: number): number {
  return cellRelief(terrain.heights, tx, ty);
}

/** 배치 칸 65,536개의 지형 비용(천분율, 0 = 막힘). createPlacementGrid에 넣는다(엄폐 없음) */
export function placementCostsFromTerrain(terrain: TempTerrain): Uint16Array {
  return placementCostsFromLayers({ heights: terrain.heights, surface: terrain.surface });
}

/** 결과 해시(FNV-1a): 버전·시드·높이·지표. 생성 결과 확인(골든 해시, 저장본 비교)에 쓴다 */
export function terrainHash(terrain: TempTerrain): string {
  const hash = createFnv1a();
  hash.update32(terrain.generatorVersion);
  hash.update32(terrain.seed);
  for (const height of terrain.heights) hash.update32(height);
  for (const kind of terrain.surface) hash.updateByte(kind);
  return hash.digest();
}
