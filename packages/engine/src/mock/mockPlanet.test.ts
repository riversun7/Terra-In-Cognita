import { FACES, wrapFaceIJ } from "@terra/planet";
import { describe, expect, it } from "vitest";
import { WATER_BITS, waterDepthClass } from "../planet/planetTypes.ts";
import { decodedTileProblem } from "../planet/tileMesh.ts";
import {
  MOCK_MAX_ELEVATION_M,
  MOCK_PLANET_BIOMES,
  generateMockTile,
  mockPlanetDescription,
} from "./mockPlanet.ts";
import { createMockPlanet } from "./mockPlanetSource.ts";

const SEED = 20261029;

describe("[임시] 가짜 행성", () => {
  it("같은 시드·요청이면 같은 타일, 모양은 진짜 타일과 같다", () => {
    const request = { face: 2 as const, mapLevel: 8, i0: 96, j0: 160, size: 32 };
    const a = generateMockTile(request, SEED, 9);
    const b = generateMockTile(request, SEED, 9);
    const c = generateMockTile(request, SEED + 1, 9);
    expect(decodedTileProblem(a)).toBeNull();
    expect(a).toEqual(b);
    expect(a.heightsM).not.toEqual(c.heightsM);
    expect([a.faceLevel, a.mapLevel, a.face, a.i0, a.j0, a.size]).toEqual([9, 8, 2, 96, 160, 32]);
  });

  it("같은 레벨 이웃은 면 경계 너머에서도 맞닿은 변의 꼭짓점 높이가 같다", () => {
    for (const face of FACES) {
      // i 끝 변(면 경계) 타일과 그 너머 타일
      const wrapped = wrapFaceIJ(face, 9, 512, 100);
      expect(wrapped).not.toBeNull();
      if (!wrapped) continue;
      const a = generateMockTile({ face, mapLevel: 9, i0: 480, j0: 96, size: 32 }, SEED, 9);
      const tx = Math.floor(wrapped.i / 32);
      const ty = Math.floor(wrapped.j / 32);
      const b = generateMockTile(
        { face: wrapped.face, mapLevel: 9, i0: tx * 32, j0: ty * 32, size: 32 },
        SEED,
        9,
      );
      // a의 i = 512 변 위 꼭짓점 (512, j) ↔ b의 같은 꼭짓점: 높이 값 모음이 같다
      const edgeA = new Set<number>();
      for (let cj = 0; cj <= 32; cj++) edgeA.add(a.heightsM[cj * 33 + 32] ?? 0);
      const bValues: number[] = [];
      for (let k = 0; k <= 32; k++) {
        bValues.push(
          b.heightsM[k] ?? 0,
          b.heightsM[32 * 33 + k] ?? 0,
          b.heightsM[k * 33] ?? 0,
          b.heightsM[k * 33 + 32] ?? 0,
        );
      }
      const bSet = new Set(bValues);
      for (const value of edgeA) expect(bSet.has(value)).toBe(true);
    }
  });

  it("위·아래 레벨이 같은 꼭짓점에서 같은 높이", () => {
    const coarse = generateMockTile({ face: 4, mapLevel: 7, i0: 32, j0: 64, size: 32 }, SEED, 9);
    const fine = generateMockTile({ face: 4, mapLevel: 8, i0: 64, j0: 128, size: 32 }, SEED, 9);
    // 고운 타일의 짝수 꼭짓점 (2a, 2b) = 거친 타일의 꼭짓점 (a, b) (0 ≤ a, b ≤ 16)
    for (let b = 0; b <= 16; b += 4) {
      for (let a = 0; a <= 16; a += 4) {
        expect(fine.heightsM[2 * b * 33 + 2 * a]).toBe(coarse.heightsM[b * 33 + a]);
      }
    }
  });

  it("땅 25~50%, 높이 −950~760m, 바이옴이 여러 가지, 바다 칸은 평균 높이 < 0이고 수심 등급이 있다", () => {
    let land = 0;
    let cells = 0;
    const biomes = new Set<number>();
    let minHeight = Number.POSITIVE_INFINITY;
    let maxHeight = Number.NEGATIVE_INFINITY;
    for (const face of FACES) {
      for (let ty = 0; ty < 2; ty++) {
        for (let tx = 0; tx < 2; tx++) {
          const tile = generateMockTile({ face, mapLevel: 6, i0: tx * 32, j0: ty * 32, size: 32 }, SEED, 9);
          for (const h of tile.heightsM) {
            minHeight = Math.min(minHeight, h);
            maxHeight = Math.max(maxHeight, h);
          }
          for (let c = 0; c < 1024; c++) {
            cells += 1;
            const water = tile.water[c] ?? 0;
            biomes.add(tile.biome[c] ?? 0);
            if ((water & WATER_BITS.ocean) === 0) {
              land += 1;
              continue;
            }
            expect(waterDepthClass(water)).toBeGreaterThanOrEqual(1);
            const ci = c % 32;
            const cj = Math.floor(c / 32);
            const mean =
              ((tile.heightsM[cj * 33 + ci] ?? 0) +
                (tile.heightsM[cj * 33 + ci + 1] ?? 0) +
                (tile.heightsM[(cj + 1) * 33 + ci] ?? 0) +
                (tile.heightsM[(cj + 1) * 33 + ci + 1] ?? 0)) /
              4;
            expect(mean).toBeLessThan(0);
          }
        }
      }
    }
    expect(land / cells).toBeGreaterThan(0.25);
    expect(land / cells).toBeLessThan(0.5);
    expect(minHeight).toBeGreaterThanOrEqual(-950);
    expect(maxHeight).toBeLessThanOrEqual(MOCK_MAX_ELEVATION_M);
    expect(biomes.size).toBeGreaterThanOrEqual(10);
    for (const biome of biomes) expect(biome).toBeLessThan(MOCK_PLANET_BIOMES.length);
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
    const mock = createMockPlanet({ seed: SEED });
    const request = { face: 0 as const, mapLevel: 5, i0: 0, j0: 0, size: 32 };
    const tile = await mock.source(request, new AbortController().signal);
    expect(tile).toEqual(generateMockTile(request, SEED, 9));
    const controller = new AbortController();
    controller.abort();
    await expect(mock.source(request, controller.signal)).rejects.toThrow(/aborted/);
    expect(mock.generated()).toBe(1);
    mock.dispose();
    await expect(mock.source(request, new AbortController().signal)).rejects.toThrow(/disposed/);
  });
});
