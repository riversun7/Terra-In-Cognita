// 2차맵 조작 시험(DOM 없이) — 요소는 이벤트 듣기만 흉내 낸다. 끌기와 누르기 구분(사용자 지적 2026-11-08 "맵조작시 오브젝트가 걸려 드래그가 안되고"),
// 따라가는 동안 가운데 붙잡기(docs/adr/2026-11-08-map-input.md 1·2절)
import { describe, expect, it } from "vitest";
import { type CameraState, type ScreenPoint, cameraLimitsFor, initialCamera } from "./cameraMath.ts";
import { attachControls } from "./controls.ts";

const PHONE = { width: 390, height: 844 };
const limits = cameraLimitsFor(1500, PHONE);

type Listener = (event: unknown) => void;

function harness(options: { locked?: boolean } = {}) {
  const listeners = new Map<string, Listener>();
  const element = {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: PHONE.width, height: PHONE.height }),
    setPointerCapture: () => undefined,
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
  };
  let state: CameraState = initialCamera(1500, limits);
  let locked = options.locked ?? false;
  const taps: ScreenPoint[] = [];
  let drags = 0;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 시험용 가짜 요소(듣기·크기만 쓴다)
  const detach = attachControls(element as unknown as HTMLElement, {
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    limits: () => limits,
    viewport: () => PHONE,
    onTap: (point) => taps.push(point),
    onGestureChange: () => undefined,
    onDragStart: () => {
      drags += 1;
      // 엔진처럼: 끌면 따라가기가 끊겨 가운데 붙잡기가 풀린다
      locked = false;
    },
    centreLocked: () => locked,
  });
  let time = 1000;
  const fire = (type: string, id: number, x: number, y: number): void => {
    time += 16;
    listeners.get(type)?.({
      type,
      pointerId: id,
      pointerType: "touch",
      button: 0,
      clientX: x,
      clientY: y,
      timeStamp: time,
      preventDefault: () => undefined,
    });
  };
  return {
    fire,
    taps,
    drags: () => drags,
    state: () => state,
    locked: () => locked,
    detach,
  };
}

describe("2차맵 조작: 끌기와 누르기", () => {
  it("거의 움직이지 않고 뗀 한 손가락은 누르기, 끌기 알림은 없다", () => {
    const h = harness();
    h.fire("pointerdown", 1, 200, 400);
    h.fire("pointermove", 1, 204, 403);
    h.fire("pointerup", 1, 204, 403);
    expect(h.taps).toHaveLength(1);
    expect(h.drags()).toBe(0);
  });

  it("누르기 거리(10px)를 넘게 끌면 끌기를 한 번 알리고 지도가 움직이며, 떼어도 누르기가 아니다", () => {
    const h = harness();
    const before = h.state();
    h.fire("pointerdown", 1, 200, 400);
    for (const x of [205, 215, 240, 280]) h.fire("pointermove", 1, x, 400);
    h.fire("pointerup", 1, 280, 400);
    expect(h.drags()).toBe(1);
    expect(h.taps).toHaveLength(0);
    expect(h.state().targetX).not.toBeCloseTo(before.targetX, 3);
  });

  it("두 손가락(확대)은 누르기도 끌기도 아니다", () => {
    const h = harness();
    h.fire("pointerdown", 1, 150, 400);
    h.fire("pointerdown", 2, 250, 400);
    h.fire("pointermove", 1, 140, 400);
    h.fire("pointermove", 2, 260, 400);
    h.fire("pointerup", 1, 140, 400);
    h.fire("pointerup", 2, 260, 400);
    expect(h.taps).toHaveLength(0);
    expect(h.drags()).toBe(0);
  });

  it("가운데를 붙잡은 동안(따라가는 중): 누르기 거리 안의 떨림은 지도를 움직이지 않고, 넘으면 끊고 그 점부터 끈다", () => {
    const h = harness({ locked: true });
    const before = h.state();
    h.fire("pointerdown", 1, 200, 400);
    h.fire("pointermove", 1, 206, 404);
    expect(h.state()).toEqual(before);
    h.fire("pointermove", 1, 230, 400);
    expect(h.drags()).toBe(1);
    expect(h.locked()).toBe(false);
    // 끌기가 시작된 점(230)에서 다시 붙잡으므로 그 이동만큼은 튀지 않는다
    const atStart = h.state();
    expect(atStart.targetX).toBeCloseTo(before.targetX, 6);
    h.fire("pointermove", 1, 300, 400);
    expect(h.state().targetX).toBeLessThan(atStart.targetX);
    h.fire("pointerup", 1, 300, 400);
    expect(h.taps).toHaveLength(0);
  });

  it("가운데를 붙잡은 동안 두 손가락 확대는 목표점(화면 가운데)을 그대로 둔다", () => {
    const h = harness({ locked: true });
    const before = h.state();
    h.fire("pointerdown", 1, 60, 200);
    h.fire("pointerdown", 2, 160, 300);
    h.fire("pointermove", 1, 40, 180);
    h.fire("pointermove", 2, 180, 320);
    const after = h.state();
    expect(after.distance).toBeLessThan(before.distance);
    expect(after.targetX).toBeCloseTo(before.targetX, 6);
    expect(after.targetZ).toBeCloseTo(before.targetZ, 6);
    expect(h.drags()).toBe(0);
  });
});
