// 쿼터뷰 카메라 계산 — 순수 함수(시험 대상). three.js를 쓰지 않는다. ADR 2026-10-28-s1-second-map "카메라와 조작"
// - 기울기(pitch)는 약 35~55°(기본 45°)로 묶어 지평선이 보이지 않게 한다. 회전(yaw)은 자유다.
//   가까이 볼 때(확대 5단계 근처)는 그린 기울기를 더 눕혀(기본 45° → 30°) 먼 곳까지 보이게 한다. 화면 위 끝 시선은 늘 수평 아래
//   VIEW_HORIZON_MARGIN_RAD 이상이라 지평선은 여전히 보이지 않는다(사용자 지적 2026-11-09 "확대하면 주변이 더 안 보인다",
//   docs/adr/2026-10-28-s1-second-map.md "바뀜 (2026-11-09)"). 사용자가 고른 기울기(basePitch)와 그린 기울기(pitch)를 나눠 둔다.
// - 확대: 근접(화면 짧은 변이 약 40m)부터 2차맵 전체가 보이는 거리까지. 화면 가로가 짧은 휴대폰(세로)에서는 가로가 40m다.
// - 이동: 목표점(화면 가운데가 보는 땅)이 2차맵 안에 머문다. 보기 범위(area, 원 여러 개)가 있으면 그 원들 가운데 하나 안에 머문다
//   (플레이어 카메라는 내 유닛·건물 둘레만 — 기획 정리 630, docs/adr/2026-11-07-unit-control.md "바뀜 (기획 답 630~637)").
// - 잡아 끌기: 손가락 아래 땅이 손가락을 따라간다(높이 targetY인 평면 기준). 확대·회전도 손가락 아래 땅을 붙잡고 한다.
// 좌표: x 동쪽, z 남쪽, y 위(m). yaw 0이면 카메라가 목표의 남쪽에서 북쪽을 본다(화면 위 = 북쪽).

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface GroundPoint {
  x: number;
  z: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface CameraState {
  /** 목표점(화면 가운데가 보는 땅) */
  targetX: number;
  targetY: number;
  targetZ: number;
  /** 방위(rad) */
  yaw: number;
  /** 그린 기울기 = 내려다보는 각(rad, 수평 0). clampCamera·withViewPitch가 basePitch와 거리로 정한다 — 시선 계산은 모두 이 값을 쓴다 */
  pitch: number;
  /** 사용자가 고른 기울기(rad, 먼 확대 기준, 35~55°). 없으면 pitch를 그 값으로 본다 */
  basePitch?: number;
  /** 목표점까지 거리(m) */
  distance: number;
}

/** 화면 크기(CSS px) */
export interface Viewport {
  width: number;
  height: number;
}

export interface CameraLimits {
  minPitch: number;
  maxPitch: number;
  minDistance: number;
  maxDistance: number;
  /** 목표점이 머무를 범위(m) */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** 보기 범위: 목표점이 이 원들 가운데 하나 안에 머문다(m). 없거나 비면 상자 범위만 */
  area?: readonly ViewDisc[] | undefined;
}

/** 보기 범위 원 하나(땅 좌표 m) */
export interface ViewDisc {
  x: number;
  z: number;
  r: number;
}

/** 원들 가운데 하나 안의 가장 가까운 점(이미 안이면 그대로). 원이 없으면 그대로 */
export function clampToArea(point: GroundPoint, area: readonly ViewDisc[]): GroundPoint {
  let best: GroundPoint | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const disc of area) {
    const dx = point.x - disc.x;
    const dz = point.z - disc.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    if (distance <= disc.r) return point;
    const gap = distance - disc.r;
    if (gap < bestDistance) {
      bestDistance = gap;
      const scale = distance > 0 ? disc.r / distance : 0;
      best = { x: disc.x + dx * scale, z: disc.z + dz * scale };
    }
  }
  return best ?? point;
}

const DEG = Math.PI / 180;
/** 세로 시야각 */
export const CAMERA_FOV_RAD = 40 * DEG;
export const DEFAULT_PITCH_RAD = 45 * DEG;
export const MIN_PITCH_RAD = 35 * DEG;
export const MAX_PITCH_RAD = 55 * DEG;
/** 가까이 볼 때 더 눕히는 각(rad): 기본 45° → 30° */
export const CLOSE_TILT_RAD = 15 * DEG;
/** 화면 위 끝 시선이 수평 아래로 남기는 각(rad) — 그린 기울기 하한 = 시야각/2 + 이 값(28°). 지평선이 화면에 들지 않게 */
export const VIEW_HORIZON_MARGIN_RAD = 8 * DEG;
/** 눕힘이 다 걸리는 확대(거리 ÷ 가장 가까운 거리)와 없어지는 확대. 사이는 로그 거리로 부드럽게(확대 5단계 ≈ 1~1.6, 4단계 ≈ 2~3.3) */
export const TILT_FULL_ZOOM = 1.5;
export const TILT_NONE_ZOOM = 4;
/** 가장 가까이: 화면 짧은 변에 보이는 길이(m) */
export const CLOSE_VIEW_SPAN_M = 40;
/** 가장 멀리: 2차맵 대각선 × 이 값이 화면 짧은 변에 들어간다(어떤 방향으로 돌려도 전체가 보인다) */
const FAR_VIEW_MARGIN = 1.02;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** 화면 짧은 변의 비율: 세로 화면이면 가로/세로, 가로 화면이면 1(세로 시야각 기준) */
function shortSideFactor(viewport: Viewport): number {
  if (viewport.width <= 0 || viewport.height <= 0) return 1;
  return Math.min(1, viewport.width / viewport.height);
}

/** 목표점에서 화면 짧은 변에 spanM이 보이는 거리 */
export function distanceForSpan(spanM: number, viewport: Viewport, fov = CAMERA_FOV_RAD): number {
  return spanM / (2 * Math.tan(fov / 2) * shortSideFactor(viewport));
}

/** 거리 distance에서 목표점의 화면 짧은 변에 보이는 길이(m) */
export function spanForDistance(distance: number, viewport: Viewport, fov = CAMERA_FOV_RAD): number {
  return distance * 2 * Math.tan(fov / 2) * shortSideFactor(viewport);
}

/** 목표점에서 1m가 차지하는 CSS 픽셀(시선에 수직인 방향) */
export function pixelsPerMetre(distance: number, viewport: Viewport, fov = CAMERA_FOV_RAD): number {
  if (viewport.height <= 0 || distance <= 0) return 0;
  return viewport.height / (2 * distance * Math.tan(fov / 2));
}

/** 2차맵 한 변(m)과 화면 크기로 정한 한계 */
export function cameraLimitsFor(mapSizeM: number, viewport: Viewport, fov = CAMERA_FOV_RAD): CameraLimits {
  const minDistance = distanceForSpan(CLOSE_VIEW_SPAN_M, viewport, fov);
  const maxDistance = Math.max(
    minDistance,
    distanceForSpan(mapSizeM * Math.SQRT2 * FAR_VIEW_MARGIN, viewport, fov),
  );
  return {
    minPitch: MIN_PITCH_RAD,
    maxPitch: MAX_PITCH_RAD,
    minDistance,
    maxDistance,
    minX: 0,
    maxX: mapSizeM,
    minZ: 0,
    maxZ: mapSizeM,
  };
}

/** 거리 distance에서 더 눕히는 각(rad): 가까울수록 CLOSE_TILT_RAD에 가깝고 TILT_NONE_ZOOM배부터 0 */
export function closeTilt(distance: number, minDistance: number): number {
  if (!(minDistance > 0) || !(distance > 0)) return 0;
  const zoom = distance / minDistance;
  const t = clamp(
    (Math.log(TILT_NONE_ZOOM) - Math.log(zoom)) / (Math.log(TILT_NONE_ZOOM) - Math.log(TILT_FULL_ZOOM)),
    0,
    1,
  );
  // 부드러운 계단(smoothstep): 끝에서 기울기 변화가 0이라 확대하며 꺾이는 느낌이 없다
  return CLOSE_TILT_RAD * t * t * (3 - 2 * t);
}

/** 그린 기울기 = 사용자 기울기 − 가까이 눕힘. 지평선이 보이지 않는 하한(시야각/2 + 여유) 아래로 내려가지 않는다 */
export function viewPitch(
  basePitch: number,
  distance: number,
  minDistance: number,
  fov = CAMERA_FOV_RAD,
): number {
  const floor = fov / 2 + VIEW_HORIZON_MARGIN_RAD;
  return Math.max(Math.min(basePitch, floor), basePitch - closeTilt(distance, minDistance));
}

/** 그린 기울기만 다시 정한다(거리를 바꾼 뒤, 목표점은 묶지 않을 때 — 따라가기 중간 자리) */
export function withViewPitch(state: CameraState, limits: CameraLimits): CameraState {
  const base = clamp(state.basePitch ?? state.pitch, limits.minPitch, limits.maxPitch);
  const pitch = viewPitch(base, state.distance, limits.minDistance);
  if (pitch === state.pitch && base === state.basePitch) return state;
  return { ...state, pitch, basePitch: base };
}

/** 처음 거리 = 가장 가까운 거리 × 이 값(화면 짧은 변 약 70m: 유닛이 실제 크기로 보이는 범위) */
const INITIAL_ZOOM = 1.75;

/** 처음 카메라: 2차맵 가운데, 기본 기울기, 화면 짧은 변 약 70m */
export function initialCamera(
  mapSizeM: number,
  limits: CameraLimits,
  targetY = 0,
  zoom = INITIAL_ZOOM,
): CameraState {
  return clampCamera(
    {
      targetX: mapSizeM / 2,
      targetY,
      targetZ: mapSizeM / 2,
      yaw: 0,
      pitch: DEFAULT_PITCH_RAD,
      basePitch: DEFAULT_PITCH_RAD,
      distance: limits.minDistance * zoom,
    },
    limits,
  );
}

/** 방위를 (-π, π]로 */
export function normalizeAngle(angle: number): number {
  let a = angle % (2 * Math.PI);
  if (a <= -Math.PI) a += 2 * Math.PI;
  if (a > Math.PI) a -= 2 * Math.PI;
  return a;
}

export function clampCamera(state: CameraState, limits: CameraLimits): CameraState {
  const inArea =
    limits.area && limits.area.length > 0
      ? clampToArea({ x: state.targetX, z: state.targetZ }, limits.area)
      : { x: state.targetX, z: state.targetZ };
  const basePitch = clamp(state.basePitch ?? state.pitch, limits.minPitch, limits.maxPitch);
  const distance = clamp(state.distance, limits.minDistance, limits.maxDistance);
  return {
    targetX: clamp(inArea.x, limits.minX, limits.maxX),
    targetY: state.targetY,
    targetZ: clamp(inArea.z, limits.minZ, limits.maxZ),
    yaw: normalizeAngle(state.yaw),
    pitch: viewPitch(basePitch, distance, limits.minDistance),
    basePitch,
    distance,
  };
}

/** 목표점에서 카메라로 가는 단위 방향 */
function backward(state: CameraState): Vec3 {
  const cp = Math.cos(state.pitch);
  return { x: cp * Math.sin(state.yaw), y: Math.sin(state.pitch), z: cp * Math.cos(state.yaw) };
}

export function cameraPosition(state: CameraState): Vec3 {
  const b = backward(state);
  return {
    x: state.targetX + b.x * state.distance,
    y: state.targetY + b.y * state.distance,
    z: state.targetZ + b.z * state.distance,
  };
}

/** 카메라 축: 앞(시선), 오른쪽(수평), 위 — three.js lookAt(위 = +y)과 같은 축 */
export function cameraBasis(state: CameraState): { forward: Vec3; right: Vec3; up: Vec3 } {
  const b = backward(state);
  const forward = { x: -b.x, y: -b.y, z: -b.z };
  const right = { x: Math.cos(state.yaw), y: 0, z: -Math.sin(state.yaw) };
  // up = right × forward
  const up = {
    x: right.y * forward.z - right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y - right.y * forward.x,
  };
  return { forward, right, up };
}

/** 화면 점(CSS px)을 지나는 시선(방향은 단위 벡터가 아니다) */
export function screenRay(
  state: CameraState,
  viewport: Viewport,
  point: ScreenPoint,
  fov = CAMERA_FOV_RAD,
): { origin: Vec3; dir: Vec3 } {
  const { forward, right, up } = cameraBasis(state);
  const tanHalf = Math.tan(fov / 2);
  const aspect = viewport.height > 0 ? viewport.width / viewport.height : 1;
  const nx = viewport.width > 0 ? (2 * point.x) / viewport.width - 1 : 0;
  const ny = viewport.height > 0 ? 1 - (2 * point.y) / viewport.height : 0;
  const sx = nx * tanHalf * aspect;
  const sy = ny * tanHalf;
  return {
    origin: cameraPosition(state),
    dir: {
      x: forward.x + right.x * sx + up.x * sy,
      y: forward.y + right.y * sx + up.y * sy,
      z: forward.z + right.z * sx + up.z * sy,
    },
  };
}

/** 시선과 높이 planeY 평면이 만나는 점. 위로 가는 시선이면 null */
export function rayHitsPlane(ray: { origin: Vec3; dir: Vec3 }, planeY: number): GroundPoint | null {
  if (ray.dir.y >= -1e-9) return null;
  const t = (planeY - ray.origin.y) / ray.dir.y;
  if (t < 0) return null;
  return { x: ray.origin.x + ray.dir.x * t, z: ray.origin.z + ray.dir.z * t };
}

/** 화면 점 아래의 땅(높이 targetY인 평면) */
export function groundUnder(
  state: CameraState,
  viewport: Viewport,
  point: ScreenPoint,
  fov = CAMERA_FOV_RAD,
): GroundPoint | null {
  return rayHitsPlane(screenRay(state, viewport, point, fov), state.targetY);
}

/**
 * 평면 위 점 anchor가 화면 점 point 아래에 오게 목표점을 옮긴다(잡아 끌기의 핵심).
 * 카메라를 평면과 나란히 옮기면 평면 위 모든 점이 같은 만큼 움직이므로, 한 번 옮기면 정확히 맞는다(범위로 묶기 전).
 */
export function keepGroundUnder(
  state: CameraState,
  anchor: GroundPoint,
  point: ScreenPoint,
  viewport: Viewport,
  limits: CameraLimits,
  fov = CAMERA_FOV_RAD,
): CameraState {
  const now = groundUnder(state, viewport, point, fov);
  if (!now) return clampCamera(state, limits);
  return clampCamera(
    { ...state, targetX: state.targetX + anchor.x - now.x, targetZ: state.targetZ + anchor.z - now.z },
    limits,
  );
}

/**
 * 두 손가락(또는 휠) 한 번의 변화: 이전 화면 점 아래의 땅을 붙잡고, 거리 × scale, 방위 + rotation을 한 뒤
 * 그 땅이 새 화면 점 아래에 오게 한다. 이동·확대·회전이 한 번에 된다.
 */
export function transformAround(
  state: CameraState,
  previous: ScreenPoint,
  next: ScreenPoint,
  scale: number,
  rotation: number,
  viewport: Viewport,
  limits: CameraLimits,
  fov = CAMERA_FOV_RAD,
): CameraState {
  const anchor = groundUnder(state, viewport, previous, fov);
  const changed = clampCamera(
    { ...state, distance: state.distance * scale, yaw: state.yaw + rotation },
    limits,
  );
  if (!anchor) return changed;
  return keepGroundUnder(changed, anchor, next, viewport, limits, fov);
}

/** 목표점을 중심으로 돌리고 기울인다(데스크톱 오른쪽 끌기). 기울기는 사용자 기울기(basePitch)를 바꾼다 */
export function orbit(
  state: CameraState,
  deltaYaw: number,
  deltaPitch: number,
  limits: CameraLimits,
): CameraState {
  const base = state.basePitch ?? state.pitch;
  return clampCamera({ ...state, yaw: state.yaw + deltaYaw, basePitch: base + deltaPitch }, limits);
}

/** 두 손가락의 변화: 거리 배율(벌리면 1보다 작다 = 가까이), 회전(rad, 화면에서 시계 방향이 +), 가운데 점 */
export function twoPointerChange(
  previous: readonly [ScreenPoint, ScreenPoint],
  next: readonly [ScreenPoint, ScreenPoint],
): { scale: number; rotation: number; previousMid: ScreenPoint; nextMid: ScreenPoint } {
  const span = (pair: readonly [ScreenPoint, ScreenPoint]): number =>
    Math.hypot(pair[1].x - pair[0].x, pair[1].y - pair[0].y);
  const angle = (pair: readonly [ScreenPoint, ScreenPoint]): number =>
    Math.atan2(pair[1].y - pair[0].y, pair[1].x - pair[0].x);
  const mid = (pair: readonly [ScreenPoint, ScreenPoint]): ScreenPoint => ({
    x: (pair[0].x + pair[1].x) / 2,
    y: (pair[0].y + pair[1].y) / 2,
  });
  const before = span(previous);
  const after = span(next);
  // 손가락이 거의 붙어 있으면 배율·회전을 계산하지 않는다(튐 방지)
  const usable = before > 4 && after > 4;
  return {
    scale: usable ? before / after : 1,
    rotation: usable ? normalizeAngle(angle(next) - angle(previous)) : 0,
    previousMid: mid(previous),
    nextMid: mid(next),
  };
}
