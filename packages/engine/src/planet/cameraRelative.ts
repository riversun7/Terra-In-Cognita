// 카메라 기준 좌표 — ADR 36 "카메라 기준 좌표", PLAN 5.7(반지름 531km에서 32비트 실수는 약 6.25cm 단위라 떨린다).
// 타일 원점(실수 64비트) − 카메라 위치(실수 64비트)를 JS 수로 뺀 값만 GPU에 보낸다. 가까운 타일일수록 이 값이 작아
// 32비트로 반올림해도 오차가 작다. 꼭짓점은 타일 원점 기준 32비트(타일 크기 안이라 작다).
// 아래 "32비트 흉내" 함수는 GPU 계산(모든 연산을 32비트로 반올림)을 따라 해 보는 시험용이다(Math.fround).
import type { Vec3 } from "./vec3.ts";

/** 타일 원점 − 카메라 위치(실수 64비트) — three 메시 position에 넣는다 */
export function cameraRelative(origin: Vec3, cameraPosition: Vec3): Vec3 {
  return [origin[0] - cameraPosition[0], origin[1] - cameraPosition[1], origin[2] - cameraPosition[2]];
}

/** 보기 회전(세계 → 카메라, 행 = 카메라 오른쪽·위·뒤) */
export type ViewRotation = readonly [Vec3, Vec3, Vec3];

const f = Math.fround;

/** 32비트 행렬·벡터 곱 + 이동: 모든 곱셈·덧셈을 32비트로 반올림한다(GPU 꼭짓점 셰이더 흉내) */
function transform32(rotation: ViewRotation, point: Vec3, translation: Vec3): Vec3 {
  const out: [number, number, number] = [0, 0, 0];
  for (let row = 0; row < 3; row++) {
    const r = rotation[row] ?? [0, 0, 0];
    let sum = f(f(r[0]) * f(point[0]));
    sum = f(sum + f(f(r[1]) * f(point[1])));
    sum = f(sum + f(f(r[2]) * f(point[2])));
    out[row] = f(sum + f(translation[row] ?? 0));
  }
  return out;
}

/** 기준값(실수 64비트): 세계 점 → 카메라 공간 */
export function eyeExact(rotation: ViewRotation, cameraPosition: Vec3, world: Vec3): Vec3 {
  const v: Vec3 = [world[0] - cameraPosition[0], world[1] - cameraPosition[1], world[2] - cameraPosition[2]];
  return [
    rotation[0][0] * v[0] + rotation[0][1] * v[1] + rotation[0][2] * v[2],
    rotation[1][0] * v[0] + rotation[1][1] * v[1] + rotation[1][2] * v[2],
    rotation[2][0] * v[0] + rotation[2][1] * v[1] + rotation[2][2] * v[2],
  ];
}

/**
 * 이 엔진의 방식(32비트 흉내): 모델뷰 이동 = 회전 × (원점 − 카메라)를 64비트로 구해 32비트로 올리고,
 * 꼭짓점(원점 기준 32비트)을 32비트로 곱한다.
 */
export function eyeCameraRelative32(
  rotation: ViewRotation,
  cameraPosition: Vec3,
  origin: Vec3,
  offset: Vec3,
): Vec3 {
  const relative = cameraRelative(origin, cameraPosition);
  const translation: Vec3 = [
    rotation[0][0] * relative[0] + rotation[0][1] * relative[1] + rotation[0][2] * relative[2],
    rotation[1][0] * relative[0] + rotation[1][1] * relative[1] + rotation[1][2] * relative[2],
    rotation[2][0] * relative[0] + rotation[2][1] * relative[1] + rotation[2][2] * relative[2],
  ];
  return transform32(rotation, [f(offset[0]), f(offset[1]), f(offset[2])], translation);
}

/** 흔한 방식(비교용, 32비트 흉내): 세계 좌표 꼭짓점(32비트) × 보기 행렬(이동 −회전 × 카메라, 32비트) */
export function eyeWorld32(rotation: ViewRotation, cameraPosition: Vec3, world: Vec3): Vec3 {
  const translation: Vec3 = [
    -(
      rotation[0][0] * cameraPosition[0] +
      rotation[0][1] * cameraPosition[1] +
      rotation[0][2] * cameraPosition[2]
    ),
    -(
      rotation[1][0] * cameraPosition[0] +
      rotation[1][1] * cameraPosition[1] +
      rotation[1][2] * cameraPosition[2]
    ),
    -(
      rotation[2][0] * cameraPosition[0] +
      rotation[2][1] * cameraPosition[1] +
      rotation[2][2] * cameraPosition[2]
    ),
  ];
  return transform32(rotation, [f(world[0]), f(world[1]), f(world[2])], translation);
}
