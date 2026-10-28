import { describe, expect, it } from "vitest";
import { type CellKey, cellKey } from "./cellKey.ts";
import { FACES } from "./faces.ts";
import { EARTH_FACE_LEVEL, MAX_LEVEL, planetLevels } from "./levels.ts";
import { neighbors4, neighbors8 } from "./neighbors.ts";
import {
  EARTH_RADIUS_METERS,
  type Vec3,
  averageCellEdgeMeters,
  cellAreaSteradians,
  cellCenter,
  cellCorners,
  cellSizeMeters,
  faceUVToXYZ,
  planetRadiusMeters,
  stToUV,
  uvToST,
  xyzToCell,
  xyzToFaceUV,
} from "./projection.ts";

function keysAt(level: number): CellKey[] {
  const n = 2 ** level;
  const keys: CellKey[] = [];
  for (const face of FACES) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) keys.push(cellKey(face, level, i, j));
    }
  }
  return keys;
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
/** 두 단위 벡터 사이 각도 (작은 각도에서도 정확한 atan2 식) */
const angle = (a: Vec3, b: Vec3) => Math.atan2(length(cross(a, b)), dot(a, b));

function sharedCornerCount(a: CellKey, b: CellKey): number {
  const cornersB = cellCorners(b);
  return cellCorners(a).filter((p) => cornersB.some((q) => length(sub(p, q)) < 1e-12)).length;
}

/** 칸들의 최대 면적 / 최소 면적 */
function areaRatio(keys: readonly CellKey[]): number {
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  for (const key of keys) {
    const area = cellAreaSteradians(key);
    min = Math.min(min, area);
    max = Math.max(max, area);
  }
  return max / min;
}

describe("탄젠트 투영 (st ↔ uv)", () => {
  it("끝점과 중심은 정확하고, 원점 대칭이 정확하다", () => {
    expect(stToUV(0)).toBe(-1);
    expect(stToUV(0.5)).toBe(0);
    expect(stToUV(1)).toBe(1);
    expect(uvToST(-1)).toBe(0);
    expect(uvToST(0)).toBe(0.5);
    expect(uvToST(1)).toBe(1);
    for (let k = 0; k <= 64; k++) {
      const s = k / 64;
      // 합이 정확히 0 (toBe(-x)는 0과 -0을 다르게 본다)
      expect(stToUV(1 - s) + stToUV(s)).toBe(0);
    }
  });

  it("st는 칸 각도에 비례한다: u = tan(π/2·s - π/4), 왕복하면 돌아온다", () => {
    expect(stToUV(0.75)).toBeCloseTo(Math.tan(Math.PI / 8), 15);
    for (let k = 0; k <= 1000; k++) {
      const s = k / 1000;
      expect(uvToST(stToUV(s))).toBeCloseTo(s, 14);
    }
  });
});

describe("면 좌표 ↔ 3차원 방향", () => {
  it("면 배치는 S2 식과 같다: 0 = (1,u,v), 1 = (-u,1,v), 2 = (-u,-v,1), 3 = (-1,-v,-u), 4 = (v,-1,-u), 5 = (v,u,-1)", () => {
    const u = 0.25;
    const v = -0.5;
    expect(faceUVToXYZ(0, u, v)).toEqual([1, u, v]);
    expect(faceUVToXYZ(1, u, v)).toEqual([-u, 1, v]);
    expect(faceUVToXYZ(2, u, v)).toEqual([-u, -v, 1]);
    expect(faceUVToXYZ(3, u, v)).toEqual([-1, -v, -u]);
    expect(faceUVToXYZ(4, u, v)).toEqual([v, -1, -u]);
    expect(faceUVToXYZ(5, u, v)).toEqual([v, u, -1]);
  });

  it("방향 → 면 좌표는 면 좌표 → 방향을 되돌린다 (길이와 무관)", () => {
    for (const face of FACES) {
      for (const [u, v] of [
        [0, 0],
        [0.3, -0.7],
        [-0.99, 0.98],
        [0.5, 0.5],
      ] as const) {
        const p = faceUVToXYZ(face, u, v);
        for (const scale of [1, 0.001, 531_000]) {
          const back = xyzToFaceUV([p[0] * scale, p[1] * scale, p[2] * scale]);
          expect(back.face).toBe(face);
          expect(back.u).toBeCloseTo(u, 14);
          expect(back.v).toBeCloseTo(v, 14);
        }
      }
    }
    expect(() => xyzToFaceUV([0, 0, 0])).toThrow(RangeError);
  });
});

describe("칸 중심·꼭짓점", () => {
  it("칸 중심은 단위 벡터이고 그 칸에 들어간다 (레벨 0~5 전수, 레벨 9·17·22 표본)", () => {
    const problems: string[] = [];
    for (const level of [0, 1, 2, 3, 4, 5]) {
      for (const key of keysAt(level)) {
        const center = cellCenter(key);
        if (Math.abs(length(center) - 1) > 1e-15) problems.push(`length ${key}`);
        if (xyzToCell(center, level) !== key) problems.push(`cell ${key}`);
      }
    }
    for (const level of [EARTH_FACE_LEVEL, 17, MAX_LEVEL]) {
      const last = 2 ** level - 1;
      for (const face of FACES) {
        for (const [i, j] of [
          [0, 0],
          [last, 0],
          [0, last],
          [last, last],
          [last >> 1, (last >> 2) + 1],
        ] as const) {
          const key = cellKey(face, level, i, j);
          if (xyzToCell(cellCenter(key), level) !== key) problems.push(`deep ${level}/${face}/${i}/${j}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("칸 꼭짓점은 밖에서 볼 때 반시계 순서다 (모든 면)", () => {
    for (const key of keysAt(2)) {
      const [p0, p1, , p3] = cellCorners(key);
      expect(dot(cross(sub(p1, p0), sub(p3, p0)), cellCenter(key))).toBeGreaterThan(0);
    }
  });

  it("4이웃은 꼭짓점 2개, 8이웃은 1개 이상을 3D에서 공유한다 — 면 경계를 넘는 이웃도 (레벨 0~5 전수)", () => {
    const problems: string[] = [];
    for (const level of [0, 1, 2, 3, 4, 5]) {
      for (const key of keysAt(level)) {
        for (const other of neighbors4(key)) {
          if (sharedCornerCount(key, other) !== 2) problems.push(`4 ${key} ${other}`);
        }
        for (const other of neighbors8(key)) {
          if (sharedCornerCount(key, other) < 1) problems.push(`8 ${key} ${other}`);
        }
      }
    }
    expect(problems.slice(0, 10)).toEqual([]);
  });

  it("4이웃 중심 사이 거리는 칸 크기 정도다 — 면을 넘는 이웃도 같다 (레벨 6 전수)", () => {
    const level = 6;
    const meanEdge = Math.sqrt((4 * Math.PI) / (6 * 4 ** level));
    let min = Number.POSITIVE_INFINITY;
    let max = 0;
    let crossMin = Number.POSITIVE_INFINITY;
    for (const key of keysAt(level)) {
      const face = Math.floor(key / 2 ** 49);
      for (const other of neighbors4(key)) {
        const ratio = angle(cellCenter(key), cellCenter(other)) / meanEdge;
        min = Math.min(min, ratio);
        max = Math.max(max, ratio);
        if (Math.floor(other / 2 ** 49) !== face) crossMin = Math.min(crossMin, ratio);
      }
    }
    // 측정값(2026-10-28): 면 안 0.777~1.085, 면 경계 0.890~1.085
    expect(min).toBeGreaterThan(0.75);
    expect(max).toBeLessThan(1.1);
    expect(crossMin).toBeGreaterThan(0.85);
  });
});

describe("칸 면적·크기 (ADR 수치 확인)", () => {
  it("칸 면적의 합은 구 전체(4π)다 (레벨 0~6)", () => {
    for (const level of [0, 1, 2, 3, 4, 5, 6]) {
      const total = keysAt(level).reduce((sum, key) => sum + cellAreaSteradians(key), 0);
      expect(total).toBeCloseTo(4 * Math.PI, 10);
    }
  });

  it("같은 레벨 칸의 최대/최소 면적 비는 탄젠트 투영에서 약 1.4다 (√2 ≈ 1.414에 다가감)", () => {
    // 측정값(2026-10-28): 레벨 6 = 1.397, 레벨 9 = 1.412 (기본 이차 투영은 레벨 9에서 2.087)
    const level6 = areaRatio(keysAt(6));
    expect(level6).toBeGreaterThan(1.39);
    expect(level6).toBeLessThan(Math.SQRT2);
    // 레벨 9는 면 0만 (여섯 면은 합동)
    const face0: CellKey[] = [];
    for (let i = 0; i < 512; i++) {
      for (let j = 0; j < 512; j++) face0.push(cellKey(0, 9, i, j));
    }
    const level9 = areaRatio(face0);
    expect(level9).toBeGreaterThan(1.41);
    expect(level9).toBeLessThan(Math.SQRT2);
  });

  it("지구: 반지름 약 531km, 1차맵 최소 칸 평균 약 1.5km, 지형 칸 약 11.7m, 배치 칸 약 5.9m", () => {
    const radius = planetRadiusMeters(EARTH_FACE_LEVEL);
    expect(radius).toBeCloseTo(EARTH_RADIUS_METERS / 12, 6);
    expect(radius / 1000).toBeCloseTo(530.917, 3);
    const earth = planetLevels(EARTH_FACE_LEVEL);
    expect(averageCellEdgeMeters(earth.faceLevel, radius)).toBeCloseTo(1500.674, 3);
    expect(averageCellEdgeMeters(earth.terrainLevel, radius)).toBeCloseTo(11.724, 3);
    expect(averageCellEdgeMeters(earth.placementLevel, radius)).toBeCloseTo(5.862, 3);
    // 평균 칸 크기는 면 레벨과 무관하다: 면 레벨이 1 오르면 반지름이 2배
    expect(planetRadiusMeters(10)).toBeCloseTo(2 * radius, 6);
    expect(planetRadiusMeters(8)).toBeCloseTo(radius / 2, 6);
    expect(averageCellEdgeMeters(10, planetRadiusMeters(10))).toBeCloseTo(1500.674, 3);
    expect(() => planetRadiusMeters(3)).toThrow(RangeError);
  });

  it("칸 크기(√면적)는 위치에 따라 평균의 약 0.91~1.09배다 (지구 레벨 9, 면 0 전수)", () => {
    const radius = planetRadiusMeters(EARTH_FACE_LEVEL);
    const mean = averageCellEdgeMeters(EARTH_FACE_LEVEL, radius);
    let min = Number.POSITIVE_INFINITY;
    let max = 0;
    for (let i = 0; i < 512; i++) {
      for (let j = 0; j < 512; j++) {
        const size = cellSizeMeters(cellKey(0, EARTH_FACE_LEVEL, i, j), radius) / mean;
        min = Math.min(min, size);
        max = Math.max(max, size);
      }
    }
    // 측정값(2026-10-28): 0.913 ~ 1.085. 면 중심 칸이 가장 크고, 면 가장자리 가운데 칸이 가장 작다
    expect(min).toBeGreaterThan(0.91);
    expect(max).toBeLessThan(1.09);
    expect(cellSizeMeters(cellKey(0, EARTH_FACE_LEVEL, 256, 256), radius) / mean).toBeGreaterThan(1.08);
    expect(cellSizeMeters(cellKey(0, EARTH_FACE_LEVEL, 0, 256), radius) / mean).toBeLessThan(0.92);
  });
});
