// 전투 보고서 일을 돌리는 쪽 — docs/adr/2026-11-14-battle-report.md "부하"
// - worker: 일마다 워커 스레드 하나(밸런스·실험실과 같은 진입 파일 balance/duelWorker.ts, 일 종류 "report"·"reportTrace")를 띄운다.
//   워커는 판이 끝날 때마다 진행을 보내고(250ms에 한 번까지) 끝에 결과 하나를 보낸 뒤 끝난다. 취소·제한 시간이면 워커를 끝낸다(평소 메모리 0).
// - inline: 같은 스레드(시험·DB 없는 개발). 판 CHUNK개마다 이벤트 루프에 양보하고 취소·제한 시간을 본다. 결과는 worker와 같다(같은 함수).
import { Worker } from "node:worker_threads";
import type { ReportResult } from "@terra/shared/battleReport";
import { finishTotals, newTotals } from "./aggregate.ts";
import {
  type ReportJob,
  type ReportTraceJob,
  type ReportTraceResult,
  type ReportWorkerJob,
  runReportRange,
  runReportTrace,
} from "./batch.ts";

/** 워커 → 메인 */
export type FromReportWorker =
  | { readonly type: "progress"; readonly done: number }
  | { readonly type: "report"; readonly results: ReportResult[] }
  | { readonly type: "reportTrace"; readonly trace: ReportTraceResult }
  | { readonly type: "failed"; readonly message: string };

export class ReportRunError extends Error {
  readonly reason: "timeout" | "failed" | "cancelled";
  constructor(reason: "timeout" | "failed" | "cancelled", message: string) {
    super(message);
    this.reason = reason;
  }
}

export interface ReportHandle<T> {
  readonly promise: Promise<T>;
  /** 멈춘다(promise는 ReportRunError cancelled). 끝났으면 아무것도 하지 않는다 */
  cancel(): void;
}

export interface ReportRunner {
  report(
    job: ReportJob,
    options: { readonly onProgress: (done: number) => void; readonly timeoutMs: number },
  ): ReportHandle<ReportResult[]>;
  trace(job: ReportTraceJob, options: { readonly timeoutMs: number }): ReportHandle<ReportTraceResult>;
}

/** 같은 스레드에서 양보 사이에 도는 판 수 */
const CHUNK = 4;
/** 워커 V8 힙 상한(MB). 합은 작다(흐름 막대 몇 KB) */
const WORKER_HEAP_MB = 160;

/** 워커가 뜨기 전 자리 채움(아무것도 하지 않음) */
const ignore = (): void => undefined;

const yieldToLoop = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

export function inlineReportRunner(): ReportRunner {
  return {
    report(job, { onProgress, timeoutMs }) {
      let cancelled = false;
      const started = Date.now();
      const run = async (): Promise<ReportResult[]> => {
        const out: ReportResult[] = [];
        let done = 0;
        for (let index = 0; index < job.setups.length; index++) {
          const setup = job.setups[index];
          if (!setup) continue;
          const totals = newTotals(setup);
          for (let from = 0; from < job.runs; from += CHUNK) {
            await yieldToLoop();
            if (cancelled) throw new ReportRunError("cancelled", "report cancelled");
            if (Date.now() - started > timeoutMs)
              throw new ReportRunError("timeout", `report exceeded ${timeoutMs}ms`);
            const to = Math.min(job.runs, from + CHUNK);
            runReportRange(job, index, from, to, totals, () => performance.now());
            done += to - from;
            onProgress(done);
          }
          out.push(finishTotals(setup, totals));
        }
        return out;
      };
      return {
        promise: run(),
        cancel: () => {
          cancelled = true;
        },
      };
    },
    trace(job) {
      return { promise: yieldToLoop().then(() => runReportTrace(job)), cancel: () => undefined };
    },
  };
}

/** 워커 하나로 일 하나 */
function inWorker<T>(
  workerUrl: URL,
  data: ReportWorkerJob,
  timeoutMs: number,
  pick: (message: FromReportWorker) => T | undefined,
  onProgress?: (done: number) => void,
): ReportHandle<T> {
  let finish: (outcome: { ok: true; value: T } | { ok: false; error: ReportRunError }) => void = ignore;
  const promise = new Promise<T>((resolve, reject) => {
    let settled = false;
    const worker = new Worker(workerUrl, {
      workerData: data,
      resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB },
    });
    finish = (outcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      if (outcome.ok) resolve(outcome.value);
      else reject(outcome.error);
    };
    const timer = setTimeout(
      () => finish({ ok: false, error: new ReportRunError("timeout", `report exceeded ${timeoutMs}ms`) }),
      timeoutMs,
    );
    worker.on("message", (message: FromReportWorker) => {
      if (message.type === "progress") {
        onProgress?.(message.done);
        return;
      }
      if (message.type === "failed") {
        finish({ ok: false, error: new ReportRunError("failed", message.message) });
        return;
      }
      const value = pick(message);
      if (value === undefined)
        finish({ ok: false, error: new ReportRunError("failed", "unexpected result") });
      else finish({ ok: true, value });
    });
    worker.once("error", (error) =>
      finish({ ok: false, error: new ReportRunError("failed", error.message) }),
    );
    worker.once("exit", (code) =>
      finish({ ok: false, error: new ReportRunError("failed", `worker exited with code ${code}`) }),
    );
  });
  return {
    promise,
    cancel: () => finish({ ok: false, error: new ReportRunError("cancelled", "report cancelled") }),
  };
}

export function workerReportRunner(options: { workerUrl: URL }): ReportRunner {
  return {
    report(job, { onProgress, timeoutMs }) {
      return inWorker(
        options.workerUrl,
        { kind: "report", job },
        timeoutMs,
        (message) => (message.type === "report" ? message.results : undefined),
        onProgress,
      );
    },
    trace(job, { timeoutMs }) {
      return inWorker(options.workerUrl, { kind: "reportTrace", trace: job }, timeoutMs, (message) =>
        message.type === "reportTrace" ? message.trace : undefined,
      );
    },
  };
}
