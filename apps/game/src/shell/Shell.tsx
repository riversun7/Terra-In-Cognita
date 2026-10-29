// 화면 틀 — 위 띠·하단 탭·사이드 메뉴(레일·서랍)와 본문(ADR 2026-10-29-app-shell 2·3·10절, D-6004·D-6007·D-6010·D-265).
// 폭 3단계는 CSS(shell.css·tabbar.css)가 정한다: 좁음 = 하단 탭 + ☰ 서랍, 중간 = 접는 레일, 넓음 = 늘 펼친 사이드 메뉴.
// 틀을 숨기는 주소(지도·행성 편집기)는 화면만 그리고, 연결 줄·지도 안 단추·방향 안내를 전역 층에 띄운다.
// 주소가 바뀌어 새 화면이 그려지면(routeViews.tsx RouteSettled) 문서 제목·스크롤·초점을 맞춘다:
// - 스크롤: 쌓기 = 맨 위, 뒤로·앞으로 = 그 칸에서 보던 곳, 첫 단계 화면끼리 바꾸기 = 그 화면에서 보던 곳(화면 ID마다 기억).
// - 초점: 앱 안에서 옮기면 새 화면 제목(h1). 처음 켤 때는 옮기지 않는다(화면의 useMountFocus도 — routeViews.tsx).
// 겹침(서랍·편집 시트)만 열고 닫는 것은 화면이 바뀐 것이 아니다(라우터 version 그대로): 스크롤·제목·초점을 건드리지 않고,
// 닫으면 <dialog>가 연 단추로 돌려준 초점을 그대로 둔다. 겹침이 열린 동안에는 스크롤을 기억하지 않는다.
// 지금 화면을 다시 고르면(라우터 reselects) focusId 칸에 초점을 두거나 맨 위로 올린다.
// 꽂는 줄 자리: 복귀 요약(W3)은 맨 아래 주석 줄이다. 종 배지는 TopBar.tsx, 화면은 routeViews.tsx.
import { type AccountView, ROUTES, canOpenRoute } from "@terra/shared";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { m } from "../paraglide/messages.js";
import type { FrameMonitor } from "../perf/frameMonitor.ts";
import { ConnectionNotice } from "./ConnectionNotice.tsx";
import { MapSwitch } from "./MapSwitch.tsx";
import { OrientationHint } from "./OrientationHint.tsx";
import { RouteView, documentTitle } from "./routeViews.tsx";
import type { RouterSnapshot } from "./router.ts";
import { routeKind } from "./router.ts";
import { closeOverlay, openOverlay, useRoute } from "./routerStore.ts";
import { setRailExpanded, useNavigation, useRailExpanded } from "./shellPrefs.ts";
import { SideMenu } from "./SideMenu.tsx";
import { type MenuBadges, TabBar } from "./TabBar.tsx";
import { TopBar } from "./TopBar.tsx";
import { useLayout } from "./useLayout.ts";
import "./shell.css";
import "./overlays.css";

/** 메뉴 항목 배지(처리할 일 inbox.list의 badges). 지금 배지를 거는 처리할 일 종류가 없다(ADR 37 4절) */
const NO_BADGES: MenuBadges = {};

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
  const { match } = route;
  const current = match?.id ?? null;
  const allowed = match === null || canOpenRoute(match.id, user.roles);
  const hidden = match !== null && allowed && ROUTES[match.id].frame === "hidden";
  const narrow = layout.stage === "narrow";
  const tabsShown = !hidden && narrow;
  const onSettled = useRouteEffects(route, allowed);

  // 폭이 넓어져(가로로 돌림 등) 서랍이 필요 없어지면 서랍 칸을 뺀다
  useEffect(() => {
    if (route.overlay === "drawer" && (!narrow || hidden)) closeOverlay();
  }, [route.overlay, narrow, hidden]);

  // 하단 탭이 있는 동안 새 버전 배너를 탭 위로 올리고(styles.css :root[data-tabbar]), 위 띠·하단 탭 높이만큼
  // 스크롤 여백을 둔다(shell.css :root[data-topbar]·[data-tabbar] — 초점 둔 요소가 가려지지 않게)
  useEffect(() => {
    const root = document.documentElement;
    root.toggleAttribute("data-tabbar", tabsShown);
    root.toggleAttribute("data-topbar", !hidden);
    return () => {
      root.removeAttribute("data-tabbar");
      root.removeAttribute("data-topbar");
    };
  }, [tabsShown, hidden]);

  const view = (
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
        {current === "map" || current === "map_planet" ? (
          <>
            <MapSwitch route={current} />
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
        <nav className="frame-side" aria-label={m.shell_menu()}>
          <SideMenu variant="side" user={user} nav={nav} current={current} badges={NO_BADGES} />
        </nav>
        <header className="frame-top">
          <TopBar
            onMenu={onMenu}
            railExpanded={layout.stage === "medium" ? railExpanded : null}
            current={current}
          />
          <ConnectionNotice floating={false} showLost />
        </header>
        <main id="main" className="frame-main" tabIndex={-1}>
          {view}
        </main>
        <TabBar
          nav={nav}
          slots={layout.tabSlots[nav.layout]}
          current={current}
          badges={NO_BADGES}
          onMenu={onMenu}
        />
        <Drawer open={route.overlay === "drawer" && narrow}>
          <SideMenu
            variant="drawer"
            user={user}
            nav={nav}
            current={current}
            badges={NO_BADGES}
            onClose={() => closeOverlay()}
          />
        </Drawer>
      </div>
    );
  }

  return (
    <>
      {frame}
      {/* 꽂는 줄(W3): 복귀 요약 <ReturnSummary />(어느 주소 위에도 뜨는 겹침, 기록 칸을 쌓지 않는다) */}
    </>
  );
}
