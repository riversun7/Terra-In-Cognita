// 2차맵 지형 서비스 — 행성 값에서 2차맵 지형을 만들어 준다(ADR 2026-10-31-second-map-from-planet 5절, WP-3).
// - 찾는 차례: 메모리 LRU → 지형 워커(디스크 캐시 → 생성기). 같은 2차맵을 동시에 부르면 한 번만 만든다.
// - 행성 값은 행성 서비스가 굽거나 캐시에서 읽은 뒤 받는다(ready). 그 전에 부른 get은 기다린다.
// - 워커가 죽으면 다시 띄워 init·맡긴 일을 다시 보낸다(1분에 MAX_RESPAWNS_PER_MINUTE번까지, 넘으면 남은 일을 실패시킨다).
// - 고정본(second_map_pins)은 여기서 보지 않는다: 월드가 먼저 본다(world.ts).
// 시험·DB 없는 개발은 같은 스레드("inline")로 돈다.
import { performance } from "node:perf_hooks";
import { Worker } from "node:worker_threads";
import { type MapPropInput, type PlanetCellValues, planetCellValuesFromFile } from "@terra/planet/secondMap";
import { type BuiltTerrain, type MapTerrain, mapTerrainFromBuilt } from "./mapTerrain.ts";
import { createTerrainCore } from "./terrainCore.ts";
import type { FromTerrainWorker, TerrainWorkerInit, ToTerrainWorker } from "./terrainMessages.ts";

/** 메모리에 두는 2차맵 지형 수(한 장 약 0.35MB: 원본 + gzip + 지형 비용) */
export const DEFAULT_TERRAIN_MEMORY_ENTRIES = 48;
/** 디스크 캐시에 남기는 파일 수(한 장 약 40~60KB → 약 200MB) */
export const DEFAULT_TERRAIN_CACHE_FILES = 4_000;
const MAX_RESPAWNS_PER_MINUTE = 5;
/** 워커 V8 힙 상한(MB). 행성 값은 타입 배열(힙 밖)이라 작다 */
const WORKER_HEAP_MB = 256;

export interface TerrainLog {
  info(obj: object, message: string): void;
  warn(obj: object, message: string): void;
  error(obj: object, message: string): void;
}

export interface TerrainServiceOptions {
  planetId: string;
  /** 행성 값 파일(TCPV) — 행성 서비스가 준비되면 풀린다 */
  values: () => Promise<Uint8Array>;
  props: MapPropInput[];
  planetGeneratorVersion: number;
  definitionHash: string;
  /** 행성 캐시 폴더(PLANET_CACHE_DIR). 그 아래 second-maps/에 쓴다. 없으면 디스크 캐시 없이 */
  cacheDir?: string | undefined;
  cacheFiles?: number | undefined;
  memoryEntries?: number | undefined;
  runner: { kind: "worker"; workerUrl: URL } | { kind: "inline" };
  log: TerrainLog;
}

export interface TerrainService {
  /** 행성 값을 받아 워커가 준비되면 풀린다 */
  readonly ready: Promise<void>;
  /** 지금 주소 판 표지(준비 전 undefined) */
  version(): string | undefined;
  get(mapKey: number): Promise<MapTerrain>;
  /** 메모리에 이미 있는 것만(없으면 undefined) */
  peek(mapKey: number): MapTerrain | undefined;
  /** 미리 만들어 둔다(기다리지 않는다, 실패는 경고만) */
  prefetch(mapKeys: readonly number[]): void;
  /**
   * 그 2차맵 칸의 행성 값(바이옴·고도·기후·숲 — 시작 도시 고르기 판과 같은 값). 행성 값을 아직 받지 않았거나 키가 틀리면 undefined.
   * 세계 씨앗이 둘레 땅에 맞춰 NPC 시작 도시의 채집 시설을 고를 때 쓴다(facilities/npcSeed.ts, 기획 답 503 다)
   */
  cellValues?(mapKey: number): PlanetCellValues | undefined;
  takeMetrics(): Record<string, number>;
  close(): Promise<void>;
}

interface Pending {
  mapKey: number;
  resolve: (terrain: BuiltTerrain) => void;
  reject: (error: Error) => void;
}

function emptyCounts() {
  return { memoryHits: 0, built: 0, fromDisk: 0, failures: 0, buildMsMax: 0 };
}

const round1 = (value: number): number => Math.round(value * 10) / 10;
/** 자리를 채우는 빈 함수들(준비되면 바꾼다) */
const ignore = (): void => {};
const nothing = (): Promise<void> => Promise.resolve();
const notReady = (): Promise<BuiltTerrain> => Promise.reject(new Error("terrain service is not ready"));

export function createTerrainService(options: TerrainServiceOptions): TerrainService {
  const { log } = options;
  const memoryEntries = options.memoryEntries ?? DEFAULT_TERRAIN_MEMORY_ENTRIES;
  const memory = new Map<number, MapTerrain>();
  const inFlight = new Map<number, Promise<MapTerrain>>();
  let counts = emptyCounts();
  let currentVersion: string | undefined;
  let closed = false;
  // 닫으면 준비를 기다리던 get이 바로 실패한다(행성 값이 끝내 오지 않아도 끄기가 멈추지 않게)
  let signalClosed: (error: Error) => void = ignore;
  const closedSignal = new Promise<never>((_resolve, reject) => {
    signalClosed = reject;
  });
  closedSignal.catch(() => undefined);
  let activeWorker: Worker | undefined;

  const remember = (mapKey: number, terrain: MapTerrain): void => {
    memory.delete(mapKey);
    memory.set(mapKey, terrain);
    while (memory.size > memoryEntries) {
      const oldest = memory.keys().next();
      if (oldest.done) break;
      memory.delete(oldest.value);
    }
  };

  const record = (source: "disk" | "generated", ms: number): void => {
    if (source === "disk") counts.fromDisk += 1;
    else counts.built += 1;
    counts.buildMsMax = Math.max(counts.buildMsMax, ms);
  };

  // ── 만드는 쪽: 워커 또는 같은 스레드 ──
  let buildBuilt: (mapKey: number) => Promise<BuiltTerrain> = notReady;
  let stopRunner: () => Promise<void> = nothing;
  /** 받은 행성 값(행성 서비스가 든 바이트를 그대로 가리킨다 — 복사하지 않는다) */
  let valueBytes: Uint8Array | undefined;
  const ready = (async () => {
    const values = await options.values();
    valueBytes = values;
    const init: Omit<TerrainWorkerInit, "type"> = {
      values: copyBytes(values),
      props: options.props,
      planetId: options.planetId,
      planetGeneratorVersion: options.planetGeneratorVersion,
      definitionHash: options.definitionHash,
      cacheDir: options.cacheDir,
      cacheFiles: options.cacheFiles ?? DEFAULT_TERRAIN_CACHE_FILES,
    };
    if (options.runner.kind === "inline") {
      const core = await createTerrainCore(init);
      currentVersion = core.version;
      buildBuilt = async (mapKey) => {
        const result = await core.build(mapKey);
        record(result.source, result.ms);
        return result.terrain;
      };
      stopRunner = nothing;
      log.info(
        { planetId: options.planetId, version: core.version, pruned: core.pruned },
        "terrain service ready",
      );
      return;
    }
    const pool = await startWorker(options.runner.workerUrl, values, init);
    buildBuilt = pool.build;
    stopRunner = pool.stop;
  })();
  ready.catch((error: unknown) =>
    log.error({ err: error, planetId: options.planetId }, "terrain service failed"),
  );

  async function startWorker(
    workerUrl: URL,
    source: Uint8Array,
    init: Omit<TerrainWorkerInit, "type">,
  ): Promise<{ build: (mapKey: number) => Promise<BuiltTerrain>; stop: () => Promise<void> }> {
    const pending = new Map<number, Pending>();
    let nextId = 0;
    const respawns: number[] = [];
    let worker: Worker = new Worker(workerUrl, {
      resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB },
    });
    activeWorker = worker;
    let readyResolve: () => void = ignore;
    let readyReject: (error: Error) => void = ignore;
    const firstReady = new Promise<void>((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });
    const send = (message: ToTerrainWorker, transfer: ArrayBuffer[] = []): void => {
      // 브라우저 window.postMessage 규칙(targetOrigin)은 worker_threads에 해당하지 않는다
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      worker.postMessage(message, transfer);
    };
    const listen = (): void => {
      worker.on("message", (message: FromTerrainWorker) => {
        if (message.type === "ready") {
          currentVersion = message.version;
          log.info(
            { planetId: options.planetId, version: message.version, pruned: message.pruned },
            "terrain service ready",
          );
          readyResolve();
          return;
        }
        if (message.type === "fatal") {
          readyReject(new Error(message.message));
          log.error(
            { planetId: options.planetId, message: message.message },
            "terrain worker failed to start",
          );
          return;
        }
        const job = pending.get(message.id);
        if (!job) return;
        pending.delete(message.id);
        if (message.type === "built") {
          record(message.source, message.ms);
          job.resolve(message.terrain);
        } else {
          job.reject(new Error(message.message));
        }
      });
      worker.on("error", (error) => log.error({ err: error }, "terrain worker error"));
      worker.on("exit", (code) => {
        if (closed) return;
        const at = performance.now();
        respawns.push(at);
        while (respawns.length > 0 && at - (respawns[0] ?? at) > 60_000) respawns.shift();
        if (respawns.length > MAX_RESPAWNS_PER_MINUTE) {
          log.error({ code }, "terrain worker keeps exiting, giving up");
          for (const job of pending.values()) job.reject(new Error("terrain worker is down"));
          pending.clear();
          return;
        }
        log.warn({ code, pending: pending.size }, "terrain worker exited, restarting");
        worker = new Worker(workerUrl, { resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB } });
        activeWorker = worker;
        listen();
        // 다시 띄운 워커에 init과 맡긴 일을 다시 보낸다(행성 값은 복사본을 보낸다)
        send({ type: "init", ...init, values: copyBytes(source) });
        for (const [id, job] of pending) send({ type: "build", id, mapKey: job.mapKey });
      });
    };
    listen();
    send({ type: "init", ...init }, [init.values.buffer]);
    await Promise.race([firstReady, closedSignal]);
    return {
      build: (mapKey) =>
        new Promise<BuiltTerrain>((resolve, reject) => {
          nextId += 1;
          pending.set(nextId, { mapKey, resolve, reject });
          send({ type: "build", id: nextId, mapKey });
        }),
      stop: async () => {
        for (const job of pending.values()) job.reject(new Error("terrain service closed"));
        pending.clear();
        await worker.terminate();
      },
    };
  }

  const get = (mapKey: number): Promise<MapTerrain> => {
    const known = memory.get(mapKey);
    if (known) {
      counts.memoryHits += 1;
      remember(mapKey, known);
      return Promise.resolve(known);
    }
    const running = inFlight.get(mapKey);
    if (running) return running;
    const job = (async () => {
      await Promise.race([ready, closedSignal]);
      if (closed) throw new Error("terrain service closed");
      const terrain = mapTerrainFromBuilt(await buildBuilt(mapKey));
      remember(mapKey, terrain);
      return terrain;
    })();
    inFlight.set(mapKey, job);
    void job
      .catch(() => {
        counts.failures += 1;
      })
      .finally(() => inFlight.delete(mapKey));
    return job;
  };

  return {
    ready,
    version: () => currentVersion,
    get,
    peek: (mapKey) => memory.get(mapKey),
    cellValues(mapKey) {
      if (!valueBytes) return undefined;
      try {
        return planetCellValuesFromFile(valueBytes, mapKey);
      } catch {
        // 면 레벨이 다른 키 등
        return undefined;
      }
    },
    prefetch(mapKeys) {
      for (const mapKey of mapKeys) {
        if (memory.has(mapKey) || inFlight.has(mapKey)) continue;
        get(mapKey).catch((error: unknown) => log.warn({ err: error, mapKey }, "terrain prefetch failed"));
      }
    },
    takeMetrics() {
      const current = counts;
      counts = emptyCounts();
      return {
        terrainMemory: memory.size,
        terrainQueue: inFlight.size,
        terrainMemoryHits: current.memoryHits,
        terrainBuilt: current.built,
        terrainFromDisk: current.fromDisk,
        terrainFailures: current.failures,
        terrainBuildMs: round1(current.buildMsMax),
      };
    },
    async close() {
      closed = true;
      signalClosed(new Error("terrain service closed"));
      await stopRunner();
      // 준비 중이던 워커(아직 stopRunner가 없음)도 끈다
      await activeWorker?.terminate();
    },
  };
}

/** 옮겨도 되는 복사본(행성 서비스가 든 바이트는 그대로 둔다) */
function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(bytes.byteLength);
  out.set(bytes);
  return out;
}
