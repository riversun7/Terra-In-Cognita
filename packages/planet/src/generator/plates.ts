// 판: 무작위 판(중심·회전 극·각속도·무게·대륙 치우침)과 점의 판 고르기, 무늬 공간 회전 (tectonics.ts가 쓴다)
// 거리는 구 위 각도(라디안), 난수는 단계별 시드 난수, 계산은 사칙연산과 명세가 정한 함수만 쓴다.
import { CUBE_CORNERS } from "../corners.ts";
import { fbm3 } from "./noise.ts";
import { STREAM_PLATES, STREAM_ROTATION, randomUnitVector, streamRng, uniform, unitFloat } from "./random.ts";

/** 판 경계를 흔드는 노이즈 옥타브 수(해상도와 무관하게 고정: 미리보기와 같은 판 배치) */
export const PLATE_WARP_OCTAVES = 4;
/** 대륙성 노이즈: 기본 주파수와 옥타브 상한(회전 고르기는 늘 상한으로 계산해 해상도와 무관하다) */
export const CONTINENT_FREQUENCY = 1.1;
export const CONTINENT_OCTAVES = 6;
/** 무늬 공간 회전 후보 수(0번은 회전 없음) */
export const ROTATION_CANDIDATES = 128;

export interface Plate {
  /** 보로노이 중심 */
  readonly center: readonly [number, number, number];
  /** 회전 극(단위 벡터)과 각속도(부호 = 방향) */
  readonly pole: readonly [number, number, number];
  readonly omega: number;
  /** 보로노이 무게(클수록 판이 넓다) */
  readonly weight: number;
  /** 대륙 지각 치우침 */
  readonly bias: number;
  /** 바다-바다 수렴에서 큰 쪽이 가라앉는다 */
  readonly density: number;
}

/** 판 번호 → 판 (번호가 틀리면 RangeError: 판 배열은 늘 빈틈이 없다) */
export function plateOf(plates: readonly Plate[], index: number): Plate {
  const plate = plates[index];
  if (!plate) throw new RangeError(`plate index out of range: ${index}`);
  return plate;
}

/** 3×3 회전 행렬(행 우선) */
export type Rotation = readonly [number, number, number, number, number, number, number, number, number];
const IDENTITY: Rotation = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function createPlates(seed: number, count: number, continentalShare: number): Plate[] {
  const rng = streamRng(seed, STREAM_PLATES);
  const plates: Plate[] = [];
  const order: { index: number; key: number }[] = [];
  for (let k = 0; k < count; k++) {
    const center = randomUnitVector(rng);
    const pole = randomUnitVector(rng);
    const omega = uniform(rng, 0.25, 1) * (unitFloat(rng) < 0.5 ? -1 : 1);
    const weight = uniform(rng, 0, 0.22);
    const density = unitFloat(rng);
    order.push({ index: k, key: unitFloat(rng) });
    plates.push({ center, pole, omega, weight, bias: 0, density });
  }
  // 무작위 순서로 앞쪽 판(대륙 몫만큼)이 대륙 쪽으로 치우친다
  order.sort((a, b) => a.key - b.key || a.index - b.index);
  const continentalPlates = Math.max(1, Math.round(continentalShare * count));
  return plates.map((plate, k) => {
    const rank = order.findIndex((entry) => entry.index === k);
    const strength = 0.08 + 0.1 * ((rank * 0.618_034) % 1);
    return { ...plate, bias: rank < continentalPlates ? strength : -strength };
  });
}

/**
 * 대륙 배치의 판 닻(ADR 2026-10-31-continent-layouts): 닻마다(앞에서부터, 최대 limit개) 아직 옮기지 않은 판 중 중심이
 * 가장 가까운 판의 중심을 닻으로 옮기고 보로노이 무게를 ANCHOR_WEIGHT만큼 더한다(대륙 판이 제 대륙을 덮게). 극·각속도·
 * 밀도는 그대로다(같은 시드는 같은 판 운동). anchored[판] = 1이면 닻으로 옮긴 판(대륙 판), 0이면 바다 판이다
 */
export function anchorPlates(
  plates: readonly Plate[],
  anchors: readonly (readonly [number, number, number])[],
  limit: number,
): { readonly plates: Plate[]; readonly anchored: Uint8Array } {
  const result = [...plates];
  const anchored = new Uint8Array(plates.length);
  for (const anchor of anchors.slice(0, Math.max(0, limit))) {
    let best = -1;
    let bestDot = Number.NEGATIVE_INFINITY;
    for (let k = 0; k < result.length; k++) {
      if (anchored[k] === 1) continue;
      const { center } = plateOf(result, k);
      const d = center[0] * anchor[0] + center[1] * anchor[1] + center[2] * anchor[2];
      if (d > bestDot) {
        bestDot = d;
        best = k;
      }
    }
    if (best < 0) break;
    anchored[best] = 1;
    const plate = plateOf(result, best);
    result[best] = {
      ...plate,
      center: [anchor[0], anchor[1], anchor[2]],
      weight: plate.weight + ANCHOR_WEIGHT,
    };
  }
  return { plates: result, anchored };
}

/** 대륙 판(닻으로 옮긴 판)에 더하는 보로노이 무게: 경계가 약 0.2~0.3라디안 바깥으로 물러난다 */
export const ANCHOR_WEIGHT = 0.2;

/** 판 회전에 따른 점 p의 속도(접선 벡터) = ω (극 × p) */
export function plateVelocity(plate: Plate, px: number, py: number, pz: number): [number, number, number] {
  const [ex, ey, ez] = plate.pole;
  return [
    plate.omega * (ey * pz - ez * py),
    plate.omega * (ez * px - ex * pz),
    plate.omega * (ex * py - ey * px),
  ];
}

/** 점 하나의 판: 점을 노이즈로 흔든 뒤(경계가 구불구불해진다) 무게 있는 최근접 중심 */
export function plateAt(plates: readonly Plate[], warpSeed: number, x: number, y: number, z: number): number {
  const qx = x + 0.42 * fbm3(warpSeed, x, y, z, 1.6, PLATE_WARP_OCTAVES, 0.5);
  const qy = y + 0.42 * fbm3(warpSeed + 1, x, y, z, 1.6, PLATE_WARP_OCTAVES, 0.5);
  const qz = z + 0.42 * fbm3(warpSeed + 2, x, y, z, 1.6, PLATE_WARP_OCTAVES, 0.5);
  const length = Math.sqrt(qx * qx + qy * qy + qz * qz);
  let best = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let k = 0; k < plates.length; k++) {
    const { center, weight } = plateOf(plates, k);
    const score = (qx * center[0] + qy * center[1] + qz * center[2]) / length + weight;
    if (score > bestScore) {
      bestScore = score;
      best = k;
    }
  }
  return best;
}

/**
 * 대륙 배치(ADR 2026-10-31-continent-layouts)의 판 고르기: plateAt과 같은 흔든 무게 보로노이에 "대륙 판은 땅 쪽, 바다 판은
 * 바다 쪽" 점수를 더한다. 점수 = affinity[판](+1 대륙 판 = 닻으로 옮긴 판, −1 바다 판) × PLATE_LAND_AFFINITY × clamp(land, ±1).
 * land는 그 칸의 대륙성(바다 쪽 음수, 대륙 안 양수)을 PLATE_LAND_REACH로 나눈 값이다. 그래서 대륙 판과 바다 판의 경계는
 * 해안 가까이 오면 해안으로 붙고(안데스형 산맥·해구), 대륙 판끼리·바다 판끼리의 경계는 그대로다(대륙 안 충돌대·열곡,
 * 바다 가운데 해령·섬 호). 대륙과 무관한 보로노이만 쓰면 판 경계가 해안과 거의 겹치지 않아 안데스형 산맥이 경계 칸의
 * 1% 안팎이었다(노이즈 배치 6~10%, 2026-10-31 F6 시드 3개)
 */
export function plateAtLayout(
  plates: readonly Plate[],
  warpSeed: number,
  x: number,
  y: number,
  z: number,
  affinity: Float64Array,
  land: number,
): number {
  const qx = x + 0.42 * fbm3(warpSeed, x, y, z, 1.6, PLATE_WARP_OCTAVES, 0.5);
  const qy = y + 0.42 * fbm3(warpSeed + 1, x, y, z, 1.6, PLATE_WARP_OCTAVES, 0.5);
  const qz = z + 0.42 * fbm3(warpSeed + 2, x, y, z, 1.6, PLATE_WARP_OCTAVES, 0.5);
  const length = Math.sqrt(qx * qx + qy * qy + qz * qz);
  const pull = PLATE_LAND_AFFINITY * Math.min(1, Math.max(-1, land / PLATE_LAND_REACH));
  let best = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let k = 0; k < plates.length; k++) {
    const { center, weight } = plateOf(plates, k);
    const score =
      (qx * center[0] + qy * center[1] + qz * center[2]) / length + weight + (affinity[k] ?? 0) * pull;
    if (score > bestScore) {
      bestScore = score;
      best = k;
    }
  }
  return best;
}

/** 대륙 배치 판 고르기의 땅·바다 끌림 세기(보로노이 점수 단위)와, 끌림이 다 차는 대륙성 크기 */
export const PLATE_LAND_AFFINITY = 0.25;
export const PLATE_LAND_REACH = 0.3;

/** 무작위 회전(고른 사원수 → 행렬, 삼각함수 없이). 대륙 배치(continents.ts)의 회전 고르기도 쓴다 */
export function randomRotation(rng: ReturnType<typeof streamRng>): Rotation {
  for (;;) {
    const w = 2 * unitFloat(rng) - 1;
    const x = 2 * unitFloat(rng) - 1;
    const y = 2 * unitFloat(rng) - 1;
    const z = 2 * unitFloat(rng) - 1;
    const norm = w * w + x * x + y * y + z * z;
    if (norm < 1e-4 || norm > 1) continue;
    const s = 2 / norm;
    return [
      1 - s * (y * y + z * z),
      s * (x * y - w * z),
      s * (x * z + w * y),
      s * (x * y + w * z),
      1 - s * (x * x + z * z),
      s * (y * z - w * x),
      s * (x * z - w * y),
      s * (y * z + w * x),
      1 - s * (x * x + y * y),
    ];
  }
}

/**
 * 꼭짓점이 바다에 오는 무늬 공간 회전: 후보마다 꼭짓점 8곳의 (노이즈 + 판 치우침) 최댓값을 보고 가장 작은 것.
 * 옥타브를 고정해 계산하므로 해상도(면 레벨)와 무관하게 같은 회전을 고른다.
 */
export function chooseRotation(
  seed: number,
  plates: readonly Plate[],
  warpSeed: number,
  continentSeed: number,
): Rotation {
  const rng = streamRng(seed, STREAM_ROTATION);
  let best = IDENTITY;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let candidate = 0; candidate < ROTATION_CANDIDATES; candidate++) {
    const rotation = candidate === 0 ? IDENTITY : randomRotation(rng);
    let worst = Number.NEGATIVE_INFINITY;
    for (const corner of CUBE_CORNERS) {
      const [sx, sy, sz] = corner.axisSigns;
      const [x, y, z] = rotate(rotation, sx / Math.sqrt(3), sy / Math.sqrt(3), sz / Math.sqrt(3));
      const value =
        fbm3(continentSeed, x, y, z, CONTINENT_FREQUENCY, CONTINENT_OCTAVES, 0.55) +
        plateOf(plates, plateAt(plates, warpSeed, x, y, z)).bias;
      worst = Math.max(worst, value);
    }
    if (worst < bestScore) {
      bestScore = worst;
      best = rotation;
    }
  }
  return best;
}

export function rotate(r: Rotation, x: number, y: number, z: number): [number, number, number] {
  return [r[0] * x + r[1] * y + r[2] * z, r[3] * x + r[4] * y + r[5] * z, r[6] * x + r[7] * y + r[8] * z];
}
