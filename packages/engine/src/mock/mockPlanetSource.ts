// [임시] 가짜 행성 타일 원천 — 타일을 워커에서 만든다(한 타일에 노이즈 수만 번이라 화면 스레드를 막지 않게).
// 워커를 못 쓰면(시험·옛 브라우저) 화면 스레드에서 만든다. 결과 배열은 워커가 넘겨준다(transfer).
// 서버 타일 원천도 같은 모양(TileSource)이다: 시험 화면에서 이 원천을 서버 원천으로 바꾸면 된다.
import type { DecodedTile, PlanetDescription, TileRequest, TileSource } from "../planet/planetTypes.ts";
import { MOCK_PLANET_BIOMES, generateMockTile, mockPlanetDescription } from "./mockPlanet.ts";

export interface MockPlanetRequest {
  id: number;
  seed: number;
  faceLevel: number;
  request: TileRequest;
}

export type MockPlanetReply =
  | { id: number; ok: true; tile: DecodedTile }
  | { id: number; ok: false; message: string };

export interface MockPlanet {
  readonly planet: PlanetDescription;
  readonly source: TileSource;
  readonly biomes: typeof MOCK_PLANET_BIOMES;
  /** 만든 타일 수(시험 표시용) */
  generated(): number;
  dispose(): void;
}

export interface MockPlanetOptions {
  seed?: number;
  faceLevel?: number;
  /** 타일마다 더 기다릴 시간(ms) — 느린 망 흉내(시험용). 기본 0 */
  latencyMs?: number;
}

interface Pending {
  resolve: (tile: DecodedTile) => void;
  reject: (error: Error) => void;
}

const abortError = (): Error => new DOMException("tile request aborted", "AbortError");

export function createMockPlanet(options: MockPlanetOptions = {}): MockPlanet {
  const seed = options.seed ?? 20261029;
  const faceLevel = options.faceLevel ?? 9;
  const latencyMs = options.latencyMs ?? 0;
  const planet = mockPlanetDescription(faceLevel);
  let worker: Worker | null = null;
  let workerBroken = false;
  let disposed = false;
  let nextId = 1;
  let count = 0;
  const pending = new Map<number, Pending>();

  const breakWorker = (): void => {
    workerBroken = true;
    worker?.terminate();
    worker = null;
    for (const entry of pending.values()) entry.reject(new Error("mock planet worker failed"));
    pending.clear();
  };

  const ensureWorker = (): Worker | null => {
    if (worker || workerBroken || typeof Worker === "undefined") return worker;
    try {
      worker = new Worker(new URL("./mockPlanetWorker.ts", import.meta.url), { type: "module" });
    } catch {
      workerBroken = true;
      return null;
    }
    worker.addEventListener("message", (event: MessageEvent<MockPlanetReply>) => {
      const reply = event.data;
      const entry = pending.get(reply.id);
      if (!entry) return;
      pending.delete(reply.id);
      if (reply.ok) entry.resolve(reply.tile);
      else entry.reject(new Error(reply.message));
    });
    worker.addEventListener("error", (event) => {
      event.preventDefault();
      breakWorker();
    });
    return worker;
  };

  const make = (request: TileRequest): Promise<DecodedTile> => {
    count += 1;
    const target = ensureWorker();
    if (!target) {
      try {
        return Promise.resolve(generateMockTile(request, seed, faceLevel));
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
    return new Promise<DecodedTile>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      const message: MockPlanetRequest = { id, seed, faceLevel, request };
      target.postMessage(message, []);
    });
  };

  const source: TileSource = (request, signal) => {
    if (disposed) return Promise.reject(new Error("mock planet disposed"));
    if (signal.aborted) return Promise.reject(abortError());
    const wait =
      latencyMs > 0 ? new Promise<void>((resolve) => setTimeout(resolve, latencyMs)) : Promise.resolve();
    return wait.then(() => {
      if (signal.aborted) throw abortError();
      return make(request);
    });
  };

  return {
    planet,
    source,
    biomes: MOCK_PLANET_BIOMES,
    generated: () => count,
    dispose() {
      disposed = true;
      worker?.terminate();
      worker = null;
      for (const entry of pending.values()) entry.reject(new Error("mock planet disposed"));
      pending.clear();
    },
  };
}
