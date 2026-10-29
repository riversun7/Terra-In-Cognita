// 행성 생성기 1판 — 단계 순서는 ADR 31(2026-10-28-planet-generation-order), 출력은 ADR 36 PlanetFields
// 1 판 구조 + fBm → 기본 고도  2 해수면(육지 비율 백분위)  3 Priority-Flood·흐름 방향  4 기후(기온·강수)
// 5 물 흐름 누적(강수 가중) → 침식(몇 번, 매번 흐름을 다시 구함) → 강·호수  6 수심 등급  7 습도  8 바이옴 → 숲 밀도
// 결정성: 사칙연산 + 명세가 정한 Math 함수 + @terra/shared 결정적 근사·시드 난수만 쓴다. 칸은 늘 번호 순서로 돈다
// (면 0~5, 행 j, 열 i). 같은 입력이면 어느 엔진에서든 같은 결과·해시다.
import {
  PLANET_GENERATOR_FACE_LEVELS,
  PLANET_SETTING_KEYS,
  PLANET_SETTING_RANGES,
  type PlanetSettings,
} from "@terra/shared";
import { computeClimate } from "./climate.ts";
import { priorityFlood } from "./flood.ts";
import { buildGrid } from "./grid.ts";
import { hashPlanetFields } from "./hash.ts";
import { erodeOnce, findRivers, runoffOf, waterBalance } from "./hydrology.ts";
import { classifyOcean } from "./seaLevel.ts";
import { buildSurface, compileBiomes } from "./surface.ts";
import { buildTectonics } from "./tectonics.ts";
import type { PlanetFields } from "../tiles/fields.ts";
import type { GeneratorStage, PlanetGeneratorInput } from "./types.ts";
import { GENERATOR_VERSION } from "./version.ts";

/** 침식 반복 횟수(매번 흐름 방향을 다시 구한다) */
const EROSION_PASSES = 3;
/** 침식 세기 K (erosionPercent 100%일 때) */
const EROSION_STRENGTH = 0.25;

export interface GeneratorOptions {
  /** 단계가 끝날 때마다 불린다(진행 표시·시간 측정). 생성 결과에는 영향이 없다 */
  readonly onStage?: (stage: GeneratorStage) => void;
}

/** 생성 결과 + 도구용 부가 정보(강 그리기·시험·측정). 서버 굽기는 fields만 쓴다 */
export interface GeneratorDetails {
  readonly fields: PlanetFields;
  /**
   * 칸마다 물이 흘러가는 칸(-1 = 바다). 강(river > 0)은 바다·호수·마른 분지(basinKind = CELL_DRY)에 닿으면 끝나지만,
   * 이 방향은 웅덩이를 지나 넘치는 곳을 거쳐 늘 바다까지 이어진다(강을 선으로 그릴 때 쓴다)
   */
  readonly receiver: Int32Array;
  /** 칸마다 웅덩이 처리(hydrology.ts CELL_OPEN·CELL_LAKE·CELL_FILLED·CELL_DRY) */
  readonly basinKind: Uint8Array;
  /** 해수면(실제 환산 m, 내부 고도 척도). 저장 고도는 이것을 0으로 둔 값이다 */
  readonly seaLevelRealM: number;
}

function validateInput(input: PlanetGeneratorInput): void {
  const [minLevel, maxLevel] = PLANET_GENERATOR_FACE_LEVELS;
  if (!Number.isInteger(input.faceLevel) || input.faceLevel < minLevel || input.faceLevel > maxLevel) {
    throw new RangeError(`faceLevel must be an integer in [${minLevel}, ${maxLevel}]: ${input.faceLevel}`);
  }
  if (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 0xffff_ffff) {
    throw new RangeError(`seed must be a u32 integer: ${input.seed}`);
  }
  for (const key of PLANET_SETTING_KEYS) {
    const value = input.settings[key];
    const [min, max] = PLANET_SETTING_RANGES[key];
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new RangeError(`setting ${key} must be an integer in [${min}, ${max}]: ${value}`);
    }
  }
  if (input.settings.poleTemperatureC > input.settings.equatorTemperatureC) {
    throw new RangeError("poleTemperatureC must not exceed equatorTemperatureC");
  }
  compileBiomes(input.biomes);
}

/**
 * 실수 중간값이 모두 유한한지 본다. 정수 배열에 넣으면 NaN이 말없이 0이 되므로 넣기 전에 막는다(버그면 바로 드러나게)
 */
function assertFinite(name: string, values: Float32Array): void {
  for (let c = 0; c < values.length; c++) {
    if (!Number.isFinite(values[c] ?? Number.NaN))
      throw new Error(`generator produced a non-finite ${name} at cell ${c}`);
  }
}

/** 생성기를 돌리고 부가 정보도 돌려준다 */
export function runPlanetGenerator(
  input: PlanetGeneratorInput,
  options: GeneratorOptions = {},
): GeneratorDetails {
  validateInput(input);
  const onStage = options.onStage ?? (() => {});
  const { faceLevel, seed, biomes } = input;
  // 설정값을 복사해 둔다(호출한 쪽이 나중에 고쳐도 메타가 바뀌지 않게)
  const settings: PlanetSettings = { ...input.settings };

  const grid = buildGrid(faceLevel);
  onStage("grid");

  const { elevation } = buildTectonics(grid, seed, settings);
  assertFinite("elevation", elevation);
  onStage("tectonics");

  const { seaLevel, ocean } = classifyOcean(grid, elevation, settings.landPercent);
  onStage("seaLevel");

  let flow = priorityFlood(grid, elevation, ocean);
  onStage("flowDirections");

  const climate = computeClimate(grid, elevation, seaLevel, ocean, settings);
  assertFinite("temperature", climate.temperature);
  assertFinite("precipitation", climate.precipitation);
  const runoff = runoffOf(climate.precipitation, climate.temperature, ocean);
  onStage("climate");

  const strength = (EROSION_STRENGTH * settings.erosionPercent) / 100;
  if (strength > 0) {
    for (let pass = 0; pass < EROSION_PASSES; pass++) {
      const balance = waterBalance(grid, flow, elevation, runoff, climate.temperature, settings.lakePercent);
      erodeOnce(grid, flow, elevation, balance.discharge, ocean, seaLevel, strength);
      flow = priorityFlood(grid, elevation, ocean);
    }
  }
  assertFinite("eroded elevation", elevation);
  onStage("erosion");

  const balance = waterBalance(grid, flow, elevation, runoff, climate.temperature, settings.lakePercent);
  const rivers = findRivers(grid, flow, elevation, balance, ocean, settings.riverDensityPercent);
  onStage("hydrology");

  const surface = buildSurface(
    grid,
    seed,
    elevation,
    seaLevel,
    ocean,
    flow,
    rivers,
    climate.temperature,
    climate.precipitation,
    biomes,
  );
  onStage("surface");

  const hash = hashPlanetFields(faceLevel, surface);
  onStage("hash");
  return {
    fields: { ...surface, meta: { generatorVersion: GENERATOR_VERSION, seed, faceLevel, settings, hash } },
    receiver: flow.receiver,
    basinKind: rivers.basinKind,
    seaLevelRealM: seaLevel,
  };
}

/** 행성 생성: 풀어 쓴 정의 → PlanetFields (ADR 36) */
export function generatePlanet(input: PlanetGeneratorInput): PlanetFields {
  return runPlanetGenerator(input).fields;
}
