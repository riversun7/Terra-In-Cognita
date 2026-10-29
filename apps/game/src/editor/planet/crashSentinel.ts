// F8·F9 미리보기 꺼짐 감지 — ADR 38 4절, 설계 D.3 "Crash sentinel"
// 브라우저 워커는 자기 메모리를 읽을 수 없다. 그래서 F8·F9 일을 시작하기 전에 기기 저장소에 표시를 남기고, 끝나면 지운다
// (결과·멈춤·실패·버림·pagehide). 다음에 열 때 표시가 남아 있으면 탭이 꺼진 것으로 보고 이 기기의 상한을 한 단계 낮춘다
// (지난번 F{n} → 이 기기에서는 F{n−1}까지). [다시 허용]으로 되돌린다.
// iOS는 알리지 않고 탭을 끈다(PLAN 5.7). 그때는 pagehide가 오지 않으므로(Assumed) 표시가 남는다.
// 이 표시는 기기 설정일 뿐 초안이 아니다(초안은 서버에만 둔다). 저장소를 못 쓰면 이번 실행 동안만 기억한다.
// 열쇠·모양: "terra.planetEditor.device" → { v: 1, running?: { level, startedAt }, maxLevel? }

export const CRASH_SENTINEL_STORAGE_KEY = "terra.planetEditor.device";
/** 저장 모양 판. 모르는 판은 아무것도 없는 것으로 읽는다 */
export const CRASH_SENTINEL_FORMAT_VERSION = 1;
/** 표시를 남기는 가장 낮은 면 레벨(F8) */
export const SENTINEL_MIN_LEVEL = 8;

export interface DeviceRecord {
  /** 돌던 F8·F9 일(끝나지 않았으면 남는다) */
  readonly running: { readonly level: number; readonly startedAt: number } | null;
  /** 이 기기의 미리보기 상한(낮춘 적이 없으면 null) */
  readonly maxLevel: number | null;
}

export const EMPTY_DEVICE_RECORD: DeviceRecord = { running: null, maxLevel: null };

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}

function isLevel(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 30;
}

/** 저장된 문자열 → 기록. 없거나 깨졌거나 모르는 판이면 빈 기록 */
export function parseDeviceRecord(raw: string | null): DeviceRecord {
  if (raw === null) return EMPTY_DEVICE_RECORD;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return EMPTY_DEVICE_RECORD;
  }
  if (field(data, "v") !== CRASH_SENTINEL_FORMAT_VERSION) return EMPTY_DEVICE_RECORD;
  const running = field(data, "running");
  const level = field(running, "level");
  const startedAt = field(running, "startedAt");
  const maxLevel = field(data, "maxLevel");
  return {
    running:
      isLevel(level) && typeof startedAt === "number" && Number.isFinite(startedAt)
        ? { level, startedAt }
        : null,
    maxLevel: isLevel(maxLevel) ? maxLevel : null,
  };
}

export function serializeDeviceRecord(record: DeviceRecord): string {
  return JSON.stringify({
    v: CRASH_SENTINEL_FORMAT_VERSION,
    ...(record.running ? { running: record.running } : {}),
    ...(record.maxLevel === null ? {} : { maxLevel: record.maxLevel }),
  });
}

/**
 * 열 때(순수): 남은 표시가 있으면 탭이 꺼진 것 → 상한을 그 레벨 − 1로(이미 더 낮으면 그대로) 낮추고 표시를 지운다.
 * tripped = 꺼진 레벨(없으면 null)
 */
export function settleOnOpen(record: DeviceRecord): { record: DeviceRecord; tripped: number | null } {
  if (!record.running) return { record, tripped: null };
  const lowered = record.running.level - 1;
  const maxLevel = record.maxLevel === null ? lowered : Math.min(record.maxLevel, lowered);
  return { record: { running: null, maxLevel }, tripped: record.running.level };
}

/** 저장소에서 쓰는 것만(localStorage와 같은 모양). 던질 수 있다(사파리 개인 정보 보호 모드 등) */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface CrashSentinel {
  /** 열 때 한 번: 남은 표시를 정리하고 기기 상한·꺼진 레벨을 돌려준다 */
  open(): { readonly maxLevel: number | null; readonly tripped: number | null };
  /** 본 줄 일을 시작한다(F8 미만은 표시하지 않는다) */
  begin(level: number): void;
  /** 그 일이 끝났다(결과·멈춤·실패·버림). 이 탭이 남긴 표시만 지운다 */
  end(): void;
  /** [다시 허용]: 기기 상한을 지운다 */
  allowAgain(): void;
  maxLevel(): number | null;
  /** pagehide: 떠나는 것이라 꺼진 것이 아니다(표시를 지우되 도는 일은 기억한다) */
  pageHidden(): void;
  /** pageshow(뒤로 가기 캐시에서 돌아옴): 아직 도는 일이 있으면 표시를 다시 남긴다 */
  pageShown(): void;
}

/** 기본 저장소: localStorage(못 쓰면 null) */
export function browserStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function createCrashSentinel(
  storage: StorageLike | null = browserStorage(),
  now: () => number = () => Date.now(),
): CrashSentinel {
  /** 저장소를 못 쓸 때 쓰는 기록(이번 실행만) */
  let memory: DeviceRecord = EMPTY_DEVICE_RECORD;
  /** 이 탭이 남긴 표시의 레벨(없으면 null) */
  let active: number | null = null;

  const read = (): DeviceRecord => {
    try {
      return storage ? parseDeviceRecord(storage.getItem(CRASH_SENTINEL_STORAGE_KEY)) : memory;
    } catch {
      return memory;
    }
  };
  const write = (record: DeviceRecord): void => {
    memory = record;
    try {
      storage?.setItem(CRASH_SENTINEL_STORAGE_KEY, serializeDeviceRecord(record));
    } catch {
      // 저장소를 못 쓰면 이번 실행 동안만 기억한다
    }
  };
  const mark = (level: number): void => write({ ...read(), running: { level, startedAt: now() } });
  const clear = (): void => {
    const record = read();
    if (record.running) write({ ...record, running: null });
  };

  return {
    open() {
      const { record, tripped } = settleOnOpen(read());
      if (tripped !== null) write(record);
      return { maxLevel: record.maxLevel, tripped };
    },
    begin(level) {
      if (level < SENTINEL_MIN_LEVEL) return;
      active = level;
      mark(level);
    },
    end() {
      if (active === null) return;
      active = null;
      clear();
    },
    allowAgain() {
      const record = read();
      write({ ...record, maxLevel: null });
    },
    maxLevel: () => read().maxLevel,
    pageHidden() {
      if (active !== null) clear();
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
