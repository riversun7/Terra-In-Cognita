// 텔레메트리 보내기 — 오류는 바로, 성능 요약은 1분마다와 화면을 숨길 때 서버로 보낸다 (PLAN 9.5).
// sendBeacon은 화면을 닫는 중에도 전송을 마쳐 준다. 쓸 수 없으면 fetch(keepalive)로 보낸다.
// 보내기 실패는 조용히 버린다(보고 때문에 새 오류가 생기지 않게).
import {
  type ClientErrorReport,
  type PerfReport,
  TELEMETRY_LIMITS,
  TELEMETRY_PATHS,
  clip,
} from "@terra/protocol";
import { readDevice, readMemoryMb } from "../perf/device.ts";
import type { FrameMonitor } from "../perf/frameMonitor.ts";

const PERF_INTERVAL_MS = 60_000;
/** 화면을 한 번 열었을 때 보내는 오류 보고 상한 (같은 오류가 계속 나는 경우 대비) */
const MAX_ERROR_REPORTS = 20;
/** 이보다 짧게 잰 구간은 보내지 않는다(ms) — 잠깐 켰다 끈 경우 */
const MIN_PERF_WINDOW_MS = 5_000;
/** 서버가 받는 측정 구간 상한(초) */
const MAX_WINDOW_SEC = 600;

const round1 = (value: number): number => Math.round(value * 10) / 10;

function send(path: string, body: unknown): void {
  const blob = new Blob([JSON.stringify(body)], { type: "application/json" });
  try {
    if (navigator.sendBeacon?.(path, blob)) return;
  } catch {
    // 일부 브라우저는 예외를 던진다 → fetch로 보낸다
  }
  void fetch(path, { method: "POST", body: blob, keepalive: true }).catch(() => undefined);
}

/** 오류 값을 한 줄 설명으로 (Error가 아닌 값이 던져질 수도 있다) */
function describe(error: unknown, fallback: string): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === "string") return error;
  if (error === undefined || error === null) return fallback;
  try {
    return JSON.stringify(error) ?? fallback;
  } catch {
    return fallback;
  }
}

/** 주소가 바뀌지 않는 화면(2차맵 등)의 이름 — 보고의 page 뒤에 `#이름`으로 붙인다 */
let currentView: string | null = null;
/** 지금 켜진 보고의 성능 구간 보내기(화면이 바뀌기 전 구간을 먼저 보낸다) */
let flushActive: (() => void) | null = null;

/**
 * 지금 보이는 화면 이름을 성능·오류 보고에 붙인다(없으면 null). S1 측정에서 2차맵 구간을 따로 보려고 쓴다.
 * 바뀌기 전까지 모은 성능 구간은 이전 이름으로 먼저 보낸다.
 */
export function setTelemetryView(view: string | null): void {
  if (view === currentView) return;
  flushActive?.();
  currentView = view;
}

const currentPage = (): string =>
  clip(currentView ? `${location.pathname}#${currentView}` : location.pathname, TELEMETRY_LIMITS.page);

/** 보고를 시작한다. 멈추는 함수를 돌려준다. */
export function startTelemetry(monitor: FrameMonitor, clientBuild: string): () => void {
  let sentErrors = 0;
  const seen = new Set<string>();

  const reportError = (kind: ClientErrorReport["kind"], error: unknown, fallback: string): void => {
    if (sentErrors >= MAX_ERROR_REPORTS) return;
    const message = clip(describe(error, fallback), TELEMETRY_LIMITS.message);
    // 같은 오류는 한 번만 보낸다
    if (seen.has(message)) return;
    seen.add(message);
    sentErrors += 1;
    const stack =
      error instanceof Error && error.stack ? clip(error.stack, TELEMETRY_LIMITS.stack) : undefined;
    const report: ClientErrorReport = {
      clientBuild,
      kind,
      message,
      page: currentPage(),
      ...(stack ? { stack } : {}),
    };
    send(TELEMETRY_PATHS.errors, report);
  };

  const flushPerf = (): void => {
    const summary = monitor.drain();
    if (!summary || summary.elapsedMs < MIN_PERF_WINDOW_MS) return;
    const memoryMb = readMemoryMb();
    const report: PerfReport = {
      clientBuild,
      page: currentPage(),
      windowSec: Math.min(MAX_WINDOW_SEC, round1(summary.elapsedMs / 1000)),
      frames: summary.frames,
      fps: round1(summary.fps),
      frameP50Ms: round1(summary.p50Ms),
      frameP95Ms: round1(summary.p95Ms),
      frameMaxMs: round1(summary.maxMs),
      longFrames: summary.longFrames,
      ...(memoryMb === undefined ? {} : { memoryMb }),
      device: readDevice(),
    };
    send(TELEMETRY_PATHS.perf, report);
  };

  const onError = (event: ErrorEvent): void => reportError("error", event.error, event.message);
  const onRejection = (event: PromiseRejectionEvent): void =>
    reportError("rejection", event.reason, "unhandled rejection");
  const onVisibility = (): void => {
    if (document.visibilityState === "hidden") flushPerf();
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  document.addEventListener("visibilitychange", onVisibility);
  const timer = setInterval(() => {
    if (document.visibilityState === "visible") flushPerf();
  }, PERF_INTERVAL_MS);
  flushActive = flushPerf;

  return () => {
    if (flushActive === flushPerf) flushActive = null;
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    document.removeEventListener("visibilitychange", onVisibility);
    clearInterval(timer);
  };
}
