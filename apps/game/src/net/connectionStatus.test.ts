// 연결 상태 저장소 시험 — 2초 넘게 연결되지 않으면 연결 줄(lost), 다시 연결되면 내린다(ADR 2026-10-29-app-shell 3절)
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectOptions, ConnectionStatus } from "./connection.ts";
import { LOST_NOTICE_DELAY_MS, createConnectionStore } from "./connectionStatus.ts";

const ignore = (): void => undefined;

function setup() {
  let report: (status: ConnectionStatus) => void = ignore;
  let options: ConnectOptions | undefined;
  const stop = vi.fn();
  const store = createConnectionStore({
    connect(onStatus, given) {
      report = onStatus;
      options = given;
      return stop;
    },
    setTimer: (run, ms) => setTimeout(run, ms),
    clearTimer: (handle) => clearTimeout(handle),
  });
  const changes = vi.fn();
  store.subscribe(changes);
  return {
    store,
    report: (status: ConnectionStatus) => report(status),
    options: () => options,
    stop,
    changes,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("연결 상태 저장소", () => {
  it("처음에는 연결 중이고, 2초 안에 연결되면 연결 줄을 띄우지 않는다", () => {
    const { store, report } = setup();
    store.start();
    expect(store.getSnapshot()).toEqual({ status: { kind: "connecting" }, lost: false });
    vi.advanceTimersByTime(LOST_NOTICE_DELAY_MS - 1);
    report({ kind: "connected", clock: null });
    vi.advanceTimersByTime(LOST_NOTICE_DELAY_MS);
    expect(store.getSnapshot()).toEqual({ status: { kind: "connected", clock: null }, lost: false });
  });

  it("서버에 닿지 못한 채 2초가 넘으면 lost(처음 연결 중도 센다)", () => {
    const { store, changes } = setup();
    store.start();
    vi.advanceTimersByTime(LOST_NOTICE_DELAY_MS);
    expect(store.getSnapshot().lost).toBe(true);
    expect(changes).toHaveBeenCalledTimes(1);
  });

  it("끊김 → 다시 연결 중이 이어지면 처음 끊긴 때부터 세고, 연결되면 바로 내린다", () => {
    const { store, report } = setup();
    store.start();
    report({ kind: "connected", clock: null });
    report({ kind: "disconnected" });
    vi.advanceTimersByTime(1_500);
    report({ kind: "connecting" });
    vi.advanceTimersByTime(600);
    expect(store.getSnapshot()).toEqual({ status: { kind: "connecting" }, lost: true });
    report({ kind: "disconnected" });
    expect(store.getSnapshot().lost).toBe(true);
    report({ kind: "connected", clock: null });
    expect(store.getSnapshot().lost).toBe(false);
    // 다시 끊기면 다시 2초를 센다
    report({ kind: "disconnected" });
    vi.advanceTimersByTime(LOST_NOTICE_DELAY_MS - 1);
    expect(store.getSnapshot().lost).toBe(false);
    vi.advanceTimersByTime(1);
    expect(store.getSnapshot().lost).toBe(true);
  });

  it("서버 거절은 lost가 아니다(거절 안내가 따로 알린다). 시작은 한 번, welcome 콜백을 넘긴다", () => {
    const { store, report, options, stop } = setup();
    const onWelcome = vi.fn();
    const onStatus = vi.fn();
    store.start({ onWelcome, onStatus });
    store.start({ onWelcome });
    expect(options()?.onWelcome).toBe(onWelcome);
    report({ kind: "rejected", code: "protocol_unsupported" });
    vi.advanceTimersByTime(LOST_NOTICE_DELAY_MS * 2);
    expect(store.getSnapshot()).toEqual({
      status: { kind: "rejected", code: "protocol_unsupported" },
      lost: false,
    });
    expect(onStatus).toHaveBeenCalledWith({ kind: "rejected", code: "protocol_unsupported" });
    store.stop();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
