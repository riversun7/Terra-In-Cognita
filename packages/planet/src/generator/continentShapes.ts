// 대륙 배치의 꽃잎 모양(ADR 2026-10-31-continent-layouts) — continents.ts가 쓴다. 덩어리(대륙·조각) 하나는 자기 좌표
// (덩어리 중심 = 북극)의 꽃잎(타원) 몇 개다. 꽃잎 값 g = 1 − ρ(ρ = 꽃잎 중심에서 잰 현 길이 ÷ 그 방향의 현 반경: 경계 0,
// 중심 1)이고, 한 덩어리 안 꽃잎은 부드러운 최댓값으로 잇는다. 넓이는 몬테카를로 점으로 재어 배율로 맞춘다.
// 계산은 사칙연산·Math.sqrt와 @terra/shared 결정적 근사만 쓴다.
import { detAtan2, detCos, detSin } from "@terra/shared";
import { randomUnitVector, type streamRng, uniform, unitFloat } from "./random.ts";

export type Rng = ReturnType<typeof streamRng>;
export type Vec3 = [number, number, number];

/** 꽃잎 값의 바닥(먼 바다): 백분위 히스토그램 범위를 좁게 두려고 자른다 */
export const FIELD_FLOOR = -1;
/** 한 덩어리 안 꽃잎을 잇는 부드러운 최댓값의 폭(꽃잎 값 단위) */
const SMOOTH_UNION = 0.35;
/** 넓이 맞추기 몬테카를로 점 수(덩어리 하나, 둘레 원 안에 고르게) */
const AREA_SAMPLES = 2000;
/** 넓이 맞추기 배율 범위와 이분 횟수 */
const SCALE_MIN = 0.35;
export const SCALE_MAX = 2;
const SCALE_STEPS = 14;
/** 꽃잎 반경 상한(라디안): 현 반경이 2(지름)를 넘지 않게 */
export const LOBE_MAX_RADIUS = 0.9 * Math.PI;
/** 꽃잎 배열 한 줄: 중심 3, 긴 축 3, 짧은 축 3, 1/긴 현 반경², 1/짧은 현 반경², 영향 끝(중심과의 내적 하한) */
export const LOBE_STRIDE = 12;

/** 꽃잎 하나(덩어리 자기 좌표: 덩어리 중심 = 북극) */
export interface LocalLobe {
  /** 덩어리 중심에서 꽃잎 중심까지 각도와 방향(접평면 단위 벡터) */
  readonly offset: number;
  readonly dirX: number;
  readonly dirY: number;
  /** 긴 축 방향(접평면 단위 벡터)과 긴·짧은 반경(라디안) */
  readonly axisX: number;
  readonly axisY: number;
  readonly major: number;
  readonly minor: number;
}

/** 꽃잎 중심과 두 축(단위 벡터) */
export interface LobeFrame {
  readonly c: Vec3;
  readonly u: Vec3;
  readonly v: Vec3;
}

export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export function normalize(v: Vec3): Vec3 {
  const length = Math.sqrt(dot(v, v));
  return length > 0 ? [v[0] / length, v[1] / length, v[2] / length] : [0, 0, 1];
}
/** 두 단위 벡터 사이 각도(라디안) */
export const angleBetween = (a: Vec3, b: Vec3): number => {
  const c = cross(a, b);
  return detAtan2(Math.sqrt(dot(c, c)), dot(a, b));
};
/** 각도 → 현 길이 2·sin(θ/2) */
const chordOf = (angle: number): number => 2 * detSin(angle / 2);

/** 접평면 무작위 단위 벡터(원판 안 점을 뽑아 길이로 나눈다, 삼각함수 없이) */
export function randomDirection(rng: Rng): [number, number] {
  for (;;) {
    const x = 2 * unitFloat(rng) - 1;
    const y = 2 * unitFloat(rng) - 1;
    const r2 = x * x + y * y;
    if (r2 > 1e-4 && r2 <= 1) {
      const r = Math.sqrt(r2);
      return [x / r, y / r];
    }
  }
}

/** 접평면 벡터를 angle만큼 돌린다 */
export function turn(x: number, y: number, angle: number): [number, number] {
  const c = detCos(angle);
  const s = detSin(angle);
  return [c * x - s * y, s * x + c * y];
}

/** [min, max] 정수(양 끝 포함) */
export const intBetween = (rng: Rng, min: number, max: number): number =>
  min + Math.min(max - min, Math.floor((max - min + 1) * unitFloat(rng)));

/** v에 수직인 단위 벡터 하나(무작위) */
export function randomTangent(rng: Rng, v: Vec3): Vec3 {
  for (;;) {
    const r = randomUnitVector(rng);
    const along = dot(r, v);
    const t: Vec3 = [r[0] - along * v[0], r[1] - along * v[1], r[2] - along * v[2]];
    if (dot(t, t) > 1e-6) return normalize(t);
  }
}

/** 원(중심 axis, 반경 radius) 안의 고른 무작위 점 */
export function pointInCap(rng: Rng, axis: Vec3, radius: number): Vec3 {
  const lowest = detCos(Math.min(Math.PI, radius));
  const z = 1 - (1 - lowest) * unitFloat(rng);
  const ring = Math.sqrt(Math.max(0, 1 - z * z));
  const [dx, dy] = randomDirection(rng);
  const east = normalize(Math.abs(axis[2]) < 0.9 ? cross([0, 0, 1], axis) : cross([1, 0, 0], axis));
  const north = cross(axis, east);
  return normalize([
    axis[0] * z + ring * (dx * east[0] + dy * north[0]),
    axis[1] * z + ring * (dx * east[1] + dy * north[1]),
    axis[2] * z + ring * (dx * east[2] + dy * north[2]),
  ]);
}

/**
 * 대륙 하나의 꽃잎(자기 좌표). radius = 넓이가 같은 원의 반경(라디안). 가운데 꽃잎 하나와 곁 꽃잎들: 곁 꽃잎은
 * 가운데에서 0.4~0.9 반경 떨어져 바깥으로 길쭉하다(반도·팔)
 */
export function continentLobes(rng: Rng, radius: number, lobeCount: number): LocalLobe[] {
  const lobes: LocalLobe[] = [];
  // 가운데 꽃잎
  {
    const [axisX, axisY] = randomDirection(rng);
    const base = radius * uniform(rng, 0.55, 0.75);
    const stretch = Math.sqrt(uniform(rng, 1, 2));
    lobes.push({ offset: 0, dirX: 1, dirY: 0, axisX, axisY, major: base * stretch, minor: base / stretch });
  }
  for (let k = 1; k < lobeCount; k++) {
    const [dirX, dirY] = randomDirection(rng);
    const base = radius * uniform(rng, 0.3, 0.55);
    const stretch = Math.sqrt(uniform(rng, 1.2, 2.8));
    const major = base * stretch;
    const minor = base / stretch;
    // 곁 꽃잎의 긴 축은 대체로 바깥을 향한다: 방향을 ±0.5라디안 안에서 돌린다
    const [axisX, axisY] = turn(dirX, dirY, uniform(rng, -0.5, 0.5));
    // 가운데 꽃잎과 넉넉히 겹치게: 안쪽 끝이 가운데 꽃잎 짧은 반경의 70% 안에 들어오는 거리까지만 떨어뜨린다
    const centre = lobes[0];
    const limit = (centre ? 0.7 * centre.minor : 0) + 0.6 * major;
    const offset = Math.min(limit, radius * uniform(rng, 0.4, 0.9));
    lobes.push({ offset, dirX, dirY, axisX, axisY, major, minor });
  }
  return lobes;
}

/**
 * 초대륙(한 덩어리)의 꽃잎: 초승달. 꽃잎이 중심 둘레 원(반경 0.5~0.65)을 따라 200~240° 늘어서 안쪽 바다(테티스해처럼)가
 * 한쪽으로 열린다. 꽃잎 긴 축은 원의 접선 방향이다
 */
export function crescentLobes(rng: Rng, radius: number, lobeCount: number): LocalLobe[] {
  const lobes: LocalLobe[] = [];
  const [startX, startY] = randomDirection(rng);
  const span = uniform(rng, 3.5, 4.2);
  for (let k = 0; k < lobeCount; k++) {
    const along = (k / (lobeCount - 1) - 0.5) * span + uniform(rng, -0.12, 0.12);
    const [dirX, dirY] = turn(startX, startY, along);
    const offset = radius * uniform(rng, 0.5, 0.65);
    const base = radius * uniform(rng, 0.38, 0.55);
    const stretch = Math.sqrt(uniform(rng, 1, 1.8));
    const [axisX, axisY] = turn(-dirY, dirX, uniform(rng, -0.4, 0.4));
    lobes.push({ offset, dirX, dirY, axisX, axisY, major: base * stretch, minor: base / stretch });
  }
  return lobes;
}

/** 조각(섬·미소 대륙) 하나: 꽃잎 하나(가끔 둘), 넓이 share(구 대비) */
export function fragmentLobes(rng: Rng, share: number): LocalLobe[] {
  const pieces = unitFloat(rng) < 0.3 ? 2 : 1;
  const lobes: LocalLobe[] = [];
  const [dirX, dirY] = randomDirection(rng);
  for (let k = 0; k < pieces; k++) {
    const [axisX, axisY] = k === 0 ? randomDirection(rng) : turn(dirX, dirY, uniform(rng, -0.7, 0.7));
    const aspect = uniform(rng, 1, 2.5);
    // 꽃잎 넓이(구 대비) = 긴 현 × 짧은 현 ÷ 4 → 작은 각에서는 각도로도 거의 같다. 둘이면 넓이를 나눈다
    const product = (4 * share) / pieces;
    const major = Math.sqrt(product * aspect);
    const minor = Math.sqrt(product / aspect);
    lobes.push({ offset: k === 0 ? 0 : 1.2 * major, dirX, dirY, axisX, axisY, major, minor });
  }
  return lobes;
}

/** 자기 좌표 꽃잎 → 놓인 자리의 꽃잎(배율 적용): 중심, 긴 축, 짧은 축, 현 반경 */
export function placeLobe(
  lobe: LocalLobe,
  scale: number,
  centre: Vec3,
  east: Vec3,
): { c: Vec3; u: Vec3; v: Vec3; majorChord: number; minorChord: number } {
  const north = cross(centre, east);
  const toGlobal = (x: number, y: number, z: number): Vec3 => [
    east[0] * x + north[0] * y + centre[0] * z,
    east[1] * x + north[1] * y + centre[1] * z,
    east[2] * x + north[2] * y + centre[2] * z,
  ];
  const offset = lobe.offset * scale;
  const s = detSin(offset);
  const local: Vec3 = [s * lobe.dirX, s * lobe.dirY, detCos(offset)];
  // 긴 축: 자기 좌표 접평면 방향을 꽃잎 중심의 접평면에 비춘다
  const t: Vec3 = [lobe.axisX, lobe.axisY, 0];
  const along = dot(t, local);
  const u = normalize([t[0] - along * local[0], t[1] - along * local[1], t[2] - along * local[2]]);
  const v = cross(local, u);
  return {
    c: toGlobal(local[0], local[1], local[2]),
    u: toGlobal(u[0], u[1], u[2]),
    v: toGlobal(v[0], v[1], v[2]),
    majorChord: chordOf(Math.min(LOBE_MAX_RADIUS, lobe.major * scale)),
    minorChord: chordOf(Math.min(LOBE_MAX_RADIUS, lobe.minor * scale)),
  };
}

/**
 * 꽃잎 값 g = 1 − ρ. ρ² = 현² × (du²/긴 현² + dv²/짧은 현²) ÷ (du² + dv²): 중심에서 본 방향마다 현 반경이 타원이다.
 * 구 위 넓이는 현 극좌표 넓이와 같아(넓이 요소 = 현 × d현 × d방향) 꽃잎 하나의 넓이는 정확히 π × 긴 현 × 짧은 현이다
 */
export function lobeAt(lobes: Float64Array, o: number, x: number, y: number, z: number): number {
  const pc = x * (lobes[o] ?? 0) + y * (lobes[o + 1] ?? 0) + z * (lobes[o + 2] ?? 0);
  if (pc < (lobes[o + 11] ?? 0)) return FIELD_FLOOR;
  const du = x * (lobes[o + 3] ?? 0) + y * (lobes[o + 4] ?? 0) + z * (lobes[o + 5] ?? 0);
  const dv = x * (lobes[o + 6] ?? 0) + y * (lobes[o + 7] ?? 0) + z * (lobes[o + 8] ?? 0);
  const tangent = du * du + dv * dv;
  const inverseMajor2 = lobes[o + 9] ?? 0;
  const weight =
    tangent > 1e-18 ? (du * du * inverseMajor2 + dv * dv * (lobes[o + 10] ?? 0)) / tangent : inverseMajor2;
  return 1 - Math.sqrt(Math.max(0, 2 - 2 * pc) * weight);
}

/** 꽃잎 하나를 배열에 쓴다 */
export function writeLobe(target: Float64Array, index: number, lobe: ReturnType<typeof placeLobe>): void {
  const at = index * LOBE_STRIDE;
  target.set([...lobe.c, ...lobe.u, ...lobe.v], at);
  target[at + 9] = 1 / (lobe.majorChord * lobe.majorChord);
  target[at + 10] = 1 / (lobe.minorChord * lobe.minorChord);
  // 영향 끝: g > 바닥(ρ < 1 − 바닥)인 곳 = 현 < (1 − 바닥) × 긴 현 반경
  const reachChord = (1 - FIELD_FLOOR) * lobe.majorChord;
  target[at + 11] = reachChord >= 2 ? -2 : 1 - (reachChord * reachChord) / 2;
}

/** 꽃잎들의 둘레 반경(배율 적용, 흔들기 전, 라디안) */
export function lobesExtent(lobes: readonly LocalLobe[], scale: number): number {
  let extent = 0;
  for (const lobe of lobes) extent = Math.max(extent, (lobe.offset + lobe.major) * scale);
  return Math.min(Math.PI, extent);
}

/** 북극 둘레 원(반경 reach) 안의 고른 점들과 그 원의 넓이 몫 */
function capPoints(rng: Rng, reach: number, count: number): { points: Float64Array; capShare: number } {
  const lowest = detCos(reach);
  const points = new Float64Array(3 * count);
  for (let k = 0; k < count; k++) {
    const z = 1 - (1 - lowest) * unitFloat(rng);
    const ring = Math.sqrt(Math.max(0, 1 - z * z));
    const [dx, dy] = randomDirection(rng);
    points.set([ring * dx, ring * dy, z], 3 * k);
  }
  return { points, capShare: (1 - lowest) / 2 };
}

/** 꽃잎들(북극 자리)의 넓이 몫(구 대비)을 점으로 잰다 */
function massShare(
  lobes: readonly LocalLobe[],
  scale: number,
  points: Float64Array,
  capShare: number,
): number {
  const table = new Float64Array(lobes.length * LOBE_STRIDE);
  lobes.forEach((lobe, k) => writeLobe(table, k, placeLobe(lobe, scale, [0, 0, 1], [1, 0, 0])));
  let inside = 0;
  const count = points.length / 3;
  for (let k = 0; k < count; k++) {
    const x = points[3 * k] ?? 0;
    const y = points[3 * k + 1] ?? 0;
    const z = points[3 * k + 2] ?? 0;
    let value = FIELD_FLOOR;
    for (let l = 0; l < lobes.length; l++) value = smoothMax(value, lobeAt(table, l * LOBE_STRIDE, x, y, z));
    if (value >= 0) inside++;
  }
  return (capShare * inside) / count;
}

/** 꽃잎들의 넓이가 target(구 대비 몫)이 되는 배율(이분법) */
export function fitScale(rng: Rng, lobes: readonly LocalLobe[], target: number): number {
  const { points, capShare } = capPoints(rng, lobesExtent(lobes, SCALE_MAX), AREA_SAMPLES);
  let low = SCALE_MIN;
  let high = SCALE_MAX;
  for (let step = 0; step < SCALE_STEPS; step++) {
    const middle = (low + high) / 2;
    if (massShare(lobes, middle, points, capShare) < target) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

/** 넓이 share(구 대비)인 원의 반경(라디안): (1 − cos r) / 2 = share */
export function radiusOfShare(share: number): number {
  const c = Math.max(-1, 1 - 2 * share);
  return detAtan2(Math.sqrt(Math.max(0, 1 - c * c)), c);
}

/**
 * 부드러운 최댓값(다항식, 폭 SMOOTH_UNION): 두 값이 비슷한 곳에서 최댓값보다 최대 폭 ÷ 4만큼 크다. 차이가 폭 이상이면
 * 그냥 최댓값
 */
export function smoothMax(a: number, b: number): number {
  const h = Math.min(1, Math.max(0, 0.5 + (0.5 * (b - a)) / SMOOTH_UNION));
  return a + (b - a) * h + SMOOTH_UNION * h * (1 - h);
}
