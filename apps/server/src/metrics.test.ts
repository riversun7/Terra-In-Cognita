import { monitorEventLoopDelay } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { readServerMetrics } from "./metrics.ts";

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

  it("기록하면 ms 단위로 바꾼다", async () => {
    const histogram = monitorEventLoopDelay({ resolution: 10 });
    histogram.enable();
    await new Promise((resolve) => setTimeout(resolve, 60));
    histogram.disable();
    const metrics = readServerMetrics(histogram, 0);
    expect(metrics.eventLoopMaxMs).toBeGreaterThan(0);
    // 나노초를 그대로 냈다면 수백만이 된다
    expect(metrics.eventLoopMaxMs).toBeLessThan(10_000);
  });
});
