// 2차맵 배치 — 배치 칸(256²)마다 엄폐 값(0 없음·1 은폐·2 차폐)과 소품 그림 번호. ADR 46 4절, ADR 35 "숲"(질문 27 기본안).
// 판정 자료다: 정수·사칙연산과 결정적 함수만 쓴다. 같은 입력이면 어디서나 같은 결과다.
// 차례:
// 1. 환경 값: 지형 칸마다 기온·습도·강수·실제 고도·경사·|위도|(규칙이 쓰는 것만), 배치 칸마다 물까지 거리.
//    기온·습도·강수·숲 밀도는 칸 값의 2차 조각(cellPatch)이고 |위도|는 2차맵 꼭짓점 넷의 쌍선형이라 2차맵 경계에서 이어진다.
// 2. 숲 나누기: 숲 밀도 F(0 ~ 255)와 덩이 약 8칸 노이즈. 고르게 편 노이즈 < F의 35%(F = 255 기준)면 차폐, 그다음 20%는 은폐.
//    물 칸과 물가 띠(물까지 2칸 안)에는 숲이 없다. 숲 칸의 그림은 map_props의 forest 항목을 비중대로 고른다.
// 3. 빈 길: 전역 배치 칸 좌표(면 레벨 F+8)에서 16칸 간격 + 노이즈로 ±4칸 흔든 폭 2칸 띠, 가로·세로. 길에서는 차폐가 은폐로 바뀐다
//    (차폐 소품은 놓지 않는다). 흔드는 방향은 면 축의 3D 방향 부호로 정해 면 경계 너머에서도 같은 띠로 이어진다.
// 4. 흩기 소품: 숲이 없는 마른 칸에 map_props의 scatter 항목을 우선순위대로. 놓일 몫 = 비중(덩이 안이면 늘림, 몫 상한이면 줄임).
// 5. 갇힌 곳 잇기: 크기 등급 1이 설 수 있는 덩이 가운데 엄폐(차폐) 때문에 본 덩이(가장자리에 닿는 덩이)와 끊긴 덩이마다
//    차폐를 가장 적게 지나는 길을 은폐로 뚫는다. 그래서 2차맵 안 땅은 물·벼랑으로 갈린 곳을 빼고 모두 이어진다(ADR 35 생성기 시험).
// 수치는 [임시](ADR 35 출발값, Step 5 설정값 전)다. 바꾸면 SECOND_MAP_GENERATOR_VERSION을 올린다.
import { detAsin } from "@terra/shared";
import { FACE_FRAMES } from "../faces.ts";
import { mix32 } from "../generator/random.ts";
import { cellCorners } from "../projection.ts";
import { bernsteinTable, controlNet, netSum, netValue } from "./cellPatch.ts";
import { equalizeNoise, latticeNoiseGrid, layerSalt } from "./latticeNoise.ts";
import { type MapCoords, SM_PLACEMENT, SM_TERRAIN, SM_VERTICES, floorDiv } from "./layout.ts";
import type { PlanetValues } from "./planetValues.ts";
import { connectPockets } from "./pockets.ts";
import { AXIS, type PropCurve, type PropRule, type PropRuleSet, curveValue } from "./props.ts";
import { SM_SURFACE } from "./surfaces.ts";

/** 이 높이 차(cm, 지형 칸 네 꼭짓점) 이상이면 벼랑이라 지나갈 수 없다. packages/sim CLIFF_RELIEF_CM과 같다(서버 시험) */
export const SM_CLIFF_RELIEF_CM = 650;
/** 숲 밀도 255에서 차폐·은폐 몫(천분율) [임시] */
const FOREST_DENSE_FULL = 350;
const FOREST_SPARSE_FULL = 200;
/** 숲 덩이 노이즈 격자(면 레벨 F+9 단위 2^4 = 배치 칸 8) */
const FOREST_BLOB_K = 4;
/** 물까지 이 칸 수 안에는 숲이 없다(물가 띠) */
const FOREST_SHORE_GAP = 2;
/**
 * 빈 길: 간격 16칸(1/256칸 단위 4096), 반폭 1칸(256), 흔들기 ±4칸(1024), 흔들기 노이즈 격자 배치 칸 32(F+9 단위 2^6).
 * 흔들기 기울기는 칸마다 0.4칸 아래라 폭 2칸 띠가 네 방향으로 이어진다(격자 64칸이면 거의 곧은 줄로 보였다)
 */
const LANE_PERIOD = 16 * 256;
const LANE_OFFSET = 8 * 256;
const LANE_HALF = 256;
const LANE_JITTER = 4 * 256;
const LANE_JITTER_K = 6;
/** 물까지 거리를 자르는 값(배치 칸) */
export const WATER_DISTANCE_MAX = 64;

const LAYER_FOREST = 6;
/** 빈 길 흔들기 노이즈: 띠 자리를 재는 3D 축(x·y·z)마다 층 하나(7·8·11) */
const LAYER_LANE = [7, 8, 11] as const;
const LAYER_CLUMP = 9;
const LAYER_CELL = 10;

export interface PlacementInput {
  readonly values: PlanetValues;
  readonly map: MapCoords;
  readonly nb: Int32Array;
  readonly heightsCm: Int32Array;
  /** 지형 칸 지표 128² */
  readonly surface: Uint8Array;
  /** 지형 칸 바이옴 번호 128²(섞어 고른 것) */
  readonly biome: Uint8Array;
  readonly rules: PropRuleSet;
}

export interface Placement {
  /** 배치 칸 엄폐 값 256² */
  readonly cover: Uint8Array;
  /** 배치 칸 소품 그림 번호(@terra/shared MAP_PROP_ARTS) 256² */
  readonly art: Uint8Array;
}

const PLACEMENT_CELLS = SM_PLACEMENT * SM_PLACEMENT;
const TERRAIN_CELLS = SM_TERRAIN * SM_TERRAIN;

/** 배치 칸 (px, py) → 지형 칸 번호 */
const terrainOf = (px: number, py: number): number => (py >> 1) * SM_TERRAIN + (px >> 1);

/** 면 레벨 F+9 노이즈 격자(배치 칸 가운데 256²)를 배치 칸 차례(행 py 위에서부터)로 */
function placementNoise(map: MapCoords, k: number, salt: number): Int32Array {
  const grid = latticeNoiseGrid(
    map.face,
    map.faceLevel + 9,
    map.i * 2 * SM_PLACEMENT + 1,
    map.j * 2 * SM_PLACEMENT + 1,
    2,
    SM_PLACEMENT,
    SM_PLACEMENT,
    k,
    salt,
  );
  // 격자 줄 b는 면 J가 커지는 쪽, 배치 칸 행 py는 J가 작아지는 쪽이다
  const out = new Int32Array(PLACEMENT_CELLS);
  for (let py = 0; py < SM_PLACEMENT; py++) {
    out.set(
      grid.subarray((SM_PLACEMENT - 1 - py) * SM_PLACEMENT, (SM_PLACEMENT - py) * SM_PLACEMENT),
      py * SM_PLACEMENT,
    );
  }
  return out;
}

/** 고르게 편 노이즈(천분율 0 ~ 999) */
const permille = (noise: number): number => Math.floor((equalizeNoise(noise) * 1000) / 65_536);

/** 물(바다·호수·강) 지형 칸 */
const isWaterSurface = (kind: number): boolean =>
  kind === SM_SURFACE.water || kind === SM_SURFACE.shallowWater;

/** 배치 칸마다 가장 가까운 물 배치 칸까지 거리(칸, 3·4 모서리 거리 근사, WATER_DISTANCE_MAX에서 자름) */
function waterDistances(surface: Uint8Array): Uint8Array {
  const cap = WATER_DISTANCE_MAX * 3;
  const d = new Uint16Array(PLACEMENT_CELLS).fill(cap);
  for (let py = 0; py < SM_PLACEMENT; py++) {
    for (let px = 0; px < SM_PLACEMENT; px++) {
      if (isWaterSurface(surface[terrainOf(px, py)] ?? 0)) d[py * SM_PLACEMENT + px] = 0;
    }
  }
  const relax = (index: number, other: number, step: number): void => {
    const candidate = (d[other] ?? cap) + step;
    if (candidate < (d[index] ?? cap)) d[index] = candidate;
  };
  for (let py = 0; py < SM_PLACEMENT; py++) {
    for (let px = 0; px < SM_PLACEMENT; px++) {
      const i = py * SM_PLACEMENT + px;
      if (px > 0) relax(i, i - 1, 3);
      if (py > 0) {
        relax(i, i - SM_PLACEMENT, 3);
        if (px > 0) relax(i, i - SM_PLACEMENT - 1, 4);
        if (px < SM_PLACEMENT - 1) relax(i, i - SM_PLACEMENT + 1, 4);
      }
    }
  }
  for (let py = SM_PLACEMENT - 1; py >= 0; py--) {
    for (let px = SM_PLACEMENT - 1; px >= 0; px--) {
      const i = py * SM_PLACEMENT + px;
      if (px < SM_PLACEMENT - 1) relax(i, i + 1, 3);
      if (py < SM_PLACEMENT - 1) {
        relax(i, i + SM_PLACEMENT, 3);
        if (px < SM_PLACEMENT - 1) relax(i, i + SM_PLACEMENT + 1, 4);
        if (px > 0) relax(i, i + SM_PLACEMENT - 1, 4);
      }
    }
  }
  const out = new Uint8Array(PLACEMENT_CELLS);
  for (let i = 0; i < PLACEMENT_CELLS; i++)
    out[i] = Math.min(WATER_DISTANCE_MAX, Math.floor((d[i] ?? cap) / 3));
  return out;
}

/** 지형 칸 가운데에서 칸 값의 2차 조각 값(조절점 e = 8: 지형 칸 가운데 = 홀수 자리) */
function terrainCellNet(nb: Int32Array, value: (cell: number) => number): Int32Array {
  const net = controlNet(nb, value);
  const table = bernsteinTable(8);
  const out = new Int32Array(TERRAIN_CELLS);
  for (let r = 0; r < SM_TERRAIN; r++) {
    const y8 = 2 * (SM_TERRAIN - r) - 1;
    for (let c = 0; c < SM_TERRAIN; c++)
      out[r * SM_TERRAIN + c] = netValue(netSum(net, table, 2 * c + 1, y8), 8);
  }
  return out;
}

/** 지형 칸마다 |위도|(1/1000도): 2차맵 꼭짓점 넷의 쌍선형(이웃 2차맵과 꼭짓점이 같아 경계에서 이어진다) */
function latitudes(map: MapCoords): Int32Array {
  const corners = cellCorners(map.key).map((p) =>
    Math.floor(Math.abs((detAsin(Math.min(1, Math.max(-1, p[2]))) * 180_000) / Math.PI)),
  );
  // 꼭짓점 차례: (i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)
  const [l00 = 0, l10 = 0, l11 = 0, l01 = 0] = corners;
  const out = new Int32Array(TERRAIN_CELLS);
  for (let r = 0; r < SM_TERRAIN; r++) {
    const y = 2 * (SM_TERRAIN - r) - 1;
    for (let c = 0; c < SM_TERRAIN; c++) {
      const x = 2 * c + 1;
      const sum = l00 * (256 - x) * (256 - y) + l10 * x * (256 - y) + l11 * x * y + l01 * (256 - x) * y;
      out[r * SM_TERRAIN + c] = Math.floor(sum / 65_536);
    }
  }
  return out;
}

/** 규칙이 쓰는 환경 값(축 번호 → 지형 칸 배열. 물까지 거리는 배치 칸 배열) */
interface Environment {
  readonly terrain: readonly (Int32Array | undefined)[];
  readonly waterDistance: Uint8Array;
}

function buildEnvironment(input: PlacementInput, waterDistance: Uint8Array, relief: Int32Array): Environment {
  const { values, map, nb, heightsCm, rules } = input;
  const uses = (axis: number): boolean => (rules.axes & (1 << axis)) !== 0;
  const terrain: (Int32Array | undefined)[] = [];
  if (uses(AXIS.temperature)) {
    terrain[AXIS.temperature] = terrainCellNet(nb, (cell) => (values.temperatureC[cell] ?? 0) * 100);
  }
  if (uses(AXIS.humidity)) terrain[AXIS.humidity] = terrainCellNet(nb, (cell) => values.humidity[cell] ?? 0);
  if (uses(AXIS.precipitation)) {
    terrain[AXIS.precipitation] = terrainCellNet(nb, (cell) => values.precipitationMm[cell] ?? 0);
  }
  if (uses(AXIS.altitude)) {
    const out = new Int32Array(TERRAIN_CELLS);
    for (let r = 0; r < SM_TERRAIN; r++) {
      for (let c = 0; c < SM_TERRAIN; c++) {
        const top = r * SM_VERTICES + c;
        const sum =
          (heightsCm[top] ?? 0) +
          (heightsCm[top + 1] ?? 0) +
          (heightsCm[top + SM_VERTICES] ?? 0) +
          (heightsCm[top + SM_VERTICES + 1] ?? 0);
        // 실제 환산 고도(m) = 게임 높이(cm) × 12 ÷ 100(D-215)
        out[r * SM_TERRAIN + c] = floorDiv(sum * 12, 400);
      }
    }
    terrain[AXIS.altitude] = out;
  }
  if (uses(AXIS.slope)) {
    // 경사(%) = 높이 차 ÷ 기준 칸 길이 11.72m
    terrain[AXIS.slope] = relief.map((value) => Math.floor((value * 100) / 1172));
  }
  if (uses(AXIS.latitude)) terrain[AXIS.latitude] = latitudes(map);
  return { terrain, waterDistance };
}

/**
 * 규칙 하나의 비중(천분율)을 지형 칸마다: 바이옴 기본 비중 × 곡선 값들(곡선마다 내림). 물까지 거리 곡선은 배치 칸 값이라
 * 빼 두고 cellWeight가 마지막에 곱한다.
 */
function terrainWeights(rule: PropRule, env: Environment, biome: Uint8Array): Int32Array {
  const out = new Int32Array(TERRAIN_CELLS);
  const curves = rule.curves.filter((curve) => curve.axis !== AXIS.waterDistance);
  for (let tc = 0; tc < TERRAIN_CELLS; tc++) {
    let weight = rule.biomeWeight[biome[tc] ?? 0] ?? 0;
    for (const curve of curves) {
      if (weight === 0) break;
      weight = Math.floor((weight * curveValue(curve, env.terrain[curve.axis]?.[tc] ?? 0)) / 1000);
    }
    out[tc] = weight;
  }
  return out;
}

/** 규칙의 물까지 거리 곡선(없으면 undefined) */
const waterCurveOf = (rule: PropRule): PropCurve | undefined =>
  rule.curves.find((curve) => curve.axis === AXIS.waterDistance);

/** 배치 칸 비중 = 지형 칸 비중 × 물까지 거리 곡선 */
function cellWeight(terrainWeight: number, waterCurve: PropCurve | undefined, waterDistance: number): number {
  if (!waterCurve || terrainWeight === 0) return terrainWeight;
  return Math.floor((terrainWeight * curveValue(waterCurve, waterDistance)) / 1000);
}

/** 면 축 벡터(±단위 축)가 가리키는 3D 축 번호(x 0, y 1, z 2) */
function worldAxis(axis: readonly [number, number, number]): 0 | 1 | 2 {
  if (axis[0] !== 0) return 0;
  return axis[1] !== 0 ? 1 : 2;
}

/** 전역 좌표 value(1/256칸)가 빈 길 가운데 줄(16m + 8)에서 반폭 안인가 */
function nearLane(value: number): boolean {
  const d = (((value - LANE_OFFSET) % LANE_PERIOD) + LANE_PERIOD) % LANE_PERIOD;
  return Math.min(d, LANE_PERIOD - d) < LANE_HALF;
}

/** 빈 길 표지(배치 칸): 전역 좌표의 16칸 간격 띠 + 흔들기. 2차맵 자리와 행성 시드에만 달려 있다 */
export function laneMask(map: MapCoords, seed: number): Uint8Array {
  const { uAxis, vAxis } = FACE_FRAMES[map.face];
  // 띠 자리는 면 축으로 재지만, 흔드는 방향과 노이즈는 그 축의 3D 방향(어느 축인가·부호)으로 정한다.
  // 면 경계 너머에서는 축 이름(u·v)이 바뀌거나 방향이 뒤집혀도 같은 3D 축이라 같은 띠가 같은 만큼 흔들린다
  const su = uAxis[0] + uAxis[1] + uAxis[2];
  const sv = vAxis[0] + vAxis[1] + vAxis[2];
  const jitterU = placementNoise(map, LANE_JITTER_K, layerSalt(seed, LAYER_LANE[worldAxis(uAxis)]));
  const jitterV = placementNoise(map, LANE_JITTER_K, layerSalt(seed, LAYER_LANE[worldAxis(vAxis)]));
  const out = new Uint8Array(PLACEMENT_CELLS);
  for (let py = 0; py < SM_PLACEMENT; py++) {
    // 배치 칸 가운데 전역 좌표(1/256칸): 행 py는 면 J가 작아지는 쪽
    const qc = (2 * (map.j * SM_PLACEMENT + SM_PLACEMENT - 1 - py) + 1) * 128;
    for (let px = 0; px < SM_PLACEMENT; px++) {
      const i = py * SM_PLACEMENT + px;
      const pc = (2 * (map.i * SM_PLACEMENT + px) + 1) * 128;
      const du = floorDiv(((jitterU[i] ?? 32_768) - 32_768) * LANE_JITTER, 32_768);
      const dv = floorDiv(((jitterV[i] ?? 32_768) - 32_768) * LANE_JITTER, 32_768);
      if (nearLane(pc + su * du) || nearLane(qc + sv * dv)) out[i] = 1;
    }
  }
  return out;
}

/** 배치 칸 해시(전역 좌표·면·행성 시드): 소품 고르기에 쓴다. 배치 칸은 한 2차맵에만 있어 이웃과 맞출 것이 없다 */
function cellHashes(input: PlacementInput): Uint32Array {
  const { map, values } = input;
  const salt = layerSalt(values.seed, LAYER_CELL);
  const out = new Uint32Array(PLACEMENT_CELLS);
  for (let py = 0; py < SM_PLACEMENT; py++) {
    const q = map.j * SM_PLACEMENT + SM_PLACEMENT - 1 - py;
    for (let px = 0; px < SM_PLACEMENT; px++) {
      const p = map.i * SM_PLACEMENT + px;
      const h = mix32((salt ^ Math.imul(p + 1, 0x9e3779b1) ^ Math.imul(map.face + 1, 0xc2b2ae35)) >>> 0);
      out[py * SM_PLACEMENT + px] = mix32((h ^ Math.imul(q + 1, 0x85ebca6b)) >>> 0);
    }
  }
  return out;
}

/** 숲 칸 그림 고르기: forest 항목을 비중대로. 비중이 모두 0이면 그 바이옴 기본 비중이 가장 큰 항목(같으면 앞) */
interface ForestPicker {
  readonly rules: readonly PropRule[];
  readonly weights: readonly Int32Array[];
  readonly waterCurves: readonly (PropCurve | undefined)[];
  readonly scratch: Int32Array;
}

function forestPicker(rules: PropRuleSet, env: Environment, biome: Uint8Array): ForestPicker {
  return {
    rules: rules.forest,
    weights: rules.forest.map((rule) => terrainWeights(rule, env, biome)),
    waterCurves: rules.forest.map(waterCurveOf),
    scratch: new Int32Array(rules.forest.length),
  };
}

function forestArt(
  picker: ForestPicker,
  biome: number,
  tc: number,
  waterDistance: number,
  hash: number,
): number {
  const { rules, weights, waterCurves, scratch } = picker;
  if (rules.length === 0) return 0;
  let total = 0;
  for (let k = 0; k < rules.length; k++) {
    const weight = cellWeight(weights[k]?.[tc] ?? 0, waterCurves[k], waterDistance);
    scratch[k] = weight;
    total += weight;
  }
  if (total > 0) {
    let target = mix32((hash ^ 0x27d4eb2d) >>> 0) % total;
    for (let k = 0; k < rules.length; k++) {
      const weight = scratch[k] ?? 0;
      if (target < weight) return rules[k]?.art ?? 0;
      target -= weight;
    }
  }
  let best = rules[0];
  for (const rule of rules) if ((rule.biomeWeight[biome] ?? 0) > (best?.biomeWeight[biome] ?? 0)) best = rule;
  return best?.art ?? 0;
}

/** 흩기 소품 하나의 칸마다 놓일 몫(천분율). 몫 상한이 걸리면 2차맵 전체를 같은 비율로 줄인다 */
function scatterChances(
  input: PlacementInput,
  rule: PropRule,
  env: Environment,
  waterCell: Uint8Array,
): Uint16Array {
  const out = new Uint16Array(PLACEMENT_CELLS);
  const clump =
    rule.clumpLog2 > 0
      ? placementNoise(
          input.map,
          rule.clumpLog2 + 1,
          (layerSalt(input.values.seed, LAYER_CLUMP) ^ rule.salt) >>> 0,
        )
      : undefined;
  const boost = rule.clumpLog2 > 0 ? 1000 - rule.clumpThreshold : 1000;
  const weights = terrainWeights(rule, env, input.biome);
  const waterCurve = waterCurveOf(rule);
  let total = 0;
  for (let py = 0; py < SM_PLACEMENT; py++) {
    for (let px = 0; px < SM_PLACEMENT; px++) {
      const tc = terrainOf(px, py);
      if (waterCell[tc] === 1 || weights[tc] === 0) continue;
      const pi = py * SM_PLACEMENT + px;
      if (clump && permille(clump[pi] ?? 0) < rule.clumpThreshold) continue;
      const weight = cellWeight(weights[tc] ?? 0, waterCurve, env.waterDistance[pi] ?? 0);
      if (weight === 0) continue;
      const chance = Math.min(1000, Math.floor((weight * 1000) / boost));
      out[pi] = chance;
      total += chance;
    }
  }
  const cap = rule.maxShareCells * 1000;
  if (rule.maxShareCells > 0 && total > cap) {
    for (let pi = 0; pi < PLACEMENT_CELLS; pi++) out[pi] = Math.floor(((out[pi] ?? 0) * cap) / total);
  }
  return out;
}

/** 2차맵 하나의 엄폐 값·소품 그림 */
export function placeProps(input: PlacementInput): Placement {
  const { values, map, nb, heightsCm, surface, biome, rules } = input;
  if (
    rules.biomeIds.length !== values.biomeIds.length ||
    rules.biomeIds.some((id, index) => id !== values.biomeIds[index])
  ) {
    throw new RangeError("prop rules were compiled for a different biome table");
  }
  // 지형 칸: 높이 차, 물 칸, 지형만으로 설 수 있는가(벼랑·물이 아님)
  const relief = new Int32Array(TERRAIN_CELLS);
  const waterCell = new Uint8Array(TERRAIN_CELLS);
  const terrainOpen = new Uint8Array(TERRAIN_CELLS);
  for (let r = 0; r < SM_TERRAIN; r++) {
    for (let c = 0; c < SM_TERRAIN; c++) {
      const top = r * SM_VERTICES + c;
      const a = heightsCm[top] ?? 0;
      const b = heightsCm[top + 1] ?? 0;
      const d = heightsCm[top + SM_VERTICES] ?? 0;
      const e = heightsCm[top + SM_VERTICES + 1] ?? 0;
      const tc = r * SM_TERRAIN + c;
      relief[tc] = Math.max(a, b, d, e) - Math.min(a, b, d, e);
      const kind = surface[tc] ?? 0;
      waterCell[tc] = isWaterSurface(kind) ? 1 : 0;
      terrainOpen[tc] = kind !== SM_SURFACE.water && (relief[tc] ?? 0) < SM_CLIFF_RELIEF_CM ? 1 : 0;
    }
  }
  const waterDistance = waterDistances(surface);
  const env = buildEnvironment(input, waterDistance, relief);
  const forestDensity = terrainCellNet(nb, (cell) => values.forest[cell] ?? 0);
  const forestNoise = placementNoise(map, FOREST_BLOB_K, layerSalt(values.seed, LAYER_FOREST));
  const lane = laneMask(map, values.seed);
  const hashes = cellHashes(input);
  const picker = forestPicker(rules, env, biome);
  const cover = new Uint8Array(PLACEMENT_CELLS);
  const art = new Uint8Array(PLACEMENT_CELLS);

  // 숲
  for (let py = 0; py < SM_PLACEMENT; py++) {
    for (let px = 0; px < SM_PLACEMENT; px++) {
      const tc = terrainOf(px, py);
      const pi = py * SM_PLACEMENT + px;
      if (waterCell[tc] === 1 || (waterDistance[pi] ?? 0) < FOREST_SHORE_GAP) continue;
      const density = Math.max(0, forestDensity[tc] ?? 0);
      if (density === 0) continue;
      const u = permille(forestNoise[pi] ?? 0);
      const dense = Math.floor((density * FOREST_DENSE_FULL) / 255);
      const sparse = dense + Math.floor((density * FOREST_SPARSE_FULL) / 255);
      if (u >= sparse) continue;
      cover[pi] = u < dense && lane[pi] !== 1 ? 2 : 1;
      art[pi] = forestArt(picker, biome[tc] ?? 0, tc, waterDistance[pi] ?? 0, hashes[pi] ?? 0);
    }
  }

  // 흩기 소품: 이 2차맵의 바이옴에 비중이 있는 것만
  const present = new Set(biome);
  const active = rules.scatter.filter((rule) => [...present].some((b) => (rule.biomeWeight[b] ?? 0) > 0));
  const chances = active.map((rule) => scatterChances(input, rule, env, waterCell));
  for (let pi = 0; pi < PLACEMENT_CELLS; pi++) {
    if (cover[pi] !== 0 || art[pi] !== 0) continue;
    for (let k = 0; k < active.length; k++) {
      const rule = active[k];
      const chance = chances[k]?.[pi] ?? 0;
      if (!rule || chance === 0 || (rule.cover === 2 && lane[pi] === 1)) continue;
      if (mix32(((hashes[pi] ?? 0) ^ rule.salt) >>> 0) % 1000 < chance) {
        cover[pi] = rule.cover;
        art[pi] = rule.art;
        break;
      }
    }
  }

  // 갇힌 곳 잇기(크기 등급 1 = 배치 칸 하나, 대각선은 양옆이 열려야 해서 네 방향 이어짐과 같다)
  const open = new Uint8Array(PLACEMENT_CELLS);
  for (let py = 0; py < SM_PLACEMENT; py++) {
    for (let px = 0; px < SM_PLACEMENT; px++)
      open[py * SM_PLACEMENT + px] = terrainOpen[terrainOf(px, py)] ?? 0;
  }
  connectPockets(open, cover);
  return { cover, art };
}
