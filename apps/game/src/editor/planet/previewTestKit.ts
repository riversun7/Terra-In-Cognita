// [시험 도우미] 미리보기 관리자 시험용 가짜 워커·가짜 결과 — 편집기 시험만 쓴다(화면 묶음에 들어가지 않는다).
// 결과는 가짜다: 관리자는 면 레벨·해시·바이트만 읽는다. 해시는 면 레벨에서 만든 가짜 값이라 생성기 판과 무관하다.
import { NORMAL_PRESETS, resolvePlanetSettings } from "@terra/shared";
import { createPreviewController } from "./previewController.ts";
import type { PreviewRequest, PreviewResultData, PreviewStage } from "./previewProtocol.ts";
import type { PreviewWorkerFactory, PreviewWorkerHandlers } from "./previewTypes.ts";

export interface FakeWorker {
  readonly handlers: PreviewWorkerHandlers;
  readonly posted: PreviewRequest[];
  /** 답을 보낸 일 수(posted[done]이 지금 도는 일) */
  done: number;
  terminated: boolean;
}

/** 가짜 결과(관리자가 읽는 것만 의미 있다) */
export function fakeResult(level: number, outputBytes = 1000): PreviewResultData {
  const one = 1;
  return {
    fields: {
      elevationM: new Int16Array(one),
      biome: new Uint8Array(one),
      temperatureC: new Int8Array(one),
      precipitationMm: new Uint16Array(one),
      humidity: new Uint8Array(one),
      water: new Uint8Array(one),
      river: new Uint8Array(one),
      forest: new Uint8Array(one),
      meta: {
        generatorVersion: 1,
        seed: 1,
        faceLevel: level,
        settings: resolvePlanetSettings(NORMAL_PRESETS),
        hash: `0000000${level}`,
      },
    },
    levels: [],
    corners: [],
    summary: null,
    seaLevelRealM: 0,
    maxElevationM: 0,
    generateMs: 1,
    workerMs: 2,
    outputBytes,
  };
}

export interface ControllerKitOptions {
  readonly cacheBytes?: number;
  readonly deviceMaxLevel?: number | null;
  readonly failCreate?: boolean;
}

/** 가짜 워커를 넣은 관리자와 조작 도우미 */
export function controllerKit(options: ControllerKitOptions = {}) {
  const workers: FakeWorker[] = [];
  const sentinel: string[] = [];
  let clock = 1000;
  const factory: PreviewWorkerFactory = (handlers) => {
    if (options.failCreate) throw new Error("no workers here");
    const worker: FakeWorker = { handlers, posted: [], done: 0, terminated: false };
    workers.push(worker);
    return {
      post: (request) => worker.posted.push(request),
      terminate: () => {
        worker.terminated = true;
      },
    };
  };
  const controller = createPreviewController({
    createWorker: factory,
    now: () => clock,
    sentinel: { begin: (level) => sentinel.push(`begin ${level}`), end: () => sentinel.push("end") },
    ...(options.cacheBytes === undefined ? {} : { cacheBytes: options.cacheBytes }),
    ...(options.deviceMaxLevel === undefined ? {} : { deviceMaxLevel: options.deviceMaxLevel }),
  });
  /** 살아 있고 아직 답하지 않은 일이 있는 워커들 */
  const busy = (): FakeWorker[] => workers.filter((w) => !w.terminated && w.posted.length > w.done);
  /** 살아 있는 워커 중 마지막으로 이 레벨 일을 받은 것 */
  const workerAt = (level: number): FakeWorker => {
    const found = workers.filter((w) => !w.terminated && w.posted.at(-1)?.input.faceLevel === level).at(-1);
    if (!found) throw new Error(`no live worker is running a level-${level} job`);
    return found;
  };
  const last = (worker: FakeWorker): PreviewRequest => {
    const request = worker.posted.at(-1);
    if (!request) throw new Error("worker has no job");
    return request;
  };
  const finish = (worker: FakeWorker, outputBytes?: number): PreviewRequest => {
    const request = last(worker);
    worker.done = worker.posted.length;
    worker.handlers.onReply({
      kind: "result",
      id: request.id,
      key: request.key,
      result: fakeResult(request.input.faceLevel, outputBytes),
    });
    return request;
  };
  const stage = (worker: FakeWorker, name: PreviewStage): void => {
    worker.handlers.onReply({ kind: "stage", id: last(worker).id, stage: name });
  };
  /** 도는 일을 모두 끝낸다(새로 보낸 일도). 보낸 일 수를 돌려준다 */
  const drain = (): number => {
    let count = 0;
    for (let guard = 0; guard < 100; guard++) {
      const worker = busy()[0];
      if (!worker) return count;
      finish(worker);
      count += 1;
    }
    throw new Error("lanes did not drain");
  };
  /** 지금까지 보낸 일(모든 워커) */
  const posted = (): PreviewRequest[] => workers.flatMap((w) => w.posted);
  return {
    controller,
    workers,
    sentinel,
    busy,
    workerAt,
    last,
    finish,
    stage,
    drain,
    posted,
    tick: (ms: number) => {
      clock += ms;
    },
  };
}
