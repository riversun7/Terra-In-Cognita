// 지구본 카메라 계산 — 순수 함수(시험 대상, three.js를 쓰지 않는다). 모두 실수 64비트다.
// 상태: 목표점 방향(화면 가운데가 보는 땅), 화면 위쪽이 가리키는 땅 방향(forward), 목표점까지 거리, 목표점 표시 높이.
// - 기울기는 거리로 정한다: 멀면 바로 아래(0°), 가까울수록 기운다(가장 가까이 MAX_TILT). 하늘이 보이지 않는 범위다.
// - 끌기: 손가락 아래 땅이 손가락을 따라간다. 목표점 높이의 구를 잡고, 그 점이 손가락 아래 오게 행성 중심으로 카메라를 돌린다.
//   회전은 행성 중심을 지나므로 한 번에 정확히 맞는다. 극에서도 막히지 않는다(위도·경도를 쓰지 않는다).
// - 확대·회전(두 손가락, 휠): 손가락 아래 땅을 붙잡고 거리 × 배율, 방위 + 회전을 한 뒤 그 땅이 새 손가락 아래 오게 돌린다.
// 좌표: 행성 중심 원점, m. 북극 = +z(위도 = asin z), 경도 0 = +x 쪽, 동쪽 = +y 쪽.
import {
  type Vec3,
  add,
  addScaled,
  cross,
  dot,
  length,
  normalize,
  rotateAround,
  rotateFromTo,
  scale,
  sub,
} from "./vec3.ts";

export interface GlobeState {
  /** 목표점 방향(단위 벡터) */
  readonly target: Vec3;
  /** 화면 위쪽이 가리키는 땅 방향(target에 수직인 단위 벡터) */
  readonly forward: Vec3;
  /** 목표점에서 카메라까지(m) */
  readonly distance: number;
  /** 목표점의 표시 높이(m, 해수면 위) — 땅을 따라간다 */
  readonly targetHeight: number;
}

export interface GlobeLimits {
  readonly minDistance: number;
  readonly maxDistance: number;
  /** 이 거리부터 가까워지면 기울기 시작 */
  readonly tiltStartDistance: number;
  readonly maxTilt: number;
}

/** 카메라 자세: 위치와 축(세계 기준). three.js 카메라는 −back을 본다 */
export interface GlobePose {
  readonly position: Vec3;
  readonly right: Vec3;
  readonly up: Vec3;
  readonly back: Vec3;
  readonly tilt: number;
  /** 목표점(해수면 + 목표점 높이) */
  readonly targetPoint: Vec3;
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/** 화면 크기(CSS px) */
export interface Viewport {
  readonly width: number;
  readonly height: number;
}

const DEG = Math.PI / 180;
/** 세로 시야각(2차맵과 같다) */
export const GLOBE_FOV_RAD = 40 * DEG;
/** 가장 가까울 때 기울기 */
export const MAX_TILT_RAD = 40 * DEG;
/** 가장 가까이 = 가장 고운 칸 평균 변 × 이 값(지구: 약 1.5km × 8 = 12km) */
const MIN_DISTANCE_CELLS = 8;
/** 기울기 시작 = 가장 가까운 거리 × 이 값 */
const TILT_START_FACTOR = 60;
/** 가장 멀리: 행성 지름 × 이 값이 화면 짧은 변에 든다 */
const FAR_MARGIN = 1.15;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** 화면 짧은 변 방향의 반 시야각 */
export function shortHalfFov(viewport: Viewport, fov = GLOBE_FOV_RAD): number {
  const aspect = viewport.height > 0 ? viewport.width / viewport.height : 1;
  return Math.atan(Math.tan(fov / 2) * Math.min(1, aspect));
}

export function globeLimits(
  radiusM: number,
  finestCellM: number,
  viewport: Viewport,
  fov = GLOBE_FOV_RAD,
): GlobeLimits {
  const minDistance = finestCellM * MIN_DISTANCE_CELLS;
  // 행성 중심까지 거리 d에서 행성이 보이는 반각 asin(R/d)가 짧은 변 반 시야각 ÷ 여유와 같게
  const centerDistance = (radiusM * FAR_MARGIN) / Math.sin(shortHalfFov(viewport, fov));
  return {
    minDistance,
    maxDistance: Math.max(minDistance * 2, centerDistance - radiusM),
    tiltStartDistance: minDistance * TILT_START_FACTOR,
    maxTilt: MAX_TILT_RAD,
  };
}

/** 거리에 따른 기울기: 로그 거리로 부드럽게(smoothstep) */
export function tiltFor(distance: number, limits: GlobeLimits): number {
  if (distance >= limits.tiltStartDistance) return 0;
  const span = Math.log(limits.tiltStartDistance) - Math.log(limits.minDistance);
  const u = span > 0 ? clamp((Math.log(limits.tiltStartDistance) - Math.log(distance)) / span, 0, 1) : 1;
  return limits.maxTilt * u * u * (3 - 2 * u);
}

/** 방향을 다시 단위로, forward를 target에 수직으로 맞춘다(되풀이 계산의 오차 쌓임 방지) */
function orthonormal(target: Vec3, forward: Vec3): { target: Vec3; forward: Vec3 } {
  const t = normalize(target);
  let f = sub(forward, scale(t, dot(forward, t)));
  if (length(f) < 1e-9) f = fallbackForward(t);
  return { target: t, forward: normalize(f) };
}

/** 북쪽(+z를 접평면에 투영). 극이면 +x 쪽 — 돌림판 조작(turntable.ts)이 화면 위쪽으로 쓴다 */
export function fallbackForward(target: Vec3): Vec3 {
  const north = sub([0, 0, 1], scale(target, target[2]));
  if (length(north) > 1e-6) return normalize(north);
  return normalize(sub([1, 0, 0], scale(target, target[0])));
}

export function clampGlobe(state: GlobeState, limits: GlobeLimits): GlobeState {
  const { target, forward } = orthonormal(state.target, state.forward);
  return {
    target,
    forward,
    distance: clamp(state.distance, limits.minDistance, limits.maxDistance),
    targetHeight: state.targetHeight,
  };
}

/** 위도·경도(°)의 방향 */
export function directionOfLatLon(latDeg: number, lonDeg: number): Vec3 {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
}

export function latLonOf(direction: Vec3): { latDeg: number; lonDeg: number } {
  const d = normalize(direction);
  return { latDeg: Math.asin(clamp(d[2], -1, 1)) / DEG, lonDeg: Math.atan2(d[1], d[0]) / DEG };
}

/** 처음 상태: 그곳을 북쪽이 위로 보게 */
export function initialGlobe(
  latDeg: number,
  lonDeg: number,
  distance: number,
  limits: GlobeLimits,
): GlobeState {
  const target = directionOfLatLon(latDeg, lonDeg);
  return clampGlobe({ target, forward: fallbackForward(target), distance, targetHeight: 0 }, limits);
}

/** 화면 위쪽의 방위(rad, 북 0, 동 +π/2) */
export function headingOf(state: GlobeState): number {
  const north = fallbackForward(state.target);
  const east = cross(north, state.target);
  return Math.atan2(dot(state.forward, east), dot(state.forward, north));
}

export function globePose(state: GlobeState, radiusM: number, limits: GlobeLimits): GlobePose {
  const tilt = tiltFor(state.distance, limits);
  const t = state.target;
  const f = state.forward;
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const back = normalize(sub(scale(t, cos), scale(f, sin)));
  const up = normalize(add(scale(f, cos), scale(t, sin)));
  const right = cross(f, t);
  const targetPoint = scale(t, radiusM + state.targetHeight);
  return { position: addScaled(targetPoint, back, state.distance), right, up, back, tilt, targetPoint };
}

/** 화면 점(CSS px)을 지나는 시선(방향은 단위 벡터) */
export function screenRay(
  pose: GlobePose,
  viewport: Viewport,
  point: ScreenPoint,
  fov = GLOBE_FOV_RAD,
): { origin: Vec3; dir: Vec3 } {
  const tanHalf = Math.tan(fov / 2);
  const aspect = viewport.height > 0 ? viewport.width / viewport.height : 1;
  const nx = viewport.width > 0 ? (2 * point.x) / viewport.width - 1 : 0;
  const ny = viewport.height > 0 ? 1 - (2 * point.y) / viewport.height : 0;
  const dir = normalize(
    add(add(scale(pose.back, -1), scale(pose.right, nx * tanHalf * aspect)), scale(pose.up, ny * tanHalf)),
  );
  return { origin: pose.position, dir };
}

/** 세계 점 → 화면 점(CSS px). 카메라 뒤면 null */
export function projectToScreen(
  pose: GlobePose,
  viewport: Viewport,
  point: Vec3,
  fov = GLOBE_FOV_RAD,
): ScreenPoint | null {
  const v = sub(point, pose.position);
  const depth = -dot(v, pose.back);
  if (depth <= 0) return null;
  const tanHalf = Math.tan(fov / 2);
  const aspect = viewport.height > 0 ? viewport.width / viewport.height : 1;
  const nx = dot(v, pose.right) / (depth * tanHalf * aspect);
  const ny = dot(v, pose.up) / (depth * tanHalf);
  return { x: ((nx + 1) / 2) * viewport.width, y: ((1 - ny) / 2) * viewport.height };
}

/** 시선과 반지름 radius 구(중심 원점)의 가까운 교점까지 거리. 안 만나면 null */
export function raySphere(origin: Vec3, dir: Vec3, radius: number): number | null {
  const b = dot(origin, dir);
  const c = dot(origin, origin) - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const near = -b - root;
  if (near >= 0) return near;
  const far = -b + root;
  return far >= 0 ? far : null;
}

/**
 * 화면 점 아래의 땅(반지름 radius 구 위 점의 방향). 시선이 구를 비켜 가면 시선에서 구에 가장 가까운 점의 방향을 쓴다
 * (행성 밖을 끌어도 멈추지 않고 미끄러지게).
 */
export function grabDirection(
  pose: GlobePose,
  viewport: Viewport,
  point: ScreenPoint,
  radius: number,
  fov = GLOBE_FOV_RAD,
): Vec3 {
  const ray = screenRay(pose, viewport, point, fov);
  const t = raySphere(ray.origin, ray.dir, radius);
  if (t !== null) return normalize(addScaled(ray.origin, ray.dir, t));
  const closest = Math.max(0, -dot(ray.origin, ray.dir));
  return normalize(addScaled(ray.origin, ray.dir, closest));
}

/** 행성 중심으로 카메라를 돌린다: 방향 from이 to 자리에 오게(목표점·forward를 함께 돌린다) */
export function rotateGlobe(state: GlobeState, from: Vec3, to: Vec3): GlobeState {
  return {
    ...state,
    target: rotateFromTo(state.target, from, to),
    forward: rotateFromTo(state.forward, from, to),
  };
}

/** 잡은 땅(방향 anchor)이 화면 점 point 아래에 오게 한다(끌기) */
export function dragGlobe(
  state: GlobeState,
  anchor: Vec3,
  point: ScreenPoint,
  radiusM: number,
  limits: GlobeLimits,
  viewport: Viewport,
): GlobeState {
  const pose = globePose(state, radiusM, limits);
  const now = grabDirection(pose, viewport, point, radiusM + state.targetHeight);
  // 지금 손가락 아래 방향 now를 잡은 방향 anchor로 옮기는 회전 = 땅이 손가락을 따라감
  return clampGlobe(rotateGlobe(state, now, anchor), limits);
}

/** 방위만 돌린다(화면에서 시계 방향이 +: 땅이 손가락처럼 시계 방향으로 돈다) */
export function rotateHeading(state: GlobeState, angle: number): GlobeState {
  return { ...state, forward: rotateAround(state.forward, state.target, angle) };
}

/**
 * 두 손가락(또는 휠) 한 번의 변화: 이전 화면 점 아래 땅을 붙잡고, 거리 × scale, 방위 + rotation을 한 뒤
 * 그 땅이 새 화면 점 아래 오게 돌린다.
 */
export function zoomAround(
  state: GlobeState,
  previous: ScreenPoint,
  next: ScreenPoint,
  factor: number,
  rotation: number,
  radiusM: number,
  limits: GlobeLimits,
  viewport: Viewport,
): GlobeState {
  const radius = radiusM + state.targetHeight;
  const anchor = grabDirection(globePose(state, radiusM, limits), viewport, previous, radius);
  const changed = clampGlobe(
    rotateHeading({ ...state, distance: state.distance * factor }, rotation),
    limits,
  );
  return dragGlobe(changed, anchor, next, radiusM, limits, viewport);
}
