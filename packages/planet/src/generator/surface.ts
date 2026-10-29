// 생성 6~8단계: 수심 등급 → 습도 → 바이옴 → 숲 밀도, 그리고 저장 값(정수)으로 바꾸기
// - 저장 고도(게임 m) = (실제 환산 고도 − 해수면) ÷ 12, 반올림(ADR 36 고도 1:12). 메운 평지·마른 분지는 채운 높이.
// - 수심 등급(바다만): 실제 환산 깊이 60m 미만 연안, 200m 미만 대륙붕, 그 밖은 심해.
// - 습도(0~255) = 255 × AI / (AI + 0.75), AI = 강수 ÷ 증발 가능량. 강·호수 옆은 더한다. 바다·호수는 255.
// - 바이옴: 저장한 기온·습도·고도로 고른다(그래서 출력만 보고도 판정을 다시 할 수 있다).
// - 숲 밀도 = 바이옴 기본값 × 습도 비율 × 노이즈(0.85 ~ 1.15).
import type { OceanDepthClass } from "@terra/shared";
import type { FlowNetwork } from "./flood.ts";
import { type PlanetGrid, neighbors8 } from "./grid.ts";
import { CELL_DRY, CELL_FILLED, CELL_LAKE, type Rivers, potentialEvaporation } from "./hydrology.ts";
import { fbm3 } from "./noise.ts";
import { STREAM_FOREST, streamSeed } from "./random.ts";
import {
  DEPTH_COASTAL,
  DEPTH_DEEP,
  DEPTH_SHELF,
  WATER_COAST,
  WATER_DEPTH_SHIFT,
  WATER_LAKE,
  WATER_OCEAN,
  WATER_RIVER,
} from "../tiles/fields.ts";
import type { BiomeRange, PlanetBiome } from "./types.ts";
import { clamp } from "./util.ts";

/** 고도 축척: 저장 값(게임 m) × 12 = 실제 환산 m (ADR 36, 기획 확인 중) */
export const VERTICAL_SCALE = 12;
/** 수심 등급 경계(실제 환산 m) */
const COASTAL_DEPTH_M = 60;
const SHELF_DEPTH_M = 200;

const DEPTH_CLASS_OF: Readonly<Record<OceanDepthClass, number>> = {
  coastal: DEPTH_COASTAL,
  shelf: DEPTH_SHELF,
  deep: DEPTH_DEEP,
};

interface CompiledBiomes {
  /** 수심 등급(1~3) → 바이옴 번호 */
  readonly ocean: readonly number[];
  readonly lake: number;
  readonly land: readonly { readonly index: number; readonly biome: PlanetBiome }[];
  readonly landFallback: number;
}

/** 바이옴 표 확인·정리: 바다·호수·육지 규칙이 하나씩은 있어야 한다(아니면 RangeError) */
export function compileBiomes(biomes: readonly PlanetBiome[]): CompiledBiomes {
  if (biomes.length === 0 || biomes.length > 255)
    throw new RangeError(`biome table must have 1..255 entries: ${biomes.length}`);
  let firstOcean = -1;
  let lake = -1;
  const ocean = [-1, -1, -1, -1];
  const land: { index: number; biome: PlanetBiome }[] = [];
  biomes.forEach((biome, index) => {
    if (!Number.isInteger(biome.forestDensity) || biome.forestDensity < 0 || biome.forestDensity > 255) {
      throw new RangeError(`biome ${biome.id}: forestDensity must be an integer in [0, 255]`);
    }
    const { rule } = biome;
    if (rule.kind === "ocean") {
      if (firstOcean < 0) firstOcean = index;
      const depth = DEPTH_CLASS_OF[rule.depthClass];
      if ((ocean[depth] ?? -1) < 0) ocean[depth] = index;
    } else if (rule.kind === "lake") {
      if (lake < 0) lake = index;
    } else {
      land.push({ index, biome });
    }
  });
  if (firstOcean < 0 || lake < 0 || land.length === 0) {
    throw new RangeError("biome table needs at least one ocean, one lake and one land rule");
  }
  for (let depth = 1; depth <= 3; depth++) if ((ocean[depth] ?? -1) < 0) ocean[depth] = firstOcean;
  return { ocean, lake, land, landFallback: land[land.length - 1]?.index ?? 0 };
}

function inRange(value: number, range: BiomeRange | undefined): boolean {
  if (!range) return true;
  if (range.min !== undefined && value < range.min) return false;
  if (range.max !== undefined && value >= range.max) return false;
  return true;
}

/** 육지 칸의 바이옴: 표 순서대로 처음 맞는 규칙, 없으면 마지막 육지 바이옴 */
function landBiome(
  table: CompiledBiomes,
  temperatureC: number,
  humidity: number,
  realElevationM: number,
): number {
  for (const { index, biome } of table.land) {
    const { rule } = biome;
    if (rule.kind !== "land") continue;
    if (
      inRange(temperatureC, rule.temperatureC) &&
      inRange(humidity, rule.humidity) &&
      inRange(realElevationM, rule.realElevationM)
    ) {
      return index;
    }
  }
  return table.landFallback;
}

export interface SurfaceFields {
  readonly elevationM: Int16Array;
  readonly biome: Uint8Array;
  readonly temperatureC: Int8Array;
  readonly precipitationMm: Uint16Array;
  readonly humidity: Uint8Array;
  readonly water: Uint8Array;
  readonly river: Uint8Array;
  readonly forest: Uint8Array;
}

export function buildSurface(
  grid: PlanetGrid,
  seed: number,
  elevation: Float32Array,
  seaLevel: number,
  ocean: Uint8Array,
  flow: FlowNetwork,
  rivers: Rivers,
  temperature: Float32Array,
  precipitation: Float32Array,
  biomes: readonly PlanetBiome[],
): SurfaceFields {
  const count = grid.cellCount;
  const table = compileBiomes(biomes);
  const elevationM = new Int16Array(count);
  const biome = new Uint8Array(count);
  const temperatureC = new Int8Array(count);
  const precipitationMm = new Uint16Array(count);
  const humidity = new Uint8Array(count);
  const water = new Uint8Array(count);
  const river = new Uint8Array(count);
  const forest = new Uint8Array(count);
  const forestSeed = streamSeed(seed, STREAM_FOREST);
  const out = new Int32Array(8);
  for (let c = 0; c < count; c++) {
    const kind = rivers.basinKind[c] ?? 0;
    const ground = kind === CELL_FILLED || kind === CELL_DRY ? (flow.filled[c] ?? 0) : (elevation[c] ?? 0);
    const stored = clamp(Math.round((ground - seaLevel) / VERTICAL_SCALE), -32_768, 32_767);
    elevationM[c] = stored;
    const t = clamp(Math.round(temperature[c] ?? 0), -128, 127);
    temperatureC[c] = t;
    const p = precipitation[c] ?? 0;
    precipitationMm[c] = clamp(Math.round(p), 0, 65_535);
    river[c] = rivers.order[c] ?? 0;
    const isOcean = ocean[c] === 1;
    const isLake = kind === CELL_LAKE;
    let bits = 0;
    if (isOcean) {
      bits |= WATER_OCEAN;
      const depth = seaLevel - (elevation[c] ?? 0);
      const depthClass =
        depth < COASTAL_DEPTH_M ? DEPTH_COASTAL : depth < SHELF_DEPTH_M ? DEPTH_SHELF : DEPTH_DEEP;
      bits |= depthClass << WATER_DEPTH_SHIFT;
      humidity[c] = 255;
      biome[c] = table.ocean[depthClass] ?? 0;
      water[c] = bits;
      continue;
    }
    // 바다가 아닌 칸: 해안, 강·호수 옆
    neighbors8(grid, c, out);
    let nearWater = isLake ? 30 : 0;
    for (let k = 0; k < 8; k++) {
      const next = out[k] ?? -1;
      if (next < 0) continue;
      if (ocean[next] === 1) bits |= WATER_COAST;
      if (rivers.basinKind[next] === CELL_LAKE) nearWater = Math.max(nearWater, 24);
      const order = rivers.order[next] ?? 0;
      if (order > 0) nearWater = Math.max(nearWater, 14 + 5 * Math.min(order, 6));
    }
    if ((river[c] ?? 0) > 0) {
      bits |= WATER_RIVER;
      nearWater = Math.max(nearWater, 14 + 5 * Math.min(river[c] ?? 0, 6));
    }
    if (isLake) bits |= WATER_LAKE;
    water[c] = bits;
    if (isLake) {
      humidity[c] = 255;
      biome[c] = table.lake;
      continue;
    }
    const aridity = p / potentialEvaporation(t);
    const h = clamp(Math.round((255 * aridity) / (aridity + 0.75) + nearWater), 0, 255);
    humidity[c] = h;
    const index = landBiome(table, t, h, stored * VERTICAL_SCALE);
    biome[c] = index;
    const base = biomes[index]?.forestDensity ?? 0;
    if (base > 0) {
      const wetness = 0.6 + 0.4 * clamp((h - 60) / 150, 0, 1);
      const variation =
        0.85 +
        0.3 * (0.5 + 0.5 * fbm3(forestSeed, grid.x[c] ?? 0, grid.y[c] ?? 0, grid.z[c] ?? 0, 14, 3, 0.5));
      forest[c] = clamp(Math.round(base * wetness * variation), 0, 255);
    }
  }
  return { elevationM, biome, temperatureC, precipitationMm, humidity, water, river, forest };
}
