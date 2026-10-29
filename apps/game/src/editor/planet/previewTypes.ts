// 미리보기 관리자(previewController.ts)의 바깥 모양 — 화면(WP-D)이 보는 타입과 브라우저 워커 만들기.
// 관리자 구현과 나눠 둔다(파일 크기). 타입만 바꿀 때 관리자 동작을 건드리지 않게.
import type { PlanetGeneratorInput } from "@terra/planet/generator";
import type { PreviewLane, PreviewLevels, PreviewRole } from "./previewJobs.ts";
import type { PreviewReply, PreviewRequest, PreviewResultData, PreviewStage } from "./previewProtocol.ts";

/** 미리보기할 정의: 행성 항목(planets.json 항목 모양, 공개본 또는 초안) + 팩의 바이옴 항목들 */
export interface PreviewDefinition {
  readonly entry: unknown;
  readonly biomes: readonly unknown[];
}

export interface PreviewWorkerHandlers {
  onReply(reply: PreviewReply): void;
  /** 워커가 죽었다(스크립트를 못 받음·메모리 등, error 이벤트) */
  onCrash(): void;
}

/** 워커 하나(가짜로 바꿀 수 있게 필요한 것만) */
export interface PreviewWorkerPort {
  post(request: PreviewRequest): void;
  terminate(): void;
}

export type PreviewWorkerFactory = (handlers: PreviewWorkerHandlers) => PreviewWorkerPort;

/** 브라우저 모듈 워커. Vite가 planetEditorWorker.ts를 따로 묶는다(조각 이름 planetEditorWorker-<해시>.js) */
export const createBrowserPreviewWorker: PreviewWorkerFactory = (handlers) => {
  const worker = new Worker(new URL("./planetEditorWorker.ts", import.meta.url), { type: "module" });
  worker.addEventListener("message", (event: MessageEvent<PreviewReply>) => handlers.onReply(event.data));
  worker.addEventListener("error", (event) => {
    event.preventDefault();
    handlers.onCrash();
  });
  worker.addEventListener("messageerror", () => handlers.onCrash());
  return {
    // 입력은 작아서(약 3KB) 복사해 보낸다
    post: (request) => worker.postMessage(request, []),
    terminate: () => worker.terminate(),
  };
};

/** 관리자가 부르는 꺼짐 감지 함수(crashSentinel.ts의 begin·end) */
export interface SentinelHooks {
  begin(level: number): void;
  end(): void;
}

export interface PreviewControllerOptions {
  readonly createWorker?: PreviewWorkerFactory;
  /** 결과 기억 상한(바이트, 기본 32MiB) */
  readonly cacheBytes?: number;
  /** 꺼짐 감지가 낮춘 기기 상한(없으면 null) */
  readonly deviceMaxLevel?: number | null;
  readonly sentinel?: SentinelHooks;
  /** 시계(ms). 기본 performance.now */
  readonly now?: () => number;
}

/** 실패 코드: rejected·failed는 워커(또는 화면 스레드 입력 확인), crashed = 워커가 죽음, unavailable = 워커를 못 씀 */
export type PreviewErrorCode = "rejected" | "failed" | "crashed" | "unavailable";

/** 기억한 결과 하나 */
export interface PreviewEntry {
  readonly key: string;
  readonly level: number;
  /** 이 결과를 만든 생성기 입력(칸 정보가 바이옴 표를 읽는다) */
  readonly input: PlanetGeneratorInput;
  readonly result: PreviewResultData;
  /** 일을 보낸 때부터 결과를 받은 때까지(화면 스레드에서 잼, ms). 워커를 다시 띄운 값도 들어 있다 */
  readonly elapsedMs: number;
  /** 받은 차례(1부터) */
  readonly sequence: number;
}

export type RoleStatus = "idle" | "queued" | "running" | "ready" | "failed" | "cancelled";

/** 자리 하나(공개본·초안 × 빠른·본)의 상태 */
export interface RoleView {
  /** 마지막으로 청한 결과 열쇠(청하지 않았거나 입력이 틀렸으면 null) */
  readonly key: string | null;
  readonly level: number | null;
  readonly status: RoleStatus;
  /** 보일 결과: 청한 열쇠의 결과가 있으면 그것, 없으면 이 자리에 마지막으로 온 결과(낡음) */
  readonly entry: PreviewEntry | null;
  /** entry가 청한 열쇠의 결과인가 */
  readonly current: boolean;
  readonly error: PreviewErrorCode | null;
}

export interface LaneView {
  readonly running: {
    readonly role: PreviewRole;
    readonly level: number;
    readonly key: string;
    readonly stage: PreviewStage | null;
    /** 보낸 때(now 기준 ms) */
    readonly startedAt: number;
  } | null;
  /** 기다리는 일 수 */
  readonly waiting: number;
}

export interface PreviewSnapshot {
  readonly available: boolean;
  readonly levels: PreviewLevels;
  readonly finalLevel: number;
  readonly base: { readonly quick: RoleView; readonly final: RoleView };
  readonly draft: { readonly quick: RoleView; readonly final: RoleView };
  readonly lanes: { readonly quick: LaneView; readonly final: LaneView };
  readonly cacheBytes: number;
  readonly cacheCapacity: number;
}

export interface PreviewController {
  /** 공개본·초안을 연다(다시 부르면 처음부터: 기억한 결과는 남긴다) */
  open(base: PreviewDefinition, draft: PreviewDefinition): void;
  /** 초안이 바뀌었다: quick = 슬라이더를 끄는 중(F5), final = 놓음·프리셋·시드(본 줄 레벨) */
  setDraft(draft: PreviewDefinition, lane: PreviewLane): void;
  /** 본 줄 레벨(F6~상한, 고를 수 있는 값으로 맞춘다) */
  setFinalLevel(level: number): void;
  /** 기기 상한을 바꾼다([다시 허용] 등) */
  setDeviceMaxLevel(level: number | null): void;
  /** 본 줄을 멈춘다(F8·F9 [멈춤]): 도는 일은 워커를 끝내 버리고 기다리는 일도 버린다 */
  cancelFinal(): void;
  /** 기억한 결과(정의와 면 레벨). 없거나 입력이 틀렸으면 undefined */
  lookup(definition: PreviewDefinition, level: number): PreviewEntry | undefined;
  /** 이 정의로 만든 결과의 해시(면 레벨 오름차순) — 내보내기 checks */
  checks(definition: PreviewDefinition): { faceLevel: number; hash: string }[];
  subscribe(listener: () => void): () => void;
  getSnapshot(): PreviewSnapshot;
  dispose(): void;
}
