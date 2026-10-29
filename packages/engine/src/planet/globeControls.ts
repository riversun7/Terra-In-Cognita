// 지구본 조작 — 포인터(터치·마우스·펜)와 휠을 받아 카메라 상태를 바꾼다. 계산은 globeCamera.ts(순수 함수).
// - 한 손가락(왼쪽 단추) 끌기 = 돌리기(손가락 아래 땅이 따라온다), 두 손가락 = 확대·회전(+ 가운데 점 이동).
// - 휠 = 확대(커서 아래 땅 기준), 오른쪽·가운데 끌기(가로) = 방위 돌리기.
// - 누르기(짧게, 거의 안 움직임) = 칸 고르기. 두 번 누르기(DOUBLE_TAP_MS 안, 가까운 곳) = 그곳으로 가까이(엔진이 움직임을 만든다).
import { twoPointerChange } from "../camera/cameraMath.ts";
import type { GlobeLimits, GlobeState, ScreenPoint, Viewport } from "./globeCamera.ts";
import { dragGlobe, globePose, grabDirection, rotateHeading, zoomAround } from "./globeCamera.ts";
import type { Vec3 } from "./vec3.ts";

export interface GlobeControlTarget {
  getState(): GlobeState;
  /** 새 상태 — 엔진이 다시 그리기를 예약한다 */
  setState(next: GlobeState): void;
  limits(): GlobeLimits;
  radiusM(): number;
  /** 캔버스 크기(CSS px) */
  viewport(): Viewport;
  onTap(point: ScreenPoint): void;
  onDoubleTap(point: ScreenPoint): void;
  /** 손가락·단추를 누르고 있는 동안(목표점 높이 맞추기를 미룬다) */
  onGestureChange(active: boolean): void;
}

const TAP_SLOP_TOUCH = 10;
const TAP_SLOP_MOUSE = 5;
const TAP_MAX_MS = 500;
/** 두 번 누르기: 두 누르기 사이 시간(ms)·거리(CSS px) */
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_SLOP = 30;
/** 오른쪽 끌기 1px당 방위(rad) */
const HEADING_PER_PX = 0.006;
/** 휠 한 칸(px)당 확대 세기 — 트랙패드 오므리기(ctrlKey)는 값이 작아 세게 */
const WHEEL_ZOOM = 0.0015;
const PINCH_WHEEL_ZOOM = 0.01;

type Mode = "none" | "drag" | "heading" | "pinch";

const preventContextMenu = (event: Event): void => event.preventDefault();

export function attachGlobeControls(element: HTMLElement, target: GlobeControlTarget): () => void {
  const pointers = new Map<number, ScreenPoint>();
  let mode: Mode = "none";
  let anchor: Vec3 | null = null;
  let headingLast: ScreenPoint | null = null;
  let pinchPrevious: [ScreenPoint, ScreenPoint] | null = null;
  let tap: { id: number; start: ScreenPoint; time: number; slop: number } | null = null;
  let lastTap: { point: ScreenPoint; time: number } | null = null;

  const local = (event: PointerEvent | WheelEvent): ScreenPoint => {
    const rect = element.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const firstTwo = (): [ScreenPoint, ScreenPoint] | null => {
    const values = [...pointers.values()];
    const a = values[0];
    const b = values[1];
    return a && b ? [a, b] : null;
  };
  const grab = (point: ScreenPoint): Vec3 => {
    const state = target.getState();
    const pose = globePose(state, target.radiusM(), target.limits());
    return grabDirection(pose, target.viewport(), point, target.radiusM() + state.targetHeight);
  };
  const startDrag = (point: ScreenPoint): void => {
    mode = "drag";
    anchor = grab(point);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === "mouse" && event.button > 2) return;
    const point = local(event);
    element.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, point);
    if (pointers.size === 1) target.onGestureChange(true);
    if (event.pointerType === "mouse" && (event.button === 1 || event.button === 2)) {
      mode = "heading";
      headingLast = point;
      tap = null;
      return;
    }
    if (pointers.size === 1) {
      startDrag(point);
      tap = {
        id: event.pointerId,
        start: point,
        time: event.timeStamp,
        slop: event.pointerType === "mouse" ? TAP_SLOP_MOUSE : TAP_SLOP_TOUCH,
      };
    } else {
      mode = "pinch";
      pinchPrevious = firstTwo();
      tap = null;
      lastTap = null;
    }
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!pointers.has(event.pointerId)) return;
    const point = local(event);
    pointers.set(event.pointerId, point);
    if (tap && tap.id === event.pointerId) {
      if (Math.hypot(point.x - tap.start.x, point.y - tap.start.y) > tap.slop) tap = null;
    }
    const state = target.getState();
    const viewport = target.viewport();
    const limits = target.limits();
    if (mode === "drag" && anchor) {
      target.setState(dragGlobe(state, anchor, point, target.radiusM(), limits, viewport));
    } else if (mode === "heading" && headingLast) {
      const dx = point.x - headingLast.x;
      headingLast = point;
      target.setState(rotateHeading(state, dx * HEADING_PER_PX));
    } else if (mode === "pinch") {
      const next = firstTwo();
      if (!next || !pinchPrevious) return;
      const change = twoPointerChange(pinchPrevious, next);
      pinchPrevious = next;
      target.setState(
        zoomAround(
          state,
          change.previousMid,
          change.nextMid,
          change.scale,
          change.rotation,
          target.radiusM(),
          limits,
          viewport,
        ),
      );
    }
  };

  const onPointerEnd = (event: PointerEvent): void => {
    if (!pointers.has(event.pointerId)) return;
    const point = local(event);
    const wasTap =
      event.type === "pointerup" &&
      tap !== null &&
      tap.id === event.pointerId &&
      event.timeStamp - tap.time <= TAP_MAX_MS &&
      Math.hypot(point.x - tap.start.x, point.y - tap.start.y) <= tap.slop;
    pointers.delete(event.pointerId);
    if (element.hasPointerCapture?.(event.pointerId)) element.releasePointerCapture(event.pointerId);
    tap = null;
    if (pointers.size === 0) {
      mode = "none";
      anchor = null;
      headingLast = null;
      pinchPrevious = null;
      target.onGestureChange(false);
    } else if (pointers.size === 1 && mode === "pinch") {
      // 두 손가락 중 하나를 떼면 남은 손가락으로 이어서 끈다(튀지 않게 새로 붙잡는다)
      const remaining = [...pointers.values()][0];
      if (remaining) startDrag(remaining);
    } else if (pointers.size >= 2) {
      pinchPrevious = firstTwo();
    }
    if (!wasTap) return;
    const double =
      lastTap !== null &&
      event.timeStamp - lastTap.time <= DOUBLE_TAP_MS &&
      Math.hypot(point.x - lastTap.point.x, point.y - lastTap.point.y) <= DOUBLE_TAP_SLOP;
    if (double) {
      lastTap = null;
      target.onDoubleTap(point);
    } else {
      lastTap = { point, time: event.timeStamp };
      target.onTap(point);
    }
  };

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const viewport = target.viewport();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.height : 1;
    const strength = event.ctrlKey ? PINCH_WHEEL_ZOOM : WHEEL_ZOOM;
    const factor = Math.min(2, Math.max(0.5, Math.exp(event.deltaY * unit * strength)));
    const point = local(event);
    target.setState(
      zoomAround(target.getState(), point, point, factor, 0, target.radiusM(), target.limits(), viewport),
    );
  };

  element.addEventListener("pointerdown", onPointerDown);
  element.addEventListener("pointermove", onPointerMove);
  element.addEventListener("pointerup", onPointerEnd);
  element.addEventListener("pointercancel", onPointerEnd);
  element.addEventListener("wheel", onWheel, { passive: false });
  element.addEventListener("contextmenu", preventContextMenu);
  return () => {
    element.removeEventListener("pointerdown", onPointerDown);
    element.removeEventListener("pointermove", onPointerMove);
    element.removeEventListener("pointerup", onPointerEnd);
    element.removeEventListener("pointercancel", onPointerEnd);
    element.removeEventListener("wheel", onWheel);
    element.removeEventListener("contextmenu", preventContextMenu);
    pointers.clear();
  };
}
