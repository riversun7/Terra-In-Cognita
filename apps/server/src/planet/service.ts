// 행성 서비스 — 원본마다 디스크 캐시를 읽거나 굽고, 압축한 타일을 메모리에 들고 목록 정보·타일을 준다.
// ADR 2026-10-29-s2-planet-lod "서버 굽기·전송". 경로(HTTP)는 routes.ts.
// - 시작하면(start) 원본을 하나씩 차례로 준비한다(굽기는 한 번에 하나: NAS 메모리). 그동안 서버는 다른 요청을 받는다
//   (굽기는 워커 스레드, 캐시 읽기는 비동기 파일 읽기 + SHA-256 한 번).
// - 준비 전 목록 정보는 status "generating", 타일은 409. 굽기가 실패하면 오류를 남기고 늦춰 가며 다시 굽는다
//   (그동안도 "generating"). 캐시 쓰기가 실패하면 경고만 남기고 메모리로 계속 준다(다음 시작 때 다시 굽는다).
import { performance } from "node:perf_hooks";
import { isCellKey, planetTileIdFromKey, planetTileIds } from "@terra/planet";
import { planetRadiusMeters } from "@terra/planet/projection";
import {
  PLANET_TILE_FORMAT_VERSION,
  type PlanetManifest,
  planetManifestSchema,
  planetTileUrlTemplate,
  planetTileVersion,
} from "@terra/protocol";
import type { BakeOutput, PlanetBaker } from "./baker.ts";
import {
  PLANET_CACHE_FORMAT,
  type PlanetCacheKey,
  cacheFileStem,
  prunePlanetCache,
  readPlanetCache,
  writePlanetCache,
} from "./cache.ts";
import type { PlanetSource } from "./sources.ts";

export interface PlanetLog {
  info(obj: object, message: string): void;
  warn(obj: object, message: string): void;
  error(obj: object, message: string): void;
}

export interface PlanetServiceOptions {
  sources: readonly PlanetSource[];
  baker: PlanetBaker;
  /** 디스크 캐시 폴더(PLANET_CACHE_DIR). 없으면 캐시 없이 시작마다 굽는다 */
  cacheDir?: string | undefined;
  log: PlanetLog;
  /** 실패 n번째 뒤 다시 굽기까지(ms). 기본: 1분부터 두 배씩, 1시간까지 */
  retryDelayMs?: ((failures: number) => number) | undefined;
  /** 벽시계(ms) — 캐시 목록의 구운 시각(참고용) */
  wallClock?: (() => number) | undefined;
}

/** 타일 찾기 결과 */
export type PlanetTileLookup =
  | { kind: "ok"; gzip: Uint8Array }
  | { kind: "unknown_planet" }
  | { kind: "unknown_tile" }
  | { kind: "wrong_version" }
  | { kind: "not_ready" };

export interface PlanetService {
  /** 준비를 시작한다(기다리지 않는다) */
  start(): void;
  /** 목록 정보. 없는 행성이면 undefined */
  manifest(planetId: string): PlanetManifest | undefined;
  /** 타일 하나(압축한 것). 버전(v)이 지금 버전과 같아야 한다. 확인 순서: 행성 → 버전 → 타일 ID → 준비 */
  tile(planetId: string, tileKey: number, version: string): PlanetTileLookup;
  /** 경로가 답한 결과를 센다(1분 지표) */
  recordTileResponse(status: number, bytes: number): void;
  /** 지난 호출 뒤 구간 지표(1분 지표 한 줄에 붙인다). 부르면 구간을 비운다 */
  takeMetrics(): Record<string, number>;
  /** 지금 줄 선 준비가 모두 끝날 때까지(시험용) */
  whenIdle(): Promise<void>;
  close(): Promise<void>;
}

interface ReadyPlanet {
  tiles: Map<number, Uint8Array>;
  bytes: number;
  /** 가장 높은 땅(게임 m) — 준비된 목록 정보에 싣는다 */
  maxElevationM: number;
  /** 생성 결과 해시(생성기 meta.hash) — 준비된 목록 정보에 싣는다(ADR 38 4절: 편집기 "굽기와 같음") */
  fieldsHash: string;
}

interface PlanetEntry {
  readonly source: PlanetSource;
  readonly version: string;
  /** 목록 정보(상태는 부를 때 채운다) */
  readonly manifest: PlanetManifest;
  ready: ReadyPlanet | undefined;
  failures: number;
  retry: NodeJS.Timeout | undefined;
}

const defaultRetryDelay = (failures: number): number => Math.min(60_000 * 2 ** (failures - 1), 3_600_000);
const round1 = (value: number): number => Math.round(value * 10) / 10;

function emptyCounts() {
  return {
    bakes: 0,
    bakeFailures: 0,
    bakeMsMax: 0,
    cacheHits: 0,
    cacheMisses: 0,
    cacheLoadMsMax: 0,
    tilesServed: 0,
    tileBytesServed: 0,
    tilesNotReady: 0,
    tilesNotFound: 0,
    tilesRateLimited: 0,
    tilesSignedOut: 0,
  };
}

/** 원본 → 목록 정보. 틀린 원본이면 시작하지 않는다(스키마 검사) */
function manifestOf(source: PlanetSource, version: string): PlanetManifest {
  return planetManifestSchema.parse({
    id: source.id,
    name: source.name,
    faceLevel: source.faceLevel,
    radiusM: planetRadiusMeters(source.faceLevel),
    generatorVersion: source.generatorVersion,
    definitionHash: source.definitionHash,
    status: "generating",
    tileFormatVersion: PLANET_TILE_FORMAT_VERSION,
    tileUrlTemplate: planetTileUrlTemplate(source.id, version),
    biomes: source.biomes,
  });
}

/** 캐시 키 = (행성 ID, 면 레벨, 생성기 버전, 정의 해시) */
function cacheKey(source: PlanetSource): PlanetCacheKey {
  return {
    planetId: source.id,
    faceLevel: source.faceLevel,
    generatorVersion: source.generatorVersion,
    definitionHash: source.definitionHash,
  };
}

/** pack + [키, 길이] 목록 → 메모리 타일(복사하지 않고 pack을 나눠 본다) */
function makeReady(
  tiles: readonly (readonly [number, number])[],
  pack: Uint8Array,
  summary: { maxElevationM: number; fieldsHash: string },
): ReadyPlanet {
  const map = new Map<number, Uint8Array>();
  let offset = 0;
  for (const [key, length] of tiles) {
    map.set(key, pack.subarray(offset, offset + length));
    offset += length;
  }
  // 필드를 골라 담는다(캐시 목록·굽기 결과를 통째로 펼치면 tiles 같은 다른 칸이 덮인다)
  return {
    tiles: map,
    bytes: pack.byteLength,
    maxElevationM: summary.maxElevationM,
    fieldsHash: summary.fieldsHash,
  };
}

export function createPlanetService(options: PlanetServiceOptions): PlanetService {
  const { baker, cacheDir, log } = options;
  const retryDelay = options.retryDelayMs ?? defaultRetryDelay;
  const wallClock = options.wallClock ?? Date.now;
  const entries = new Map<string, PlanetEntry>();
  for (const source of options.sources) {
    if (entries.has(source.id)) throw new Error(`planet ${source.id} is listed twice`);
    const version = planetTileVersion(source.generatorVersion, source.definitionHash);
    entries.set(source.id, {
      source,
      version,
      manifest: manifestOf(source, version),
      ready: undefined,
      failures: 0,
      retry: undefined,
    });
  }
  let counts = emptyCounts();
  let queue: Promise<void> = Promise.resolve();
  let closed = false;

  const tryCache = async (entry: PlanetEntry): Promise<boolean> => {
    if (!cacheDir) return false;
    const started = performance.now();
    try {
      const result = await readPlanetCache(cacheDir, cacheKey(entry.source));
      if (result.ok) {
        const { index } = result.cached;
        entry.ready = makeReady(index.tiles, result.cached.pack, index);
        const loadMs = performance.now() - started;
        counts.cacheHits += 1;
        counts.cacheLoadMsMax = Math.max(counts.cacheLoadMsMax, loadMs);
        log.info(
          {
            planetId: entry.source.id,
            from: "cache",
            tiles: index.tileCount,
            rawBytes: index.rawBytes,
            packBytes: index.packBytes,
            maxElevationM: index.maxElevationM,
            cacheLoadMs: round1(loadMs),
          },
          "planet ready",
        );
        return true;
      }
      if (result.reason === "invalid") {
        log.warn(
          { planetId: entry.source.id, detail: result.detail },
          "planet cache is invalid, baking again",
        );
      }
    } catch (error) {
      log.warn(
        { err: error, planetId: entry.source.id, dir: cacheDir },
        "planet cache read failed, baking again",
      );
    }
    counts.cacheMisses += 1;
    return false;
  };

  /** 굽기 결과가 이 행성의 타일 목록과 같은 순서·개수인가 */
  const matchesTileList = (entry: PlanetEntry, output: BakeOutput): boolean => {
    const expected = planetTileIds(entry.source.faceLevel);
    const total = output.tiles.reduce((sum, [, length]) => sum + length, 0);
    return (
      output.tiles.length === expected.length &&
      output.tiles.every(([key], at) => key === expected[at]?.key) &&
      total === output.pack.byteLength
    );
  };

  const writeCache = async (entry: PlanetEntry, output: BakeOutput): Promise<void> => {
    if (!cacheDir) return;
    const { source } = entry;
    try {
      await writePlanetCache(
        cacheDir,
        {
          format: PLANET_CACHE_FORMAT,
          ...cacheKey(source),
          tileFormatVersion: PLANET_TILE_FORMAT_VERSION,
          tileCount: output.tiles.length,
          packBytes: output.pack.byteLength,
          packSha256: output.packSha256,
          rawBytes: output.rawBytes,
          fieldsHash: output.fieldsHash,
          maxElevationM: output.maxElevationM,
          bakedAt: new Date(wallClock()).toISOString(),
          bakeMs: round1(output.totalMs),
          tiles: output.tiles,
        },
        output.pack,
      );
      const removed = await prunePlanetCache(cacheDir, source.id, cacheFileStem(cacheKey(source)));
      if (removed.length > 0) log.info({ planetId: source.id, removed }, "planet cache pruned");
    } catch (error) {
      log.warn(
        { err: error, planetId: source.id, dir: cacheDir },
        "planet cache write failed, serving from memory",
      );
    }
  };

  const fail = (entry: PlanetEntry, error: unknown): void => {
    entry.failures += 1;
    counts.bakeFailures += 1;
    const delayMs = retryDelay(entry.failures);
    log.error(
      { err: error, planetId: entry.source.id, failures: entry.failures, retryInMs: delayMs },
      "planet bake failed",
    );
    entry.retry = setTimeout(() => {
      entry.retry = undefined;
      enqueue(entry);
    }, delayMs);
    // 이 타이머 때문에 프로세스가 안 꺼지는 일이 없게
    entry.retry.unref();
  };

  const prepare = async (entry: PlanetEntry): Promise<void> => {
    if (closed || entry.ready) return;
    if (await tryCache(entry)) return;
    if (closed) return;
    let output: BakeOutput;
    try {
      output = await baker.bake(entry.source);
    } catch (error) {
      if (!closed) fail(entry, error);
      return;
    }
    if (closed) return;
    if (!matchesTileList(entry, output)) {
      fail(entry, new Error("baked tiles do not match the planet tile list"));
      return;
    }
    entry.ready = makeReady(output.tiles, output.pack, output);
    entry.failures = 0;
    counts.bakes += 1;
    counts.bakeMsMax = Math.max(counts.bakeMsMax, output.totalMs);
    log.info(
      {
        planetId: entry.source.id,
        from: "bake",
        tiles: output.tiles.length,
        rawBytes: output.rawBytes,
        packBytes: output.pack.byteLength,
        maxElevationM: output.maxElevationM,
        generateMs: round1(output.generateMs),
        tilesMs: round1(output.tilesMs),
        gzipMs: round1(output.gzipMs),
        bakeMs: round1(output.totalMs),
        peakWorkerMb: round1(output.peakWorkerMb),
        peakRssMb: round1(output.peakRssMb),
      },
      "planet ready",
    );
    await writeCache(entry, output);
  };

  // 준비는 한 번에 하나씩(굽기 메모리를 겹치지 않게)
  const enqueue = (entry: PlanetEntry): void => {
    queue = queue
      .then(() => prepare(entry))
      .catch((error: unknown) =>
        log.error({ err: error, planetId: entry.source.id }, "planet prepare failed"),
      );
  };

  return {
    start() {
      for (const entry of entries.values()) enqueue(entry);
    },
    manifest(planetId) {
      const entry = entries.get(planetId);
      if (!entry) return undefined;
      // 가장 높은 땅·결과 해시는 구운 뒤에만 안다(굽는 중 목록 정보에는 없다)
      if (!entry.ready) return { ...entry.manifest, status: "generating" };
      const { maxElevationM, fieldsHash } = entry.ready;
      return { ...entry.manifest, status: "ready", maxElevationM, fieldsHash };
    },
    tile(planetId, tileKey, version) {
      const entry = entries.get(planetId);
      if (!entry) return { kind: "unknown_planet" };
      if (version !== entry.version) return { kind: "wrong_version" };
      // 이 행성의 타일 ID가 아니면 굽는 중이어도 없는 타일이다
      if (!isCellKey(tileKey) || !planetTileIdFromKey(entry.source.faceLevel, tileKey)) {
        return { kind: "unknown_tile" };
      }
      if (!entry.ready) return { kind: "not_ready" };
      const gzip = entry.ready.tiles.get(tileKey);
      return gzip ? { kind: "ok", gzip } : { kind: "unknown_tile" };
    },
    recordTileResponse(status, bytes) {
      if (status === 200) {
        counts.tilesServed += 1;
        counts.tileBytesServed += bytes;
      } else if (status === 409) counts.tilesNotReady += 1;
      else if (status === 404) counts.tilesNotFound += 1;
      else if (status === 429) counts.tilesRateLimited += 1;
      else if (status === 401) counts.tilesSignedOut += 1;
    },
    takeMetrics() {
      const ready = [...entries.values()].filter((entry) => entry.ready);
      const current = counts;
      counts = emptyCounts();
      return {
        planets: entries.size,
        planetsReady: ready.length,
        planetTiles: ready.reduce((sum, entry) => sum + (entry.ready?.tiles.size ?? 0), 0),
        planetBytes: ready.reduce((sum, entry) => sum + (entry.ready?.bytes ?? 0), 0),
        planetBakes: current.bakes,
        planetBakeFailures: current.bakeFailures,
        planetBakeMs: round1(current.bakeMsMax),
        planetCacheHits: current.cacheHits,
        planetCacheMisses: current.cacheMisses,
        planetCacheLoadMs: round1(current.cacheLoadMsMax),
        planetTilesServed: current.tilesServed,
        planetTileBytesServed: current.tileBytesServed,
        planetTilesNotReady: current.tilesNotReady,
        planetTilesNotFound: current.tilesNotFound,
        planetTilesRateLimited: current.tilesRateLimited,
        planetTilesSignedOut: current.tilesSignedOut,
      };
    },
    whenIdle: () => queue,
    // 준비 중인 것을 기다리지 않는다: 워커 굽기는 멈추고, 남은 단계는 closed를 보고 그만둔다(캐시도 쓰지 않는다)
    async close() {
      closed = true;
      for (const entry of entries.values()) {
        if (entry.retry) clearTimeout(entry.retry);
        entry.retry = undefined;
      }
      await baker.close();
    },
  };
}
