// 2차맵 생성 워커 손잡이(편집기 2차맵 미리보기·개발자 2차맵 시험) — ADR 2026-10-31-second-map-from-planet 9절(ADR 38 D6a).
// 개발자 도구 둘이 같이 쓰는 모듈이라 개발자 소스 폴더(src/editor/) 밖에 둔다: 같이 쓰는 조각은 이름이 정해지지 않아(rolldown)
// 개발자 소스가 들면 미리 캐시 검사(scripts/check-pwa.mjs DEV_ONLY_SOURCE)에 걸린다. 이 모듈은 생성기를 가져오지 않는다
// (워커 조각 planetEditorSecondMapWorker-*가 따로 묶이고 미리 캐시에서 빠진다).
// 편집 화면이 하나 만들어 들고 있다(창을 닫아도 워커의 행성 값이 남아 같은 행성이면 다시 쓴다). 편집 화면을 떠나면 버린다.
// - 워커는 처음 부탁할 때 띄운다. 일은 온 차례대로 하나씩 한다(도중에 멈출 수 없다: 낡은 결과는 부른 쪽이 버린다).
// - 워커가 죽으면 기다리던 부탁을 모두 crashed로 끝내고, 다음 부탁 때 새로 띄운다(행성 값도 다시 만든다) 버린 뒤에도 같다.
// - 결과 → 엔진 지형 입력은 서버 지형 파일과 같은 바꾸기(mapWire.ts toTerrainInput)를 쓴다.
import type { TerrainInput } from "@terra/engine";
import type { PlanetGeneratorInput } from "@terra/planet/generator";
import type { MapPreset } from "@terra/planet/secondMap";
import { toTerrainInput } from "./mapWire.ts";
import type {
  SecondMapPreviewReply,
  SecondMapPreviewRequest,
  SecondMapPreviewResult,
  SecondMapPreviewStage,
  SecondMapPreviewTerrain,
} from "../editor/planet/secondMapPreviewProtocol.ts";

/** 실패 코드: 워커가 답한 것(rejected·failed·none), 워커가 죽음(crashed), 손잡이를 버림(closed) */
export type SecondMapPreviewErrorCode = "rejected" | "failed" | "none" | "crashed" | "closed";

export class SecondMapPreviewError extends Error {
  override readonly name = "SecondMapPreviewError";
  readonly code: SecondMapPreviewErrorCode;
  constructor(code: SecondMapPreviewErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/** 부탁 하나 */
export interface SecondMapJob {
  readonly planetKey: string;
  /** 행성 생성기 입력(편집기). 없으면 definition으로 워커가 만든다(개발자 2차맵 시험) */
  readonly input?: PlanetGeneratorInput | undefined;
  readonly definition?: SecondMapPreviewRequest["definition"];
  /** null이면 biomeId 또는 preset으로 워커가 찾는다(개발자 2차맵 시험) */
  readonly mapKey: number | null;
  readonly props: readonly unknown[];
  readonly preset?: MapPreset | undefined;
  readonly biomeId?: string | undefined;
  readonly biomeVariant?: number | undefined;
  /** 8이웃 2차맵도 만든다 */
  readonly neighbours?: boolean | undefined;
}

export interface SecondMapWorkerHandlers {
  onReply(reply: SecondMapPreviewReply): void;
  onCrash(): void;
}

export interface SecondMapWorkerPort {
  post(request: SecondMapPreviewRequest): void;
  terminate(): void;
}

export type SecondMapWorkerFactory = (handlers: SecondMapWorkerHandlers) => SecondMapWorkerPort;

/** 브라우저 모듈 워커(Vite가 planetEditorSecondMapWorker.ts를 따로 묶는다) */
export const createBrowserSecondMapWorker: SecondMapWorkerFactory = (handlers) => {
  const worker = new Worker(new URL("../editor/planet/planetEditorSecondMapWorker.ts", import.meta.url), {
    type: "module",
  });
  worker.addEventListener("message", (event: MessageEvent<SecondMapPreviewReply>) =>
    handlers.onReply(event.data),
  );
  worker.addEventListener("error", (event) => {
    event.preventDefault();
    handlers.onCrash();
  });
  worker.addEventListener("messageerror", () => handlers.onCrash());
  return {
    // 입력은 작아서(행성 정의 약 3KB + 소품 규칙) 복사해 보낸다
    post: (request) => worker.postMessage(request, []),
    terminate: () => worker.terminate(),
  };
};

export interface SecondMapPreviewClient {
  /** 워커가 이 행성 값을 들고 있는지(마지막 결과의 행성). 없으면 다음 부탁이 행성부터 만든다 */
  hasPlanet(planetKey: string): boolean;
  request(
    job: SecondMapJob,
    onStage?: (stage: SecondMapPreviewStage) => void,
  ): Promise<SecondMapPreviewResult>;
  /** 워커를 끝내고(행성 값도 버린다) 기다리던 부탁을 closed로 끝낸다. 그 뒤 부탁하면 새 워커를 띄운다 */
  dispose(): void;
}

interface Waiting {
  readonly planetKey: string;
  readonly resolve: (result: SecondMapPreviewResult) => void;
  readonly reject: (error: SecondMapPreviewError) => void;
  readonly onStage: ((stage: SecondMapPreviewStage) => void) | undefined;
}

export function createSecondMapPreviewClient(
  createWorker: SecondMapWorkerFactory = createBrowserSecondMapWorker,
): SecondMapPreviewClient {
  let port: SecondMapWorkerPort | null = null;
  let nextId = 1;
  let planetKey: string | null = null;
  const waiting = new Map<number, Waiting>();

  const failAll = (code: SecondMapPreviewErrorCode, message: string): void => {
    const list = [...waiting.values()];
    waiting.clear();
    for (const item of list) item.reject(new SecondMapPreviewError(code, message));
  };

  const handlers: SecondMapWorkerHandlers = {
    onReply(reply) {
      const item = waiting.get(reply.id);
      if (!item) return;
      if (reply.kind === "stage") {
        item.onStage?.(reply.stage);
        return;
      }
      waiting.delete(reply.id);
      if (reply.kind === "result") {
        planetKey = item.planetKey;
        item.resolve(reply.result);
      } else {
        item.reject(new SecondMapPreviewError(reply.code, reply.message));
      }
    },
    onCrash() {
      port?.terminate();
      port = null;
      planetKey = null;
      failAll("crashed", "second map preview worker crashed");
    },
  };

  return {
    hasPlanet: (key) => planetKey === key,
    request(job, onStage) {
      port ??= createWorker(handlers);
      const id = nextId++;
      const promise = new Promise<SecondMapPreviewResult>((resolve, reject) => {
        waiting.set(id, { planetKey: job.planetKey, resolve, reject, onStage });
      });
      port.post({ kind: "secondMap", id, ...job });
      return promise;
    },
    dispose() {
      // 영영 닫지 않는다: 그 뒤 부탁하면 새 워커를 띄운다. React StrictMode가 개발 중에 효과를 한 번 정리했다가 다시 돌려서,
      // 닫아 버리면 개발 화면에서 미리보기를 쓸 수 없다
      port?.terminate();
      port = null;
      planetKey = null;
      failAll("closed", "client is disposed");
    },
  };
}

/** 워커 결과 → 엔진 지형 입력(서버 지형 파일 2판과 같은 바꾸기). 서버 지형 해석과 같은 오류를 던진다 */
export function previewTerrainInput(terrain: SecondMapPreviewTerrain): TerrainInput {
  return toTerrainInput({
    mapKey: terrain.mapKey,
    generatorVersion: terrain.generatorVersion,
    seed: 0,
    hash: Number.parseInt(terrain.hash, 16),
    terrainSize: Math.round(Math.sqrt(terrain.surface.length)),
    heights: terrain.heightsCm,
    surface: terrain.surface,
    waterLevels: terrain.waterLevelCm,
    cover: terrain.cover,
    art: terrain.art,
    placementSize: Math.round(Math.sqrt(terrain.cover.length)),
    cellSizeMm: terrain.cellSizeMm,
  });
}
