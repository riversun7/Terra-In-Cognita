// 타일 메시를 워커에 맡긴다(화면 스레드 쪽). 워커를 만들 수 없거나 워커가 실패하면 화면 스레드에서 같은 함수를 돌린다.
// 맡기는 것은 둘 중 하나다: 풀어 둔 타일(시험·가짜 원천) 또는 서버에서 받은 이진(EncodedTile). 이진은 워커 안에서
// packages/protocol 해석기(decodePlanetTile)로 풀고 모양을 확인한 뒤 메시를 만든다. 답 모양은 같다(DecodedTile + 메시).
// 보내는 것은 복사한다(넘기지 않는다, 약 8KB): 워커가 죽으면 같은 입력을 화면 스레드에서 다시 쓴다.
// 답의 메시·타일 배열은 워커가 넘겨준다(transfer).
import { type DecodedTile, type EncodedTile, isEncodedTile } from "./planetTypes.ts";
import { decodeTileInput } from "./tileDecode.ts";
import { buildTileMesh } from "./tileMesh.ts";
import type { BuiltTile, TileMeshBuilder } from "./tilePipeline.ts";

export interface TileWorkerRequest {
  id: number;
  radiusM: number;
  input: { kind: "decoded"; tile: DecodedTile } | EncodedTile;
}

export type TileWorkerReply =
  | ({ id: number; ok: true } & BuiltTile)
  | { id: number; ok: false; message: string };

interface Pending {
  input: DecodedTile | EncodedTile;
  radiusM: number;
  resolve: (built: BuiltTile) => void;
  reject: (error: Error) => void;
}

export function createTileBuilder(): TileMeshBuilder & { readonly source: () => "worker" | "main" } {
  let worker: Worker | null = null;
  let workerBroken = false;
  let disposed = false;
  let nextId = 1;
  const pending = new Map<number, Pending>();

  const buildOnMain = (entry: Pending): void => {
    try {
      const tile = decodeTileInput(entry.input);
      entry.resolve({ mesh: buildTileMesh(tile, entry.radiusM), tile });
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
      worker = new Worker(new URL("./tileWorker.ts", import.meta.url), { type: "module" });
    } catch {
      workerBroken = true;
      return null;
    }
    worker.addEventListener("message", (event: MessageEvent<TileWorkerReply>) => {
      const reply = event.data;
      const entry = pending.get(reply.id);
      if (!entry) return;
      pending.delete(reply.id);
      if (reply.ok) entry.resolve({ mesh: reply.mesh, tile: reply.tile });
      else entry.reject(new Error(reply.message));
    });
    worker.addEventListener("error", (event) => {
      event.preventDefault();
      breakWorker();
    });
    return worker;
  };

  return {
    source: () => (worker ? "worker" : "main"),
    build(input, radiusM) {
      if (disposed) return Promise.reject(new Error("tile builder disposed"));
      return new Promise<BuiltTile>((resolve, reject) => {
        const entry: Pending = { input, radiusM, resolve, reject };
        const target = ensureWorker();
        if (!target) {
          buildOnMain(entry);
          return;
        }
        const id = nextId++;
        pending.set(id, entry);
        const request: TileWorkerRequest = {
          id,
          radiusM,
          input: isEncodedTile(input) ? input : { kind: "decoded", tile: input },
        };
        // 복사해서 보낸다(넘기지 않는다)
        target.postMessage(request, []);
      });
    },
    dispose() {
      disposed = true;
      worker?.terminate();
      worker = null;
      for (const entry of pending.values()) entry.reject(new Error("tile builder disposed"));
      pending.clear();
    },
  };
}
