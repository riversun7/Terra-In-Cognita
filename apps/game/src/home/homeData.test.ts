// 홈 자료 저장소 시험 — 같은 틱에 한 번씩 부르기, 바뀐 부분만 다시 받기, 늦은 응답 버리기, 실패는 문구 키, 로그인 끝남,
// 다시 받는 때(연결·다시 보임). 처리할 일은 이 저장소가 받지 않는다(처리할 일 저장소, useHomeData.ts의 inboxPart).
import type { DashboardCardsResponse, ServerCardId } from "@terra/shared/dashboard";
import type { InboxListResponse, SummaryGetResponse } from "@terra/shared/inbox";
import { describe, expect, it } from "vitest";
import {
  type HomeSource,
  REFETCH_AFTER_HIDDEN_MS,
  type RefetchEnv,
  attachRefetch,
  createHomeDataStore,
  inboxPart,
} from "./homeData.ts";
import type { HomeNeeds } from "./homeView.ts";
import type { HomeQueryResult } from "./inboxParts.ts";

interface Deferred<T> {
  resolve(value: HomeQueryResult<T>): void;
  reject(error: unknown): void;
}

/** 부른 것을 적고, 답은 시험이 직접 푼다(부분마다 줄) */
function fakeSource() {
  const calls: { name: string; request: unknown }[] = [];
  const cards: Deferred<DashboardCardsResponse>[] = [];
  const summary: Deferred<SummaryGetResponse>[] = [];
  const defer = <T>(queue: Deferred<T>[], name: string, request: unknown): Promise<HomeQueryResult<T>> =>
    new Promise<HomeQueryResult<T>>((resolve, reject) => {
      calls.push({ name, request });
      queue.push({ resolve, reject });
    });
  const source: HomeSource = {
    dashboardCards: (ids: readonly ServerCardId[], preview: boolean) =>
      defer(cards, "cards", { ids, preview }),
    summary: (preview: boolean) => defer(summary, "summary", { preview }),
  };
  return { source, calls, cards, summary };
}

const cardsOk = (count: number): HomeQueryResult<DashboardCardsResponse> => ({
  ok: true,
  data: { cards: Array.from({ length: count }, () => ({ id: "cyborg", status: "not_ready" as const })) },
});

const needs = (overrides: Partial<HomeNeeds> = {}): HomeNeeds => ({
  serverCardIds: ["cyborg", "units"],
  summary: false,
  preview: false,
  ...overrides,
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createHomeDataStore", () => {
  it("처음 고르기에 필요한 조회를 같은 틱에 한 번씩 부른다", () => {
    const fake = fakeSource();
    const store = createHomeDataStore(fake.source, { now: () => 1_000 });
    store.ensure(needs({ summary: true }));
    // ensure 안에서(기다리지 않고) 모두 불렀다 = 같은 틱 → httpBatchLink가 요청 하나로 묶는다
    expect(fake.calls.map((call) => call.name)).toEqual(["cards", "summary"]);
    expect(fake.calls[0]?.request).toEqual({ ids: ["cyborg", "units"], preview: false });
    expect(store.getSnapshot().cards.status).toBe("loading");
    expect(store.lastFetchAt()).toBe(1_000);
  });

  it("서버 카드가 없으면 dashboard.cards를 묻지 않고, 부관 보고가 없으면 summary.get을 묻지 않는다", () => {
    const fake = fakeSource();
    const store = createHomeDataStore(fake.source);
    store.ensure(needs({ serverCardIds: [] }));
    expect(fake.calls).toEqual([]);
    expect(store.getSnapshot().cards).toEqual({ status: "ready", value: { cards: [] } });
    expect(store.getSnapshot().summary.status).toBe("idle");
    expect(store.lastFetchAt()).toBeNull();
  });

  it("같은 고르기를 다시 주면 부르지 않고, 바뀐 부분만 부른다", () => {
    const fake = fakeSource();
    const store = createHomeDataStore(fake.source);
    store.ensure(needs());
    store.ensure(needs());
    expect(fake.calls).toHaveLength(1);
    store.ensure(needs({ serverCardIds: ["assets", "cyborg", "units"] }));
    expect(fake.calls.map((call) => call.name)).toEqual(["cards", "cards"]);
    store.ensure(needs({ serverCardIds: ["assets", "cyborg", "units"], summary: true }));
    expect(fake.calls.at(-1)?.name).toBe("summary");
    // 시안 자료를 켜면 둘 다 preview로 다시 부른다
    store.ensure(needs({ serverCardIds: ["assets", "cyborg", "units"], summary: true, preview: true }));
    expect(fake.calls.slice(-2).map((call) => [call.name, call.request])).toEqual([
      ["cards", { ids: ["assets", "cyborg", "units"], preview: true }],
      ["summary", { preview: true }],
    ]);
  });

  it("늦게 온 앞 요청의 답은 버리고, 다시 받는 동안 앞 값을 남긴다", async () => {
    const fake = fakeSource();
    const store = createHomeDataStore(fake.source);
    store.ensure(needs());
    fake.cards.shift()?.resolve(cardsOk(1));
    await flush();
    expect(store.getSnapshot().cards).toEqual({
      status: "ready",
      value: { cards: [{ id: "cyborg", status: "not_ready" }] },
    });

    store.ensure(needs({ preview: true }));
    expect(store.getSnapshot().cards.status).toBe("loading");
    expect(store.getSnapshot().cards.value?.cards).toHaveLength(1);
    store.ensure(needs());
    // 시안 자료 요청(앞)이 늦게 와도 지금 요청(시안 자료 끔)의 자리를 덮지 않는다
    fake.cards.shift()?.resolve(cardsOk(2));
    await flush();
    expect(store.getSnapshot().cards.status).toBe("loading");
    fake.cards.shift()?.resolve(cardsOk(3));
    await flush();
    expect(store.getSnapshot().cards.value?.cards).toHaveLength(3);
  });

  it("실패는 문구 키로 남기고 앞 값을 지킨다. 던지면 err_unknown. refresh는 지금 고르기로 모두 다시 부른다", async () => {
    const fake = fakeSource();
    const store = createHomeDataStore(fake.source);
    store.ensure(needs({ summary: true }));
    fake.cards.shift()?.resolve({ ok: false, error: "err_network", sessionEnded: false });
    fake.summary.shift()?.reject(new Error("chunk"));
    await flush();
    expect(store.getSnapshot().cards).toEqual({ status: "failed", value: null, error: "err_network" });
    expect(store.getSnapshot().summary).toEqual({ status: "failed", value: null, error: "err_unknown" });
    expect(store.hasFailure()).toBe(true);
    store.refresh();
    expect(fake.calls.map((call) => call.name)).toEqual(["cards", "summary", "cards", "summary"]);
    fake.cards.shift()?.resolve(cardsOk(1));
    fake.summary.shift()?.resolve({ ok: true, data: { show: false, since: null, until: 1, sections: [] } });
    await flush();
    expect(store.hasFailure()).toBe(false);
  });

  it("서버가 로그인이 끝났다고 답하면 세션을 다시 확인한다", async () => {
    const fake = fakeSource();
    let ended = 0;
    const store = createHomeDataStore(fake.source, {
      onSessionEnded: () => {
        ended += 1;
      },
    });
    store.ensure(needs());
    fake.cards.shift()?.resolve({ ok: false, error: "auth_notice_session_ended", sessionEnded: true });
    await flush();
    expect(ended).toBe(1);
    expect(store.getSnapshot().cards.status).toBe("failed");
  });

  it("바뀔 때만 알린다", async () => {
    const fake = fakeSource();
    const store = createHomeDataStore(fake.source);
    let notified = 0;
    const stop = store.subscribe(() => {
      notified += 1;
    });
    store.ensure(needs());
    const afterStart = notified;
    store.ensure(needs());
    expect(notified).toBe(afterStart);
    fake.cards.shift()?.resolve(cardsOk(1));
    await flush();
    expect(notified).toBe(afterStart + 1);
    stop();
  });
});

describe("inboxPart", () => {
  const list: InboxListResponse = {
    generatedAt: 5,
    items: [],
    counts: { threat: 0, money_survival: 0, stalled: 0, decision: 0, done: 0 },
    badges: {},
  };
  const base = { userId: "u1", preview: false, receivedAt: null, error: null, data: null } as const;

  it("처리할 일 저장소의 상태를 홈 부분으로: 받는 중·실패에도 앞 목록을 남기고, 실패는 문구 키", () => {
    expect(inboxPart({ ...base, status: "idle" })).toEqual({ status: "idle", value: null });
    expect(inboxPart({ ...base, status: "loading", data: list })).toEqual({ status: "loading", value: list });
    expect(inboxPart({ ...base, status: "ready", data: list })).toEqual({ status: "ready", value: list });
    expect(inboxPart({ ...base, status: "failed", data: list, error: "err_network" })).toEqual({
      status: "failed",
      value: list,
      error: "err_network",
    });
    // 목록 없이 ready(있을 수 없는 값)는 받기 전으로 본다
    expect(inboxPart({ ...base, status: "ready" })).toEqual({ status: "idle", value: null });
  });
});

/** 연결 알림·다시 보임을 시험이 직접 일으키는 가짜 환경 */
function env() {
  let linkListener: ((event: { kind: string }) => void) | null = null;
  let visibleListener: (() => void) | null = null;
  let time = 0;
  const value: RefetchEnv = {
    listen(listener) {
      linkListener = listener;
      return () => {
        linkListener = null;
      };
    },
    onVisible(listener) {
      visibleListener = listener;
      return () => {
        visibleListener = null;
      };
    },
    now: () => time,
  };
  return {
    value,
    link: (kind: string) => linkListener?.({ kind }),
    visible: () => visibleListener?.(),
    setTime: (next: number) => {
      time = next;
    },
    attached: () => linkListener !== null && visibleListener !== null,
  };
}

describe("attachRefetch", () => {
  it("앱을 켠 뒤 처음 맺은 연결로는 다시 받지 않고, 끊겼다가 다시 맺으면 다시 받는다", () => {
    const fake = fakeSource();
    const store = createHomeDataStore(fake.source, { now: () => 0 });
    store.ensure(needs());
    const fakeEnv = env();
    const stop = attachRefetch(store, fakeEnv.value);
    fakeEnv.link("ready");
    expect(fake.calls).toHaveLength(1);
    fakeEnv.link("down");
    fakeEnv.link("ready");
    expect(fake.calls).toHaveLength(2);
    // 한 번 다시 받은 뒤의 ready는 다시 받지 않는다
    fakeEnv.link("ready");
    expect(fake.calls).toHaveLength(2);
    stop();
    expect(fakeEnv.attached()).toBe(false);
  });

  it("실패한 부분이 있으면 연결이 맺어질 때 다시 받는다", async () => {
    const fake = fakeSource();
    const store = createHomeDataStore(fake.source, { now: () => 0 });
    store.ensure(needs());
    fake.cards.shift()?.resolve({ ok: false, error: "err_network", sessionEnded: false });
    await flush();
    const fakeEnv = env();
    attachRefetch(store, fakeEnv.value);
    fakeEnv.link("ready");
    expect(fake.calls).toHaveLength(2);
  });

  it("다시 보일 때는 마지막으로 받은 지 60초가 넘었을 때만 다시 받는다", () => {
    const fake = fakeSource();
    let time = 10_000;
    const store = createHomeDataStore(fake.source, { now: () => time });
    store.ensure(needs());
    const fakeEnv = env();
    attachRefetch(store, fakeEnv.value);
    fakeEnv.setTime(10_000 + REFETCH_AFTER_HIDDEN_MS);
    fakeEnv.visible();
    expect(fake.calls).toHaveLength(1);
    fakeEnv.setTime(10_001 + REFETCH_AFTER_HIDDEN_MS);
    time = 10_001 + REFETCH_AFTER_HIDDEN_MS;
    fakeEnv.visible();
    expect(fake.calls).toHaveLength(2);
    expect(store.lastFetchAt()).toBe(time);
  });
});
