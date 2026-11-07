import { describe, expect, it } from "vitest";
import {
  CAMERA_FOV_RAD,
  CLOSE_VIEW_SPAN_M,
  type CameraState,
  DEFAULT_PITCH_RAD,
  MAX_PITCH_RAD,
  MIN_PITCH_RAD,
  type ScreenPoint,
  type Vec3,
  type Viewport,
  cameraBasis,
  cameraLimitsFor,
  cameraPosition,
  clampCamera,
  clampToArea,
  distanceForSpan,
  groundUnder,
  initialCamera,
  keepGroundUnder,
  normalizeAngle,
  orbit,
  pixelsPerMetre,
  spanForDistance,
  transformAround,
  twoPointerChange,
} from "./cameraMath.ts";

const PHONE: Viewport = { width: 390, height: 844 };
const DESKTOP: Viewport = { width: 1280, height: 720 };
const MAP = 128 * 11.7;
const DEG = Math.PI / 180;

/** 시험용: 세계 점 → 화면 점(CSS px). 카메라 축으로 직접 투영한다 */
function worldToScreen(state: CameraState, viewport: Viewport, p: Vec3): ScreenPoint {
  const eye = cameraPosition(state);
  const { forward, right, up } = cameraBasis(state);
  const v = { x: p.x - eye.x, y: p.y - eye.y, z: p.z - eye.z };
  const depth = v.x * forward.x + v.y * forward.y + v.z * forward.z;
  const tanHalf = Math.tan(CAMERA_FOV_RAD / 2);
  const aspect = viewport.width / viewport.height;
  const nx = (v.x * right.x + v.y * right.y + v.z * right.z) / (depth * tanHalf * aspect);
  const ny = (v.x * up.x + v.y * up.y + v.z * up.z) / (depth * tanHalf);
  return { x: ((nx + 1) / 2) * viewport.width, y: ((1 - ny) / 2) * viewport.height };
}

const centre = (viewport: Viewport): ScreenPoint => ({ x: viewport.width / 2, y: viewport.height / 2 });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

describe("확대 한계", () => {
  it("가장 가까이: 세로 휴대폰은 화면 가로가 40m, 1m ≈ 9.75px", () => {
    const limits = cameraLimitsFor(MAP, PHONE);
    expect(spanForDistance(limits.minDistance, PHONE)).toBeCloseTo(CLOSE_VIEW_SPAN_M, 6);
    expect(pixelsPerMetre(limits.minDistance, PHONE)).toBeCloseTo(390 / 40, 6);
  });

  it("가로 화면은 짧은 변(세로)이 40m", () => {
    const limits = cameraLimitsFor(MAP, DESKTOP);
    const verticalSpan = 2 * limits.minDistance * Math.tan(CAMERA_FOV_RAD / 2);
    expect(verticalSpan).toBeCloseTo(CLOSE_VIEW_SPAN_M, 6);
  });

  it("가장 멀리: 2차맵 대각선이 짧은 변에 들어간다", () => {
    const limits = cameraLimitsFor(MAP, PHONE);
    expect(spanForDistance(limits.maxDistance, PHONE)).toBeGreaterThanOrEqual(MAP * Math.SQRT2);
    expect(limits.maxDistance).toBeGreaterThan(limits.minDistance);
  });

  it("거리 ↔ 보이는 길이는 서로 역함수", () => {
    expect(spanForDistance(distanceForSpan(123, PHONE), PHONE)).toBeCloseTo(123, 9);
  });
});

describe("clampCamera", () => {
  const limits = cameraLimitsFor(MAP, PHONE);
  it("기울기 35~55°, 거리, 목표점을 2차맵 안으로 묶는다", () => {
    const state = clampCamera(
      { targetX: -50, targetY: 3, targetZ: MAP + 50, yaw: 0, pitch: 80 * DEG, distance: 1 },
      limits,
    );
    expect(state.pitch).toBeCloseTo(MAX_PITCH_RAD, 9);
    expect(state.distance).toBe(limits.minDistance);
    expect(state.targetX).toBe(0);
    expect(state.targetZ).toBe(MAP);
    expect(clampCamera({ ...state, pitch: 10 * DEG }, limits).pitch).toBeCloseTo(MIN_PITCH_RAD, 9);
  });

  it("보기 범위(원 여러 개)가 있으면 목표점을 가장 가까운 원 안으로 옮긴다(안이면 그대로, 기획 정리 630)", () => {
    const area = [
      { x: 100, z: 100, r: 50 },
      { x: 400, z: 100, r: 20 },
    ];
    const at = (x: number, z: number) =>
      clampCamera({ ...initialCamera(MAP, limits), targetX: x, targetZ: z }, { ...limits, area });
    // 첫 원 안: 그대로
    expect([at(120, 90).targetX, at(120, 90).targetZ]).toEqual([120, 90]);
    // 첫 원 동쪽 밖: 첫 원 가장자리로
    expect(at(200, 100).targetX).toBeCloseTo(150, 9);
    expect(at(200, 100).targetZ).toBeCloseTo(100, 9);
    // 둘째 원 쪽이 더 가깝다
    expect(at(370, 100).targetX).toBeCloseTo(380, 9);
    // 원 목록이 비면 상자 범위만
    const free = clampCamera({ ...initialCamera(MAP, limits), targetX: 700 }, { ...limits, area: [] });
    expect(free.targetX).toBe(700);
    expect(clampToArea({ x: 5, z: 5 }, [])).toEqual({ x: 5, z: 5 });
  });

  it("방위는 (-π, π]로 접는다(회전은 자유)", () => {
    expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 9);
    expect(normalizeAngle(-3 * Math.PI)).toBeCloseTo(Math.PI, 9);
    expect(normalizeAngle(Math.PI / 2 + 4 * Math.PI)).toBeCloseTo(Math.PI / 2, 9);
  });

  it("처음 카메라는 가운데, 기본 기울기 45°", () => {
    const state = initialCamera(MAP, limits, 7);
    expect(state.targetX).toBe(MAP / 2);
    expect(state.targetZ).toBe(MAP / 2);
    expect(state.targetY).toBe(7);
    expect(state.pitch).toBeCloseTo(DEFAULT_PITCH_RAD, 9);
  });
});

describe("카메라 축과 시선", () => {
  const limits = cameraLimitsFor(MAP, PHONE);
  const base = initialCamera(MAP, limits);

  it("방위 0이면 오른쪽 = 동쪽(+x), 화면 위 = 북쪽(-z) 쪽", () => {
    const { forward, right, up } = cameraBasis(base);
    expect(right.x).toBeCloseTo(1, 9);
    expect(right.z).toBeCloseTo(0, 9);
    expect(forward.z).toBeLessThan(0);
    expect(up.y).toBeGreaterThan(0);
    expect(up.z).toBeLessThan(0);
  });

  it("세 축은 서로 수직인 단위 벡터", () => {
    for (const yaw of [0, 0.7, -2.1]) {
      const { forward, right, up } = cameraBasis({ ...base, yaw, pitch: 40 * DEG });
      expect(dot(forward, right)).toBeCloseTo(0, 9);
      expect(dot(forward, up)).toBeCloseTo(0, 9);
      expect(dot(right, up)).toBeCloseTo(0, 9);
      for (const axis of [forward, right, up]) expect(dot(axis, axis)).toBeCloseTo(1, 9);
    }
  });

  it("화면 가운데 아래 땅은 목표점", () => {
    for (const yaw of [0, 1.2, -2.5]) {
      for (const pitch of [MIN_PITCH_RAD, DEFAULT_PITCH_RAD, MAX_PITCH_RAD]) {
        const state = { ...base, yaw, pitch, targetY: 12 };
        const hit = groundUnder(state, PHONE, centre(PHONE));
        expect(hit?.x).toBeCloseTo(state.targetX, 6);
        expect(hit?.z).toBeCloseTo(state.targetZ, 6);
      }
    }
  });

  it("화면 맨 위 시선도 땅에 닿는다(지평선이 보이지 않는다)", () => {
    const state = { ...base, pitch: MIN_PITCH_RAD };
    expect(groundUnder(state, PHONE, { x: 0, y: 0 })).not.toBeNull();
    expect(groundUnder(state, DESKTOP, { x: 0, y: 0 })).not.toBeNull();
  });

  it("투영과 시선이 서로 맞는다(시험 도우미 확인)", () => {
    const state = { ...base, yaw: 0.4 };
    const hit = groundUnder(state, PHONE, { x: 100, y: 200 });
    if (!hit) throw new Error("no hit");
    const back = worldToScreen(state, PHONE, { x: hit.x, y: state.targetY, z: hit.z });
    expect(back.x).toBeCloseTo(100, 6);
    expect(back.y).toBeCloseTo(200, 6);
  });
});

describe("잡아 끌기·확대·회전", () => {
  const limits = cameraLimitsFor(MAP, PHONE);
  const base: CameraState = { ...initialCamera(MAP, limits), yaw: 0.3 };

  it("끌기: 잡은 땅이 손가락 아래에 온다", () => {
    const anchor = groundUnder(base, PHONE, { x: 200, y: 500 });
    if (!anchor) throw new Error("no anchor");
    const moved = keepGroundUnder(base, anchor, { x: 260, y: 430 }, PHONE, limits);
    const under = groundUnder(moved, PHONE, { x: 260, y: 430 });
    expect(under?.x).toBeCloseTo(anchor.x, 6);
    expect(under?.z).toBeCloseTo(anchor.z, 6);
  });

  it("끌기도 2차맵 밖으로는 못 간다", () => {
    const anchor = { x: -10_000, z: -10_000 };
    const moved = keepGroundUnder(base, anchor, centre(PHONE), PHONE, limits);
    expect(moved.targetX).toBe(0);
    expect(moved.targetZ).toBe(0);
  });

  it("확대(휠·오므리기): 커서 아래 땅은 그대로, 거리는 배율만큼", () => {
    const point = { x: 120, y: 300 };
    const before = groundUnder(base, PHONE, point);
    const zoomed = transformAround(base, point, point, 0.5, 0, PHONE, limits);
    const after = groundUnder(zoomed, PHONE, point);
    expect(zoomed.distance).toBeCloseTo(Math.max(limits.minDistance, base.distance * 0.5), 6);
    expect(after?.x).toBeCloseTo(before?.x ?? Number.NaN, 4);
    expect(after?.z).toBeCloseTo(before?.z ?? Number.NaN, 4);
  });

  it("회전: 두 손가락 가운데 아래 땅은 그대로, 방위는 회전만큼", () => {
    const mid = { x: 220, y: 380 };
    const before = groundUnder(base, PHONE, mid);
    const turned = transformAround(base, mid, mid, 1, 0.4, PHONE, limits);
    const after = groundUnder(turned, PHONE, mid);
    expect(turned.yaw).toBeCloseTo(base.yaw + 0.4, 9);
    expect(after?.x).toBeCloseTo(before?.x ?? Number.NaN, 4);
    expect(after?.z).toBeCloseTo(before?.z ?? Number.NaN, 4);
  });

  it("손가락을 시계 방향으로 돌리면 땅도 시계 방향으로 돈다", () => {
    const mid = centre(PHONE);
    const ground = groundUnder(base, PHONE, { x: mid.x + 80, y: mid.y });
    if (!ground) throw new Error("no ground");
    const point = { x: ground.x, y: base.targetY, z: ground.z };
    const angle = (p: ScreenPoint): number => Math.atan2(p.y - mid.y, p.x - mid.x);
    const before = angle(worldToScreen(base, PHONE, point));
    const turned = transformAround(base, mid, mid, 1, 0.2, PHONE, limits);
    const after = angle(worldToScreen(turned, PHONE, point));
    // 화면 좌표(y 아래)에서 시계 방향 = 각도 증가
    expect(normalizeAngle(after - before)).toBeGreaterThan(0.1);
  });

  it("오른쪽 끌기 회전·기울기는 목표점을 그대로 두고 기울기를 묶는다", () => {
    const turned = orbit(base, 1, 1, limits);
    expect(turned.targetX).toBe(base.targetX);
    expect(turned.targetZ).toBe(base.targetZ);
    expect(turned.pitch).toBeCloseTo(MAX_PITCH_RAD, 9);
  });
});

describe("twoPointerChange", () => {
  it("벌리면 배율 < 1(가까이), 시계 방향 90° 회전은 +π/2", () => {
    const change = twoPointerChange(
      [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
      ],
      [
        { x: 150, y: 50 },
        { x: 150, y: 250 },
      ],
    );
    expect(change.scale).toBeCloseTo(0.5, 9);
    expect(change.rotation).toBeCloseTo(Math.PI / 2, 9);
    expect(change.previousMid).toEqual({ x: 150, y: 100 });
    expect(change.nextMid).toEqual({ x: 150, y: 150 });
  });

  it("손가락이 거의 붙어 있으면 배율·회전 없이 이동만", () => {
    const change = twoPointerChange(
      [
        { x: 100, y: 100 },
        { x: 101, y: 100 },
      ],
      [
        { x: 110, y: 100 },
        { x: 110, y: 130 },
      ],
    );
    expect(change.scale).toBe(1);
    expect(change.rotation).toBe(0);
  });
});
