// 3차원 벡터 계산(실수 64비트) — 1차맵 엔진의 순수 계산이 함께 쓴다. three.js를 쓰지 않는다(워커·시험에서도 돈다).
// 좌표: 행성 중심이 원점이고 단위는 m다. 방향은 @terra/planet 투영과 같은 축(면 0 = +x, 1 = +y, 2 = +z …)이다.
import type { Vec3 } from "@terra/planet/projection";

export type { Vec3 };

export const vec3 = (x: number, y: number, z: number): Vec3 => [x, y, z];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];

/** a + b × k */
export const addScaled = (a: Vec3, b: Vec3, k: number): Vec3 => [
  a[0] + b[0] * k,
  a[1] + b[1] * k,
  a[2] + b[2] * k,
];

export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export const length = (a: Vec3): number => Math.sqrt(dot(a, a));

/** 단위 벡터. 길이가 0이면 그대로 돌려준다 */
export function normalize(a: Vec3): Vec3 {
  const l = length(a);
  return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : a;
}

/** 두 단위 벡터 사이 각(rad) — 가까운 각도에서도 정확하게 atan2로 구한다 */
export function angleBetween(a: Vec3, b: Vec3): number {
  return Math.atan2(length(cross(a, b)), dot(a, b));
}

/** 단위 축 axis를 중심으로 angle만큼 돌린다(오른손 법칙, 로드리게스 식) */
export function rotateAround(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const k = cross(axis, v);
  const d = dot(axis, v) * (1 - c);
  return [
    v[0] * c + k[0] * s + axis[0] * d,
    v[1] * c + k[1] * s + axis[1] * d,
    v[2] * c + k[2] * s + axis[2] * d,
  ];
}

/**
 * 두 단위 벡터 사이를 큰 원을 따라 잇는다(u = 0이면 a, 1이면 b). 거의 같으면 b, 정반대면 a에 수직인 아무 축으로 돈다.
 * 하늘 시각을 늦게 맞출 때 항성·달 방향을 0.5초에 걸쳐 옮기는 데 쓴다(몇 바퀴씩 돌지 않는다).
 */
export function slerpUnit(a: Vec3, b: Vec3, u: number): Vec3 {
  const angle = angleBetween(a, b);
  if (angle < 1e-12) return b;
  let axis = cross(a, b);
  if (length(axis) < 1e-12) axis = cross(a, Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]);
  return normalize(rotateAround(a, normalize(axis), angle * u));
}

/** 단위 벡터 from을 to로 옮기는 회전을 v에 건다(가장 짧은 회전). 둘이 거의 같으면 v 그대로 */
export function rotateFromTo(v: Vec3, from: Vec3, to: Vec3): Vec3 {
  const axis = cross(from, to);
  const sin = length(axis);
  const cos = dot(from, to);
  if (sin < 1e-15) return v;
  return rotateAround(v, scale(axis, 1 / sin), Math.atan2(sin, cos));
}
