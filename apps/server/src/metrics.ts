// 서버 지표 — 1분마다 구조화 로그 한 줄로 남긴다 (PLAN 9.5). 관리자 대시보드가 생기면 그쪽으로도 보낸다.
// 보는 법(NAS): docker logs tic-app | grep '"metric":"server"'
import { type ELDHistogram, monitorEventLoopDelay } from "node:perf_hooks";
import type { FastifyBaseLogger } from "fastify";

export interface ServerMetrics {
  metric: "server";
  /** 이벤트 루프 지연(ms) — S3 통과 기준은 p99 < 50ms */
  eventLoopP50Ms: number;
  eventLoopP99Ms: number;
  eventLoopMaxMs: number;
  rssMb: number;
  heapUsedMb: number;
  wsConnections: number;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;
const NS_PER_MS = 1e6;
const BYTES_PER_MB = 1024 * 1024;

/** 지금까지 모은 값으로 지표를 만든다 (기록이 없으면 지연은 0) */
export function readServerMetrics(histogram: ELDHistogram, wsConnections: number): ServerMetrics {
  const delay = (ns: number): number =>
    histogram.count > 0 && Number.isFinite(ns) ? round1(ns / NS_PER_MS) : 0;
  const memory = process.memoryUsage();
  return {
    metric: "server",
    eventLoopP50Ms: delay(histogram.percentile(50)),
    eventLoopP99Ms: delay(histogram.percentile(99)),
    eventLoopMaxMs: delay(histogram.max),
    rssMb: round1(memory.rss / BYTES_PER_MB),
    heapUsedMb: round1(memory.heapUsed / BYTES_PER_MB),
    wsConnections,
  };
}

/** 주기적으로 지표를 기록한다. 멈추는 함수를 돌려준다. */
export function startServerMetrics(
  log: FastifyBaseLogger,
  wsConnections: () => number,
  intervalMs = 60_000,
): () => void {
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();
  const timer = setInterval(() => {
    log.info(readServerMetrics(histogram, wsConnections()), "server metrics");
    histogram.reset();
  }, intervalMs);
  // 이 타이머 때문에 프로세스가 안 꺼지는 일이 없게
  timer.unref();
  return () => {
    clearInterval(timer);
    histogram.disable();
  };
}
