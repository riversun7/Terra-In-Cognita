// 무거운 일을 돌리는 쪽 — docs/adr/2026-11-01-balance-screen.md 4절(대결), "바뀜 (2026-11-01, 전투 실험실)" 4절(전투장)
// - worker: 요청마다 워커 스레드 하나(duelWorker.ts)를 띄워 일을 넘기고, 결과를 받으면 끝낸다(평소 메모리 0, 죽어도 그 요청만 실패).
//   제한 시간이 지나면 워커를 끝내고 실패시킨다. 주 스레드는 기다리기만 한다(대결·전투 한 판이 수십~수백 ms라 주 스레드에서 돌리면 루프가 멈춘다).
// - inline: 같은 스레드(시험·DB 없는 개발). 결과는 worker와 같다(같은 함수 runWorkerJob).
// 일 종류는 jobs.ts(대결·전투장 한 판·몬테카를로). 밸런스 대결 쪽은 DuelRunner(대결 일만)로 감싸 쓴다.
import { Worker } from "node:worker_threads";
import type { DuelJob, DuelJobResult } from "./compute.ts";
import { type WorkerJob, type WorkerResult, runWorkerJob } from "./jobs.ts";

/** 워커 → 메인 */
export type FromDuelWorker =
  | { readonly type: "done"; readonly result: WorkerResult }
  | { readonly type: "failed"; readonly message: string };

export type JobRunner = (job: WorkerJob) => Promise<WorkerResult>;
export type DuelRunner = (job: DuelJob) => Promise<DuelJobResult>;

/** 일 실패(제한 시간·워커 오류). reason은 tRPC 오류 data.reason */
export class DuelRunError extends Error {
  readonly reason: "timeout" | "failed";
  constructor(reason: "timeout" | "failed", message: string) {
    super(message);
    this.reason = reason;
  }
}

/** 워커 한 번의 제한 시간(ms) — 대결 상한이 이 컨테이너에서 약 15~17초(Verified). 실험실 상한은 작업 기록의 잰 값. NAS 여유 */
export const DEFAULT_DUEL_TIMEOUT_MS = 120_000;
/** 워커 V8 힙 상한(MB). 대결·전투 상태는 작다 */
const WORKER_HEAP_MB = 128;

export function inlineJobRunner(): JobRunner {
  return (job) => Promise.resolve().then(() => runWorkerJob(job));
}

export function workerJobRunner(options: { workerUrl: URL; timeoutMs?: number | undefined }): JobRunner {
  const timeoutMs = options.timeoutMs ?? DEFAULT_DUEL_TIMEOUT_MS;
  return (job) =>
    new Promise<WorkerResult>((resolve, reject) => {
      let settled = false;
      const worker = new Worker(options.workerUrl, {
        workerData: job,
        resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB },
      });
      const finish = (outcome: { ok: true; result: WorkerResult } | { ok: false; error: DuelRunError }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        void worker.terminate();
        if (outcome.ok) resolve(outcome.result);
        else reject(outcome.error);
      };
      const timer = setTimeout(
        () => finish({ ok: false, error: new DuelRunError("timeout", `worker exceeded ${timeoutMs}ms`) }),
        timeoutMs,
      );
      worker.once("message", (message: FromDuelWorker) => {
        if (message.type === "done") finish({ ok: true, result: message.result });
        else finish({ ok: false, error: new DuelRunError("failed", message.message) });
      });
      worker.once("error", (error) =>
        finish({ ok: false, error: new DuelRunError("failed", error.message) }),
      );
      worker.once("exit", (code) =>
        finish({ ok: false, error: new DuelRunError("failed", `worker exited with code ${code}`) }),
      );
    });
}

/** 대결 일만 받는 쪽(밸런스 화면 services)으로 감싼다 */
export function duelRunnerOf(jobs: JobRunner): DuelRunner {
  return async (job) => {
    const result = await jobs({ kind: "duels", job });
    if (result.kind !== "duels") throw new DuelRunError("failed", `unexpected ${result.kind} result`);
    return result.result;
  };
}

export function inlineDuelRunner(): DuelRunner {
  return duelRunnerOf(inlineJobRunner());
}

export function workerDuelRunner(options: { workerUrl: URL; timeoutMs?: number | undefined }): DuelRunner {
  return duelRunnerOf(workerJobRunner(options));
}
