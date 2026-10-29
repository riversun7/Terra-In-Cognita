// [임시] 처리할 일·복귀 요약(W3) 기기 모듈의 대신 것 — W3이 main에 합쳐지면 이 파일을 지우고 ../inboxParts.ts가 W3 모듈을 가리키게 한다.
// 홈은 이 파일을 직접 가져오지 않는다(../inboxParts.ts만). 이름·모양·뜻은 W3 가지(work/app-shell-w3, 커밋 5ea6c4c)의 것을 따랐다:
// - 시안 자료 켜기 = W3 inbox/preview.ts: 기기 localStorage terra.preview = { v: 1, user }. 켠 계정이 로그인해 있고 dev·admin일 때만 켜진다.
//   새로고침 뒤에도 남는다(켤 때 뜨는 복귀 요약을 시안 자료로 보려고). 다른 계정이면 꺼진 것으로 본다(플레이어가 403을 받지 않게).
// - 처리할 일 저장소 = W3 inbox/store.ts: 위 띠 종 배지와 같은 목록 하나. 계정·시안 여부가 바뀌면 비우고 다시 받는다.
//   ensureInbox(없거나 60초 지남), refreshInbox(받는 중이면 끝난 뒤 한 번 더), 서버 연결이 끊겼다가 다시 맺어질 때, 화면이 다시 보일 때(60초 넘음).
//   주기 타이머는 없다(ADR 2026-10-29-app-shell 6절).
// - 줄 문구·갈 곳 = W3 inbox/inboxText.ts: 모르는 종류는 "새 알림"이고 값(곳 이름)·바로 처리를 보이지 않고 처리함(?item=)으로 간다.
//   마감은 목록을 만든 서버 시각(generatedAt) 기준 남은 시간을 내림한다("3시간 후 마감", 1분 안은 "1분 안에 마감").
// - 바로 처리 = W3 inbox/quickActions.ts: 시안 자료이고 아는 종류일 때만 단추. 실제 항목은 inbox_action(WebSocket)이 생길 때까지 없다.
// - 복귀 요약 칸 = W3 summary/summaryText.ts, 조회 오류 → 문구 키 = W3 net/apiErrors.ts.
// 문구는 W4 자리의 임시 키 home_tmp_*(값은 W3 키와 같은 글)다. W3 뒤에 이 파일·standInQueries.ts·previewSample.ts와 함께 지운다.
import type { Role, RouteTarget } from "@terra/shared";
import { isRouteTarget, targetPath } from "@terra/shared";
import type {
  INBOX_KINDS,
  InboxCategory,
  InboxItem,
  InboxKindId,
  InboxListResponse,
  SummaryGetResponse,
  SummarySection,
  SummarySectionKind,
} from "@terra/shared/inbox";
import { useSyncExternalStore } from "react";
import { getSessionState, subscribe as subscribeSession } from "../../auth/session.ts";
import { field } from "../../net/json.ts";
import { serverLink } from "../../net/serverLink.ts";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import type { PlainMessageKey } from "../../ui/messageRef.ts";
import type { HomeQueryResult } from "./standInQueries.ts";

// ── 시안 자료 켜기(W3 inbox/preview.ts) ─────────────────────────

const PREVIEW_KEY = "terra.preview";
const PREVIEW_MARK_VERSION = 1;
/** 시안 자료를 볼 수 있는 역할(서버 권한 home: preview와 같다. 서버가 기준이다) */
const PREVIEW_ROLES: readonly Role[] = ["dev", "admin"];

const previewListeners = new Set<() => void>();
let previewListening = false;

/** 저장된 표시의 계정 id. 없거나 모양이 다르면 null */
function readPreviewUser(): string | null {
  try {
    const raw = localStorage.getItem(PREVIEW_KEY);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    const user = field(value, "user");
    return field(value, "v") === PREVIEW_MARK_VERSION && typeof user === "string" && user !== ""
      ? user
      : null;
  } catch {
    // 저장소를 못 쓰거나 깨진 값: 꺼진 것으로
    return null;
  }
}

function notifyPreview(): void {
  for (const listener of previewListeners) listener();
}

/** 지금 시안 자료를 묻는지(켠 계정이 로그인해 있고 dev·admin) */
export function isPreviewOn(): boolean {
  const session = getSessionState();
  if (session.kind !== "signed_in") return false;
  return (
    session.user.roles.some((role) => PREVIEW_ROLES.includes(role)) && readPreviewUser() === session.user.id
  );
}

/** 시안 자료 표시나 로그인 상태가 바뀌면 부른다(다른 탭에서 바꾼 것도) */
export function subscribePreview(listener: () => void): () => void {
  if (!previewListening) {
    previewListening = true;
    window.addEventListener("storage", (event) => {
      if (event.key === null || event.key === PREVIEW_KEY) notifyPreview();
    });
  }
  previewListeners.add(listener);
  const stopSession = subscribeSession(listener);
  return () => {
    previewListeners.delete(listener);
    stopSession();
  };
}

export function usePreviewOn(): boolean {
  return useSyncExternalStore(subscribePreview, isPreviewOn, isPreviewOn);
}

/** 켜기·끄기(홈 [편집]의 dev·admin 칸). 로그인한 dev·admin만 켤 수 있다. 처리할 일이 다시 묻는다 */
export function setPreviewOn(on: boolean): void {
  const session = getSessionState();
  const allowed =
    session.kind === "signed_in" && session.user.roles.some((role) => PREVIEW_ROLES.includes(role));
  try {
    if (on && allowed) {
      localStorage.setItem(PREVIEW_KEY, JSON.stringify({ v: PREVIEW_MARK_VERSION, user: session.user.id }));
    } else {
      localStorage.removeItem(PREVIEW_KEY);
    }
  } catch {
    // 저장소를 못 쓰면 켜지지 않는다(W3과 같다: 표시는 저장소에만 있다)
  }
  notifyPreview();
}

// ── 처리할 일 저장소(W3 inbox/store.ts) ────────────────────────

export type InboxStatus = "idle" | "loading" | "ready" | "failed";

export interface InboxState {
  /** 이 자료의 계정. 로그인하지 않았으면 null */
  readonly userId: string | null;
  /** 시안 자료(preview)로 물은 자료인지 */
  readonly preview: boolean;
  readonly status: InboxStatus;
  /** 마지막으로 받은 목록. 다시 받는 중·실패한 뒤에도 남는다(계정·시안 자료가 바뀌면 비운다) */
  readonly data: InboxListResponse | null;
  /** 마지막 실패의 문구 키. 받으면 null */
  readonly error: PlainMessageKey | null;
  /** 마지막으로 받은 시각(기기 시계 ms) */
  readonly receivedAt: number | null;
}

/** 화면이 다시 보일 때·화면을 열 때 다시 받는 기준(마지막으로 받은 뒤) */
const INBOX_STALE_MS = 60_000;

const IDLE: InboxState = {
  userId: null,
  preview: false,
  status: "idle",
  data: null,
  error: null,
  receivedAt: null,
};

let inbox: InboxState = IDLE;
const inboxListeners = new Set<() => void>();
/** 지금 받는 요청. 계정·시안 자료가 바뀌면 버린다 */
let inflight: { readonly token: object; readonly done: Promise<void> } | null = null;
/** 받는 중에 refreshInbox()가 왔다 → 끝난 뒤 한 번 더 */
let again = false;
let inboxStarted = false;
/** 끊긴 뒤 아직 다시 받지 않았다 */
let missedConnection = false;

function setInbox(next: InboxState): void {
  inbox = next;
  for (const listener of inboxListeners) listener();
}

function viewer(): { readonly userId: string; readonly preview: boolean } | null {
  const session = getSessionState();
  return session.kind === "signed_in" ? { userId: session.user.id, preview: isPreviewOn() } : null;
}

const loadQueries = () => import("./standInQueries.ts");
const REQUEST_FAILED: HomeQueryResult<never> = { ok: false, error: "err_network", sessionEnded: false };

function startLoad(preview: boolean, base: InboxState): Promise<void> {
  const token = {};
  setInbox({ ...base, status: "loading" });
  const done = loadQueries()
    .then((queries) => queries.loadInbox(preview))
    .catch((): HomeQueryResult<InboxListResponse> => REQUEST_FAILED)
    .then((result) => {
      // 그사이 계정·시안 자료가 바뀌어 버린 요청이다
      if (inflight?.token !== token) return;
      inflight = null;
      setInbox(
        result.ok
          ? { ...inbox, status: "ready", data: result.data, error: null, receivedAt: Date.now() }
          : { ...inbox, status: "failed", error: result.error },
      );
      if (!again) return;
      again = false;
      void refreshInbox();
    });
  inflight = { token, done };
  return done;
}

/** 계정·시안 자료가 바뀌었으면 비우고 다시 받는다 */
function syncInbox(): void {
  const next = viewer();
  const same =
    next === null ? inbox.userId === null : inbox.userId === next.userId && inbox.preview === next.preview;
  if (same) return;
  inflight = null;
  again = false;
  if (next === null) {
    setInbox(IDLE);
    return;
  }
  void startLoad(next.preview, { ...IDLE, userId: next.userId, preview: next.preview });
}

/** 처음 쓸 때 한 번: 로그인·시안 자료·서버 연결·화면 보임을 듣는다 */
function startInbox(): void {
  if (inboxStarted) return;
  inboxStarted = true;
  subscribePreview(syncInbox);
  serverLink.listen((event) => {
    if (event.kind === "down") {
      missedConnection = true;
    } else if (event.kind === "ready" && missedConnection) {
      missedConnection = false;
      void refreshInbox();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void ensureInbox();
  });
  syncInbox();
}

function subscribeInbox(listener: () => void): () => void {
  startInbox();
  inboxListeners.add(listener);
  return () => {
    inboxListeners.delete(listener);
  };
}

function getInbox(): InboxState {
  return inbox;
}

/** 처리할 일 상태 전체(처리함 화면·홈) */
export function useInbox(): InboxState {
  return useSyncExternalStore(subscribeInbox, getInbox, getInbox);
}

/** 화면을 열 때: 없거나 60초가 지났으면 받는다(받는 중이면 그것을 기다린다) */
export function ensureInbox(): Promise<void> {
  startInbox();
  syncInbox();
  if (inbox.userId === null) return Promise.resolve();
  if (inflight !== null) return inflight.done;
  const fresh =
    inbox.status === "ready" && inbox.receivedAt !== null && Date.now() - inbox.receivedAt <= INBOX_STALE_MS;
  return fresh ? Promise.resolve() : startLoad(inbox.preview, inbox);
}

/** 지금 상태를 다시 받는다([다시 시도], 바로 처리 결과를 받은 뒤). 받는 중이면 끝난 뒤 한 번 더 */
export function refreshInbox(): Promise<void> {
  startInbox();
  syncInbox();
  if (inbox.userId === null) return Promise.resolve();
  if (inflight !== null) {
    again = true;
    return inflight.done;
  }
  return startLoad(inbox.preview, inbox);
}

/** 종 배지 = 완료를 뺀 줄 수(묶음은 1줄). 이 기기가 모르는 분류(더 새 서버)의 줄도 센다. 목록이 없으면 0 */
export function bellCount(data: InboxListResponse | null): number {
  if (data === null) return 0;
  let total = 0;
  for (const [category, count] of Object.entries(data.counts)) {
    if (category !== "done" && Number.isSafeInteger(count) && count > 0) total += count;
  }
  return total;
}

// ── 줄 문구·갈 곳(W3 inbox/inboxText.ts) ───────────────────────

/** [임시] 종류 → 제목(count = 언어에 맞게 자리를 나눈 개수) */
const KIND_TITLES = {
  wave_incoming: () => m.home_tmp_kind_wave_incoming(),
  siege_declared: () => m.home_tmp_kind_siege_declared(),
  goods_spoiling: (count: string) => m.home_tmp_kind_goods_spoiling({ count }),
  unit_injured: (count: string) => m.home_tmp_kind_unit_injured({ count }),
  unit_idle: (count: string) => m.home_tmp_kind_unit_idle({ count }),
  building_stopped: (count: string) => m.home_tmp_kind_building_stopped({ count }),
  contract_match: () => m.home_tmp_kind_contract_match(),
  craft_done: () => m.home_tmp_kind_craft_done(),
} satisfies Record<InboxKindId, (count: string) => string>;

/** 분류 이름(0단계 키 inbox_category_<분류>) */
export const CATEGORY_NAMES = {
  threat: m.inbox_category_threat,
  money_survival: m.inbox_category_money_survival,
  stalled: m.inbox_category_stalled,
  decision: m.inbox_category_decision,
  done: m.inbox_category_done,
} satisfies Record<InboxCategory, () => string>;

/** 기기가 아는 종류인지(문구 표에 있는지) */
export function isKnownKind(kind: string): kind is InboxKindId {
  return Object.hasOwn(KIND_TITLES, kind);
}

/** 기기가 아는 분류인지. 분류는 닫힌 목록이지만 받은 값은 다시 본다(더 새 서버) */
export function isKnownCategory(category: string): category is InboxCategory {
  return Object.hasOwn(CATEGORY_NAMES, category);
}

/** 줄 제목. 모르는 종류는 "새 알림" */
export function inboxItemTitle(item: InboxItem): string {
  if (!isKnownKind(item.kind)) return m.home_tmp_kind_unknown();
  return KIND_TITLES[item.kind](new Intl.NumberFormat(getLocale()).format(item.count));
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * 마감 문구. 남은 시간을 내림해서 보인다(마감을 늘려 말하지 않는다. 위협·대출 마감을 놓치지 않게):
 * 1분 안은 "1분 안에 마감", 1시간 안은 분, 48시간 안은 시간, 그 뒤는 날. 지났으면 "마감 지남". 없으면 null.
 * now는 목록을 만든 서버 시각(generatedAt)이다. 화면을 오래 열어 두면 늦은 값이 된다(주기 타이머 없음, 다시 받을 때 고쳐진다).
 */
export function formatDue(deadlineAt: number | null, now: number): string | null {
  if (deadlineAt === null) return null;
  const left = deadlineAt - now;
  if (left <= 0) return m.home_tmp_overdue();
  if (left < MINUTE) return m.home_tmp_deadline_soon();
  const format = new Intl.RelativeTimeFormat(getLocale(), { numeric: "always" });
  let time: string;
  if (left < HOUR) time = format.format(Math.floor(left / MINUTE), "minute");
  else if (left < 2 * DAY) time = format.format(Math.floor(left / HOUR), "hour");
  else time = format.format(Math.floor(left / DAY), "day");
  return m.home_tmp_deadline({ time });
}

/** 줄 하나를 그리는 데 필요한 값(W3 ItemView) */
export interface ItemView {
  readonly title: string;
  /** 곳 이름(params.place, 유저가 지은 이름은 번역하지 않는다). 없으면 null */
  readonly place: string | null;
  readonly due: string | null;
  /** 누르면 갈 화면. 없으면 링크가 없다(처리함 화면 안에서만) */
  readonly target: RouteTarget | null;
  readonly href: string | null;
  readonly preview: boolean;
  /** 기기가 아는 종류인지(모르면 값·바로 처리를 보이지 않는다) */
  readonly known: boolean;
}

/** 처리함에서 이 항목을 강조하는 화면(/inbox?item=<항목 ID>) */
export function inboxItemTarget(item: InboxItem): RouteTarget {
  return { route: "inbox", search: { item: item.id } };
}

/**
 * 줄을 누르면 갈 화면. 아는 종류이고 이동 화면이 이 기기가 아는 화면이면 그 화면, 아니면 처리함(?item=).
 * 처리함 화면 안(onInboxScreen)에서는 처리함으로 가는 링크를 두지 않는다(null).
 */
export function itemTarget(item: InboxItem, onInboxScreen: boolean): RouteTarget | null {
  const target: unknown = item.target;
  if (isKnownKind(item.kind) && isRouteTarget(target)) return target;
  return onInboxScreen ? null : inboxItemTarget(item);
}

export function describeItem(
  item: InboxItem,
  options: { readonly now: number; readonly onInboxScreen: boolean },
): ItemView {
  const known = isKnownKind(item.kind);
  const place = known ? item.params["place"] : undefined;
  const target = itemTarget(item, options.onInboxScreen);
  return {
    title: inboxItemTitle(item),
    place: typeof place === "string" && place !== "" ? place : null,
    due: formatDue(item.deadlineAt, options.now),
    target,
    href: target === null ? null : targetPath(target),
    preview: item.preview === true,
    known,
  };
}

// ── 바로 처리(W3 inbox/quickActions.ts) ───────────────────────

/** 종류 표에 있는 바로 처리 동작 ID(값은 가져오지 않는다) */
export type QuickActionId = (typeof INBOX_KINDS)[InboxKindId]["actions"][number];

const ACTION_LABELS = {
  deploy_defense: m.home_tmp_action_deploy_defense,
  sell: m.home_tmp_action_sell,
  auto_assign: m.home_tmp_action_auto_assign,
  repair: m.home_tmp_action_repair,
  accept: m.home_tmp_action_accept,
  decline: m.home_tmp_action_decline,
} satisfies Record<QuickActionId, () => string>;

function isQuickActionId(action: string): action is QuickActionId {
  return Object.hasOwn(ACTION_LABELS, action);
}

export function quickActionLabel(action: QuickActionId): string {
  return ACTION_LABELS[action]();
}

/** 줄에 그릴 바로 처리 단추(받은 차례). 실제 항목은 명령을 보낼 길이 생길 때까지 없다. 모르는 종류·동작도 없다 */
export function quickActionsFor(item: InboxItem): QuickActionId[] {
  if (item.preview !== true || !isKnownKind(item.kind)) return [];
  return item.actions.filter(isQuickActionId);
}

// ── 복귀 요약 칸(W3 summary/summaryText.ts) ────────────────────

/** [임시] 칸 종류 → 이름 */
export const SECTION_LABELS = {
  production: m.home_tmp_summary_production,
  raid: m.home_tmp_summary_raid,
  injury: m.home_tmp_summary_injury,
  world_news: m.home_tmp_summary_world_news,
} satisfies Record<SummarySectionKind, () => string>;

function isKnownSection(kind: string): kind is SummarySectionKind {
  return Object.hasOwn(SECTION_LABELS, kind);
}

export type VisibleSection = SummarySection & { readonly kind: SummarySectionKind };

/** 그릴 칸: 아는 종류(더 새 서버의 모르는 칸은 뺀다)이고 사건이 있는 칸, 받은 차례로 */
export function visibleSections(summary: SummaryGetResponse): VisibleSection[] {
  const result: VisibleSection[] = [];
  for (const section of summary.sections) {
    const { kind } = section;
    if (isKnownSection(kind) && section.count > 0) result.push({ ...section, kind });
  }
  return result;
}

// ── 조회 오류 → 문구 키(W3 net/apiErrors.ts) ───────────────────

export interface ApiErrorInfo {
  /** 서버가 준 tRPC 오류 코드. 응답을 받지 못했거나 tRPC 응답이 아니면 null */
  readonly code: string | null;
  readonly key: PlainMessageKey;
  /** 로그인이 끝났을 수 있다 → 세션을 다시 확인한다 */
  readonly sessionEnded: boolean;
}

export function apiErrorInfo(error: unknown): ApiErrorInfo {
  const raw = field(field(error, "data"), "code");
  const code = typeof raw === "string" ? raw : null;
  switch (code) {
    case "UNAUTHORIZED":
      return { code, key: "auth_notice_session_ended", sessionEnded: true };
    case "FORBIDDEN":
      return { code, key: "admin_err_forbidden", sessionEnded: false };
    case "BAD_REQUEST":
      return { code, key: "admin_err_bad_request", sessionEnded: false };
    case "INTERNAL_SERVER_ERROR":
      return { code, key: "err_server", sessionEnded: false };
    case null:
      return { code, key: "err_network", sessionEnded: false };
    default:
      return { code, key: "err_unknown", sessionEnded: false };
  }
}
