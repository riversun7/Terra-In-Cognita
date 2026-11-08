// 무거운 일 워커 진입 파일 (node:worker_threads) — 밸런스 대결(docs/adr/2026-11-01-balance-screen.md 4절)과 전투 실험실 전투장
// ("바뀜 (2026-11-01, 전투 실험실)" 4절). 요청마다 하나 띄우고(workerData = 일, jobs.ts), 끝까지 계산해 결과 하나를 보내고 끝난다.
// 메인 스레드는 src/balance/runner.ts. 개발(tsx)·시험은 이 .ts를 그대로 띄우고, 빌드는 dist/balanceWorker.js로 따로 만든다(vite.config.ts 입력).
// 밸런스 분석 묶음 일("batch", docs/adr/2026-11-01-balance-screen.md "바뀜 (2026-11-08 완전 개편)")은 판마다 진행을 보내고(250ms에 한 번까지)
// 끝에 결과 하나를 보낸다(메인 스레드는 src/battleLab/analysisRunner.ts).
import { parentPort, workerData } from "node:worker_threads";
import { type BatchWorkerJob, runBatch } from "../battleLab/analysisBatch.ts";
import type { FromBatchWorker } from "../battleLab/analysisRunner.ts";
import { type WorkerJob, runWorkerJob } from "./jobs.ts";
import type { FromDuelWorker } from "./runner.ts";

const port = parentPort;
if (!port) throw new Error("balance worker must run in a worker thread");

/** 진행 알림 사이 최소 간격(ms) */
const PROGRESS_EVERY_MS = 250;

function reply(message: FromDuelWorker | FromBatchWorker): void {
  // 브라우저 window.postMessage 규칙(targetOrigin)은 worker_threads에 해당하지 않는다
  // oxlint-disable-next-line unicorn/require-post-message-target-origin
  port?.postMessage(message);
}

try {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 메인 스레드(runner.ts)가 만든 일 그대로다
  const job = workerData as WorkerJob | BatchWorkerJob;
  if (job.kind === "batch") {
    let last = 0;
    const results = runBatch(job.batch, (done) => {
      const now = Date.now();
      if (now - last < PROGRESS_EVERY_MS) return;
      last = now;
      reply({ type: "progress", done });
    });
    reply({ type: "batch", results });
  } else reply({ type: "done", result: runWorkerJob(job) });
} catch (error) {
  reply({ type: "failed", message: error instanceof Error ? error.message : String(error) });
}
