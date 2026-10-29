// 행성 굽기 워커 진입 파일 (node:worker_threads). 메인 스레드는 src/planet/baker.ts.
// 개발(tsx)·시험은 이 .ts를 그대로 띄우고, 빌드는 dist/planetBakeWorker.js로 따로 만든다(vite.config.ts 입력).
// 하는 일: 설명(spec)으로 원본을 다시 만들기 → 생성 → 타일 → gzip → 결과를 한 번 보내기(pack은 복사하지 않고 넘김).
import { performance } from "node:perf_hooks";
import { parentPort } from "node:worker_threads";
import { bakePlanetTiles } from "./bake.ts";
import type { BakeReplyMessage, BakeRequestMessage } from "./bakeMessages.ts";
import { createPlanetSource } from "./sources.ts";

const port = parentPort;
if (!port) throw new Error("bakeWorker must run in a worker thread");

const BYTES_PER_MB = 1024 * 1024;
let peakWorker = 0;
let peakRss = 0;

/**
 * 단계 끝마다 메모리를 잰다(생성기 단계마다 + 생성 뒤 + 타일 뒤). worker_threads에서 rss는 프로세스 전체, 나머지는
 * 이 스레드 값이다(Node 문서). 단계 안의 순간 최대는 놓친다(워커가 계산 중이라 타이머가 돌지 않는다)
 */
function sample(): void {
  const memory = process.memoryUsage();
  peakWorker = Math.max(peakWorker, memory.heapUsed + memory.external);
  peakRss = Math.max(peakRss, memory.rss);
}

function reply(message: BakeReplyMessage, transfer: ArrayBuffer[] = []): void {
  port?.postMessage(message, transfer);
}

port.once("message", (request: BakeRequestMessage) => {
  void bake(request).catch((error: unknown) => {
    const failure = error instanceof Error ? error : new Error(String(error));
    reply({ type: "error", message: failure.message, stack: failure.stack });
  });
});

async function bake(request: BakeRequestMessage): Promise<void> {
  const started = performance.now();
  sample();
  const source = createPlanetSource(request.spec);
  if (
    source.generatorVersion !== request.generatorVersion ||
    source.definitionHash !== request.definitionHash
  ) {
    throw new Error(
      `planet source ${source.id} differs in the worker (generator ${source.generatorVersion}, definition ${source.definitionHash})`,
    );
  }
  const fields = await source.generate(sample);
  const generateMs = performance.now() - started;
  sample();
  const baked = bakePlanetTiles(fields, {
    generatorVersion: source.generatorVersion,
    definitionHash: source.definitionHash,
  });
  sample();
  reply(
    {
      type: "done",
      output: {
        ...baked,
        generateMs,
        totalMs: performance.now() - started,
        peakWorkerMb: peakWorker / BYTES_PER_MB,
        peakRssMb: peakRss / BYTES_PER_MB,
      },
    },
    [baked.pack.buffer],
  );
}
