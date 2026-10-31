// 기후 시험(출력 판 3) — 바람이 멈추는 곳이 없는지, 바람이 오는 이웃 고르기가 결정적이고 바람을 끼는 두 이웃 중
// 하나인지, 고른 비율이 바람을 나눈 몫과 맞는지, 저장 습도가 실수 기온에 연속인지(정수 등온선 계단이 없는지)
import { detAsin } from "@terra/shared";
import { describe, expect, it } from "vitest";
import { climateLatitudeAt, upwindNeighbors, upwindShare, windAt, windVectorAt } from "./climateWind.ts";
import { type PlanetGrid, buildGrid, neighbors8 } from "./grid.ts";
import { STREAM_WIND, streamSeed } from "./random.ts";
import { buildSurface, landHumidity } from "./surface.ts";
import { S2_TEST_PLANET_SEED, TEST_BIOMES } from "./testFixtures.ts";

const SEEDS = [S2_TEST_PLANET_SEED, 1, 42];

/** 칸마다 지리 위도(도): 생성기(climate.ts)와 같은 식 */
function latitudes(grid: PlanetGrid): Float32Array {
  return Float32Array.from(grid.z, (z) => detAsin(Math.min(1, Math.max(-1, z))) * (180 / Math.PI));
}

/** 칸 c의 바람이 오는 방향(접평면 3차원 벡터, −바람). 생성기와 같은 순서로 계산한다(동점 비교가 같게) */
function windFrom(grid: PlanetGrid, windSeed: number, latitude: Float32Array, c: number): number[] {
  const x = grid.x[c] ?? 0;
  const y = grid.y[c] ?? 0;
  const z = grid.z[c] ?? 0;
  const horizontal = Math.sqrt(x * x + y * y);
  const ex = -y / horizontal;
  const ey = x / horizontal;
  const nx = -z * ey;
  const ny = z * ex;
  const nz = x * ey - y * ex;
  const { u, v } = windVectorAt(windSeed, x, y, z, latitude[c] ?? 0);
  return [-(u * ex + v * nx), -(u * ey + v * ny), -v * nz];
}

describe("바람 (띠 바람 + 굽이)", () => {
  it("F7 모든 칸에서 세기가 0.2 이상이다(멈추는 위도가 없다)", { timeout: 60_000 }, () => {
    const grid = buildGrid(7);
    const latitude = latitudes(grid);
    for (const seed of SEEDS) {
      const windSeed = streamSeed(seed, STREAM_WIND);
      let minimum = Number.POSITIVE_INFINITY;
      for (let c = 0; c < grid.cellCount; c++) {
        const { u, v } = windVectorAt(
          windSeed,
          grid.x[c] ?? 0,
          grid.y[c] ?? 0,
          grid.z[c] ?? 0,
          latitude[c] ?? 0,
        );
        minimum = Math.min(minimum, Math.sqrt(u * u + v * v));
      }
      expect(minimum, `seed ${seed}`).toBeGreaterThanOrEqual(0.2 - 1e-12);
    }
  });

  it("띠 바람에서 벗어나지만 큰 흐름은 남는다: 편서풍대(위도 40~50°)는 평균으로 서에서 동으로 분다", () => {
    const grid = buildGrid(6);
    const latitude = latitudes(grid);
    const windSeed = streamSeed(S2_TEST_PLANET_SEED, STREAM_WIND);
    let eastward = 0;
    let cells = 0;
    let deviation = 0;
    for (let c = 0; c < grid.cellCount; c++) {
      const lat = latitude[c] ?? 0;
      const wind = windVectorAt(windSeed, grid.x[c] ?? 0, grid.y[c] ?? 0, grid.z[c] ?? 0, lat);
      // 띠 바람은 기후 위도(흔든 위도, 2단계)의 것이다
      const band = windAt(climateLatitudeAt(windSeed, grid.x[c] ?? 0, grid.y[c] ?? 0, grid.z[c] ?? 0, lat));
      deviation += Math.sqrt((wind.u - band.u) * (wind.u - band.u) + (wind.v - band.v) * (wind.v - band.v));
      if (Math.abs(lat) < 40 || Math.abs(lat) > 50) continue;
      eastward += wind.u;
      cells++;
    }
    expect(eastward / cells).toBeGreaterThan(0.5);
    // 굽이 세기 0.3(약한 곳은 최소 풍속으로 바꾼다)
    expect(deviation / grid.cellCount).toBeGreaterThan(0.2);
    expect(deviation / grid.cellCount).toBeLessThan(0.4);
  });
});

describe("바람이 오는 이웃", () => {
  it("두 이웃 나누기: 바람 = 0.7a + 0.3b면 a를 고를 확률 0.7, b 밖으로 벗어나면 1, b 방향이면 0, 나란하면 1", () => {
    expect(upwindShare(1, 0, 0, 0, 1, 0, 0.7, 0.3, 0)).toBeCloseTo(0.7, 12);
    expect(upwindShare(1, 0, 0, 1, 1, 0, 0.5, 0.5, 0)).toBeCloseTo(0, 12);
    expect(upwindShare(1, 0, 0, 0, 1, 0, 1, -0.5, 0)).toBe(1);
    expect(upwindShare(1, 0, 0, 0, 1, 0, 0, 2, 0)).toBe(0);
    expect(upwindShare(1, 0, 0, 2, 0, 0, 1, 0, 0)).toBe(1);
  });

  it("F7: 모든 칸이 바람을 가장 잘 끼는 이웃 둘 중 하나를 고르고, 다시 구해도 같으며, 고른 비율이 몫과 맞는다", {
    timeout: 60_000,
  }, () => {
    const grid = buildGrid(7);
    const latitude = latitudes(grid);
    const windSeed = streamSeed(S2_TEST_PLANET_SEED, STREAM_WIND);
    const upwind = upwindNeighbors(grid, latitude, windSeed);
    expect(upwindNeighbors(grid, latitude, windSeed)).toEqual(upwind);
    const out = new Int32Array(8);
    const problems: string[] = [];
    let expectedBest = 0;
    let variance = 0;
    let choseBest = 0;
    for (let c = 0; c < grid.cellCount; c++) {
      const [wx = 0, wy = 0, wz = 0] = windFrom(grid, windSeed, latitude, c);
      neighbors8(grid, c, out);
      // 따로 쓴 기준: 방향 cos가 큰 이웃 둘(같으면 앞 번호)
      const scored = Array.from(out)
        .filter((next) => next >= 0)
        .map((next) => {
          const dx = (grid.x[next] ?? 0) - (grid.x[c] ?? 0);
          const dy = (grid.y[next] ?? 0) - (grid.y[c] ?? 0);
          const dz = (grid.z[next] ?? 0) - (grid.z[c] ?? 0);
          const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const score = (dx * wx + dy * wy + dz * wz) / (length * Math.sqrt(wx * wx + wy * wy + wz * wz));
          return { next, score, dx, dy, dz };
        });
      const [first, second] = scored.toSorted((a, b) => b.score - a.score);
      if (!first || !second) {
        problems.push(`no neighbours ${c}`);
        continue;
      }
      const chosen = upwind[c] ?? -1;
      if (chosen !== first.next && chosen !== second.next) problems.push(`not one of the two ${c}`);
      const share = upwindShare(first.dx, first.dy, first.dz, second.dx, second.dy, second.dz, wx, wy, wz);
      if (share === 1 && chosen !== first.next) problems.push(`share 1 but second ${c}`);
      expectedBest += share;
      variance += share * (1 - share);
      if (chosen === first.next) choseBest++;
    }
    expect(problems.slice(0, 5)).toEqual([]);
    // 칸 해시가 고르게 퍼져 있으면 첫째를 고른 수 ≈ 몫의 합(4σ 안)
    expect(Math.abs(choseBest - expectedBest)).toBeLessThan(4 * Math.sqrt(variance));
    // 둘째도 꽤 고른다(바람길이 격자선 하나를 따라 곧게 뻗지 않는다)
    expect(choseBest / grid.cellCount).toBeLessThan(0.85);
  });
});

describe("습도", () => {
  it("저장 습도는 실수 기온에 연속이다: 정수 등온선(반올림이 바뀌는 x.5°C)을 넘어도 1 넘게 뛰지 않는다", () => {
    let roundedJumps = 0;
    for (const precipitation of [150, 400, 800, 1500, 3000]) {
      for (let boundary = -9.5; boundary <= 30.5; boundary += 1) {
        const below = landHumidity(precipitation, boundary - 1e-6, 0);
        const above = landHumidity(precipitation, boundary + 1e-6, 0);
        expect(Math.abs(above - below), `${precipitation} mm at ${boundary}°C`).toBeLessThanOrEqual(1);
        // 출력 판 2처럼 반올림한 기온을 넣으면 계단이 생긴다(이 시험이 무엇을 막는지)
        const stepBelow = landHumidity(precipitation, Math.round(boundary - 1e-6), 0);
        const stepAbove = landHumidity(precipitation, Math.round(boundary + 1e-6), 0);
        if (Math.abs(stepAbove - stepBelow) > 1) roundedJumps++;
      }
    }
    expect(roundedJumps).toBeGreaterThan(50);
  });

  it("지표 단계(buildSurface)가 습도를 실수 기온으로 낸다: x.5°C 양쪽 칸의 저장 습도가 1 넘게 다르지 않다", () => {
    // 모두 땅(해수면 위 100m), 강·호수 없음, 강수는 같고 기온만 x.5°C를 사이에 두고 번갈아 놓는다
    const grid = buildGrid(4);
    const count = grid.cellCount;
    const elevation = new Float32Array(count).fill(100);
    const flow = {
      receiver: new Int32Array(count).fill(-1),
      filled: Float32Array.from(elevation),
      order: new Int32Array(count),
      orderLength: 0,
      basin: new Int32Array(count).fill(-1),
      basinExit: new Int32Array(1),
      basinCount: 0,
    };
    const rivers = {
      order: new Uint8Array(count),
      length: new Float32Array(count),
      basinKind: new Uint8Array(count),
    };
    // 칸 둘씩 짝(2k, 2k + 1): 정수 부분 2 + (k mod 25)는 같고 소수 부분만 .49와 .51
    const temperature = Float32Array.from(
      { length: count },
      (_, c) => 2 + (Math.floor(c / 2) % 25) + (c % 2 === 0 ? 0.49 : 0.51),
    );
    const precipitation = new Float32Array(count).fill(800);
    const surface = buildSurface(
      grid,
      7,
      elevation,
      0,
      new Uint8Array(count),
      flow,
      rivers,
      temperature,
      precipitation,
      TEST_BIOMES,
    );
    let checked = 0;
    for (let c = 0; c + 1 < count; c += 2) {
      // 같은 정수 부분에서 .49와 .51: 반올림 기온이 1 다르다
      expect(surface.temperatureC[c + 1]).toBe((surface.temperatureC[c] ?? 0) + 1);
      expect(
        Math.abs((surface.humidity[c + 1] ?? 0) - (surface.humidity[c] ?? 0)),
        `cell ${c}`,
      ).toBeLessThanOrEqual(1);
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });
});
