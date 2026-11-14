// 경로 워커 진입 파일 (node:worker_threads). 메인 스레드는 src/world/pathPool.ts.
// 개발(tsx)·시험은 이 .ts를 그대로 띄우고, 빌드는 dist/pathWorker.js로 따로 만든다(vite.config.ts 입력).
// 하는 일은 src/world/pathReplica.ts에 있다. 여기는 메시지를 넘기고 결과를 돌려보내기만 한다.
import { performance } from "node:perf_hooks";
import { parentPort } from "node:worker_threads";
import type { ToWorker } from "./pathMessages.ts";
import { createReplicaStore } from "./pathReplica.ts";

const port = parentPort;
if (!port) throw new Error("pathWorker must run in a worker thread");

const store = createReplicaStore(() => performance.now());

port.on("message", (message: ToWorker) => {
  const reply = store.handle(message);
  if (!reply) return;
  // 꺾이는 점·걸음 배율 배열은 복사하지 않고 넘긴다
  if (reply.type === "path" && reply.waypoints) {
    const buffers: ArrayBuffer[] = [reply.waypoints.buffer];
    if (reply.paces) buffers.push(reply.paces.buffer);
    port.postMessage(reply, buffers);
  } else port.postMessage(reply);
});
