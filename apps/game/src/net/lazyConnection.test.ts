// 연결 모듈 지연 로딩 시험 — 받은 뒤에 연결하고, 받기 전에 멈추거나 새로고침하면 열지 않고, 받기에 실패하면 간격을 늘리며 다시 받는다
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectOptions, ConnectionStatus } from "./connection.ts";
import { type ConnectionModule, createLazyConnection } from "./lazyConnection.ts";

/** 받는 중인 모듈 하나 — 시험이 밖에서 받게(resolve) 하거나 실패하게(reject) 한다 */
interface PendingLoad {
  resolve(module: ConnectionModule): void;
  reject(reason: unknown): void;
}

/** 기다리던 약속 처리(then)가 다 돌게 한다 */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

function fakeModule() {
  const stop = vi.fn();
  const connect = vi.fn((_onStatus: (status: ConnectionStatus) => void, _options?: ConnectOptions) => stop);
  const closeForReload = vi.fn();
  const module: ConnectionModule = { connect, closeForReload };
  return { module, connect, stop, closeForReload };
}

function setup() {
  const loads: PendingLoad[] = [];
  const delays: number[] = [];
  const lazy = createLazyConnection({
    load: () =>
      new Promise<ConnectionModule>((resolve, reject) => {
        loads.push({ resolve, reject });
      }),
    setTimer: (run, ms) => {
      delays.push(ms);
      return setTimeout(run, ms);
    },
    clearTimer: (handle) => clearTimeout(handle),
  });
  return { lazy, loads, delays };
}

const onStatus = (): void => undefined;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("연결 모듈 지연 로딩", () => {
  it("모듈을 받은 뒤에 같은 인자로 연결하고, 멈추면 연결을 멈춘다", async () => {
    const { lazy, loads } = setup();
    const fake = fakeModule();
    const options = { onWelcome: () => undefined };
    const stop = lazy.connect(onStatus, options);
    expect(loads).toHaveLength(1);
    expect(fake.connect).not.toHaveBeenCalled();

    loads[0]?.resolve(fake.module);
    await settle();
    expect(fake.connect).toHaveBeenCalledExactlyOnceWith(onStatus, options);

    stop();
    expect(fake.stop).toHaveBeenCalledOnce();
  });

  it("받기 전에 멈추면 받은 뒤에도 연결하지 않는다", async () => {
    const { lazy, loads } = setup();
    const fake = fakeModule();
    const stop = lazy.connect(onStatus);
    stop();
    loads[0]?.resolve(fake.module);
    await settle();
    expect(fake.connect).not.toHaveBeenCalled();
  });

  it("받기 전에 새로고침하면 연결하지 않는다", async () => {
    const { lazy, loads } = setup();
    const fake = fakeModule();
    lazy.connect(onStatus);
    lazy.closeForReload();
    loads[0]?.resolve(fake.module);
    await settle();
    expect(fake.connect).not.toHaveBeenCalled();
  });

  it("받은 뒤의 새로고침은 연결 모듈의 정상 종료를 부른다", async () => {
    const { lazy, loads } = setup();
    const fake = fakeModule();
    lazy.connect(onStatus);
    loads[0]?.resolve(fake.module);
    await settle();
    lazy.closeForReload();
    expect(fake.closeForReload).toHaveBeenCalledOnce();
  });

  it("받기에 실패하면 간격을 늘리며(상한 15초) 다시 받고, 받으면 연결한다", async () => {
    const { lazy, loads, delays } = setup();
    const fake = fakeModule();
    lazy.connect(onStatus);
    for (let i = 0; i < 7; i++) {
      loads[i]?.reject(new Error("chunk"));
      await settle();
      expect(loads).toHaveLength(i + 1);
      vi.advanceTimersByTime(delays[i] ?? 0);
    }
    expect(delays).toEqual([500, 1_000, 2_000, 4_000, 8_000, 15_000, 15_000]);
    expect(loads).toHaveLength(8);
    loads[7]?.resolve(fake.module);
    await settle();
    expect(fake.connect).toHaveBeenCalledOnce();
  });

  it("다시 받기를 기다리는 중에 멈추면 기다림을 지우고 다시 받지 않는다", async () => {
    const { lazy, loads, delays } = setup();
    const stop = lazy.connect(onStatus);
    loads[0]?.reject(new Error("chunk"));
    await settle();
    expect(delays).toEqual([500]);
    expect(vi.getTimerCount()).toBe(1);
    stop();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(loads).toHaveLength(1);
  });
});
