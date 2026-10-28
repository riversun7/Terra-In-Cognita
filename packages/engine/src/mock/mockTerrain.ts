// [임시] 2차맵 시험 화면용 가짜 지형 — 진짜 지형은 서버가 만들어 보낸다(ADR 2026-10-28-s1-second-map "2차맵 데이터").
// 서버 형식이 오면 이 파일은 지운다. 같은 시드면 어느 기기에서나 같은 지형이 나온다(덧셈·곱셈만 쓰고 초월함수를 쓰지 않는다).
// 값 노이즈(격자점 난수 + 부드러운 보간) 4겹 + 바위 봉우리 1겹. 높이는 대략 -25m(호수) ~ +45m(언덕).
import { createRng } from "@terra/shared";
import {
  HEIGHT_UNIT_M,
  SURFACE,
  TERRAIN_CELLS,
  TERRAIN_VERTICES,
  type TerrainInput,
} from "../terrain/terrainData.ts";

/** 가짜 지형 칸 한 변(m) — 평균값(격자 ADR) */
export const MOCK_CELL_SIZE_M = 11.7;

/** 부드러운 보간 계수(3t² − 2t³) */
const smooth = (t: number): number => t * t * (3 - 2 * t);

/** 격자 간격 spacing(꼭짓점 단위)의 값 노이즈 한 겹: 0~1 */
function valueNoiseLayer(seed: number, spacing: number): Float32Array {
  const rng = createRng(seed);
  const lattice = Math.ceil(TERRAIN_VERTICES / spacing) + 2;
  const values = new Float32Array(lattice * lattice);
  for (let i = 0; i < values.length; i++) values[i] = rng.nextU32() / 0x1_0000_0000;
  const out = new Float32Array(TERRAIN_VERTICES * TERRAIN_VERTICES);
  for (let row = 0; row < TERRAIN_VERTICES; row++) {
    const gy = Math.floor(row / spacing);
    const ty = smooth(row / spacing - gy);
    for (let col = 0; col < TERRAIN_VERTICES; col++) {
      const gx = Math.floor(col / spacing);
      const tx = smooth(col / spacing - gx);
      const v00 = values[gy * lattice + gx] ?? 0;
      const v10 = values[gy * lattice + gx + 1] ?? 0;
      const v01 = values[(gy + 1) * lattice + gx] ?? 0;
      const v11 = values[(gy + 1) * lattice + gx + 1] ?? 0;
      const top = v00 + (v10 - v00) * tx;
      const bottom = v01 + (v11 - v01) * tx;
      out[row * TERRAIN_VERTICES + col] = top + (bottom - top) * ty;
    }
  }
  return out;
}

/** 여러 겹(간격 반, 세기 반)을 더해 0~1로 */
function fractalNoise(seed: number, spacings: readonly number[]): Float32Array {
  const out = new Float32Array(TERRAIN_VERTICES * TERRAIN_VERTICES);
  let amplitude = 1;
  let total = 0;
  spacings.forEach((spacing, index) => {
    const layer = valueNoiseLayer(seed * 31 + index * 7919 + 1, spacing);
    for (let i = 0; i < out.length; i++) out[i] = (out[i] ?? 0) + (layer[i] ?? 0) * amplitude;
    total += amplitude;
    amplitude /= 2;
  });
  for (let i = 0; i < out.length; i++) out[i] = (out[i] ?? 0) / total;
  return out;
}

export function createMockTerrain(seed: number): TerrainInput {
  const base = fractalNoise(seed, [48, 24, 12, 6]);
  const peaks = fractalNoise(seed + 101, [32, 16, 8]);
  const patches = fractalNoise(seed + 202, [20, 10]);
  const heightsM = new Float32Array(TERRAIN_VERTICES * TERRAIN_VERTICES);
  for (let i = 0; i < heightsM.length; i++) {
    const ridge = Math.max(0, (peaks[i] ?? 0) - 0.58) * 160;
    heightsM[i] = ((base[i] ?? 0) - 0.4) * 80 + ridge;
  }
  const heights = new Int16Array(heightsM.length);
  for (let i = 0; i < heights.length; i++) heights[i] = Math.round((heightsM[i] ?? 0) / HEIGHT_UNIT_M);

  const surface = new Uint8Array(TERRAIN_CELLS * TERRAIN_CELLS);
  for (let row = 0; row < TERRAIN_CELLS; row++) {
    for (let col = 0; col < TERRAIN_CELLS; col++) {
      const at = (r: number, c: number): number => (heights[r * TERRAIN_VERTICES + c] ?? 0) * HEIGHT_UNIT_M;
      const corners = [at(row, col), at(row, col + 1), at(row + 1, col), at(row + 1, col + 1)];
      const mean = corners.reduce((sum, h) => sum + h, 0) / corners.length;
      const slope = (Math.max(...corners) - Math.min(...corners)) / MOCK_CELL_SIZE_M;
      const patch = patches[row * TERRAIN_VERTICES + col] ?? 0;
      let code: number = SURFACE.grass;
      if (mean < 0) code = SURFACE.water;
      else if (slope > 0.42 || mean > 30) code = SURFACE.rock;
      else if (mean < 1.2 || patch > 0.64) code = SURFACE.dirt;
      surface[row * TERRAIN_CELLS + col] = code;
    }
  }
  return { heights, surface, baseHeightM: 0, cellSizeM: MOCK_CELL_SIZE_M, waterLevelM: 0 };
}
