// 지형 메시 워커 — 화면 스레드를 막지 않고 지형 메시(타입 배열)를 만든다. 결과 배열은 복사하지 않고 넘긴다(transfer).
// 빌드: terrainBuilder.ts의 `new Worker(new URL("./terrainWorker.ts", import.meta.url), { type: "module" })`를 Vite가 따로 묶는다.
// 타입은 DOM 기준으로 검사한다(tsconfig 참고). self.postMessage(값, { transfer })는 창·워커 둘 다 맞는 모양이다.
// 하는 일(메시, 지형 재질의 잡음 텍스처 자료)은 terrainJob.ts — 빌더가 워커를 띄우자마자 잡음을 먼저 부탁한다(terrainBuilder.ts).
import type { TerrainWorkerRequest } from "./terrainBuilder.ts";
import { runTerrainJob } from "./terrainJob.ts";

self.addEventListener("message", (event: MessageEvent<TerrainWorkerRequest>) => {
  const { reply, transfer } = runTerrainJob(event.data);
  self.postMessage(reply, { transfer });
});
