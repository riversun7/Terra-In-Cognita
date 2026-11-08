// 옆 2차맵으로 넘기(지금 2차맵 바꾸기) 계산 — 순수 함수. docs/adr/2026-11-08-seamless-second-map.md WP-3(로딩 없는 2차맵 이동).
// 이웃 놓는 자리(NeighbourPlacement)는 이웃 칸 좌표 → 지금 2차맵 칸 좌표의 90° 배수 돌림 + 옮김이다(neighbourTerrains.ts). 넘을 때는
// 그 역(지금 2차맵 → 새 2차맵)으로 카메라와 다른 이웃들을 옮긴다. 돌림은 직교 행렬이라 역 = 전치다(뒤집힘 없음, 두 면 모두 오른손 틀).
import type { CameraState } from "../camera/cameraMath.ts";
import type { NeighbourPlacement } from "./neighbourTerrains.ts";

/** 역 놓는 자리: 지금 2차맵 칸 좌표 → 그 이웃 칸 좌표 */
export function invertPlacement(p: NeighbourPlacement): NeighbourPlacement {
  return {
    a: p.a,
    b: p.cc,
    cc: p.b,
    d: p.d,
    tx: -(p.a * p.tx + p.cc * p.tz),
    tz: -(p.b * p.tx + p.d * p.tz),
  };
}

/** 이어 놓기: outer(inner(점)) */
export function composePlacement(outer: NeighbourPlacement, inner: NeighbourPlacement): NeighbourPlacement {
  return {
    a: outer.a * inner.a + outer.b * inner.cc,
    b: outer.a * inner.b + outer.b * inner.d,
    cc: outer.cc * inner.a + outer.d * inner.cc,
    d: outer.cc * inner.b + outer.d * inner.d,
    tx: outer.a * inner.tx + outer.b * inner.tz + outer.tx,
    tz: outer.cc * inner.tx + outer.d * inner.tz + outer.tz,
  };
}

/**
 * 카메라를 다른 틀로 옮긴다(p = 옛 틀 칸 좌표 → 새 틀 칸 좌표, cellSizeM = 지형 칸 한 변 m). 같은 땅이 같은 자리에 보이도록 목표점을 옮기고
 * 방위에 돌림을 더한다(카메라가 목표에서 떨어진 방향 (sin yaw, cos yaw)를 같이 돌린다 — cameraMath.ts의 방위 뜻). 기울기·거리는 그대로
 */
export function cameraThroughPlacement(
  state: CameraState,
  p: NeighbourPlacement,
  cellSizeM: number,
): CameraState {
  const x = state.targetX / cellSizeM;
  const z = state.targetZ / cellSizeM;
  const sx = Math.sin(state.yaw);
  const sz = Math.cos(state.yaw);
  return {
    ...state,
    targetX: (p.a * x + p.b * z + p.tx) * cellSizeM,
    targetZ: (p.cc * x + p.d * z + p.tz) * cellSizeM,
    yaw: Math.atan2(p.a * sx + p.b * sz, p.cc * sx + p.d * sz),
  };
}
