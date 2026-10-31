import { describe, expect, it } from "vitest";
import { createMockTerrain } from "../mock/mockTerrain.ts";
import { SURFACE, TERRAIN_CELLS, TERRAIN_VERTICES } from "./terrainData.ts";
import { buildTerrainMesh } from "./terrainMesh.ts";
import { NOISE_TEXTURE_SIZE, buildNoiseTextureData } from "./terrainNoise.ts";
import {
  HEIGHT_SHADE,
  HEIGHT_SHADE_MIN_RANGE_M,
  SURFACE_TEXTURE_BYTES,
  UNKNOWN_SURFACE_RGB,
  buildSurfaceTextureData,
  heightShadeScale,
  surfaceRgb,
  toByte,
} from "./terrainTextures.ts";

const CELLS = TERRAIN_CELLS * TERRAIN_CELLS;
const bytesOf = (rgb: readonly [number, number, number]): number[] => rgb.map(toByte);

describe("buildSurfaceTextureData", () => {
  it("칸마다 (지표 색, 지표 코드), 행 우선", () => {
    const surface = new Uint8Array(CELLS).fill(SURFACE.grass);
    surface[0] = SURFACE.water;
    surface[1] = SURFACE.dirt;
    surface[TERRAIN_CELLS] = SURFACE.rock; // 둘째 행 첫 칸
    const data = buildSurfaceTextureData(surface);
    expect(data.length).toBe(SURFACE_TEXTURE_BYTES);
    const texel = (i: number): number[] => [...data.subarray(i * 4, i * 4 + 4)];
    expect(texel(0)).toEqual([...bytesOf(surfaceRgb(SURFACE.water)), SURFACE.water]);
    expect(texel(1)).toEqual([...bytesOf(surfaceRgb(SURFACE.dirt)), SURFACE.dirt]);
    expect(texel(TERRAIN_CELLS)).toEqual([...bytesOf(surfaceRgb(SURFACE.rock)), SURFACE.rock]);
    expect(texel(CELLS - 1)).toEqual([...bytesOf(surfaceRgb(SURFACE.grass)), SURFACE.grass]);
    // 네 지표 색은 서로 다르고, 모르는 코드의 회색과도 다르다
    const colors = new Set(
      [SURFACE.water, SURFACE.grass, SURFACE.dirt, SURFACE.rock].map((code) => surfaceRgb(code).join()),
    );
    colors.add(UNKNOWN_SURFACE_RGB.join());
    expect(colors.size).toBe(5);
  });

  it("모르는 코드는 회색, 코드는 그대로 둔다(셰이더가 같은 지표끼리 묶는다)", () => {
    const surface = new Uint8Array(CELLS).fill(SURFACE.grass);
    surface[5] = 11;
    surface[6] = 200;
    surface[7] = 255;
    const data = buildSurfaceTextureData(surface);
    const grey = bytesOf(UNKNOWN_SURFACE_RGB);
    for (const [index, code] of [
      [5, 11],
      [6, 200],
      [7, 255],
    ] as const) {
      expect([...data.subarray(index * 4, index * 4 + 4)]).toEqual([...grey, code]);
    }
    expect(surfaceRgb(undefined)).toEqual(UNKNOWN_SURFACE_RGB);
  });

  it("주어진 배열에 다시 쓴다", () => {
    const out = new Uint8Array(SURFACE_TEXTURE_BYTES).fill(9);
    const surface = new Uint8Array(CELLS).fill(SURFACE.rock);
    expect(buildSurfaceTextureData(surface, out)).toBe(out);
    expect(out[3]).toBe(SURFACE.rock);
  });

  it("크기가 틀리면 던진다", () => {
    expect(() => buildSurfaceTextureData(new Uint8Array(CELLS - 1))).toThrow(RangeError);
    expect(() => buildSurfaceTextureData(new Uint8Array(CELLS), new Uint8Array(16))).toThrow(RangeError);
  });

  it("꼭짓점 색(가장자리 벽 빼고)도 같은 색표를 쓴다", () => {
    const terrain = createMockTerrain(5);
    terrain.surface.fill(SURFACE.dirt);
    const mesh = buildTerrainMesh(terrain);
    const [r, g, b] = surfaceRgb(SURFACE.dirt);
    // 밝기(높이·물)는 0.765~1.08배 — 색 비율은 지표 색과 같다
    const v = Math.floor((TERRAIN_VERTICES * TERRAIN_VERTICES) / 2);
    const red = mesh.colors[v * 3] ?? 0;
    const green = mesh.colors[v * 3 + 1] ?? 0;
    const blue = mesh.colors[v * 3 + 2] ?? 0;
    expect(red / green).toBeCloseTo(r / g, 1);
    expect(blue / green).toBeCloseTo(b / g, 1);
  });
});

describe("heightShadeScale", () => {
  it("1 / 높이 폭이고, 폭이 0.01m보다 작으면 0.01m로 본다", () => {
    expect(heightShadeScale(0, 300)).toBeCloseTo(1 / 300, 12);
    // 높이는 0.1m 단위 — 가장 작은 실제 높낮이도 그대로다
    expect(heightShadeScale(60, 60.1)).toBeCloseTo(10, 6);
    expect(heightShadeScale(60, 60)).toBeCloseTo(1 / HEIGHT_SHADE_MIN_RANGE_M, 9);
    expect(heightShadeScale(1000, 1000.004)).toBeCloseTo(1 / HEIGHT_SHADE_MIN_RANGE_M, 9);
  });

  it("평평한 2차맵: 조각마다 보간한 높이의 오차(1ulp의 몇 배)가 밝기를 바꾸지 않는다", () => {
    // 60m에서 float32 1ulp ≈ 3.8e-6m. 전 배율(1 / 1e-6)이면 이 오차가 높이 비율 15 → 잘려서 밝기가 0.9 ↔ 1.08로 뛰었다(검토)
    const interpolationErrorM = 4 * 3.8e-6;
    expect(interpolationErrorM * 1e6).toBeGreaterThan(1);
    // 지금 배율로는 8비트 색 0.1단계도 안 된다
    const shadeChange = HEIGHT_SHADE.span * interpolationErrorM * heightShadeScale(60, 60);
    expect(shadeChange * 255).toBeLessThan(0.1);
  });

  it("꼭짓점 색도 같은 배율을 쓴다: 평평한 지형은 모든 윗면 꼭짓점 색이 같다", () => {
    const terrain = createMockTerrain(9);
    terrain.heights.fill(600);
    terrain.surface.fill(SURFACE.grass);
    terrain.waterLevelM = -100;
    const mesh = buildTerrainMesh(terrain);
    const [r, g, b] = surfaceRgb(SURFACE.grass).map((value) => toByte(value * HEIGHT_SHADE.base));
    for (let v = 0; v < TERRAIN_VERTICES * TERRAIN_VERTICES; v += 97) {
      expect([...mesh.colors.subarray(v * 3, v * 3 + 3)]).toEqual([r, g, b]);
    }
  });
});

describe("buildNoiseTextureData", () => {
  const size = NOISE_TEXTURE_SIZE;
  const data = buildNoiseTextureData();
  const at = (x: number, y: number, channel: number): number =>
    data[(((y + size) % size) * size + ((x + size) % size)) * 4 + channel] ?? 0;
  const n = size * size;
  const meanOf = (channel: number): number => {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += data[i * 4 + channel] ?? 0;
    return sum / n;
  };
  const stdOf = (channel: number, mean: number): number => {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += ((data[i * 4 + channel] ?? 0) - mean) ** 2;
    return Math.sqrt(sum / n);
  };
  /** 자기상관(dx, dy만큼 옮긴 것과) */
  const correlation = (channel: number, dx: number, dy: number, mean: number, std: number): number => {
    let sum = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) sum += (at(x, y, channel) - mean) * (at(x + dx, y + dy, channel) - mean);
    }
    return sum / n / (std * std);
  };

  it("결정적이다: 같은 시드는 같은 바이트, 다른 시드는 다른 바이트", () => {
    expect(data.length).toBe(size * size * 4);
    expect(buildNoiseTextureData()).toEqual(data);
    expect(buildNoiseTextureData(12345)).not.toEqual(data);
  });

  it("이어 붙는다: 끝과 처음 사이 차이가 안쪽 이웃 차이보다 크지 않고, 매끈하다", () => {
    for (let channel = 0; channel < 4; channel++) {
      let inner = 0;
      let wrap = 0;
      for (let i = 0; i < size; i++) {
        for (let x = 0; x < size - 1; x++) {
          inner = Math.max(inner, Math.abs(at(x + 1, i, channel) - at(x, i, channel)));
          inner = Math.max(inner, Math.abs(at(i, x + 1, channel) - at(i, x, channel)));
        }
        wrap = Math.max(wrap, Math.abs(at(0, i, channel) - at(size - 1, i, channel)));
        wrap = Math.max(wrap, Math.abs(at(i, 0, channel) - at(i, size - 1, channel)));
      }
      expect(wrap).toBeLessThanOrEqual(inner);
      // 흐린 잡음이라 이웃 텍셀 사이가 크게 뛰지 않는다(무늬 하나 = 약 8텍셀)
      expect(inner).toBeLessThan(48);
    }
  });

  it("방향 무늬가 없다: 가로·세로·대각선으로 같은 거리만큼 옮긴 자기상관이 비슷하다", () => {
    for (let channel = 0; channel < 4; channel++) {
      const mean = meanOf(channel);
      const std = stdOf(channel, mean);
      const horizontal = correlation(channel, 4, 0, mean, std);
      const vertical = correlation(channel, 0, 4, mean, std);
      const diagonal = correlation(channel, 3, 3, mean, std); // 거리 4.24
      const antiDiagonal = correlation(channel, 3, -3, mean, std);
      expect(horizontal).toBeGreaterThan(0.3);
      for (const value of [vertical, diagonal, antiDiagonal])
        expect(Math.abs(value - horizontal)).toBeLessThan(0.12);
      // 무늬 크기: 16텍셀 떨어지면 거의 상관이 없다
      expect(Math.abs(correlation(channel, 16, 0, mean, std))).toBeLessThan(0.15);
    }
  });

  it("채널마다 평균 0.5·표준편차 약 0.18이고, 채널끼리 상관이 작다", () => {
    const means = [0, 1, 2, 3].map(meanOf);
    const stds = means.map((mean, channel) => stdOf(channel, mean));
    for (let c = 0; c < 4; c++) {
      expect(means[c]).toBeGreaterThan(125);
      expect(means[c]).toBeLessThan(130);
      expect(stds[c]).toBeGreaterThan(0.16 * 255);
      expect(stds[c]).toBeLessThan(0.2 * 255);
    }
    for (let a = 0; a < 4; a++) {
      for (let b = a + 1; b < 4; b++) {
        let cov = 0;
        for (let i = 0; i < n; i++) {
          cov += ((data[i * 4 + a] ?? 0) - (means[a] ?? 0)) * ((data[i * 4 + b] ?? 0) - (means[b] ?? 0));
        }
        expect(Math.abs(cov / n / ((stds[a] ?? 1) * (stds[b] ?? 1)))).toBeLessThan(0.1);
      }
    }
  });
});
