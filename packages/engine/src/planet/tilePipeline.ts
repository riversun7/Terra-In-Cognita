// 타일 받기·만들기·올리기·버리기 — 화면 스레드 쪽 관리자(three.js를 직접 쓰지 않는다: GPU 쪽은 createGpu로 받는다).
// 한 타일의 길: 받기(TileSource, 동시 상한) → 모양 확인 → 메시 만들기(워커) → 올리기 대기 → 올리기(한 프레임 상한) → 그리기 가능.
// 받은 이진(EncodedTile)은 메시 만들기(워커)가 풀므로 모양·요청 확인을 만든 뒤에 한다.
// - 원하지 않게 된 받기는 잠시(ABORT_GRACE_MS) 뒤 취소한다(잠깐 흔들린 고르기 때문에 다시 받지 않게).
// - 원천이 FETCH_TIMEOUT_MS 안에 답하지 않으면(멈춘 휴대폰 연결 등, 브라우저 fetch는 기본 시간 제한이 없다) 멈추고(abort)
//   실패로 센다. 그래서 답 없는 요청이 받기 자리를 영영 차지하지 않는다. 시간은 원천을 부른 때부터다(원천 안의 기다림 포함).
// - 실패하면 1초부터 두 배씩(30초까지) 기다렸다가 다시 받는다. 그동안은 부모 타일이 그 자리를 그린다.
// - 메모리 추정(GPU에 올린 것 + JS에 남는 배열 사본 + 풀어 둔 타일)이 상한을 넘으면 이번 프레임에 안 쓴 타일을 오래된 것부터
//   버린다(꼭대기 타일은 지킨다: 늘 부모가 있게).
import type { WantedTile } from "./lodSelect.ts";
import {
  type DecodedTile,
  type EncodedTile,
  type PlanetBudgets,
  type TileRequest,
  type TileSource,
  isEncodedTile,
} from "./planetTypes.ts";
import { type TileMeshArrays, decodedTileBytes, decodedTileProblem, tileGpuBytes } from "./tileMesh.ts";
import { type TileLayout, type TileNode, tileRequestOf } from "./tileTree.ts";

/** GPU에 올린 타일(엔진이 만든다) */
export interface GpuTile {
  /** GPU 메모리 추정(바이트) */
  readonly bytes: number;
  /** 올린 뒤에도 JS에 남는 바이트(three가 들고 있는 속성·텍스처 배열 등) — 메모리 상한에 함께 센다 */
  readonly retainedBytes: number;
  dispose(): void;
}

export interface BuiltTile {
  mesh: TileMeshArrays;
  tile: DecodedTile;
}

/** 메시 만들기(워커 또는 화면 스레드). 받은 이진이면 풀어서 만들고, 푼 타일을 답에 넣는다 */
export interface TileMeshBuilder {
  build(input: DecodedTile | EncodedTile, radiusM: number): Promise<BuiltTile>;
  dispose(): void;
}

type EntryState = "fetching" | "building" | "built" | "ready" | "failed";

interface TileEntry<G extends GpuTile> {
  readonly key: number;
  readonly node: TileNode;
  state: EntryState;
  /** 받는 중이면 취소(받기 자리를 바로 돌려준다) */
  cancel: (() => void) | null;
  tile: DecodedTile | null;
  mesh: TileMeshArrays | null;
  gpu: G | null;
  /** 이 타일이 지금 쥔 메모리 추정(바이트): 풀어 둔 타일 + 메시 배열(올리기 전) 또는 GPU 추정 + JS 사본(올린 뒤) */
  bytes: number;
  /** 받기를 시작한 때(now 기준 ms) — 시간 제한용 */
  fetchStartedAt: number;
  lastUsed: number;
  lastWanted: number;
  failures: number;
  retryAt: number;
}

export interface PipelineOptions<G extends GpuTile> {
  source: TileSource;
  builder: TileMeshBuilder;
  layout: TileLayout;
  radiusM: number;
  budgets: PlanetBudgets;
  createGpu: (mesh: TileMeshArrays, node: TileNode) => G;
  /** 받기·만들기가 끝나 다시 그려야 할 때 */
  onChange: () => void;
  now: () => number;
}

/** 원하지 않게 된 받기를 이만큼 기다렸다가 취소한다(ms) */
const ABORT_GRACE_MS = 500;
/** 받기 하나의 시간 제한(ms) — 타일 하나는 압축해 수 KB라 4G에서도 1초 안쪽이다(Assumed). 넘으면 멈추고 실패로 센다 */
export const FETCH_TIMEOUT_MS = 15_000;
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 30_000;

export class TilePipeline<G extends GpuTile> {
  private readonly entries = new Map<number, TileEntry<G>>();
  private readonly options: PipelineOptions<G>;
  private fetching = 0;
  private building = 0;
  /** GPU 메모리 추정(올린 타일만) */
  private gpuBytes = 0;
  /** 모든 타일이 쥔 메모리 추정(TileEntry.bytes의 합) — 상한과 견준다 */
  private memoryBytes = 0;
  private disposed = false;
  /** 상한에 걸린 횟수·실패 수(누적) */
  readonly hits = { fetches: 0, uploads: 0, memory: 0 };
  errors = 0;

  constructor(options: PipelineOptions<G>) {
    this.options = options;
  }

  drawable(key: number): boolean {
    return this.entries.get(key)?.state === "ready";
  }

  gpu(key: number): G | null {
    return this.entries.get(key)?.gpu ?? null;
  }

  /** 풀어 둔 타일(누르기·높이 읽기용). 만드는 중이거나 올리기를 기다리는 것도 준다 */
  decoded(key: number): DecodedTile | null {
    return this.entries.get(key)?.tile ?? null;
  }

  counts(): {
    loaded: number;
    fetching: number;
    building: number;
    queued: number;
    gpuBytes: number;
    memoryBytes: number;
  } {
    let loaded = 0;
    let queued = 0;
    for (const entry of this.entries.values()) {
      if (entry.state === "ready") loaded += 1;
      else if (entry.state === "built") queued += 1;
    }
    return {
      loaded,
      fetching: this.fetching,
      building: this.building,
      queued,
      gpuBytes: this.gpuBytes,
      memoryBytes: this.memoryBytes,
    };
  }

  /** 고른 나무에서 쓴 마디 표시(오래 안 쓴 것을 버릴 때 본다) */
  touch(keys: readonly number[], frame: number): void {
    for (const key of keys) {
      const entry = this.entries.get(key);
      if (entry) entry.lastUsed = frame;
    }
  }

  /** 시간이 지난 받기를 멈추고, 받을 목록대로 받기 시작(동시 상한), 원하지 않게 된 받기 취소 */
  request(wanted: readonly WantedTile[], frame: number): void {
    if (this.disposed) return;
    const now = this.options.now();
    // 답이 없는 받기를 먼저 멈춘다: 자리가 비어 이번에 다른 타일을 받는다. 그 타일은 실패 대기(1초~) 뒤 다시 받는다
    for (const entry of this.entries.values()) {
      if (entry.state === "fetching" && now - entry.fetchStartedAt >= FETCH_TIMEOUT_MS) {
        entry.cancel?.();
        this.fail(entry);
      }
    }
    const wantedKeys = new Set<number>();
    let waiting = false;
    for (const item of wanted) {
      wantedKeys.add(item.key);
      let entry = this.entries.get(item.key);
      if (entry) {
        entry.lastWanted = now;
        entry.lastUsed = frame;
        if (entry.state !== "failed" || now < entry.retryAt) continue;
      }
      if (this.fetching >= this.options.budgets.concurrentFetches) {
        waiting = true;
        continue;
      }
      entry ??= this.createEntry(item.key, item.node, now, frame);
      this.start(entry);
    }
    if (waiting) this.hits.fetches += 1;
    for (const entry of this.entries.values()) {
      if (entry.state !== "fetching" || wantedKeys.has(entry.key)) continue;
      if (now - entry.lastWanted > ABORT_GRACE_MS) {
        entry.cancel?.();
        this.remove(entry);
      }
    }
  }

  /** 올리기를 기다리는 타일을 우선순위대로 limit개까지 올린다. 남았으면 true */
  upload(limit: number, priority: ReadonlyMap<number, number>): boolean {
    const ready: TileEntry<G>[] = [];
    for (const entry of this.entries.values()) if (entry.state === "built") ready.push(entry);
    if (ready.length === 0) return false;
    // 지금 원하는 것 먼저(우선순위 작은 것), 원하지 않는 것은 뒤에
    const rank = (entry: TileEntry<G>): number => priority.get(entry.key) ?? Number.POSITIVE_INFINITY;
    ready.sort((a, b) => rank(a) - rank(b) || a.node.mapLevel - b.node.mapLevel);
    let uploaded = 0;
    for (const entry of ready) {
      if (uploaded >= limit) break;
      const mesh = entry.mesh;
      if (!mesh) continue;
      const gpu = this.options.createGpu(mesh, entry.node);
      entry.gpu = gpu;
      entry.mesh = null;
      entry.state = "ready";
      this.gpuBytes += gpu.bytes;
      this.setBytes(entry, this.tileBytes(entry) + gpu.bytes + gpu.retainedBytes);
      uploaded += 1;
    }
    const left = ready.length > uploaded;
    if (left) this.hits.uploads += 1;
    return left;
  }

  /** 메모리 상한을 넘으면 이번 프레임(frame)에 안 쓴 타일을 오래된 것부터 버린다 */
  evict(frame: number, keep: (node: TileNode) => boolean): void {
    const limit = this.options.budgets.memoryBytes;
    if (this.memoryBytes <= limit) return;
    const candidates = [...this.entries.values()].filter(
      (entry) =>
        (entry.state === "ready" || entry.state === "built") && entry.lastUsed < frame && !keep(entry.node),
    );
    candidates.sort((a, b) => a.lastUsed - b.lastUsed);
    for (const entry of candidates) {
      if (this.memoryBytes <= limit) break;
      this.remove(entry);
      this.hits.memory += 1;
    }
  }

  dispose(): void {
    this.disposed = true;
    // 지우면서 돌아도 된다(Map은 아직 안 본 지운 항목을 건너뛴다)
    for (const entry of this.entries.values()) {
      entry.cancel?.();
      this.remove(entry);
    }
    this.options.builder.dispose();
  }

  /** 타일이 쥔 메모리를 바꾼다(합계도 함께) */
  private setBytes(entry: TileEntry<G>, bytes: number): void {
    this.memoryBytes += bytes - entry.bytes;
    entry.bytes = bytes;
  }

  /** 풀어 둔 타일 바이트(없으면 0) */
  private tileBytes(entry: TileEntry<G>): number {
    return entry.tile ? decodedTileBytes(entry.tile) : 0;
  }

  private createEntry(key: number, node: TileNode, now: number, frame: number): TileEntry<G> {
    const entry: TileEntry<G> = {
      key,
      node,
      state: "fetching",
      cancel: null,
      tile: null,
      mesh: null,
      gpu: null,
      bytes: 0,
      fetchStartedAt: now,
      lastUsed: frame,
      lastWanted: now,
      failures: 0,
      retryAt: 0,
    };
    this.entries.set(key, entry);
    return entry;
  }

  private start(entry: TileEntry<G>): void {
    const controller = new AbortController();
    entry.state = "fetching";
    entry.fetchStartedAt = this.options.now();
    this.fetching += 1;
    const request = tileRequestOf(entry.node);
    let settled = false;
    // 화면이 멈춰 있어도 시간 제한을 보게 그때 한 번 더 그린다(그 프레임의 request가 멈춘다)
    const wake = setTimeout(() => {
      if (!this.disposed) this.options.onChange();
    }, FETCH_TIMEOUT_MS + 10);
    // 받기 자리를 한 번만 돌려준다(끝났을 때, 취소했을 때, 시간이 지났을 때)
    const release = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(wake);
      this.fetching -= 1;
      entry.cancel = null;
    };
    entry.cancel = () => {
      release();
      controller.abort();
    };
    // 취소했거나 버렸거나 엔진을 닫았으면 결과를 쓰지 않는다
    const current = (): boolean => !this.disposed && this.entries.get(entry.key) === entry;
    let pending: Promise<DecodedTile | EncodedTile>;
    try {
      pending = this.options.source(request, controller.signal);
    } catch (error) {
      pending = Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    pending.then(
      (received) => {
        if (settled) return;
        release();
        if (!current()) return;
        // 풀어 둔 타일은 바로 확인한다. 받은 이진은 메시 만들기가 푼 뒤에 확인한다(build)
        if (!isEncodedTile(received) && this.tileProblem(received, request)) {
          this.fail(entry);
          return;
        }
        this.build(entry, received, request);
      },
      () => {
        if (settled) return;
        release();
        if (current()) this.fail(entry);
      },
    );
  }

  /** 받은 타일이 틀린 이유(모양·요청한 칸 범위·행성 크기). 맞으면 null */
  private tileProblem(tile: DecodedTile, request: TileRequest): string | null {
    return (
      decodedTileProblem(tile) ??
      requestMismatch(tile, request) ??
      (tile.faceLevel === this.options.layout.faceLevel ? null : "tile is for another planet size")
    );
  }

  private build(entry: TileEntry<G>, input: DecodedTile | EncodedTile, request: TileRequest): void {
    entry.state = "building";
    entry.tile = isEncodedTile(input) ? null : input;
    this.setBytes(entry, isEncodedTile(input) ? input.bytes.byteLength : this.tileBytes(entry));
    this.building += 1;
    this.options.builder.build(input, this.options.radiusM).then(
      (built) => {
        this.building -= 1;
        if (this.disposed || this.entries.get(entry.key) !== entry) return;
        if (isEncodedTile(input) && this.tileProblem(built.tile, request)) {
          this.fail(entry);
          return;
        }
        entry.tile = built.tile;
        entry.mesh = built.mesh;
        this.setBytes(entry, this.tileBytes(entry) + tileGpuBytes(built.mesh));
        entry.state = "built";
        entry.failures = 0;
        this.options.onChange();
      },
      () => {
        this.building -= 1;
        if (this.disposed || this.entries.get(entry.key) !== entry) return;
        this.fail(entry);
      },
    );
  }

  private fail(entry: TileEntry<G>): void {
    entry.state = "failed";
    // 만들지 못한 타일은 누르기·높이 읽기에 쓰지 않는다
    entry.tile = null;
    entry.mesh = null;
    this.setBytes(entry, 0);
    entry.failures += 1;
    const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (entry.failures - 1));
    entry.retryAt = this.options.now() + delay;
    this.errors += 1;
    this.options.onChange();
    // 화면이 멈춰 있어도 다시 받게 그때 한 번 더 그린다
    setTimeout(() => {
      if (!this.disposed) this.options.onChange();
    }, delay + 10);
  }

  private remove(entry: TileEntry<G>): void {
    if (entry.gpu) {
      this.gpuBytes -= entry.gpu.bytes;
      entry.gpu.dispose();
      entry.gpu = null;
    }
    entry.mesh = null;
    entry.tile = null;
    this.setBytes(entry, 0);
    this.entries.delete(entry.key);
  }
}

/** 받은 타일이 요청한 칸 범위와 같은지 */
function requestMismatch(tile: DecodedTile, request: TileRequest): string | null {
  if (
    tile.face !== request.face ||
    tile.mapLevel !== request.mapLevel ||
    tile.i0 !== request.i0 ||
    tile.j0 !== request.j0 ||
    tile.size !== request.size
  ) {
    return "tile does not match the request";
  }
  return null;
}
