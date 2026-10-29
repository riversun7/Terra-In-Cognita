// F8·F9 미리보기 꺼짐 감지 — ADR 38 4절, 설계 D.3 "Crash sentinel"
// 브라우저 워커는 자기 메모리를 읽을 수 없다. 그래서 F8·F9 일을 시작하기 전에 기기 저장소에 표시를 남기고, 끝나면 지운다
// (결과·멈춤·실패·버림·pagehide). 다음에 열 때 꺼진 탭의 표시가 남아 있으면 탭이 꺼진 것으로 보고 이 기기의 상한을 한 단계
// 낮춘다(지난번 F{n} → 이 기기에서는 F{n−1}까지). [다시 허용]으로 되돌린다.
// 표시는 탭마다 따로 둔다(검토 지적: 한 칸을 같이 쓰면 다른 탭이 살아 있는 표시를 꺼짐으로 보거나 지운다).
// - 표시: 열쇠 "terra.planetEditor.run.<탭 ID>" → { v: 1, level, startedAt }. 탭(감지기 하나)은 자기 표시만 쓰고 지운다.
// - 살아 있는 탭: 표시가 있는 동안 같은 이름의 Web Locks 잠금을 쥔다. 탭(문서)이 꺼지면 브라우저가 잠금을 푼다.
//   열 때 쥔 잠금이 없는 다른 탭의 표시만 꺼짐으로 보고 지운다. 살아 있는 탭의 표시는 그대로 둔다.
// - 잠금을 못 쓰는 곳(보안 맥락이 아닌 LAN http 기기 시험 등)에서는 다른 탭의 남은 표시를 모두 꺼짐으로 본다
//   (그 탭이 도는 중이어도 — 알 길이 없다).
// - 기기 상한: 열쇠 "terra.planetEditor.device" → { v: 1, maxLevel? }.
// iOS는 알리지 않고 탭을 끈다(PLAN 5.7). 그때는 pagehide가 오지 않으므로(Assumed) 표시가 남고, 잠금은 문서와 함께 풀린다.
// 이 표시는 기기 설정일 뿐 초안이 아니다(초안은 서버에만 둔다). 저장소를 못 쓰면 이번 실행 동안만 기억한다(꺼짐은 알 수 없다).
import { HEAVY_PREVIEW_LEVEL } from "./previewJobs.ts";

export const DEVICE_STORAGE_KEY = "terra.planetEditor.device";
/** 탭마다의 표시 열쇠 앞머리(뒤에 탭 ID). 잠금 이름도 같다 */
export const RUN_STORAGE_PREFIX = "terra.planetEditor.run.";
/** 저장 모양 판. 모르는 판은 아무것도 없는 것으로 읽는다 */
export const CRASH_SENTINEL_FORMAT_VERSION = 1;
/** 표시를 남기는 가장 낮은 면 레벨(F8, 무거운 레벨) */
export const SENTINEL_MIN_LEVEL = HEAVY_PREVIEW_LEVEL;

/** 이 기기의 기록 */
export interface DeviceRecord {
  /** 이 기기의 미리보기 상한(낮춘 적이 없으면 null) */
  readonly maxLevel: number | null;
}

/** 탭 하나가 돌리는 F8·F9 일의 표시 */
export interface RunRecord {
  readonly level: number;
  readonly startedAt: number;
}

export const EMPTY_DEVICE_RECORD: DeviceRecord = { maxLevel: null };

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}

function isLevel(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 30;
}

/** JSON 문자열 → 판이 맞는 객체(없거나 깨졌거나 모르는 판이면 undefined) */
function parseVersioned(raw: string | null): unknown {
  if (raw === null) return undefined;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return undefined;
  }
  return field(data, "v") === CRASH_SENTINEL_FORMAT_VERSION ? data : undefined;
}

/** 저장된 문자열 → 기기 기록. 없거나 깨졌거나 모르는 판이면 빈 기록 */
export function parseDeviceRecord(raw: string | null): DeviceRecord {
  const maxLevel = field(parseVersioned(raw), "maxLevel");
  return { maxLevel: isLevel(maxLevel) ? maxLevel : null };
}

export function serializeDeviceRecord(record: DeviceRecord): string {
  return JSON.stringify({
    v: CRASH_SENTINEL_FORMAT_VERSION,
    ...(record.maxLevel === null ? {} : { maxLevel: record.maxLevel }),
  });
}

/** 저장된 문자열 → 표시. 없거나 틀리면 null */
export function parseRunRecord(raw: string | null): RunRecord | null {
  const data = parseVersioned(raw);
  const level = field(data, "level");
  const startedAt = field(data, "startedAt");
  return isLevel(level) && typeof startedAt === "number" && Number.isFinite(startedAt)
    ? { level, startedAt }
    : null;
}

export function serializeRunRecord(record: RunRecord): string {
  return JSON.stringify({
    v: CRASH_SENTINEL_FORMAT_VERSION,
    level: record.level,
    startedAt: record.startedAt,
  });
}

/**
 * 열 때(순수): 꺼진 탭들의 표시 → 상한을 (꺼진 레벨 중 가장 낮은 것 − 1)로(이미 더 낮으면 그대로).
 * tripped = 그 꺼진 레벨(없으면 null)
 */
export function settleOnOpen(
  device: DeviceRecord,
  deadRuns: readonly RunRecord[],
): { device: DeviceRecord; tripped: number | null } {
  if (deadRuns.length === 0) return { device, tripped: null };
  const tripped = Math.min(...deadRuns.map((run) => run.level));
  const lowered = tripped - 1;
  const maxLevel = device.maxLevel === null ? lowered : Math.min(device.maxLevel, lowered);
  return { device: { maxLevel }, tripped };
}

/** 저장소에서 쓰는 것만(localStorage와 같은 모양). 던질 수 있다(사파리 개인 정보 보호 모드 등) */
export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Web Locks에서 쓰는 것만(navigator.locks와 같은 모양) */
export interface LockManagerLike {
  request(name: string, callback: () => Promise<void>): Promise<unknown>;
  query(): Promise<{ readonly held?: readonly { readonly name?: string }[] }>;
}

export interface CrashSentinel {
  /** 열 때 한 번: 꺼진 탭의 표시를 정리하고 기기 상한·꺼진 레벨을 돌려준다(다른 탭이 살아 있는지 묻느라 비동기) */
  open(): Promise<{ readonly maxLevel: number | null; readonly tripped: number | null }>;
  /** 본 줄 일을 시작한다(F8 미만은 표시하지 않는다) */
  begin(level: number): void;
  /** 그 일이 끝났다(결과·멈춤·실패·버림). 이 탭의 표시만 지운다 */
  end(): void;
  /** [다시 허용]: 기기 상한을 지운다 */
  allowAgain(): void;
  maxLevel(): number | null;
  /** pagehide: 떠나는 것이라 꺼진 것이 아니다(표시를 지우고 잠금을 놓되 도는 일은 기억한다) */
  pageHidden(): void;
  /** pageshow(뒤로 가기 캐시에서 돌아옴): 아직 도는 일이 있으면 표시를 다시 남긴다 */
  pageShown(): void;
}

export interface CrashSentinelOptions {
  /** 기본 localStorage(못 쓰면 null: 이번 실행 동안만 기억) */
  readonly storage?: StorageLike | null;
  /** 기본 navigator.locks(없으면 null: 다른 탭의 남은 표시를 모두 꺼짐으로 본다) */
  readonly locks?: LockManagerLike | null;
  readonly now?: () => number;
  /** 이 감지기(탭)의 ID. 기본은 무작위 */
  readonly tabId?: string;
}

/** 기본 저장소: localStorage(못 쓰면 null) */
export function browserStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isLockManager(value: unknown): value is LockManagerLike {
  return typeof field(value, "request") === "function" && typeof field(value, "query") === "function";
}

/** 기본 잠금: navigator.locks(보안 맥락에서만 있다. 없으면 null) */
export function browserLocks(): LockManagerLike | null {
  try {
    const locks = field(Reflect.get(globalThis, "navigator"), "locks");
    return isLockManager(locks) ? locks : null;
  } catch {
    return null;
  }
}

function randomTabId(): string {
  const words = new Uint32Array(2);
  globalThis.crypto.getRandomValues(words);
  return Array.from(words, (word) => word.toString(16).padStart(8, "0")).join("");
}

/** 저장소를 감싼다: 쓰기가 던지면 그 값은 이번 실행 동안 기억으로 대신한다. 읽기가 던지면 없는 것으로 본다 */
function safeStorage(storage: StorageLike | null) {
  const memory = new Map<string, string>();
  return {
    get(key: string): string | null {
      const kept = memory.get(key);
      if (kept !== undefined) return kept;
      try {
        return storage ? storage.getItem(key) : null;
      } catch {
        return null;
      }
    },
    set(key: string, value: string): void {
      try {
        if (!storage) throw new Error("no storage");
        storage.setItem(key, value);
        memory.delete(key);
      } catch {
        memory.set(key, value);
      }
    },
    remove(key: string): void {
      memory.delete(key);
      try {
        storage?.removeItem(key);
      } catch {
        // 저장소를 못 쓰면 기억에서만 지운다
      }
    },
    /** 앞머리가 같은 열쇠들 */
    keys(prefix: string): string[] {
      const found = new Set<string>();
      try {
        if (storage) {
          for (let index = 0; index < storage.length; index++) {
            const key = storage.key(index);
            if (key?.startsWith(prefix)) found.add(key);
          }
        }
      } catch {
        // 저장소를 못 읽으면 기억만 본다
      }
      for (const key of memory.keys()) if (key.startsWith(prefix)) found.add(key);
      return [...found];
    },
  };
}

/** 쥔 잠금 이름들 */
function heldNames(snapshot: Awaited<ReturnType<LockManagerLike["query"]>>): Set<string> {
  const names = new Set<string>();
  for (const lock of snapshot.held ?? []) if (typeof lock.name === "string") names.add(lock.name);
  return names;
}

export function createCrashSentinel(options: CrashSentinelOptions = {}): CrashSentinel {
  const store = safeStorage(options.storage === undefined ? browserStorage() : options.storage);
  const locks = options.locks === undefined ? browserLocks() : options.locks;
  const now = options.now ?? (() => Date.now());
  const ownKey = `${RUN_STORAGE_PREFIX}${options.tabId ?? randomTabId()}`;
  /** 이 탭이 돌리는 F8·F9 일의 레벨(없으면 null) */
  let active: number | null = null;
  /** 쥔 잠금을 놓는 함수(쥐지 않았으면 null) */
  let release: (() => void) | null = null;

  const readDevice = (): DeviceRecord => parseDeviceRecord(store.get(DEVICE_STORAGE_KEY));
  const writeDevice = (record: DeviceRecord): void =>
    store.set(DEVICE_STORAGE_KEY, serializeDeviceRecord(record));

  /** 표시가 있는 동안 잠금을 쥔다(탭이 꺼지면 브라우저가 푼다) */
  function hold(): void {
    if (!locks || release) return;
    const held = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    try {
      void locks.request(ownKey, () => held).catch(() => undefined);
    } catch {
      // 잠금을 못 쓰면 표시만 남긴다
    }
  }

  function mark(level: number): void {
    store.set(ownKey, serializeRunRecord({ level, startedAt: now() }));
    hold();
  }

  function unmark(): void {
    store.remove(ownKey);
    release?.();
    release = null;
  }

  return {
    async open() {
      const others = store.keys(RUN_STORAGE_PREFIX).filter((key) => key !== ownKey);
      let alive: ReadonlySet<string> | null = null;
      if (others.length > 0 && locks) {
        try {
          alive = heldNames(await locks.query());
        } catch {
          alive = null;
        }
      }
      const dead: RunRecord[] = [];
      for (const key of others) {
        if (alive?.has(key)) continue;
        const run = parseRunRecord(store.get(key));
        store.remove(key);
        if (run) dead.push(run);
      }
      const { device, tripped } = settleOnOpen(readDevice(), dead);
      if (tripped !== null) writeDevice(device);
      return { maxLevel: device.maxLevel, tripped };
    },
    begin(level) {
      if (level < SENTINEL_MIN_LEVEL) return;
      active = level;
      mark(level);
    },
    end() {
      if (active === null) return;
      active = null;
      unmark();
    },
    allowAgain() {
      writeDevice({ ...readDevice(), maxLevel: null });
    },
    maxLevel: () => readDevice().maxLevel,
    pageHidden() {
      if (active !== null) unmark();
    },
    pageShown() {
      if (active !== null) mark(active);
    },
  };
}

/** pagehide·pageshow를 받는 것(window) */
export interface PageLifecycleTarget {
  addEventListener(type: "pagehide" | "pageshow", listener: () => void): void;
  removeEventListener(type: "pagehide" | "pageshow", listener: () => void): void;
}

/** 창의 pagehide·pageshow를 꺼짐 감지에 잇는다. 돌려준 함수로 뗀다 */
export function watchPageLifecycle(
  target: PageLifecycleTarget,
  sentinel: Pick<CrashSentinel, "pageHidden" | "pageShown">,
): () => void {
  const hidden = (): void => sentinel.pageHidden();
  const shown = (): void => sentinel.pageShown();
  target.addEventListener("pagehide", hidden);
  target.addEventListener("pageshow", shown);
  return () => {
    target.removeEventListener("pagehide", hidden);
    target.removeEventListener("pageshow", shown);
  };
}
