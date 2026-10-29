// 셰이더 측정의 공용 모양 — 화면(GpuBenchPanel), 실행기(gpuBenchRunner), 방식 모듈(gpuBenchGlsl·gpuBenchTsl)이 함께 쓴다.
// 타입과 작은 상수만 둔다(three를 가져오지 않는다). 화면 조각에는 이 파일만 정적으로 들어간다.
import type { FrameSummary } from "../../perf/frameStats.ts";
import type { GpuDoneTracker } from "./gpuBenchGpuDone.ts";
import type { BenchWorkload } from "./gpuBenchWorkload.ts";

/** 측정 방식: 지금 엔진(WebGL2 + GLSL), WebGPU + TSL, 같은 TSL을 WebGL2 백엔드로(WebGPU가 없을 때 쓰는 길) */
export type BenchModeId = "webgl-glsl" | "webgpu-tsl" | "webgl2-tsl";
export const BENCH_MODES: readonly BenchModeId[] = ["webgl-glsl", "webgpu-tsl", "webgl2-tsl"];
/** 타일 수 — ADR 36 상한(보이는 타일 160개)의 1/4·1배·2배 */
export const BENCH_TILE_COUNTS: readonly number[] = [40, 160, 320];
/** 한 번 잴 때: 몸풀기(기록 안 함) + 재기(초) */
export const BENCH_WARMUP_SEC = 1;
export const BENCH_MEASURE_SEC = 6;

/** 방식 모듈에 넘기는 캔버스·크기 */
export interface SessionOptions {
  canvas: HTMLCanvasElement;
  /** CSS 픽셀 */
  width: number;
  height: number;
  pixelRatio: number;
  /** TSL 방식만: true면 WebGPU를 시도하지 않고 WebGL2 백엔드를 쓴다 */
  forceWebGL?: boolean;
}

export interface SessionInfo {
  /** 실제로 쓴 그래픽 API */
  backend: "webgl2" | "webgpu";
  /** 다중 표본(MSAA) 수. 모르면 null */
  samples: number | null;
  /** WebGL 렌더러 문자열(GPU 이름). WebGPU면 null */
  glRenderer: string | null;
  /** WebGPU 호환 모드(핵심 기능 없음 → three가 MSAA를 끈다). WebGL이면 null */
  compatibilityMode: boolean | null;
}

/** 한 프레임 그리기 비용 */
export interface FrameCost {
  /** render() 호출에 쓴 화면 스레드 시간(ms). GPU 시간은 들어가지 않는다 */
  cpuMs: number;
  drawCalls: number;
  triangles: number;
}

export interface ModeSession {
  info: SessionInfo;
  /** GPU 완료 재기(fence·onSubmittedWorkDone). 못 쓰면 null */
  gpuDone: GpuDoneTracker | null;
  /** 장면을 만든다(GPU에 올리기 전, 지오메트리 객체만) */
  setScene(workload: BenchWorkload): void;
  /** 셰이더·파이프라인을 미리 만든다(재질마다 하나로 three compileAsync, WebGL은 링크 확인까지). 끝나면 나머지 타일을 넣는다 */
  compile(): Promise<void>;
  /** timeSec초의 카메라로 한 번 그린다 */
  render(timeSec: number): FrameCost;
  /** 렌더러의 프레임 반복(setAnimationLoop). null이면 멈춘다 */
  setLoop(callback: ((time: number) => void) | null): void;
  /** 컨텍스트·장치를 잃었으면 그 이유 */
  lostReason(): string | null;
  /** 렌더러가 알린 첫 오류(WebGPU 검증 오류 등) */
  firstError(): string | null;
  dispose(): Promise<void>;
}

export type CreateSession = (options: SessionOptions) => Promise<ModeSession>;

/** 한 번 잰 결과의 상태 */
export type RunStatus = "ok" | "fallback" | "failed" | "skipped" | "stopped";

export interface RunResult {
  mode: BenchModeId;
  tiles: number;
  status: RunStatus;
  backend: SessionInfo["backend"] | null;
  samples: number | null;
  compatibilityMode: boolean | null;
  /** 방식 코드 받기(처음 한 번만 받는다) */
  loadMs: number | null;
  /** 렌더러 만들기 + 초기화(WebGPU: 어댑터·장치) */
  initMs: number | null;
  /** 장면 객체 만들기 */
  sceneMs: number | null;
  /** 셰이더·파이프라인 만들기(재질마다 하나로 compileAsync, WebGL은 링크 확인까지) */
  compileMs: number | null;
  /** 첫 render() 호출(모든 타일의 버퍼 올리기·물체 준비 포함) */
  firstRenderMs: number | null;
  /** 첫 render() 시작부터 다음 프레임까지 */
  firstFrameMs: number | null;
  /** 프레임 간격(requestAnimationFrame) 요약 */
  frames: FrameSummary | null;
  /** render() 호출 시간 요약(fps는 뜻이 없다) */
  cpu: FrameSummary | null;
  /** 제출 → GPU 완료를 본 프레임 시작까지의 지연 요약(두 API 모두 프레임 단위로 올림, fps는 뜻이 없다) */
  gpu: FrameSummary | null;
  /** 재는 동안 GPU가 끝낸 프레임 수/초 — 실제로 그린 양. 프레임 간격 fps보다 낮으면 GPU가 못 따라온다 */
  gpuDonePerSec: number | null;
  /** 재기를 마칠 때 아직 GPU가 안 끝낸 프레임 수 */
  gpuPending: number | null;
  drawCalls: number | null;
  triangles: number | null;
  /** JS 힙(MB, 크롬 계열만): 시작 전, 재는 동안 최대 */
  heapBeforeMb: number | null;
  heapPeakMb: number | null;
  /** 이번에 새로 받은 JS: 압축(전송) 크기·원본 크기(KB), 파일 수 */
  jsTransferKb: number | null;
  jsDecodedKb: number | null;
  jsFiles: number | null;
  /** 실패·대체 이유(짧게) */
  note: string | null;
}

/** WebGPU 어댑터 확인 결과 */
export interface WebGpuProbe {
  /** navigator.gpu가 있나 */
  api: boolean;
  adapter: "yes" | "no" | "error";
  vendor: string | null;
  architecture: string | null;
  description: string | null;
  /** 핵심 기능(core-features-and-limits)이 있나. 없으면 호환 모드 */
  core: boolean | null;
  fallbackAdapter: boolean | null;
}

export interface BenchEnvironment {
  /** 시작 시각(ms, 기기 시계) */
  startedAt: number;
  build: string;
  userAgent: string;
  screenW: number;
  screenH: number;
  dpr: number;
  /** 쓴 픽셀 비율(엔진과 같은 상한) */
  pixelRatio: number;
  /** 캔버스 크기(CSS px)와 그리기 버퍼 크기 */
  canvasW: number;
  canvasH: number;
  bufferW: number;
  bufferH: number;
  cores: number | null;
  memoryGb: number | null;
  webgpu: WebGpuProbe;
  /** 첫 WebGL 방식이 읽은 GPU 이름 */
  glRenderer: string | null;
  warmupSec: number;
  measureSec: number;
}

/** 측정을 멈춘 이유 */
export type StopReason = "user" | "hidden" | null;

export interface BenchReport {
  env: BenchEnvironment;
  runs: RunResult[];
  /** 타일 수마다 자료 만들기 시간(ms) */
  workloadMs: Record<number, number>;
  stopped: StopReason;
  totalSec: number;
}

/** 진행 상황(화면 위 판) */
export interface BenchProgress {
  index: number;
  total: number;
  mode: BenchModeId;
  tiles: number;
  phase: "workload" | "load" | "init" | "compile" | "measure" | "dispose";
  /** 재는 중이면 남은 초 */
  remainingSec: number | null;
}
