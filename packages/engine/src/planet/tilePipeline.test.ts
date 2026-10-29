import { FACES } from "@terra/planet";
import { encodePlanetTile } from "@terra/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WantedTile } from "./lodSelect.ts";
import {
  DEFAULT_PLANET_BUDGETS,
  type DecodedTile,
  type EncodedTile,
  type TileRequest,
  type TileSource,
} from "./planetTypes.ts";
import { EARTH_RADIUS_M, makeTile } from "./testSupport.ts";
import { decodeTileInput } from "./tileDecode.ts";
import { buildTileMesh, decodedTileBytes, tileGpuBytes } from "./tileMesh.ts";
import { FETCH_TIMEOUT_MS, type GpuTile, type TileMeshBuilder, TilePipeline } from "./tilePipeline.ts";
import { type TileNode, tileKey, tileLayout, tileRequestOf } from "./tileTree.ts";

const layout = tileLayout(9);

/** 손으로 끝내는 원천: 요청을 모아 두고 resolve·reject를 시험이 부른다 */
function manualSource() {
  const calls: {
    request: TileRequest;
    signal: AbortSignal;
    resolve: (tile: DecodedTile | EncodedTile) => void;
    reject: (e: Error) => void;
  }[] = [];
  const source: TileSource = (request, signal) =>
    new Promise<DecodedTile | EncodedTile>((resolve, reject) => {
      calls.push({ request, signal, resolve, reject });
    });
  const answer = (index: number): void => {
    const call = calls[index];
    if (!call) throw new Error(`no call ${index}`);
    const { face, mapLevel, i0, j0, size } = call.request;
    call.resolve(makeTile(face, mapLevel, i0, j0, size));
  };
  return { source, calls, answer };
}

/** 화면 스레드에서 바로 만드는 만들기(워커 없이). 받은 이진은 워커처럼 먼저 푼다 */
const mainBuilder: TileMeshBuilder = {
  build: (input, radiusM) => {
    try {
      const tile = decodeTileInput(input);
      return Promise.resolve({ mesh: buildTileMesh(tile, radiusM), tile });
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  },
  dispose: () => undefined,
};

/** 서버가 보내는 이진(TCPT) — 풀어 둔 시험 타일 + 머리 값 */
function encodedTile(tile: DecodedTile): EncodedTile {
  const bytes = encodePlanetTile({ ...tile, generatorVersion: 1, definitionHash: "ab".repeat(32) });
  return { kind: "encoded", bytes: Uint8Array.from(bytes).buffer };
}

interface FakeGpu extends GpuTile {
  disposed: boolean;
}

/** 가짜 GPU 타일이 JS에 남긴다고 치는 바이트(three는 메시 배열을 들고 있다 — 시험은 값만 본다) */
const RETAINED_BYTES = 100;

function setup(overrides: Partial<typeof DEFAULT_PLANET_BUDGETS> = {}) {
  let clock = 0;
  const { source, calls, answer } = manualSource();
  const created: FakeGpu[] = [];
  const onChange = vi.fn();
  const pipeline = new TilePipeline<FakeGpu>({
    source,
    builder: mainBuilder,
    layout,
    radiusM: EARTH_RADIUS_M,
    budgets: { ...DEFAULT_PLANET_BUDGETS, ...overrides },
    createGpu: (mesh) => {
      const gpu: FakeGpu = {
        bytes: mesh.positions.byteLength + mesh.cellData.byteLength,
        retainedBytes: RETAINED_BYTES,
        disposed: false,
        dispose() {
          gpu.disposed = true;
        },
      };
      created.push(gpu);
      return gpu;
    },
    onChange,
    now: () => clock,
  });
  const advance = (ms: number): void => {
    clock += ms;
  };
  return { pipeline, calls, answer, created, onChange, advance };
}

const wanted = (nodes: TileNode[]): WantedTile[] =>
  nodes.map((node, index) => ({ key: tileKey(node), node, priority: index }));
const level6 = (count: number): TileNode[] =>
  Array.from({ length: count }, (_, k) => ({
    face: FACES[Math.floor(k / 4) % 6] ?? 0,
    mapLevel: 6,
    tx: k % 2,
    ty: Math.floor(k / 2) % 2,
  }));
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.useRealTimers();
});

describe("타일 받기·올리기", () => {
  it("동시 받기 상한(2)을 지키고, 기다린 요청은 상한 횟수로 센다", () => {
    const { pipeline, calls } = setup({ concurrentFetches: 2 });
    pipeline.request(wanted(level6(5)), 1);
    expect(calls).toHaveLength(2);
    expect(pipeline.counts().fetching).toBe(2);
    expect(pipeline.hits.fetches).toBe(1);
  });

  it("받은 타일은 만들고(메시) 올리기를 기다린다 → 한 프레임 상한(1)만큼 올린다", async () => {
    const { pipeline, calls, answer, created, onChange } = setup({
      concurrentFetches: 4,
      uploadsPerFrame: 1,
    });
    const nodes = level6(3);
    pipeline.request(wanted(nodes), 1);
    for (let i = 0; i < calls.length; i++) answer(i);
    await settle();
    expect(onChange).toHaveBeenCalled();
    expect(pipeline.counts().queued).toBe(3);
    const priority = new Map(wanted(nodes).map((item) => [item.key, item.priority]));
    expect(pipeline.upload(1, priority)).toBe(true);
    expect(created).toHaveLength(1);
    expect(pipeline.drawable(tileKey(nodes[0] ?? nodes[1] ?? { face: 0, mapLevel: 6, tx: 0, ty: 0 }))).toBe(
      true,
    );
    expect(pipeline.hits.uploads).toBe(1);
    expect(pipeline.upload(5, priority)).toBe(false);
    expect(pipeline.counts().loaded).toBe(3);
    expect(pipeline.decoded(tileKey(nodes[2] ?? { face: 0, mapLevel: 6, tx: 0, ty: 0 }))?.mapLevel).toBe(6);
  });

  it("원하지 않게 된 받기는 잠시 뒤 취소한다", () => {
    const { pipeline, calls, advance } = setup({ concurrentFetches: 6 });
    const nodes = level6(2);
    pipeline.request(wanted(nodes), 1);
    expect(calls).toHaveLength(2);
    // 첫 타일만 계속 원한다
    advance(100);
    pipeline.request(wanted(nodes.slice(0, 1)), 2);
    expect(calls[1]?.signal.aborted).toBe(false);
    advance(600);
    pipeline.request(wanted(nodes.slice(0, 1)), 3);
    expect(calls[1]?.signal.aborted).toBe(true);
    expect(calls[0]?.signal.aborted).toBe(false);
    expect(pipeline.counts().fetching).toBe(1);
  });

  it("실패하면 기다렸다가(1초부터 두 배) 다시 받는다. 모양이 틀린 타일도 실패다", async () => {
    const { pipeline, calls, advance } = setup();
    const node: TileNode = { face: 3, mapLevel: 7, tx: 2, ty: 1 };
    pipeline.request(wanted([node]), 1);
    calls[0]?.reject(new Error("network"));
    await settle();
    expect(pipeline.errors).toBe(1);
    pipeline.request(wanted([node]), 2);
    expect(calls).toHaveLength(1);
    advance(1001);
    pipeline.request(wanted([node]), 3);
    expect(calls).toHaveLength(2);
    // 요청과 다른 칸 범위의 타일
    calls[1]?.resolve(makeTile(3, 7, 0, 0, 32));
    await settle();
    expect(pipeline.errors).toBe(2);
    advance(1500);
    pipeline.request(wanted([node]), 4);
    expect(calls).toHaveLength(2);
    advance(600);
    pipeline.request(wanted([node]), 5);
    expect(calls).toHaveLength(3);
  });

  it("서버 이진(EncodedTile)은 만들 때 풀고, 푼 뒤 요청과 다르면 실패다", async () => {
    const { pipeline, calls, created } = setup({ concurrentFetches: 4 });
    const node: TileNode = { face: 2, mapLevel: 7, tx: 1, ty: 3 };
    const other: TileNode = { face: 2, mapLevel: 7, tx: 0, ty: 0 };
    pipeline.request(wanted([node, other]), 1);
    const [first, second] = calls;
    if (!first || !second) throw new Error("two calls");
    const { face, mapLevel, i0, j0, size } = first.request;
    first.resolve(encodedTile(makeTile(face, mapLevel, i0, j0, size)));
    // 두 번째 요청에는 첫 요청의 칸 범위 이진을 준다(머리 값이 요청과 다르다)
    second.resolve(encodedTile(makeTile(face, mapLevel, i0, j0, size)));
    await settle();
    expect(pipeline.errors).toBe(1);
    expect(pipeline.counts().queued).toBe(1);
    pipeline.upload(4, new Map());
    expect(created).toHaveLength(1);
    expect(pipeline.drawable(tileKey(node))).toBe(true);
    expect(pipeline.drawable(tileKey(other))).toBe(false);
    // 풀어 둔 타일은 해석기 결과(머리 값 포함)를 그대로 들고 있다
    expect(pipeline.decoded(tileKey(node))).toMatchObject({
      face,
      mapLevel,
      i0,
      j0,
      size,
      generatorVersion: 1,
    });
  });

  it("읽을 수 없는 이진(마법 값·길이)은 실패로 센다", async () => {
    const { pipeline, calls } = setup();
    pipeline.request(wanted([{ face: 0, mapLevel: 6, tx: 0, ty: 0 }]), 1);
    calls[0]?.resolve({ kind: "encoded", bytes: new Uint8Array(64).buffer });
    await settle();
    expect(pipeline.errors).toBe(1);
    expect(pipeline.counts().queued).toBe(0);
  });

  it("메모리 상한: 이번 프레임에 안 쓴 것을 오래된 것부터 버리고, 지킬 것(꼭대기)은 남긴다", async () => {
    const { pipeline, calls, answer, created } = setup({ concurrentFetches: 10 });
    const roots: TileNode[] = [FACES[0], FACES[1], FACES[2]].map((face) => ({
      face: face ?? 0,
      mapLevel: 5,
      tx: 0,
      ty: 0,
    }));
    const leaves = level6(4);
    pipeline.request(wanted([...roots, ...leaves]), 1);
    for (let i = 0; i < calls.length; i++) answer(i);
    await settle();
    pipeline.upload(100, new Map());
    const each = created[0]?.bytes ?? 0;
    expect(pipeline.counts().gpuBytes).toBe(each * 7);
    // 타일 하나 = GPU 추정 + JS 사본 + 풀어 둔 타일(32칸 타일은 모두 같은 크기)
    const tile = pipeline.decoded(tileKey(leaves[0] ?? roots[0] ?? { face: 0, mapLevel: 6, tx: 0, ty: 0 }));
    if (!tile) throw new Error("decoded tile");
    const perTile = each + RETAINED_BYTES + decodedTileBytes(tile);
    expect(pipeline.counts().memoryBytes).toBe(perTile * 7);
    // 상한을 타일 4개 크기로 줄이고, 2번 프레임에 잎 하나만 썼다
    const small = setup({ concurrentFetches: 10, memoryBytes: perTile * 4 });
    small.pipeline.request(wanted([...roots, ...leaves]), 1);
    for (let i = 0; i < small.calls.length; i++) small.answer(i);
    await settle();
    small.pipeline.upload(100, new Map());
    const used = leaves[3];
    if (!used) return;
    small.pipeline.touch([tileKey(used)], 2);
    small.pipeline.evict(2, (node) => node.mapLevel === 5);
    expect(small.pipeline.counts().memoryBytes).toBeLessThanOrEqual(perTile * 4);
    expect(small.pipeline.counts().gpuBytes).toBe(each * 4);
    for (const root of roots) expect(small.pipeline.drawable(tileKey(root))).toBe(true);
    expect(small.pipeline.drawable(tileKey(used))).toBe(true);
    expect(small.pipeline.hits.memory).toBe(3);
    expect(small.created.filter((gpu) => gpu.disposed)).toHaveLength(3);
  });

  it("닫으면 받기를 취소하고 GPU 타일을 버린다", async () => {
    const { pipeline, calls, answer, created } = setup();
    pipeline.request(wanted(level6(2)), 1);
    answer(0);
    await settle();
    pipeline.upload(4, new Map());
    pipeline.dispose();
    expect(calls[1]?.signal.aborted).toBe(true);
    expect(created.every((gpu) => gpu.disposed)).toBe(true);
    expect(pipeline.counts().gpuBytes).toBe(0);
    expect(pipeline.counts().memoryBytes).toBe(0);
  });

  it("메모리 추정: 올리기 전 = 풀어 둔 타일 + 메시 배열, 올린 뒤 = 풀어 둔 타일 + GPU 추정 + JS 사본", async () => {
    const { pipeline, answer, created } = setup();
    const node: TileNode = { face: 1, mapLevel: 8, tx: 3, ty: 5 };
    pipeline.request(wanted([node]), 1);
    answer(0);
    await settle();
    const tile = pipeline.decoded(tileKey(node));
    if (!tile) throw new Error("decoded tile");
    const mesh = buildTileMesh(tile, EARTH_RADIUS_M);
    expect(pipeline.counts().memoryBytes).toBe(decodedTileBytes(tile) + tileGpuBytes(mesh));
    pipeline.upload(1, new Map());
    const gpu = created[0];
    if (!gpu) throw new Error("gpu tile");
    expect(pipeline.counts().memoryBytes).toBe(decodedTileBytes(tile) + gpu.bytes + RETAINED_BYTES);
    // 풀어 둔 32칸 타일 = 꼭짓점 높이 33² × 2바이트 + 칸 값 6가지 × 32²
    expect(decodedTileBytes(tile)).toBe(33 * 33 * 2 + 6 * 32 * 32);
  });
});

describe("받기 시간 제한", () => {
  it("답하지 않는 받기는 시간 제한에 멈추고(abort) 실패로 센다 — 자리가 비어 다른 타일을 받고, 기다린 뒤 다시 받는다", () => {
    vi.useFakeTimers();
    const { pipeline, calls, advance, onChange } = setup({ concurrentFetches: 2 });
    const nodes = level6(3);
    pipeline.request(wanted(nodes), 1);
    expect(calls).toHaveLength(2);
    // 시간 제한 바로 전: 그대로 기다린다(세 번째는 자리가 없다)
    advance(FETCH_TIMEOUT_MS - 1);
    pipeline.request(wanted(nodes), 2);
    expect(calls).toHaveLength(2);
    expect(pipeline.errors).toBe(0);
    // 화면이 멈춰 있어도 시간 제한 때 한 번 더 그리게 한다(그 프레임의 request가 멈춘다)
    onChange.mockClear();
    vi.advanceTimersByTime(FETCH_TIMEOUT_MS + 10);
    expect(onChange).toHaveBeenCalled();
    advance(1);
    pipeline.request(wanted(nodes), 3);
    expect(calls[0]?.signal.aborted).toBe(true);
    expect(calls[1]?.signal.aborted).toBe(true);
    expect(pipeline.errors).toBe(2);
    // 빈 자리로 세 번째 타일을 받는다
    expect(calls).toHaveLength(3);
    const third = nodes[2];
    if (!third) throw new Error("third node");
    expect(calls[2]?.request).toEqual(tileRequestOf(third));
    expect(pipeline.counts().fetching).toBe(1);
    // 실패 대기(1초) 뒤 멈춘 두 타일을 다시 받는다
    advance(1001);
    pipeline.request(wanted(nodes), 4);
    expect(calls).toHaveLength(4);
    expect(pipeline.counts().fetching).toBe(2);
    pipeline.dispose();
  });

  it("늦게 온 답(멈춘 뒤)은 쓰지 않는다", async () => {
    vi.useFakeTimers();
    const { pipeline, calls, advance } = setup({ concurrentFetches: 1 });
    const node: TileNode = { face: 4, mapLevel: 6, tx: 1, ty: 0 };
    pipeline.request(wanted([node]), 1);
    advance(FETCH_TIMEOUT_MS);
    pipeline.request(wanted([node]), 2);
    expect(pipeline.errors).toBe(1);
    const call = calls[0];
    if (!call) throw new Error("call");
    const { face, mapLevel, i0, j0, size } = call.request;
    call.resolve(makeTile(face, mapLevel, i0, j0, size));
    await vi.runAllTimersAsync();
    expect(pipeline.counts().queued).toBe(0);
    expect(pipeline.decoded(tileKey(node))).toBeNull();
    pipeline.dispose();
  });
});
