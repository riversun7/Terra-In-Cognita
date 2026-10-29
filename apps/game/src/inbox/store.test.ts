// 처리할 일 저장소 시험 — 겹친 요청 하나로, 다시 받는 때(다시 연결·60초·바로 처리 뒤), 계정·시안 자료가 바뀔 때(ADR 2026-10-29-app-shell 6·7절)
import type { InboxListResponse } from "@terra/shared/inbox";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INBOX_RECONNECT_FRESH_MS, type InboxLoadResult, bellCount, createInboxStore } from "./store.ts";

const EMPTY: InboxListResponse = {
  generatedAt: 1,
  items: [],
  counts: { threat: 0, money_survival: 0, stalled: 0, decision: 0, done: 0 },
  badges: {},
};

const list = (generatedAt: number, counts: Partial<InboxListResponse["counts"]> = {}): InboxListResponse => ({
  ...EMPTY,
  generatedAt,
  counts: { ...EMPTY.counts, ...counts },
});

/** 시험용 요청: 부를 때마다 기다리는 약속을 하나 만들고, 시험이 골라서 답한다 */
function fakeLoads() {
  const calls: { preview: boolean; signal: AbortSignal; resolve: (result: InboxLoadResult) => void }[] = [];
  const load = (preview: boolean, signal: AbortSignal) =>
    new Promise<InboxLoadResult>((resolve) => {
      calls.push({ preview, signal, resolve });
      signal.addEventListener("abort", () =>
        resolve({ ok: false, error: "err_network", sessionEnded: false }),
      );
    });
  return { calls, load };
}

function setup() {
  const loads = fakeLoads();
  let viewer: { userId: string; preview: boolean } | null = { userId: "user_1", preview: false };
  let now = 1_000_000;
  let sessionChecks = 0;
  const store = createInboxStore({
    load: loads.load,
    viewer: () => viewer,
    now: () => now,
    onSessionEnded: () => {
      sessionChecks += 1;
    },
  });
  return {
    store,
    calls: loads.calls,
    setViewer: (next: typeof viewer) => {
      viewer = next;
    },
    advance: (ms: number) => {
      now += ms;
    },
    sessionChecks: () => sessionChecks,
  };
}

describe("처리할 일 저장소", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("로그인한 계정이면 받고, 받은 목록·시각을 둔다", async () => {
    const t = setup();
    t.store.sync();
    expect(t.store.getState()).toMatchObject({ userId: "user_1", status: "loading", data: null });
    expect(t.calls).toHaveLength(1);
    t.calls[0]?.resolve({ ok: true, data: list(5) });
    await vi.runAllTimersAsync();
    expect(t.store.getState()).toMatchObject({
      status: "ready",
      data: list(5),
      error: null,
      receivedAt: 1_000_000,
    });
  });

  it("겹친 요청은 하나로: 받는 중에 ensure를 여러 번 불러도 요청은 한 번이고 모두 같은 끝을 기다린다", async () => {
    const t = setup();
    const waits = [t.store.ensure(), t.store.ensure(), t.store.ensure()];
    expect(t.calls).toHaveLength(1);
    let done = 0;
    for (const wait of waits) void wait.then(() => (done += 1));
    t.calls[0]?.resolve({ ok: true, data: list(5) });
    await vi.runAllTimersAsync();
    expect(done).toBe(3);
    expect(t.calls).toHaveLength(1);
  });

  it("60초 안에는 ensure가 다시 받지 않고, 지나면 받는다(화면이 다시 보일 때)", async () => {
    const t = setup();
    void t.store.ensure();
    t.calls[0]?.resolve({ ok: true, data: list(5) });
    await vi.runAllTimersAsync();
    t.advance(60_000);
    void t.store.ensure();
    expect(t.calls).toHaveLength(1);
    t.advance(1);
    void t.store.ensure();
    expect(t.calls).toHaveLength(2);
  });

  it("refresh는 받는 중이면 끝난 뒤 한 번 더 받는다(바로 처리 결과를 받은 뒤 등)", async () => {
    const t = setup();
    void t.store.ensure();
    const refreshed = t.store.refresh();
    expect(t.calls).toHaveLength(1);
    t.calls[0]?.resolve({ ok: true, data: list(5) });
    // 시간을 흘리지 않고 이어진 일만 끝낸다(새 요청의 10초 끊기 타이머는 그대로 둔다)
    await vi.advanceTimersByTimeAsync(0);
    expect(t.calls).toHaveLength(2);
    t.calls[1]?.resolve({ ok: true, data: list(6) });
    await refreshed;
    expect(t.store.getState().data).toEqual(list(6));
  });

  it("다시 연결되면(끊김 뒤 준비) 다시 받는다. 처음 준비·끊김 없는 준비는 받지 않는다", async () => {
    const t = setup();
    void t.store.ensure();
    t.calls[0]?.resolve({ ok: true, data: list(5) });
    await vi.runAllTimersAsync();
    t.store.connectionReady();
    expect(t.calls).toHaveLength(1);
    t.advance(INBOX_RECONNECT_FRESH_MS + 1);
    t.store.connectionDown();
    t.store.connectionDown();
    t.store.connectionReady();
    expect(t.calls).toHaveLength(2);
    t.calls[1]?.resolve({ ok: true, data: list(6) });
    await vi.runAllTimersAsync();
    t.store.connectionReady();
    expect(t.calls).toHaveLength(2);
  });

  it("로그인 직후처럼 5초 안에 시작한 받기가 있으면(받는 중·막 받음) 다시 맺은 연결로 또 받지 않는다", async () => {
    const t = setup();
    // 받는 중에 끊김 → 준비(계정이 바뀌어 연결을 다시 맺음): 받는 중인 요청 하나뿐
    t.store.sync();
    t.advance(200);
    t.store.connectionDown();
    t.store.connectionReady();
    expect(t.calls).toHaveLength(1);
    t.calls[0]?.resolve({ ok: true, data: list(5) });
    await vi.runAllTimersAsync();
    expect(t.calls).toHaveLength(1);
    // 막 받은 뒤(그 요청을 시작한 지 5초 안)의 다시 연결도 받지 않는다
    t.advance(INBOX_RECONNECT_FRESH_MS - 200);
    t.store.connectionDown();
    t.store.connectionReady();
    expect(t.calls).toHaveLength(1);
    // 5초가 지난 뒤의 끊김은 진짜 끊김으로 본다
    t.advance(1);
    t.store.connectionDown();
    t.store.connectionReady();
    expect(t.calls).toHaveLength(2);
  });

  it("다시 연결됐을 때 마지막 받기가 실패였거나 오래 멈춘 요청이면 다시 받는다", async () => {
    const t = setup();
    void t.store.ensure();
    t.calls[0]?.resolve({ ok: false, error: "err_network", sessionEnded: false });
    await vi.advanceTimersByTimeAsync(0);
    t.store.connectionDown();
    t.store.connectionReady();
    expect(t.calls).toHaveLength(2);
    // 6초째 받는 중인 요청: 끝난 뒤 한 번 더 받는다
    t.advance(6_000);
    t.store.connectionDown();
    t.store.connectionReady();
    expect(t.calls).toHaveLength(2);
    t.calls[1]?.resolve({ ok: true, data: list(5) });
    await vi.advanceTimersByTimeAsync(0);
    expect(t.calls).toHaveLength(3);
  });

  it("계정이 바뀌면 비우고 새 계정 것을 받는다. 늦게 온 옛 계정 응답은 버린다", async () => {
    const t = setup();
    t.store.sync();
    t.setViewer({ userId: "user_2", preview: false });
    t.store.sync();
    expect(t.calls[0]?.signal.aborted).toBe(true);
    expect(t.store.getState()).toMatchObject({ userId: "user_2", status: "loading", data: null });
    t.calls[0]?.resolve({ ok: true, data: list(1) });
    t.calls[1]?.resolve({ ok: true, data: list(2) });
    await vi.runAllTimersAsync();
    expect(t.store.getState()).toMatchObject({ userId: "user_2", data: list(2) });
  });

  it("로그아웃하면 비우고 받지 않는다", async () => {
    const t = setup();
    void t.store.ensure();
    t.calls[0]?.resolve({ ok: true, data: list(5, { threat: 2 }) });
    await vi.runAllTimersAsync();
    t.setViewer(null);
    t.store.sync();
    expect(t.store.getState()).toEqual({
      userId: null,
      preview: false,
      status: "idle",
      data: null,
      error: null,
      receivedAt: null,
    });
    await t.store.ensure();
    await t.store.refresh();
    expect(t.calls).toHaveLength(1);
  });

  it("시안 자료를 켜면 앞 목록을 비우고 preview로 다시 묻는다", async () => {
    const t = setup();
    void t.store.ensure();
    t.calls[0]?.resolve({ ok: true, data: list(5) });
    await vi.runAllTimersAsync();
    t.setViewer({ userId: "user_1", preview: true });
    t.store.sync();
    expect(t.calls.map((call) => call.preview)).toEqual([false, true]);
    expect(t.store.getState()).toMatchObject({ preview: true, data: null, status: "loading" });
  });

  it("실패하면 앞 목록을 남기고 문구 키를 둔다. 로그인이 끝났으면 세션을 다시 확인한다", async () => {
    const t = setup();
    void t.store.ensure();
    t.calls[0]?.resolve({ ok: true, data: list(5) });
    await vi.runAllTimersAsync();
    void t.store.refresh();
    t.calls[1]?.resolve({ ok: false, error: "err_server", sessionEnded: false });
    await vi.runAllTimersAsync();
    expect(t.store.getState()).toMatchObject({ status: "failed", data: list(5), error: "err_server" });
    expect(t.sessionChecks()).toBe(0);
    void t.store.refresh();
    t.calls[2]?.resolve({ ok: false, error: "auth_notice_session_ended", sessionEnded: true });
    await vi.runAllTimersAsync();
    expect(t.sessionChecks()).toBe(1);
  });

  it("응답이 10초 넘게 없으면 끊고 연결 실패로 둔다(겹친 요청이 영영 기다리지 않게)", async () => {
    const t = setup();
    void t.store.ensure();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(t.calls[0]?.signal.aborted).toBe(true);
    expect(t.store.getState()).toMatchObject({ status: "failed", error: "err_network" });
    void t.store.ensure();
    expect(t.calls).toHaveLength(2);
  });

  it("바뀔 때마다 듣는 쪽에 알린다", async () => {
    const t = setup();
    const seen: string[] = [];
    const stop = t.store.subscribe(() => seen.push(t.store.getState().status));
    void t.store.ensure();
    t.calls[0]?.resolve({ ok: true, data: list(5) });
    await vi.runAllTimersAsync();
    stop();
    void t.store.refresh();
    expect(seen).toEqual(["loading", "ready"]);
  });
});

describe("종 배지", () => {
  it("완료를 뺀 줄 수(묶음은 1줄, D-6006 해석: 완료는 확인할 소식)", () => {
    expect(bellCount(null)).toBe(0);
    expect(bellCount(list(1, { threat: 2, money_survival: 1, stalled: 3, decision: 1, done: 4 }))).toBe(7);
    expect(bellCount(list(1, { done: 4 }))).toBe(0);
  });
});
