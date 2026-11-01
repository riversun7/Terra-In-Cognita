// 다시보기 워커 진입 파일 (node:worker_threads) — docs/adr/2026-11-01-battle-replay.md 5절.
// 요청마다 하나 띄우고(workerData = 일), 끝까지 계산해 결과 하나를 보내고 끝난다. 메인 스레드는 src/battleReplay/jobRunner.ts.
// 개발(tsx)·시험은 이 .ts를 그대로 띄우고, 빌드는 dist/battleReplayWorker.js로 따로 만든다(vite.config.ts 입력).
import { parentPort, workerData } from "node:worker_threads";
import { type ReplayJob, type ReplayJobResult, runReplayJob } from "./compute.ts";
import type { FromJobWorker } from "./jobRunner.ts";

const port = parentPort;
if (!port) throw new Error("battle replay worker must run in a worker thread");

function reply(message: FromJobWorker<ReplayJobResult>): void {
  // 브라우저 window.postMessage 규칙(targetOrigin)은 worker_threads에 해당하지 않는다
  // oxlint-disable-next-line unicorn/require-post-message-target-origin
  port?.postMessage(message);
}

try {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 메인 스레드(services.ts)가 만든 일 그대로다
  const job = workerData as ReplayJob;
  reply({ type: "done", result: runReplayJob(job) });
} catch (error) {
  reply({ type: "failed", message: error instanceof Error ? error.message : String(error) });
}
