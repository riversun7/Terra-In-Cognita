// 서버 초안 동기화(상태 기계) — ADR 38 9절 "서버 초안"
// 초안은 사람마다·행성마다 하나이고 서버 DB에 있다(planetEditor.drafts.*). 기기 저장소에는 초안을 두지 않는다.
// - 열 때 서버에서 읽는다(get). 서버에 초안이 없으면 공개본으로 시작한다(판 0, 저장할 것 없음).
// - 자동 저장: 마지막으로 바꾼 뒤 2초. 보내는 중인 저장은 하나뿐이다(그동안 바뀐 것은 끝난 뒤 이어서 보낸다).
// - 저장에 기대 판(이 기기가 마지막으로 본 판)을 함께 보낸다. 다른 기기가 먼저 저장했으면 서버가 CONFLICT → 충돌 상태:
//   자동 저장을 멈추고 [그쪽 불러오기](서버 것으로 바꿈) 또는 [이걸로 덮기](서버의 지금 판을 기대 판으로 다시 저장)를 고른다.
// - 서버가 받지 않으면(BAD_REQUEST 코드) 받지 않음 상태(코드). 다음에 바꾸면 다시 보낸다.
// - 닿지 못하면 "저장 안 됨"(retrying)을 띄우고 1초부터 두 배씩(최대 30초) 기다렸다 다시 보낸다(늘 가장 새 초안을).
// - 저장하지 않은 변경(unsaved)이 있으면 화면이 떠날 때 묻는다.
// 서버 호출은 주입한 client로 한다(화면이 tRPC를 이 모양에 맞춘다). 시계·타이머도 주입한다(시험).
import { type DraftDocument, sameDocument } from "./editorModel.ts";

/** 서버에 있는 초안 */
export interface ServerDraft {
  readonly revision: number;
  readonly document: DraftDocument;
  /** 마지막 저장 시각(ISO 문자열) */
  readonly updatedAt: string;
}

/** 판 기록 한 줄(drafts.revisions) */
export interface DraftRevisionInfo {
  readonly revision: number;
  readonly savedAt: string;
  /** 항목 크기(바이트) */
  readonly bytes: number;
}

export type DraftSaveResult =
  | { readonly kind: "saved"; readonly revision: number; readonly updatedAt: string }
  /** 기대 판이 서버의 지금 판과 다르다(다른 기기가 먼저 저장했다) */
  | { readonly kind: "conflict" }
  /** 서버 검사에서 틀림(코드만, 문장은 쓰지 않는다) */
  | { readonly kind: "rejected"; readonly code: string };

/** 서버 초안 호출(planetEditor.drafts.*). 닿지 못함·서버 오류는 던진다 */
export interface DraftClient {
  get(planetId: string): Promise<ServerDraft | null>;
  /** expectedRevision: 이 기기가 마지막으로 본 판(0 = 서버에 초안 없음) */
  save(request: {
    readonly planetId: string;
    readonly document: DraftDocument;
    readonly expectedRevision: number;
  }): Promise<DraftSaveResult>;
  /** 판 하나를 초안으로 되돌린다(새 판이 된다) */
  restore(planetId: string, revision: number): Promise<ServerDraft>;
  /** 초안과 판 기록을 지운다 */
  remove(planetId: string): Promise<void>;
  revisions(planetId: string): Promise<readonly DraftRevisionInfo[]>;
}

export interface DraftTimers {
  /** ms 뒤에 callback을 부른다. 돌려준 함수를 부르면 취소한다 */
  after(ms: number, callback: () => void): () => void;
  now(): number;
}

export type DraftSyncStatus =
  /** 서버에서 읽는 중 */
  | "loading"
  /** 읽지 못함(다시 시도를 기다림) */
  | "load_failed"
  /** 서버와 같음 */
  | "saved"
  /** 바꾼 뒤 기다리는 중(2초) */
  | "pending"
  | "saving"
  /** 저장 실패, 다시 시도를 기다림("저장 안 됨") */
  | "retrying"
  /** 다른 기기에서 바뀜 */
  | "conflict"
  /** 서버가 받지 않음(rejectedCode) */
  | "rejected"
  /** 불러오기·덮기·되돌리기·지우기 중 */
  | "busy";

export interface DraftSyncSnapshot {
  readonly status: DraftSyncStatus;
  /** 편집 중인 초안(읽기 전에는 null) */
  readonly document: DraftDocument | null;
  /** 서버에 있다고 아는 판(0 = 서버에 초안 없음) */
  readonly revision: number;
  readonly updatedAt: string | null;
  /** 서버에 아직 없는 변경이 있다 */
  readonly unsaved: boolean;
  readonly rejectedCode: string | null;
  /** 잇달은 실패 횟수 */
  readonly failures: number;
  /** 다음 다시 시도 시각(now 기준 ms, 기다리는 중이 아니면 null) */
  readonly retryAt: number | null;
}

export interface DraftSync {
  /** 서버에서 읽기 시작(한 번) */
  start(): void;
  /** 초안을 바꿨다. 읽기 전·바쁜 동안에는 받지 않는다(false) */
  edit(document: DraftDocument): boolean;
  /** 기다리지 않고 바로 저장한다(가져오기·떠나기 전). 끝나면(성공·실패) 풀린다 */
  flush(): Promise<void>;
  /** 충돌: 서버 것으로 바꾼다 */
  loadTheirs(): Promise<boolean>;
  /** 충돌: 서버의 지금 판을 기대 판으로 이 초안을 다시 저장한다 */
  overwrite(): Promise<boolean>;
  /** 판 하나로 되돌린다(새 판, 저장 안 된 변경은 버린다 — 화면이 먼저 묻는다) */
  restore(revision: number): Promise<boolean>;
  /** 서버 초안을 지우고 공개본으로 돌아간다 */
  remove(): Promise<boolean>;
  revisions(): Promise<readonly DraftRevisionInfo[]>;
  /** 기다리는 다시 시도(읽기·저장)를 바로 한다 */
  retryNow(): void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): DraftSyncSnapshot;
  dispose(): void;
}

export interface DraftSyncOptions {
  readonly planetId: string;
  readonly client: DraftClient;
  /** 서버에 초안이 없을 때 시작하는 것(공개본 항목 + 기준) */
  readonly fallback: DraftDocument;
  readonly timers?: DraftTimers;
  /** 자동 저장 기다림(ms, 기본 2초) */
  readonly debounceMs?: number;
}

export const AUTOSAVE_DELAY_MS = 2000;
const RETRY_FIRST_MS = 1000;
const RETRY_MAX_MS = 30_000;

/** n번째(1부터) 잇단 실패 뒤 기다림: 1초부터 두 배씩, 최대 30초 */
export function retryDelayMs(failures: number): number {
  const steps = Math.max(0, Math.min(failures, 16) - 1);
  return Math.min(RETRY_MAX_MS, RETRY_FIRST_MS * 2 ** steps);
}

const browserTimers: DraftTimers = {
  after(ms, callback) {
    const handle = setTimeout(callback, ms);
    return () => clearTimeout(handle);
  },
  now: () => Date.now(),
};

type Phase = "loading" | "load_failed" | "ready" | "conflict" | "rejected" | "busy";
type TimerKind = "debounce" | "retry" | "load";

export function createDraftSync(options: DraftSyncOptions): DraftSync {
  const { planetId, client, fallback } = options;
  const timers = options.timers ?? browserTimers;
  const debounceMs = options.debounceMs ?? AUTOSAVE_DELAY_MS;
  const listeners = new Set<() => void>();
  let phase: Phase = "loading";
  let local: DraftDocument | null = null;
  /** 서버에 있다고 아는 것(서버에 초안이 없으면 fallback) */
  let saved: DraftDocument | null = null;
  let revision = 0;
  let updatedAt: string | null = null;
  let rejectedCode: string | null = null;
  let failures = 0;
  let cancelTimer: (() => void) | null = null;
  let timerKind: TimerKind | null = null;
  let retryAt: number | null = null;
  let saving: Promise<void> | null = null;
  let lastEditAt = 0;
  let started = false;
  let disposed = false;

  const unsaved = (): boolean => local !== null && saved !== null && !sameDocument(local, saved);

  function status(): DraftSyncStatus {
    if (phase !== "ready") return phase;
    if (saving) return "saving";
    if (timerKind === "retry") return "retrying";
    if (timerKind === "debounce" || unsaved()) return "pending";
    return "saved";
  }

  function buildSnapshot(): DraftSyncSnapshot {
    return {
      status: status(),
      document: local,
      revision,
      updatedAt,
      unsaved: unsaved(),
      rejectedCode,
      failures,
      retryAt,
    };
  }
  let snapshot = buildSnapshot();

  function notify(): void {
    if (disposed) return;
    snapshot = buildSnapshot();
    for (const listener of listeners) listener();
  }

  function clearTimer(): void {
    cancelTimer?.();
    cancelTimer = null;
    timerKind = null;
    retryAt = null;
  }

  function schedule(kind: TimerKind, ms: number, run: () => void): void {
    clearTimer();
    if (disposed) return;
    timerKind = kind;
    retryAt = kind === "debounce" ? null : timers.now() + ms;
    cancelTimer = timers.after(ms, () => {
      cancelTimer = null;
      timerKind = null;
      retryAt = null;
      run();
    });
  }

  /** 서버 초안(없으면 fallback)을 편집 중인 것으로 */
  function adopt(draft: ServerDraft | null): void {
    local = draft ? draft.document : fallback;
    saved = local;
    revision = draft ? draft.revision : 0;
    updatedAt = draft ? draft.updatedAt : null;
    rejectedCode = null;
    failures = 0;
    phase = "ready";
  }

  async function load(): Promise<void> {
    phase = "loading";
    notify();
    try {
      const draft = await client.get(planetId);
      if (disposed) return;
      adopt(draft);
    } catch {
      if (disposed) return;
      failures += 1;
      phase = "load_failed";
      schedule("load", retryDelayMs(failures), () => void load());
    }
    notify();
  }

  /** 바꾼 것이 남아 있으면 마지막으로 바꾼 때부터 2초 뒤 저장을 잡는다 */
  function scheduleAutosave(): void {
    if (phase !== "ready" || saving || timerKind === "retry" || !unsaved()) return;
    const wait = Math.max(0, lastEditAt + debounceMs - timers.now());
    schedule("debounce", wait, () => void save());
  }

  async function sendOnce(payload: DraftDocument, expected: number): Promise<void> {
    let result: DraftSaveResult;
    try {
      result = await client.save({ planetId, document: payload, expectedRevision: expected });
    } catch {
      if (disposed) return;
      failures += 1;
      if (phase === "ready") schedule("retry", retryDelayMs(failures), () => void save());
      return;
    }
    if (disposed) return;
    if (result.kind === "saved") {
      saved = payload;
      revision = result.revision;
      updatedAt = result.updatedAt;
      failures = 0;
    } else if (result.kind === "conflict") {
      clearTimer();
      phase = "conflict";
    } else {
      clearTimer();
      phase = "rejected";
      rejectedCode = result.code;
    }
  }

  async function save(): Promise<void> {
    if (saving) {
      await saving;
      return;
    }
    if (disposed || phase !== "ready" || !local || !unsaved()) return;
    const run = sendOnce(local, revision);
    saving = run;
    notify();
    try {
      await run;
    } finally {
      saving = null;
    }
    scheduleAutosave();
    notify();
  }

  /** 바쁜 일(불러오기·덮기·되돌리기·지우기): 보내는 저장을 기다린 뒤 한다. 실패하면 앞 상태로 돌아간다 */
  async function exclusive(work: () => Promise<void>): Promise<boolean> {
    if (phase === "loading" || phase === "load_failed" || phase === "busy" || disposed) return false;
    const before = phase;
    clearTimer();
    phase = "busy";
    notify();
    if (saving) await saving.catch(() => undefined);
    try {
      await work();
    } catch {
      if (!disposed) {
        phase = before;
        // 멈춰 둔 자동 저장을 다시 잡는다(바꾼 것이 남아 있으면)
        scheduleAutosave();
        notify();
      }
      return false;
    }
    if (disposed) return false;
    notify();
    return true;
  }

  return {
    start() {
      if (started || disposed) return;
      started = true;
      void load();
    },
    edit(document) {
      if (disposed || phase === "loading" || phase === "load_failed" || phase === "busy") return false;
      local = document;
      lastEditAt = timers.now();
      if (phase === "rejected") {
        phase = "ready";
        rejectedCode = null;
      }
      // 보내는 중이면 끝난 뒤(scheduleAutosave), 다시 시도를 기다리면 그때 가장 새 것을 보낸다
      if (phase === "ready" && timerKind !== "retry" && !saving) {
        if (unsaved()) schedule("debounce", debounceMs, () => void save());
        else clearTimer();
      }
      notify();
      return true;
    },
    async flush() {
      if (saving) await saving;
      if (phase !== "ready") return;
      if (timerKind === "debounce" || timerKind === "retry") clearTimer();
      await save();
    },
    loadTheirs() {
      return exclusive(async () => {
        adopt(await client.get(planetId));
      });
    },
    overwrite() {
      return exclusive(async () => {
        const mine = local;
        const server = await client.get(planetId);
        // 서버의 지금 판을 기대 판으로: 서버 것을 "아는 것"으로 두고 내 것을 다시 편집 중인 것으로
        adopt(server);
        local = mine;
        await save();
      });
    },
    restore(target) {
      return exclusive(async () => {
        adopt(await client.restore(planetId, target));
      });
    },
    remove() {
      return exclusive(async () => {
        await client.remove(planetId);
        adopt(null);
      });
    },
    revisions: () => client.revisions(planetId),
    retryNow() {
      if (disposed) return;
      if (timerKind === "load") {
        clearTimer();
        void load();
      } else if (timerKind === "retry") {
        clearTimer();
        void save();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    dispose() {
      disposed = true;
      clearTimer();
      listeners.clear();
    },
  };
}
