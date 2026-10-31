// 행성 굽는 곳 — 운영은 워커 스레드(메인 스레드는 그동안 다른 요청을 받는다), 시험은 같은 스레드.
// 워커는 굽기 하나마다 새로 띄우고 결과 하나를 받은 뒤 끝낸다: 생성기 작업 메모리를 바로 돌려주고,
// 상태를 들고 있지 않아 다시 띄우기·사본 맞추기가 필요 없다(경로 워커 풀과 다르다, ADR 33).
// 새 런타임 의존성 없이 node:worker_threads를 직접 쓴다.
import { performance } from "node:perf_hooks";
import { Worker } from "node:worker_threads";
import { bakePlanetTiles, bakePlanetValues } from "./bake.ts";
import type { BakeOutput, BakeReplyMessage, BakeRequestMessage } from "./bakeMessages.ts";
import type { PlanetSource } from "./sources.ts";

export type { BakeOutput } from "./bakeMessages.ts";

export interface PlanetBaker {
  /** 원본 하나를 굽는다. 실패하면 Error */
  bake(source: PlanetSource): Promise<BakeOutput>;
  /** 굽는 중인 것을 멈춘다(그 bake는 실패로 끝난다) */
  close(): Promise<void>;
}

/** 같은 스레드에서 굽는다 — 시험용(그동안 이벤트 루프가 멈춘다) */
export function createInlineBaker(): PlanetBaker {
  return {
    async bake(source) {
      const started = performance.now();
      const { fields, values } = await source.generate();
      const generateMs = performance.now() - started;
      const baked = bakePlanetTiles(fields, {
        generatorVersion: source.generatorVersion,
        definitionHash: source.definitionHash,
      });
      return {
        ...baked,
        ...bakePlanetValues(values),
        generateMs,
        totalMs: performance.now() - started,
        peakWorkerMb: 0,
        peakRssMb: process.memoryUsage().rss / (1024 * 1024),
      };
    },
    close: () => Promise.resolve(),
  };
}

export interface WorkerBakerOptions {
  /** 워커 진입 파일(개발: src/planet/bakeWorker.ts, 빌드: dist/planetBakeWorker.js) */
  workerUrl: URL;
  /** 워커 V8 힙 상한(MB). 타입 배열(ArrayBuffer)은 여기에 들지 않는다 */
  heapMb?: number;
}

/**
 * 워커 V8 힙 상한(MB) 기본값. 생성기 1판 S2 시험 행성(F = 9)은 워커 힙 + 외부 버퍼가 생성 단계 끝마다 잰 최대
 * 173~191MB, 프로세스 RSS 최대 약 418MiB(봇 1,000개, 개발 컨테이너)였다(작업 기록 2026/10/29 s2-integration).
 * 대부분 타입 배열이라 이 상한에 들지 않는다. 컨테이너 전체 상한은 1GB다(ops/compose.yml).
 */
export const DEFAULT_BAKE_WORKER_HEAP_MB = 512;

/** 워커 스레드에서 굽는다. 원본에 spec(워커가 다시 만들 설명)이 있어야 한다 */
export function createWorkerBaker(options: WorkerBakerOptions): PlanetBaker {
  const running = new Set<Worker>();
  let closed = false;

  return {
    bake(source) {
      const { spec } = source;
      if (!spec) return Promise.reject(new Error(`planet source ${source.id} has no spec for a worker`));
      if (closed) return Promise.reject(new Error("planet baker is closed"));
      return new Promise<BakeOutput>((resolve, reject) => {
        const worker = new Worker(options.workerUrl, {
          name: `planet-bake-${source.id}`,
          resourceLimits: { maxOldGenerationSizeMb: options.heapMb ?? DEFAULT_BAKE_WORKER_HEAP_MB },
        });
        running.add(worker);
        // 서버를 끄는 것을 워커가 막지 않게(끌 때는 close가 직접 끝낸다)
        worker.unref();
        let settled = false;
        const finish = (outcome: { output: BakeOutput } | { error: Error }): void => {
          if (settled) return;
          settled = true;
          running.delete(worker);
          void worker.terminate();
          if ("output" in outcome) resolve(outcome.output);
          else reject(outcome.error);
        };
        worker.once("message", (message: BakeReplyMessage) => {
          if (message.type === "done") finish({ output: message.output });
          else finish({ error: Object.assign(new Error(message.message), { stack: message.stack }) });
        });
        worker.once("error", (error) => finish({ error }));
        worker.once("exit", (code) =>
          finish({ error: new Error(`planet bake worker exited (code ${code})`) }),
        );
        const request: BakeRequestMessage = {
          type: "bake",
          spec,
          generatorVersion: source.generatorVersion,
          definitionHash: source.definitionHash,
        };
        // 브라우저 window.postMessage 규칙(targetOrigin)은 worker_threads에 해당하지 않는다
        // oxlint-disable-next-line unicorn/require-post-message-target-origin
        worker.postMessage(request);
      });
    },
    async close() {
      closed = true;
      const workers = [...running];
      running.clear();
      await Promise.all(workers.map((worker) => worker.terminate()));
    },
  };
}
