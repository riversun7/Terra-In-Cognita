// 연결·성능 진단 본문 — 서버 연결 상태, 시계 차이, 성능 값(fps·프레임 시간 p95·메모리), 거절 때 [새로고침].
// 전에는 상태 화면(StatusPanel.tsx)이었다. 홈(W4 전까지는 임시 홈)과 홈의 "연결·성능" 카드가 감싸서 쓴다(제목은 감싸는 쪽).
// 1초마다 바뀌는 성능 값은 이 부품만 다시 그리게 여기서 읽는다.
import type { ConnectionStatus } from "../net/connection.ts";
import { m } from "../paraglide/messages.js";
import type { FrameMonitor } from "../perf/frameMonitor.ts";
import { usePerfStats } from "../perf/usePerfStats.ts";
import { ReloadButton, statusText } from "../shell/ConnectionNotice.tsx";

export function DiagnosticsPanel({ status, monitor }: { status: ConnectionStatus; monitor: FrameMonitor }) {
  const perf = usePerfStats(monitor);
  return (
    <div className="diagnostics">
      {/* 연결 상태 알약 — 점 색은 꾸밈이고 상태는 글자로 읽는다. 끊김·거절은 틀의 연결 줄(알림 영역)이 알리므로
          여기는 알림 영역으로 두지 않는다(두 번 읽히지 않게) */}
      <p className="status connection" data-state={status.kind}>
        {statusText(status)}
      </p>
      {status.kind === "connected" && status.clock ? (
        <p className="metrics">
          {m.clock_offset({
            offset: Math.round(status.clock.offsetMs),
            rtt: Math.round(status.clock.roundTripMs),
          })}
        </p>
      ) : null}
      {perf !== null ? (
        <p className="metrics">
          {m.fps({ fps: perf.fps })} · {m.frame_p95({ ms: perf.p95Ms })}
          {perf.memoryMb === undefined ? null : ` · ${m.memory({ mb: perf.memoryMb })}`}
        </p>
      ) : null}
      {status.kind === "rejected" ? <ReloadButton /> : null}
    </div>
  );
}
