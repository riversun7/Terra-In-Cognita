// 생성 1단계: 판 구조 → 기본 고도 (ADR 31 순서, ADR 36 "생성기 1판")
// - 무늬 공간: 판·대륙·노이즈는 행성 격자를 돌린 좌표에서 계산한다. 후보 회전 중 정육면체 꼭짓점 8곳이 가장
//   바다다운(대륙성 값이 낮은) 것을 고른다(PLAN 5.2 "행성을 회전시켜 꼭짓점을 바다에"). 기후는 돌리지 않은 좌표(z = 자전축).
// - 판: 구면 보로노이(무게 있는 최근접 중심, 점 위치를 노이즈로 흔들어 경계를 구불구불하게).
// - 지각: 낮은 주파수 fBm + 판마다 치우침 → 면적 백분위로 대륙 지각(육지 + 대륙붕)을 정한다.
// - 판 경계: 두 판의 상대 속도(오일러 극 회전)를 경계 법선에 비춰 수렴·발산을 보고, 지각 종류로
//   충돌 산맥·안데스형 산맥·해구·섬 호·열곡을 정한다. 발산하는 바다 경계는 해령(바다 깊이가 해령에서 멀수록 깊어짐).
// - 열점: 판 이동 반대 방향으로 이어지는 화산 사슬(사슬마다 길이·간격·굽음이 다르다, hotspots.ts).
// - 지형 틀(출력 판 3, 다양성 고침 3단계, landforms.ts): 대륙 안쪽 고원·분지, 해수면 근처 해안 잔 모양, 경계를 따라
//   바뀌는 산맥 단면. 산맥 무늬·섬 호 끊김·경계를 따라 바뀌는 세기는 노이즈 2판(격자점에서 꺼지지 않음)으로 바꿨다.
//   판 흔들기·대륙성·기복은 1판 노이즈 그대로다(같은 시드는 같은 판·대륙 배치).
// 높이는 실제 환산 m(해수면을 정하기 전 절대값)이다. 거리는 구 위 각도(라디안)라 해상도와 무관하다.
import { detExp } from "@terra/shared";
import type { PlanetSettings } from "@terra/shared";
import { CUBE_CORNERS } from "../corners.ts";
import {
  FEATURE_ANDEAN,
  FEATURE_COLLISION,
  FEATURE_ISLAND_ARC,
  FEATURE_KINDS,
  FEATURE_RIFT,
  FEATURE_TRENCH,
  blendBoundaryFeatures,
} from "./boundaries.ts";
import { type PlanetGrid, areaOf, neighbors8 } from "./grid.ts";
import { addVolcanoes, hotspotVolcanoes } from "./hotspots.ts";
import {
  MOUNTAIN_FRONT_WIGGLE,
  alongStrength,
  hillOctaves,
  hillRelief,
  inlandWeight,
  interiorRelief,
  mountainShape,
  roughenCoasts,
  softenPeaks,
} from "./landforms.ts";
import { NOISE_JITTER, type NoiseSetup, fbm3, octavesFor, offsetFbm3, offsetRidged3 } from "./noise.ts";
import {
  CONTINENT_FREQUENCY,
  CONTINENT_OCTAVES,
  chooseRotation,
  createPlates,
  plateAt,
  plateOf,
  plateVelocity,
  rotate,
} from "./plates.ts";
import { distanceField } from "./queues.ts";
import {
  STREAM_COAST,
  STREAM_CONTINENTS,
  STREAM_MOUNTAINS,
  STREAM_PLATE_WARP,
  STREAM_RELIEF,
  STREAM_RELIEF_DETAIL,
  streamSeed,
} from "./random.ts";
import { areaPercentile, km, smoothstep } from "./util.ts";

/** 이 수렴·발산 속도에서 경계 지형이 최대 세기(1)가 된다. 판 각속도는 0.25~1 */
const CONVERGENCE_REFERENCE = 0.55;
/** 경계 지형이 미치는 거리 상한 */
const BOUNDARY_REACH = km(700);
/**
 * 꼭짓점 둘레에서 대륙 지각을 조금 밀어내는 반경(라디안, 약 220km)과 세기 — 회전으로도 꼭짓점이 땅에 걸릴 때(초대륙 등)
 * 작은 내해가 되게 하는 안전망. 세게 밀면 둥근 깊은 구멍이 생긴다
 */
const CORNER_PUSH_RADIUS = 0.035;
const CORNER_PUSH = 0.3;
/** 산맥 단면 노이즈 시드: streamSeed(시드, STREAM_MOUNTAINS) + 이 값(무늬 0, 경계 세기 7, 섬 호 11) */
const MOUNTAIN_SHAPE_SEED_OFFSET = 3;
/** 산맥 무늬: 능선 노이즈 2판, 주파수 7, 해상도에 맞게 6옥타브까지 */
const MOUNTAIN_TEXTURE_NOISE: NoiseSetup = {
  name: "mountain texture",
  frequency: 7,
  octaves: 6,
  gain: 0.55,
  jitter: NOISE_JITTER,
  kind: "ridged",
};
/** 섬 호 끊김: 주파수 16, 2옥타브 */
const ARC_BREAK_NOISE: NoiseSetup = {
  name: "island-arc breaks",
  frequency: 16,
  octaves: 2,
  gain: 0.5,
  jitter: NOISE_JITTER,
  kind: "fbm",
};
/** 이 파일의 노이즈 2판 설정(반복 검사 "노이즈 격자점"이 잰다) */
export const TECTONIC_NOISES: readonly NoiseSetup[] = [MOUNTAIN_TEXTURE_NOISE, ARC_BREAK_NOISE];
/** 안데스형 혹 중심·충돌 산맥 폭(단면 채널 0)과 혹 폭(채널 1)이 바뀌는 비율(표준편차 1당) */
const ANDEAN_CENTRE_VARIATION = 0.35;
const ANDEAN_WIDTH_VARIATION = 0.3;
const COLLISION_WIDTH_VARIATION = 0.3;

export interface Tectonics {
  /** 칸마다 판 번호 */
  readonly plate: Uint8Array;
  /** 대륙 지각이면 1 */
  readonly continental: Uint8Array;
  /** 기본 고도(실제 환산 m, 해수면 전 절대값) */
  readonly elevation: Float32Array;
}

/** 해안선 흔들기 전의 판 구조 높이와 무늬 공간 좌표(tectonicRelief). 시험이 해안선 흔들기를 따로 본다 */
export interface TectonicRelief extends Tectonics {
  readonly sx: Float64Array;
  readonly sy: Float64Array;
  readonly sz: Float64Array;
}

/** 꼭짓점 8곳 주변을 바다로 두려는 치우침(0 ~ 1): 꼭짓점에서 가까울수록 크다. (x, y, z)는 격자 좌표 */
function cornerProximity(x: number, y: number, z: number, radius: number): number {
  let best = 0;
  for (const corner of CUBE_CORNERS) {
    const [sx, sy, sz] = corner.axisSigns;
    best = Math.max(best, (sx * x + sy * y + sz * z) / Math.sqrt(3));
  }
  // 현 길이² = 2 − 2·cos
  return detExp(-(2 - 2 * best) / (radius * radius));
}

/** 0에서 1로 올라갔다 내려오는 매끈한 혹: 가운데 center, 반폭 halfWidth (밖은 0) */
function bump(d: number, center: number, halfWidth: number): number {
  const t = (d - center) / halfWidth;
  if (t <= -1 || t >= 1) return 0;
  const s = 1 - t * t;
  return s * s;
}

/**
 * 판 구조 → 기본 고도. 판 구조 높이(tectonicRelief) → 봉우리 다듬기 → 해안선 흔들기 순서다. 해안선 흔들기는 끝에서
 * 해수면 백분위를 다시 재므로(landforms.ts) 그 뒤에 높이를 바꾸지 않는다(바다 판정 classifyOcean이 같은 높이를 받게)
 */
export function buildTectonics(grid: PlanetGrid, seed: number, settings: PlanetSettings): Tectonics {
  const relief = tectonicRelief(grid, seed, settings);
  const { elevation } = relief;
  softenPeaks(elevation);
  roughenCoasts(
    grid,
    streamSeed(seed, STREAM_COAST),
    relief.sx,
    relief.sy,
    relief.sz,
    elevation,
    settings.landPercent,
    settings.ruggednessPercent / 100,
  );
  return { plate: relief.plate, continental: relief.continental, elevation };
}

/**
 * 판 구조 높이: 판·지각·판 경계 지형·안쪽 고원·분지·구릉·열점까지(봉우리 다듬기·해안선 흔들기 전).
 * 함수가 끝나면 거리장 같은 큰 중간 배열이 풀린다(해안선 흔들기가 메모리를 더 쓴다)
 */
export function tectonicRelief(grid: PlanetGrid, seed: number, settings: PlanetSettings): TectonicRelief {
  const count = grid.cellCount;
  const continentalShare = Math.min(0.97, (settings.landPercent + settings.shelfPercent) / 100);
  const plates = createPlates(seed, settings.plateCount, continentalShare);
  const warpSeed = streamSeed(seed, STREAM_PLATE_WARP);
  const continentSeed = streamSeed(seed, STREAM_CONTINENTS);
  const uplift = settings.upliftPercent / 100;
  const rugged = settings.ruggednessPercent / 100;
  const volcanism = settings.volcanismPercent / 100;

  // 무늬 공간 좌표(격자를 돌린 것). 이웃·면적·거리는 회전과 무관하다
  const rotation = chooseRotation(seed, plates, warpSeed, continentSeed);
  const sx = new Float64Array(count);
  const sy = new Float64Array(count);
  const sz = new Float64Array(count);
  for (let c = 0; c < count; c++) {
    const [x, y, z] = rotate(rotation, grid.x[c] ?? 0, grid.y[c] ?? 0, grid.z[c] ?? 0);
    sx[c] = x;
    sy[c] = y;
    sz[c] = z;
  }
  const plate = new Uint8Array(count);
  for (let c = 0; c < count; c++) plate[c] = plateAt(plates, warpSeed, sx[c] ?? 0, sy[c] ?? 0, sz[c] ?? 0);

  // ── 지각: 대륙성 값 → 면적 백분위로 대륙 지각 ──
  const continentOctaves = Math.min(
    CONTINENT_OCTAVES,
    octavesFor(CONTINENT_FREQUENCY, grid.meanCellAngle, 6),
  );
  const continentality = new Float32Array(count);
  for (let c = 0; c < count; c++) {
    const noise = fbm3(
      continentSeed,
      sx[c] ?? 0,
      sy[c] ?? 0,
      sz[c] ?? 0,
      CONTINENT_FREQUENCY,
      continentOctaves,
      0.55,
    );
    const bias = plateOf(plates, plate[c] ?? 0).bias;
    const push =
      CORNER_PUSH * cornerProximity(grid.x[c] ?? 0, grid.y[c] ?? 0, grid.z[c] ?? 0, CORNER_PUSH_RADIUS);
    continentality[c] = noise + bias - push;
  }
  const threshold = areaPercentile(grid, continentality, 1 - continentalShare);
  const continental = new Uint8Array(count);
  for (let c = 0; c < count; c++) continental[c] = (continentality[c] ?? 0) > threshold ? 1 : 0;
  // 대륙 칸 안에서 대륙성 값의 면적 순위(0 = 지각 가장자리, 1 = 가장 안쪽)
  const rank = continentalRank(grid, continentality, continental);

  // ── 판 경계: 경계 칸마다 지형 종류 하나와 세기 ──
  const feature = new Uint8Array(count);
  const strength = new Float32Array(count);
  const ridge = new Uint8Array(count);
  const out = new Int32Array(8);
  for (let c = 0; c < count; c++) {
    const own = plate[c] ?? 0;
    neighbors8(grid, c, out);
    let other = -1;
    for (let k = 0; k < 8; k++) {
      const next = out[k] ?? -1;
      if (next >= 0 && plate[next] !== own) {
        other = next;
        break;
      }
    }
    if (other < 0) continue;
    const a = plateOf(plates, own);
    const b = plateOf(plates, plate[other] ?? 0);
    const px = sx[c] ?? 0;
    const py = sy[c] ?? 0;
    const pz = sz[c] ?? 0;
    // 경계 법선: 두 중심의 차이를 접평면에 비춘 방향 (a → b)
    let nx = b.center[0] - a.center[0];
    let ny = b.center[1] - a.center[1];
    let nz = b.center[2] - a.center[2];
    const along = nx * px + ny * py + nz * pz;
    nx -= along * px;
    ny -= along * py;
    nz -= along * pz;
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (length < 1e-9) continue;
    const [ax, ay, az] = plateVelocity(a, px, py, pz);
    const [bx, by, bz] = plateVelocity(b, px, py, pz);
    const convergence = ((ax - bx) * nx + (ay - by) * ny + (az - bz) * nz) / length;
    const ownContinental = continental[c] === 1;
    const otherContinental = continental[other] === 1;
    strength[c] = Math.min(1.5, Math.abs(convergence) / CONVERGENCE_REFERENCE);
    if (convergence > 0) {
      if (ownContinental && otherContinental) feature[c] = FEATURE_COLLISION;
      else if (ownContinental) feature[c] = FEATURE_ANDEAN;
      else if (otherContinental) feature[c] = FEATURE_TRENCH;
      else feature[c] = a.density >= b.density ? FEATURE_TRENCH : FEATURE_ISLAND_ARC;
    } else if (ownContinental && otherContinental) {
      feature[c] = FEATURE_RIFT;
    } else if (!ownContinental) {
      ridge[c] = 1;
    }
  }
  const mix = blendBoundaryFeatures(grid, plate, feature, strength);
  const boundary = distanceField(
    grid,
    (c) => (mix.slot[c] ?? -1) >= 0,
    BOUNDARY_REACH,
    (from, to) => plate[from] === plate[to],
  );
  const ridgeDistance = distanceField(
    grid,
    (c) => ridge[c] === 1,
    km(2800),
    (_from, to) => continental[to] === 0,
  );
  const shelfDistance = distanceField(
    grid,
    (c) => continental[c] === 1,
    km(260),
    (_from, to) => continental[to] === 0,
  );

  // ── 고도 합치기 ──
  const elevation = new Float32Array(count);
  const reliefSeed = streamSeed(seed, STREAM_RELIEF);
  const mountainSeed = streamSeed(seed, STREAM_MOUNTAINS);
  const highlandSeed = streamSeed(seed, STREAM_RELIEF_DETAIL);
  const reliefOctaves = octavesFor(5, grid.meanCellAngle, 8);
  const texture = MOUNTAIN_TEXTURE_NOISE;
  const arcNoise = ARC_BREAK_NOISE;
  const ridgeOctaves = octavesFor(texture.frequency, grid.meanCellAngle, texture.octaves);
  const hills = hillOctaves(grid.meanCellAngle);
  const halfCell = grid.meanCellAngle / 2;
  const shelfRank = settings.shelfPercent / Math.max(1, settings.landPercent + settings.shelfPercent);
  const shape = new Float64Array(2);
  for (let c = 0; c < count; c++) {
    const x = sx[c] ?? 0;
    const y = sy[c] ?? 0;
    const z = sz[c] ?? 0;
    let h: number;
    if (continental[c] === 1) {
      const r = rank[c] ?? 0;
      if (r < shelfRank) {
        h = -180 * (1 - r / shelfRank);
      } else {
        const t = (r - shelfRank) / (1 - shelfRank);
        h = 900 * t * Math.sqrt(t);
      }
      h += rugged * (200 + 0.25 * Math.max(0, h)) * fbm3(reliefSeed, x, y, z, 5, reliefOctaves, 0.52);
      // 지형 틀: 안쪽 고원·분지(안쪽 칸에서만 노이즈를 계산한다)
      const inland = inlandWeight(r, shelfRank);
      if (inland > 0) {
        const polarZ = grid.z[c] ?? 0;
        const highland = interiorRelief(highlandSeed, x, y, z, polarZ);
        h += rugged * inland * (highland + hillRelief(highlandSeed, x, y, z, hills, polarZ));
      }
    } else {
      const age = Math.min(1, (ridgeDistance.angle[c] ?? 0) / km(2800));
      const floor = -2500 - 3000 * Math.sqrt(age);
      const slope = smoothstep(0, km(220), shelfDistance.angle[c] ?? 0);
      h = -350 + (floor + 350) * slope;
      h += rugged * 220 * fbm3(reliefSeed, x, y, z, 5, reliefOctaves, 0.5);
    }
    const source = boundary.source[c] ?? -1;
    const slot = source >= 0 ? (mix.slot[source] ?? -1) : -1;
    if (slot >= 0) {
      // 단면이 경계를 따라 바뀐다: 채널 0 → 안데스형 혹 중심·충돌 산맥 폭, 채널 1 → 앞면 위치·혹 폭
      mountainShape(mountainSeed + MOUNTAIN_SHAPE_SEED_OFFSET, x, y, z, shape);
      const q0 = shape[0] ?? 0;
      const q1 = shape[1] ?? 0;
      const d = Math.max(0, (boundary.angle[c] ?? 0) + halfCell + MOUNTAIN_FRONT_WIGGLE * q1);
      // 경계를 따라 세기가 바뀐다(낮은 주파수): 높은 구간과 낮은 구간
      const along = alongStrength(mountainSeed + 7, x, y, z);
      const ridges =
        0.45 +
        1.1 *
          offsetRidged3(mountainSeed, x, y, z, texture.frequency, ridgeOctaves, texture.gain, texture.jitter);
      const at = slot * FEATURE_KINDS;
      const collision = (mix.weight[at] ?? 0) * along;
      const andean = (mix.weight[at + 1] ?? 0) * along;
      const trench = (mix.weight[at + 2] ?? 0) * along;
      const arc = (mix.weight[at + 3] ?? 0) * along;
      const rift = (mix.weight[at + 4] ?? 0) * along;
      if (collision > 0) {
        const width = 1 + COLLISION_WIDTH_VARIATION * q0;
        h += uplift * 4200 * collision * ridges * (1 - smoothstep(km(130) * width, km(480) * width, d));
      }
      if (andean > 0) {
        const centre = km(150) * (1 + ANDEAN_CENTRE_VARIATION * q0);
        h += uplift * 3800 * andean * ridges * bump(d, centre, km(160) * (1 + ANDEAN_WIDTH_VARIATION * q1));
        // 화산 줄은 주 산줄기보다 40km 안쪽
        h += volcanism * 900 * andean * ridges * bump(d, centre + km(40), km(60));
      }
      if (trench > 0) h -= uplift * 3600 * trench * bump(d, km(30), km(80));
      if (arc > 0) {
        // 섬 호는 이어진 벽이 아니라 섬 사슬이다: 짧은 파장 노이즈로 끊는다
        const breaks = offsetFbm3(
          mountainSeed + 11,
          x,
          y,
          z,
          arcNoise.frequency,
          arcNoise.octaves,
          arcNoise.gain,
          arcNoise.jitter,
        );
        const islands = Math.min(1, Math.max(0, 3 * (breaks + 0.12)));
        h += volcanism * 3900 * arc * ridges * islands * bump(d, km(160), km(75));
      }
      if (rift > 0) h -= uplift * 1700 * rift * bump(d, 0, km(90));
    }
    elevation[c] = h;
  }
  const hotspots = hotspotVolcanoes(
    seed,
    plates,
    warpSeed,
    settings.hotspotCount,
    volcanism,
    (x, y, z, owner) => {
      const noise = fbm3(continentSeed, x, y, z, CONTINENT_FREQUENCY, continentOctaves, 0.55);
      return noise + plateOf(plates, owner).bias > threshold;
    },
  );
  addVolcanoes(grid, sx, sy, sz, elevation, hotspots);
  return { plate, continental, elevation, sx, sy, sz };
}

/** 대륙 칸마다 대륙성 값의 면적 순위(0 ~ 1). 4096칸 히스토그램의 누적 면적으로 정한다(정렬 없이, 결정적) */
function continentalRank(grid: PlanetGrid, value: Float32Array, continental: Uint8Array): Float32Array {
  const rank = new Float32Array(grid.cellCount);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let c = 0; c < grid.cellCount; c++) {
    if (continental[c] !== 1) continue;
    min = Math.min(min, value[c] ?? 0);
    max = Math.max(max, value[c] ?? 0);
  }
  if (!(max > min)) return rank;
  const bins = 4096;
  const cumulative = new Float64Array(bins + 1);
  const binOf = (v: number) => Math.min(bins - 1, Math.floor(((v - min) / (max - min)) * bins));
  let total = 0;
  for (let c = 0; c < grid.cellCount; c++) {
    if (continental[c] !== 1) continue;
    const area = areaOf(grid, c);
    const bin = binOf(value[c] ?? 0) + 1;
    cumulative[bin] = (cumulative[bin] ?? 0) + area;
    total += area;
  }
  // 누적: cumulative[b] = b번 칸보다 낮은 칸들의 면적
  for (let b = 1; b <= bins; b++) cumulative[b] = (cumulative[b] ?? 0) + (cumulative[b - 1] ?? 0);
  for (let c = 0; c < grid.cellCount; c++) {
    if (continental[c] !== 1) continue;
    const v = value[c] ?? 0;
    const b = binOf(v);
    const below = cumulative[b] ?? 0;
    const inside = (cumulative[b + 1] ?? 0) - below;
    const fraction = ((v - min) / (max - min)) * bins - b;
    rank[c] = (below + inside * Math.min(1, Math.max(0, fraction))) / total;
  }
  return rank;
}
