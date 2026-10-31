import { describe, expect, it } from "vitest";
import {
  CLOUD_LOOK,
  CLOUD_TIMING,
  CloudSchedule,
  type CloudScheduleInput,
  type CloudStep,
  cloudLiftM,
} from "./cloudSchedule.ts";

const idleAt = (nowMs: number, windowIndex = 10): CloudScheduleInput => ({
  nowMs,
  windowIndex,
  climateReady: true,
  idle: true,
  visible: true,
  msUntilIdle: null,
});

/** 쉬는 프레임 6번(면 0~5)을 16ms 간격으로 */
function bakeAll(schedule: CloudSchedule, startMs: number, windowIndex = 10): CloudStep[] {
  return Array.from({ length: 6 }, (_, i) => schedule.step(idleAt(startMs + i * 16, windowIndex)));
}

describe("구름 굽기 예약", () => {
  it("첫 단계 타일을 기다린다: 10초 전에는 굽지 않고 남은 시간을 알린다, 10초 뒤에는 없는 타일을 바다로 보고 굽는다", () => {
    const schedule = new CloudSchedule();
    const waiting = schedule.step({ ...idleAt(0), climateReady: false });
    expect(waiting).toMatchObject({
      bakeFace: null,
      fade: 0,
      animating: false,
      wakeInMs: CLOUD_TIMING.climateWaitMs,
    });
    expect(schedule.step({ ...idleAt(4000), climateReady: false }).wakeInMs).toBe(6000);
    expect(schedule.step({ ...idleAt(CLOUD_TIMING.climateWaitMs), climateReady: false }).bakeFace).toBe(0);
  });

  it("쉬는 프레임마다 면 하나(0~5), 굽는 동안 껍질 숨김, 그다음 1초에 걸쳐 나타난다", () => {
    const schedule = new CloudSchedule();
    const steps = bakeAll(schedule, 0);
    expect(steps.map((step) => step.bakeFace)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(steps.every((step) => step.fade === 0 && step.animating)).toBe(true);
    expect(schedule.bakes).toBe(1);
    expect(schedule.phase).toBe("showing");
    const start = 80;
    // 3차 ease-out: 반에서 0.875(바로 보이기 시작해 부드럽게 멈춘다)
    expect(schedule.step(idleAt(start + CLOUD_TIMING.fadeMs / 2)).fade).toBeCloseTo(0.875, 3);
    const done = schedule.step(idleAt(start + CLOUD_TIMING.fadeMs + 10));
    expect(done).toMatchObject({ bakeFace: null, fade: 1, animating: false });
    expect(schedule.phase).toBe("shown");
  });

  it("손가락 동작 중·끝난 지 300ms 안이면 미루고, 남은 시간을 알린다(쉬면 이어서 굽는다)", () => {
    const schedule = new CloudSchedule();
    schedule.step(idleAt(0));
    schedule.step(idleAt(16));
    const busy = schedule.step({ ...idleAt(32), idle: false, msUntilIdle: 120 });
    expect(busy).toMatchObject({ bakeFace: null, animating: false, wakeInMs: 120 });
    expect(schedule.step(idleAt(200)).bakeFace).toBe(2);
  });

  it("날씨 창이 바뀌면 쉬는 프레임에 1초 숨기고 → 다시 굽고(새 창) → 1초 나타난다. 쉬지 못하면 옛 구름을 둔다", () => {
    const schedule = new CloudSchedule();
    bakeAll(schedule, 0);
    schedule.step(idleAt(2000));
    expect(schedule.phase).toBe("shown");
    // 창 11: 동작 중이면 옛 구름 그대로
    expect(schedule.step({ ...idleAt(3000, 11), idle: false, msUntilIdle: null })).toMatchObject({
      fade: 1,
      animating: false,
    });
    expect(schedule.step(idleAt(3100, 11))).toMatchObject({ fade: 1, animating: true });
    expect(schedule.phase).toBe("hiding");
    expect(schedule.step(idleAt(3600, 11)).fade).toBeCloseTo(0.125, 3);
    expect(schedule.step(idleAt(4200, 11))).toMatchObject({ bakeFace: null, fade: 0, animating: true });
    const again = bakeAll(schedule, 4300, 11);
    expect(again.map((step) => step.bakeFace)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(again[0]?.windowIndex).toBe(11);
    expect(schedule.bakes).toBe(2);
  });

  it("창이 그대로면(fixed 시각) 한 번만 굽는다", () => {
    const schedule = new CloudSchedule();
    bakeAll(schedule, 0);
    for (let t = 2000; t < 600_000; t += 50_000) {
      expect(schedule.step(idleAt(t)).bakeFace).toBeNull();
    }
    expect(schedule.bakes).toBe(1);
  });

  it("구름이 보이지 않는 거리(1.2R 안)에서는 굽지 않는다. 그 사이 창이 바뀌면 숨기기 없이 굽기로 돌아가 멀어지면 굽는다", () => {
    const schedule = new CloudSchedule();
    const near = (nowMs: number, windowIndex = 10): CloudScheduleInput => ({
      ...idleAt(nowMs, windowIndex),
      visible: false,
    });
    for (let t = 0; t < 30_000; t += 5000) {
      expect(schedule.step(near(t))).toMatchObject({
        bakeFace: null,
        fade: 0,
        animating: false,
        wakeInMs: null,
      });
    }
    expect(schedule.bakes).toBe(0);
    expect(bakeAll(schedule, 30_000).map((step) => step.bakeFace)).toEqual([0, 1, 2, 3, 4, 5]);
    schedule.step(idleAt(32_000));
    expect(schedule.phase).toBe("shown");
    // 가까이 있는 동안 창이 바뀐다: 옛 구름을 숨길 것 없이 바로 굽기(보이지 않으니 아직 굽지 않는다)
    expect(schedule.step(near(40_000, 11))).toMatchObject({ bakeFace: null, fade: 0, animating: false });
    expect(schedule.phase).toBe("baking");
    expect(schedule.step(near(41_000, 11)).bakeFace).toBeNull();
    // 멀어지면 숨긴 채(fade 0) 새 창으로 굽고 나타난다
    const again = bakeAll(schedule, 42_000, 11);
    expect(again.map((step) => step.bakeFace)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(again.every((step) => step.fade === 0)).toBe(true);
    expect(again[0]?.windowIndex).toBe(11);
    expect(schedule.bakes).toBe(2);
  });

  it("컨텍스트 복구: 숨긴 채 처음 면부터 다시 굽는다", () => {
    const schedule = new CloudSchedule();
    bakeAll(schedule, 0);
    schedule.step(idleAt(2000));
    schedule.invalidate();
    const again = bakeAll(schedule, 3000);
    expect(again.map((step) => step.bakeFace)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(again.every((step) => step.fade === 0)).toBe(true);
  });
});

describe("구름 높이", () => {
  it("600 게임 m × 과장, 대기 띠 두께(0.018R)의 0.9배 아래", () => {
    const R = 531_000;
    expect(cloudLiftM(R, 6)).toBe(3600);
    expect(cloudLiftM(R, 1)).toBe(CLOUD_LOOK.heightGameM);
    expect(cloudLiftM(R, 20)).toBeCloseTo(R * 0.018 * 0.9, 9);
    expect(cloudLiftM(R, 50)).toBeLessThan(R * 0.018);
  });
});
