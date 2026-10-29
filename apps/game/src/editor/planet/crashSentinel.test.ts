// 꺼짐 감지 시험 — 저장 모양, 열 때 남은 표시 → 기기 상한 한 단계 낮춤, F8 미만은 표시 없음, 이 탭이 남긴 것만 지움,
// pagehide·pageshow, 저장소를 못 쓸 때(던짐·없음)
import { describe, expect, it } from "vitest";
import {
  CRASH_SENTINEL_STORAGE_KEY,
  EMPTY_DEVICE_RECORD,
  SENTINEL_MIN_LEVEL,
  type StorageLike,
  createCrashSentinel,
  parseDeviceRecord,
  serializeDeviceRecord,
  settleOnOpen,
  watchPageLifecycle,
} from "./crashSentinel.ts";

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

const stored = (storage: { data: Map<string, string> }) =>
  parseDeviceRecord(storage.data.get(CRASH_SENTINEL_STORAGE_KEY) ?? null);

describe("기기 기록 모양", () => {
  it("쓰고 다시 읽으면 같다", () => {
    const record = { running: { level: 9, startedAt: 123 }, maxLevel: 8 };
    expect(parseDeviceRecord(serializeDeviceRecord(record))).toEqual(record);
    expect(JSON.parse(serializeDeviceRecord(EMPTY_DEVICE_RECORD))).toEqual({ v: 1 });
  });

  it("없음·깨짐·모르는 판·틀린 값은 빈 기록(틀린 칸만 버린다)", () => {
    expect(parseDeviceRecord(null)).toEqual(EMPTY_DEVICE_RECORD);
    expect(parseDeviceRecord("{oops")).toEqual(EMPTY_DEVICE_RECORD);
    expect(parseDeviceRecord(JSON.stringify({ v: 2, maxLevel: 7 }))).toEqual(EMPTY_DEVICE_RECORD);
    expect(parseDeviceRecord(JSON.stringify({ v: 1, maxLevel: "7", running: { level: 9 } }))).toEqual(
      EMPTY_DEVICE_RECORD,
    );
    expect(
      parseDeviceRecord(JSON.stringify({ v: 1, maxLevel: 7, running: { level: 1.5, startedAt: 1 } })),
    ).toEqual({
      running: null,
      maxLevel: 7,
    });
  });

  it("열 때: 남은 표시 → 상한을 그 레벨 − 1로(이미 낮으면 그대로)", () => {
    expect(settleOnOpen({ running: { level: 9, startedAt: 1 }, maxLevel: null })).toEqual({
      record: { running: null, maxLevel: 8 },
      tripped: 9,
    });
    expect(settleOnOpen({ running: { level: 9, startedAt: 1 }, maxLevel: 7 }).record.maxLevel).toBe(7);
    const clean = { running: null, maxLevel: 8 };
    expect(settleOnOpen(clean)).toEqual({ record: clean, tripped: null });
  });
});

describe("꺼짐 감지", () => {
  it("F8·F9만 표시를 남기고 끝나면 지운다", () => {
    const storage = memoryStorage();
    const sentinel = createCrashSentinel(storage, () => 500);
    sentinel.begin(SENTINEL_MIN_LEVEL - 1);
    expect(storage.data.size).toBe(0);
    sentinel.begin(9);
    expect(stored(storage).running).toEqual({ level: 9, startedAt: 500 });
    sentinel.end();
    expect(stored(storage).running).toBeNull();
  });

  it("탭이 꺼져 표시가 남으면 다음에 열 때 상한을 낮추고, 다시 허용으로 되돌린다", () => {
    const storage = memoryStorage();
    createCrashSentinel(storage).begin(9);
    // (탭이 꺼짐: end도 pagehide도 오지 않았다)
    const next = createCrashSentinel(storage);
    expect(next.open()).toEqual({ maxLevel: 8, tripped: 9 });
    expect(next.maxLevel()).toBe(8);
    expect(stored(storage).running).toBeNull();
    // 한 번 더 열어도 다시 낮추지 않는다
    expect(createCrashSentinel(storage).open()).toEqual({ maxLevel: 8, tripped: null });
    next.allowAgain();
    expect(next.maxLevel()).toBeNull();
  });

  it("이 탭이 남기지 않은 표시는 지우지 않는다(다른 탭이 F9를 돌리는 중)", () => {
    const storage = memoryStorage();
    createCrashSentinel(storage).begin(9);
    const other = createCrashSentinel(storage);
    other.begin(7);
    other.end();
    expect(stored(storage).running?.level).toBe(9);
  });

  it("pagehide는 떠나는 것: 표시를 지우고, 뒤로 가기 캐시에서 돌아오면 다시 남긴다", () => {
    const storage = memoryStorage();
    const sentinel = createCrashSentinel(storage, () => 7);
    const target = new EventTarget();
    const stop = watchPageLifecycle(target, sentinel);
    sentinel.begin(8);
    target.dispatchEvent(new Event("pagehide"));
    expect(stored(storage).running).toBeNull();
    target.dispatchEvent(new Event("pageshow"));
    expect(stored(storage).running).toEqual({ level: 8, startedAt: 7 });
    sentinel.end();
    target.dispatchEvent(new Event("pageshow"));
    expect(stored(storage).running).toBeNull();
    stop();
    sentinel.begin(9);
    target.dispatchEvent(new Event("pagehide"));
    expect(stored(storage).running?.level).toBe(9);
  });

  it("저장소를 못 쓰면 이번 실행 동안만 기억한다", () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    for (const storage of [throwing, null]) {
      const sentinel = createCrashSentinel(storage);
      sentinel.begin(9);
      sentinel.end();
      expect(sentinel.open()).toEqual({ maxLevel: null, tripped: null });
      sentinel.begin(9);
      // 저장소가 없으니 "다음에 열 때"는 이 기억(같은 객체)뿐이다
      expect(sentinel.open()).toEqual({ maxLevel: 8, tripped: 9 });
    }
  });
});
