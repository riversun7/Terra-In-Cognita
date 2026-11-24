// 화면 틀 — 위 띠·하단 탭·사이드 메뉴(레일·서랍)와 본문(ADR 2026-10-29-app-shell 2·3·10절, D-6004·D-6007·D-6010·D-265).
// 폭 3단계는 CSS(shell.css·tabbar.css)가 정한다: 좁음 = 하단 탭 + ☰ 서랍, 중간 = 접는 레일, 넓음 = 늘 펼친 사이드 메뉴.
// 틀을 숨기는 주소(지도·행성 편집기)는 화면만 그리고, 연결 줄·지도 안 단추·방향 안내를 전역 층에 띄운다.
// 주소가 바뀌어 새 화면이 그려지면(routeViews.tsx RouteSettled) 문서 제목·스크롤·초점을 맞춘다:
// - 스크롤: 쌓기 = 맨 위, 뒤로·앞으로 = 그 칸에서 보던 곳, 첫 단계 화면끼리 바꾸기 = 그 화면에서 보던 곳(화면 ID마다 기억).
// - 초점: 앱 안에서 옮기면 새 화면 제목(h1). 처음 켤 때는 옮기지 않는다(화면의 useMountFocus도 — routeViews.tsx).
// 겹침(서랍·편집 시트)만 열고 닫는 것은 화면이 바뀐 것이 아니다(라우터 version 그대로): 스크롤·제목·초점을 건드리지 않고,
// 닫으면 <dialog>가 연 단추로 돌려준 초점을 그대로 둔다. 겹침이 열린 동안에는 스크롤을 기억하지 않는다.
// 지금 화면을 다시 고르면(라우터 reselects) focusId 칸에 초점을 두거나 맨 위로 올린다.
// 복귀 요약(W3, summary/ReturnSummary.tsx)은 틀 밖 겹침으로 맨 아래에 그린다. 종 배지는 TopBar.tsx, 화면은 routeViews.tsx.
import { type AccountView, ROUTES, canOpenRoute, menuRoute } from "@terra/shared";
import { type ReactNode, Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useInboxMenuBadges } from "../inbox/store.ts";
import { m } from "../paraglide/messages.js";
import type { FrameMonitor } from "../perf/frameMonitor.ts";
import { ReturnSummary } from "../summary/ReturnSummary.tsx";
import { ChunkErrorBoundary } from "../ui/ChunkErrorBoundary.tsx";
import { ConnectionNotice } from "./ConnectionNotice.tsx";
import { MapSwitch } from "./MapSwitch.tsx";
import { OrientationHint } from "./OrientationHint.tsx";
import { RouteView, documentTitle } from "./routeViews.tsx";
import type { RouterSnapshot } from "./router.ts";
import { routeKind } from "./router.ts";
import { closeOverlay, navigate, openOverlay, useRoute } from "./routerStore.ts";
import { applyDevSurface, isDevSurfaceRoute, useDevTheme } from "./devSurface.ts";
import { setRailExpanded, useNavigation, useRailExpanded } from "./shellPrefs.ts";
import { SIDE_NAV_ID, SideMenu } from "./SideMenu.tsx";
import { TabBar } from "./TabBar.tsx";
import { TopBar } from "./TopBar.tsx";
import { ChatDock } from "./chat/ChatDock.tsx";
import { useLayout } from "./useLayout.ts";
import { gateHolds, gateRedirect, useCyborgGate } from "../start/cyborgGate.ts";
import "./shell.css";
import "./overlays.css";

// 정찰 끝 화면 알림(기획 답 612 나, map/ScoutWatch.tsx): 지연 조각 — 첫 화면 묶음에 tRPC 클라이언트를 넣지 않는다
const ScoutWatch = lazy(() => import("../map/ScoutWatch.tsx"));
// 상단 핵심 자산·상태 요약 바(StatusStrip.tsx): 지연 조각 — 첫 화면 묶음에 tRPC 클라이언트를 넣지 않는다
const StatusStrip = lazy(() => import("./StatusStrip.tsx"));

/** 칸 열쇠 → 그 칸에서 보던 스크롤 위치(뒤로·앞으로) */
const entryScroll = new Map<string, number>();
/** 첫 단계 화면 ID → 보던 스크롤 위치(탭끼리는 칸을 바꾸므로 화면마다 기억한다, ADR 37 1절) */
const topScroll = new Map<string, number>();

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** 새 화면이 그려진 뒤 맞출 스크롤 위치. null이면 그대로 둔다(앱을 켬) */
function restoreTarget(route: RouterSnapshot): number | null {
  const id = route.match?.id ?? null;
  switch (route.via) {
    case "initial":
      return null;
    case "pop":
      return entryScroll.get(route.entry.key) ?? 0;
    case "replace":
      return id !== null && routeKind(id) === "top" ? (topScroll.get(id) ?? 0) : 0;
    case "push":
      return 0;
    default: {
      const unhandled: never = route.via;
      return unhandled;
    }
  }
}

/** 요소에 초점을 둔다(초점을 받지 않는 요소면 받게 한다) */
function focusElement(target: HTMLElement, preventScroll: boolean): void {
  if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
  target.focus({ preventScroll });
}

/** 스크롤 위치를 칸·첫 단계 화면마다 기억하고, 새 화면이 그려지면 제목·스크롤·초점을 맞춘다 */
function useRouteEffects(route: RouterSnapshot, allowed: boolean): (version: number) => void {
  const routeRef = useRef(route);
  const allowedRef = useRef(allowed);
  const settledRef = useRef(0);
  /**
   * 스크롤을 기억해도 되는 때인지: 새 화면이 그려져 스크롤을 맞춘 뒤(settled)부터 다음 화면으로 바뀔 때까지.
   * 바뀌는 사이(짧은 새 화면이 그려지며 줄어든 스크롤)가 새 화면 몫으로 적히지 않게 한다
   */
  const recordingRef = useRef(false);
  // 그리기 전에 바꾼다: 새 화면이 그려진 뒤의 스크롤 이벤트가 앞 칸 열쇠에 적히지 않게
  useLayoutEffect(() => {
    if (routeRef.current.version !== route.version) recordingRef.current = false;
    routeRef.current = route;
    allowedRef.current = allowed;
  }, [route, allowed]);

  useEffect(() => {
    let frame = 0;
    const save = (): void => {
      frame = 0;
      const now = routeRef.current;
      // 겹침이 열린 동안(뒤 화면은 그대로 둔다)·새 화면이 그려지기 전에는 적지 않는다
      if (!recordingRef.current || now.overlay !== null || now.entry.overlay !== undefined) return;
      entryScroll.set(now.entry.key, window.scrollY);
      const id = now.match?.id;
      if (id !== undefined && routeKind(id) === "top") topScroll.set(id, window.scrollY);
    };
    const onScroll = (): void => {
      if (frame === 0) frame = requestAnimationFrame(save);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, []);

  // 지금 화면을 다시 고름 → focusId 칸에 초점(그 칸이 보이게), 없으면 맨 위로(처음 값은 건너뛴다)
  const reselectsRef = useRef(route.reselects);
  useEffect(() => {
    if (route.reselects === reselectsRef.current) return undefined;
    reselectsRef.current = route.reselects;
    const smooth = prefersReducedMotion() ? "auto" : "smooth";
    const target = route.focusId === null ? null : document.getElementById(route.focusId);
    if (target === null) {
      window.scrollTo({ top: 0, behavior: smooth });
      return undefined;
    }
    // 서랍 닫힘이 초점을 ☰로 돌려준 뒤에 옮긴다
    const frame = requestAnimationFrame(() => {
      focusElement(target, true);
      target.scrollIntoView({ block: "start", behavior: smooth });
    });
    return () => cancelAnimationFrame(frame);
  }, [route.reselects, route.focusId]);

  return useCallback((version: number) => {
    const now = routeRef.current;
    if (version !== now.version || settledRef.current === version) return;
    settledRef.current = version;
    document.title = documentTitle(now.match, allowedRef.current);
    const top = restoreTarget(now);
    if (top !== null) window.scrollTo(0, top);
    recordingRef.current = true;
    if (now.via === "initial") return;
    // 다른 효과(서랍 닫힘이 초점을 ☰로 돌려줌 등)가 끝난 뒤에 옮긴다
    requestAnimationFrame(() => {
      const target =
        (now.focusId === null ? null : document.getElementById(now.focusId)) ??
        document.querySelector<HTMLElement>("#main h1");
      if (target === null) return;
      focusElement(target, now.focusId === null);
      if (now.focusId !== null) target.scrollIntoView({ block: "start" });
    });
  }, []);
}

/**
 * ☰ 서랍(좁은 폭) — <dialog>.showModal()로 열어 초점을 가둔다. 열 때 라우터가 같은 주소로 기록 한 칸을 쌓는다.
 * 닫기 단추·Esc·안드로이드 뒤로(닫기 요청)·바깥 누르기로 닫히면 그 칸을 뺀다(closeOverlay). 뒤로로 그 칸이 빠지면 닫는다.
 * 닫으면 브라우저가 초점을 연 단추로 돌려준다.
 */
function Drawer({ open, children }: { open: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="frame-drawer"
      aria-label={m.shell_menu()}
      onClose={() => closeOverlay()}
      onClick={(event) => {
        // 바깥(뒤 막) 누르기: 서랍 판은 안쪽 요소가 꽉 채우므로 대화상자 자신이 눌리면 바깥이다
        if (event.target === event.currentTarget) closeOverlay();
      }}
    >
      {open ? children : null}
    </dialog>
  );
}

/** 본문으로 건너뛰기 — 주소에 #main을 남기지 않게(기록 칸이 생기지 않게) 직접 초점을 옮긴다 */
function SkipLink() {
  return (
    <a
      className="skip-link"
      href="#main"
      onClick={(event) => {
        event.preventDefault();
        document.getElementById("main")?.focus();
      }}
    >
      {m.shell_skip_to_content()}
    </a>
  );
}

export function Shell({ user, monitor }: { user: AccountView; monitor: FrameMonitor }) {
  const route = useRoute();
  const layout = useLayout();
  const nav = useNavigation();
  const railExpanded = useRailExpanded();
  // 메뉴 항목 배지(처리할 일 inbox.list의 badges, ADR 37 4·7절)
  const badges = useInboxMenuBadges();
  const { match } = route;
  // 메뉴(하단 탭·사이드 메뉴)의 지금 화면: 하위 화면(예: /economy/market/…)은 그 메뉴 항목으로 본다
  const current = match === null ? null : menuRoute(match.id);
  const allowed = match === null || canOpenRoute(match.id, user.roles);
  // 첫 접속 길잡이(start/cyborgGate.ts): 사이보그가 없으면 /start로, 만들었으면 /start에서 홈으로. 묻는 중·보내는 중에는
  // 그 주소를 그리지 않고 틀 없이 "확인 중"만 보인다(사이보그 없는 플레이어에게 메뉴가 잠깐 보이지 않게)
  const gate = useCyborgGate(user.id);
  const gateId = match?.id ?? null;
  const redirect = gateRedirect(gate, gateId, user.roles);
  const holding = gateHolds(gate, gateId, user.roles);
  useEffect(() => {
    if (redirect !== null) navigate({ route: redirect }, { replace: true });
  }, [redirect]);
  const hidden = holding || (match !== null && allowed && ROUTES[match.id].frame === "hidden");
  const narrow = layout.stage === "narrow";
  const tabsShown = !hidden && narrow;
  const onSettled = useRouteEffects(route, allowed);
  // 개발·관리자 화면은 개발 화면 층(devSurface.ts): 그리기 전에 <html> 표시를 붙여 게임 테마로 잠깐 그려지지 않게 한다
  const devTheme = useDevTheme();
  const devSurface = !holding && match !== null && allowed && isDevSurfaceRoute(match.id);
  useLayoutEffect(() => {
    applyDevSurface(devSurface, devTheme);
    return () => applyDevSurface(false, devTheme);
  }, [devSurface, devTheme]);

  // 폭이 넓어져(가로로 돌림 등) 서랍이 필요 없어지면 서랍 칸을 뺀다
  useEffect(() => {
    if (route.overlay === "drawer" && (!narrow || hidden)) closeOverlay();
  }, [route.overlay, narrow, hidden]);

  // 하단 탭이 있는 동안 새 버전 배너를 탭 위로 올리고, 위 띠·하단 탭 높이만큼 본문 요소의 스크롤 여백(scroll-margin)을
  // 둔다(shell.css :root[data-topbar]·[data-tabbar] — 초점 둔 요소가 가려지지 않게). 값은 배치(c·a)다
  useEffect(() => {
    const root = document.documentElement;
    if (tabsShown) root.setAttribute("data-tabbar", nav.layout);
    else root.removeAttribute("data-tabbar");
    root.toggleAttribute("data-topbar", !hidden);
    return () => {
      root.removeAttribute("data-tabbar");
      root.removeAttribute("data-topbar");
    };
  }, [tabsShown, hidden, nav.layout]);

  const view = holding ? (
    <p className="status shell-loading" role="status">
      {m.start_gate_checking()}
    </p>
  ) : (
    <RouteView
      match={match}
      allowed={allowed}
      user={user}
      monitor={monitor}
      version={route.version}
      openedInApp={route.via !== "initial"}
      onSettled={onSettled}
    />
  );

  let frame: ReactNode;
  if (hidden) {
    frame = (
      <>
        <main id="main" className="bare-main">
          {view}
        </main>
        <ConnectionNotice floating showLost />
        {!holding && (current === "map" || current === "map_planet") ? (
          <>
            {/* 2차맵은 화면 안 아래 탭 [1차맵]이 전환을 맡는다(map/MapBottomNav.tsx, 사용자 지적 2026-11-12) */}
            {current === "map_planet" ? <MapSwitch route={current} /> : null}
            <OrientationHint />
          </>
        ) : null}
      </>
    );
  } else {
    const onMenu = (): void => {
      if (narrow) openOverlay("drawer");
      else setRailExpanded(!railExpanded);
    };
    frame = (
      <div
        className="frame"
        data-nav-layout={nav.layout}
        data-rail={layout.stage === "medium" && !railExpanded ? "collapsed" : "expanded"}
      >
        <SkipLink />
        <nav className="frame-side" id={SIDE_NAV_ID} aria-label={m.shell_menu()}>
          <SideMenu variant="side" user={user} nav={nav} current={current} badges={badges} />
        </nav>
        <header className="frame-top">
          <TopBar
            onMenu={onMenu}
            railExpanded={layout.stage === "medium" ? railExpanded : null}
            current={current}
            devTheme={devSurface ? devTheme : null}
            look={gate.status === "ready" ? gate.look : null}
          />
          {devSurface ? null : (
            <ChunkErrorBoundary fallback={null}>
              <Suspense fallback={<div className="status-strip-placeholder" aria-hidden="true" />}>
                <StatusStrip />
              </Suspense>
            </ChunkErrorBoundary>
          )}
          <ConnectionNotice floating={false} showLost />
        </header>
        <main id="main" className="frame-main" tabIndex={-1}>
          {view}
        </main>
        {devSurface ? null : <ChatDock variant="shell" authorName={user.loginId} />}
        <TabBar
          nav={nav}
          slots={layout.tabSlots[nav.layout]}
          current={current}
          badges={badges}
          onMenu={onMenu}
        />
        <Drawer open={route.overlay === "drawer" && narrow}>
          <SideMenu
            variant="drawer"
            user={user}
            nav={nav}
            current={current}
            badges={badges}
            onClose={() => closeOverlay()}
          />
        </Drawer>
      </div>
    );
  }

  return (
    <>
      {frame}
      {/* 복귀 요약: 어느 주소 위에도 뜨는 겹침, 기록 칸을 쌓지 않는다. 숫자를 누르면 닫고 그 화면으로(쌓기) */}
      <ReturnSummary onNavigate={navigate} />
      {holding ? null : (
        <ChunkErrorBoundary fallback={null}>
          <Suspense fallback={null}>
            <ScoutWatch />
          </Suspense>
        </ChunkErrorBoundary>
      )}
    </>
  );
}
