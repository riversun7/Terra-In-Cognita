// 밸런스 화면 대결을 돌리는 쪽 — docs/adr/2026-11-01-balance-screen.md 4절
// - worker: 요청마다 워커 스레드 하나(duelWorker.ts)를 띄워 대결 일을 넘기고, 결과를 받으면 끝낸다(평소 메모리 0, 죽어도 그 요청만 실패).
//   제한 시간이 지나면 워커를 끝내고 실패시킨다. 주 스레드는 기다리기만 한다(대결 한 판이 수십~수백 ms라 주 스레드에서 돌리면 루프가 멈춘다).
// - inline: 같은 스레드(시험·DB 없는 개발). 결과는 worker와 같다(같은 함수 runDuelJob).
import { Worker } from "node:worker_threads";
import { type DuelJob, type DuelJobResult, runDuelJob } from "./compute.ts";

/** 워커 → 메인 */
export type FromDuelWorker =
  | { readonly type: "done"; readonly result: DuelJobResult }
  | { readonly type: "failed"; readonly message: string };

export type DuelRunner = (job: DuelJob) => Promise<DuelJobResult>;

/** 대결 일 실패(제한 시간·워커 오류). reason은 tRPC 오류 data.reason */
export class DuelRunError extends Error {
  readonly reason: "timeout" | "failed";
  constructor(reason: "timeout" | "failed", message: string) {
    super(message);
    this.reason = reason;
  }
}

/** 워커 한 번의 제한 시간(ms) — 상한 설정(판 수 × 제한 ≤ 2,400초, 표 2벌)이 이 컨테이너에서 약 15~17초(Verified). NAS 여유로 그 약 일곱 배 */
export const DEFAULT_DUEL_TIMEOUT_MS = 120_000;
/** 워커 V8 힙 상한(MB). 대결 상태는 작다 */
const WORKER_HEAP_MB = 128;

export function inlineDuelRunner(): DuelRunner {
  return (job) => Promise.resolve().then(() => runDuelJob(job));
}

export function workerDuelRunner(options: { workerUrl: URL; timeoutMs?: number | undefined }): DuelRunner {
  const timeoutMs = options.timeoutMs ?? DEFAULT_DUEL_TIMEOUT_MS;
  return (job) =>
    new Promise<DuelJobResult>((resolve, reject) => {
      let settled = false;
      const worker = new Worker(options.workerUrl, {
        workerData: job,
        resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB },
      });
      const finish = (outcome: { ok: true; result: DuelJobResult } | { ok: false; error: DuelRunError }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        void worker.terminate();
        if (outcome.ok) resolve(outcome.result);
        else reject(outcome.error);
      };
      const timer = setTimeout(
        () =>
          finish({ ok: false, error: new DuelRunError("timeout", `duel worker exceeded ${timeoutMs}ms`) }),
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
        finish({ ok: false, error: new DuelRunError("failed", `duel worker exited with code ${code}`) }),
      );
    });
}
