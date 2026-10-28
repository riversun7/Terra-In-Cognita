// S1 월드 — 시험 2차맵 하나 + 경로 서비스 + 시험용 봇 (메모리에만. DB 저장·복구는 S3, 상태 저장 ADR)
// 서버가 켜질 때 만들고(app.ts), 끌 때 워커를 끝낸다.
import { performance } from "node:perf_hooks";
import { EARTH_FACE_LEVEL, cellKey } from "@terra/planet";
import { generateTempTerrain, seedFromCellKey } from "@terra/sim";
import type { WorldDirectory } from "./gateway.ts";
import { createWorkerPathService } from "./pathPool.ts";
import { type PathService, createInlinePathService } from "./pathService.ts";
import { type MapLog, type SecondMap, createSecondMap } from "./secondMap.ts";
import { emptyWorldStats, resetWorldStats, summarizeWorldStats } from "./worldStats.ts";

/**
 * S1 시험 2차맵: 지구(면 레벨 9) 면 0의 (i, j) = (256, 256) 칸(면 가운데, +x 방향).
 * 기기는 같은 값을 @terra/protocol S1_TEST_MAP_KEY로 안다(시험이 두 값이 같은지 본다).
 * 지형은 칸 키로 만든 임시 지형이라 실제 지구 위치·고도와는 상관없다(행성 회전·생성기는 S2).
 */
export const TEST_MAP_KEY: number = cellKey(0, EARTH_FACE_LEVEL, 256, 256);

/** 경로 서비스 고르기: 운영은 워커, 시험은 같은 스레드 */
export type WorldPathsConfig = { kind: "workers"; workerUrl: URL; workers: number } | { kind: "inline" };

export interface WorldConfig {
  /** 시험용 봇 수(S1_TEST_BOTS). 0이면 봇 없이 2차맵만 */
  testBots: number;
  paths: WorldPathsConfig;
}

export interface WorldLog extends MapLog {
  info(obj: object, message: string): void;
}

export interface World extends WorldDirectory {
  readonly testMap: SecondMap;
  /** 지난 호출 뒤 구간의 S1 지표(지표 한 줄에 붙인다). 부르면 구간을 비운다 */
  takeMetrics(): Record<string, number>;
  stop(): Promise<void>;
}

export function startWorld(config: WorldConfig & { now: () => number; log: WorldLog }): World {
  const { now, log } = config;
  const stats = emptyWorldStats();
  const maps = new Map<number, SecondMap>();
  const sources = () => [...maps.values()].map((map) => map.replicaInit());
  const paths: PathService =
    config.paths.kind === "workers"
      ? createWorkerPathService({
          workerUrl: config.paths.workerUrl,
          workers: config.paths.workers,
          sources,
          log,
        })
      : createInlinePathService(sources, () => performance.now());

  const terrain = generateTempTerrain(seedFromCellKey(TEST_MAP_KEY));
  const testMap = createSecondMap({ mapKey: TEST_MAP_KEY, terrain, paths, now, stats, log });
  maps.set(TEST_MAP_KEY, testMap);
  paths.start();
  testMap.spawnBots(config.testBots);
  log.info(
    {
      mapKey: TEST_MAP_KEY,
      testBots: config.testBots,
      pathWorkers: config.paths.kind === "workers" ? config.paths.workers : 0,
      generatorVersion: terrain.generatorVersion,
    },
    "s1 world started",
  );

  let windowStart = now();
  return {
    stats,
    testMap,
    map: (mapKey) => maps.get(mapKey),
    takeMetrics() {
      const at = now();
      const summary = summarizeWorldStats(
        stats,
        { ...testMap.gauges(), subscribers: testMap.stream.subscriberCount, pathQueue: paths.queued() },
        at - windowStart,
      );
      resetWorldStats(stats);
      windowStart = at;
      return summary;
    },
    async stop() {
      for (const map of maps.values()) map.stop();
      await paths.close();
    },
  };
}
