// 시야 거르기 — 순수 계산(시험 대상). 화면 밖(절두체 밖)과 지평선 뒤 타일은 그리지도 받지도 않는다(ADR 36).
// 절두체는 "카메라 기준 좌표"(점 − 카메라 위치)에서 다룬다. 실수 64비트로 계산한다(렌더링과 같은 기준).
import type { Vec3 } from "./vec3.ts";

/** 4×4 행렬(열 우선, three.js와 같다) */
export type Mat4 = Float64Array;

/** 원근 투영(OpenGL 깊이 −1~1, three.js PerspectiveCamera와 같은 식) */
export function perspectiveMatrix(fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovY / 2);
  const m = new Float64Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = -(far + near) / (far - near);
  m[11] = -1;
  m[14] = (-2 * far * near) / (far - near);
  return m;
}

/** 카메라 축(세계 기준 오른쪽·위·뒤)으로 만든 보기 회전(세계 → 카메라). 위치는 빼지 않는다(카메라 기준 좌표) */
export function viewRotationMatrix(right: Vec3, up: Vec3, back: Vec3): Mat4 {
  const m = new Float64Array(16);
  // 행 = 카메라 축(전치)
  m[0] = right[0];
  m[4] = right[1];
  m[8] = right[2];
  m[1] = up[0];
  m[5] = up[1];
  m[9] = up[2];
  m[2] = back[0];
  m[6] = back[1];
  m[10] = back[2];
  m[15] = 1;
  return m;
}

export function multiplyMatrices(a: Mat4, b: Mat4): Mat4 {
  const out = new Float64Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += (a[k * 4 + row] ?? 0) * (b[col * 4 + k] ?? 0);
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

/**
 * 투영 × 보기 행렬에서 절두체 평면 6개(왼·오른·아래·위·가까이·멀리)를 뽑는다(Gribb–Hartmann).
 * 평면마다 (nx, ny, nz, d), 단위 법선, nx·x + ny·y + nz·z + d ≥ 0이 안쪽.
 */
export function frustumPlanes(viewProjection: Mat4): Float64Array {
  const e = viewProjection;
  const row = (r: number): [number, number, number, number] => [
    e[r] ?? 0,
    e[4 + r] ?? 0,
    e[8 + r] ?? 0,
    e[12 + r] ?? 0,
  ];
  const r0 = row(0);
  const r1 = row(1);
  const r2 = row(2);
  const r3 = row(3);
  const combos: [number, number, number, number][] = [];
  for (const [a, sign] of [
    [r0, 1],
    [r0, -1],
    [r1, 1],
    [r1, -1],
    [r2, 1],
    [r2, -1],
  ] as const) {
    combos.push([r3[0] + sign * a[0], r3[1] + sign * a[1], r3[2] + sign * a[2], r3[3] + sign * a[3]]);
  }
  const planes = new Float64Array(24);
  combos.forEach((p, i) => {
    const length = Math.hypot(p[0], p[1], p[2]) || 1;
    planes[i * 4] = p[0] / length;
    planes[i * 4 + 1] = p[1] / length;
    planes[i * 4 + 2] = p[2] / length;
    planes[i * 4 + 3] = p[3] / length;
  });
  return planes;
}

/** 구(카메라 기준 중심, 반지름)가 절두체에 조금이라도 걸치는지 */
export function sphereInFrustum(
  planes: Float64Array,
  cx: number,
  cy: number,
  cz: number,
  radius: number,
): boolean {
  for (let i = 0; i < 6; i++) {
    const distance =
      (planes[i * 4] ?? 0) * cx +
      (planes[i * 4 + 1] ?? 0) * cy +
      (planes[i * 4 + 2] ?? 0) * cz +
      (planes[i * 4 + 3] ?? 0);
    if (distance < -radius) return false;
  }
  return true;
}

/**
 * 지평선 거르기: 가운데 방향 direction, 각 반지름 angularRadius인 구 위 조각의 점들(반지름 ≤ maxRadiusM)이
 * 반지름 occluderRadiusM인 구(행성 몸)에 가려 카메라에서 하나도 안 보이면 false.
 * 반지름 r인 점은 카메라(중심에서 d)와 이루는 각이 acos(R/d) + acos(R/r) 이하일 때만 보인다(두 접선).
 * 조각에서 카메라 쪽으로 가장 가까운 점의 각은 (가운데 각 − 각 반지름) 이상이다 → 보수적(보이는 것을 거르지 않는다).
 */
export function aboveHorizon(
  cameraPosition: Vec3,
  direction: Vec3,
  angularRadius: number,
  occluderRadiusM: number,
  maxRadiusM: number,
): boolean {
  const d = Math.hypot(cameraPosition[0], cameraPosition[1], cameraPosition[2]);
  if (d <= occluderRadiusM) return true;
  const cos =
    (cameraPosition[0] * direction[0] + cameraPosition[1] * direction[1] + cameraPosition[2] * direction[2]) /
    d;
  const angle = Math.acos(Math.min(1, Math.max(-1, cos)));
  const cameraHorizon = Math.acos(occluderRadiusM / d);
  const pointHorizon = Math.acos(Math.min(1, occluderRadiusM / Math.max(occluderRadiusM, maxRadiusM)));
  return angle - angularRadius <= cameraHorizon + pointHorizon;
}
