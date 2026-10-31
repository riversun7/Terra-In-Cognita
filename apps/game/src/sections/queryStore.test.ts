// 화면 조회 저장소 시험 — 같은 시안 여부면 다시 받지 않음, 바뀌면 다시 받음, 늦은 답 버림, 실패에도 앞 값, 세션 끝 알림
import { describe, expect, it } from "vitest";
import { type QueryResult, createQueryStore } from "./queryStore.ts";

/** 부른 순서대로 답을 손으로 넣는 가짜 조회 */
function fakeLoad<T>() {
  const calls: { preview: boolean; resolve: (result: QueryResult<T>) => void }[] = [];
  const load = (preview: boolean) =>
    new Promise<QueryResult<T>>((resolve) => {
      calls.push({ preview, resolve });
    });
  return { calls, load };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("화면 조회 저장소", () => {
  it("처음 ensure는 받고, 같은 시안 여부면 다시 받지 않고, 바뀌면 다시 받는다", async () => {
    const { calls, load } = fakeLoad<string>();
    const store = createQueryStore(load, { now: () => 5 });
    expect(store.getSnapshot()).toEqual({ status: "idle", data: null, error: null });
    store.ensure(false);
    store.ensure(false);
    expect(calls.map((call) => call.preview)).toEqual([false]);
    expect(store.getSnapshot().status).toBe("loading");
    expect(store.lastFetchAt()).toBe(5);
    calls[0]?.resolve({ ok: true, data: "real" });
    await tick();
    expect(store.getSnapshot()).toEqual({ status: "ready", data: "real", error: null });
    store.ensure(true);
    expect(calls.map((call) => call.preview)).toEqual([false, true]);
    // 다시 받는 동안 앞 값을 그대로 보인다
    expect(store.getSnapshot()).toEqual({ status: "loading", data: "real", error: null });
  });

  it("늦게 온 앞 요청의 답은 버린다", async () => {
    const { calls, load } = fakeLoad<string>();
    const store = createQueryStore(load);
    store.ensure(false);
    store.ensure(true);
    calls[1]?.resolve({ ok: true, data: "preview" });
    await tick();
    calls[0]?.resolve({ ok: true, data: "stale" });
    await tick();
    expect(store.getSnapshot().data).toBe("preview");
  });

  it("실패는 문구 키로, 앞 값은 남기고, 세션이 끝났으면 알린다. refresh는 같은 시안 여부로 다시", async () => {
    const { calls, load } = fakeLoad<string>();
    let ended = 0;
    const store = createQueryStore(load, { onSessionEnded: () => (ended += 1) });
    store.refresh();
    expect(calls).toHaveLength(0);
    store.ensure(true);
    calls[0]?.resolve({ ok: true, data: "first" });
    await tick();
    store.refresh();
    calls[1]?.resolve({ ok: false, error: "auth_notice_session_ended", sessionEnded: true });
    await tick();
    expect(store.getSnapshot()).toEqual({
      status: "failed",
      data: "first",
      error: "auth_notice_session_ended",
    });
    expect(ended).toBe(1);
    expect(calls.map((call) => call.preview)).toEqual([true, true]);
  });

  it("조회가 던지면 err_unknown 실패", async () => {
    const store = createQueryStore<string>(() => Promise.reject(new Error("boom")));
    store.ensure(false);
    await tick();
    expect(store.getSnapshot()).toMatchObject({ status: "failed", error: "err_unknown" });
  });

  it("알림은 바뀔 때마다, 그만 들으면 오지 않는다", async () => {
    const { calls, load } = fakeLoad<string>();
    const store = createQueryStore(load);
    let heard = 0;
    const stop = store.subscribe(() => (heard += 1));
    store.ensure(false);
    expect(heard).toBe(1);
    stop();
    calls[0]?.resolve({ ok: true, data: "x" });
    await tick();
    expect(heard).toBe(1);
  });
});
