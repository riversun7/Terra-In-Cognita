// 밸런스 분석 묶음 일을 돌리는 쪽 — docs/adr/2026-11-01-balance-screen.md "바뀜 (2026-11-08 완전 개편)" 3절
// - worker: 일마다 워커 스레드 하나(전투 실험실과 같은 진입 파일 balance/duelWorker.ts, 일 종류 "batch")를 띄운다. 워커는 판이 끝날 때마다
//   진행을 보내고(250ms에 한 번까지) 끝에 결과 하나를 보낸 뒤 끝난다. 취소·제한 시간이면 워커를 끝낸다(평소 메모리 0).
// - inline: 같은 스레드(시험·DB 없는 개발). 칸 하나를 돌 때마다 이벤트 루프에 양보하고 취소를 본다. 결과는 worker와 같다(같은 함수).
import { Worker } from "node:worker_threads";
import type { AnalysisDuelStats } from "@terra/shared/balanceAnalysis";
import { type BatchJob, type BatchWorkerJob, runBatchCell } from "./analysisBatch.ts";

/** 워커 → 메인(묶음 일) */
export type FromBatchWorker =
  | { readonly type: "progress"; readonly done: number }
  | { readonly type: "batch"; readonly results: AnalysisDuelStats[] }
  | { readonly type: "failed"; readonly message: string };

/** 묶음 일 실패. reason은 일 상태의 까닭(cancelled = 사용자가 멈춤) */
export class BatchRunError extends Error {
  readonly reason: "timeout" | "failed" | "cancelled";
  constructor(reason: "timeout" | "failed" | "cancelled", message: string) {
    super(message);
    this.reason = reason;
  }
}

export interface BatchHandle {
  readonly promise: Promise<AnalysisDuelStats[]>;
  /** 멈춘다(promise는 BatchRunError cancelled로 끝난다). 이미 끝났으면 아무것도 하지 않는다 */
  cancel(): void;
}

export type BatchRunner = (
  job: BatchJob,
  options: { readonly onProgress: (done: number) => void; readonly timeoutMs: number },
) => BatchHandle;

/** 워커 V8 힙 상한(MB). 전투 상태는 작다 */
const WORKER_HEAP_MB = 128;

/** 워커가 뜨기 전 자리 채움(아무것도 하지 않음) */
const ignore = (): void => undefined;

const yieldToLoop = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

export function inlineBatchRunner(): BatchRunner {
  return (job, { onProgress, timeoutMs }) => {
    let cancelled = false;
    const started = Date.now();
    const run = async (): Promise<AnalysisDuelStats[]> => {
      const out: AnalysisDuelStats[] = [];
      for (let index = 0; index < job.cells.length; index++) {
        await yieldToLoop();
        if (cancelled) throw new BatchRunError("cancelled", "batch cancelled");
        if (Date.now() - started > timeoutMs)
          throw new BatchRunError("timeout", `batch exceeded ${timeoutMs}ms`);
        const before = index * job.runs;
        out.push(runBatchCell(job, index, (done) => onProgress(before + done)));
      }
      return out;
    };
    return {
      promise: run(),
      cancel: () => {
        cancelled = true;
      },
    };
  };
}

export function workerBatchRunner(options: { workerUrl: URL }): BatchRunner {
  return (job, { onProgress, timeoutMs }) => {
    let finish: (
      outcome: { ok: true; results: AnalysisDuelStats[] } | { ok: false; error: BatchRunError },
    ) => void = ignore;
    const promise = new Promise<AnalysisDuelStats[]>((resolve, reject) => {
      let settled = false;
      const data: BatchWorkerJob = { kind: "batch", batch: job };
      const worker = new Worker(options.workerUrl, {
        workerData: data,
        resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB },
      });
      finish = (outcome) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        void worker.terminate();
        if (outcome.ok) resolve(outcome.results);
        else reject(outcome.error);
      };
      const timer = setTimeout(
        () => finish({ ok: false, error: new BatchRunError("timeout", `batch exceeded ${timeoutMs}ms`) }),
        timeoutMs,
      );
      worker.on("message", (message: FromBatchWorker) => {
        if (message.type === "progress") onProgress(message.done);
        else if (message.type === "batch") finish({ ok: true, results: message.results });
        else finish({ ok: false, error: new BatchRunError("failed", message.message) });
      });
      worker.once("error", (error) =>
        finish({ ok: false, error: new BatchRunError("failed", error.message) }),
      );
      worker.once("exit", (code) =>
        finish({ ok: false, error: new BatchRunError("failed", `worker exited with code ${code}`) }),
      );
    });
    return {
      promise,
      cancel: () => finish({ ok: false, error: new BatchRunError("cancelled", "batch cancelled") }),
    };
  };
}
