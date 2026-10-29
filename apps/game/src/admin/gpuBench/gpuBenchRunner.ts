// 셰이더 측정 실행기 — [측정 시작]을 누를 때만 받는 지연 조각(GpuBenchPanel이 import()한다).
// 타일 수마다 자료를 한 번 만들고, 고른 방식을 차례로 잰다. 방식 코드(three, three/webgpu)는 그 방식을 처음 잴 때 받는다.
// 한 번 재기: 코드 받기 → 렌더러 만들기·초기화 → 장면 → 셰이더 컴파일 → 첫 프레임 → 몸풀기 1초 → 재기 6초 → 버리기.
// 결과는 휴대폰 화면에서 보고 복사한다(서버로 보내지 않는다). 프레임 측정은 앱의 프레임 측정기와 같은 계산(frameStats.ts)이다.
import { summarizeFrames } from "../../perf/frameStats.ts";
import {
  BENCH_MEASURE_SEC,
  BENCH_WARMUP_SEC,
  type BenchEnvironment,
  type BenchModeId,
  type BenchProgress,
  type BenchReport,
  type CreateSession,
  type FrameCost,
  type ModeSession,
  type RunResult,
  type StopReason,
  type WebGpuProbe,
} from "./gpuBenchTypes.ts";
import { type BenchWorkload, buildWorkload } from "./gpuBenchWorkload.ts";

/** 방식 코드 — 따로 받는 조각. WebGPU·WebGL2 + TSL은 같은 코드다 */
const LOADERS: Record<BenchModeId, () => Promise<{ createSession: CreateSession }>> = {
  "webgl-glsl": () => import("./gpuBenchGlsl.ts"),
  "webgpu-tsl": () => import("./gpuBenchTsl.ts"),
  "webgl2-tsl": () => import("./gpuBenchTsl.ts"),
};

/** 단계별 시간 상한(ms) — 넘으면 그 측정은 실패로 친다(멈춘 기기에서 끝없이 기다리지 않게) */
const INIT_TIMEOUT_MS = 20_000;
const COMPILE_TIMEOUT_MS = 60_000;
const FRAME_TIMEOUT_MS = 20_000;
/** 측정 사이 쉬는 시간(ms) — 버린 GPU 자원·쓰레기 수거 */
const PAUSE_MS = 500;
/** 버리기 전에 GPU에 남은 프레임을 기다리는 상한(ms) */
const DRAIN_TIMEOUT_MS = 8_000;

export interface RunBenchOptions {
  /** 캔버스를 붙일 곳(화면 전체를 덮는 판) */
  host: HTMLElement;
  modes: readonly BenchModeId[];
  tileCounts: readonly number[];
  build: string;
  signal: AbortSignal;
  onProgress: (progress: BenchProgress) => void;
  warmupSec?: number;
  measureSec?: number;
}

const now = (): number => performance.now();
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const nextFrame = (): Promise<number> => new Promise((resolve) => requestAnimationFrame(resolve));
const round1 = (value: number): number => Math.round(value * 10) / 10;

/** JS 힙(MB, 소수 1자리). 크롬 계열만 있는 값(performance.memory) */
function readHeapMb(): number | null {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return memory ? round1(memory.usedJSHeapSize / 1_048_576) : null;
}

/** 엔진(packages/engine sharedRenderer.ts의 defaultMaxPixelRatio)과 같은 픽셀 비율 상한: 휴대폰 1.5, 그 밖 2 */
function maxPixelRatio(): number {
  const coarse = matchMedia("(pointer: coarse)").matches;
  return coarse && Math.min(screen.width, screen.height) <= 600 ? 1.5 : 2;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** 오류를 짧은 문장으로(화면·요약에 그대로 보인다) */
function shortError(error: unknown): string {
  const text = error instanceof Error ? error.message || error.name : String(error);
  return text.replace(/\s+/g, " ").slice(0, 120);
}

/** WebGPU를 쓸 수 있는지 본다: API, 어댑터(three와 같은 요청), 어댑터 정보 */
async function probeWebGpu(): Promise<WebGpuProbe> {
  const probe: WebGpuProbe = {
    api: false,
    adapter: "no",
    vendor: null,
    architecture: null,
    description: null,
    core: null,
    fallbackAdapter: null,
  };
  if (!("gpu" in navigator) || !navigator.gpu) return probe;
  probe.api = true;
  try {
    // three(WebGPUBackend)와 같이 호환 단계도 받는다. featureLevel은 TS DOM 타입에 아직 없다
    const options: GPURequestAdapterOptions & { featureLevel: string } = { featureLevel: "compatibility" };
    const adapter = await withTimeout(
      navigator.gpu.requestAdapter(options),
      INIT_TIMEOUT_MS,
      "adapter_timeout",
    );
    if (!adapter) return probe;
    probe.adapter = "yes";
    probe.core = adapter.features.has("core-features-and-limits");
    if ("info" in adapter && adapter.info) {
      probe.vendor = adapter.info.vendor || null;
      probe.architecture = adapter.info.architecture || null;
      probe.description = adapter.info.description || null;
      probe.fallbackAdapter = adapter.info.isFallbackAdapter ?? null;
    }
  } catch {
    probe.adapter = "error";
  }
  return probe;
}

const isResource = (entry: PerformanceEntry): entry is PerformanceResourceTiming =>
  entry instanceof PerformanceResourceTiming;

/** 이번에 새로 받은 JS 크기를 센다(Resource Timing). 못 재면 null */
function watchScripts(): () => Pick<RunResult, "jsTransferKb" | "jsDecodedKb" | "jsFiles"> | null {
  const entries: PerformanceResourceTiming[] = [];
  let observer: PerformanceObserver | null = null;
  try {
    observer = new PerformanceObserver((list) => {
      entries.push(...list.getEntries().filter(isResource));
    });
    observer.observe({ type: "resource", buffered: false });
  } catch {
    return () => null;
  }
  return () => {
    if (!observer) return null;
    entries.push(...observer.takeRecords().filter(isResource));
    observer.disconnect();
    observer = null;
    const scripts = entries.filter((entry) => /\.js(?:$|\?)/.test(entry.name));
    const sum = (pick: (entry: PerformanceResourceTiming) => number): number =>
      round1(scripts.reduce((total, entry) => total + pick(entry), 0) / 1024);
    return {
      jsTransferKb: sum((entry) => entry.encodedBodySize),
      jsDecodedKb: sum((entry) => entry.decodedBodySize),
      jsFiles: scripts.length,
    };
  };
}

function emptyResult(mode: BenchModeId, tiles: number, status: RunResult["status"]): RunResult {
  return {
    mode,
    tiles,
    status,
    backend: null,
    samples: null,
    compatibilityMode: null,
    loadMs: null,
    initMs: null,
    sceneMs: null,
    compileMs: null,
    firstRenderMs: null,
    firstFrameMs: null,
    frames: null,
    cpu: null,
    gpu: null,
    gpuDonePerSec: null,
    gpuPending: null,
    drawCalls: null,
    triangles: null,
    heapBeforeMb: null,
    heapPeakMb: null,
    jsTransferKb: null,
    jsDecodedKb: null,
    jsFiles: null,
    note: null,
  };
}

interface LoopResult {
  intervals: number[];
  cpu: number[];
  /** 재는 동안 제출한 프레임의 GPU 완료 지연(재기 안에 끝난 것만) */
  gpu: number[];
  /** 재기를 마칠 때 아직 안 끝난 프레임 수(GPU 재기를 못 쓰면 null) */
  gpuPending: number | null;
  last: FrameCost | null;
  heapPeakMb: number | null;
}

/**
 * 렌더러의 프레임 반복으로 (몸풀기 + 재기)초 동안 그린다. 몸풀기 동안의 프레임은 기록하지 않는다.
 * 멈춤(signal)·잃어버림·프레임이 오래 안 오면 그때까지 잰 것을 돌려준다.
 */
function drawFor(
  session: ModeSession,
  warmupSec: number,
  measureSec: number,
  signal: AbortSignal,
  onTick: (remainingSec: number) => void,
): Promise<LoopResult> {
  return new Promise((resolve) => {
    const result: LoopResult = {
      intervals: [],
      cpu: [],
      gpu: [],
      gpuPending: null,
      last: null,
      heapPeakMb: readHeapMb(),
    };
    if (signal.aborted) {
      resolve(result);
      return;
    }
    const tracker = session.gpuDone;
    // 몸풀기 동안 표시한 것은 버린다(재기 시작 뒤 표시한 것만 센다)
    let marked = false;
    let begin: number | null = null;
    let previous: number | null = null;
    let lastTick = -1;
    let frame = 0;
    let done = false;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const finish = (): void => {
      if (done) return;
      done = true;
      clearTimeout(watchdog);
      signal.removeEventListener("abort", finish);
      session.setLoop(null);
      if (tracker) {
        if (marked) result.gpu.push(...tracker.collect());
        result.gpuPending = tracker.pending();
      }
      resolve(result);
    };
    const arm = (): void => {
      clearTimeout(watchdog);
      watchdog = setTimeout(finish, FRAME_TIMEOUT_MS);
    };
    signal.addEventListener("abort", finish);
    arm();
    session.setLoop((time) => {
      if (done) return;
      arm();
      begin ??= time;
      const elapsedSec = (time - begin) / 1000;
      const measuring = elapsedSec >= warmupSec;
      if (measuring && previous !== null && (previous - begin) / 1000 >= warmupSec) {
        result.intervals.push(time - previous);
      }
      previous = time;
      if (tracker) {
        const finished = tracker.collect();
        if (marked) result.gpu.push(...finished);
      }
      const cost = session.render(elapsedSec);
      if (measuring) {
        result.cpu.push(cost.cpuMs);
        result.last = cost;
        tracker?.mark();
        marked = true;
      }
      // 힙은 30프레임마다 본다(읽기도 비용이 있다)
      frame += 1;
      if (frame % 30 === 0) {
        const heap = readHeapMb();
        if (heap !== null) result.heapPeakMb = Math.max(result.heapPeakMb ?? 0, heap);
      }
      const remaining = Math.max(0, Math.ceil(warmupSec + measureSec - elapsedSec));
      if (remaining !== lastTick) {
        lastTick = remaining;
        onTick(remaining);
      }
      if (elapsedSec >= warmupSec + measureSec || session.lostReason() !== null) finish();
    });
  });
}

/**
 * GPU가 남은 프레임을 다 그릴 때까지 기다린다(상한 있음). 이유: 남은 일이 있는 채 WebGPU 장치를 버리면
 * 브라우저가 그 일을 끝낼 때까지 다음 측정의 렌더러 초기화가 늦어진다(Xvfb + SwiftShader에서 0.2~0.9초, 확인함).
 */
async function drainGpu(session: ModeSession): Promise<void> {
  const tracker = session.gpuDone;
  if (!tracker) return;
  const deadline = now() + DRAIN_TIMEOUT_MS;
  while (tracker.pending() > 0 && now() < deadline) {
    tracker.collect();
    await sleep(50);
  }
}

interface RunContext {
  host: HTMLElement;
  env: BenchEnvironment;
  signal: AbortSignal;
  warmupSec: number;
  measureSec: number;
  progress: (phase: BenchProgress["phase"], remainingSec?: number | null) => void;
  /** 처음 받은 방식 코드(다시 받지 않는다) */
  loaded: Map<BenchModeId, Promise<{ createSession: CreateSession }>>;
}

/** 한 방식 × 한 타일 수를 잰다. 실패해도 예외를 던지지 않고 결과에 적는다 */
async function runOne(context: RunContext, mode: BenchModeId, workload: BenchWorkload): Promise<RunResult> {
  const { host, env, signal } = context;
  const result = emptyResult(mode, workload.tiles.length, "ok");
  result.heapBeforeMb = readHeapMb();
  const canvas = document.createElement("canvas");
  canvas.className = "bench-canvas";
  host.append(canvas);
  let session: ModeSession | null = null;
  try {
    context.progress("load");
    let loading = context.loaded.get(mode);
    if (!loading) {
      const scripts = watchScripts();
      const start = now();
      loading = LOADERS[mode]();
      context.loaded.set(mode, loading);
      await loading;
      result.loadMs = round1(now() - start);
      Object.assign(result, scripts());
    }
    const { createSession } = await loading;
    if (signal.aborted) return { ...result, status: "stopped" };

    context.progress("init");
    const initStart = now();
    session = await withTimeout(
      createSession({
        canvas,
        width: env.canvasW,
        height: env.canvasH,
        pixelRatio: env.pixelRatio,
        forceWebGL: mode === "webgl2-tsl",
      }),
      INIT_TIMEOUT_MS,
      "init_timeout",
    );
    result.initMs = round1(now() - initStart);
    result.backend = session.info.backend;
    result.samples = session.info.samples;
    result.compatibilityMode = session.info.compatibilityMode;
    env.glRenderer ??= session.info.glRenderer;
    if (mode === "webgpu-tsl" && session.info.backend !== "webgpu") {
      // WebGPU를 못 써 three가 WebGL2로 바꿨다. 그 길은 "WebGL2 + TSL"이 따로 잰다
      return { ...result, status: "fallback", note: "webgl2_backend" };
    }

    const sceneStart = now();
    session.setScene(workload);
    result.sceneMs = round1(now() - sceneStart);

    context.progress("compile");
    const compileStart = now();
    await withTimeout(session.compile(), COMPILE_TIMEOUT_MS, "compile_timeout");
    result.compileMs = round1(now() - compileStart);
    if (signal.aborted) return { ...result, status: "stopped" };

    const firstStart = now();
    session.render(0);
    result.firstRenderMs = round1(now() - firstStart);
    await withTimeout(nextFrame(), FRAME_TIMEOUT_MS, "frame_timeout");
    result.firstFrameMs = round1(now() - firstStart);

    context.progress("measure", context.warmupSec + context.measureSec);
    const loop = await drawFor(session, context.warmupSec, context.measureSec, signal, (remaining) =>
      context.progress("measure", remaining),
    );
    result.frames = loop.intervals.length > 0 ? summarizeFrames(loop.intervals) : null;
    result.cpu = loop.cpu.length > 0 ? summarizeFrames(loop.cpu) : null;
    result.gpu = loop.gpu.length > 0 ? summarizeFrames(loop.gpu) : null;
    const gpuFailures = session.gpuDone?.failures() ?? { count: 0, last: null };
    if (session.gpuDone && (gpuFailures.count === 0 || loop.gpu.length > 0)) {
      // 잰 시간 = 프레임 간격의 합(멈췄으면 그때까지)
      const measuredSec = (result.frames?.elapsedMs ?? context.measureSec * 1000) / 1000;
      result.gpuDonePerSec = measuredSec > 0 ? round1(loop.gpu.length / measuredSec) : null;
      result.gpuPending = loop.gpuPending;
    }
    result.drawCalls = loop.last?.drawCalls ?? null;
    result.triangles = loop.last?.triangles ?? null;
    result.heapPeakMb = loop.heapPeakMb;
    const lost = session.lostReason();
    const error = session.firstError();
    if (lost !== null) return { ...result, status: "failed", note: `lost: ${lost}` };
    if (signal.aborted) return { ...result, status: "stopped" };
    if (error !== null) result.note = error;
    // GPU 완료 알림이 실패했으면(헤드리스 SwiftShader WebGPU: 캔버스에 아무것도 안 그려졌다) 프레임 수치를 믿을 수 없다.
    // 숫자는 두고 이유를 적는다. 하나도 안 끝났으면 실패로 친다
    if (gpuFailures.count > 0) {
      result.note = `gpu_done_failed ×${gpuFailures.count}: ${gpuFailures.last ?? ""}`;
      if (loop.gpu.length === 0) result.status = "failed";
    }
    if (result.frames === null) return { ...result, status: "failed", note: "no_frames" };
    return result;
  } catch (error) {
    return { ...result, status: signal.aborted ? "stopped" : "failed", note: shortError(error) };
  } finally {
    context.progress("dispose");
    try {
      if (session) await drainGpu(session);
      await session?.dispose();
    } catch {
      // 버리다 난 오류는 결과에 영향이 없다
    }
    canvas.remove();
  }
}

/**
 * 측정을 돌린다. host는 화면에 보이고 크기가 정해진 뒤여야 한다(캔버스 크기 = host 크기).
 * 멈추면(signal) 잰 데까지 돌려준다. 화면이 가려지면 스스로 멈춘다(프레임이 멈춰 숫자가 틀어진다).
 */
export async function runGpuBench(options: RunBenchOptions): Promise<BenchReport> {
  const started = now();
  const { host, modes, tileCounts, signal } = options;
  const warmupSec = options.warmupSec ?? BENCH_WARMUP_SEC;
  const measureSec = options.measureSec ?? BENCH_MEASURE_SEC;
  const internal = new AbortController();
  let stopped: StopReason = null;
  const stop = (reason: Exclude<StopReason, null>): void => {
    if (stopped !== null) return;
    stopped = reason;
    internal.abort();
  };
  const onAbort = (): void => stop("user");
  const onVisibility = (): void => {
    if (document.visibilityState === "hidden") stop("hidden");
  };
  if (signal.aborted) stop("user");
  signal.addEventListener("abort", onAbort);
  document.addEventListener("visibilitychange", onVisibility);

  const pixelRatio = Math.min(window.devicePixelRatio || 1, maxPixelRatio());
  const canvasW = Math.max(1, Math.round(host.clientWidth));
  const canvasH = Math.max(1, Math.round(host.clientHeight));
  const nav = navigator as Navigator & { deviceMemory?: number };
  const env: BenchEnvironment = {
    startedAt: Date.now(),
    build: options.build,
    userAgent: navigator.userAgent.slice(0, 300),
    screenW: Math.round(screen.width),
    screenH: Math.round(screen.height),
    dpr: window.devicePixelRatio || 1,
    pixelRatio,
    canvasW,
    canvasH,
    bufferW: Math.round(canvasW * pixelRatio),
    bufferH: Math.round(canvasH * pixelRatio),
    cores: nav.hardwareConcurrency || null,
    memoryGb: nav.deviceMemory ?? null,
    webgpu: await probeWebGpu(),
    glRenderer: null,
    warmupSec,
    measureSec,
  };

  const runs: RunResult[] = [];
  const workloadMs: Record<number, number> = {};
  const total = tileCounts.length * modes.length;
  let index = 0;
  let webGpuMissing = env.webgpu.adapter !== "yes";
  let webGpuTried = false;
  const loaded = new Map<BenchModeId, Promise<{ createSession: CreateSession }>>();
  try {
    for (const tiles of tileCounts) {
      if (internal.signal.aborted) break;
      options.onProgress({
        index: index + 1,
        total,
        mode: modes[0] ?? "webgl-glsl",
        tiles,
        phase: "workload",
        remainingSec: null,
      });
      // 화면에 진행 판을 먼저 그린 뒤 만든다(몇백 ms 걸린다)
      await nextFrame();
      const workloadStart = now();
      const workload = buildWorkload(tiles);
      workloadMs[tiles] = round1(now() - workloadStart);
      for (const mode of modes) {
        if (internal.signal.aborted) break;
        index += 1;
        const position = index;
        const context: RunContext = {
          host,
          env,
          signal: internal.signal,
          warmupSec,
          measureSec,
          loaded,
          progress: (phase, remainingSec = null) =>
            options.onProgress({ index: position, total, mode, tiles, phase, remainingSec }),
        };
        if (mode === "webgpu-tsl" && webGpuMissing && webGpuTried) {
          // 대체(WebGL2)는 한 번만 재고(초기화 시간), 나머지 타일 수는 건너뛴다
          runs.push({ ...emptyResult(mode, tiles, "skipped"), note: "no_webgpu" });
          continue;
        }
        const result = await runOne(context, mode, workload);
        if (mode === "webgpu-tsl") {
          webGpuTried = true;
          if (result.status === "fallback") webGpuMissing = true;
        }
        runs.push(result);
        await sleep(PAUSE_MS);
      }
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    document.removeEventListener("visibilitychange", onVisibility);
  }
  return { env, runs, workloadMs, stopped, totalSec: round1((now() - started) / 1000) };
}
