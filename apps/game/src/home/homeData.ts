// 홈 자료 저장소 — 화면(React) 밖 상태(useSyncExternalStore로 읽는다). 홈을 열 때마다 하나 만든다(ADR 2026-10-29-app-shell 6절 "자료 받기").
// - 이 저장소가 받는 것: 서버 카드 상태(dashboard.cards), 복귀 요약(summary.get, 부관 보고가 보일 때만).
//   처리할 일(inbox.list)은 받지 않는다: 위 띠 종 배지와 같은 저장소(W3 inbox/store.ts, inboxParts.ts의 useInbox)가 받고 다시 받는다.
//   두 저장소가 같은 처리할 일을 따로 받지 않게 하려는 것이다(다시 연결 때 두 번 받지 않는다).
// - 홈을 열면 필요한 조회를 같은 틱에 모두 부른다 → 같은 조회 모듈(조각)이라 tRPC httpBatchLink가 HTTP 요청 하나로 묶는다.
// - 고르기(카드·템플릿·시안 자료)가 바뀌면 바뀐 부분만 다시 받는다. 다시 받는 때(연결 다시 맺음, 다시 보임, [다시 시도])는
//   attachRefetch·refresh가 정한다. 주기 타이머는 두지 않는다.
// - 늦게 온 응답이 새 요청의 답을 덮지 않게 부분마다 차례 번호를 둔다. 다시 받는 동안에는 앞 값을 그대로 보인다(깜빡이지 않게).
// - 실패는 값(문구 키)으로 받는다(W3 HomeQueryResult). 로그인이 끝났다는 답이면 세션을 다시 확인한다(onSessionEnded).
import type { DashboardCardsResponse, ServerCardId } from "@terra/shared/dashboard";
import type { InboxListResponse, SummaryGetResponse } from "@terra/shared/inbox";
import type { PlainMessageKey } from "../ui/messageRef.ts";
import type { HomeNeeds } from "./homeView.ts";
import type { HomeQueryResult, InboxState } from "./inboxParts.ts";

/** 자료 출처(inboxParts.ts의 loadCards·loadSummary). 시험은 가짜를 넣는다 */
export interface HomeSource {
  dashboardCards(
    ids: readonly ServerCardId[],
    preview: boolean,
  ): Promise<HomeQueryResult<DashboardCardsResponse>>;
  summary(preview: boolean): Promise<HomeQueryResult<SummaryGetResponse>>;
}

/** 자료 한 부분. 다시 받는 중(loading)·실패(failed)에도 앞 값(value)을 남긴다. 실패는 문구 키(W3 net/apiErrors.ts) */
export type HomePart<T> =
  | { readonly status: "idle"; readonly value: null }
  | { readonly status: "loading"; readonly value: T | null }
  | { readonly status: "ready"; readonly value: T }
  | { readonly status: "failed"; readonly value: T | null; readonly error: PlainMessageKey };

/** 이 저장소가 받는 부분 */
export interface HomeQueries {
  readonly cards: HomePart<DashboardCardsResponse>;
  readonly summary: HomePart<SummaryGetResponse>;
}

/** 홈 부품이 그리는 자료: 처리할 일(처리할 일 저장소) + 이 저장소의 부분 */
export interface HomeData extends HomeQueries {
  readonly inbox: HomePart<InboxListResponse>;
}

/** 처리할 일 저장소의 상태 → 홈 부품이 읽는 한 부분(받는 중·실패에도 앞 목록을 남긴다) */
export function inboxPart(state: InboxState): HomePart<InboxListResponse> {
  const { data } = state;
  switch (state.status) {
    case "ready":
      return data === null ? { status: "idle", value: null } : { status: "ready", value: data };
    case "loading":
      return { status: "loading", value: data };
    case "failed":
      return { status: "failed", value: data, error: state.error ?? "err_unknown" };
    default:
      return { status: "idle", value: null };
  }
}

/** 저장소. 함수는 떼어 넘겨도 되는 속성이다(useSyncExternalStore·단추 onClick에 그대로 넘긴다) */
export interface HomeDataStore {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => HomeQueries;
  /** 고르기에 맞춰 받는다. 받은 적 없거나 요청이 바뀐 부분만 부른다(같은 틱) */
  readonly ensure: (needs: HomeNeeds) => void;
  /** 지금 고르기로 모두 다시 받는다(같은 틱) */
  readonly refresh: () => void;
  /** 마지막으로 받기를 시작한 시각(기기 시계 ms). 받은 적 없으면 null */
  readonly lastFetchAt: () => number | null;
  /** 실패한 부분이 있는지(연결이 다시 맺어지면 다시 받는다) */
  readonly hasFailure: () => boolean;
}

export interface HomeDataOptions {
  readonly now?: () => number;
  /** 서버가 로그인이 끝났다고 답했다(세션을 다시 확인한다) */
  readonly onSessionEnded?: () => void;
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

/** 조회가 값 대신 던졌다(조각을 못 받음 등) */
const THREW: HomeQueryResult<never> = { ok: false, error: "err_unknown", sessionEnded: false };

function ignoreSessionEnd(): void {
  // 시험 기본값: 세션 확인을 하지 않는다
}

export function createHomeDataStore(source: HomeSource, options: HomeDataOptions = {}): HomeDataStore {
  const now = options.now ?? Date.now;
  const onSessionEnded = options.onSessionEnded ?? ignoreSessionEnd;
  const listeners = new Set<() => void>();
  const cards = idleSlot<DashboardCardsResponse>();
  const summary = idleSlot<SummaryGetResponse>();
  let data: HomeQueries = { cards: cards.part, summary: summary.part };
  let needs: HomeNeeds | null = null;
  let fetchedAt: number | null = null;

  /** 보이는 값을 새 객체로 묶고 알린다(바뀐 것이 없으면 알리지 않는다) */
  const emit = (): void => {
    if (data.cards === cards.part && data.summary === summary.part) return;
    data = { cards: cards.part, summary: summary.part };
    for (const listener of listeners) listener();
  };

  /** 한 부분을 부른다. 응답은 차례 번호가 그대로일 때만 받는다 */
  function start<T>(slot: Slot<T>, key: string, request: () => Promise<HomeQueryResult<T>>): void {
    const seq = slot.seq + 1;
    slot.seq = seq;
    slot.key = key;
    slot.part = { status: "loading", value: slot.part.value };
    const finish = (result: HomeQueryResult<T>): void => {
      if (slot.seq !== seq) return;
      if (result.ok) {
        slot.part = { status: "ready", value: result.data };
      } else {
        slot.part = { status: "failed", value: slot.part.value, error: result.error };
        if (result.sessionEnded) onSessionEnded();
      }
      emit();
    };
    request().then(finish, () => finish(THREW));
  }

  /** 요청 글자가 바뀐 부분(force면 모두)을 같은 틱에 부른다 */
  function load(next: HomeNeeds, force: boolean): void {
    const flag = next.preview ? "p" : "-";
    let started = false;
    const cardsKey = `${flag}|${next.serverCardIds.join(",")}`;
    if (force || cards.key !== cardsKey) {
      if (next.serverCardIds.length === 0) {
        settle(cards, cardsKey, { status: "ready", value: NO_CARDS });
      } else {
        start(cards, cardsKey, () => source.dashboardCards(next.serverCardIds, next.preview));
        started = true;
      }
    }
    if (!next.summary) {
      if (summary.key !== null) settle(summary, null, { status: "idle", value: null });
    } else if (force || summary.key !== flag) {
      start(summary, flag, () => source.summary(next.preview));
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
    hasFailure: () => [cards, summary].some((slot) => slot.part.status === "failed"),
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
 * 이 저장소(카드·복귀 요약)의 다시 받는 때를 건다(ADR 37 6절). 그만 거는 함수를 돌려준다. 처리할 일은 그 저장소가 스스로 다시 받는다.
 * - 서버 연결이 다시 맺어졌을 때: 홈을 연 뒤 끊긴 적이 있거나 실패한 부분이 있을 때만. 앱을 켠 뒤 처음 맺어지는 연결은
 *   홈의 첫 요청과 겹치므로 다시 받지 않는다(홈을 열 때 요청은 묶음 1번).
 * - 화면이 다시 보일 때: 마지막으로 받기 시작한 지 60초가 넘었을 때.
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
