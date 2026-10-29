// 연결 줄과 서버 거절 안내(ADR 2026-10-29-app-shell 3절). 전에는 StatusPanel.tsx의 statusText·RejectedNotice였다.
// - 연결 줄: 서버 연결이 2초 넘게 끊기면(처음 연결 중 포함) 한 줄로 알린다. 틀이 보이는 화면은 위 띠 아래,
//   틀을 숨긴 화면(지도·행성 편집기)은 화면 맨 위(안전 영역 아래)의 전역 층(floating).
// - 서버 거절 안내: 모든 화면에 남긴다(로그인 화면 포함). [새로고침]은 강제 적용(새 버전, 없으면 새로고침)이다.
// 알림 영역(role=status)은 늘 두고 문구만 바꾼다(읽기 프로그램은 처음부터 있던 영역의 변화만 잘 읽는다).
import type { ConnectionStatus } from "../net/connection.ts";
import { useConnectionStatus } from "../net/connectionStatus.ts";
import { m } from "../paraglide/messages.js";
import { forceUpdate } from "../pwa/updates.ts";
import { StatusIcon } from "../ui/StatusIcon.tsx";

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
export function ReloadButton() {
  return (
    <button type="button" className="button-small" onClick={() => void forceUpdate("manual")}>
      {m.reload()}
    </button>
  );
}

interface ConnectionNoticeProps {
  /** 틀을 숨긴 화면: 화면 맨 위 전역 층에 띄운다 */
  floating: boolean;
  /** 연결 줄(2초 넘게 끊김)도 보인다. 로그인 화면은 거절 안내만 보인다(로그인은 HTTP라 연결 줄은 소음이다) */
  showLost: boolean;
}

export function ConnectionNotice({ floating, showLost }: ConnectionNoticeProps) {
  const { status, lost } = useConnectionStatus();
  const rejected = status.kind === "rejected";
  const shown = rejected || (showLost && lost);
  return (
    <div
      className={floating ? "connection-notice connection-notice-floating" : "connection-notice"}
      role="status"
    >
      {shown ? (
        <div className="connection-line" data-tone={rejected ? "error" : "warning"}>
          <StatusIcon tone={rejected ? "error" : "info"} />
          <span className="connection-line-text">{statusText(status)}</span>
          {rejected ? <ReloadButton /> : null}
        </div>
      ) : null}
    </div>
  );
}
