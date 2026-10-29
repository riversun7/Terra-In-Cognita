// 반복·단조로움 검사(보고 모드) — F7 × 시드 3개(S2 시험 행성 설정)의 지표를 표로 찍는다. 문턱은 아직 막지 않는다
// (문서 docs/questions/2026-10-29-special-terrain.md 4.4: 기후 고침이 들어올 때까지 보고만, 그 뒤 막을 지표를 정한다).
// 여기서 막는 것: 지표가 모두 있고 유한한지, 측정 도우미가 답을 아는 경우에 맞는 값을 내는지.
// F9 값과 기준 비교는 측정 스크립트(pnpm --filter @terra/planet variety)가 한다.
import { NORMAL_PRESETS, resolvePlanetSettings } from "@terra/shared";
import { describe, expect, it } from "vitest";
import { runPlanetGenerator } from "./generate.ts";
import { mix32 } from "./random.ts";
import { S2_TEST_PLANET_SEED, TEST_BIOMES } from "./testFixtures.ts";
import {
  type SeedVariety,
  VARIETY_TARGETS,
  type VarietyMetric,
  crossSeedMetrics,
  fieldMetrics,
  formatVarietyReport,
  varietyContext,
} from "./testVariety.ts";
import { boxDimension, jsDivergence, latitudeR2, singleBiomeWindowShare } from "./testVarietyMeasures.ts";
import { unitMetrics } from "./testVarietyUnit.ts";
import type { PlanetGeneratorInput } from "./types.ts";

// 표를 찍을 console(vitest가 돌리는 Node의 것). src는 Node·DOM 타입을 쓰지 않아 여기서만 모양을 적는다
declare const console: { info(message: string): void };

const SEEDS = [S2_TEST_PLANET_SEED, 1, 42];
const everyCell = (): boolean => true;

describe("반복·단조로움 검사 (보고 모드: 값을 찍고 문턱은 막지 않는다)", () => {
  it("F7 × 시드 3개: 문턱이 있는 지표가 모두 있고 모든 값이 유한하다", { timeout: 120_000 }, () => {
    const ctx = varietyContext(7);
    const base: PlanetGeneratorInput = {
      faceLevel: 7,
      seed: S2_TEST_PLANET_SEED,
      settings: resolvePlanetSettings(NORMAL_PRESETS),
      biomes: TEST_BIOMES,
    };
    const perSeed: SeedVariety[] = [];
    for (const seed of SEEDS) {
      const input = { ...base, seed };
      const result = fieldMetrics(ctx, runPlanetGenerator(input), input);
      perSeed.push({ ...result, metrics: [...result.metrics, ...unitMetrics(ctx, seed, input.settings)] });
    }
    const cross = crossSeedMetrics(
      perSeed.map((result) => result.bandTable),
      TEST_BIOMES.length,
    );
    console.info(
      `반복 검사 F7 (출력 판 기준은 bench/variety-baseline.json)\n${formatVarietyReport(SEEDS, perSeed, cross)}`,
    );
    const all: VarietyMetric[] = [...perSeed.flatMap((result) => result.metrics), ...cross];
    for (const entry of all) expect(Number.isFinite(entry.value), entry.name).toBe(true);
    const names = new Set(all.map((entry) => entry.name));
    for (const name of Object.keys(VARIETY_TARGETS)) expect(names.has(name), name).toBe(true);
    // 보고 모드: 막는 문턱이 아직 없다(gate를 켜면 이 줄을 지우고 문턱 시험을 더한다)
    expect(Object.values(VARIETY_TARGETS).filter((target) => target.gate)).toEqual([]);
  });

  it("측정 도우미: 곧은 경계 상자 차원 1·면을 채우면 2, 칸마다 무작위 바이옴이면 단일 바이옴 창이 없다", () => {
    const ctx = varietyContext(5);
    const { n, faceCells, cellCount } = ctx.grid;
    const column = (c: number) => (c % faceCells) % n === n / 2;
    expect(boxDimension(ctx, column, 1, 4)).toBeCloseTo(1, 10);
    expect(boxDimension(ctx, everyCell, 1, 4)).toBeCloseTo(2, 10);
    const randomBiome = Uint8Array.from({ length: cellCount }, (_, c) => mix32(c + 1) % 8);
    expect(singleBiomeWindowShare(ctx, everyCell, randomBiome, 4).share).toBeLessThan(0.01);
    const oneBiome = new Uint8Array(cellCount);
    expect(singleBiomeWindowShare(ctx, everyCell, oneBiome, 4)).toEqual({ share: 1, windows: 6 * 8 * 8 });
  });

  it("측정 도우미: 위도 그대로인 값은 R² ≈ 1, 칸마다 무작위 값은 ≈ 0. 같은 분포 JS 0, 겹치지 않는 분포 1비트", () => {
    const ctx = varietyContext(5);
    expect(latitudeR2(ctx, ctx.latitude, everyCell)).toBeGreaterThan(0.99);
    const noise = Float64Array.from({ length: ctx.grid.cellCount }, (_, c) => mix32(c + 7) / 4_294_967_296);
    expect(latitudeR2(ctx, noise, everyCell)).toBeLessThan(0.1);
    expect(jsDivergence([1, 2, 3], [2, 4, 6])).toBeCloseTo(0, 12);
    expect(jsDivergence([1, 0], [0, 1])).toBeCloseTo(1, 12);
  });
});
