// 2차맵 나침반(사용자 결정 U1 (가): 2차맵은 면 격자 틀이라 북쪽이 2차맵마다 돌아가 있다) — 순수 계산(시험 대상).
// 2차맵 자리(엔진 secondMapPlace: 세계 축 x·위·z를 행성 좌표로)에서 행성 북극 방향(+z)을 2차맵 평면에 내린 것이 북쪽이다.
// 화면의 나침반 바늘 각 = 카메라 앞(화면 위)에서 북쪽까지 위에서 보아 시계 방향 각.
import type { SecondMapPlace } from "@terra/engine";

/** 2차맵 평면(x, z)의 북쪽 단위 방향. 극(북쪽이 정해지지 않음) 가까이면 null */
export function northOnMap(place: SecondMapPlace): { x: number; z: number } | null {
  // 행성 북극 방향 (0, 0, 1)을 2차맵 축에 내린다
  const x = place.xAxis[2];
  const z = place.zAxis[2];
  const length = Math.hypot(x, z);
  if (length < 1e-6) return null;
  return { x: x / length, z: z / length };
}

/** 나침반 바늘 각(라디안, 화면에서 시계 방향). 카메라 yaw 0이면 화면 위 = 2차맵 −z 쪽 */
export function compassAngle(north: { x: number; z: number }, yaw: number): number {
  // 카메라 앞(수평) = (−sin yaw, −cos yaw). 위에서 보아(x 오른쪽, z 아래) 앞 → 북쪽 시계 방향 각
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  return Math.atan2(fx * north.z - fz * north.x, fx * north.x + fz * north.z);
}
