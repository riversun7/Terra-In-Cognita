// 홈 자료 저장소 시험 — 같은 틱에 한 번씩 부르기, 바뀐 부분만 다시 받기, 늦은 응답 버리기, 다시 받는 때(연결·다시 보임)
import type { DashboardCardsRequest, DashboardCardsResponse } from "@terra/shared/dashboard";
import type {
  InboxListRequest,
  InboxListResponse,
  SummaryGetRequest,
  SummaryGetResponse,
} from "@terra/shared/inbox";
import { describe, expect, it } from "vitest";
import {
  type HomeSource,
  REFETCH_AFTER_HIDDEN_MS,
  type RefetchEnv,
  attachRefetch,
  createHomeDataStore,
} from "./homeData.ts";
import type { HomeNeeds } from "./homeView.ts";

const EMPTY_COUNTS = { threat: 0, money_survival: 0, stalled: 0, decision: 0, done: 0 };

interface Deferred<T> {
  resolve(value: T): void;
  reject(error: unknown): void;
}

/** 부른 것을 적고, 답은 시험이 직접 푼다(부분마다 줄) */
function fakeSource() {
  const calls: { name: string; request: unknown }[] = [];
  const inbox: Deferred<InboxListResponse>[] = [];
  const cards: Deferred<DashboardCardsResponse>[] = [];
  const summary: Deferred<SummaryGetResponse>[] = [];
  const defer = <T>(queue: Deferred<T>[], name: string, request: unknown): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      calls.push({ name, request });
      queue.push({ resolve, reject });
    });
  const source: HomeSource = {
    inboxList: (request: InboxListRequest) => defer(inbox, "inbox", request),
    dashboardCards: (request: DashboardCardsRequest) => defer(cards, "cards", request),
    summaryGet: (request: SummaryGetRequest) => defer(summary, "summary", request),
  };
  return { source, calls, inbox, cards, summary };
}

const inboxResponse = (generatedAt: number): InboxListResponse => ({
  generatedAt,
  items: [],
  counts: EMPTY_COUNTS,
  badges: {},
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
    const store = createHomeDataStore(fake.source, () => 1_000);
    store.ensure(needs({ summary: true }));
    // ensure 안에서(기다리지 않고) 모두 불렀다 = 같은 틱 → httpBatchLink가 요청 하나로 묶는다
    expect(fake.calls.map((call) => call.name)).toEqual(["inbox", "cards", "summary"]);
    expect(fake.calls[1]?.request).toEqual({ ids: ["cyborg", "units"] });
    expect(store.getSnapshot().inbox.status).toBe("loading");
    expect(store.lastFetchAt()).toBe(1_000);
  });

  it("서버 카드가 없으면 dashboard.cards를 묻지 않고, 부관 보고가 없으면 summary.get을 묻지 않는다", () => {
    const fake = fakeSource();
    const store = createHomeDataStore(fake.source);
    store.ensure(needs({ serverCardIds: [] }));
    expect(fake.calls.map((call) => call.name)).toEqual(["inbox"]);
    expect(store.getSnapshot().cards).toEqual({ status: "ready", value: { cards: [] } });
    expect(store.getSnapshot().summary.status).toBe("idle");
  });

  it("같은 고르기를 다시 주면 부르지 않고, 바뀐 부분만 부른다", () => {
    const fake = fakeSource();
    const store = createHomeDataStore(fake.source);
    store.ensure(needs());
    store.ensure(needs());
    expect(fake.calls).toHaveLength(2);
    store.ensure(needs({ serverCardIds: ["assets", "cyborg", "units"] }));
    expect(fake.calls.map((call) => call.name)).toEqual(["inbox", "cards", "cards"]);
    store.ensure(needs({ serverCardIds: ["assets", "cyborg", "units"], summary: true }));
    expect(fake.calls.at(-1)?.name).toBe("summary");
    // 시안 자료를 켜면 모두 preview로 다시 부른다
    store.ensure(needs({ serverCardIds: ["assets", "cyborg", "units"], summary: true, preview: true }));
    expect(fake.calls.slice(-3).map((call) => [call.name, call.request])).toEqual([
      ["inbox", { preview: true }],
      ["cards", { ids: ["assets", "cyborg", "units"], preview: true }],
      ["summary", { preview: true }],
    ]);
  });

  it("늦게 온 앞 요청의 답은 버리고, 다시 받는 동안 앞 값을 남긴다", async () => {
    const fake = fakeSource();
    const store = createHomeDataStore(fake.source);
    store.ensure(needs({ serverCardIds: [] }));
    fake.inbox.shift()?.resolve(inboxResponse(1));
    await flush();
    expect(store.getSnapshot().inbox).toEqual({ status: "ready", value: inboxResponse(1) });

    store.ensure(needs({ serverCardIds: [], preview: true }));
    expect(store.getSnapshot().inbox).toEqual({ status: "loading", value: inboxResponse(1) });
    store.ensure(needs({ serverCardIds: [] }));
    // 시안 자료 요청(앞)이 늦게 와도 지금 요청(시안 자료 끔)의 자리를 덮지 않는다
    fake.inbox.shift()?.resolve(inboxResponse(2));
    await flush();
    expect(store.getSnapshot().inbox.status).toBe("loading");
    fake.inbox.shift()?.resolve(inboxResponse(3));
    await flush();
    expect(store.getSnapshot().inbox).toEqual({ status: "ready", value: inboxResponse(3) });
  });

  it("실패하면 앞 값을 남기고 failed가 된다. refresh는 지금 고르기로 모두 다시 부른다", async () => {
    const fake = fakeSource();
    const store = createHomeDataStore(fake.source);
    store.ensure(needs({ serverCardIds: [] }));
    fake.inbox.shift()?.reject(new Error("offline"));
    await flush();
    expect(store.getSnapshot().inbox.status).toBe("failed");
    expect(store.hasFailure()).toBe(true);
    store.refresh();
    expect(fake.calls.map((call) => call.name)).toEqual(["inbox", "inbox"]);
    fake.inbox.shift()?.resolve(inboxResponse(5));
    await flush();
    expect(store.hasFailure()).toBe(false);
  });

  it("바뀔 때만 알린다", async () => {
    const fake = fakeSource();
    const store = createHomeDataStore(fake.source);
    let notified = 0;
    const stop = store.subscribe(() => {
      notified += 1;
    });
    store.ensure(needs({ serverCardIds: [] }));
    const afterStart = notified;
    store.ensure(needs({ serverCardIds: [] }));
    expect(notified).toBe(afterStart);
    fake.inbox.shift()?.resolve(inboxResponse(1));
    await flush();
    expect(notified).toBe(afterStart + 1);
    stop();
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
    const store = createHomeDataStore(fake.source, () => 0);
    store.ensure(needs({ serverCardIds: [] }));
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
    const store = createHomeDataStore(fake.source, () => 0);
    store.ensure(needs({ serverCardIds: [] }));
    fake.inbox.shift()?.reject(new Error("offline"));
    await flush();
    const fakeEnv = env();
    attachRefetch(store, fakeEnv.value);
    fakeEnv.link("ready");
    expect(fake.calls).toHaveLength(2);
  });

  it("다시 보일 때는 마지막으로 받은 지 60초가 넘었을 때만 다시 받는다", () => {
    const fake = fakeSource();
    let time = 10_000;
    const store = createHomeDataStore(fake.source, () => time);
    store.ensure(needs({ serverCardIds: [] }));
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
