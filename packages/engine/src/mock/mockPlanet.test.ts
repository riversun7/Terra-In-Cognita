import { type Face, FACES, WATER_COAST, WATER_OCEAN, wrapFaceIJ } from "@terra/planet";
import { describe, expect, it } from "vitest";
import { waterDepthClass } from "../planet/planetTypes.ts";
import { decodedTileProblem } from "../planet/tileMesh.ts";
import {
  MOCK_MAX_ELEVATION_M,
  MOCK_PLANET_BIOMES,
  createMockTileMaker,
  mockPlanetDescription,
} from "./mockPlanet.ts";
import { createMockPlanet } from "./mockPlanetSource.ts";

const SEED = 20261029;
/** 시험은 작은 행성(면 레벨 7, 칸 9.8만 개)으로 본다. 규칙은 면 레벨과 상관없다 */
const F = 7;
const maker = createMockTileMaker(SEED, F);

/** 맵 레벨 level의 칸 고도(면 face, 칸 i·j) */
function cellHeight(level: number, face: Face, i: number, j: number): number {
  const values = maker.level(level);
  return values.elevationM[face * values.n * values.n + j * values.n + i] ?? 0;
}

describe("[임시] 가짜 행성 — 타일 규칙은 서버 굽기와 같다(ADR 36)", () => {
  it("같은 시드·요청이면 같은 타일, 모양은 진짜 타일과 같다", () => {
    const request = { face: 2 as const, mapLevel: 6, i0: 32, j0: 0, size: 32 };
    const a = maker.tile(request);
    const b = createMockTileMaker(SEED, F).tile(request);
    const c = createMockTileMaker(SEED + 1, F).tile(request);
    expect(decodedTileProblem(a)).toBeNull();
    expect(a).toEqual(b);
    expect(a.heightsM).not.toEqual(c.heightsM);
    expect([a.faceLevel, a.mapLevel, a.face, a.i0, a.j0, a.size]).toEqual([7, 6, 2, 32, 0, 32]);
    expect(() => maker.tile({ face: 0, mapLevel: 6, i0: 5, j0: 0, size: 32 })).toThrow(RangeError);
  });

  it("윗 레벨 칸 = 아래 2×2칸 고도 평균(가장 가까운 정수)", () => {
    for (const level of [3, 4, 5, 6]) {
      const n = 1 << level;
      for (const face of FACES) {
        for (const [i, j] of [
          [0, 0],
          [n - 1, n - 1],
          [n >> 1, (n >> 2) + 1],
        ] as const) {
          const sum =
            cellHeight(level + 1, face, 2 * i, 2 * j) +
            cellHeight(level + 1, face, 2 * i + 1, 2 * j) +
            cellHeight(level + 1, face, 2 * i, 2 * j + 1) +
            cellHeight(level + 1, face, 2 * i + 1, 2 * j + 1);
          expect(cellHeight(level, face, i, j)).toBe(Math.round(sum / 4));
        }
      }
    }
  });

  it("꼭짓점 높이 = 나누는 칸 평균: 면 안 4칸, 면 경계는 이웃 면 칸 포함 4칸, 큐브 꼭짓점은 3칸", () => {
    const level = 6;
    const tile = maker.tile({ face: 0, mapLevel: level, i0: 0, j0: 0, size: 32 });
    const mean = (cells: readonly (readonly [Face, number, number])[]): number =>
      Math.round(cells.reduce((sum, [f, i, j]) => sum + cellHeight(level, f, i, j), 0) / cells.length);
    const across = (i: number, j: number): [Face, number, number] => {
      const target = wrapFaceIJ(0, level, i, j);
      if (!target) throw new Error("no cell");
      return [target.face, target.i, target.j];
    };
    // 면 안: (5, 7)
    expect(tile.heightsM[7 * 33 + 5]).toBe(
      mean([
        [0, 4, 6],
        [0, 5, 6],
        [0, 4, 7],
        [0, 5, 7],
      ]),
    );
    // 면 경계(i = 0): 왼쪽 두 칸은 이웃 면
    expect(tile.heightsM[7 * 33]).toBe(mean([across(-1, 6), [0, 0, 6], across(-1, 7), [0, 0, 7]]));
    // 큐브 꼭짓점 (0, 0): 칸 3개
    expect(wrapFaceIJ(0, level, -1, -1)).toBeNull();
    expect(tile.heightsM[0]).toBe(mean([across(0, -1), across(-1, 0), [0, 0, 0]]));
  });

  it("같은 레벨 이웃은 면 경계 너머에서도 맞닿은 변의 꼭짓점 높이가 같다", () => {
    const n = 1 << F;
    for (const face of FACES) {
      // i 끝 변(면 경계) 타일과 그 너머 타일
      const wrapped = wrapFaceIJ(face, F, n, 40);
      expect(wrapped).not.toBeNull();
      if (!wrapped) continue;
      const a = maker.tile({ face, mapLevel: F, i0: n - 32, j0: 32, size: 32 });
      const tx = Math.floor(wrapped.i / 32);
      const ty = Math.floor(wrapped.j / 32);
      const b = maker.tile({ face: wrapped.face, mapLevel: F, i0: tx * 32, j0: ty * 32, size: 32 });
      // a의 i = n 변 위 꼭짓점 높이 모음이 b의 네 변 높이 모음 안에 있다
      const bValues = new Set<number>();
      for (let k = 0; k <= 32; k++) {
        for (const index of [k, 32 * 33 + k, k * 33, k * 33 + 32]) bValues.add(b.heightsM[index] ?? 0);
      }
      for (let cj = 0; cj <= 32; cj++) expect(bValues.has(a.heightsM[cj * 33 + 32] ?? 0)).toBe(true);
    }
  });

  it("레벨이 다른 타일은 같은 자리 꼭짓점이라도 높이가 다르다(거친 쪽이 넓게 평균한다) — 치마가 막을 차이", () => {
    // 맵 레벨 6 타일(칸 32~63)과 그 왼아래 4분의 1을 덮는 맵 레벨 7 타일(칸 64~95): 7의 짝수 꼭짓점 = 6의 꼭짓점 자리
    let differ = 0;
    let largest = 0;
    for (const face of FACES) {
      const coarse = maker.tile({ face, mapLevel: 6, i0: 32, j0: 32, size: 32 });
      const fine = maker.tile({ face, mapLevel: 7, i0: 64, j0: 64, size: 32 });
      for (let b = 0; b <= 16; b++) {
        for (let a = 0; a <= 16; a++) {
          const gap = Math.abs((fine.heightsM[2 * b * 33 + 2 * a] ?? 0) - (coarse.heightsM[b * 33 + a] ?? 0));
          if (gap > 0) differ += 1;
          largest = Math.max(largest, gap);
        }
      }
    }
    expect(differ).toBeGreaterThan(6 * 17 * 17 * 0.5);
    expect(largest).toBeGreaterThan(20);
  });

  it("땅 25~50%, 높이 −950~760m, 바이옴 여러 가지, 바다 칸은 높이 < 0이고 수심 등급이 있다, 해안은 바다 옆 땅", () => {
    const values = maker.level(F);
    let land = 0;
    let coast = 0;
    const broken: string[] = [];
    const biomes = new Set<number>();
    for (let index = 0; index < values.elevationM.length; index++) {
      const height = values.elevationM[index] ?? 0;
      const water = values.water[index] ?? 0;
      biomes.add(values.biome[index] ?? 0);
      if (height < -950 || height > MOCK_MAX_ELEVATION_M) broken.push(`height ${index}`);
      if ((water & WATER_OCEAN) === 0) {
        land += 1;
        if ((water & WATER_COAST) !== 0) coast += 1;
        if (height < 0) broken.push(`land below sea ${index}`);
        continue;
      }
      if (height >= 0) broken.push(`sea above sea level ${index}`);
      if (waterDepthClass(water) < 1) broken.push(`no depth class ${index}`);
      if ((water & WATER_COAST) !== 0) broken.push(`coast bit on sea ${index}`);
    }
    expect(broken.slice(0, 5)).toEqual([]);
    const ratio = land / values.elevationM.length;
    expect(ratio).toBeGreaterThan(0.25);
    expect(ratio).toBeLessThan(0.5);
    expect(biomes.size).toBeGreaterThanOrEqual(10);
    for (const biome of biomes) expect(biome).toBeLessThan(MOCK_PLANET_BIOMES.length);
    expect(coast).toBeGreaterThan(values.n);
  });

  it("행성 설명: 지구 크기, 바이옴 색은 표 순서대로", () => {
    const planet = mockPlanetDescription(9);
    expect(planet.faceLevel).toBe(9);
    expect(planet.radiusM).toBeGreaterThan(530_000);
    expect(planet.radiusM).toBeLessThan(532_000);
    expect(planet.biomeColors).toHaveLength(MOCK_PLANET_BIOMES.length);
    expect(planet.biomeColors[3]).toBe(MOCK_PLANET_BIOMES[3].color);
  });

  it("타일 원천: 워커가 없으면 화면 스레드에서 만들고, 취소한 요청은 거절한다", async () => {
    const mock = createMockPlanet({ seed: SEED, faceLevel: 6 });
    // 면 레벨 6의 가장 거친 단계(맵 레벨 2)는 면 전체 4×4칸 타일이다
    const request = { face: 0 as const, mapLevel: 2, i0: 0, j0: 0, size: 4 };
    const tile = await mock.source(request, new AbortController().signal);
    expect(tile).toEqual(createMockTileMaker(SEED, 6).tile(request));
    const controller = new AbortController();
    controller.abort();
    await expect(mock.source(request, controller.signal)).rejects.toThrow(/aborted/);
    expect(mock.generated()).toBe(1);
    mock.dispose();
    await expect(mock.source(request, new AbortController().signal)).rejects.toThrow(/disposed/);
  });
});
