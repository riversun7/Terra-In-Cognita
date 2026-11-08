// 카메라 조작 — 포인터(터치·마우스·펜)와 휠을 받아 카메라 상태를 바꾼다. 계산은 cameraMath.ts(순수 함수).
// ADR 2026-10-28-s1-second-map: 휴대폰은 한 손가락 끌기 = 이동, 두 손가락 = 확대·회전(+ 가운데 점 이동), 누르기 = 고르기·명령.
// 데스크톱은 끌기 = 이동, 휠 = 확대(커서 아래 땅 기준), 오른쪽(가운데) 끌기 = 회전(가로)·기울이기(세로).
// 누르기: 거의 움직이지 않고(TAP_SLOP) 짧게(TAP_MAX_MS) 뗀 한 손가락·왼쪽 단추. 두 손가락(확대)은 누르기가 아니다.
// 끌기: 한 손가락·왼쪽 단추가 TAP_SLOP을 넘게 움직이면 한 번 알린다(onDragStart, docs/adr/2026-11-08-map-input.md).
// 가운데를 붙잡은 동안(centreLocked = 유닛 따라가는 중) 확대·회전은 화면 가운데 기준이고, 한 손가락 끌기는 옮기기가 아니라 카메라 돌리기다
// (가로 = 방위, 세로 = 기울기 — 오른쪽 끌기와 같다. 자유 시점 없애기, docs/adr/2026-11-08-seamless-second-map.md WP-1 Q1). 끌기는 TAP_SLOP을
// 넘기 전에는 화면을 움직이지 않는다(누르다 손이 떨려도 흔들리지 않게).
// 가장 멀리에 닿은 채 다시 줄이면 알린다(zoomPush.ts, D-6018: 2차맵을 끝까지 줄이면 1차맵 5단계, ADR 2026-11-07-planet-view 2절).
import {
  type CameraLimits,
  type CameraState,
  type GroundPoint,
  type ScreenPoint,
  type Viewport,
  groundUnder,
  keepGroundUnder,
  orbit,
  transformAround,
  twoPointerChange,
} from "./cameraMath.ts";
import { type ZoomEdge, createZoomPush, edgeOf } from "./zoomPush.ts";

export interface ControlTarget {
  getState(): CameraState;
  /** 새 상태(이미 범위로 묶었다)를 건다 — 엔진이 다시 그리기를 예약한다 */
  setState(next: CameraState): void;
  limits(): CameraLimits;
  /** 캔버스 크기(CSS px) */
  viewport(): Viewport;
  onTap(point: ScreenPoint): void;
  /** 손가락·단추를 누르고 있는 동안(목표점 높이 맞추기를 미룬다) */
  onGestureChange(active: boolean): void;
  /** 끝에 닿은 채 더 키우기(in)·줄이기(out) */
  onZoomPush?(edge: ZoomEdge): void;
  /** 한 손가락·왼쪽 단추 끌기가 누르기 거리를 넘었을 때 한 번(누르기가 아니라 지도 끌기다) */
  onDragStart?(): void;
  /** true면 화면 가운데를 붙잡는다(유닛 따라가는 중): 확대·회전은 가운데 기준, 끌기는 누르기 거리를 넘은 뒤부터 */
  centreLocked?(): boolean;
}

/** 움직였다고 볼 거리(CSS px): 손가락, 마우스 */
const TAP_SLOP_TOUCH = 10;
const TAP_SLOP_MOUSE = 5;
const TAP_MAX_MS = 500;
/** 오른쪽 끌기 1px당 회전·기울기(rad) */
const ORBIT_YAW_PER_PX = 0.006;
const ORBIT_PITCH_PER_PX = 0.004;
/** 휠 한 칸(px)당 확대 세기 — 트랙패드 오므리기(ctrlKey)는 값이 작아 세게 */
const WHEEL_ZOOM = 0.0015;
const PINCH_WHEEL_ZOOM = 0.01;

type Mode = "none" | "pan" | "orbit" | "pinch";

/** 화면 가운데(따라가는 유닛이 있는 곳) */
const centreOf = (viewport: Viewport): ScreenPoint => ({ x: viewport.width / 2, y: viewport.height / 2 });

/** 캔버스 위 오른쪽 단추 메뉴를 막는다(오른쪽 끌기 = 회전) */
const preventContextMenu = (event: Event): void => event.preventDefault();

export function attachControls(element: HTMLElement, target: ControlTarget): () => void {
  const pointers = new Map<number, ScreenPoint>();
  let mode: Mode = "none";
  let panAnchor: GroundPoint | null = null;
  let orbitLast: ScreenPoint | null = null;
  let pinchPrevious: [ScreenPoint, ScreenPoint] | null = null;
  let tap: { id: number; start: ScreenPoint; time: number; slop: number } | null = null;
  // 끌기 판정: 이 손가락(pan을 시작한 곳)에서 slop을 넘으면 끌기
  let drag: { start: ScreenPoint; slop: number; started: boolean } | null = null;
  const zoomPush = createZoomPush((edge) => target.onZoomPush?.(edge));
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
  const startPan = (point: ScreenPoint, slop: number): void => {
    mode = "pan";
    panAnchor = groundUnder(target.getState(), target.viewport(), point);
    drag = { start: point, slop, started: false };
  };
  const locked = (): boolean => target.centreLocked?.() ?? false;

  const onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === "mouse" && event.button > 2) return;
    const point = local(event);
    element.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, point);
    if (pointers.size === 1) target.onGestureChange(true);
    if (event.pointerType === "mouse" && (event.button === 1 || event.button === 2)) {
      mode = "orbit";
      orbitLast = point;
      tap = null;
      return;
    }
    if (pointers.size === 1) {
      const slop = event.pointerType === "mouse" ? TAP_SLOP_MOUSE : TAP_SLOP_TOUCH;
      startPan(point, slop);
      tap = { id: event.pointerId, start: point, time: event.timeStamp, slop };
    } else {
      // 두 손가락 이상: 확대·회전. 누르기는 취소한다
      mode = "pinch";
      pinchPrevious = firstTwo();
      tap = null;
      drag = null;
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
    if (mode === "pan" && panAnchor) {
      if (drag && !drag.started && Math.hypot(point.x - drag.start.x, point.y - drag.start.y) > drag.slop) {
        drag.started = true;
        target.onDragStart?.();
        // 붙잡은 동안(따라가는 중): 끌기는 돌리기다. 끌기가 시작된 이 점부터 센다(누르기 거리만큼 튀지 않게)
        if (locked()) {
          mode = "orbit";
          orbitLast = point;
          return;
        }
      }
      if (drag?.started === true || !locked()) {
        target.setState(keepGroundUnder(target.getState(), panAnchor, point, viewport, limits));
      }
    } else if (mode === "orbit" && orbitLast) {
      const dx = point.x - orbitLast.x;
      const dy = point.y - orbitLast.y;
      orbitLast = point;
      // 땅을 잡고 돌리듯: 오른쪽으로 끌면 가까운 쪽이 오른쪽으로 간다. 아래로 끌면 더 위에서 내려다본다
      target.setState(orbit(state, -dx * ORBIT_YAW_PER_PX, dy * ORBIT_PITCH_PER_PX, limits));
    } else if (mode === "pinch") {
      const next = firstTwo();
      if (!next || !pinchPrevious) return;
      const change = twoPointerChange(pinchPrevious, next);
      pinchPrevious = next;
      // 따라가는 중이면 두 손가락 가운데가 아니라 화면 가운데(따라가는 유닛)를 붙잡는다
      const centre = locked() ? centreOf(viewport) : null;
      target.setState(
        transformAround(
          state,
          centre ?? change.previousMid,
          centre ?? change.nextMid,
          change.scale,
          change.rotation,
          viewport,
          limits,
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
      mode = "none";
      panAnchor = null;
      orbitLast = null;
      pinchPrevious = null;
      drag = null;
      zoomPush.end();
      target.onGestureChange(false);
    } else if (pointers.size === 1 && mode === "pinch") {
      // 두 손가락 중 하나를 떼면 남은 손가락으로 이어서 끈다(튀지 않게 새로 붙잡는다)
      const remaining = [...pointers.values()][0];
      zoomPush.end();
      if (remaining) startPan(remaining, TAP_SLOP_TOUCH);
    } else if (pointers.size >= 2) {
      pinchPrevious = firstTwo();
    }
    if (wasTap) target.onTap(point);
  };

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const viewport = target.viewport();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.height : 1;
    const strength = event.ctrlKey ? PINCH_WHEEL_ZOOM : WHEEL_ZOOM;
    const factor = Math.min(2, Math.max(0.5, Math.exp(event.deltaY * unit * strength)));
    const point = locked() ? centreOf(viewport) : local(event);
    const edge = edgeNow();
    target.setState(transformAround(target.getState(), point, point, factor, 0, viewport, target.limits()));
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
