// 돌림판 조작(극축 고정) — 순수 함수(시험 대상, three.js를 쓰지 않는다). 사용자 요청 2026-11-07 "1차맵에서 행성 회전이 극지방 축이
// 어느정도 고정되었으면 좋을듯"(ADR 2026-11-07-planet-view 4절).
// 상태 모양은 GlobeState(globeCamera.ts) 그대로다. 돌림판 상태 = 화면 위쪽이 늘 북쪽(방위 0)이고 목표점 위도가 ±최대 위도 안이다.
// - 가로로 끌면 극축(+z) 둘레로 돈다(경도). 세로로 끌면 목표점이 자오선을 따라 오르내린다(위도, 묶음 안). 북극은 늘 화면 위쪽이다.
// - 손가락 아래 땅이 손가락을 따라오게 푼다:
//   (1) 카메라 오른쪽 축(= 목표점의 동쪽, 수평) 둘레로 돌려 잡은 땅의 z(= sin 위도)를 맞춘다. 회전 뒤 z = A·cos δ + B·sin δ라 닫힌 식으로 푼다.
//       이 회전은 목표점을 자오선 위에서만 옮기므로 화면 위쪽이 그대로 북쪽이다(목표점 위도 = 위도 − δ).
//   (2) 극축 둘레로 돌려 경도를 맞춘다. 극축 회전은 z를 바꾸지 않으므로 (1)에서 맞춘 위도가 남는다.
//   위도 묶음에 걸리면 (1)을 묶음까지만 한다(그때는 손가락이 땅 위에서 미끄러진다). 시선이 구를 비켜 가도 가장 가까운 점으로 이어진다.
// - 놓았을 때 관성: 끄는 동안의 경도·위도 빠르기를 지수로 줄이며 이어 간다(flingStep). 동작 줄이기면 엔진이 쓰지 않는다.
import {
  type GlobeLimits,
  type GlobeState,
  type ScreenPoint,
  type Viewport,
  clampGlobe,
  directionOfLatLon,
  fallbackForward,
  globePose,
  grabDirection,
  latLonOf,
} from "./globeCamera.ts";
import { type Vec3, cross, rotateAround } from "./vec3.ts";

const DEG = Math.PI / 180;
/** 목표점 위도 묶음(°): 극 가까이까지 보되 극 위로 넘어가 화면이 뒤집히지 않게 */
export const TURNTABLE_MAX_LAT_DEG = 80;
/** 관성: 빠르기가 1/e로 주는 시간(ms) */
export const FLING_DECAY_MS = 325;
/** 관성 멈춤: 이보다 느리면(rad/ms) 멈춘다 */
const FLING_STOP = 2e-6;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** 각을 (−π, π]로 */
export function wrapAngle(angle: number): number {
  const turn = 2 * Math.PI;
  const wrapped = angle - turn * Math.floor((angle + Math.PI) / turn);
  return wrapped <= -Math.PI ? wrapped + turn : wrapped;
}

/** 위도·경도(rad)에서 돌림판 상태(방위 0)를 만든다. 위도는 묶는다 */
function placed(state: GlobeState, latRad: number, lonRad: number, maxLatRad: number): GlobeState {
  const lat = clamp(latRad, -maxLatRad, maxLatRad);
  const target = directionOfLatLon(lat / DEG, lonRad / DEG);
  return { ...state, target, forward: fallbackForward(target) };
}

/** 목표점 위도·경도(rad) */
function latLonRad(target: Vec3): { lat: number; lon: number } {
  const { latDeg, lonDeg } = latLonOf(target);
  return { lat: latDeg * DEG, lon: lonDeg * DEG };
}

/** 돌림판 상태로 맞춘다: 화면 위쪽 = 북쪽, 목표점 위도는 ±maxLatDeg 안, 거리는 한계 안 */
export function uprightGlobe(
  state: GlobeState,
  limits: GlobeLimits,
  maxLatDeg = TURNTABLE_MAX_LAT_DEG,
): GlobeState {
  const clamped = clampGlobe(state, limits);
  const { lat, lon } = latLonRad(clamped.target);
  return placed(clamped, lat, lon, maxLatDeg * DEG);
}

/** 극축 둘레로 돌린다(동쪽 +): 경도 + angle. 위도·방위는 그대로 */
export function spinGlobe(state: GlobeState, angle: number): GlobeState {
  const axis: Vec3 = [0, 0, 1];
  return {
    ...state,
    target: rotateAround(state.target, axis, angle),
    forward: rotateAround(state.forward, axis, angle),
  };
}

/** 목표점 위도를 angle만큼 옮긴다(북쪽 +, 묶음 안). 경도·방위는 그대로 */
export function tiltGlobe(state: GlobeState, angle: number, maxLatDeg = TURNTABLE_MAX_LAT_DEG): GlobeState {
  const { lat, lon } = latLonRad(state.target);
  return placed(state, lat + angle, lon, maxLatDeg * DEG);
}

/** A·cos δ + B·sin δ = c를 푼다(작은 |δ| 쪽). 풀이가 없으면 c에 가장 가까운 δ */
function solveRotation(a: number, b: number, c: number): number {
  const r = Math.hypot(a, b);
  if (r < 1e-12) return 0;
  const phase = Math.atan2(b, a);
  const spread = Math.acos(clamp(c / r, -1, 1));
  const first = wrapAngle(phase + spread);
  const second = wrapAngle(phase - spread);
  return Math.abs(first) <= Math.abs(second) ? first : second;
}

/**
 * 돌림판 끌기: 잡은 땅(방향 anchor)이 화면 점 point 아래에 오게 한다. 결과는 늘 방위 0·위도 묶음 안이다.
 * 위도가 묶음에 걸리지 않으면 잡은 땅이 손가락을 정확히 따라간다(시선이 구에 닿을 때)
 */
export function dragTurntable(
  state: GlobeState,
  anchor: Vec3,
  point: ScreenPoint,
  radiusM: number,
  limits: GlobeLimits,
  viewport: Viewport,
  maxLatDeg = TURNTABLE_MAX_LAT_DEG,
): GlobeState {
  const maxLat = maxLatDeg * DEG;
  const upright = uprightGlobe(state, limits, maxLatDeg);
  const radius = radiusM + upright.targetHeight;
  // (1) 동쪽 축 둘레 회전 δ로 손가락 아래 땅의 z를 잡은 땅의 z에 맞춘다(목표점 위도 = 위도 − δ)
  const pose = globePose(upright, radiusM, limits);
  const now = grabDirection(pose, viewport, point, radius);
  const east = pose.right;
  const delta = solveRotation(now[2], cross(east, now)[2], anchor[2]);
  const { lat, lon } = latLonRad(upright.target);
  const tilted = placed(upright, lat - delta, lon, maxLat);
  // (2) 극축 둘레 회전으로 경도를 맞춘다(z는 그대로)
  const after = grabDirection(globePose(tilted, radiusM, limits), viewport, point, radius);
  const spin = wrapAngle(Math.atan2(anchor[1], anchor[0]) - Math.atan2(after[1], after[0]));
  return spinGlobe(tilted, spin);
}

/**
 * 돌림판 확대(두 손가락·휠): 이전 화면 점 아래 땅을 붙잡고 거리 × factor를 한 뒤 그 땅이 새 화면 점 아래 오게 끈다.
 * 두 손가락 회전은 쓰지 않는다(화면 위쪽은 늘 북쪽)
 */
export function zoomTurntable(
  state: GlobeState,
  previous: ScreenPoint,
  next: ScreenPoint,
  factor: number,
  radiusM: number,
  limits: GlobeLimits,
  viewport: Viewport,
  maxLatDeg = TURNTABLE_MAX_LAT_DEG,
): GlobeState {
  const upright = uprightGlobe(state, limits, maxLatDeg);
  const anchor = grabDirection(
    globePose(upright, radiusM, limits),
    viewport,
    previous,
    radiusM + upright.targetHeight,
  );
  const changed = clampGlobe({ ...upright, distance: upright.distance * factor }, limits);
  return dragTurntable(changed, anchor, next, radiusM, limits, viewport, maxLatDeg);
}

/** 관성 빠르기(rad/ms): 경도(동쪽 +)·위도(북쪽 +) */
export interface Fling {
  readonly lonPerMs: number;
  readonly latPerMs: number;
}

/** 두 상태 사이 경도·위도 차이(rad, 경도는 (−π, π]) — 관성 빠르기를 잴 때 쓴다 */
export function turntableDelta(from: GlobeState, to: GlobeState): { lon: number; lat: number } {
  const a = latLonRad(from.target);
  const b = latLonRad(to.target);
  return { lon: wrapAngle(b.lon - a.lon), lat: b.lat - a.lat };
}

/**
 * 관성 한 걸음: 빠르기만큼 돌리고 빠르기를 지수로 줄인다(위도 묶음에 닿으면 위도 빠르기는 0).
 * 다 줄었으면 fling = null
 */
export function flingStep(
  state: GlobeState,
  fling: Fling,
  deltaMs: number,
  maxLatDeg = TURNTABLE_MAX_LAT_DEG,
): { state: GlobeState; fling: Fling | null } {
  const dt = Math.max(0, deltaMs);
  // 이 걸음 동안 움직인 몫 = ∫ v·e^(−t/τ) dt = v·τ·(1 − e^(−dt/τ)) — 프레임 간격과 상관없이 같은 거리
  const keep = Math.exp(-dt / FLING_DECAY_MS);
  const travel = FLING_DECAY_MS * (1 - keep);
  const { lat, lon } = latLonRad(state.target);
  const maxLat = maxLatDeg * DEG;
  const nextLat = clamp(lat + fling.latPerMs * travel, -maxLat, maxLat);
  const moved = placed(state, nextLat, lon + fling.lonPerMs * travel, maxLat);
  const latPerMs = Math.abs(nextLat) >= maxLat ? 0 : fling.latPerMs * keep;
  const lonPerMs = fling.lonPerMs * keep;
  const done = Math.hypot(lonPerMs, latPerMs) < FLING_STOP;
  return { state: moved, fling: done ? null : { lonPerMs, latPerMs } };
}
