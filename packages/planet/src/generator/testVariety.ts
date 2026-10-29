// 반복·단조로움 검사 지표 — 시험(variety.test.ts)과 측정 스크립트(bench/variety.ts) 전용. 생성기 출력에는 쓰지 않는다.
// 지표: docs/questions/2026-10-29-special-terrain.md 4.1(14개)과 보고용 몇 개. 스크래치 시제품(variety-check.ts)을 옮겼다.
// - 파일 이름이 test로 시작해 결정성 검사 대상 밖이다(scripts/check-boundaries.mjs). 생성기 코드는 이 파일들을 가져오지
//   않는다(같은 검사가 막는다). 측정 도우미는 testVarietyMeasures.ts, 생성기 단위 지표는 testVarietyUnit.ts.
// - Node API를 쓰지 않는다(src 안). 명령줄·파일은 bench/variety.ts가 맡는다.
// - 문턱(VARIETY_TARGETS)은 생성기 고침을 위한 임시값이다(문서 4.1, 기획 확인 전). 지금은 보고만 한다(gate: false).
//   막는 시험으로 바꾸면(gate: true) 그때의 GENERATOR_VERSION과 문턱을 ADR에 적는다.
import { windAt, windVectorAt } from "./climate.ts";
import type { GeneratorDetails } from "./generate.ts";
import {
  type CellWind,
  GAME_SCALE,
  type VarietyContext,
  boundaryCellShare,
  boxDimension,
  faceSeamChangeRatio,
  featureGapP90GameKm,
  humidityStepRatio,
  isLandCell,
  isOceanCell,
  jsDivergence,
  landPatches,
  latitudeBandTable,
  latitudeR2,
  singleBiomeWindowShare,
  topShare,
  waterOf,
  windStreakExcess,
  zonalBiomeMetrics,
} from "./testVarietyMeasures.ts";
import { distanceField } from "./queues.ts";
import { STREAM_WIND, streamSeed } from "./random.ts";
import { VERTICAL_SCALE } from "./surface.ts";
import type { PlanetGeneratorInput } from "./types.ts";
import { km } from "./util.ts";
import { WATER_COAST } from "../tiles/fields.ts";

export { type VarietyContext, varietyContext } from "./testVarietyMeasures.ts";

/** 갈색 무리(사바나·사막·툰드라·고산): 바탕 색이 ΔE 16~20으로 가까워 화면에서 한 덩어리로 보인다(보고용) */
const BROWN_CLUSTER: readonly string[] = ["savanna", "desert", "tundra", "alpine"];
const ICE_SHEET = "ice_sheet";

export type VarietyOp = "<=" | ">=";

/** 지표 문턱 */
export interface VarietyTarget {
  readonly op: VarietyOp;
  readonly limit: number;
  /** true면 시험이 막는다. 지금은 모두 false(보고 모드, 문서 4.4) */
  readonly gate: boolean;
}

/** 지표 이름 → 임시 문턱(문서 4.1). 여기 없는 지표는 보고만 한다 */
export const VARIETY_TARGETS: Readonly<Record<string, VarietyTarget>> = {
  // 위도 띠: 바이옴·기후가 위도만의 함수인지
  "zonal.biomeInfoExplainedByAbsLat": { op: "<=", limit: 0.5, gate: false },
  "zonal.dominantBiomeShare": { op: "<=", limit: 0.55, gate: false },
  "zonal.openOceanPrecipR2": { op: "<=", limit: 0.9, gate: false },
  "zonal.oceanTempR2": { op: "<=", limit: 0.97, gate: false },
  "zonal.lowlandTempR2": { op: "<=", limit: 0.96, gate: false },
  // 곧은 줄: 정수 등온선 계단, 바람 방향 줄무늬
  "lines.humidityStepAtIntegerIsotherms": { op: "<=", limit: 1.5, gate: false },
  "lines.windStreakAnisotropyExcess": { op: "<=", limit: 0.05, gate: false },
  // 해안선 거칠기
  "coast.boxDimension": { op: ">=", limit: 1.12, gate: false },
  // 큰 덩어리·특징 간격
  "patches.top10ShareOfLand": { op: "<=", limit: 0.35, gate: false },
  "patches.top10ShareOfLandWithoutIce": { op: "<=", limit: 0.3, gate: false },
  "patches.singleBiomeWindowShare": { op: "<=", limit: 0.35, gate: false },
  "features.gapP90GameKm": { op: "<=", limit: 8, gate: false },
  // 행성끼리 구별
  "seeds.sameBandOverAdjacentBandJs": { op: ">=", limit: 0.5, gate: false },
  // 생성기 단위(testVarietyUnit.ts)
  "unit.windMinSpeed": { op: ">=", limit: 0.2, gate: false },
  "unit.noiseLatticeRmsRatio": { op: ">=", limit: 0.8, gate: false },
  "unit.hotspotSpacingCv": { op: ">=", limit: 0.15, gate: false },
};

/** 지표 하나 */
export interface VarietyMetric {
  readonly name: string;
  readonly value: number;
  /** 설명(무엇을 어떻게 쟀는지, 표본) */
  readonly note: string;
}

export type VarietyVerdict = "PASS" | "FAIL" | "report";

/** 문턱과 비교한다. 문턱이 없으면 "report". 실수 끝자리 차이(상대 1e-9)는 통과로 본다 */
export function judgeMetric(metric: VarietyMetric): VarietyVerdict {
  const target = VARIETY_TARGETS[metric.name];
  if (!target) return "report";
  const slack = 1e-9 * Math.max(1, Math.abs(target.limit));
  const pass =
    target.op === "<=" ? metric.value <= target.limit + slack : metric.value >= target.limit - slack;
  return pass ? "PASS" : "FAIL";
}

export function varietyMetric(name: string, value: number, note: string): VarietyMetric {
  return { name, value, note };
}

/** 생성기가 습기 길을 고를 때 쓰는 바람(출력 판 3: 띠 바람 + 굽이, climate.ts windVectorAt) */
export function generatorWind(ctx: VarietyContext, seed: number): CellWind {
  const windSeed = streamSeed(seed, STREAM_WIND);
  const { x, y, z } = ctx.grid;
  return (c) => windVectorAt(windSeed, x[c] ?? 0, y[c] ?? 0, z[c] ?? 0, ctx.latitude[c] ?? 0);
}

/** 위도 띠 표의 5° 띠 하나(1° 띠 5개 합) */
function fiveDegreeBand(table: Float64Array, band: number, biomeCount: number): Float64Array {
  const row = new Float64Array(biomeCount);
  for (let degree = band * 5; degree < band * 5 + 5; degree++) {
    for (let k = 0; k < biomeCount; k++) row[k] = (row[k] ?? 0) + (table[degree * biomeCount + k] ?? 0);
  }
  return row;
}

const massOf = (row: Float64Array): number => row.reduce((sum, value) => sum + value, 0);

/** 분포 쌍들의 JS 거리 평균(두 분포의 넓이 합으로 가중, 빈 분포가 있는 쌍은 뺀다) */
function weightedJs(pairs: readonly (readonly [Float64Array, Float64Array])[]): number {
  let sum = 0;
  let weight = 0;
  for (const [p, q] of pairs) {
    const mass = massOf(p) + massOf(q);
    if (!(massOf(p) > 0) || !(massOf(q) > 0)) continue;
    sum += jsDivergence(p, q) * mass;
    weight += mass;
  }
  return weight > 0 ? sum / weight : Number.NaN;
}

/**
 * 행성끼리 구별(지표 11): 같은 5° 띠의 바이옴 분포가 시드 사이에서 다른 정도 ÷ 한 시드 안 이웃 5° 띠끼리 다른 정도.
 * 작으면 어느 시드든 같은 띠 순서가 나온다
 */
export function crossSeedMetrics(tables: readonly Float64Array[], biomeCount: number): VarietyMetric[] {
  if (tables.length < 2) return [];
  let between = 0;
  let pairsCount = 0;
  for (let a = 0; a < tables.length; a++) {
    for (let b = a + 1; b < tables.length; b++) {
      const left = tables[a];
      const right = tables[b];
      if (!left || !right) continue;
      const pairs: [Float64Array, Float64Array][] = [];
      for (let band = 0; band < 18; band++) {
        pairs.push([fiveDegreeBand(left, band, biomeCount), fiveDegreeBand(right, band, biomeCount)]);
      }
      between += weightedJs(pairs);
      pairsCount++;
    }
  }
  between /= pairsCount;
  let adjacent = 0;
  for (const table of tables) {
    const pairs: [Float64Array, Float64Array][] = [];
    for (let band = 0; band < 17; band++) {
      pairs.push([fiveDegreeBand(table, band, biomeCount), fiveDegreeBand(table, band + 1, biomeCount)]);
    }
    adjacent += weightedJs(pairs);
  }
  adjacent /= tables.length;
  return [
    varietyMetric(
      "seeds.sameBandOverAdjacentBandJs",
      between / adjacent,
      `between seeds ${between.toFixed(3)} bits, adjacent 5° bands ${adjacent.toFixed(3)} bits`,
    ),
  ];
}

/** 시드 하나의 결과 */
export interface SeedVariety {
  readonly metrics: readonly VarietyMetric[];
  /** 땅(바다·호수 아님) 넓이 중 육지 바이옴마다의 몫(바이옴 ID → 0 ~ 1) */
  readonly landShares: Readonly<Record<string, number>>;
  /** crossSeedMetrics에 넘길 위도 띠 표(latitudeBandTable) */
  readonly bandTable: Float64Array;
}

/** 출력 필드로 재는 지표(문서 4.1의 1~10 + 보고용). input은 그 결과를 만든 생성기 입력 */
export function fieldMetrics(
  ctx: VarietyContext,
  details: GeneratorDetails,
  input: PlanetGeneratorInput,
): SeedVariety {
  const { fields } = details;
  const biomeCount = input.biomes.length;
  const land = (c: number) => isLandCell(fields, c);
  const ocean = (c: number) => isOceanCell(fields, c);
  const metrics: VarietyMetric[] = [];

  // 위도 띠
  const bandTable = latitudeBandTable(ctx, fields, biomeCount);
  const zonal = zonalBiomeMetrics(bandTable, biomeCount);
  metrics.push(
    varietyMetric(
      "zonal.biomeInfoExplainedByAbsLat",
      zonal.infoShare,
      "land biome entropy share explained by |latitude| 1° bands",
    ),
    varietyMetric(
      "zonal.dominantBiomeShare",
      zonal.dominantShare,
      "land-weighted share of the most common biome per 1° band",
    ),
  );
  const far = distanceField(ctx.grid, (c) => !ocean(c), km(1000) + ctx.grid.meanCellAngle);
  const openOcean = (c: number) => ocean(c) && (far.angle[c] ?? 0) >= km(1000);
  const lowland = (c: number) => land(c) && (fields.elevationM[c] ?? 0) * VERTICAL_SCALE < 500;
  metrics.push(
    varietyMetric(
      "zonal.openOceanPrecipR2",
      latitudeR2(ctx, fields.precipitationMm, openOcean),
      "R² of precipitation on 1° latitude bins, ocean > 1,000 km from land",
    ),
    varietyMetric(
      "zonal.oceanTempR2",
      latitudeR2(ctx, fields.temperatureC, ocean),
      "R² of stored temperature on 1° bins, all ocean",
    ),
    varietyMetric(
      "zonal.lowlandTempR2",
      latitudeR2(ctx, fields.temperatureC, lowland),
      "R² of stored temperature on 1° bins, land below 500 m (real-eq)",
    ),
  );

  // 곧은 줄
  // 줄무늬는 생성기의 실제 바람을 따라 잰다. 위도 띠 바람으로 잰 값(시제품 정의)도 함께 낸다: 바람길이 굽으면
  // 실제 바람 쪽 값에는 매끈한 습기 띠의 자연스러운 늘어짐도 들어가고, 기준(고도) 방향성도 바람 방향에 따라 바뀐다
  const streak = windStreakExcess(ctx, fields, generatorWind(ctx, input.seed));
  const zonalStreak = windStreakExcess(ctx, fields, (c) => windAt(ctx.latitude[c] ?? 0));
  metrics.push(
    varietyMetric(
      "lines.humidityStepAtIntegerIsotherms",
      humidityStepRatio(ctx, fields),
      "mean |Δhumidity| across a rounded-temperature change ÷ within the same (confounded by zonality)",
    ),
    varietyMetric(
      "lines.windStreakAnisotropyExcess",
      streak.excess,
      `along the generator wind: (cross/along of zonal-residual log P) − (same for elevation), ref ${streak.reference.toFixed(2)}`,
    ),
    varietyMetric(
      "lines.windStreakRawAnisotropy",
      streak.raw,
      "cross/along of zonal-residual log P along the generator wind (isotropic = 1)",
    ),
    varietyMetric(
      "lines.windStreakZonalExcess",
      zonalStreak.excess,
      "same excess along the latitude-band wind windAt (the prototype's definition, comparable with its E2 runs)",
    ),
  );

  // 해안
  const cellKm = Math.round(ctx.cellKm);
  metrics.push(
    varietyMetric(
      "coast.boxDimension",
      boxDimension(ctx, (c) => (waterOf(fields, c) & WATER_COAST) !== 0, 1, 4),
      `coastline box-count dimension at 1–4 cells (${cellKm}–${4 * cellKm} km real-eq)`,
    ),
  );

  // 덩어리·특징
  const patches = landPatches(ctx, fields);
  const iceIndex = input.biomes.findIndex((biome) => biome.id === ICE_SHEET);
  const withoutIce = patches.area.filter((_, k) => patches.biome[k] !== iceIndex);
  const windowCells = Math.max(1, Math.round((24 * GAME_SCALE) / ctx.cellKm));
  const windows = singleBiomeWindowShare(ctx, land, fields.biome, windowCells);
  metrics.push(
    varietyMetric(
      "patches.top10ShareOfLand",
      topShare(patches.area, 10),
      `land covered by the 10 largest of ${patches.area.length} land biome patches`,
    ),
    varietyMetric(
      "patches.top10ShareOfLandWithoutIce",
      topShare(withoutIce, 10),
      "same, ice-sheet patches left out (share of non-ice land)",
    ),
    varietyMetric(
      "patches.singleBiomeWindowShare",
      windows.share,
      `24 game km windows (${windowCells}×${windowCells} cells, ${windows.windows} land windows) holding one biome`,
    ),
    varietyMetric("patches.largestShareOfLand", topShare(patches.area, 1), "largest single patch"),
    varietyMetric("patches.count", patches.area.length, "land biome patches (8-neighbour)"),
    varietyMetric(
      "patches.boundaryCellShare",
      boundaryCellShare(ctx, fields),
      "land cells with a 4-neighbour of another land biome, share of all cells",
    ),
    varietyMetric(
      "features.gapP90GameKm",
      featureGapP90GameKm(ctx, fields, details.basinKind),
      "p90 distance from land to the nearest 1st-map feature (game km)",
    ),
  );

  // 바이옴 몫
  const areaOfBiome = new Float64Array(biomeCount);
  let landArea = 0;
  for (let c = 0; c < ctx.grid.cellCount; c++) {
    if (!land(c)) continue;
    const kind = fields.biome[c] ?? 0;
    areaOfBiome[kind] = (areaOfBiome[kind] ?? 0) + (ctx.area[c] ?? 0);
    landArea += ctx.area[c] ?? 0;
  }
  const landShares: Record<string, number> = {};
  input.biomes.forEach((biome, k) => {
    if (biome.rule.kind === "land")
      landShares[biome.id] = landArea > 0 ? (areaOfBiome[k] ?? 0) / landArea : 0;
  });
  const shares = Object.values(landShares);
  const brown = BROWN_CLUSTER.reduce((sum, id) => sum + (landShares[id] ?? 0), 0);
  metrics.push(
    varietyMetric("biomes.largestShareOfLand", Math.max(0, ...shares), "most common land biome"),
    varietyMetric("biomes.brownClusterShare", brown, `${BROWN_CLUSTER.join(" + ")} (palette ΔE 16–20)`),
    varietyMetric(
      "seams.faceEdgeChangeRatio",
      faceSeamChangeRatio(ctx, fields),
      "biome change rate across cube-face edges ÷ inside faces (≈ 1 = no visible seam)",
    ),
  );
  return { metrics, landShares, bandTable };
}

/** 값 표시: 큰 값은 소수 1자리, 나머지는 3자리 */
export function formatMetricValue(value: number): string {
  return Math.abs(value) >= 100 ? value.toFixed(1) : value.toFixed(3);
}

/** 보고 표: 지표 | 문턱 | 시드마다 값과 판정, 시드끼리 지표, 땅 바이옴 몫(%) */
export function formatVarietyReport(
  seeds: readonly number[],
  perSeed: readonly SeedVariety[],
  cross: readonly VarietyMetric[],
): string {
  const lines: string[] = [`metric | target | ${seeds.join(" | ")}`];
  const names = perSeed[0]?.metrics.map((entry) => entry.name) ?? [];
  let failing = 0;
  let judged = 0;
  const cell = (entry: VarietyMetric | undefined): string => {
    if (!entry) return "—";
    const verdict = judgeMetric(entry);
    if (verdict !== "report") judged++;
    if (verdict === "FAIL") failing++;
    return verdict === "report"
      ? formatMetricValue(entry.value)
      : `${formatMetricValue(entry.value)} ${verdict}`;
  };
  for (const name of names) {
    const target = VARIETY_TARGETS[name];
    const limit = target ? `${target.op} ${target.limit}` : "report";
    const values = perSeed.map((result) => cell(result.metrics.find((entry) => entry.name === name)));
    lines.push(`${name} | ${limit} | ${values.join(" | ")}`);
  }
  for (const entry of cross) {
    const target = VARIETY_TARGETS[entry.name];
    lines.push(
      `${entry.name} | ${target ? `${target.op} ${target.limit}` : "report"} | ${cell(entry)} (${entry.note})`,
    );
  }
  const ids = Object.keys(perSeed[0]?.landShares ?? {});
  lines.push(
    `land biome shares % | | ${ids
      .map(
        (id) => `${id} ${perSeed.map((result) => (100 * (result.landShares[id] ?? 0)).toFixed(1)).join("/")}`,
      )
      .join(", ")}`,
    `${failing} of ${judged} judged checks fail (report mode: nothing is gated yet)`,
  );
  return lines.join("\n");
}
