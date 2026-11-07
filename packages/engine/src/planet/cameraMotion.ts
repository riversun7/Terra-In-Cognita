// 1차맵 카메라 움직임 — 확대 움직임(두 번 누르기·[+]·[−])과 놓은 뒤 관성. planetEngine.ts가 프레임마다 step을 부른다.
// 둘 다 돌림판 상태(turntable.ts)를 지킨다: 확대는 붙잡은 땅을 화면 점 아래에 둔 채 로그 거리로 부드럽게, 관성은 지수로 준다.
// 기기의 "동작 줄이기"면 확대는 바로 가고 관성은 쓰지 않는다(엔진이 reducedMotion을 넘긴다).
import type { GlobeLimits, GlobeState, ScreenPoint, Viewport } from "./globeCamera.ts";
import { type Fling, dragTurntable, flingStep } from "./turntable.ts";
import type { Vec3 } from "./vec3.ts";

/** 확대 움직임 시간(ms) */
export const ZOOM_MOTION_MS = 300;

interface ZoomMotion {
  readonly point: ScreenPoint;
  readonly anchor: Vec3;
  readonly from: number;
  readonly to: number;
  elapsed: number;
}

export interface MotionContext {
  readonly radiusM: number;
  readonly limits: GlobeLimits;
  readonly viewport: Viewport;
  readonly reducedMotion: boolean;
}

export class CameraMotion {
  private zoom: ZoomMotion | null = null;
  private fling: Fling | null = null;

  /** 거리 from → to로 간다. anchor(방향)가 화면 점 point 아래에 남는다. 관성은 멈춘다 */
  zoomTo(point: ScreenPoint, anchor: Vec3, from: number, to: number): void {
    this.zoom = { point, anchor, from, to, elapsed: 0 };
    this.fling = null;
  }

  /** 놓은 뒤 관성(동작 줄이기면 무시) */
  startFling(fling: Fling, reducedMotion: boolean): void {
    this.fling = reducedMotion ? null : fling;
  }

  /** 손가락을 대거나 다른 곳으로 옮기면 멈춘다 */
  cancel(): void {
    this.zoom = null;
    this.fling = null;
  }

  get active(): boolean {
    return this.zoom !== null || this.fling !== null;
  }

  /** 한 프레임 움직인다. moving = 다음 프레임도 움직인다 */
  step(state: GlobeState, deltaMs: number, context: MotionContext): { state: GlobeState; moving: boolean } {
    let next = state;
    if (this.zoom) {
      const zoom = this.zoom;
      zoom.elapsed += deltaMs;
      const u = context.reducedMotion ? 1 : Math.min(1, zoom.elapsed / ZOOM_MOTION_MS);
      const eased = 1 - (1 - u) ** 3;
      const distance = Math.exp(Math.log(zoom.from) + (Math.log(zoom.to) - Math.log(zoom.from)) * eased);
      next = dragTurntable(
        { ...next, distance },
        zoom.anchor,
        zoom.point,
        context.radiusM,
        context.limits,
        context.viewport,
      );
      if (u >= 1) this.zoom = null;
    } else if (this.fling) {
      const result = flingStep(next, this.fling, deltaMs);
      next = result.state;
      this.fling = result.fling;
    }
    return { state: next, moving: this.active };
  }
}
