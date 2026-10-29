// 서버 지표 — 1분마다 구조화 로그 한 줄로 남긴다 (PLAN 9.5). 관리자 대시보드가 생기면 그쪽으로도 보낸다.
// 보는 법(NAS): docker logs tic-app | grep '"metric":"server"'
import { type ELDHistogram, monitorEventLoopDelay } from "node:perf_hooks";
import type { FastifyBaseLogger } from "fastify";

/**
 * 이벤트 루프 지연을 재는 타이머 간격(ms). Node 히스토그램은 지연이 아니라 타이머 사이 간격을 적는다
 * (쉬고 있을 때도 약 20.1ms — Verified 2026-10-29, Node 24.22.1). 그래서 지연 = 적힌 값 − 이 간격이다.
 */
export const EVENT_LOOP_RESOLUTION_MS = 20;

export interface ServerMetrics {
  metric: "server";
  /** 이벤트 루프 지연(ms, 측정 간격을 뺀 값) — S3 통과 기준은 p99 < 50ms */
  eventLoopP50Ms: number;
  eventLoopP99Ms: number;
  eventLoopMaxMs: number;
  rssMb: number;
  heapUsedMb: number;
  wsConnections: number;
  /** 구간 동안 쓴 CPU(%, 코어 하나 기준). 워커 스레드를 포함하므로 100을 넘을 수 있다. 구간이 없으면 0 */
  cpuPercent: number;
}

/** CPU 구간: 쓴 CPU 시간(µs, 사용자 + 커널)과 걸린 실제 시간(ms) */
export interface CpuWindow {
  usedMicros: number;
  elapsedMs: number;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;
const NS_PER_MS = 1e6;
const MICROS_PER_MS = 1000;
const BYTES_PER_MB = 1024 * 1024;

/** 지표에 쓰는 히스토그램 값(시험에서는 가짜를 넣는다) */
export type DelayHistogram = Pick<ELDHistogram, "count" | "max" | "percentile">;

/** 코어 하나 기준 CPU 사용률(%). 걸린 시간이 0 이하이거나 값이 이상하면 0 */
export function cpuPercentOf(window: CpuWindow | undefined): number {
  if (!window || !(window.elapsedMs > 0) || !Number.isFinite(window.usedMicros)) return 0;
  return round1(Math.max(0, (window.usedMicros / MICROS_PER_MS / window.elapsedMs) * 100));
}

/** 지금까지 모은 값으로 지표를 만든다 (기록이 없으면 지연은 0) */
export function readServerMetrics(
  histogram: DelayHistogram,
  wsConnections: number,
  resolutionMs = EVENT_LOOP_RESOLUTION_MS,
  cpu?: CpuWindow,
): ServerMetrics {
  const delay = (ns: number): number =>
    histogram.count > 0 && Number.isFinite(ns) ? round1(Math.max(0, ns / NS_PER_MS - resolutionMs)) : 0;
  const memory = process.memoryUsage();
  return {
    metric: "server",
    eventLoopP50Ms: delay(histogram.percentile(50)),
    eventLoopP99Ms: delay(histogram.percentile(99)),
    eventLoopMaxMs: delay(histogram.max),
    rssMb: round1(memory.rss / BYTES_PER_MB),
    heapUsedMb: round1(memory.heapUsed / BYTES_PER_MB),
    wsConnections,
    cpuPercent: cpuPercentOf(cpu),
  };
}

/**
 * 주기적으로 지표를 기록한다. 멈추는 함수를 돌려준다.
 * extra: 같은 줄에 붙일 값(S1 2차맵 측정값, src/world/worldStats.ts). 부를 때마다 그 구간 값을 주고 비운다.
 */
export function startServerMetrics(
  log: FastifyBaseLogger,
  wsConnections: () => number,
  intervalMs = 60_000,
  extra?: () => Record<string, number>,
): () => void {
  const histogram = monitorEventLoopDelay({ resolution: EVENT_LOOP_RESOLUTION_MS });
  histogram.enable();
  // CPU는 프로세스 전체(경로 워커 스레드 포함) 값이다. 구간마다 앞 구간 끝과의 차이를 쓴다
  let cpuMark = process.cpuUsage();
  let wallMark = performance.now();
  const timer = setInterval(() => {
    const used = process.cpuUsage(cpuMark);
    const now = performance.now();
    const cpu = { usedMicros: used.user + used.system, elapsedMs: now - wallMark };
    cpuMark = process.cpuUsage();
    wallMark = now;
    log.info(
      { ...readServerMetrics(histogram, wsConnections(), EVENT_LOOP_RESOLUTION_MS, cpu), ...extra?.() },
      "server metrics",
    );
    histogram.reset();
  }, intervalMs);
  // 이 타이머 때문에 프로세스가 안 꺼지는 일이 없게
  timer.unref();
  return () => {
    clearInterval(timer);
    histogram.disable();
  };
}
