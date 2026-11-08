import { describe, expect, it } from "vitest";
import { CameraGlide, FOLLOW_SMOOTH_MS, approach } from "./cameraGlide.ts";
import { type CameraState, cameraLimitsFor } from "./cameraMath.ts";

const limits = cameraLimitsFor(1500, { width: 390, height: 844 });
const start: CameraState = {
  targetX: 100,
  targetY: 0,
  targetZ: 100,
  yaw: 0,
  pitch: 0.8,
  distance: limits.minDistance * 2,
};

/** 프레임 n개(16ms)를 돌린다 */
function run(glide: CameraGlide, state: CameraState, unit: { x: number; z: number } | null, frames: number) {
  let now = state;
  let busy = false;
  for (let i = 0; i < frames; i++) {
    const step = glide.step(now, unit, 16, limits);
    now = step.state;
    busy = step.busy;
  }
  return { state: now, busy };
}

describe("카메라 미끄러짐(따라가기·확대 움직임)", () => {
  it("지수 감쇠: 시간 상수만큼 지나면 약 63% 다가가고, 가까우면 바로 닿는다", () => {
    expect(approach(0, 100, FOLLOW_SMOOTH_MS, FOLLOW_SMOOTH_MS, 0.01)).toBeCloseTo(63.21, 1);
    expect(approach(99.995, 100, 16, FOLLOW_SMOOTH_MS, 0.01)).toBe(100);
    expect(approach(0, 100, 16, 0, 0.01)).toBe(100);
  });

  it("따라가는 유닛 자리로 목표점이 날아가 닿고, 닿으면 멈춘다(높이·방위·거리는 그대로)", () => {
    const glide = new CameraGlide();
    expect(glide.active).toBe(false);
    glide.follow(7);
    expect(glide.active).toBe(true);
    const half = run(glide, start, { x: 600, z: 300 }, 10);
    expect(half.busy).toBe(true);
    expect(half.state.targetX).toBeGreaterThan(300);
    expect(half.state.targetX).toBeLessThan(600);
    const done = run(glide, half.state, { x: 600, z: 300 }, 200);
    expect(done.busy).toBe(false);
    expect(done.state.targetX).toBe(600);
    expect(done.state.targetZ).toBe(300);
    expect(done.state.distance).toBe(start.distance);
    expect(done.state.yaw).toBe(start.yaw);
  });

  it("유닛 자리를 모르면(목록에 없음) 목표점을 두고, 빠르기 0이면 한 번에 맞춘다", () => {
    const glide = new CameraGlide();
    glide.follow(7);
    expect(run(glide, start, null, 5).state).toEqual(start);
    const snapped = glide.step(start, { x: 250, z: 260 }, 16, limits, 0);
    expect(snapped.state.targetX).toBe(250);
    expect(snapped.state.targetZ).toBe(260);
    expect(snapped.busy).toBe(false);
  });

  it("따라가는 목표는 보기 범위(원) 안으로 묶는다", () => {
    const area = { ...limits, area: [{ x: 100, z: 100, r: 50 }] };
    const glide = new CameraGlide();
    glide.follow(1);
    let now = start;
    for (let i = 0; i < 300; i++) now = glide.step(now, { x: 400, z: 100 }, 16, area).state;
    expect(now.targetX).toBeCloseTo(150, 6);
    expect(now.targetZ).toBeCloseTo(100, 6);
  });

  it("확대 움직임: 목표 거리에 닿으면 목표를 지우고, 한계 밖 목표는 한계로", () => {
    const glide = new CameraGlide();
    glide.zoomTo(limits.maxDistance * 10);
    const done = run(glide, start, null, 200);
    expect(done.state.distance).toBe(limits.maxDistance);
    expect(done.busy).toBe(false);
    expect(glide.distanceGoal).toBeNull();
    expect(glide.active).toBe(false);
    glide.zoomTo(limits.minDistance);
    const moving = run(glide, done.state, null, 3);
    expect(moving.busy).toBe(true);
    expect(moving.state.distance).toBeLessThan(limits.maxDistance);
    glide.stopZoom();
    expect(glide.active).toBe(false);
  });
});
