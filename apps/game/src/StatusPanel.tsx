// 상태 화면(M0) — 서버 연결 상태, 시계 차이, 성능 오버레이(fps·프레임 시간 p95·메모리). 로그인하면 보인다.
// 서버 거절 안내(RejectedNotice)는 로그인 화면·관리자 화면에서도 쓴다.
import type { ConnectionStatus } from "./net/connection.ts";
import { m } from "./paraglide/messages.js";
import type { FrameMonitor } from "./perf/frameMonitor.ts";
import { usePerfStats } from "./perf/usePerfStats.ts";
import { forceUpdate } from "./pwa/updates.ts";

export function statusText(status: ConnectionStatus): string {
  switch (status.kind) {
    case "connecting":
      return m.status_connecting();
    case "connected":
      return m.status_connected();
    case "disconnected":
      return m.status_disconnected();
    case "rejected":
      return status.code === "protocol_unsupported"
        ? m.status_rejected_protocol()
        : m.status_rejected_other();
    default: {
      // 새 상태가 추가되면 여기서 타입 오류가 난다
      const unhandled: never = status;
      return unhandled;
    }
  }
}

/** 자동 적용이 막혔을 때(1분 안에 이미 자동 새로고침함)를 위한 손 버튼. 그냥 새로고침하면 SW가 옛 화면을 다시 띄운다 */
function ReloadButton() {
  return (
    <button type="button" onClick={() => void forceUpdate("manual")}>
      {m.reload()}
    </button>
  );
}

/** 서버가 연결을 거절했을 때 — 상태 화면 밖(로그인·관리자 화면)에서 쓴다 */
export function RejectedNotice({ status }: { status: ConnectionStatus }) {
  if (status.kind !== "rejected") return null;
  return (
    <div className="form-actions">
      <p className="status" role="status">
        {statusText(status)}
      </p>
      <ReloadButton />
    </div>
  );
}

export function StatusPanel({ status, monitor }: { status: ConnectionStatus; monitor: FrameMonitor }) {
  // 1초마다 바뀌는 성능 값은 이 화면만 다시 그리게 여기서 읽는다
  const perf = usePerfStats(monitor);
  return (
    <>
      <h1>{m.app_title()}</h1>
      <p className="status" role="status">
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
    </>
  );
}
