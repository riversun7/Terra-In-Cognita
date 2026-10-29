// 행성 생성기 시험 — 골든 해시(바뀌면 바로 잡는다), 결정성, 성질(해수면 비율·강은 내리막·바이옴 규칙·꼭짓점 바다),
// 프리셋이 결과를 바꾸는 방향, 해상도가 달라도 큰 모양이 같은지, 콘텐츠 팩 행성이 생성되는지
import type { PlanetPresets } from "@terra/shared";
import { describe, expect, it } from "vitest";
import biomesJson from "../../../../content/core/biomes.json";
import planetsJson from "../../../../content/core/planets.json";
import { areaOf, buildGrid } from "./grid.ts";
import {
  CELL_DRY,
  CELL_LAKE,
  DEPTH_CLASS_SHIFT,
  GENERATOR_VERSION,
  NORMAL_PRESETS,
  type BiomeRange,
  type GeneratorDetails,
  type PlanetBiome,
  type PlanetFields,
  type PlanetGeneratorInput,
  VERTICAL_SCALE,
  WATER_COAST,
  WATER_LAKE,
  WATER_OCEAN,
  WATER_RIVER,
  generatePlanet,
  planetInputFromDefinition,
  resolvePlanetSettings,
  runPlanetGenerator,
} from "./index.ts";
import { computeClimate } from "./climate.ts";
import { classifyOcean, cornerCells } from "./seaLevel.ts";
import { buildTectonics } from "./tectonics.ts";
import { S2_TEST_PLANET_SEED, TEST_BIOMES } from "./testFixtures.ts";

const input = (
  faceLevel: number,
  seed: number,
  presets: PlanetPresets = NORMAL_PRESETS,
): PlanetGeneratorInput => ({
  faceLevel,
  seed,
  settings: resolvePlanetSettings(presets),
  biomes: TEST_BIOMES,
});

// 여러 시험이 같은 결과를 본다(생성은 한 번만)
const cache = new Map<string, GeneratorDetails>();
function run(faceLevel: number, seed: number, presets: PlanetPresets = NORMAL_PRESETS): GeneratorDetails {
  const key = JSON.stringify([faceLevel, seed, presets]);
  let result = cache.get(key);
  if (!result) {
    result = runPlanetGenerator(input(faceLevel, seed, presets));
    cache.set(key, result);
  }
  return result;
}

const STRESS_PRESETS: PlanetPresets = {
  seaLevel: "archipelago",
  temperature: "hot",
  precipitation: "wet",
  mountains: "young",
  plates: "many",
  volcanism: "high",
};

const FIELD_NAMES = [
  "elevationM",
  "biome",
  "temperatureC",
  "precipitationMm",
  "humidity",
  "water",
  "river",
  "forest",
] as const;

const bytesOf = (array: ArrayBufferView) => new Uint8Array(array.buffer, array.byteOffset, array.byteLength);

const inRange = (value: number, range: BiomeRange | undefined) =>
  !range ||
  ((range.min === undefined || value >= range.min) && (range.max === undefined || value < range.max));

/** 저장 값으로 바이옴 규칙을 다시 판정한다(생성기 코드와 따로 쓴 기준). 육지 규칙이 하나도 맞지 않으면 -1 */
function expectedBiome(fields: PlanetFields, c: number, table: readonly PlanetBiome[]): number {
  const water = fields.water[c] ?? 0;
  if (water & WATER_OCEAN) {
    const depth = ["", "coastal", "shelf", "deep"][(water >> DEPTH_CLASS_SHIFT) & 3];
    return table.findIndex((biome) => biome.rule.kind === "ocean" && biome.rule.depthClass === depth);
  }
  if (water & WATER_LAKE) return table.findIndex((biome) => biome.rule.kind === "lake");
  const t = fields.temperatureC[c] ?? 0;
  const h = fields.humidity[c] ?? 0;
  const elevation = (fields.elevationM[c] ?? 0) * VERTICAL_SCALE;
  return table.findIndex(
    (biome) =>
      biome.rule.kind === "land" &&
      inRange(t, biome.rule.temperatureC) &&
      inRange(h, biome.rule.humidity) &&
      inRange(elevation, biome.rule.realElevationM),
  );
}

/** 바이옴 ID들이 차지하는 칸 비율 */
function share(fields: PlanetFields, ids: readonly string[]): number {
  const wanted = new Set(ids.map((id) => TEST_BIOMES.findIndex((biome) => biome.id === id)));
  let count = 0;
  for (const value of fields.biome) if (wanted.has(value)) count++;
  return count / fields.biome.length;
}

function mean(values: ArrayLike<number>): number {
  let sum = 0;
  for (let k = 0; k < values.length; k++) sum += values[k] ?? 0;
  return sum / values.length;
}

const highest = (fields: PlanetFields) =>
  fields.elevationM.reduce((max, value) => Math.max(max, value), -32768);

/** 육지(바다·호수가 아닌 칸) 면적으로 잰 바이옴 비율(바이옴 번호 순서)과 평균 습도·숲 밀도 */
function landSummary(faceLevel: number, fields: PlanetFields) {
  const grid = buildGrid(faceLevel);
  const shares = new Float64Array(TEST_BIOMES.length);
  let land = 0;
  let humidity = 0;
  let forest = 0;
  for (let c = 0; c < grid.cellCount; c++) {
    if ((fields.water[c] ?? 0) & (WATER_OCEAN | WATER_LAKE)) continue;
    const area = areaOf(grid, c);
    const biome = fields.biome[c] ?? 0;
    land += area;
    shares[biome] = (shares[biome] ?? 0) + area;
    humidity += area * (fields.humidity[c] ?? 0);
    forest += area * (fields.forest[c] ?? 0);
  }
  return {
    shares: Array.from(shares, (value) => value / land),
    humidity: humidity / land,
    forest: forest / land,
  };
}

describe("골든 해시 (값이 바뀌면 GENERATOR_VERSION을 올리고 새 값으로 고친다)", () => {
  it("생성기 버전", () => {
    expect(GENERATOR_VERSION).toBe(1);
  });

  // 2026-10-29 기록(Node 24.22.1). 결정성 규칙(사칙연산 + 명세가 정한 함수)상 다른 엔진에서도 같아야 한다.
  // 강가·호숫가 가산을 해상도와 무관하게 고치며 바꿨다(1판은 아직 내보낸 적이 없어 버전은 1 그대로)
  it("면 레벨 5, 시드 1, 프리셋 군도·더움·습윤·젊음·많음·많음", () => {
    expect(run(5, 1, STRESS_PRESETS).fields.meta.hash).toBe("005378e0");
  });

  it("S2 시험 행성 설정(시드 20261029, 모두 보통)을 면 레벨 5로", () => {
    expect(run(5, S2_TEST_PLANET_SEED).fields.meta.hash).toBe("5c984c77");
  });

  it("S2 시험 행성 설정을 면 레벨 6으로", () => {
    expect(run(6, S2_TEST_PLANET_SEED).fields.meta.hash).toBe("215d9b32");
  });
});

/** 64비트 실수의 비트(16진수 16자리) */
function bitsOf(value: number): string {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  return view.getBigUint64(0).toString(16).padStart(16, "0");
}

/** 실수 배열들의 FNV-1a 32비트: 값마다 작은 끝 바이트(64비트 배열은 8바이트, 32비트는 4바이트). 기기 바이트 순서와 무관 */
function fingerprint(arrays: readonly (Float32Array | Float64Array)[]): string {
  const view = new DataView(new ArrayBuffer(8));
  let state = 0x811c9dc5;
  for (const array of arrays) {
    const width = array instanceof Float64Array ? 8 : 4;
    for (const value of array) {
      if (width === 8) view.setFloat64(0, value, true);
      else view.setFloat32(0, value, true);
      for (let k = 0; k < width; k++) state = Math.imul(state ^ view.getUint8(k), 0x01000193) >>> 0;
    }
  }
  return state.toString(16).padStart(8, "0");
}

describe("실수 지문 (정수 필드로 반올림하기 전 값. 바뀌면 골든 해시처럼 GENERATOR_VERSION과 함께 고친다)", () => {
  // 골든 해시는 정수 출력만 본다. 정수로 반올림하면 실수의 마지막 비트 차이는 대개 사라지므로(Float32 저장 포함),
  // 64비트 값(격자·면적·해수면)은 마지막 비트까지, 32비트 중간 필드는 그 자릿수까지 여기서 고정한다
  it("격자(칸 중심·면적 = 투영 detTan·detAtan)와 해수면의 64비트 값", () => {
    const grid = buildGrid(5);
    expect(fingerprint([grid.x, grid.y, grid.z, grid.faceArea])).toBe("5e2f5aef");
    expect(bitsOf(run(5, S2_TEST_PLANET_SEED).seaLevelRealM)).toBe("c0043675a19f9000");
    expect(bitsOf(run(5, 1, STRESS_PRESETS).seaLevelRealM)).toBe("40623b91fc7d4620");
    expect(bitsOf(run(6, S2_TEST_PLANET_SEED).seaLevelRealM)).toBe("c013df62c611b000");
  });

  it("판 구조 고도·기온·강수(Float32 중간값, 면 레벨 5, S2 시험 행성 설정)", () => {
    const grid = buildGrid(5);
    const settings = resolvePlanetSettings(NORMAL_PRESETS);
    const { elevation } = buildTectonics(grid, S2_TEST_PLANET_SEED, settings);
    expect(fingerprint([elevation])).toBe("00edae93");
    const { seaLevel, ocean } = classifyOcean(grid, elevation, settings.landPercent);
    const climate = computeClimate(grid, elevation, seaLevel, ocean, settings);
    expect(fingerprint([climate.temperature, climate.precipitation])).toBe("5e5ca05d");
  });
});

describe("결정성과 메타", () => {
  it("같은 입력은 두 번 돌려도 모든 필드가 바이트까지 같다", () => {
    const a = runPlanetGenerator(input(5, 77)).fields;
    const b = runPlanetGenerator(input(5, 77)).fields;
    for (const name of FIELD_NAMES) {
      const left = bytesOf(a[name]);
      const right = bytesOf(b[name]);
      let differences = 0;
      for (let k = 0; k < left.length; k++) if (left[k] !== right[k]) differences++;
      expect(left.length, name).toBe(right.length);
      expect(differences, name).toBe(0);
    }
    expect(a.meta).toEqual(b.meta);
  });

  it("시드가 다르면 결과가 다르다", () => {
    expect(run(5, 1).fields.meta.hash).not.toBe(run(5, 2).fields.meta.hash);
  });

  it("메타에 버전·시드·면 레벨·풀어 쓴 설정이 있고, 배열 길이는 6n²", () => {
    const { fields } = run(5, S2_TEST_PLANET_SEED);
    expect(fields.meta).toMatchObject({
      generatorVersion: GENERATOR_VERSION,
      seed: S2_TEST_PLANET_SEED,
      faceLevel: 5,
      settings: resolvePlanetSettings(NORMAL_PRESETS),
    });
    expect(fields.meta.hash).toMatch(/^[0-9a-f]{8}$/);
    for (const name of FIELD_NAMES) expect(fields[name].length, name).toBe(6 * 32 * 32);
  });
});

describe("성질 (면 레벨 5·6)", () => {
  it("바다 면적 ≈ 1 − 육지 비율 (프리셋 셋 모두, ±3%p)", () => {
    const grid = buildGrid(5);
    for (const seaLevel of ["archipelago", "normal", "continent"] as const) {
      const presets = { ...NORMAL_PRESETS, seaLevel };
      const { fields } = run(5, 3, presets);
      let ocean = 0;
      for (let c = 0; c < grid.cellCount; c++)
        if ((fields.water[c] ?? 0) & WATER_OCEAN) ocean += areaOf(grid, c);
      const expected = 1 - resolvePlanetSettings(presets).landPercent / 100;
      expect(Math.abs(ocean / (4 * Math.PI) - expected), seaLevel).toBeLessThan(0.03);
    }
  });

  it("강은 하류로 갈수록 높아지지 않고 바다·호수·마른 분지에서 끝난다", () => {
    for (const [faceLevel, seed] of [
      [5, S2_TEST_PLANET_SEED],
      [6, S2_TEST_PLANET_SEED],
      [5, 1],
    ] as const) {
      const { fields, receiver, basinKind } = run(faceLevel, seed);
      let rivers = 0;
      const problems: string[] = [];
      for (let start = 0; start < receiver.length; start++) {
        if ((fields.river[start] ?? 0) === 0) continue;
        rivers++;
        let c = start;
        for (let steps = 0; ; steps++) {
          if (steps > receiver.length) {
            problems.push(`loop from ${start}`);
            break;
          }
          const water = fields.water[c] ?? 0;
          if (water & (WATER_OCEAN | WATER_LAKE) || basinKind[c] === CELL_DRY) break;
          const next = receiver[c] ?? -1;
          if (next < 0) {
            problems.push(`land without receiver ${c}`);
            break;
          }
          const lake = (fields.water[next] ?? 0) & WATER_LAKE;
          if ((fields.elevationM[next] ?? 0) > (fields.elevationM[c] ?? 0) && !lake) {
            problems.push(`uphill ${c} → ${next}`);
            break;
          }
          c = next;
        }
      }
      expect(rivers, `강 칸 수 F${faceLevel}`).toBeGreaterThan(20);
      expect(problems.slice(0, 5)).toEqual([]);
    }
  });

  it("하천 등급은 하류로 갈수록 작아지지 않는다 (호수·마른 분지로 들어가는 곳 제외)", () => {
    const { fields, receiver, basinKind } = run(6, S2_TEST_PLANET_SEED);
    const problems: number[] = [];
    for (let c = 0; c < receiver.length; c++) {
      const order = fields.river[c] ?? 0;
      const next = receiver[c] ?? -1;
      if (order === 0 || next < 0 || basinKind[next] === CELL_LAKE || basinKind[next] === CELL_DRY) continue;
      if ((fields.water[next] ?? 0) & WATER_OCEAN) continue;
      if ((fields.river[next] ?? 0) < order) problems.push(c);
    }
    expect(problems.slice(0, 5)).toEqual([]);
  });

  it("바이옴은 저장한 기온·습도·고도와 물 비트로 다시 판정한 것과 같다", () => {
    const { fields } = run(6, S2_TEST_PLANET_SEED);
    const wrong: number[] = [];
    for (let c = 0; c < fields.biome.length; c++) {
      const expected = expectedBiome(fields, c, TEST_BIOMES);
      // 육지 규칙이 하나도 맞지 않으면 마지막 육지 바이옴
      const fallback = expected < 0 ? TEST_BIOMES.length - 1 : expected;
      if (fields.biome[c] !== fallback) wrong.push(c);
    }
    expect(wrong.slice(0, 5)).toEqual([]);
  });

  it("물 비트: 수심 등급은 바다에만, 해안은 바다 옆 땅에만, 강 비트 = 하천 등급 > 0, 바다·호수 습도 255", () => {
    const { fields } = run(5, S2_TEST_PLANET_SEED);
    for (let c = 0; c < fields.water.length; c++) {
      const water = fields.water[c] ?? 0;
      const depth = (water >> DEPTH_CLASS_SHIFT) & 3;
      if (water & WATER_OCEAN) {
        expect(depth).toBeGreaterThan(0);
        expect(water & (WATER_COAST | WATER_RIVER | WATER_LAKE)).toBe(0);
        expect(fields.humidity[c]).toBe(255);
      } else {
        expect(depth).toBe(0);
      }
      expect(Boolean(water & WATER_RIVER)).toBe((fields.river[c] ?? 0) > 0);
      if (water & WATER_LAKE) expect(fields.humidity[c]).toBe(255);
    }
  });

  it("호수 수면: 호수 칸만 값이 있고 바닥 이상이며, 한 호수는 평평하다(넘치는 곳의 저장 고도와 같다)", () => {
    for (const [faceLevel, seed] of [
      [5, S2_TEST_PLANET_SEED],
      [6, S2_TEST_PLANET_SEED],
      [5, 1],
    ] as const) {
      const { fields, receiver, basinKind, lakeSurfaceM } = run(faceLevel, seed);
      const problems: string[] = [];
      let lakes = 0;
      for (let c = 0; c < lakeSurfaceM.length; c++) {
        const surface = lakeSurfaceM[c] ?? 0;
        if (basinKind[c] !== CELL_LAKE) {
          if (surface !== 0) problems.push(`not a lake ${c}`);
          continue;
        }
        lakes++;
        if (surface < (fields.elevationM[c] ?? 0)) problems.push(`below bottom ${c}`);
        // 호수 칸의 물길은 같은 호수 안 칸이거나, 호수 밖 넘치는 곳(그 칸의 저장 고도 = 수면)이다
        const next = receiver[c] ?? -1;
        const expected = basinKind[next] === CELL_LAKE ? lakeSurfaceM[next] : fields.elevationM[next];
        if (next < 0 || surface !== expected) problems.push(`uneven ${c} → ${next}`);
      }
      expect(lakes, `호수 칸 수 F${faceLevel}`).toBeGreaterThan(0);
      expect(problems.slice(0, 5)).toEqual([]);
    }
  });

  it("정육면체 꼭짓점 8곳의 칸(24칸)은 모두 바다다", () => {
    const corners = cornerCells(buildGrid(5));
    for (const seed of [S2_TEST_PLANET_SEED, 1, 2, 3]) {
      const { fields } = run(5, seed);
      for (const c of corners) expect((fields.water[c] ?? 0) & WATER_OCEAN, `seed ${seed} cell ${c}`).toBe(1);
    }
  });

  it("기온: 적도 바다는 적도 설정 근처, 위도 띠 평균은 극으로 갈수록 내려가고, 극에 가장 가까운 칸은 극 설정 이하(+2°C)", () => {
    const { fields } = run(5, S2_TEST_PLANET_SEED);
    const grid = buildGrid(5);
    const settings = resolvePlanetSettings(NORMAL_PRESETS);
    const bands = [0.2, 0.5, 0.8, 1.01];
    const sums = [0, 0, 0, 0];
    const counts = [0, 0, 0, 0];
    let equatorSum = 0;
    let equatorCount = 0;
    let north = 0;
    let south = 0;
    for (let c = 0; c < grid.cellCount; c++) {
      const z = grid.z[c] ?? 0;
      const t = fields.temperatureC[c] ?? 0;
      const band = bands.findIndex((limit) => Math.abs(z) < limit);
      sums[band] = (sums[band] ?? 0) + t;
      counts[band] = (counts[band] ?? 0) + 1;
      if (Math.abs(z) < 0.1 && (fields.water[c] ?? 0) & WATER_OCEAN) {
        equatorSum += t;
        equatorCount++;
      }
      if (z > (grid.z[north] ?? 0)) north = c;
      if (z < (grid.z[south] ?? 0)) south = c;
    }
    expect(Math.abs(equatorSum / equatorCount - settings.equatorTemperatureC)).toBeLessThan(2);
    const means = sums.map((sum, k) => sum / (counts[k] ?? 1));
    for (let k = 1; k < means.length; k++) expect(means[k] ?? 0).toBeLessThan(means[k - 1] ?? 0);
    expect(fields.temperatureC[north] ?? 0).toBeLessThanOrEqual(settings.poleTemperatureC + 2);
    expect(fields.temperatureC[south] ?? 0).toBeLessThanOrEqual(settings.poleTemperatureC + 2);
  });
});

describe("프리셋이 결과를 바꾸는 방향", () => {
  it("추우면 빙상·툰드라가 늘고, 더우면 줄어든다", () => {
    const cold = run(5, 5, { ...NORMAL_PRESETS, temperature: "cold" }).fields;
    const hot = run(5, 5, { ...NORMAL_PRESETS, temperature: "hot" }).fields;
    expect(share(cold, ["ice_sheet", "tundra"])).toBeGreaterThan(share(hot, ["ice_sheet", "tundra"]) + 0.02);
    expect(mean(cold.temperatureC)).toBeLessThan(mean(hot.temperatureC) - 5);
  });

  it("건조하면 강수가 줄고 사막이 늘어난다", () => {
    const dry = run(5, 5, { ...NORMAL_PRESETS, precipitation: "dry" }).fields;
    const wet = run(5, 5, { ...NORMAL_PRESETS, precipitation: "wet" }).fields;
    expect(mean(dry.precipitationMm)).toBeLessThan(mean(wet.precipitationMm) * 0.5);
    expect(share(dry, ["desert"])).toBeGreaterThan(share(wet, ["desert"]));
  });

  it("젊은 산은 늙은 산보다 높다", () => {
    expect(highest(run(5, 5, { ...NORMAL_PRESETS, mountains: "young" }).fields)).toBeGreaterThan(
      highest(run(5, 5, { ...NORMAL_PRESETS, mountains: "old" }).fields),
    );
  });
});

describe("해상도와 무관한 큰 모양 (편집기 미리보기 = 낮은 면 레벨)", () => {
  it("면 레벨 5와 6의 육지·바다가 90% 이상 같은 곳이다 (6을 2×2로 모아 비교)", () => {
    const coarse = run(5, S2_TEST_PLANET_SEED).fields;
    const fine = run(6, S2_TEST_PLANET_SEED).fields;
    let same = 0;
    for (let face = 0; face < 6; face++) {
      for (let j = 0; j < 32; j++) {
        for (let i = 0; i < 32; i++) {
          let land = 0;
          for (const [di, dj] of [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
          ] as const) {
            const c = face * 64 * 64 + (2 * j + dj) * 64 + 2 * i + di;
            if (!((fine.water[c] ?? 0) & WATER_OCEAN)) land++;
          }
          const coarseLand = !((coarse.water[face * 32 * 32 + j * 32 + i] ?? 0) & WATER_OCEAN);
          if (coarseLand === land >= 2) same++;
        }
      }
    }
    expect(same / (6 * 32 * 32)).toBeGreaterThan(0.9);
  });

  it("육지 바이옴 면적 비율은 면 레벨 6(미리보기)과 8에서 바이옴마다 2.5%p 안, 평균 습도 3%·숲 밀도 6% 안", {
    timeout: 60_000,
  }, () => {
    // 2026-10-29 잰 값: 가장 큰 차이는 사바나 1.93%p, 습도 1.2%, 숲 3.5%. 사바나 차이는 강가 가산을 꺼도 1.9%p라
    // 기후 쪽에서 온다(원인 미확인). 강가 가산이 칸 크기를 따라가던 때는 사바나 6.1%p·열대우림 5.4%p, 습도 7.6%,
    // 숲 20%였다(surface.ts·riparian.ts).
    const coarse = landSummary(6, run(6, S2_TEST_PLANET_SEED).fields);
    const fine = landSummary(8, run(8, S2_TEST_PLANET_SEED).fields);
    TEST_BIOMES.forEach((biome, index) => {
      const difference = Math.abs((coarse.shares[index] ?? 0) - (fine.shares[index] ?? 0));
      expect(difference, biome.id).toBeLessThan(0.025);
    });
    expect(Math.abs(coarse.humidity / fine.humidity - 1)).toBeLessThan(0.03);
    expect(Math.abs(coarse.forest / fine.forest - 1)).toBeLessThan(0.06);
  });
});

describe("입력 검사", () => {
  it("면 레벨 4~10, u32 시드, 범위 안 설정, 바다·호수·육지 규칙이 있는 바이옴 표만 받는다", () => {
    expect(() => generatePlanet(input(3, 1))).toThrow(RangeError);
    expect(() => generatePlanet(input(11, 1))).toThrow(RangeError);
    expect(() => generatePlanet({ ...input(4, 1), seed: -1 })).toThrow(RangeError);
    expect(() => generatePlanet({ ...input(4, 1), seed: 2 ** 32 })).toThrow(RangeError);
    const settings = { ...resolvePlanetSettings(NORMAL_PRESETS), landPercent: 99 };
    expect(() => generatePlanet({ ...input(4, 1), settings })).toThrow(RangeError);
    const noLake = TEST_BIOMES.filter((biome) => biome.rule.kind !== "lake");
    expect(() => generatePlanet({ ...input(4, 1), biomes: noLake })).toThrow(RangeError);
  });

  it("JSON 정의 읽기: 모르는 프리셋 단계·세부 수치 이름·없는 바이옴은 RangeError", () => {
    const planet = planetsJson.entries[0];
    expect(() =>
      planetInputFromDefinition(
        { ...planet, presets: { ...planet?.presets, plates: "lots" } },
        biomesJson.entries,
      ),
    ).toThrow(RangeError);
    expect(() =>
      planetInputFromDefinition({ ...planet, overrides: { seaLevelM: 3 } }, biomesJson.entries),
    ).toThrow(RangeError);
    expect(() =>
      planetInputFromDefinition({ ...planet, biomes: ["lake", "nowhere"] }, biomesJson.entries),
    ).toThrow(RangeError);
  });
});

describe("콘텐츠 팩 행성 (content/core) — 정의가 생성기 입력이 되는지 (해시는 보지 않는다)", () => {
  it("S2 시험 행성: 시드·바이옴 표가 시험 자료와 같고, 낮은 면 레벨로 생성된다", () => {
    const planet = planetsJson.entries.find((entry) => entry.id === "s2_test_planet");
    expect(planet).toBeDefined();
    const definition = planetInputFromDefinition(planet, biomesJson.entries, 4);
    expect(definition.seed).toBe(S2_TEST_PLANET_SEED);
    expect(definition.biomes).toEqual(TEST_BIOMES);
    expect(definition.settings).toEqual(resolvePlanetSettings(NORMAL_PRESETS));
    expect(generatePlanet(definition).meta.faceLevel).toBe(4);
  });

  it("콘텐츠 팩 검증 결과(바이옴 참조가 id 필드가 있는 객체)도 JSON과 같은 입력이 된다", () => {
    const planet = planetsJson.entries.find((entry) => entry.id === "s2_test_planet");
    // @terra/content의 ContentRef와 같은 모양(이 패키지는 @terra/content를 가져올 수 없다)
    const parsed = {
      ...planet,
      biomes: planet?.biomes.map((id) => ({ category: "biomes", id, toJSON: () => id })),
    };
    expect(planetInputFromDefinition(parsed, biomesJson.entries, 4)).toEqual(
      planetInputFromDefinition(planet, biomesJson.entries, 4),
    );
    expect(() =>
      planetInputFromDefinition({ ...parsed, biomes: [{ category: "biomes", id: 7 }] }, biomesJson.entries),
    ).toThrow(RangeError);
  });
});
