// 화면 길(라우터) — 주소 ↔ 화면, 기록 칸과 뒤로 규칙(ADR 2026-10-29-app-shell 1·2절, [결정 1] 자체 라우터).
// 이 파일은 React·DOM 없이 돈다: history·주소·popstate를 env로 받는다(가짜 history 시험: router.test.ts).
// 브라우저에 붙이는 일(window.history, 화면이 읽는 훅)은 routerStore.ts가 한다.
//
// 기록 칸마다 history.state에 칸 상태(EntryState: 열쇠·순번·사슬의 첫 칸·홈 칸·첫 단계 화면 칸)를 둔다. 새로고침해도 남는다.
// - 홈 → 다른 첫 단계 화면: 쌓는다(push). 홈이 아닌 첫 단계 화면끼리: 바꾼다(replace).
// - 홈으로: 사슬 안에 앱 홈 칸이 있으면 그 칸까지 돌아간다(history.go). 없으면(바로 연 주소) 사슬의 첫 칸을 홈으로 바꾼다.
//   그래서 뒤로 → 홈 → 앱 닫힘이 늘 같다.
// - 지도·상세 화면: 쌓는다. 지도 모드 전환(1차맵 ↔ 2차맵)은 부르는 쪽이 replace를 준다(뒤로 = 지도를 떠남).
// - 화면 안 [뒤로]: 앱이 쌓은 칸이 아래에 있으면 history.back(), 없으면 부모 화면(주소 표)으로 바꾼다.
// - 겹침(☰ 서랍·편집 시트): 열 때 같은 주소로 한 칸 쌓는다. 그 칸이 빠지면 닫힌다. 새로고침 때 겹침 칸이면 바로 뺀다.
//   겹침만 열고 닫는 것은 화면이 바뀐 것이 아니다: version·via를 두고 overlay만 바꾼다(틀이 스크롤·제목·초점을 건드리지 않게).
//   겹침 칸은 그 아래 칸(겹침을 연 화면 칸)의 열쇠를 base로 들고 있어, 새로고침·앞으로 가기 뒤에도 같은 화면인지 안다.
// - 지금 화면을 다시 고름(탭·메뉴·서랍에서 지금 화면): 기록은 그대로, reselects만 는다(틀이 맨 위로 또는 focusId 칸으로).
// - history.go 뒤에 할 일(서랍에서 고름, 상세에서 탭)은 popstate를 받은 뒤 한다. 중간 칸은 화면에 내보내지 않는다.
import {
  ROUTES,
  type RouteId,
  type RouteMatch,
  type RouteTarget,
  matchPath,
  parentTarget,
  targetPath,
} from "@terra/shared";

/** 사람이 눌러 연 겹침(☰ 서랍·편집 시트). 연 동안 같은 주소로 기록 한 칸을 쌓는다 */
export const OVERLAY_KINDS = ["drawer", "sheet"] as const;

export type OverlayKind = (typeof OVERLAY_KINDS)[number];

/** history.state에 두는 칸 상태. 순번은 이 앱이 이어 쌓은 칸 사슬 안에서만 비교한다 */
export interface EntryState {
  /** 이 앱이 쓴 칸 표시(모양 판). 다른 값이면 앱이 쓴 칸이 아닌 것으로 본다 */
  readonly terra: 1;
  /** 칸 열쇠 — 스크롤 기억 */
  readonly key: string;
  /** 순번(사슬 안에서 하나씩 는다) */
  readonly index: number;
  /** 사슬의 첫 칸 순번(앱을 그 주소로 연 칸). 이보다 아래 칸은 앱 밖이거나 다른 사슬이다 */
  readonly root: number;
  /** 사슬 안 앱 홈 칸의 순번(ADR 37 2절 "앞 칸이 홈"). 없으면 null(바로 연 주소). 홈 칸은 자기 순번 */
  readonly home: number | null;
  /** 사슬 안 첫 단계 화면 칸(홈이 아닌 첫 단계 화면)의 순번. 없으면 null */
  readonly top: number | null;
  /** 겹침 칸이면 그 겹침 */
  readonly overlay?: OverlayKind;
  /** 겹침 칸이면 그 아래 칸(겹침을 연 화면 칸)의 열쇠 — 겹침만 열고 닫을 때 화면이 그대로인지 본다 */
  readonly base?: string;
}

/** 라우터가 쓰는 브라우저 기능(시험은 가짜를 넣는다) */
export interface RouterEnv {
  readonly history: {
    readonly state: unknown;
    pushState(state: unknown, unused: string, url: string): void;
    replaceState(state: unknown, unused: string, url: string): void;
    go(delta: number): void;
  };
  /** 지금 주소: 경로 + 검색어 + #조각 */
  readonly currentUrl: () => string;
  /** popstate 듣기. 끄는 함수를 돌려준다 */
  readonly onPopState: (listener: () => void) => () => void;
  /** 새 칸 열쇠 */
  readonly newKey: () => string;
  /** 지금 시각(ms) — 기다리는 일이 너무 오래되었는지 본다 */
  readonly now: () => number;
}

/** 이 화면으로 온 길. initial = 앱을 켬(초점을 옮기지 않는다), pop = 뒤로·앞으로(스크롤을 되돌린다) */
export type NavigationVia = "initial" | "push" | "replace" | "pop";

export interface RouterSnapshot {
  /** 지금 주소(경로 + 검색어). #조각은 뺀다 */
  readonly url: string;
  /** 맞는 화면. null이면 "없는 화면" */
  readonly match: RouteMatch | null;
  readonly entry: EntryState;
  /** 열린 겹침(사람이 연 것). 새로고침 때 남은 겹침 칸이면 null(다시 열지 않는다) */
  readonly overlay: OverlayKind | null;
  /** 지금 화면에 온 길. 겹침만 열고 닫으면 그대로다 */
  readonly via: NavigationVia;
  /** 화면(겹침 아래 칸의 주소·열쇠)이 바뀔 때마다 는다. 겹침만 열고 닫으면 그대로다 — 틀은 이때만 제목·스크롤·초점을 맞춘다 */
  readonly version: number;
  /** 지금 화면을 다시 고름(탭·메뉴·서랍에서 지금 화면)마다 는다 — 틀은 focusId 칸에 초점을 두거나 맨 위로 올린다 */
  readonly reselects: number;
  /**
   * 화면을 옮긴 뒤(version) 또는 다시 고른 뒤(reselects) 초점을 둘 요소 id. 없으면 옮길 때는 새 화면 제목, 다시 고를 때는 맨 위로.
   * 예: 사이드 메뉴 [메뉴 편집] → 설정의 메뉴 칸
   */
  readonly focusId: string | null;
}

export interface NavigateOptions {
  /** 지금 칸을 바꾼다(지도 모드 전환 등). 없으면 주소 종류로 정한다 */
  readonly replace?: boolean;
  /** 옮긴 뒤 초점을 둘 요소 id */
  readonly focusId?: string;
}

export interface Router {
  start(): void;
  stop(): void;
  getSnapshot(): RouterSnapshot;
  subscribe(listener: () => void): () => void;
  /** 화면으로 옮긴다. 기다리는 일(history.go 뒤)이 있으면 무시하고 false */
  navigate(target: RouteTarget, options?: NavigateOptions): boolean;
  /** 화면 안 [뒤로] */
  back(): void;
  /** 겹침을 연다(같은 주소로 한 칸 쌓는다). 화면은 그대로다(version·via가 바뀌지 않는다) */
  openOverlay(kind: OverlayKind): void;
  /** 겹침 칸을 뺀다(닫기 버튼·Esc·닫기 요청). 겹침 칸이 아니면 아무것도 하지 않고 false */
  closeOverlay(): boolean;
  /**
   * 로그아웃·다른 계정(ADR 37 2절 "/로 바꾼다"): 사슬 안 앱 홈 칸(없으면 사슬의 첫 칸)까지 돌아가 새 열쇠의 홈으로 바꾼다.
   * 겹침 칸도 함께 빠진다. 기록에 홈이 한 칸만 남아 뒤로 → 앱 닫힘이 같다
   */
  resetToHome(): void;
}

/** 화면 종류: 홈 / 첫 단계 화면(부모가 홈이고 틀이 보이는 화면) / 나머지(지도·상세·없는 화면, 쌓는다) */
export type RouteKind = "home" | "top" | "push";

export function routeKind(id: RouteId | null): RouteKind {
  if (id === null) return "push";
  if (id === "home") return "home";
  const route = ROUTES[id];
  return route.parent === "home" && route.frame === "shown" ? "top" : "push";
}

/** history.go 뒤에 기다리는 일이 이보다 오래되면 버린다(브라우저가 이동을 하지 않은 경우) */
export const PENDING_TIMEOUT_MS = 1_000;

function isOverlayKind(value: unknown): value is OverlayKind {
  return typeof value === "string" && (OVERLAY_KINDS as readonly string[]).includes(value);
}

function isIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** history.state가 이 앱이 쓴 칸 상태인지(모양을 모두 본다. 다른 판·다른 앱 값은 아니다) */
export function readEntryState(value: unknown): EntryState | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const terra: unknown = Reflect.get(value, "terra");
  const key: unknown = Reflect.get(value, "key");
  const index: unknown = Reflect.get(value, "index");
  const root: unknown = Reflect.get(value, "root");
  const home: unknown = Reflect.get(value, "home");
  const top: unknown = Reflect.get(value, "top");
  const overlay: unknown = Reflect.get(value, "overlay");
  if (terra !== 1 || typeof key !== "string" || key === "" || !isIndex(index) || !isIndex(root)) return null;
  if (root > index) return null;
  if (home !== null && !(isIndex(home) && home >= root && home <= index)) return null;
  if (top !== null && !(isIndex(top) && top >= root && top <= index)) return null;
  if (overlay !== undefined && !isOverlayKind(overlay)) return null;
  const base: unknown = Reflect.get(value, "base");
  // 아래 칸 열쇠는 겹침 칸에만 있다(앞 판의 겹침 칸에는 없을 수 있다: 그때는 겹침을 닫으면 화면이 바뀐 것으로 본다)
  if (base !== undefined && (overlay === undefined || typeof base !== "string" || base === "")) return null;
  const entry = { terra: 1 as const, key, index, root, home, top };
  if (overlay === undefined) return entry;
  return base === undefined ? { ...entry, overlay } : { ...entry, overlay, base };
}

/** 칸이 보이는 화면의 열쇠: 겹침 칸이면 그 아래 칸, 아니면 자기 */
function screenKey(entry: EntryState): string {
  return entry.overlay !== undefined && entry.base !== undefined ? entry.base : entry.key;
}

/** 주소에서 #조각을 뺀다 */
export function withoutHash(url: string): string {
  const at = url.indexOf("#");
  return at < 0 ? url : url.slice(0, at);
}

/** 칸 사슬 위치(열쇠·겹침을 뺀 것) */
interface Chain {
  readonly index: number;
  readonly root: number;
  readonly home: number | null;
  readonly top: number | null;
}

/** 칸 사슬 위치 + 그 칸의 화면 종류 → 새 칸 상태. 홈 칸은 home = 자기, 첫 단계 화면 칸은 top = 자기 */
function stateAt(chain: Chain, kind: RouteKind, key: string): EntryState {
  const { index, root } = chain;
  // 이 칸이 홈·첫 단계 칸이었으면 그 표시는 이 칸과 함께 바뀐다
  const home = kind === "home" ? index : chain.home === index ? null : chain.home;
  const top = kind === "top" ? index : chain.top === index || kind === "home" ? null : chain.top;
  return { terra: 1, key, index, root, home, top };
}

/** 돌아간 칸에서 다시 정할 일. null을 돌려주면 돌아간 칸이 끝이다(그 칸의 화면을 보인다) */
export type AfterLanding = (landed: EntryState, landedUrl: string) => NavigationPlan | null;

/** 할 일: 지금 화면을 다시 고름(기록 그대로) / 쌓기 / 바꾸기 / 몇 칸 돌아간 뒤 다시 정하기 */
export type NavigationPlan =
  | { readonly kind: "none" }
  | { readonly kind: "push"; readonly url: string; readonly state: EntryState }
  | { readonly kind: "replace"; readonly url: string; readonly state: EntryState }
  | {
      readonly kind: "go";
      readonly delta: number;
      /** 돌아간 칸에서 다시 정할 일. null이면 돌아간 칸이 끝이다 */
      readonly after: AfterLanding | null;
    };

/**
 * 지금 칸(current, 그 주소 currentUrl)에서 target 주소로 옮길 때 할 일(순수 함수, 2절 표).
 * newKey는 새 칸 열쇠를 만든다.
 */
export function planNavigation(
  current: EntryState,
  currentUrl: string,
  targetUrl: string,
  options: NavigateOptions,
  newKey: () => string,
): NavigationPlan {
  const target = withoutHash(targetUrl);
  const here = withoutHash(currentUrl);
  // 겹침 칸 위: 겹침 칸을 빼고(popstate 뒤) 아래 칸에서 다시 정한다(서랍에서 다른 화면을 고름)
  if (current.overlay !== undefined) {
    return {
      kind: "go",
      delta: -1,
      after: (landed, landedUrl) => planNavigation(landed, landedUrl, targetUrl, options, newKey),
    };
  }
  const targetMatch = matchPath(target);
  const kind = routeKind(targetMatch?.id ?? null);
  const replaceHere = (): NavigationPlan => ({
    kind: "replace",
    url: target,
    state: stateAt(current, kind, newKey()),
  });
  if (options.replace === true) return target === here ? { kind: "none" } : replaceHere();

  const hereMatch = matchPath(here);
  const sameRoute = hereMatch !== null && targetMatch !== null && hereMatch.id === targetMatch.id;
  // 같은 화면을 다시 누름: 다시 고름(맨 위로·초점 칸). 같은 화면의 다른 검색어(예: /inbox?item= → /inbox)는 바꾼다
  if (target === here) return { kind: "none" };
  if (sameRoute && kind !== "push") return replaceHere();

  if (kind === "home") {
    if (current.home !== null && current.home < current.index) {
      // 사슬 안의 앱 홈 칸으로 돌아간다(그 칸에서 보던 곳으로). 그 칸의 주소가 다르면(예: ?template=) 돌아간 뒤 바꾼다
      return {
        kind: "go",
        delta: current.home - current.index,
        after: (landed, landedUrl) =>
          withoutHash(landedUrl) === target
            ? null
            : { kind: "replace", url: target, state: stateAt(landed, "home", newKey()) },
      };
    }
    return toChainRoot(current, target, "home", newKey);
  }

  if (kind === "top") {
    // 홈에서: 쌓고 "앞 칸이 홈"을 적는다
    if (current.home === current.index) {
      const index = current.index + 1;
      return {
        kind: "push",
        url: target,
        state: { terra: 1, key: newKey(), index, root: current.root, home: current.index, top: index },
      };
    }
    // 첫 단계 화면끼리: 바꾼다("앞 칸이 홈" 표시는 이어 적힌다)
    if (current.top === current.index) return replaceHere();
    // 더 깊은 칸(상세·지도)에서: 첫 단계 화면 칸까지 돌아가 바꾼다
    if (current.top !== null) return goThenReplace(current.top - current.index, target, "top", newKey);
    // 홈 바로 위 칸(홈에서 연 상세)이 첫 단계 화면 자리다
    if (current.home !== null) {
      const landing = current.home + 1;
      return landing === current.index
        ? replaceHere()
        : goThenReplace(landing - current.index, target, "top", newKey);
    }
    return toChainRoot(current, target, "top", newKey);
  }

  // 지도·상세·없는 화면: 쌓는다
  return {
    kind: "push",
    url: target,
    state: {
      terra: 1,
      key: newKey(),
      index: current.index + 1,
      root: current.root,
      home: current.home,
      top: current.top,
    },
  };
}

/** delta칸 돌아간 뒤 그 칸을 target으로 바꾼다 */
function goThenReplace(delta: number, target: string, kind: RouteKind, newKey: () => string): NavigationPlan {
  return {
    kind: "go",
    delta,
    after: (landed) => ({ kind: "replace", url: target, state: stateAt(landed, kind, newKey()) }),
  };
}

/** 사슬의 첫 칸(바로 연 주소)을 target으로 바꾼다. 지금이 첫 칸이 아니면 그 칸까지 돌아간 뒤 바꾼다 */
function toChainRoot(
  current: EntryState,
  target: string,
  kind: RouteKind,
  newKey: () => string,
): NavigationPlan {
  if (current.index === current.root) {
    return { kind: "replace", url: target, state: stateAt(current, kind, newKey()) };
  }
  return goThenReplace(current.root - current.index, target, kind, newKey);
}

/**
 * 화면 안 [뒤로](순수 함수). 겹침 칸이거나 앱이 쌓은 칸이 아래에 있으면 한 칸 돌아간다(history.back()).
 * 없으면(바로 연 주소) 부모 화면으로 바꾼다. 홈은 부모가 없어 아무것도 하지 않는다. 없는 화면의 부모는 홈이다.
 */
export function planBack(current: EntryState, currentUrl: string, newKey: () => string): NavigationPlan {
  if (current.overlay !== undefined || current.index > current.root) {
    return { kind: "go", delta: -1, after: null };
  }
  const match = matchPath(withoutHash(currentUrl));
  if (match?.id === "home") return { kind: "none" };
  const parent: RouteTarget = match === null ? { route: "home" } : (parentTarget(match) ?? { route: "home" });
  const url = targetPath(parent);
  return { kind: "replace", url, state: stateAt(current, routeKind(parent.route), newKey()) };
}

/** 앱이 쓴 칸이 아닌 칸(바로 연 주소, 모르는 state)의 새 칸 상태: 사슬의 첫 칸 */
export function rootState(url: string, key: string, index = 0): EntryState {
  const kind = routeKind(matchPath(withoutHash(url))?.id ?? null);
  return stateAt({ index, root: index, home: null, top: null }, kind, key);
}

interface Pending {
  readonly expectIndex: number;
  readonly at: number;
  readonly after: AfterLanding | null;
  readonly focusId: string | null;
}

export function createRouter(env: RouterEnv): Router {
  const listeners = new Set<() => void>();
  let snapshot: RouterSnapshot | null = null;
  let pending: Pending | null = null;
  let stopPop: (() => void) | null = null;
  let version = 0;
  let reselects = 0;

  const current = (): RouterSnapshot => {
    if (snapshot === null) throw new Error("router not started");
    return snapshot;
  };

  /** 새 상태를 내보낸다 */
  const commit = (next: RouterSnapshot): void => {
    snapshot = next;
    for (const listener of listeners) listener();
  };

  /**
   * 칸에 도착한 뒤의 상태. 주소와 화면 열쇠(겹침 칸이면 그 아래 칸)가 앞 상태와 같으면 화면은 그대로다:
   * 겹침만 열고 닫았다 → version·via·focusId를 두고 칸·겹침만 바꾼다. overlay를 null로 주면 겹침 칸이어도 닫힌 것으로 둔다(곧 뺄 칸)
   */
  const arrived = (
    entry: EntryState,
    via: NavigationVia,
    focusId: string | null,
    overlay: OverlayKind | null = entry.overlay ?? null,
  ): RouterSnapshot => {
    const url = withoutHash(env.currentUrl());
    const previous = snapshot;
    if (previous !== null && previous.url === url && screenKey(previous.entry) === screenKey(entry)) {
      return { ...previous, entry, overlay };
    }
    version += 1;
    return { url, match: matchPath(url), entry, overlay, via, version, reselects, focusId };
  };

  /** 지금 화면을 다시 고름 — reselects를 올린다(틀이 focusId 칸으로 또는 맨 위로) */
  const reselected = (state: RouterSnapshot, focusId: string | null): RouterSnapshot => {
    reselects += 1;
    return { ...state, reselects, focusId };
  };

  /** 할 일을 한다. go면 기다리는 일로 두고 popstate를 기다린다 */
  const apply = (plan: NavigationPlan, focusId: string | null, from: EntryState): void => {
    switch (plan.kind) {
      case "none":
        commit(reselected(current(), focusId));
        return;
      case "push":
        env.history.pushState(plan.state, "", plan.url);
        commit(arrived(plan.state, "push", focusId));
        return;
      case "replace":
        env.history.replaceState(plan.state, "", plan.url);
        commit(arrived(plan.state, "replace", focusId));
        return;
      case "go":
        pending = { expectIndex: from.index + plan.delta, at: env.now(), after: plan.after, focusId };
        env.history.go(plan.delta);
        return;
      default: {
        const unhandled: never = plan;
        throw new Error(`unknown plan: ${JSON.stringify(unhandled)}`);
      }
    }
  };

  /** 기다리는 일이 있으면(오래되지 않았으면) true */
  const busy = (): boolean => {
    if (pending === null) return false;
    if (env.now() - pending.at > PENDING_TIMEOUT_MS) {
      pending = null;
      return false;
    }
    return true;
  };

  const onPopState = (): void => {
    const url = env.currentUrl();
    let entry = readEntryState(env.history.state);
    if (entry === null) {
      // 앱이 쓰지 않은 칸(모르는 state): 새 사슬의 첫 칸으로 삼는다
      pending = null;
      entry = rootState(url, env.newKey());
      env.history.replaceState(entry, "", url);
      commit(arrived(entry, "pop", null));
      return;
    }
    const waiting = pending;
    pending = null;
    if (waiting !== null && waiting.expectIndex === entry.index) {
      const next = waiting.after === null ? null : waiting.after(entry, url);
      if (next === null) {
        // 돌아간 칸이 끝이다(겹침 닫기·[뒤로]·홈으로): 그 칸의 화면. 겹침만 닫았으면 화면은 그대로다
        commit(arrived(entry, "pop", waiting.focusId));
        return;
      }
      if (next.kind === "none") {
        // 서랍에서 지금 화면을 다시 고름: 겹침 칸을 뺀 뒤 다시 고름(탭을 다시 누른 것과 같다)
        commit(reselected(arrived(entry, "pop", null), waiting.focusId));
        return;
      }
      apply(next, waiting.focusId, entry);
      return;
    }
    if (entry.overlay !== undefined) {
      // 앞으로 가기로 겹침 칸에 왔다: 겹침은 사람이 누를 때만 연다 → 그 칸을 다시 뺀다(화면은 그대로)
      pending = { expectIndex: entry.index - 1, at: env.now(), after: null, focusId: null };
      commit(arrived(entry, "pop", null, null));
      env.history.go(-1);
      return;
    }
    commit(arrived(entry, "pop", null));
  };

  return {
    start() {
      if (snapshot !== null) return;
      stopPop = env.onPopState(onPopState);
      const url = env.currentUrl();
      const saved = readEntryState(env.history.state);
      if (saved === null) {
        const entry = rootState(url, env.newKey());
        env.history.replaceState(entry, "", url);
        commit(arrived(entry, "initial", null));
        return;
      }
      commit(arrived(saved, "initial", null, null));
      // 새로고침했는데 겹침 칸이다: 그 칸을 바로 뺀다(겹침은 다시 열지 않는다, ADR 37 2절). 화면은 그대로라 처음 켠 것으로 남는다
      if (saved.overlay !== undefined) apply({ kind: "go", delta: -1, after: null }, null, saved);
    },
    stop() {
      stopPop?.();
      stopPop = null;
    },
    getSnapshot: current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    navigate(target, options = {}) {
      if (busy()) return false;
      const now = current();
      const plan = planNavigation(now.entry, env.currentUrl(), targetPath(target), options, env.newKey);
      apply(plan, options.focusId ?? null, now.entry);
      return true;
    },
    back() {
      if (busy()) return;
      const now = current();
      apply(planBack(now.entry, env.currentUrl(), env.newKey), null, now.entry);
    },
    openOverlay(kind) {
      if (busy()) return;
      const now = current();
      if (now.entry.overlay !== undefined) return;
      const state: EntryState = {
        ...now.entry,
        key: env.newKey(),
        index: now.entry.index + 1,
        overlay: kind,
        base: now.entry.key,
      };
      // 같은 주소(#조각 포함)로 한 칸. 화면은 그대로다(version·via를 두고 겹침만 바뀐다)
      env.history.pushState(state, "", env.currentUrl());
      commit(arrived(state, "push", null));
    },
    closeOverlay() {
      const now = current();
      if (now.entry.overlay === undefined || busy()) return false;
      apply({ kind: "go", delta: -1, after: null }, null, now.entry);
      return true;
    },
    resetToHome() {
      pending = null;
      const now = current();
      const { entry } = now;
      const home = targetPath({ route: "home" });
      if (
        entry.overlay === undefined &&
        withoutHash(env.currentUrl()) === home &&
        entry.home === entry.index
      ) {
        return;
      }
      // 사슬 안 앱 홈 칸(없으면 사슬의 첫 칸)까지 돌아가 새 열쇠의 홈으로 바꾼다: 기록에 홈이 한 칸만 남아
      // 뒤로 → 앱 닫힘이 같다(겹침 칸이면 그 칸도 함께 빠진다). 새 열쇠라 앞 계정이 보던 스크롤을 되돌리지 않는다
      const landing = entry.home ?? entry.root;
      const toHome = (landed: EntryState): NavigationPlan => ({
        kind: "replace",
        url: home,
        state: stateAt(landed, "home", env.newKey()),
      });
      apply(
        landing === entry.index ? toHome(entry) : { kind: "go", delta: landing - entry.index, after: toHome },
        null,
        entry,
      );
    },
  };
}
