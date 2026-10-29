// 꺼짐 감지 시험 — 저장 모양, 열 때 꺼진 탭의 표시 → 기기 상한 한 단계 낮춤, F8 미만은 표시 없음, 탭마다 따로(살아 있는
// 다른 탭의 표시는 건드리지 않고 지우지도 않음, Web Locks로 살아 있는지 봄), 잠금이 없을 때, pagehide·pageshow,
// 저장소를 못 쓸 때(던짐·없음)
import { describe, expect, it } from "vitest";
import {
  DEVICE_STORAGE_KEY,
  EMPTY_DEVICE_RECORD,
  type LockManagerLike,
  RUN_STORAGE_PREFIX,
  SENTINEL_MIN_LEVEL,
  type StorageLike,
  createCrashSentinel,
  parseDeviceRecord,
  parseRunRecord,
  serializeDeviceRecord,
  serializeRunRecord,
  settleOnOpen,
  watchPageLifecycle,
} from "./crashSentinel.ts";

/** 탭들이 같이 쓰는 가짜 localStorage */
function memoryStorage(): StorageLike & { readonly data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get length() {
      return data.size;
    },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

/** 가짜 Web Locks: 쥔 이름을 기억한다. kill = 탭이 꺼져 브라우저가 그 탭의 잠금을 푼 것 */
function fakeLocks() {
  const held = new Set<string>();
  const manager: LockManagerLike = {
    request(name, callback) {
      held.add(name);
      return callback().finally(() => held.delete(name));
    },
    query: () => Promise.resolve({ held: [...held].map((name) => ({ name })) }),
  };
  return { manager, held, kill: (tabId: string) => held.delete(`${RUN_STORAGE_PREFIX}${tabId}`) };
}

const runKey = (tabId: string) => `${RUN_STORAGE_PREFIX}${tabId}`;
const run = (storage: { data: Map<string, string> }, tabId: string) =>
  parseRunRecord(storage.data.get(runKey(tabId)) ?? null);
const device = (storage: { data: Map<string, string> }) =>
  parseDeviceRecord(storage.data.get(DEVICE_STORAGE_KEY) ?? null);

describe("기록 모양", () => {
  it("쓰고 다시 읽으면 같다. 없음·깨짐·모르는 판·틀린 값은 빈 것", () => {
    expect(parseDeviceRecord(serializeDeviceRecord({ maxLevel: 8 }))).toEqual({ maxLevel: 8 });
    expect(JSON.parse(serializeDeviceRecord(EMPTY_DEVICE_RECORD))).toEqual({ v: 1 });
    expect(parseRunRecord(serializeRunRecord({ level: 9, startedAt: 123 }))).toEqual({
      level: 9,
      startedAt: 123,
    });
    for (const raw of [
      null,
      "{oops",
      JSON.stringify({ v: 2, maxLevel: 7 }),
      JSON.stringify({ v: 1, maxLevel: "7" }),
    ]) {
      expect(parseDeviceRecord(raw)).toEqual(EMPTY_DEVICE_RECORD);
    }
    for (const raw of [
      null,
      "{oops",
      JSON.stringify({ v: 1, level: 1.5, startedAt: 1 }),
      JSON.stringify({ v: 1, level: 9 }),
    ]) {
      expect(parseRunRecord(raw)).toBeNull();
    }
  });

  it("열 때: 꺼진 표시 → 상한을 (가장 낮은 꺼진 레벨 − 1)로(이미 낮으면 그대로)", () => {
    expect(settleOnOpen({ maxLevel: null }, [{ level: 9, startedAt: 1 }])).toEqual({
      device: { maxLevel: 8 },
      tripped: 9,
    });
    expect(settleOnOpen({ maxLevel: 7 }, [{ level: 9, startedAt: 1 }]).device.maxLevel).toBe(7);
    expect(
      settleOnOpen({ maxLevel: null }, [
        { level: 9, startedAt: 1 },
        { level: 8, startedAt: 2 },
      ]),
    ).toEqual({
      device: { maxLevel: 7 },
      tripped: 8,
    });
    expect(settleOnOpen({ maxLevel: 8 }, [])).toEqual({ device: { maxLevel: 8 }, tripped: null });
  });
});

describe("꺼짐 감지: 탭 하나", () => {
  it("F8·F9만 표시를 남기고(잠금도 쥔다) 끝나면 지운다(잠금도 놓는다)", async () => {
    const storage = memoryStorage();
    const locks = fakeLocks();
    const sentinel = createCrashSentinel({ storage, locks: locks.manager, now: () => 500, tabId: "a" });
    sentinel.begin(SENTINEL_MIN_LEVEL - 1);
    expect(storage.data.size).toBe(0);
    sentinel.begin(9);
    expect(run(storage, "a")).toEqual({ level: 9, startedAt: 500 });
    expect(locks.held.has(runKey("a"))).toBe(true);
    // 자기 표시는 열 때 꺼짐으로 보지 않는다
    await expect(sentinel.open()).resolves.toEqual({ maxLevel: null, tripped: null });
    sentinel.end();
    await Promise.resolve();
    expect(run(storage, "a")).toBeNull();
    expect(locks.held.size).toBe(0);
  });

  it("탭이 꺼져 표시가 남으면(잠금은 풀림) 다음에 열 때 상한을 낮추고, 다시 허용으로 되돌린다", async () => {
    const storage = memoryStorage();
    const locks = fakeLocks();
    createCrashSentinel({ storage, locks: locks.manager, tabId: "dead" }).begin(9);
    locks.kill("dead");
    const next = createCrashSentinel({ storage, locks: locks.manager, tabId: "next" });
    await expect(next.open()).resolves.toEqual({ maxLevel: 8, tripped: 9 });
    expect(next.maxLevel()).toBe(8);
    expect(run(storage, "dead")).toBeNull();
    // 한 번 더 열어도 다시 낮추지 않는다
    await expect(createCrashSentinel({ storage, locks: locks.manager }).open()).resolves.toEqual({
      maxLevel: 8,
      tripped: null,
    });
    next.allowAgain();
    expect(next.maxLevel()).toBeNull();
    expect(device(storage)).toEqual(EMPTY_DEVICE_RECORD);
  });
});

describe("꺼짐 감지: 탭 둘", () => {
  it("다른 탭이 F9를 돌리는 중(잠금을 쥠)이면 열어도 꺼짐으로 보지 않고 그 표시를 지우지 않는다", async () => {
    const storage = memoryStorage();
    const locks = fakeLocks();
    const a = createCrashSentinel({ storage, locks: locks.manager, tabId: "a" });
    a.begin(9);
    const b = createCrashSentinel({ storage, locks: locks.manager, tabId: "b" });
    await expect(b.open()).resolves.toEqual({ maxLevel: null, tripped: null });
    expect(run(storage, "a")?.level).toBe(9);
    // 그 뒤 A가 꺼지면 다음에 여는 탭이 알아챈다
    locks.kill("a");
    await expect(createCrashSentinel({ storage, locks: locks.manager }).open()).resolves.toEqual({
      maxLevel: 8,
      tripped: 9,
    });
  });

  it("다른 탭의 일이 먼저 끝나도 이 탭의 표시는 남는다", () => {
    const storage = memoryStorage();
    const locks = fakeLocks();
    const a = createCrashSentinel({ storage, locks: locks.manager, tabId: "a" });
    const b = createCrashSentinel({ storage, locks: locks.manager, tabId: "b" });
    a.begin(9);
    b.begin(8);
    b.end();
    expect(run(storage, "a")?.level).toBe(9);
    expect(run(storage, "b")).toBeNull();
  });

  it("잠금을 못 쓰는 곳에서는 다른 탭의 남은 표시를 모두 꺼짐으로 본다(살아 있어도 알 길이 없다)", async () => {
    const storage = memoryStorage();
    createCrashSentinel({ storage, locks: null, tabId: "a" }).begin(9);
    await expect(createCrashSentinel({ storage, locks: null, tabId: "b" }).open()).resolves.toEqual({
      maxLevel: 8,
      tripped: 9,
    });
    // 잠금 조회가 실패해도 같다
    createCrashSentinel({ storage, locks: null, tabId: "c" }).begin(8);
    const failing: LockManagerLike = {
      request: () => Promise.resolve(),
      query: () => Promise.reject(new Error("SecurityError")),
    };
    await expect(createCrashSentinel({ storage, locks: failing, tabId: "d" }).open()).resolves.toEqual({
      maxLevel: 7,
      tripped: 8,
    });
  });
});

describe("꺼짐 감지: 페이지·저장소", () => {
  it("pagehide는 떠나는 것: 표시를 지우고 잠금을 놓고, 뒤로 가기 캐시에서 돌아오면 다시 남긴다", async () => {
    const storage = memoryStorage();
    const locks = fakeLocks();
    const sentinel = createCrashSentinel({ storage, locks: locks.manager, now: () => 7, tabId: "a" });
    const target = new EventTarget();
    const stop = watchPageLifecycle(target, sentinel);
    sentinel.begin(8);
    target.dispatchEvent(new Event("pagehide"));
    await Promise.resolve();
    expect(run(storage, "a")).toBeNull();
    expect(locks.held.size).toBe(0);
    target.dispatchEvent(new Event("pageshow"));
    expect(run(storage, "a")).toEqual({ level: 8, startedAt: 7 });
    expect(locks.held.has(runKey("a"))).toBe(true);
    sentinel.end();
    target.dispatchEvent(new Event("pageshow"));
    expect(run(storage, "a")).toBeNull();
    stop();
    sentinel.begin(9);
    target.dispatchEvent(new Event("pagehide"));
    expect(run(storage, "a")?.level).toBe(9);
  });

  it("저장소를 못 쓰면(던짐·없음) 던지지 않고 이번 실행 동안만 기억한다(꺼짐은 알 수 없다)", async () => {
    const throwing: StorageLike = {
      length: 0,
      key: () => {
        throw new Error("SecurityError");
      },
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    };
    for (const storage of [throwing, null]) {
      const sentinel = createCrashSentinel({ storage, locks: null });
      sentinel.begin(9);
      sentinel.end();
      await expect(sentinel.open()).resolves.toEqual({ maxLevel: null, tripped: null });
      sentinel.begin(9);
      await expect(sentinel.open()).resolves.toEqual({ maxLevel: null, tripped: null });
      sentinel.allowAgain();
      expect(sentinel.maxLevel()).toBeNull();
    }
  });
});
