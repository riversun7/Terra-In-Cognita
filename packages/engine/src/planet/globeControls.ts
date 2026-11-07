// 지구본 조작 — 포인터(터치·마우스·펜)와 휠을 받아 카메라 상태를 바꾼다. 계산은 globeCamera.ts·turntable.ts(순수 함수).
// 돌림판(극축 고정, ADR 2026-11-07-planet-view 4절): 화면 위쪽은 늘 북쪽, 목표점 위도는 ±80° 안.
// - 한 손가락(마우스는 어느 단추든) 끌기 = 돌리기(가로 = 극축 둘레, 세로 = 위도, 손가락 아래 땅이 따라온다). 놓으면 관성으로 조금 더 돈다.
// - 두 손가락 = 확대(+ 가운데 점 이동), 휠 = 확대(커서 아래 땅 기준). 두 손가락 회전은 쓰지 않는다(북쪽이 위).
// - 이미 가장 가까이·가장 멀리에 닿은 채 다시 키우기·줄이기를 하면 알린다(zoomPush.ts: 2차맵 들어가기·항성계 보기).
// - 누르기(짧게, 거의 안 움직임) = 칸 고르기. 두 번 누르기(DOUBLE_TAP_MS 안, 가까운 곳) = 그곳으로 가까이(엔진이 움직임을 만든다).
import { twoPointerChange } from "../camera/cameraMath.ts";
import { type ZoomEdge, createZoomPush, edgeOf } from "../camera/zoomPush.ts";
import type { GlobeLimits, GlobeState, ScreenPoint, Viewport } from "./globeCamera.ts";
import { globePose, grabDirection } from "./globeCamera.ts";
import { type Fling, dragTurntable, turntableDelta, zoomTurntable } from "./turntable.ts";
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
  /** 끌기를 놓을 때의 빠르기(관성) */
  onFling(fling: Fling): void;
  /** 끝에 닿은 채 더 키우기(in)·줄이기(out) */
  onZoomPush(edge: ZoomEdge): void;
}

const TAP_SLOP_TOUCH = 10;
const TAP_SLOP_MOUSE = 5;
const TAP_MAX_MS = 500;
/** 두 번 누르기: 두 누르기 사이 시간(ms)·거리(CSS px) */
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_SLOP = 30;
/** 휠 한 칸(px)당 확대 세기 — 트랙패드 오므리기(ctrlKey)는 값이 작아 세게 */
const WHEEL_ZOOM = 0.0015;
const PINCH_WHEEL_ZOOM = 0.01;
/** 관성: 놓기 직전 이 시간(ms) 안의 움직임으로 빠르기를 잰다. 마지막 움직임이 FLING_STALE_MS보다 오래면 관성 없음 */
const FLING_WINDOW_MS = 100;
const FLING_STALE_MS = 60;
/** 관성 빠르기 상한(rad/ms, 약 1초에 115°) */
const FLING_MAX = 0.002;

type Mode = "none" | "drag" | "pinch";

const preventContextMenu = (event: Event): void => event.preventDefault();
const limitFling = (value: number): number => Math.max(-FLING_MAX, Math.min(FLING_MAX, value));

/** 끄는 동안의 상태 기록으로 놓을 때 빠르기(rad/ms). 너무 짧거나 멈췄다 놓았으면 null */
function flingOf(samples: readonly { time: number; state: GlobeState }[], releaseMs: number): Fling | null {
  const last = samples.at(-1);
  if (!last || releaseMs - last.time > FLING_STALE_MS) return null;
  const first = samples.find((sample) => last.time - sample.time <= FLING_WINDOW_MS);
  if (!first || last.time - first.time < 8) return null;
  const delta = turntableDelta(first.state, last.state);
  const dt = last.time - first.time;
  return { lonPerMs: limitFling(delta.lon / dt), latPerMs: limitFling(delta.lat / dt) };
}

export function attachGlobeControls(element: HTMLElement, target: GlobeControlTarget): () => void {
  const pointers = new Map<number, ScreenPoint>();
  let mode: Mode = "none";
  let anchor: Vec3 | null = null;
  let pinchPrevious: [ScreenPoint, ScreenPoint] | null = null;
  let tap: { id: number; start: ScreenPoint; time: number; slop: number } | null = null;
  let lastTap: { point: ScreenPoint; time: number } | null = null;
  /** 끄는 동안의 상태(관성 빠르기 재기) */
  let samples: { time: number; state: GlobeState }[] = [];
  const zoomPush = createZoomPush((edge) => target.onZoomPush(edge));
  const edgeNow = (): ZoomEdge | null => {
    const limits = target.limits();
    return edgeOf(target.getState().distance, limits.minDistance, limits.maxDistance);
  };

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
  const startDrag = (point: ScreenPoint, time: number): void => {
    mode = "drag";
    anchor = grab(point);
    samples = [{ time, state: target.getState() }];
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === "mouse" && event.button > 2) return;
    const point = local(event);
    element.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, point);
    if (pointers.size === 1) target.onGestureChange(true);
    if (pointers.size === 1) {
      startDrag(point, event.timeStamp);
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
      samples = [];
      zoomPush.begin(edgeNow());
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
      const next = dragTurntable(state, anchor, point, target.radiusM(), limits, viewport);
      target.setState(next);
      samples.push({ time: event.timeStamp, state: next });
      if (samples.length > 12) samples.shift();
    } else if (mode === "pinch") {
      const next = firstTwo();
      if (!next || !pinchPrevious) return;
      const change = twoPointerChange(pinchPrevious, next);
      pinchPrevious = next;
      target.setState(
        zoomTurntable(
          state,
          change.previousMid,
          change.nextMid,
          change.scale,
          target.radiusM(),
          limits,
          viewport,
        ),
      );
      zoomPush.push(change.scale);
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
      const fling = mode === "drag" && !wasTap ? flingOf(samples, event.timeStamp) : null;
      mode = "none";
      anchor = null;
      pinchPrevious = null;
      samples = [];
      zoomPush.end();
      target.onGestureChange(false);
      if (fling) target.onFling(fling);
    } else if (pointers.size === 1 && mode === "pinch") {
      // 두 손가락 중 하나를 떼면 남은 손가락으로 이어서 끈다(튀지 않게 새로 붙잡는다)
      const remaining = [...pointers.values()][0];
      zoomPush.end();
      if (remaining) startDrag(remaining, event.timeStamp);
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
    const edge = edgeNow();
    target.setState(
      zoomTurntable(target.getState(), point, point, factor, target.radiusM(), target.limits(), viewport),
    );
    zoomPush.wheel(factor, edge, event.timeStamp);
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
