import { describe, expect, it } from "vitest";
import {
  BENCH_FOCUS,
  CAMERA_DISTANCE_MAX,
  CAMERA_DISTANCE_MIN,
  PLANET_RADIUS_M,
  TILE_INDEX_COUNT,
  TILE_VERTEX_COUNT,
  type TileKey,
  buildWorkload,
  cameraPose,
  selectTiles,
} from "./gpuBenchWorkload.ts";

/** a가 b를 덮는가(같은 면에서 a가 b의 조상이거나 같은 타일) */
function covers(a: TileKey, b: TileKey): boolean {
  if (a.face !== b.face || a.level > b.level) return false;
  const shift = b.level - a.level;
  return b.x >> shift === a.x && b.y >> shift === a.y;
}

/** 배열 내용 지문(FNV-1a) — 같은 입력이면 같은 결과인지 본다 */
function fingerprint(arrays: ArrayLike<number>[]): number {
  let hash = 0x811c9dc5;
  for (const array of arrays) {
    for (let i = 0; i < array.length; i++) {
      hash ^= Math.round((array[i] ?? 0) * 1000) | 0;
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return hash >>> 0;
}

describe("측정용 타일 고르기(쿼드트리 LOD)", () => {
  it.each([6, 7, 8, 40, 160, 320])("타일 %i개를 정확히 고른다", (target) => {
    expect(selectTiles(target, BENCH_FOCUS)).toHaveLength(target);
  });

  it("6개보다 적게는 못 고른다(면 6개가 뿌리)", () => {
    expect(() => selectTiles(5, BENCH_FOCUS)).toThrow(RangeError);
  });

  it("고른 타일은 서로 겹치지 않는다(조상·자손이 함께 있지 않다)", () => {
    const tiles = selectTiles(320, BENCH_FOCUS);
    for (const a of tiles) {
      for (const b of tiles) {
        if (a !== b) expect(covers(a, b)).toBe(false);
      }
    }
  });

  it("빈 곳 없이 덮을 때 넓이 합은 면 6개다(넘치는 수만 뺀다)", () => {
    // 6 + 3k개면 빼는 타일이 없다(160 = 6 + 3 × 51 + 1이라 하나 빠짐, 159는 빠짐 없음)
    const tiles = selectTiles(159, BENCH_FOCUS);
    const area = tiles.reduce((sum, tile) => sum + 4 ** -tile.level, 0);
    expect(area).toBeCloseTo(6, 10);
  });

  it("넘긴 초점 둘레를 잘게 나눈다(초점마다 고른 타일이 다르다)", () => {
    const other: readonly [number, number, number] = [0, 0, -2];
    const around = selectTiles(160, other);
    expect(around).not.toEqual(selectTiles(160, BENCH_FOCUS));
    // 가장 잘게 나눈 타일은 모두 −z 면(면 5)에 있다
    const deepest = Math.max(...around.map((tile) => tile.level));
    expect(deepest).toBeGreaterThanOrEqual(3);
    for (const tile of around.filter((key) => key.level === deepest)) expect(tile.face).toBe(5);
    // 길이만 다른 방향은 같은 결과
    expect(selectTiles(40, [0, 0, -1])).toEqual(selectTiles(40, other));
    expect(() => selectTiles(40, [0, 0, 0])).toThrow(RangeError);
  });

  it("초점 가까운 타일이 가장 잘고, 반대편은 크다", () => {
    const { tiles } = buildWorkload(160);
    const facing = (tile: (typeof tiles)[number]): number =>
      (tile.originX * BENCH_FOCUS[0] + tile.originY * BENCH_FOCUS[1] + tile.originZ * BENCH_FOCUS[2]) /
      PLANET_RADIUS_M;
    // oxlint-disable-next-line unicorn/no-array-sort -- 시험에서 만든 사본
    const byFacing = [...tiles].sort((a, b) => facing(b) - facing(a));
    const deepest = Math.max(...tiles.map((tile) => tile.level));
    expect(byFacing[0]?.level).toBe(deepest);
    expect(deepest).toBeGreaterThanOrEqual(3);
    expect(byFacing.at(-1)?.level).toBeLessThanOrEqual(1);
  });
});

describe("측정용 행성 자료", () => {
  const workload = buildWorkload(40);

  it("타일마다 꼭짓점 33×33 + 치마 4×33, 삼각형 32×32×2 + 치마 4×32×2", () => {
    expect(TILE_VERTEX_COUNT).toBe(1221);
    expect(TILE_INDEX_COUNT).toBe(6912);
    expect(workload.tiles).toHaveLength(40);
    for (const tile of workload.tiles) {
      expect(tile.positions).toHaveLength(TILE_VERTEX_COUNT * 3);
      expect(tile.normals).toHaveLength(TILE_VERTEX_COUNT * 3);
      expect(tile.colors).toHaveLength(TILE_VERTEX_COUNT * 3);
    }
    expect(workload.index).toHaveLength(TILE_INDEX_COUNT);
    expect(Math.max(...workload.index)).toBe(TILE_VERTEX_COUNT - 1);
    expect(workload.triangleCount).toBe(40 * 2304);
  });

  it("타일 원점은 해수면 구 위에 있고, 꼭짓점은 원점 기준 좌표다", () => {
    for (const tile of workload.tiles) {
      expect(Math.hypot(tile.originX, tile.originY, tile.originZ)).toBeCloseTo(PLANET_RADIUS_M, 3);
      // 원점 + 상대 좌표 = 행성 중심에서 반지름 근처(고도 과장 ±3%, 치마는 더 아래)
      for (let v = 0; v < TILE_VERTEX_COUNT; v += 97) {
        const r = Math.hypot(
          tile.originX + (tile.positions[v * 3] ?? 0),
          tile.originY + (tile.positions[v * 3 + 1] ?? 0),
          tile.originZ + (tile.positions[v * 3 + 2] ?? 0),
        );
        expect(r / PLANET_RADIUS_M).toBeGreaterThan(0.9);
        expect(r / PLANET_RADIUS_M).toBeLessThan(1.04);
      }
    }
  });

  it("법선은 길이 1이고 바깥을 본다", () => {
    for (const tile of workload.tiles) {
      for (let v = 0; v < TILE_VERTEX_COUNT; v += 13) {
        const nx = tile.normals[v * 3] ?? 0;
        const ny = tile.normals[v * 3 + 1] ?? 0;
        const nz = tile.normals[v * 3 + 2] ?? 0;
        expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 4);
        const outward = nx * tile.originX + ny * tile.originY + nz * tile.originZ;
        expect(outward).toBeGreaterThan(0);
      }
    }
  });

  it("색은 0~1 범위다", () => {
    for (const tile of workload.tiles) {
      for (const value of tile.colors) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it("같은 타일 수면 늘 같은 자료다", () => {
    const again = buildWorkload(40);
    const arrays = (w: typeof workload) => w.tiles.flatMap((tile) => [tile.positions, tile.colors]);
    expect(fingerprint(arrays(again))).toBe(fingerprint(arrays(workload)));
  });
});

describe("측정 카메라 길", () => {
  it("거리는 정한 범위 안이고, 초점 쪽을 본다", () => {
    for (let t = 0; t < 30; t += 0.37) {
      const pose = cameraPose(t);
      const distance = Math.hypot(pose.x, pose.y, pose.z);
      expect(distance).toBeGreaterThanOrEqual(CAMERA_DISTANCE_MIN * PLANET_RADIUS_M - 1e-6);
      expect(distance).toBeLessThanOrEqual(CAMERA_DISTANCE_MAX * PLANET_RADIUS_M + 1e-6);
      const facing = (pose.x * BENCH_FOCUS[0] + pose.y * BENCH_FOCUS[1] + pose.z * BENCH_FOCUS[2]) / distance;
      expect(facing).toBeGreaterThan(0.9);
      expect(pose.near).toBeGreaterThan(0);
      expect(pose.far).toBeGreaterThan(distance);
    }
  });
});
