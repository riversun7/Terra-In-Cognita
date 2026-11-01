// 무거운 일 하나를 요청마다 워커 스레드에서 — docs/adr/2026-11-01-battle-replay.md 5절(밸런스 대결 워커 src/balance/runner.ts와 같은 틀).
// - worker: 요청마다 워커 하나를 띄워 일을 넘기고(workerData), 결과 하나를 받으면 끝낸다. 제한 시간이 지나면 끝내고 실패시킨다.
//   평소 메모리 0, 죽어도 그 요청만 실패. 주 스레드는 기다리기만 한다.
// - inline: 같은 스레드(시험·DB 없는 개발). 결과는 worker와 같다(같은 함수).
// 전투 실험실(work/battle-lab)도 자기 일에 이 틀을 쓸 수 있다(일·결과는 구조화 복제할 수 있는 값만).
import { Worker } from "node:worker_threads";

/** 워커 → 메인 */
export type FromJobWorker<R> =
  | { readonly type: "done"; readonly result: R }
  | { readonly type: "failed"; readonly message: string };

export type JobRunner<J, R> = (job: J) => Promise<R>;

/** 일 실패(제한 시간·워커 오류). reason은 tRPC 오류 data.reason */
export class JobRunError extends Error {
  readonly reason: "timeout" | "failed";
  constructor(reason: "timeout" | "failed", message: string) {
    super(message);
    this.reason = reason;
  }
}

export function inlineJobRunner<J, R>(run: (job: J) => R): JobRunner<J, R> {
  return (job) => Promise.resolve().then(() => run(job));
}

export function workerJobRunner<J, R>(options: {
  readonly workerUrl: URL;
  readonly timeoutMs: number;
  /** 워커 V8 힙 상한(MB) */
  readonly heapMb: number;
}): JobRunner<J, R> {
  return (job) =>
    new Promise<R>((resolve, reject) => {
      let settled = false;
      const worker = new Worker(options.workerUrl, {
        workerData: job,
        resourceLimits: { maxOldGenerationSizeMb: options.heapMb },
      });
      const finish = (outcome: { ok: true; result: R } | { ok: false; error: JobRunError }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        void worker.terminate();
        if (outcome.ok) resolve(outcome.result);
        else reject(outcome.error);
      };
      const timer = setTimeout(
        () =>
          finish({ ok: false, error: new JobRunError("timeout", `worker exceeded ${options.timeoutMs}ms`) }),
        options.timeoutMs,
      );
      worker.once("message", (message: FromJobWorker<R>) => {
        if (message.type === "done") finish({ ok: true, result: message.result });
        else finish({ ok: false, error: new JobRunError("failed", message.message) });
      });
      worker.once("error", (error) => finish({ ok: false, error: new JobRunError("failed", error.message) }));
      worker.once("exit", (code) =>
        finish({ ok: false, error: new JobRunError("failed", `worker exited with code ${code}`) }),
      );
    });
}
