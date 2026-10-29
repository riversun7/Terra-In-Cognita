// 지형 워커가 하는 일 하나(부탁 → 답·넘길 배열) — 순수 함수. 워커(terrainWorker.ts)가 부르고, 단위 시험의 가짜 워커도 부른다.
// three.js를 쓰지 않는다(워커 조각을 작게). 부탁·답 모양은 terrainBuilder.ts에 있다.
import type { TerrainWorkerReply, TerrainWorkerRequest } from "./terrainBuilder.ts";
import { buildTerrainMesh } from "./terrainMesh.ts";
import { buildNoiseTextureData } from "./terrainNoise.ts";

export interface TerrainJobResult {
  reply: TerrainWorkerReply;
  /** 복사하지 않고 넘길 배열(postMessage transfer) */
  transfer: Transferable[];
}

export function runTerrainJob(request: TerrainWorkerRequest): TerrainJobResult {
  try {
    if (request.kind === "noise") {
      const noise = buildNoiseTextureData();
      return { reply: { id: request.id, ok: true, kind: "noise", noise }, transfer: [noise.buffer] };
    }
    const mesh = buildTerrainMesh(request.terrain);
    return {
      reply: { id: request.id, ok: true, kind: "mesh", mesh },
      transfer: [mesh.positions.buffer, mesh.normals.buffer, mesh.colors.buffer, mesh.indices.buffer],
    };
  } catch (error) {
    return {
      reply: { id: request.id, ok: false, message: error instanceof Error ? error.message : String(error) },
      transfer: [],
    };
  }
}
