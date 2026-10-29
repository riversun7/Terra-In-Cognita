// 화면 틀(W1)이 줄 부품의 홈 쪽 자리 — 홈은 틀의 부품을 이 파일로만 쓴다. W1이 합쳐지면 이 파일의 몸만 바꾼다(꽂는 줄).
// [임시] W1 전에는 가장 단순한 대신 것을 둔다. 받는 값의 모양은 W1 가지(work/app-shell-w1, 커밋 571d8a9)의 부품과 같게 했다.
// - HomeLink: 앱 안 링크. 받는 값은 W1 shell/AppLink.tsx와 같은 { to: RouteTarget }이다. 지금은 보통 <a>(누르면 페이지를 새로 연다).
//   W1 뒤: `export { AppLink as HomeLink } from "../shell/AppLink.tsx";`(보조 키·가운데 버튼·target은 브라우저에 맡기는 규칙은 AppLink가 지킨다).
// - DiagnosticsBody: 연결·성능 카드의 몸. 지금은 기능 통로(serverLink)의 연결 여부 + 프레임 측정. W1 뒤:
//   `const { status } = useConnectionStatus();`(../net/connectionStatus.ts, 돌려주는 값은 { status, lost }) →
//   `<DiagnosticsPanel status={status} monitor={monitor} />`(../ui/DiagnosticsPanel.tsx).
// - useSheetOverlay: 편집 시트가 열렸는지와 열기·닫기. 사람이 연 겹침이라 열 때 같은 주소로 기록 한 칸을 쌓고, 뒤로 → 닫힘(ADR 37 2절 표).
//   지금은 화면 상태로만 둔다(뒤로는 앞 화면으로 간다. 시트는 <dialog>의 Esc·닫기 요청·[닫기]·바탕 누르기로 닫힌다). W1 뒤(몸만 바꾼다,
//   ../shell/routerStore.ts — W1 서랍과 같은 방식: 열림은 라우터의 겹침 칸이 정한다):
//     const overlay = useRoute().overlay;
//     const show = useCallback(() => { setShown(true); openOverlay("sheet"); }, []);
//     const hide = useCallback(() => { setShown(false); closeOverlay(); }, []);
//     return { open: shown && overlay === "sheet", show, hide };
//   열기는 누르기 처리기에서만 한다. 효과에서 열면 개발 모드(StrictMode)의 효과 두 번 돌리기가 열기 → 닫기 → 다시 열기가 되는데,
//   닫기(history.go(-1))가 늦게 끝나는 동안 라우터가 다시 열기를 무시해서 시트가 열리자마자 닫힌다. 뒤로로 겹침 칸이 빠지면 open이
//   false가 되어 시트가 화면에서 내려간다(닫힘 알림 없이. 초점은 HomeScreen이 열림이 꺼진 것을 보고 [편집]으로 돌려준다).
import type { RouteTarget } from "@terra/shared";
import { targetPath } from "@terra/shared";
import { type ReactNode, useCallback, useState, useSyncExternalStore } from "react";
import { serverLink } from "../net/serverLink.ts";
import { m } from "../paraglide/messages.js";
import type { FrameMonitor } from "../perf/frameMonitor.ts";
import { usePerfStats } from "../perf/usePerfStats.ts";

interface HomeLinkProps {
  /** 갈 화면(주소 표의 RouteTarget. W1 AppLink와 같은 칸 이름) */
  readonly to: RouteTarget;
  readonly className?: string | undefined;
  readonly children: ReactNode;
  readonly "aria-label"?: string | undefined;
  readonly "aria-describedby"?: string | undefined;
}

/** 앱 안 링크. W1 뒤: <AppLink>(같은 받는 값) */
export function HomeLink({ to, className, children, ...aria }: HomeLinkProps) {
  return (
    <a href={targetPath(to)} className={className} {...aria}>
      {children}
    </a>
  );
}

const subscribeLink = (listener: () => void): (() => void) => serverLink.listen(listener);
const linkReady = (): boolean => serverLink.isReady();

/** 연결·성능 카드의 몸. W1 뒤: <DiagnosticsPanel status={useConnectionStatus().status} monitor={monitor} /> */
export function DiagnosticsBody({ monitor }: { monitor: FrameMonitor }) {
  const ready = useSyncExternalStore(subscribeLink, linkReady, linkReady);
  // 1초마다 바뀌는 성능 값은 이 부품만 다시 그린다
  const perf = usePerfStats(monitor);
  return (
    <div className="home-diagnostics">
      <p className="status connection" role="status" data-state={ready ? "connected" : "connecting"}>
        {ready ? m.status_connected() : m.status_connecting()}
      </p>
      {perf === null ? null : (
        <p className="metrics">
          {m.fps({ fps: perf.fps })} · {m.frame_p95({ ms: perf.p95Ms })}
          {perf.memoryMb === undefined ? null : ` · ${m.memory({ mb: perf.memoryMb })}`}
        </p>
      )}
    </div>
  );
}

/** 편집 시트의 열림과 열기·닫기(HomeScreen이 쓴다) */
export interface SheetOverlay {
  readonly open: boolean;
  /** [편집]을 눌렀을 때(누르기 처리기에서만 부른다) */
  readonly show: () => void;
  /** 시트가 스스로 닫혔을 때(Esc·[닫기]·바탕 누르기 — <dialog>의 close 알림) */
  readonly hide: () => void;
}

/**
 * 편집 시트의 열림. [임시] W1 전: 화면 상태로만 둔다. W1 뒤: 라우터의 겹침 칸과 함께(머리 주석의 꽂는 줄).
 */
export function useSheetOverlay(): SheetOverlay {
  const [shown, setShown] = useState(false);
  const show = useCallback(() => setShown(true), []);
  const hide = useCallback(() => setShown(false), []);
  return { open: shown, show, hide };
}
