// S1 측정값 요약 시험 — 백분위, 초당 비율, 구간 비우기, 설정(S1_TEST_BOTS·PATH_WORKERS) 읽기
import { describe, expect, it } from "vitest";
import { MAX_TEST_BOTS, readConfig } from "../config.ts";
import {
  emptyWorldStats,
  percentile,
  recordPathOutcome,
  resetWorldStats,
  summarizeWorldStats,
} from "./worldStats.ts";

const GAUGES = { units: 1_000, moving: 700, planning: 3, subscribers: 2, pathQueue: 5 };

describe("백분위", () => {
  it("가장 가까운 순위, 표본이 없으면 0", () => {
    const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(sorted, 0.5)).toBe(50);
    expect(percentile(sorted, 0.95)).toBe(95);
    expect(percentile(sorted, 1)).toBe(100);
    expect(percentile([7], 0.95)).toBe(7);
    expect(percentile([], 0.5)).toBe(0);
  });
});

describe("요약", () => {
  it("구간 길이로 나눈 비율과 경로 시간 분포를 낸다", () => {
    const stats = emptyWorldStats();
    stats.paths.requests = 120;
    for (let i = 1; i <= 100; i++) {
      recordPathOutcome(stats.paths, {
        status: "found",
        version: 0,
        waypoints: [],
        expanded: 10,
        computeMs: i / 10,
        waitMs: i,
      });
    }
    recordPathOutcome(stats.paths, { status: "budget_exceeded", version: 0, computeMs: 30, waitMs: 31 });
    recordPathOutcome(stats.paths, { status: "no_path", version: 0, computeMs: 1, waitMs: 2 });
    recordPathOutcome(stats.paths, { status: "busy", waitMs: 0 });
    stats.stream.messages = 600;
    stats.stream.bytes = 6_000_000;
    stats.stream.maxBufferedBytes = 4_096;
    stats.commands = 4;
    const summary = summarizeWorldStats(stats, GAUGES, 60_000);
    expect(summary).toMatchObject({
      s1Units: 1_000,
      s1Moving: 700,
      s1Planning: 3,
      s1Subscribers: 2,
      pathQueue: 5,
      pathRequestsPerSec: 2,
      pathFound: 100,
      pathFailed: 1,
      pathBudgetExceeded: 1,
      pathBusy: 1,
      // 표본 103개(1~100, 31, 2, 0)의 52번째
      pathWaitP50Ms: 49,
      pathWaitMaxMs: 100,
      pathComputeMaxMs: 30,
      s1MessagesPerSec: 10,
      s1BytesPerSec: 100_000,
      s1MaxBufferedBytes: 4_096,
      s1Commands: 4,
    });
    // 지표 한 줄에는 숫자만
    expect(Object.values(summary).every((value) => Number.isFinite(value))).toBe(true);
  });

  it("비우면 다음 구간은 0부터", () => {
    const stats = emptyWorldStats();
    stats.paths.requests = 5;
    recordPathOutcome(stats.paths, { status: "busy", waitMs: 1 });
    stats.stream.bytes = 10;
    resetWorldStats(stats);
    const summary = summarizeWorldStats(stats, GAUGES, 60_000);
    expect(summary).toMatchObject({ pathRequestsPerSec: 0, pathBusy: 0, s1BytesPerSec: 0, pathWaitMaxMs: 0 });
  });
});

describe("설정", () => {
  it("기본: 봇 0, 워커 1", () => {
    expect(readConfig({}).s1).toEqual({ testBots: 0, pathWorkers: 1 });
  });

  it("S1_TEST_BOTS·PATH_WORKERS를 읽고, 범위 밖·숫자가 아니면 시작하지 않는다", () => {
    expect(readConfig({ S1_TEST_BOTS: "1000", PATH_WORKERS: "2" }).s1).toEqual({
      testBots: 1_000,
      pathWorkers: 2,
    });
    expect(() => readConfig({ S1_TEST_BOTS: String(MAX_TEST_BOTS + 1) })).toThrow(/S1_TEST_BOTS/);
    expect(() => readConfig({ S1_TEST_BOTS: "-1" })).toThrow(/S1_TEST_BOTS/);
    expect(() => readConfig({ S1_TEST_BOTS: "1e3" })).toThrow(/S1_TEST_BOTS/);
    expect(() => readConfig({ PATH_WORKERS: "0" })).toThrow(/PATH_WORKERS/);
    expect(() => readConfig({ PATH_WORKERS: "9" })).toThrow(/PATH_WORKERS/);
  });
});
