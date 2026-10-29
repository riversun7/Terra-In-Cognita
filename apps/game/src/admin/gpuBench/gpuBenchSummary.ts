// 셰이더 측정 결과 → 복사해 붙이기 좋은 글(줄마다 | 로 나눈 표). 화면 문구는 화면이 넘긴다(labels, ko·en 메시지).
// 순수 함수라 생성 파일(src/paraglide/) 없이 시험한다(gpuBenchSummary.test.ts).
import type { BenchModeId, BenchReport, RunResult, RunStatus, StopReason } from "./gpuBenchTypes.ts";

export interface SummaryLabels {
  title: string;
  build: (build: string) => string;
  device: (userAgent: string) => string;
  screen: (values: { w: number; h: number; dpr: number; ratio: number; bw: number; bh: number }) => string;
  hardware: (values: { cores: string; memory: string }) => string;
  webgpu: (values: { api: string; adapter: string; gpu: string; level: string }) => string;
  webgl: (gpu: string) => string;
  timing: (values: { warmup: number; measure: number; total: string }) => string;
  workload: (list: string) => string;
  header: string;
  footnote: string;
  yes: string;
  no: string;
  error: string;
  unknown: string;
  core: string;
  compatibility: string;
  modes: Record<BenchModeId, string>;
  statuses: Record<RunStatus, string>;
  stopped: Record<Exclude<StopReason, null>, string>;
}

const DASH = "–";

/** ms: 100 아래는 소수 1자리, 그 위는 정수 */
export function formatMs(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  return value < 100 ? value.toFixed(1) : Math.round(value).toString();
}

const fixed1 = (value: number | null | undefined): string =>
  value === null || value === undefined || !Number.isFinite(value) ? DASH : value.toFixed(1);

/** 처음 그림까지 걸린 시간 합(받기 + 초기화 + 장면 + 컴파일 + 첫 프레임). 하나도 없으면 null */
export function readyMs(run: RunResult): number | null {
  const parts = [run.loadMs, run.initMs, run.sceneMs, run.compileMs, run.firstFrameMs];
  if (parts.every((part) => part === null)) return null;
  return parts.reduce<number>((sum, part) => sum + (part ?? 0), 0);
}

function backendText(run: RunResult, labels: SummaryLabels): string {
  if (run.backend === null) return DASH;
  const level = run.compatibilityMode === true ? `(${labels.compatibility})` : "";
  const samples = run.samples === null ? "" : ` ×${run.samples}`;
  return `${run.backend}${level}${samples}`;
}

function runLine(run: RunResult, labels: SummaryLabels): string {
  const frames = run.frames;
  const cpu = run.cpu;
  const heap =
    run.heapBeforeMb === null && run.heapPeakMb === null
      ? DASH
      : `${fixed1(run.heapBeforeMb)}→${fixed1(run.heapPeakMb)}`;
  const js =
    run.jsTransferKb === null || run.jsDecodedKb === null
      ? DASH
      : `${Math.round(run.jsTransferKb)}/${Math.round(run.jsDecodedKb)}`;
  const triangles = run.triangles === null ? DASH : `${Math.round(run.triangles / 1000)}k`;
  return [
    labels.modes[run.mode],
    String(run.tiles),
    labels.statuses[run.status],
    backendText(run, labels),
    formatMs(run.loadMs),
    formatMs(run.initMs),
    formatMs(run.sceneMs),
    formatMs(run.compileMs),
    formatMs(run.firstRenderMs),
    formatMs(run.firstFrameMs),
    formatMs(readyMs(run)),
    fixed1(frames?.fps),
    formatMs(frames?.p50Ms),
    formatMs(frames?.p95Ms),
    formatMs(frames?.maxMs),
    frames ? String(frames.longFrames) : DASH,
    formatMs(cpu?.p50Ms),
    formatMs(cpu?.p95Ms),
    formatMs(run.gpu?.p50Ms),
    formatMs(run.gpu?.p95Ms),
    fixed1(run.gpuDonePerSec),
    run.gpuPending === null ? DASH : String(run.gpuPending),
    run.drawCalls === null ? DASH : String(run.drawCalls),
    triangles,
    heap,
    js,
    run.note ?? "",
  ]
    .join(" | ")
    .trimEnd();
}

const pad2 = (value: number): string => String(value).padStart(2, "0");

/** 시작 시각(기기 시계) — 숫자만 써서 언어와 상관없이 같다: 2026-10-29 15:02 */
function formatStart(epochMs: number): string {
  const date = new Date(epochMs);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function buildSummaryText(report: BenchReport, labels: SummaryLabels): string {
  const { env } = report;
  const webgpu = env.webgpu;
  const gpu = [webgpu.vendor, webgpu.architecture, webgpu.description].filter(Boolean).join(" / ") || DASH;
  const level = webgpu.core === null ? DASH : webgpu.core ? labels.core : labels.compatibility;
  const adapter =
    webgpu.adapter === "yes" ? labels.yes : webgpu.adapter === "error" ? labels.error : labels.no;
  const workload = Object.entries(report.workloadMs)
    .map(([tiles, ms]) => `${tiles}=${formatMs(ms)}`)
    .join(" · ");
  const lines = [
    `${labels.title} · ${formatStart(env.startedAt)}`,
    labels.build(env.build),
    labels.device(env.userAgent),
    labels.screen({
      w: env.screenW,
      h: env.screenH,
      dpr: env.dpr,
      ratio: env.pixelRatio,
      bw: env.bufferW,
      bh: env.bufferH,
    }),
    labels.hardware({
      cores: env.cores === null ? labels.unknown : String(env.cores),
      memory: env.memoryGb === null ? labels.unknown : String(env.memoryGb),
    }),
    labels.webgpu({ api: webgpu.api ? labels.yes : labels.no, adapter, gpu, level }),
    labels.webgl(env.glRenderer ?? DASH),
    labels.timing({ warmup: env.warmupSec, measure: env.measureSec, total: fixed1(report.totalSec) }),
    labels.workload(workload || DASH),
    ...(report.stopped === null ? [] : [labels.stopped[report.stopped]]),
    labels.header,
    ...report.runs.map((run) => runLine(run, labels)),
    labels.footnote,
  ];
  return lines.join("\n");
}
