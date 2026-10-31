// 2차맵 시험 도우미 — 시험 파일끼리 서로 import하지 않게 여기에 둔다(게임 앱 선언 파일에는 넣지 않는다: tsconfig.api.json)
import { performance } from "node:perf_hooks";
import {
  SURFACE_GRASS,
  TEMP_TERRAIN_GENERATOR_VERSION,
  TERRAIN_SIZE,
  TERRAIN_VERTEX_SIZE,
  type TempTerrain,
} from "@terra/sim";
import { mapTerrainFromTemp } from "./mapTerrain.ts";
import { type PathOutcome, type PathService, createInlinePathService } from "./pathService.ts";
import { type SecondMap, createSecondMap } from "./secondMap.ts";
import { type WorldStats, emptyWorldStats } from "./worldStats.ts";

/** 아무 일도 하지 않는 로거 */
export const silentLog = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

/** 모든 칸이 풀밭(비용 1000)인 평평한 지형 — 경로를 손으로 계산할 수 있다 */
export function flatTerrain(seed = 1): TempTerrain {
  return {
    generatorVersion: TEMP_TERRAIN_GENERATOR_VERSION,
    seed,
    heights: new Int32Array(TERRAIN_VERTEX_SIZE * TERRAIN_VERTEX_SIZE).fill(100),
    surface: new Uint8Array(TERRAIN_SIZE * TERRAIN_SIZE).fill(SURFACE_GRASS),
  };
}

/** 결과를 붙잡아 둘 수 있는 경로 서비스. 붙잡은 동안에도 계산은 부탁한 때 바로 한다(그때의 격자로) */
export interface HeldPathService extends PathService {
  /** true면 결과를 release 때까지 돌려주지 않는다 */
  hold: boolean;
  requests: number;
  release(): void;
}

export function heldPathService(inner: PathService): HeldPathService {
  const held: { result: Promise<PathOutcome>; resolve: (outcome: PathOutcome) => void }[] = [];
  const service: HeldPathService = {
    hold: false,
    requests: 0,
    start: () => inner.start(),
    edit: (mapKey, version, edit) => inner.edit(mapKey, version, edit),
    queued: () => inner.queued(),
    close: () => inner.close(),
    request(job) {
      service.requests += 1;
      const result = inner.request(job);
      if (!service.hold) return result;
      return new Promise((resolve) => held.push({ result, resolve }));
    },
    release() {
      for (const { result, resolve } of held.splice(0)) void result.then(resolve);
    },
  };
  return service;
}

export interface TestMap {
  map: SecondMap;
  stats: WorldStats;
  paths: HeldPathService;
}

/** 같은 스레드 경로 서비스로 2차맵 하나를 만든다(시각은 Date.now — 가짜 타이머와 함께 쓴다) */
export function createTestMap(options: { terrain?: TempTerrain; mapKey?: number } = {}): TestMap {
  const stats = emptyWorldStats();
  const holder: { map?: SecondMap } = {};
  const paths = heldPathService(
    createInlinePathService(
      () => (holder.map ? [holder.map.replicaInit()] : []),
      () => performance.now(),
    ),
  );
  const mapKey = options.mapKey ?? 9;
  const map = createSecondMap({
    mapKey,
    terrain: mapTerrainFromTemp(mapKey, options.terrain ?? flatTerrain()),
    paths,
    now: () => Date.now(),
    stats,
    log: silentLog,
  });
  holder.map = map;
  paths.start();
  return { map, stats, paths };
}
