// S1 측정값 — 1분마다 서버 지표 한 줄(src/metrics.ts)에 붙는다. 보는 법: docker logs tic-app | grep '"metric":"server"'
// 구간마다 모으고, 지표를 쓸 때 요약한 뒤 비운다. 비율(…PerSec)은 구간 길이로 나눈 값이다.
import type { PathOutcome } from "./pathService.ts";
import { type StreamStats, emptyStreamStats } from "./mapStream.ts";

/** 구간 하나에 모으는 표본 수 상한(넘으면 버린다 — 백분위가 조금 덜 정확해질 뿐) */
const MAX_SAMPLES = 50_000;

export interface PathStats {
  requests: number;
  /** 결과 상태별 수(found, no_path, budget_exceeded, busy, dropped …) */
  outcomes: Map<string, number>;
  /** 격자가 바뀐 뒤 온 결과라 다시 찾은 수 */
  staleReplans: number;
  /** 건물 때문에 막힌 경로를 다시 찾은 수 */
  blockedReplans: number;
  waitMs: number[];
  computeMs: number[];
}

export interface WorldStats {
  paths: PathStats;
  stream: StreamStats;
  commands: number;
}

export function emptyWorldStats(): WorldStats {
  return {
    paths: {
      requests: 0,
      outcomes: new Map(),
      staleReplans: 0,
      blockedReplans: 0,
      waitMs: [],
      computeMs: [],
    },
    stream: emptyStreamStats(),
    commands: 0,
  };
}

export function recordPathOutcome(stats: PathStats, outcome: PathOutcome): void {
  stats.outcomes.set(outcome.status, (stats.outcomes.get(outcome.status) ?? 0) + 1);
  if (stats.waitMs.length < MAX_SAMPLES) stats.waitMs.push(outcome.waitMs);
  if ("computeMs" in outcome && stats.computeMs.length < MAX_SAMPLES) stats.computeMs.push(outcome.computeMs);
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** 정렬한 표본의 백분위(가장 가까운 순위). 표본이 없으면 0 */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))] ?? 0;
}

function spread(samples: readonly number[]): { p50: number; p95: number; max: number } {
  const sorted = samples.toSorted((a, b) => a - b);
  return {
    p50: round1(percentile(sorted, 0.5)),
    p95: round1(percentile(sorted, 0.95)),
    max: round1(sorted.at(-1) ?? 0),
  };
}

export interface WorldGauges {
  units: number;
  moving: number;
  planning: number;
  subscribers: number;
  pathQueue: number;
}

/** 지표 한 줄에 넣을 값(숫자만). stats는 그대로 두고, 비우는 것은 부르는 쪽이 한다 */
export function summarizeWorldStats(
  stats: WorldStats,
  gauges: WorldGauges,
  windowMs: number,
): Record<string, number> {
  const seconds = Math.max(windowMs, 1) / 1000;
  const perSec = (count: number): number => round1(count / seconds);
  const outcome = (status: string): number => stats.paths.outcomes.get(status) ?? 0;
  const failed = [
    "no_path",
    "start_blocked",
    "goal_blocked",
    "invalid_request",
    "unknown_map",
    "path_too_complex",
  ]
    .map(outcome)
    .reduce((a, b) => a + b, 0);
  const wait = spread(stats.paths.waitMs);
  const compute = spread(stats.paths.computeMs);
  return {
    s1Units: gauges.units,
    s1Moving: gauges.moving,
    s1Planning: gauges.planning,
    s1Subscribers: gauges.subscribers,
    pathQueue: gauges.pathQueue,
    pathRequestsPerSec: perSec(stats.paths.requests),
    pathFound: outcome("found"),
    pathFailed: failed,
    pathBudgetExceeded: outcome("budget_exceeded"),
    pathBusy: outcome("busy"),
    pathStaleReplans: stats.paths.staleReplans,
    pathBlockedReplans: stats.paths.blockedReplans,
    pathWaitP50Ms: wait.p50,
    pathWaitP95Ms: wait.p95,
    pathWaitMaxMs: wait.max,
    pathComputeP50Ms: compute.p50,
    pathComputeP95Ms: compute.p95,
    pathComputeMaxMs: compute.max,
    s1MessagesPerSec: perSec(stats.stream.messages),
    s1BytesPerSec: Math.round(stats.stream.bytes / seconds),
    s1Snapshots: stats.stream.snapshots,
    s1MaxBufferedBytes: stats.stream.maxBufferedBytes,
    s1SlowMarked: stats.stream.slowMarked,
    s1Resyncs: stats.stream.resyncs,
    s1Commands: stats.commands,
  };
}

/** 구간을 비운다(같은 객체를 계속 쓴다 — 2차맵·전송이 이 객체에 직접 센다) */
export function resetWorldStats(stats: WorldStats): void {
  const fresh = emptyWorldStats();
  stats.paths.requests = 0;
  stats.paths.outcomes.clear();
  stats.paths.staleReplans = 0;
  stats.paths.blockedReplans = 0;
  stats.paths.waitMs.length = 0;
  stats.paths.computeMs.length = 0;
  Object.assign(stats.stream, fresh.stream);
  stats.commands = 0;
}
