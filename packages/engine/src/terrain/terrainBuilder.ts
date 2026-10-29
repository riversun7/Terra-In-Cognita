// 지형 메시를 워커에 맡긴다(화면 스레드 쪽). 워커를 만들 수 없거나 워커가 실패하면 화면 스레드에서 같은 함수를 돌린다.
// 입력 배열은 복사해서 보낸다(엔진이 높이 읽기에 계속 쓴다). 결과 배열은 워커가 넘겨준다(transfer).
// 지형 재질의 잡음 텍스처(terrainNoise.ts)도 처음 한 번 워커가 만든다(화면 스레드에서 처음 돌리면 수십 ms 걸렸다).
// 만든 잡음은 이 모듈이 들고 있다가 다음 지형·다음 화면에도 같이 준다(바뀌지 않는 그림이다).
import type { TerrainInput } from "./terrainData.ts";
import { type TerrainMeshArrays, buildTerrainMesh } from "./terrainMesh.ts";
import { buildNoiseTextureData } from "./terrainNoise.ts";

export interface TerrainWorkerRequest {
  id: number;
  terrain: TerrainInput;
  /** 잡음 텍스처 자료도 만든다(화면 스레드에 아직 없을 때만) */
  withNoise: boolean;
}

export type TerrainWorkerReply =
  | { id: number; ok: true; mesh: TerrainMeshArrays; noise: Uint8Array | null }
  | { id: number; ok: false; message: string };

export interface BuiltTerrain {
  mesh: TerrainMeshArrays;
  /** 지형 재질의 잡음 텍스처 자료(RGBA8 256×256, 모든 지형이 같다) */
  noise: Uint8Array;
  /** 어디서 만들었나 */
  source: "worker" | "main";
  /** 요청부터 결과까지(ms) */
  buildMs: number;
}

/** 잡음 텍스처 자료(한 번 만들면 앱이 끝날 때까지 같이 쓴다. 읽기만 한다) */
let sharedNoise: Uint8Array | null = null;

/** 잡음 자료: 워커가 보낸 것이 있으면 그것, 없으면 화면 스레드에서 만든다 */
function noiseFrom(reply: Uint8Array | null): Uint8Array {
  sharedNoise ??= reply ?? buildNoiseTextureData();
  return sharedNoise;
}

export interface TerrainBuilder {
  build(terrain: TerrainInput): Promise<BuiltTerrain>;
  /** 워커를 끝낸다. 기다리던 요청은 실패로 끝난다 */
  dispose(): void;
}

interface Pending {
  terrain: TerrainInput;
  startedAt: number;
  resolve: (built: BuiltTerrain) => void;
  reject: (error: Error) => void;
}

export function createTerrainBuilder(): TerrainBuilder {
  let worker: Worker | null = null;
  let workerBroken = false;
  let disposed = false;
  let nextId = 1;
  const pending = new Map<number, Pending>();

  const buildOnMain = (entry: Pending): void => {
    try {
      entry.resolve({
        mesh: buildTerrainMesh(entry.terrain),
        noise: noiseFrom(null),
        source: "main",
        buildMs: performance.now() - entry.startedAt,
      });
    } catch (error) {
      entry.reject(error instanceof Error ? error : new Error(String(error)));
    }
  };

  // 워커가 죽으면(스크립트를 못 받는 등) 기다리던 요청을 화면 스레드에서 마친다
  const breakWorker = (): void => {
    workerBroken = true;
    worker?.terminate();
    worker = null;
    const waiting = [...pending.values()];
    pending.clear();
    for (const entry of waiting) buildOnMain(entry);
  };

  const ensureWorker = (): Worker | null => {
    if (worker || workerBroken || typeof Worker === "undefined") return worker;
    try {
      worker = new Worker(new URL("./terrainWorker.ts", import.meta.url), { type: "module" });
    } catch {
      workerBroken = true;
      return null;
    }
    worker.addEventListener("message", (event: MessageEvent<TerrainWorkerReply>) => {
      const reply = event.data;
      const entry = pending.get(reply.id);
      if (!entry) return;
      pending.delete(reply.id);
      if (reply.ok) {
        entry.resolve({
          mesh: reply.mesh,
          noise: noiseFrom(reply.noise),
          source: "worker",
          buildMs: performance.now() - entry.startedAt,
        });
      } else {
        entry.reject(new Error(reply.message));
      }
    });
    worker.addEventListener("error", (event) => {
      event.preventDefault();
      breakWorker();
    });
    return worker;
  };

  return {
    build(terrain) {
      if (disposed) return Promise.reject(new Error("terrain builder disposed"));
      return new Promise<BuiltTerrain>((resolve, reject) => {
        const entry: Pending = { terrain, startedAt: performance.now(), resolve, reject };
        const target = ensureWorker();
        if (!target) {
          buildOnMain(entry);
          return;
        }
        const id = nextId++;
        pending.set(id, entry);
        const request: TerrainWorkerRequest = { id, terrain, withNoise: sharedNoise === null };
        // 입력은 복사해서 보낸다(넘기지 않는다: 엔진이 높이 읽기에 계속 쓴다)
        target.postMessage(request, []);
      });
    },
    dispose() {
      disposed = true;
      worker?.terminate();
      worker = null;
      for (const entry of pending.values()) entry.reject(new Error("terrain builder disposed"));
      pending.clear();
    },
  };
}
