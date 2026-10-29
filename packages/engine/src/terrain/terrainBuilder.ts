// 지형 메시를 워커에 맡긴다(화면 스레드 쪽). 워커를 만들 수 없거나 워커가 실패하면 화면 스레드에서 같은 함수를 돌린다.
// 입력 배열은 복사해서 보낸다(엔진이 높이 읽기에 계속 쓴다). 결과 배열은 워커가 넘겨준다(transfer).
// 지형 재질의 잡음 텍스처(terrainNoise.ts)도 처음 한 번 워커가 만든다(화면 스레드에서 처음 돌리면 수십 ms 걸렸다).
// - 빌더를 만들 때(엔진을 만들 때) 워커를 바로 띄우고, 잡음이 아직 없으면 먼저 부탁한다. 지형 자료가 서버에서 오는
//   동안(구독 → 스냅샷 → 지형 받기) 워커가 뜨고 잡음을 만들어, 첫 메시가 기다리지 않게 한다(새 워커에서 잡음 약 33~53ms,
//   메시 15~25ms — 개발 컨테이너, Node 24 워커).
// - 워커는 받은 순서대로 일하고 답도 그 순서로 오므로, 메시 답이 올 때는 잡음 답이 이미 와 있다.
//   잡음을 못 받았으면(워커 실패 등) 화면 스레드에서 만든다.
// 만든 잡음은 이 모듈이 들고 있다가 다음 지형·다음 화면에도 같이 준다(바뀌지 않는 그림이다).
import type { TerrainInput } from "./terrainData.ts";
import { type TerrainMeshArrays, buildTerrainMesh } from "./terrainMesh.ts";
import { buildNoiseTextureData } from "./terrainNoise.ts";

/** 워커에 보내는 부탁: 잡음 텍스처 자료 또는 지형 메시. 워커 쪽 처리는 terrainJob.ts */
export type TerrainWorkerRequest =
  | { id: number; kind: "noise" }
  | { id: number; kind: "mesh"; terrain: TerrainInput };

export type TerrainWorkerReply =
  | { id: number; ok: true; kind: "noise"; noise: Uint8Array }
  | { id: number; ok: true; kind: "mesh"; mesh: TerrainMeshArrays }
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

/** 잡음 자료: 이미 있으면(워커가 보낸 것 포함) 그것, 없으면 화면 스레드에서 만든다 */
function sharedNoiseData(): Uint8Array {
  sharedNoise ??= buildNoiseTextureData();
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
        noise: sharedNoiseData(),
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
      if (reply.ok && reply.kind === "noise") {
        sharedNoise ??= reply.noise;
        return;
      }
      // 실패한 잡음 부탁도 여기서 끝난다(기다리는 요청이 없다 — 메시 답 때 화면 스레드에서 만든다)
      const entry = pending.get(reply.id);
      if (!entry) return;
      pending.delete(reply.id);
      if (reply.ok) {
        entry.resolve({
          mesh: reply.mesh,
          noise: sharedNoiseData(),
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

  // 워커는 빌더를 만들 때 바로 띄운다(워커가 뜨는 시간도 지형 자료를 기다리는 동안 지나간다).
  // 잡음이 아직 없으면 먼저 부탁한다(머리말 참고)
  const early = ensureWorker();
  if (early && sharedNoise === null) {
    const request: TerrainWorkerRequest = { id: nextId++, kind: "noise" };
    // 넘길 배열은 없다(transfer 목록을 비워 둔다 — 메시 부탁과 같은 모양)
    early.postMessage(request, []);
  }

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
        const request: TerrainWorkerRequest = { id, kind: "mesh", terrain };
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
