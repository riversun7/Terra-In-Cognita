import { describe, expect, it } from "vitest";
import {
  type FenceContext,
  MAX_PENDING,
  type WorkDoneDevice,
  webglDoneTracker,
  webgpuDoneTracker,
} from "./gpuBenchGpuDone.ts";

/** 시험 시계 */
function clock(start = 0) {
  let time = start;
  return { now: () => time, set: (value: number) => (time = value) };
}

/** 약속 뒤처리(then)를 돌린다 */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** 가짜 WebGL2: fence마다 끝났는지 표시를 둔다 */
function fakeGl() {
  const signaled = new Map<WebGLSync, boolean>();
  const deleted: WebGLSync[] = [];
  const order: WebGLSync[] = [];
  const gl: FenceContext = {
    SYNC_GPU_COMMANDS_COMPLETE: 0x9117,
    SYNC_STATUS: 0x9114,
    SIGNALED: 0x9119,
    fenceSync: () => {
      const sync: WebGLSync = {};
      signaled.set(sync, false);
      order.push(sync);
      return sync;
    },
    getSyncParameter: (sync) => (signaled.get(sync) ? 0x9119 : 0x9118),
    deleteSync: (sync) => {
      if (sync) deleted.push(sync);
    },
  };
  const signal = (index: number): void => {
    const sync = order[index];
    if (sync) signaled.set(sync, true);
  };
  return { gl, signal, deleted };
}

/** 가짜 WebGPU 장치: 제출마다 밖에서 풀 수 있는 약속 */
function fakeDevice() {
  const works: { resolve: () => void; reject: (error: Error) => void }[] = [];
  const device: WorkDoneDevice = {
    queue: {
      onSubmittedWorkDone: () =>
        new Promise<undefined>((resolve, reject) => {
          works.push({ resolve: () => resolve(undefined), reject });
        }),
    },
  };
  return { device, works };
}

describe("GPU 완료 재기 — WebGL2 fence", () => {
  it("끝난 것을 본 프레임 시작 시각으로 재고, 차례로 꺼낸다", () => {
    const time = clock();
    const { gl, signal, deleted } = fakeGl();
    const tracker = webglDoneTracker(gl, time.now);
    tracker.mark();
    time.set(16);
    tracker.mark();
    time.set(33);
    expect(tracker.collect()).toEqual([]);
    // 두 번째가 먼저 끝났다고 해도 앞의 것이 안 끝났으면 기다린다(같은 큐)
    signal(1);
    time.set(40);
    expect(tracker.collect()).toEqual([]);
    signal(0);
    time.set(50);
    expect(tracker.collect()).toEqual([50, 34]);
    expect(tracker.pending()).toBe(0);
    expect(deleted).toHaveLength(2);
  });

  it("상한까지만 표시한다", () => {
    const { gl } = fakeGl();
    const tracker = webglDoneTracker(gl, clock().now);
    for (let i = 0; i < MAX_PENDING + 5; i++) tracker.mark();
    expect(tracker.pending()).toBe(MAX_PENDING);
  });
});

describe("GPU 완료 재기 — WebGPU onSubmittedWorkDone", () => {
  it("약속이 풀린 때가 아니라 그 뒤 프레임 시작(collect) 시각으로 잰다 — WebGL2와 같은 방법", async () => {
    const time = clock();
    const { device, works } = fakeDevice();
    const tracker = webgpuDoneTracker(device, time.now);
    tracker.mark();
    // GPU가 5ms에 끝냈다
    time.set(5);
    works[0]?.resolve();
    await flush();
    expect(tracker.pending()).toBe(1);
    // 다음 프레임 시작(16.7ms)에 끝난 것을 본다 → 지연 16.7ms(5ms가 아니다)
    time.set(16.7);
    expect(tracker.collect()).toEqual([16.7]);
    expect(tracker.pending()).toBe(0);
    expect(tracker.collect()).toEqual([]);
  });

  it("차례로 꺼내고, 실패는 세기만 하고 지연에 넣지 않는다", async () => {
    const time = clock();
    const { device, works } = fakeDevice();
    const tracker = webgpuDoneTracker(device, time.now);
    tracker.mark();
    time.set(10);
    tracker.mark();
    time.set(20);
    tracker.mark();
    works[1]?.resolve();
    await flush();
    time.set(30);
    expect(tracker.collect()).toEqual([]);
    works[0]?.reject(new Error("A valid external Instance reference no longer exists."));
    await flush();
    time.set(40);
    expect(tracker.collect()).toEqual([30]);
    expect(tracker.pending()).toBe(1);
    expect(tracker.failures()).toEqual({
      count: 1,
      last: "A valid external Instance reference no longer exists.",
    });
  });

  it("상한까지만 표시하고, 버린 뒤에는 세지 않는다", async () => {
    const { device, works } = fakeDevice();
    const tracker = webgpuDoneTracker(device, clock().now);
    for (let i = 0; i < MAX_PENDING + 5; i++) tracker.mark();
    expect(tracker.pending()).toBe(MAX_PENDING);
    expect(works).toHaveLength(MAX_PENDING);
    tracker.dispose();
    for (const work of works) work.reject(new Error("destroyed"));
    await flush();
    expect(tracker.failures().count).toBe(0);
    expect(tracker.pending()).toBe(0);
    tracker.mark();
    expect(tracker.pending()).toBe(0);
  });
});
