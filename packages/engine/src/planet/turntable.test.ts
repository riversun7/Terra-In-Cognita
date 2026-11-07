import { averageCellEdgeMeters } from "@terra/planet/projection";
import { describe, expect, it } from "vitest";
import {
  type GlobeState,
  type ScreenPoint,
  type Viewport,
  directionOfLatLon,
  globeLimits,
  globePose,
  grabDirection,
  headingOf,
  initialGlobe,
  latLonOf,
  projectToScreen,
} from "./globeCamera.ts";
import { EARTH_RADIUS_M } from "./testSupport.ts";
import {
  FLING_DECAY_MS,
  TURNTABLE_MAX_LAT_DEG,
  dragTurntable,
  flingStep,
  spinGlobe,
  tiltGlobe,
  turntableDelta,
  uprightGlobe,
  wrapAngle,
  zoomTurntable,
} from "./turntable.ts";
import { type Vec3, dot, length, scale } from "./vec3.ts";

const R = EARTH_RADIUS_M;
const PHONE: Viewport = { width: 390, height: 844 };
const limits = globeLimits(R, averageCellEdgeMeters(9, R), PHONE);
const DEG = Math.PI / 180;

function screenOf(state: GlobeState, direction: Vec3): ScreenPoint | null {
  return projectToScreen(globePose(state, R, limits), PHONE, scale(direction, R + state.targetHeight));
}

function expectUpright(state: GlobeState): void {
  expect(headingOf(state)).toBeCloseTo(0, 9);
  expect(length(state.target)).toBeCloseTo(1, 9);
  expect(length(state.forward)).toBeCloseTo(1, 9);
  expect(dot(state.target, state.forward)).toBeCloseTo(0, 9);
  expect(Math.abs(latLonOf(state.target).latDeg)).toBeLessThanOrEqual(TURNTABLE_MAX_LAT_DEG + 1e-9);
}

describe("돌림판 상태", () => {
  it("방위가 돌아간 상태도 북쪽이 위로 돌아온다", () => {
    const turned = { ...initialGlobe(30, 40, 500_000, limits) };
    const tilted = { ...turned, forward: [0, 1, 0] as Vec3 };
    const upright = uprightGlobe(tilted, limits);
    expectUpright(upright);
    expect(latLonOf(upright.target).latDeg).toBeCloseTo(30, 9);
  });

  it("극 가까이(89°)는 묶음 위도(80°)로 내려온다", () => {
    const state = { ...initialGlobe(0, 10, 500_000, limits), target: directionOfLatLon(89, 10) };
    const upright = uprightGlobe(state, limits);
    expectUpright(upright);
    expect(latLonOf(upright.target).latDeg).toBeCloseTo(TURNTABLE_MAX_LAT_DEG, 9);
    expect(latLonOf(upright.target).lonDeg).toBeCloseTo(10, 6);
  });

  it("극축 회전은 경도만, 위도 옮기기는 위도만 바꾼다(묶음 안)", () => {
    const state = uprightGlobe(initialGlobe(20, 170, 300_000, limits), limits);
    const spun = spinGlobe(state, 30 * DEG);
    expect(latLonOf(spun.target).latDeg).toBeCloseTo(20, 9);
    expect(latLonOf(spun.target).lonDeg).toBeCloseTo(-160, 9);
    expectUpright(spun);
    const raised = tiltGlobe(state, 75 * DEG);
    expect(latLonOf(raised.target).latDeg).toBeCloseTo(TURNTABLE_MAX_LAT_DEG, 9);
    expect(latLonOf(raised.target).lonDeg).toBeCloseTo(170, 9);
  });

  it("각 감기: (−π, π]", () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(0.5)).toBeCloseTo(0.5, 12);
    expect(wrapAngle(-7)).toBeCloseTo(-7 + 2 * Math.PI, 12);
  });
});

describe("돌림판 끌기", () => {
  const cases: [string, GlobeState][] = [
    ["궤도", initialGlobe(20, 30, limits.maxDistance * 0.9, limits)],
    ["지역", initialGlobe(-40, 170, 300_000, limits)],
    ["가장 가까이(기울어짐)", initialGlobe(60, -20, limits.minDistance, limits)],
  ];

  it.each(cases)("%s: 잡은 땅이 손가락을 따라가고(0.5px 안) 북쪽이 그대로 위", (_label, state) => {
    const from = { x: 195, y: 470 };
    const to = { x: 260, y: 400 };
    const anchor = grabDirection(globePose(state, R, limits), PHONE, from, R + state.targetHeight);
    const next = dragTurntable(state, anchor, to, R, limits, PHONE);
    expectUpright(next);
    const shown = screenOf(next, anchor);
    expect(Math.abs((shown?.x ?? 0) - to.x)).toBeLessThan(0.5);
    expect(Math.abs((shown?.y ?? 0) - to.y)).toBeLessThan(0.5);
  });

  it("적도에서 가로로 끌면 경도만 바뀐다(극축 둘레)", () => {
    const state = initialGlobe(0, 0, 2_000_000, limits);
    const centre = { x: 195, y: 422 };
    const anchor = grabDirection(globePose(state, R, limits), PHONE, centre, R);
    const next = dragTurntable(state, anchor, { x: 95, y: 422 }, R, limits, PHONE);
    const { latDeg, lonDeg } = latLonOf(next.target);
    expect(Math.abs(latDeg)).toBeLessThan(1e-6);
    // 왼쪽으로 끌면 동쪽 땅이 가운데로 온다
    expect(lonDeg).toBeGreaterThan(0);
  });

  it("아래로 계속 끌어도 위도 80°에서 멈추고(극을 넘지 않는다) NaN이 없다", () => {
    let state = initialGlobe(60, 0, 400_000, limits);
    for (let i = 0; i < 60; i++) {
      const anchor = grabDirection(globePose(state, R, limits), PHONE, { x: 195, y: 300 }, R);
      state = dragTurntable(state, anchor, { x: 195, y: 360 }, R, limits, PHONE);
      expectUpright(state);
    }
    const { latDeg, lonDeg } = latLonOf(state.target);
    expect(latDeg).toBeCloseTo(TURNTABLE_MAX_LAT_DEG, 6);
    expect(lonDeg).toBeCloseTo(0, 6);
    // 북극 쪽 땅은 화면 가운데보다 위에 보인다(북쪽이 위)
    const north = screenOf(state, directionOfLatLon(85, 0));
    expect(north?.y ?? 1e9).toBeLessThan(PHONE.height / 2);
  });

  it("행성 밖을 잡고 끌어도 상태가 망가지지 않는다", () => {
    const state = initialGlobe(10, 10, limits.maxDistance, limits);
    const anchor = grabDirection(globePose(state, R, limits), PHONE, { x: 5, y: 5 }, R);
    const next = dragTurntable(state, anchor, { x: 60, y: 40 }, R, limits, PHONE);
    expectUpright(next);
  });
});

describe("돌림판 확대", () => {
  it("커서 아래 땅을 붙잡고 북쪽이 위로 남는다", () => {
    const state = initialGlobe(35, 127, 900_000, limits);
    const point = { x: 120, y: 500 };
    const anchor = grabDirection(globePose(state, R, limits), PHONE, point, R + state.targetHeight);
    const next = zoomTurntable(state, point, point, 0.6, R, limits, PHONE);
    expect(next.distance).toBeCloseTo(state.distance * 0.6, 3);
    expectUpright(next);
    const shown = screenOf(next, anchor);
    expect(Math.abs((shown?.x ?? 0) - point.x)).toBeLessThan(0.5);
    expect(Math.abs((shown?.y ?? 0) - point.y)).toBeLessThan(0.5);
  });

  it("거리는 한계 안으로 묶인다", () => {
    const state = initialGlobe(0, 0, 50_000, limits);
    const centre = { x: 195, y: 422 };
    expect(zoomTurntable(state, centre, centre, 1e-6, R, limits, PHONE).distance).toBe(limits.minDistance);
    expect(zoomTurntable(state, centre, centre, 1e6, R, limits, PHONE).distance).toBe(limits.maxDistance);
  });
});

describe("관성", () => {
  it("빠르기만큼 돌고 지수로 줄어 멈춘다. 걸음을 나눠도 같은 곳에 간다", () => {
    const start = uprightGlobe(initialGlobe(10, 0, 2_000_000, limits), limits);
    const fling = { lonPerMs: 0.001, latPerMs: 0 };
    const once = flingStep(start, fling, 64);
    let split = { state: start, fling: fling as typeof fling | null };
    for (let i = 0; i < 4 && split.fling; i++) split = flingStep(split.state, split.fling, 16);
    expect(turntableDelta(start, once.state).lon).toBeGreaterThan(0);
    expect(turntableDelta(once.state, split.state).lon).toBeCloseTo(0, 9);
    // 끝까지 가면 v·τ만큼 간다
    let run = { state: start, fling: fling as typeof fling | null };
    let steps = 0;
    while (run.fling && steps < 10_000) {
      run = flingStep(run.state, run.fling, 16);
      steps += 1;
    }
    expect(run.fling).toBeNull();
    expect(turntableDelta(start, run.state).lon).toBeCloseTo(0.001 * FLING_DECAY_MS, 2);
    expectUpright(run.state);
  });

  it("위도 묶음에 닿으면 위도 빠르기는 0이 된다", () => {
    const start = uprightGlobe(initialGlobe(79, 0, 2_000_000, limits), limits);
    const step = flingStep(start, { lonPerMs: 0, latPerMs: 0.01 }, 100);
    expect(latLonOf(step.state.target).latDeg).toBeCloseTo(TURNTABLE_MAX_LAT_DEG, 9);
    expect(step.fling).toBeNull();
  });
});
