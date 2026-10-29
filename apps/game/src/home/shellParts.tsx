// 화면 틀(W1)이 줄 부품의 홈 쪽 자리 — 홈은 틀의 부품을 이 파일로만 쓴다. W1이 합쳐지면 이 파일의 몸만 바꾼다(꽂는 줄).
// [임시] W1 전에는 가장 단순한 대신 것을 둔다.
// - HomeLink: 앱 안 링크. 지금은 보통 <a>(누르면 페이지를 새로 연다). W1 뒤: shell/AppLink.tsx의 <AppLink>로 바꾼다
//   (보조 키·가운데 버튼·target은 브라우저에 맡기는 규칙은 AppLink가 지킨다, ADR 2026-10-29-app-shell 1절).
// - DiagnosticsBody: 연결·성능 카드의 몸. 지금은 기능 통로(serverLink)의 연결 여부 + 프레임 측정. W1 뒤:
//   <DiagnosticsPanel status={useConnectionStatus()} monitor={monitor} />(ui/DiagnosticsPanel.tsx, net/connectionStatus.ts).
// - useOverlayEntry: 편집 시트를 열 때 같은 주소로 기록 한 칸을 쌓고, 뒤로 → 닫힘, 닫히면 그 칸을 뺀다(ADR 37 2절 표).
//   지금은 아무것도 하지 않는다(시트는 <dialog>의 Esc·닫기 요청으로 닫힌다). W1 뒤: 라우터의 겹침 도우미를 부른다.
import { type ReactNode, useSyncExternalStore } from "react";
import { serverLink } from "../net/serverLink.ts";
import { m } from "../paraglide/messages.js";
import type { FrameMonitor } from "../perf/frameMonitor.ts";
import { usePerfStats } from "../perf/usePerfStats.ts";

interface HomeLinkProps {
  readonly href: string;
  readonly className?: string | undefined;
  readonly children: ReactNode;
  readonly "aria-label"?: string | undefined;
  readonly "aria-describedby"?: string | undefined;
}

/** 앱 안 링크. W1 뒤: <AppLink>(href 대신 주소 표의 RouteTarget을 받으면 부르는 곳의 href 만들기를 함께 바꾼다) */
export function HomeLink({ href, className, children, ...aria }: HomeLinkProps) {
  return (
    <a href={href} className={className} {...aria}>
      {children}
    </a>
  );
}

const subscribeLink = (listener: () => void): (() => void) => serverLink.listen(listener);
const linkReady = (): boolean => serverLink.isReady();

/** 연결·성능 카드의 몸. W1 뒤: <DiagnosticsPanel status={useConnectionStatus()} monitor={monitor} /> */
export function DiagnosticsBody({ monitor }: { monitor: FrameMonitor }) {
  const ready = useSyncExternalStore(subscribeLink, linkReady);
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

/**
 * 사람이 연 겹침(편집 시트)의 기록 칸. open이면 칸을 쌓고, 뒤로 가면 onClose를 부르고, 닫히면 칸을 뺀다.
 * [임시] W1 전: 아무것도 하지 않는다. W1 뒤: 라우터의 겹침 도우미로 바꾼다.
 */
export function useOverlayEntry(_open: boolean, _onClose: () => void): void {
  // W1의 라우터가 생기면 여기서 겹침 칸을 쌓고 뺀다
}
