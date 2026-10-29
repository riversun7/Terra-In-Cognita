import { describe, expect, it } from "vitest";
import { type SummaryLabels, buildSummaryText, formatMs, readyMs } from "./gpuBenchSummary.ts";
import type { BenchReport, RunResult } from "./gpuBenchTypes.ts";

/** 시험용 문구 — 실제 화면은 ko·en 메시지를 넘긴다 */
const LABELS: SummaryLabels = {
  title: "Bench",
  build: (build) => `build ${build}`,
  device: (ua) => `device ${ua}`,
  screen: ({ w, h, dpr, ratio, bw, bh }) => `screen ${w}x${h} dpr ${dpr} -> ${ratio} buffer ${bw}x${bh}`,
  hardware: ({ cores, memory }) => `cores ${cores} memory ${memory}`,
  webgpu: ({ api, adapter, gpu, level }) => `webgpu api ${api} adapter ${adapter} ${gpu} ${level}`,
  webgl: (gpu) => `webgl ${gpu}`,
  timing: ({ warmup, measure, total }) => `time ${warmup}+${measure}s total ${total}s`,
  workload: (list) => `workload ${list}`,
  header: "HEADER",
  footnote: "NOTE",
  yes: "yes",
  no: "no",
  error: "error",
  unknown: "?",
  core: "core",
  compatibility: "compat",
  modes: { "webgl-glsl": "GL+GLSL", "webgpu-tsl": "GPU+TSL", "webgl2-tsl": "GL+TSL" },
  statuses: { ok: "ok", fallback: "fallback", failed: "failed", skipped: "skipped", stopped: "stopped" },
  stopped: { user: "stopped by user", hidden: "stopped: hidden" },
};

const frames = (p50Ms: number, p95Ms: number, maxMs: number, fps: number, longFrames = 0) => ({
  frames: 100,
  elapsedMs: 6000,
  fps,
  p50Ms,
  p95Ms,
  maxMs,
  longFrames,
});

const RUN_OK: RunResult = {
  mode: "webgl-glsl",
  tiles: 160,
  status: "ok",
  backend: "webgl2",
  samples: 4,
  compatibilityMode: null,
  loadMs: 120.4,
  initMs: 12.3,
  sceneMs: 2.06,
  compileMs: 45,
  firstRenderMs: 30.5,
  firstFrameMs: 48.25,
  frames: frames(16.7, 33.3, 50.1, 59.94, 1),
  cpu: frames(0.6, 1.24, 3, 0),
  gpu: frames(20, 40.04, 55, 0),
  gpuDonePerSec: 58.24,
  gpuPending: 2,
  drawCalls: 161,
  triangles: 377_856,
  heapBeforeMb: 9.1,
  heapPeakMb: 14.25,
  jsTransferKb: 160.4,
  jsDecodedKb: 640.6,
  jsFiles: 3,
  note: null,
};

const RUN_FALLBACK: RunResult = {
  ...RUN_OK,
  mode: "webgpu-tsl",
  status: "fallback",
  samples: 4,
  compatibilityMode: null,
  loadMs: null,
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
  note: "webgl2_backend",
};

const REPORT: BenchReport = {
  env: {
    startedAt: new Date(2026, 9, 29, 15, 2, 30).getTime(),
    build: "abc1234",
    userAgent: "TestAgent/1.0",
    screenW: 412,
    screenH: 892,
    dpr: 3.5,
    pixelRatio: 1.5,
    canvasW: 412,
    canvasH: 892,
    bufferW: 618,
    bufferH: 1338,
    cores: 8,
    memoryGb: null,
    webgpu: {
      api: true,
      adapter: "no",
      vendor: null,
      architecture: null,
      description: null,
      core: null,
      fallbackAdapter: null,
    },
    glRenderer: "ANGLE (Test GPU)",
    warmupSec: 1,
    measureSec: 6,
  },
  runs: [RUN_OK, RUN_FALLBACK],
  workloadMs: { 40: 143.2, 160: 370.4 },
  stopped: null,
  totalSec: 21.47,
};

describe("셰이더 측정 요약 글", () => {
  it("ms는 100 아래 소수 1자리, 그 위 정수, 없으면 –", () => {
    expect(formatMs(5.04)).toBe("5.0");
    expect(formatMs(123.6)).toBe("124");
    expect(formatMs(null)).toBe("–");
    expect(formatMs(Number.NaN)).toBe("–");
  });

  it("준비 합계 = 받기 + 초기화 + 장면 + 컴파일 + 첫 프레임(없는 값은 뺀다)", () => {
    expect(readyMs(RUN_OK)).toBeCloseTo(120.4 + 12.3 + 2.06 + 45 + 48.25, 6);
    expect(readyMs(RUN_FALLBACK)).toBeCloseTo(12.3, 6);
    expect(readyMs({ ...RUN_FALLBACK, initMs: null })).toBeNull();
  });

  it("환경 줄 + 표 머리 + 결과 줄 + 맺음말", () => {
    expect(buildSummaryText(REPORT, LABELS).split("\n")).toEqual([
      "Bench · 2026-10-29 15:02",
      "build abc1234",
      "device TestAgent/1.0",
      "screen 412x892 dpr 3.5 -> 1.5 buffer 618x1338",
      "cores 8 memory ?",
      "webgpu api yes adapter no – –",
      "webgl ANGLE (Test GPU)",
      "time 1+6s total 21.5s",
      "workload 40=143 · 160=370",
      "HEADER",
      "GL+GLSL | 160 | ok | webgl2 ×4 | 120 | 12.3 | 2.1 | 45.0 | 30.5 | 48.3 | 228 | 59.9 | 16.7 | 33.3 | 50.1 | 1 | 0.6 | 1.2 | 20.0 | 40.0 | 58.2 | 2 | 161 | 378k | 9.1→14.3 | 160/641 |",
      "GPU+TSL | 160 | fallback | webgl2 ×4 | – | 12.3 | – | – | – | – | 12.3 | – | – | – | – | – | – | – | – | – | – | – | – | – | – | – | webgl2_backend",
      "NOTE",
    ]);
  });

  it("멈췄으면 이유 줄을 표 앞에 넣는다", () => {
    const lines = buildSummaryText({ ...REPORT, stopped: "hidden" }, LABELS).split("\n");
    expect(lines[9]).toBe("stopped: hidden");
    expect(lines[10]).toBe("HEADER");
  });
});
