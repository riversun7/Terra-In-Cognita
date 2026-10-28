import { monitorEventLoopDelay } from "node:perf_hooks";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { readServerMetrics, startServerMetrics } from "./metrics.ts";

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
