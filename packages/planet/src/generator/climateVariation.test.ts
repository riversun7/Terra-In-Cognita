// 기후 변이 시험(출력 판 3, 다양성 고침 2단계) — 기후 위도(흔든 위도)가 극으로 갈수록 지리 위도로 돌아가는지와 흔들기
// 크기, 바람 띠가 기후 위도를 따르는지, 기온 변이가 치우치지 않고 바다·내륙 세기를 따르는지, 먼 바다 강수 변이의 로그
// 표준편차, 잔 변이를 켜는 해상도. 기온·강수는 생성기와 따로 쓴 띠 식(기후 위도 기준)과 견준다
import { NORMAL_PRESETS, type PlanetSettings, detAsin, resolvePlanetSettings } from "@terra/shared";
import { describe, expect, it } from "vitest";
import { LAPSE_RATE_PER_M, computeClimate, roughnessOctaves, zonalPrecipitation } from "./climate.ts";
import { climateLatitudeAt, windAt, windVectorAt } from "./climateWind.ts";
import { type PlanetGrid, areaOf, buildGrid } from "./grid.ts";
import { distanceField } from "./queues.ts";
import { STREAM_WIND, streamSeed } from "./random.ts";
import { classifyOcean } from "./seaLevel.ts";
import { buildTectonics } from "./tectonics.ts";
import { S2_TEST_PLANET_SEED } from "./testFixtures.ts";
import { km, smoothstep } from "./util.ts";

const SETTINGS: PlanetSettings = resolvePlanetSettings(NORMAL_PRESETS);
const SEEDS = [S2_TEST_PLANET_SEED, 1, 2, 3, 42, 77];

/** 칸마다 지리 위도와 기후 위도(도) */
function latitudes(grid: PlanetGrid, seed: number): { geographic: Float64Array; climate: Float64Array } {
  const windSeed = streamSeed(seed, STREAM_WIND);
  const geographic = new Float64Array(grid.cellCount);
  const climate = new Float64Array(grid.cellCount);
  for (let c = 0; c < grid.cellCount; c++) {
    const lat = detAsin(Math.min(1, Math.max(-1, grid.z[c] ?? 0))) * (180 / Math.PI);
    geographic[c] = lat;
    climate[c] = climateLatitudeAt(windSeed, grid.x[c] ?? 0, grid.y[c] ?? 0, grid.z[c] ?? 0, lat);
  }
  return { geographic, climate };
}

/** 면 레벨의 평균 칸 크기(라디안) = √(4π ÷ 칸 수): 큰 격자를 만들지 않고 잔 변이 옥타브를 본다 */
const cellAngle = (faceLevel: number) => Math.sqrt((4 * Math.PI) / (6 * 4 ** faceLevel));

/** 면적 가중 평균·표준편차 */
function weightedStats(values: readonly number[], weights: readonly number[]): { mean: number; sd: number } {
  let w = 0;
  let sum = 0;
  let squares = 0;
  values.forEach((value, k) => {
    const weight = weights[k] ?? 0;
    w += weight;
    sum += weight * value;
    squares += weight * value * value;
  });
  const mean = sum / w;
  return { mean, sd: Math.sqrt(Math.max(0, squares / w - mean * mean)) };
}

// 시드마다 F6 기후 한 번(여러 시험이 같은 결과를 본다)
const climateCache = new Map<number, ReturnType<typeof climateAt>>();
function climateAt(seed: number) {
  const grid = buildGrid(6);
  const { elevation } = buildTectonics(grid, seed, SETTINGS);
  const { seaLevel, ocean } = classifyOcean(grid, elevation, SETTINGS.landPercent);
  const climate = computeClimate(grid, elevation, seaLevel, ocean, SETTINGS, seed);
  return { grid, elevation, seaLevel, ocean, climate, climateLatitude: latitudes(grid, seed).climate };
}
function cachedClimate(seed: number) {
  let result = climateCache.get(seed);
  if (!result) {
    result = climateAt(seed);
    climateCache.set(seed, result);
  }
  return result;
}

describe("기후 위도 (위도 흔들기)", () => {
  it("흔들기는 위도 75°부터 극까지 0으로 줄고(극 칸은 지리 위도 그대로), 위도 60° 안에서 표준편차 약 4°다", () => {
    const grid = buildGrid(6);
    for (const seed of SEEDS.slice(0, 3)) {
      const { geographic, climate } = latitudes(grid, seed);
      const warps: number[] = [];
      const weights: number[] = [];
      let worst = 0;
      let beyondPole = 0;
      for (let c = 0; c < grid.cellCount; c++) {
        const lat = geographic[c] ?? 0;
        const warp = (climate[c] ?? 0) - lat;
        if (Math.abs(climate[c] ?? 0) > 90) beyondPole++;
        // 노이즈 채널은 대략 ±1, 표준편차 0.2: 흔들기 ≤ 4° × 5 × (1 − smoothstep(75°, 90°, |위도|))
        const bound = 20 * (1 - smoothstep(75, 90, Math.abs(lat))) + 1e-9;
        worst = Math.max(worst, Math.abs(warp) / bound);
        if (Math.abs(lat) < 60) {
          warps.push(warp);
          weights.push(areaOf(grid, c));
        }
      }
      expect(beyondPole, `seed ${seed}`).toBe(0);
      expect(worst, `seed ${seed}`).toBeLessThanOrEqual(1);
      const { mean, sd } = weightedStats(warps, weights);
      expect(Math.abs(mean), `seed ${seed} mean`).toBeLessThan(1.5);
      expect(sd, `seed ${seed} sd`).toBeGreaterThan(3);
      expect(sd, `seed ${seed} sd`).toBeLessThan(5);
    }
  });

  it("바람 = 기후 위도의 띠 바람 + 세기 0.3의 굽이다(합이 0.2보다 약한 칸만 굽이 방향으로 세기 0.2)", () => {
    const grid = buildGrid(6);
    const windSeed = streamSeed(S2_TEST_PLANET_SEED, STREAM_WIND);
    const { geographic, climate } = latitudes(grid, S2_TEST_PLANET_SEED);
    let meander = 0;
    let weakest = 0;
    for (let c = 0; c < grid.cellCount; c++) {
      const wind = windVectorAt(windSeed, grid.x[c] ?? 0, grid.y[c] ?? 0, grid.z[c] ?? 0, geographic[c] ?? 0);
      const band = windAt(climate[c] ?? 0);
      const deviation = Math.sqrt(
        (wind.u - band.u) * (wind.u - band.u) + (wind.v - band.v) * (wind.v - band.v),
      );
      if (Math.abs(deviation - 0.3) < 1e-9) meander++;
      else if (Math.abs(Math.sqrt(wind.u * wind.u + wind.v * wind.v) - 0.2) < 1e-9) weakest++;
    }
    expect(meander + weakest).toBe(grid.cellCount);
    expect(meander / grid.cellCount).toBeGreaterThan(0.85);
  });
});

describe("기온·강수 변이", () => {
  it("기온 − 띠 식(기후 위도, 고도 냉각): 평균 0 근처, 바다 표준편차 약 2°C, 바다에서 1,500km 넘는 내륙 약 3.4°C", {
    timeout: 60_000,
  }, () => {
    const span = SETTINGS.equatorTemperatureC - SETTINGS.poleTemperatureC;
    const ocean: number[] = [];
    const oceanWeights: number[] = [];
    const inland: number[] = [];
    const inlandWeights: number[] = [];
    for (const seed of SEEDS) {
      const run = cachedClimate(seed);
      const { grid, elevation, seaLevel, climate } = run;
      const all: number[] = [];
      const allWeights: number[] = [];
      for (let c = 0; c < grid.cellCount; c++) {
        const t = Math.min(1, Math.abs(run.climateLatitude[c] ?? 0) / 90);
        const altitude = Math.max(0, (elevation[c] ?? 0) - seaLevel);
        const zonal = SETTINGS.equatorTemperatureC - span * t * Math.sqrt(t) - LAPSE_RATE_PER_M * altitude;
        const residual = (climate.temperature[c] ?? 0) - zonal;
        const area = areaOf(grid, c);
        all.push(residual);
        allWeights.push(area);
        if (run.ocean[c] === 1) {
          ocean.push(residual);
          oceanWeights.push(area);
        } else if ((climate.oceanDistance[c] ?? 0) >= km(1500)) {
          inland.push(residual);
          inlandWeights.push(area);
        }
      }
      // 한 행성 안 평균은 큰 덩어리 몇 개로 정해진다(약 ±0.3°C)
      expect(Math.abs(weightedStats(all, allWeights).mean), `seed ${seed}`).toBeLessThan(1);
    }
    const oceanStats = weightedStats(ocean, oceanWeights);
    expect(Math.abs(oceanStats.mean)).toBeLessThan(0.5);
    expect(oceanStats.sd).toBeGreaterThan(1.6);
    expect(oceanStats.sd).toBeLessThan(2.4);
    // 내륙은 2 + 1.5 × (1 − e^(−거리/600km)) ≥ 3.0°C. 칸 수가 적고 덩어리가 커서 넓게 본다
    expect(inland.length).toBeGreaterThan(200);
    const inlandStats = weightedStats(inland, inlandWeights);
    expect(inlandStats.sd).toBeGreaterThan(2.6);
    expect(inlandStats.sd).toBeLessThan(4.6);
    expect(inlandStats.sd).toBeGreaterThan(oceanStats.sd);
  });

  it("먼 바다(땅에서 1,000km 넘게) 강수 ÷ 기후 위도 띠 강수의 로그: 평균 0 근처, 표준편차 약 0.4", {
    timeout: 60_000,
  }, () => {
    const logs: number[] = [];
    const weights: number[] = [];
    for (const seed of SEEDS) {
      const run = cachedClimate(seed);
      const { grid, climate } = run;
      const far = distanceField(grid, (c) => run.ocean[c] !== 1, km(1000) + grid.meanCellAngle);
      for (let c = 0; c < grid.cellCount; c++) {
        if (run.ocean[c] !== 1 || (far.angle[c] ?? 0) < km(1000)) continue;
        // 먼 바다는 습기가 거의 다 차 있다(바람길 350km에 1 − 1/e): 강수 ≈ 배율 × 띠 강수 × 변이
        const expected =
          (SETTINGS.precipitationPercent / 100) * zonalPrecipitation(run.climateLatitude[c] ?? 0);
        logs.push(Math.log((climate.precipitation[c] ?? 0) / expected));
        weights.push(areaOf(grid, c));
      }
    }
    const { mean, sd } = weightedStats(logs, weights);
    expect(Math.abs(mean)).toBeLessThan(0.15);
    expect(sd).toBeGreaterThan(0.32);
    expect(sd).toBeLessThan(0.5);
  });

  it("잔 변이는 칸이 그 격자(약 160km)의 반보다 작을 때만: F4~6 끔, F7 1·F8 2·F9 3옥타브", () => {
    expect([4, 5, 6, 7, 8, 9].map((level) => roughnessOctaves(cellAngle(level)))).toEqual([0, 0, 0, 1, 2, 3]);
    // 생성기 격자의 평균 칸 크기와 같은 식이다
    expect(buildGrid(5).meanCellAngle).toBeCloseTo(cellAngle(5), 12);
  });
});
