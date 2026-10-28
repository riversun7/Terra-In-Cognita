import { describe, expect, it } from "vitest";
import { FrameScheduler, type FrameSource } from "./frameScheduler.ts";

/** 손으로 돌리는 requestAnimationFrame */
function fakeFrames(): FrameSource & { run(time: number): void; pending(): number } {
  let next = 1;
  const callbacks = new Map<number, (time: number) => void>();
  return {
    requestFrame(callback) {
      const handle = next++;
      callbacks.set(handle, callback);
      return handle;
    },
    cancelFrame(handle) {
      callbacks.delete(handle);
    },
    run(time) {
      const due = [...callbacks.values()];
      callbacks.clear();
      for (const callback of due) callback(time);
    },
    pending: () => callbacks.size,
  };
}

describe("FrameScheduler", () => {
  it("여러 번 요청해도 프레임은 하나만 예약한다", () => {
    const frames = fakeFrames();
    let drawn = 0;
    const scheduler = new FrameScheduler(() => {
      drawn += 1;
      return false;
    }, frames);
    scheduler.request();
    scheduler.request();
    expect(frames.pending()).toBe(1);
    frames.run(16);
    expect(drawn).toBe(1);
    // 바뀐 것이 없으면 멈춘다
    expect(frames.pending()).toBe(0);
    expect(scheduler.scheduled).toBe(false);
  });

  it("움직이는 동안(true) 계속 그리고, 간격은 첫 프레임 0, 상한 100ms", () => {
    const frames = fakeFrames();
    const deltas: number[] = [];
    let keep = 3;
    const scheduler = new FrameScheduler((_time, delta) => {
      deltas.push(delta);
      keep -= 1;
      return keep > 0;
    }, frames);
    scheduler.request();
    frames.run(1000);
    frames.run(1016);
    frames.run(2000);
    expect(deltas).toEqual([0, 16, 100]);
    expect(frames.pending()).toBe(0);
  });

  it("멈춘 동안(컨텍스트 손실) 요청은 미뤘다가 다시 시작할 때 한 번 그린다", () => {
    const frames = fakeFrames();
    let drawn = 0;
    const scheduler = new FrameScheduler(() => {
      drawn += 1;
      return false;
    }, frames);
    scheduler.request();
    scheduler.pause();
    expect(frames.pending()).toBe(0);
    scheduler.request();
    expect(frames.pending()).toBe(0);
    scheduler.resume();
    frames.run(16);
    expect(drawn).toBe(1);
  });

  it("끝낸 뒤에는 그리지 않는다", () => {
    const frames = fakeFrames();
    let drawn = 0;
    const scheduler = new FrameScheduler(() => {
      drawn += 1;
      return true;
    }, frames);
    scheduler.request();
    scheduler.stop();
    frames.run(16);
    scheduler.request();
    scheduler.resume();
    expect(frames.pending()).toBe(0);
    expect(drawn).toBe(0);
  });
});
