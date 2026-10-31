// 2차맵 시험 순수 계산 시험 — 높이 과장(해수면 그대로, int16 폭 넘으면 막기, 물 없음 그대로), 누른 칸 값(높이·경사·물·층)
import type { TerrainInput } from "@terra/engine";
import { describe, expect, it } from "vitest";
import {
  EXAGGERATION_STEPS,
  exaggerateTerrain,
  labPivot,
  labPointInfo,
  maxExaggeration,
} from "./labTerrain.ts";

const V = 129;
const NO_WATER = -32_768;

/** 동쪽으로 칸마다 dm만큼 오르는 지형(높이 0.1m 단위), 서쪽 끝 열은 물(수면 5m) */
function slopeTerrain(dmPerCell: number, baseHeightM = 0): TerrainInput {
  const heights = new Int16Array(V * V);
  const waterLevels = new Int16Array(V * V).fill(NO_WATER);
  for (let r = 0; r < V; r++) {
    for (let c = 0; c < V; c++) heights[r * V + c] = c * dmPerCell;
    waterLevels[r * V] = 50;
  }
  return {
    heights,
    surface: new Uint8Array(128 * 128).fill(1),
    baseHeightM,
    cellSizeM: 10,
    waterLevelM: 0,
    waterLevels,
    cover: new Uint8Array(256 * 256).fill(2),
    art: new Uint8Array(256 * 256).fill(3),
  };
}

/** 꼭짓점 k의 세계 높이(m) */
const world = (terrain: TerrainInput, k: number) => terrain.baseHeightM + (terrain.heights[k] ?? 0) * 0.1;

describe("높이 과장", () => {
  it("×1은 같은 객체, 그 밖은 가장 낮은 곳을 기준으로 배율, 물 없음은 그대로", () => {
    const input = slopeTerrain(10);
    expect(exaggerateTerrain(input, 1)).toBe(input);
    const x4 = exaggerateTerrain(input, 4);
    expect(x4.baseHeightM).toBe(0);
    expect(x4.heights[1]).toBe(40);
    expect(x4.heights[128]).toBe(5120);
    expect(x4.waterLevels?.[0]).toBe(200);
    expect(x4.waterLevels?.[1]).toBe(NO_WATER);
    // 원본은 그대로
    expect(input.heights[128]).toBe(1280);
  });

  it("높은 곳의 2차맵은 가장 낮은 곳을 기준으로 늘린다. 이웃은 같은 기준을 넘겨 경계가 이어진다", () => {
    const input = slopeTerrain(10, 2000);
    expect(labPivot(input)).toBe(20_000);
    const x2 = exaggerateTerrain(input, 2);
    expect(world(x2, 0)).toBeCloseTo(2000);
    expect(world(x2, 128)).toBeCloseTo(2000 + 128 * 2);
    // 이웃(이 2차맵 동쪽 끝 높이 2,128m에서 시작)도 같은 기준이면 같은 세계 높이가 같은 값으로 간다
    const neighbour = slopeTerrain(10, 2128);
    const n2 = exaggerateTerrain(neighbour, 2, labPivot(input));
    expect(world(n2, 0)).toBeCloseTo(world(x2, 128));
  });

  it("높이 폭 × 배율이 int16 폭을 넘는 배율은 못 쓴다", () => {
    // 폭 128 × 40dm = 5,120dm → ×12도 든다(61,440 ≤ 65,534)
    expect(maxExaggeration(slopeTerrain(40))).toBe(12);
    // 폭 128 × 200dm = 25,600dm → ×2까지
    const steep = slopeTerrain(200);
    expect(maxExaggeration(steep)).toBe(2);
    expect(() => exaggerateTerrain(steep, 3)).toThrow(RangeError);
    expect(EXAGGERATION_STEPS[0]).toBe(1);
  });
});

describe("누른 칸 값", () => {
  it("높이(보간)·경사·지형 칸·층", () => {
    const input = slopeTerrain(10);
    const info = labPointInfo(input, 20.4, 7.9);
    expect(info).toMatchObject({ x: 20, y: 7, terrainX: 10, terrainY: 3, surface: 1, cover: 2, art: 3 });
    // 배치 칸 20의 가운데 = 지형 칸 10.25 → 10.25m
    expect(info?.heightM).toBeCloseTo(10.25);
    // 칸마다 1m 오름, 칸 10m → 10%
    expect(info?.slopePct).toBeCloseTo(10);
    expect(info?.reliefM).toBeCloseTo(1);
    expect(info?.waterDepthM).toBe(0);
  });

  it("물 꼭짓점 옆은 수면 − 땅 높이, 2차맵 밖은 null", () => {
    const info = labPointInfo(slopeTerrain(10), 0.2, 0.2);
    // 꼭짓점 0 수면 5m, 땅 0.25m
    expect(info?.waterDepthM).toBeCloseTo(4.75);
    expect(labPointInfo(slopeTerrain(10), -1, 3)).toBeNull();
    expect(labPointInfo(slopeTerrain(10), 3, 256)).toBeNull();
  });
});
