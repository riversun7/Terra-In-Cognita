// 홈 자료 저장소 — 화면(React) 밖 상태(useSyncExternalStore로 읽는다). 홈을 열 때마다 하나 만든다(ADR 2026-10-29-app-shell 6절 "자료 받기").
// - 받는 것: 처리할 일(inbox.list), 서버 카드 상태(dashboard.cards), 복귀 요약(summary.get, 부관 보고가 보일 때만).
// - 홈을 열면 필요한 조회를 같은 틱에 모두 부른다 → tRPC httpBatchLink가 HTTP 요청 하나로 묶는다(net/api.ts).
// - 고르기(카드·템플릿·시안 자료)가 바뀌면 바뀐 부분만 다시 받는다. 다시 받는 때(연결 다시 맺음, 다시 보임, 바로 처리 뒤)는
//   attachRefetch가 정한다. 주기 타이머는 두지 않는다.
// - 늦게 온 응답이 새 요청의 답을 덮지 않게 부분마다 차례 번호를 둔다. 다시 받는 동안에는 앞 값을 그대로 보인다(깜빡이지 않게).
import type { DashboardCardsRequest, DashboardCardsResponse } from "@terra/shared/dashboard";
import type {
  InboxListRequest,
  InboxListResponse,
  SummaryGetRequest,
  SummaryGetResponse,
} from "@terra/shared/inbox";
import type { HomeNeeds } from "./homeView.ts";

/** 자료 출처. W3(처리할 일·복귀 요약)이 합쳐지면 처리할 일은 위 띠 배지와 같은 저장소(inbox/store.ts)를 쓴다 */
export interface HomeSource {
  inboxList(request: InboxListRequest): Promise<InboxListResponse>;
  dashboardCards(request: DashboardCardsRequest): Promise<DashboardCardsResponse>;
  summaryGet(request: SummaryGetRequest): Promise<SummaryGetResponse>;
}

/** 자료 한 부분. 다시 받는 중(loading)·실패(failed)에도 앞 값(value)을 남긴다 */
export type HomePart<T> =
  | { readonly status: "idle"; readonly value: null }
  | { readonly status: "loading"; readonly value: T | null }
  | { readonly status: "ready"; readonly value: T }
  | { readonly status: "failed"; readonly value: T | null; readonly error: unknown };

export interface HomeData {
  readonly inbox: HomePart<InboxListResponse>;
  readonly cards: HomePart<DashboardCardsResponse>;
  readonly summary: HomePart<SummaryGetResponse>;
}

/** 저장소. 함수는 떼어 넘겨도 되는 속성이다(useSyncExternalStore·단추 onClick에 그대로 넘긴다) */
export interface HomeDataStore {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => HomeData;
  /** 고르기에 맞춰 받는다. 받은 적 없거나 요청이 바뀐 부분만 부른다(같은 틱) */
  readonly ensure: (needs: HomeNeeds) => void;
  /** 지금 고르기로 모두 다시 받는다(같은 틱) */
  readonly refresh: () => void;
  /** 마지막으로 받기를 시작한 시각(기기 시계 ms). 받은 적 없으면 null */
  readonly lastFetchAt: () => number | null;
  /** 실패한 부분이 있는지(연결이 다시 맺어지면 다시 받는다) */
  readonly hasFailure: () => boolean;
}

/** 부분 하나의 상태: 보이는 값, 지금 요청의 글자(null = 받지 않음), 차례 번호 */
interface Slot<T> {
  part: HomePart<T>;
  key: string | null;
  seq: number;
}

/** 서버 카드가 하나도 없으면 묻지 않고 빈 답으로 둔다 */
const NO_CARDS: DashboardCardsResponse = { cards: [] };

function idleSlot<T>(): Slot<T> {
  return { part: { status: "idle", value: null }, key: null, seq: 0 };
}

/** 요청 없이 값을 둔다(앞 요청의 늦은 답이 덮지 않게 차례도 올린다) */
function settle<T>(slot: Slot<T>, key: string | null, part: HomePart<T>): void {
  slot.seq += 1;
  slot.key = key;
  slot.part = part;
}

export function createHomeDataStore(source: HomeSource, now: () => number = Date.now): HomeDataStore {
  const listeners = new Set<() => void>();
  const inbox = idleSlot<InboxListResponse>();
  const cards = idleSlot<DashboardCardsResponse>();
  const summary = idleSlot<SummaryGetResponse>();
  let data: HomeData = { inbox: inbox.part, cards: cards.part, summary: summary.part };
  let needs: HomeNeeds | null = null;
  let fetchedAt: number | null = null;

  /** 보이는 값을 새 객체로 묶고 알린다(바뀐 것이 없으면 알리지 않는다) */
  const emit = (): void => {
    if (data.inbox === inbox.part && data.cards === cards.part && data.summary === summary.part) return;
    data = { inbox: inbox.part, cards: cards.part, summary: summary.part };
    for (const listener of listeners) listener();
  };

  /** 한 부분을 부른다. 응답은 차례 번호가 그대로일 때만 받는다 */
  function start<T>(slot: Slot<T>, key: string, request: () => Promise<T>): void {
    const seq = slot.seq + 1;
    slot.seq = seq;
    slot.key = key;
    slot.part = { status: "loading", value: slot.part.value };
    request().then(
      (value) => {
        if (slot.seq !== seq) return;
        slot.part = { status: "ready", value };
        emit();
      },
      (error: unknown) => {
        if (slot.seq !== seq) return;
        slot.part = { status: "failed", value: slot.part.value, error };
        emit();
      },
    );
  }

  /** 요청 글자가 바뀐 부분(force면 모두)을 같은 틱에 부른다 */
  function load(next: HomeNeeds, force: boolean): void {
    const flag = next.preview ? "p" : "-";
    const request = next.preview ? { preview: true } : {};
    let started = false;
    if (force || inbox.key !== flag) {
      start(inbox, flag, () => source.inboxList(request));
      started = true;
    }
    const cardsKey = `${flag}|${next.serverCardIds.join(",")}`;
    if (force || cards.key !== cardsKey) {
      if (next.serverCardIds.length === 0) {
        settle(cards, cardsKey, { status: "ready", value: NO_CARDS });
      } else {
        start(cards, cardsKey, () => source.dashboardCards({ ids: next.serverCardIds, ...request }));
        started = true;
      }
    }
    if (!next.summary) {
      if (summary.key !== null) settle(summary, null, { status: "idle", value: null });
    } else if (force || summary.key !== flag) {
      start(summary, flag, () => source.summaryGet(request));
      started = true;
    }
    if (started) fetchedAt = now();
    emit();
  }

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => data,
    ensure: (next) => {
      needs = next;
      load(next, false);
    },
    refresh: () => {
      if (needs !== null) load(needs, true);
    },
    lastFetchAt: () => fetchedAt,
    hasFailure: () => [inbox, cards, summary].some((slot) => slot.part.status === "failed"),
  };
}

/** 다시 받는 때를 거는 데 쓰는 것(시험은 가짜를 넣는다) */
export interface RefetchEnv {
  /** 서버 연결 알림(net/serverLink.ts의 listen): ready = 인사 끝(처음·다시 연결), down = 끊김 */
  readonly listen: (listener: (event: { readonly kind: string }) => void) => () => void;
  /** 화면이 다시 보이면 부른다. 그만 듣는 함수를 돌려준다 */
  readonly onVisible: (listener: () => void) => () => void;
  readonly now: () => number;
}

/** 다시 보일 때 다시 받는 기준: 마지막으로 받기 시작한 지 이 시간이 넘었을 때(ADR 37 6절) */
export const REFETCH_AFTER_HIDDEN_MS = 60_000;

/**
 * 다시 받는 때를 건다(ADR 37 6절). 그만 거는 함수를 돌려준다.
 * - 서버 연결이 다시 맺어졌을 때: 홈을 연 뒤 끊긴 적이 있거나 실패한 부분이 있을 때만. 앱을 켠 뒤 처음 맺어지는 연결은
 *   홈의 첫 요청과 겹치므로 다시 받지 않는다(홈을 열 때 요청은 묶음 1번).
 * - 화면이 다시 보일 때: 마지막으로 받기 시작한 지 60초가 넘었을 때.
 * - 바로 처리 결과 뒤: 그 처리를 부른 곳이 store.refresh()를 부른다.
 */
export function attachRefetch(store: HomeDataStore, env: RefetchEnv): () => void {
  let sawDown = false;
  const stopLink = env.listen((event) => {
    if (event.kind === "down") {
      sawDown = true;
      return;
    }
    if (event.kind !== "ready") return;
    if (sawDown || store.hasFailure()) store.refresh();
    sawDown = false;
  });
  const stopVisible = env.onVisible(() => {
    const last = store.lastFetchAt();
    if (last === null || env.now() - last > REFETCH_AFTER_HIDDEN_MS) store.refresh();
  });
  return () => {
    stopLink();
    stopVisible();
  };
}
