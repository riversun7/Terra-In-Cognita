import { averageCellEdgeMeters } from "@terra/planet/projection";
import { describe, expect, it } from "vitest";
import {
  GLOBE_FOV_RAD,
  MAX_TILT_RAD,
  type GlobeState,
  type ScreenPoint,
  type Viewport,
  directionOfLatLon,
  dragGlobe,
  globeLimits,
  globePose,
  grabDirection,
  headingOf,
  initialGlobe,
  latLonOf,
  projectToScreen,
  rotateHeading,
  screenRay,
  shortHalfFov,
  tiltFor,
  zoomAround,
} from "./globeCamera.ts";
import { EARTH_RADIUS_M } from "./testSupport.ts";
import { type Vec3, dot, length, scale } from "./vec3.ts";

const R = EARTH_RADIUS_M;
const PHONE: Viewport = { width: 390, height: 844 };
const FINEST = averageCellEdgeMeters(9, R);
const limits = globeLimits(R, FINEST, PHONE);
const DEG = Math.PI / 180;

/** 방향의 땅(목표점 높이의 구) 점이 화면 어디에 보이는지 */
function screenOf(state: GlobeState, direction: Vec3): ScreenPoint | null {
  const pose = globePose(state, R, limits);
  return projectToScreen(pose, PHONE, scale(direction, R + state.targetHeight));
}

describe("한계와 기울기", () => {
  it("가장 가까이 = 가장 고운 칸 × 8(약 12km), 가장 멀리 = 행성 전체가 화면 짧은 변에 든다", () => {
    expect(limits.minDistance).toBeCloseTo(FINEST * 8, 6);
    expect(limits.minDistance).toBeGreaterThan(11_000);
    expect(limits.minDistance).toBeLessThan(13_000);
    const centre = limits.maxDistance + R;
    // 행성이 보이는 반각 < 짧은 변 반 시야각
    expect(Math.asin(R / centre)).toBeLessThan(shortHalfFov(PHONE));
    expect(Math.asin(R / centre)).toBeGreaterThan(shortHalfFov(PHONE) * 0.8);
  });

  it("멀면 바로 아래(0°), 가까울수록 기울어 가장 가까이에서 40°", () => {
    expect(tiltFor(limits.maxDistance, limits)).toBe(0);
    expect(tiltFor(limits.tiltStartDistance, limits)).toBe(0);
    expect(tiltFor(limits.minDistance, limits)).toBeCloseTo(MAX_TILT_RAD, 9);
    let previous = 0;
    for (let d = limits.tiltStartDistance; d >= limits.minDistance; d /= 1.5) {
      const tilt = tiltFor(d, limits);
      expect(tilt).toBeGreaterThanOrEqual(previous);
      previous = tilt;
    }
  });

  it("기울어도 하늘이 보이지 않는다(화면 위 끝 시선이 행성에 닿는다)", () => {
    for (let d = limits.tiltStartDistance; d >= limits.minDistance; d /= 1.7) {
      const state = initialGlobe(10, 20, d, limits);
      const pose = globePose(state, R, limits);
      const ray = screenRay(pose, PHONE, { x: PHONE.width / 2, y: 0 });
      // 시선과 구가 만나는지: 원점까지 가장 가까운 거리 < R
      const t = -dot(ray.origin, ray.dir);
      const closest = length([
        ray.origin[0] + ray.dir[0] * t,
        ray.origin[1] + ray.dir[1] * t,
        ray.origin[2] + ray.dir[2] * t,
      ]);
      expect(closest).toBeLessThan(R);
    }
  });
});

describe("처음 상태·방위·위도경도", () => {
  it("처음은 북쪽이 위, 목표점은 화면 가운데", () => {
    const state = initialGlobe(37, 127, 500_000, limits);
    expect(headingOf(state)).toBeCloseTo(0, 9);
    const centre = screenOf(state, state.target);
    expect(centre?.x).toBeCloseTo(PHONE.width / 2, 6);
    expect(centre?.y).toBeCloseTo(PHONE.height / 2, 6);
    const { latDeg, lonDeg } = latLonOf(state.target);
    expect(latDeg).toBeCloseTo(37, 9);
    expect(lonDeg).toBeCloseTo(127, 9);
    // 북쪽 점은 화면 위쪽에
    const north = screenOf(state, directionOfLatLon(37.5, 127));
    expect(north?.y ?? 1e9).toBeLessThan(PHONE.height / 2);
  });

  it("방위 +θ: 땅이 시계 방향으로 돈다(위쪽 점이 오른쪽으로), 방위 값은 −θ", () => {
    const state = initialGlobe(0, 0, 300_000, limits);
    const top = grabDirection(globePose(state, R, limits), PHONE, { x: 195, y: 300 }, R);
    const turned = rotateHeading(state, 30 * DEG);
    const after = screenOf(turned, top);
    expect(after?.x ?? 0).toBeGreaterThan(195);
    expect(headingOf(turned)).toBeCloseTo(-30 * DEG, 9);
  });
});

describe("끌기·확대", () => {
  const cases: [string, GlobeState][] = [
    ["궤도", initialGlobe(20, 30, limits.maxDistance * 0.9, limits)],
    ["지역", initialGlobe(-40, 170, 300_000, limits)],
    ["가장 가까이(기울어짐)", initialGlobe(60, -20, limits.minDistance, limits)],
  ];

  it.each(cases)("%s: 잡은 땅이 손가락을 따라간다(0.5px 안)", (_label, state) => {
    const from = { x: 195, y: 470 };
    const to = { x: 260, y: 400 };
    const anchor = grabDirection(globePose(state, R, limits), PHONE, from, R + state.targetHeight);
    const next = dragGlobe(state, anchor, to, R, limits, PHONE);
    const shown = screenOf(next, anchor);
    expect(shown?.x ?? 0).toBeCloseTo(to.x, 0);
    expect(shown?.y ?? 0).toBeCloseTo(to.y, 0);
    expect(Math.abs((shown?.x ?? 0) - to.x)).toBeLessThan(0.5);
    expect(Math.abs((shown?.y ?? 0) - to.y)).toBeLessThan(0.5);
  });

  it.each(cases)("%s: 휠 확대는 커서 아래 땅을 붙잡는다", (_label, state) => {
    const point = { x: 120, y: 500 };
    const anchor = grabDirection(globePose(state, R, limits), PHONE, point, R + state.targetHeight);
    const next = zoomAround(state, point, point, 0.7, 0, R, limits, PHONE);
    if (state.distance * 0.7 >= limits.minDistance)
      expect(next.distance).toBeCloseTo(state.distance * 0.7, 3);
    const shown = screenOf(next, anchor);
    expect(Math.abs((shown?.x ?? 0) - point.x)).toBeLessThan(0.5);
    expect(Math.abs((shown?.y ?? 0) - point.y)).toBeLessThan(0.5);
  });

  it("거리는 한계 안으로 묶인다", () => {
    const state = initialGlobe(0, 0, 50_000, limits);
    expect(
      zoomAround(state, { x: 195, y: 422 }, { x: 195, y: 422 }, 1e-6, 0, R, limits, PHONE).distance,
    ).toBe(limits.minDistance);
    expect(zoomAround(state, { x: 195, y: 422 }, { x: 195, y: 422 }, 1e6, 0, R, limits, PHONE).distance).toBe(
      limits.maxDistance,
    );
  });

  it("극을 넘어 끌어도 막히거나 NaN이 되지 않고 축이 단위·직교로 남는다", () => {
    let state = initialGlobe(85, 0, 400_000, limits);
    for (let i = 0; i < 40; i++) {
      const anchor = grabDirection(globePose(state, R, limits), PHONE, { x: 195, y: 300 }, R);
      state = dragGlobe(state, anchor, { x: 195, y: 340 }, R, limits, PHONE);
    }
    const { latDeg } = latLonOf(state.target);
    expect(Number.isFinite(latDeg)).toBe(true);
    expect(length(state.target)).toBeCloseTo(1, 9);
    expect(length(state.forward)).toBeCloseTo(1, 9);
    expect(dot(state.target, state.forward)).toBeCloseTo(0, 9);
    // 아래로 끌면 북쪽이 보인다: 목표점이 북극을 지나 반대편으로 내려왔다(약 55° 이동)
    expect(latDeg).toBeLessThan(85);
  });

  it("행성 밖을 눌러도 잡을 방향이 나온다(가장 가까운 점)", () => {
    const state = initialGlobe(0, 0, limits.maxDistance, limits);
    const pose = globePose(state, R, limits);
    const corner = grabDirection(pose, PHONE, { x: 0, y: 0 }, R, GLOBE_FOV_RAD);
    expect(length(corner)).toBeCloseTo(1, 9);
  });
});
