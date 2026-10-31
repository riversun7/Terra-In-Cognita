// 대륙 배치 시험(ADR 2026-10-31-continent-layouts) — 대륙 수가 큰 땅덩어리 수가 되는지, 배치 종류의 성질(초대륙은 한
// 덩어리, 한쪽 반구는 땅이 반구에 몰림, 지구형은 크기가 다름, 군도는 섬이 많음), 섬은 수에 들지 않는지, 해상도·결정성.
// 땅·바다는 바다 판정(classifyOcean)에서 정해지고 그 뒤 단계(침식·물)는 바다를 바꾸지 않으므로, 대부분 판 구조 + 바다
// 판정만 돌려 본다(생성 전체보다 빠르다). 큰 땅덩어리 = 땅 면적의 3% 이상인 8이웃 덩어리(testLandmasses.ts).
import {
  type ContinentLayout,
  type ContinentLayoutKind,
  NORMAL_PRESETS,
  resolvePlanetSettings,
} from "@terra/shared";
import { describe, expect, it } from "vitest";
import { type PlanetGrid, areaOf, buildGrid } from "./grid.ts";
import { VERTICAL_SCALE, WATER_OCEAN, runPlanetGenerator } from "./index.ts";
import { classifyOcean, cornerCells } from "./seaLevel.ts";
import { buildTectonics } from "./tectonics.ts";
import { type Landmasses, landHemisphereShare, landmasses, majorLandmassCount } from "./testLandmasses.ts";
import { TEST_BIOMES } from "./testFixtures.ts";

const SEEDS = [1, 42, 20261029] as const;
const LAYOUTS: readonly ContinentLayoutKind[] = ["supercontinent", "earthlike", "scattered", "hemisphere"];

interface LandMask {
  readonly grid: PlanetGrid;
  readonly ocean: Uint8Array;
  /** 판 구조 고도(바다 판정이 꼭짓점 둘레를 누르기 전) */
  readonly tectonic: Float32Array;
  /** 바다 판정 뒤 고도와 해수면(실제 환산 m) */
  readonly elevation: Float32Array;
  readonly seaLevel: number;
  readonly masses: Landmasses;
}

const cache = new Map<string, LandMask>();
/** S2 시험 행성 설정(모두 보통)에 대륙 배치만 바꾼 땅·바다(기본 면 레벨 6) */
function landMask(seed: number, continents: ContinentLayout | undefined, faceLevel = 6): LandMask {
  const key = JSON.stringify([seed, continents, faceLevel]);
  const hit = cache.get(key);
  if (hit) return hit;
  const grid = buildGrid(faceLevel);
  const settings = resolvePlanetSettings(NORMAL_PRESETS);
  const { elevation } = buildTectonics(grid, seed, settings, continents);
  const tectonic = Float32Array.from(elevation);
  const { ocean, seaLevel } = classifyOcean(grid, elevation, settings.landPercent);
  const result = { grid, ocean, tectonic, elevation, seaLevel, masses: landmasses(grid, ocean) };
  cache.set(key, result);
  return result;
}

const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
/** 큰 땅덩어리 넓이(땅 대비 몫, 큰 것부터) */
const majorShares = ({ masses }: LandMask) =>
  masses.areas.slice(0, majorLandmassCount(masses)).map((area) => area / masses.landArea);

describe("대륙 수 = 큰 땅덩어리 수 (땅 면적의 3% 이상인 8이웃 덩어리)", () => {
  it("대륙 수 1이면 어느 배치든 큰 땅덩어리가 하나다", () => {
    for (const layout of LAYOUTS) {
      for (const seed of SEEDS) {
        const { masses } = landMask(seed, { layout, count: 1 });
        expect(majorLandmassCount(masses), `${layout} 시드 ${seed}`).toBe(1);
      }
    }
  });

  it("대륙 수 N이면 큰 땅덩어리가 N개다(배치 종류마다 기본값 둘레)", () => {
    const cases: readonly [ContinentLayoutKind, readonly number[]][] = [
      ["supercontinent", [2, 3]],
      ["earthlike", [2, 3, 4, 6]],
      ["scattered", [4, 6, 8]],
      ["hemisphere", [2, 3, 4]],
    ];
    for (const [layout, counts] of cases) {
      for (const count of counts) {
        for (const seed of SEEDS) {
          const { masses } = landMask(seed, { layout, count });
          expect(majorLandmassCount(masses), `${layout} ${count}개 시드 ${seed}`).toBe(count);
        }
      }
    }
  });

  it("대륙 수 10(최대)은 10개 ±1(가장 작은 대륙이 3% 기준 근처라 가끔 빠진다)", () => {
    for (const layout of ["earthlike", "scattered"] as const) {
      for (const seed of SEEDS) {
        const count = majorLandmassCount(landMask(seed, { layout, count: 10 }).masses);
        expect(Math.abs(count - 10), `${layout} 시드 ${seed}: ${count}개`).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("배치 종류의 성질", () => {
  it("초대륙(1개)은 땅의 90% 이상이 한 덩어리다", () => {
    for (const seed of SEEDS) {
      const [largest = 0] = majorShares(landMask(seed, { layout: "supercontinent", count: 1 }));
      expect(largest, `시드 ${seed}`).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("한쪽 반구는 땅이 한 반구에 몰린다: 땅 반구 몫이 시드 셋 평균 0.72 이상(모두 0.65 이상), 지구형보다 0.07 넘게 크다", () => {
    const hemisphere = SEEDS.map((seed) => {
      const { grid, ocean } = landMask(seed, { layout: "hemisphere", count: 3 });
      return landHemisphereShare(grid, ocean);
    });
    const earthlike = SEEDS.map((seed) => {
      const { grid, ocean } = landMask(seed, { layout: "earthlike", count: 3 });
      return landHemisphereShare(grid, ocean);
    });
    expect(Math.min(...hemisphere)).toBeGreaterThanOrEqual(0.65);
    expect(mean(hemisphere)).toBeGreaterThanOrEqual(0.72);
    expect(mean(hemisphere) - mean(earthlike)).toBeGreaterThan(0.07);
  });

  it("지구형은 대륙 크기가 다르고(가장 큰 것 ≥ 가장 작은 것 × 1.5), 여러 대륙·군도는 비슷하다(× 3 안)", () => {
    for (const seed of SEEDS) {
      const earth = majorShares(landMask(seed, { layout: "earthlike", count: 3 }));
      expect((earth[0] ?? 0) / (earth.at(-1) ?? 1), `지구형 시드 ${seed}`).toBeGreaterThanOrEqual(1.5);
      const scattered = majorShares(landMask(seed, { layout: "scattered", count: 6 }));
      expect((scattered[0] ?? 0) / (scattered.at(-1) ?? 1), `군도 시드 ${seed}`).toBeLessThan(3);
    }
  });

  it("섬은 대륙 수에 들지 않는다: 큰 땅덩어리 밖에 작은 섬이 있다(여러 대륙·군도 8개 이상, 지구형 3개 이상)", () => {
    for (const seed of SEEDS) {
      for (const [layout, count, islands] of [
        ["scattered", 6, 8],
        ["earthlike", 3, 3],
      ] as const) {
        const { masses } = landMask(seed, { layout, count });
        const minor = masses.areas.length - majorLandmassCount(masses);
        expect(minor, `${layout} 시드 ${seed}`).toBeGreaterThanOrEqual(islands);
      }
    }
  });

  it("판 경계 지형이 생긴다: 초대륙 안에 실제 환산 3,000m 넘는 산맥이 땅의 0.3% 이상", () => {
    for (const seed of SEEDS) {
      const {
        grid,
        ocean,
        elevation,
        seaLevel: sea,
      } = landMask(seed, { layout: "supercontinent", count: 1 });
      let land = 0;
      let high = 0;
      for (let c = 0; c < grid.cellCount; c++) {
        if (ocean[c] === 1) continue;
        land += areaOf(grid, c);
        if ((elevation[c] ?? 0) - sea > 3000) high += areaOf(grid, c);
      }
      expect(high / land, `시드 ${seed}`).toBeGreaterThanOrEqual(0.003);
    }
  });
});

describe("해상도·결정성·꼭짓점", () => {
  it("같은 입력은 같은 고도(두 번), 면 레벨 5와 6의 땅·바다가 90% 이상 같은 곳이다", () => {
    for (const layout of ["earthlike", "supercontinent"] as const) {
      const continents = { layout, count: layout === "earthlike" ? 3 : 1 };
      const grid6 = buildGrid(6);
      const settings = resolvePlanetSettings(NORMAL_PRESETS);
      const again = buildTectonics(grid6, 42, settings, continents).elevation;
      const fine = landMask(42, continents, 6);
      expect(again, layout).toEqual(fine.tectonic);
      const coarse = landMask(42, continents, 5);
      const n5 = 32;
      const n6 = 64;
      let same = 0;
      for (let face = 0; face < 6; face++) {
        for (let j = 0; j < n5; j++) {
          for (let i = 0; i < n5; i++) {
            let landCells = 0;
            for (const [di, dj] of [
              [0, 0],
              [1, 0],
              [0, 1],
              [1, 1],
            ] as const) {
              const c6 = face * n6 * n6 + (2 * j + dj) * n6 + (2 * i + di);
              if (fine.ocean[c6] !== 1) landCells++;
            }
            const land5 = coarse.ocean[face * n5 * n5 + j * n5 + i] !== 1;
            if (land5 === landCells >= 2) same++;
          }
        }
      }
      expect(same / (6 * n5 * n5), layout).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("생성 전체: 메타에 대륙 배치가 있고, 꼭짓점 24칸은 바다다", () => {
    const continents = { layout: "scattered", count: 6 } as const;
    const { fields } = runPlanetGenerator({
      faceLevel: 5,
      seed: 7,
      settings: resolvePlanetSettings(NORMAL_PRESETS),
      biomes: TEST_BIOMES,
      continents,
    });
    expect(fields.meta.continents).toEqual(continents);
    for (const c of cornerCells(buildGrid(5)))
      expect((fields.water[c] ?? 0) & WATER_OCEAN, `칸 ${c}`).toBe(WATER_OCEAN);
    expect(VERTICAL_SCALE).toBe(12);
  });
});
