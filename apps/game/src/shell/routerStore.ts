// 브라우저에 붙인 라우터 하나 — window.history·location을 router.ts에 넣고, 화면은 useRoute()로 읽는다.
// main.tsx가 startRouter()를 화면을 그리기 전에 한 번 부른다(history.scrollRestoration = "manual"도 그때).
// 화면이 바뀌면 원격 측정 보고의 page를 경로 패턴으로 바꾼다(예: `/units/:unitId`. ID는 보내지 않는다, ADR 37 1절).
import { ROUTES, type RouteTarget } from "@terra/shared";
import { useSyncExternalStore } from "react";
import { setTelemetryPage } from "../telemetry/reporter.ts";
import {
  type NavigateOptions,
  type OverlayKind,
  type Router,
  type RouterSnapshot,
  createRouter,
} from "./router.ts";

/** 없는 화면의 원격 측정 page(주소 글자를 그대로 보내지 않는다) */
const UNKNOWN_PAGE = "/*";

let router: Router | null = null;

function started(): Router {
  if (router === null) throw new Error("router not started (main.tsx startRouter)");
  return router;
}

/** 칸 열쇠 — 스크롤 기억용이라 겹치지만 않으면 된다(보안 쓰임 아님) */
function newKey(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 원격 측정 보고의 page = 지금 화면의 경로 패턴 */
function reportPage(): void {
  const match = started().getSnapshot().match;
  setTelemetryPage(match === null ? UNKNOWN_PAGE : ROUTES[match.id].path);
}

/** 앱 시작 때 한 번 부른다(main.tsx) */
export function startRouter(): void {
  if (router !== null) return;
  router = createRouter({
    history: window.history,
    currentUrl: () => `${window.location.pathname}${window.location.search}${window.location.hash}`,
    onPopState(listener) {
      window.addEventListener("popstate", listener);
      return () => window.removeEventListener("popstate", listener);
    },
    newKey,
    now: () => Date.now(),
  });
  router.subscribe(reportPage);
  router.start();
  reportPage();
}

const subscribe = (listener: () => void): (() => void) => started().subscribe(listener);
const getSnapshot = (): RouterSnapshot => started().getSnapshot();

export function useRoute(): RouterSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function getRoute(): RouterSnapshot {
  return getSnapshot();
}

export function navigate(target: RouteTarget, options?: NavigateOptions): boolean {
  return started().navigate(target, options);
}

/** 화면 안 [뒤로] */
export function goBack(): void {
  started().back();
}

export function openOverlay(kind: OverlayKind): void {
  started().openOverlay(kind);
}

export function closeOverlay(): boolean {
  return started().closeOverlay();
}

/** 로그아웃·다른 계정으로 들어옴 */
export function resetToHome(): void {
  started().resetToHome();
}
