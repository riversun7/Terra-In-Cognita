import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STOPPED, addNote, guard, modeOrder, startNotes } from "./gpuBenchPlan.ts";
import { BENCH_MODES } from "./gpuBenchTypes.ts";

const noop = (): void => undefined;

/** 밖에서 풀 수 있는 약속 */
function deferred<T>() {
  let resolve: (value: T) => void = noop;
  let reject: (error: unknown) => void = noop;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("잴 순서", () => {
  it("타일 수마다 한 칸씩 돌려 방식마다 한 번은 맨 앞에 온다", () => {
    expect(modeOrder(BENCH_MODES, 0)).toEqual(["webgl-glsl", "webgpu-tsl", "webgl2-tsl"]);
    expect(modeOrder(BENCH_MODES, 1)).toEqual(["webgpu-tsl", "webgl2-tsl", "webgl-glsl"]);
    expect(modeOrder(BENCH_MODES, 2)).toEqual(["webgl2-tsl", "webgl-glsl", "webgpu-tsl"]);
    expect(modeOrder(BENCH_MODES, 3)).toEqual(modeOrder(BENCH_MODES, 0));
    const firsts = [0, 1, 2].map((round) => modeOrder(BENCH_MODES, round)[0]);
    expect(new Set(firsts).size).toBe(3);
  });

  it("고른 방식만 돌리고 원본 배열은 그대로 둔다", () => {
    const modes = ["webgpu-tsl", "webgl-glsl"] as const;
    expect(modeOrder(modes, 1)).toEqual(["webgl-glsl", "webgpu-tsl"]);
    expect(modes).toEqual(["webgpu-tsl", "webgl-glsl"]);
    expect(modeOrder([], 2)).toEqual([]);
  });
});

describe("메모 붙이기", () => {
  it("앞 메모 뒤에 덧붙인다", () => {
    expect(addNote(null, "first_use")).toBe("first_use");
    expect(addNote("first_use", "no_msaa")).toBe("first_use; no_msaa");
  });
});

describe("렌더러를 켠 뒤 붙이는 메모", () => {
  it("그 API를 처음 켠 줄에만 first_use", () => {
    expect(startNotes({ backend: "webgl2", samples: 4, compatibilityMode: null }, true)).toEqual([
      "first_use",
    ]);
    expect(startNotes({ backend: "webgl2", samples: 4, compatibilityMode: null }, false)).toEqual([]);
  });

  it("WebGPU 호환 모드라 MSAA가 꺼졌을 때만 no_msaa", () => {
    expect(startNotes({ backend: "webgpu", samples: 0, compatibilityMode: true }, false)).toEqual([
      "no_msaa",
    ]);
    expect(startNotes({ backend: "webgpu", samples: 0, compatibilityMode: true }, true)).toEqual([
      "first_use",
      "no_msaa",
    ]);
    expect(startNotes({ backend: "webgpu", samples: 4, compatibilityMode: false }, false)).toEqual([]);
    expect(startNotes({ backend: "webgl2", samples: 0, compatibilityMode: null }, false)).toEqual([]);
  });
});

describe("시간 상한·멈춤과 겨루는 기다림", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("먼저 풀리면 그 값을 돌려준다", async () => {
    const work = deferred<number>();
    const waiting = guard(work.promise, {
      ms: 100,
      label: "init_timeout",
      signal: new AbortController().signal,
    });
    work.resolve(7);
    await expect(waiting).resolves.toBe(7);
  });

  it("시간이 넘으면 그 이름으로 실패하고, 늦게 생긴 값은 버리라고 넘긴다", async () => {
    const work = deferred<string>();
    const late = vi.fn();
    const waiting = guard(work.promise, {
      ms: 100,
      label: "init_timeout",
      signal: new AbortController().signal,
      onLate: late,
    });
    const outcome = expect(waiting).rejects.toThrow("init_timeout");
    await vi.advanceTimersByTimeAsync(100);
    await outcome;
    work.resolve("session");
    await vi.advanceTimersByTimeAsync(0);
    expect(late).toHaveBeenCalledWith("session");
  });

  it("멈추면 바로 그만두고, 늦게 생긴 값은 버리라고 넘긴다", async () => {
    const work = deferred<string>();
    const controller = new AbortController();
    const late = vi.fn();
    const waiting = guard(work.promise, {
      ms: 60_000,
      label: "compile_timeout",
      signal: controller.signal,
      onLate: late,
    });
    controller.abort();
    await expect(waiting).rejects.toThrow(STOPPED);
    work.resolve("session");
    await vi.advanceTimersByTimeAsync(0);
    expect(late).toHaveBeenCalledTimes(1);
  });

  it("이미 멈춘 뒤면 기다리지 않는다", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      guard(new Promise<never>(() => undefined), { ms: 100, label: "x", signal: controller.signal }),
    ).rejects.toThrow(STOPPED);
  });

  it("먼저 실패하면 그 오류로 실패한다. 그만둔 뒤의 실패는 삼킨다", async () => {
    const first = deferred<number>();
    const failing = guard(first.promise, { ms: 100, label: "x", signal: new AbortController().signal });
    first.reject(new Error("webgl2_unavailable"));
    await expect(failing).rejects.toThrow("webgl2_unavailable");

    const second = deferred<number>();
    const late = vi.fn();
    const timedOut = guard(second.promise, {
      ms: 10,
      label: "x",
      signal: new AbortController().signal,
      onLate: late,
    });
    const outcome = expect(timedOut).rejects.toThrow("x");
    await vi.advanceTimersByTimeAsync(10);
    await outcome;
    second.reject(new Error("late failure"));
    await vi.advanceTimersByTimeAsync(0);
    expect(late).not.toHaveBeenCalled();
  });
});
