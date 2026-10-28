import { describe, expect, it } from "vitest";
import { BASE_COST } from "../grid/costs.ts";
import { firstDifference } from "../testSupport.ts";
import { PLACEMENT_SIZE, TERRAIN_SIZE, TERRAIN_VERTEX_SIZE } from "../units.ts";
import { TEMP_TERRAIN_GENERATOR_VERSION } from "../version.ts";
import { valueNoise } from "./noise.ts";
import {
  CLIFF_RELIEF_CM,
  SURFACE_COST,
  SURFACE_GRASS,
  SURFACE_ROCK,
  SURFACE_WATER,
  generateTempTerrain,
  placementCostsFromTerrain,
  seedFromCellKey,
  terrainCellRelief,
  terrainHash,
} from "./tempTerrain.ts";

describe("정수 값 노이즈", () => {
  it("값은 0 ~ 65535 정수이고, 이웃 점끼리 부드럽게 이어진다", () => {
    for (let i = 0; i < 200; i++) {
      const x = i * 7;
      const y = i * 3;
      const value = valueNoise(5, x, y, 4);
      expect(Number.isInteger(value) && value >= 0 && value <= 0xffff).toBe(true);
    }
    // 간격 16의 격자점 (32, 48)과 바로 옆 칸은 값이 거의 같다(부드러움)
    const corner = valueNoise(9, 32, 48, 4);
    expect(Math.abs(valueNoise(9, 33, 48, 4) - corner)).toBeLessThan(1024);
  });
});

describe("S1 임시 지형", () => {
  it("크기·범위·버전", () => {
    const terrain = generateTempTerrain(12345);
    expect(terrain.generatorVersion).toBe(TEMP_TERRAIN_GENERATOR_VERSION);
    expect(terrain.heights).toHaveLength(TERRAIN_VERTEX_SIZE * TERRAIN_VERTEX_SIZE);
    expect(terrain.surface).toHaveLength(TERRAIN_SIZE * TERRAIN_SIZE);
    expect(terrain.surface.every((value) => value <= SURFACE_ROCK)).toBe(true);
  });

  it("같은 시드는 같은 지형, 다른 시드는 다른 지형", () => {
    const a = generateTempTerrain(777);
    const b = generateTempTerrain(777);
    expect(firstDifference(a.heights, b.heights)).toBe(-1);
    expect(firstDifference(a.surface, b.surface)).toBe(-1);
    expect(terrainHash(a)).toBe(terrainHash(b));
    expect(terrainHash(generateTempTerrain(778))).not.toBe(terrainHash(a));
  });

  it("고정 시드의 결과 해시(골든)", () => {
    // 생성기 출력이 바뀌면 달라진다. 의도한 변경이면 TEMP_TERRAIN_GENERATOR_VERSION을 올리고 값을 고친다.
    expect(terrainHash(generateTempTerrain(12345))).toBe("ac21c7fb");
    expect(terrainHash(generateTempTerrain(seedFromCellKey(2 ** 40 + 17)))).toBe("d117e1e6");
  });

  it("여러 시드에서 물·바위·풀이 모두 나오고, 물은 막힘이다", () => {
    let water = 0;
    let rock = 0;
    let grass = 0;
    let cliffs = 0;
    const seeds = 12;
    for (let seed = 1; seed <= seeds; seed++) {
      const terrain = generateTempTerrain(seed * 7919);
      for (let ty = 0; ty < TERRAIN_SIZE; ty++) {
        for (let tx = 0; tx < TERRAIN_SIZE; tx++) {
          const surface = terrain.surface[ty * TERRAIN_SIZE + tx];
          if (surface === SURFACE_WATER) water++;
          if (surface === SURFACE_ROCK) rock++;
          if (surface === SURFACE_GRASS) grass++;
          if (terrainCellRelief(terrain, tx, ty) >= CLIFF_RELIEF_CM) cliffs++;
        }
      }
    }
    const total = seeds * TERRAIN_SIZE * TERRAIN_SIZE;
    expect(water / total).toBeGreaterThan(0.08);
    expect(water / total).toBeLessThan(0.45);
    expect(rock / total).toBeGreaterThan(0.01);
    expect(grass / total).toBeGreaterThan(0.2);
    expect(cliffs / total).toBeGreaterThan(0.002);
    expect(SURFACE_COST[SURFACE_WATER]).toBe(0);
    expect(SURFACE_COST[SURFACE_GRASS]).toBe(BASE_COST);
  });

  it("지형 칸 하나가 배치 칸 2×2를 덮고, 물·가파른 비탈은 막힌다", () => {
    const terrain = generateTempTerrain(4242);
    const costs = placementCostsFromTerrain(terrain);
    // 배치 칸 (px, py)는 지형 칸 (px ÷ 2, py ÷ 2)의 값을 따른다
    const expected = new Uint16Array(PLACEMENT_SIZE * PLACEMENT_SIZE);
    for (let py = 0; py < PLACEMENT_SIZE; py++) {
      for (let px = 0; px < PLACEMENT_SIZE; px++) {
        const tx = px >> 1;
        const ty = py >> 1;
        const surface = terrain.surface[ty * TERRAIN_SIZE + tx] ?? SURFACE_WATER;
        const blocked = surface === SURFACE_WATER || terrainCellRelief(terrain, tx, ty) >= CLIFF_RELIEF_CM;
        expected[py * PLACEMENT_SIZE + px] = blocked ? 0 : (SURFACE_COST[surface] ?? 0);
      }
    }
    expect(costs).toHaveLength(PLACEMENT_SIZE * PLACEMENT_SIZE);
    expect(firstDifference(costs, expected)).toBe(-1);
    expect(costs.filter((cost) => cost === 0).length).toBeGreaterThan(1000);
  });

  it("칸 키 → 시드는 결정적이고 안전 정수만 받는다", () => {
    expect(seedFromCellKey(123)).toBe(seedFromCellKey(123));
    expect(seedFromCellKey(123)).not.toBe(seedFromCellKey(124));
    expect(seedFromCellKey(2 ** 40)).not.toBe(seedFromCellKey(0));
    expect(() => seedFromCellKey(-1)).toThrow(RangeError);
    expect(() => seedFromCellKey(2 ** 53)).toThrow(RangeError);
    for (const bad of [-1, 1.5, 2 ** 32]) expect(() => generateTempTerrain(bad)).toThrow(RangeError);
  });
});
