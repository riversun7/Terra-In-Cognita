import { monitorEventLoopDelay } from "node:perf_hooks";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { cpuPercentOf, readServerMetrics, startServerMetrics } from "./metrics.ts";

describe("서버 지표", () => {
  it("기록 전에는 지연 0, 메모리와 접속 수는 그대로", () => {
    const histogram = monitorEventLoopDelay({ resolution: 10 });
    const metrics = readServerMetrics(histogram, 2);
    expect(metrics).toMatchObject({
      metric: "server",
      eventLoopP50Ms: 0,
      eventLoopP99Ms: 0,
      eventLoopMaxMs: 0,
      wsConnections: 2,
    });
    expect(metrics.rssMb).toBeGreaterThan(0);
    expect(metrics.heapUsedMb).toBeGreaterThan(0);
    // CPU 구간을 주지 않으면 0
    expect(metrics.cpuPercent).toBe(0);
  });

  it("CPU 사용률은 코어 하나 기준 %(쓴 µs ÷ 걸린 ms), 구간이 없거나 이상하면 0", () => {
    // 1분 동안 0.84초를 썼다 → 1.4%
    expect(cpuPercentOf({ usedMicros: 840_000, elapsedMs: 60_000 })).toBe(1.4);
    // 워커 스레드까지 합치면 한 코어를 넘을 수 있다
    expect(cpuPercentOf({ usedMicros: 90_000_000, elapsedMs: 60_000 })).toBe(150);
    expect(cpuPercentOf({ usedMicros: 1_000, elapsedMs: 0 })).toBe(0);
    expect(cpuPercentOf({ usedMicros: Number.NaN, elapsedMs: 1_000 })).toBe(0);
    expect(cpuPercentOf(undefined)).toBe(0);
    const histogram = { count: 0, max: 0, percentile: () => 0 };
    expect(readServerMetrics(histogram, 0, 20, { usedMicros: 600_000, elapsedMs: 60_000 }).cpuPercent).toBe(
      1,
    );
  });

  it("실제 CPU: 루프를 막고 돌리면 그 구간 사용률이 높게 나온다", () => {
    const mark = process.cpuUsage();
    const startedAt = performance.now();
    const end = startedAt + 50;
    while (performance.now() < end) {
      // CPU를 50ms 쓴다
    }
    const used = process.cpuUsage(mark);
    const percent = cpuPercentOf({
      usedMicros: used.user + used.system,
      elapsedMs: performance.now() - startedAt,
    });
    // 바쁘게 돈 구간은 한 코어 가까이 쓴다. 공유 CPU라 범위를 넓게 보고, 단위 실수(1000배)만 잡는다
    expect(percent).toBeGreaterThan(5);
    expect(percent).toBeLessThan(400);
  });

  it("나노초를 ms로 바꾸고 측정 간격을 뺀다(간격보다 짧은 값은 0)", () => {
    // 히스토그램은 타이머 사이 간격을 적는다: 20ms 간격 + 지연
    const values = new Map([
      [50, 20.4e6],
      [99, 25e6],
    ]);
    const histogram = { count: 3, max: 70e6, percentile: (p: number) => values.get(p) ?? 0 };
    expect(readServerMetrics(histogram, 0, 20)).toMatchObject({
      eventLoopP50Ms: 0.4,
      eventLoopP99Ms: 5,
      eventLoopMaxMs: 50,
    });
    expect(readServerMetrics({ ...histogram, max: 19e6 }, 0, 20).eventLoopMaxMs).toBe(0);
  });

  it("실제 히스토그램: 쉬면 거의 0, 루프를 막으면 막은 만큼", async () => {
    const histogram = monitorEventLoopDelay({ resolution: 10 });
    histogram.enable();
    await new Promise((resolve) => setTimeout(resolve, 40));
    const end = performance.now() + 80;
    while (performance.now() < end) {
      // 이벤트 루프를 80ms 막는다
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
    histogram.disable();
    const metrics = readServerMetrics(histogram, 0, 10);
    expect(metrics.eventLoopP50Ms).toBeLessThan(5);
    expect(metrics.eventLoopMaxMs).toBeGreaterThanOrEqual(60);
    // 나노초를 그대로 냈다면 수백만이 된다
    expect(metrics.eventLoopMaxMs).toBeLessThan(10_000);
  });
});

describe("지표 한 줄", () => {
  it("간격마다 서버 지표와 덧붙인 값(S1 측정값)을 한 줄로 남긴다", async () => {
    vi.useFakeTimers();
    try {
      const app = Fastify({ logger: false });
      const info = vi.spyOn(app.log, "info");
      let calls = 0;
      const stop = startServerMetrics(
        app.log,
        () => 3,
        1_000,
        () => {
          calls += 1;
          return { s1Units: 1_000, pathRequestsPerSec: 2.5 };
        },
      );
      await vi.advanceTimersByTimeAsync(2_000);
      stop();
      expect(calls).toBe(2);
      expect(info).toHaveBeenLastCalledWith(
        expect.objectContaining({
          metric: "server",
          wsConnections: 3,
          cpuPercent: expect.any(Number),
          s1Units: 1_000,
          pathRequestsPerSec: 2.5,
        }),
        "server metrics",
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
