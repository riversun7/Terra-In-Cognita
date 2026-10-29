// 지형 메시 워커 — 화면 스레드를 막지 않고 지형 메시(타입 배열)를 만든다. 결과 배열은 복사하지 않고 넘긴다(transfer).
// 빌드: terrainBuilder.ts의 `new Worker(new URL("./terrainWorker.ts", import.meta.url), { type: "module" })`를 Vite가 따로 묶는다.
// 타입은 DOM 기준으로 검사한다(tsconfig 참고). self.postMessage(값, { transfer })는 창·워커 둘 다 맞는 모양이다.
// 처음 요청에는 지형 재질의 잡음 텍스처 자료도 만들어 보낸다(withNoise, terrainBuilder.ts).
import type { TerrainWorkerReply, TerrainWorkerRequest } from "./terrainBuilder.ts";
import { buildTerrainMesh } from "./terrainMesh.ts";
import { buildNoiseTextureData } from "./terrainNoise.ts";

self.addEventListener("message", (event: MessageEvent<TerrainWorkerRequest>) => {
  const { id, terrain, withNoise } = event.data;
  let reply: TerrainWorkerReply;
  let transfer: Transferable[] = [];
  try {
    const mesh = buildTerrainMesh(terrain);
    const noise = withNoise ? buildNoiseTextureData() : null;
    reply = { id, ok: true, mesh, noise };
    transfer = [mesh.positions.buffer, mesh.normals.buffer, mesh.colors.buffer, mesh.indices.buffer];
    if (noise) transfer.push(noise.buffer);
  } catch (error) {
    reply = { id, ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(reply, { transfer });
});
