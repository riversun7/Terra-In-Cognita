// 관리자 화면의 셰이더 측정 판(S2, ADR 2026-10-29-s2-planet-lod "셰이더 언어") — WebGL2 + GLSL과 WebGPU + TSL을
// 같은 행성 타일로 그려 잰다(PLAN 5.7 "WebGPU는 S2 1주차에 측정해 셰이더 언어를 확정한다").
// - 측정 코드(three, three/webgpu)는 [측정 시작]을 누를 때만 받는다(지연 조각). 누르기 전에는 아무것도 재지 않는다.
// - 재는 동안 화면 전체를 덮는 창(dialog)에 캔버스를 띄운다. 결과는 표와 복사할 요약 글로만 보여 준다(서버로 보내지 않음).
// - 성능 보고(텔레메트리)에는 이 구간을 "#gpu-bench"로 붙인다(다른 화면 수치에 섞이지 않게).
import { useEffect, useId, useRef, useState } from "react";
import { m } from "../paraglide/messages.js";
import { setTelemetryView } from "../telemetry/reporter.ts";
import { LiveMessage, useLiveLines } from "../ui/LiveMessage.tsx";
import { type SummaryLabels, buildSummaryText, formatMs, readyMs } from "./gpuBench/gpuBenchSummary.ts";
import {
  BENCH_MEASURE_SEC,
  BENCH_MODES,
  BENCH_TILE_COUNTS,
  type BenchModeId,
  type BenchProgress,
  type BenchReport,
  type RunStatus,
} from "./gpuBench/gpuBenchTypes.ts";
import "./gpuBench/gpuBench.css";

/** 성능 보고에 붙이는 화면 이름 */
const TELEMETRY_VIEW = "gpu-bench";

const MODE_LABELS = {
  "webgl-glsl": m.gpu_bench_mode_webgl_glsl,
  "webgpu-tsl": m.gpu_bench_mode_webgpu_tsl,
  "webgl2-tsl": m.gpu_bench_mode_webgl2_tsl,
} satisfies Record<BenchModeId, () => string>;

const MODE_HINTS = {
  "webgl-glsl": m.gpu_bench_hint_webgl_glsl,
  "webgpu-tsl": m.gpu_bench_hint_webgpu_tsl,
  "webgl2-tsl": m.gpu_bench_hint_webgl2_tsl,
} satisfies Record<BenchModeId, () => string>;

const STATUS_LABELS = {
  ok: m.gpu_bench_status_ok,
  fallback: m.gpu_bench_status_fallback,
  failed: m.gpu_bench_status_failed,
  skipped: m.gpu_bench_status_skipped,
  stopped: m.gpu_bench_status_stopped,
} satisfies Record<RunStatus, () => string>;

const PHASE_LABELS = {
  workload: m.gpu_bench_phase_workload,
  load: m.gpu_bench_phase_load,
  init: m.gpu_bench_phase_init,
  compile: m.gpu_bench_phase_compile,
  measure: m.gpu_bench_phase_measure,
  dispose: m.gpu_bench_phase_dispose,
} satisfies Record<BenchProgress["phase"], () => string>;

/** 요약 글의 문구(지금 언어) */
function summaryLabels(): SummaryLabels {
  return {
    title: m.gpu_bench_sum_title(),
    build: (build) => m.gpu_bench_sum_build({ build }),
    device: (agent) => m.gpu_bench_sum_device({ agent }),
    screen: (values) => m.gpu_bench_sum_screen(values),
    hardware: (values) => m.gpu_bench_sum_hardware(values),
    webgpu: (values) => m.gpu_bench_sum_webgpu(values),
    webgl: (gpu) => m.gpu_bench_sum_webgl({ gpu }),
    timing: (values) => m.gpu_bench_sum_timing(values),
    workload: (list) => m.gpu_bench_sum_workload({ list }),
    header: m.gpu_bench_sum_header(),
    footnote: m.gpu_bench_sum_footnote(),
    yes: m.gpu_bench_sum_yes(),
    no: m.gpu_bench_sum_no(),
    error: m.gpu_bench_sum_error(),
    unknown: m.gpu_bench_sum_unknown(),
    core: m.gpu_bench_sum_core(),
    compatibility: m.gpu_bench_sum_compat(),
    modes: {
      "webgl-glsl": MODE_LABELS["webgl-glsl"](),
      "webgpu-tsl": MODE_LABELS["webgpu-tsl"](),
      "webgl2-tsl": MODE_LABELS["webgl2-tsl"](),
    },
    statuses: {
      ok: STATUS_LABELS.ok(),
      fallback: STATUS_LABELS.fallback(),
      failed: STATUS_LABELS.failed(),
      skipped: STATUS_LABELS.skipped(),
      stopped: STATUS_LABELS.stopped(),
    },
    stopped: { user: m.gpu_bench_stopped_user(), hidden: m.gpu_bench_stopped_hidden() },
  };
}

function doneText(report: BenchReport): string {
  if (report.stopped === "hidden") return m.gpu_bench_stopped_hidden();
  if (report.stopped === "user") return m.gpu_bench_stopped_user();
  return m.gpu_bench_done();
}

const fixed1 = (value: number | undefined): string => (value === undefined ? "–" : value.toFixed(1));

/** 누른 뒤 상태: 코드 받는 중 / 재는 중 / 쉼 */
type Busy = "loading" | "running" | null;

export function GpuBenchPanel() {
  const headingId = useId();
  const runTitleId = useId();
  const captionId = useId();
  const [selected, setSelected] = useState<ReadonlySet<BenchModeId>>(() => new Set(BENCH_MODES));
  const [busy, setBusy] = useState<Busy>(null);
  const [progress, setProgress] = useState<BenchProgress | null>(null);
  const [report, setReport] = useState<BenchReport | null>(null);
  const notice = useLiveLines();
  const failure = useLiveLines();
  const copied = useLiveLines();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLPreElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  // API가 있는지만 본다(어댑터 요청은 누른 뒤에 한다)
  const hasWebGpuApi = typeof navigator !== "undefined" && "gpu" in navigator;
  const summary = report ? buildSummaryText(report, summaryLabels()) : null;

  // 화면을 닫으면(로그아웃 등) 재던 것을 멈춘다
  useEffect(() => () => controllerRef.current?.abort(), []);

  const toggle = (mode: BenchModeId, checked: boolean): void => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (checked) next.add(mode);
      else next.delete(mode);
      return next;
    });
  };

  const stop = (): void => controllerRef.current?.abort();

  async function start(): Promise<void> {
    if (busy !== null) return;
    const modes = BENCH_MODES.filter((mode) => selected.has(mode));
    failure.clear();
    notice.clear();
    copied.clear();
    if (modes.length === 0) {
      failure.show([m.gpu_bench_none_selected()]);
      return;
    }
    setBusy("loading");
    let runner: typeof import("./gpuBench/gpuBenchRunner.ts");
    try {
      runner = await import("./gpuBench/gpuBenchRunner.ts");
    } catch {
      setBusy(null);
      failure.show([m.gpu_bench_load_failed()]);
      return;
    }
    const dialog = dialogRef.current;
    const stage = stageRef.current;
    if (!dialog || !stage) {
      setBusy(null);
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setReport(null);
    setProgress(null);
    setBusy("running");
    dialog.showModal();
    setTelemetryView(TELEMETRY_VIEW);
    try {
      const result = await runner.runGpuBench({
        host: stage,
        modes,
        tileCounts: BENCH_TILE_COUNTS,
        build: __APP_BUILD__,
        signal: controller.signal,
        onProgress: setProgress,
      });
      setReport(result);
      notice.show([doneText(result)]);
    } catch {
      failure.show([m.gpu_bench_failed()]);
    } finally {
      setTelemetryView(null);
      controllerRef.current = null;
      if (dialog.open) dialog.close();
      setBusy(null);
      setProgress(null);
    }
  }

  /** 복사를 못 하면 글을 골라 둔다(길게 눌러 직접 복사) */
  function selectSummary(): void {
    const element = summaryRef.current;
    const selection = window.getSelection();
    if (!element || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  async function copy(): Promise<void> {
    if (summary === null) return;
    try {
      await navigator.clipboard.writeText(summary);
      copied.show([m.gpu_bench_copied()]);
    } catch {
      selectSummary();
      copied.show([m.gpu_bench_copy_failed()]);
    }
  }

  return (
    <section className="bench" aria-labelledby={headingId}>
      <h2 id={headingId} className="admin-subtitle">
        {m.gpu_bench_title()}
      </h2>
      <p className="bench-lead">{m.gpu_bench_lead()}</p>
      <fieldset className="bench-modes">
        <legend className="field-label">{m.gpu_bench_modes()}</legend>
        {BENCH_MODES.map((mode) => (
          <label key={mode} className="bench-mode">
            <input
              type="checkbox"
              checked={selected.has(mode)}
              disabled={busy !== null}
              onChange={(event) => toggle(mode, event.target.checked)}
            />
            <span className="bench-mode-text">
              <span className="bench-mode-name">{MODE_LABELS[mode]()}</span>
              <span className="bench-mode-hint">{MODE_HINTS[mode]()}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="field-hint">
        {hasWebGpuApi ? m.gpu_bench_api_yes() : m.gpu_bench_api_no()}{" "}
        {m.gpu_bench_plan({ tiles: BENCH_TILE_COUNTS.join("·"), seconds: BENCH_MEASURE_SEC })}
      </p>
      <div className="form-actions">
        <button
          type="button"
          className="button-primary"
          aria-disabled={busy !== null}
          onClick={() => void start()}
        >
          {m.gpu_bench_start()}
        </button>
      </div>
      <p className="status" role="status">
        {busy === "loading" ? m.gpu_bench_loading() : ""}
      </p>
      <LiveMessage tone="error" lines={failure.lines} version={failure.version} />
      <LiveMessage tone="info" lines={notice.lines} version={notice.version} />

      {report && summary !== null ? (
        <div className="bench-results">
          <h3 className="bench-heading">{m.gpu_bench_results()}</h3>
          {/* 표 설명은 밀리는 영역 밖에 둔다(좁은 화면에서 잘리지 않게). 표와 영역의 이름으로 쓴다 */}
          <p id={captionId} className="bench-caption">
            {m.gpu_bench_table_caption()}
          </p>
          {/* 좁은 화면에서는 표만 옆으로 민다(쪽 전체는 밀리지 않는다). 키보드로도 밀 수 있게 초점을 받는다 */}
          <div className="bench-table-wrap" role="region" aria-labelledby={captionId} tabIndex={0}>
            <table className="bench-table" aria-labelledby={captionId}>
              <thead>
                <tr>
                  <th scope="col">{m.gpu_bench_col_mode()}</th>
                  <th scope="col">{m.gpu_bench_col_tiles()}</th>
                  <th scope="col">{m.gpu_bench_col_p95()}</th>
                  <th scope="col">{m.gpu_bench_col_fps()}</th>
                  <th scope="col">{m.gpu_bench_col_gpu()}</th>
                  <th scope="col">{m.gpu_bench_col_compile()}</th>
                  <th scope="col">{m.gpu_bench_col_ready()}</th>
                  <th scope="col">{m.gpu_bench_col_calls()}</th>
                </tr>
              </thead>
              <tbody>
                {report.runs.map((run) => (
                  <tr key={`${run.mode}:${run.tiles}`} data-status={run.status}>
                    <th scope="row">
                      <span className="bench-run-mode">{MODE_LABELS[run.mode]()}</span>
                      {run.status === "ok" ? null : (
                        <span className="bench-run-status">{STATUS_LABELS[run.status]()}</span>
                      )}
                    </th>
                    <td>{run.tiles}</td>
                    <td>{formatMs(run.frames?.p95Ms)}</td>
                    <td>{fixed1(run.frames?.fps)}</td>
                    <td>{fixed1(run.gpuDonePerSec ?? undefined)}</td>
                    <td>{formatMs(run.compileMs)}</td>
                    <td>{formatMs(readyMs(run))}</td>
                    <td>{run.drawCalls ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="bench-heading">{m.gpu_bench_summary_title()}</h3>
          <pre ref={summaryRef} className="bench-summary" data-testid="gpu-bench-summary">
            {summary}
          </pre>
          <div className="form-actions">
            <button type="button" className="button-small" onClick={() => void copy()}>
              {m.gpu_bench_copy()}
            </button>
          </div>
          <LiveMessage tone="success" lines={copied.lines} version={copied.version} />
        </div>
      ) : null}

      <dialog
        ref={dialogRef}
        className="bench-run"
        aria-labelledby={runTitleId}
        onCancel={(event) => {
          // Esc: 바로 닫지 않고 멈춘다(정리가 끝나면 실행기가 닫는다)
          event.preventDefault();
          stop();
        }}
        onClose={stop}
      >
        <div ref={stageRef} className="bench-stage" role="img" aria-label={m.gpu_bench_view_label()} />
        <div className="bench-hud">
          <div className="bench-hud-text">
            <p id={runTitleId} role="status">
              {progress
                ? `${m.gpu_bench_progress({
                    index: progress.index,
                    total: progress.total,
                    mode: MODE_LABELS[progress.mode](),
                    tiles: progress.tiles,
                  })} · ${PHASE_LABELS[progress.phase]()}`
                : m.gpu_bench_loading()}
            </p>
            {/* 남은 초는 알림 영역 밖에 둔다(1초마다 읽히지 않게) */}
            {progress && progress.remainingSec !== null ? (
              <p className="bench-hud-remaining">
                {m.gpu_bench_remaining({ seconds: progress.remainingSec })}
              </p>
            ) : null}
          </div>
          <button type="button" className="button-small" onClick={stop}>
            {m.gpu_bench_stop()}
          </button>
        </div>
      </dialog>
    </section>
  );
}
