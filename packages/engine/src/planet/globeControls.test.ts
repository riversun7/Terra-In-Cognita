// 지구본 조작 시험(DOM 없이) — 요소는 이벤트 듣기만 흉내 낸다. 휠·끌기가 돌림판 상태를 지키는지, 끝에서 한 번 더 굴리면 알리는지
import { averageCellEdgeMeters } from "@terra/planet/projection";
import { describe, expect, it } from "vitest";
import { type GlobeState, type Viewport, globeLimits, headingOf, initialGlobe } from "./globeCamera.ts";
import { attachGlobeControls } from "./globeControls.ts";
import { EARTH_RADIUS_M } from "./testSupport.ts";

const R = EARTH_RADIUS_M;
const PHONE: Viewport = { width: 390, height: 844 };
const limits = globeLimits(R, averageCellEdgeMeters(9, R), PHONE);

type Listener = (event: unknown) => void;

function harness(start: GlobeState) {
  const listeners = new Map<string, Listener>();
  const element = {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: PHONE.width, height: PHONE.height }),
    setPointerCapture: () => undefined,
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
  };
  let state = start;
  const edges: string[] = [];
  const flings: unknown[] = [];
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 시험용 가짜 요소(듣기·크기만 쓴다)
  const detach = attachGlobeControls(element as unknown as HTMLElement, {
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    limits: () => limits,
    radiusM: () => R,
    viewport: () => PHONE,
    onTap: () => undefined,
    onDoubleTap: () => undefined,
    onGestureChange: () => undefined,
    onFling: (fling) => flings.push(fling),
    onZoomPush: (edge) => edges.push(edge),
  });
  const fire = (type: string, event: Record<string, unknown>): void =>
    listeners.get(type)?.({ preventDefault: () => undefined, ...event });
  return { fire, edges, flings, state: () => state, detach };
}

describe("지구본 조작", () => {
  it("가장 멀리에서 휠로 한 번 더 줄이면 out을 알린다(쭉 이어 굴린 휠은 아니다)", () => {
    const far = harness(initialGlobe(10, 20, limits.maxDistance, limits));
    far.fire("wheel", { deltaY: 240, deltaMode: 0, clientX: 120, clientY: 500, timeStamp: 1000 });
    expect(far.edges).toEqual(["out"]);
    const near = harness(initialGlobe(10, 20, limits.maxDistance * 0.5, limits));
    for (let i = 0; i < 6; i++) {
      near.fire("wheel", {
        deltaY: 400,
        deltaMode: 0,
        clientX: 120,
        clientY: 500,
        timeStamp: 1000 + i * 150,
      });
    }
    expect(near.state().distance).toBe(limits.maxDistance);
    expect(near.edges).toEqual([]);
  });

  it("끌어도 북쪽이 위로 남는다", () => {
    const view = harness(initialGlobe(40, 20, 600_000, limits));
    view.fire("pointerdown", {
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
      clientX: 150,
      clientY: 400,
      timeStamp: 0,
    });
    for (let i = 1; i <= 10; i++) {
      view.fire("pointermove", {
        pointerId: 1,
        clientX: 150 + i * 12,
        clientY: 400 + i * 15,
        timeStamp: i * 16,
      });
    }
    view.fire("pointerup", { type: "pointerup", pointerId: 1, clientX: 270, clientY: 550, timeStamp: 170 });
    expect(headingOf(view.state())).toBeCloseTo(0, 9);
    // 빠르게 놓았으니 관성
    expect(view.flings).toHaveLength(1);
    view.detach();
  });
});
