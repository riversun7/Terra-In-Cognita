// 2차맵 지형 워커 진입 파일 (node:worker_threads). 메인 스레드는 src/world/terrainService.ts.
// 개발(tsx)·시험은 이 .ts를 그대로 띄우고, 빌드는 dist/terrainWorker.js로 따로 만든다(vite.config.ts 입력).
// 처음 메시지(init)로 행성 값·소품 규칙을 받고, 그 뒤 2차맵 키마다 지형 한 장을 보낸다(terrainCore.ts).
// 요청은 하나씩 차례로 한다(생성기가 동기라 겹치지 않는다). 결과 버퍼는 복사하지 않고 옮긴다.
import { parentPort } from "node:worker_threads";
import { type TerrainCore, createTerrainCore } from "./terrainCore.ts";
import type { FromTerrainWorker, ToTerrainWorker } from "./terrainMessages.ts";

const port = parentPort;
if (!port) throw new Error("terrainWorker must run in a worker thread");

function reply(message: FromTerrainWorker, transfer: ArrayBuffer[] = []): void {
  // 브라우저 window.postMessage 규칙(targetOrigin)은 worker_threads에 해당하지 않는다
  // oxlint-disable-next-line unicorn/require-post-message-target-origin
  port?.postMessage(message, transfer);
}

let core: TerrainCore | undefined;
let chain: Promise<void> = Promise.resolve();

port.on("message", (message: ToTerrainWorker) => {
  if (message.type === "init") {
    chain = chain.then(async () => {
      try {
        core = await createTerrainCore(message);
        reply({ type: "ready", versions: core.versions, version: core.version, pruned: core.pruned });
      } catch (error) {
        const failure = error instanceof Error ? error : new Error(String(error));
        reply({ type: "fatal", message: failure.message, stack: failure.stack });
      }
    });
    return;
  }
  const { id, mapKey } = message;
  chain = chain.then(async () => {
    try {
      if (!core) throw new Error("terrain worker is not initialised");
      const { terrain, source, ms } = await core.build(mapKey);
      reply({ type: "built", id, terrain, source, ms }, [
        terrain.raw.buffer,
        terrain.gzip.buffer,
        terrain.costs.buffer,
      ]);
    } catch (error) {
      reply({ type: "failed", id, message: error instanceof Error ? error.message : String(error) });
    }
  });
});
